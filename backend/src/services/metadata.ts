/**
 * SchroDrive Media Manager — Metadata Enrichment Service
 *
 * Enriches media items with metadata from Plex and TMDB.
 * Strategy: Plex-first, TMDB-fallback.
 *
 * Also provides bulk Plex library sync to import the user's
 * entire Plex library into SchroDrive for visibility.
 *
 * @module services/metadata
 */

import { db } from '@/db/connection';
import { createLogger } from '@/utils/logger';
import { plexClient } from '@/services/integrations/plex-client';
import { tmdbClient } from '@/services/integrations/tmdb-client';
import type { PlexSearchResult } from '@/services/integrations/plex-client';

const log = createLogger('metadata');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result summary returned by enrichMetadata(). */
export interface EnrichResult {
  enriched: number;
  plexMatches: number;
  tmdbMatches: number;
  skipped: number;
  errors: number;
}

/** Internal row shape for media items needing enrichment. */
interface MediaItemRow {
  id: string;
  title: string;
  type: string;
  year: number | null;
  poster_url: string | null;
  tmdb_id: string | null;
}

/** Internal row shape for plex_matches lookups. */
interface PlexMatchRow {
  id: string;
  plex_rating_key: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Delay between API calls to avoid rate-limiting (milliseconds). */
const API_THROTTLE_MS = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sleeps for the specified number of milliseconds.
 * Used to throttle external API calls.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Constructs a full Plex poster URL from a thumb path.
 *
 * @param thumb - The Plex thumb path (e.g. '/library/metadata/12345/thumb/1234567')
 * @returns Full poster URL with authentication token
 */
function buildPlexPosterUrl(thumb: string): string {
  const plexUrl = (process.env.PLEX_URL ?? 'http://localhost:32400').replace(/\/$/, '');
  const plexToken = process.env.PLEX_TOKEN ?? '';
  return `${plexUrl}${thumb}?X-Plex-Token=${plexToken}`;
}

/**
 * Finds the best Plex search result for a given title and year.
 * Prefers exact title + year matches, falls back to closest title match.
 *
 * @param results - Plex search results
 * @param title - The title to match against
 * @param year - Optional year for more precise matching
 * @returns The best matching result, or null if none found
 */
function findBestPlexMatch(
  results: PlexSearchResult[],
  title: string,
  year: number | null,
): PlexSearchResult | null {
  if (results.length === 0) return null;

  const normalisedTitle = title.toLowerCase().trim();

  // First pass: exact title + year match
  if (year !== null) {
    const exactMatch = results.find(
      (r) => r.title.toLowerCase().trim() === normalisedTitle && r.year === year,
    );
    if (exactMatch) return exactMatch;
  }

  // Second pass: exact title match (any year)
  const titleMatch = results.find(
    (r) => r.title.toLowerCase().trim() === normalisedTitle,
  );
  if (titleMatch) return titleMatch;

  // Third pass: title contains match with year
  if (year !== null) {
    const containsWithYear = results.find(
      (r) =>
        r.title.toLowerCase().includes(normalisedTitle) && r.year === year,
    );
    if (containsWithYear) return containsWithYear;
  }

  // Fallback: first result (Plex returns results by relevance)
  return results[0] ?? null;
}

// ---------------------------------------------------------------------------
// Core Enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich media items with metadata from Plex and TMDB.
 *
 * If mediaItemIds are provided, only those items are enriched.
 * Otherwise, all items missing a poster_url are enriched.
 *
 * Strategy:
 * 1. Search Plex for the title → if match found, use Plex's poster
 * 2. If no Plex match, search TMDB → use TMDB poster and tmdb_id
 * 3. Insert plex_matches record if Plex matched
 * 4. Update media_item with poster_url, tmdb_id, etc.
 *
 * This typically runs in the background after reconciliation.
 *
 * @param mediaItemIds - Optional array of specific media_item IDs to enrich
 * @returns Enrichment result summary
 */
export async function enrichMetadata(mediaItemIds?: string[]): Promise<EnrichResult> {
  const result: EnrichResult = {
    enriched: 0,
    plexMatches: 0,
    tmdbMatches: 0,
    skipped: 0,
    errors: 0,
  };

  // Fetch items to enrich
  let items: MediaItemRow[];

  if (mediaItemIds && mediaItemIds.length > 0) {
    // Enrich specific items
    const placeholders = mediaItemIds.map(() => '?').join(', ');
    items = db.prepare(`
      SELECT id, title, type, year, poster_url, tmdb_id
      FROM media_items
      WHERE id IN (${placeholders})
    `).all(...mediaItemIds) as MediaItemRow[];
  } else {
    // Enrich all items missing a poster
    items = db.prepare(`
      SELECT id, title, type, year, poster_url, tmdb_id
      FROM media_items
      WHERE poster_url IS NULL
      ORDER BY created_at DESC
      LIMIT 100
    `).all() as MediaItemRow[];
  }

  if (items.length === 0) {
    log.info('No media items require enrichment');
    return result;
  }

  log.info(`Starting metadata enrichment for ${items.length} items`);

  for (const item of items) {
    try {
      let enriched = false;

      // ----- Step 1: Try Plex -----
      try {
        const plexResults = await plexClient.search(item.title);
        const bestMatch = findBestPlexMatch(plexResults, item.title, item.year);

        if (bestMatch) {
          // Build poster URL from Plex thumb
          const posterUrl = bestMatch.thumb
            ? buildPlexPosterUrl(bestMatch.thumb)
            : null;

          // Update media_item with Plex data
          const now = new Date().toISOString();
          db.prepare(`
            UPDATE media_items
            SET poster_url = COALESCE(?, poster_url),
                updated_at = ?
            WHERE id = ?
          `).run(posterUrl, now, item.id);

          // Check if plex_match already exists
          const existingPlexMatch = db.prepare(`
            SELECT id FROM plex_matches
            WHERE media_item_id = ? AND plex_rating_key = ?
          `).get(item.id, bestMatch.ratingKey) as PlexMatchRow | null;

          if (!existingPlexMatch) {
            // Insert plex_matches record
            // We use section_id = 0 as a placeholder since search doesn't return it
            const matchId = crypto.randomUUID();
            db.prepare(`
              INSERT INTO plex_matches (
                id, media_item_id, plex_rating_key,
                plex_section_id, plex_title, matched_at
              )
              VALUES (?, ?, ?, 0, ?, ?)
            `).run(matchId, item.id, bestMatch.ratingKey, bestMatch.title, now);
          }

          result.plexMatches++;
          enriched = true;

          log.debug('Matched via Plex', {
            mediaItemId: item.id,
            plexTitle: bestMatch.title,
            ratingKey: bestMatch.ratingKey,
          });
        }
      } catch (plexErr) {
        log.warn('Plex search failed, falling back to TMDB', {
          title: item.title,
          error: plexErr instanceof Error ? plexErr.message : String(plexErr),
        });
      }

      // ----- Step 2: TMDB fallback (if Plex didn't match) -----
      if (!enriched) {
        try {
          let posterUrl: string | null = null;
          let tmdbId: string | null = null;

          if (item.type === 'movie') {
            const tmdbResults = await tmdbClient.searchMovie(
              item.title,
              item.year ?? undefined,
            );

            const best = tmdbResults[0];
            if (best) {
              posterUrl = tmdbClient.getPosterUrl(best.posterPath, 'w500');
              tmdbId = String(best.id);
            }
          } else if (item.type === 'series') {
            const tmdbResults = await tmdbClient.searchTv(
              item.title,
              item.year ?? undefined,
            );

            const best = tmdbResults[0];
            if (best) {
              posterUrl = tmdbClient.getPosterUrl(best.posterPath, 'w500');
              tmdbId = String(best.id);
            }
          }

          if (posterUrl || tmdbId) {
            const now = new Date().toISOString();
            db.prepare(`
              UPDATE media_items
              SET poster_url = COALESCE(?, poster_url),
                  tmdb_id = COALESCE(?, tmdb_id),
                  updated_at = ?
              WHERE id = ?
            `).run(posterUrl, tmdbId, now, item.id);

            result.tmdbMatches++;
            enriched = true;

            log.debug('Matched via TMDB', {
              mediaItemId: item.id,
              tmdbId,
              hasPoster: !!posterUrl,
            });
          }
        } catch (tmdbErr) {
          log.warn('TMDB search failed', {
            title: item.title,
            error: tmdbErr instanceof Error ? tmdbErr.message : String(tmdbErr),
          });
        }
      }

      if (enriched) {
        result.enriched++;
      } else {
        result.skipped++;
        log.debug('No metadata match found', {
          mediaItemId: item.id,
          title: item.title,
        });
      }

      // Throttle between API calls to be a good citizen
      await sleep(API_THROTTLE_MS);

      // Yield to event loop every 10 items so HTTP handlers aren't starved
      if ((result.enriched + result.skipped + result.errors) % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } catch (err) {
      result.errors++;
      log.error('Enrichment failed for item', {
        mediaItemId: item.id,
        title: item.title,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info('Metadata enrichment complete', {
    enriched: result.enriched,
    plexMatches: result.plexMatches,
    tmdbMatches: result.tmdbMatches,
    skipped: result.skipped,
    errors: result.errors,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Plex Library Sync
// ---------------------------------------------------------------------------

/**
 * Bulk import all items from Plex library sections.
 *
 * Gets all sections → for each section, fetches all items → creates
 * media_items + plex_matches for items that don't already exist
 * in the database.
 *
 * This lets users see their entire Plex library in SchroDrive,
 * even if the files haven't been discovered by a scanner yet.
 *
 * @returns Summary of imported, matched, and errored items
 */
export async function syncPlexLibrary(): Promise<{
  imported: number;
  matched: number;
  errors: number;
}> {
  const result = { imported: 0, matched: 0, errors: 0 };

  log.info('Starting Plex library sync');

  try {
    // Fetch all library sections
    const sections = await plexClient.getSections();

    if (sections.length === 0) {
      log.warn('No Plex library sections found');
      return result;
    }

    log.info(`Found ${sections.length} Plex library sections`);

    for (const section of sections) {
      try {
        // Determine media type from Plex section type
        const mediaType: string =
          section.type === 'movie' ? 'movie' :
          section.type === 'show' ? 'series' :
          'other';

        // Skip non-video sections (e.g. music, photos)
        if (mediaType === 'other') {
          log.debug(`Skipping non-video section: ${section.title} (${section.type})`);
          continue;
        }

        // Fetch all items in this section
        // NOTE: getSectionItems is expected to be added to PlexClient separately
        const items = await plexClient.getSectionItems(section.key);

        log.info(`Processing ${items.length} items from section "${section.title}"`);

        for (const plexItem of items) {
          try {
            // Check if we already have a plex_match for this rating key
            const existingMatch = db.prepare(`
              SELECT pm.id, pm.media_item_id
              FROM plex_matches pm
              WHERE pm.plex_rating_key = ?
            `).get(plexItem.ratingKey) as { id: string; media_item_id: string } | null;

            if (existingMatch) {
              result.matched++;
              continue;
            }

            // Check if a media_item exists with the same title + year
            const normTitle = plexItem.title.toLowerCase().trim();
            interface CandidateRow {
              id: string;
              title: string;
              year: number | null;
            }

            const candidates = db.prepare(`
              SELECT id, title, year FROM media_items
              WHERE type = ?
            `).all(mediaType) as CandidateRow[];

            let mediaItemId: string | null = null;

            for (const candidate of candidates) {
              if (
                candidate.title.toLowerCase().trim() === normTitle &&
                (candidate.year === (plexItem.year ?? null) || !plexItem.year)
              ) {
                mediaItemId = candidate.id;
                break;
              }
            }

            // Create a new media_item if none matched
            if (!mediaItemId) {
              mediaItemId = crypto.randomUUID();
              const now = new Date().toISOString();
              const posterUrl = plexItem.thumb
                ? buildPlexPosterUrl(plexItem.thumb)
                : null;

              db.prepare(`
                INSERT INTO media_items (id, title, type, year, poster_url, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(
                mediaItemId,
                plexItem.title,
                mediaType,
                plexItem.year ?? null,
                posterUrl,
                now,
                now,
              );

              result.imported++;
            } else {
              result.matched++;

              // Update poster if missing
              const posterUrl = plexItem.thumb
                ? buildPlexPosterUrl(plexItem.thumb)
                : null;

              if (posterUrl) {
                db.prepare(`
                  UPDATE media_items
                  SET poster_url = COALESCE(poster_url, ?),
                      updated_at = ?
                  WHERE id = ?
                `).run(posterUrl, new Date().toISOString(), mediaItemId);
              }
            }

            // Insert plex_matches record
            const matchId = crypto.randomUUID();
            const now = new Date().toISOString();
            db.prepare(`
              INSERT INTO plex_matches (
                id, media_item_id, plex_rating_key,
                plex_section_id, plex_title, matched_at
              )
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(
              matchId,
              mediaItemId,
              plexItem.ratingKey,
              parseInt(section.key, 10) || 0,
              plexItem.title,
              now,
            );
          } catch (itemErr) {
            result.errors++;
            log.error('Failed to sync Plex item', {
              title: plexItem.title,
              ratingKey: plexItem.ratingKey,
              error: itemErr instanceof Error ? itemErr.message : String(itemErr),
            });
          }
        }
      } catch (sectionErr) {
        result.errors++;
        log.error('Failed to sync Plex section', {
          section: section.title,
          error: sectionErr instanceof Error ? sectionErr.message : String(sectionErr),
        });
      }
    }
  } catch (err) {
    result.errors++;
    log.error('Plex library sync failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  log.info('Plex library sync complete', {
    imported: result.imported,
    matched: result.matched,
    errors: result.errors,
  });

  return result;
}

/**
 * SchroDrive Media Manager — Reconciler Service
 *
 * The scanner → DB bridge. Takes discovered files from scanners
 * and upserts them into the database as media_items + media_sources.
 *
 * Handles filename parsing (movies, series, episodes), fuzzy title
 * matching, and de-duplication via the unique index on
 * (source_type, file_path).
 *
 * IMPORTANT: Cloud sources (realdebrid, torbox) always set
 * do_not_process = 1 — we never auto-process cloud content.
 *
 * @module services/reconciler
 */

import { db } from '@/db/connection';
import { createLogger } from '@/utils/logger';
import { eventBus } from '@/services/events';
import type { SourceType, MediaType } from '@/types';

const log = createLogger('reconciler');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed metadata extracted from a media filename. */
export interface ParsedMedia {
  title: string;
  year: number | null;
  mediaType: MediaType;
  season?: number;
  episode?: number;
  resolution?: string;
}

/** Result summary returned by reconcileFiles(). */
export interface ReconcileResult {
  newItems: number;
  updatedItems: number;
  newSourceIds: string[];
  errors: string[];
}

/**
 * Common shape for discovered files from any scanner.
 * All three scanner types (local, RD, TorBox) share this structure.
 */
export interface GenericDiscoveredFile {
  filePath: string;
  fileName: string;
  fileSize: number;
  modifiedAt: Date;
  sourceType: SourceType;
}

// ---------------------------------------------------------------------------
// Resolution Mapping
// ---------------------------------------------------------------------------

/** Maps common resolution tokens to normalised labels. */
const RESOLUTION_MAP: Record<string, string> = {
  '2160p': '4K',
  '4k': '4K',
  'uhd': '4K',
  '1080p': '1080p',
  '1080i': '1080p',
  '720p': '720p',
  '576p': '576p',
  '480p': '480p',
  'sd': '480p',
};

// ---------------------------------------------------------------------------
// Filename Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a media filename into title, year, and resolution.
 *
 * Handles multiple naming conventions:
 * - Movie: `Title.Year.Quality.Codec.mkv`
 * - Movie with brackets: `Title (Year) [Quality].mkv`
 * - Movie with dashes: `Title - Year [Quality].mkv`
 * - TV: `Show.Name.S01E05.Quality.mkv`
 * - TV with dashes: `Show Name - S01E05 - Episode Title.mkv`
 *
 * @example
 * parseMediaFilename('Interstellar.2014.2160p.mkv')
 * // → { title: 'Interstellar', year: 2014, mediaType: 'movie', resolution: '4K' }
 *
 * @example
 * parseMediaFilename('The.Dark.Knight.2008.1080p.BluRay.x265.mkv')
 * // → { title: 'The Dark Knight', year: 2008, mediaType: 'movie', resolution: '1080p' }
 *
 * @example
 * parseMediaFilename('Breaking.Bad.S01E01.720p.mkv')
 * // → { title: 'Breaking Bad', year: null, mediaType: 'episode', season: 1, episode: 1, resolution: '720p' }
 *
 * @param fileName - The media file name (with or without extension)
 */
export function parseMediaFilename(fileName: string, filePath?: string): ParsedMedia {
  // Strip file extension
  const baseName = fileName.replace(/\.[^.]+$/, '');

  // Attempt TV series pattern first: S01E05 or S01E05E06
  const tvPattern = /^(.+?)[.\s_-]+[Ss](\d{1,2})[Ee](\d{1,3})(?:[Ee]\d{1,3})?/;
  const tvMatch = baseName.match(tvPattern);

  if (tvMatch) {
    let rawTitle = tvMatch[1]!;
    const season = parseInt(tvMatch[2]!, 10);
    const episode = parseInt(tvMatch[3]!, 10);
    const resolution = extractResolution(baseName);

    // If the "title" from filename looks like garbage (e.g. just "S02E10"),
    // try to extract the show name from the parent directory path
    const cleanedTitle = cleanTitle(rawTitle);
    if (filePath && (!cleanedTitle || cleanedTitle.length < 3 || /^s\d/i.test(cleanedTitle))) {
      const pathParts = filePath.split('/');
      // Walk backwards through path segments to find a meaningful show name
      // Skip the filename itself and look for something that isn't a season folder
      for (let i = pathParts.length - 2; i >= 0; i--) {
        const segment = pathParts[i]!;
        if (segment && !/^season\s*\d+$/i.test(segment) && !/^s\d{1,2}$/i.test(segment) && segment.length > 2) {
          rawTitle = segment;
          break;
        }
      }
    }

    return {
      title: cleanTitle(rawTitle),
      year: null,
      mediaType: 'episode',
      season,
      episode,
      resolution,
    };
  }

  // Try parenthetical year: "Movie (2024)" or "Movie (2024) [1080p]"
  const parenYearPattern = /^(.+?)\s*\((\d{4})\)/;
  const parenYearMatch = baseName.match(parenYearPattern);

  if (parenYearMatch) {
    const rawTitle = parenYearMatch[1]!;
    const year = parseInt(parenYearMatch[2]!, 10);
    const resolution = extractResolution(baseName);

    return {
      title: cleanTitle(rawTitle),
      year: isReasonableYear(year) ? year : null,
      mediaType: 'movie',
      resolution,
    };
  }

  // Try standard year in filename: "Title.2024.1080p" or "Title - 2024 [1080p]"
  const yearPattern = /^(.+?)[.\s_-]+(\d{4})[.\s_\-\[]/;
  const yearMatch = baseName.match(yearPattern);

  if (yearMatch) {
    const rawTitle = yearMatch[1]!;
    const year = parseInt(yearMatch[2]!, 10);
    const resolution = extractResolution(baseName);

    return {
      title: cleanTitle(rawTitle),
      year: isReasonableYear(year) ? year : null,
      mediaType: 'movie',
      resolution,
    };
  }

  // Fallback: year at end of string "Title.2024"
  const yearEndPattern = /^(.+?)[.\s_-]+(\d{4})$/;
  const yearEndMatch = baseName.match(yearEndPattern);

  if (yearEndMatch) {
    const rawTitle = yearEndMatch[1]!;
    const year = parseInt(yearEndMatch[2]!, 10);
    const resolution = extractResolution(baseName);

    return {
      title: cleanTitle(rawTitle),
      year: isReasonableYear(year) ? year : null,
      mediaType: 'movie',
      resolution,
    };
  }

  // Last resort: treat the whole base name as the title
  const resolution = extractResolution(baseName);
  return {
    title: cleanTitle(baseName),
    year: null,
    mediaType: 'other',
    resolution,
  };
}

/**
 * Cleans a raw title by replacing dots, underscores, and excess
 * whitespace with single spaces, then trimming.
 */
function cleanTitle(raw: string): string {
  return raw
    .replace(/[._]/g, ' ')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts the resolution from a filename string, normalised
 * to a standard label (e.g. '4K', '1080p').
 */
function extractResolution(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [token, label] of Object.entries(RESOLUTION_MAP)) {
    if (lower.includes(token)) {
      return label;
    }
  }
  return undefined;
}

/**
 * Checks whether a number looks like a plausible release year.
 */
function isReasonableYear(year: number): boolean {
  return year >= 1888 && year <= new Date().getFullYear() + 2;
}

/**
 * Normalises a title for fuzzy comparison: lowercase, strip
 * articles (the, a, an), collapse whitespace.
 */
function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * In-memory cache for media item lookups during reconciliation.
 * Key: `${normalisedTitle}::${type}::${year ?? ''}` → media_item ID.
 *
 * This eliminates the critical memory leak where findOrCreateMediaItem
 * queried ALL media_items (thousands of rows) for EVERY file (39,877
 * times), creating hundreds of millions of JS objects that V8's GC
 * couldn't collect fast enough → 48GB memory usage.
 *
 * Now: one DB query populates the Map, then all lookups are O(1).
 */
type MediaItemCache = Map<string, string>;

/**
 * Build a cache key for media item lookups.
 * Format: `normalisedTitle::type::year`
 */
function cacheKey(normTitle: string, mediaType: string, year: number | null): string {
  const type = mediaType === 'episode' ? 'series' : mediaType;
  return `${normTitle}::${type}::${year ?? ''}`;
}

/**
 * Build the initial media item cache from the database.
 * One query, one scan — no per-file queries needed.
 */
function buildMediaItemCache(): MediaItemCache {
  interface CacheRow {
    id: string;
    title: string;
    type: string;
    year: number | null;
  }

  const rows = db.prepare(`
    SELECT id, title, type, year FROM media_items
  `).all() as CacheRow[];

  const cache: MediaItemCache = new Map();

  for (const row of rows) {
    const normTitle = normaliseTitle(row.title);
    // Cache with year
    cache.set(cacheKey(normTitle, row.type, row.year), row.id);
    // Also cache without year for fuzzy matching
    const noYearKey = cacheKey(normTitle, row.type, null);
    if (!cache.has(noYearKey)) {
      cache.set(noYearKey, row.id);
    }
  }

  log.info(`Media item cache built: ${cache.size} entries from ${rows.length} items`);
  return cache;
}

/**
 * Find an existing media_item by normalised title + type + year,
 * using the in-memory cache. If not found, creates a new one
 * and updates the cache.
 *
 * @param parsed - Parsed media metadata from filename
 * @param cache - In-memory media item lookup cache
 * @param now - Pre-computed ISO timestamp
 * @returns The media_item ID (existing or newly created)
 */
function findOrCreateMediaItemCached(parsed: ParsedMedia, cache: MediaItemCache, now: string): string {
  const normTitle = normaliseTitle(parsed.title);
  const type = parsed.mediaType === 'episode' ? 'series' : parsed.mediaType;

  // Try exact match (title + type + year)
  if (parsed.year !== null) {
    const exactKey = cacheKey(normTitle, type, parsed.year);
    const existing = cache.get(exactKey);
    if (existing) return existing;
  }

  // Try without year (fuzzy)
  const fuzzyKey = cacheKey(normTitle, type, null);
  const fuzzyMatch = cache.get(fuzzyKey);
  if (fuzzyMatch) return fuzzyMatch;

  // No match — create new media_item (using pre-compiled statement)
  const id = crypto.randomUUID();
  getStmtInsertMediaItem().run(id, parsed.title, type, parsed.year, now, now);

  // Update cache
  cache.set(cacheKey(normTitle, type, parsed.year), id);
  cache.set(cacheKey(normTitle, type, null), id);

  return id;
}

// ---------------------------------------------------------------------------
// Pre-compiled Prepared Statements
// ---------------------------------------------------------------------------
// These are compiled lazily on first use (not at import time) because
// the schema migration may not have run yet when this module loads.
// Once compiled, they're cached for the lifetime of the process.
// ---------------------------------------------------------------------------

import type { Statement } from 'bun:sqlite';

let _stmtFindSource: Statement | null = null;
let _stmtUpdateSourceSize: Statement | null = null;
let _stmtInsertSource: Statement | null = null;
let _stmtInsertMediaItem: Statement | null = null;

function getStmtFindSource(): Statement {
  return (_stmtFindSource ??= db.prepare(`
    SELECT id, file_size FROM media_sources
    WHERE source_type = ? AND file_path = ?
  `));
}

function getStmtUpdateSourceSize(): Statement {
  return (_stmtUpdateSourceSize ??= db.prepare(`
    UPDATE media_sources
    SET file_size = ?, updated_at = ?
    WHERE id = ?
  `));
}

function getStmtInsertSource(): Statement {
  return (_stmtInsertSource ??= db.prepare(`
    INSERT INTO media_sources (
      id, media_item_id, source_type, file_path, file_name,
      file_size, status, is_optimised, do_not_process,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'available', 0, ?, ?, ?)
  `));
}

function getStmtInsertMediaItem(): Statement {
  return (_stmtInsertMediaItem ??= db.prepare(`
    INSERT INTO media_items (id, title, type, year, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `));
}

// ---------------------------------------------------------------------------
// Database Operations — Media Source Upsert
// ---------------------------------------------------------------------------

/**
 * Upsert a media_source record. Uses pre-compiled prepared statements
 * to avoid allocating native Statement objects per call.
 *
 * @param mediaItemId - The parent media_item ID
 * @param file - The discovered file from a scanner
 * @param now - Pre-computed ISO timestamp (avoid per-file Date allocation)
 * @returns Whether the source is new and its ID
 */
function upsertMediaSource(
  mediaItemId: string,
  file: GenericDiscoveredFile,
  now: string,
): { isNew: boolean; sourceId: string } {
  interface ExistingSource {
    id: string;
    file_size: number;
  }

  const existing = getStmtFindSource().get(file.sourceType, file.filePath) as ExistingSource | null;

  if (existing) {
    if (existing.file_size !== file.fileSize) {
      getStmtUpdateSourceSize().run(file.fileSize, now, existing.id);
    }
    return { isNew: false, sourceId: existing.id };
  }

  // Insert new media_source
  const id = crypto.randomUUID();
  const isCloud = file.sourceType === 'realdebrid' || file.sourceType === 'torbox';

  getStmtInsertSource().run(
    id,
    mediaItemId,
    file.sourceType,
    file.filePath,
    file.fileName,
    file.fileSize,
    isCloud ? 1 : 0,
    now,
    now,
  );

  return { isNew: true, sourceId: id };
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Main reconciliation entry point. Takes discovered files from a scanner
 * run, reconciles them with the database, and returns a summary.
 *
 * Memory-optimised design:
 * - In-memory Map for media item lookups (avoids N+1 queries)
 * - Pre-compiled prepared statements (avoids 120K native allocations)
 * - Per-batch ISO timestamp (avoids 120K Date objects)
 * - Batch-level logging only (avoids 39K JSON.stringify + regex calls)
 * - Count new sources instead of accumulating UUID strings
 *
 * @param files - Array of discovered files from any scanner
 * @param sourceType - The source type being reconciled
 * @returns Reconciliation result summary
 */
export async function reconcileFiles(
  files: GenericDiscoveredFile[],
  sourceType: SourceType,
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    newItems: 0,
    updatedItems: 0,
    newSourceIds: [], // Only stores count now, not every UUID
    errors: [],
  };

  log.info(`Starting reconciliation for ${files.length} ${sourceType} files`);

  // Build in-memory cache ONCE — eliminates 39,877 × N row queries
  const cache = buildMediaItemCache();

  const BATCH_SIZE = 500;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(files.length / BATCH_SIZE);

    // One timestamp per batch — not per file
    const batchTimestamp = new Date().toISOString();
    let batchNew = 0;
    let batchUpdated = 0;

    db.exec('BEGIN TRANSACTION');
    try {
      for (const file of batch) {
        try {
          // Step 1: Parse the filename
          const parsed = parseMediaFilename(file.fileName, file.filePath);

          if (!parsed.title) {
            continue; // Skip silently — don't accumulate error strings
          }

          // Step 2: Find or create the media_item (cached — O(1) lookup)
          const mediaItemId = findOrCreateMediaItemCached(parsed, cache, batchTimestamp);

          // Step 3: Upsert the media_source (pre-compiled statements)
          const { isNew } = upsertMediaSource(mediaItemId, file, batchTimestamp);

          if (isNew) {
            batchNew++;
          } else {
            batchUpdated++;
          }
        } catch (err) {
          // Only log errors, don't accumulate error strings for 39K files
          if (result.errors.length < 50) {
            result.errors.push(`Failed: ${file.fileName}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
      log.error(`Batch ${batchNum} failed, rolled back`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    result.newItems += batchNew;
    result.updatedItems += batchUpdated;

    // Batch-level logging (not per-file)
    log.info(`Reconciliation batch ${batchNum}/${totalBatches}: ${batchNew} new, ${batchUpdated} updated (${Math.min(i + BATCH_SIZE, files.length)}/${files.length})`);

    // Yield to event loop between batches so HTTP requests can be served
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // Emit SSE event for the completed reconciliation
  if (result.newItems > 0) {
    eventBus.emitScanComplete(sourceType, result.newItems);
  }

  log.info('Reconciliation complete', {
    sourceType,
    newItems: result.newItems,
    updatedItems: result.updatedItems,
    errors: result.errors.length,
  });

  return result;
}


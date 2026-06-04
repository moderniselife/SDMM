/**
 * SchroDrive Media Manager — Watch Stats Sync Service
 *
 * Syncs Tautulli watch statistics into the database for all
 * Plex-matched media items. Supports single-item sync, bulk sync,
 * and periodic background sync.
 *
 * @module services/watch-sync
 */

import { db } from '@/db/connection';
import { createLogger } from '@/utils/logger';
import { tautulliClient } from '@/services/integrations/tautulli-client';

const log = createLogger('watch-sync');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Internal row shape for plex_matches with media info. */
interface PlexMatchWithMedia {
  media_item_id: string;
  plex_rating_key: string;
  plex_title: string;
}

/** Internal row shape for existing watch_stats records. */
interface ExistingWatchStats {
  id: string;
  total_plays: number;
  total_watch_time_seconds: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Handle for the periodic sync interval. */
let periodicTimer: ReturnType<typeof setInterval> | null = null;

/** Whether a sync is currently running (prevents overlap). */
let syncInProgress = false;

// ---------------------------------------------------------------------------
// Core Sync Logic
// ---------------------------------------------------------------------------

/**
 * Sync watch statistics from Tautulli for all Plex-matched media items.
 *
 * For each plex_match record in the database, calls
 * tautulliClient.getWatchStats(ratingKey), then upserts the results
 * into the watch_stats table.
 *
 * @returns Summary with synced count and error count
 */
export async function syncWatchStats(): Promise<{ synced: number; errors: number }> {
  if (syncInProgress) {
    log.warn('Watch stats sync already in progress — skipping');
    return { synced: 0, errors: 0 };
  }

  syncInProgress = true;
  const result = { synced: 0, errors: 0 };

  try {
    // Fetch all plex_matches
    const plexMatches = db.prepare(`
      SELECT DISTINCT pm.media_item_id, pm.plex_rating_key, pm.plex_title
      FROM plex_matches pm
      INNER JOIN media_items mi ON mi.id = pm.media_item_id
    `).all() as PlexMatchWithMedia[];

    if (plexMatches.length === 0) {
      log.info('No Plex matches found — nothing to sync');
      return result;
    }

    log.info(`Syncing watch stats for ${plexMatches.length} Plex-matched items`);

    // Process in batches to prevent memory accumulation from fetch() calls.
    // Each fetch() creates Response objects, ArrayBuffers, and parsed JSON.
    // Without batching + GC, 534 rapid calls grow memory by ~3-4GB.
    const BATCH_SIZE = 25;

    for (let i = 0; i < plexMatches.length; i += BATCH_SIZE) {
      const batch = plexMatches.slice(i, i + BATCH_SIZE);

      for (const match of batch) {
        try {
          await syncWatchStatsForRatingKey(
            match.media_item_id,
            match.plex_rating_key,
          );
          result.synced++;
        } catch (err) {
          result.errors++;
          // Only log first 10 errors to avoid log spam
          if (result.errors <= 10) {
            log.error('Failed to sync watch stats for item', {
              mediaItemId: match.media_item_id,
              ratingKey: match.plex_rating_key,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      // Force GC and yield between batches — critical for memory control
      Bun.gc(true);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Progress logging every 100 items
      if ((i + BATCH_SIZE) % 100 < BATCH_SIZE) {
        log.info(`Watch sync progress: ${Math.min(i + BATCH_SIZE, plexMatches.length)}/${plexMatches.length}`);
      }
    }

    log.info('Watch stats sync complete', {
      synced: result.synced,
      errors: result.errors,
    });
  } catch (err) {
    log.error('Watch stats sync failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    syncInProgress = false;
  }

  return result;
}

/**
 * Sync watch stats for a single media item by its ID.
 *
 * Looks up the Plex rating key from plex_matches, then fetches
 * and upserts watch statistics from Tautulli.
 *
 * @param mediaItemId - The media_item ID to sync stats for
 */
export async function syncWatchStatsForItem(mediaItemId: string): Promise<void> {
  // Find the plex_match for this media item
  const match = db.prepare(`
    SELECT plex_rating_key, plex_title
    FROM plex_matches
    WHERE media_item_id = ?
    LIMIT 1
  `).get(mediaItemId) as { plex_rating_key: string; plex_title: string } | null;

  if (!match) {
    log.debug('No Plex match found for media item — skipping watch sync', {
      mediaItemId,
    });
    return;
  }

  await syncWatchStatsForRatingKey(mediaItemId, match.plex_rating_key);

  log.debug('Watch stats synced for individual item', {
    mediaItemId,
    ratingKey: match.plex_rating_key,
    title: match.plex_title,
  });
}

/**
 * Internal helper: fetches watch stats from Tautulli for a specific
 * rating key and upserts into the watch_stats table.
 *
 * @param mediaItemId - The parent media_item ID
 * @param ratingKey - The Plex rating key
 */
// Lazy-initialised prepared statements for watch stats operations.
// Cannot prepare at module load time because the table may not exist yet
// (migrations run after module imports).
import type { Statement } from 'bun:sqlite';

let _stmtSelect: Statement | null = null;
let _stmtUpdate: Statement | null = null;
let _stmtInsert: Statement | null = null;

function getStmtSelect(): Statement {
  return (_stmtSelect ??= db.prepare(`
    SELECT id, total_plays, total_watch_time_seconds
    FROM watch_stats
    WHERE media_item_id = ? AND plex_rating_key = ?
  `));
}

function getStmtUpdate(): Statement {
  return (_stmtUpdate ??= db.prepare(`
    UPDATE watch_stats
    SET total_plays = ?,
        total_watch_time_seconds = ?,
        fetched_at = ?
    WHERE id = ?
  `));
}

function getStmtInsert(): Statement {
  return (_stmtInsert ??= db.prepare(`
    INSERT INTO watch_stats (
      id, media_item_id, plex_rating_key,
      total_plays, last_played_at,
      total_watch_time_seconds, unique_viewers,
      fetched_at
    )
    VALUES (?, ?, ?, ?, NULL, ?, 0, ?)
  `));
}

async function syncWatchStatsForRatingKey(
  mediaItemId: string,
  ratingKey: string,
): Promise<void> {
  // Fetch watch stats from Tautulli
  const stats = await tautulliClient.getWatchStats(ratingKey);

  if (!stats || stats.length === 0) {
    log.debug('No watch stats returned from Tautulli', { ratingKey });
    return;
  }

  // Aggregate stats across all query_days entries
  // Use the entry with the highest query_days as the "all-time" stat
  const allTimeStat = stats.reduce((best, current) =>
    current.queryDays > best.queryDays ? current : best,
  );

  const totalPlays = allTimeStat.totalPlays;
  const totalWatchTimeSeconds = allTimeStat.totalTime;

  // Check for existing watch_stats record
  const existing = getStmtSelect().get(mediaItemId, ratingKey) as ExistingWatchStats | null;

  const now = new Date().toISOString();

  if (existing) {
    // Update if values have changed
    if (
      existing.total_plays !== totalPlays ||
      existing.total_watch_time_seconds !== totalWatchTimeSeconds
    ) {
      getStmtUpdate().run(totalPlays, totalWatchTimeSeconds, now, existing.id);

      log.debug('Updated watch stats', {
        mediaItemId,
        ratingKey,
        totalPlays,
        totalWatchTimeSeconds,
      });
    }
  } else {
    // Insert new watch_stats record
    const id = crypto.randomUUID();

    getStmtInsert().run(id, mediaItemId, ratingKey, totalPlays, totalWatchTimeSeconds, now);

    log.debug('Inserted new watch stats', {
      mediaItemId,
      ratingKey,
      totalPlays,
      totalWatchTimeSeconds,
    });
  }
}

// ---------------------------------------------------------------------------
// Periodic Sync
// ---------------------------------------------------------------------------

/**
 * Starts periodic watch stats sync at the specified interval.
 *
 * Only one periodic sync can be active at a time. Calling this
 * again will stop the previous interval first.
 *
 * @param intervalMinutes - Number of minutes between syncs (default: 30)
 */
export function startPeriodicWatchSync(intervalMinutes: number = 30): void {
  // Stop any existing periodic sync
  stopPeriodicWatchSync();

  const intervalMs = intervalMinutes * 60 * 1000;

  log.info(`Starting periodic watch stats sync every ${intervalMinutes} minutes`);

  // Run an initial sync immediately
  syncWatchStats().catch((err) => {
    log.error('Initial periodic watch stats sync failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  // Schedule recurring syncs
  periodicTimer = setInterval(() => {
    syncWatchStats().catch((err) => {
      log.error('Periodic watch stats sync failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, intervalMs);
}

/**
 * Stops the periodic watch stats sync if one is running.
 */
export function stopPeriodicWatchSync(): void {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
    log.info('Periodic watch stats sync stopped');
  }
}

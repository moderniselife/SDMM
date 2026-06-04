/**
 * SchroDrive Media Manager — Media Routes
 *
 * CRUD endpoints for browsing and viewing media items
 * with filtering, pagination, and full detail views.
 *
 * @module routes/media
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/connection';
import { createLogger } from '../utils/logger';
import type {
  ApiResponse,
  PaginatedData,
  MediaItem,
  MediaItemDetail,
  MediaSource,
  FileProbe,
  EncodeJob,
  PlexMatch,
  WatchStats,
} from '../types';

const log = createLogger('media');

export const mediaRoutes = new Hono();

// =============================================================================
// Query Validation
// =============================================================================

const mediaQuerySchema = z.object({
  search: z.string().optional(),
  sourceType: z.enum(['local', 'realdebrid', 'torbox']).optional(),
  status: z.enum(['available', 'encoding', 'downloading', 'optimised', 'failed']).optional(),
  minSize: z.coerce.number().optional(),
  maxSize: z.coerce.number().optional(),
  codec: z.string().optional(),
  resolution: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

// =============================================================================
// GET /api/media — Paginated media list with filters
// =============================================================================

/**
 * GET /api/media
 *
 * Returns a paginated list of media items with their sources.
 * Supports filtering by search term, source type, status,
 * file size range, codec, and resolution.
 */
mediaRoutes.get('/media', (c) => {
  try {
    const rawQuery = c.req.query();
    const parsed = mediaQuerySchema.safeParse(rawQuery);

    if (!parsed.success) {
      const response: ApiResponse<never> = {
        success: false,
        error: `Invalid query parameters: ${parsed.error.message}`,
        timestamp: new Date().toISOString(),
      };
      return c.json(response, 400);
    }

    const { search, sourceType, status, minSize, maxSize, codec, resolution, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    // Build dynamic WHERE clauses
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (search) {
      conditions.push('mi.title LIKE ?');
      params.push(`%${search}%`);
    }

    if (sourceType) {
      if (sourceType === 'cloud') {
        // Virtual filter: matches both RealDebrid and TorBox sources
        conditions.push("ms.source_type IN ('realdebrid', 'torbox')");
      } else {
        conditions.push('ms.source_type = ?');
        params.push(sourceType);
      }
    }

    if (status) {
      conditions.push('ms.status = ?');
      params.push(status);
    }

    if (minSize !== undefined) {
      conditions.push('ms.file_size >= ?');
      params.push(minSize);
    }

    if (maxSize !== undefined) {
      conditions.push('ms.file_size <= ?');
      params.push(maxSize);
    }

    if (codec) {
      conditions.push('fp.codec_name = ?');
      params.push(codec);
    }

    if (resolution) {
      // Map resolution labels to width thresholds
      const resMap: Record<string, [number, number]> = {
        '4k': [3840, 99999],
        '1080p': [1920, 3839],
        '720p': [1280, 1919],
        '480p': [0, 1279],
      };
      const range = resMap[resolution];
      if (range) {
        conditions.push('fp.width >= ? AND fp.width <= ?');
        params.push(range[0], range[1]);
      }
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Need to join with file_probes only if codec/resolution filters used
    const needsProbeJoin = codec || resolution;
    const probeJoin = needsProbeJoin
      ? 'LEFT JOIN file_probes fp ON fp.media_source_id = ms.id'
      : '';

    // Count total matching items
    const countSql = `
      SELECT COUNT(DISTINCT mi.id) as total
      FROM media_items mi
      LEFT JOIN media_sources ms ON ms.media_item_id = mi.id
      ${probeJoin}
      ${whereClause}
    `;
    const countRow = db.query<{ total: number }, (string | number)[]>(countSql).get(...params);
    const total = countRow?.total ?? 0;

    // Fetch paginated items
    const itemsSql = `
      SELECT DISTINCT mi.id, mi.title, mi.type, mi.year,
             mi.imdb_id, mi.tmdb_id, mi.tvdb_id,
             mi.poster_url, mi.created_at, mi.updated_at
      FROM media_items mi
      LEFT JOIN media_sources ms ON ms.media_item_id = mi.id
      ${probeJoin}
      ${whereClause}
      ORDER BY mi.updated_at DESC
      LIMIT ? OFFSET ?
    `;

    const itemRows = db
      .query<Record<string, unknown>, (string | number)[]>(itemsSql)
      .all(...params, limit, offset);

    // Fetch all sources for the page of items in ONE query (fixes N+1)
    const itemIds = itemRows.map((r) => r['id'] as string);
    const sourcesMap = new Map<string, MediaSource[]>();

    if (itemIds.length > 0) {
      const placeholders = itemIds.map(() => '?').join(',');
      const allSources = db
        .query<Record<string, unknown>, string[]>(`
          SELECT id, media_item_id, source_type, file_path, file_name,
                 file_size, status, is_optimised, do_not_process,
                 created_at, updated_at
          FROM media_sources
          WHERE media_item_id IN (${placeholders})
        `)
        .all(...itemIds);

      for (const sr of allSources) {
        const mediaItemId = sr['media_item_id'] as string;
        const source: MediaSource = {
          id: sr['id'] as string,
          mediaItemId,
          sourceType: sr['source_type'] as MediaSource['sourceType'],
          filePath: sr['file_path'] as string,
          fileName: sr['file_name'] as string,
          fileSize: sr['file_size'] as number,
          status: sr['status'] as MediaSource['status'],
          isOptimised: (sr['is_optimised'] as number) === 1,
          doNotProcess: (sr['do_not_process'] as number) === 1,
          createdAt: sr['created_at'] as string,
          updatedAt: sr['updated_at'] as string,
        };
        const existing = sourcesMap.get(mediaItemId) ?? [];
        existing.push(source);
        sourcesMap.set(mediaItemId, existing);
      }
    }

    // Map rows to MediaItem interface
    const items: (MediaItem & { sources: MediaSource[] })[] = itemRows.map((row) => {
      const itemId = row['id'] as string;
      return {
        id: itemId,
        title: row['title'] as string,
        type: row['type'] as MediaItem['type'],
        year: row['year'] as number | null,
        imdbId: row['imdb_id'] as string | null,
        tmdbId: row['tmdb_id'] as string | null,
        tvdbId: row['tvdb_id'] as string | null,
        posterUrl: row['poster_url'] as string | null,
        createdAt: row['created_at'] as string,
        updatedAt: row['updated_at'] as string,
        sources: sourcesMap.get(itemId) ?? [],
      };
    });

    const data: PaginatedData<(MediaItem & { sources: MediaSource[] })> = {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    const response: ApiResponse<typeof data> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    return c.json(response);
  } catch (err) {
    log.error('Failed to query media items', {
      error: err instanceof Error ? err.message : String(err),
    });

    const response: ApiResponse<never> = {
      success: false,
      error: 'Failed to query media items',
      timestamp: new Date().toISOString(),
    };

    return c.json(response, 500);
  }
});

// =============================================================================
// GET /api/media/unmatched — Media items without a Plex match
// =============================================================================

/**
 * GET /api/media/unmatched
 *
 * Returns all media items that do not have a corresponding plex_matches
 * record. Used by the Unmatched Media page for manual matching.
 *
 * NOTE: This route MUST be declared before /media/:id to prevent
 * Hono from matching "unmatched" as an ID parameter.
 */
mediaRoutes.get('/media/unmatched', (c) => {
  try {
    const rows = db
      .query<Record<string, unknown>, []>(`
        SELECT mi.id, mi.title, mi.type, mi.year,
               mi.imdb_id, mi.tmdb_id, mi.tvdb_id,
               mi.poster_url, mi.created_at, mi.updated_at
        FROM media_items mi
        LEFT JOIN plex_matches pm ON pm.media_item_id = mi.id
        WHERE pm.id IS NULL
        ORDER BY mi.created_at DESC
        LIMIT 500
      `)
      .all();

    // Batch-fetch sources (fixes N+1)
    const itemIds = rows.map((r) => r['id'] as string);
    const sourcesMap = new Map<string, MediaSource[]>();

    if (itemIds.length > 0) {
      const placeholders = itemIds.map(() => '?').join(',');
      const allSources = db
        .query<Record<string, unknown>, string[]>(`
          SELECT id, media_item_id, source_type, file_path, file_name,
                 file_size, status, is_optimised, do_not_process,
                 created_at, updated_at
          FROM media_sources
          WHERE media_item_id IN (${placeholders})
        `)
        .all(...itemIds);

      for (const sr of allSources) {
        const mediaItemId = sr['media_item_id'] as string;
        const source: MediaSource = {
          id: sr['id'] as string,
          mediaItemId,
          sourceType: sr['source_type'] as MediaSource['sourceType'],
          filePath: sr['file_path'] as string,
          fileName: sr['file_name'] as string,
          fileSize: sr['file_size'] as number,
          status: sr['status'] as MediaSource['status'],
          isOptimised: (sr['is_optimised'] as number) === 1,
          doNotProcess: (sr['do_not_process'] as number) === 1,
          createdAt: sr['created_at'] as string,
          updatedAt: sr['updated_at'] as string,
        };
        const existing = sourcesMap.get(mediaItemId) ?? [];
        existing.push(source);
        sourcesMap.set(mediaItemId, existing);
      }
    }

    const items = rows.map((row) => {
      const itemId = row['id'] as string;
      return {
        id: itemId,
        title: row['title'] as string,
        type: row['type'] as MediaItem['type'],
        year: row['year'] as number | null,
        imdbId: row['imdb_id'] as string | null,
        tmdbId: row['tmdb_id'] as string | null,
        tvdbId: row['tvdb_id'] as string | null,
        posterUrl: row['poster_url'] as string | null,
        createdAt: row['created_at'] as string,
        updatedAt: row['updated_at'] as string,
        sources: sourcesMap.get(itemId) ?? [],
      };
    });

    const response: ApiResponse<typeof items> = {
      success: true,
      data: items,
      timestamp: new Date().toISOString(),
    };

    return c.json(response);
  } catch (err) {
    log.error('Failed to fetch unmatched media', {
      error: err instanceof Error ? err.message : String(err),
    });

    const response: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch unmatched media',
      timestamp: new Date().toISOString(),
    };

    return c.json(response, 500);
  }
});

// =============================================================================
// GET /api/media/:id — Full media item detail
// =============================================================================

/**
 * GET /api/media/:id
 *
 * Returns a full media item with all sources, probe data,
 * encode history, Plex match, and watch statistics.
 */
mediaRoutes.get('/media/:id', (c) => {
  try {
    const id = c.req.param('id');

    // Fetch the media item
    const itemRow = db
      .query<Record<string, unknown>, [string]>(`
        SELECT id, title, type, year, imdb_id, tmdb_id, tvdb_id,
               poster_url, created_at, updated_at
        FROM media_items
        WHERE id = ?
      `)
      .get(id);

    if (!itemRow) {
      const response: ApiResponse<never> = {
        success: false,
        error: `Media item not found: ${id}`,
        timestamp: new Date().toISOString(),
      };
      return c.json(response, 404);
    }

    // Fetch sources
    const sourceRows = db
      .query<Record<string, unknown>, [string]>(`
        SELECT id, media_item_id, source_type, file_path, file_name,
               file_size, status, is_optimised, do_not_process,
               created_at, updated_at
        FROM media_sources
        WHERE media_item_id = ?
      `)
      .all(id);

    const sources: MediaSource[] = sourceRows.map((sr) => ({
      id: sr['id'] as string,
      mediaItemId: sr['media_item_id'] as string,
      sourceType: sr['source_type'] as MediaSource['sourceType'],
      filePath: sr['file_path'] as string,
      fileName: sr['file_name'] as string,
      fileSize: sr['file_size'] as number,
      status: sr['status'] as MediaSource['status'],
      isOptimised: (sr['is_optimised'] as number) === 1,
      doNotProcess: (sr['do_not_process'] as number) === 1,
      createdAt: sr['created_at'] as string,
      updatedAt: sr['updated_at'] as string,
    }));

    // Fetch probes for all sources
    const sourceIds = sources.map((s) => s.id);
    const probes: FileProbe[] = [];
    for (const sourceId of sourceIds) {
      const probeRows = db
        .query<Record<string, unknown>, [string]>(`
          SELECT id, media_source_id, codec_name, codec_profile,
                 width, height, duration_seconds, bitrate_bps, framerate,
                 pixel_format, colour_space, colour_transfer, colour_primaries,
                 is_hdr, is_10bit, audio_tracks, subtitle_tracks,
                 chapters_count, raw_json, probed_at
          FROM file_probes
          WHERE media_source_id = ?
        `)
        .all(sourceId);

      for (const pr of probeRows) {
        probes.push({
          id: pr['id'] as string,
          mediaSourceId: pr['media_source_id'] as string,
          codecName: pr['codec_name'] as string,
          codecProfile: pr['codec_profile'] as string | null,
          width: pr['width'] as number,
          height: pr['height'] as number,
          durationSeconds: pr['duration_seconds'] as number,
          bitrateBps: pr['bitrate_bps'] as number,
          framerate: pr['framerate'] as number | null,
          pixelFormat: pr['pixel_format'] as string | null,
          colourSpace: pr['colour_space'] as string | null,
          colourTransfer: pr['colour_transfer'] as string | null,
          colourPrimaries: pr['colour_primaries'] as string | null,
          isHdr: (pr['is_hdr'] as number) === 1,
          is10bit: (pr['is_10bit'] as number) === 1,
          audioTracks: pr['audio_tracks'] as number,
          subtitleTracks: pr['subtitle_tracks'] as number,
          chaptersCount: pr['chapters_count'] as number,
          rawJson: pr['raw_json'] as string | null,
          probedAt: pr['probed_at'] as string,
        });
      }
    }

    // Fetch encode history
    const encodeRows = db
      .query<Record<string, unknown>, [string]>(`
        SELECT ej.id, ej.media_source_id, ej.status, ej.encoder, ej.preset,
               ej.crf_or_bitrate, ej.input_path, ej.output_path,
               ej.input_size, ej.output_size, ej.progress_percent,
               ej.started_at, ej.completed_at, ej.error_message,
               ej.ffmpeg_command, ej.created_at
        FROM encode_jobs ej
        INNER JOIN media_sources ms ON ms.id = ej.media_source_id
        WHERE ms.media_item_id = ?
        ORDER BY ej.created_at DESC
      `)
      .all(id);

    const encodeHistory: EncodeJob[] = encodeRows.map((er) => ({
      id: er['id'] as string,
      mediaSourceId: er['media_source_id'] as string,
      status: er['status'] as EncodeJob['status'],
      encoder: er['encoder'] as EncodeJob['encoder'],
      preset: er['preset'] as string,
      crfOrBitrate: er['crf_or_bitrate'] as string,
      inputPath: er['input_path'] as string,
      outputPath: er['output_path'] as string,
      inputSize: er['input_size'] as number | null,
      outputSize: er['output_size'] as number | null,
      progressPercent: er['progress_percent'] as number,
      startedAt: er['started_at'] as string | null,
      completedAt: er['completed_at'] as string | null,
      errorMessage: er['error_message'] as string | null,
      ffmpegCommand: er['ffmpeg_command'] as string | null,
      createdAt: er['created_at'] as string,
    }));

    // Fetch Plex match
    const plexRow = db
      .query<Record<string, unknown>, [string]>(`
        SELECT id, media_item_id, plex_rating_key, plex_section_id,
               plex_title, matched_at
        FROM plex_matches
        WHERE media_item_id = ?
        LIMIT 1
      `)
      .get(id);

    const plexMatch: PlexMatch | null = plexRow
      ? {
          id: plexRow['id'] as string,
          mediaItemId: plexRow['media_item_id'] as string,
          plexRatingKey: plexRow['plex_rating_key'] as string,
          plexSectionId: plexRow['plex_section_id'] as number,
          plexTitle: plexRow['plex_title'] as string,
          matchedAt: plexRow['matched_at'] as string,
        }
      : null;

    // Fetch watch stats
    const watchRow = db
      .query<Record<string, unknown>, [string]>(`
        SELECT id, media_item_id, plex_rating_key, total_plays,
               last_played_at, total_watch_time_seconds, unique_viewers,
               fetched_at
        FROM watch_stats
        WHERE media_item_id = ?
        LIMIT 1
      `)
      .get(id);

    const watchStats: WatchStats | null = watchRow
      ? {
          id: watchRow['id'] as string,
          mediaItemId: watchRow['media_item_id'] as string,
          plexRatingKey: watchRow['plex_rating_key'] as string,
          totalPlays: watchRow['total_plays'] as number,
          lastPlayedAt: watchRow['last_played_at'] as string | null,
          totalWatchTimeSeconds: watchRow['total_watch_time_seconds'] as number,
          uniqueViewers: watchRow['unique_viewers'] as number,
          fetchedAt: watchRow['fetched_at'] as string,
        }
      : null;

    // Assemble the detail response
    const data: MediaItemDetail = {
      id: itemRow['id'] as string,
      title: itemRow['title'] as string,
      type: itemRow['type'] as MediaItem['type'],
      year: itemRow['year'] as number | null,
      imdbId: itemRow['imdb_id'] as string | null,
      tmdbId: itemRow['tmdb_id'] as string | null,
      tvdbId: itemRow['tvdb_id'] as string | null,
      posterUrl: itemRow['poster_url'] as string | null,
      createdAt: itemRow['created_at'] as string,
      updatedAt: itemRow['updated_at'] as string,
      sources,
      probes,
      encodeHistory,
      plexMatch,
      watchStats,
    };

    const response: ApiResponse<MediaItemDetail> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    return c.json(response);
  } catch (err) {
    log.error('Failed to fetch media item detail', {
      error: err instanceof Error ? err.message : String(err),
    });

    const response: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch media item',
      timestamp: new Date().toISOString(),
    };

    return c.json(response, 500);
  }
});


// =============================================================================
// POST /api/media/:id/match — Manually match a media item to a Plex entry
// =============================================================================

/**
 * POST /api/media/:id/match
 *
 * Creates a plex_matches record linking a media item to a Plex rating key.
 * Also fetches metadata from Plex to update the poster and title if available.
 *
 * Body: { plexRatingKey: string }
 */
mediaRoutes.post('/media/:id/match', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ plexRatingKey: string }>();

    if (!body.plexRatingKey) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'plexRatingKey is required',
        timestamp: new Date().toISOString(),
      };
      return c.json(response, 400);
    }

    // Check media item exists
    const itemRow = db
      .query<Record<string, unknown>, [string]>(
        'SELECT id, title FROM media_items WHERE id = ?',
      )
      .get(id);

    if (!itemRow) {
      const response: ApiResponse<never> = {
        success: false,
        error: `Media item not found: ${id}`,
        timestamp: new Date().toISOString(),
      };
      return c.json(response, 404);
    }

    // Remove any existing match for this item
    db.query<null, [string]>('DELETE FROM plex_matches WHERE media_item_id = ?').run(id);

    // Create the new match
    const matchId = crypto.randomUUID();
    db.query<null, [string, string, string, number, string]>(`
      INSERT INTO plex_matches (id, media_item_id, plex_rating_key, plex_section_id, plex_title)
      VALUES (?, ?, ?, ?, ?)
    `).run(matchId, id, body.plexRatingKey, 0, itemRow['title'] as string);

    // Try to enrich with Plex metadata
    try {
      const { plexClient } = await import('../services/integrations/plex-client');
      const metadata = await plexClient.getMetadata(body.plexRatingKey);
      if (metadata) {
        const appConfig = (await import('../config')).config;
        const plexToken = process.env['PLEX_TOKEN'] ?? '';
        const posterUrl = metadata.thumb
          ? `${appConfig.integrations.plex.url}${metadata.thumb}?X-Plex-Token=${plexToken}`
          : null;

        // Update the media item with Plex metadata
        if (posterUrl || metadata.title) {
          db.query<null, [string | null, string | null, number | null, string]>(`
            UPDATE media_items
            SET poster_url = COALESCE(?, poster_url),
                title = COALESCE(?, title),
                year = COALESCE(?, year),
                updated_at = datetime('now')
            WHERE id = ?
          `).run(posterUrl, metadata.title || null, metadata.year ?? null, id);
        }

        // Update the match with the Plex title and section
        if (metadata.title) {
          db.query<null, [string, string]>(`
            UPDATE plex_matches SET plex_title = ? WHERE id = ?
          `).run(metadata.title, matchId);
        }
      }
    } catch (enrichErr) {
      // Non-fatal — the match is still created
      log.warn('Failed to enrich matched media with Plex metadata', {
        error: enrichErr instanceof Error ? enrichErr.message : String(enrichErr),
      });
    }

    // Log the action
    db.query<null, [string, string, string, string, string, string]>(`
      INSERT INTO audit_logs (id, timestamp, action, entity_type, entity_id, details, source)
      VALUES (?, datetime('now'), ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      'plex_match',
      'media_item',
      id,
      `Manually matched to Plex rating key ${body.plexRatingKey}`,
      'user',
    );

    const response: ApiResponse<{ matchId: string }> = {
      success: true,
      data: { matchId },
      timestamp: new Date().toISOString(),
    };

    return c.json(response, 201);
  } catch (err) {
    log.error('Failed to match media to Plex', {
      error: err instanceof Error ? err.message : String(err),
    });

    const response: ApiResponse<never> = {
      success: false,
      error: 'Failed to match media to Plex',
      timestamp: new Date().toISOString(),
    };

    return c.json(response, 500);
  }
});

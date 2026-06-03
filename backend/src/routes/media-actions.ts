/**
 * SchroDrive Media Manager — Media Action Routes
 *
 * Endpoints for performing actions on media items:
 * copy to local, encode to local, re-encode, preserve,
 * and do-not-process marking.
 *
 * @module routes/media-actions
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { logAudit } from '../services/audit';
import { isCloudPath } from '../utils/file-utils';
import { createLogger } from '../utils/logger';
import type { ApiResponse, ImportJob } from '../types';

const log = createLogger('media-actions');

export const mediaActionRoutes = new Hono();

// =============================================================================
// Shared Helpers
// =============================================================================

/** Fetches the primary media source for a given media item ID. */
function getPrimarySource(mediaItemId: string) {
  return db
    .query<Record<string, unknown>, [string]>(`
      SELECT id, media_item_id, source_type, file_path, file_name,
             file_size, status, is_optimised, do_not_process
      FROM media_sources
      WHERE media_item_id = ?
      ORDER BY
        CASE source_type
          WHEN 'local' THEN 1
          WHEN 'realdebrid' THEN 2
          WHEN 'torbox' THEN 3
        END
      LIMIT 1
    `)
    .get(mediaItemId);
}

/** Creates an import job record in the database. */
function createImportJob(
  mediaSourceId: string,
  sourceType: string,
  action: string,
  sourcePath: string,
  destinationPath: string
): ImportJob {
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO import_jobs (id, media_source_id, source_type, action,
                             source_path, destination_path, status,
                             progress_percent, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
  `).run(id, mediaSourceId, sourceType, action, sourcePath, destinationPath, now, now);

  return {
    id,
    mediaSourceId,
    sourceType: sourceType as ImportJob['sourceType'],
    action: action as ImportJob['action'],
    sourcePath,
    destinationPath,
    status: 'pending',
    progressPercent: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// =============================================================================
// Validation Schemas
// =============================================================================

const confirmSchema = z.object({
  confirmed: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm this action by setting confirmed: true' }),
  }),
});

// =============================================================================
// POST /api/media/:id/copy-to-local
// =============================================================================

/**
 * POST /api/media/:id/copy-to-local
 *
 * Copies a cloud media source to local storage.
 * Requires `{ confirmed: true }` in the request body.
 */
mediaActionRoutes.post('/media/:id/copy-to-local', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    const validation = confirmSchema.safeParse(body);
    if (!validation.success) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: validation.error.issues[0]?.message || 'Confirmation required',
        timestamp: new Date().toISOString(),
      }, 400);
    }

    const source = getPrimarySource(id);
    if (!source) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: `No media source found for item: ${id}`,
        timestamp: new Date().toISOString(),
      }, 404);
    }

    const sourcePath = source['file_path'] as string;
    const fileName = source['file_name'] as string;
    const destinationPath = `/media/library/${fileName}`;

    const job = createImportJob(
      source['id'] as string,
      source['source_type'] as string,
      'copy',
      sourcePath,
      destinationPath
    );

    logAudit('media.copy_to_local', 'media_item', id, `Copying ${fileName} to local`, 'user');
    log.info(`Created copy-to-local import job for ${id}`, { jobId: job.id });

    return c.json<ApiResponse<ImportJob>>({
      success: true,
      data: job,
      timestamp: new Date().toISOString(),
    }, 201);
  } catch (err) {
    log.error('Failed to create copy-to-local job', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to create copy job',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// POST /api/media/:id/encode-to-local
// =============================================================================

/**
 * POST /api/media/:id/encode-to-local
 *
 * Copies a cloud media source to local storage and queues
 * an encode job. Requires `{ confirmed: true }`.
 */
mediaActionRoutes.post('/media/:id/encode-to-local', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    const validation = confirmSchema.safeParse(body);
    if (!validation.success) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: validation.error.issues[0]?.message || 'Confirmation required',
        timestamp: new Date().toISOString(),
      }, 400);
    }

    const source = getPrimarySource(id);
    if (!source) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: `No media source found for item: ${id}`,
        timestamp: new Date().toISOString(),
      }, 404);
    }

    const sourcePath = source['file_path'] as string;
    const fileName = source['file_name'] as string;
    const destinationPath = `/media/library/${fileName}`;

    const job = createImportJob(
      source['id'] as string,
      source['source_type'] as string,
      'copy_and_encode',
      sourcePath,
      destinationPath
    );

    logAudit(
      'media.encode_to_local',
      'media_item',
      id,
      `Copying and encoding ${fileName} to local`,
      'user'
    );
    log.info(`Created encode-to-local import job for ${id}`, { jobId: job.id });

    return c.json<ApiResponse<ImportJob>>({
      success: true,
      data: job,
      timestamp: new Date().toISOString(),
    }, 201);
  } catch (err) {
    log.error('Failed to create encode-to-local job', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to create encode job',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// POST /api/media/:id/reencode
// =============================================================================

/**
 * POST /api/media/:id/reencode
 *
 * Creates an encode job for an existing local media source.
 */
mediaActionRoutes.post('/media/:id/reencode', async (c) => {
  try {
    const id = c.req.param('id');

    // Find local source specifically
    const source = db
      .query<Record<string, unknown>, [string]>(`
        SELECT id, file_path, file_name, file_size
        FROM media_sources
        WHERE media_item_id = ? AND source_type = 'local'
        LIMIT 1
      `)
      .get(id);

    if (!source) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: `No local source found for item: ${id}`,
        timestamp: new Date().toISOString(),
      }, 404);
    }

    const filePath = source['file_path'] as string;

    if (isCloudPath(filePath)) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: 'Cannot re-encode cloud sources directly. Use copy-to-local first.',
        timestamp: new Date().toISOString(),
      }, 400);
    }

    const encodeId = uuidv4();
    const now = new Date().toISOString();
    const outputPath = filePath.replace(/(\.[^.]+)$/, '.optimised$1');

    db.prepare(`
      INSERT INTO encode_jobs (id, media_source_id, status, encoder, preset,
                               crf_or_bitrate, input_path, output_path,
                               input_size, progress_percent, created_at)
      VALUES (?, ?, 'pending', 'hevc_nvenc', 'p6', '6M', ?, ?, ?, 0, ?)
    `).run(
      encodeId,
      source['id'] as string,
      filePath,
      outputPath,
      source['file_size'] as number,
      now
    );

    logAudit('media.reencode', 'media_item', id, `Queued re-encode for ${source['file_name']}`, 'user');

    return c.json<ApiResponse<{ encodeJobId: string }>>({
      success: true,
      data: { encodeJobId: encodeId },
      timestamp: new Date().toISOString(),
    }, 201);
  } catch (err) {
    log.error('Failed to create re-encode job', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to create re-encode job',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// POST /api/media/:id/preserve
// =============================================================================

/**
 * POST /api/media/:id/preserve
 *
 * Marks a media item for preservation by creating an import job
 * with the 'preserve' action.
 */
mediaActionRoutes.post('/media/:id/preserve', async (c) => {
  try {
    const id = c.req.param('id');

    const source = getPrimarySource(id);
    if (!source) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: `No media source found for item: ${id}`,
        timestamp: new Date().toISOString(),
      }, 404);
    }

    const sourcePath = source['file_path'] as string;
    const fileName = source['file_name'] as string;
    const destinationPath = `/media/library/${fileName}`;

    const job = createImportJob(
      source['id'] as string,
      source['source_type'] as string,
      'preserve',
      sourcePath,
      destinationPath
    );

    logAudit('media.preserve', 'media_item', id, `Preserving ${fileName}`, 'user');

    return c.json<ApiResponse<ImportJob>>({
      success: true,
      data: job,
      timestamp: new Date().toISOString(),
    }, 201);
  } catch (err) {
    log.error('Failed to create preservation job', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to create preservation job',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// POST /api/media/:id/do-not-process
// =============================================================================

/**
 * POST /api/media/:id/do-not-process
 *
 * Sets the `doNotProcess` flag on all sources for a media item,
 * preventing automatic encoding or processing.
 */
mediaActionRoutes.post('/media/:id/do-not-process', (c) => {
  try {
    const id = c.req.param('id');
    const now = new Date().toISOString();

    const result = db.prepare(`
      UPDATE media_sources
      SET do_not_process = 1, updated_at = ?
      WHERE media_item_id = ?
    `).run(now, id);

    if (result.changes === 0) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: `No sources found for media item: ${id}`,
        timestamp: new Date().toISOString(),
      }, 404);
    }

    logAudit('media.do_not_process', 'media_item', id, 'Marked as do-not-process', 'user');

    return c.json<ApiResponse<{ updated: number }>>({
      success: true,
      data: { updated: result.changes },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to set do-not-process', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to update media source',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

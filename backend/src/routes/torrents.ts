/**
 * SchroDrive Media Manager — Torrent Routes
 *
 * Endpoints for adding torrents (magnet, file upload, URL),
 * listing downloads, and cancelling download jobs.
 *
 * External qBittorrent interactions use placeholder functions
 * that will be implemented by the services layer.
 *
 * @module routes/torrents
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { logAudit } from '../services/audit';
import { createLogger } from '../utils/logger';
import type { ApiResponse, DownloadJob } from '../types';

const log = createLogger('torrents');

export const torrentRoutes = new Hono();

// =============================================================================
// Placeholder Service Functions
// =============================================================================

/**
 * Placeholder: Adds a magnet link to qBittorrent.
 * Will be implemented by the qBittorrent service module.
 */
async function addMagnetToQbt(_magnet: string): Promise<{ hash: string }> {
  log.warn('qBittorrent service not yet implemented — magnet queued locally only');
  return { hash: `placeholder_${Date.now()}` };
}

/**
 * Placeholder: Adds a .torrent file to qBittorrent.
 * Will be implemented by the qBittorrent service module.
 */
async function addTorrentFileToQbt(_fileBuffer: ArrayBuffer): Promise<{ hash: string }> {
  log.warn('qBittorrent service not yet implemented — torrent queued locally only');
  return { hash: `placeholder_${Date.now()}` };
}

/**
 * Placeholder: Cancels a torrent in qBittorrent.
 * Will be implemented by the qBittorrent service module.
 */
async function cancelTorrentInQbt(_hash: string): Promise<void> {
  log.warn('qBittorrent service not yet implemented — cancel is local only');
}

// =============================================================================
// Helpers
// =============================================================================

/** Creates a download job record in the database. */
function createDownloadJob(
  source: string,
  magnetOrUrl: string,
  qbtHash: string | null
): DownloadJob {
  const id = uuidv4();
  // Use a placeholder media item ID — will be linked after download completes
  const mediaItemId = uuidv4();
  const now = new Date().toISOString();

  // Create a placeholder media item
  db.prepare(`
    INSERT INTO media_items (id, title, type, created_at, updated_at)
    VALUES (?, ?, 'other', ?, ?)
  `).run(mediaItemId, `Download: ${source}`, now, now);

  db.prepare(`
    INSERT INTO download_jobs (id, media_item_id, source, magnet_or_url,
                               qbt_hash, status, progress_percent,
                               download_speed, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', 0, 0, ?, ?)
  `).run(id, mediaItemId, source, magnetOrUrl, qbtHash, now, now);

  return {
    id,
    mediaItemId,
    source,
    magnetOrUrl,
    qbtHash,
    status: 'pending',
    progressPercent: 0,
    downloadSpeed: 0,
    savePath: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Maps a database row to a DownloadJob. */
function rowToDownloadJob(row: Record<string, unknown>): DownloadJob {
  return {
    id: row['id'] as string,
    mediaItemId: row['media_item_id'] as string,
    source: row['source'] as string,
    magnetOrUrl: row['magnet_or_url'] as string,
    qbtHash: row['qbt_hash'] as string | null,
    status: row['status'] as DownloadJob['status'],
    progressPercent: row['progress_percent'] as number,
    downloadSpeed: row['download_speed'] as number,
    savePath: row['save_path'] as string | null,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}

// =============================================================================
// Validation Schemas
// =============================================================================

const magnetSchema = z.object({
  magnet: z
    .string()
    .min(1, 'Magnet link is required')
    .refine((v) => v.startsWith('magnet:'), 'Must be a valid magnet link'),
});

const urlSchema = z.object({
  url: z.string().url('Must be a valid URL'),
});

// =============================================================================
// POST /api/torrents/magnet
// =============================================================================

/**
 * POST /api/torrents/magnet
 *
 * Adds a magnet link as a download job and sends it to qBittorrent.
 */
torrentRoutes.post('/torrents/magnet', async (c) => {
  try {
    const body = await c.req.json();
    const validation = magnetSchema.safeParse(body);

    if (!validation.success) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: validation.error.issues[0]?.message || 'Invalid magnet link',
        timestamp: new Date().toISOString(),
      }, 400);
    }

    const { magnet } = validation.data;

    let qbtHash: string | null = null;
    try {
      const result = await addMagnetToQbt(magnet);
      qbtHash = result.hash;
    } catch (err) {
      log.warn('Failed to add magnet to qBittorrent, job created locally', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const job = createDownloadJob('magnet', magnet, qbtHash);
    logAudit('download.magnet_added', 'download_job', job.id, 'Magnet link added', 'user');

    return c.json<ApiResponse<DownloadJob>>({
      success: true,
      data: job,
      timestamp: new Date().toISOString(),
    }, 201);
  } catch (err) {
    log.error('Failed to add magnet', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to add magnet link',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// POST /api/torrents/upload
// =============================================================================

/**
 * POST /api/torrents/upload
 *
 * Accepts a multipart form upload of a .torrent file
 * and creates a download job.
 */
torrentRoutes.post('/torrents/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('torrent');

    if (!file || !(file instanceof File)) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: 'A .torrent file is required in the "torrent" form field',
        timestamp: new Date().toISOString(),
      }, 400);
    }

    if (!file.name.endsWith('.torrent')) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: 'File must be a .torrent file',
        timestamp: new Date().toISOString(),
      }, 400);
    }

    const buffer = await file.arrayBuffer();

    let qbtHash: string | null = null;
    try {
      const result = await addTorrentFileToQbt(buffer);
      qbtHash = result.hash;
    } catch (err) {
      log.warn('Failed to add torrent file to qBittorrent, job created locally', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const job = createDownloadJob('torrent_file', file.name, qbtHash);
    logAudit('download.torrent_uploaded', 'download_job', job.id, `Torrent file: ${file.name}`, 'user');

    return c.json<ApiResponse<DownloadJob>>({
      success: true,
      data: job,
      timestamp: new Date().toISOString(),
    }, 201);
  } catch (err) {
    log.error('Failed to upload torrent', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to upload torrent file',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// POST /api/torrents/url
// =============================================================================

/**
 * POST /api/torrents/url
 *
 * Adds a direct download URL as a download job.
 */
torrentRoutes.post('/torrents/url', async (c) => {
  try {
    const body = await c.req.json();
    const validation = urlSchema.safeParse(body);

    if (!validation.success) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: validation.error.issues[0]?.message || 'Invalid URL',
        timestamp: new Date().toISOString(),
      }, 400);
    }

    const { url } = validation.data;

    const job = createDownloadJob('url', url, null);
    logAudit('download.url_added', 'download_job', job.id, `URL: ${url}`, 'user');

    return c.json<ApiResponse<DownloadJob>>({
      success: true,
      data: job,
      timestamp: new Date().toISOString(),
    }, 201);
  } catch (err) {
    log.error('Failed to add URL download', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to add URL download',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// GET /api/downloads
// =============================================================================

/**
 * GET /api/downloads
 *
 * Returns all download jobs with current progress.
 */
torrentRoutes.get('/downloads', (c) => {
  try {
    const rows = db
      .query<Record<string, unknown>, []>(`
        SELECT id, media_item_id, source, magnet_or_url, qbt_hash,
               status, progress_percent, download_speed, save_path,
               created_at, updated_at
        FROM download_jobs
        ORDER BY
          CASE status
            WHEN 'downloading' THEN 1
            WHEN 'pending' THEN 2
            WHEN 'completed' THEN 3
            WHEN 'failed' THEN 4
            WHEN 'cancelled' THEN 5
          END,
          created_at DESC
      `)
      .all();

    const jobs = rows.map(rowToDownloadJob);

    return c.json<ApiResponse<DownloadJob[]>>({
      success: true,
      data: jobs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to list downloads', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to list downloads',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// POST /api/downloads/:id/cancel
// =============================================================================

/**
 * POST /api/downloads/:id/cancel
 *
 * Cancels a download job in qBittorrent and updates the database status.
 */
torrentRoutes.post('/downloads/:id/cancel', async (c) => {
  try {
    const id = c.req.param('id');
    const now = new Date().toISOString();

    const row = db
      .query<Record<string, unknown>, [string]>(
        'SELECT qbt_hash, status FROM download_jobs WHERE id = ?'
      )
      .get(id);

    if (!row) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: `Download job not found: ${id}`,
        timestamp: new Date().toISOString(),
      }, 404);
    }

    if (row['status'] === 'completed' || row['status'] === 'cancelled') {
      return c.json<ApiResponse<never>>({
        success: false,
        error: `Cannot cancel a ${row['status']} download`,
        timestamp: new Date().toISOString(),
      }, 400);
    }

    // Cancel in qBittorrent if we have a hash
    const qbtHash = row['qbt_hash'] as string | null;
    if (qbtHash) {
      try {
        await cancelTorrentInQbt(qbtHash);
      } catch (err) {
        log.warn('Failed to cancel torrent in qBittorrent', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    db.prepare(`
      UPDATE download_jobs
      SET status = 'cancelled', updated_at = ?
      WHERE id = ?
    `).run(now, id);

    logAudit('download.cancelled', 'download_job', id, null, 'user');

    return c.json<ApiResponse<{ cancelled: true }>>({
      success: true,
      data: { cancelled: true },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to cancel download', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to cancel download',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

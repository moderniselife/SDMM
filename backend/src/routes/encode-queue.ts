/**
 * SchroDrive Media Manager — Encode Queue Routes
 *
 * Endpoints for listing, cancelling, and retrying encode jobs.
 *
 * @module routes/encode-queue
 */

import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { logAudit } from '../services/audit';
import { createLogger } from '../utils/logger';
import type { ApiResponse, EncodeJob } from '../types';

const log = createLogger('encode-queue');

export const encodeQueueRoutes = new Hono();

// =============================================================================
// Helpers
// =============================================================================

/** Maps a database row to an EncodeJob interface. */
function rowToEncodeJob(row: Record<string, unknown>): EncodeJob {
  return {
    id: row['id'] as string,
    mediaSourceId: row['media_source_id'] as string,
    status: row['status'] as EncodeJob['status'],
    encoder: row['encoder'] as EncodeJob['encoder'],
    preset: row['preset'] as string,
    crfOrBitrate: row['crf_or_bitrate'] as string,
    inputPath: row['input_path'] as string,
    outputPath: row['output_path'] as string,
    inputSize: row['input_size'] as number | null,
    outputSize: row['output_size'] as number | null,
    progressPercent: row['progress_percent'] as number,
    startedAt: row['started_at'] as string | null,
    completedAt: row['completed_at'] as string | null,
    errorMessage: row['error_message'] as string | null,
    ffmpegCommand: row['ffmpeg_command'] as string | null,
    createdAt: row['created_at'] as string,
  };
}

// =============================================================================
// GET /api/encode-queue
// =============================================================================

/**
 * GET /api/encode-queue
 *
 * Returns all encode jobs sorted by status priority:
 * running first, then pending, then completed/failed/cancelled.
 */
encodeQueueRoutes.get('/encode-queue', (c) => {
  try {
    const rows = db
      .query<Record<string, unknown>, []>(`
        SELECT id, media_source_id, status, encoder, preset,
               crf_or_bitrate, input_path, output_path,
               input_size, output_size, progress_percent,
               started_at, completed_at, error_message,
               ffmpeg_command, created_at
        FROM encode_jobs
        ORDER BY
          CASE status
            WHEN 'running' THEN 1
            WHEN 'pending' THEN 2
            WHEN 'completed' THEN 3
            WHEN 'failed' THEN 4
            WHEN 'cancelled' THEN 5
            WHEN 'skipped' THEN 6
          END,
          created_at DESC
      `)
      .all();

    const jobs = rows.map(rowToEncodeJob);

    return c.json<ApiResponse<EncodeJob[]>>({
      success: true,
      data: jobs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to list encode queue', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to list encode queue',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// POST /api/encode-queue/:id/cancel
// =============================================================================

/**
 * POST /api/encode-queue/:id/cancel
 *
 * Cancels a running or pending encode job.
 */
encodeQueueRoutes.post('/encode-queue/:id/cancel', (c) => {
  try {
    const id = c.req.param('id');

    const row = db
      .query<Record<string, unknown>, [string]>(
        'SELECT status FROM encode_jobs WHERE id = ?'
      )
      .get(id);

    if (!row) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: `Encode job not found: ${id}`,
        timestamp: new Date().toISOString(),
      }, 404);
    }

    const status = row['status'] as string;
    if (status !== 'pending' && status !== 'running') {
      return c.json<ApiResponse<never>>({
        success: false,
        error: `Cannot cancel a ${status} encode job`,
        timestamp: new Date().toISOString(),
      }, 400);
    }

    db.prepare(`
      UPDATE encode_jobs
      SET status = 'cancelled', completed_at = datetime('now')
      WHERE id = ?
    `).run(id);

    logAudit('encode.cancelled', 'encode_job', id, null, 'user');
    log.info(`Encode job ${id} cancelled`);

    // TODO: If the job is currently running, signal the FFmpeg process to terminate.
    // This will be handled by the encoding service when implemented.

    return c.json<ApiResponse<{ cancelled: true }>>({
      success: true,
      data: { cancelled: true },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to cancel encode job', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to cancel encode job',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// POST /api/encode-queue/:id/retry
// =============================================================================

/**
 * POST /api/encode-queue/:id/retry
 *
 * Re-queues a failed encode job by creating a new pending job
 * with the same parameters.
 */
encodeQueueRoutes.post('/encode-queue/:id/retry', (c) => {
  try {
    const id = c.req.param('id');

    const row = db
      .query<Record<string, unknown>, [string]>(`
        SELECT media_source_id, status, encoder, preset,
               crf_or_bitrate, input_path, output_path, input_size
        FROM encode_jobs
        WHERE id = ?
      `)
      .get(id);

    if (!row) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: `Encode job not found: ${id}`,
        timestamp: new Date().toISOString(),
      }, 404);
    }

    if (row['status'] !== 'failed' && row['status'] !== 'cancelled') {
      return c.json<ApiResponse<never>>({
        success: false,
        error: `Can only retry failed or cancelled encode jobs, current status: ${row['status']}`,
        timestamp: new Date().toISOString(),
      }, 400);
    }

    // Create a new encode job with the same parameters
    const newId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO encode_jobs (id, media_source_id, status, encoder, preset,
                               crf_or_bitrate, input_path, output_path,
                               input_size, progress_percent, created_at)
      VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      newId,
      row['media_source_id'] as string,
      row['encoder'] as string,
      row['preset'] as string,
      row['crf_or_bitrate'] as string,
      row['input_path'] as string,
      row['output_path'] as string,
      row['input_size'] as number | null,
      now
    );

    logAudit('encode.retried', 'encode_job', newId, `Retried from ${id}`, 'user');
    log.info(`Encode job ${id} retried as ${newId}`);

    return c.json<ApiResponse<{ newJobId: string; originalJobId: string }>>({
      success: true,
      data: { newJobId: newId, originalJobId: id },
      timestamp: new Date().toISOString(),
    }, 201);
  } catch (err) {
    log.error('Failed to retry encode job', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to retry encode job',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

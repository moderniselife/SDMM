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
/**
 * GET /api/encode-queue
 *
 * Returns all encode jobs AND import jobs sorted by status priority:
 * running first, then pending, then completed/failed/cancelled.
 *
 * Import jobs (copy, encode, preserve) are mapped to the same EncodeJob
 * shape so the frontend can display them uniformly.
 */
encodeQueueRoutes.get('/encode-queue', (c) => {
  try {
    // 1. Fetch actual encode_jobs
    const encodeRows = db
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

    const jobs = encodeRows.map(rowToEncodeJob);

    // 2. Fetch import_jobs and map to EncodeJob shape
    const importRows = db
      .query<Record<string, unknown>, []>(`
        SELECT id, media_source_id, source_type, action,
               source_path, destination_path, status,
               progress_percent, error_message,
               created_at, updated_at
        FROM import_jobs
        ORDER BY
          CASE status
            WHEN 'running' THEN 1
            WHEN 'pending' THEN 2
            WHEN 'completed' THEN 3
            WHEN 'failed' THEN 4
            WHEN 'cancelled' THEN 5
          END,
          created_at DESC
      `)
      .all();

    for (const row of importRows) {
      const action = row['action'] as string;
      const encoderLabel =
        action === 'copy_and_encode' ? 'copy+encode' :
        action === 'copy' ? 'copy' :
        action === 'preserve' ? 'preserve' :
        action;

      jobs.push({
        id: row['id'] as string,
        mediaSourceId: row['media_source_id'] as string,
        status: (row['status'] as string).toUpperCase() as EncodeJob['status'],
        encoder: encoderLabel as EncodeJob['encoder'],
        preset: action,
        crfOrBitrate: '',
        inputPath: row['source_path'] as string,
        outputPath: row['destination_path'] as string,
        inputSize: null,
        outputSize: null,
        progressPercent: (row['progress_percent'] as number) ?? 0,
        startedAt: null,
        completedAt: null,
        errorMessage: (row['error_message'] as string) ?? null,
        ffmpegCommand: null,
        createdAt: row['created_at'] as string,
      });
    }

    // Sort unified list by status priority
    const statusPriority: Record<string, number> = {
      RUNNING: 1, running: 1,
      PENDING: 2, pending: 2,
      COMPLETED: 3, completed: 3,
      FAILED: 4, failed: 4,
      CANCELLED: 5, cancelled: 5,
      SKIPPED: 6, skipped: 6,
    };

    jobs.sort((a, b) => {
      const aPriority = statusPriority[a.status] ?? 99;
      const bPriority = statusPriority[b.status] ?? 99;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

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

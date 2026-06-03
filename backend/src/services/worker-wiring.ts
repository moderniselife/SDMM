/**
 * SchroDrive Media Manager — Worker Wiring
 *
 * Provides real database-backed dependency injection callbacks
 * for the encode, download, and import workers.
 *
 * Each worker uses a dependency injection pattern where callbacks
 * for DB operations are injected at startup. This module creates
 * those callbacks using the actual bun:sqlite database connection.
 *
 * @module services/worker-wiring
 */

import { db } from '@/db/connection';
import { createLogger } from '@/utils/logger';
import { reconcileFiles } from '@/services/reconciler';
import type { GenericDiscoveredFile } from '@/services/reconciler';
import type {
  FetchNextJobFn,
  UpdateJobStatusFn,
  AuditLogFn,
  PendingEncodeJob,
} from '@/services/queue/encode-worker';
import type {
  OnDownloadCompleteFn,
  UpdateDownloadStatusFn,
} from '@/services/queue/download-worker';
import type {
  FetchNextImportFn,
  UpdateImportStatusFn,
  QueueEncodeFn,
  ImportAuditLogFn,
} from '@/services/queue/import-worker';
import type { QBitTorrentInfo } from '@/services/integrations/qbittorrent-client';
import type { ImportAction } from '@/types';

const log = createLogger('worker-wiring');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dependency injection bundle for the encode worker. */
export interface EncodeWorkerDeps {
  fetchNextJob: FetchNextJobFn;
  updateJobStatus: UpdateJobStatusFn;
  auditLog: AuditLogFn;
}

/** Dependency injection bundle for the download worker. */
export interface DownloadWorkerDeps {
  onDownloadComplete: OnDownloadCompleteFn;
  updateDownloadStatus: UpdateDownloadStatusFn;
}

/** Dependency injection bundle for the import worker. */
export interface ImportWorkerDeps {
  fetchNextImport: FetchNextImportFn;
  updateImportStatus: UpdateImportStatusFn;
  queueEncode: QueueEncodeFn;
  auditLog: ImportAuditLogFn;
}

// ---------------------------------------------------------------------------
// Internal Row Types
// ---------------------------------------------------------------------------

/** Raw encode_jobs row from the database. */
interface EncodeJobRow {
  id: string;
  input_path: string;
  output_path: string;
  encoder: string;
  created_at: string;
}


/** Raw import_jobs row from the database. */
interface ImportJobRow {
  id: string;
  source_path: string;
  destination_path: string;
  action: string;
  file_size_bytes: number;
}

// ---------------------------------------------------------------------------
// Encode Worker Dependencies
// ---------------------------------------------------------------------------

/**
 * Returns the dependency injection callbacks for the encode worker.
 *
 * - fetchNextJob: SELECTs the next pending encode job, ordered by created_at
 * - updateJobStatus: UPDATEs encode_jobs with status, progress, error, etc.
 * - auditLog: INSERTs into audit_logs
 *
 * @returns EncodeWorkerDeps ready to be passed to startEncodeWorker()
 */
export function getEncodeWorkerDeps(): EncodeWorkerDeps {
  const fetchNextJob: FetchNextJobFn = async () => {
    try {
      const row = db.prepare(`
        SELECT id, input_path, output_path, encoder, created_at
        FROM encode_jobs
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 1
      `).get() as EncodeJobRow | null;

      if (!row) return null;

      return {
        id: row.id,
        inputPath: row.input_path,
        outputDir: row.output_path,
        encoderType: row.encoder as PendingEncodeJob['encoderType'],
        createdAt: new Date(row.created_at),
      };
    } catch (err) {
      log.error('Failed to fetch next encode job', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  };

  const updateJobStatus: UpdateJobStatusFn = async (jobId, status, details) => {
    try {
      const now = new Date().toISOString();

      // Build dynamic update based on status and details
      if (status === 'running') {
        db.prepare(`
          UPDATE encode_jobs
          SET status = ?, started_at = ?
          WHERE id = ?
        `).run(status, (details?.startedAt as string) ?? now, jobId);
      } else if (status === 'completed') {
        db.prepare(`
          UPDATE encode_jobs
          SET status = ?,
              output_path = COALESCE(?, output_path),
              output_size = ?,
              completed_at = ?
          WHERE id = ?
        `).run(
          status,
          (details?.outputPath as string) ?? null,
          (details?.outputSize as number) ?? null,
          (details?.completedAt as string) ?? now,
          jobId,
        );
      } else if (status === 'failed' || status === 'skipped') {
        db.prepare(`
          UPDATE encode_jobs
          SET status = ?,
              error_message = ?,
              completed_at = ?
          WHERE id = ?
        `).run(
          status,
          (details?.error as string) ?? null,
          now,
          jobId,
        );
      }

      log.debug('Updated encode job status', { jobId, status });
    } catch (err) {
      log.error('Failed to update encode job status', {
        jobId,
        status,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const auditLog: AuditLogFn = async (action, entityType, entityId, details) => {
    try {
      const id = crypto.randomUUID();
      const timestamp = new Date().toISOString();

      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, action, entity_type, entity_id, details, source)
        VALUES (?, ?, ?, ?, ?, ?, 'system')
      `).run(id, timestamp, action, entityType, entityId, details);
    } catch (err) {
      log.error('Failed to write audit log', {
        action,
        entityType,
        entityId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return { fetchNextJob, updateJobStatus, auditLog };
}

// ---------------------------------------------------------------------------
// Download Worker Dependencies
// ---------------------------------------------------------------------------

/**
 * Returns the dependency injection callbacks for the download worker.
 *
 * - updateDownloadStatus: UPDATEs download_jobs with progress and state
 * - onDownloadComplete: Triggers reconciliation of the completed download path
 *
 * @returns DownloadWorkerDeps ready to be passed to startDownloadWorker()
 */
export function getDownloadWorkerDeps(): DownloadWorkerDeps {
  const updateDownloadStatus: UpdateDownloadStatusFn = async (
    hash,
    progress,
    state,
    details,
  ) => {
    try {
      const now = new Date().toISOString();

      if (state === 'completed') {
        db.prepare(`
          UPDATE download_jobs
          SET status = 'completed',
              progress_percent = 100,
              save_path = ?,
              updated_at = ?
          WHERE qbt_hash = ?
        `).run((details?.savePath as string) ?? null, now, hash);
      } else {
        db.prepare(`
          UPDATE download_jobs
          SET progress_percent = ?,
              status = CASE WHEN status != 'completed' THEN 'downloading' ELSE status END,
              updated_at = ?
          WHERE qbt_hash = ?
        `).run(progress, now, hash);
      }
    } catch (err) {
      log.error('Failed to update download status', {
        hash,
        progress,
        state,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const onDownloadComplete: OnDownloadCompleteFn = async (torrent: QBitTorrentInfo) => {
    try {
      log.info('Download complete — triggering reconciliation', {
        name: torrent.name,
        savePath: torrent.savePath,
      });

      // Scan the completed download's save path for media files
      // and reconcile them into the database
      const { readdir, stat } = await import('node:fs/promises');
      const path = await import('node:path');

      const MEDIA_EXTENSIONS = new Set([
        '.mkv', '.mp4', '.avi', '.ts', '.wmv',
        '.m4v', '.mov', '.flv', '.webm', '.mpg', '.mpeg',
      ]);

      const discoveredFiles: GenericDiscoveredFile[] = [];

      /**
       * Recursively walks a directory to find media files
       * from the completed download.
       */
      async function walkDir(dirPath: string): Promise<void> {
        let entries: string[];
        try {
          entries = await readdir(dirPath);
        } catch {
          return;
        }

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry);
          try {
            const fileStat = await stat(fullPath);
            if (fileStat.isDirectory()) {
              await walkDir(fullPath);
            } else if (fileStat.isFile()) {
              const ext = path.extname(entry).toLowerCase();
              if (MEDIA_EXTENSIONS.has(ext) && fileStat.size >= 104_857_600) {
                discoveredFiles.push({
                  filePath: fullPath,
                  fileName: entry,
                  fileSize: fileStat.size,
                  modifiedAt: fileStat.mtime,
                  sourceType: 'local',
                });
              }
            }
          } catch {
            // Skip inaccessible files
          }
        }
      }

      const downloadPath = torrent.savePath;
      if (downloadPath) {
        await walkDir(downloadPath);

        if (discoveredFiles.length > 0) {
          const reconcileResult = await reconcileFiles(discoveredFiles, 'local');
          log.info('Post-download reconciliation complete', {
            torrentName: torrent.name,
            newItems: reconcileResult.newItems,
            updatedItems: reconcileResult.updatedItems,
          });
        } else {
          log.debug('No media files found in download path', {
            path: downloadPath,
          });
        }
      }
    } catch (err) {
      log.error('Post-download reconciliation failed', {
        torrentName: torrent.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return { onDownloadComplete, updateDownloadStatus };
}

// ---------------------------------------------------------------------------
// Import Worker Dependencies
// ---------------------------------------------------------------------------

/**
 * Returns the dependency injection callbacks for the import worker.
 *
 * - fetchNextImport: SELECTs the next pending import job
 * - updateImportStatus: UPDATEs import_jobs with status and details
 * - queueEncode: INSERTs an encode_job for copy_and_encode actions
 * - auditLog: INSERTs into audit_logs
 *
 * @returns ImportWorkerDeps ready to be passed to startImportWorker()
 */
export function getImportWorkerDeps(): ImportWorkerDeps {
  const fetchNextImport: FetchNextImportFn = async () => {
    try {
      const row = db.prepare(`
        SELECT ij.id, ij.source_path, ij.destination_path, ij.action,
               ms.file_size AS file_size_bytes
        FROM import_jobs ij
        INNER JOIN media_sources ms ON ms.id = ij.media_source_id
        WHERE ij.status = 'pending'
        ORDER BY ij.created_at ASC
        LIMIT 1
      `).get() as ImportJobRow | null;

      if (!row) return null;

      return {
        id: row.id,
        sourcePath: row.source_path,
        destinationPath: row.destination_path,
        action: row.action as ImportAction,
        fileSizeBytes: row.file_size_bytes ?? 0,
      };
    } catch (err) {
      log.error('Failed to fetch next import job', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  };

  const updateImportStatus: UpdateImportStatusFn = async (jobId, status, _details) => {
    try {
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE import_jobs
        SET status = ?,
            updated_at = ?
        WHERE id = ?
      `).run(status, now, jobId);

      log.debug('Updated import job status', { jobId, status });
    } catch (err) {
      log.error('Failed to update import job status', {
        jobId,
        status,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const queueEncode: QueueEncodeFn = async (filePath: string) => {
    try {
      // Find the media_source for this file path
      interface MediaSourceRow {
        id: string;
      }

      const source = db.prepare(`
        SELECT id FROM media_sources
        WHERE file_path = ?
        LIMIT 1
      `).get(filePath) as MediaSourceRow | null;

      if (!source) {
        log.warn('Cannot queue encode — no media_source found for path', {
          filePath,
        });
        return;
      }

      // Determine output path (same directory as input)
      const path = await import('node:path');
      const dir = path.dirname(filePath);
      const ext = path.extname(filePath);
      const baseName = path.basename(filePath, ext);
      const outputPath = path.join(dir, `${baseName}.optimised${ext}`);

      // Default to libx265 with sensible preset
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO encode_jobs (
          id, media_source_id, status, encoder,
          preset, crf_or_bitrate, input_path, output_path,
          created_at
        )
        VALUES (?, ?, 'pending', 'libx265', 'slow', '20', ?, ?, ?)
      `).run(id, source.id, filePath, outputPath, now);

      log.info('Queued encode job from import', {
        encodeJobId: id,
        mediaSourceId: source.id,
        inputPath: filePath,
      });
    } catch (err) {
      log.error('Failed to queue encode job', {
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const auditLog: ImportAuditLogFn = async (action, entityType, entityId, details) => {
    try {
      const id = crypto.randomUUID();
      const timestamp = new Date().toISOString();

      db.prepare(`
        INSERT INTO audit_logs (id, timestamp, action, entity_type, entity_id, details, source)
        VALUES (?, ?, ?, ?, ?, ?, 'system')
      `).run(id, timestamp, action, entityType, entityId, details);
    } catch (err) {
      log.error('Failed to write audit log', {
        action,
        entityType,
        entityId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return { fetchNextImport, updateImportStatus, queueEncode, auditLog };
}

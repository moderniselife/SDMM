/**
 * SchroDrive Media Manager — Import Worker
 *
 * Handles copy/import jobs from cloud mounts to local storage.
 * Always COPIES (never moves) from cloud mounts.
 * Supports 'copy_only' and 'copy_and_encode' actions.
 *
 * @module services/queue/import-worker
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { ImportAction } from '@/types';
import { eventBus } from '../events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Pending import job for the worker. */
export interface PendingImportJob {
  id: string;
  sourcePath: string;
  destinationPath: string;
  action: ImportAction;
  fileSizeBytes: number;
}

/** Callback to fetch the next pending import job from the database. */
export type FetchNextImportFn = () => Promise<PendingImportJob | null>;

/** Callback to update import job status. */
export type UpdateImportStatusFn = (
  jobId: string,
  status: 'running' | 'completed' | 'failed',
  details?: Record<string, unknown>,
) => Promise<void>;

/** Callback to queue an encoding job after import. */
export type QueueEncodeFn = (filePath: string) => Promise<void>;

/** Callback to log an audit entry. */
export type ImportAuditLogFn = (
  action: string,
  entityType: string,
  entityId: string,
  details: string,
) => Promise<void>;

// ---------------------------------------------------------------------------
// Worker State
// ---------------------------------------------------------------------------

let workerRunning = false;
let workerTimer: ReturnType<typeof setTimeout> | null = null;

/** Injected dependencies. */
let fetchNextImport: FetchNextImportFn = async () => null;
let updateImportStatus: UpdateImportStatusFn = async () => {};
let queueEncode: QueueEncodeFn = async () => {};
let auditLog: ImportAuditLogFn = async () => {};

// ---------------------------------------------------------------------------
// Safe Copy with Progress
// ---------------------------------------------------------------------------

/**
 * Copies a file from source to destination with progress reporting.
 *
 * Uses Bun's file API for efficient streaming copy. Reports progress
 * as bytes copied vs total file size.
 *
 * IMPORTANT: This always COPIES, never moves. Cloud mount files
 * must never be deleted or modified.
 *
 * @param sourcePath - Absolute path to the source file
 * @param destPath - Absolute path to the destination
 * @param totalSize - Total file size in bytes
 * @param onProgress - Callback with completion percentage
 */
async function safeCopy(
  sourcePath: string,
  destPath: string,
  totalSize: number,
  onProgress: (percent: number) => void,
): Promise<void> {
  // Ensure destination directory exists
  const destDir = path.dirname(destPath);
  await mkdir(destDir, { recursive: true });

  const sourceFile = Bun.file(sourcePath);
  const sourceStream = sourceFile.stream();
  const destFile = Bun.file(destPath);
  const writer = destFile.writer();

  let copiedBytes = 0;
  let lastReportedPercent = -1;
  let chunksSinceYield = 0;

  // Yield to the event loop every ~10MB to prevent starvation.
  // FUSE reads + disk writes can monopolise the thread for seconds
  // on large media files (5-50GB), blocking all HTTP handlers.
  const YIELD_EVERY_BYTES = 10 * 1024 * 1024; // 10MB
  let bytesSinceYield = 0;

  try {
    for await (const chunk of sourceStream) {
      writer.write(chunk);
      copiedBytes += chunk.byteLength;
      bytesSinceYield += chunk.byteLength;
      chunksSinceYield++;

      const percent = totalSize > 0
        ? Math.min(100, Math.round((copiedBytes / totalSize) * 100))
        : 0;

      // Only report on whole-percent changes to avoid flooding
      if (percent !== lastReportedPercent) {
        lastReportedPercent = percent;
        onProgress(percent);
      }

      // Yield to event loop periodically so HTTP requests can be served
      if (bytesSinceYield >= YIELD_EVERY_BYTES) {
        bytesSinceYield = 0;
        await writer.flush();
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    await writer.end();
  } catch (err) {
    // Clean up partial file on error
    try {
      await Bun.write(destPath, '');
      const { unlink } = await import('node:fs/promises');
      await unlink(destPath);
    } catch {
      // Best effort cleanup
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Worker Loop
// ---------------------------------------------------------------------------

/**
 * Main worker loop iteration. Processes one import job at a time.
 */
async function processNextImport(): Promise<void> {
  if (!workerRunning) return;

  try {
    const job = await fetchNextImport();
    if (!job) {
      scheduleNextCheck();
      return;
    }

    console.log(`[ImportWorker] Processing import ${job.id}: ${job.sourcePath} → ${job.destinationPath}`);

    // Mark as running
    await updateImportStatus(job.id, 'running', { startedAt: new Date().toISOString() });
    await auditLog('import_started', 'import_job', job.id, `Copying ${job.sourcePath}`);

    // Step 1: Copy the file
    try {
      await safeCopy(
        job.sourcePath,
        job.destinationPath,
        job.fileSizeBytes,
        (percent) => {
          eventBus.emitImportProgress(job.id, percent);
        },
      );
    } catch (err) {
      const msg = `Copy failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[ImportWorker] ${msg}`);
      await updateImportStatus(job.id, 'failed', { error: msg });
      await auditLog('import_failed', 'import_job', job.id, msg);
      eventBus.emitImportComplete(job.id, 'failed');
      scheduleNextCheck();
      return;
    }

    // Step 2: Verify the copied file
    try {
      const copiedFile = Bun.file(job.destinationPath);
      const copiedSize = copiedFile.size;

      if (job.fileSizeBytes > 0 && copiedSize !== job.fileSizeBytes) {
        // Known expected size — strict comparison
        throw new Error(
          `Size mismatch: expected ${job.fileSizeBytes} bytes, got ${copiedSize} bytes`,
        );
      } else if (copiedSize === 0) {
        // File is empty — always invalid regardless of expected size
        throw new Error('Copied file is empty (0 bytes)');
      }
      // If fileSizeBytes is 0 (cloud files — no stat on FUSE), just check it's non-empty
    } catch (err) {
      const msg = `Verification failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[ImportWorker] ${msg}`);
      await updateImportStatus(job.id, 'failed', { error: msg });
      await auditLog('import_failed', 'import_job', job.id, msg);
      eventBus.emitImportComplete(job.id, 'failed');
      scheduleNextCheck();
      return;
    }

    // Step 3: Mark as completed
    await updateImportStatus(job.id, 'completed', {
      completedAt: new Date().toISOString(),
    });

    await auditLog(
      'import_completed',
      'import_job',
      job.id,
      `Successfully copied ${formatBytes(job.fileSizeBytes)} to ${job.destinationPath}`,
    );

    eventBus.emitImportComplete(job.id, 'completed');

    // Step 4: Queue encoding if action is 'copy_and_encode'
    if (job.action === 'copy_and_encode') {
      try {
        await queueEncode(job.destinationPath);
        await auditLog(
          'encode_queued',
          'import_job',
          job.id,
          `Encoding queued for ${job.destinationPath}`,
        );
        console.log(`[ImportWorker] Encoding queued for imported file: ${job.destinationPath}`);
      } catch (err) {
        console.warn(
          `[ImportWorker] Failed to queue encoding: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    console.log(`[ImportWorker] Import ${job.id} completed`);
  } catch (err) {
    console.error(
      `[ImportWorker] Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    scheduleNextCheck();
  }
}

/**
 * Schedules the next job check after a short delay.
 */
function scheduleNextCheck(): void {
  if (!workerRunning) return;
  workerTimer = setTimeout(() => {
    processNextImport().catch(console.error);
  }, 5_000);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Starts the import worker background loop.
 *
 * @param deps - Injectable dependencies for job management
 */
export function startImportWorker(deps?: {
  fetchNextImport?: FetchNextImportFn;
  updateImportStatus?: UpdateImportStatusFn;
  queueEncode?: QueueEncodeFn;
  auditLog?: ImportAuditLogFn;
}): void {
  if (workerRunning) {
    console.warn('[ImportWorker] Worker is already running');
    return;
  }

  if (deps?.fetchNextImport) fetchNextImport = deps.fetchNextImport;
  if (deps?.updateImportStatus) updateImportStatus = deps.updateImportStatus;
  if (deps?.queueEncode) queueEncode = deps.queueEncode;
  if (deps?.auditLog) auditLog = deps.auditLog;

  workerRunning = true;
  console.log('[ImportWorker] Started');

  processNextImport().catch(console.error);
}

/**
 * Stops the import worker background loop.
 */
export function stopImportWorker(): void {
  workerRunning = false;
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  console.log('[ImportWorker] Stopped');
}

/**
 * Returns whether the import worker is currently running.
 */
export function isImportWorkerRunning(): boolean {
  return workerRunning;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GiB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${bytes} B`;
}

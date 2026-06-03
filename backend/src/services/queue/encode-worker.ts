/**
 * SchroDrive Media Manager — Encode Worker
 *
 * Background worker that processes pending encode jobs one at a time.
 * Runs encoding via encoder.ts, validates output via validator.ts,
 * triggers Plex refresh on success, and emits progress via SSE.
 *
 * @module services/queue/encode-worker
 */

import { runEncode } from '../encoding/encoder';
import { validateEncode } from '../encoding/validator';
import { probeFile } from '../encoding/ffprobe';
import { getPreset } from '../encoding/presets';
import type { DetailedProbe, EncodingPresetConfig } from '../encoding/types';
import type { PresetEncoderType } from '../encoding/presets';
import { eventBus } from '../events';
import { plexClient } from '../integrations/plex-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Pending encode job (simplified — in production, pull from DB). */
export interface PendingEncodeJob {
  id: string;
  inputPath: string;
  outputDir: string;
  encoderType: PresetEncoderType;
  createdAt: Date;
}

/** Callback to fetch the next pending encode job from the database. */
export type FetchNextJobFn = () => Promise<PendingEncodeJob | null>;

/** Callback to update job status in the database. */
export type UpdateJobStatusFn = (
  jobId: string,
  status: 'running' | 'completed' | 'failed' | 'skipped',
  details?: Record<string, unknown>,
) => Promise<void>;

/** Callback to log an audit entry. */
export type AuditLogFn = (
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
let currentJobId: string | null = null;

/** Injected dependencies for the worker. */
let fetchNextJob: FetchNextJobFn = async () => null;
let updateJobStatus: UpdateJobStatusFn = async () => {};
let auditLog: AuditLogFn = async () => {};

// ---------------------------------------------------------------------------
// Worker Loop
// ---------------------------------------------------------------------------

/**
 * Main worker loop iteration. Checks for a pending job and processes it.
 */
async function processNextJob(): Promise<void> {
  if (!workerRunning) return;

  try {
    const job = await fetchNextJob();
    if (!job) {
      // No pending jobs — wait and check again
      scheduleNextCheck();
      return;
    }

    currentJobId = job.id;
    console.log(`[EncodeWorker] Processing job ${job.id}: ${job.inputPath}`);

    // Mark as running
    await updateJobStatus(job.id, 'running', { startedAt: new Date().toISOString() });

    // Step 1: Probe the input file
    let probe: DetailedProbe;
    try {
      probe = await probeFile(job.inputPath);
    } catch (err) {
      const msg = `Failed to probe input: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[EncodeWorker] ${msg}`);
      await updateJobStatus(job.id, 'failed', { error: msg });
      await auditLog('encode_failed', 'encode_job', job.id, msg);
      eventBus.emitEncodeComplete(job.id, 'failed');
      scheduleNextCheck();
      return;
    }

    // Step 2: Get the encoding preset
    const preset: EncodingPresetConfig = getPreset(job.encoderType, probe.resolution);

    // Step 3: Run the encode
    const { result } = await runEncode(
      job.inputPath,
      job.outputDir,
      probe,
      preset,
      (percent) => {
        eventBus.emitEncodeProgress(job.id, percent);
      },
    );

    if (!result.success) {
      const msg = result.error ?? 'Unknown encoding error';
      console.error(`[EncodeWorker] Encoding failed for job ${job.id}: ${msg}`);
      await updateJobStatus(job.id, 'failed', { error: msg });
      await auditLog('encode_failed', 'encode_job', job.id, msg);
      eventBus.emitEncodeComplete(job.id, 'failed');
      scheduleNextCheck();
      return;
    }

    // Step 4: Validate the output
    const validation = await validateEncode(
      job.inputPath,
      result.outputPath!,
      probe,
    );

    if (!validation.valid) {
      const msg = validation.reason ?? 'Validation failed';
      console.warn(`[EncodeWorker] Validation failed for job ${job.id}: ${msg}`);
      const status = msg.includes('not smaller') ? 'skipped' : 'failed';
      await updateJobStatus(job.id, status as 'failed' | 'skipped', {
        error: msg,
        inputSize: validation.inputSize,
        outputSize: validation.outputSize,
      });
      await auditLog(`encode_${status}`, 'encode_job', job.id, msg);
      eventBus.emitEncodeComplete(job.id, status);
      scheduleNextCheck();
      return;
    }

    // Step 5: Success — update DB and trigger Plex refresh
    const savingsPercent = (
      (1 - validation.outputSize / validation.inputSize) * 100
    ).toFixed(1);

    await updateJobStatus(job.id, 'completed', {
      outputPath: validation.finalPath,
      outputSize: validation.outputSize,
      completedAt: new Date().toISOString(),
      durationMs: result.durationMs,
    });

    await auditLog(
      'encode_completed',
      'encode_job',
      job.id,
      `Encoded successfully: ${formatBytes(validation.inputSize)} → ${formatBytes(validation.outputSize)} (${savingsPercent}% reduction)`,
    );

    // Trigger Plex library refresh
    try {
      await plexClient.refreshAll();
    } catch (err) {
      console.warn(
        `[EncodeWorker] Failed to refresh Plex: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    eventBus.emitEncodeComplete(job.id, 'completed');
    console.log(
      `[EncodeWorker] Job ${job.id} completed — ${savingsPercent}% size reduction`,
    );
  } catch (err) {
    console.error(
      `[EncodeWorker] Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
    );
    if (currentJobId) {
      try {
        await updateJobStatus(currentJobId, 'failed', {
          error: `Unexpected: ${err instanceof Error ? err.message : String(err)}`,
        });
      } catch {
        // Best effort
      }
    }
  } finally {
    currentJobId = null;
    scheduleNextCheck();
  }
}

/**
 * Schedules the next job check after a short delay.
 */
function scheduleNextCheck(): void {
  if (!workerRunning) return;
  workerTimer = setTimeout(() => {
    processNextJob().catch(console.error);
  }, 5_000);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Starts the encode worker background loop.
 *
 * @param deps - Injectable dependencies for job fetching, status updates, and audit logging
 */
export function startEncodeWorker(deps?: {
  fetchNextJob?: FetchNextJobFn;
  updateJobStatus?: UpdateJobStatusFn;
  auditLog?: AuditLogFn;
}): void {
  if (workerRunning) {
    console.warn('[EncodeWorker] Worker is already running');
    return;
  }

  if (deps?.fetchNextJob) fetchNextJob = deps.fetchNextJob;
  if (deps?.updateJobStatus) updateJobStatus = deps.updateJobStatus;
  if (deps?.auditLog) auditLog = deps.auditLog;

  workerRunning = true;
  console.log('[EncodeWorker] Started');

  // Begin the processing loop
  processNextJob().catch(console.error);
}

/**
 * Stops the encode worker background loop.
 */
export function stopEncodeWorker(): void {
  workerRunning = false;
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  console.log('[EncodeWorker] Stopped');
}

/**
 * Returns whether the encode worker is currently running.
 */
export function isEncodeWorkerRunning(): boolean {
  return workerRunning;
}

/**
 * Returns the ID of the currently processing job, if any.
 */
export function getCurrentEncodeJobId(): string | null {
  return currentJobId;
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

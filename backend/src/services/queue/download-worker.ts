/**
 * SchroDrive Media Manager — Download Worker
 *
 * Polls qBittorrent for download progress, updates job records,
 * and triggers post-completion processing (scan, probe, auto-queue encoding).
 *
 * @module services/queue/download-worker
 */

import { qbittorrentClient, type QBitTorrentInfo } from '../integrations/qbittorrent-client';
import { eventBus } from '../events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tracked download entry. */
export interface TrackedDownload {
  hash: string;
  name: string;
  progress: number;
  state: string;
  completed: boolean;
}

/** Callback invoked when a download completes. */
export type OnDownloadCompleteFn = (torrent: QBitTorrentInfo) => Promise<void>;

/** Callback to update download job status in the database. */
export type UpdateDownloadStatusFn = (
  hash: string,
  progress: number,
  state: string,
  details?: Record<string, unknown>,
) => Promise<void>;

// ---------------------------------------------------------------------------
// Worker State
// ---------------------------------------------------------------------------

let workerRunning = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollIntervalMs = 10_000; // Default: 10 seconds
const completedHashes = new Set<string>();

/** Injected dependencies. */
let onDownloadComplete: OnDownloadCompleteFn = async () => {};
let updateDownloadStatus: UpdateDownloadStatusFn = async () => {};

// ---------------------------------------------------------------------------
// Poll Logic
// ---------------------------------------------------------------------------

let consecutiveErrors = 0;
const MAX_BACKOFF_MS = 300_000; // 5 minutes max between retries

/**
 * Polls qBittorrent for current torrent status and processes updates.
 */
async function pollDownloads(): Promise<void> {
  try {
    const torrents = await qbittorrentClient.getTorrents();

    // Reset backoff on success
    if (consecutiveErrors > 0) {
      console.log('[DownloadWorker] Connection restored — resuming normal polling');
      consecutiveErrors = 0;
      restartPollTimer(pollIntervalMs);
    }

    for (const torrent of torrents) {
      const progressPercent = Math.round(torrent.progress * 100);

      // Emit progress for active downloads
      if (torrent.progress < 1) {
        eventBus.emitDownloadProgress(torrent.hash, progressPercent);
        await updateDownloadStatus(torrent.hash, progressPercent, torrent.state);
      }

      // Handle newly completed downloads
      if (torrent.progress >= 1 && !completedHashes.has(torrent.hash)) {
        completedHashes.add(torrent.hash);

        console.log(`[DownloadWorker] Download complete: ${torrent.name}`);

        await updateDownloadStatus(torrent.hash, 100, 'completed', {
          completedAt: new Date().toISOString(),
          savePath: torrent.savePath,
        });

        eventBus.emitDownloadComplete(torrent.hash, 'completed');
        eventBus.emitJobComplete('download', torrent.hash, 'completed');

        // Trigger post-completion processing
        try {
          await onDownloadComplete(torrent);
        } catch (err) {
          console.error(
            `[DownloadWorker] Post-completion processing failed for ${torrent.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  } catch (err) {
    consecutiveErrors++;
    const errMsg = err instanceof Error ? err.message : String(err);
    const isAuthError = errMsg.includes('invalid credentials') || errMsg.includes('login failed');

    if (isAuthError) {
      // Exponential backoff for auth failures — don't spam logs
      const backoffMs = Math.min(pollIntervalMs * Math.pow(2, consecutiveErrors), MAX_BACKOFF_MS);
      if (consecutiveErrors === 1 || consecutiveErrors % 10 === 0) {
        console.warn(
          `[DownloadWorker] qBittorrent auth failed (attempt ${consecutiveErrors}) — backing off to ${Math.round(backoffMs / 1000)}s`,
        );
      }
      restartPollTimer(backoffMs);
    } else if (consecutiveErrors <= 3) {
      // Only log non-auth errors a few times
      console.error(`[DownloadWorker] Poll error: ${errMsg}`);
    }
  }
}

/** Restarts the poll timer with a new interval. */
function restartPollTimer(intervalMs: number): void {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(() => {
    pollDownloads().catch(console.error);
  }, intervalMs);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Starts the download worker that polls qBittorrent at a configurable interval.
 *
 * @param deps - Injectable dependencies for completion handling and status updates
 * @param intervalMs - Poll interval in milliseconds (default: 10000)
 */
export function startDownloadWorker(
  deps?: {
    onDownloadComplete?: OnDownloadCompleteFn;
    updateDownloadStatus?: UpdateDownloadStatusFn;
  },
  intervalMs?: number,
): void {
  if (workerRunning) {
    console.warn('[DownloadWorker] Worker is already running');
    return;
  }

  if (deps?.onDownloadComplete) onDownloadComplete = deps.onDownloadComplete;
  if (deps?.updateDownloadStatus) updateDownloadStatus = deps.updateDownloadStatus;
  if (intervalMs) pollIntervalMs = intervalMs;

  workerRunning = true;

  console.log(
    `[DownloadWorker] Started (polling every ${pollIntervalMs / 1000}s)`,
  );

  // Initial poll
  pollDownloads().catch(console.error);

  // Schedule recurring polls
  pollTimer = setInterval(() => {
    pollDownloads().catch(console.error);
  }, pollIntervalMs);
}

/**
 * Stops the download worker.
 */
export function stopDownloadWorker(): void {
  workerRunning = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  console.log('[DownloadWorker] Stopped');
}

/**
 * Returns whether the download worker is currently running.
 */
export function isDownloadWorkerRunning(): boolean {
  return workerRunning;
}

/**
 * Clears the completed hashes tracker (useful for testing).
 */
export function resetCompletedTracker(): void {
  completedHashes.clear();
}

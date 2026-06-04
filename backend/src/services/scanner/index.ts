/**
 * SchroDrive Media Manager — Scanner Orchestrator
 *
 * Coordinates all three scanners (local, RealDebrid, TorBox),
 * reconciles discovered files with the database, and triggers
 * background metadata enrichment for new items.
 *
 * Memory-optimised: each scanner's file array is released
 * immediately after reconciliation — no concurrent retention
 * of all three arrays.
 *
 * @module services/scanner
 */

import { scanLocal } from './local-scanner';
import { scanRealDebrid } from './rd-scanner';
import { scanTorBox } from './torbox-scanner';
import { reconcileFiles } from '../reconciler';
import { enrichMetadata } from '../metadata';
import { eventBus } from '../events';
import { createLogger } from '../../utils/logger';
import type { ScanResult } from './types';

const log = createLogger('scanner');

// ---------------------------------------------------------------------------
// Scan Lock
// ---------------------------------------------------------------------------

/** Whether a scan is currently in progress. */
let scanInProgress = false;

/** Handle for the periodic scan interval. */
let periodicScanTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs all three scanners sequentially (local → RealDebrid → TorBox),
 * then reconciles discovered files with the database and triggers
 * background metadata enrichment for newly discovered items.
 *
 * Memory-optimised: file arrays are dereferenced immediately after
 * reconciliation so GC can reclaim them before the next scanner runs.
 *
 * Uses a lock to prevent overlapping scans.
 *
 * @returns Array of scan results from each scanner
 */
export async function scanAll(): Promise<ScanResult[]> {
  if (scanInProgress) {
    log.warn('Scan already in progress — skipping');
    return [];
  }

  scanInProgress = true;
  const results: ScanResult[] = [];
  let totalNewItems = 0;

  try {
    log.info('Starting full scan of all sources...');

    // 1. Local scan → reconcile → release files
    {
      const localScan = await scanLocal();
      results.push(localScan.result);
      eventBus.emitScanComplete('local', localScan.result.filesFound);

      if (localScan.files.length > 0) {
        const localReconcile = await reconcileFiles(localScan.files, 'local');
        log.info(`Local reconcile: ${localReconcile.newItems} new, ${localReconcile.updatedItems} updated`);
        localScan.result.filesNew = localReconcile.newItems;
        localScan.result.filesUpdated = localReconcile.updatedItems;
        totalNewItems += localReconcile.newItems;
      }
      // localScan goes out of scope here — files array eligible for GC
    }

    // Yield to event loop + give GC a chance
    await new Promise(resolve => setTimeout(resolve, 50));

    // 2. RealDebrid scan → reconcile → release files
    {
      const rdScan = await scanRealDebrid();
      results.push(rdScan.result);
      eventBus.emitScanComplete('realdebrid', rdScan.result.filesFound);

      if (rdScan.files.length > 0) {
        const rdReconcile = await reconcileFiles(rdScan.files, 'realdebrid');
        log.info(`RealDebrid reconcile: ${rdReconcile.newItems} new, ${rdReconcile.updatedItems} updated`);
        rdScan.result.filesNew = rdReconcile.newItems;
        rdScan.result.filesUpdated = rdReconcile.updatedItems;
        totalNewItems += rdReconcile.newItems;
      }
      // rdScan goes out of scope here — files array eligible for GC
    }

    await new Promise(resolve => setTimeout(resolve, 50));

    // 3. TorBox scan → reconcile → release files
    {
      const torboxScan = await scanTorBox();
      results.push(torboxScan.result);
      eventBus.emitScanComplete('torbox', torboxScan.result.filesFound);

      if (torboxScan.files.length > 0) {
        const torboxReconcile = await reconcileFiles(torboxScan.files, 'torbox');
        log.info(`TorBox reconcile: ${torboxReconcile.newItems} new, ${torboxReconcile.updatedItems} updated`);
        torboxScan.result.filesNew = torboxReconcile.newItems;
        torboxScan.result.filesUpdated = torboxReconcile.updatedItems;
        totalNewItems += torboxReconcile.newItems;
      }
      // torboxScan goes out of scope here — files array eligible for GC
    }

    const totalFiles = results.reduce((sum, r) => sum + r.filesFound, 0);
    const totalNew = results.reduce((sum, r) => sum + r.filesNew, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
    log.info(
      `Full scan complete: ${totalFiles} files found (${totalNew} new) across ${results.length} sources in ${totalDuration}ms`,
    );

    // 4. Background metadata enrichment for new items (deferred, non-blocking)
    if (totalNewItems > 0) {
      log.info(`Scheduling background metadata enrichment for ${totalNewItems} new item(s) (5s delay)...`);
      setTimeout(async () => {
        try {
          const enrichResult = await enrichMetadata();
          log.info('Background enrichment complete', { ...enrichResult });
        } catch (err) {
          log.error('Background enrichment failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }, 5000);
    }
  } catch (err) {
    log.error('Error during full scan', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    scanInProgress = false;
  }

  return results;
}

/**
 * Starts a periodic scan that runs all scanners at the specified interval.
 *
 * Only one periodic scan can be active at a time. Calling this again
 * will stop the previous interval first.
 *
 * @param intervalMinutes - Number of minutes between scans (default: 15)
 */
export function startPeriodicScan(intervalMinutes: number = 15): void {
  // Stop any existing periodic scan
  stopPeriodicScan();

  const intervalMs = intervalMinutes * 60 * 1000;

  log.info(`Starting periodic scan every ${intervalMinutes} minutes (initial scan in 30s)`);

  // Delay the initial scan so the HTTP server is responsive immediately.
  // Without this delay, the scanner recursively walks FUSE mounts at
  // startup, blocking the event loop and starving all API handlers.
  setTimeout(() => {
    scanAll().catch((err) => {
      log.error('Initial periodic scan failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, 30_000);

  // Then schedule recurring scans
  periodicScanTimer = setInterval(() => {
    scanAll().catch((err) => {
      log.error('Periodic scan failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, intervalMs);
}

/**
 * Stops the periodic scan interval if one is running.
 */
export function stopPeriodicScan(): void {
  if (periodicScanTimer) {
    clearInterval(periodicScanTimer);
    periodicScanTimer = null;
    log.info('Periodic scan stopped');
  }
}

/**
 * Returns whether a scan is currently in progress.
 *
 * @returns True if a scan is running
 */
export function isScanRunning(): boolean {
  return scanInProgress;
}

// Re-export individual scanners and types
export { scanLocal } from './local-scanner';
export { scanRealDebrid } from './rd-scanner';
export { scanTorBox } from './torbox-scanner';
export type { ScanResult } from './types';
export type { DiscoveredFile } from './local-scanner';
export type { RDDiscoveredFile } from './rd-scanner';
export type { TorBoxDiscoveredFile } from './torbox-scanner';

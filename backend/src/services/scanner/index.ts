/**
 * SchroDrive Media Manager — Scanner Orchestrator
 *
 * Coordinates all three scanners (local, RealDebrid, TorBox),
 * reconciles discovered files with the database, and triggers
 * background metadata enrichment for new items.
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
 * Uses a lock to prevent overlapping scans. If a scan is already in
 * progress, logs a warning and returns empty results.
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
  const allNewMediaItemIds: string[] = [];

  try {
    log.info('Starting full scan of all sources...');

    // 1. Local scan → reconcile
    const localScan = await scanLocal();
    results.push(localScan.result);
    eventBus.emitScanComplete('local', localScan.result.filesFound);

    if (localScan.files.length > 0) {
      const localReconcile = await reconcileFiles(localScan.files, 'local');
      log.info(`Local reconcile: ${localReconcile.newItems} new, ${localReconcile.updatedItems} updated`);
      localScan.result.filesNew = localReconcile.newItems;
      localScan.result.filesUpdated = localReconcile.updatedItems;

      // Collect new source IDs to look up their media_item IDs for enrichment
      if (localReconcile.newSourceIds.length > 0) {
        allNewMediaItemIds.push(...localReconcile.newSourceIds);
      }
    }

    // 2. RealDebrid scan → reconcile (read-only, do_not_process)
    const rdScan = await scanRealDebrid();
    results.push(rdScan.result);
    eventBus.emitScanComplete('realdebrid', rdScan.result.filesFound);

    if (rdScan.files.length > 0) {
      const rdReconcile = await reconcileFiles(rdScan.files, 'realdebrid');
      log.info(`RealDebrid reconcile: ${rdReconcile.newItems} new, ${rdReconcile.updatedItems} updated`);
      rdScan.result.filesNew = rdReconcile.newItems;
      rdScan.result.filesUpdated = rdReconcile.updatedItems;

      if (rdReconcile.newSourceIds.length > 0) {
        allNewMediaItemIds.push(...rdReconcile.newSourceIds);
      }
    }

    // 3. TorBox scan → reconcile (read-only, do_not_process)
    const torboxScan = await scanTorBox();
    results.push(torboxScan.result);
    eventBus.emitScanComplete('torbox', torboxScan.result.filesFound);

    if (torboxScan.files.length > 0) {
      const torboxReconcile = await reconcileFiles(torboxScan.files, 'torbox');
      log.info(`TorBox reconcile: ${torboxReconcile.newItems} new, ${torboxReconcile.updatedItems} updated`);
      torboxScan.result.filesNew = torboxReconcile.newItems;
      torboxScan.result.filesUpdated = torboxReconcile.updatedItems;

      if (torboxReconcile.newSourceIds.length > 0) {
        allNewMediaItemIds.push(...torboxReconcile.newSourceIds);
      }
    }

    const totalFiles = results.reduce((sum, r) => sum + r.filesFound, 0);
    const totalNew = results.reduce((sum, r) => sum + r.filesNew, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
    log.info(
      `Full scan complete: ${totalFiles} files found (${totalNew} new) across ${results.length} sources in ${totalDuration}ms`,
    );

    // 4. Background metadata enrichment for new items (non-blocking)
    if (allNewMediaItemIds.length > 0) {
      log.info(`Triggering background metadata enrichment for ${allNewMediaItemIds.length} new source(s)...`);
      enrichMetadata(allNewMediaItemIds).catch((err) => {
        log.error('Background metadata enrichment failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
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

  log.info(`Starting periodic scan every ${intervalMinutes} minutes`);

  // Run an initial scan immediately
  scanAll().catch((err) => {
    log.error('Initial periodic scan failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

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

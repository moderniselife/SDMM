/**
 * SchroDrive Media Manager — Scanner Orchestrator
 *
 * Coordinates all three scanners (local, RealDebrid, TorBox) and
 * provides scan-all and periodic-scan functionality with a lock
 * to prevent overlapping scans.
 *
 * @module services/scanner
 */

import { scanLocal } from './local-scanner';
import { scanRealDebrid } from './rd-scanner';
import { scanTorBox } from './torbox-scanner';
import { eventBus } from '../events';
import type { ScanResult } from './types';

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
 * Runs all three scanners sequentially (local → RealDebrid → TorBox).
 *
 * Uses a lock to prevent overlapping scans. If a scan is already in
 * progress, logs a warning and returns empty results.
 *
 * @returns Array of scan results from each scanner
 */
export async function scanAll(): Promise<ScanResult[]> {
  if (scanInProgress) {
    console.warn('[Scanner] Scan already in progress — skipping');
    return [];
  }

  scanInProgress = true;
  const results: ScanResult[] = [];

  try {
    console.log('[Scanner] Starting full scan of all sources...');

    // 1. Local scan
    const localScan = await scanLocal();
    results.push(localScan.result);
    eventBus.emitScanComplete('local', localScan.result.filesFound);

    // 2. RealDebrid scan
    const rdScan = await scanRealDebrid();
    results.push(rdScan.result);
    eventBus.emitScanComplete('realdebrid', rdScan.result.filesFound);

    // 3. TorBox scan
    const torboxScan = await scanTorBox();
    results.push(torboxScan.result);
    eventBus.emitScanComplete('torbox', torboxScan.result.filesFound);

    const totalFiles = results.reduce((sum, r) => sum + r.filesFound, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
    console.log(
      `[Scanner] Full scan complete: ${totalFiles} total files found across ${results.length} sources in ${totalDuration}ms`,
    );
  } catch (err) {
    console.error(
      `[Scanner] Error during full scan: ${err instanceof Error ? err.message : String(err)}`,
    );
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

  console.log(
    `[Scanner] Starting periodic scan every ${intervalMinutes} minutes`,
  );

  // Run an initial scan immediately
  scanAll().catch((err) => {
    console.error(
      `[Scanner] Initial periodic scan failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  // Then schedule recurring scans
  periodicScanTimer = setInterval(() => {
    scanAll().catch((err) => {
      console.error(
        `[Scanner] Periodic scan failed: ${err instanceof Error ? err.message : String(err)}`,
      );
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
    console.log('[Scanner] Periodic scan stopped');
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

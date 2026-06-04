/**
 * SchroDrive Media Manager — TorBox Scanner
 *
 * Scans /cloud/torbox (read-only FUSE mount) and indexes files
 * with source_type='torbox'. Handles mount unavailability gracefully.
 * NEVER triggers encoding or any file modification.
 *
 * Uses iterative (queue-based) directory walking to avoid deep recursion
 * on FUSE mounts — same optimisation as the RealDebrid scanner.
 *
 * @module services/scanner/torbox-scanner
 */

import { readdir, access, constants } from 'node:fs/promises';
import path from 'node:path';
import type { SourceType } from '@/types';
import type { ScanResult } from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default TorBox mount path. */
const TORBOX_MOUNT_PATH = '/cloud/torbox';

/** Supported media file extensions. */
const MEDIA_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.avi', '.ts', '.wmv',
  '.m4v', '.mov', '.flv', '.webm', '.mpg', '.mpeg',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A discovered media file on the TorBox mount. */
export interface TorBoxDiscoveredFile {
  filePath: string;
  fileName: string;
  fileSize: number;
  modifiedAt: Date;
  sourceType: SourceType;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Checks if the FUSE mount is accessible.
 */
async function isMountAvailable(mountPath: string): Promise<boolean> {
  try {
    await access(mountPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if a file extension is a supported media format.
 */
function isMediaFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return MEDIA_EXTENSIONS.has(ext);
}

/**
 * Iteratively walks the TorBox mount directory using a queue.
 * Same memory-optimised approach as the RealDebrid scanner.
 */
async function walkDirectoryIterative(
  rootPath: string,
  results: TorBoxDiscoveredFile[],
): Promise<void> {
  const queue: string[] = [rootPath];
  const now = new Date();

  while (queue.length > 0) {
    const dirPath = queue.shift()!;

    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile() && isMediaFile(entry.name)) {
        results.push({
          filePath: fullPath,
          fileName: entry.name,
          fileSize: 0,
          modifiedAt: now,
          sourceType: 'torbox',
        });
      }
    }

    if (queue.length % 100 === 0 && queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scans the TorBox cloud mount for media files.
 *
 * @param mountPath - Override the default mount path (for testing)
 * @returns Object with discovered files and scan result summary
 */
export async function scanTorBox(
  mountPath: string = TORBOX_MOUNT_PATH,
): Promise<{ files: TorBoxDiscoveredFile[]; result: ScanResult }> {
  const startTime = Date.now();

  const available = await isMountAvailable(mountPath);
  if (!available) {
    console.warn(
      `[TorBoxScanner] TorBox mount at "${mountPath}" is not available — skipping scan`,
    );
    return {
      files: [],
      result: {
        sourceType: 'torbox',
        filesFound: 0,
        filesNew: 0,
        filesUpdated: 0,
        errors: [`Mount not available: ${mountPath}`],
        durationMs: Date.now() - startTime,
      },
    };
  }

  const files: TorBoxDiscoveredFile[] = [];
  const errors: string[] = [];

  try {
    await walkDirectoryIterative(mountPath, files);
  } catch (err) {
    const msg = `Failed to scan "${mountPath}": ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[TorBoxScanner] ${msg}`);
    errors.push(msg);
  }

  const durationMs = Date.now() - startTime;

  console.log(
    `[TorBoxScanner] Scan complete: ${files.length} media files found in ${durationMs}ms`,
  );

  return {
    files,
    result: {
      sourceType: 'torbox',
      filesFound: files.length,
      filesNew: 0,
      filesUpdated: 0,
      errors,
      durationMs,
    },
  };
}

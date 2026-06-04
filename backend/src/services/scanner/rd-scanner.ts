/**
 * SchroDrive Media Manager — RealDebrid Scanner
 *
 * Scans /cloud/realdebrid (read-only FUSE mount) and indexes files
 * with source_type='realdebrid'. Handles mount unavailability gracefully.
 * NEVER triggers encoding or any file modification.
 *
 * Uses iterative (queue-based) directory walking to avoid deep recursion
 * on FUSE mounts with thousands of directories — recursive approach kept
 * every parent's Dirent array alive on the stack, causing multi-GB memory
 * usage with 30K+ files.
 *
 * @module services/scanner/rd-scanner
 */

import { readdir, access, constants } from 'node:fs/promises';
import path from 'node:path';
import type { SourceType } from '@/types';
import type { ScanResult } from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default RealDebrid mount path. */
const RD_MOUNT_PATH = '/cloud/realdebrid';

/** Supported media file extensions. */
const MEDIA_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.avi', '.ts', '.wmv',
  '.m4v', '.mov', '.flv', '.webm', '.mpg', '.mpeg',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A discovered media file on the RealDebrid mount. */
export interface RDDiscoveredFile {
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
 * Iteratively walks the RealDebrid mount directory using a queue.
 *
 * Previous recursive approach kept every parent directory's Dirent array
 * alive on the call stack until the deepest child returned — with thousands
 * of directories, this caused multi-GB memory usage.
 *
 * Queue-based approach: only one directory's entries are in memory at a time.
 * After processing, the entries array is eligible for GC immediately.
 */
async function walkDirectoryIterative(
  rootPath: string,
  results: RDDiscoveredFile[],
): Promise<void> {
  const queue: string[] = [rootPath];
  // Shared timestamp — avoids creating 30K+ Date objects
  const now = new Date();

  while (queue.length > 0) {
    const dirPath = queue.shift()!;

    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      // Skip directories we can't read (permissions, stale FUSE handles)
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
          fileSize: 0, // Unknown without stat — acceptable for cloud indexing
          modifiedAt: now,
          sourceType: 'realdebrid',
        });
      }
      // Skip symlinks entirely — they can create cycles on FUSE mounts
    }

    // entries goes out of scope here — eligible for GC

    // Yield to event loop every 100 directories to prevent starvation
    if (queue.length % 100 === 0 && queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scans the RealDebrid cloud mount for media files.
 *
 * Handles FUSE mount unavailability gracefully — logs a warning and
 * returns an empty result rather than throwing.
 *
 * IMPORTANT: This scanner NEVER triggers encoding or file modification.
 * Files are indexed read-only.
 *
 * @param mountPath - Override the default mount path (for testing)
 * @returns Object with discovered files and scan result summary
 */
export async function scanRealDebrid(
  mountPath: string = RD_MOUNT_PATH,
): Promise<{ files: RDDiscoveredFile[]; result: ScanResult }> {
  const startTime = Date.now();

  // Check if the FUSE mount is accessible
  const available = await isMountAvailable(mountPath);
  if (!available) {
    console.warn(
      `[RDScanner] RealDebrid mount at "${mountPath}" is not available — skipping scan`,
    );
    return {
      files: [],
      result: {
        sourceType: 'realdebrid',
        filesFound: 0,
        filesNew: 0,
        filesUpdated: 0,
        errors: [`Mount not available: ${mountPath}`],
        durationMs: Date.now() - startTime,
      },
    };
  }

  const files: RDDiscoveredFile[] = [];
  const errors: string[] = [];

  try {
    await walkDirectoryIterative(mountPath, files);
  } catch (err) {
    const msg = `Failed to scan "${mountPath}": ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[RDScanner] ${msg}`);
    errors.push(msg);
  }

  const durationMs = Date.now() - startTime;

  console.log(
    `[RDScanner] Scan complete: ${files.length} media files found in ${durationMs}ms`,
  );

  return {
    files,
    result: {
      sourceType: 'realdebrid',
      filesFound: files.length,
      filesNew: 0,
      filesUpdated: 0,
      errors,
      durationMs,
    },
  };
}

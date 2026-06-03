/**
 * SchroDrive Media Manager — RealDebrid Scanner
 *
 * Scans /cloud/realdebrid (read-only FUSE mount) and indexes files
 * with source_type='realdebrid'. Handles mount unavailability gracefully.
 * NEVER triggers encoding or any file modification.
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
 * Recursively walks the RealDebrid mount directory.
 *
 * Uses readdir({ withFileTypes: true }) to avoid stat() calls on FUSE
 * mounts — stat() blocks the event loop for ages on cloud filesystems.
 */
async function walkDirectory(
  dirPath: string,
  results: RDDiscoveredFile[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    console.warn(
      `[RDScanner] Unable to read directory "${dirPath}": ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    // Use Dirent type info — no stat() needed for FUSE mounts
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      // For symlinks, assume directory (common on FUSE mounts)
      // Only recurse if it looks like a directory (no media extension)
      if (entry.isDirectory() || !isMediaFile(entry.name)) {
        await walkDirectory(fullPath, results);
      }
    } else if (entry.isFile() && isMediaFile(entry.name)) {
      // Can't know the file size without stat, but we still index it.
      // Size will be 0 — the reconciler doesn't filter by size.
      results.push({
        filePath: fullPath,
        fileName: entry.name,
        fileSize: 0, // Unknown without stat — acceptable for cloud indexing
        modifiedAt: new Date(),
        sourceType: 'realdebrid',
      });
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
    await walkDirectory(mountPath, files);
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

/**
 * SchroDrive Media Manager — TorBox Scanner
 *
 * Scans /cloud/torbox (read-only FUSE mount) and indexes files
 * with source_type='torbox'. Handles mount unavailability gracefully.
 * NEVER triggers encoding or any file modification.
 *
 * @module services/scanner/torbox-scanner
 */

import { readdir, stat, access, constants } from 'node:fs/promises';
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

/** Minimum file size in bytes (100 MiB). */
const MIN_FILE_SIZE = 104_857_600;

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
 * Recursively walks the TorBox mount directory.
 */
async function walkDirectory(
  dirPath: string,
  results: TorBoxDiscoveredFile[],
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch (err) {
    console.warn(
      `[TorBoxScanner] Unable to read directory "${dirPath}": ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);

    let fileStat;
    try {
      fileStat = await stat(fullPath);
    } catch {
      // FUSE mounts can be flaky — skip inaccessible entries
      continue;
    }

    if (fileStat.isDirectory()) {
      await walkDirectory(fullPath, results);
    } else if (fileStat.isFile() && isMediaFile(entry) && fileStat.size >= MIN_FILE_SIZE) {
      results.push({
        filePath: fullPath,
        fileName: entry,
        fileSize: fileStat.size,
        modifiedAt: fileStat.mtime,
        sourceType: 'torbox',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scans the TorBox cloud mount for media files.
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
export async function scanTorBox(
  mountPath: string = TORBOX_MOUNT_PATH,
): Promise<{ files: TorBoxDiscoveredFile[]; result: ScanResult }> {
  const startTime = Date.now();

  // Check if the FUSE mount is accessible
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
    await walkDirectory(mountPath, files);
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

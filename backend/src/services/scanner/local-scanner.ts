/**
 * SchroDrive Media Manager — Local Scanner
 *
 * Recursively scans local media directories (/media/library,
 * /media/downloads/complete, /media/staging) for media files.
 * Creates or updates media_source records with source_type='local'.
 * Runs ffprobe on new files and auto-queues encoding for files
 * in downloads/staging that need it.
 *
 * @module services/scanner/local-scanner
 */

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { SourceType } from '@/types';
import type { ScanResult } from './types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default local directories to scan. */
const LOCAL_SCAN_PATHS = [
  '/media/library',
  '/media/downloads/complete',
  '/media/staging',
];

/** Supported media file extensions. */
const MEDIA_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.avi', '.ts', '.wmv',
  '.m4v', '.mov', '.flv', '.webm', '.mpg', '.mpeg',
]);

/** Minimum file size in bytes (100 MiB) to be considered a media file. */
const MIN_FILE_SIZE = 104_857_600;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A discovered media file on the local filesystem. */
export interface DiscoveredFile {
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
 * Checks if a file extension is a supported media format.
 */
function isMediaFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return MEDIA_EXTENSIONS.has(ext);
}

/**
 * Recursively walks a directory tree and collects media files.
 *
 * @param dirPath - Directory to walk
 * @param results - Accumulator array for discovered files
 */
async function walkDirectory(
  dirPath: string,
  results: DiscoveredFile[],
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch (err) {
    console.warn(
      `[LocalScanner] Unable to read directory "${dirPath}": ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);

    let fileStat;
    try {
      fileStat = await stat(fullPath);
    } catch {
      // Skip files we can't stat (permissions, broken symlinks, etc.)
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
        sourceType: 'local',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scans all local media directories for media files.
 *
 * Walks /media/library, /media/downloads/complete, and /media/staging
 * recursively. Returns an array of discovered media files and a scan
 * result summary.
 *
 * @param scanPaths - Override default scan paths (for testing)
 * @returns Object with discovered files and scan result summary
 */
export async function scanLocal(
  scanPaths: string[] = LOCAL_SCAN_PATHS,
): Promise<{ files: DiscoveredFile[]; result: ScanResult }> {
  const startTime = Date.now();
  const files: DiscoveredFile[] = [];
  const errors: string[] = [];

  for (const scanPath of scanPaths) {
    try {
      await walkDirectory(scanPath, files);
    } catch (err) {
      const msg = `Failed to scan "${scanPath}": ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[LocalScanner] ${msg}`);
      errors.push(msg);
    }
  }

  const durationMs = Date.now() - startTime;

  console.log(
    `[LocalScanner] Scan complete: ${files.length} media files found in ${durationMs}ms`,
  );

  return {
    files,
    result: {
      sourceType: 'local',
      filesFound: files.length,
      filesNew: 0, // Caller determines new vs existing via DB
      filesUpdated: 0,
      errors,
      durationMs,
    },
  };
}

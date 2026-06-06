/**
 * SchroDrive Media Manager — File Utilities
 *
 * Filesystem helper functions for media file discovery,
 * safe file operations, and path classification.
 *
 * @module utils/file-utils
 */

import { readdir, stat, mkdir, copyFile, rename } from 'fs/promises';
import { join, extname } from 'path';
import { createLogger } from './logger';

const log = createLogger('file-utils');

/** Default set of media file extensions to match. */
const MEDIA_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.avi', '.ts', '.wmv',
  '.m4v', '.mov', '.flv', '.webm', '.mpg', '.mpeg',
]);

/**
 * Recursively walks a directory and returns all files matching
 * the configured media extensions.
 *
 * @param dir - Absolute path to the directory to scan.
 * @param extensions - Optional custom set of extensions to match.
 * @returns Array of absolute file paths for matching media files.
 */
export async function getMediaFiles(
  dir: string,
  extensions: Set<string> = MEDIA_EXTENSIONS
): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        const nested = await getMediaFiles(fullPath, extensions);
        results.push(...nested);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (extensions.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  } catch (err) {
    log.warn(`Failed to read directory: ${dir}`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return results;
}

/**
 * Formats a byte count into a human-readable string.
 *
 * @param bytes - The number of bytes.
 * @returns Formatted string (e.g. "1.42 GiB").
 */
export function humanFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const exponent = Math.min(
    Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, exponent);
  const unit = units[exponent]!;

  return `${value.toFixed(exponent > 0 ? 2 : 0)} ${unit}`;
}

/**
 * Performs an atomic rename of a file. Falls back to copy-and-delete
 * if the rename crosses filesystem boundaries.
 *
 * @param from - Source file path.
 * @param to - Destination file path.
 */
export async function safeRename(from: string, to: string): Promise<void> {
  try {
    await ensureDir(join(to, '..'));
    await rename(from, to);
    log.debug(`Renamed ${from} → ${to}`);
  } catch (err) {
    // EXDEV = cross-device link; fall back to copy + delete
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      log.info(`Cross-device rename detected, falling back to copy: ${from} → ${to}`);
      await safeCopy(from, to);
      const { unlink } = await import('fs/promises');
      await unlink(from);
    } else {
      throw err;
    }
  }
}

/**
 * Copies a file with optional progress reporting.
 *
 * @param from - Source file path.
 * @param to - Destination file path.
 * @param onProgress - Optional callback receiving bytes copied so far and total bytes.
 */
export async function safeCopy(
  from: string,
  to: string,
  onProgress?: (copiedBytes: number, totalBytes: number) => void
): Promise<void> {
  await ensureDir(join(to, '..'));

  if (onProgress) {
    // Stream-based copy with progress
    const sourceStats = await stat(from);
    const totalBytes = sourceStats.size;
    const sourceFile = Bun.file(from);
    const reader = sourceFile.stream().getReader();
    const writer = Bun.file(to).writer();
    let copiedBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        writer.write(value);
        copiedBytes += value.byteLength;
        onProgress(copiedBytes, totalBytes);
      }
      await writer.end();
    } catch (err) {
      log.error(`Failed to copy file with progress: ${from} → ${to}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  } else {
    // Simple copy
    await copyFile(from, to);
  }

  log.debug(`Copied ${from} → ${to}`);
}

/**
 * Checks whether a path belongs to a cloud mount (RealDebrid or TorBox).
 * These paths should NEVER be auto-processed.
 *
 * @param path - The file path to check.
 * @returns True if the path is a cloud mount path.
 */
export function isCloudPath(path: string): boolean {
  return (
    path.startsWith('/cloud/') ||
    path.startsWith('/pd_zurg/') ||
    path.includes('/torbox/')
  );
}

/**
 * Ensures a directory exists, creating it and all parent directories
 * if necessary (equivalent to `mkdir -p`).
 *
 * @param dir - Absolute path to the directory.
 */
export async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    // EEXIST is fine — directory already exists
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw err;
    }
  }
}

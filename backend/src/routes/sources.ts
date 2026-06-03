/**
 * SchroDrive Media Manager — Sources Routes
 *
 * Endpoints for browsing media filesystems:
 * local storage, RealDebrid mounts, and TorBox mounts.
 *
 * @module routes/sources
 */

import { Hono } from 'hono';
import { readdir, stat, lstat } from 'fs/promises';
import { join } from 'path';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import type { ApiResponse, FileEntry } from '../types';

const log = createLogger('sources');

export const sourcesRoutes = new Hono();

// =============================================================================
// Shared Browser Helper
// =============================================================================

/**
 * Reads a directory and returns an array of FileEntry objects.
 * Does NOT recurse into subdirectories (single level only).
 *
 * @param basePath - The root path for this source type.
 * @param subPath - Optional subdirectory path relative to basePath.
 * @returns Array of file and directory entries.
 */
async function browseDirectory(
  basePath: string,
  subPath?: string
): Promise<FileEntry[]> {
  const targetPath = subPath ? join(basePath, subPath) : basePath;

  // Security: prevent directory traversal
  if (!targetPath.startsWith(basePath)) {
    throw new Error('Path traversal attempt detected');
  }

  const entries: FileEntry[] = [];

  try {
    const dirEntries = await readdir(targetPath, { withFileTypes: true });

    for (const entry of dirEntries) {
      // Skip hidden files
      if (entry.name.startsWith('.')) continue;

      const fullPath = join(targetPath, entry.name);
      const relativePath = subPath
        ? join(subPath, entry.name)
        : entry.name;

      // Try stat (follows symlinks) first, then lstat (doesn't follow),
      // then fall back to Dirent info. FUSE mounts (pd_zurg, TorBox)
      // often use symlinks or virtual files where stat can timeout/fail.
      let fileSize: number | null = null;
      let modifiedAt: string | null = null;
      let isDir = false;
      let isFile = false;

      try {
        // stat follows symlinks — ideal for FUSE mounts
        const stats = await stat(fullPath);
        isDir = stats.isDirectory();
        isFile = stats.isFile();
        fileSize = isFile ? stats.size : null;
        modifiedAt = stats.mtime.toISOString();
      } catch {
        // stat failed — try lstat (works on the symlink itself)
        try {
          const lstats = await lstat(fullPath);
          isDir = lstats.isDirectory() || lstats.isSymbolicLink();
          isFile = lstats.isFile();
          fileSize = isFile ? lstats.size : null;
          modifiedAt = lstats.mtime.toISOString();
        } catch {
          // Both stat and lstat failed — use Dirent info as last resort
          // On FUSE mounts, Dirent.isDirectory() may return false for
          // symlinked directories, so treat unknown entries as directories
          // if they have no file extension
          const hasExtension = entry.name.includes('.');
          isDir = entry.isDirectory() || entry.isSymbolicLink() || !hasExtension;
          isFile = entry.isFile() || (hasExtension && !isDir);
          log.debug(`stat/lstat failed for ${fullPath}, using Dirent fallback (isDir=${isDir})`);
        }
      }

      entries.push({
        name: entry.name,
        path: relativePath,
        isDirectory: isDir,
        size: fileSize,
        modifiedAt,
      });
    }

    // Sort: directories first, then alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    log.warn(`Failed to browse directory: ${targetPath}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  return entries;
}

// =============================================================================
// GET /api/sources/local
// =============================================================================

/**
 * GET /api/sources/local
 *
 * Browse the local media library filesystem.
 * Query param: `path` — optional subdirectory to browse.
 */
sourcesRoutes.get('/sources/local', async (c) => {
  try {
    const subPath = c.req.query('path');
    const basePath = config.paths.library;
    const entries = await browseDirectory(basePath, subPath);

    return c.json<ApiResponse<FileEntry[]>>({
      success: true,
      data: entries,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (errorMsg.includes('traversal')) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: 'Invalid path',
        timestamp: new Date().toISOString(),
      }, 400);
    }

    return c.json<ApiResponse<never>>({
      success: false,
      error: `Failed to browse local sources: ${errorMsg}`,
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// GET /api/sources/realdebrid
// =============================================================================

/**
 * GET /api/sources/realdebrid
 *
 * Browse the RealDebrid cloud mount (read-only listing).
 * Query param: `path` — optional subdirectory to browse.
 */
sourcesRoutes.get('/sources/realdebrid', async (c) => {
  try {
    const subPath = c.req.query('path');
    const basePath = config.paths.cloudRealDebrid;
    const entries = await browseDirectory(basePath, subPath);

    return c.json<ApiResponse<FileEntry[]>>({
      success: true,
      data: entries,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (errorMsg.includes('traversal')) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: 'Invalid path',
        timestamp: new Date().toISOString(),
      }, 400);
    }

    return c.json<ApiResponse<never>>({
      success: false,
      error: `Failed to browse RealDebrid sources: ${errorMsg}`,
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// GET /api/sources/torbox
// =============================================================================

/**
 * GET /api/sources/torbox
 *
 * Browse the TorBox cloud mount (read-only listing).
 * Query param: `path` — optional subdirectory to browse.
 */
sourcesRoutes.get('/sources/torbox', async (c) => {
  try {
    const subPath = c.req.query('path');
    const basePath = config.paths.cloudTorBox;
    const entries = await browseDirectory(basePath, subPath);

    return c.json<ApiResponse<FileEntry[]>>({
      success: true,
      data: entries,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (errorMsg.includes('traversal')) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: 'Invalid path',
        timestamp: new Date().toISOString(),
      }, 400);
    }

    return c.json<ApiResponse<never>>({
      success: false,
      error: `Failed to browse TorBox sources: ${errorMsg}`,
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

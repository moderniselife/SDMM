/**
 * SchroDrive Media Manager — Sources Routes
 *
 * Endpoints for browsing media filesystems:
 * local storage, RealDebrid mounts, and TorBox mounts.
 *
 * @module routes/sources
 */

import { Hono } from 'hono';
import { readdir, stat } from 'fs/promises';
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

      try {
        const stats = await stat(fullPath);

        entries.push({
          name: entry.name,
          path: relativePath,
          isDirectory: entry.isDirectory(),
          size: entry.isFile() ? stats.size : null,
          modifiedAt: stats.mtime.toISOString(),
        });
      } catch {
        // Skip files we can't stat (permission issues, broken symlinks)
        log.debug(`Skipping unreadable entry: ${fullPath}`);
      }
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

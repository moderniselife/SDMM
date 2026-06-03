/**
 * SchroDrive Media Manager — Sources Routes
 *
 * Endpoints for browsing media filesystems:
 * local storage, RealDebrid mounts, and TorBox mounts.
 *
 * Cloud sources use SSE streaming to avoid timeouts on FUSE mounts
 * where stat() calls are extremely slow (each one triggers a network
 * round-trip to the cloud provider).
 *
 * @module routes/sources
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { readdir, stat, lstat, opendir } from 'fs/promises';
import { join } from 'path';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import type { ApiResponse, FileEntry } from '../types';

const log = createLogger('sources');

export const sourcesRoutes = new Hono();

// =============================================================================
// Path Resolution Helper
// =============================================================================

/**
 * Resolves and validates a sub-path against a base path, preventing
 * directory traversal attacks.
 *
 * @param basePath - The root path for this source type
 * @param subPath - Optional subdirectory relative to basePath
 * @returns The resolved absolute target path
 * @throws If the resolved path escapes the basePath
 */
function resolveAndValidatePath(basePath: string, subPath?: string): string {
  const targetPath = subPath ? join(basePath, subPath) : basePath;

  // Security: prevent directory traversal
  if (!targetPath.startsWith(basePath)) {
    throw new Error('Path traversal attempt detected');
  }

  return targetPath;
}

// =============================================================================
// Local Browse Helper (with stat — fast on local disk)
// =============================================================================

/**
 * Reads a local directory and returns an array of FileEntry objects.
 * Uses stat() for accurate file sizes and timestamps since local disk
 * stat calls are fast (~1ms each).
 *
 * @param basePath - The root path for local storage
 * @param subPath - Optional subdirectory path relative to basePath
 * @returns Array of file and directory entries
 */
async function browseLocalDirectory(
  basePath: string,
  subPath?: string
): Promise<FileEntry[]> {
  const targetPath = resolveAndValidatePath(basePath, subPath);
  const entries: FileEntry[] = [];

  const dirEntries = await readdir(targetPath, { withFileTypes: true });

  for (const entry of dirEntries) {
    if (entry.name.startsWith('.')) continue;

    const fullPath = join(targetPath, entry.name);
    const relativePath = subPath ? join(subPath, entry.name) : entry.name;

    let fileSize: number | null = null;
    let modifiedAt: string | null = null;
    let isDir = entry.isDirectory();

    try {
      const stats = await stat(fullPath);
      isDir = stats.isDirectory();
      fileSize = stats.isFile() ? stats.size : null;
      modifiedAt = stats.mtime.toISOString();
    } catch {
      try {
        const lstats = await lstat(fullPath);
        isDir = lstats.isDirectory() || lstats.isSymbolicLink();
        fileSize = lstats.isFile() ? lstats.size : null;
        modifiedAt = lstats.mtime.toISOString();
      } catch {
        log.debug(`stat/lstat failed for ${fullPath}`);
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
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

// =============================================================================
// GET /api/sources/local — JSON (local disk is fast)
// =============================================================================

/**
 * GET /api/sources/local
 *
 * Browse the local media library filesystem.
 * Uses traditional JSON response since local stat is fast.
 * Query param: `path` — optional subdirectory to browse.
 */
sourcesRoutes.get('/sources/local', async (c) => {
  try {
    const subPath = c.req.query('path');
    const basePath = config.paths.library;
    const entries = await browseLocalDirectory(basePath, subPath);

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
// SSE Streaming Browse — Cloud Sources (FUSE mounts)
// =============================================================================

/**
 * Determines if a directory entry is likely a directory on a FUSE mount.
 *
 * On FUSE mounts (pd_zurg, TorBox), Dirent type information may not be
 * reliable for symlinks. This heuristic uses file extension presence
 * as a fallback indicator.
 */
function inferIsDirectory(entry: { name: string; isDirectory: () => boolean; isSymbolicLink: () => boolean; isFile: () => boolean }): boolean {
  // Trust Dirent if it says directory
  if (entry.isDirectory()) return true;

  // Symlinks on FUSE mounts are often directories
  if (entry.isSymbolicLink()) return true;

  // Heuristic: media files have extensions, directories don't
  // Common media extensions to detect files
  const mediaExtensions = /\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v|ts|mpg|mpeg|iso|img|srt|sub|ass|ssa|txt|nfo|jpg|jpeg|png|gif|bmp)$/i;
  if (mediaExtensions.test(entry.name)) return false;

  // If it has a dot-separated extension and isn't a known media type, still treat as file
  const hasExtension = /\.[a-z0-9]{1,5}$/i.test(entry.name);
  if (hasExtension && !entry.isFile()) return false;
  if (hasExtension && entry.isFile()) return false;

  // No extension — probably a directory (show/movie folder names don't have extensions)
  return !hasExtension;
}

/**
 * GET /api/sources/:sourceType/browse
 *
 * SSE streaming endpoint for cloud source browsing.
 * Streams directory entries one-by-one as they're discovered, avoiding
 * timeouts on large FUSE-mounted directories.
 *
 * NO stat() calls are made — only readdir/opendir, which is near-instant
 * even on FUSE mounts because it's a single syscall.
 *
 * Events:
 * - `entry`: A single file/directory entry (FileEntry JSON)
 * - `done`: Scan complete, includes total count
 * - `error`: An error occurred
 *
 * Query params:
 * - `path` — optional subdirectory to browse
 */
sourcesRoutes.get('/sources/:sourceType/browse', (c) => {
  const sourceType = c.req.param('sourceType');
  const subPath = c.req.query('path');

  // Resolve base path from config
  let basePath: string;
  switch (sourceType) {
    case 'realdebrid':
      basePath = config.paths.cloudRealDebrid;
      break;
    case 'torbox':
      basePath = config.paths.cloudTorBox;
      break;
    case 'local':
      basePath = config.paths.library;
      break;
    default:
      return c.json<ApiResponse<never>>({
        success: false,
        error: `Unknown source type: ${sourceType}`,
        timestamp: new Date().toISOString(),
      }, 400);
  }

  return streamSSE(c, async (stream) => {
    let count = 0;

    try {
      const targetPath = resolveAndValidatePath(basePath, subPath);

      log.info(`SSE browse started: ${sourceType} @ ${subPath ?? '/'}`);

      // Use opendir for streaming iteration — entries are yielded
      // one-by-one without buffering the entire directory
      const dir = await opendir(targetPath);

      for await (const dirent of dir) {
        // Skip hidden files
        if (dirent.name.startsWith('.')) continue;

        const relativePath = subPath
          ? join(subPath, dirent.name)
          : dirent.name;

        const isDir = inferIsDirectory(dirent);

        const entry: FileEntry = {
          name: dirent.name,
          path: relativePath,
          isDirectory: isDir,
          size: null, // No stat — avoid FUSE round-trips
          modifiedAt: null,
        };

        await stream.writeSSE({
          event: 'entry',
          data: JSON.stringify(entry),
          id: String(count),
        });

        count++;
      }

      // Signal completion
      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ total: count }),
        id: 'done',
      });

      log.info(`SSE browse complete: ${sourceType} @ ${subPath ?? '/'} — ${count} entries`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.warn(`SSE browse error: ${sourceType} @ ${subPath ?? '/'}`, { error: errorMsg });

      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({
          error: errorMsg.includes('traversal')
            ? 'Invalid path'
            : `Failed to browse ${sourceType}: ${errorMsg}`,
        }),
        id: 'error',
      });
    }
  });
});

// =============================================================================
// GET /api/sources/realdebrid — Fallback JSON (small directories)
// =============================================================================

/**
 * GET /api/sources/realdebrid
 *
 * JSON fallback for RealDebrid. Skips stat() entirely for cloud sources.
 * For large directories, use /api/sources/realdebrid/browse (SSE) instead.
 */
sourcesRoutes.get('/sources/realdebrid', async (c) => {
  try {
    const subPath = c.req.query('path');
    const basePath = config.paths.cloudRealDebrid;
    const targetPath = resolveAndValidatePath(basePath, subPath);
    const entries: FileEntry[] = [];

    const dirEntries = await readdir(targetPath, { withFileTypes: true });

    for (const entry of dirEntries) {
      if (entry.name.startsWith('.')) continue;
      const relativePath = subPath ? join(subPath, entry.name) : entry.name;

      entries.push({
        name: entry.name,
        path: relativePath,
        isDirectory: inferIsDirectory(entry),
        size: null,
        modifiedAt: null,
      });
    }

    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return c.json<ApiResponse<FileEntry[]>>({
      success: true,
      data: entries,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const status = errorMsg.includes('traversal') ? 400 : 500;

    return c.json<ApiResponse<never>>({
      success: false,
      error: errorMsg.includes('traversal') ? 'Invalid path' : `Failed to browse RealDebrid: ${errorMsg}`,
      timestamp: new Date().toISOString(),
    }, status);
  }
});

// =============================================================================
// GET /api/sources/torbox — Fallback JSON (small directories)
// =============================================================================

/**
 * GET /api/sources/torbox
 *
 * JSON fallback for TorBox. Skips stat() entirely for cloud sources.
 * For large directories, use /api/sources/torbox/browse (SSE) instead.
 */
sourcesRoutes.get('/sources/torbox', async (c) => {
  try {
    const subPath = c.req.query('path');
    const basePath = config.paths.cloudTorBox;
    const targetPath = resolveAndValidatePath(basePath, subPath);
    const entries: FileEntry[] = [];

    const dirEntries = await readdir(targetPath, { withFileTypes: true });

    for (const entry of dirEntries) {
      if (entry.name.startsWith('.')) continue;
      const relativePath = subPath ? join(subPath, entry.name) : entry.name;

      entries.push({
        name: entry.name,
        path: relativePath,
        isDirectory: inferIsDirectory(entry),
        size: null,
        modifiedAt: null,
      });
    }

    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return c.json<ApiResponse<FileEntry[]>>({
      success: true,
      data: entries,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const status = errorMsg.includes('traversal') ? 400 : 500;

    return c.json<ApiResponse<never>>({
      success: false,
      error: errorMsg.includes('traversal') ? 'Invalid path' : `Failed to browse TorBox: ${errorMsg}`,
      timestamp: new Date().toISOString(),
    }, status);
  }
});

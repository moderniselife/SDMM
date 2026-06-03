/**
 * SchroDrive Media Manager — Plex Routes
 *
 * Endpoints for interacting with the Plex Media Server:
 * library refresh, section listing, search, library browsing,
 * item detail with children (seasons/episodes), file resolution,
 * and preservation (copy cloud → local).
 *
 * @module routes/plex
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { logAudit } from '../services/audit';
import { createLogger } from '../utils/logger';
import { db } from '../db/connection';
import { plexClient } from '../services/integrations/plex-client';
import type {
  PlexSection,
  PlexSearchResult,
  PlexSectionItem,
  PlexMediaFile,
} from '../services/integrations/plex-client';
import type { ApiResponse } from '../types';

const log = createLogger('plex');

export const plexRoutes = new Hono();

// =============================================================================
// POST /api/plex/refresh
// =============================================================================

const refreshSchema = z.object({
  sectionId: z.string().optional(),
}).optional();

plexRoutes.post('/plex/refresh', async (c) => {
  try {
    let sectionId: string | undefined;
    try {
      const body = await c.req.json();
      const validation = refreshSchema.safeParse(body);
      if (validation.success && validation.data) {
        sectionId = validation.data.sectionId;
      }
    } catch {
      // Empty body — refresh all
    }

    if (sectionId) {
      await plexClient.refreshSection(sectionId);
    } else {
      await plexClient.refreshAll();
    }

    logAudit('plex.refresh', 'plex', sectionId ?? null,
      sectionId ? `Refreshing section ${sectionId}` : 'Refreshing all sections', 'user');

    return c.json<ApiResponse<{ refreshed: true; sectionId?: string }>>({
      success: true,
      data: { refreshed: true, sectionId },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to trigger Plex refresh', { error: err instanceof Error ? err.message : String(err) });
    return c.json<ApiResponse<never>>({
      success: false, error: 'Failed to trigger Plex library scan', timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// GET /api/plex/sections
// =============================================================================

plexRoutes.get('/plex/sections', async (c) => {
  try {
    const sections = await plexClient.getSections();
    return c.json<ApiResponse<PlexSection[]>>({
      success: true, data: sections, timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to list Plex sections', { error: err instanceof Error ? err.message : String(err) });
    return c.json<ApiResponse<never>>({
      success: false, error: 'Failed to list Plex library sections', timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// GET /api/plex/search
// =============================================================================

plexRoutes.get('/plex/search', async (c) => {
  try {
    const query = c.req.query('q');
    if (!query || query.trim().length === 0) {
      return c.json<ApiResponse<never>>({
        success: false, error: 'Search query "q" parameter is required', timestamp: new Date().toISOString(),
      }, 400);
    }
    const results = await plexClient.search(query.trim());
    return c.json<ApiResponse<PlexSearchResult[]>>({
      success: true, data: results, timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to search Plex', { error: err instanceof Error ? err.message : String(err) });
    return c.json<ApiResponse<never>>({
      success: false, error: 'Failed to search Plex library', timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// GET /api/plex/library/sync
// =============================================================================

plexRoutes.get('/plex/library/sync', async (c) => {
  try {
    await plexClient.refreshAll();
    logAudit('plex.library.sync', 'plex', null, 'Full Plex library sync triggered', 'user');
    return c.json<ApiResponse<{ synced: true }>>({
      success: true, data: { synced: true }, timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to sync Plex library', { error: err instanceof Error ? err.message : String(err) });
    return c.json<ApiResponse<never>>({
      success: false, error: 'Failed to sync Plex library', timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// GET /api/plex/library/:sectionId
// =============================================================================

/**
 * Returns all items from a specific Plex library section.
 * Items include poster thumb paths for the frontend to render.
 */
plexRoutes.get('/plex/library/:sectionId', async (c) => {
  try {
    const sectionId = c.req.param('sectionId');
    const items = await plexClient.getSectionItems(sectionId);
    return c.json<ApiResponse<PlexSectionItem[]>>({
      success: true, data: items, timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to fetch Plex section items', {
      error: err instanceof Error ? err.message : String(err),
      sectionId: c.req.param('sectionId'),
    });
    return c.json<ApiResponse<never>>({
      success: false, error: 'Failed to fetch Plex library section items', timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// GET /api/plex/item/:ratingKey/children
// =============================================================================

/**
 * Returns child items — seasons of a show, or episodes of a season.
 */
plexRoutes.get('/plex/item/:ratingKey/children', async (c) => {
  try {
    const ratingKey = c.req.param('ratingKey');
    const children = await plexClient.getChildren(ratingKey);
    return c.json<ApiResponse<PlexSectionItem[]>>({
      success: true, data: children, timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to fetch Plex item children', {
      error: err instanceof Error ? err.message : String(err),
      ratingKey: c.req.param('ratingKey'),
    });
    return c.json<ApiResponse<never>>({
      success: false, error: 'Failed to fetch item children from Plex', timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// GET /api/plex/item/:ratingKey/files
// =============================================================================

/**
 * Returns actual media file paths for a Plex item.
 * Recursively resolves show → season → episode file paths.
 */
plexRoutes.get('/plex/item/:ratingKey/files', async (c) => {
  try {
    const ratingKey = c.req.param('ratingKey');

    // Try direct file lookup (movies/episodes)
    let files = await plexClient.getMediaFiles(ratingKey);

    // If no direct files, recurse into children (show→seasons→episodes)
    if (files.length === 0) {
      const children = await plexClient.getChildren(ratingKey);
      for (const child of children) {
        const childFiles = await plexClient.getMediaFiles(child.ratingKey);
        if (childFiles.length > 0) {
          files.push(...childFiles);
        } else {
          // Child is a season — get its episodes
          const grandchildren = await plexClient.getChildren(child.ratingKey);
          for (const gc of grandchildren) {
            const gcFiles = await plexClient.getMediaFiles(gc.ratingKey);
            files.push(...gcFiles);
          }
        }
      }
    }

    return c.json<ApiResponse<PlexMediaFile[]>>({
      success: true, data: files, timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to fetch Plex item files', {
      error: err instanceof Error ? err.message : String(err),
      ratingKey: c.req.param('ratingKey'),
    });
    return c.json<ApiResponse<never>>({
      success: false, error: 'Failed to fetch file paths from Plex', timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// POST /api/plex/preserve/:ratingKey
// =============================================================================

/**
 * Queue preservation of a Plex item (movie, show, or season).
 * Finds file paths via Plex API, matches to cloud sources in DB,
 * and creates import jobs to copy from cloud → local.
 */
plexRoutes.post('/plex/preserve/:ratingKey', async (c) => {
  try {
    const ratingKey = c.req.param('ratingKey');
    const metadata = await plexClient.getMetadata(ratingKey);
    const itemTitle = metadata?.title ?? `Plex item ${ratingKey}`;

    // Collect all file paths (handles show → season → episode)
    let files = await plexClient.getMediaFiles(ratingKey);

    if (files.length === 0) {
      const children = await plexClient.getChildren(ratingKey);
      for (const child of children) {
        const childFiles = await plexClient.getMediaFiles(child.ratingKey);
        if (childFiles.length > 0) {
          files.push(...childFiles);
        } else {
          const grandchildren = await plexClient.getChildren(child.ratingKey);
          for (const gc of grandchildren) {
            const gcFiles = await plexClient.getMediaFiles(gc.ratingKey);
            files.push(...gcFiles);
          }
        }
      }
    }

    if (files.length === 0) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: `No media files found for "${itemTitle}"`,
        timestamp: new Date().toISOString(),
      }, 404);
    }

    // Match file paths to cloud sources and create import jobs
    let jobsCreated = 0;
    let alreadyLocal = 0;
    const errors: string[] = [];

    interface SourceRow { id: string; source_type: string; file_path: string; }

    for (const file of files) {
      const fileName = file.filePath.split('/').pop() ?? file.filePath;

      // Find cloud source by filename
      const cloudSource = db
        .query<SourceRow, [string]>(`
          SELECT id, source_type, file_path
          FROM media_sources
          WHERE source_type IN ('realdebrid', 'torbox')
            AND file_name = ?
          LIMIT 1
        `)
        .get(fileName);

      if (!cloudSource) {
        const localSource = db
          .query<SourceRow, [string]>(`
            SELECT id, source_type, file_path
            FROM media_sources
            WHERE source_type = 'local' AND file_name = ?
            LIMIT 1
          `)
          .get(fileName);

        if (localSource) {
          alreadyLocal++;
        } else {
          errors.push(`No cloud source found for: ${fileName}`);
        }
        continue;
      }

      // Create import job
      const importId = crypto.randomUUID();
      const now = new Date().toISOString();
      const destPath = `/media/library/${fileName}`;

      db.prepare(`
        INSERT INTO import_jobs (
          id, media_source_id, source_type, action,
          source_path, destination_path, status,
          created_at, updated_at
        )
        VALUES (?, ?, ?, 'copy', ?, ?, 'pending', ?, ?)
      `).run(importId, cloudSource.id, cloudSource.source_type,
        cloudSource.file_path, destPath, now, now);

      jobsCreated++;
    }

    logAudit('plex.preserve', 'plex', ratingKey,
      `Queued ${jobsCreated} files for preservation from "${itemTitle}"`, 'user');

    log.info('Preservation queued', {
      ratingKey, title: itemTitle, totalFiles: files.length,
      jobsCreated, alreadyLocal, errors: errors.length,
    });

    return c.json<ApiResponse<{
      title: string; totalFiles: number; jobsCreated: number;
      alreadyLocal: number; errors: string[];
    }>>({
      success: true,
      data: { title: itemTitle, totalFiles: files.length, jobsCreated, alreadyLocal, errors },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to queue preservation', {
      error: err instanceof Error ? err.message : String(err),
      ratingKey: c.req.param('ratingKey'),
    });
    return c.json<ApiResponse<never>>({
      success: false, error: 'Failed to queue preservation', timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// GET /api/plex/proxy/* — Proxy Plex images (posters, art)
// =============================================================================

/**
 * Proxies image requests to Plex, injecting the authentication token
 * server-side so it's never exposed to the client.
 *
 * Usage: /api/plex/proxy/library/metadata/12345/thumb/1234567
 */
plexRoutes.get('/plex/proxy/*', async (c) => {
  try {
    const proxyPath = c.req.path.replace(/^\/plex\/proxy/, '');
    if (!proxyPath || proxyPath === '/') {
      return c.text('Missing path', 400);
    }

    const plexUrl = (process.env.PLEX_URL ?? 'http://localhost:32400').replace(/\/$/, '');
    const plexToken = process.env.PLEX_TOKEN ?? '';
    const imageUrl = `${plexUrl}${proxyPath}?X-Plex-Token=${plexToken}`;

    const response = await fetch(imageUrl);

    if (!response.ok) {
      return c.text('Plex image not found', response.status as 404);
    }

    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    const body = await response.arrayBuffer();

    return c.body(body, 200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
    });
  } catch {
    return c.text('Failed to proxy Plex image', 502);
  }
});

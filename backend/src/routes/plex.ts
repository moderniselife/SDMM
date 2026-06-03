/**
 * SchroDrive Media Manager — Plex Routes
 *
 * Endpoints for interacting with the Plex Media Server:
 * library refresh, section listing, search, and library browsing.
 *
 * All Plex interactions are delegated to the PlexClient singleton.
 *
 * @module routes/plex
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { logAudit } from '../services/audit';
import { createLogger } from '../utils/logger';
import { plexClient } from '../services/integrations/plex-client';
import type { PlexSection, PlexSearchResult, PlexSectionItem } from '../services/integrations/plex-client';
import type { ApiResponse } from '../types';

const log = createLogger('plex');

export const plexRoutes = new Hono();

// =============================================================================
// Validation Schemas
// =============================================================================

const refreshSchema = z.object({
  sectionId: z.string().optional(),
}).optional();

// =============================================================================
// POST /api/plex/refresh
// =============================================================================

/**
 * POST /api/plex/refresh
 *
 * Triggers a Plex library scan. Optionally targets a specific
 * library section by ID.
 */
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
      // Empty body is acceptable — refresh all sections
    }

    if (sectionId) {
      await plexClient.refreshSection(sectionId);
    } else {
      await plexClient.refreshAll();
    }

    logAudit(
      'plex.refresh',
      'plex',
      sectionId ?? null,
      sectionId ? `Refreshing section ${sectionId}` : 'Refreshing all sections',
      'user'
    );

    log.info('Plex refresh triggered', { sectionId: sectionId ?? 'all' });

    return c.json<ApiResponse<{ refreshed: true; sectionId?: string }>>({
      success: true,
      data: { refreshed: true, sectionId },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to trigger Plex refresh', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to trigger Plex library scan',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// GET /api/plex/sections
// =============================================================================

/**
 * GET /api/plex/sections
 *
 * Lists all Plex library sections.
 */
plexRoutes.get('/plex/sections', async (c) => {
  try {
    const sections = await plexClient.getSections();

    return c.json<ApiResponse<PlexSection[]>>({
      success: true,
      data: sections,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to list Plex sections', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to list Plex library sections',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// GET /api/plex/search
// =============================================================================

/**
 * GET /api/plex/search
 *
 * Searches the Plex library. Requires a `q` query parameter.
 */
plexRoutes.get('/plex/search', async (c) => {
  try {
    const query = c.req.query('q');

    if (!query || query.trim().length === 0) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: 'Search query "q" parameter is required',
        timestamp: new Date().toISOString(),
      }, 400);
    }

    const results = await plexClient.search(query.trim());

    return c.json<ApiResponse<PlexSearchResult[]>>({
      success: true,
      data: results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to search Plex', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to search Plex library',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// GET /api/plex/library/sync
// =============================================================================

/**
 * GET /api/plex/library/sync
 *
 * Triggers a full Plex library sync by refreshing all sections.
 * This is a convenience endpoint for bulk library synchronisation.
 */
plexRoutes.get('/plex/library/sync', async (c) => {
  try {
    await plexClient.refreshAll();

    logAudit(
      'plex.library.sync',
      'plex',
      null,
      'Full Plex library sync triggered',
      'user'
    );

    log.info('Full Plex library sync triggered');

    return c.json<ApiResponse<{ synced: true }>>({
      success: true,
      data: { synced: true },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to sync Plex library', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to sync Plex library',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// GET /api/plex/library/:sectionId
// =============================================================================

/**
 * GET /api/plex/library/:sectionId
 *
 * Returns all items from a specific Plex library section.
 */
plexRoutes.get('/plex/library/:sectionId', async (c) => {
  try {
    const sectionId = c.req.param('sectionId');

    if (!sectionId) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: 'Section ID parameter is required',
        timestamp: new Date().toISOString(),
      }, 400);
    }

    const items = await plexClient.getSectionItems(sectionId);

    return c.json<ApiResponse<PlexSectionItem[]>>({
      success: true,
      data: items,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to fetch Plex section items', {
      error: err instanceof Error ? err.message : String(err),
      sectionId: c.req.param('sectionId'),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to fetch Plex library section items',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

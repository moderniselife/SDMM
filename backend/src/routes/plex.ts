/**
 * SchroDrive Media Manager — Plex Routes
 *
 * Endpoints for interacting with the Plex Media Server:
 * library refresh, section listing, and search.
 *
 * External Plex interactions use placeholder functions
 * that will be implemented by the services layer.
 *
 * @module routes/plex
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { logAudit } from '../services/audit';
import { createLogger } from '../utils/logger';
import type { ApiResponse } from '../types';

const log = createLogger('plex');

export const plexRoutes = new Hono();

// =============================================================================
// Placeholder Service Functions
// =============================================================================

/** Plex library section. */
interface PlexSection {
  id: number;
  title: string;
  type: string;
  agent: string;
  scanner: string;
  language: string;
}

/** Plex search result. */
interface PlexSearchResult {
  ratingKey: string;
  title: string;
  year: number | null;
  type: string;
  thumb: string | null;
}

/**
 * Placeholder: Triggers a Plex library scan.
 * Will be implemented by the Plex service module.
 */
async function triggerPlexScan(_sectionId?: number): Promise<void> {
  log.warn('Plex service not yet implemented — scan request logged only');
}

/**
 * Placeholder: Lists Plex library sections.
 * Will be implemented by the Plex service module.
 */
async function getPlexSections(): Promise<PlexSection[]> {
  log.warn('Plex service not yet implemented — returning empty sections');
  return [];
}

/**
 * Placeholder: Searches Plex library.
 * Will be implemented by the Plex service module.
 */
async function searchPlex(_query: string): Promise<PlexSearchResult[]> {
  log.warn('Plex service not yet implemented — returning empty results');
  return [];
}

// =============================================================================
// Validation Schemas
// =============================================================================

const refreshSchema = z.object({
  sectionId: z.number().int().optional(),
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
    let sectionId: number | undefined;

    try {
      const body = await c.req.json();
      const validation = refreshSchema.safeParse(body);
      if (validation.success && validation.data) {
        sectionId = validation.data.sectionId;
      }
    } catch {
      // Empty body is acceptable — refresh all sections
    }

    await triggerPlexScan(sectionId);

    logAudit(
      'plex.refresh',
      'plex',
      sectionId ? String(sectionId) : null,
      sectionId ? `Refreshing section ${sectionId}` : 'Refreshing all sections',
      'user'
    );

    return c.json<ApiResponse<{ refreshed: true; sectionId?: number }>>({
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
    const sections = await getPlexSections();

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

    const results = await searchPlex(query.trim());

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

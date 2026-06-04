/**
 * SchroDrive Media Manager — Dashboard Route
 *
 * Provides aggregate statistics for the frontend dashboard,
 * including source counts, storage usage, active jobs,
 * and recent activity.
 *
 * @module routes/dashboard
 */

import { Hono } from 'hono';
import { statfs } from 'node:fs/promises';
import { db } from '../db/connection';
import { createLogger } from '../utils/logger';
import { config } from '../config';
import { tautulliClient } from '../services/integrations/tautulli-client';
import type { ApiResponse, DashboardStats, AuditLog } from '../types';

const log = createLogger('dashboard');

export const dashboardRoutes = new Hono();

/**
 * GET /api/dashboard
 *
 * Returns a summary of the entire system state for the dashboard view.
 */
dashboardRoutes.get('/dashboard', async (c) => {
  try {
    // Count media sources by type
    const countByType = (type: string): number => {
      const row = db
        .query<{ count: number }, [string]>(
          'SELECT COUNT(*) as count FROM media_sources WHERE source_type = ?'
        )
        .get(type);
      return row?.count ?? 0;
    };

    const totalLocal = countByType('local');
    const totalRealDebrid = countByType('realdebrid');
    const totalTorBox = countByType('torbox');

    // Count optimised sources
    const optimisedRow = db
      .query<{ count: number }, []>(
        'SELECT COUNT(*) as count FROM media_sources WHERE is_optimised = 1'
      )
      .get();
    const totalOptimised = optimisedRow?.count ?? 0;

    // Storage — filesystem stats from the library directory
    let storageUsed = 0;
    let storageFree = 0;
    let storageTotal = 0;
    try {
      const fsStats = await statfs(config.paths.mediaRoot);
      const blockSize = fsStats.bsize;
      storageTotal = fsStats.blocks * blockSize;
      storageFree = fsStats.bfree * blockSize;
      storageUsed = storageTotal - storageFree;
    } catch (fsErr) {
      log.warn('Unable to read filesystem stats for media root', {
        path: config.paths.mediaRoot,
        error: fsErr instanceof Error ? fsErr.message : String(fsErr),
      });
    }

    // Active encode jobs
    const encodesRow = db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM encode_jobs WHERE status IN ('pending', 'running')"
      )
      .get();
    const activeEncodes = encodesRow?.count ?? 0;

    // Active download jobs
    const downloadsRow = db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM download_jobs WHERE status IN ('pending', 'downloading')"
      )
      .get();
    const activeDownloads = downloadsRow?.count ?? 0;

    // Recent activity — last 15 audit log entries
    const recentActivity = db
      .query<AuditLog, []>(
        `SELECT id, timestamp, action, entity_type as entityType,
                entity_id as entityId, details, source
         FROM audit_logs
         ORDER BY timestamp DESC
         LIMIT 15`
      )
      .all();

    // Preservation suggestions from Tautulli
    let preservationSuggestions: unknown[] = [];
    try {
      preservationSuggestions = await tautulliClient.getPreservationSuggestions();
    } catch (tautErr) {
      log.warn('Failed to fetch preservation suggestions from Tautulli', {
        error: tautErr instanceof Error ? tautErr.message : String(tautErr),
      });
    }

    const data: DashboardStats = {
      totalLocal,
      totalRealDebrid,
      totalTorBox,
      totalOptimised,
      storageUsed,
      storageFree,
      storageTotal,
      activeEncodes,
      activeDownloads,
      recentActivity,
      preservationSuggestions,
    };

    const response: ApiResponse<DashboardStats> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    return c.json(response);
  } catch (err) {
    log.error('Failed to build dashboard data', {
      error: err instanceof Error ? err.message : String(err),
    });

    const response: ApiResponse<never> = {
      success: false,
      error: 'Failed to load dashboard data',
      timestamp: new Date().toISOString(),
    };

    return c.json(response, 500);
  }
});

/**
 * GET /api/activity
 *
 * Returns recent audit log entries. The dashboard route already fetches
 * recentActivity but the frontend also calls this separately.
 */
dashboardRoutes.get('/activity', (c) => {
  try {
    const limit = parseInt(c.req.query('limit') ?? '20', 10);
    const clampedLimit = Math.min(Math.max(1, limit), 50);

    const rows = db
      .query<Record<string, unknown>, [number]>(`
        SELECT id, timestamp, action, entity_type, entity_id, details, source
        FROM audit_logs
        ORDER BY timestamp DESC
        LIMIT ?
      `)
      .all(clampedLimit);

    const entries = rows.map((row) => ({
      id: row['id'] as string,
      timestamp: row['timestamp'] as string,
      action: row['action'] as string,
      entityType: row['entity_type'] as string,
      entityId: row['entity_id'] as string | null,
      details: row['details'] as string | null,
      source: row['source'] as string,
    }));

    const response: ApiResponse<typeof entries> = {
      success: true,
      data: entries,
      timestamp: new Date().toISOString(),
    };

    return c.json(response);
  } catch (err) {
    log.error('Failed to fetch activity', {
      error: err instanceof Error ? err.message : String(err),
    });

    const response: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch activity',
      timestamp: new Date().toISOString(),
    };

    return c.json(response, 500);
  }
});

/**
 * GET /api/suggestions/preservation
 *
 * Returns cloud media items that should be considered for local
 * preservation. Uses Tautulli watch data when available, otherwise
 * falls back to heuristics (popular shows, large files, etc.).
 */
dashboardRoutes.get('/suggestions/preservation', async (c) => {
  try {
    // Try Tautulli first
    let suggestions: unknown[] = [];
    try {
      const tautulliSuggestions = await tautulliClient.getPreservationSuggestions();
      if (tautulliSuggestions.length > 0) {
        suggestions = tautulliSuggestions;
      }
    } catch (tautErr) {
      log.debug('Tautulli not available for preservation suggestions', {
        error: tautErr instanceof Error ? tautErr.message : String(tautErr),
      });
    }

    // Fallback: database-driven suggestions when Tautulli is unavailable or empty
    if (suggestions.length === 0) {
      interface SuggestionRow {
        id: string;
        title: string;
        type: string;
        year: number | null;
        poster_url: string | null;
        source_count: number;
        total_size: number;
      }

      // Find cloud-only items worth preserving:
      // - Items with only cloud sources (no local copy)
      // - Prioritise items with multiple episodes/sources (popular shows)
      // - Prioritise large files (high quality, worth keeping)
      const rows = db
        .prepare(`
          SELECT
            mi.id,
            mi.title,
            mi.type,
            mi.year,
            mi.poster_url,
            COUNT(ms.id) as source_count,
            SUM(ms.file_size) as total_size
          FROM media_items mi
          INNER JOIN media_sources ms ON ms.media_item_id = mi.id
          WHERE ms.source_type IN ('realdebrid', 'torbox')
            AND mi.id NOT IN (
              SELECT DISTINCT media_item_id
              FROM media_sources
              WHERE source_type = 'local'
            )
          GROUP BY mi.id
          ORDER BY
            COUNT(ms.id) DESC,
            SUM(ms.file_size) DESC
          LIMIT 20
        `)
        .all() as SuggestionRow[];

      suggestions = rows.map((row) => ({
        mediaId: row.id,
        title: row.title,
        type: row.type,
        year: row.year,
        posterUrl: row.poster_url,
        playCount: row.source_count, // Use episode/source count as proxy for play count
        sourceType: 'REALDEBRID',    // These are cloud-only items by definition
        sourceCount: row.source_count,
        totalSize: row.total_size,
        reason: row.source_count > 3
          ? `${row.source_count} episodes on cloud only`
          : row.total_size > 5_000_000_000
            ? 'Large file — worth preserving locally'
            : 'Available on cloud only',
      }));
    }

    const response: ApiResponse<typeof suggestions> = {
      success: true,
      data: suggestions,
      timestamp: new Date().toISOString(),
    };

    return c.json(response);
  } catch (err) {
    log.error('Failed to fetch preservation suggestions', {
      error: err instanceof Error ? err.message : String(err),
    });

    const response: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch preservation suggestions',
      timestamp: new Date().toISOString(),
    };

    return c.json(response, 500);
  }
});

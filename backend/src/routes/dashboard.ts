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
import { db } from '../db/connection';
import { createLogger } from '../utils/logger';
import type { ApiResponse, DashboardStats, AuditLog } from '../types';

const log = createLogger('dashboard');

export const dashboardRoutes = new Hono();

/**
 * GET /api/dashboard
 *
 * Returns a summary of the entire system state for the dashboard view.
 */
dashboardRoutes.get('/dashboard', (c) => {
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

    // Storage — sum file sizes by source type
    const storageRow = db
      .query<{ total: number | null }, [string]>(
        "SELECT SUM(file_size) as total FROM media_sources WHERE source_type = 'local'"
      )
      .get('local');
    const storageUsed = storageRow?.total ?? 0;

    // We can't reliably get free space from SQLite, so return 0 and let the
    // services layer fill this in with actual filesystem stats when available
    const storageFree = 0;

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

    const data: DashboardStats = {
      totalLocal,
      totalRealDebrid,
      totalTorBox,
      totalOptimised,
      storageUsed,
      storageFree,
      activeEncodes,
      activeDownloads,
      recentActivity,
      preservationSuggestions: [],
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

/**
 * SchroDrive Media Manager — Settings Routes
 *
 * Endpoints for reading and updating application settings
 * stored in the app_settings key-value table.
 *
 * @module routes/settings
 */

import { Hono } from 'hono';
import { db } from '../db/connection';
import { logAudit } from '../services/audit';
import { createLogger } from '../utils/logger';
import type { ApiResponse } from '../types';

const log = createLogger('settings');

export const settingsRoutes = new Hono();

// =============================================================================
// GET /api/settings
// =============================================================================

/**
 * GET /api/settings
 *
 * Returns all application settings as a flat key-value object.
 */
settingsRoutes.get('/settings', (c) => {
  try {
    const rows = db
      .query<{ key: string; value: string; updated_at: string }, []>(
        'SELECT key, value, updated_at FROM app_settings ORDER BY key'
      )
      .all();

    // Build a key-value map with metadata
    const settings: Record<string, { value: string; updatedAt: string }> = {};
    for (const row of rows) {
      settings[row.key] = {
        value: row.value,
        updatedAt: row.updated_at,
      };
    }

    return c.json<ApiResponse<typeof settings>>({
      success: true,
      data: settings,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to load settings', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to load settings',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// =============================================================================
// PUT /api/settings
// =============================================================================

/**
 * PUT /api/settings
 *
 * Updates application settings. Body should be a flat object
 * of key-value pairs. Only changed keys are updated.
 */
settingsRoutes.put('/settings', async (c) => {
  try {
    const body = await c.req.json();

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: 'Request body must be a JSON object of key-value pairs',
        timestamp: new Date().toISOString(),
      }, 400);
    }

    const entries = Object.entries(body as Record<string, unknown>);

    if (entries.length === 0) {
      return c.json<ApiResponse<never>>({
        success: false,
        error: 'No settings provided to update',
        timestamp: new Date().toISOString(),
      }, 400);
    }

    const now = new Date().toISOString();
    let updatedCount = 0;

    const upsertStmt = db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);

    const transaction = db.transaction(() => {
      for (const [key, value] of entries) {
        if (typeof key !== 'string' || key.trim().length === 0) {
          continue;
        }

        const stringValue = typeof value === 'string'
          ? value
          : JSON.stringify(value);

        upsertStmt.run(key, stringValue, now);
        updatedCount++;
      }
    });

    transaction();

    logAudit(
      'settings.updated',
      'app_settings',
      null,
      `Updated ${updatedCount} setting(s): ${entries.map(([k]) => k).join(', ')}`,
      'user'
    );

    log.info(`Updated ${updatedCount} setting(s)`);

    return c.json<ApiResponse<{ updated: number }>>({
      success: true,
      data: { updated: updatedCount },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error('Failed to update settings', {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json<ApiResponse<never>>({
      success: false,
      error: 'Failed to update settings',
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

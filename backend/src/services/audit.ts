/**
 * SchroDrive Media Manager — Audit Service
 *
 * Provides a simple function to record audit log entries
 * for tracking system activity and user actions.
 *
 * @module services/audit
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { createLogger } from '../utils/logger';
import type { AuditSource } from '../types';

const log = createLogger('audit');

/**
 * Inserts an audit log entry into the database.
 *
 * @param action - The action performed (e.g. 'media.imported', 'encode.started').
 * @param entityType - The type of entity affected (e.g. 'media_item', 'encode_job').
 * @param entityId - The ID of the affected entity, or null for global actions.
 * @param details - Optional free-text details about the action.
 * @param source - Who triggered the action: 'user', 'system', or 'auto'.
 */
export function logAudit(
  action: string,
  entityType: string,
  entityId: string | null = null,
  details: string | null = null,
  source: AuditSource = 'system'
): void {
  try {
    const id = uuidv4();
    const timestamp = new Date().toISOString();

    db.prepare(`
      INSERT INTO audit_logs (id, timestamp, action, entity_type, entity_id, details, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, timestamp, action, entityType, entityId, details, source);

    log.debug(`Audit: ${action} on ${entityType}`, { entityId, source });
  } catch (err) {
    log.error('Failed to write audit log', {
      action,
      entityType,
      entityId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Retrieves the most recent audit log entries.
 *
 * @param limit - Maximum number of entries to return. Defaults to 20.
 * @returns Array of recent audit log rows.
 */
export function getRecentAuditLogs(limit = 20) {
  return db
    .prepare(`
      SELECT id, timestamp, action, entity_type, entity_id, details, source
      FROM audit_logs
      ORDER BY timestamp DESC
      LIMIT ?
    `)
    .all(limit);
}

/**
 * SchroDrive Media Manager — Database Connection
 *
 * Creates and exports a singleton SQLite connection using bun:sqlite
 * with WAL mode enabled for better concurrent read performance.
 *
 * @module db/connection
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { createLogger } from '../utils/logger';

const log = createLogger('db');

/**
 * Determines the database file path.
 *
 * In production (CONFIG_DIR set), uses `/config/schrodrive.db`.
 * In development, falls back to `./data/schrodrive.db`.
 */
function getDatabasePath(): string {
  const configDir = process.env['CONFIG_DIR'];

  if (configDir) {
    return `${configDir}/schrodrive.db`;
  }

  // Development fallback
  return './data/schrodrive.db';
}

/**
 * Initialises the SQLite database connection.
 *
 * - Creates parent directories if they don't exist.
 * - Enables WAL mode for improved concurrent access.
 * - Sets sensible PRAGMA defaults for performance.
 *
 * @returns The initialised Database instance.
 */
function createConnection(): Database {
  const dbPath = getDatabasePath();
  const dir = dirname(dbPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    log.info(`Created database directory: ${dir}`);
  }

  log.info(`Opening database at ${dbPath}`);

  const database = new Database(dbPath, { create: true });

  // Enable WAL mode for better read concurrency
  database.exec('PRAGMA journal_mode = WAL');
  database.exec('PRAGMA busy_timeout = 5000');
  database.exec('PRAGMA synchronous = NORMAL');
  database.exec('PRAGMA cache_size = -20000'); // 20MB cache
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA temp_store = MEMORY');

  // CRITICAL: Disable memory-mapped I/O.
  // Without this, SQLite memory-maps the entire DB file + WAL file into
  // the process address space. With 40K+ items and a large WAL from bulk
  // inserts, this causes the process to show 10-20GB+ resident memory.
  // Setting to 0 forces normal read() I/O which uses the page cache instead.
  database.exec('PRAGMA mmap_size = 0');

  // Auto-checkpoint the WAL every 1000 pages (~4MB) instead of the
  // default 1000. This prevents the WAL from growing unbounded during
  // bulk reconciliation of 40K files.
  database.exec('PRAGMA wal_autocheckpoint = 1000');

  log.info('Database connection established with WAL mode (mmap disabled)');

  return database;
}

/** Singleton database connection used throughout the application. */
export const db: Database = createConnection();

/**
 * Closes the database connection gracefully.
 * Called during application shutdown.
 */
export function closeDatabase(): void {
  try {
    db.close();
    log.info('Database connection closed');
  } catch (err) {
    log.error('Error closing database', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Runs a WAL checkpoint to merge the WAL file back into the main DB.
 * Call this after large bulk operations (e.g. reconciliation of 40K files)
 * to free the WAL memory and prevent unbounded growth.
 */
export function checkpointWal(): void {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    log.info('WAL checkpoint complete');
  } catch (err) {
    log.warn('WAL checkpoint failed (non-fatal)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

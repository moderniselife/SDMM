/**
 * SchroDrive Media Manager — Database Migration Runner
 *
 * Tracks applied migrations in a `_migrations` table and applies
 * any outstanding migrations in order. Each migration is idempotent.
 *
 * @module db/migrations
 */

import { db } from './connection';
import { SCHEMA_SQL } from './schema';
import { createLogger } from '../utils/logger';

const log = createLogger('migrations');

/** A single migration definition. */
interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** All registered migrations, in order. */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: SCHEMA_SQL,
  },
];

/**
 * Ensures the `_migrations` tracking table exists.
 */
function ensureMigrationsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version     INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

/**
 * Returns the set of already-applied migration versions.
 */
function getAppliedVersions(): Set<number> {
  const rows = db
    .query<{ version: number }, []>('SELECT version FROM _migrations ORDER BY version')
    .all();
  return new Set(rows.map((r) => r.version));
}

/**
 * Runs all pending database migrations.
 *
 * Checks the `_migrations` table for previously applied migrations
 * and only applies those that haven't been run yet. Each migration
 * is wrapped in a transaction for atomicity.
 *
 * @returns The number of migrations applied.
 */
export function runMigrations(): number {
  ensureMigrationsTable();

  const applied = getAppliedVersions();
  let count = 0;

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) {
      log.debug(`Migration v${migration.version} (${migration.name}) already applied`);
      continue;
    }

    log.info(`Applying migration v${migration.version}: ${migration.name}`);

    const transaction = db.transaction(() => {
      // Execute the migration SQL
      db.exec(migration.sql);

      // Record it as applied
      db.prepare(
        'INSERT INTO _migrations (version, name) VALUES (?, ?)'
      ).run(migration.version, migration.name);
    });

    transaction();
    count++;

    log.info(`Migration v${migration.version} (${migration.name}) applied successfully`);
  }

  if (count === 0) {
    log.info('All migrations are up to date');
  } else {
    log.info(`Applied ${count} migration(s)`);
  }

  return count;
}

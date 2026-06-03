/**
 * SchroDrive Media Manager — Migration CLI Runner
 *
 * Standalone script to run database migrations.
 * Usage: `bun src/db/migrate.ts`
 *
 * @module db/migrate
 */

import { runMigrations } from './migrations';
import { closeDatabase } from './connection';
import { logger } from '../utils/logger';

logger.info('Running database migrations...');

try {
  const count = runMigrations();
  logger.info(`Migration run complete. ${count} migration(s) applied.`);
} catch (err) {
  logger.error('Migration failed', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
} finally {
  closeDatabase();
}

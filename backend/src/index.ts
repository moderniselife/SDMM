/**
 * SchroDrive Media Manager — Entry Point
 *
 * Initialises the database, runs migrations, and starts
 * the Hono HTTP server on the configured port.
 *
 * @module index
 */

import { config } from './config';
import { runMigrations } from './db/migrations';
import { closeDatabase } from './db/connection';
import { app } from './server';
import { setProcessStartTime } from './routes/health';
import { logger } from './utils/logger';

const VERSION = '0.1.0';
const startTime = Date.now();

// =============================================================================
// Startup Banner
// =============================================================================

logger.info('='.repeat(60));
logger.info('  SchroDrive Media Manager');
logger.info(`  Version: ${VERSION}`);
logger.info(`  Environment: ${process.env['NODE_ENV'] || 'development'}`);
logger.info(`  Timezone: ${process.env['TZ'] || 'Australia/Sydney'}`);
logger.info('='.repeat(60));

// =============================================================================
// Database Migrations
// =============================================================================

logger.info('Running database migrations...');
try {
  const migrationCount = runMigrations();
  logger.info(`Database ready (${migrationCount} migration(s) applied)`);
} catch (err) {
  logger.error('Failed to run database migrations — cannot start', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
}

// =============================================================================
// Start Server
// =============================================================================

const port = config.server.port;
const host = config.server.host;

// Set the start time for the health endpoint
setProcessStartTime(startTime);

logger.info(`Starting HTTP server on ${host}:${port}`);

const server = Bun.serve({
  port,
  hostname: host,
  fetch: app.fetch,
  idleTimeout: 255,
});

const startupMs = Date.now() - startTime;
logger.info(`Server listening on http://${host}:${port} (started in ${startupMs}ms)`);
logger.info(`API routes available at http://${host}:${port}/api/`);

// =============================================================================
// Graceful Shutdown
// =============================================================================

function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    server.stop(true);
    logger.info('HTTP server stopped');
  } catch {
    // Server may already be stopped
  }

  closeDatabase();
  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', {
    error: err.message,
    stack: err.stack,
  });
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

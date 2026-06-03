/**
 * SchroDrive Media Manager — Entry Point
 *
 * Initialises the database, runs migrations, starts the Hono HTTP
 * server, and boots all background services (scanner, workers,
 * watch stats sync).
 *
 * @module index
 */

import { config } from './config';
import { runMigrations } from './db/migrations';
import { closeDatabase } from './db/connection';
import { app } from './server';
import { setProcessStartTime } from './routes/health';
import { logger } from './utils/logger';
import { startPeriodicScan, stopPeriodicScan } from './services/scanner';
import { startEncodeWorker, stopEncodeWorker } from './services/queue/encode-worker';
import { startDownloadWorker, stopDownloadWorker } from './services/queue/download-worker';
import { startImportWorker, stopImportWorker } from './services/queue/import-worker';
import { getEncodeWorkerDeps, getDownloadWorkerDeps, getImportWorkerDeps } from './services/worker-wiring';
import { startPeriodicWatchSync, stopPeriodicWatchSync } from './services/watch-sync';
import { syncPlexLibrary } from './services/metadata';

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
// Background Services
// =============================================================================

logger.info('Starting background services...');

// Wire and start workers with real DB callbacks
try {
  startEncodeWorker(getEncodeWorkerDeps());
  logger.info('Encode worker started');
} catch (err) {
  logger.warn('Failed to start encode worker', {
    error: err instanceof Error ? err.message : String(err),
  });
}

try {
  startDownloadWorker(getDownloadWorkerDeps());
  logger.info('Download worker started');
} catch (err) {
  logger.warn('Failed to start download worker', {
    error: err instanceof Error ? err.message : String(err),
  });
}

try {
  startImportWorker(getImportWorkerDeps());
  logger.info('Import worker started');
} catch (err) {
  logger.warn('Failed to start import worker', {
    error: err instanceof Error ? err.message : String(err),
  });
}

// Start periodic scanner (scan → reconcile → enrich)
const scanInterval = config.scanner?.intervalMinutes ?? 15;
startPeriodicScan(scanInterval);
logger.info(`Periodic scanner started (every ${scanInterval} minutes)`);

// Start periodic Tautulli watch stats sync
startPeriodicWatchSync(30);
logger.info('Periodic watch stats sync started (every 30 minutes)');

// Background Plex library sync (non-blocking)
syncPlexLibrary()
  .then((result) => {
    logger.info(`Initial Plex library sync complete: ${result.imported} imported, ${result.matched} matched`);
  })
  .catch((err) => {
    logger.warn('Initial Plex library sync failed (will retry on next scan)', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

logger.info('All background services started');

// =============================================================================
// Graceful Shutdown
// =============================================================================

function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Stop background services
  stopPeriodicScan();
  stopEncodeWorker();
  stopDownloadWorker();
  stopImportWorker();
  stopPeriodicWatchSync();
  logger.info('Background services stopped');

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


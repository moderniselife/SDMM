/**
 * SchroDrive Media Manager — Hono Server
 *
 * Configures the Hono application with middleware, static file
 * serving, error handling, and API route mounting.
 *
 * @module server
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import { createLogger } from './utils/logger';
import type { ApiResponse } from './types';

// Route imports
import { dashboardRoutes } from './routes/dashboard';
import { mediaRoutes } from './routes/media';
import { mediaActionRoutes } from './routes/media-actions';
import { sourcesRoutes } from './routes/sources';
import { torrentRoutes } from './routes/torrents';
import { encodeQueueRoutes } from './routes/encode-queue';
import { plexRoutes } from './routes/plex';
import { settingsRoutes } from './routes/settings';
import { healthRoutes } from './routes/health';
import { sseRoutes } from './routes/sse';

const log = createLogger('server');

/** The main Hono application instance. */
export const app = new Hono();

// =============================================================================
// Middleware
// =============================================================================

// CORS — allow all origins in development
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 86400,
  })
);

// Request logging — never logs tokens or auth headers
app.use('/api/*', async (c, next) => {
  const start = performance.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = (performance.now() - start).toFixed(2);
  const status = c.res.status;

  log.info(`${method} ${path} ${status} ${duration}ms`, {
    method,
    path,
    status,
    durationMs: parseFloat(duration),
  });
});

// =============================================================================
// API Routes
// =============================================================================

app.route('/api', healthRoutes);
app.route('/api', dashboardRoutes);
app.route('/api', mediaRoutes);
app.route('/api', mediaActionRoutes);
app.route('/api', sourcesRoutes);
app.route('/api', torrentRoutes);
app.route('/api', encodeQueueRoutes);
app.route('/api', plexRoutes);
app.route('/api', settingsRoutes);
app.route('/api', sseRoutes);

// =============================================================================
// Static File Serving (Frontend)
// =============================================================================

// Serve frontend static assets from /app/frontend/dist
app.use(
  '/*',
  serveStatic({
    root: '../frontend/dist',
    rewriteRequestPath: (path) => path,
  })
);

// SPA fallback — serve index.html for any non-API route that doesn't match a static file
app.get('*', serveStatic({ path: '../frontend/dist/index.html' }));

// =============================================================================
// Global Error Handler
// =============================================================================

app.onError((err, c) => {
  log.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  });

  const response: ApiResponse<never> = {
    success: false,
    error: err.message || 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
  };

  return c.json(response, 500);
});

// 404 handler for API routes
app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    const response: ApiResponse<never> = {
      success: false,
      error: `Route not found: ${c.req.method} ${c.req.path}`,
      timestamp: new Date().toISOString(),
    };
    return c.json(response, 404);
  }

  // For non-API routes, let the SPA handle it
  return c.text('Not found', 404);
});

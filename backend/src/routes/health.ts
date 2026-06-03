/**
 * SchroDrive Media Manager — Health Route
 *
 * Provides a simple health check endpoint for monitoring
 * and container orchestration probes.
 *
 * @module routes/health
 */

import { Hono } from 'hono';
import { db } from '../db/connection';
import type { ApiResponse } from '../types';

export const healthRoutes = new Hono();

const VERSION = '0.1.0';

/**
 * The process start time, set by the entry point.
 * Used to calculate uptime in the health check response.
 */
let _processStartTime: number = Date.now();

/**
 * Sets the process start time. Called from the entry point
 * after the server is fully initialised.
 *
 * @param time - The timestamp (ms since epoch) when the process started.
 */
export function setProcessStartTime(time: number): void {
  _processStartTime = time;
}

/** Health check response payload. */
interface HealthData {
  status: 'ok' | 'degraded';
  uptime: number;
  version: string;
  database: 'connected' | 'disconnected';
  timestamp: string;
}

/**
 * GET /api/health
 *
 * Returns the current health status of the application,
 * including uptime, version, and database connectivity.
 */
healthRoutes.get('/health', (c) => {
  let dbStatus: 'connected' | 'disconnected' = 'disconnected';

  try {
    // Simple query to verify database connectivity
    db.query('SELECT 1').get();
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }

  const uptimeMs = Date.now() - _processStartTime;

  const data: HealthData = {
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    uptime: Math.floor(uptimeMs / 1000),
    version: VERSION,
    database: dbStatus,
    timestamp: new Date().toISOString(),
  };

  const response: ApiResponse<HealthData> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };

  return c.json(response);
});

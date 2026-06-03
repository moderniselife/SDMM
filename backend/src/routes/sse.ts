/**
 * SchroDrive Media Manager — SSE Routes
 *
 * Server-Sent Events endpoint for real-time updates:
 * encode progress, download progress, scan notifications,
 * and other system events.
 *
 * @module routes/sse
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { createLogger } from '../utils/logger';

const log = createLogger('sse');

export const sseRoutes = new Hono();

// =============================================================================
// SSE Event Types
// =============================================================================

/** The types of events that can be sent over the SSE stream. */
export type SSEEventType =
  | 'encode_progress'
  | 'download_progress'
  | 'scan_complete'
  | 'import_progress'
  | 'system_notification'
  | 'heartbeat';

/** Shape of an SSE event payload. */
export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: string;
}

// =============================================================================
// Client Registry
// =============================================================================

type SSEWriter = (event: SSEEvent) => void;

/** Set of currently connected SSE clients. */
const clients = new Set<SSEWriter>();

/**
 * Broadcasts an event to all connected SSE clients.
 *
 * @param type - The event type identifier.
 * @param data - The event payload data.
 */
export function broadcastSSE(type: SSEEventType, data: unknown): void {
  const event: SSEEvent = {
    type,
    data,
    timestamp: new Date().toISOString(),
  };

  for (const writer of clients) {
    try {
      writer(event);
    } catch {
      // Client disconnected, will be cleaned up
    }
  }

  log.debug(`SSE broadcast: ${type} to ${clients.size} client(s)`);
}

// =============================================================================
// GET /api/events — SSE Stream
// =============================================================================

/**
 * GET /api/events
 *
 * Opens a Server-Sent Events stream for real-time updates.
 * The connection stays open until the client disconnects.
 *
 * Sends a heartbeat every 30 seconds to keep the connection alive.
 */
sseRoutes.get('/events', (c) => {
  return streamSSE(c, async (stream) => {
    let active = true;

    // Register this client's write function
    const writer: SSEWriter = (event) => {
      if (!active) return;
      stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event.data),
        id: event.timestamp,
      });
    };

    clients.add(writer);
    log.info(`SSE client connected (${clients.size} total)`);

    // Send initial connection event
    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({
        message: 'Connected to SchroDrive event stream',
        clientCount: clients.size,
      }),
      id: new Date().toISOString(),
    });

    // Heartbeat interval — every 30 seconds
    const heartbeatInterval = setInterval(() => {
      if (!active) return;
      try {
        stream.writeSSE({
          event: 'heartbeat',
          data: JSON.stringify({ timestamp: new Date().toISOString() }),
          id: new Date().toISOString(),
        });
      } catch {
        // Client disconnected
        active = false;
      }
    }, 30000);

    // Keep stream open until aborted
    stream.onAbort(() => {
      active = false;
      clearInterval(heartbeatInterval);
      clients.delete(writer);
      log.info(`SSE client disconnected (${clients.size} remaining)`);
    });

    // Keep the stream alive by waiting indefinitely
    // The stream will be closed when the client disconnects (onAbort fires)
    while (active) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });
});

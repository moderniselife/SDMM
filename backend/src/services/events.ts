/**
 * SchroDrive Media Manager — SSE Event Emitter
 *
 * Simple EventEmitter singleton for broadcasting real-time updates
 * (encoding progress, download progress, scan completions, etc.)
 * to connected SSE clients.
 *
 * @module services/events
 */

import type { SourceType } from '@/types';

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

/** All supported SSE event type identifiers. */
export type SSEEventType =
  | 'encode:progress'
  | 'encode:complete'
  | 'download:progress'
  | 'download:complete'
  | 'import:progress'
  | 'import:complete'
  | 'scan:complete'
  | 'job:complete';

/** Payload for an SSE event. */
export interface SSEEvent {
  type: SSEEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

/** Callback type for SSE event listeners. */
export type SSEListener = (event: SSEEvent) => void;

// ---------------------------------------------------------------------------
// EventBus Class
// ---------------------------------------------------------------------------

/**
 * A lightweight event bus for broadcasting server-sent events.
 *
 * Supports typed event emission, listener registration, and cleanup.
 * Used as a singleton across all workers and services.
 */
class EventBus {
  private listeners: Map<SSEEventType | '*', Set<SSEListener>> = new Map();

  /**
   * Registers a listener for a specific event type or '*' for all events.
   *
   * @param type - The event type to listen for, or '*' for all
   * @param listener - Callback invoked when the event fires
   * @returns Unsubscribe function
   */
  on(type: SSEEventType | '*', listener: SSEListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);

    return () => {
      this.listeners.get(type)?.delete(listener);
    };
  }

  /**
   * Emits an event to all registered listeners.
   *
   * @param event - The SSE event to broadcast
   */
  private emit(event: SSEEvent): void {
    // Notify type-specific listeners
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(event);
        } catch (err) {
          console.error(`[EventBus] Listener error for ${event.type}:`, err);
        }
      }
    }

    // Notify wildcard listeners
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        try {
          listener(event);
        } catch (err) {
          console.error(`[EventBus] Wildcard listener error:`, err);
        }
      }
    }
  }

  /**
   * Emits an encoding progress update.
   *
   * @param jobId - The encoding job identifier
   * @param percent - Completion percentage (0–100)
   */
  emitEncodeProgress(jobId: string, percent: number): void {
    this.emit({
      type: 'encode:progress',
      timestamp: new Date().toISOString(),
      data: { jobId, percent },
    });
  }

  /**
   * Emits an encoding completion event.
   *
   * @param jobId - The encoding job identifier
   * @param status - Final status ('completed' | 'failed' | 'skipped')
   */
  emitEncodeComplete(jobId: string, status: string): void {
    this.emit({
      type: 'encode:complete',
      timestamp: new Date().toISOString(),
      data: { jobId, status },
    });
  }

  /**
   * Emits a download progress update.
   *
   * @param jobId - The download job identifier
   * @param percent - Completion percentage (0–100)
   */
  emitDownloadProgress(jobId: string, percent: number): void {
    this.emit({
      type: 'download:progress',
      timestamp: new Date().toISOString(),
      data: { jobId, percent },
    });
  }

  /**
   * Emits a download completion event.
   *
   * @param jobId - The download job identifier
   * @param status - Final status ('completed' | 'failed')
   */
  emitDownloadComplete(jobId: string, status: string): void {
    this.emit({
      type: 'download:complete',
      timestamp: new Date().toISOString(),
      data: { jobId, status },
    });
  }

  /**
   * Emits an import progress update.
   *
   * @param jobId - The import job identifier
   * @param percent - Completion percentage (0–100)
   */
  emitImportProgress(jobId: string, percent: number): void {
    this.emit({
      type: 'import:progress',
      timestamp: new Date().toISOString(),
      data: { jobId, percent },
    });
  }

  /**
   * Emits an import completion event.
   *
   * @param jobId - The import job identifier
   * @param status - Final status
   */
  emitImportComplete(jobId: string, status: string): void {
    this.emit({
      type: 'import:complete',
      timestamp: new Date().toISOString(),
      data: { jobId, status },
    });
  }

  /**
   * Emits a scan completion event.
   *
   * @param sourceType - The source type that was scanned
   * @param itemsFound - Number of items discovered
   */
  emitScanComplete(sourceType: SourceType, itemsFound: number): void {
    this.emit({
      type: 'scan:complete',
      timestamp: new Date().toISOString(),
      data: { sourceType, itemsFound },
    });
  }

  /**
   * Emits a generic job completion event.
   *
   * @param type - The job type identifier (e.g. 'encode', 'download', 'import')
   * @param jobId - The job identifier
   * @param status - Final status string
   */
  emitJobComplete(type: string, jobId: string, status: string): void {
    this.emit({
      type: 'job:complete',
      timestamp: new Date().toISOString(),
      data: { type, jobId, status },
    });
  }

  /**
   * Removes all listeners. Useful for cleanup during shutdown.
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton Export
// ---------------------------------------------------------------------------

/** Global SSE event bus singleton. */
export const eventBus = new EventBus();

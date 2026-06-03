/**
 * useCloudBrowser — SSE-based hook for browsing cloud source directories.
 *
 * Connects to the SSE streaming endpoint and progressively builds
 * the file list as entries arrive. Provides real-time count updates
 * and handles reconnection/cleanup automatically.
 *
 * @module hooks/useCloudBrowser
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { CloudFile } from '@/lib/types';

interface UseCloudBrowserReturn {
  /** Accumulated files discovered so far */
  files: CloudFile[];
  /** Whether the stream is still receiving entries */
  loading: boolean;
  /** Error message if the stream/connection failed */
  error: string | null;
  /** Total entries found (set when stream completes) */
  totalFound: number;
  /** Trigger a manual refetch */
  refetch: () => void;
}

/**
 * Hook that uses SSE to stream directory entries from cloud sources.
 *
 * @param sourceType - 'realdebrid' or 'torbox'
 * @param path - Optional subdirectory path to browse
 * @returns Progressive file list with loading/error states
 */
export function useCloudBrowser(
  sourceType: 'realdebrid' | 'torbox',
  path?: string,
): UseCloudBrowserReturn {
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalFound, setTotalFound] = useState(0);
  const [fetchKey, setFetchKey] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    // Reset state for new path
    setFiles([]);
    setLoading(true);
    setError(null);
    setTotalFound(0);

    // Build SSE URL
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    const queryString = params.toString();
    const url = `/api/sources/${sourceType}/browse${queryString ? `?${queryString}` : ''}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    // Batch incoming entries for performance — accumulate for 50ms
    // then flush to state in one update
    let batch: CloudFile[] = [];
    let batchTimer: ReturnType<typeof setTimeout> | null = null;

    function flushBatch() {
      if (batch.length > 0) {
        const toAdd = [...batch];
        batch = [];
        setFiles((prev) => [...prev, ...toAdd]);
        setTotalFound((prev) => prev + toAdd.length);
      }
      batchTimer = null;
    }

    function scheduleBatchFlush() {
      if (!batchTimer) {
        batchTimer = setTimeout(flushBatch, 50);
      }
    }

    // Handle individual entry events
    es.addEventListener('entry', (e: MessageEvent) => {
      try {
        const raw = JSON.parse(e.data) as {
          name: string;
          path: string;
          isDirectory: boolean;
          size: number | null;
          modifiedAt: string | null;
        };

        const file: CloudFile = {
          id: raw.path,
          name: raw.name,
          path: raw.path,
          isDirectory: raw.isDirectory,
          sizeBytes: raw.size ?? 0,
          sourceType: sourceType === 'realdebrid' ? 'REALDEBRID' : 'TORBOX',
          createdAt: raw.modifiedAt ?? new Date().toISOString(),
        };

        batch.push(file);
        scheduleBatchFlush();
      } catch {
        // Malformed entry — skip
      }
    });

    // Handle stream completion
    es.addEventListener('done', (e: MessageEvent) => {
      // Flush any remaining batch
      flushBatch();

      try {
        const data = JSON.parse(e.data) as { total: number };
        setTotalFound(data.total);
      } catch {
        // Use accumulated count
      }
      setLoading(false);
      es.close();
    });

    // Handle errors from the stream
    es.addEventListener('error', (e: Event) => {
      // Flush any partial batch
      flushBatch();

      // Check if this is a custom error event with data
      if (e instanceof MessageEvent && e.data) {
        try {
          const data = JSON.parse(e.data) as { error: string };
          setError(data.error);
        } catch {
          setError('Stream error occurred');
        }
      } else {
        // EventSource connection error
        if (es.readyState === EventSource.CLOSED) {
          // Stream was closed normally after 'done' — not an error
          setLoading(false);
        } else {
          setError('Connection to server lost');
          setLoading(false);
        }
      }
      es.close();
    });

    // Cleanup
    return () => {
      if (batchTimer) clearTimeout(batchTimer);
      es.close();
      eventSourceRef.current = null;
    };
  }, [sourceType, path, fetchKey]);

  return { files, loading, error, totalFound, refetch };
}

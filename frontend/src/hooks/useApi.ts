/**
 * useApi — Generic data-fetching hook with loading / error states.
 *
 * Supports optional polling interval for live-updating data.
 */
import { useState, useEffect, useCallback, useRef } from 'react';

interface UseApiOptions {
  /** Polling interval in ms. When set, refetches on this interval. */
  pollInterval?: number;
  /** If true, retries once after a short delay when data is empty. */
  retryOnEmpty?: boolean;
}

interface UseApiReturn<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  options?: UseApiOptions,
): UseApiReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const retriedRef = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (mountedRef.current) {
        setData(result);

        // Retry once if data is empty array and retryOnEmpty is enabled
        if (
          options?.retryOnEmpty &&
          !retriedRef.current &&
          Array.isArray(result) &&
          result.length === 0
        ) {
          retriedRef.current = true;
          setTimeout(() => {
            if (mountedRef.current) {
              fetchData();
            }
          }, 5000);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    retriedRef.current = false;
    fetchData();

    // Set up polling if interval provided
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    if (options?.pollInterval && options.pollInterval > 0) {
      pollTimer = setInterval(() => {
        if (mountedRef.current) {
          fetchData();
        }
      }, options.pollInterval);
    }

    return () => {
      mountedRef.current = false;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

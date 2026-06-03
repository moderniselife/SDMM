/**
 * useSSE — Server-Sent Events hook with auto-reconnect.
 * Connects to an SSE endpoint and invokes onMessage for each event.
 */
import { useEffect, useRef } from 'react';
import type { SSEEvent } from '@/lib/types';

const RECONNECT_DELAY = 3000;
const MAX_RETRIES = 10;

export function useSSE(
  url: string,
  onMessage: (event: SSEEvent) => void,
  enabled = true,
): void {
  const retriesRef = useRef(0);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        retriesRef.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const parsed: SSEEvent = JSON.parse(event.data);
          onMessageRef.current(parsed);
        } catch {
          console.warn('[SSE] Failed to parse event data:', event.data);
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        if (retriesRef.current < MAX_RETRIES) {
          retriesRef.current += 1;
          reconnectTimeout = setTimeout(connect, RECONNECT_DELAY);
        } else {
          console.error('[SSE] Max retries reached. Giving up.');
        }
      };
    }

    connect();

    return () => {
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [url, enabled]);
}

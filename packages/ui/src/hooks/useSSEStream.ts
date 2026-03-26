/**
 * useSSEStream — Shared singleton EventSource manager.
 *
 * Deduplicates SSE connections: the first subscriber creates the EventSource,
 * subsequent subscribers reuse it. The connection closes when the last
 * subscriber unsubscribes.
 *
 * Supports both unnamed messages (onmessage) and named event types
 * (addEventListener). Use eventType='message' for unnamed messages.
 */

type SSECallback = (event: MessageEvent) => void;

interface SSEConnection {
  es: EventSource;
  /** Listeners keyed by event type, each a Set of callbacks */
  listeners: Map<string, Set<SSECallback>>;
  /** Total subscriber count across all event types */
  refCount: number;
}

/** One connection per URL */
const connections = new Map<string, SSEConnection>();

/**
 * Subscribe to an SSE event type on a given URL.
 *
 * @param url - The EventSource URL
 * @param eventType - Named event type, or 'message' for unnamed messages
 * @param callback - Called for each matching event
 * @returns unsubscribe function
 */
export function subscribeSSE(
  url: string,
  eventType: string,
  callback: SSECallback,
): () => void {
  let conn = connections.get(url);

  if (!conn) {
    const es = new EventSource(url);
    conn = {
      es,
      listeners: new Map(),
      refCount: 0,
    };
    connections.set(url, conn);
  }

  // Register the callback for this event type
  let typeListeners = conn.listeners.get(eventType);
  if (!typeListeners) {
    typeListeners = new Set();
    conn.listeners.set(eventType, typeListeners);

    // Wire up the actual EventSource listener for this event type
    const handler = (event: MessageEvent) => {
      const currentConn = connections.get(url);
      const currentListeners = currentConn?.listeners.get(eventType);
      if (currentListeners) {
        for (const cb of currentListeners) {
          cb(event);
        }
      }
    };

    if (eventType === 'message') {
      conn.es.onmessage = handler;
    } else {
      conn.es.addEventListener(eventType, handler as EventListener);
    }
  }

  typeListeners.add(callback);
  conn.refCount++;

  // Return unsubscribe function
  return () => {
    const currentConn = connections.get(url);
    if (!currentConn) return;

    const currentTypeListeners = currentConn.listeners.get(eventType);
    if (currentTypeListeners) {
      currentTypeListeners.delete(callback);
      // If no more listeners for this type, clean up the type entry
      if (currentTypeListeners.size === 0) {
        currentConn.listeners.delete(eventType);
      }
    }

    currentConn.refCount--;

    // If no subscribers remain, close the EventSource
    if (currentConn.refCount <= 0) {
      currentConn.es.close();
      connections.delete(url);
    }
  };
}

/**
 * Get the number of active SSE connections (for testing).
 */
export function getActiveConnectionCount(): number {
  return connections.size;
}

/**
 * Get the reference count for a specific URL (for testing).
 */
export function getRefCount(url: string): number {
  return connections.get(url)?.refCount ?? 0;
}

/**
 * Reset all connections (for testing cleanup).
 */
export function resetSSEConnections(): void {
  for (const conn of connections.values()) {
    conn.es.close();
  }
  connections.clear();
}

/**
 * SignalBus — in-memory ring buffer for WaggleDance v2 signals on
 * the local sidecar.
 *
 * Phase 1B scope: persistence is in-memory only. Signals survive
 * until the sidecar restarts or the buffer rolls over. This is
 * intentional — the live activity bus does not need durable storage
 * for "what happened in the last hour"; durable signals belong in
 * the memory substrate (Phase 1D may persist important signals as
 * frames).
 *
 * Subscribers receive new signals via a simple emitter callback.
 * The SSE / WebSocket adapter (Phase 1C) plugs in here.
 *
 * Thread-safety: the sidecar is single-threaded Node, so a plain
 * array suffices. No locking needed.
 */

import type { WaggleMessage } from '@waggle/shared';

/**
 * Maximum signals kept in the ring buffer. Tuned for "last hour of
 * activity for a chatty user" — 500 events at typical signal rates
 * (~5/min sustained) is ~100 minutes of history.
 */
export const DEFAULT_BUFFER_SIZE = 500;

export interface SignalFilter {
  /** Filter to a specific subtype. */
  subtype?: WaggleMessage['subtype'];
  /** Filter to a specific tool (matches content.tool field if set). */
  tool?: string;
  /** Filter to a specific team. */
  teamId?: string;
  /** Max number of signals to return. Default: all. */
  limit?: number;
  /** Return signals created after this ISO timestamp. */
  since?: string;
}

export type SignalSubscriber = (signal: WaggleMessage) => void;

export class SignalBus {
  private buffer: WaggleMessage[] = [];
  private subscribers: Set<SignalSubscriber> = new Set();
  private readonly capacity: number;

  constructor(capacity: number = DEFAULT_BUFFER_SIZE) {
    if (capacity <= 0) {
      throw new Error('SignalBus capacity must be > 0');
    }
    this.capacity = capacity;
  }

  /**
   * Append a signal to the ring buffer and notify subscribers.
   * Returns the appended signal (useful for chaining).
   */
  record(signal: WaggleMessage): WaggleMessage {
    this.buffer.push(signal);
    if (this.buffer.length > this.capacity) {
      // Drop the oldest signal. We use shift() because reads are
      // ordered oldest→newest; ring-rotate would complicate the API.
      this.buffer.shift();
    }
    // Notify subscribers synchronously; any subscriber error is
    // contained so one bad subscriber can't poison the bus.
    for (const sub of this.subscribers) {
      try {
        sub(signal);
      } catch {
        /* swallow — bus continues operating */
      }
    }
    return signal;
  }

  /**
   * Return a snapshot of signals matching the given filter.
   * Returns newest first (reverse-chronological). Default limit
   * is the full buffer.
   */
  query(filter: SignalFilter = {}): WaggleMessage[] {
    let results = this.buffer.slice();
    if (filter.subtype) {
      results = results.filter((s) => s.subtype === filter.subtype);
    }
    if (filter.tool) {
      const tool = filter.tool;
      results = results.filter((s) => s.content.tool === tool);
    }
    if (filter.teamId) {
      const teamId = filter.teamId;
      results = results.filter((s) => s.teamId === teamId);
    }
    if (filter.since) {
      const sinceMs = Date.parse(filter.since);
      if (!Number.isNaN(sinceMs)) {
        results = results.filter((s) => s.createdAt.getTime() > sinceMs);
      }
    }
    // Newest first.
    results.reverse();
    if (filter.limit && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }
    return results;
  }

  /**
   * Subscribe to new signals. Returns an unsubscribe function.
   * Subscribers are called synchronously when a signal is recorded;
   * heavy work should be deferred (setImmediate / queueMicrotask).
   */
  subscribe(sub: SignalSubscriber): () => void {
    this.subscribers.add(sub);
    return () => {
      this.subscribers.delete(sub);
    };
  }

  /** Total signals currently buffered (≤ capacity). */
  get size(): number {
    return this.buffer.length;
  }

  /** Clear the buffer. Used in tests. */
  clear(): void {
    this.buffer.length = 0;
  }
}

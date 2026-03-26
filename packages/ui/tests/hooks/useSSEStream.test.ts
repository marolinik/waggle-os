import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  subscribeSSE,
  getActiveConnectionCount,
  getRefCount,
  resetSSEConnections,
} from '../../src/hooks/useSSEStream.js';

// ── Mock EventSource ─────────────────────────────────────────────────────

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private eventListeners = new Map<string, EventListener[]>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    const existing = this.eventListeners.get(type) ?? [];
    existing.push(listener);
    this.eventListeners.set(type, existing);
  }

  removeEventListener(type: string, listener: EventListener): void {
    const existing = this.eventListeners.get(type) ?? [];
    this.eventListeners.set(type, existing.filter(l => l !== listener));
  }

  close(): void {
    this.closed = true;
  }

  // Test helper: simulate a named event
  _emit(type: string, data: string): void {
    const event = new MessageEvent(type, { data });
    if (type === 'message' && this.onmessage) {
      this.onmessage(event);
    }
    const listeners = this.eventListeners.get(type) ?? [];
    for (const l of listeners) {
      l(event);
    }
  }

  static reset(): void {
    MockEventSource.instances = [];
  }
}

// Install the mock
(globalThis as any).EventSource = MockEventSource;

describe('useSSEStream', () => {
  beforeEach(() => {
    resetSSEConnections();
    MockEventSource.reset();
  });

  it('creates one EventSource for multiple subscribers on same URL', () => {
    const url = 'http://localhost:3333/api/notifications/stream';
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const unsub1 = subscribeSSE(url, 'message', cb1);
    const unsub2 = subscribeSSE(url, 'subagent_status', cb2);

    // Only one EventSource should have been created
    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toBe(url);

    // Active connection count should be 1
    expect(getActiveConnectionCount()).toBe(1);
    // Ref count should be 2
    expect(getRefCount(url)).toBe(2);

    unsub1();
    unsub2();
  });

  it('closes EventSource when last subscriber unsubscribes', () => {
    const url = 'http://localhost:3333/api/notifications/stream';
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const unsub1 = subscribeSSE(url, 'message', cb1);
    const unsub2 = subscribeSSE(url, 'subagent_status', cb2);

    expect(getActiveConnectionCount()).toBe(1);

    unsub1();
    expect(getActiveConnectionCount()).toBe(1); // Still one subscriber
    expect(getRefCount(url)).toBe(1);

    unsub2();
    expect(getActiveConnectionCount()).toBe(0); // Connection closed
    expect(MockEventSource.instances[0].closed).toBe(true);
  });

  it('dispatches message events to the correct subscriber', () => {
    const url = 'http://localhost:3333/api/notifications/stream';
    const messageCb = vi.fn();
    const statusCb = vi.fn();

    subscribeSSE(url, 'message', messageCb);
    subscribeSSE(url, 'subagent_status', statusCb);

    const es = MockEventSource.instances[0];

    // Simulate a message event
    es._emit('message', JSON.stringify({ type: 'notification', title: 'test' }));
    expect(messageCb).toHaveBeenCalledTimes(1);
    expect(statusCb).not.toHaveBeenCalled();

    // Simulate a subagent_status event
    es._emit('subagent_status', JSON.stringify({ agents: [] }));
    expect(statusCb).toHaveBeenCalledTimes(1);
    expect(messageCb).toHaveBeenCalledTimes(1); // Still only 1

    resetSSEConnections();
  });

  it('creates separate connections for different URLs', () => {
    const url1 = 'http://localhost:3333/api/notifications/stream';
    const url2 = 'http://localhost:4444/api/notifications/stream';

    const unsub1 = subscribeSSE(url1, 'message', vi.fn());
    const unsub2 = subscribeSSE(url2, 'message', vi.fn());

    expect(MockEventSource.instances.length).toBe(2);
    expect(getActiveConnectionCount()).toBe(2);

    unsub1();
    unsub2();
  });

  it('only one EventSource URL even with both useNotifications and useSubAgentStatus patterns', () => {
    const url = 'http://localhost:3333/api/notifications/stream';

    // Simulate what useNotifications does
    const notifCb = vi.fn();
    const unsub1 = subscribeSSE(url, 'message', notifCb);

    // Simulate what useSubAgentStatus does
    const statusCb = vi.fn();
    const suggestionCb = vi.fn();
    const unsub2 = subscribeSSE(url, 'subagent_status', statusCb);
    const unsub3 = subscribeSSE(url, 'workflow_suggestion', suggestionCb);

    // Only ONE EventSource should exist
    expect(MockEventSource.instances.length).toBe(1);
    expect(getActiveConnectionCount()).toBe(1);
    expect(getRefCount(url)).toBe(3);

    unsub1();
    unsub2();
    unsub3();

    expect(getActiveConnectionCount()).toBe(0);
  });

  it('unsubscribing one callback does not affect others on same event type', () => {
    const url = 'http://localhost:3333/api/notifications/stream';
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const unsub1 = subscribeSSE(url, 'message', cb1);
    subscribeSSE(url, 'message', cb2);

    const es = MockEventSource.instances[0];

    // Both should receive events
    es._emit('message', '{"test": true}');
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);

    // Unsub cb1
    unsub1();

    // Only cb2 should receive
    es._emit('message', '{"test": true}');
    expect(cb1).toHaveBeenCalledTimes(1); // Still 1
    expect(cb2).toHaveBeenCalledTimes(2);

    resetSSEConnections();
  });
});

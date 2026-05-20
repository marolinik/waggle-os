/**
 * AI-OS Phase 1B — SignalBus unit tests.
 *
 * Hermetic — no server, no DB. Tests the ring-buffer + subscriber
 * mechanics directly.
 */

import { describe, it, expect, vi } from 'vitest';
import { SignalBus, DEFAULT_BUFFER_SIZE } from '../src/local/signal-bus.js';
import type { WaggleMessage } from '@waggle/shared';

function makeSignal(overrides?: Partial<WaggleMessage>): WaggleMessage {
  return {
    id: 'sig-' + Math.random().toString(36).slice(2),
    teamId: 'personal::test',
    senderId: 'test-hook',
    type: 'broadcast',
    subtype: 'discovery',
    content: {},
    referenceId: null,
    routing: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('SignalBus', () => {
  it('rejects non-positive capacity', () => {
    expect(() => new SignalBus(0)).toThrow();
    expect(() => new SignalBus(-1)).toThrow();
  });

  it('uses DEFAULT_BUFFER_SIZE when capacity not specified', () => {
    const bus = new SignalBus();
    for (let i = 0; i < DEFAULT_BUFFER_SIZE + 50; i++) {
      bus.record(makeSignal({ id: `s-${i}` }));
    }
    expect(bus.size).toBe(DEFAULT_BUFFER_SIZE);
  });

  it('records signals and reports size', () => {
    const bus = new SignalBus(10);
    expect(bus.size).toBe(0);
    bus.record(makeSignal());
    bus.record(makeSignal());
    expect(bus.size).toBe(2);
  });

  it('drops oldest when capacity exceeded', () => {
    const bus = new SignalBus(3);
    bus.record(makeSignal({ id: 'a' }));
    bus.record(makeSignal({ id: 'b' }));
    bus.record(makeSignal({ id: 'c' }));
    bus.record(makeSignal({ id: 'd' }));
    expect(bus.size).toBe(3);
    const all = bus.query();
    // newest first: d, c, b — a evicted
    expect(all.map((s) => s.id)).toEqual(['d', 'c', 'b']);
  });

  it('returns signals newest-first by default', () => {
    const bus = new SignalBus(10);
    bus.record(makeSignal({ id: 'old', createdAt: new Date(2020, 0, 1) }));
    bus.record(makeSignal({ id: 'new', createdAt: new Date(2026, 5, 19) }));
    const results = bus.query();
    expect(results[0].id).toBe('new');
    expect(results[1].id).toBe('old');
  });

  it('filters by subtype', () => {
    const bus = new SignalBus(10);
    bus.record(makeSignal({ id: 'd1', subtype: 'discovery' }));
    bus.record(makeSignal({ id: 'm1', subtype: 'knowledge_match', type: 'response' }));
    bus.record(makeSignal({ id: 'd2', subtype: 'discovery' }));
    const discoveries = bus.query({ subtype: 'discovery' });
    expect(discoveries.map((s) => s.id)).toEqual(['d2', 'd1']);
  });

  it('filters by tool (content.tool)', () => {
    const bus = new SignalBus(10);
    bus.record(makeSignal({ id: 'a', content: { tool: 'claude-code' } }));
    bus.record(makeSignal({ id: 'b', content: { tool: 'cursor' } }));
    bus.record(makeSignal({ id: 'c', content: { tool: 'claude-code' } }));
    const cc = bus.query({ tool: 'claude-code' });
    expect(cc.map((s) => s.id)).toEqual(['c', 'a']);
  });

  it('filters by teamId', () => {
    const bus = new SignalBus(10);
    bus.record(makeSignal({ id: 'p1', teamId: 'personal::marko' }));
    bus.record(makeSignal({ id: 't1', teamId: 'team-egzakta' }));
    bus.record(makeSignal({ id: 'p2', teamId: 'personal::marko' }));
    const personal = bus.query({ teamId: 'personal::marko' });
    expect(personal.map((s) => s.id)).toEqual(['p2', 'p1']);
  });

  it('filters by since (ISO string)', () => {
    const bus = new SignalBus(10);
    bus.record(makeSignal({ id: 'old', createdAt: new Date('2020-01-01T00:00:00Z') }));
    bus.record(makeSignal({ id: 'mid', createdAt: new Date('2025-06-01T00:00:00Z') }));
    bus.record(makeSignal({ id: 'new', createdAt: new Date('2026-05-19T00:00:00Z') }));
    const fresh = bus.query({ since: '2025-01-01T00:00:00Z' });
    expect(fresh.map((s) => s.id)).toEqual(['new', 'mid']);
  });

  it('honors limit', () => {
    const bus = new SignalBus(20);
    for (let i = 0; i < 10; i++) bus.record(makeSignal({ id: `s-${i}` }));
    expect(bus.query({ limit: 3 })).toHaveLength(3);
  });

  it('notifies subscribers on record', () => {
    const bus = new SignalBus(10);
    const sub = vi.fn();
    bus.subscribe(sub);
    const sig = makeSignal();
    bus.record(sig);
    expect(sub).toHaveBeenCalledWith(sig);
  });

  it('unsubscribe stops further notifications', () => {
    const bus = new SignalBus(10);
    const sub = vi.fn();
    const unsub = bus.subscribe(sub);
    bus.record(makeSignal());
    unsub();
    bus.record(makeSignal());
    expect(sub).toHaveBeenCalledTimes(1);
  });

  it('isolates subscriber errors', () => {
    const bus = new SignalBus(10);
    const good = vi.fn();
    bus.subscribe(() => {
      throw new Error('bad subscriber');
    });
    bus.subscribe(good);
    bus.record(makeSignal());
    expect(good).toHaveBeenCalled();
  });

  it('clear() empties the buffer', () => {
    const bus = new SignalBus(10);
    bus.record(makeSignal());
    bus.record(makeSignal());
    bus.clear();
    expect(bus.size).toBe(0);
    expect(bus.query()).toEqual([]);
  });
});

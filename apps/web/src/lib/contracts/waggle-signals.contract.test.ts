/**
 * Contract test — GET /api/waggle/signals (getTypeConfig)
 *
 * Incident: FR #2 (commit ea04110) — WaggleDanceApp crashed because
 * signal.type values emitted by fleet.ts (`agent:started`, `tool:called`,
 * `agent:completed`) were not in the frontend typeConfig record, causing
 * destructuring of undefined to throw at render time.
 *
 * Fix: getTypeConfig() returns FALLBACK_TYPE_CONFIG for any unknown type
 * string, using the raw type as the display label.
 *
 * Server emits signals with a wider type set than the WaggleSignal union:
 *   'discovery' | 'handoff' | 'insight' | 'alert' | 'coordination'  ← client union
 *   + 'agent:started' | 'tool:called' | 'agent:completed' | 'agent:spawned' ...
 *
 * These tests verify that getTypeConfig handles the full server-emit space.
 */
import { describe, it, expect } from 'vitest';
import {
  getTypeConfig,
  WAGGLE_TYPE_CONFIG,
  FALLBACK_TYPE_CONFIG,
} from '../waggle-signal-types';

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Known type values from the client WaggleSignal union. */
const KNOWN_CLIENT_TYPES = ['discovery', 'handoff', 'insight', 'alert', 'coordination'] as const;

/**
 * Type values the server currently emits that fall outside the client union
 * (from fleet.ts emitWaggleSignal calls: agent:spawned, agent:started,
 * tool:called, agent:completed, agent:error).
 */
const SERVER_ONLY_TYPES = [
  'agent:spawned',
  'agent:started',
  'tool:called',
  'agent:completed',
  'agent:error',
] as const;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('getTypeConfig — waggle signal display contract', () => {
  it.each(KNOWN_CLIENT_TYPES)(
    'known type "%s" resolves to its dedicated config entry',
    (type) => {
      const cfg = getTypeConfig(type);
      expect(cfg).toBe(WAGGLE_TYPE_CONFIG[type]);
      expect(typeof cfg.label).toBe('string');
      expect(cfg.label.length).toBeGreaterThan(0);
      expect(typeof cfg.color).toBe('string');
      expect(cfg.icon).toBeDefined();
    },
  );

  it.each(SERVER_ONLY_TYPES)(
    'server-only type "%s" does NOT throw and returns a usable config',
    (type) => {
      expect(() => getTypeConfig(type)).not.toThrow();
      const cfg = getTypeConfig(type);
      expect(cfg).toBeDefined();
      expect(typeof cfg.label).toBe('string');
      expect(typeof cfg.color).toBe('string');
      expect(cfg.icon).toBeDefined();
    },
  );

  it('unknown type uses the raw type string as its label', () => {
    const cfg = getTypeConfig('agent:started');
    expect(cfg.label).toBe('agent:started');
  });

  it('unknown type inherits FALLBACK_TYPE_CONFIG color and icon', () => {
    const cfg = getTypeConfig('some-future-server-type');
    expect(cfg.color).toBe(FALLBACK_TYPE_CONFIG.color);
    expect(cfg.icon).toBe(FALLBACK_TYPE_CONFIG.icon);
  });

  it('completely arbitrary string does not throw', () => {
    expect(() => getTypeConfig('')).not.toThrow();
    expect(() => getTypeConfig('💥')).not.toThrow();
    expect(() => getTypeConfig('a'.repeat(500))).not.toThrow();
  });

  it('known type label matches the human-readable capitalised form', () => {
    expect(getTypeConfig('discovery').label).toBe('Discovery');
    expect(getTypeConfig('handoff').label).toBe('Handoff');
    expect(getTypeConfig('insight').label).toBe('Insight');
    expect(getTypeConfig('alert').label).toBe('Alert');
    expect(getTypeConfig('coordination').label).toBe('Coordination');
  });

  it('each known type config has a non-null icon (renderable by React)', () => {
    for (const type of KNOWN_CLIENT_TYPES) {
      const cfg = getTypeConfig(type);
      // Lucide icons are forwardRef objects (typeof === 'object'), not plain
      // functions — React renders both. Check it's not null/undefined.
      expect(cfg.icon).toBeDefined();
      expect(cfg.icon).not.toBeNull();
    }
  });

  it('FALLBACK_TYPE_CONFIG itself has a non-null icon (renderable by React)', () => {
    expect(FALLBACK_TYPE_CONFIG.icon).toBeDefined();
    expect(FALLBACK_TYPE_CONFIG.icon).not.toBeNull();
  });
});

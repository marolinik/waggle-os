/**
 * Phase 4.1 — settings tier-filter tests.
 *
 * Spec: docs/ux-disclosure-levels.md r2 §"Settings app — filter sections per tier".
 * Mapping live SettingsApp tabs to spec buckets:
 *   - general / models / billing                 → Essential (always)
 *   - permissions / team / backup / advanced     → Standard+
 *   - enterprise (compliance + governance)       → Power only
 *
 * Notes:
 *   - billing tab visibility within Essential is gated separately by user's
 *     billing tier (Trial/Pro/Teams) — that's a render-side concern in SettingsApp,
 *     not the dock-tier filter. This helper only handles the UserTier (dock-tier)
 *     dimension.
 *   - team tab has its own LOCKED_TABS gate for non-TEAMS billing tiers — that's
 *     a separate layer, also not this helper's job.
 */
import { describe, it, expect } from 'vitest';
import {
  ESSENTIAL_SETTINGS_TAB_IDS,
  STANDARD_SETTINGS_TAB_IDS,
  POWER_SETTINGS_TAB_IDS,
  getSettingsTabsForTier,
  resolveActiveSettingsTab,
} from './settings-tier-filter';

const ALL_TABS = [
  { id: 'general' },
  { id: 'models' },
  { id: 'billing' },
  { id: 'permissions' },
  { id: 'team' },
  { id: 'backup' },
  { id: 'enterprise' },
  { id: 'advanced' },
] as const;

describe('ESSENTIAL_SETTINGS_TAB_IDS', () => {
  it('contains exactly 3 IDs: general, models, billing', () => {
    expect(ESSENTIAL_SETTINGS_TAB_IDS).toEqual(['general', 'models', 'billing']);
  });

  it('does NOT include any operational/advanced tabs', () => {
    for (const id of ['permissions', 'team', 'backup', 'enterprise', 'advanced']) {
      expect(ESSENTIAL_SETTINGS_TAB_IDS).not.toContain(id);
    }
  });
});

describe('STANDARD_SETTINGS_TAB_IDS', () => {
  it('extends Essential with operational tabs (no enterprise)', () => {
    expect(STANDARD_SETTINGS_TAB_IDS).toEqual([
      'general', 'models', 'billing',
      'permissions', 'team', 'backup', 'advanced',
    ]);
  });

  it('does NOT include enterprise (compliance/governance is Power-only)', () => {
    expect(STANDARD_SETTINGS_TAB_IDS).not.toContain('enterprise');
  });
});

describe('POWER_SETTINGS_TAB_IDS', () => {
  it('includes all 8 tabs', () => {
    expect(POWER_SETTINGS_TAB_IDS).toHaveLength(8);
    for (const t of ALL_TABS) {
      expect(POWER_SETTINGS_TAB_IDS).toContain(t.id);
    }
  });
});

describe('getSettingsTabsForTier', () => {
  it('returns 3 essential tabs for simple tier', () => {
    const result = getSettingsTabsForTier('simple', ALL_TABS);
    expect(result.map(t => t.id)).toEqual(['general', 'models', 'billing']);
  });

  it('returns 7 standard tabs for professional tier (no enterprise)', () => {
    const result = getSettingsTabsForTier('professional', ALL_TABS);
    expect(result.map(t => t.id)).toEqual([
      'general', 'models', 'billing',
      'permissions', 'team', 'backup', 'advanced',
    ]);
  });

  it('returns all 8 tabs for power tier', () => {
    const result = getSettingsTabsForTier('power', ALL_TABS);
    expect(result.length).toBe(ALL_TABS.length);
  });

  it('returns all 8 tabs for admin tier (admin = power in TIER_DOCK_CONFIG)', () => {
    const result = getSettingsTabsForTier('admin', ALL_TABS);
    expect(result.length).toBe(ALL_TABS.length);
  });

  it('preserves the input ordering (not the spec-list ordering)', () => {
    // Reorder input — output should follow input order, not the constant's order
    const reordered = [
      { id: 'billing' },
      { id: 'general' },
      { id: 'models' },
      { id: 'enterprise' },
    ];
    const result = getSettingsTabsForTier('simple', reordered);
    expect(result.map(t => t.id)).toEqual(['billing', 'general', 'models']);
  });

  it('handles empty input gracefully', () => {
    expect(getSettingsTabsForTier('simple', [])).toEqual([]);
    expect(getSettingsTabsForTier('professional', [])).toEqual([]);
  });

  it('drops tabs that are not recognized in any tier set', () => {
    // Defensive: if a future tab is added without updating the filter, simple
    // mode will hide it (safe default — opt-in to surface, not opt-out).
    const withUnknown = [...ALL_TABS, { id: 'mystery-tab' }];
    const result = getSettingsTabsForTier('simple', withUnknown);
    expect(result.find(t => t.id === 'mystery-tab')).toBeUndefined();
  });

  it('power tier surfaces unknown tabs (least-surprise)', () => {
    // Power = "see everything." Unknown tabs go to power so dev/admin users
    // can see new surfaces during rollout before the filter list catches up.
    const withUnknown = [...ALL_TABS, { id: 'mystery-tab' }];
    const result = getSettingsTabsForTier('power', withUnknown);
    expect(result.find(t => t.id === 'mystery-tab')).toBeDefined();
  });
});

describe('resolveActiveSettingsTab', () => {
  it('keeps the active tab if still visible at the given tier', () => {
    const result = resolveActiveSettingsTab('simple', 'general', ALL_TABS);
    expect(result).toBe('general');
  });

  it('falls back to general when the active tab is filtered out', () => {
    // User was on `advanced` at professional, then drops to simple
    const result = resolveActiveSettingsTab('simple', 'advanced', ALL_TABS);
    expect(result).toBe('general');
  });

  it('falls back to general when the active tab is unknown', () => {
    const result = resolveActiveSettingsTab('simple', 'mystery-tab', ALL_TABS);
    expect(result).toBe('general');
  });

  it('preserves enterprise when on power tier', () => {
    const result = resolveActiveSettingsTab('power', 'enterprise', ALL_TABS);
    expect(result).toBe('enterprise');
  });

  it('drops enterprise when on professional tier (Power-only tab)', () => {
    const result = resolveActiveSettingsTab('professional', 'enterprise', ALL_TABS);
    expect(result).toBe('general');
  });

  it('falls back to first visible tab when general itself is hidden (defensive)', () => {
    // If `tabs` array is reordered or shrunk to exclude general, fall back to first
    const noGeneral = [{ id: 'models' }, { id: 'billing' }];
    const result = resolveActiveSettingsTab('simple', 'permissions', noGeneral);
    expect(result).toBe('models');
  });

  it('returns null only when there are zero visible tabs (truly degenerate input)', () => {
    const result = resolveActiveSettingsTab('simple', 'general', []);
    expect(result).toBeNull();
  });
});

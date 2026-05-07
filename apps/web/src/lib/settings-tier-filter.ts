/**
 * Phase 4.1 — Settings tab tier-filter helpers.
 *
 * Source spec: `docs/ux-disclosure-levels.md` r2 §"Settings app — filter sections per tier".
 *
 * Maps the 8 SettingsApp tabs (general / models / billing / permissions / team /
 * backup / enterprise / advanced) to the 3-level UX disclosure system. The
 * `team` tab additionally gates on billing tier (TEAMS-only) via SettingsApp's
 * own LOCKED_TABS map — that's a separate layer this helper doesn't touch.
 *
 * Design choice: power-tier surfaces unknown tab IDs by default. If a future
 * tab is added to SettingsApp without updating this filter, a power user (the
 * one most likely to be a dev/admin doing the rollout) sees it; simple/standard
 * users don't get a half-shipped surface.
 */
import type { UserTier } from '@/lib/dock-tiers';

/** 3 tabs visible at Essential — clean and focused. */
export const ESSENTIAL_SETTINGS_TAB_IDS = [
  'general',  // Profile + Display + dock-experience selector + theme
  'models',   // Provider, API key, default/fallback model, daily budget
  'billing',  // Trial / Pro / Teams subscription (visibility within depends on user's billing tier)
] as const;

/** 7 tabs visible at Standard — Essential + workspace ops. */
export const STANDARD_SETTINGS_TAB_IDS = [
  ...ESSENTIAL_SETTINGS_TAB_IDS,
  'permissions',  // Default autonomy + external gates (Tools surface)
  'team',         // Team Sync URL + token (still gated by billing TEAMS LOCKED_TABS layer)
  'backup',       // Memory backup + restore
  'advanced',     // MCP servers + dev mode + telemetry export
] as const;

/** All 8 tabs visible at Power — full access. */
export const POWER_SETTINGS_TAB_IDS = [
  ...STANDARD_SETTINGS_TAB_IDS,
  'enterprise',   // Compliance + audit trail + governance (gated by feature flag too)
] as const;

const ESSENTIAL_SET = new Set<string>(ESSENTIAL_SETTINGS_TAB_IDS);
const STANDARD_SET = new Set<string>(STANDARD_SETTINGS_TAB_IDS);
// Power has no Set — anything passes (least-surprise for unknown tabs)

/**
 * Filter a tab list to those visible at the given tier. Preserves input ordering
 * so callers don't lose their array sort.
 *
 * - `simple`        → 3 essentials only
 * - `professional`  → 7 standard tabs
 * - `power` / `admin` → all input tabs (including unknowns — least-surprise)
 */
export function getSettingsTabsForTier<T extends { id: string }>(
  tier: UserTier,
  all: readonly T[],
): readonly T[] {
  if (tier === 'power' || tier === 'admin') return all;
  if (all.length === 0) return all;

  const allowSet = tier === 'simple' ? ESSENTIAL_SET : STANDARD_SET;
  return all.filter(t => allowSet.has(t.id));
}

/**
 * Resolve the active tab against the visible-tab set. If the user's currently-
 * active tab gets filtered out (e.g. they downgraded from Standard to Essential
 * while sitting on the `advanced` tab), fall back to `general` — the always-
 * visible default. If `general` itself is missing from the input (degenerate
 * case — caller passed a custom list), fall back to the first visible tab.
 *
 * Returns `null` only if there are literally zero visible tabs (caller must
 * handle this — typically by rendering an empty Settings shell).
 */
export function resolveActiveSettingsTab<T extends { id: string }>(
  tier: UserTier,
  active: string,
  all: readonly T[],
): string | null {
  const visible = getSettingsTabsForTier(tier, all);
  if (visible.length === 0) return null;
  if (visible.some(t => t.id === active)) return active;
  // Prefer general (the canonical default) if it's in the visible set
  const general = visible.find(t => t.id === 'general');
  return general ? general.id : visible[0].id;
}

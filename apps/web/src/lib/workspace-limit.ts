import { TIER_CAPABILITIES, type Tier } from '@waggle/shared';

/**
 * Client-side workspace-creation gate — the exact mirror of the server rule in
 * `packages/server/src/local/routes/workspaces.ts` (the authoritative check):
 * a tier whose `workspaceLimit` is < 0 is unlimited; otherwise creation is
 * blocked once `currentCount` reaches the limit.
 *
 * Why this exists: the dialog previously gated off the legacy
 * `feature-gates.ts` `multi-workspace` flag (minTier:'teams'), which blocked
 * FREE (and PRO) at workspace #2 even though the server — reading the canonical
 * `tiers.ts` — already allows FREE up to 5 and PRO unlimited. The two disagreed,
 * so the paywall fired earlier than the backend would actually reject. Keying
 * the client off the same `TIER_CAPABILITIES.workspaceLimit` the server uses
 * makes them agree by construction.
 */
export function canCreateWorkspaceAtTier(tier: Tier, currentCount: number): boolean {
  const limit = TIER_CAPABILITIES[tier]?.workspaceLimit ?? -1;
  return limit < 0 || currentCount < limit;
}

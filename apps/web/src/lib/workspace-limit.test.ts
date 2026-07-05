import { describe, it, expect } from 'vitest';
import { TIER_CAPABILITIES } from '@waggle/shared';
import { canCreateWorkspaceAtTier } from './workspace-limit';

describe('canCreateWorkspaceAtTier', () => {
  it('FREE allows creation up to its workspaceLimit, then blocks (matches tiers.ts = 5)', () => {
    const limit = TIER_CAPABILITIES.FREE.workspaceLimit;
    expect(limit).toBe(5); // canonical value — the whole point of the fix
    expect(canCreateWorkspaceAtTier('FREE', 0)).toBe(true);
    expect(canCreateWorkspaceAtTier('FREE', limit - 1)).toBe(true); // 5th workspace allowed
    expect(canCreateWorkspaceAtTier('FREE', limit)).toBe(false);    // 6th blocked
  });

  it('PRO is unlimited (workspaceLimit -1) — never blocks', () => {
    expect(TIER_CAPABILITIES.PRO.workspaceLimit).toBe(-1);
    expect(canCreateWorkspaceAtTier('PRO', 0)).toBe(true);
    expect(canCreateWorkspaceAtTier('PRO', 999)).toBe(true);
  });

  it('TEAMS / ENTERPRISE / TRIAL are unlimited', () => {
    for (const t of ['TEAMS', 'ENTERPRISE', 'TRIAL'] as const) {
      expect(canCreateWorkspaceAtTier(t, 999)).toBe(true);
    }
  });

  it('mirrors the server rule: blocks exactly at currentCount >= limit for limited tiers', () => {
    // The server (workspaces.ts) blocks when `currentCount >= caps.workspaceLimit`.
    // This helper must return the negation for every count around the boundary.
    const limit = TIER_CAPABILITIES.FREE.workspaceLimit;
    for (let count = 0; count <= limit + 2; count++) {
      const serverWouldAllow = !(limit > 0 && count >= limit);
      expect(canCreateWorkspaceAtTier('FREE', count)).toBe(serverWouldAllow);
    }
  });
});

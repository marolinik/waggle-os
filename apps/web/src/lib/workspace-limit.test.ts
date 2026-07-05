import { describe, it, expect } from 'vitest';
import { TIER_CAPABILITIES } from '@waggle/shared';
import { canCreateWorkspaceAtTier } from './workspace-limit';

describe('canCreateWorkspaceAtTier', () => {
  it('FREE (Solo) is unlimited (workspaceLimit -1) — never blocks', () => {
    // Solo/Team migration raised FREE to unlimited workspaces — the whole point.
    expect(TIER_CAPABILITIES.FREE.workspaceLimit).toBe(-1);
    expect(canCreateWorkspaceAtTier('FREE', 0)).toBe(true);
    expect(canCreateWorkspaceAtTier('FREE', 999)).toBe(true);
  });

  it('TEAMS / ENTERPRISE / TRIAL are unlimited', () => {
    for (const t of ['TEAMS', 'ENTERPRISE', 'TRIAL'] as const) {
      expect(canCreateWorkspaceAtTier(t, 999)).toBe(true);
    }
  });

  it('mirrors the server rule: blocks exactly when limit > 0 && currentCount >= limit', () => {
    // The server (workspaces.ts) blocks when `limit > 0 && currentCount >= limit`.
    // Every canonical tier is now unlimited (-1), so the helper must always allow —
    // the negation formula still holds around every boundary.
    for (const t of ['FREE', 'TEAMS', 'ENTERPRISE', 'TRIAL'] as const) {
      const limit = TIER_CAPABILITIES[t].workspaceLimit;
      for (let count = 0; count <= 8; count++) {
        const serverWouldAllow = !(limit > 0 && count >= limit);
        expect(canCreateWorkspaceAtTier(t, count)).toBe(serverWouldAllow);
      }
    }
  });
});

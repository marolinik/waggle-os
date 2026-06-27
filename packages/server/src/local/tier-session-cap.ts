import type { Tier } from '@waggle/shared';

export function maxWorkspaceSessionsForTier(tier: Tier): number {
  if (tier === 'FREE') return 3;
  if (tier === 'PRO') return 10;
  if (tier === 'TEAMS') return 25;
  return 100;
}

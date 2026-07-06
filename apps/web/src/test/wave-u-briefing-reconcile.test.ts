/**
 * Wave U Lane B (item 2) — numbers reconciliation.
 *
 * The briefing modal showed a different workspace count than the Home hero it
 * overlays ("2 workspaces" vs "6 workspaces waiting"): the hero reads the
 * canonical visible count (workspaceCounts().visible — non-archived, non-dev-
 * noise) while the modal's brag line read computeBragSummary's own
 * summaries.length (a capped, archived-inclusive subset). fetchBriefingData now
 * reconciles the modal onto the SAME workspaceCounts().visible, so the two
 * surfaces can never state two truths about one store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  adapter: {
    getWorkspaces: vi.fn(),
    searchMemory: vi.fn(),
    getMemoryStats: vi.fn(),
    getWorkspaceContext: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import { fetchBriefingData } from '@/components/os/overlays/LoginBriefing';
import { formatBragLine } from '@/lib/login-briefing-brag';
import { workspaceCounts } from '@/lib/workspace-counts';

// 6 real (active, non-noise) + 2 archived + 1 dev-noise name. The hero counts 6;
// the modal's OLD subset was min(5, non-noise) = 5 (archived pass the name filter,
// then .slice(0,5) caps) — the exact "counts disagree" the judges flagged.
const WORKSPACES = [
  { id: 'w1', name: 'Alpha', group: 'Personal', status: 'active' as const },
  { id: 'w2', name: 'Bravo', group: 'Personal', status: 'active' as const },
  { id: 'w3', name: 'Charlie', group: 'Personal', status: 'active' as const },
  { id: 'w4', name: 'Delta', group: 'Personal', status: 'active' as const },
  { id: 'w5', name: 'Echo', group: 'Personal', status: 'active' as const },
  { id: 'w6', name: 'Foxtrot', group: 'Personal', status: 'active' as const },
  { id: 'a1', name: 'ArchivedOne', group: 'Personal', status: 'archived' as const },
  { id: 'a2', name: 'ArchivedTwo', group: 'Personal', status: 'archived' as const },
  { id: 'n1', name: 'test-noise', group: 'Personal', status: 'active' as const },
];

describe('fetchBriefingData numbers reconciliation (Wave U Lane B item 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adapter.getWorkspaces.mockResolvedValue(WORKSPACES);
    mocks.adapter.searchMemory.mockResolvedValue([]);
    // total.frames === 0 → formatBragLine renders the "across N workspaces" clause.
    mocks.adapter.getMemoryStats.mockResolvedValue({ total: { frames: 0, entities: 0, relations: 0 } });
    mocks.adapter.getWorkspaceContext.mockResolvedValue({ memoryCount: 0, sessionCount: 0 });
  });

  it('brag.workspaceCount equals Home’s canonical visible count (not the capped subset)', async () => {
    const data = await fetchBriefingData();
    const heroCount = workspaceCounts(WORKSPACES).visible;
    expect(heroCount).toBe(6);                       // hero: 6 real, archived + noise excluded
    expect(data.brag.workspaceCount).toBe(heroCount); // modal now agrees
    expect(data.brag.workspaceCount).not.toBe(5);     // the old capped/archived-inclusive subset
  });

  it('the rendered brag line states the SAME count the hero shows', async () => {
    const data = await fetchBriefingData();
    expect(formatBragLine(data.brag)).toContain('across 6 workspaces');
  });
});

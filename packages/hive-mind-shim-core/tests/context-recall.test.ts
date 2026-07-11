import { describe, expect, it, vi } from 'vitest';
import type { CliBridge, MemoryHit } from '../src/cli-bridge.js';
import { recallPersonalAndWorkspace } from '../src/context-recall.js';

const personal: MemoryHit = {
  id: 1, content: 'personal preference', importance: 'important', source: 'system',
  score: 0.7, created_at: '2026-01-01T00:00:00.000Z', from: 'personal',
};
const workspace: MemoryHit = {
  id: 2, content: 'workspace decision', importance: 'important', source: 'system',
  score: 0.9, created_at: '2026-01-02T00:00:00.000Z', from: 'workspace:alpha',
};

function bridge(activeWorkspaceId?: string): CliBridge & { recallMemory: ReturnType<typeof vi.fn> } {
  const recallMemory = vi.fn(async (_query: string, options?: { workspace?: string | null }) => {
    return options?.workspace === null ? [personal] : [workspace, { ...personal, id: 99 }];
  });
  return {
    recallMemory,
    getActiveWorkspaceId: () => activeWorkspaceId,
  } as unknown as CliBridge & { recallMemory: ReturnType<typeof vi.fn> };
}

describe('recallPersonalAndWorkspace', () => {
  it('recalls only personal plus the selected workspace, ranks, and deduplicates', async () => {
    const value = bridge('alpha');
    const hits = await recallPersonalAndWorkspace(value, 'decision', { limit: 5 });
    expect(value.recallMemory.mock.calls).toEqual([
      ['decision', { limit: 5, scope: 'personal', workspace: null }],
      ['decision', { limit: 5, scope: 'current', workspace: 'alpha' }],
    ]);
    expect(hits).toEqual([workspace, personal]);
    expect(value.recallMemory.mock.calls.flat().join(' ')).not.toContain("scope: 'all'");
  });

  it('does not query another workspace when no workspace is active', async () => {
    const value = bridge();
    const hits = await recallPersonalAndWorkspace(value, '', { limit: 1 });
    expect(value.recallMemory).toHaveBeenCalledTimes(1);
    expect(hits).toEqual([personal]);
  });
});

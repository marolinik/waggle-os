import { describe, it, expect, vi } from 'vitest';
import type { HybridSearch } from '@waggle/core';
import { MemoryLinker } from '../src/memory-linker.js';

describe('MemoryLinker', () => {
  const mockSearch = {
    search: vi.fn(),
  } as unknown as HybridSearch;

  it('finds related frames above threshold', async () => {
    const linker = new MemoryLinker({ search: mockSearch, threshold: 0.1 });

    vi.mocked(mockSearch.search).mockResolvedValueOnce([
      {
        frame: { id: 1, content: 'TypeScript generics guide' } as any,
        rrfScore: 0.5,
        relevanceScore: 0.4,
        finalScore: 0.45,
      },
      {
        frame: { id: 2, content: 'Advanced type inference' } as any,
        rrfScore: 0.3,
        relevanceScore: 0.2,
        finalScore: 0.25,
      },
    ]);

    const links = await linker.findRelated('TypeScript types');

    expect(mockSearch.search).toHaveBeenCalledWith('TypeScript types', { limit: 5 });
    expect(links).toEqual([
      { frameId: 1, content: 'TypeScript generics guide', score: 0.45 },
      { frameId: 2, content: 'Advanced type inference', score: 0.25 },
    ]);
  });

  it('filters out frames below threshold', async () => {
    const linker = new MemoryLinker({ search: mockSearch, threshold: 0.3 });

    vi.mocked(mockSearch.search).mockResolvedValueOnce([
      {
        frame: { id: 3, content: 'Cooking recipes' } as any,
        rrfScore: 0.1,
        relevanceScore: 0.05,
        finalScore: 0.08,
      },
      {
        frame: { id: 4, content: 'Grocery list' } as any,
        rrfScore: 0.05,
        relevanceScore: 0.02,
        finalScore: 0.03,
      },
    ]);

    const links = await linker.findRelated('quantum physics');

    expect(links).toEqual([]);
  });
});

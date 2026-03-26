/**
 * useMemory — React hook for memory browsing state.
 *
 * Manages frames, filters, search, and stats via WaggleService.
 */

import { useState, useCallback, useEffect } from 'react';
import type { WaggleService, Frame } from '../services/types.js';
import type { FrameFilters, MemoryStats } from '../components/memory/utils.js';
import { filterFrames, sortFrames } from '../components/memory/utils.js';

export interface UseMemoryOptions {
  service: WaggleService;
  workspaceId?: string;
  mindFileSize?: number;
}

export interface UseMemoryReturn {
  frames: Frame[];
  loading: boolean;
  error: string | null;
  search: (query: string) => Promise<void>;
  filters: FrameFilters;
  setFilters: (filters: FrameFilters) => void;
  stats: MemoryStats | null;
}

/**
 * Result of a memory search operation (extracted for testability).
 */
export interface MemorySearchResult {
  frames: Frame[];
  stats: MemoryStats;
  error: null;
}

export interface MemorySearchError {
  frames: Frame[];
  stats: null;
  error: string;
}

/**
 * Core search logic — pure async function, no React dependency.
 * Extracted from the hook so it can be unit-tested without jsdom.
 */
export async function executeMemorySearch(
  service: WaggleService,
  query: string,
  filters: FrameFilters,
  workspaceId?: string,
  mindFileSize?: number,
): Promise<MemorySearchResult | MemorySearchError> {
  try {
    const scope = filters.source && filters.source !== 'all' ? filters.source : 'all';
    const results = await service.searchMemory(query, scope, workspaceId);

    let stats: MemoryStats;

    if (workspaceId) {
      try {
        const kg = await service.getKnowledgeGraph(workspaceId);
        stats = {
          totalFrames: results.length,
          entities: Array.isArray(kg.entities) ? kg.entities.length : 0,
          relations: Array.isArray(kg.relations) ? kg.relations.length : 0,
          mindFileSize,
        };
      } catch {
        stats = {
          totalFrames: results.length,
          entities: 0,
          relations: 0,
          mindFileSize,
        };
      }
    } else {
      stats = {
        totalFrames: results.length,
        entities: 0,
        relations: 0,
        mindFileSize,
      };
    }

    return { frames: results, stats, error: null };
  } catch (err) {
    return {
      frames: [],
      stats: null,
      error: err instanceof Error ? err.message : 'Search failed',
    };
  }
}

export function useMemory({ service, workspaceId, mindFileSize }: UseMemoryOptions): UseMemoryReturn {
  const [allFrames, setAllFrames] = useState<Frame[]>([]);
  const [filters, setFilters] = useState<FrameFilters>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<MemoryStats | null>(null);

  // Auto-load recent frames when workspace changes (no search query needed)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    service.listFrames(workspaceId, 50).then((frames) => {
      if (cancelled) return;
      setAllFrames(frames);
      setStats({ totalFrames: frames.length, entities: 0, relations: 0, mindFileSize });
      setError(null);
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      setAllFrames([]);
      setError(err instanceof Error ? err.message : 'Failed to load memories');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [service, workspaceId, mindFileSize]);

  const search = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);

    const result = await executeMemorySearch(service, query, filters, workspaceId, mindFileSize);

    if (result.error === null) {
      setAllFrames(result.frames);
      setStats(result.stats);
    } else {
      setError(result.error);
      setAllFrames([]);
    }

    setLoading(false);
  }, [service, workspaceId, filters, mindFileSize]);

  // Apply client-side filters and sort
  const filtered = filterFrames(allFrames, filters);
  const frames = sortFrames(filtered, 'time');

  return {
    frames,
    loading,
    error,
    search,
    filters,
    setFilters,
    stats,
  };
}

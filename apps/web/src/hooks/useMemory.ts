import { useState, useCallback, useEffect } from 'react';
import { adapter } from '@/lib/adapter';
import type { MemoryFrame } from '@/lib/types';

interface MemoryFilters {
  types: string[];
  minImportance: number;
  searchQuery: string;
}

export const useMemory = (workspaceId: string | null) => {
  const [frames, setFrames] = useState<MemoryFrame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<MemoryFrame | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<MemoryFilters>({ types: [], minImportance: 0, searchQuery: '' });
  const [entityCount, setEntityCount] = useState(0);
  const [relationCount, setRelationCount] = useState(0);

  const fetchFrames = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const data = filters.searchQuery
        ? await adapter.searchMemory(filters.searchQuery, workspaceId)
        : await adapter.getMemoryFrames(workspaceId);
      setFrames(data);
      setError(null);
      // Fetch entity/relation counts in background
      adapter.getMemoryStats().then(s => {
        setEntityCount(s.total.entities);
        setRelationCount(s.total.relations);
      }).catch(() => {});
    } catch (e) {
      console.error('[useMemory] fetch failed:', e);
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filters.searchQuery]);

  useEffect(() => { fetchFrames(); }, [fetchFrames]);

  const addFrame = useCallback(async (frame: Omit<MemoryFrame, 'id'>) => {
    const created = await adapter.addMemoryFrame(frame);
    setFrames(prev => [created, ...prev]);
  }, []);

  const editFrame = useCallback(async (id: string, data: Partial<MemoryFrame>) => {
    const updated = await adapter.updateMemoryFrame(id, data);
    setFrames(prev => prev.map(f => f.id === id ? updated : f));
  }, []);

  const incrementAccess = useCallback(async (id: string) => {
    try {
      const { accessCount } = await adapter.incrementFrameAccess(id, workspaceId ?? undefined);
      setFrames(prev => prev.map(f => f.id === id ? { ...f, metadata: { ...f.metadata, accessCount } } : f));
    } catch (err) {
      console.error('[useMemory] incrementAccess failed:', err);
    }
  }, [workspaceId]);

  const deleteFrame = useCallback(async (id: string) => {
    await adapter.deleteMemoryFrame(id);
    setFrames(prev => prev.filter(f => f.id !== id));
    if (selectedFrame?.id === id) setSelectedFrame(null);
  }, [selectedFrame]);

  const filteredFrames = frames.filter(f => {
    if (filters.types.length && !filters.types.includes(f.type)) return false;
    if (f.importance < filters.minImportance) return false;
    return true;
  });

  return {
    frames: filteredFrames, selectedFrame, setSelectedFrame,
    loading, error, filters, setFilters,
    addFrame, editFrame, deleteFrame, incrementAccess, refresh: fetchFrames,
    stats: { total: frames.length, filtered: filteredFrames.length, entities: entityCount, relations: relationCount },
  };
};

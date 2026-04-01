import { useState, useEffect, useCallback } from 'react';
import { adapter } from '@/lib/adapter';
import type { AgentStep } from '@/lib/types';

export const useEvents = (workspaceId: string | null) => {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) {
      setSteps([]);
      setError(null);
      return;
    }

    adapter.getEvents(workspaceId)
      .then((data) => { setSteps(data); setError(null); })
      .catch((err) => { console.error('[useEvents] fetch failed:', err); setSteps([]); setError(err instanceof Error ? err.message : 'Failed to load'); });

    let unsub: (() => void) | undefined;
    try {
      unsub = adapter.subscribeEvents((step) => {
        setSteps(prev => [...prev, step]);
      });
    } catch (err) { console.error('[useEvents] SSE subscribe failed:', err); }

    return () => unsub?.();
  }, [workspaceId]);

  const filteredSteps = filter ? steps.filter(s => s.type === filter) : steps;
  const toggleAutoScroll = useCallback(() => setAutoScroll(p => !p), []);

  return { steps: filteredSteps, autoScroll, toggleAutoScroll, filter, setFilter, error };
};

import { useState, useEffect, useCallback } from 'react';
import { adapter } from '@/lib/adapter';
import type { AgentStep } from '@/lib/types';

export const useEvents = (workspaceId: string | null) => {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    adapter.getEvents().then(setSteps).catch(() => {});
    // Only subscribe if workspace is set
    if (!workspaceId) return;
    try {
      const unsub = adapter.subscribeEvents((step) => {
        setSteps(prev => [...prev, step]);
      });
      return unsub;
    } catch { /* ignore SSE errors */ }
  }, [workspaceId]);

  const filteredSteps = filter ? steps.filter(s => s.type === filter) : steps;

  const toggleAutoScroll = useCallback(() => setAutoScroll(p => !p), []);

  return { steps: filteredSteps, autoScroll, toggleAutoScroll, filter, setFilter };
};

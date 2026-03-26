/**
 * useEvents — React hook for accumulating agent steps from WaggleService events.
 *
 * Listens to WaggleService 'step' events and maintains a list of AgentSteps
 * with auto-scroll toggle and filtering support.
 *
 * Note: filtering is NOT applied here — raw steps are returned so that
 * EventStream is the single place where filterSteps() is called.
 */

import { useState, useCallback, useEffect } from 'react';
import type { WaggleService } from '../services/types.js';
import type { AgentStep, StepFilter } from '../components/events/utils.js';
import { mergeStep } from '../components/events/utils.js';

export interface UseEventsOptions {
  service: WaggleService;
  autoScroll?: boolean;
}

export interface UseEventsReturn {
  steps: AgentStep[];
  autoScroll: boolean;
  toggleAutoScroll: () => void;
  filter: StepFilter;
  setFilter: (f: StepFilter) => void;
  clearSteps: () => void;
}

export function useEvents({ service, autoScroll: initialAutoScroll = true }: UseEventsOptions): UseEventsReturn {
  const [allSteps, setAllSteps] = useState<AgentStep[]>([]);
  const [autoScroll, setAutoScroll] = useState(initialAutoScroll);
  const [filter, setFilter] = useState<StepFilter>({});

  // Listen to service step events
  useEffect(() => {
    const maybeUnsub = service.on('step', (data: unknown) => {
      const step = data as AgentStep;
      setAllSteps((prev) => mergeStep(prev, step));
    });

    return () => { if (typeof maybeUnsub === 'function') maybeUnsub(); };
  }, [service]);

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => !prev);
  }, []);

  const clearSteps = useCallback(() => {
    setAllSteps([]);
  }, []);

  return {
    steps: allSteps,
    autoScroll,
    toggleAutoScroll,
    filter,
    setFilter,
    clearSteps,
  };
}

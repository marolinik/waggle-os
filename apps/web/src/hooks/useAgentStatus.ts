import { useState, useEffect, useRef } from 'react';
import { adapter, MODEL_SETTINGS_CHANGED_EVENT } from '@/lib/adapter';
import type { AgentStatus } from '@/lib/types';

export const useAgentStatus = () => {
  const [status, setStatus] = useState<AgentStatus>({
    model: 'unknown',
    tokensUsed: 0,
    costUsd: 0,
    isActive: false,
  });
  const [offline, setOffline] = useState(false);
  const failCount = useRef(0);
  const pollGeneration = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const generation = ++pollGeneration.current;
      try {
        const data = await adapter.getAgentStatus();
        if (cancelled || generation !== pollGeneration.current) return;
        setStatus(data);
        setOffline(false);
        failCount.current = 0;
      } catch (err) {
        if (cancelled || generation !== pollGeneration.current) return;
        console.error('[useAgentStatus] poll failed:', err);
        failCount.current++;
        setOffline(true);
      }
    };
    poll();
    const refreshModel = () => { void poll(); };
    window.addEventListener(MODEL_SETTINGS_CHANGED_EVENT, refreshModel);
    // Exponential backoff: 30s, 60s, 120s, max 5min
    const getInterval = () => Math.min(30000 * Math.pow(2, failCount.current), 300000);
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(async () => {
        await poll();
        if (!cancelled) schedule();
      }, getInterval());
    };
    schedule();
    return () => {
      cancelled = true;
      pollGeneration.current += 1;
      clearTimeout(timer);
      window.removeEventListener(MODEL_SETTINGS_CHANGED_EVENT, refreshModel);
    };
  }, []);

  return { ...status, offline };
};

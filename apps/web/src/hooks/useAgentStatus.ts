import { useState, useEffect, useRef } from 'react';
import { adapter } from '@/lib/adapter';
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

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await adapter.getAgentStatus();
        if (cancelled) return;
        setStatus(data);
        setOffline(false);
        failCount.current = 0;
      } catch (err) {
        if (cancelled) return;
        console.error('[useAgentStatus] poll failed:', err);
        failCount.current++;
        setOffline(true);
      }
    };
    poll();
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
      clearTimeout(timer);
    };
  }, []);

  return { ...status, offline };
};

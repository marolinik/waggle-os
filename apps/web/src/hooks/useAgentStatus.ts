import { useState, useEffect } from 'react';
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

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await adapter.getAgentStatus();
        setStatus(data);
        setOffline(false);
      } catch {
        setOffline(true);
      }
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, []);

  return { ...status, offline };
};

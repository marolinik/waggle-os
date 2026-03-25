import { useState, useEffect, useRef } from 'react';
import { adapter } from '@/lib/adapter';

export const useOfflineStatus = () => {
  const [offline, setOffline] = useState(false);
  const failCount = useRef(0);

  useEffect(() => {
    const check = async () => {
      try {
        await adapter.getSystemHealth();
        setOffline(false);
        failCount.current = 0;
      } catch {
        failCount.current++;
        setOffline(true);
      }
    };
    check();
    // Exponential backoff: 15s, 30s, 60s, max 5min
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const interval = Math.min(15000 * Math.pow(2, failCount.current), 300000);
      timer = setTimeout(async () => {
        await check();
        schedule();
      }, interval);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  return offline;
};

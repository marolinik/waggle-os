import { useState, useEffect } from 'react';
import { adapter } from '@/lib/adapter';

export const useOfflineStatus = () => {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        await adapter.getSystemHealth();
        setOffline(false);
      } catch {
        setOffline(true);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  return offline;
};

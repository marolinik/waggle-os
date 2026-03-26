/**
 * useOfflineStatus — Polls the server for offline/online status.
 *
 * Detects when the server is unreachable and tracks queued messages.
 */

import { useState, useEffect } from 'react';
import type { OfflineStatus } from '@waggle/ui';

export interface UseOfflineStatusOptions {
  /** Server base URL for the status endpoint */
  serverBaseUrl: string;
  /** Polling interval in ms (default: 15000) */
  pollInterval?: number;
}

export interface UseOfflineStatusReturn {
  offlineStatus: OfflineStatus;
}

export function useOfflineStatus({ serverBaseUrl, pollInterval = 15_000 }: UseOfflineStatusOptions): UseOfflineStatusReturn {
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus>({
    offline: false,
    since: null,
    queuedMessages: 0,
  });

  useEffect(() => {
    const fetchOfflineStatus = async () => {
      try {
        const res = await fetch(`${serverBaseUrl}/api/offline/status`);
        if (res.ok) {
          setOfflineStatus(await res.json() as OfflineStatus);
        }
      } catch {
        setOfflineStatus(prev =>
          prev.offline
            ? prev
            : { offline: true, since: new Date().toISOString(), queuedMessages: prev.queuedMessages }
        );
      }
    };
    fetchOfflineStatus();
    const interval = setInterval(fetchOfflineStatus, pollInterval);
    return () => clearInterval(interval);
  }, [serverBaseUrl, pollInterval]);

  return { offlineStatus };
}

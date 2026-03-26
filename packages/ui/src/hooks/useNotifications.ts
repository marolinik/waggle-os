import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribeSSE } from './useSSEStream.js';

export interface NotificationEvent {
  type: 'notification';
  title: string;
  body: string;
  category: 'cron' | 'approval' | 'task' | 'message' | 'agent';
  timestamp: string;
  actionUrl?: string;
}

export interface UseNotificationsResult {
  notifications: NotificationEvent[];
  clearAll: () => void;
}

export function useNotifications(serverUrl: string): UseNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const permittedRef = useRef<boolean | null>(null);

  // Check notification permission on mount (Tauri only)
  useEffect(() => {
    (async () => {
      if (!(window as any).__TAURI_INTERNALS__) {
        permittedRef.current = false;
        return;
      }
      try {
        const notifModule = '@tauri-apps/' + 'plugin-notification';
        const { isPermissionGranted, requestPermission } = await import(/* @vite-ignore */ notifModule);
        let permitted = await isPermissionGranted();
        if (!permitted) {
          const result = await requestPermission();
          permitted = result === 'granted';
        }
        permittedRef.current = permitted;
      } catch {
        permittedRef.current = false;
      }
    })();
  }, []);

  // Shared SSE connection via singleton manager
  useEffect(() => {
    const url = `${serverUrl}/api/notifications/stream`;

    const unsubscribe = subscribeSSE(url, 'message', async (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== 'notification') return;

        const notification = data as NotificationEvent;
        setNotifications(prev => [notification, ...prev].slice(0, 50));

        // OS notification when app not focused
        if (!document.hasFocus() && permittedRef.current) {
          try {
            const coreModule = '@tauri-apps/' + 'api/core';
            const { invoke } = await import(/* @vite-ignore */ coreModule);
            await invoke('show_notification', {
              title: notification.title,
              body: notification.body,
            });
          } catch {
            // Tauri not available — toast will handle it
          }
        }
      } catch {
        // Ignore parse errors
      }
    });

    return () => unsubscribe();
  }, [serverUrl]);

  const clearAll = useCallback(() => setNotifications([]), []);

  return { notifications, clearAll };
}

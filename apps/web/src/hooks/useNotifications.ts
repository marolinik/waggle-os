import { useState, useEffect, useCallback, useMemo } from 'react';
import { adapter } from '@/lib/adapter';
import type { Notification } from '@/lib/types';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    adapter.getNotificationHistory()
      .then(data => {
        setNotifications(data);
      })
      .catch((err) => {
        console.error('[useNotifications] fetch failed:', err);
        setNotifications([]);
      });

    let unsub: (() => void) | undefined;
    try {
      unsub = adapter.subscribeNotifications((n: Notification) => {
        setNotifications(prev => [n, ...prev]);
      });
    } catch (err) { console.error('[useNotifications] SSE subscribe failed:', err); }

    return () => unsub?.();
  }, []);

  // W4C/F25: derive the badge count from the list instead of tracking it as a
  // second independent state. This makes "badge count === visible unread count"
  // a structural invariant — the old 4-call-site manual sync could drift (e.g.
  // an optimistic markRead on a live SSE notification with no server id).
  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const markRead = useCallback(async (id: string) => {
    try { await adapter.markNotificationRead(id); } catch (err) { console.error('[useNotifications] mark read failed:', err); }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(async () => {
    try { await adapter.markAllNotificationsRead(); } catch (err) { console.error('[useNotifications] mark all read failed:', err); }
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  return { notifications, unreadCount, markRead, markAllRead };
};

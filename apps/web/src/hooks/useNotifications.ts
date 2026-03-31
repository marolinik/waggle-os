import { useState, useEffect, useCallback } from 'react';
import { adapter } from '@/lib/adapter';
import type { Notification } from '@/lib/types';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    adapter.getNotificationHistory()
      .then(data => {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.read).length);
      })
      .catch((err) => {
        console.error('[useNotifications] fetch failed:', err);
        setNotifications([]);
        setUnreadCount(0);
      });

    try {
      const unsub = adapter.subscribeNotifications((n: Notification) => {
        setNotifications(prev => [n, ...prev]);
        if (!n.read) setUnreadCount(prev => prev + 1);
      });
      return unsub;
    } catch (err) { console.error('[useNotifications] SSE subscribe failed:', err); }
  }, []);

  const markRead = useCallback(async (id: string) => {
    try { await adapter.markNotificationRead(id); } catch (err) { console.error('[useNotifications] mark read failed:', err); }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    try { await adapter.markAllNotificationsRead(); } catch (err) { console.error('[useNotifications] mark all read failed:', err); }
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  return { notifications, unreadCount, markRead, markAllRead };
};

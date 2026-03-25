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
      .catch(() => {});

    try {
      const unsub = adapter.subscribeNotifications((n: Notification) => {
        setNotifications(prev => [n, ...prev]);
        if (!n.read) setUnreadCount(prev => prev + 1);
      });
      return unsub;
    } catch { /* ignore SSE errors */ }
  }, []);

  const markRead = useCallback(async (id: string) => {
    try {
      await adapter.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await adapter.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  }, []);

  return { notifications, unreadCount, markRead, markAllRead };
};

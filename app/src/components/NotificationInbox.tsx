/**
 * NotificationInbox — Q16:C notification panel overlay.
 *
 * Shows a list of notifications (newest first) with read/unread state,
 * type-based icons, relative timestamps, and a "mark all read" action.
 * Styled to match the Hive dark theme (hive-900 bg, honey accents).
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface StoredNotification {
  id: number;
  title: string;
  body: string;
  category: string;
  action_url: string | null;
  read: number;
  created_at: string;
}

interface NotificationInboxProps {
  open: boolean;
  onClose: () => void;
  serverBaseUrl: string;
  /** Real-time notification count from SSE (used to trigger refetch) */
  sseNotificationCount: number;
}

/** Map notification category to a simple icon character. */
function categoryIcon(category: string): string {
  switch (category) {
    case 'cron': return '\u23F0'; // alarm clock
    case 'approval': return '\u2705'; // check mark
    case 'task': return '\u2611'; // ballot box with check
    case 'message': return '\uD83D\uDCE8'; // envelope
    case 'agent': return '\uD83D\uDC1D'; // honeybee
    default: return '\uD83D\uDD14'; // bell
  }
}

/** Format a timestamp as a relative string (e.g., "2m ago", "3h ago"). */
function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationInbox({ open, onClose, serverBaseUrl, sseNotificationCount }: NotificationInboxProps) {
  const [notifications, setNotifications] = useState<StoredNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch persisted notifications from server
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${serverBaseUrl}/api/notifications/history?limit=100`);
      if (res.ok) {
        const data = await res.json() as { notifications: StoredNotification[] };
        setNotifications(data.notifications);
      }
    } catch {
      // Silent — inbox will show empty state
    } finally {
      setLoading(false);
    }
  }, [serverBaseUrl]);

  // Fetch when opened or when SSE notifications arrive
  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, sseNotificationCount, fetchNotifications]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay adding listener to avoid immediate close from the toggle click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleMarkRead = useCallback(async (id: number) => {
    try {
      await fetch(`${serverBaseUrl}/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: 1 } : n),
      );
    } catch {
      // Silent
    }
  }, [serverBaseUrl]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await fetch(`${serverBaseUrl}/api/notifications/read-all`, { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
    } catch {
      // Silent
    }
  }, [serverBaseUrl]);

  if (!open) return null;

  const unreadCount = notifications.filter(n => n.read === 0).length;

  return (
    <div
      ref={panelRef}
      className="absolute top-10 right-2 z-50 w-[380px] max-h-[480px] rounded-xl shadow-2xl border flex flex-col overflow-hidden"
      style={{
        backgroundColor: 'var(--hive-900, #0f1117)',
        borderColor: 'var(--hive-700, #2a2d3a)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--hive-700, #2a2d3a)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--hive-50, #f0f0f5)' }}>
            Notifications
          </span>
          {unreadCount > 0 && (
            <span
              className="text-[10px] font-semibold rounded-full px-1.5 py-px"
              style={{ backgroundColor: 'rgba(229, 160, 0, 0.15)', color: 'var(--honey-500, #e5a000)' }}
            >
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-[11px] px-2 py-0.5 rounded transition-colors cursor-pointer"
              style={{ color: 'var(--honey-500, #e5a000)' }}
            >
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            className="text-[16px] leading-none opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
            style={{ color: 'var(--hive-400, #8a8d9a)' }}
          >
            &times;
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: '420px' }}>
        {loading && notifications.length === 0 ? (
          <div
            className="flex items-center justify-center py-12 text-sm"
            style={{ color: 'var(--hive-500, #6a6d7a)' }}
          >
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <span className="text-2xl opacity-30">{'\uD83D\uDD14'}</span>
            <span
              className="text-sm"
              style={{ color: 'var(--hive-500, #6a6d7a)' }}
            >
              No notifications yet
            </span>
          </div>
        ) : (
          notifications.map(n => (
            <button
              key={n.id}
              onClick={() => {
                if (n.read === 0) handleMarkRead(n.id);
              }}
              className="w-full text-left flex items-start gap-3 px-4 py-3 border-b transition-colors cursor-pointer"
              style={{
                borderColor: 'var(--hive-800, #1a1d27)',
                backgroundColor: n.read === 0
                  ? 'rgba(229, 160, 0, 0.04)'
                  : 'transparent',
              }}
            >
              {/* Unread indicator dot */}
              <div className="flex-shrink-0 mt-1.5 w-2 h-2 rounded-full" style={{
                backgroundColor: n.read === 0 ? 'var(--honey-500, #e5a000)' : 'transparent',
              }} />

              {/* Icon */}
              <span className="flex-shrink-0 text-base mt-0.5">{categoryIcon(n.category)}</span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div
                  className="text-[13px] font-medium truncate"
                  style={{
                    color: n.read === 0
                      ? 'var(--hive-50, #f0f0f5)'
                      : 'var(--hive-300, #a0a3b0)',
                  }}
                >
                  {n.title}
                </div>
                <div
                  className="text-[11px] mt-0.5 line-clamp-2"
                  style={{ color: 'var(--hive-500, #6a6d7a)' }}
                >
                  {n.body}
                </div>
              </div>

              {/* Timestamp */}
              <span
                className="flex-shrink-0 text-[10px] mt-0.5"
                style={{ color: 'var(--hive-600, #4a4d5a)' }}
              >
                {relativeTime(n.created_at)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

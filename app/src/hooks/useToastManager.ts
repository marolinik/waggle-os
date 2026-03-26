/**
 * useToastManager — Manages toast notifications lifecycle.
 *
 * Converts incoming notification events to in-app toasts,
 * handles dismiss, and caps the visible toast count.
 */

import { useState, useEffect, useCallback } from 'react';
import type { Toast } from '@waggle/ui';
import type { NotificationEvent } from '@waggle/ui';

export interface UseToastManagerOptions {
  /** Latest notifications from the SSE stream */
  notifications: NotificationEvent[];
}

export interface UseToastManagerReturn {
  toasts: Toast[];
  setToasts: React.Dispatch<React.SetStateAction<Toast[]>>;
  dismissToast: (id: string) => void;
}

export function useToastManager({ notifications }: UseToastManagerOptions): UseToastManagerReturn {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Convert focused notifications to toasts
  useEffect(() => {
    if (notifications.length === 0) return;
    const latest = notifications[0];
    if (document.hasFocus()) {
      setToasts(prev => [{
        id: `${Date.now()}-${Math.random()}`,
        title: latest.title,
        body: latest.body,
        category: latest.category,
        actionUrl: latest.actionUrl,
        createdAt: Date.now(),
      }, ...prev].slice(0, 10));
    }
  }, [notifications]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, setToasts, dismissToast };
}

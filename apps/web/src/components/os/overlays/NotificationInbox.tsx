import { Bell, Check, CheckCheck, X, CheckCircle2, ArrowRight, Clock, ShieldCheck, ClipboardList, MessageSquare, Bot, Pin, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Notification } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { humanizeNotification } from '@/lib/notification-copy';
import { formatRelativeTime } from '@/lib/agent-center-display';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface NotificationInboxProps {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

// Lucide, not emoji — one icon language across the chrome (2026-07-06 P2).
const typeIcons: Record<string, LucideIcon> = {
  cron: Clock, approval: ShieldCheck, task: ClipboardList, message: MessageSquare, agent: Bot,
};

const NotificationInbox = ({ open, onClose, notifications, onMarkRead, onMarkAllRead }: NotificationInboxProps) => {
  const navigate = useNavigate();
  const dialogRef = useFocusTrap<HTMLDivElement>(open, onClose);
  if (!open) return null;

  const openAction = (n: Notification, href: string) => {
    if (!n.read) onMarkRead(n.id);
    onClose();
    navigate(href);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100]"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <motion.div
          ref={dialogRef}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="notification-inbox-title"
          tabIndex={-1}
          className="absolute top-10 right-4 w-80 glass-strong rounded-2xl shadow-2xl overflow-hidden focus:outline-none"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-honey" />
              <span id="notification-inbox-title" className="text-sm font-display font-semibold text-foreground">Notifications</span>
            </div>
            <div className="flex items-center gap-1">
              <HintTooltip content="Mark all read">
                <button
                  onClick={onMarkAllRead}
                  aria-label="Mark all notifications as read"
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                </button>
              </HintTooltip>
              <button onClick={onClose} aria-label="Close notifications" className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-auto">
            {notifications.length === 0 && (
              <div className="py-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400/40 mx-auto mb-2" />
                <p className="text-xs text-foreground font-display font-medium">All caught up</p>
                <p className="text-[11px] text-muted-foreground mt-1">No new notifications</p>
              </div>
            )}
            {notifications.map(n => {
              const { title, body, href } = humanizeNotification(n);
              const TypeIcon = typeIcons[n.type] ?? Pin;
              return (
              <div
                key={n.id}
                className={`px-4 py-3 border-b border-border/20 transition-colors ${
                  n.read ? 'opacity-60' : 'bg-primary/5'
                }`}
              >
                <div className="flex items-start gap-2">
                  <TypeIcon className="w-4 h-4 mt-0.5 text-honey/70 shrink-0" aria-hidden />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-display font-medium text-foreground">{title}</p>
                    {body && <p className="text-[11px] text-muted-foreground mt-0.5">{body}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1">{formatRelativeTime(n.timestamp)}</p>
                    {href && (
                      <button
                        onClick={() => openAction(n, href)}
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-honey hover:underline"
                      >
                        Open <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {!n.read && (
                    <button onClick={() => onMarkRead(n.id)} className="p-1 text-muted-foreground hover:text-honey transition-colors" aria-label="Mark as read">
                      <Check className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NotificationInbox;

import { Bell, Check, CheckCheck, X, CheckCircle2 } from 'lucide-react';
import type { Notification } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import { HintTooltip } from '@/components/ui/hint-tooltip';

interface NotificationInboxProps {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

const typeIcons: Record<string, string> = {
  cron: '⏰', approval: '🔐', task: '📋', message: '💬', agent: '🤖',
};

const NotificationInbox = ({ open, onClose, notifications, onMarkRead, onMarkAllRead }: NotificationInboxProps) => {
  if (!open) return null;

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
          initial={{ opacity: 0, x: 20, y: -10 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="absolute top-10 right-4 w-80 glass-strong rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <span className="text-sm font-display font-semibold text-foreground">Notifications</span>
            </div>
            <div className="flex items-center gap-1">
              <HintTooltip content="Mark all read">
                <button onClick={onMarkAllRead} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                  <CheckCheck className="w-3.5 h-3.5" />
                </button>
              </HintTooltip>
              <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
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
            {notifications.map(n => (
              <div
                key={n.id}
                className={`px-4 py-3 border-b border-border/20 transition-colors ${
                  n.read ? 'opacity-60' : 'bg-primary/5'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-0.5">{typeIcons[n.type] || '📌'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-display font-medium text-foreground">{n.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{n.body}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{new Date(n.timestamp).toLocaleString()}</p>
                  </div>
                  {!n.read && (
                    <button onClick={() => onMarkRead(n.id)} className="p-1 text-muted-foreground hover:text-primary transition-colors">
                      <Check className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NotificationInbox;

import { motion, AnimatePresence } from 'framer-motion';
import type { AppId, DockEntry } from '@/lib/dock-tiers';

interface DockTrayProps {
  items: DockEntry[];
  onSelect: (appId: AppId) => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

const DockTray = ({ items, onSelect, onClose, anchorRect }: DockTrayProps) => {
  const trayWidth = items.length * 80 + 16;
  let left = anchorRect.left + anchorRect.width / 2 - trayWidth / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - trayWidth - 8));
  const bottom = window.innerHeight - anchorRect.top + 8;

  return (
    <AnimatePresence>
      <motion.div
        data-dock-tray
        initial={{ opacity: 0, y: 8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className="fixed z-[51] glass-strong rounded-xl px-2 py-2 flex items-center gap-1"
        style={{ left, bottom }}
      >
        {items.map((item) => {
          if (!item.icon || !item.appId) return null;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => onSelect(item.appId!)}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-muted/50 transition-colors min-w-[64px]"
            >
              <Icon className={`w-5 h-5 ${item.color}`} />
              <span className="text-[11px] font-display text-muted-foreground whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
};

export default DockTray;

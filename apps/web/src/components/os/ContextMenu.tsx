import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

const ContextMenu = ({ items, position, onClose }: ContextMenuProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(-1);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    const actionItems = items.filter(i => !i.separator && !i.disabled);
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex(i => (i + 1) % actionItems.length);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex(i => (i - 1 + actionItems.length) % actionItems.length);
      }
      if (e.key === 'Enter' && focusIndex >= 0) {
        actionItems[focusIndex]?.onClick();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [focusIndex, items, onClose]);

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 200),
    top: Math.min(position.y, window.innerHeight - items.length * 32 - 16),
    zIndex: 9999,
  };

  let actionIndex = 0;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      style={style}
      className="min-w-[160px] py-1 rounded-xl glass-strong border border-border/50 shadow-xl"
    >
      {items.map((item, i) => {
        if (item.separator) return <div key={i} className="my-1 h-px bg-border/30" />;
        const currentActionIndex = actionIndex++;
        return (
          <button
            key={i}
            onClick={() => { item.onClick(); onClose(); }}
            disabled={item.disabled}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors
              ${item.danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-muted/50'}
              ${item.disabled ? 'opacity-40 cursor-not-allowed' : ''}
              ${focusIndex === currentActionIndex ? 'bg-muted/50' : ''}`}
          >
            {item.icon && <span className="w-3.5 h-3.5 flex items-center justify-center">{item.icon}</span>}
            {item.label}
          </button>
        );
      })}
    </motion.div>
  );
};

export default ContextMenu;

import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { isActionItem, actionIndexForRenderItem } from '../../lib/context-menu-index';

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
  /**
   * Wave W Lane B (item 2, opt-in — default-preserving): when set, the menu
   * scales in FROM this transform-origin corner (150ms scale 0.96→1 + fade) so
   * it reads as growing out of the trigger, and adopts the roomier "comfortable"
   * item density (matching the marketplace row spacing). Callers that omit it
   * render exactly as before. Set by WorkspaceActionsMenu to the kebab corner.
   */
  origin?: string;
}

const ContextMenu = ({ items, position, onClose, origin }: ContextMenuProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const reduceMotion = useReducedMotion();
  const cornered = origin !== undefined;
  // Reduced motion drops the scale (fade only) for the cornered entrance; every
  // other consumer keeps its existing behavior untouched.
  const enterScale = cornered && !reduceMotion ? 0.96 : cornered ? 1 : 0.95;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    const actionItems = items.filter(isActionItem);
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

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: enterScale }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: enterScale }}
      transition={{ duration: cornered ? 0.15 : 0.1 }}
      style={cornered ? { ...style, transformOrigin: origin } : style}
      className="min-w-[160px] py-1 rounded-xl glass-strong border border-border/50 shadow-xl"
    >
      {items.map((item, i) => {
        if (item.separator) return <div key={i} className="my-1 h-px bg-border/30" />;
        const currentActionIndex = actionIndexForRenderItem(items, i);
        return (
          <button
            key={i}
            onClick={() => { item.onClick(); onClose(); }}
            disabled={item.disabled}
            className={`w-full flex items-center text-xs text-left transition-colors
              ${cornered ? 'gap-2.5 px-3.5 py-2' : 'gap-2 px-3 py-1.5'}
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

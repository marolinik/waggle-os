import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Rocket } from 'lucide-react';
import { getDockForTier, type AppId, type BillingTier, type DockEntry, type UserTier } from '@/lib/dock-tiers';
import { useDockLabels } from '@/hooks/useDockLabels';
import DockTray from './DockTray';

// Re-export for backward compatibility
export type { AppId } from '@/lib/dock-tiers';

interface DockProps {
  tier: UserTier;
  billingTier?: BillingTier;
  onOpenApp: (id: AppId) => void;
  openApps: AppId[];
  minimizedApps?: AppId[];
  onSpawnAgent?: () => void;
  waggleBadgeCount?: number;
}

const Dock = ({ tier, billingTier = 'FREE', onOpenApp, openApps, minimizedApps = [], onSpawnAgent, waggleBadgeCount = 0 }: DockProps) => {
  const [openZone, setOpenZone] = useState<string | null>(null);
  const [trayAnchor, setTrayAnchor] = useState<DOMRect | null>(null);
  const zoneRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const items = getDockForTier(tier, billingTier);
  // M-19 / UX-4: show icon labels while user is "new" (<20 sessions
  // OR <7 days installed), or when Settings pins them on.
  const { visible: showDockLabels } = useDockLabels();

  // Close tray on outside click
  useEffect(() => {
    if (!openZone) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-dock-tray]') && !target.closest('[data-zone-parent]')) {
        setOpenZone(null);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [openZone]);

  // Close tray on Escape
  useEffect(() => {
    if (!openZone) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenZone(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openZone]);

  const handleZoneClick = (entry: DockEntry) => {
    if (openZone === entry.key) {
      setOpenZone(null);
      setTrayAnchor(null);
    } else {
      const ref = zoneRefs.current[entry.key];
      if (ref) {
        setTrayAnchor(ref.getBoundingClientRect());
        setOpenZone(entry.key);
      }
    }
  };

  const openZoneEntry = items.find(e => e.key === openZone && e.type === 'zone-parent');

  return (
    // L-01 / R-1: constrain to 95vw and scroll horizontally when the
    // dock's rendered width would exceed the viewport (power tier at
    // <768px viewports). Keeps the fixed center-bottom position.
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 max-w-[95vw] overflow-x-auto">
      {/* Tray popover */}
      {openZone && openZoneEntry?.children && trayAnchor && (
        <DockTray
          items={openZoneEntry.children}
          onSelect={(appId) => { onOpenApp(appId); setOpenZone(null); }}
          onClose={() => setOpenZone(null)}
          anchorRect={trayAnchor}
        />
      )}

      <div className="glass-strong rounded-2xl px-3 py-2 flex items-center gap-1">
        {items.map((entry) => {
          if (entry.type === 'separator') {
            return <div key={entry.key} className="w-px h-6 bg-border/30 mx-1" />;
          }

          const Icon = entry.icon!;
          const isOpen = entry.appId ? openApps.includes(entry.appId) : false;
          const isMinimized = entry.appId ? minimizedApps.includes(entry.appId) : false;
          const isZoneOpen = entry.type === 'zone-parent' && openZone === entry.key;
          const hasOpenChild = entry.type === 'zone-parent' &&
            entry.children?.some(c => c.appId && openApps.includes(c.appId));

          return (
            <motion.button
              key={entry.key}
              aria-label={entry.label}
              ref={entry.type === 'zone-parent'
                ? (el: HTMLButtonElement | null) => { zoneRefs.current[entry.key] = el; }
                : undefined}
              data-zone-parent={entry.type === 'zone-parent' ? entry.key : undefined}
              onClick={() => {
                if (entry.type === 'zone-parent') {
                  handleZoneClick(entry);
                } else if (entry.appId) {
                  onOpenApp(entry.appId);
                }
              }}
              className={`relative flex flex-col items-center justify-center group p-2 min-w-[44px] min-h-[44px] rounded-xl hover:bg-muted/50 transition-colors ${
                isZoneOpen ? 'ring-1 ring-primary/40 bg-muted/30' : ''
              }`}
              whileHover={{ scale: 1.2, y: -8 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              animate={
                isMinimized
                  ? { y: [0, -12, 0, -6, 0], transition: { duration: 0.5, ease: 'easeOut' } }
                  : {}
              }
            >
              <Icon className={`w-6 h-6 ${entry.color}`} />
              {entry.appId === 'waggle-dance' && waggleBadgeCount > 0 && (
                <span className="absolute -top-1 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[11px] font-bold bg-destructive text-destructive-foreground rounded-full px-1">
                  {waggleBadgeCount > 99 ? '99+' : waggleBadgeCount}
                </span>
              )}
              <span
                className={`absolute -top-7 text-[11px] text-foreground bg-card px-2 py-0.5 rounded transition-opacity whitespace-nowrap font-display ${
                  showDockLabels ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                data-testid={`dock-label-${entry.key}`}
                data-pinned={showDockLabels ? 'true' : 'false'}
              >
                {entry.label}
              </span>
              {(isOpen || hasOpenChild) && (
                <div className={`absolute -bottom-0.5 w-1 h-1 rounded-full ${isMinimized ? 'bg-primary/50' : 'bg-primary'}`} />
              )}
            </motion.button>
          );
        })}

        {/* Separator + Spawn shortcut */}
        {onSpawnAgent && (
          <>
            <div className="w-px h-6 bg-border/30 mx-1" />
            <motion.button
              aria-label="Spawn Agent"
              data-testid="dock-spawn-agent"
              onClick={onSpawnAgent}
              className="relative flex flex-col items-center justify-center group p-2 min-w-[44px] min-h-[44px] rounded-xl hover:bg-muted/50 transition-colors"
              whileHover={{ scale: 1.2, y: -8 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              <Rocket className="w-6 h-6 text-primary" />
              <span className="absolute -top-7 text-[11px] text-foreground bg-card px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-display">
                Spawn Agent
              </span>
            </motion.button>
          </>
        )}
      </div>
    </div>
  );
};

export default Dock;

import { useState, useEffect } from 'react';
import { X, Brain, Loader2, ChevronRight, FileText, Zap, Link2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { adapter } from '@/lib/adapter';
import {
  fetchContextRailItems,
  type ContextRailTarget as FetchTarget,
  type ContextRailItem,
} from '@/lib/context-rail-fetch';

export type ContextRailTarget = FetchTarget;

interface ContextRailProps {
  target: ContextRailTarget | null;
  onClose: () => void;
}

type ContextItem = ContextRailItem;

const KIND_ICONS: Record<string, React.ElementType> = {
  memory: Brain,
  entity: Link2,
  relation: Zap,
};

const KIND_COLORS: Record<string, string> = {
  memory: 'text-amber-400',
  entity: 'text-sky-400',
  relation: 'text-violet-400',
};

const ContextRail = ({ target, onClose }: ContextRailProps) => {
  const [items, setItems] = useState<ContextItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!target) { setItems([]); return; }
    let cancelled = false;
    setLoading(true);
    setExpandedId(null);

    (async () => {
      const results = await fetchContextRailItems(target, adapter);
      if (!cancelled) {
        setItems(results);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [target]);

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-8 right-0 bottom-16 w-80 z-40 glass-strong border-l border-border/50 flex flex-col"
        >
          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <h3 className="text-xs font-display font-semibold text-foreground truncate">
                  {target.label}
                </h3>
                <p className="text-[10px] text-muted-foreground capitalize">{target.type}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted/50">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <Brain className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">No related context found.</p>
              </div>
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-display">
                  {items.length} related item{items.length !== 1 ? 's' : ''}
                </p>
                {items.map(item => {
                  const Icon = KIND_ICONS[item.kind] ?? Brain;
                  const color = KIND_COLORS[item.kind] ?? 'text-muted-foreground';
                  const isExpanded = expandedId === item.id;

                  return (
                    <button key={item.id} onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className={`w-full text-left p-2 rounded-lg transition-colors ${
                        isExpanded ? 'bg-muted/30' : 'hover:bg-muted/20'
                      }`}>
                      <div className="flex items-start gap-2">
                        <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground truncate">{item.title}</p>
                          {item.importance && (
                            <span className={`text-[10px] ${
                              item.importance === 'critical' ? 'text-destructive'
                              : item.importance === 'important' ? 'text-amber-400'
                              : 'text-muted-foreground'
                            }`}>
                              {item.importance}
                            </span>
                          )}
                          {isExpanded && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground whitespace-pre-wrap">
                              {item.content.slice(0, 500)}
                            </p>
                          )}
                        </div>
                        <ChevronRight className={`w-3 h-3 text-muted-foreground/40 mt-1 transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`} />
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ContextRail;

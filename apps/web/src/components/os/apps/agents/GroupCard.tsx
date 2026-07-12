import { motion } from 'framer-motion';
import { Users, Trash2, ChevronRight } from 'lucide-react';
import type { AgentGroup, BackendPersona } from './types';
import { STRATEGY_CONFIG } from './types';

interface GroupCardProps {
  group: AgentGroup;
  agents: BackendPersona[];
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const GroupCard = ({ group, selected, onSelect, onDelete }: GroupCardProps) => {
  const strat = STRATEGY_CONFIG[group.strategy];
  return (
    <motion.div
      layout
      className="relative group w-full"
    >
      <button
        onClick={onSelect}
        aria-label={`Select group "${group.name}"`}
        aria-pressed={selected}
        className={`w-full flex items-center gap-3 p-3 pr-14 rounded-xl text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
          selected
            ? 'bg-primary/15 border border-primary/40 shadow-md shadow-primary/10'
            : 'bg-secondary/30 border border-transparent hover:bg-secondary/50 hover:border-border/30'
        }`}
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Users className="w-5 h-5 text-honey" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-display font-semibold text-foreground truncate">{group.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${strat.color}`}>{strat.label}</span>
            <span className="text-[11px] text-muted-foreground">{group.members.length} agents</span>
          </div>
        </div>
        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${selected ? 'rotate-90' : ''}`} aria-hidden="true" />
      </button>
      <button
        aria-label={`Delete group "${group.name}"`}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-background"
      >
        <Trash2 className="w-3 h-3" aria-hidden="true" />
      </button>
    </motion.div>
  );
};

export default GroupCard;

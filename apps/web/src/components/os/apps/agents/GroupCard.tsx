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
    <motion.button
      layout
      onClick={onSelect}
      className={`relative group w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
        selected
          ? 'bg-primary/15 border border-primary/40 shadow-md shadow-primary/10'
          : 'bg-secondary/30 border border-transparent hover:bg-secondary/50 hover:border-border/30'
      }`}
    >
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Users className="w-5 h-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-display font-semibold text-foreground truncate">{group.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${strat.color}`}>{strat.label}</span>
          <span className="text-[11px] text-muted-foreground">{group.members.length} agents</span>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
      >
        <Trash2 className="w-3 h-3" />
      </button>
      <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${selected ? 'rotate-90' : ''}`} />
    </motion.button>
  );
};

export default GroupCard;

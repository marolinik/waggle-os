import { motion } from 'framer-motion';
import { Trash2, ChevronRight } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { BackendPersona } from './types';
import type { PersonaConfig } from '@/lib/personas';

interface AgentCardProps {
  agent: BackendPersona;
  localPersona?: PersonaConfig;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}

const AgentCard = ({ agent, localPersona, selected, onSelect, onDelete }: AgentCardProps) => {
  return (
    <motion.div
      layout
      className="relative group w-full"
    >
      <button
        type="button"
        aria-label={`Select agent "${agent.name}"`}
        aria-pressed={selected}
        onClick={onSelect}
        className={`w-full flex items-center gap-3 p-3 ${agent.custom && onDelete ? 'pr-14' : ''} rounded-xl text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
          selected
            ? 'bg-primary/15 border border-primary/40 shadow-md shadow-primary/10'
            : 'bg-secondary/30 border border-transparent hover:bg-secondary/50 hover:border-border/30'
        }`}
      >
        <Avatar className="w-10 h-10 shrink-0 ring-2 ring-primary/20">
          {localPersona?.avatar ? (
            <AvatarImage src={localPersona.avatar} />
          ) : (
            <AvatarFallback className="text-sm bg-primary/20">{agent.icon || agent.name[0]}</AvatarFallback>
          )}
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-display font-semibold text-foreground truncate">{agent.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{agent.description}</p>
        </div>
        <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${selected ? 'rotate-90' : ''}`} aria-hidden="true" />
      </button>
      {agent.custom && onDelete && (
        <button
          type="button"
          aria-label={`Delete ${agent.name}`}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        >
          <Trash2 className="w-3 h-3" aria-hidden="true" />
        </button>
      )}
    </motion.div>
  );
};

export default AgentCard;

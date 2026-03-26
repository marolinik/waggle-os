import { motion } from 'framer-motion';
import { Wrench, Pencil } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { BackendPersona, ToolDef } from './types';
import type { PersonaConfig } from '@/lib/personas';

interface AgentDetailProps {
  agent: BackendPersona;
  localPersona?: PersonaConfig;
  allTools: ToolDef[];
  onEdit?: () => void;
}

const AgentDetail = ({ agent, localPersona, allTools, onEdit }: AgentDetailProps) => {
  const agentTools = (agent.tools ?? []).map(t => allTools.find(at => at.name === t) ?? { name: t });

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex-1 flex flex-col gap-4 overflow-y-auto scrollbar-thin"
    >
      <div className="flex items-center gap-3">
        <Avatar className="w-14 h-14 ring-2 ring-primary/30">
          {localPersona?.avatar ? (
            <AvatarImage src={localPersona.avatar} />
          ) : (
            <AvatarFallback className="text-xl bg-primary/20">{agent.icon || agent.name[0]}</AvatarFallback>
          )}
        </Avatar>
        <div className="flex-1">
          <h3 className="text-sm font-display font-bold text-foreground">{agent.name}</h3>
          <p className="text-xs text-muted-foreground">{agent.description}</p>
          {agent.custom && (
            <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium">Custom</span>
          )}
        </div>
        {agent.custom && onEdit && (
          <button
            onClick={onEdit}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-lg bg-secondary/50 hover:bg-secondary/70 text-foreground transition-colors"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
      </div>

      {/* Tools */}
      <div>
        <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
          <Wrench className="w-3 h-3" /> Tools ({agentTools.length})
        </h4>
        {agentTools.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">No tools assigned</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {agentTools.map(t => (
              <span
                key={t.name}
                className="text-[10px] px-2 py-1 rounded-lg bg-muted/50 border border-border/30 text-foreground"
                title={t.description}
              >
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Suggested Commands */}
      {agent.suggestedCommands && agent.suggestedCommands.length > 0 && (
        <div>
          <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">Commands</h4>
          <div className="flex flex-wrap gap-1.5">
            {agent.suggestedCommands.map(cmd => (
              <span key={cmd} className="text-[10px] px-2 py-1 rounded-lg bg-accent/30 text-accent-foreground font-mono">
                /{cmd}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Workspace Affinity */}
      {agent.workspaceAffinity && agent.workspaceAffinity.length > 0 && (
        <div>
          <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">Best For</h4>
          <div className="flex flex-wrap gap-1.5">
            {agent.workspaceAffinity.map(w => (
              <span key={w} className="text-[10px] px-2 py-1 rounded-lg bg-secondary/50 text-foreground capitalize">{w}</span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default AgentDetail;

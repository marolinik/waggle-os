import { Brain, ChevronRight } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getPersonaById } from '@/lib/personas';
import type { Workspace } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';

interface WorkspaceSwitcherProps {
  open: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSelect: (id: string) => void;
}

const WorkspaceSwitcher = ({ open, onClose, workspaces, activeWorkspaceId, onSelect }: WorkspaceSwitcherProps) => {
  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-sm glass-strong rounded-2xl shadow-2xl p-5"
          onClick={e => e.stopPropagation()}
        >
          <h2 className="text-sm font-display font-semibold text-foreground mb-3">Switch Workspace</h2>
          <div className="space-y-1 max-h-64 overflow-auto">
            {workspaces.map(ws => {
              const persona = ws.persona ? getPersonaById(ws.persona) : null;
              const isActive = ws.id === activeWorkspaceId;
              return (
                <button
                  key={ws.id}
                  onClick={() => { onSelect(ws.id); onClose(); }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left ${
                    isActive
                      ? 'bg-primary/20 border border-primary/50'
                      : 'bg-secondary/20 border border-transparent hover:bg-secondary/40'
                  }`}
                >
                  {persona ? (
                    <Avatar className="w-7 h-7 shrink-0">
                      <AvatarImage src={persona.avatar} />
                      <AvatarFallback className="text-[11px] bg-primary/20">{persona.name[0]}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Brain className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-display font-medium text-foreground truncate block">{ws.name}</span>
                    <span className="text-[11px] text-muted-foreground">{ws.group}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              );
            })}
            {workspaces.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No workspaces</p>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 text-center">Ctrl+Tab to toggle</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default WorkspaceSwitcher;

import { useState } from 'react';
import { Plus, Activity, Clock, Brain, ChevronRight } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getPersonaById } from '@/lib/personas';
import type { Workspace } from '@/lib/types';

interface DashboardAppProps {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
}

const healthColors: Record<string, string> = {
  healthy: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  error: 'bg-destructive',
};

const groupColors: Record<string, string> = {
  Personal: 'bg-primary/20 text-primary',
  Work: 'bg-sky-500/20 text-sky-400',
  Research: 'bg-violet-500/20 text-violet-400',
};

const DashboardApp = ({ workspaces, activeWorkspaceId, onSelectWorkspace, onCreateWorkspace }: DashboardAppProps) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Group workspaces
  const groups = workspaces.reduce<Record<string, Workspace[]>>((acc, ws) => {
    const group = ws.group || 'Personal';
    if (!acc[group]) acc[group] = [];
    acc[group].push(ws);
    return acc;
  }, {});

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-display font-semibold text-foreground">Workspaces</h2>
        <button
          onClick={onCreateWorkspace}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-display rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New
        </button>
      </div>

      {Object.entries(groups).map(([group, wsList]) => (
        <div key={group} className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-display font-medium ${groupColors[group] || 'bg-muted text-muted-foreground'}`}>
              {group}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {wsList.map(ws => {
              const persona = ws.persona ? getPersonaById(ws.persona) : null;
              const isActive = ws.id === activeWorkspaceId;
              return (
                <button
                  key={ws.id}
                  onClick={() => onSelectWorkspace(ws.id)}
                  onMouseEnter={() => setHoveredId(ws.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`relative text-left p-3 rounded-xl border transition-all duration-200 ${
                    isActive
                      ? 'border-primary/50 bg-primary/10 shadow-lg shadow-primary/10'
                      : 'border-border/50 bg-secondary/30 hover:bg-secondary/50 hover:border-border'
                  }`}
                  style={ws.hue ? { borderLeftColor: `hsl(${ws.hue}, 70%, 50%)`, borderLeftWidth: '3px' } : undefined}
                >
                  <div className="flex items-start gap-2.5">
                    {persona ? (
                      <Avatar className="w-8 h-8 shrink-0">
                        <AvatarImage src={persona.avatar} />
                        <AvatarFallback className="text-[10px] bg-primary/20">{persona.name[0]}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Brain className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-display font-medium text-foreground truncate">{ws.name}</span>
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${healthColors[ws.health || 'healthy']}`} />
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        {ws.memoryCount !== undefined && (
                          <span className="flex items-center gap-0.5"><Brain className="w-2.5 h-2.5" />{ws.memoryCount}</span>
                        )}
                        {ws.lastActive && (
                          <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{new Date(ws.lastActive).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${hoveredId === ws.id ? 'translate-x-0.5' : ''}`} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {workspaces.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Activity className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground mb-2">No workspaces yet</p>
          <button onClick={onCreateWorkspace} className="text-xs text-primary hover:text-primary/80">Create your first workspace</button>
        </div>
      )}
    </div>
  );
};

export default DashboardApp;

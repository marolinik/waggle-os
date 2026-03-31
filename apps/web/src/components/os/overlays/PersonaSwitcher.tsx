import { useState, useEffect } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PERSONAS } from '@/lib/personas';
import { adapter } from '@/lib/adapter';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Users, Loader2, Lock } from 'lucide-react';
import { useFeatureGate } from '@/hooks/useFeatureGate';

interface BackendPersona {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

interface AgentGroupOption {
  id: string;
  name: string;
  description?: string;
  strategy: string;
  members: { agentId: string }[];
}

interface PersonaSwitcherProps {
  open: boolean;
  onClose: () => void;
  currentPersona?: string;
  currentGroupId?: string;
  onSelect: (personaId: string) => void;
  onSelectGroup?: (groupId: string) => void;
}

const FREE_PERSONA_IDS = ['researcher', 'writer', 'analyst'];

const PersonaSwitcher = ({ open, onClose, currentPersona, currentGroupId, onSelect, onSelectGroup }: PersonaSwitcherProps) => {
  const [tab, setTab] = useState<'agents' | 'groups'>('agents');
  const { isEnabled } = useFeatureGate();
  const allPersonasUnlocked = isEnabled('all-personas');
  const [backendPersonas, setBackendPersonas] = useState<BackendPersona[] | null>(null);
  const [groups, setGroups] = useState<AgentGroupOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.allSettled([
      adapter.getPersonas(),
      adapter.getAgentGroups(),
    ]).then(([personasRes, groupsRes]) => {
      if (personasRes.status === 'fulfilled') {
        setBackendPersonas(personasRes.value as BackendPersona[]);
      }
      if (groupsRes.status === 'fulfilled') {
        setGroups(groupsRes.value as AgentGroupOption[]);
      }
      setLoading(false);
    });
  }, [open]);

  if (!open) return null;

  // Use backend personas if available, fall back to local
  const personas: { id: string; name: string; description: string; icon?: string; avatar?: string }[] =
    backendPersonas
      ? backendPersonas.map(bp => {
          const local = PERSONAS.find(p => p.id === bp.id);
          return { ...bp, avatar: local?.avatar };
        })
      : PERSONAS.map(p => ({ id: p.id, name: p.name, description: p.description, avatar: p.avatar }));

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
          className="relative w-full max-w-md glass-strong rounded-2xl shadow-2xl p-5"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-display font-semibold text-foreground">Switch Agent</h2>
            {/* Tabs */}
            <div className="flex items-center gap-0.5 bg-secondary/30 rounded-lg p-0.5">
              <button
                onClick={() => setTab('agents')}
                className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
                  tab === 'agents' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Bot className="w-3 h-3 inline mr-1" />Agents
              </button>
              {(groups.length > 0 || onSelectGroup) && (
                <button
                  onClick={() => setTab('groups')}
                  className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
                    tab === 'groups' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Users className="w-3 h-3 inline mr-1" />Groups
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : tab === 'agents' ? (
            <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-y-auto scrollbar-thin">
              {personas.map(p => {
                const isLocked = !allPersonasUnlocked && !FREE_PERSONA_IDS.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => { if (!isLocked) { onSelect(p.id); onClose(); } }}
                    disabled={isLocked}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                      isLocked
                        ? 'bg-secondary/20 border border-transparent opacity-50 cursor-not-allowed'
                        : currentPersona === p.id && !currentGroupId
                        ? 'bg-primary/20 border border-primary/50'
                        : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
                    }`}
                  >
                    <Avatar className="w-10 h-10 shrink-0">
                      {p.avatar ? <AvatarImage src={p.avatar} /> : (
                        <AvatarFallback className="text-[10px] bg-primary/20">{p.icon || p.name[0]}</AvatarFallback>
                      )}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-display font-medium text-foreground truncate">{p.name}</p>
                        {isLocked && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{p.description}</p>
                    </div>
                  </button>
                );
              })}
              {!allPersonasUnlocked && (
                <p className="col-span-2 text-[10px] text-muted-foreground text-center py-2">
                  Upgrade to Teams to unlock all personas
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-[320px] overflow-y-auto scrollbar-thin">
              {groups.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No agent groups created yet. Create one in the Agents app.
                </p>
              ) : groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => { onSelectGroup?.(g.id); onClose(); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                    currentGroupId === g.id
                      ? 'bg-primary/20 border border-primary/50'
                      : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-display font-medium text-foreground truncate">{g.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary capitalize">{g.strategy}</span>
                      <span className="text-[10px] text-muted-foreground">{g.members.length} agents</span>
                    </div>
                    {g.description && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{g.description}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground mt-3 text-center">⌘⇧P to toggle</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PersonaSwitcher;

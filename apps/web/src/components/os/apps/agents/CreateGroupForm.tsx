import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus, X, Users, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import type { AgentGroupMember, BackendPersona } from './types';
import { STRATEGY_CONFIG } from './types';

interface CreateGroupFormProps {
  agents: BackendPersona[];
  onSave: (data: { name: string; description: string; strategy: 'parallel' | 'sequential' | 'coordinator'; members: AgentGroupMember[] }) => void;
  onCancel: () => void;
  initialData?: { name: string; description: string; strategy: 'parallel' | 'sequential' | 'coordinator'; members: AgentGroupMember[] };
  editMode?: boolean;
}

const CreateGroupForm = ({ agents, onSave, onCancel, initialData, editMode }: CreateGroupFormProps) => {
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [strategy, setStrategy] = useState<'parallel' | 'sequential' | 'coordinator'>(initialData?.strategy ?? 'parallel');
  const [members, setMembers] = useState<AgentGroupMember[]>(initialData?.members ?? []);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const addMember = (agentId: string) => {
    if (members.some(m => m.agentId === agentId)) return;
    setMembers(prev => [...prev, { agentId, roleInGroup: 'worker', executionOrder: prev.length }]);
  };

  const removeMember = (agentId: string) => {
    setMembers(prev => prev.filter(m => m.agentId !== agentId).map((m, i) => ({ ...m, executionOrder: i })));
  };

  const toggleRole = (agentId: string) => {
    setMembers(prev => prev.map(m => m.agentId === agentId ? { ...m, roleInGroup: m.roleInGroup === 'lead' ? 'worker' : 'lead' } : m));
  };

  const moveMember = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= members.length) return;
    setMembers(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIdx, 1);
      updated.splice(toIdx, 0, moved);
      return updated.map((m, i) => ({ ...m, executionOrder: i }));
    });
  };

  const handleDragStart = (idx: number) => { dragItem.current = idx; };
  const handleDragEnter = (idx: number) => { dragOverItem.current = idx; };
  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      moveMember(dragItem.current, dragOverItem.current);
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const availableAgents = agents.filter(a => !members.some(m => m.agentId === a.id));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col gap-3 overflow-y-auto scrollbar-thin"
    >
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center">
        <label className="text-[10px] text-muted-foreground font-display uppercase tracking-wider">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Team name" className="text-xs bg-secondary/30 border border-border/30 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary/50" />
        <label className="text-[10px] text-muted-foreground font-display uppercase tracking-wider">Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this team do?" className="text-xs bg-secondary/30 border border-border/30 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary/50" />
      </div>

      {/* Strategy */}
      <div>
        <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">Execution Strategy</h4>
        <div className="flex gap-2">
          {Object.entries(STRATEGY_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setStrategy(key as typeof strategy)}
              className={`flex-1 p-2 rounded-lg text-center text-[10px] border transition-all ${
                strategy === key
                  ? 'border-primary/50 bg-primary/10 text-foreground'
                  : 'border-border/30 bg-secondary/20 text-muted-foreground hover:bg-secondary/40'
              }`}
            >
              <p className="font-semibold">{cfg.label}</p>
              <p className="text-[9px] mt-0.5 opacity-70">{cfg.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Members */}
      <div>
        <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">Members ({members.length})</h4>
        {members.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {members.map((m, idx) => {
              const agent = agents.find(a => a.id === m.agentId);
              return (
                <div
                  key={m.agentId}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragEnter={() => handleDragEnter(idx)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  className="flex items-center gap-2 p-2 rounded-lg bg-secondary/20 border border-border/20 cursor-grab active:cursor-grabbing hover:bg-secondary/30 transition-colors"
                >
                  <GripVertical className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                  <span className="text-[10px] font-mono text-muted-foreground w-4 text-center">{m.executionOrder + 1}</span>
                  <span className="text-[10px] font-medium text-foreground flex-1 truncate">{agent?.name ?? m.agentId}</span>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => moveMember(idx, idx - 1)} disabled={idx === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-opacity" title="Move up">
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button onClick={() => moveMember(idx, idx + 1)} disabled={idx === members.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-opacity" title="Move down">
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                  <button
                    onClick={() => toggleRole(m.agentId)}
                    className={`text-[9px] px-1.5 py-0.5 rounded-full transition-colors ${
                      m.roleInGroup === 'lead' ? 'bg-amber-500/20 text-amber-400' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary/70'
                    }`}
                  >
                    {m.roleInGroup === 'lead' ? '★ Lead' : 'Worker'}
                  </button>
                  <button onClick={() => removeMember(m.agentId)} className="p-0.5 text-muted-foreground hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {availableAgents.length > 0 && (
          <div className="max-h-28 overflow-y-auto scrollbar-thin space-y-1 rounded-lg border border-border/20 p-2 bg-secondary/10">
            {availableAgents.map(a => (
              <button
                key={a.id}
                onClick={() => addMember(a.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[10px] hover:bg-secondary/40 text-muted-foreground transition-colors"
              >
                <Plus className="w-3 h-3 shrink-0" />
                <span className="truncate">{a.name}</span>
                <span className="text-[9px] ml-auto opacity-60 truncate">{a.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-border/20 mt-auto">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg bg-secondary/40 text-muted-foreground hover:bg-secondary/60">Cancel</button>
        <button
          onClick={() => onSave({ name, description, strategy, members })}
          disabled={!name.trim() || members.length < 2}
          className="px-4 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
        >
          <Users className="w-3 h-3" /> {editMode ? 'Save Changes' : 'Create Group'}
        </button>
      </div>
    </motion.div>
  );
};

export default CreateGroupForm;

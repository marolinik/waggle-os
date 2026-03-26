import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Plus, Search, Loader2, Wrench, ChevronRight, Sparkles,
  Trash2, X, Check, AlertCircle, Pencil, Save, Users, Play,
  ArrowRight, Crown, Cog,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { adapter } from '@/lib/adapter';
import { PERSONAS, type PersonaConfig } from '@/lib/personas';

/* ── Types ── */
interface BackendPersona {
  id: string;
  name: string;
  description: string;
  icon?: string;
  workspaceAffinity?: string[];
  suggestedCommands?: string[];
  tools?: string[];
  systemPrompt?: string;
  custom?: boolean;
}

interface AgentGroup {
  id: string;
  name: string;
  description?: string;
  strategy: 'parallel' | 'sequential' | 'coordinator';
  members: AgentGroupMember[];
}

interface AgentGroupMember {
  agentId: string;
  roleInGroup: 'lead' | 'worker';
  executionOrder: number;
}

interface ToolDef {
  name: string;
  description?: string;
}

/* ── Agent Card ── */
const AgentCard = ({
  agent,
  localPersona,
  selected,
  onSelect,
  onDelete,
}: {
  agent: BackendPersona;
  localPersona?: PersonaConfig;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) => (
  <motion.button
    layout
    onClick={onSelect}
    className={`relative group w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
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
      <p className="text-[10px] text-muted-foreground truncate">{agent.description}</p>
    </div>
    {agent.custom && onDelete && (
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    )}
    <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${selected ? 'rotate-90' : ''}`} />
  </motion.button>
);

/* ── Detail Panel ── */
const AgentDetail = ({
  agent,
  localPersona,
  allTools,
  onEdit,
}: {
  agent: BackendPersona;
  localPersona?: PersonaConfig;
  allTools: ToolDef[];
  onEdit?: () => void;
}) => {
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

/* ── Create/Edit Agent Form ── */
const CreateAgentForm = ({
  allTools,
  onSave,
  onCancel,
  generating,
  onGenerate,
  initialData,
  editMode,
}: {
  allTools: ToolDef[];
  onSave: (data: { name: string; description: string; icon: string; tools: string[]; systemPrompt: string }) => void;
  onCancel: () => void;
  generating: boolean;
  onGenerate: (prompt: string) => Promise<{ name: string; description: string; systemPrompt: string; tools: string[] } | null>;
  initialData?: { name: string; description: string; icon: string; tools: string[]; systemPrompt: string };
  editMode?: boolean;
}) => {
  const [name, setName] = useState(initialData?.name ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [icon, setIcon] = useState(initialData?.icon ?? '🤖');
  const [systemPrompt, setSystemPrompt] = useState(initialData?.systemPrompt ?? '');
  const [selectedTools, setSelectedTools] = useState<string[]>(initialData?.tools ?? []);
  const [icon, setIcon] = useState('🤖');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [toolSearch, setToolSearch] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const filteredTools = allTools.filter(t =>
    t.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
    (t.description ?? '').toLowerCase().includes(toolSearch.toLowerCase())
  );

  const toggleTool = (name: string) => {
    setSelectedTools(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]);
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const result = await onGenerate(aiPrompt);
      if (result) {
        setName(result.name);
        setDescription(result.description);
        setSystemPrompt(result.systemPrompt);
        setSelectedTools(result.tools.filter(t => allTools.some(at => at.name === t)));
      }
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col gap-3 overflow-y-auto scrollbar-thin"
    >
      {/* AI Generation */}
      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-display font-semibold text-primary uppercase tracking-wider">Generate with AI</span>
        </div>
        <div className="flex gap-2">
          <input
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            placeholder="e.g. A code reviewer that checks for security issues..."
            className="flex-1 text-xs bg-background/50 border border-border/30 rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            onKeyDown={e => e.key === 'Enter' && handleAiGenerate()}
          />
          <button
            onClick={handleAiGenerate}
            disabled={aiLoading || !aiPrompt.trim()}
            className="px-3 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
          >
            {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Generate
          </button>
        </div>
      </div>

      {/* Form Fields */}
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 items-center">
        <label className="text-[10px] text-muted-foreground font-display uppercase tracking-wider">Icon</label>
        <input value={icon} onChange={e => setIcon(e.target.value)} className="w-12 text-center text-lg bg-secondary/30 border border-border/30 rounded-lg py-1 focus:outline-none" />

        <label className="text-[10px] text-muted-foreground font-display uppercase tracking-wider">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Agent name" className="text-xs bg-secondary/30 border border-border/30 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary/50" />

        <label className="text-[10px] text-muted-foreground font-display uppercase tracking-wider">Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this agent do?" className="text-xs bg-secondary/30 border border-border/30 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary/50" />

        <label className="text-[10px] text-muted-foreground font-display uppercase tracking-wider self-start pt-2">System Prompt</label>
        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          placeholder="Instructions for this agent..."
          rows={4}
          className="text-xs bg-secondary/30 border border-border/30 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary/50 resize-none"
        />
      </div>

      {/* Tool Picker */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Wrench className="w-3 h-3" /> Tools ({selectedTools.length} selected)
          </h4>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              value={toolSearch}
              onChange={e => setToolSearch(e.target.value)}
              placeholder="Filter tools..."
              className="text-[10px] bg-secondary/30 border border-border/30 rounded-lg pl-6 pr-2 py-1 w-36 focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>
        <div className="max-h-32 overflow-y-auto scrollbar-thin space-y-1 rounded-lg border border-border/20 p-2 bg-secondary/10">
          {filteredTools.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic py-2 text-center">No tools found</p>
          ) : (
            filteredTools.map(tool => (
              <button
                key={tool.name}
                onClick={() => toggleTool(tool.name)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[10px] transition-colors ${
                  selectedTools.includes(tool.name)
                    ? 'bg-primary/15 text-foreground'
                    : 'hover:bg-secondary/40 text-muted-foreground'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                  selectedTools.includes(tool.name) ? 'bg-primary border-primary' : 'border-border/50'
                }`}>
                  {selectedTools.includes(tool.name) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </div>
                <span className="font-mono truncate">{tool.name}</span>
                {tool.description && <span className="text-muted-foreground truncate ml-auto">— {tool.description}</span>}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-border/20">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg bg-secondary/40 text-muted-foreground hover:bg-secondary/60">
          Cancel
        </button>
        <button
          onClick={() => onSave({ name, description, icon, tools: selectedTools, systemPrompt })}
          disabled={!name.trim() || !systemPrompt.trim()}
          className="px-4 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
        >
          {editMode ? <Save className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {editMode ? 'Save Changes' : 'Create Agent'}
        </button>
      </div>
    </motion.div>
  );
};

/* ── Strategy labels ── */
const STRATEGY_CONFIG: Record<string, { label: string; description: string; color: string }> = {
  parallel: { label: 'Parallel', description: 'All agents work simultaneously', color: 'bg-emerald-500/20 text-emerald-400' },
  sequential: { label: 'Sequential', description: 'Agents work one after another', color: 'bg-sky-500/20 text-sky-400' },
  coordinator: { label: 'Coordinator', description: 'Lead agent delegates to workers', color: 'bg-amber-500/20 text-amber-400' },
};

/* ── Group Card ── */
const GroupCard = ({
  group,
  agents,
  selected,
  onSelect,
  onDelete,
}: {
  group: AgentGroup;
  agents: BackendPersona[];
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) => {
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
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${strat.color}`}>{strat.label}</span>
          <span className="text-[10px] text-muted-foreground">{group.members.length} agents</span>
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

/* ── Group Detail ── */
const GroupDetail = ({
  group,
  agents,
  onRun,
}: {
  group: AgentGroup;
  agents: BackendPersona[];
  onRun: (task: string) => void;
}) => {
  const [task, setTask] = useState('');
  const strat = STRATEGY_CONFIG[group.strategy];
  const sortedMembers = [...group.members].sort((a, b) => a.executionOrder - b.executionOrder);

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex-1 flex flex-col gap-4 overflow-y-auto scrollbar-thin"
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-display font-bold text-foreground">{group.name}</h3>
        </div>
        {group.description && <p className="text-xs text-muted-foreground">{group.description}</p>}
        <div className="mt-2 flex items-center gap-2">
          <span className={`text-[10px] px-2 py-1 rounded-full ${strat.color}`}>{strat.label}</span>
          <span className="text-[10px] text-muted-foreground">{strat.description}</span>
        </div>
      </div>

      {/* Members */}
      <div>
        <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">
          Members ({sortedMembers.length})
        </h4>
        <div className="space-y-2">
          {sortedMembers.map((member, idx) => {
            const agent = agents.find(a => a.id === member.agentId);
            const persona = agent ? PERSONAS.find(p => p.id === agent.id) : undefined;
            return (
              <div key={member.agentId} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/20 border border-border/20">
                {group.strategy === 'sequential' && (
                  <span className="text-[10px] font-mono text-muted-foreground w-4 text-center">{idx + 1}</span>
                )}
                {group.strategy === 'sequential' && idx < sortedMembers.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-muted-foreground/50 absolute -bottom-3 left-1/2" />
                )}
                <Avatar className="w-7 h-7 shrink-0">
                  {persona?.avatar ? (
                    <AvatarImage src={persona.avatar} />
                  ) : (
                    <AvatarFallback className="text-[10px] bg-primary/20">{agent?.icon || agent?.name?.[0] || '?'}</AvatarFallback>
                  )}
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium text-foreground truncate">{agent?.name ?? member.agentId}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{agent?.description ?? ''}</p>
                </div>
                {member.roleInGroup === 'lead' ? (
                  <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                    <Crown className="w-2.5 h-2.5" /> Lead
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">
                    <Cog className="w-2.5 h-2.5" /> Worker
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Run task */}
      <div className="mt-auto pt-3 border-t border-border/20">
        <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">Run a Task</h4>
        <div className="flex gap-2">
          <input
            value={task}
            onChange={e => setTask(e.target.value)}
            placeholder="Describe the task for this group..."
            className="flex-1 text-xs bg-secondary/30 border border-border/30 rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            onKeyDown={e => e.key === 'Enter' && task.trim() && onRun(task)}
          />
          <button
            onClick={() => task.trim() && onRun(task)}
            disabled={!task.trim()}
            className="px-3 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
          >
            <Play className="w-3 h-3" /> Run
          </button>
        </div>
      </div>
    </motion.div>
  );
};

/* ── Create Group Form ── */
const CreateGroupForm = ({
  agents,
  onSave,
  onCancel,
}: {
  agents: BackendPersona[];
  onSave: (data: { name: string; description: string; strategy: 'parallel' | 'sequential' | 'coordinator'; members: AgentGroupMember[] }) => void;
  onCancel: () => void;
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [strategy, setStrategy] = useState<'parallel' | 'sequential' | 'coordinator'>('parallel');
  const [members, setMembers] = useState<AgentGroupMember[]>([]);

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
        <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">
          Members ({members.length})
        </h4>
        {members.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {members.map((m) => {
              const agent = agents.find(a => a.id === m.agentId);
              return (
                <div key={m.agentId} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/20 border border-border/20">
                  <span className="text-[10px] font-mono text-muted-foreground w-4 text-center">{m.executionOrder + 1}</span>
                  <span className="text-[10px] font-medium text-foreground flex-1 truncate">{agent?.name ?? m.agentId}</span>
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
          <Users className="w-3 h-3" /> Create Group
        </button>
      </div>
    </motion.div>
  );
};

const AgentsApp = () => {
  const [tab, setTab] = useState<'agents' | 'groups'>('agents');
  const [agents, setAgents] = useState<BackendPersona[]>([]);
  const [groups, setGroups] = useState<AgentGroup[]>([]);
  const [allTools, setAllTools] = useState<ToolDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [editingAgent, setEditingAgent] = useState<BackendPersona | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [personasRes, capsRes, groupsRes] = await Promise.allSettled([
        adapter.getPersonas(),
        adapter.getCapabilityStatus(),
        adapter.getAgentGroups(),
      ]);

      const backendPersonas: BackendPersona[] =
        personasRes.status === 'fulfilled'
          ? (personasRes.value as any[]).map(p => ({ ...p, custom: false }))
          : PERSONAS.map(p => ({ id: p.id, name: p.name, description: p.description, icon: undefined, custom: false }));
      setAgents(backendPersonas);

      if (groupsRes.status === 'fulfilled') {
        setGroups(groupsRes.value as AgentGroup[]);
      }

      if (capsRes.status === 'fulfilled') {
        const caps = capsRes.value as any;
        const tools: ToolDef[] = [];
        if (caps.commands) {
          caps.commands.forEach((c: any) => tools.push({ name: c.name, description: c.description }));
        }
        if (caps.plugins) {
          caps.plugins.forEach((p: any) => {
            for (let i = 0; i < (p.tools ?? 0); i++) {
              tools.push({ name: `${p.name}:tool-${i + 1}`, description: `Plugin tool from ${p.name}` });
            }
          });
        }
        if (caps.mcpServers) {
          caps.mcpServers.forEach((m: any) => {
            for (let i = 0; i < (m.tools ?? 0); i++) {
              tools.push({ name: `${m.name}:tool-${i + 1}`, description: `MCP tool from ${m.name}` });
            }
          });
        }
        setAllTools(tools);
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedAgent = agents.find(a => a.id === selectedId);
  const localPersona = selectedAgent ? PERSONAS.find(p => p.id === selectedAgent.id) : undefined;
  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.description.toLowerCase().includes(search.toLowerCase())
  );

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    (g.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (data: { name: string; description: string; icon: string; tools: string[]; systemPrompt: string }) => {
    try {
      await adapter.createPersona({ name: data.name, description: data.description, icon: data.icon, systemPrompt: data.systemPrompt, tools: data.tools });
      setShowCreate(false);
      await loadData();
    } catch { setError('Failed to create agent'); }
  };

  const handleUpdate = async (data: { name: string; description: string; icon: string; tools: string[]; systemPrompt: string }) => {
    if (!editingAgent) return;
    try {
      await adapter.updatePersona(editingAgent.id, { name: data.name, description: data.description, icon: data.icon, systemPrompt: data.systemPrompt, tools: data.tools });
      setEditingAgent(null);
      await loadData();
    } catch { setError('Failed to update agent'); }
  };

  const handleDelete = async (id: string) => {
    try {
      await adapter.deletePersona(id);
      if (selectedId === id) setSelectedId(null);
      await loadData();
    } catch { setError('Failed to delete agent'); }
  };

  const handleCreateGroup = async (data: { name: string; description: string; strategy: 'parallel' | 'sequential' | 'coordinator'; members: AgentGroupMember[] }) => {
    try {
      await adapter.createAgentGroup(data);
      setShowCreateGroup(false);
      await loadData();
    } catch { setError('Failed to create group'); }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await adapter.deleteAgentGroup(id);
      if (selectedGroupId === id) setSelectedGroupId(null);
      await loadData();
    } catch { setError('Failed to delete group'); }
  };

  const handleRunGroup = async (groupId: string, task: string) => {
    try {
      await adapter.runAgentGroup(groupId, task);
    } catch { setError('Failed to run group task'); }
  };

  const handleAiGenerate = async (prompt: string) => {
    try {
      return await adapter.generatePersona(prompt);
    } catch {
      setError('AI generation failed');
      return null;
    }
  };

  const resetSelections = (newTab: 'agents' | 'groups') => {
    setTab(newTab);
    setSelectedId(null);
    setSelectedGroupId(null);
    setShowCreate(false);
    setShowCreateGroup(false);
    setEditingAgent(null);
    setSearch('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-display font-bold text-foreground">Agents</h2>
          {/* Tabs */}
          <div className="flex items-center gap-0.5 ml-2 bg-secondary/30 rounded-lg p-0.5">
            <button
              onClick={() => resetSelections('agents')}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
                tab === 'agents' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Bot className="w-3 h-3 inline mr-1" />Agents ({agents.length})
            </button>
            <button
              onClick={() => resetSelections('groups')}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors ${
                tab === 'groups' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="w-3 h-3 inline mr-1" />Groups ({groups.length})
            </button>
          </div>
        </div>
        {tab === 'agents' ? (
          <button
            onClick={() => { setShowCreate(!showCreate); setSelectedId(null); setEditingAgent(null); }}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              showCreate ? 'bg-secondary/50 text-muted-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {showCreate ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {showCreate ? 'Cancel' : 'New Agent'}
          </button>
        ) : (
          <button
            onClick={() => { setShowCreateGroup(!showCreateGroup); setSelectedGroupId(null); }}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              showCreateGroup ? 'bg-secondary/50 text-muted-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {showCreateGroup ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {showCreateGroup ? 'Cancel' : 'New Group'}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-3 h-3" /></button>
        </div>
      )}

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Left sidebar */}
        <div className="w-60 shrink-0 flex flex-col gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tab === 'agents' ? 'Search agents...' : 'Search groups...'}
              className="w-full text-xs bg-secondary/30 border border-border/30 rounded-lg pl-8 pr-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-1.5">
            {tab === 'agents' ? (
              <AnimatePresence>
                {filtered.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    localPersona={PERSONAS.find(p => p.id === agent.id)}
                    selected={selectedId === agent.id && !showCreate && !editingAgent}
                    onSelect={() => { setSelectedId(agent.id); setShowCreate(false); setEditingAgent(null); }}
                    onDelete={agent.custom ? () => handleDelete(agent.id) : undefined}
                  />
                ))}
                {filtered.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-6">No agents found</p>
                )}
              </AnimatePresence>
            ) : (
              <AnimatePresence>
                {filteredGroups.map(group => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    agents={agents}
                    selected={selectedGroupId === group.id && !showCreateGroup}
                    onSelect={() => { setSelectedGroupId(group.id); setShowCreateGroup(false); }}
                    onDelete={() => handleDeleteGroup(group.id)}
                  />
                ))}
                {filteredGroups.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-6">No groups yet</p>
                )}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          {tab === 'agents' ? (
            showCreate ? (
              <CreateAgentForm allTools={allTools} onSave={handleCreate} onCancel={() => setShowCreate(false)} generating={false} onGenerate={handleAiGenerate} />
            ) : editingAgent ? (
              <CreateAgentForm
                key={`edit-${editingAgent.id}`}
                allTools={allTools}
                onSave={handleUpdate}
                onCancel={() => setEditingAgent(null)}
                generating={false}
                onGenerate={handleAiGenerate}
                editMode
                initialData={{ name: editingAgent.name, description: editingAgent.description, icon: editingAgent.icon ?? '🤖', tools: editingAgent.tools ?? [], systemPrompt: editingAgent.systemPrompt ?? '' }}
              />
            ) : selectedAgent ? (
              <AgentDetail agent={selectedAgent} localPersona={localPersona} allTools={allTools} onEdit={selectedAgent.custom ? () => setEditingAgent(selectedAgent) : undefined} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Select an agent to view details</p>
                  <p className="text-[10px] mt-1">or create a new one with AI</p>
                </div>
              </div>
            )
          ) : (
            showCreateGroup ? (
              <CreateGroupForm agents={agents} onSave={handleCreateGroup} onCancel={() => setShowCreateGroup(false)} />
            ) : selectedGroup ? (
              <GroupDetail group={selectedGroup} agents={agents} onRun={(task) => handleRunGroup(selectedGroup.id, task)} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Select a group to view details</p>
                  <p className="text-[10px] mt-1">or create a new collaborative workflow</p>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentsApp;

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Plus, Search, Loader2, Wrench, ChevronRight, Sparkles,
  Trash2, X, Check, AlertCircle, Pencil, Save, Users, Play,
  ArrowRight, Crown, Cog, GripVertical, ChevronUp, ChevronDown,
  CheckCircle2, XCircle, Clock, Activity, Copy, StopCircle,
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
/* ── Execution status types ── */
type MemberExecStatus = 'pending' | 'running' | 'done' | 'failed';

interface MemberExecState {
  agentId: string;
  status: MemberExecStatus;
  startedAt?: number;
  completedAt?: number;
  result?: string;
  error?: string;
}

interface GroupExecState {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  task: string;
  startedAt: number;
  completedAt?: number;
  members: MemberExecState[];
  output?: Record<string, unknown>;
}

const STATUS_ICON: Record<MemberExecStatus, React.ReactNode> = {
  pending: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
  running: <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />,
  done: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
  failed: <XCircle className="w-3.5 h-3.5 text-destructive" />,
};

const STATUS_LABEL: Record<MemberExecStatus, string> = {
  pending: 'Pending',
  running: 'Running…',
  done: 'Complete',
  failed: 'Failed',
};

/* ── GroupExecutionPanel — shows live per-member progress ── */
const GroupExecutionPanel = ({
  exec,
  agents,
  strategy,
  onDismiss,
  onCancel,
}: {
  exec: GroupExecState;
  agents: BackendPersona[];
  strategy: AgentGroup['strategy'];
  onDismiss: () => void;
  onCancel: () => void;
}) => {
  const elapsed = ((exec.completedAt ?? Date.now()) - exec.startedAt) / 1000;
  const doneCount = exec.members.filter(m => m.status === 'done').length;
  const failCount = exec.members.filter(m => m.status === 'failed').length;
  const total = exec.members.length;
  const progress = total > 0 ? ((doneCount + failCount) / total) * 100 : 0;
  const isFinished = exec.status === 'completed' || exec.status === 'failed' || exec.status === 'cancelled';
  const isRunning = exec.status === 'running' || exec.status === 'queued';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 bg-card/80 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border/20 flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" />
        <span className="text-[11px] font-display font-bold text-foreground flex-1">
          {exec.status === 'cancelled' ? 'Cancelled' : isFinished ? 'Execution Complete' : 'Running…'}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">{elapsed.toFixed(1)}s</span>
        {isRunning && (
          <button
            onClick={onCancel}
            className="ml-1 flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
          >
            <StopCircle className="w-3 h-3" /> Cancel
          </button>
        )}
        {isFinished && (
          <button onClick={onDismiss} className="ml-1 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-secondary/30">
        <motion.div
          className={`h-full ${exec.status === 'failed' ? 'bg-destructive' : 'bg-primary'}`}
          initial={{ width: 0 }}
          animate={{ width: `${isFinished ? 100 : progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      {/* Task */}
      <div className="px-3 py-2 border-b border-border/10">
        <p className="text-[10px] text-muted-foreground truncate">
          <span className="font-medium text-foreground">Task:</span> {exec.task}
        </p>
      </div>

      {/* Per-member status */}
      <div className="px-3 py-2 space-y-1.5">
        {exec.members.map((memberExec, idx) => {
          const agent = agents.find(a => a.id === memberExec.agentId);
          const persona = agent ? PERSONAS.find(p => p.id === agent.id) : undefined;
          const memberElapsed = memberExec.startedAt
            ? (((memberExec.completedAt ?? Date.now()) - memberExec.startedAt) / 1000).toFixed(1)
            : null;

          return (
            <motion.div
              key={memberExec.agentId}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`flex items-center gap-2.5 p-2 rounded-lg border transition-colors ${
                memberExec.status === 'running'
                  ? 'border-primary/30 bg-primary/5'
                  : memberExec.status === 'done'
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : memberExec.status === 'failed'
                  ? 'border-destructive/20 bg-destructive/5'
                  : 'border-border/10 bg-secondary/10'
              }`}
            >
              {strategy === 'sequential' && (
                <span className="text-[9px] font-mono text-muted-foreground w-3 text-center">{idx + 1}</span>
              )}
              <Avatar className="w-6 h-6 shrink-0">
                {persona?.avatar ? (
                  <AvatarImage src={persona.avatar} />
                ) : (
                  <AvatarFallback className="text-[9px] bg-primary/20">{agent?.icon || agent?.name?.[0] || '?'}</AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium text-foreground truncate">{agent?.name ?? memberExec.agentId}</p>
                {memberExec.status === 'done' && memberExec.result && (
                  <p className="text-[9px] text-muted-foreground truncate mt-0.5">{memberExec.result.slice(0, 120)}</p>
                )}
                {memberExec.status === 'failed' && memberExec.error && (
                  <p className="text-[9px] text-destructive truncate mt-0.5">{memberExec.error}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {memberElapsed && <span className="text-[9px] font-mono text-muted-foreground">{memberElapsed}s</span>}
                {STATUS_ICON[memberExec.status]}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Summary when done */}
      {isFinished && (
        <div className="px-3 py-2 border-t border-border/20 flex items-center gap-2">
          {exec.status === 'completed' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <XCircle className="w-4 h-4 text-destructive" />
          )}
          <span className="text-[10px] text-foreground font-medium">
            {doneCount}/{total} succeeded{failCount > 0 ? `, ${failCount} failed` : ''}
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto">{elapsed.toFixed(1)}s total</span>
        </div>
      )}

      {/* Output preview */}
      {isFinished && exec.output && (
        <div className="px-3 py-2 border-t border-border/10">
          <details className="group">
            <summary className="text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground">
              View output
            </summary>
            <pre className="mt-1.5 text-[9px] text-muted-foreground bg-secondary/20 rounded-lg p-2 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
              {JSON.stringify(exec.output, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </motion.div>
  );
};

/* ── GroupDetail ── */
const GroupDetail = ({
  group,
  agents,
  onRun,
  onEdit,
  onDuplicate,
}: {
  group: AgentGroup;
  agents: BackendPersona[];
  onRun: (task: string) => Promise<GroupExecState | null>;
  onEdit: () => void;
  onDuplicate: () => void;
}) => {
  const [task, setTask] = useState('');
  const [execState, setExecState] = useState<GroupExecState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const strat = STRATEGY_CONFIG[group.strategy];
  const sortedMembers = [...group.members].sort((a, b) => a.executionOrder - b.executionOrder);

  // Poll job status when running
  useEffect(() => {
    if (!execState || execState.status === 'completed' || execState.status === 'failed') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const poll = async () => {
      try {
        const res = await adapter.getJobStatus(execState.jobId);
        if (!res) return;
        setExecState(prev => {
          if (!prev) return prev;
          const updated = { ...prev };
          if (res.status) updated.status = res.status;
          if (res.completedAt) updated.completedAt = new Date(res.completedAt).getTime();
          if (res.output) updated.output = res.output as Record<string, unknown>;
          // Simulate per-member progress based on job status
          if (res.status === 'running') {
            const strategy = group.strategy;
            const now = Date.now();
            updated.members = updated.members.map((m, i) => {
              if (m.status === 'done' || m.status === 'failed') return m;
              if (strategy === 'sequential') {
                const doneCount = updated.members.filter(mm => mm.status === 'done').length;
                if (i === doneCount) return { ...m, status: 'running' as const, startedAt: m.startedAt ?? now };
                return m;
              }
              // parallel / coordinator: all run at once
              return { ...m, status: 'running' as const, startedAt: m.startedAt ?? now };
            });
          }
          if (res.status === 'completed') {
            updated.members = updated.members.map(m => ({
              ...m,
              status: 'done' as const,
              completedAt: m.completedAt ?? Date.now(),
              result: m.result ?? 'Completed',
            }));
          }
          if (res.status === 'failed') {
            updated.members = updated.members.map(m =>
              m.status === 'running' ? { ...m, status: 'failed' as const, completedAt: Date.now(), error: 'Job failed' } : m,
            );
          }
          return updated;
        });
      } catch { /* ignore poll errors */ }
    };

    pollRef.current = setInterval(poll, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [execState?.jobId, execState?.status, group.strategy]);

  const handleRun = async () => {
    if (!task.trim()) return;
    const exec = await onRun(task);
    if (exec) {
      setExecState(exec);
      setTask('');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex-1 flex flex-col gap-4 overflow-y-auto scrollbar-thin"
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-display font-bold text-foreground flex-1">{group.name}</h3>
          <button
            onClick={onDuplicate}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-lg bg-secondary/50 hover:bg-secondary/70 text-foreground transition-colors"
          >
            <Copy className="w-3 h-3" /> Duplicate
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-lg bg-secondary/50 hover:bg-secondary/70 text-foreground transition-colors"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
        {group.description && <p className="text-xs text-muted-foreground">{group.description}</p>}
        <div className="mt-2 flex items-center gap-2">
          <span className={`text-[10px] px-2 py-1 rounded-full ${strat.color}`}>{strat.label}</span>
          <span className="text-[10px] text-muted-foreground">{strat.description}</span>
        </div>
      </div>

      {/* Execution status panel */}
      <AnimatePresence>
        {execState && (
          <GroupExecutionPanel
            exec={execState}
            agents={agents}
            strategy={group.strategy}
            onDismiss={() => setExecState(null)}
          />
        )}
      </AnimatePresence>

      {/* Members */}
      <div>
        <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">
          Members ({sortedMembers.length})
        </h4>
        <div className="space-y-2">
          {sortedMembers.map((member, idx) => {
            const agent = agents.find(a => a.id === member.agentId);
            const persona = agent ? PERSONAS.find(p => p.id === agent.id) : undefined;
            const memberExec = execState?.members.find(m => m.agentId === member.agentId);
            return (
              <div
                key={member.agentId}
                className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                  memberExec?.status === 'running'
                    ? 'border-primary/30 bg-primary/5'
                    : memberExec?.status === 'done'
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : memberExec?.status === 'failed'
                    ? 'border-destructive/20 bg-destructive/5'
                    : 'bg-secondary/20 border-border/20'
                }`}
              >
                {group.strategy === 'sequential' && (
                  <span className="text-[10px] font-mono text-muted-foreground w-4 text-center">{idx + 1}</span>
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
                {memberExec ? (
                  <div className="flex items-center gap-1">
                    {STATUS_ICON[memberExec.status]}
                    <span className="text-[9px] text-muted-foreground">{STATUS_LABEL[memberExec.status]}</span>
                  </div>
                ) : member.roleInGroup === 'lead' ? (
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
            onKeyDown={e => e.key === 'Enter' && handleRun()}
            disabled={execState?.status === 'running' || execState?.status === 'queued'}
          />
          <button
            onClick={handleRun}
            disabled={!task.trim() || execState?.status === 'running' || execState?.status === 'queued'}
            className="px-3 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
          >
            {execState?.status === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            {execState?.status === 'running' ? 'Running' : 'Run'}
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
  initialData,
  editMode,
}: {
  agents: BackendPersona[];
  onSave: (data: { name: string; description: string; strategy: 'parallel' | 'sequential' | 'coordinator'; members: AgentGroupMember[] }) => void;
  onCancel: () => void;
  initialData?: { name: string; description: string; strategy: 'parallel' | 'sequential' | 'coordinator'; members: AgentGroupMember[] };
  editMode?: boolean;
}) => {
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
        <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">
          Members ({members.length})
        </h4>
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
                    <button
                      onClick={() => moveMember(idx, idx - 1)}
                      disabled={idx === 0}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-opacity"
                      title="Move up"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => moveMember(idx, idx + 1)}
                      disabled={idx === members.length - 1}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-opacity"
                      title="Move down"
                    >
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
  const [editingGroup, setEditingGroup] = useState<AgentGroup | null>(null);
  const [duplicatingGroup, setDuplicatingGroup] = useState<AgentGroup | null>(null);
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

  const handleUpdateGroup = async (data: { name: string; description: string; strategy: 'parallel' | 'sequential' | 'coordinator'; members: AgentGroupMember[] }) => {
    if (!editingGroup) return;
    try {
      await adapter.updateAgentGroup(editingGroup.id, data);
      setEditingGroup(null);
      await loadData();
    } catch { setError('Failed to update group'); }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await adapter.deleteAgentGroup(id);
      if (selectedGroupId === id) setSelectedGroupId(null);
      await loadData();
    } catch { setError('Failed to delete group'); }
  };

  const handleRunGroup = async (groupId: string, task: string): Promise<GroupExecState | null> => {
    try {
      const group = groups.find(g => g.id === groupId);
      const result = await adapter.runAgentGroup(groupId, task) as { jobId?: string; id?: string };
      const jobId = result?.jobId ?? result?.id ?? `job-${Date.now()}`;
      const members: MemberExecState[] = (group?.members ?? [])
        .sort((a, b) => a.executionOrder - b.executionOrder)
        .map(m => ({ agentId: m.agentId, status: 'pending' as const }));
      return {
        jobId,
        status: 'queued',
        task,
        startedAt: Date.now(),
        members,
      };
    } catch {
      setError('Failed to run group task');
      return null;
    }
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
    setEditingGroup(null);
    setDuplicatingGroup(null);
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
            ) : editingGroup ? (
              <CreateGroupForm
                key={`edit-group-${editingGroup.id}`}
                agents={agents}
                onSave={handleUpdateGroup}
                onCancel={() => setEditingGroup(null)}
                editMode
                initialData={{
                  name: editingGroup.name,
                  description: editingGroup.description ?? '',
                  strategy: editingGroup.strategy,
                  members: editingGroup.members,
                }}
              />
            ) : duplicatingGroup ? (
              <CreateGroupForm
                key={`dup-group-${duplicatingGroup.id}`}
                agents={agents}
                onSave={(data) => { handleCreateGroup(data); setDuplicatingGroup(null); }}
                onCancel={() => setDuplicatingGroup(null)}
                initialData={{
                  name: `${duplicatingGroup.name} (Copy)`,
                  description: duplicatingGroup.description ?? '',
                  strategy: duplicatingGroup.strategy,
                  members: duplicatingGroup.members,
                }}
              />
            ) : selectedGroup ? (
              <GroupDetail group={selectedGroup} agents={agents} onRun={(task) => handleRunGroup(selectedGroup.id, task)} onEdit={() => setEditingGroup(selectedGroup)} onDuplicate={() => setDuplicatingGroup(selectedGroup)} />
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

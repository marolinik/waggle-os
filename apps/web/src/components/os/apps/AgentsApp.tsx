import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Plus, Search, Loader2, Wrench, ChevronRight, Sparkles,
  Trash2, X, Check, AlertCircle, Pencil, Save,
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
  custom?: boolean;
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

/* ── Main App ── */
const AgentsApp = () => {
  const [agents, setAgents] = useState<BackendPersona[]>([]);
  const [allTools, setAllTools] = useState<ToolDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingAgent, setEditingAgent] = useState<BackendPersona | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [personasRes, capsRes] = await Promise.allSettled([
        adapter.getPersonas(),
        adapter.getCapabilityStatus(),
      ]);

      // Merge backend personas with local fallback personas
      const backendPersonas: BackendPersona[] =
        personasRes.status === 'fulfilled'
          ? (personasRes.value as any[]).map(p => ({ ...p, custom: false }))
          : PERSONAS.map(p => ({ id: p.id, name: p.name, description: p.description, icon: undefined, custom: false }));

      setAgents(backendPersonas);

      if (capsRes.status === 'fulfilled') {
        const caps = capsRes.value as any;
        // Extract tool names from capabilities
        const tools: ToolDef[] = [];
        if (caps.commands) {
          caps.commands.forEach((c: any) => tools.push({ name: c.name, description: c.description }));
        }
        // Add native/plugin/mcp tool count info
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
      setError('Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedAgent = agents.find(a => a.id === selectedId);
  const localPersona = selectedAgent ? PERSONAS.find(p => p.id === selectedAgent.id) : undefined;

  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (data: { name: string; description: string; icon: string; tools: string[]; systemPrompt: string }) => {
    try {
      await adapter.createPersona({
        name: data.name,
        description: data.description,
        icon: data.icon,
        systemPrompt: data.systemPrompt,
        tools: data.tools,
      });
      setShowCreate(false);
      await loadData();
    } catch {
      setError('Failed to create agent');
    }
  };

  const handleUpdate = async (data: { name: string; description: string; icon: string; tools: string[]; systemPrompt: string }) => {
    if (!editingAgent) return;
    try {
      await adapter.updatePersona(editingAgent.id, {
        name: data.name,
        description: data.description,
        icon: data.icon,
        systemPrompt: data.systemPrompt,
        tools: data.tools,
      });
      setEditingAgent(null);
      await loadData();
    } catch {
      setError('Failed to update agent');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adapter.deletePersona(id);
      if (selectedId === id) setSelectedId(null);
      await loadData();
    } catch {
      setError('Failed to delete agent');
    }
  };

  const handleAiGenerate = async (prompt: string) => {
    try {
      const res = await adapter.generatePersona(prompt);
      return res;
    } catch {
      setError('AI generation failed');
      return null;
    }
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
          <span className="text-[10px] text-muted-foreground">({agents.length})</span>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setSelectedId(null); setEditingAgent(null); }}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            showCreate
              ? 'bg-secondary/50 text-muted-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
        >
          {showCreate ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {showCreate ? 'Cancel' : 'New Agent'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-3 h-3" /></button>
        </div>
      )}

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Left: Agent List */}
        <div className="w-60 shrink-0 flex flex-col gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search agents..."
              className="w-full text-xs bg-secondary/30 border border-border/30 rounded-lg pl-8 pr-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-1.5">
            <AnimatePresence>
              {filtered.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  localPersona={PERSONAS.find(p => p.id === agent.id)}
                  selected={selectedId === agent.id && !showCreate}
                  onSelect={() => { setSelectedId(agent.id); setShowCreate(false); setEditingAgent(null); }}
                  onDelete={agent.custom ? () => handleDelete(agent.id) : undefined}
                />
              ))}
            </AnimatePresence>
            {filtered.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-6">No agents found</p>
            )}
          </div>
        </div>

        {/* Right: Detail or Create */}
        <div className="flex-1 min-w-0 flex flex-col">
          {showCreate ? (
            <CreateAgentForm
              allTools={allTools}
              onSave={handleCreate}
              onCancel={() => setShowCreate(false)}
              generating={false}
              onGenerate={handleAiGenerate}
            />
          ) : selectedAgent ? (
            <AgentDetail agent={selectedAgent} localPersona={localPersona} allTools={allTools} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Select an agent to view details</p>
                <p className="text-[10px] mt-1">or create a new one with AI</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentsApp;

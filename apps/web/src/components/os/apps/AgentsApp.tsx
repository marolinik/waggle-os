import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Bot, Plus, Search, Loader2, Users, X, AlertCircle, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { adapter } from '@/lib/adapter';
import { PERSONAS } from '@/lib/personas';
import type { BackendPersona, AgentGroup, ToolDef, GroupExecState, MemberExecState } from './agents/types';
import AgentCard from './agents/AgentCard';
import AgentDetail from './agents/AgentDetail';
import CreateAgentForm from './agents/CreateAgentForm';
import GroupCard from './agents/GroupCard';
import GroupDetail from './agents/GroupDetail';
import CreateGroupForm from './agents/CreateGroupForm';

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
          ? (personasRes.value as BackendPersona[]).map(p => ({ ...p, custom: false }))
          : PERSONAS.map(p => ({ id: p.id, name: p.name, description: p.description, icon: undefined, custom: false }));
      setAgents(backendPersonas);

      if (groupsRes.status === 'fulfilled') setGroups(groupsRes.value as AgentGroup[]);

      if (capsRes.status === 'fulfilled') {
        const caps = capsRes.value as { commands?: Array<{ name: string; description: string }>; plugins?: Array<{ name: string; tools?: number }>; mcpServers?: Array<{ name: string; tools?: number }> };
        const tools: ToolDef[] = [];
        if (caps.commands) caps.commands.forEach(c => tools.push({ name: c.name, description: c.description }));
        if (caps.plugins) caps.plugins.forEach(p => { for (let i = 0; i < (p.tools ?? 0); i++) tools.push({ name: `${p.name}:tool-${i + 1}`, description: `Plugin tool from ${p.name}` }); });
        if (caps.mcpServers) caps.mcpServers.forEach(m => { for (let i = 0; i < (m.tools ?? 0); i++) tools.push({ name: `${m.name}:tool-${i + 1}`, description: `MCP tool from ${m.name}` }); });
        setAllTools(tools);
      }
    } catch (err) {
      console.error('[AgentsApp] load failed:', err);
      setError('Failed to load data — server may be unreachable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedAgent = agents.find(a => a.id === selectedId);
  const localPersona = selectedAgent ? PERSONAS.find(p => p.id === selectedAgent.id) : undefined;
  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) || a.description.toLowerCase().includes(search.toLowerCase())
  );
  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase()) || (g.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (data: { name: string; description: string; icon: string; tools: string[]; systemPrompt: string }) => {
    try {
      await adapter.createPersona({ name: data.name, description: data.description, icon: data.icon, systemPrompt: data.systemPrompt, tools: data.tools });
      setShowCreate(false);
      await loadData();
    } catch (err) { console.error('[AgentsApp] create agent failed:', err); setError('Failed to create agent'); }
  };

  const handleUpdate = async (data: { name: string; description: string; icon: string; tools: string[]; systemPrompt: string }) => {
    if (!editingAgent) return;
    try {
      await adapter.updatePersona(editingAgent.id, data);
      setEditingAgent(null);
      await loadData();
    } catch (err) { console.error('[AgentsApp] update agent failed:', err); setError('Failed to update agent'); }
  };

  const handleDelete = async (id: string) => {
    try {
      await adapter.deletePersona(id);
      if (selectedId === id) setSelectedId(null);
      await loadData();
    } catch (err) { console.error('[AgentsApp] delete agent failed:', err); setError('Failed to delete agent'); }
  };

  const handleCreateGroup = async (data: { name: string; description: string; strategy: 'parallel' | 'sequential' | 'coordinator'; members: { agentId: string; roleInGroup: string; executionOrder: number }[] }) => {
    try {
      await adapter.createAgentGroup(data);
      setShowCreateGroup(false);
      await loadData();
    } catch (err) { console.error('[AgentsApp] create group failed:', err); setError('Failed to create group'); }
  };

  const handleUpdateGroup = async (data: { name: string; description: string; strategy: 'parallel' | 'sequential' | 'coordinator'; members: { agentId: string; roleInGroup: string; executionOrder: number }[] }) => {
    if (!editingGroup) return;
    try {
      await adapter.updateAgentGroup(editingGroup.id, data);
      setEditingGroup(null);
      await loadData();
    } catch (err) { console.error('[AgentsApp] update group failed:', err); setError('Failed to update group'); }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await adapter.deleteAgentGroup(id);
      if (selectedGroupId === id) setSelectedGroupId(null);
      await loadData();
    } catch (err) { console.error('[AgentsApp] delete group failed:', err); setError('Failed to delete group'); }
  };

  const handleRunGroup = async (groupId: string, task: string): Promise<GroupExecState | null> => {
    try {
      const group = groups.find(g => g.id === groupId);
      const result = await adapter.runAgentGroup(groupId, task) as { jobId?: string; id?: string };
      const jobId = result?.jobId ?? result?.id ?? `job-${Date.now()}`;
      const members: MemberExecState[] = (group?.members ?? [])
        .sort((a, b) => a.executionOrder - b.executionOrder)
        .map(m => ({ agentId: m.agentId, status: 'pending' as const }));
      return { jobId, status: 'queued', task, startedAt: Date.now(), members };
    } catch (err) {
      console.error('[AgentsApp] run group failed:', err);
      setError('Failed to run group task');
      return null;
    }
  };

  const handleAiGenerate = async (prompt: string) => {
    try { return await adapter.generatePersona(prompt); }
    catch (err) { console.error('[AgentsApp] AI generate failed:', err); setError('AI generation failed'); return null; }
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
          <div className="flex items-center gap-0.5 ml-2 bg-secondary/30 rounded-lg p-0.5" role="tablist" aria-label="Agent sections">
            <button
              onClick={() => resetSelections('agents')}
              role="tab"
              aria-selected={tab === 'agents'}
              tabIndex={tab === 'agents' ? 0 : -1}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                tab === 'agents' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Bot className="w-3 h-3 inline mr-1" />Agents ({agents.length})
            </button>
            <button
              onClick={() => resetSelections('groups')}
              role="tab"
              aria-selected={tab === 'groups'}
              tabIndex={tab === 'groups' ? 0 : -1}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
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
          <button onClick={() => { setError(null); loadData(); }} className="ml-auto flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 mr-2">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
          <button onClick={() => setError(null)}><X className="w-3 h-3" /></button>
        </div>
      )}

      <div className="flex gap-3 flex-1 min-h-0" role="tabpanel">
        {/* Left sidebar */}
        <div className="w-60 shrink-0 flex flex-col gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tab === 'agents' ? 'Search agents...' : 'Search groups...'}
              className="w-full text-xs bg-secondary/30 pl-8 pr-3"
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
                {filtered.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-6">No agents found</p>}
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
                {filteredGroups.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-6">No groups yet</p>}
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
                  <p className="text-[11px] mt-1">or create a new one with AI</p>
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
                initialData={{ name: editingGroup.name, description: editingGroup.description ?? '', strategy: editingGroup.strategy, members: editingGroup.members }}
              />
            ) : duplicatingGroup ? (
              <CreateGroupForm
                key={`dup-group-${duplicatingGroup.id}`}
                agents={agents}
                onSave={(data) => { handleCreateGroup(data); setDuplicatingGroup(null); }}
                onCancel={() => setDuplicatingGroup(null)}
                initialData={{ name: `${duplicatingGroup.name} (Copy)`, description: duplicatingGroup.description ?? '', strategy: duplicatingGroup.strategy, members: duplicatingGroup.members }}
              />
            ) : selectedGroup ? (
              <GroupDetail group={selectedGroup} agents={agents} onRun={(task) => handleRunGroup(selectedGroup.id, task)} onEdit={() => setEditingGroup(selectedGroup)} onDuplicate={() => setDuplicatingGroup(selectedGroup)} />
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Select a group to view details</p>
                  <p className="text-[11px] mt-1">or create a new collaborative workflow</p>
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

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Plus, Slash, Paperclip, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Loader2, AlertTriangle, CheckCircle2, XCircle, Clock, Upload, Code, FileText, Users, X, Bot, Cpu, Layers } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getPersonaById, PERSONAS } from '@/lib/personas';
import { adapter } from '@/lib/adapter';
import type { ChatMessage, ToolExecution, ApprovalRequest } from '@/lib/types';
import WorkspaceBriefing from '@/components/os/WorkspaceBriefing';

export interface TeamMember {
  id: string;
  name: string;
  status: string;
  avatar?: string;
}

interface ChatAppProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (content: string) => void;
  onClearHistory: () => void;
  pendingApproval: ApprovalRequest | null;
  onApprove: (id: string, approved: boolean) => void;
  currentPersona?: string;
  onPersonaChange?: (personaId: string) => void;
  currentModel?: string;
  onModelChange?: (model: string) => void;
  availableModels?: string[];
  teamPresence?: TeamMember[];
  sessions?: { id: string; title: string }[];
  activeSessionId?: string | null;
  onSelectSession?: (id: string) => void;
  onNewSession?: () => void;
  workspaceId?: string | null;
  templateId?: string;
}

const TEMPLATE_DISPLAY: Record<string, { label: string; desc: string }> = {
  'sales-pipeline': { label: 'Sales Pipeline', desc: 'Deal tracking & prospecting' },
  'research-project': { label: 'Research Project', desc: 'Deep investigation & synthesis' },
  'code-review': { label: 'Code Review', desc: 'Analyze and review code' },
  'marketing-campaign': { label: 'Marketing Campaign', desc: 'Campaigns & content creation' },
  'product-launch': { label: 'Product Launch', desc: 'Ship products faster' },
  'legal-review': { label: 'Legal Review', desc: 'Contracts & documentation' },
  'agency-consulting': { label: 'Agency Consulting', desc: 'Client workspace management' },
  'blank': { label: 'Custom', desc: 'General-purpose workspace' },
};

const SLASH_COMMANDS = [
  { cmd: '/model', desc: 'Switch model' },
  { cmd: '/models', desc: 'List models' },
  { cmd: '/cost', desc: 'Show cost' },
  { cmd: '/clear', desc: 'Clear history' },
  { cmd: '/identity', desc: 'Agent identity' },
  { cmd: '/awareness', desc: 'Self awareness' },
  { cmd: '/skills', desc: 'List skills' },
  { cmd: '/help', desc: 'Show help' },
  { cmd: '/research', desc: 'Deep research' },
  { cmd: '/draft', desc: 'Draft content' },
  { cmd: '/review', desc: 'Review content' },
  { cmd: '/spawn', desc: 'Spawn sub-agent' },
  { cmd: '/plan', desc: 'Create plan' },
];

const ToolStatusIcon = ({ status }: { status: ToolExecution['status'] }) => {
  switch (status) {
    case 'running': return <Loader2 className="w-3 h-3 text-primary animate-spin" />;
    case 'done': return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
    case 'error': return <XCircle className="w-3 h-3 text-destructive" />;
    case 'denied': return <XCircle className="w-3 h-3 text-muted-foreground" />;
    case 'pending': return <Clock className="w-3 h-3 text-amber-400" />;
    default: return null;
  }
};

const ToolCard = ({ tool }: { tool: ToolExecution }) => {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="my-1 rounded-lg border border-border/50 bg-secondary/50 p-2">
      <div className="flex items-center gap-2 text-xs">
        <ToolStatusIcon status={tool.status} />
        <span className="font-display font-medium text-foreground">{tool.name}</span>
        {tool.duration && <span className="text-muted-foreground ml-auto">{tool.duration}ms</span>}
        <button onClick={() => setShowRaw(!showRaw)} className="text-muted-foreground hover:text-foreground transition-colors">
          <Code className="w-3 h-3" />
        </button>
      </div>
      {tool.output && !showRaw && (
        <div className="mt-1 text-[10px] text-muted-foreground bg-background/50 rounded p-1.5 overflow-x-auto max-h-24">
          {typeof tool.output === 'string' ? tool.output : (
            <div className="space-y-0.5">
              {Object.entries(tool.output as Record<string, unknown>).slice(0, 5).map(([k, v]) => (
                <div key={k} className="flex gap-1">
                  <span className="text-primary/60">{k}:</span>
                  <span className="truncate">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {showRaw && (
        <pre className="mt-1 text-[10px] text-muted-foreground bg-background/50 rounded p-1.5 overflow-x-auto max-h-32">
          {JSON.stringify({ input: tool.input, output: tool.output }, null, 2)}
        </pre>
      )}
    </div>
  );
};

const FeedbackButtons = ({ messageId, feedback }: { messageId: string; feedback?: 'up' | 'down' | null }) => {
  const [vote, setVote] = useState(feedback);
  return (
    <div className="flex items-center gap-1 mt-1">
      <button
        onClick={() => setVote(vote === 'up' ? null : 'up')}
        className={`p-0.5 rounded transition-colors ${vote === 'up' ? 'text-emerald-400' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
      >
        <ThumbsUp className="w-3 h-3" />
      </button>
      <button
        onClick={() => setVote(vote === 'down' ? null : 'down')}
        className={`p-0.5 rounded transition-colors ${vote === 'down' ? 'text-destructive' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
      >
        <ThumbsDown className="w-3 h-3" />
      </button>
    </div>
  );
};

const ApprovalGate = ({ request, onRespond }: { request: ApprovalRequest; onRespond: (id: string, approved: boolean) => void }) => {
  const [showJson, setShowJson] = useState(false);
  return (
    <div className="my-2 rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-3">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-display font-semibold text-foreground">Approval Required</span>
      </div>
      <p className="text-xs text-muted-foreground mb-1">{request.description}</p>
      <p className="text-xs text-muted-foreground mb-2">Tool: <span className="text-foreground">{request.toolName}</span></p>
      {showJson && request.rawJson && (
        <pre className="text-[10px] text-muted-foreground bg-background/50 rounded p-2 mb-2 overflow-auto max-h-24">{request.rawJson}</pre>
      )}
      <div className="flex gap-2">
        <button onClick={() => onRespond(request.requestId, true)} className="px-3 py-1 text-xs rounded-lg bg-emerald-600 text-foreground hover:bg-emerald-500 transition-colors">Approve</button>
        <button onClick={() => onRespond(request.requestId, false)} className="px-3 py-1 text-xs rounded-lg bg-destructive text-foreground hover:bg-destructive/80 transition-colors">Deny</button>
        <button onClick={() => setShowJson(!showJson)} className="px-3 py-1 text-xs rounded-lg bg-secondary text-foreground hover:bg-secondary/70 transition-colors">
          {showJson ? 'Hide' : 'Raw'} JSON
        </button>
      </div>
    </div>
  );
};

const FileDropZone = ({ onDrop, active }: { onDrop: (files: File[]) => void; active: boolean }) => {
  if (!active) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary/50 rounded-xl backdrop-blur-sm">
      <div className="text-center">
        <Upload className="w-8 h-8 text-primary mx-auto mb-2" />
        <p className="text-sm font-display text-primary">Drop files here</p>
        <p className="text-[10px] text-muted-foreground">PDF, CSV, TXT, images</p>
      </div>
    </div>
  );
};

const ChatApp = ({
  messages, isLoading, onSendMessage, onClearHistory,
  pendingApproval, onApprove, currentPersona,
  onPersonaChange, currentModel, onModelChange, availableModels,
  teamPresence,
  sessions, activeSessionId, onSelectSession, onNewSession,
  workspaceId, templateId,
}: ChatAppProps) => {
  const [input, setInput] = useState('');
  const [showSlash, setShowSlash] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [showSessions, setShowSessions] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showAgentProfile, setShowAgentProfile] = useState(false);
  const [showPersonaPicker, setShowPersonaPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const personaPickerRef = useRef<HTMLDivElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  const persona = currentPersona ? getPersonaById(currentPersona) : PERSONAS[0];

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (showPersonaPicker && personaPickerRef.current && !personaPickerRef.current.contains(e.target as Node)) {
        setShowPersonaPicker(false);
      }
      if (showModelPicker && modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPersonaPicker, showModelPicker]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    if (text === '/clear') {
      onClearHistory();
      setInput('');
      return;
    }
    onSendMessage(text);
    setInput('');
    setShowSlash(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlash && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex(i => (i + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filteredCommands[slashIndex];
        setInput(cmd.cmd + ' ');
        setShowSlash(false);
        setSlashIndex(0);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === '/' && input === '') setShowSlash(true);
    if (e.key === 'Escape') { setShowSlash(false); setSlashIndex(0); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith('/')) {
      setShowSlash(true);
      setSlashFilter(val.slice(1));
      setSlashIndex(0);
    } else {
      setShowSlash(false);
    }
  };

  const handleFileDrop = useCallback(async (files: File[]) => {
    for (const file of files) {
      try {
        await adapter.ingestFile(file);
      } catch { /* ignore */ }
    }
    setDragging(false);
  }, []);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const filteredCommands = SLASH_COMMANDS.filter(c =>
    c.cmd.toLowerCase().includes(slashFilter.toLowerCase())
  );

  return (
    <div
      className="flex h-full relative"
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); handleFileDrop(Array.from(e.dataTransfer.files)); }}
    >
      <FileDropZone onDrop={handleFileDrop} active={dragging} />

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={e => e.target.files && handleFileDrop(Array.from(e.target.files))}
      />

      {/* Session sidebar */}
      {sessions && sessions.length > 0 && (
        <div className={`${showSessions ? 'w-48' : 'w-0'} transition-all overflow-hidden border-r border-border/50 shrink-0`}>
          <div className="p-2 space-y-1">
            <button onClick={onNewSession} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mb-2 w-full">
              <Plus className="w-3 h-3" /> New Session
            </button>
            {sessions.map(s => (
              <button
                key={s.id}
                onClick={() => onSelectSession?.(s.id)}
                className={`w-full text-left text-xs px-2 py-1.5 rounded-lg truncate transition-colors ${
                  activeSessionId === s.id ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0">
        {/* Header bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 shrink-0">
          {sessions && (
            <button onClick={() => setShowSessions(p => !p)} className="text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSessions ? 'rotate-0' : '-rotate-90'}`} />
            </button>
          )}

          {/* Persona picker */}
          <div className="relative" ref={personaPickerRef}>
            <button
              onClick={() => { setShowPersonaPicker(p => !p); setShowModelPicker(false); }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors"
            >
              {persona ? (
                <>
                  <Avatar className="w-5 h-5">
                    <AvatarImage src={persona.avatar} />
                    <AvatarFallback className="text-[8px] bg-primary/20">{persona.name[0]}</AvatarFallback>
                  </Avatar>
                  <span className="text-[10px] font-display text-muted-foreground">{persona.name}</span>
                </>
              ) : (
                <>
                  <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Persona</span>
                </>
              )}
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
            {showPersonaPicker && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden max-h-64 overflow-y-auto">
                {PERSONAS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { onPersonaChange?.(p.id); setShowPersonaPicker(false); }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                      currentPersona === p.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                    }`}
                  >
                    <Avatar className="w-5 h-5 shrink-0">
                      <AvatarImage src={p.avatar} />
                      <AvatarFallback className="text-[8px] bg-primary/20">{p.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-display text-foreground truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{p.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Team presence */}
          {teamPresence && teamPresence.length > 0 && (
            <div className="flex items-center gap-1 mx-1">
              <div className="flex -space-x-1.5">
                {teamPresence.slice(0, 4).map(m => (
                  <div key={m.id} className="relative group">
                    <Avatar className="w-5 h-5 border-2 border-card">
                      {m.avatar ? <AvatarImage src={m.avatar} /> : null}
                      <AvatarFallback className="text-[7px] bg-sky-500/20 text-sky-400">{m.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-card ${m.status === 'online' ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] text-foreground bg-card px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-30 shadow-lg">
                      {m.name}
                    </span>
                  </div>
                ))}
              </div>
              {teamPresence.length > 4 && (
                <span className="text-[9px] text-muted-foreground ml-1">+{teamPresence.length - 4}</span>
              )}
            </div>
          )}

          {/* Model picker */}
          <div className="relative ml-auto" ref={modelPickerRef}>
            <button
              onClick={() => { setShowModelPicker(p => !p); setShowPersonaPicker(false); }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] font-display text-muted-foreground truncate max-w-[120px]">
                {currentModel || 'Model'}
              </span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
            {showModelPicker && (
              <div className="absolute top-full right-0 mt-1 w-64 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden max-h-64 overflow-y-auto">
                {(availableModels && availableModels.length > 0 ? availableModels : (currentModel ? [currentModel] : [])).map(m => (
                  <button
                    key={m}
                    onClick={() => { onModelChange?.(m); setShowModelPicker(false); }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                      currentModel === m ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                    }`}
                  >
                    <Cpu className="w-3 h-3 text-primary shrink-0" />
                    <span className="font-display text-foreground truncate">{m}</span>
                  </button>
                ))}
                {(!availableModels || availableModels.length === 0) && !currentModel && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No models available</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Agent Profile Panel — collapsible */}
        <div className="shrink-0">
          <button
            onClick={() => setShowAgentProfile(p => !p)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-b border-border/20"
          >
            <Layers className="w-3 h-3 text-primary" />
            <span className="font-display font-medium">Agent Profile</span>
            {showAgentProfile ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>
          {showAgentProfile && (
            <div className="px-3 py-2.5 border-b border-border/20 bg-muted/20 space-y-2">
              <div className="flex items-center gap-3">
                {persona && (
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarImage src={persona.avatar} />
                    <AvatarFallback className="text-[10px] bg-primary/20">{persona.name[0]}</AvatarFallback>
                  </Avatar>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-display font-semibold text-foreground">{persona?.name || 'Default Agent'}</p>
                  <p className="text-[10px] text-muted-foreground">{persona?.description || 'General-purpose assistant'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {templateId && templateId !== 'blank' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-display">
                    <Sparkles className="w-2.5 h-2.5" />
                    {TEMPLATE_DISPLAY[templateId]?.label || templateId}
                  </span>
                )}
                {currentPersona && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/50 text-accent-foreground text-[10px] font-display">
                    <Bot className="w-2.5 h-2.5" />
                    {persona?.name || currentPersona}
                  </span>
                )}
                {currentModel && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-[10px] font-display">
                    <Cpu className="w-2.5 h-2.5" />
                    {currentModel.split('/').pop()}
                  </span>
                )}
              </div>
              {templateId && TEMPLATE_DISPLAY[templateId] && (
                <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                  <span className="text-muted-foreground font-medium">Domain:</span> {TEMPLATE_DISPLAY[templateId].desc} · 
                  <span className="text-muted-foreground font-medium"> Style:</span> {persona?.description || 'General'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
          {messages.length === 0 && workspaceId && (
            <WorkspaceBriefing
              workspaceId={workspaceId}
              onSendMessage={(msg) => { setInput(msg); inputRef.current?.focus(); }}
              onSelectSession={onSelectSession}
            />
          )}
          {messages.length === 0 && !workspaceId && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-sm font-display text-foreground mb-1">Ready to assist</p>
              <p className="text-xs text-muted-foreground">Select a workspace to get started</p>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
              {msg.role === 'assistant' && persona && (
                <Avatar className="w-6 h-6 mt-1 shrink-0">
                  <AvatarImage src={persona.avatar} />
                  <AvatarFallback className="text-[8px] bg-primary/20">{persona.name[0]}</AvatarFallback>
                </Avatar>
              )}
              <div className={`max-w-[80%]`}>
                <div className={`px-3 py-2 rounded-xl text-sm select-text cursor-text group/msg relative ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : msg.role === 'system'
                    ? 'bg-muted/50 text-muted-foreground italic text-xs'
                    : 'bg-secondary text-foreground'
                }`}>
                  {msg.role === 'assistant' && <Sparkles className="w-3 h-3 text-primary inline mr-1.5 -mt-0.5" />}
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                  {/* Copy button */}
                  {msg.content && (
                    <button
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(msg.content); }}
                      className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover/msg:opacity-60 hover:!opacity-100 transition-opacity bg-background/50"
                      title="Copy message"
                    >
                      <Code className="w-3 h-3" />
                    </button>
                  )}
                  {isLoading && msg === messages[messages.length - 1] && msg.role === 'assistant' && !msg.content && (
                    <span className="inline-flex gap-1 ml-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  )}
                </div>
                {msg.tools && msg.tools.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {msg.tools.map(tool => <ToolCard key={tool.id} tool={tool} />)}
                  </div>
                )}
                {msg.role === 'assistant' && msg.content && (
                  <FeedbackButtons messageId={msg.id} feedback={msg.feedback} />
                )}
              </div>
            </div>
          ))}

          {pendingApproval && (
            <ApprovalGate request={pendingApproval} onRespond={onApprove} />
          )}
        </div>

        {/* Input area */}
        <div className="p-3 border-t border-border/30 relative">
          {showSlash && filteredCommands.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 mb-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-10 max-h-48 overflow-y-auto">
              {filteredCommands.map((c, idx) => (
                <button
                  key={c.cmd}
                  onClick={() => { setInput(c.cmd + ' '); setShowSlash(false); setSlashIndex(0); inputRef.current?.focus(); }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${idx === slashIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'}`}
                >
                  <Slash className="w-3 h-3 text-primary" />
                  <span className="font-display text-foreground">{c.cmd}</span>
                  <span className="text-muted-foreground ml-auto">{c.desc}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 bg-muted/50 rounded-xl px-3 py-2 border border-border/30">
            <button onClick={handleFileSelect} className="text-muted-foreground hover:text-foreground transition-colors pb-0.5">
              <Paperclip className="w-4 h-4" />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message Waggle... (/ for commands)"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none min-h-[20px] max-h-[120px]"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="text-primary hover:text-primary/80 transition-colors disabled:opacity-30 pb-0.5"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatApp;

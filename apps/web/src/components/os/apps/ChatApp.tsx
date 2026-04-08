import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Plus, Slash, Paperclip, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Loader2, AlertTriangle, CheckCircle2, XCircle, Clock, Upload, Code, FileText, Users, X, Bot, Cpu, Layers, Pin, PinOff } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getPersonaById, PERSONAS } from '@/lib/personas';
import { adapter } from '@/lib/adapter';
import type { ChatMessage, ToolExecution, ApprovalRequest } from '@/lib/types';
import { BlockRenderer } from './chat-blocks';
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
  sessions?: { id: string; title: string; messageCount?: number; lastActive?: string }[];
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

const FEEDBACK_REASONS = [
  { id: 'wrong_answer', label: 'Wrong answer' },
  { id: 'too_verbose', label: 'Too verbose' },
  { id: 'wrong_tool', label: 'Wrong tool used' },
  { id: 'too_slow', label: 'Too slow' },
  { id: 'other', label: 'Other' },
] as const;

const FeedbackButtons = ({ messageId, messageIndex, sessionId, feedback }: {
  messageId: string; messageIndex: number; sessionId?: string; feedback?: 'up' | 'down' | null;
}) => {
  const [vote, setVote] = useState(feedback);
  const [showReasons, setShowReasons] = useState(false);

  const handleVote = (rating: 'up' | 'down', reason?: string) => {
    const newVote = vote === rating ? null : rating;
    setVote(newVote);
    setShowReasons(false);
    if (newVote && sessionId) {
      adapter.submitFeedback({ sessionId, messageIndex, rating: newVote, reason });
    }
  };

  return (
    <div className="flex items-center gap-1 mt-1 relative">
      <button
        onClick={() => handleVote('up')}
        className={`p-0.5 rounded transition-colors ${vote === 'up' ? 'text-emerald-400' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
        title="Good response"
      >
        <ThumbsUp className="w-3 h-3" />
      </button>
      <button
        onClick={() => {
          if (vote === 'down') { handleVote('down'); return; }
          setShowReasons(s => !s);
        }}
        className={`p-0.5 rounded transition-colors ${vote === 'down' ? 'text-destructive' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
        title="Poor response"
      >
        <ThumbsDown className="w-3 h-3" />
      </button>
      {showReasons && (
        <div className="absolute bottom-full left-0 mb-1 bg-card border border-border rounded-lg shadow-xl z-20 py-1 w-36">
          {FEEDBACK_REASONS.map(r => (
            <button
              key={r.id}
              onClick={() => handleVote('down', r.id)}
              className="w-full text-left px-3 py-1.5 text-[10px] text-foreground hover:bg-muted/50 transition-colors"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
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

  // Pins
  const [pins, setPins] = useState<Array<{ id: string; messageContent: string; messageRole: string; pinnedAt: string; label?: string }>>([]);
  const [showPins, setShowPins] = useState(false);

  useEffect(() => {
    if (workspaceId) {
      adapter.getPins(workspaceId).then(setPins).catch(() => {});
    }
  }, [workspaceId]);

  const handlePin = async (msg: ChatMessage) => {
    if (!workspaceId) return;
    const existing = pins.find(p => p.messageContent === msg.content);
    if (existing) {
      await adapter.removePin(workspaceId, existing.id);
      setPins(prev => prev.filter(p => p.id !== existing.id));
    } else {
      const result = await adapter.addPin(workspaceId, {
        messageContent: msg.content,
        messageRole: msg.role as 'assistant' | 'user',
      });
      const pin = (result as { pin: { id: string; messageContent: string; messageRole: string; pinnedAt: string } }).pin;
      if (pin) setPins(prev => [...prev, pin]);
    }
  };

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

    // Client-only commands — handled locally, not sent to server
    if (text === '/clear') {
      onClearHistory();
      setInput('');
      return;
    }
    if (text.startsWith('/model ') && onModelChange) {
      const model = text.slice(7).trim();
      if (model) onModelChange(model);
      setInput('');
      return;
    }
    if (text === '/models') {
      // Show available models as a local message
      const models = availableModels?.join(', ') || 'No models loaded';
      onSendMessage(`Available models: ${models}`);
      setInput('');
      return;
    }
    if (text === '/cost') {
      onSendMessage('/cost');
      setInput('');
      setShowSlash(false);
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
      } catch (err) { console.error('[ChatApp] file ingest failed:', err); }
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
                className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors ${
                  activeSessionId === s.id ? 'bg-primary/20' : 'hover:bg-muted/50'
                }`}
              >
                <span className={`text-xs truncate block ${activeSessionId === s.id ? 'text-primary' : 'text-foreground'}`}>
                  {s.title}
                </span>
                {(s.messageCount != null || s.lastActive) && (
                  <span className="text-[9px] text-muted-foreground/60">
                    {s.messageCount != null && `${s.messageCount} msgs`}
                    {s.messageCount != null && s.lastActive && ' · '}
                    {s.lastActive && new Date(s.lastActive).toLocaleDateString()}
                  </span>
                )}
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
        {/* Pins bar */}
        {pins.length > 0 && (
          <div className="px-3 py-1.5 border-b border-border/30 flex items-center gap-2">
            <button onClick={() => setShowPins(p => !p)} className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              <Pin className="w-3 h-3" style={{ color: 'var(--honey-500)' }} />
              <span>{pins.length} pinned</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showPins ? 'rotate-180' : ''}`} />
            </button>
          </div>
        )}
        {showPins && pins.length > 0 && (
          <div className="px-3 py-2 border-b border-border/30 space-y-1.5 max-h-32 overflow-auto" style={{ backgroundColor: 'var(--hive-850)' }}>
            {pins.map(pin => (
              <div key={pin.id} className="flex items-start gap-2 text-xs">
                <span style={{ color: 'var(--honey-500)' }}>{'\u2B21'}</span>
                <span className="text-foreground line-clamp-1 flex-1">{pin.messageContent.slice(0, 100)}</span>
                <button onClick={() => { if (workspaceId) adapter.removePin(workspaceId, pin.id); setPins(p => p.filter(x => x.id !== pin.id)); }} className="text-muted-foreground/40 hover:text-destructive shrink-0">
                  <PinOff className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

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
          {messages.map((msg, msgIdx) => (
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
                  {msg.role === 'assistant' && msg.blocks && msg.blocks.length > 0 ? (
                    <BlockRenderer
                      blocks={msg.blocks}
                      isStreaming={isLoading && msg === messages[messages.length - 1]}
                    />
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
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
                  {msg.content && msg.role === 'assistant' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePin(msg); }}
                      className={`absolute top-1 right-7 p-1 rounded transition-opacity bg-background/50 ${
                        pins.some(p => p.messageContent === msg.content)
                          ? 'opacity-80 text-primary'
                          : 'opacity-0 group-hover/msg:opacity-60 hover:!opacity-100'
                      }`}
                      title={pins.some(p => p.messageContent === msg.content) ? 'Unpin' : 'Pin message'}
                    >
                      <Pin className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {msg.tools && msg.tools.length > 0 && (!msg.blocks || msg.blocks.length === 0) && (
                  <div className="mt-1 space-y-1">
                    {msg.tools.map(tool => <ToolCard key={tool.id} tool={tool} />)}
                  </div>
                )}
                {msg.role === 'assistant' && msg.content && (
                  <FeedbackButtons messageId={msg.id} messageIndex={msgIdx} sessionId={activeSessionId ?? undefined} feedback={msg.feedback} />
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

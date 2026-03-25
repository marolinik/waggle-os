import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, Plus, Slash, Paperclip, ChevronDown, ThumbsUp, ThumbsDown, Loader2, AlertTriangle, CheckCircle2, XCircle, Clock, Upload, Code, FileText, Users, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getPersonaById, PERSONAS } from '@/lib/personas';
import { adapter } from '@/lib/adapter';
import type { ChatMessage, ToolExecution, ApprovalRequest } from '@/lib/types';

interface ChatAppProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (content: string) => void;
  onClearHistory: () => void;
  pendingApproval: ApprovalRequest | null;
  onApprove: (id: string, approved: boolean) => void;
  currentPersona?: string;
  sessions?: { id: string; title: string }[];
  activeSessionId?: string | null;
  onSelectSession?: (id: string) => void;
  onNewSession?: () => void;
  workspaceId?: string | null;
}

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
  sessions, activeSessionId, onSelectSession, onNewSession,
  workspaceId,
}: ChatAppProps) => {
  const [input, setInput] = useState('');
  const [showSlash, setShowSlash] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [showSessions, setShowSessions] = useState(false);
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const persona = currentPersona ? getPersonaById(currentPersona) : PERSONAS[0];

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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === '/' && input === '') setShowSlash(true);
    if (e.key === 'Escape') setShowSlash(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith('/')) {
      setShowSlash(true);
      setSlashFilter(val.slice(1));
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
          {persona && (
            <div className="flex items-center gap-1.5">
              <Avatar className="w-5 h-5">
                <AvatarImage src={persona.avatar} />
                <AvatarFallback className="text-[8px] bg-primary/20">{persona.name[0]}</AvatarFallback>
              </Avatar>
              <span className="text-[10px] font-display text-muted-foreground">{persona.name}</span>
            </div>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              {persona && (
                <Avatar className="w-16 h-16 mb-3">
                  <AvatarImage src={persona.avatar} />
                  <AvatarFallback className="bg-primary/20 text-lg">{persona.name[0]}</AvatarFallback>
                </Avatar>
              )}
              <p className="text-sm font-display text-foreground mb-1">Ready to assist</p>
              <p className="text-xs text-muted-foreground mb-4">Type a message or use / for commands</p>
              <div className="flex flex-wrap gap-2 max-w-sm justify-center">
                {['/research a topic', '/draft a blog post', '/plan a project', '/review my code'].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                    className="px-3 py-1.5 text-[10px] rounded-lg bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors font-display"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
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
                <div className={`px-3 py-2 rounded-xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : msg.role === 'system'
                    ? 'bg-muted/50 text-muted-foreground italic text-xs'
                    : 'bg-secondary text-foreground'
                }`}>
                  {msg.role === 'assistant' && <Sparkles className="w-3 h-3 text-primary inline mr-1.5 -mt-0.5" />}
                  <span className="whitespace-pre-wrap">{msg.content}</span>
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
              {filteredCommands.map(c => (
                <button
                  key={c.cmd}
                  onClick={() => { setInput(c.cmd + ' '); setShowSlash(false); inputRef.current?.focus(); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center gap-2 transition-colors"
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

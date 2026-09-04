import { useState, useRef, useEffect, useCallback, useMemo, useId } from 'react';
import { Send, Sparkles, Plus, Slash, Paperclip, ChevronDown, ThumbsUp, ThumbsDown, Loader2, AlertTriangle, CheckCircle2, XCircle, Clock, Upload, Code, Copy, Check, RotateCcw, FileText, Users, X, Bot, Brain, Cpu, Layers, Pin, PinOff, Shield, Zap, MoreHorizontal, Square, Route } from 'lucide-react';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getPersonaAvatar, getPersonaById, PERSONAS } from '@/lib/personas';
import { adapter } from '@/lib/adapter';
import { DATE_LOCALE } from '@/lib/date-locale';
import { formatModelLabel } from '@/lib/model-label';
import type { ChatMessage, ToolExecution, ApprovalRequest } from '@/lib/types';
import type { RouteProposalPayload } from '@/lib/route-proposals';
import type { ChatHistoryStatus } from '@/hooks/useChat';
import { RiskBadge, canAlwaysAllow } from '@/lib/risk-display';
import { BlockRenderer } from './chat-blocks';
import ChatWorkCanvas, { selectCanvasArtifact } from './chat-blocks/ChatWorkCanvas';
import { DotLive } from '../warm';
import WorkspaceBriefing from '@/components/os/WorkspaceBriefing';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { shouldCollapseChatHeader } from '@/lib/chat-header-layout';
import { extractSuggestedActions } from '@/lib/suggested-actions';
import { shouldAutoSendFirstTask } from '@/lib/auto-send-first-task';
import { findNewestMemoryRecallNotice } from '@/lib/memory-recall-toast';
import { useToast } from '@/hooks/use-toast';
import { DUR } from '@/lib/motion/tokens';

export interface TeamMember {
  id: string;
  name: string;
  status: string;
  avatar?: string;
}

export type ModelCatalogStatus = 'loading' | 'ready' | 'empty' | 'unavailable';
export type ModelHealthStatus = 'checking' | 'ready' | 'unavailable' | 'unconfigured';

type AutonomyLevel = 'normal' | 'trusted' | 'yolo';

interface ChatAppProps {
  messages: ChatMessage[];
  isLoading: boolean;
  /** F2: widened to observe send success for the wizard auto-send. Existing
   *  callers ignore the return value — non-breaking. */
  onSendMessage: (content: string) => void | Promise<boolean | void>;
  onClearHistory: () => void;
  pendingApproval: ApprovalRequest | null;
  onApprove: (id: string, approved: boolean, opts?: { always?: boolean }) => void;
  currentPersona?: string;
  onPersonaChange?: (personaId: string) => void;
  currentModel?: string;
  onModelChange?: (model: string) => void;
  availableModels?: string[];
  /** Truthful state of the provider-backed model catalog refresh. */
  modelCatalogStatus?: ModelCatalogStatus;
  /** Truthful live-probe state of the exact selected model. */
  modelHealthStatus?: ModelHealthStatus;
  /** Retry the provider-backed model catalog refresh. */
  onRetryModels?: () => void;
  teamPresence?: TeamMember[];
  sessions?: { id: string; title: string; messageCount?: number; lastActive?: string }[];
  activeSessionId?: string | null;
  onSelectSession?: (id: string) => void;
  onNewSession?: () => void | Promise<unknown>;
  sessionCreating?: boolean;
  sessionLoading?: boolean;
  sessionReady?: boolean;
  sessionError?: string | null;
  sessionListFailed?: boolean;
  onRetrySessions?: () => void | Promise<boolean>;
  workspaceId?: string | null;
  templateId?: string;
  storageType?: 'virtual' | 'local' | 'team';
  /** Phase B.5: current autonomy level for this chat window. */
  autonomyLevel?: AutonomyLevel;
  /** Phase B.5: expiry of the current elevated autonomy, if any. */
  autonomyExpiresAt?: number | null;
  /** Phase B.5: change autonomy level + optional TTL. */
  onAutonomyChange?: (level: AutonomyLevel, ttlMinutes: number | null) => void;
  /** ContextRail: triggered when user clicks a message to explore related context. */
  onContextRail?: (target: { type: 'message'; id: string; label: string }) => void;
  /** QW-1: starter prompt prefilled into input once on first mount (used by onboarding). */
  initialMessage?: string;
  /** F2: auto-send the initialMessage once the chat is ready (wizard "Let's go"). */
  autoSendInitial?: boolean;
  /** F2: true once a real session's history has landed — gates the auto-send. */
  historyLoaded?: boolean;
  /** Truthful state of the active session's authoritative history read. */
  historyStatus?: ChatHistoryStatus;
  /** Safe user-facing history failure copy (never raw provider/server detail). */
  historyError?: string | null;
  /** Retry the active session's authoritative history read. */
  onRetryHistory?: () => void;
  /** F4: re-issue the last failed or stopped turn from its recovery action. */
  onRetry?: () => void;
  /** Lane S2 (Pillar 3.1): halt the in-flight reply mid-stream. Wired to the
   *  useChat abort/cancel path; the partial answer stays and send returns. When
   *  omitted, the Stop control is not rendered. */
  onStopStreaming?: (
    options?: { discardQueued?: boolean },
  ) => void | Promise<void | (() => void)>;
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

/**
 * Round-7 fix 2a: ONE pill grammar for every chip on the composer agent strip —
 * same height (h-6), radius (rounded-full), type size (text-[11px]), border and
 * fill. Accent lives ONLY in text/icon color (and the model pill keeps mono).
 * Wave T Lane E fix 2: a perceivable hover step (border honey-line + surface-3
 * fill) and a pressed state (honey-wash fill) so every chip answers the cursor —
 * uniform across chips, so the per-chip semantic accent still reads only in
 * text/icon color. Color-only (no transform) → no reduced-motion handling needed.
 */
const STRIP_PILL =
  'inline-flex h-6 items-center gap-1.5 rounded-full border border-[var(--line-soft)] bg-[var(--surface-2)] px-2 text-[11px] transition-colors hover:border-[var(--honey-line)] hover:bg-[var(--surface-3)] active:bg-[var(--honey-wash)]';
/** Icon-only variant of the strip pill (chevron, overflow, profile toggles). */
const STRIP_ICON_PILL =
  'grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[var(--line-soft)] bg-[var(--surface-2)] text-muted-foreground transition-colors hover:border-[var(--honey-line)] hover:bg-[var(--surface-3)] hover:text-foreground active:bg-[var(--honey-wash)]';

/**
 * Lane S2 (Pillar 3.1): distance (px) from the thread's bottom within which the
 * viewport counts as "pinned to latest". A programmatic scroll-to-bottom lands
 * at ~0 (stays following); a user scroll-up past this window breaks auto-follow.
 */
const AUTOSCROLL_BOTTOM_THRESHOLD_PX = 48;

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
    case 'running': return <Loader2 className="w-3 h-3 text-honey animate-spin" />;
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
        <button
          onClick={() => setShowRaw(!showRaw)}
          aria-label={showRaw ? 'Hide raw tool data' : 'Show raw tool data'}
          aria-expanded={showRaw}
          title={showRaw ? 'Hide raw tool data' : 'Show raw tool data'}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <Code className="w-3 h-3" />
        </button>
      </div>
      {tool.output && !showRaw && (
        <div className="mt-1 text-[11px] text-muted-foreground bg-background/50 rounded p-1.5 overflow-x-auto max-h-24">
          {typeof tool.output === 'string' ? tool.output : (
            <div className="space-y-0.5">
              {Object.entries(tool.output as Record<string, unknown>).slice(0, 5).map(([k, v]) => (
                <div key={k} className="flex gap-1">
                  <span className="text-honey/60">{k}:</span>
                  <span className="truncate">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {showRaw && (
        <pre className="mt-1 text-[11px] text-muted-foreground bg-background/50 rounded p-1.5 overflow-x-auto max-h-32">
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

const FeedbackButtons = ({ messageId, messageIndex, sessionId, feedback, content, onRetry }: {
  messageId: string; messageIndex: number; sessionId?: string; feedback?: 'up' | 'down' | null;
  /** Round-6 fix 2: raw message text for the hover-revealed Copy action. */
  content?: string;
  /** Round-6 fix 2: regenerate the turn — only wired on the last assistant message. */
  onRetry?: () => void;
}) => {
  const [vote, setVote] = useState(feedback);
  const [showReasons, setShowReasons] = useState(false);
  const [focusedReason, setFocusedReason] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => { /* clipboard unavailable — keep the quiet icon */ });
  };

  const handleVote = (rating: 'up' | 'down', reason?: string) => {
    const newVote = vote === rating ? null : rating;
    setVote(newVote);
    setShowReasons(false);
    if (newVote && sessionId) {
      adapter.submitFeedback({ sessionId, messageIndex, rating: newVote, reason });
    }
  };

  // L-12 / A11Y-7: arrow-key navigation + Escape-to-close on the
  // feedback reason dropdown.
  const handleReasonKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedReason(i => (i + 1) % FEEDBACK_REASONS.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedReason(i => (i - 1 + FEEDBACK_REASONS.length) % FEEDBACK_REASONS.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleVote('down', FEEDBACK_REASONS[focusedReason].id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowReasons(false);
    }
  };

  return (
    // Wave T Lane E fix 1 + Wave U Lane F fix 1: one discoverable action row,
    // now reading as a toolbar. At rest it holds a persistent hint (opacity-75)
    // on a subtle --surface-2 pill so copy/retry are findable without hover; the
    // whole row lifts to full contrast (>4.5:1) with a 150ms slide/fade on turn
    // hover AND on :focus-within (keyboard parity). 16px icons rest at
    // --text-dim (AA-tuned) and brighten to --text on direct hover. Reduced-
    // motion drops the slide (opacity-only), honoring the guard.
    <div data-testid="chat-action-row" className="inline-flex items-center gap-1 mt-1 relative rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 opacity-75 translate-y-0.5 transition-[opacity,transform] duration-mo-fast ease-mo group-hover/turn:opacity-100 group-hover/turn:translate-y-0 group-focus-within/turn:opacity-100 group-focus-within/turn:translate-y-0 motion-reduce:transition-none motion-reduce:translate-y-0">
      <HintTooltip content="Good response">
        <button
          onClick={() => handleVote('up')}
          aria-label="Good response"
          aria-pressed={vote === 'up'}
          className={`p-0.5 rounded transition-colors ${vote === 'up' ? 'text-emerald-400' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}
        >
          <ThumbsUp className="w-4 h-4" />
        </button>
      </HintTooltip>
      <HintTooltip content="Poor response">
        <button
          onClick={() => {
            if (vote === 'down') { handleVote('down'); return; }
            setShowReasons(s => !s);
          }}
          aria-label="Poor response"
          aria-pressed={vote === 'down'}
          className={`p-0.5 rounded transition-colors ${vote === 'down' ? 'text-destructive' : 'text-[var(--text-dim)] hover:text-[var(--text)]'}`}
        >
          <ThumbsDown className="w-4 h-4" />
        </button>
      </HintTooltip>
      {/* Round-6 fix 2 / Wave T Lane E: Copy (checkmark flash) + Retry (last
          turn only) share the row's reveal — the container fades/slides them
          in together, so no per-button opacity toggle is needed. */}
      {content && (
        <HintTooltip content={copied ? 'Copied' : 'Copy response'}>
          <button
            onClick={handleCopy}
            aria-label="Copy response"
            data-testid="chat-msg-copy"
            className={`p-0.5 rounded transition-colors ${
              copied
                ? 'text-emerald-400'
                : 'text-[var(--text-dim)] hover:text-[var(--text)]'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </HintTooltip>
      )}
      {onRetry && (
        <HintTooltip content="Retry — regenerate this response">
          <button
            onClick={onRetry}
            aria-label="Retry response"
            data-testid="chat-msg-retry"
            className="p-0.5 rounded text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </HintTooltip>
      )}
      {showReasons && (
        <div
          className="absolute bottom-full left-0 mb-1 bg-card border border-border rounded-lg shadow-xl z-20 py-1 w-36"
          role="menu"
          aria-label="Feedback reason"
          onKeyDown={handleReasonKey}
          data-testid="feedback-reason-menu"
        >
          {FEEDBACK_REASONS.map((r, i) => (
            <button
              key={r.id}
              role="menuitem"
              onClick={() => handleVote('down', r.id)}
              onMouseEnter={() => setFocusedReason(i)}
              autoFocus={i === focusedReason}
              className={`w-full text-left px-3 py-1.5 text-[11px] text-foreground hover:bg-muted/50 transition-colors ${i === focusedReason ? 'bg-muted/50' : ''}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ApprovalGate = ({
  request,
  onRespond,
}: {
  request: ApprovalRequest;
  onRespond: (id: string, approved: boolean, opts?: { always?: boolean }) => void;
}) => {
  const [showJson, setShowJson] = useState(false);
  // Build a one-line summary of the most relevant input field so users can
  // see WHAT the agent wants to do without opening the raw JSON.
  const input = request.input ?? {};
  const inputSummary =
    (input.path as string) ||
    (input.file_path as string) ||
    (input.target_workspace_id as string) ||
    (typeof input.command === 'string' ? (input.command as string).slice(0, 80) : '') ||
    (typeof input.query === 'string' ? (input.query as string).slice(0, 80) : '');

  return (
    <div className="my-2 rounded-[14px] border border-[var(--honey-line)] bg-[var(--honey-wash)] p-4" data-testid="chat-approval-gate">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--attention)]" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-[var(--text)]">Approve before I continue</span>
            {/* P7/D15 A5 (D4(ii)): the risk the server already sends, rendered with the
                SAME vocabulary as the shared modal so identical risk reads identically. */}
            {request.riskLevel && <RiskBadge level={request.riskLevel} className="ml-auto" />}
          </div>
          {request.description && (
            <p className="mt-1 text-[12.5px] text-[var(--text-2)]">{request.description}</p>
          )}
          <p className="mt-1 break-words font-mono text-[12px] text-[var(--text-2)]">
            {request.toolName}
            {inputSummary && <span className="text-[var(--text-dim)]"> › {inputSummary}</span>}
          </p>
          {request.trustSource && (
            <p className="mt-1 text-[11px] text-[var(--text-dim)]">
              Source: <span className="text-[var(--text-2)]">{request.trustSource}</span>
            </p>
          )}
          {request.explanation && (
            <p className="mt-1 text-[11.5px] text-[var(--text-dim)]">{request.explanation}</p>
          )}
          {showJson && (
            <pre className="mt-2 max-h-32 overflow-auto rounded-[8px] bg-[var(--bg-2)] p-2 text-[11px] text-[var(--text-muted)]">
              {request.rawJson ?? JSON.stringify(request.input, null, 2)}
            </pre>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => onRespond(request.requestId, true)}
              className="rounded-[10px] bg-[var(--honey)] px-3.5 py-1.5 text-[13px] font-medium text-[#1a1407] transition-opacity hover:opacity-90"
            >
              Approve
            </button>
            {/* P7/D15 A6 (founder-ratified): a critical/blocked action can never be
                permanently granted in one click — mirrors MCPHub's CRITICAL-non-
                overridable rule. "Always allow" is offered only below that bar. */}
            {canAlwaysAllow(request.approvalClass) && (
              <HintTooltip content="Save this decision and skip the prompt next time for this tool + target.">
                <button
                  onClick={() => onRespond(request.requestId, true, { always: true })}
                  className="rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-1.5 text-[13px] text-[var(--text-2)] transition-colors hover:text-[var(--text)]"
                >
                  Always allow
                </button>
              </HintTooltip>
            )}
            <button
              onClick={() => onRespond(request.requestId, false)}
              className="rounded-[10px] px-3.5 py-1.5 text-[13px] text-[var(--text-2)] transition-colors hover:text-[var(--risk)]"
            >
              Not now
            </button>
            <button
              onClick={() => setShowJson(!showJson)}
              className="ml-auto text-[12px] text-[var(--text-dim)] transition-colors hover:text-[var(--text-2)]"
            >
              {showJson ? 'Hide' : 'Show'} details
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Phase B.5: autonomy toggle — three-level chip in the chat header with a
 * dropdown for TTL. Shows a countdown when elevated. Click to cycle through
 * Ask first → Trusted → Autopilot → Ask first, or pick from the dropdown for
 * specific TTLs. Labels are plain-language display names only — the internal
 * level values ('normal' | 'trusted' | 'yolo') are unchanged everywhere.
 */
// Round-7 fix 2a: the trigger chip now wears the shared STRIP_PILL grammar, so
// the per-level accent is carried by text/icon color only (bg/border dropped).
const AUTONOMY_CONFIG: Record<AutonomyLevel, { label: string; color: string; icon: React.ComponentType<{ className?: string }>; tagline: string }> = {
  normal:  { label: 'Ask first', color: 'text-muted-foreground', icon: Shield, tagline: 'Asks before every change' },
  trusted: { label: 'Trusted',   color: 'text-sky-300',          icon: Shield, tagline: 'Makes routine changes; still asks for risky ones' },
  yolo:    { label: 'Autopilot', color: 'text-amber-300',        icon: Zap,    tagline: 'Acts without asking for approval. Use with care.' },
};

const TTL_OPTIONS: Array<{ label: string; minutes: number | null }> = [
  { label: '15 min',        minutes: 15 },
  { label: '30 min',        minutes: 30 },
  { label: '1 hour',        minutes: 60 },
  { label: 'Until I close', minutes: null },
];

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'expired';
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
}

const AutonomyToggle = ({
  level,
  expiresAt,
  onChange,
}: {
  level: AutonomyLevel;
  expiresAt: number | null;
  onChange: (level: AutonomyLevel, ttlMinutes: number | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Refresh the countdown every 10s so "12m" visually drifts toward 0.
  useEffect(() => {
    if (level === 'normal' || !expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, [level, expiresAt]);

  const config = AUTONOMY_CONFIG[level];
  const Icon = config.icon;
  const countdown = level !== 'normal' && expiresAt ? formatCountdown(expiresAt - now) : null;

  return (
    <div className="relative">
      <HintTooltip content={config.tagline}>
        <button
          onClick={() => setOpen(o => !o)}
          className={`${STRIP_PILL} font-display ${config.color}`}
        >
          <Icon className="w-3 h-3" />
          <span>{config.label}</span>
          {countdown && <span className="opacity-60">· {countdown}</span>}
          <ChevronDown className="w-3 h-3" />
        </button>
      </HintTooltip>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Round-6 fix 1: opens UPWARD — the toggle now lives on the composer
              strip at the bottom of the viewport. */}
          <div className="absolute right-0 bottom-full mb-1 z-50 w-64 bg-background border border-border/40 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-border/20">
              <p className="text-[11px] font-display font-semibold text-muted-foreground uppercase tracking-wider">Autonomy</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">Skip approvals for trusted operations. Critical ops always gate.</p>
            </div>

            {(Object.keys(AUTONOMY_CONFIG) as AutonomyLevel[]).map(lv => {
              const cfg = AUTONOMY_CONFIG[lv];
              const LevelIcon = cfg.icon;
              const isActive = level === lv;
              return (
                <div key={lv} className={`px-3 py-2 border-b border-border/10 ${isActive ? 'bg-muted/20' : ''}`}>
                  <button
                    onClick={() => {
                      if (lv === 'normal') {
                        onChange('normal', null);
                        setOpen(false);
                      }
                    }}
                    className="w-full flex items-center justify-between gap-2 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <LevelIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
                      <div>
                        <p className={`text-xs font-display font-medium ${cfg.color}`}>{cfg.label}</p>
                        <p className="text-[10px] text-muted-foreground/70">{cfg.tagline}</p>
                      </div>
                    </div>
                    {isActive && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                  {lv !== 'normal' && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {TTL_OPTIONS.map(opt => (
                        <button
                          key={opt.label}
                          onClick={() => {
                            onChange(lv, opt.minutes);
                            setOpen(false);
                          }}
                          className="px-2 py-0.5 rounded text-[10px] bg-muted/40 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

const FileDropZone = ({ onDrop, active }: { onDrop: (files: File[]) => void; active: boolean }) => {
  if (!active) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary/50 rounded-xl backdrop-blur-sm">
      <div className="text-center">
        <Upload className="w-8 h-8 text-honey mx-auto mb-2" />
        <p className="text-sm font-display text-honey">Drop files here</p>
        <p className="text-[11px] text-muted-foreground">PDF, CSV, TXT, images</p>
      </div>
    </div>
  );
};

const ChatApp = ({
  messages, isLoading, onSendMessage, onClearHistory,
  pendingApproval, onApprove, currentPersona,
  onPersonaChange, currentModel, onModelChange, availableModels,
  modelCatalogStatus: modelCatalogStatusProp, modelHealthStatus: modelHealthStatusProp,
  onRetryModels,
  teamPresence,
  sessions, activeSessionId, onSelectSession, onNewSession,
  sessionCreating = false, sessionLoading = false, sessionReady = true, sessionError = null,
  sessionListFailed = false, onRetrySessions,
  workspaceId, templateId, storageType,
  autonomyLevel = 'normal', autonomyExpiresAt = null, onAutonomyChange,
  onContextRail,
  initialMessage,
  autoSendInitial = false,
  historyLoaded = false,
  historyStatus = 'ready',
  historyError = null,
  onRetryHistory,
  onRetry,
  onStopStreaming,
}: ChatAppProps) => {
  const [input, setInput] = useState(initialMessage ?? '');
  const [showSlash, setShowSlash] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  // Default the session sidebar open when the user already has chats — the
  // collapsed state hides "New Session" + history (w-0 container), which made
  // P2/P3/P5 unable to start a fresh chat without finding the unlabelled
  // chevron toggle. Empty-state stays collapsed (nothing to show).
  const sessionCount = sessions?.length ?? 0;
  const [showSessions, setShowSessions] = useState(() => sessionCount > 0);
  const previousSessionCount = useRef(sessionCount);
  const sessionSidebarTouched = useRef(false);
  const sessionSidebarWorkspace = useRef(workspaceId);
  const newSessionTransitionRef = useRef<Promise<void> | null>(null);
  const [newSessionTransitioning, setNewSessionTransitioning] = useState(false);
  useEffect(() => {
    if (sessionSidebarWorkspace.current !== workspaceId) {
      sessionSidebarWorkspace.current = workspaceId;
      sessionSidebarTouched.current = false;
      previousSessionCount.current = sessionCount;
      setShowSessions(sessionCount > 0);
      return;
    }
    if (sessionCount === 0) {
      setShowSessions(false);
    } else if (!sessionSidebarTouched.current && previousSessionCount.current === 0) {
      setShowSessions(true);
    }
    previousSessionCount.current = sessionCount;
  }, [sessionCount, workspaceId]);
  const sessionStatusId = useId();
  const modelPickerId = useId();
  const modelCatalogStatus = modelCatalogStatusProp
    ?? (availableModels?.length ? 'ready' : 'empty');
  const modelCatalogLabel = modelCatalogStatus === 'ready'
    ? 'available'
    : modelCatalogStatus === 'loading'
      ? 'checking'
      : modelCatalogStatus === 'empty'
        ? 'no models'
        : 'unavailable';
  const modelHealthStatus = modelHealthStatusProp
    ?? (currentModel ? 'checking' : 'unconfigured');
  const modelHealthLabel = modelHealthStatus === 'ready'
    ? 'ready'
    : modelHealthStatus === 'checking'
      ? 'checking'
      : modelHealthStatus === 'unavailable'
        ? 'unavailable'
        : 'no model';
  const modelHealthTone = modelHealthStatus === 'ready'
    ? 'healthy'
    : modelHealthStatus === 'checking'
      ? 'attention'
      : modelHealthStatus === 'unconfigured'
        ? 'neutral'
        : 'risk';
  const modelCatalogWarning = modelCatalogStatus === 'ready'
    ? ''
    : `, model list ${modelCatalogLabel}`;
  const modelTriggerLabel = `${currentModel ? formatModelLabel(currentModel) : 'Auto'}, ${modelHealthLabel}${modelCatalogWarning}`;
  const sessionInputLocked = sessionCreating
    || sessionLoading
    || !sessionReady
    || newSessionTransitioning;
  const newSessionLocked = sessionInputLocked || (isLoading && !onStopStreaming);
  const sessionControlsLocked = isLoading || sessionInputLocked;
  const sessionStatusIsError = Boolean(
    sessionError && !newSessionTransitioning && !sessionCreating && !sessionLoading,
  );
  const sessionStatus = newSessionTransitioning
    ? 'Starting a new session…'
    : sessionCreating
      ? 'Creating a new session…'
      : sessionLoading
        ? 'Loading sessions…'
        : sessionError
          ? `Session error: ${sessionError}`
          : !sessionReady
            ? 'No chat session is ready.'
            : isLoading
              ? 'New session stops the current response. Finish it before switching existing sessions.'
              : null;
  const handleNewSession = () => {
    if (!onNewSession || newSessionLocked || newSessionTransitionRef.current) return;
    sessionSidebarTouched.current = true;
    setShowSessions(true);
    setNewSessionTransitioning(true);
    const transition = (async () => {
      let releaseStoppedSession: (() => void) | undefined;
      try {
        if (isLoading) {
          const release = await onStopStreaming?.({ discardQueued: true });
          if (typeof release === 'function') releaseStoppedSession = release;
        }
        const created = await onNewSession();
        if (created == null) releaseStoppedSession?.();
      } catch {
        releaseStoppedSession?.();
      }
    })().finally(() => {
      if (newSessionTransitionRef.current === transition) {
        newSessionTransitionRef.current = null;
        setNewSessionTransitioning(false);
      }
    });
    newSessionTransitionRef.current = transition;
    void transition.catch(() => undefined);
  };
  const handleStopStreaming = () => {
    if (!onStopStreaming) return;
    try {
      void Promise.resolve(onStopStreaming()).catch(() => undefined);
    } catch {
      // Local cancellation already owns visible recovery; transport stop is best-effort.
    }
  };
  const handleToggleSessions = () => {
    sessionSidebarTouched.current = true;
    setShowSessions((current) => !current);
  };
  const [dragging, setDragging] = useState(false);
  const [showAgentProfile, setShowAgentProfile] = useState(false);
  const [showPersonaPicker, setShowPersonaPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showHeaderOverflow, setShowHeaderOverflow] = useState(false);
  // Wave U Lane F fix 2: one-shot scale pop when the send button fills honey.
  const [sendPulse, setSendPulse] = useState(false);
  // B3: the right work canvas opens on a fresh artifact and survives navigation
  // (it lives inside ChatApp's kept-alive flex root).
  const [canvasOpen, setCanvasOpen] = useState(false);
  const lastCanvasPath = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Lane S2 (Pillar 3.1): auto-follow the stream while the viewport is pinned to
  // the newest content; the moment the user scrolls up it breaks and a "Jump to
  // latest" affordance appears. `followingRef` mirrors the state so the stable
  // scroll handler compares without a stale closure.
  const [following, setFollowing] = useState(true);
  const followingRef = useRef(true);
  useEffect(() => { followingRef.current = following; }, [following]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerEditRevisionRef = useRef(0);
  const sendSubmissionRef = useRef(0);
  const composerThreadKey = `${workspaceId ?? ''}\u0000${activeSessionId ?? ''}`;
  const composerThreadKeyRef = useRef(composerThreadKey);
  composerThreadKeyRef.current = composerThreadKey;
  const sessionInputLockedRef = useRef(sessionInputLocked);
  sessionInputLockedRef.current = sessionInputLocked;
  const starterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (starterTimeoutRef.current) clearTimeout(starterTimeoutRef.current);
    starterTimeoutRef.current = null;
  }, [composerThreadKey]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const personaPickerRef = useRef<HTMLDivElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  // M-21 / UX-6: observe the agent strip (round-6 fix 1: relocated from the
  // deleted header row to the composer) to decide whether the informational
  // chips (storage badge, team presence) should fold into a ⋯ overflow menu.
  const stripRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const stripWidth = useContainerWidth(stripRef);
  const isStripCompact = shouldCollapseChatHeader(stripWidth);

  // R9 Lane D: presence is meaningful only for OTHER people in the room. The
  // team endpoint returns the current user as `{ id: 'local', name: 'You' }`
  // in solo/offline mode, which rendered as an anonymous floating 'Y' avatar on
  // the composer strip. Drop the self entry so a lone user sees no presence chip
  // and real teammates still surface.
  const roomPresence = (teamPresence ?? []).filter(m => m.id !== 'local' && m.name !== 'You');

  // M-28 / ENG-7: suggested next-actions extracted from the most
  // recent assistant message. Empty array → no chips. Hidden while
  // the assistant is still streaming to avoid flickering chips as
  // text arrives.
  const suggestedActions = useMemo(() => {
    if (isLoading) return [];
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || !last.content) return [];
    return extractSuggestedActions(last.content);
  }, [messages, isLoading]);
  const persistedMessageIndices = useMemo(() => {
    let persistedIndex = -1;
    return messages.map(message => {
      if (!message.draft && !message.queued) persistedIndex += 1;
      return persistedIndex;
    });
  }, [messages]);

  // B3: the latest completed file-write becomes the work-canvas doc; auto-open
  // the canvas when a NEW artifact appears (the user can close it; reopening is
  // implicit on the next artifact).
  const canvasArtifact = useMemo(() => selectCanvasArtifact(messages), [messages]);
  useEffect(() => {
    const path = canvasArtifact?.path ?? null;
    if (path && path !== lastCanvasPath.current) setCanvasOpen(true);
    lastCanvasPath.current = path;
  }, [canvasArtifact]);

  const { toast } = useToast();
  const announcedMemoryReceiptIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const pending = findNewestMemoryRecallNotice(messages, announcedMemoryReceiptIds.current);
    if (!pending) return;
    announcedMemoryReceiptIds.current.add(pending.receipt.receiptId);
    toast(pending.notice);
  }, [messages, toast]);

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
    try {
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
    } catch (err) {
      console.error('[ChatApp] pin update failed:', err);
      toast({
        variant: 'destructive',
        title: existing ? "Couldn't unpin message" : "Couldn't pin message",
        description: 'Please try again.',
      });
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
      if (showHeaderOverflow && overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowHeaderOverflow(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPersonaPicker, showModelPicker, showHeaderOverflow]);

  // Auto-close the overflow popover once the strip widens past the
  // compact threshold — without this, the popover stays open over an
  // empty slot when the user resizes.
  useEffect(() => {
    if (!isStripCompact && showHeaderOverflow) {
      setShowHeaderOverflow(false);
    }
  }, [isStripCompact, showHeaderOverflow]);

  // Round-7 fix 2c: also re-anchor when isLoading flips — the Retry button and
  // suggested-action chips of the last turn render only AFTER streaming ends,
  // so a [messages]-only scroll left them straddling the container's bottom
  // edge (the hover Copy/Retry icons rendered visually cut above the composer).
  // Lane S2 (Pillar 3.1): only auto-follow while pinned — a user who scrolled up
  // keeps their position (input-primacy applied to the stream).
  useEffect(() => {
    if (!following) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, following]);

  // Phase C fix (V1-streaming): the render-side cadence buffer (useStreamCadence)
  // grows the thread's height frame-by-frame WITHOUT a `messages` reference change,
  // so the effect above doesn't track the revealing text. While streaming AND
  // pinned, an rAF loop keeps the viewport glued to the growing content head so
  // the caret stays in view; it self-cancels the moment the stream ends or the
  // user scrolls up (following flips false via handleThreadScroll).
  useEffect(() => {
    if (!isLoading || !following) return;
    let raf = 0;
    const pin = () => {
      const el = scrollRef.current;
      if (el && followingRef.current) el.scrollTop = el.scrollHeight;
      raf = requestAnimationFrame(pin);
    };
    raf = requestAnimationFrame(pin);
    return () => cancelAnimationFrame(raf);
  }, [isLoading, following]);

  // Lane S2: a fresh thread always starts following (a scroll-up from a previous
  // thread must not suppress auto-follow on the next one).
  useEffect(() => {
    setFollowing(true);
  }, [activeSessionId, workspaceId]);

  // Lane S2: break auto-follow the instant the user scrolls up past the bottom
  // window; re-pin automatically once they return to the bottom. Only flips state
  // on a real transition so per-tick scroll events don't churn re-renders.
  const handleThreadScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= AUTOSCROLL_BOTTOM_THRESHOLD_PX;
    if (atBottom !== followingRef.current) setFollowing(atBottom);
  }, []);

  // Lane S2: the "Jump to latest" affordance re-pins and snaps to the newest content.
  const scrollToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setFollowing(true);
  }, []);

  // Wave U Lane F fix 2: a scale pop the moment the send button fills honey
  // (empty→ready). Fires once per empty→ready transition — the ref guard means
  // streaming/isLoading flips, prefilled-on-mount starters, and plain re-renders
  // never re-pulse — and the scale class is motion-safe gated on the button, so
  // reduced-motion never scales. R3 motion sweep: the pulse window is bound to
  // DUR.base (matches the button's --mo-base transition) — one dialect, not a
  // hardcoded 200 that only happens to agree.
  // Lane C (Pillar 2.5 — composer never locks on send): send is enabled whenever
  // there is text, INCLUDING while a previous reply streams. useChat queues a
  // send fired mid-stream behind the in-flight one (optimistic `queued` turn),
  // so there is no disabled window — the next message is accepted immediately.
  const canSend = Boolean(input.trim()) && !sessionInputLocked;
  const prevCanSendRef = useRef(canSend);
  useEffect(() => {
    if (canSend && !prevCanSendRef.current) {
      setSendPulse(true);
      const id = setTimeout(() => setSendPulse(false), DUR.base * 1000);
      prevCanSendRef.current = canSend;
      return () => clearTimeout(id);
    }
    prevCanSendRef.current = canSend;
  }, [canSend]);

  const submitComposerMessage = useCallback((content: string, restoreText = content) => {
    if (sessionInputLockedRef.current) {
      setInput(current => current || restoreText);
      return;
    }
    const submission = ++sendSubmissionRef.current;
    const editRevision = composerEditRevisionRef.current;
    const threadKey = composerThreadKeyRef.current;
    const restoreRejected = () => {
      if (
        sendSubmissionRef.current === submission
        && composerEditRevisionRef.current === editRevision
        && composerThreadKeyRef.current === threadKey
      ) {
        setInput(current => current || restoreText);
      }
    };

    setInput('');
    setShowSlash(false);
    try {
      const sendResult = onSendMessage(content);
      if (sendResult) {
        void sendResult.then(
          accepted => {
            if (accepted === false) restoreRejected();
          },
          restoreRejected,
        );
      }
    } catch {
      restoreRejected();
    }
  }, [onSendMessage]);

  // F2: mount-once auto-send of the wizard's first task. This fires exactly once,
  // after the session has landed and history has been fetched (so the optimistic
  // turn isn't clobbered by the history replace). Once consumed, the untouched
  // seed clears immediately so the first generated turn never looks duplicate.
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (sessionInputLocked) return;
    const inputUnchanged = !inputRef.current || inputRef.current.value === initialMessage;
    if (!shouldAutoSendFirstTask({
      autoSendInitial, alreadySent: autoSentRef.current, initialMessage,
      activeSessionId, historyLoaded, inputUnchanged,
    })) return;
    const text = (initialMessage as string).trim();
    autoSentRef.current = true; // consume BEFORE dispatch: StrictMode/effect-rerun safe
    submitComposerMessage(text);
  }, [
    autoSendInitial,
    initialMessage,
    activeSessionId,
    historyLoaded,
    sessionInputLocked,
    submitComposerMessage,
  ]);

  // Router arc P1-B (B2): composer "Best fit" — POST the composer text to
  // /api/route-proposals and inject the proposal as a LOCAL route_proposal
  // block in the thread (client-driven, no model marker). The composer text
  // stays intact until the user confirms the dispatch.
  const [routeProposals, setRouteProposals] = useState<Array<{
    blockId: string; prompt: string; proposal: RouteProposalPayload;
  }>>([]);
  const [bestFitBusy, setBestFitBusy] = useState(false);
  useEffect(() => {
    setRouteProposals([]);
  }, [activeSessionId, workspaceId]);

  const handleBestFit = async () => {
    const text = input.trim();
    if (!text || !workspaceId || bestFitBusy) return;
    setBestFitBusy(true);
    try {
      const proposal = await adapter.routeProposals.propose({ workspaceId, prompt: text });
      setRouteProposals(prev => [
        ...prev,
        { blockId: `route-${proposal.routeDecisionId}`, prompt: text, proposal },
      ]);
    } catch (err) {
      console.error('[ChatApp] route propose failed:', err);
      toast({
        variant: 'destructive',
        title: "Couldn't check where this should run",
        description: 'Please try again.',
      });
    } finally {
      setBestFitBusy(false);
    }
  };

  const handleRouteProposalDispatched = (blockId: string) => {
    const entry = routeProposals.find(p => p.blockId === blockId);
    // Consume the composer text on confirm — but only if the user hasn't
    // edited it since the proposal was made.
    if (entry && input.trim() === entry.prompt) setInput('');
  };

  const handleRouteProposalRePropose = async (blockId: string, preferredExecutorId?: string) => {
    const entry = routeProposals.find(p => p.blockId === blockId);
    if (!entry || !workspaceId) return;
    try {
      const proposal = await adapter.routeProposals.propose({
        workspaceId,
        prompt: entry.prompt,
        ...(preferredExecutorId ? { preferredExecutorId } : {}),
      });
      setRouteProposals(prev => prev.map(p => (p.blockId === blockId ? { ...p, proposal } : p)));
    } catch (err) {
      console.error('[ChatApp] route re-propose failed:', err);
      toast({
        variant: 'destructive',
        title: "Couldn't re-propose a route",
        description: 'Please try again.',
      });
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || sessionInputLocked) return;

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
      submitComposerMessage(`Available models: ${models}`, text);
      return;
    }
    if (text === '/cost') {
      submitComposerMessage('/cost', text);
      return;
    }

    submitComposerMessage(text);
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
    composerEditRevisionRef.current += 1;
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
      } catch (err) {
        console.error('[ChatApp] file ingest failed:', err);
        toast({
          variant: 'destructive',
          title: `Couldn't ingest ${file.name}`,
          description: 'The file was not added. Please try again.',
        });
      }
    }
    setDragging(false);
  }, [toast]);

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
        <div
          className={`${showSessions ? 'w-32 sm:w-48' : 'w-0'} transition-[width] overflow-hidden border-r border-border/50 shrink-0`}
          data-testid="chat-session-sidebar"
          aria-hidden={!showSessions}
        >
          {showSessions ? <div className="p-2 space-y-1">
            <button
              onClick={handleNewSession}
              disabled={newSessionLocked}
              aria-describedby={sessionStatus ? sessionStatusId : undefined}
              className="flex items-center gap-1 text-xs text-honey hover:text-honey/80 mb-2 w-full disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="w-3 h-3" /> New Session
            </button>
            {sessions.map(s => (
              <button
                key={s.id}
                onClick={() => onSelectSession?.(s.id)}
                disabled={sessionControlsLocked}
                aria-describedby={sessionStatus ? sessionStatusId : undefined}
                className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  activeSessionId === s.id ? 'bg-primary/20' : 'hover:bg-muted/50'
                }`}
              >
                <span className={`text-xs truncate block ${activeSessionId === s.id ? 'text-honey' : 'text-foreground'}`}>
                  {s.title}
                </span>
                {(s.messageCount != null || s.lastActive) && (
                  <span className="text-[11px] text-muted-foreground/60">
                    {s.messageCount != null && `${s.messageCount} msgs`}
                    {s.messageCount != null && s.lastActive && ' · '}
                    {s.lastActive && new Date(s.lastActive).toLocaleDateString(DATE_LOCALE)}
                  </span>
                )}
              </button>
            ))}
          </div> : null}
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0">
        {/* Messages */}
        {/* Pins bar */}
        {pins.length > 0 && (
          <div className="px-3 py-1.5 border-b border-border/30 flex items-center gap-2">
            <button onClick={() => setShowPins(p => !p)} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
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
                <button onClick={() => { if (workspaceId) adapter.removePin(workspaceId, pin.id); setPins(p => p.filter(x => x.id !== pin.id)); }} aria-label="Remove pin" title="Remove pin" className="text-muted-foreground/40 hover:text-destructive shrink-0">
                  <PinOff className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {isLoading && (
          // Wave W Lane E fix 1 (video legibility): the streaming bar read as a
          // near-invisible hairline at 2fps — h-0.5 (2px) with a /60 segment. One
          // visible tier up (h-1 + full-primary segment) so the send→streaming arc
          // is legible on capture. R3 motion sweep: the slide loop moved to the
          // .chat-stream-shimmer utility (co-located with its @keyframes in
          // index.css) so no magic duration/ease lives in the component, and
          // reduced-motion stills the slide (REDUCED.ambient = off). The dead
          // animate-pulse (the inline animation always overrode it) is dropped.
          <div className="shrink-0 h-1 w-full bg-muted/30 overflow-hidden">
            <div className="h-full w-1/3 bg-primary rounded-full chat-stream-shimmer" />
          </div>
        )}

        {/* Lane S2 (Pillar 3.1): a relative frame around the scroll viewport so the
            "Jump to latest" pill can float bottom-right of the thread. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} onScroll={handleThreadScroll} data-testid="chat-scroll" className="flex-1 overflow-auto px-4 pb-4 pt-2">
          {/* Round-4 craft (I1 fix 1): hold the reading measure to ~760px like
              Claude/ChatGPT instead of letting turns run the full panel width.
              The wrapper turns h-full flex-col only in the empty state so
              WorkspaceBriefing's h-full/flex-1 roots keep filling the viewport.
              Round-7 fix 2c: pb-6 gives the LAST turn's hover action row
              (Copy/Retry) clearance above the scroll container's bottom edge —
              without it the icons sat flush against (and visually cut by) the
              boundary just above the composer. */}
          <div className={`mx-auto w-full max-w-[680px] space-y-3 ${messages.length === 0 ? 'h-full flex flex-col' : 'pb-6'}`}>
          {messages.length > 0 && historyStatus === 'error' && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-[var(--attention)]/30 bg-[var(--attention)]/10 px-3 py-2 text-xs text-muted-foreground"
              data-testid="chat-history-refresh-error"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--attention)]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="font-medium text-foreground">Couldn't refresh this conversation.</span>{' '}
                {historyError}
              </span>
              {onRetryHistory && (
                <button
                  type="button"
                  onClick={onRetryHistory}
                  className="shrink-0 rounded-md border border-border/50 px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  aria-label="Retry loading conversation"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {messages.length > 0 && historyStatus === 'loading' && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-lg border border-border/40 bg-[var(--surface-2)] px-3 py-2 text-xs text-muted-foreground"
              data-testid="chat-history-refreshing"
            >
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-honey motion-reduce:animate-none" aria-hidden="true" />
              <span>Refreshing conversation…</span>
            </div>
          )}
          {messages.length === 0 && workspaceId && historyStatus === 'loading' && (
            <div
              role="status"
              aria-live="polite"
              className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground"
              data-testid="chat-history-loading"
            >
              <Loader2 className="h-6 w-6 animate-spin text-honey motion-reduce:animate-none" aria-hidden="true" />
              <p className="text-sm">Loading conversation…</p>
            </div>
          )}
          {messages.length === 0 && workspaceId && historyStatus === 'error' && (
            <div
              role="alert"
              className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
              data-testid="chat-history-load-error"
            >
              <AlertTriangle className="h-7 w-7 text-[var(--attention)]" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-foreground">Couldn't load this conversation.</p>
                {historyError && <p className="mt-1 text-xs text-muted-foreground">{historyError}</p>}
              </div>
              {onRetryHistory && (
                <button
                  type="button"
                  onClick={onRetryHistory}
                  className="rounded-md border border-border/60 bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                  aria-label="Retry loading conversation"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {messages.length === 0 && workspaceId && historyStatus === 'ready' && (
            <WorkspaceBriefing
              workspaceId={workspaceId}
              personaId={currentPersona}
              onSendMessage={(msg) => {
                // FR #32: starter prompts auto-send after a 1s confirm delay so
                // the first turn is a single click. Pre-filling the input first
                // gives the user a visible "this is what's about to ship" beat;
                // editing the input within the 1s cancels the auto-send.
                composerEditRevisionRef.current += 1;
                const editRevision = composerEditRevisionRef.current;
                const threadKey = composerThreadKeyRef.current;
                setInput(msg);
                inputRef.current?.focus();
                if (starterTimeoutRef.current) clearTimeout(starterTimeoutRef.current);
                starterTimeoutRef.current = setTimeout(() => {
                  starterTimeoutRef.current = null;
                  if (
                    composerThreadKeyRef.current === threadKey
                    && composerEditRevisionRef.current === editRevision
                    && inputRef.current?.value === msg
                  ) {
                    submitComposerMessage(msg);
                  }
                }, 1000);
              }}
              onPrefill={(msg) => {
                // Phase 4c: skill chips pre-fill ONLY (no auto-send) because
                // their starter strings end with ": " — the user must finish
                // the sentence before sending. Cursor lands at end-of-input
                // so they can type immediately.
                composerEditRevisionRef.current += 1;
                setInput(msg);
                inputRef.current?.focus();
                // Move caret to end so typing appends instead of replacing.
                requestAnimationFrame(() => {
                  if (inputRef.current) {
                    const len = inputRef.current.value.length;
                    inputRef.current.setSelectionRange(len, len);
                  }
                });
              }}
              onSelectSession={onSelectSession}
            />
          )}
          {messages.length === 0 && !workspaceId && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              {/* R10 Lane D fix 5 (brand: "free the mascots"): one calm flat-
                  geometric bee anchors the empty state ChatApp owns directly. */}
              <img
                src={getPersonaAvatar('general-purpose')}
                alt=""
                aria-hidden="true"
                width={56}
                height={56}
                className="w-14 h-14 mb-3 opacity-90 float"
              />
              <p className="text-sm font-display text-foreground mb-1">Pick a workspace and Waggle's ready</p>
              <p className="text-xs text-muted-foreground">Your memory and agents live inside a workspace</p>
            </div>
          )}
          {messages.map((msg, msgIdx) => {
            const messagePersona = msg.persona ? getPersonaById(msg.persona) : undefined;
            const persistedMessageIndex = persistedMessageIndices[msgIdx];
            const isRetryingTurn = isLoading
              && msg.role === 'assistant'
              && msg.retrying === true;
            const isWaitingForModel = isLoading
              && msgIdx === messages.length - 1
              && msg.role === 'assistant'
              && !msg.content.trim()
              && !msg.draft?.content.trim()
              && (!msg.blocks || msg.blocks.length === 0)
              && (!msg.tools || msg.tools.length === 0)
              && !isRetryingTurn;
            return (
            <div key={msg.id} className={`group/turn flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}
              onDoubleClick={() => {
                if (onContextRail && msg.content) {
                  onContextRail({ type: 'message', id: msg.id, label: msg.content.slice(0, 60) });
                }
              }}>
              {msg.role === 'assistant' && (
                <Avatar
                  className={`w-9 h-9 mt-0.5 shrink-0 ${
                    // Wave S Lane E (brand): the persona bee is the turn's
                    // signature — 36px so the flat-geometric sprite reads crisp
                    // (the 24px render looked like a low-res raster next to the
                    // provenance line). Signature motion: the bee "thinks" — a
                    // soft breathing honey ring while THIS turn is streaming
                    // (reduced-motion users keep a static ring via the CSS guard).
                    // Wave W Lane E fix 1: the faint --honey-line ring was too
                    // subtle to read as "streaming" on video; one tier up to the
                    // saturated --honey-500 so the bee-shimmer indicator lands.
                    isLoading && msg === messages[messages.length - 1]
                      ? 'ring-2 ring-[var(--honey-500)] dot-live'
                      : ''
                  }`}
                >
                  {/* The authoring persona is immutable message provenance. A
                      later persona switch must never relabel an earlier turn;
                      legacy/unknown messages fall back to the Bot mark. */}
                  {messagePersona && <AvatarImage src={getPersonaAvatar(messagePersona.id)} alt={`${messagePersona.name} avatar`} />}
                  <AvatarFallback className="text-[11px] bg-primary/20">
                    {messagePersona ? messagePersona.name[0] : <Bot className="w-3.5 h-3.5" aria-hidden="true" />}
                  </AvatarFallback>
                </Avatar>
              )}
              {/* I1 fix 1: assistant turns span the full reading column so code
                  blocks/tables get the whole measure; user/system bubbles stay
                  shrink-to-fit capped at 80%. */}
              <div className={msg.role === 'assistant' ? 'w-full min-w-0' : 'max-w-[80%]'}>
                {/* R10 Lane D (a11y): the provenance line is the only signal of
                    who/which-model authored a turn — one size + contrast step up
                    (text-dim → text-muted) so it clears comfort on both themes. */}
                {msg.role === 'assistant' && (
                  <div className="mb-1 flex items-center gap-1.5 font-mono text-[11.5px] text-[var(--text-muted)]">
                    <span className="font-semibold text-[var(--text-2)]">Waggle</span>
                    {messagePersona?.name && <span>· {messagePersona.name}</span>}
                    {msg.model && <span>· {formatModelLabel(msg.model)}</span>}
                    {msg.draft && (
                      <span data-testid="chat-draft-status">
                        · {msg.draft.status === 'stopped'
                          ? 'Stopped draft'
                          : msg.retrying
                          ? 'Retry queued'
                          : 'Draft'} · not saved
                      </span>
                    )}
                  </div>
                )}
                <div className={`relative select-text cursor-text group/msg text-sm ${
                  msg.role === 'user'
                    // Round-6 fix 3: honey-tinted user bubble (theme-aware tokens)
                    // so it reads against the canvas in BOTH themes — the old
                    // near-surface fill was white-on-white in light mode.
                    // R9 Lane D: dedicated --user-bubble token warms the light-mode
                    // fill (the shared honey-wash read cold green-grey there).
                    ? 'rounded-[4px_14px_14px_14px] border border-[var(--user-bubble-line)] bg-[var(--user-bubble)] px-3.5 py-2.5 leading-[1.55] text-[var(--text)]'
                    : msg.role === 'system'
                    ? 'rounded-[12px] bg-[var(--surface-2)] px-3 py-2 text-[12px] italic text-[var(--text-muted)]'
                    : 'rounded-[14px] px-3.5 py-2.5 leading-[1.6] text-[var(--text)]'
                }`}>
                  {msg.role === 'assistant' && msg.draft?.content ? (
                    <div
                      className="whitespace-pre-wrap break-words"
                      data-testid="chat-draft-content"
                    >
                      <BlockRenderer blocks={[{
                        type: 'text',
                        blockId: `draft-${msg.id}`,
                        content: msg.draft.content,
                      }]} />
                    </div>
                  ) : msg.role === 'assistant' && msg.blocks && msg.blocks.length > 0 ? (
                    <BlockRenderer
                      blocks={msg.blocks}
                      isStreaming={isLoading && msg === messages[messages.length - 1]}
                      workspaceId={workspaceId}
                      sessionId={activeSessionId}
                      onRetry={msgIdx === messages.length - 1 && !isLoading && !sessionInputLocked ? onRetry : undefined}
                    />
                  ) : msg.role === 'assistant' ? (
                    <div data-testid={isWaitingForModel ? 'chat-first-response-indicator' : undefined}>
                      {isRetryingTurn ? (
                        <span
                          role="status"
                          aria-live="polite"
                          data-testid="chat-retry-wait-indicator"
                          className="text-xs text-muted-foreground"
                        >
                          Waiting to retry…
                        </span>
                      ) : isWaitingForModel && (
                        <span
                          role="status"
                          aria-live="polite"
                          aria-label="Model response status"
                          className="sr-only"
                        >
                          Waiting for the model to respond.
                        </span>
                      )}
                      {!isRetryingTurn && (
                        <BlockRenderer blocks={[{
                          type: 'text',
                          blockId: `legacy-${msg.id}`,
                          content: msg.content,
                        }]} isStreaming={isWaitingForModel} />
                      )}
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">
                      {msg.content}
                    </span>
                  )}
                  {/* Copy button — assistant turns get Copy in the hover action
                      row below (round-6 fix 2), so this overlay stays for user/
                      system bubbles only. */}
                  {msg.content && msg.role !== 'assistant' && (
                    <HintTooltip content="Copy message">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(msg.content); }}
                        aria-label="Copy message"
                        className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover/msg:opacity-60 hover:!opacity-100 transition-opacity bg-background/50"
                      >
                        <Code className="w-3 h-3" />
                      </button>
                    </HintTooltip>
                  )}
                  {msg.content && msg.role === 'assistant' && (
                    <HintTooltip content={pins.some(p => p.messageContent === msg.content) ? 'Unpin' : 'Pin message'}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePin(msg); }}
                        aria-label={pins.some(p => p.messageContent === msg.content) ? 'Unpin message' : 'Pin message'}
                        aria-pressed={pins.some(p => p.messageContent === msg.content)}
                        className={`absolute top-1 right-7 p-1 rounded transition-opacity bg-background/50 ${
                          pins.some(p => p.messageContent === msg.content)
                            ? 'opacity-80 text-honey'
                            : 'opacity-0 group-hover/msg:opacity-60 hover:!opacity-100'
                        }`}
                      >
                        <Pin className="w-3 h-3" />
                      </button>
                    </HintTooltip>
                  )}
                </div>
                {msg.role === 'assistant'
                  && msg.draft?.status === 'stopped'
                  && msgIdx === messages.length - 1
                  && !isLoading
                  && !sessionInputLocked
                  && onRetry && (
                  <div className="mt-1 flex items-center">
                    <HintTooltip content="Retry from the beginning — this stopped draft is not saved">
                      <button
                        type="button"
                        onClick={onRetry}
                        aria-label="Retry stopped response"
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--honey-wash)] hover:text-[var(--honey-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        <span>Retry response</span>
                      </button>
                    </HintTooltip>
                  </div>
                )}
                {/* Lane C (Pillar 2.5): an optimistic turn typed+sent while the
                    previous reply was still streaming. Truthful "waiting" state —
                    it dispatches the moment the current reply finishes, never
                    errors, never drops. Color-only, no transform → no reduced-
                    motion handling needed. */}
                {msg.queued && (
                  <div
                    className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--text-dim)]"
                    data-testid="chat-msg-queued"
                  >
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    <span>Waiting to send…</span>
                  </div>
                )}
                {msg.tools && msg.tools.length > 0 && (!msg.blocks || msg.blocks.length === 0) && (
                  <div className="mt-1 space-y-1">
                    {msg.tools.map(tool => <ToolCard key={tool.id} tool={tool} />)}
                  </div>
                )}
                {msg.role === 'assistant' && msg.content && (
                  <FeedbackButtons
                    messageId={msg.id}
                    messageIndex={persistedMessageIndex}
                    sessionId={activeSessionId ?? undefined}
                    feedback={msg.feedback}
                    content={msg.content}
                    onRetry={msgIdx === messages.length - 1 && !isLoading && !sessionInputLocked ? onRetry : undefined}
                  />
                )}
                {/* M-28 / ENG-7: clickable next-action chips on the last
                    assistant turn — fill the input on click so the user
                    can edit before sending. */}
                {msg.role === 'assistant'
                  && msgIdx === messages.length - 1
                  && suggestedActions.length > 0 && (
                  <div
                    className="mt-1.5 flex flex-wrap gap-1.5"
                    data-testid="chat-suggested-actions"
                  >
                    {suggestedActions.map((action, idx) => (
                      <HintTooltip key={`${idx}-${action}`} content={action}>
                        <button
                          type="button"
                          onClick={() => {
                            setInput(action);
                            inputRef.current?.focus();
                          }}
                          data-testid="chat-suggested-action"
                          className="px-2.5 py-1 text-[11px] rounded-full border border-primary/30 bg-primary/5 text-foreground hover:bg-primary/15 hover:border-primary/50 transition-colors max-w-full truncate"
                        >
                          {action}
                        </button>
                      </HintTooltip>
                    ))}
                  </div>
                )}
              </div>
            </div>
            );
          })}

          {/* Router arc B2: locally injected route proposals (composer Best fit). */}
          {routeProposals.map(rp => (
            <div key={rp.blockId} className="flex justify-start" data-testid="chat-route-proposal">
              <div className="w-full min-w-0">
                <BlockRenderer
                  blocks={[{ type: 'route_proposal', blockId: rp.blockId, proposal: rp.proposal }]}
                  onRouteProposalDispatched={handleRouteProposalDispatched}
                  onRouteProposalRePropose={(blockId, preferredExecutorId) => void handleRouteProposalRePropose(blockId, preferredExecutorId)}
                />
              </div>
            </div>
          ))}

          {pendingApproval && (
            <ApprovalGate request={pendingApproval} onRespond={onApprove} />
          )}
          </div>
        </div>
        {/* Lane S2 (Pillar 3.1): honey "Jump to latest" pill — shown only when the
            user has scrolled up (auto-follow broken). Clicking it re-pins to the
            newest content. Token-only colour (AA honey text); a color/border-only
            affordance, so no reduced-motion handling is needed. */}
        {!following && (
          <button
            type="button"
            onClick={scrollToLatest}
            data-testid="chat-jump-to-latest"
            className="absolute bottom-3 right-4 z-10 inline-flex items-center gap-1 rounded-full border border-[var(--honey-line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-medium text-[var(--honey-text)] shadow-[var(--shadow-honey)] transition-colors hover:border-[var(--honey)] hover:bg-[var(--honey-wash)]"
          >
            Jump to latest
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        </div>

        {/* Input area */}
        <div className="p-3 border-t border-border/30">
          {/* I1 fix 1: composer shares the ~760px reading column with the thread. */}
          <div className="relative mx-auto w-full max-w-[680px]">
          {showSlash && filteredCommands.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-10 max-h-48 overflow-y-auto">
              {filteredCommands.map((c, idx) => (
                <button
                  key={c.cmd}
                  onClick={() => { setInput(c.cmd + ' '); setShowSlash(false); setSlashIndex(0); inputRef.current?.focus(); }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${idx === slashIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'}`}
                >
                  <Slash className="w-3 h-3 text-honey" />
                  <span className="font-display text-foreground">{c.cmd}</span>
                  <span className="text-muted-foreground ml-auto">{c.desc}</span>
                </button>
              ))}
            </div>
          )}
          {/* Agent Profile panel — opens above the agent strip now that its
              toggle lives on the composer (round-6 fix 1). Content unchanged. */}
          {showAgentProfile && (
            <div className="mb-2 space-y-2 rounded-[12px] border border-border/30 bg-muted/20 px-3 py-2.5" data-testid="chat-agent-profile-panel">
              <div className="flex items-center gap-3">
                {persona && (
                  <Avatar className="w-9 h-9 shrink-0">
                    <AvatarImage src={persona.avatar} />
                    <AvatarFallback className="text-[11px] bg-primary/20">{persona.name[0]}</AvatarFallback>
                  </Avatar>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-display font-semibold text-foreground">{persona?.name || 'Default Agent'}</p>
                  <p className="text-[11px] text-muted-foreground">{persona?.description || 'General-purpose assistant'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {templateId && templateId !== 'blank' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-honey text-[11px] font-display">
                    <Sparkles className="w-2.5 h-2.5" />
                    {TEMPLATE_DISPLAY[templateId]?.label || templateId}
                  </span>
                )}
                {currentPersona && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/50 text-accent-foreground text-[11px] font-display">
                    <Bot className="w-2.5 h-2.5" />
                    {persona?.name || currentPersona}
                  </span>
                )}
                {currentModel && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-[11px] font-display">
                    <Cpu className="w-2.5 h-2.5" />
                    {formatModelLabel(currentModel)}
                  </span>
                )}
              </div>
              {templateId && TEMPLATE_DISPLAY[templateId] && (
                <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                  <span className="text-muted-foreground font-medium">Domain:</span> {TEMPLATE_DISPLAY[templateId].desc} ·
                  <span className="text-muted-foreground font-medium"> Style:</span> {persona?.description || 'General'}
                </p>
              )}
            </div>
          )}

          {/* Round-6 fix 1 (chrome 3 bars → 2): the agent toolbar row moved from
              a dedicated header bar to this slim strip attached to the top of the
              composer — persona chip + Memory pill on the left; autonomy + model +
              Agent Profile toggle on the right. Same controls, same handlers;
              dropdowns open UPWARD because the strip sits at the viewport bottom. */}
          <div
            ref={stripRef}
            className="flex min-w-0 flex-wrap items-center gap-1.5 px-1 pb-1.5 sm:flex-nowrap"
            data-testid="chat-agent-strip"
            data-compact={isStripCompact ? 'true' : 'false'}
          >
            {sessionCount > 0 && (
              /* R10 Lane D fix 2: the bare '>' toggle read as unlabeled chrome —
                 a styled hover tooltip (matching the strip family) names what it
                 does; aria-label + aria-expanded keep the a11y contract. */
              <HintTooltip content={showSessions ? 'Hide chat history' : `Show chat history${sessions.length > 0 ? ` (${sessions.length})` : ''}`}>
                <button
                  onClick={handleToggleSessions}
                  aria-label={showSessions ? 'Hide chat history' : 'Show chat history'}
                  aria-expanded={showSessions}
                  className={STRIP_ICON_PILL}
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSessions ? 'rotate-0' : '-rotate-90'}`} />
                </button>
              </HintTooltip>
            )}

            {onNewSession && (
              <HintTooltip content={newSessionLocked && sessionStatus
                ? sessionStatus
                : isLoading
                  ? 'Stop response and start a new session'
                  : 'New session'}>
                <button
                  type="button"
                  onClick={handleNewSession}
                  disabled={newSessionLocked}
                  aria-label="New session"
                  aria-describedby={sessionStatus ? sessionStatusId : undefined}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:border-[var(--honey-line)] hover:bg-[var(--surface-3)] hover:text-foreground active:bg-[var(--honey-wash)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden />
                  <span>New session</span>
                </button>
              </HintTooltip>
            )}

            {sessionStatus && (
              <>
                <span
                  id={sessionStatusId}
                  role={sessionStatusIsError ? 'alert' : 'status'}
                  title={sessionStatus}
                  className={`max-w-64 truncate text-[11px] ${sessionStatusIsError ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {sessionStatus}
                </span>
                {sessionError
                  && !newSessionTransitioning
                  && !sessionCreating
                  && sessionListFailed
                  && onRetrySessions && (
                  <button
                    type="button"
                    onClick={() => { void onRetrySessions(); }}
                    disabled={sessionLoading}
                    aria-label="Retry loading sessions"
                    aria-describedby={sessionStatusId}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    <span>Retry</span>
                  </button>
                )}
              </>
            )}

            {/* Persona picker */}
            <div className="relative" ref={personaPickerRef}>
              <button
                onClick={() => { setShowPersonaPicker(p => !p); setShowModelPicker(false); }}
                title="Agent persona for this chat — click to switch"
                aria-haspopup="menu"
                aria-expanded={showPersonaPicker}
                className={`${STRIP_PILL} text-muted-foreground`}
              >
                {persona ? (
                  <>
                    <Avatar className="w-4 h-4">
                      <AvatarImage src={persona.avatar} />
                      <AvatarFallback className="text-[9px] bg-primary/20">{persona.name[0]}</AvatarFallback>
                    </Avatar>
                    <span className="font-display">{persona.name}</span>
                  </>
                ) : (
                  <>
                    <Bot className="w-3.5 h-3.5" />
                    <span>Persona</span>
                  </>
                )}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showPersonaPicker && (
                <div className="absolute bottom-full left-0 mb-1 w-56 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden max-h-64 overflow-y-auto">
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
                        <AvatarFallback className="text-[11px] bg-primary/20">{p.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-display text-foreground truncate">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{p.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Memory-active trust signal — always visible (not gated by
                isStripCompact). Signals that the workspace memory layer is
                feeding context into this chat (5-persona UX audit, dim 9). */}
            <HintTooltip content="Saved context is available when relevant. When Waggle brings it into a reply, Activity shows what was recalled and where it came from. Open Memory to review or edit what is saved.">
              <span
                data-testid="chat-header-memory-active"
                className={`${STRIP_PILL} cursor-help font-display text-honey`}
              >
                <Brain className="w-2.5 h-2.5" aria-hidden="true" />
                Memory
              </span>
            </HintTooltip>

            {/* M-21 / UX-6: storage + team presence render inline at full
                width, or behind a ⋯ overflow menu when the strip is too
                narrow. Interactive controls (persona, autonomy, model)
                stay always visible. */}
            {!isStripCompact && storageType && (
              <span
                data-testid="chat-header-storage-badge"
                className={`${STRIP_PILL} font-display ${
                  storageType === 'local' ? 'text-emerald-400'
                  : storageType === 'team' ? 'text-sky-400'
                  : 'text-violet-400'
                }`}
              >
                {storageType === 'local' ? 'Linked' : storageType === 'team' ? 'Team' : 'Virtual'}
              </span>
            )}

            {/* Team presence — round-7 fix 2b: the bare avatar chip was
                unlabeled (a floating 'Y'), so the whole cluster is now one
                strip pill with a native title naming who's here. */}
            {!isStripCompact && roomPresence.length > 0 && (
              <div
                className={`${STRIP_PILL} px-1.5 text-muted-foreground`}
                data-testid="chat-header-team-presence"
                title={roomPresence.length === 1
                  ? `${roomPresence[0].name} — active in this chat`
                  : `Active in this chat: ${roomPresence.map(m => m.name).join(', ')}`}
              >
                <div className="flex -space-x-1.5">
                  {roomPresence.slice(0, 4).map(m => (
                    <div key={m.id} className="relative">
                      <Avatar className="w-4 h-4 border border-card">
                        {m.avatar ? <AvatarImage src={m.avatar} /> : null}
                        <AvatarFallback className="text-[9px] bg-sky-500/20 text-sky-400">{m.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-card ${m.status === 'online' ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                    </div>
                  ))}
                </div>
                {roomPresence.length > 4 && (
                  <span>+{roomPresence.length - 4}</span>
                )}
              </div>
            )}

            {/* ⋯ overflow menu — only rendered in compact mode and only
                when there's at least one informational chip to show. */}
            {isStripCompact && (storageType || roomPresence.length > 0) && (
              <div className="relative" ref={overflowRef}>
                <button
                  onClick={() => setShowHeaderOverflow(p => !p)}
                  className={STRIP_ICON_PILL}
                  aria-label="More chat context info"
                  data-testid="chat-header-overflow-trigger"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
                {showHeaderOverflow && (
                  <div
                    className="absolute bottom-full left-0 mb-1 w-56 bg-card border border-border rounded-xl shadow-xl z-20 p-2 space-y-2"
                    data-testid="chat-header-overflow-menu"
                  >
                    {storageType && (
                      <div className="flex items-center justify-between gap-2 px-1">
                        <span className="text-[11px] font-display text-muted-foreground">Storage</span>
                        <span
                          data-testid="chat-header-storage-badge"
                          className={`text-[10px] px-1.5 py-0.5 rounded font-display ${
                            storageType === 'local' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : storageType === 'team' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                            : 'bg-violet-500/10 text-violet-400 border border-violet-500/30'
                          }`}
                        >
                          {storageType === 'local' ? 'Linked' : storageType === 'team' ? 'Team' : 'Virtual'}
                        </span>
                      </div>
                    )}
                    {roomPresence.length > 0 && (
                      <div className="px-1" data-testid="chat-header-team-presence">
                        <p className="text-[11px] font-display text-muted-foreground mb-1">In this room</p>
                        <div className="flex flex-wrap gap-1.5">
                          {roomPresence.map(m => (
                            <div key={m.id} className="flex items-center gap-1.5 text-[11px] text-foreground">
                              <Avatar className="w-4 h-4 border border-card">
                                {m.avatar ? <AvatarImage src={m.avatar} /> : null}
                                <AvatarFallback className="text-[10px] bg-sky-500/20 text-sky-400">{m.name[0]}</AvatarFallback>
                              </Avatar>
                              <span className="truncate max-w-[8ch]">{m.name}</span>
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.status === 'online' ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
              {/* Round-7 fix 2a: subtle divider between the context cluster
                  (sessions · persona · Memory · presence) and the control
                  cluster (autonomy · model · profile). */}
              <span aria-hidden className="h-4 border-l border-[var(--line-soft)]" />
              {/* Phase B.5: autonomy toggle — only render when the parent wired a handler */}
              {onAutonomyChange && (
                <AutonomyToggle
                  level={autonomyLevel}
                  expiresAt={autonomyExpiresAt}
                  onChange={onAutonomyChange}
                />
              )}

              {/* Model picker */}
              <div className="relative" ref={modelPickerRef}>
                <button
                  type="button"
                  onClick={() => { setShowModelPicker(p => !p); setShowPersonaPicker(false); }}
                  aria-label={modelTriggerLabel}
                  aria-expanded={showModelPicker}
                  aria-controls={modelPickerId}
                  title={modelHealthStatus === 'unavailable'
                    ? 'Selected model is not responding — click to retry or switch'
                    : modelHealthStatus === 'checking'
                      ? 'Checking the selected model…'
                      : modelHealthStatus === 'unconfigured'
                        ? 'No model selected — click for details'
                        : modelCatalogStatus === 'unavailable'
                          ? 'Selected model responds; model list is unavailable'
                          : 'Selected model responds — click to switch'}
                  className={`${STRIP_PILL} focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]`}
                >
                  <DotLive
                    tone={modelHealthTone}
                    live={modelHealthStatus === 'checking'}
                    size={7}
                  />
                  <span className="max-w-[82px] truncate font-mono text-[var(--text-2)] sm:max-w-[140px]">
                    {currentModel ? formatModelLabel(currentModel) : 'auto'}
                  </span>
                  <span className="max-w-[82px] truncate text-[10px] text-[var(--text-dim)]">
                    · {modelHealthLabel}{modelHealthStatus === 'checking' ? '…' : ''}
                  </span>
                  <ChevronDown className="h-3 w-3 text-[var(--text-dim)]" aria-hidden="true" />
                </button>
                <span className="sr-only" aria-live="polite">
                  Selected model {modelHealthLabel}; model catalog {modelCatalogLabel}
                </span>
                {showModelPicker && (
                  <div
                    id={modelPickerId}
                    role="region"
                    aria-label="Available models"
                    className="absolute bottom-full right-0 mb-1 w-64 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden max-h-64 overflow-y-auto"
                  >
                    {modelHealthStatus === 'unavailable' && modelCatalogStatus === 'ready' && (
                      <div role="status" aria-live="polite" className="space-y-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
                        <p>Your saved model isn't responding. Choose another model or retry.</p>
                        {onRetryModels && (
                          <button
                            type="button"
                            aria-label="Retry selected model"
                            onClick={onRetryModels}
                            className="rounded-md border border-[var(--line)] px-2 py-1 text-foreground transition-colors hover:border-[var(--honey-line)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                          >
                            Retry Model
                          </button>
                        )}
                      </div>
                    )}
                    {modelHealthStatus === 'checking' && modelCatalogStatus === 'ready' && (
                      <div role="status" aria-live="polite" className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
                        Checking the selected model…
                      </div>
                    )}
                    {modelCatalogStatus === 'ready' && (
                      <div aria-label="Available models list">
                        {availableModels?.map(m => (
                          <button
                            type="button"
                            key={m}
                            aria-pressed={currentModel === m}
                            onClick={() => { onModelChange?.(m); setShowModelPicker(false); }}
                            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${
                              currentModel === m ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                            }`}
                          >
                            <Cpu className="w-3 h-3 text-honey shrink-0" aria-hidden="true" />
                            <span className="font-display text-foreground truncate">{formatModelLabel(m)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {modelCatalogStatus === 'loading' && (
                      <div role="status" aria-live="polite" className="px-3 py-2 text-xs text-muted-foreground">
                        Refreshing available models…
                      </div>
                    )}
                    {modelCatalogStatus === 'unavailable' && (
                      <div role="status" aria-live="polite" className="space-y-2 px-3 py-2 text-xs text-muted-foreground">
                        <p>Waggle couldn't refresh available models. Your saved selection is unchanged.</p>
                        <p>Retry now or check Models in Settings.</p>
                        {onRetryModels && (
                          <button
                            type="button"
                            aria-label="Retry available models"
                            onClick={onRetryModels}
                            className="rounded-md border border-[var(--line)] px-2 py-1 text-foreground transition-colors hover:border-[var(--honey-line)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                          >
                            Retry Models
                          </button>
                        )}
                      </div>
                    )}
                    {modelCatalogStatus === 'empty' && (
                      <div role="status" aria-live="polite" className="space-y-2 px-3 py-2 text-xs text-muted-foreground">
                        <p>
                          {modelHealthStatus === 'unconfigured'
                            ? 'No model configured. Add a model in Settings, then retry.'
                            : modelHealthStatus === 'ready'
                              ? 'No other models are available to switch to. Your verified model remains selected.'
                              : 'No models were discovered to switch to. Your saved selection is unchanged.'}
                        </p>
                        {onRetryModels && (
                          <button
                            type="button"
                            aria-label="Retry available models"
                            onClick={onRetryModels}
                            className="rounded-md border border-[var(--line)] px-2 py-1 text-foreground transition-colors hover:border-[var(--honey-line)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                          >
                            Retry Models
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Agent Profile toggle */}
              <HintTooltip content={showAgentProfile ? 'Hide agent profile' : 'Show agent profile'}>
                <button
                  onClick={() => setShowAgentProfile(p => !p)}
                  aria-label="Agent profile"
                  aria-expanded={showAgentProfile}
                  data-testid="chat-agent-profile-toggle"
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors ${
                    showAgentProfile
                      ? 'border-[var(--honey-line)] bg-[var(--honey-wash)] text-honey'
                      : 'border-[var(--line-soft)] bg-[var(--surface-2)] text-muted-foreground hover:border-[var(--honey-line)] hover:text-foreground'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                </button>
              </HintTooltip>
            </div>
          </div>

          <div className="flex items-end gap-2 rounded-[16px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 transition-colors focus-within:border-[var(--focus-ring)] focus-within:shadow-[var(--shadow-honey)]">
            <button
              onClick={handleFileSelect}
              aria-label="Attach file"
              title="Attach file (CSV, PDF, image, …)"
              className="pb-1 text-[var(--text-dim)] transition-colors hover:text-[var(--text-2)]"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <textarea
              ref={inputRef}
              aria-label="Message composer"
              name="message"
              autoComplete="off"
              value={input}
              aria-describedby={sessionInputLocked && sessionStatus ? sessionStatusId : undefined}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Reply, or ask Waggle to take the next step…"
              className="min-h-[64px] max-h-[300px] flex-1 resize-none bg-transparent py-1 text-[14.5px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
              rows={3}
            />
            <div className="flex items-center gap-2.5 pb-0.5">
              {/* Lane S2 (Pillar 3.1): a visible Stop control while a reply streams.
                  Halts the in-flight output immediately via the useChat abort path;
                  the partial answer stays and the composer returns to send. It sits
                  BESIDE send (Lane C keeps send live so a follow-up can queue
                  mid-stream). Color/border-only affordance → no reduced-motion. */}
              {isLoading && onStopStreaming && (
                <HintTooltip content="Stop generating">
                  <button
                    onClick={handleStopStreaming}
                    aria-label="Stop generating"
                    data-testid="chat-stop-stream"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-2)] transition-colors hover:border-[var(--honey-line)] hover:text-[var(--text)]"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                  </button>
                </HintTooltip>
              )}
              {/* Router arc B2: "Best fit" — propose where this task should run
                  (persona vs external CLI) before sending. Renders only when a
                  workspace is active (the proposal is workspace-scoped). The
                  composer text stays intact until the proposal is confirmed. */}
              {workspaceId && (
                <HintTooltip content="Best fit — let Waggle propose where this should run">
                  <button
                    onClick={() => void handleBestFit()}
                    disabled={!canSend || bestFitBusy}
                    aria-label="Best fit — propose where to run"
                    data-testid="chat-best-fit"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-2)] transition-colors hover:border-[var(--honey-line)] hover:text-[var(--text)] disabled:opacity-50"
                  >
                    {bestFitBusy
                      ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      : <Route className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </HintTooltip>
              )}
              {/* Round-6 fix 4: single send affordance — the circular button only.
                  Enter still submits (handleKeyDown); the "⏎ send" text hint and
                  the earlier Ctrl K hint (I1 fix 4b) are both gone. */}
              {/* I1 fix 4a: --honey darkens in light theme, so the enabled state
                  read washed there. bg-primary is the theme-decoupled vibrant CTA
                  fill (2026-07-06) in BOTH themes; disabled goes neutral instead
                  of low-opacity honey so the two states are unmistakable. */}
              <button
                onClick={handleSend}
                disabled={!canSend}
                aria-label="Send"
                aria-describedby={sessionInputLocked && sessionStatus ? sessionStatusId : undefined}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-[color,background-color,transform] duration-mo-base ${
                  canSend
                    ? 'bg-primary text-[#1a1407] hover:opacity-90'
                    : 'bg-[var(--surface-2)] text-[var(--text-dim)]'
                } ${sendPulse ? 'motion-safe:scale-110' : ''}`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          </div>
        </div>
      </div>

      {canvasOpen && canvasArtifact && (
        <ChatWorkCanvas
          artifact={canvasArtifact}
          isStreaming={isLoading}
          onClose={() => setCanvasOpen(false)}
        />
      )}
    </div>
  );
};

export default ChatApp;

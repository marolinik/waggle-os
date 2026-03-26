/**
 * ToolCard — three-layer tool execution indicator.
 *
 * Layer 1 (inline): Status icon + description + result summary — always visible
 * Layer 2 (detail): Formatted input/output — click to expand
 * Layer 3 (deep): Raw JSON dump — toggle inside expanded view
 *
 * Status states: running (spinner), done (check), error (x), denied (blocked), pending_approval (warning)
 * Auto-hides completed read-only tools after a delay.
 */

import { useState, useEffect, memo } from 'react';
import type { ToolUseEvent, ToolStatus } from '../../services/types.js';
import { formatDuration } from './utils.js';
import { ApprovalGate } from './ApprovalGate.js';

export interface ToolCardProps {
  tool: ToolUseEvent;
  onApprove?: (tool: ToolUseEvent) => void;
  onDeny?: (tool: ToolUseEvent, reason?: string) => void;
  /** Optional navigation callback — used by save_memory "Remembered" link to open Memory view. */
  onNavigate?: (view: string) => void;
}

// Tools that are safe/read-only — auto-hide after completion
// B5: auto_recall removed — its trust signal should stay visible
export const AUTO_HIDE_TOOLS = new Set([
  'search_memory', 'get_identity', 'get_awareness', 'query_knowledge',
  'read_file', 'search_files', 'search_content', 'web_search', 'web_fetch',
  'git_status', 'git_diff', 'git_log', 'show_plan',
  'list_skills', 'search_skills',
]);

// ── Status icons ──────────────────────────────────────────────────────

const STATUS_ICONS: Record<ToolStatus, string> = {
  running: '\u25CB',        // ○ hollow circle (animated via CSS)
  done: '\u2713',           // ✓ check
  error: '\u2717',          // ✗ x mark
  denied: '\u26D4',         // ⛔ no entry
  pending_approval: '\u26A0', // ⚠ warning
};

const STATUS_CLASSES: Record<ToolStatus, string> = {
  running: 'text-primary animate-pulse',
  done: 'text-green-400',
  error: 'text-red-400',
  denied: 'text-red-400',
  pending_approval: 'text-yellow-400',
};

const BORDER_CLASSES: Record<ToolStatus, string> = {
  running: 'border-l-primary bg-primary/10',
  done: 'border-l-green-600 bg-green-950/20',
  error: 'border-l-red-600 bg-red-950/20',
  denied: 'border-l-red-600 bg-red-950/20',
  pending_approval: 'border-l-yellow-600 bg-yellow-950/20',
};

// ── Human-readable descriptions ───────────────────────────────────────

/** Generate a short, human-readable description of what a tool is doing. */
function describeToolAction(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'web_search':
      return `Searching: "${String(input.query ?? '').slice(0, 60)}"`;
    case 'web_fetch':
      return `Reading: ${String(input.url ?? '').slice(0, 60)}`;
    case 'search_memory':
      return `Recalling: "${String(input.query ?? '').slice(0, 50)}"`;
    case 'save_memory':
      return 'Remembered \u2713';
    case 'get_identity':
      return 'Checking identity';
    case 'get_awareness':
      return 'Checking awareness';
    case 'query_knowledge':
      return 'Querying knowledge graph';
    case 'correct_knowledge':
      return 'Updating knowledge';
    case 'add_task':
      return `Adding task: "${String(input.title ?? input.content ?? '').slice(0, 50)}"`;
    case 'bash':
      return `$ ${String(input.command ?? '').slice(0, 70)}`;
    case 'read_file':
      return `Reading: ${input.path ?? ''}`;
    case 'write_file':
      return `Writing: ${input.path ?? ''}`;
    case 'edit_file':
      return `Editing: ${input.path ?? ''}`;
    case 'search_files':
      return `Finding files: ${input.pattern ?? ''}`;
    case 'search_content':
      return `Searching code: "${input.pattern ?? ''}"`;
    case 'git_status':
      return 'git status';
    case 'git_diff':
      return 'git diff';
    case 'git_log':
      return 'git log';
    case 'git_commit':
      return `Committing: "${String(input.message ?? '').slice(0, 50)}"`;
    case 'create_plan':
      return `Planning: "${String(input.title ?? '').slice(0, 50)}"`;
    case 'add_plan_step':
      return 'Adding plan step';
    case 'execute_step':
      return 'Executing plan step';
    case 'show_plan':
      return 'Showing plan';
    case 'generate_docx':
      return `Generating: ${input.path ?? 'document.docx'}`;
    case 'auto_recall':
      return 'Recalling context...';
    case 'spawn_agent':
      return `Spawning agent: ${input.name ?? input.role ?? ''}`;
    case 'list_agents':
      return 'Listing agents';
    case 'get_agent_result':
      return `Getting agent result: ${input.name ?? input.id ?? ''}`;
    case 'compose_workflow':
      return `Analyzing task complexity: "${String(input.task ?? '').slice(0, 50)}"`;
    case 'run_workflow':
      return `Running workflow: ${String(input.template ?? input.name ?? '')}`;
    default:
      return name.replace(/_/g, ' ');
  }
}

/** Summarize tool result to one line. */
function summarizeResult(result: string | undefined, name: string): string | null {
  if (!result) return null;
  const text = String(result);

  // Error results
  if (text.startsWith('Error:')) return text.slice(0, 80);

  // Success summaries by tool type
  if (name === 'web_search') {
    const count = (text.match(/^\[\d+\]/gm) ?? []).length;
    return count > 0 ? `${count} results found` : 'No results';
  }
  if (name === 'search_memory') {
    if (text.includes('No relevant memories')) return 'No memories found';
    const count = (text.match(/^---/gm) ?? []).length;
    return count > 0 ? `${count} memories found` : 'Found relevant memories';
  }
  // B5: auto_recall shows a content snippet for trust signal
  if (name === 'auto_recall') {
    const breadcrumb = ' \u00B7 Browse all (Ctrl+Shift+5)';
    if (text.includes('No relevant memories')) return 'No memories found';
    // Extract first memory snippet from the result
    const snippetMatch = text.match(/^\s+-\s+(.+)$/m);
    if (snippetMatch) {
      const snippet = snippetMatch[1].trim();
      const truncated = snippet.length > 60 ? snippet.slice(0, 57) + '...' : snippet;
      const countMatch = text.match(/^(\d+) memories/);
      const count = countMatch ? countMatch[1] : '';
      const relevanceLabel = count ? (parseInt(count) >= 3 ? ' \u00B7 high relevance' : parseInt(count) >= 1 ? ' \u00B7 relevant' : '') : '';
      return count ? `${count} recalled${relevanceLabel}: "${truncated}"${breadcrumb}` : `Recalled: "${truncated}"${breadcrumb}`;
    }
    return 'Recalled relevant memories' + breadcrumb;
  }
  if (name === 'generate_docx' && text.startsWith('Successfully')) {
    return text.split('\n')[0];
  }
  if (name === 'bash') {
    const lines = text.trim().split('\n');
    return lines.length <= 1 ? text.trim().slice(0, 80) : `${lines.length} lines of output`;
  }
  if (name === 'read_file') {
    const lines = text.trim().split('\n');
    return `${lines.length} lines`;
  }
  if (name === 'search_files' || name === 'search_content') {
    const lines = text.trim().split('\n').filter(l => l.trim());
    return `${lines.length} matches`;
  }
  if (text.startsWith('Successfully')) return text.split('\n')[0].slice(0, 80);
  if (text.startsWith('No ')) return text.slice(0, 60);

  // Default: first line, truncated
  const firstLine = text.split('\n')[0].trim();
  return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
}

/** Format input for Layer 2 (human-readable, not raw JSON). */
function formatInputDetail(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'bash':
      return String(input.command ?? '');
    case 'read_file':
    case 'write_file':
    case 'edit_file':
      return String(input.path ?? '');
    case 'web_search':
      return String(input.query ?? '');
    case 'web_fetch':
      return String(input.url ?? '');
    case 'search_memory':
      return `Query: "${input.query ?? ''}"${input.scope ? ` (scope: ${input.scope})` : ''}`;
    case 'save_memory':
      return String(input.content ?? '');
    case 'git_commit':
      return String(input.message ?? '');
    case 'search_files':
      return `Pattern: ${input.pattern ?? ''}`;
    case 'search_content':
      return `Pattern: "${input.pattern ?? ''}"${input.path ? ` in ${input.path}` : ''}`;
    default:
      // Compact key=value format for other tools
      return Object.entries(input)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('\n');
  }
}

/** Format result for Layer 2 display — show full content, only truncate very long outputs. */
function formatResultDetail(result: string): string {
  const lines = result.split('\n');
  if (lines.length <= 100) return result;
  return lines.slice(0, 100).join('\n') + `\n... (${lines.length - 100} more lines)`;
}

// ── Component ─────────────────────────────────────────────────────────

/** localStorage key for tracking whether the user has seen the memory explanation tooltip. */
const MEMORY_EXPLAINED_KEY = 'waggle:memory-explained';

export const ToolCard = memo(function ToolCard({ tool, onApprove, onDeny, onNavigate }: ToolCardProps) {
  const [layer, setLayer] = useState<1 | 2 | 3>(1); // Current transparency layer
  const [visible, setVisible] = useState(true);
  const [justCompleted, setJustCompleted] = useState(false);
  const [showMemoryTooltip, setShowMemoryTooltip] = useState(false);
  const status = tool.status ?? (tool.result !== undefined ? 'done' : 'running');
  const isPendingApproval = status === 'pending_approval';
  const isDone = status === 'done' || status === 'error' || status === 'denied';

  // Subtle flash on completion
  useEffect(() => {
    if (isDone) {
      setJustCompleted(true);
      const timer = setTimeout(() => setJustCompleted(false), 400);
      return () => clearTimeout(timer);
    }
  }, [isDone]);

  // Show memory explanation tooltip on first save_memory completion per session
  useEffect(() => {
    if (isDone && tool.name === 'save_memory') {
      try {
        if (!localStorage.getItem(MEMORY_EXPLAINED_KEY)) {
          setShowMemoryTooltip(true);
        }
      } catch {
        // localStorage unavailable — skip tooltip
      }
    }
  }, [isDone, tool.name]);

  const dismissMemoryTooltip = () => {
    setShowMemoryTooltip(false);
    try {
      localStorage.setItem(MEMORY_EXPLAINED_KEY, '1');
    } catch {
      // localStorage unavailable — ignore
    }
  };

  // Auto-hide read-only completed tools after 3 seconds
  useEffect(() => {
    if (isDone && AUTO_HIDE_TOOLS.has(tool.name) && layer === 1) {
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isDone, tool.name, layer]);

  // Hidden tools show as a minimal indicator
  if (!visible) {
    return (
      <button
        onClick={() => { setVisible(true); setLayer(2); }}
        className="tool-card--hidden inline-flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        title={describeToolAction(tool.name, tool.input)}
      >
        <span className={`text-[8px] ${STATUS_CLASSES[status]}`}>{STATUS_ICONS[status]}</span>
        <span className="font-mono">{tool.name}</span>
      </button>
    );
  }

  const description = describeToolAction(tool.name, tool.input);
  const resultSummary = isDone ? summarizeResult(tool.result, tool.name) : null;

  const cycleLayer = () => {
    if (layer === 1) setLayer(2);
    else if (layer === 2) setLayer(3);
    else setLayer(1);
  };

  return (
    <div
      className={`tool-card rounded border-l-2 ${BORDER_CLASSES[status]} text-xs transition-[opacity,border-color] duration-300 ease-out ${justCompleted ? 'opacity-85' : ''}`}
    >
      {/* Layer 1 — Inline: status icon + description + summary */}
      <button
        onClick={cycleLayer}
        className="tool-card__header flex w-full items-center gap-1.5 px-2 py-1 text-left text-muted-foreground hover:text-foreground"
      >
        {/* Status icon */}
        <span className={`tool-card__status text-[10px] ${STATUS_CLASSES[status]}`}>
          {STATUS_ICONS[status]}
        </span>

        {/* Pulsing amber dot for active (running/pending) tools — Q12:C progress indicator */}
        {status !== 'done' && status !== 'error' && status !== 'denied' && (
          <span className="tool-card__active-dot inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        )}

        {/* Description — clickable for save_memory to navigate to Memory view */}
        {tool.name === 'save_memory' && isDone ? (
          <span
            className="tool-card__description flex-1 font-mono cursor-pointer hover:text-primary transition-colors"
            role="link"
            tabIndex={0}
            title="Open Memory view"
            onClick={(e) => {
              e.stopPropagation();
              onNavigate?.('memory');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onNavigate?.('memory');
              }
            }}
          >
            {description}
          </span>
        ) : (
          <span className="tool-card__description flex-1 font-mono">
            {description}
          </span>
        )}

        {/* Result summary (Layer 1 only) */}
        {resultSummary && layer === 1 && (
          <span className="tool-card__summary max-w-[60%] text-muted-foreground">
            {resultSummary}
          </span>
        )}

        {/* Pending approval badge */}
        {isPendingApproval && (
          <span className="rounded px-1 py-0.5 bg-yellow-800/60 text-yellow-300">
            Approve?
          </span>
        )}

        {/* Duration */}
        {tool.duration !== undefined && (
          <span className="tool-card__duration text-muted-foreground tabular-nums">
            {formatDuration(tool.duration)}
          </span>
        )}

        {/* Layer indicator */}
        <span className="tool-card__layer-hint opacity-30 text-[8px]">
          {layer === 1 ? '\u25B6' : layer === 2 ? '\u25BC' : '\u25C0'}
        </span>
      </button>

      {/* Inline approval gate */}
      {isPendingApproval && onApprove && onDeny && (
        <div className="tool-card__approval px-2 py-1.5 border-t border-border">
          <ApprovalGate
            tool={tool}
            onApprove={() => onApprove(tool)}
            onDeny={(reason) => onDeny(tool, reason)}
          />
        </div>
      )}

      {/* Layer 2 — Inspectable detail: formatted input + output */}
      {layer >= 2 && (
        <div className="tool-card__detail border-t border-border px-2 py-1.5">
          <div className="mb-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Input</div>
          <pre className="tool-card__input mb-1.5 overflow-x-auto whitespace-pre-wrap text-[11px] text-muted-foreground max-h-24 overflow-y-auto">
            {formatInputDetail(tool.name, tool.input)}
          </pre>
          {tool.result !== undefined && (
            <>
              <div className="mb-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                {status === 'error' ? 'Error' : 'Output'}
              </div>
              <pre className={`tool-card__output overflow-x-auto whitespace-pre-wrap text-[11px] max-h-40 overflow-y-auto ${
                status === 'error' ? 'text-red-400' : 'text-muted-foreground'
              }`}>
                {formatResultDetail(tool.result)}
              </pre>
            </>
          )}
        </div>
      )}

      {/* Layer 3 — Deep inspection: raw JSON */}
      {layer === 3 && (
        <div className="tool-card__raw border-t border-border/50 px-2 py-1.5 bg-background/50">
          <div className="mb-0.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide">Raw JSON</div>
          <pre className="tool-card__raw-input mb-1.5 overflow-x-auto whitespace-pre-wrap text-[10px] text-muted-foreground max-h-32 overflow-y-auto font-mono">
            {JSON.stringify(tool.input, null, 2)}
          </pre>
          {tool.result !== undefined && (
            <pre className="tool-card__raw-output overflow-x-auto whitespace-pre-wrap text-[10px] text-muted-foreground max-h-48 overflow-y-auto font-mono">
              {tool.result}
            </pre>
          )}
        </div>
      )}

      {/* Memory explanation tooltip — shown once per session on first save_memory */}
      {showMemoryTooltip && tool.name === 'save_memory' && (
        <div className="tool-card__memory-tooltip mx-2 mb-1.5 mt-0.5 rounded-lg px-3 py-2 bg-amber-950/30 border border-amber-500/20 text-xs text-amber-200/80">
          <p className="mb-1.5">
            Your agent just saved this to memory. Browse all memories in the Memory tab (<kbd className="px-1 py-0.5 rounded bg-amber-900/40 text-amber-300/90 text-[10px]">Ctrl+Shift+5</kbd>).
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              dismissMemoryTooltip();
            }}
            className="text-[10px] px-2 py-0.5 rounded bg-amber-800/40 border border-amber-500/20 text-amber-300 hover:bg-amber-700/40 transition-colors cursor-pointer"
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
});

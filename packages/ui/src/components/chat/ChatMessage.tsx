/**
 * ChatMessage — renders a single chat message (user, assistant, or system).
 *
 * User messages are right-aligned, assistant messages left-aligned.
 * System messages (slash command responses) are centered with muted styling.
 * Assistant messages render markdown (sanitized) with a unified event trail
 * (interleaved reasoning steps and tool cards), collapsed by default.
 */

import { useMemo, useState, useCallback, memo } from 'react';
import { marked, Renderer } from 'marked';
import DOMPurify from 'dompurify';
import type { Message, ToolUseEvent } from '../../services/types.js';
import { ToolCard, AUTO_HIDE_TOOLS } from './ToolCard.js';
import { FeedbackButtons, type FeedbackRating, type FeedbackReason } from './FeedbackButtons.js';

// Languages eligible for the Run button (Task 7.1)
const RUNNABLE_LANGUAGES = new Set(['javascript', 'typescript', 'python']);

// W4.9/W4.10: Custom renderer for code blocks with language labels + copy/run buttons
// W7.1: Run button for runnable languages, W7.2: Mermaid diagram rendering
const renderer = new Renderer();
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang || 'text';
  const escapedCode = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // W7.2: Mermaid diagram — render in a styled container with a label
  if (language === 'mermaid') {
    return `<div class="mermaid-block my-3 border border-border rounded-lg overflow-hidden">
      <div class="flex items-center justify-between bg-muted/50 border-b border-border px-3 py-1 text-[10px] font-mono text-muted-foreground">
        <span>\u25C8 Mermaid Diagram</span>
        <button onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(text)}'));this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)" class="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] hover:text-foreground cursor-pointer">Copy</button>
      </div>
      <pre class="mermaid !mt-0 !rounded-t-none p-4 bg-card text-sm">${escapedCode}</pre>
    </div>`;
  }

  const showRun = RUNNABLE_LANGUAGES.has(language);
  const encodedForCopy = encodeURIComponent(text);
  const runBtnHtml = showRun
    ? ` <button data-run-code data-lang="${language}" data-code="${encodedForCopy}" class="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] hover:text-foreground cursor-pointer ml-2">\u25B6 Run</button>`
    : '';

  return `<div class="code-block-wrapper group relative my-3">
    <div class="flex items-center justify-between bg-muted/50 border border-border border-b-0 rounded-t-lg px-3 py-1 text-[10px] font-mono text-muted-foreground">
      <span>${language}</span>
      <span class="flex items-center">
        <button onclick="navigator.clipboard.writeText(decodeURIComponent('${encodedForCopy}'));this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)" class="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] hover:text-foreground cursor-pointer">Copy</button>${runBtnHtml}
      </span>
    </div>
    <pre class="!mt-0 !rounded-t-none"><code class="language-${language}">${escapedCode}</code></pre>
  </div>`;
};

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
  renderer,
});

// ── Tool grouping ─────────────────────────────────────────────────────

/** Collapsed summary of multiple completed read-only tools. */
function ToolGroup({ tools }: { tools: ToolUseEvent[] }) {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return (
      <div className="tool-group">
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1 mb-1"
        >
          <span className="text-[8px] text-green-500 dark:text-green-400">{'\u25CF'}</span>
          {tools.length} tools completed
          <span className="text-[8px]">{'\u25B2'}</span>
        </button>
        <div className="space-y-0.5">
          {tools.map((tool, i) => (
            <ToolCard key={`${tool.name}-${i}`} tool={tool} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setExpanded(true)}
      className="tool-group--collapsed flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-0.5"
      title={tools.map(t => t.name).join(', ')}
    >
      <span className="text-[8px] text-green-500 dark:text-green-400">{'\u25CF'}</span>
      <span className="font-mono">
        {tools.length} tools completed ({tools.map(t => t.name.replace(/_/g, ' ')).join(', ')})
      </span>
    </button>
  );
}

/** Categorized tool count summary — shows breakdown when ≥ 3 tools. */
function ToolCountSummary({ tools, steps }: { tools: ToolUseEvent[]; steps?: string[] }) {
  const count = tools.length;
  const hasSteps = steps && steps.length > 0;
  const stepSuffix = hasSteps ? ` \u00B7 ${steps!.length} step${steps!.length !== 1 ? 's' : ''}` : '';
  const spawnEvents = tools.filter(t => t.name === 'spawn_agent');

  if (count < 3) {
    return (
      <span>
        {count} tool{count !== 1 ? 's' : ''}{stepSuffix}
        {spawnEvents.length > 0 && (
          <span className="ml-2 text-primary/60">
            · {spawnEvents.length} specialist{spawnEvents.length > 1 ? 's' : ''} deployed
          </span>
        )}
      </span>
    );
  }

  const searches = tools.filter(t => ['web_search', 'web_fetch', 'tavily_search', 'brave_search'].includes(t.name)).length;
  const recalls = tools.filter(t => ['search_memory', 'auto_recall', 'query_knowledge'].includes(t.name)).length;
  const files = tools.filter(t => ['read_file', 'write_file', 'edit_file', 'generate_docx'].includes(t.name)).length;
  const other = count - searches - recalls - files;

  const parts: string[] = [];
  if (searches > 0) parts.push(`${searches}\u00D7 search`);
  if (recalls > 0) parts.push(`${recalls}\u00D7 memory`);
  if (files > 0) parts.push(`${files}\u00D7 file`);
  if (other > 0) parts.push(`${other}\u00D7 other`);

  return (
    <span>
      {count} tools: {parts.join(', ')}{stepSuffix}
      {spawnEvents.length > 0 && (
        <span className="ml-2 text-primary/60">
          · {spawnEvents.length} specialist{spawnEvents.length > 1 ? 's' : ''} deployed
        </span>
      )}
    </span>
  );
}

/**
 * Walk through tools array and group adjacent completed auto-hide tools (runs of 2+).
 * Returns mixed array of ToolCard and ToolGroup elements.
 */
function groupToolCards(
  tools: ToolUseEvent[],
  onApprove?: (tool: ToolUseEvent) => void,
  onDeny?: (tool: ToolUseEvent, reason?: string) => void,
): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < tools.length) {
    const tool = tools[i];
    const status = tool.status ?? (tool.result !== undefined ? 'done' : 'running');
    const isGroupable = status === 'done' && AUTO_HIDE_TOOLS.has(tool.name);

    if (isGroupable) {
      // Collect run of adjacent groupable tools
      const runStart = i;
      while (i < tools.length) {
        const t = tools[i];
        const s = t.status ?? (t.result !== undefined ? 'done' : 'running');
        if (s === 'done' && AUTO_HIDE_TOOLS.has(t.name)) {
          i++;
        } else {
          break;
        }
      }
      const run = tools.slice(runStart, i);
      if (run.length >= 2) {
        elements.push(<ToolGroup key={`group-${runStart}`} tools={run} />);
      } else {
        // Single tool — render as normal ToolCard
        elements.push(
          <ToolCard key={`${run[0].name}-${runStart}`} tool={run[0]} onApprove={onApprove} onDeny={onDeny} />,
        );
      }
    } else {
      elements.push(
        <ToolCard key={`${tool.name}-${i}`} tool={tool} onApprove={onApprove} onDeny={onDeny} />,
      );
      i++;
    }
  }

  return elements;
}

// ── ChatMessage ───────────────────────────────────────────────────────

export interface ChatMessageProps {
  message: Message;
  /** Index of this message in the session (for feedback tracking). */
  messageIndex?: number;
  /** Session ID for feedback attribution. */
  sessionId?: string;
  onToolApprove?: (tool: ToolUseEvent) => void;
  onToolDeny?: (tool: ToolUseEvent, reason?: string) => void;
  /** Called when the user submits thumbs up/down feedback on this message. */
  onFeedback?: (rating: FeedbackRating, reason?: FeedbackReason, detail?: string) => void;
  /** Called to send a message to the chat (used for DOCX generation prompt). */
  onSendMessage?: (text: string) => void;
  /** Called when user pins/favorites this message. */
  onPinMessage?: (content: string, role: 'assistant' | 'user') => void;
}

export const ChatMessage = memo(function ChatMessage({ message, messageIndex, sessionId, onToolApprove, onToolDeny, onFeedback, onSendMessage, onPinMessage }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const [trailExpanded, setTrailExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!message.content) return;
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => { /* clipboard not available */ });
  }, [message.content]);

  // W7.1: Handle Run button clicks on code blocks (delegated via data attributes)
  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.hasAttribute('data-run-code') && onSendMessage) {
      e.preventDefault();
      const lang = target.getAttribute('data-lang') ?? 'javascript';
      const code = decodeURIComponent(target.getAttribute('data-code') ?? '');
      if (code) {
        onSendMessage(`Run this ${lang} code:\n\`\`\`${lang}\n${code}\n\`\`\``);
      }
    }
  }, [onSendMessage]);

  // Render markdown for assistant and system messages, sanitize HTML output
  // Content is sanitized with DOMPurify before rendering
  const renderedContent = useMemo(() => {
    if (isUser || !message.content) return null;
    const rawHtml = marked.parse(message.content) as string;
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['p','br','strong','em','code','pre','ul','ol','li','a','h1','h2','h3','h4','h5','h6','blockquote','table','thead','tbody','tr','th','td','span','div','hr','img','sup','sub','del','s','button'],
      ALLOWED_ATTR: ['href','src','alt','class','id','onclick','data-run-code','data-lang','data-code'],
      FORBID_TAGS: ['form','input','textarea','iframe','object','embed','script','style'],
    });
  }, [message.content, isUser]);

  // DOCX download eligibility: assistant messages with 500+ chars and markdown headers
  const isDocxEligible = useMemo(() => {
    if (isUser || isSystem || !message.content) return false;
    return message.content.length > 500 && /^#{2,3}\s/m.test(message.content);
  }, [message.content, isUser, isSystem]);

  const hasSteps = message.steps && message.steps.length > 0;
  const hasTools = message.toolUse && message.toolUse.length > 0;
  const hasTrail = hasSteps || hasTools;

  // Check if any tool needs attention (pending approval or still running)
  const hasActiveTools = message.toolUse?.some(
    t => t.status === 'pending_approval' || t.status === 'running',
  );

  // Auto-expand if there's a tool needing approval
  const showTrail = trailExpanded || hasActiveTools;

  // System messages — centered, compact, muted
  if (isSystem) {
    return (
      <div className="chat-message chat-message--system flex justify-center" role="article" aria-label="System message">
        <div className="max-w-[90%] rounded-xl px-5 py-3 bg-muted border border-border text-[13px]">
          {/* Content sanitized with DOMPurify */}
          <div
            className="chat-message__content prose dark:prose-invert prose-sm max-w-none prose-p:mb-1 prose-p:text-[13px]"
            dangerouslySetInnerHTML={{ __html: renderedContent ?? '' }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`chat-message chat-message--${message.role} ${
        isUser ? 'flex justify-end' : 'flex justify-start'
      }`}
      role="article"
      aria-label={isUser ? 'Your message' : 'Agent message'}
    >
      <div
        className="group/msg max-w-[70%] rounded-xl px-5 py-3.5"
        style={isUser
          ? { backgroundColor: 'var(--hive-800)', color: 'var(--hive-100)' }
          : { backgroundColor: 'var(--hive-850)', borderLeft: '3px solid var(--honey-500)', color: 'var(--hive-100)' }
        }
      >
        {/* Message content */}
        {isUser ? (
          <div className="chat-message__content whitespace-pre-wrap" style={{ fontSize: '14px', lineHeight: '1.7', color: 'var(--hive-100)' }}>
            {message.content}
          </div>
        ) : (
          /* Content sanitized with DOMPurify — full markdown rendering, W7.1 Run button handler */
          <div
            className="chat-message__content prose dark:prose-invert max-w-none"
            style={{ color: 'var(--hive-100)', fontSize: '14px', lineHeight: '1.7' }}
            dangerouslySetInnerHTML={{ __html: renderedContent ?? '' }}
            onClick={handleContentClick}
          />
        )}

        {/* Hover action buttons — pin + DOCX save */}
        {!isUser && (
          <div className="chat-message__hover-actions mt-1 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-3">
            {/* Pin/favorite button — appears on hover for assistant messages */}
            {onPinMessage && message.content && (
              <button
                onClick={() => onPinMessage(message.content!, 'assistant')}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer px-0 py-0.5"
                title="Pin this message"
              >
                <span>{'\uD83D\uDCCC'}</span>
                <span>Pin</span>
              </button>
            )}
            {/* Save as DOCX button — appears on hover for long structured assistant messages */}
            {isDocxEligible && (
              <button
                onClick={() => {
                  if (onSendMessage) {
                    onSendMessage('Please save the above response as a DOCX document.');
                  }
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer px-0 py-0.5"
                title="Save this response as a Word document"
              >
                <span>{'\uD83D\uDCC4'}</span>
                <span>Save as DOCX</span>
              </button>
            )}
          </div>
        )}

        {/* Unified event trail — steps + tool cards */}
        {!isUser && hasTrail && (
          <div className="chat-message__trail mt-2">
            {/* Trail toggle header */}
            <button
              onClick={() => setTrailExpanded(prev => !prev)}
              className="chat-message__trail-toggle flex items-center gap-1.5 text-xs text-muted-foreground hover:text-muted-foreground mb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              aria-expanded={showTrail}
              aria-label={`${message.toolUse?.length ?? 0} tools used. ${showTrail ? 'Collapse' : 'Expand'} details`}
            >
              <span className="text-[8px]">{showTrail ? '\u25BC' : '\u25B6'}</span>
              <ToolCountSummary tools={message.toolUse ?? []} steps={message.steps} />
              {hasActiveTools && (
                <span className="text-primary animate-pulse">{'\u25CF'}</span>
              )}
            </button>

            {/* Expanded trail content */}
            {showTrail && (
              <div className="chat-message__trail-content space-y-1">
                {/* Reasoning steps — compact */}
                {hasSteps && (
                  <div className="chat-message__steps space-y-0.5">
                    {message.steps!.map((step, i) => (
                      <div
                        key={i}
                        className="chat-message__step flex items-center gap-1.5 text-xs text-muted-foreground font-mono"
                      >
                        <span className="text-primary text-[8px]">{'\u25CF'}</span>
                        {step}
                      </div>
                    ))}
                  </div>
                )}

                {/* Tool cards — adjacent completed auto-hide tools grouped */}
                {hasTools && (
                  <div className="chat-message__tools space-y-1">
                    {groupToolCards(message.toolUse!, onToolApprove, onToolDeny)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Timestamp + copy button + feedback */}
        <div className="chat-message__time mt-1 text-xs opacity-50 flex items-center gap-2">
          <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
          {!isUser && message.content && (
            <button
              onClick={handleCopy}
              className="chat-message__copy hover:opacity-100 opacity-60 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded bg-transparent border-none cursor-pointer text-inherit text-[11px] px-0.5 py-0"
              title="Copy message"
              aria-label="Copy message to clipboard"
            >
              {copied ? '\u2713 Copied' : '\u2398 Copy'}
            </button>
          )}
          {!isUser && onFeedback && sessionId && messageIndex != null && (
            <FeedbackButtons
              sessionId={sessionId}
              messageIndex={messageIndex}
              onFeedback={onFeedback}
            />
          )}
          {!isUser && message.cost != null && message.cost > 0 && (
            <span className="text-[10px] opacity-60" title={`Input: ${message.tokens?.input ?? '?'} · Output: ${message.tokens?.output ?? '?'}`}>
              {message.cost < 0.01 ? '<$0.01' : `$${message.cost.toFixed(3)}`}
              {message.tokens && ` \u00B7 ${Math.round((message.tokens.input + message.tokens.output) / 100) / 10}k`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

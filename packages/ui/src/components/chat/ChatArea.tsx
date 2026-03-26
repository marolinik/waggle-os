/**
 * ChatArea — main chat container component.
 *
 * Renders a scrollable list of ChatMessage components with a ChatInput at the bottom.
 * Auto-scrolls to bottom on new messages. Supports slash commands.
 *
 * When no messages exist and workspace context is available, shows the
 * "Workspace Now" block with summary, suggested prompts, and recent threads.
 */

import { useRef, useEffect, useState } from 'react';
import type { Message, ToolUseEvent, WorkspaceContext } from '../../services/types.js';
import { ChatMessage } from './ChatMessage.js';
import { ChatInput, CLIENT_COMMANDS, type SlashCommand } from './ChatInput.js';
import { SubAgentProgress, type SubAgentInfo } from './SubAgentProgress.js';
import { SubAgentPanel } from './SubAgentPanel.js';
import type { FeedbackRating, FeedbackReason } from './FeedbackButtons.js';

/** Scroll positions keyed by workspace/session for persistence across switches */
const scrollPositions = new Map<string, number>();

// Wave 1.6: Template-specific starter card definitions
const TEMPLATE_STARTERS: Record<string, Array<{ label: string; sub: string; cmd: string }>> = {
  'sales-pipeline': [
    { label: 'Research a prospect', sub: 'Company deep-dive', cmd: 'Research [company name] — find key decision-makers, recent news, and pain points' },
    { label: 'Draft outreach', sub: 'Cold email', cmd: '/draft cold email to [prospect name] at [company]' },
    { label: 'Prep for call', sub: 'Meeting brief', cmd: 'Help me prepare for my call with [prospect] tomorrow' },
  ],
  'research-project': [
    { label: 'Start research', sub: 'Deep dive', cmd: '/research ' },
    { label: 'Literature review', sub: 'Academic sources', cmd: 'Help me design a literature review on [topic]' },
    { label: 'Analyze findings', sub: 'Synthesis', cmd: 'Analyze and synthesize my research findings so far' },
  ],
  'code-review': [
    { label: 'Review code', sub: 'Paste a diff', cmd: '/review ' },
    { label: 'Architecture check', sub: 'Design review', cmd: 'Review the architecture of [component/service]' },
    { label: 'Debug issue', sub: 'Investigate', cmd: 'Help me debug [describe the issue]' },
  ],
  'marketing-campaign': [
    { label: 'Campaign brief', sub: 'Strategy', cmd: '/draft campaign brief for [product/initiative]' },
    { label: 'Content calendar', sub: 'Planning', cmd: 'Create a content calendar for next month' },
    { label: 'Competitive analysis', sub: 'Research', cmd: '/research competitors in [industry]' },
  ],
  'product-launch': [
    { label: 'Write PRD', sub: 'Feature spec', cmd: '/draft PRD for [feature name]' },
    { label: 'Roadmap update', sub: 'Planning', cmd: 'Help me prioritize my backlog for next quarter' },
    { label: 'Stakeholder update', sub: 'Communication', cmd: '/draft stakeholder update for [project]' },
  ],
  'legal-review': [
    { label: 'Review contract', sub: 'Flag risks', cmd: 'Review this contract and flag risky clauses: [paste or describe]' },
    { label: 'Legal research', sub: 'Regulations', cmd: '/research [legal topic or regulation]' },
    { label: 'Draft document', sub: 'Legal writing', cmd: '/draft NDA template for [context]' },
  ],
  'agency-consulting': [
    { label: 'Client research', sub: 'Deep dive', cmd: '/research [client company] — industry, competitors, recent developments' },
    { label: 'Draft deliverable', sub: 'Consulting output', cmd: '/draft [presentation/report] for [client]' },
    { label: 'Plan project', sub: 'Work breakdown', cmd: '/plan [project name] deliverables and timeline' },
  ],
};

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

/* Contextual suggestions removed — replaced by Hive starter cards in empty state */

export interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (text: string) => void;
  onSlashCommand?: (command: string, args: string) => void;
  onFileSelect?: (files: File[]) => void;
  onToolApprove?: (tool: ToolUseEvent) => void;
  onToolDeny?: (tool: ToolUseEvent, reason?: string) => void;
  /** Workspace context for the "Workspace Now" catch-up block */
  workspaceContext?: WorkspaceContext | null;
  /** Called when user clicks a recent thread to resume it */
  onThreadSelect?: (sessionId: string) => void;
  /** F7: Active workspace name for contextual empty state suggestions */
  workspaceName?: string;
  /** Session key for scroll position persistence (workspace ID or session ID) */
  scrollKey?: string;
  /** Active sub-agents for SubAgentProgress panel */
  subAgents?: SubAgentInfo[];
  /** Session ID for feedback attribution */
  sessionId?: string;
  /** Called when user submits feedback on a message (thumbs up/down) */
  onFeedback?: (messageIndex: number, rating: FeedbackRating, reason?: FeedbackReason, detail?: string) => void;
}

export function ChatArea({ messages, isLoading, onSendMessage, onSlashCommand, onFileSelect, onToolApprove, onToolDeny, workspaceContext, onThreadSelect, workspaceName, scrollKey, subAgents, sessionId, onFeedback }: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(messages.length);
  const [mergedCommands, setMergedCommands] = useState<SlashCommand[] | undefined>(undefined);

  // Fetch server commands on mount and merge with client-only commands
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('http://127.0.0.1:3333/api/capabilities/status');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        // Map server command format → SlashCommand format
        const serverCmds: SlashCommand[] = (data.commands ?? []).map(
          (c: { name: string; description: string; usage?: string }) => {
            const slashName = c.name.startsWith('/') ? c.name : `/${c.name}`;
            // Extract args from usage: e.g. "/catchup <topic>" → "<topic>"
            let args: string | undefined;
            if (c.usage) {
              const spaceIdx = c.usage.indexOf(' ');
              if (spaceIdx > 0) {
                args = c.usage.slice(spaceIdx + 1).trim() || undefined;
              }
            }
            return { name: slashName, description: c.description, args };
          }
        );

        // Merge: server commands take precedence, then add client-only commands not in server list
        const serverNames = new Set(serverCmds.map(c => c.name));
        const clientOnly = CLIENT_COMMANDS.filter(c => !serverNames.has(c.name));
        setMergedCommands([...serverCmds, ...clientOnly]);
      } catch {
        // Server unavailable — ChatInput will fall back to CLIENT_COMMANDS
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Restore scroll position when switching sessions
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !scrollKey) return;
    const saved = scrollPositions.get(scrollKey);
    if (saved !== undefined) {
      el.scrollTop = saved;
    } else {
      // New session — scroll to bottom
      el.scrollTop = el.scrollHeight;
    }
    return () => {
      // Save position when unmounting / switching away
      if (scrollRef.current && scrollKey) {
        scrollPositions.set(scrollKey, scrollRef.current.scrollTop);
      }
    };
  }, [scrollKey]);

  // Auto-scroll to bottom only when NEW messages arrive
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
    prevMessageCount.current = messages.length;
  }, [messages]);

  const [showOverview, setShowOverview] = useState(false);
  const showWorkspaceHome = (messages.length === 0 || showOverview) && workspaceContext;

  return (
    <div className="flex flex-col h-full">
      {/* Sub-agent orchestration panel — above messages when agents are active */}
      {subAgents && subAgents.length > 0 && (
        <SubAgentPanel
          agents={subAgents.map((a) => ({
            id: a.id,
            role: a.role,
            status: a.status === 'done' ? 'complete' : a.status === 'failed' ? 'error' : a.status,
            name: a.name,
          }))}
        />
      )}

      {/* Messages list — scrollable */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4 honeycomb-bg"
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
      >
        {/* Workspace Home — shown when entering a workspace with no messages */}
        {showWorkspaceHome && (
          <div className="max-w-2xl mx-auto py-8 space-y-6">
            {/* Wave 3.1: Time-aware greeting — prominent, above everything */}
            {workspaceContext.greeting && workspaceContext.stats.memoryCount > 0 && (
              <div className="text-lg font-medium" style={{ color: 'var(--honey-500)' }}>
                {workspaceContext.greeting}
              </div>
            )}
            {/* Fallback for workspaces without greeting (e.g. no memories yet) */}
            {!workspaceContext.greeting && workspaceContext.stats.memoryCount > 0 && workspaceContext.stats.sessionCount > 1 && (
              <div className="text-sm text-muted-foreground">
                Welcome back — here's where things stand.
              </div>
            )}

            {/* Wave 3.1: Pending tasks — compact list with status icons */}
            {workspaceContext.pendingTasks && workspaceContext.pendingTasks.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold text-foreground">Pending</h3>
                {workspaceContext.pendingTasks.slice(0, 5).map((task, i) => (
                  <div key={`pt-${i}`} className="flex items-start gap-2 bg-card border border-border rounded-lg px-4 py-2">
                    <span className="shrink-0" style={{ color: 'var(--honey-500)' }}>{'\u25CB'}</span>
                    <span className="text-sm text-foreground leading-relaxed flex-1">{task}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Wave 3.1: Upcoming schedules */}
            {workspaceContext.upcomingSchedules && workspaceContext.upcomingSchedules.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {workspaceContext.upcomingSchedules.map((schedule, i) => (
                  <div key={`us-${i}`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/50 border border-border rounded-full px-3 py-1">
                    <span style={{ color: 'var(--honey-400)' }}>{'\u23F0'}</span>
                    <span>Upcoming: {schedule}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-muted-foreground/40">
                <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
                  <path d="M24 4L6 14v20l18 10 18-10V14L24 4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" opacity="0.3"/>
                  <path d="M24 14l-10 6v12l10 6 10-6V20l-10-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" opacity="0.6"/>
                  <circle cx="24" cy="26" r="3" fill="currentColor" opacity="0.4"/>
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-foreground">{workspaceContext.workspace.name}</h2>
              {workspaceContext.workspace.group && (
                <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">{workspaceContext.workspace.group}</span>
              )}
              <div className="text-sm text-muted-foreground">
                {workspaceContext.stats.memoryCount > 0
                  ? `Your agent knows ${workspaceContext.stats.memoryCount} things · ${workspaceContext.stats.sessionCount} sessions${workspaceContext.stats.fileCount ? ` · ${workspaceContext.stats.fileCount} files` : ''}`
                  : 'Ready for your first conversation'}
                {workspaceContext.workspace.model && ` · ${workspaceContext.workspace.model}`}
              </div>
              {workspaceContext.stats.sessionCount > 1 && workspaceContext.lastActive && (
                <div className="text-xs text-muted-foreground/60">
                  Last active: {formatRelativeTime(workspaceContext.lastActive)}
                </div>
              )}
            </div>

            {/* Summary */}
            {workspaceContext.summary && (
              <div className="text-sm text-foreground leading-relaxed bg-card border border-border rounded-lg p-4">
                {workspaceContext.summary}
              </div>
            )}

            {/* Cross-workspace hints — Wave 6.5 */}
            {workspaceContext.crossWorkspaceHints && workspaceContext.crossWorkspaceHints.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  Cross-workspace
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {workspaceContext.crossWorkspaceHints.map((hint, i) => (
                    <div
                      key={i}
                      className="text-[11px] text-muted-foreground bg-card border border-border rounded-md px-2.5 py-1.5 leading-relaxed"
                    >
                      {hint}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pinned messages — Wave 5.2 */}
            {workspaceContext.pinnedItems && workspaceContext.pinnedItems.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <span>{'\uD83D\uDCCC'}</span> Pinned
                </h3>
                {workspaceContext.pinnedItems.slice(0, 5).map((pin) => (
                  <div key={pin.id} className="flex items-start gap-2 bg-card border border-border rounded-lg px-4 py-2">
                    <span className="shrink-0 text-xs" style={{ color: 'var(--honey-500)' }}>
                      {pin.messageRole === 'assistant' ? '\u2B21' : '\u25CB'}
                    </span>
                    <span className="text-sm text-foreground leading-relaxed flex-1 line-clamp-2">
                      {pin.messageContent.length > 100
                        ? pin.messageContent.slice(0, 100) + '...'
                        : pin.messageContent}
                    </span>
                    {/* W7.4: Draft/Final status badge */}
                    {pin.status && (
                      <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        pin.status === 'final'
                          ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      }`}>
                        {pin.status === 'final' ? 'Final' : 'Draft'}
                      </span>
                    )}
                    {pin.label && (
                      <span className="shrink-0 text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{pin.label}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Recent decisions */}
            {workspaceContext.recentDecisions?.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Recent decisions</h3>
                <div className="space-y-1.5">
                  {workspaceContext.recentDecisions.slice(0, 3).map((decision, i) => (
                    <div key={i} className="flex items-start gap-2 bg-card border border-border rounded-lg px-4 py-2.5">
                      <span className="text-sm text-foreground leading-relaxed flex-1">{decision.content}</span>
                      <span className="text-xs text-muted-foreground/60 shrink-0">{decision.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Progress items — tasks, completions, blockers */}
            {workspaceContext.progressItems && workspaceContext.progressItems.length > 0 && (
              <div className="space-y-3">
                {workspaceContext.progressItems.some(p => p.type === 'blocker') && (
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-semibold text-destructive">Blockers</h3>
                    {workspaceContext.progressItems.filter(p => p.type === 'blocker').slice(0, 3).map((item, i) => (
                      <div key={`b-${i}`} className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2.5">
                        <span className="text-destructive shrink-0" title="Blocker">{'\u25A0'}</span>
                        <span className="text-sm text-foreground leading-relaxed flex-1">{item.content}</span>
                        <span className="text-xs text-muted-foreground/60 shrink-0">{item.date}</span>
                      </div>
                    ))}
                  </div>
                )}
                {workspaceContext.progressItems.some(p => p.type === 'task') && (
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-semibold text-foreground">Open items</h3>
                    {workspaceContext.progressItems.filter(p => p.type === 'task').slice(0, 3).map((item, i) => (
                      <div key={`t-${i}`} className="flex items-start gap-2 bg-card border border-border rounded-lg px-4 py-2.5">
                        <span className="text-muted-foreground shrink-0" title="Task">{'\u25CB'}</span>
                        <span className="text-sm text-foreground leading-relaxed flex-1">{item.content}</span>
                        <span className="text-xs text-muted-foreground/60 shrink-0">{item.date}</span>
                      </div>
                    ))}
                  </div>
                )}
                {workspaceContext.progressItems.some(p => p.type === 'completed') && (
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-semibold text-green-500">Recently completed</h3>
                    {workspaceContext.progressItems.filter(p => p.type === 'completed').slice(0, 3).map((item, i) => (
                      <div key={`c-${i}`} className="flex items-start gap-2 bg-card border border-border rounded-lg px-4 py-2.5 opacity-70">
                        <span className="text-green-500 shrink-0" title="Done">{'\u25CF'}</span>
                        <span className="text-sm text-foreground leading-relaxed flex-1">{item.content}</span>
                        <span className="text-xs text-muted-foreground/60 shrink-0">{item.date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Recent threads */}
            {workspaceContext.recentThreads.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold text-foreground">Recent threads</h3>
                {workspaceContext.recentThreads.slice(0, 3).map(thread => (
                  <div
                    key={thread.id}
                    className={`bg-card border border-border rounded-lg px-4 py-2.5 text-sm text-foreground ${onThreadSelect ? 'cursor-pointer hover:border-primary/30 transition-colors' : ''}`}
                    onClick={onThreadSelect ? () => onThreadSelect(thread.id) : undefined}
                  >
                    {thread.title}
                  </div>
                ))}
              </div>
            )}

            {/* Key memories */}
            {workspaceContext.recentMemories?.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold text-foreground">Key memories</h3>
                {workspaceContext.recentMemories.slice(0, 3).map((memory, i) => (
                  <div key={i} className="flex items-start gap-2 bg-card border border-border rounded-lg px-4 py-2.5">
                    <span className={`shrink-0 ${memory.importance === 'critical' ? 'text-primary' : memory.importance === 'important' ? 'text-primary/60' : 'text-muted-foreground'}`}>
                      {memory.importance === 'critical' ? '\u25C6' : memory.importance === 'important' ? '\u25C7' : '\u25CB'}
                    </span>
                    <span className="text-sm text-foreground leading-relaxed">{memory.content}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Onboarding hints — shown only for empty workspaces */}
            {workspaceContext.stats.memoryCount === 0 && workspaceContext.recentThreads.length === 0 && (
              <div className="space-y-2 bg-card border border-border rounded-lg p-4">
                {[
                  ['Conversations build ', <strong key="m">memory</strong>, ' — your agent gets smarter over time'],
                  ['Each workspace has its own context, decisions, and history'],
                  ['Start a conversation below to begin'],
                ].map((parts, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="text-primary/40">{'\u25C8'}</span>
                    <span>{parts}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Agent capabilities — shown for all workspaces */}
            <details className="bg-card border border-border rounded-lg overflow-hidden">
              <summary className="px-4 py-3 text-sm font-medium text-foreground cursor-pointer hover:bg-secondary/50 flex items-center gap-2">
                <span className="text-primary/60">{'\u2B21'}</span>
                What your agent can do
              </summary>
              <div className="px-4 pb-3 space-y-1.5">
                {[
                  'Search the web (works immediately, no setup needed)',
                  'Create Word documents (.docx) with professional formatting',
                  'Read, write, and edit files in your workspace',
                  'Run shell commands (sandboxed)',
                  '22 workflow commands \u2014 type / to discover them',
                  'Remember everything across sessions automatically',
                  'Schedule recurring tasks',
                  'Install new skills from the marketplace',
                  'Learn new skills from your workflow patterns (the agent teaches itself)',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-primary/30">{'\u2022'}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </details>

            {/* Quick Actions — clickable slash command pills */}
            <div className="space-y-2 pt-2">
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  { icon: '\uD83D\uDD0D', label: 'Research', cmd: '/research ' },
                  { icon: '\uD83D\uDCDD', label: 'Draft', cmd: '/draft ' },
                  { icon: '\uD83D\uDCCB', label: 'Plan', cmd: '/plan ' },
                  { icon: '\uD83D\uDD04', label: 'Review', cmd: '/review' },
                  { icon: '\u2600\uFE0F', label: 'Catch Up', cmd: '/catchup' },
                ].map((action) => (
                  <button
                    key={action.cmd}
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium cursor-pointer disabled:opacity-50 transition-all duration-150"
                    style={{
                      backgroundColor: 'var(--hive-800)',
                      border: '1px solid var(--hive-700)',
                      color: 'var(--hive-200)',
                    }}
                    onClick={() => onSendMessage(action.cmd.trim())}
                    disabled={isLoading}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--honey-500)';
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--hive-750, var(--hive-800))';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'var(--hive-700)';
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--hive-800)';
                    }}
                  >
                    <span>{action.icon}</span>
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-center" style={{ color: 'var(--hive-500)' }}>
                Or ask: &quot;Create a workflow that...&quot; to build custom multi-agent workflows
              </p>
              <p className="text-[11px] text-center italic text-muted-foreground">
                Multi-agent workflows available: Research Team (3 agents), Review Pair (writer + reviewer), Plan &amp; Execute. Try <span style={{ color: 'var(--honey-500)' }}>/research</span>, <span style={{ color: 'var(--honey-500)' }}>/draft</span>, or <span style={{ color: 'var(--honey-500)' }}>/plan</span>.
              </p>
            </div>

            {/* Wave 4.1: Connect Your Apps banner — Composio app connector visibility */}
            <div
              className="rounded-lg p-4 space-y-2"
              style={{
                backgroundColor: 'var(--hive-850)',
                border: '1px dashed var(--hive-600)',
              }}
            >
              <h3 className="text-sm font-semibold text-foreground">{'\uD83D\uDD17'} Connect Your Apps</h3>
              <p className="text-xs text-muted-foreground">
                Link GitHub, Slack, Notion, Google, Jira and 250+ more via Composio
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { emoji: '\uD83D\uDC19', name: 'GitHub' },
                  { emoji: '\uD83D\uDCAC', name: 'Slack' },
                  { emoji: '\uD83D\uDCDD', name: 'Notion' },
                  { emoji: '\uD83D\uDCC5', name: 'Google' },
                  { emoji: '\uD83D\uDD27', name: 'Jira' },
                  { emoji: '\uD83D\uDCCA', name: 'Salesforce' },
                  { emoji: '\uD83D\uDCE7', name: 'Gmail' },
                  { emoji: '\u2728', name: '250+ more' },
                ].map((svc) => (
                  <span
                    key={svc.name}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: 'var(--hive-800)',
                      border: '1px solid var(--hive-700)',
                      color: 'var(--hive-300)',
                    }}
                  >
                    <span>{svc.emoji}</span>
                    <span>{svc.name}</span>
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Set up in <span className="font-medium" style={{ color: 'var(--honey-500)' }}>Settings &gt; Keys &amp; Connections</span>
              </p>
            </div>

            {/* Slash command & search tip */}
            <div className="text-xs text-muted-foreground/60 text-center pt-2">
              Type <kbd className="px-1.5 py-0.5 rounded bg-secondary text-foreground text-[10px]">/</kbd> for workflows · <kbd className="px-1.5 py-0.5 rounded bg-secondary text-foreground text-[10px]">Ctrl+K</kbd> to search
            </div>

            {/* Template-specific starter cards — shown when workspace has a matching template */}
            {workspaceContext.workspace.templateId && TEMPLATE_STARTERS[workspaceContext.workspace.templateId] && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Quick start</h3>
                <div className="flex flex-wrap gap-3">
                  {TEMPLATE_STARTERS[workspaceContext.workspace.templateId]!.map((card) => (
                    <button
                      key={card.cmd}
                      className="flex flex-col items-start gap-1 px-4 py-3 rounded-xl text-sm text-left cursor-pointer disabled:opacity-50 transition-all duration-200 waggle-card-lift min-w-[160px] flex-1"
                      style={{
                        backgroundColor: 'var(--hive-850)',
                        border: '1px solid var(--hive-700)',
                      }}
                      onClick={() => onSendMessage(card.cmd.trim())}
                      disabled={isLoading}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--honey-500)';
                        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-honey)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--hive-700)';
                        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                      }}
                    >
                      <span className="font-medium" style={{ color: 'var(--hive-100)' }}>{card.label}</span>
                      <span className="text-[12px]" style={{ color: 'var(--hive-500)' }}>{card.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested prompts — clickable chips */}
            <div className="flex flex-wrap gap-2 pt-2">
              {workspaceContext.suggestedPrompts.map((prompt, i) => (
                <button
                  key={i}
                  className="px-3 py-1.5 text-sm bg-card border border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors cursor-pointer disabled:opacity-50"
                  onClick={() => onSendMessage(prompt)}
                  disabled={isLoading}
                >
                  {prompt}
                </button>
              ))}
              {(!workspaceContext.suggestedPrompts || workspaceContext.suggestedPrompts.length === 0) && (
                <>{['What do you remember about this project?', 'Research a topic for me', 'Help me create a plan', 'Draft a document'].map((prompt, i) => (
                  <button
                    key={`fb-${i}`}
                    type="button"
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                    onClick={() => onSendMessage(prompt)}
                    disabled={isLoading}
                  >
                    {prompt}
                  </button>
                ))}</>
              )}
            </div>
          </div>
        )}

        {/* Offline / echo-mode indicator — shown when last assistant message indicates no LLM */}
        {messages.length > 0 &&
          messages[messages.length - 1]?.role === 'assistant' &&
          messages[messages.length - 1]?.content?.includes('running in local mode') && (
          <div className="px-4 py-2 bg-amber-950/30 border-b border-amber-600/20 text-xs text-amber-400 text-center">
            Agent is in offline mode — LLM unavailable. Check your API key in Settings &gt; Keys &amp; Connections.
          </div>
        )}

        {/* Workspace Overview toggle — shown when messages exist and context available */}
        {messages.length > 0 && workspaceContext && (
          <button
            type="button"
            onClick={() => setShowOverview(prev => !prev)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground px-3 py-1.5 transition-colors"
          >
            <span>{showOverview ? '\u25BC' : '\u25B6'}</span>
            <span>Workspace Overview</span>
            {workspaceContext.stats.memoryCount > 0 && (
              <span className="text-primary/40">({workspaceContext.stats.memoryCount} memories)</span>
            )}
          </button>
        )}

        {/* Hive empty state — bee mascot + starter honeycomb cards */}
        {messages.length === 0 && !workspaceContext && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            {/* Architect bee mascot with float animation — uses dark variant, theme switching handled at app level */}
            <img
              src="/brand/bee-orchestrator-dark.png"
              alt="Waggle"
              className="w-[140px] h-[140px] float opacity-90 bee-image-orchestrator"
            />

            <div className="space-y-2">
              <h2 className="text-2xl font-semibold" style={{ color: 'var(--hive-100)' }}>
                {workspaceName || 'What are you working on?'}
              </h2>
              <p className="text-sm" style={{ color: 'var(--hive-400)' }}>
                Type a message or pick a starting point below
              </p>
            </div>

            {/* Starter honeycomb cards */}
            <div className="flex flex-wrap justify-center gap-3 pt-2 max-w-xl">
              {[
                { icon: '\uD83D\uDD0D', title: 'Research', desc: 'a topic', cmd: '/research ' },
                { icon: '\uD83D\uDCDD', title: 'Draft', desc: 'a document', cmd: '/draft ' },
                { icon: '\uD83D\uDCCB', title: 'Plan', desc: 'a project', cmd: '/plan ' },
              ].map((card) => (
                <button
                  key={card.cmd}
                  className="flex flex-col items-center gap-1.5 px-5 py-4 rounded-xl text-sm cursor-pointer disabled:opacity-50 transition-all duration-200 waggle-card-lift min-w-[140px]"
                  style={{
                    backgroundColor: 'var(--hive-850)',
                    border: '1px solid var(--hive-700)',
                  }}
                  onClick={() => onSendMessage(card.cmd.trim())}
                  disabled={isLoading}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--honey-500)';
                    (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-honey)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--hive-700)';
                    (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  }}
                >
                  <span className="text-2xl">{card.icon}</span>
                  <span className="font-medium" style={{ color: 'var(--hive-100)' }}>{card.title}</span>
                  <span className="text-[12px]" style={{ color: 'var(--hive-500)' }}>{card.desc}</span>
                </button>
              ))}
            </div>

            <p className="text-[12px]" style={{ color: 'var(--hive-500)' }}>
              or type anything to start
            </p>
          </div>
        )}
        {messages.map((msg, index) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            messageIndex={index}
            sessionId={sessionId}
            onToolApprove={onToolApprove}
            onToolDeny={onToolDeny}
            onFeedback={onFeedback ? (rating, reason, detail) => onFeedback(index, rating, reason, detail) : undefined}
          />
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 px-4 py-3" role="status" aria-label="Agent is thinking">
            <span className="text-[10px] animate-bounce" style={{ color: 'var(--honey-500)' }}>⬡</span>
            <span className="text-[10px] animate-bounce [animation-delay:150ms]" style={{ color: 'var(--honey-400)' }}>⬡</span>
            <span className="text-[10px] animate-bounce [animation-delay:300ms]" style={{ color: 'var(--honey-300)' }}>⬡</span>
          </div>
        )}
      </div>

      {/* IMP-14: Subtle follow-up hint when conversation has messages but agent is idle */}
      {messages.length > 0 && !isLoading && !showWorkspaceHome && (
        <div className="px-4 py-2 text-center">
          <p className="text-[11px] italic" style={{ color: 'var(--hive-400)' }}>
            Ask a follow-up, try <span style={{ color: 'var(--honey-500)' }}>/help</span> for commands, or start a new topic
          </p>
        </div>
      )}

      {/* Sub-agent progress panel — above input, hidden when no agents */}
      <SubAgentProgress agents={subAgents ?? []} />

      {/* Input */}
      <ChatInput
        onSubmit={onSendMessage}
        onSlashCommand={onSlashCommand}
        onFileSelect={onFileSelect}
        disabled={isLoading}
        placeholder={showWorkspaceHome ? 'Ask what matters here, continue a task, or draft something...' : 'Type a message... (/ for commands)'}
        commands={mergedCommands}
      />
    </div>
  );
}

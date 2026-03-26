/**
 * ContextPanel — Right panel showing contextual content based on current view.
 *
 * Chat view: SessionList + optional document preview
 * Memory view: FrameDetail (selected frame)
 * Capabilities view: installed packs + marketplace placeholder
 * Cockpit view: quick actions
 * Events view: filter checkboxes + stats
 * Settings view: contextual help per tab
 */

import { useState, useCallback } from 'react';
import type { Session, SessionSearchResult, Frame, FileEntry, TeamMember, ActivityItem, TeamMessage } from '@waggle/ui';
import { SessionList, FrameDetail, FilePreview, TeamPresence, ActivityFeed, TeamMessages } from '@waggle/ui';

type AppView = 'chat' | 'memory' | 'events' | 'capabilities' | 'cockpit' | 'mission-control' | 'settings';

/** Model badge color mapping — matches ChatInput.tsx MODEL_COLORS */
function getModelBadgeColor(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  if (lower.includes('sonnet')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (lower.includes('haiku')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (lower.includes('gpt')) return 'bg-teal-500/20 text-teal-400 border-teal-500/30';
  if (lower.includes('gemini')) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  return 'bg-secondary text-muted-foreground border-border';
}

/** E5: Workspace info for the persistent context card at top of every panel view */
export interface WorkspaceInfo {
  name: string;
  group?: string;
  model?: string;
  memoryCount: number;
  sessionCount: number;
  lastActive?: string;
  /** Budget status for workspace cost tracking */
  budget?: number | null;
  budgetUsed?: number;
  /** Whether an agent is currently active for this workspace */
  agentActive?: boolean;
}

export interface ContextPanelProps {
  currentView: AppView;
  /** E5: Workspace info shown as persistent card at top of panel */
  workspaceInfo?: WorkspaceInfo;
  groupedSessions: Record<string, Session[]>;
  activeSessionId?: string;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  selectedFrame?: Frame;
  /** File to preview in the panel (set by agent file ops or file upload). */
  previewFile?: FileEntry | null;
  onClosePreview?: () => void;
  /** Recent memory highlights for the active workspace */
  recentMemories?: Array<{ content: string; importance: string; date: string }>;
  /** F3: Session export */
  onExportSession?: (id: string) => void;
  /** F1: Session search */
  onSearchSessions?: (query: string) => void;
  searchResults?: SessionSearchResult[] | null;
  searchLoading?: boolean;
  onClearSearch?: () => void;
  /** I4: Team presence members (shown for team workspaces) */
  teamMembers?: TeamMember[];
  /** J1: Team activity feed items */
  teamActivity?: ActivityItem[];
  teamActivityLoading?: boolean;
  /** Wave 2.4: Waggle Dance messages */
  teamMessages?: TeamMessage[];
  /** F5: Cockpit health refresh callback */
  onRefreshHealth?: () => void;
  /** F5: Active settings tab for contextual help */
  settingsTab?: string;
  /** F5: Event filter state for context panel checkboxes */
  eventFilters?: Record<string, boolean>;
  onEventFiltersChange?: (filters: Record<string, boolean>) => void;
}

/** E5: Persistent workspace context card — always at top of every panel view */
function WorkspaceContextCard({ info }: { info?: WorkspaceInfo }) {
  if (!info) return null;

  const formatLastActive = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--hive-700)', backgroundColor: 'var(--hive-800)' }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] shrink-0" style={{ color: 'var(--honey-500)' }}>⬡</span>
        <span className="text-xs font-medium truncate" style={{ color: 'var(--hive-100)' }}>{info.name}</span>
        {info.group && (
          <span className="text-[9px] text-muted-foreground/60 bg-secondary px-1.5 py-0.5 rounded shrink-0">{info.group}</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50 flex-wrap">
        {info.model && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-medium ${getModelBadgeColor(info.model)}`}>
            <span className="w-1 h-1 rounded-full bg-current opacity-60" />
            {info.model.replace('claude-', '').replace(/-4-6$/, '')}
          </span>
        )}
        {info.agentActive && (
          <span className="inline-flex items-center gap-1 text-[9px] text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Active
          </span>
        )}
        <span>{info.memoryCount} memories</span>
        <span>{info.sessionCount} sessions</span>
      </div>
      {info.budget != null && info.budget > 0 && info.budgetUsed != null && (
        <div className="mt-1">
          <div className="flex justify-between text-[9px] text-muted-foreground/40">
            <span>${info.budgetUsed.toFixed(2)} / ${info.budget.toFixed(2)}</span>
            <span>{Math.round((info.budgetUsed / info.budget) * 100)}%</span>
          </div>
          <div className="h-1 rounded-full bg-muted mt-0.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                info.budgetUsed / info.budget >= 1 ? 'bg-red-500' :
                info.budgetUsed / info.budget >= 0.8 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min((info.budgetUsed / info.budget) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
      {info.lastActive && (
        <div className="text-[9px] text-muted-foreground/30 mt-0.5">
          Active {formatLastActive(info.lastActive)}
        </div>
      )}
    </div>
  );
}

function PanelHeader({ label, action }: { label: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="px-3 py-2.5 text-[9px] font-semibold uppercase tracking-widest flex justify-between items-center" style={{ borderBottom: '1px solid var(--hive-700)', color: 'var(--hive-500)' }}>
      {label}
      {action && (
        <button
          onClick={action.onClick}
          className="bg-transparent border-none text-muted-foreground cursor-pointer text-[9px] px-1 py-0.5"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function ContextPanel({
  currentView,
  workspaceInfo,
  groupedSessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onRenameSession,
  selectedFrame,
  previewFile,
  onClosePreview,
  recentMemories,
  onExportSession,
  onSearchSessions,
  searchResults,
  searchLoading,
  onClearSearch,
  teamMembers,
  teamActivity,
  teamActivityLoading,
  teamMessages,
  onRefreshHealth,
  settingsTab,
  eventFilters,
  onEventFiltersChange,
}: ContextPanelProps) {
  if (currentView === 'chat') {
    // If there's a file to preview, show it above sessions
    if (previewFile) {
      return (
        <div className="flex flex-col h-full">
          <WorkspaceContextCard info={workspaceInfo} />
          <PanelHeader
            label="Document Preview"
            action={onClosePreview ? { label: '\u2715 Close', onClick: onClosePreview } : undefined}
          />
          <div className="flex-1 overflow-auto min-h-0">
            <FilePreview file={previewFile} />
          </div>
          <PanelHeader label="Sessions" />
          <div className="max-h-[30%] overflow-auto">
            <SessionList
              grouped={groupedSessions}
              activeSessionId={activeSessionId}
              onSelectSession={onSelectSession}
              onCreateSession={onCreateSession}
              onDeleteSession={onDeleteSession}
              onRenameSession={onRenameSession}
              onExportSession={onExportSession}
              onSearch={onSearchSessions}
              searchResults={searchResults}
              searchLoading={searchLoading}
              onClearSearch={onClearSearch}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        <WorkspaceContextCard info={workspaceInfo} />
        {recentMemories && recentMemories.length > 0 && (
          <>
            <PanelHeader label="Memory" />
            <div className="max-h-[35%] overflow-auto border-b border-border">
              {recentMemories.slice(0, 4).map((mem, i) => (
                <div key={i} className={`px-3 py-2 ${i < Math.min(recentMemories.length, 4) - 1 ? 'border-b border-white/5' : ''}`}>
                  <div className="text-[12px] text-muted-foreground leading-relaxed line-clamp-4">
                    {mem.content}
                  </div>
                  <div className="text-[9px] text-muted-foreground/40 mt-[3px] flex gap-1.5">
                    <span>{mem.date}</span>
                    {mem.importance !== 'normal' && (
                      <span className={`uppercase tracking-wider ${mem.importance === 'critical' ? 'text-destructive' : 'text-primary'}`}>
                        {mem.importance}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {/* I4: Team presence */}
        {teamMembers && teamMembers.length > 0 && (
          <>
            <PanelHeader label="Team" />
            <div className="px-3 py-2 border-b border-border">
              <TeamPresence members={teamMembers} />
            </div>
          </>
        )}
        {/* J1: Team activity feed */}
        {(teamActivity && teamActivity.length > 0 || teamActivityLoading) && (
          <>
            <PanelHeader label="Activity" />
            <div className="border-b border-border">
              <ActivityFeed items={teamActivity ?? []} loading={teamActivityLoading} />
            </div>
          </>
        )}
        {/* Wave 2.4: Waggle Dance messages */}
        {teamMessages && teamMessages.length > 0 && (
          <>
            <PanelHeader label="Messages" />
            <div className="border-b border-border">
              <TeamMessages messages={teamMessages} />
            </div>
          </>
        )}
        <PanelHeader label="Sessions" />
        <div className="flex-1 overflow-auto">
          <SessionList
            grouped={groupedSessions}
            activeSessionId={activeSessionId}
            onSelectSession={onSelectSession}
            onCreateSession={onCreateSession}
            onDeleteSession={onDeleteSession}
            onRenameSession={onRenameSession}
            onExportSession={onExportSession}
            onSearch={onSearchSessions}
            searchResults={searchResults}
            searchLoading={searchLoading}
            onClearSearch={onClearSearch}
          />
        </div>
      </div>
    );
  }

  if (currentView === 'memory' && selectedFrame) {
    return (
      <div className="flex flex-col h-full">
        <WorkspaceContextCard info={workspaceInfo} />
        <PanelHeader label="Frame Detail" />
        <div className="flex-1 overflow-auto p-2.5">
          <FrameDetail frame={selectedFrame} />
        </div>
      </div>
    );
  }

  // ── F5: Capabilities view context ──────────────────────────────────
  if (currentView === 'capabilities') {
    return (
      <div className="flex flex-col h-full">
        <WorkspaceContextCard info={workspaceInfo} />
        <CapabilitiesContext />
      </div>
    );
  }

  // ── F5: Cockpit view context ───────────────────────────────────────
  if (currentView === 'cockpit') {
    return (
      <div className="flex flex-col h-full">
        <WorkspaceContextCard info={workspaceInfo} />
        <CockpitContext onRefreshHealth={onRefreshHealth} />
      </div>
    );
  }

  // ── F5: Events view context ────────────────────────────────────────
  if (currentView === 'events') {
    return (
      <div className="flex flex-col h-full">
        <WorkspaceContextCard info={workspaceInfo} />
        <EventsContext
          filters={eventFilters}
          onFiltersChange={onEventFiltersChange}
        />
      </div>
    );
  }

  // ── W4.12: Mission Control context ─────────────────────────────────
  if (currentView === 'mission-control') {
    return (
      <div className="flex flex-col h-full">
        <WorkspaceContextCard info={workspaceInfo} />
        <PanelHeader label="Fleet Info" />
        <div className="px-3 py-3 space-y-3 text-[11px] text-muted-foreground">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Max Sessions</div>
            <div className="text-foreground font-mono">3 concurrent</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Quick Actions</div>
            <div className="space-y-1 text-[10px]">
              <div>• Pause/Resume running agents</div>
              <div>• Kill unresponsive sessions</div>
              <div>• View sub-agent results</div>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Tip</div>
            <div className="text-[10px] leading-relaxed">Use <span className="font-mono text-primary">/spawn</span> in chat to create sub-agents for parallel research tasks.</div>
          </div>
        </div>
      </div>
    );
  }

  // ── F5: Settings view context ──────────────────────────────────────
  if (currentView === 'settings') {
    return (
      <div className="flex flex-col h-full">
        <WorkspaceContextCard info={workspaceInfo} />
        <SettingsContext activeTab={settingsTab} />
      </div>
    );
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// F5: Sub-components for each view's context panel
// ═══════════════════════════════════════════════════════════════════════

// IMP-2: Distinct icons and accent colors for each capability pack
const BUILT_IN_PACKS = [
  { name: 'Research Workflow', id: 'research-workflow', icon: '🔬', color: 'bg-green-500' },
  { name: 'Writing Suite', id: 'writing-suite', icon: '✍️', color: 'bg-purple-500' },
  { name: 'Planning Master', id: 'planning-master', icon: '📋', color: 'bg-blue-500' },
  { name: 'Team Collaboration', id: 'team-collaboration', icon: '👥', color: 'bg-orange-500' },
  { name: 'Decision Framework', id: 'decision-framework', icon: '⚖️', color: 'bg-teal-500' },
];

function CapabilitiesContext() {
  return (
    <>
      <PanelHeader label="Installed" />
      <div className="px-3 py-2 border-b border-border">
        {BUILT_IN_PACKS.map((pack) => (
          <div
            key={pack.id}
            className="flex items-center gap-2 py-[5px] text-[11px] text-muted-foreground"
          >
            <span className="text-sm shrink-0">{pack.icon}</span>
            <span className="flex-1">{pack.name}</span>
            <span className="text-[9px] text-muted-foreground/40 opacity-60">
              built-in
            </span>
          </div>
        ))}
      </div>
      <PanelHeader label="Suggested" />
      <div className="p-3 text-[11px] text-muted-foreground/40 leading-relaxed">
        Browse the marketplace to discover skill packs, connectors, and templates for your workspace.
      </div>
    </>
  );
}

function CockpitContext({ onRefreshHealth }: { onRefreshHealth?: () => void }) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefreshHealth || refreshing) return;
    setRefreshing(true);
    try {
      onRefreshHealth();
    } finally {
      // Brief visual feedback then reset
      setTimeout(() => setRefreshing(false), 1000);
    }
  }, [onRefreshHealth, refreshing]);

  return (
    <>
      <PanelHeader label="Quick Actions" />
      <div className="px-3 py-2 flex flex-col gap-1.5">
        <button
          className={`w-full px-3 py-[7px] text-[11px] font-medium rounded border border-border text-left transition-colors duration-100 cursor-pointer ${
            refreshing ? 'bg-primary/20 text-primary' : 'bg-card text-muted-foreground'
          }`}
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing...' : 'Refresh Health'}
        </button>
        <button
          className="w-full px-3 py-[7px] text-[11px] font-medium rounded border border-border text-left bg-card text-muted-foreground/40 cursor-not-allowed opacity-50"
          disabled
          title="Coming soon"
        >
          Trigger Sync
        </button>
      </div>
    </>
  );
}

const EVENT_TYPES = ['Tool Call', 'Memory', 'Search', 'File', 'Response'] as const;

function EventsContext({
  filters,
  onFiltersChange,
}: {
  filters?: Record<string, boolean>;
  onFiltersChange?: (filters: Record<string, boolean>) => void;
}) {
  // Local state for checkboxes (all on by default)
  const effectiveFilters = filters ?? Object.fromEntries(EVENT_TYPES.map(t => [t, true]));

  const handleToggle = (type: string) => {
    const updated = { ...effectiveFilters, [type]: !effectiveFilters[type] };
    onFiltersChange?.(updated);
  };

  return (
    <>
      <PanelHeader label="Filter" />
      <div className="px-3 py-2 border-b border-border">
        {EVENT_TYPES.map((type) => (
          <label
            key={type}
            className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground cursor-pointer"
          >
            <input
              type="checkbox"
              checked={effectiveFilters[type] !== false}
              onChange={() => handleToggle(type)}
              className="w-[13px] h-[13px] cursor-pointer accent-primary"
            />
            {type}
          </label>
        ))}
      </div>
      <PanelHeader label="Stats" />
      <div className="p-3 text-[11px] text-muted-foreground/40 leading-loose">
        <div>Event statistics available during active agent sessions.</div>
      </div>
    </>
  );
}

const SETTINGS_HELP: Record<string, string> = {
  general: 'Configure appearance and startup behavior.',
  models: 'Set your default AI model and API keys.',
  vault: 'Manage encrypted credentials for connectors.',
  permissions: 'Control what the agent can do without asking.',
  team: 'Connect to your team server.',
  advanced: 'Data management and debugging.',
};

function SettingsContext({ activeTab }: { activeTab?: string }) {
  const tab = activeTab ?? 'general';
  const help = SETTINGS_HELP[tab] ?? SETTINGS_HELP.general;
  const tabName = tab.charAt(0).toUpperCase() + tab.slice(1);

  return (
    <>
      <PanelHeader label="Help" />
      <div className="p-3">
        <div className="text-xs font-semibold text-foreground mb-1.5">
          {tabName}
        </div>
        <div className="text-[11px] text-muted-foreground leading-relaxed">
          {help}
        </div>
      </div>
      <PanelHeader label="All Sections" />
      <div className="px-3 py-2">
        {Object.entries(SETTINGS_HELP).map(([key, desc]) => (
          <div
            key={key}
            className={`py-[5px] text-[11px] pl-2 border-l-2 transition-all duration-100 ${
              key === tab ? 'text-primary border-l-primary' : 'text-muted-foreground/40 border-l-transparent'
            }`}
          >
            <div className={key === tab ? 'font-semibold' : 'font-normal'}>
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </div>
            <div className="text-[9px] text-muted-foreground/40 opacity-70 mt-px">
              {desc}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

import { useState } from 'react';
import { Brain, Clock, Network, Download, Activity, BookOpen, Sparkles, User, Briefcase, ShieldCheck, SlidersHorizontal, ChevronDown } from 'lucide-react';
import type { KGNode, KGEdge } from '@/lib/types';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { cn } from '@/lib/utils';
import MemoryTrust from './MemoryTrust';
import KnowledgeGraphViewer from './memory/KnowledgeGraphViewer';
import HarvestTab from './memory/HarvestTab';
import WeaverPanel from './memory/WeaverPanel';
import WikiTab from './memory/WikiTab';
import EvolutionTab from './memory/EvolutionTab';
import MemoryCenterTab from './memory/MemoryCenterTab';
import TimelineTab, { type TimelineTabProps } from './memory/TimelineTab';
import ImportReminderBanner from './memory/ImportReminderBanner';
import { useOnboarding } from '@/hooks/useOnboarding';

/**
 * Memory Center (P3/D2) — the standalone memory surface (ArtifactCenterApp
 * shape: thin route wrapper + self-contained app component).
 *
 * Top-level structure is the ratified TWO-MIND SPLIT: "About you" reads the
 * Personal Mind; "About this work" reads the active workspace's Mind. The
 * per-mind list is MemoryCenterTab (reused, parameterized — D2). The legacy
 * MemoryApp views (Timeline / Graph / Harvest / Weaver / Wiki / Evolution)
 * survive as secondary tabs after a divider — capability preserved, entry
 * restructured. Mind pills render only on the Memories tab: the legacy tabs
 * keep their own scoping (Graph has a scope selector; Harvest writes to the
 * personal mind by design).
 *
 * Controlled component (the ratified WorkspaceDesktopApp two-seam pattern):
 * the route owns mind + view via URL (`/memory/:mindScope?` + `?tab=`); this
 * component only renders and reports intent via onMindChange/onViewChange.
 */

export type MindScope = 'personal' | 'workspace';
export type MemoryView = 'trust' | 'memories' | 'timeline' | 'graph' | 'harvest' | 'weaver' | 'wiki' | 'evolution';

// PR3.5: 'trust' (screen 19) is the new PRIMARY front door — first + default;
// the legacy views demote to secondary (after the divider).
export const MEMORY_VIEWS: readonly MemoryView[] = [
  'trust', 'memories', 'timeline', 'graph', 'harvest', 'weaver', 'wiki', 'evolution',
];

interface MemoryTabDef {
  id: MemoryView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
}

// UX gold-standard H1: 8 equal-weight tabs regrouped into 4 primary + an
// "Advanced" flyout (display-level IA only — every view id, route and
// ?tab= deep-link is unchanged; MEMORY_VIEWS still validates all 8).
const PRIMARY_TABS: MemoryTabDef[] = [
  { id: 'trust', label: 'Trust', icon: ShieldCheck, tooltip: 'Memory Trust — confidence & freshness, forget / correct / confirm, and "why did you do that?"' },
  { id: 'memories', label: 'Memories', icon: Brain, tooltip: 'Memory Center — inspect, edit, review, merge' },
  { id: 'timeline', label: 'Timeline', icon: Clock, tooltip: 'Chronological frame list' },
  { id: 'graph', label: 'Graph', icon: Network, tooltip: 'Knowledge Graph — entities and relations' },
];

const ADVANCED_TABS: MemoryTabDef[] = [
  { id: 'harvest', label: 'Imports', icon: Download, tooltip: 'Import conversations from other AIs' },
  { id: 'weaver', label: 'Maintenance', icon: Activity, tooltip: 'Memory distillation and consolidation' },
  { id: 'wiki', label: 'Wiki', icon: BookOpen, tooltip: 'Compiled knowledge pages' },
  { id: 'evolution', label: 'Improvements', icon: Sparkles, tooltip: 'Self-evolving prompts and agents' },
];

export interface MemoryCenterAppProps {
  mind: MindScope;
  onMindChange: (mind: MindScope) => void;
  view: MemoryView;
  onViewChange: (view: MemoryView) => void;
  /** Active workspace — powers the "About this work" mind. Absent → pill disabled. */
  workspaceId?: string;
  workspaceName?: string;
  /** Legacy Timeline tab pass-through (useMemory hook surface, via the route). */
  timeline: TimelineTabProps;
  /** Legacy Graph tab pass-through (useKnowledgeGraph hook surface). */
  knowledgeGraph?: { nodes: KGNode[]; edges: KGEdge[] };
  onRefreshKG?: () => void;
  kgScope?: 'current' | 'personal' | 'all';
  onKGScopeChange?: (scope: 'current' | 'personal' | 'all') => void;
  kgLoading?: boolean;
  kgError?: string | null;
  onContextRail?: (target: { type: 'frame' | 'entity'; id: string; label: string }) => void;
}

const MemoryCenterApp = ({
  mind, onMindChange, view, onViewChange, workspaceId, workspaceName,
  timeline, knowledgeGraph, onRefreshKG, kgScope, onKGScopeChange,
  kgLoading = false, kgError = null, onContextRail,
}: MemoryCenterAppProps) => {
  // Reminder-banner eligibility (carried over from the retired MemoryApp shell).
  const { state: onboardingState } = useOnboarding();

  // Advanced flyout (display-level IA regroup): open state + active child.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const activeAdvanced = ADVANCED_TABS.find((t) => t.id === view);

  return (
    <div className="flex flex-col h-full" data-testid="memory-center-app">
      <ImportReminderBanner
        onboardingCompleted={onboardingState.completed}
        totalFrameCount={timeline.stats.total}
        onOpenHarvest={() => onViewChange('harvest')}
      />

      {/* Tab bar + mind scope — Wave T Lane D (item 4): the memory surface stacked
          THREE control tiers (tabs · mind pills · the Trust Manage/Why switch).
          Fold the weakest full-width tier — the mind pills — up onto the tab-bar
          row as a right-aligned scope control, so the surface reads as two tiers,
          not three. Every destination is preserved; only the chrome collapses. */}
      <div className="flex flex-wrap items-center gap-y-1 border-b border-border/50 bg-background/60">
        <div role="tablist" aria-label="Memory views" className="flex items-center">
        {PRIMARY_TABS.map((tab, i) => {
          const Icon = tab.icon;
          const active = view === tab.id;
          return (
            <div key={tab.id} className="flex items-center">
              {i === 1 && <div className="w-px h-4 bg-border/60 mx-1" aria-hidden="true" />}
              <HintTooltip content={tab.tooltip}>
                <button
                  role="tab"
                  onClick={() => onViewChange(tab.id)}
                  aria-selected={active}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-display border-b-2 transition-colors',
                    active
                      ? 'border-primary text-honey bg-primary/5'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              </HintTooltip>
            </div>
          );
        })}

        {/* Advanced — a flyout tab holding the maintenance/import views. The
            trigger names the active child (e.g. "Advanced: Imports") so a
            deep-linked ?tab=harvest never looks like no tab is selected. */}
        <div className="flex items-center">
          <div className="w-px h-4 bg-border/60 mx-1" aria-hidden="true" />
          <div className="relative">
            <HintTooltip content="Imports, maintenance, wiki, and improvements">
              <button
                role="tab"
                onClick={() => setAdvancedOpen(o => !o)}
                aria-selected={!!activeAdvanced}
                aria-haspopup="menu"
                aria-expanded={advancedOpen}
                data-testid="memory-tab-advanced"
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-display border-b-2 transition-colors',
                  activeAdvanced
                    ? 'border-primary text-honey bg-primary/5'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30',
                )}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>{activeAdvanced ? `Advanced: ${activeAdvanced.label}` : 'Advanced'}</span>
                <ChevronDown className={cn('w-3 h-3 transition-transform', advancedOpen && 'rotate-180')} />
              </button>
            </HintTooltip>
            {advancedOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAdvancedOpen(false)} />
                <div
                  role="menu"
                  aria-label="Advanced memory views"
                  data-testid="memory-tab-advanced-menu"
                  className="absolute left-0 top-full mt-1 z-50 w-56 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
                >
                  {ADVANCED_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const active = view === tab.id;
                    return (
                      <button
                        key={tab.id}
                        role="menuitem"
                        onClick={() => { onViewChange(tab.id); setAdvancedOpen(false); }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors',
                          active ? 'text-honey bg-primary/5' : 'text-foreground hover:bg-muted/50',
                        )}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-display">{tab.label}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{tab.tooltip}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        </div>

        {/* Mind pills — folded onto the tab row (Wave T Lane D item 4). Only on
            the Trust/Memories views (D2 two-mind split). The workspace pill is
            never pressed AND disabled at once: without a workspace there is no
            workspace mind to be "on", even if the URL says /memory/workspace (the
            list shows the no-workspace hint instead). */}
        {(view === 'memories' || view === 'trust') && (
        <div role="group" aria-label="Which mind to show" className="ml-auto flex items-center gap-1.5 border-l border-border/40 px-2.5 py-1.5">
          <button
            onClick={() => onMindChange('personal')}
            aria-pressed={mind === 'personal'}
            data-testid="memory-mind-personal"
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-display transition-colors border',
              mind === 'personal'
                ? 'border-primary/40 bg-primary/15 text-honey'
                : 'border-transparent bg-muted/50 text-muted-foreground hover:text-foreground',
            )}
          >
            <User className="w-3 h-3" /> About you
          </button>
          <HintTooltip content={workspaceId ? `What this workspace has learned` : 'Open a workspace first — Home is the workspace selector'}>
            <button
              onClick={() => workspaceId && onMindChange('workspace')}
              aria-pressed={mind === 'workspace' && !!workspaceId}
              aria-disabled={!workspaceId}
              data-testid="memory-mind-workspace"
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-display transition-colors border',
                !workspaceId && 'opacity-50 cursor-not-allowed',
                mind === 'workspace' && workspaceId
                  ? 'border-primary/40 bg-primary/15 text-honey'
                  : 'border-transparent bg-muted/50 text-muted-foreground hover:text-foreground',
              )}
            >
              <Briefcase className="w-3 h-3" /> About this work{workspaceName ? ` · ${workspaceName}` : ''}
            </button>
          </HintTooltip>
        </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {view === 'trust' ? (
          <MemoryTrust mind={mind} workspaceId={workspaceId} />
        ) : view === 'memories' ? (
          <MemoryCenterTab mind={mind} workspaceId={workspaceId} />
        ) : view === 'timeline' ? (
          <TimelineTab {...timeline} onContextRail={onContextRail} />
        ) : view === 'graph' ? (
          <KnowledgeGraphViewer nodes={knowledgeGraph?.nodes || []} edges={knowledgeGraph?.edges || []}
            scope={kgScope} onScopeChange={onKGScopeChange}
            loading={kgLoading} error={kgError} onRetry={onRefreshKG}
            onNodeClick={(nodeId) => {
              const node = knowledgeGraph?.nodes.find(n => n.id === nodeId);
              if (node && onContextRail) onContextRail({ type: 'entity', id: nodeId, label: node.label ?? nodeId });
            }} />
        ) : view === 'harvest' ? (
          <HarvestTab />
        ) : view === 'weaver' ? (
          <WeaverPanel />
        ) : view === 'wiki' ? (
          <WikiTab />
        ) : (
          <EvolutionTab />
        )}
      </div>
    </div>
  );
};

export default MemoryCenterApp;

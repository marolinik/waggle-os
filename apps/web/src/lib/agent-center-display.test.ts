/**
 * Phase 3B (S09) — Agent Center display vocabulary.
 *  - §14.5: every AgentRunState renders a badge label + tone (exhaustive).
 *  - C22: tab filtering incl. the archive split.
 *  - C27: KPI math keeps success-rate, has no "hours saved".
 *  - C23: the workspace_ambiguous error shape detector.
 */
import { describe, it, expect } from 'vitest';
import { AGENT_RUN_STATES } from '@waggle/shared';
import type { Agent } from '@/lib/types';
import {
  AGENT_STATE_META,
  AGENT_CENTER_TABS,
  filterAgentsByTab,
  formatSuccessRate,
  formatRelativeTime,
  agentKpis,
  workspaceAmbiguityIds,
  shouldSuggestAgents,
  SUGGESTED_PERSONA_IDS,
  type AgentCenterTab,
} from './agent-center-display';

function makeAgent(over: Partial<Agent> = {}): Agent {
  return {
    id: 'a1', name: 'Scout', goal: 'Research things', type: 'personal',
    model: 'auto', autonomyLevel: 'guided', memoryScopes: ['personal'],
    status: 'idle', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
    ...over,
  };
}

describe('AGENT_STATE_META — §14.5 full vocabulary', () => {
  it('maps every shared AgentRunState to a non-empty label and tone', () => {
    for (const state of AGENT_RUN_STATES) {
      const meta = AGENT_STATE_META[state];
      expect(meta, `missing meta for ${state}`).toBeDefined();
      expect(meta.label.length).toBeGreaterThan(0);
      expect(['healthy', 'attention', 'risk', 'info', 'neutral']).toContain(meta.tone);
    }
  });

  it('uses human labels for the multi-word states', () => {
    expect(AGENT_STATE_META.waiting_for_approval.label).toBe('Waiting for approval');
    expect(AGENT_STATE_META.failed.tone).toBe('risk');
    expect(AGENT_STATE_META.running.tone).toBe('info');
  });
});

describe('filterAgentsByTab — C22', () => {
  const agents = [
    makeAgent({ id: 'p', type: 'personal' }),
    makeAgent({ id: 'w', type: 'workspace' }),
    makeAgent({ id: 't', type: 'team' }),
    makeAgent({ id: 'auto', type: 'autonomous' }),
    makeAgent({ id: 'arch', type: 'personal', status: 'archived' }),
  ];

  it('declares exactly the six C22 tabs (Templates is NOT a tab)', () => {
    expect(AGENT_CENTER_TABS.map(t => t.id)).toEqual(['all', 'personal', 'workspace', 'team', 'autonomous', 'archive']);
    expect(AGENT_CENTER_TABS.some(t => t.label.toLowerCase() === 'templates')).toBe(false);
  });

  it('"all" shows live agents and hides archived ones', () => {
    expect(filterAgentsByTab(agents, 'all').map(a => a.id)).toEqual(['p', 'w', 't', 'auto']);
  });

  it('type tabs filter by AgentType (still excluding archived)', () => {
    expect(filterAgentsByTab(agents, 'workspace').map(a => a.id)).toEqual(['w']);
    expect(filterAgentsByTab(agents, 'personal').map(a => a.id)).toEqual(['p']); // arch is personal but archived
  });

  it('"archive" shows only archived agents', () => {
    expect(filterAgentsByTab(agents, 'archive').map(a => a.id)).toEqual(['arch']);
  });
});

describe('formatSuccessRate / formatRelativeTime', () => {
  it('renders 0-1 rates as percentages and absent rates as a dash', () => {
    expect(formatSuccessRate(0.834)).toBe('83%');
    expect(formatSuccessRate(0)).toBe('0%');
    expect(formatSuccessRate(1)).toBe('100%');
    expect(formatSuccessRate(undefined)).toBe('—');
  });

  it('renders compact relative times against an injected now', () => {
    const now = Date.parse('2026-06-10T12:00:00Z');
    expect(formatRelativeTime(undefined, now)).toBe('never');
    expect(formatRelativeTime('2026-06-10T11:59:30Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-06-10T11:30:00Z', now)).toBe('30m ago');
    expect(formatRelativeTime('2026-06-10T06:00:00Z', now)).toBe('6h ago');
    expect(formatRelativeTime('2026-06-07T12:00:00Z', now)).toBe('3d ago');
  });
});

describe('agentKpis — C27', () => {
  it('counts live agents + running and averages only the rated ones', () => {
    const kpis = agentKpis([
      makeAgent({ id: '1', status: 'running', successRate: 0.5 }),
      makeAgent({ id: '2', status: 'idle', successRate: 1 }),
      makeAgent({ id: '3', status: 'idle' }), // unrated — excluded from the mean
      makeAgent({ id: '4', status: 'archived', successRate: 0 }), // archived — excluded entirely
    ]);
    expect(kpis.total).toBe(3);
    expect(kpis.running).toBe(1);
    expect(kpis.avgSuccessRate).toBeCloseTo(0.75);
  });

  it('reports null (not 0) when no agent has a derived rate', () => {
    expect(agentKpis([makeAgent()]).avgSuccessRate).toBeNull();
  });

  it('exposes no "hours saved" figure (C27 — no data source)', () => {
    expect(Object.keys(agentKpis([]))).toEqual(['total', 'running', 'avgSuccessRate']);
  });
});

describe('shouldSuggestAgents — F-W5C sparse state', () => {
  const base = { loading: false, error: false, tab: 'all' as AgentCenterTab, query: '', agentCount: 0 };

  it('shows on the unfiltered "all" tab with a near-empty fleet (0-2 agents)', () => {
    expect(shouldSuggestAgents({ ...base, agentCount: 0 })).toBe(true);
    expect(shouldSuggestAgents({ ...base, agentCount: 2 })).toBe(true);
  });

  it('hides once the fleet grows past two', () => {
    expect(shouldSuggestAgents({ ...base, agentCount: 3 })).toBe(false);
  });

  it('hides while loading, errored, searching, or on a non-"all" tab', () => {
    expect(shouldSuggestAgents({ ...base, loading: true })).toBe(false);
    expect(shouldSuggestAgents({ ...base, error: true })).toBe(false);
    expect(shouldSuggestAgents({ ...base, query: 'scout' })).toBe(false);
    expect(shouldSuggestAgents({ ...base, query: '   ' })).toBe(true); // whitespace-only = no search
    expect(shouldSuggestAgents({ ...base, tab: 'workspace' })).toBe(false);
    expect(shouldSuggestAgents({ ...base, tab: 'archive' })).toBe(false);
  });

  it('curates 2-3 persona ids', () => {
    expect(SUGGESTED_PERSONA_IDS.length).toBeGreaterThanOrEqual(2);
    expect(SUGGESTED_PERSONA_IDS.length).toBeLessThanOrEqual(3);
  });
});

describe('workspaceAmbiguityIds — C23 error shape', () => {
  it('extracts workspaceIds from the 400 workspace_ambiguous body', () => {
    const err = Object.assign(new Error('runAgent failed (400): workspace_ambiguous'), {
      status: 400,
      body: { error: 'workspace_ambiguous', workspaceIds: ['ws-1', 'ws-2'] },
    });
    expect(workspaceAmbiguityIds(err)).toEqual(['ws-1', 'ws-2']);
  });

  it('returns null for other errors (different status / different body)', () => {
    expect(workspaceAmbiguityIds(new Error('boom'))).toBeNull();
    expect(workspaceAmbiguityIds(Object.assign(new Error('x'), { status: 500, body: { error: 'workspace_ambiguous' } }))).toBeNull();
    expect(workspaceAmbiguityIds(Object.assign(new Error('x'), { status: 400, body: { error: 'bad_request' } }))).toBeNull();
  });
});

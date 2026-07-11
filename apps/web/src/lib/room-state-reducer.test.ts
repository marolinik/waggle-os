/**
 * P6 regression — Room sub-agent status reducer never cross-contaminates
 * two parallel agents and correctly routes lifecycle transitions.
 */

import { describe, it, expect } from 'vitest';
import type { CollaborationWorkerRun } from '@waggle/shared';
import {
  applyRunEvent,
  applyStatusEvent,
  dedupeAgents,
  pruneRecent,
  flattenWorkspaceMap,
  hydrateRunSnapshot,
  type RoomAgent,
  type StatusEvent,
  type WorkspaceAgents,
} from './room-state-reducer';

const NOW = 1_700_000_000_000; // deterministic for pruning maths

function mkAgent(partial: Partial<RoomAgent> & { id: string }): RoomAgent {
  return {
    name: 'Agent ' + partial.id,
    role: 'researcher',
    status: 'running',
    task: 'scout',
    toolsUsed: [],
    ...partial,
  };
}

function mkEvent(workspaceId: string, agents: RoomAgent[]): StatusEvent {
  return {
    type: 'subagent_status',
    workspaceId,
    agents,
    timestamp: new Date(NOW).toISOString(),
  };
}

describe('applyStatusEvent — parallel agents (P6)', () => {
  it('places two simultaneously-running agents into live, none into recent', () => {
    const event = mkEvent('default', [
      mkAgent({ id: 'a', role: 'researcher', status: 'running', task: 'T1' }),
      mkAgent({ id: 'b', role: 'coder', status: 'running', task: 'T2' }),
    ]);
    const next = applyStatusEvent(undefined, event, NOW);
    expect(next.live).toHaveLength(2);
    expect(next.recent).toHaveLength(0);
    expect(next.live.map((a) => a.id).sort()).toEqual(['a', 'b']);
  });

  it('preserves per-agent fields — no cross-contamination between parallel agents', () => {
    const event = mkEvent('default', [
      mkAgent({ id: 'alpha', role: 'researcher', task: 'Scout landscape', toolsUsed: ['web_search'] }),
      mkAgent({ id: 'beta', role: 'coder', task: 'Draft API', toolsUsed: ['read_file'] }),
    ]);
    const next = applyStatusEvent(undefined, event, NOW);
    const alpha = next.live.find((a) => a.id === 'alpha')!;
    const beta = next.live.find((a) => a.id === 'beta')!;
    expect(alpha.role).toBe('researcher');
    expect(alpha.task).toBe('Scout landscape');
    expect(alpha.toolsUsed).toEqual(['web_search']);
    expect(beta.role).toBe('coder');
    expect(beta.task).toBe('Draft API');
    expect(beta.toolsUsed).toEqual(['read_file']);
    // No field leaked in either direction.
    expect(alpha.task).not.toContain('Draft');
    expect(beta.task).not.toContain('Scout');
  });

  it('routes mixed event (one running, one done) to live vs recent correctly', () => {
    const event = mkEvent('default', [
      mkAgent({ id: 'a', status: 'running' }),
      mkAgent({ id: 'b', status: 'done', completedAt: NOW }),
    ]);
    const next = applyStatusEvent(undefined, event, NOW);
    expect(next.live.map((a) => a.id)).toEqual(['a']);
    expect(next.recent.map((a) => a.id)).toEqual(['b']);
  });

  it('preserves previously-live siblings missing from a delta event', () => {
    const prior: WorkspaceAgents = {
      live: [mkAgent({ id: 'was-live', status: 'running', startedAt: NOW - 30_000 })],
      recent: [],
      lastUpdatedAt: NOW - 30_000,
    };
    const event = mkEvent('default', [
      mkAgent({ id: 'new-one', status: 'running' }),
    ]);
    const next = applyStatusEvent(prior, event, NOW);
    expect(next.live.map((a) => a.id).sort()).toEqual(['new-one', 'was-live']);
    expect(next.recent).toEqual([]);
  });

  it('completes missing agents only for an explicit snapshot event', () => {
    const prior: WorkspaceAgents = {
      live: [mkAgent({ id: 'was-live', status: 'running', startedAt: NOW - 30_000 })],
      recent: [],
      lastUpdatedAt: NOW - 30_000,
    };
    const next = applyStatusEvent(prior, { ...mkEvent('default', []), mode: 'snapshot' }, NOW);
    expect(next.live).toEqual([]);
    expect(next.recent[0]).toMatchObject({ id: 'was-live', status: 'done' });
    expect(next.recent[0].completedAt).toBe(NOW);
  });

  it('dedupes by id when the server re-emits the same agent', () => {
    const first = mkEvent('default', [
      mkAgent({ id: 'a', status: 'done', completedAt: NOW }),
    ]);
    const afterFirst = applyStatusEvent(undefined, first, NOW);

    const second = mkEvent('default', [
      mkAgent({ id: 'a', status: 'done', completedAt: NOW + 1000 }),
    ]);
    const afterSecond = applyStatusEvent(afterFirst, second, NOW + 1000);

    expect(afterSecond.recent).toHaveLength(1);
    expect(afterSecond.recent[0].id).toBe('a');
  });
});

describe('pruneRecent', () => {
  it('drops entries older than the window', () => {
    const ancient = mkAgent({ id: 'old', completedAt: NOW - 20 * 60 * 1000 });
    const fresh = mkAgent({ id: 'new', completedAt: NOW - 60_000 });
    const out = pruneRecent([ancient, fresh], NOW, 15 * 60 * 1000);
    expect(out.map((a) => a.id)).toEqual(['new']);
  });

  it('falls back to startedAt when completedAt is absent', () => {
    const old = mkAgent({ id: 'a', startedAt: NOW - 20 * 60 * 1000 });
    const out = pruneRecent([old], NOW, 15 * 60 * 1000);
    expect(out).toEqual([]);
  });
});

describe('dedupeAgents', () => {
  it('keeps the first occurrence (caller-ordered)', () => {
    const a1 = mkAgent({ id: 'a', name: 'first' });
    const a2 = mkAgent({ id: 'a', name: 'second' });
    const out = dedupeAgents([a1, a2]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('first');
  });
});

describe('flattenWorkspaceMap', () => {
  const map = new Map<string, WorkspaceAgents>([
    ['ws1', {
      live: [mkAgent({ id: 'a1' })],
      recent: [mkAgent({ id: 'r1', status: 'done' })],
      lastUpdatedAt: NOW,
    }],
    ['ws2', {
      live: [mkAgent({ id: 'a2' }), mkAgent({ id: 'a3' })],
      recent: [],
      lastUpdatedAt: NOW,
    }],
  ]);

  it('flattens across all workspaces when no filter is given', () => {
    const { liveAgents, recentAgents } = flattenWorkspaceMap(map);
    expect(liveAgents).toHaveLength(3);
    expect(recentAgents).toHaveLength(1);
    expect(liveAgents.map((e) => e.agent.id).sort()).toEqual(['a1', 'a2', 'a3']);
  });

  it('filters to a single workspace', () => {
    const { liveAgents, recentAgents } = flattenWorkspaceMap(map, 'ws2');
    expect(liveAgents).toHaveLength(2);
    expect(recentAgents).toHaveLength(0);
    expect(liveAgents.every((e) => e.workspaceId === 'ws2')).toBe(true);
  });

  it('returns empty arrays when the filtered workspace is unknown', () => {
    const { liveAgents, recentAgents } = flattenWorkspaceMap(map, 'nonexistent');
    expect(liveAgents).toEqual([]);
    expect(recentAgents).toEqual([]);
  });

  it('preserves workspace attribution across multiple workspaces', () => {
    const { liveAgents } = flattenWorkspaceMap(map);
    const a1Entry = liveAgents.find((e) => e.agent.id === 'a1')!;
    const a2Entry = liveAgents.find((e) => e.agent.id === 'a2')!;
    expect(a1Entry.workspaceId).toBe('ws1');
    expect(a2Entry.workspaceId).toBe('ws2');
  });
});

function mkRun(
  id: string,
  workspaceId: string,
  status: CollaborationWorkerRun['status'] = 'running',
): CollaborationWorkerRun {
  return {
    schemaVersion: 1,
    kind: 'worker',
    id,
    roomId: 'room-1',
    rootRunId: 'room-1',
    parentRunId: 'room-1',
    workspaceId,
    source: 'external_tool',
    executor: { kind: 'external_tool', toolId: 'codex', model: 'gpt-test' },
    title: `Codex ${workspaceId}`,
    task: `Work in ${workspaceId}`,
    status,
    memoryRefs: { status: 'pending', personalFrameIds: [], workspaceFrameIds: {} },
    capabilities: { cancel: true, pause: false, resume: false, message: false },
    metrics: { toolsUsed: ['read_file'] },
    revision: 1,
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    startedAt: new Date(NOW).toISOString(),
  };
}

describe('durable collaboration runs', () => {
  it('hydrates workers into their exact workspaces without removing legacy agents', () => {
    const current = new Map<string, WorkspaceAgents>([[
      'ws1',
      { live: [mkAgent({ id: 'legacy' })], recent: [], lastUpdatedAt: NOW },
    ]]);
    const next = hydrateRunSnapshot(current, [mkRun('run-a', 'ws1'), mkRun('run-b', 'ws2')], NOW);
    expect(next.get('ws1')?.live.map((agent) => agent.id).sort()).toEqual(['legacy', 'run-a']);
    expect(next.get('ws2')?.live.map((agent) => agent.id)).toEqual(['run-b']);
    expect(next.get('ws1')?.live.find((agent) => agent.id === 'run-a')).toMatchObject({
      origin: 'run', roomId: 'room-1', toolId: 'codex', runStatus: 'running',
      toolsUsed: ['read_file'],
    });
  });

  it('applies full run deltas by id and keeps sibling runs live', () => {
    const hydrated = hydrateRunSnapshot(
      new Map(),
      [mkRun('run-a', 'ws1'), mkRun('run-b', 'ws1')],
      NOW,
    );
    const completed = {
      ...mkRun('run-a', 'ws1', 'completed'),
      revision: 2,
      completedAt: new Date(NOW + 1_000).toISOString(),
      result: { summary: 'Finished' },
      memoryRefs: { status: 'complete' as const, personalFrameIds: [1], workspaceFrameIds: { ws1: [2] } },
    };
    const next = applyRunEvent(hydrated, {
      seq: 10, type: 'upsert', run: completed, timestamp: new Date(NOW + 1_000).toISOString(),
    }, NOW + 1_000);
    expect(next.get('ws1')?.live.map((agent) => agent.id)).toEqual(['run-b']);
    expect(next.get('ws1')?.recent[0]).toMatchObject({
      id: 'run-a', status: 'done', resultSummary: 'Finished', memoryStatus: 'complete',
    });
  });
});

/**
 * P7/D15 B2 — useRoomState must expose connecting/error so RoomApp can tell a
 * broken SSE channel apart from an idle room (both rendered "No agents running"
 * before this fix). A subscribe failure → error + a reconnect affordance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderHook, act, waitFor, render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  COLLABORATION_RUN_STATUSES,
  type CollaborationRoomRun,
  type CollaborationWorkerRun,
} from '@waggle/shared';

const mocks = vi.hoisted(() => ({
  adapter: {
    subscribeSubagentStatus: vi.fn(),
    getAgentRunSnapshot: vi.fn(),
    getAgentRunEvents: vi.fn(),
  },
}));
const routeCapture = vi.hoisted(() => ({
  props: null as null | { roomId?: string; workspaceNames?: Record<string, string> },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/components/os/apps/RoomApp', () => ({
  default: (props: { roomId?: string; workspaceNames?: Record<string, string> }) => {
    routeCapture.props = props;
    return null;
  },
}));
vi.mock('@/providers/ShellContext', () => ({
  useShell: () => ({ workspaces: [{ id: 'ws-a', name: 'Alpha' }, { id: 'ws-b', name: 'Beta' }] }),
}));

import { useRoomState } from '@/hooks/useRoomState';
import {
  applyCanonicalRunEvents,
  hydrateCanonicalRuns,
  indexCanonicalRooms,
} from '@/lib/room-state-reducer';
import RoomRoute from '@/routes/RoomRoute';

const NOW = '2026-07-11T00:00:00.000Z';

function room(id: string, workspaceIds: string[]): CollaborationRoomRun {
  return {
    schemaVersion: 1,
    kind: 'room',
    id,
    roomId: id,
    rootRunId: id,
    parentRunId: null,
    workspaceIds,
    source: 'external_tool',
    executor: { kind: 'coordinator', toolId: 'codex' },
    title: `Room ${id}`,
    task: 'Compare implementations',
    status: 'running',
    progress: { message: 'Coordinating', phase: 'fan-out', current: 1, total: 2 },
    memoryRefs: { status: 'pending', personalFrameIds: [], workspaceFrameIds: {} },
    capabilities: { cancel: true, pause: false, resume: false, message: false },
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: NOW,
  };
}

function worker(
  id: string,
  roomId: string,
  workspaceId: string,
  status: CollaborationWorkerRun['status'] = 'running',
): CollaborationWorkerRun {
  return {
    schemaVersion: 1,
    kind: 'worker',
    id,
    roomId,
    rootRunId: roomId,
    parentRunId: roomId,
    workspaceId,
    source: 'external_tool',
    executor: { kind: 'external_tool', toolId: 'codex', model: 'gpt-test', pid: 42 },
    title: `Worker ${id}`,
    task: `Work in ${workspaceId}`,
    status,
    progress: { message: 'Reviewing', phase: 'analysis', current: 2, total: 4 },
    result: {
      summary: 'Partial finding',
      error: 'One source unavailable',
      sessionId: `session-${id}`,
      traceId: `trace-${id}`,
      artifacts: [`${workspaceId}/report.md`],
      exitCode: null,
    },
    metrics: { toolsUsed: ['read_file'], inputTokens: 10, outputTokens: 20, costUsd: 0.01 },
    memoryRefs: {
      status: 'partial',
      personalFrameIds: [1],
      workspaceFrameIds: { [workspaceId]: [2] },
    },
    capabilities: { cancel: true, pause: true, resume: true, message: false },
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: NOW,
  };
}

beforeEach(() => {
  routeCapture.props = null;
  mocks.adapter.subscribeSubagentStatus.mockReset().mockReturnValue(() => {});
  mocks.adapter.getAgentRunSnapshot.mockReset().mockResolvedValue({ lastSeq: 0, runs: [] });
  mocks.adapter.getAgentRunEvents.mockReset().mockResolvedValue({
    lastSeq: 0, resetRequired: false, events: [],
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('P7/B2 — useRoomState connection status', () => {
  it('settles to connected (no error) when subscribe succeeds', async () => {
    const { result } = renderHook(() => useRoomState());
    await waitFor(() => expect(result.current.connecting).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it('exposes an error (not silent console) when subscribe throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.adapter.subscribeSubagentStatus.mockImplementation(() => { throw new Error('SSE 401'); });
    const { result } = renderHook(() => useRoomState());
    await waitFor(() => expect(result.current.error).toBe('SSE 401'));
    expect(result.current.connecting).toBe(false);
  });

  it('reconnect() re-attempts the subscription and clears the error on recovery', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.adapter.subscribeSubagentStatus
      .mockImplementationOnce(() => { throw new Error('SSE 401'); })
      .mockReturnValueOnce(() => {});
    const { result } = renderHook(() => useRoomState());
    await waitFor(() => expect(result.current.error).toBe('SSE 401'));
    act(() => result.current.reconnect());
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(mocks.adapter.subscribeSubagentStatus).toHaveBeenCalledTimes(2);
  });
});

describe('canonical Room state fidelity', () => {
  it('preserves every canonical status and exact parent-child records', () => {
    const root = room('room-all-statuses', ['ws-a']);
    const workers = COLLABORATION_RUN_STATUSES.map((status, index) =>
      worker(`run-${index}`, root.id, 'ws-a', status));
    const runsById = hydrateCanonicalRuns([root, ...workers]);
    const indexed = indexCanonicalRooms(runsById);

    expect(indexed.roomsById.get(root.id)).toBe(root);
    expect(indexed.childrenByRoomId.get(root.id)?.map((run) => run.status)).toEqual([
      ...COLLABORATION_RUN_STATUSES,
    ]);

    const interrupted = { ...workers[0], status: 'interrupted' as const, revision: 2 };
    const updated = applyCanonicalRunEvents(runsById, [{
      seq: 2, type: 'upsert', run: interrupted, timestamp: NOW,
    }]);
    expect(updated.get(interrupted.id)).toBe(interrupted);
    expect(updated.get(root.id)).toBe(root);
  });

  it('focuses one root while retaining its complete worker state and the global graph', async () => {
    const rootA = room('room-a', ['ws-a']);
    const rootB = room('room-b', ['ws-b']);
    const workerA = worker('run-a', rootA.id, 'ws-a', 'waiting_for_approval');
    const workerB = worker('run-b', rootB.id, 'ws-b', 'paused');
    mocks.adapter.getAgentRunSnapshot.mockResolvedValue({
      lastSeq: 4,
      runs: [rootA, workerA, rootB, workerB],
    });

    const { result } = renderHook(() => useRoomState(rootA.id));
    await waitFor(() => expect(result.current.focusedRoom?.id).toBe(rootA.id));

    expect(result.current.focusedRoom?.workspaceIds).toEqual(['ws-a']);
    expect(result.current.focusedWorkers).toEqual([workerA]);
    expect(result.current.getRoomWorkers(rootA.id)).toEqual([workerA]);
    expect(result.current.runsById.get(workerA.id)).toMatchObject({
      status: 'waiting_for_approval',
      executor: workerA.executor,
      progress: workerA.progress,
      result: workerA.result,
      metrics: workerA.metrics,
      memoryRefs: workerA.memoryRefs,
      capabilities: workerA.capabilities,
      workspaceId: 'ws-a',
      parentRunId: rootA.id,
    });
    expect([...result.current.workspaceMap.keys()]).toEqual(['ws-a']);
    expect(result.current.workspaceMap.get('ws-a')?.live[0]).toMatchObject({
      runStatus: 'waiting_for_approval',
      workspaceId: 'ws-a',
      executor: workerA.executor,
      progress: workerA.progress,
      result: workerA.result,
      metrics: workerA.metrics,
      memoryRefs: workerA.memoryRefs,
      capabilities: workerA.capabilities,
    });
    expect([...result.current.allWorkspaceMap.keys()].sort()).toEqual(['ws-a', 'ws-b']);
    expect(result.current.rooms).toHaveLength(2);
  });
});

describe('RoomRoute focus plumbing', () => {
  it('decodes the canonical room query and passes it with workspace names', () => {
    render(createElement(
      MemoryRouter,
      {
        initialEntries: ['/room?room=room%2Fmulti'],
        future: { v7_startTransition: true, v7_relativeSplatPath: true },
      },
      createElement(RoomRoute),
    ));

    expect(routeCapture.props).toEqual({
      roomId: 'room/multi',
      workspaceNames: { 'ws-a': 'Alpha', 'ws-b': 'Beta' },
    });
  });
});

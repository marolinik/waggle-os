/**
 * RoomApp — PR6b §16 two-column shared stage + participants panel. The test
 * mocks useRoomState (the SSE hook) so the render path is exercised without a
 * transport, and asserts: (1) the connecting/empty/error full-bleed states,
 * (2) the two-column layout appears once there is a roster, (3) the
 * participants panel is derived from the SAME real roster (host + live + recent),
 * never fabricated (D20).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent, waitFor } from '@testing-library/react';
import type { RoomAgent } from '@/lib/room-state-reducer';
import type { CollaborationRoomRun, CollaborationWorkerRun } from '@waggle/shared';

interface MockRoomState {
  workspaceMap: Map<string, { live: RoomAgent[]; recent: RoomAgent[]; lastUpdatedAt: number }>;
  totalLive: number;
  connecting: boolean;
  error: string | null;
  reconnect: ReturnType<typeof vi.fn>;
  focusedRoom?: CollaborationRoomRun;
  focusedWorkers?: CollaborationWorkerRun[];
}

const state = vi.hoisted(() => ({
  value: {
    workspaceMap: new Map(),
    totalLive: 0,
    connecting: false,
    error: null as string | null,
    reconnect: vi.fn(),
  } as MockRoomState,
}));
const mocks = vi.hoisted(() => ({ adapter: { controlAgentRun: vi.fn() } }));

vi.mock('@/hooks/useRoomState', () => ({
  useRoomState: () => state.value,
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import RoomApp from './RoomApp';

function agent(over: Partial<RoomAgent>): RoomAgent {
  return {
    id: 'a1',
    name: 'Research-synth',
    role: 'researcher',
    status: 'running',
    task: 'Pulling the strongest proof points from memory',
    toolsUsed: ['recall_memory'],
    startedAt: Date.now() - 5000,
    ...over,
  };
}

function setRoster(live: RoomAgent[], recent: RoomAgent[] = []) {
  const map = new Map();
  map.set('ws1', { live, recent, lastUpdatedAt: Date.now() });
  state.value = {
    workspaceMap: map,
    totalLive: live.length,
    connecting: false,
    error: null,
    reconnect: vi.fn(),
  };
}

const RUN_AT = '2026-07-11T00:00:00.000Z';

function canonicalRoom(over: Partial<CollaborationRoomRun> = {}): CollaborationRoomRun {
  return {
    schemaVersion: 1,
    kind: 'room',
    id: 'room-campaign',
    roomId: 'room-campaign',
    rootRunId: 'room-campaign',
    parentRunId: null,
    workspaceIds: ['ws1'],
    source: 'external_tool',
    executor: { kind: 'coordinator', toolId: 'codex' },
    title: 'Campaign Room',
    task: 'Compare the two campaign implementations',
    status: 'running',
    progress: { message: 'Coordinating workers', phase: 'fan-out', current: 1, total: 2 },
    memoryRefs: { status: 'pending', personalFrameIds: [], workspaceFrameIds: {} },
    capabilities: { cancel: true, pause: true, resume: false, message: true },
    revision: 1,
    createdAt: RUN_AT,
    updatedAt: RUN_AT,
    startedAt: RUN_AT,
    ...over,
  };
}

function canonicalWorker(over: Partial<CollaborationWorkerRun> = {}): CollaborationWorkerRun {
  return {
    schemaVersion: 1,
    kind: 'worker',
    id: 'run-alpha',
    roomId: 'room-campaign',
    rootRunId: 'room-campaign',
    parentRunId: 'room-campaign',
    workspaceId: 'ws1',
    source: 'external_tool',
    executor: { kind: 'external_tool', toolId: 'codex', model: 'gpt-test', pid: 42 },
    title: 'Worker Alpha',
    task: 'Review the Alpha workspace',
    status: 'paused',
    progress: { message: 'Reviewing source', phase: 'analysis', current: 2, total: 4 },
    result: {
      summary: 'Found a partial implementation',
      error: 'One source file was unavailable',
      sessionId: 'session-alpha',
      traceId: 'trace-alpha',
      artifacts: ['reports/alpha.md'],
      exitCode: null,
    },
    metrics: { toolsUsed: ['read_file'], inputTokens: 10, outputTokens: 20, costUsd: 0.01 },
    memoryRefs: {
      status: 'partial',
      personalFrameIds: [11],
      workspaceFrameIds: { ws1: [21, 22] },
    },
    capabilities: { cancel: true, pause: false, resume: true, message: true },
    revision: 1,
    createdAt: RUN_AT,
    updatedAt: RUN_AT,
    startedAt: RUN_AT,
    ...over,
  };
}

function setFocusedRoom(room: CollaborationRoomRun, workers: CollaborationWorkerRun[]) {
  const map = new Map<string, { live: RoomAgent[]; recent: RoomAgent[]; lastUpdatedAt: number }>();
  for (const run of workers) {
    const current = map.get(run.workspaceId) ?? { live: [], recent: [], lastUpdatedAt: Date.now() };
    const projected = agent({
      id: run.id,
      name: run.title,
      role: run.executor.toolId ?? run.source,
      status: ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) ? 'done' : 'running',
      task: run.task,
      origin: 'run',
      roomId: run.roomId,
      runStatus: run.status,
    });
    if (['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) current.recent.push(projected);
    else current.live.push(projected);
    map.set(run.workspaceId, current);
  }
  state.value = {
    workspaceMap: map,
    totalLive: workers.filter((run) => !['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)).length,
    connecting: false,
    error: null,
    reconnect: vi.fn(),
    focusedRoom: room,
    focusedWorkers: workers,
  };
}

beforeEach(() => {
  mocks.adapter.controlAgentRun.mockReset();
  state.value = {
    workspaceMap: new Map(),
    totalLive: 0,
    connecting: false,
    error: null,
    reconnect: vi.fn(),
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RoomApp', () => {
  it('shows the empty "no agents running" state when the roster is empty', () => {
    render(<RoomApp />);
    // The empty-state body carries a distinctive explainer (the header counter
    // also says "no agents running", so we assert the body copy here).
    expect(screen.getByText(/spawn a Waggle agent.*captured external task/i)).toBeInTheDocument();
    // No two-column stage/participants chrome when empty.
    expect(screen.queryByTestId('room-participants')).not.toBeInTheDocument();
    expect(screen.queryByTestId('room-stage')).not.toBeInTheDocument();
  });

  it('shows the connecting state before the stage appears', () => {
    state.value = { ...state.value, connecting: true };
    render(<RoomApp />);
    expect(screen.getByTestId('room-connecting')).toBeInTheDocument();
    expect(screen.queryByTestId('room-stage')).not.toBeInTheDocument();
  });

  it('renders the reconnect affordance on an SSE error, not an empty room', () => {
    state.value = { ...state.value, error: 'stream closed' };
    render(<RoomApp />);
    expect(screen.getByRole('alert')).toHaveTextContent(/disconnected/i);
    expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument();
    // The error branch wins over the empty-state body (B2): no stage, no
    // "ask a complex question" explainer — just the connection error.
    expect(screen.queryByTestId('room-stage')).not.toBeInTheDocument();
    expect(screen.queryByText(/spawn a Waggle agent.*captured external task/i)).not.toBeInTheDocument();
  });

  it('renders the two-column stage + participants panel once a roster exists', () => {
    setRoster([agent({ id: 'a1', name: 'Research-synth' })]);
    render(<RoomApp />);
    const stage = screen.getByTestId('room-stage');
    expect(stage).toBeInTheDocument();
    expect(screen.getByTestId('room-participants')).toBeInTheDocument();
    // The agent tile is on the stage (it also appears in the participants
    // panel by design — scope to the stage to assert the tile specifically).
    expect(within(stage).getByText('Research-synth')).toBeInTheDocument();
  });

  it('derives the participants panel from the real roster (host + live + recent), never fabricated', () => {
    setRoster(
      [agent({ id: 'live1', name: 'Deck-builder', role: 'writer', status: 'running' })],
      [agent({ id: 'done1', name: 'Analyst', role: 'analyst', status: 'done', completedAt: Date.now() })],
    );
    render(<RoomApp />);
    const panel = screen.getByTestId('room-participants');
    // Host is always present.
    expect(within(panel).getByText('You')).toBeInTheDocument();
    expect(within(panel).getByText('host')).toBeInTheDocument();
    // The live agent shows as "live"; the recently-finished agent shows by role.
    expect(within(panel).getByText('Deck-builder')).toBeInTheDocument();
    expect(within(panel).getByText('Analyst')).toBeInTheDocument();
    // One participant row per real roster agent (+ none invented). Two agents → 2 rows.
    expect(within(panel).getAllByTestId('room-participant')).toHaveLength(2);
  });
});

describe('RoomApp canonical Room presentation and controls', () => {
  it.each([
    ['running', 'Work is still in progress', undefined],
    ['completed', '   ', undefined],
    ['completed', 'Complete answer', 'Assistant history could not be persisted: disk full'],
  ] as const)('does not expose an incomplete chat result while a worker is %s', (status, summary, error) => {
    const room = canonicalRoom();
    const worker = canonicalWorker({
      status,
      result: { ...canonicalWorker().result!, summary, error },
    });
    setFocusedRoom(room, [worker]);

    render(<RoomApp roomId={room.id} />);

    expect(screen.queryByRole('link', { name: 'Open result in chat' })).not.toBeInTheDocument();
  });

  it('exposes the persisted chat result after a worker completes with a summary', () => {
    const room = canonicalRoom({ status: 'completed' });
    const worker = canonicalWorker({
      status: 'completed',
      result: { ...canonicalWorker().result!, summary: 'Complete answer', error: undefined },
    });
    setFocusedRoom(room, [worker]);

    render(<RoomApp roomId={room.id} />);

    expect(screen.getByRole('link', { name: 'Open result in chat' })).toHaveAttribute(
      'href',
      '/workspaces/ws1/chat?session=session-alpha',
    );
  });

  it('keeps a persisted chat available when only result memory recording warned', () => {
    const room = canonicalRoom({ status: 'completed' });
    const worker = canonicalWorker({
      status: 'completed',
      result: {
        ...canonicalWorker().result!,
        summary: 'Complete answer',
        error: 'Result memory could not be recorded: vector store unavailable',
      },
    });
    setFocusedRoom(room, [worker]);

    render(<RoomApp roomId={room.id} />);

    expect(screen.getByRole('link', { name: 'Open result in chat' })).toHaveAttribute(
      'href',
      '/workspaces/ws1/chat?session=session-alpha',
    );
  });

  it('renders the root aggregate and complete exact worker details', () => {
    const room = canonicalRoom();
    const worker = canonicalWorker();
    setFocusedRoom(room, [worker]);

    render(<RoomApp roomId={room.id} workspaceNames={{ ws1: 'Alpha Workspace' }} />);

    const summary = screen.getByTestId('room-root-summary');
    expect(summary).toHaveTextContent('Campaign Room');
    expect(summary).toHaveTextContent('Running');
    expect(summary).toHaveTextContent('0/1 settled');
    expect(summary).toHaveTextContent('Alpha Workspace');

    const card = screen.getByTestId('canonical-worker-card');
    expect(card).toHaveAttribute('data-run-status', 'paused');
    expect(card).toHaveTextContent('Paused');
    expect(card).toHaveTextContent('analysis · Reviewing source');
    expect(card).toHaveTextContent('Found a partial implementation');
    expect(card).toHaveTextContent('One source file was unavailable');
    expect(card).toHaveTextContent('reports/alpha.md');
    expect(card).toHaveTextContent('Session · session-alpha');
    expect(card).toHaveTextContent('Trace · trace-alpha');
    expect(card).toHaveTextContent('Tools · read_file');
    expect(card).toHaveTextContent('Input · 10 tokens');
    expect(card).toHaveTextContent('Output · 20 tokens');
    expect(card).toHaveTextContent('Cost · $0.0100');
    expect(card).toHaveTextContent('Memory · partial');
    expect(card).toHaveTextContent('Personal mind · 1 frame');
    expect(card).toHaveTextContent('Workspace mind · 2 frames');
  });

  it('sends only capability-gated root and worker controls through the canonical API', async () => {
    const room = canonicalRoom();
    const worker = canonicalWorker();
    setFocusedRoom(room, [worker]);
    mocks.adapter.controlAgentRun.mockResolvedValue(room);
    render(<RoomApp roomId={room.id} workspaceNames={{ ws1: 'Alpha Workspace' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause Campaign Room' }));
    await waitFor(() => expect(mocks.adapter.controlAgentRun).toHaveBeenCalledWith(room.id, 'pause', undefined));

    fireEvent.click(screen.getByRole('button', { name: 'Resume Worker Alpha' }));
    await waitFor(() => expect(mocks.adapter.controlAgentRun).toHaveBeenCalledWith(worker.id, 'resume', undefined));

    const workerCard = screen.getByTestId('canonical-worker-card');
    fireEvent.change(within(workerCard).getByRole('textbox', { name: 'Message Worker Alpha' }), {
      target: { value: 'Continue with the available files' },
    });
    fireEvent.click(within(workerCard).getByRole('button', { name: 'Send message to Worker Alpha' }));
    await waitFor(() => expect(mocks.adapter.controlAgentRun).toHaveBeenCalledWith(
      worker.id,
      'message',
      'Continue with the available files',
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Campaign Room' }));
    await waitFor(() => expect(mocks.adapter.controlAgentRun).toHaveBeenCalledWith(room.id, 'cancel', undefined));
    expect(screen.queryByRole('button', { name: 'Pause Worker Alpha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume Campaign Room' })).not.toBeInTheDocument();
  });

  it('hides controls when a terminal worker advertises no capabilities', () => {
    const room = canonicalRoom({ status: 'completed', capabilities: { cancel: false, pause: false, resume: false, message: false } });
    const worker = canonicalWorker({
      id: 'run-finished',
      title: 'Finished Worker',
      status: 'completed',
      completedAt: RUN_AT,
      capabilities: { cancel: false, pause: false, resume: false, message: false },
    });
    setFocusedRoom(room, [worker]);

    render(<RoomApp roomId={room.id} workspaceNames={{ ws1: 'Alpha Workspace' }} />);

    expect(screen.getByTestId('canonical-worker-card')).toHaveAttribute('data-run-status', 'completed');
    expect(screen.queryByTestId(`run-controls-${worker.id}`)).not.toBeInTheDocument();
    expect(mocks.adapter.controlAgentRun).not.toHaveBeenCalled();
  });

  it('renders an explicit missing-room state for an invalid deep link', () => {
    render(<RoomApp roomId="missing-room" />);

    expect(screen.getByTestId('room-not-found')).toHaveTextContent('Room not found');
    expect(screen.getByTestId('room-not-found')).toHaveTextContent('missing-room');
    expect(screen.queryByText('No agents running')).not.toBeInTheDocument();
  });
});

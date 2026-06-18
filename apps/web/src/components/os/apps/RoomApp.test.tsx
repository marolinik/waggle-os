/**
 * RoomApp — PR6b §16 two-column shared stage + participants panel. The test
 * mocks useRoomState (the SSE hook) so the render path is exercised without a
 * transport, and asserts: (1) the connecting/empty/error full-bleed states,
 * (2) the two-column layout appears once there is a roster, (3) the
 * participants panel is derived from the SAME real roster (host + live + recent),
 * never fabricated (D20).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import type { RoomAgent } from '@/lib/room-state-reducer';

const state = vi.hoisted(() => ({
  value: {
    workspaceMap: new Map(),
    totalLive: 0,
    connecting: false,
    error: null as string | null,
    reconnect: vi.fn(),
  },
}));

vi.mock('@/hooks/useRoomState', () => ({
  useRoomState: () => state.value,
}));

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

beforeEach(() => {
  state.value = {
    workspaceMap: new Map(),
    totalLive: 0,
    connecting: false,
    error: null,
    reconnect: vi.fn(),
  };
});
afterEach(() => cleanup());

describe('RoomApp', () => {
  it('shows the empty "no agents running" state when the roster is empty', () => {
    render(<RoomApp />);
    // The empty-state body carries a distinctive explainer (the header counter
    // also says "no agents running", so we assert the body copy here).
    expect(screen.getByText(/when you ask a complex question in chat/i)).toBeInTheDocument();
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
    expect(screen.queryByText(/when you ask a complex question in chat/i)).not.toBeInTheDocument();
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

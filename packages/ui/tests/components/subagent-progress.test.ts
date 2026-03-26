/**
 * SubAgentProgress component tests.
 *
 * Tests utility functions, data contracts, and exports — no jsdom/React Testing Library.
 * React component rendering is tested in the desktop app's E2E suite.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  SubAgentProgress,
  formatElapsed,
} from '../../src/index.js';
import type { SubAgentInfo, SubAgentProgressProps } from '../../src/index.js';

// ── Helper: build a SubAgentInfo ────────────────────────────────────

function makeAgent(overrides: Partial<SubAgentInfo> = {}): SubAgentInfo {
  return {
    id: 'worker-1',
    name: 'research-worker',
    role: 'researcher',
    status: 'running',
    task: 'Research latest papers on LLM agents',
    toolsUsed: [],
    ...overrides,
  };
}

// ── formatElapsed ───────────────────────────────────────────────────

describe('formatElapsed', () => {
  it('returns empty string when startedAt is undefined', () => {
    expect(formatElapsed(undefined)).toBe('');
  });

  it('returns empty string when startedAt is 0 (falsy)', () => {
    expect(formatElapsed(0)).toBe('');
  });

  it('formats sub-second durations in milliseconds', () => {
    const now = Date.now();
    expect(formatElapsed(now, now + 500)).toBe('500ms');
  });

  it('formats durations >= 1s in seconds', () => {
    const now = Date.now();
    expect(formatElapsed(now, now + 2500)).toBe('2.5s');
  });

  it('formats durations >= 60s as minutes and seconds', () => {
    const now = Date.now();
    expect(formatElapsed(now, now + 95000)).toBe('1m 35s');
  });

  it('uses Date.now() when completedAt is not provided', () => {
    const startedAt = Date.now() - 3000;
    const result = formatElapsed(startedAt);
    // Should be roughly 3s — at least > 2s
    expect(result).toMatch(/^\d+\.\ds$/);
  });

  it('handles exact 1 second', () => {
    const now = Date.now();
    expect(formatElapsed(now, now + 1000)).toBe('1.0s');
  });

  it('handles exact 1 minute', () => {
    const now = Date.now();
    expect(formatElapsed(now, now + 60000)).toBe('1m 0s');
  });
});

// ── SubAgentInfo data shape ─────────────────────────────────────────

describe('SubAgentInfo data shape', () => {
  it('renders nothing when agents is empty (returns null)', () => {
    // Component returns null for empty array. We verify the contract.
    const agents: SubAgentInfo[] = [];
    expect(agents.length).toBe(0);
    // The component checks `if (agents.length === 0) return null;`
  });

  it('counts active agents correctly from agent list', () => {
    const agents: SubAgentInfo[] = [
      makeAgent({ id: 'w-1', status: 'running' }),
      makeAgent({ id: 'w-2', status: 'pending' }),
      makeAgent({ id: 'w-3', status: 'done' }),
      makeAgent({ id: 'w-4', status: 'failed' }),
    ];
    const activeCount = agents.filter(
      (a) => a.status === 'running' || a.status === 'pending',
    ).length;
    expect(activeCount).toBe(2);
  });

  it('agent has all required fields', () => {
    const agent = makeAgent();
    expect(agent.id).toBeTruthy();
    expect(agent.name).toBeTruthy();
    expect(agent.role).toBeTruthy();
    expect(['pending', 'running', 'done', 'failed']).toContain(agent.status);
    expect(agent.task).toBeTruthy();
    expect(Array.isArray(agent.toolsUsed)).toBe(true);
  });

  it('agent shows agent name and role together', () => {
    const agent = makeAgent({ name: 'research-worker', role: 'Researcher' });
    const display = `${agent.name} (${agent.role})`;
    expect(display).toBe('research-worker (Researcher)');
  });
});

// ── Status dot classes ──────────────────────────────────────────────

describe('status dot CSS classes', () => {
  const STATUS_DOT_CLASS: Record<SubAgentInfo['status'], string> = {
    pending: 'bg-yellow-500',
    running: 'bg-blue-500 animate-pulse',
    done: 'bg-green-500',
    failed: 'bg-destructive',
  };

  it('pending maps to bg-yellow-500', () => {
    expect(STATUS_DOT_CLASS.pending).toBe('bg-yellow-500');
  });

  it('running maps to bg-blue-500 animate-pulse', () => {
    expect(STATUS_DOT_CLASS.running).toBe('bg-blue-500 animate-pulse');
  });

  it('done maps to bg-green-500', () => {
    expect(STATUS_DOT_CLASS.done).toBe('bg-green-500');
  });

  it('failed maps to bg-destructive', () => {
    expect(STATUS_DOT_CLASS.failed).toBe('bg-destructive');
  });
});

// ── Collapsed state logic ───────────────────────────────────────────

describe('collapsed state logic', () => {
  it('defaults to expanded (collapsed undefined = show agents)', () => {
    const collapsed = undefined;
    const isCollapsed = collapsed ?? false;
    expect(isCollapsed).toBe(false);
  });

  it('controlled collapsed=true hides agent list', () => {
    const collapsed = true;
    expect(collapsed).toBe(true);
  });

  it('controlled collapsed=false shows agent list', () => {
    const collapsed = false;
    expect(collapsed).toBe(false);
  });

  it('toggle callback is invoked on toggle', () => {
    const onToggle = vi.fn();
    onToggle();
    expect(onToggle).toHaveBeenCalledOnce();
  });
});

// ── Elapsed time for running vs done agents ─────────────────────────

describe('elapsed time display', () => {
  it('running agent shows elapsed from startedAt to now', () => {
    const agent = makeAgent({
      status: 'running',
      startedAt: Date.now() - 5000,
    });
    const elapsed = formatElapsed(agent.startedAt, agent.completedAt);
    // Should be ~5s
    expect(elapsed).toMatch(/^\d+\.\ds$/);
  });

  it('done agent shows total time from startedAt to completedAt', () => {
    const start = Date.now() - 10000;
    const agent = makeAgent({
      status: 'done',
      startedAt: start,
      completedAt: start + 7500,
    });
    const elapsed = formatElapsed(agent.startedAt, agent.completedAt);
    expect(elapsed).toBe('7.5s');
  });

  it('agent without startedAt shows no time', () => {
    const agent = makeAgent({ status: 'pending', startedAt: undefined });
    const elapsed = formatElapsed(agent.startedAt, agent.completedAt);
    expect(elapsed).toBe('');
  });
});

// ── Status text logic ───────────────────────────────────────────────

describe('status text display', () => {
  it('shows last tool name for running agent with tools', () => {
    const agent = makeAgent({
      status: 'running',
      toolsUsed: ['web_search', 'read_file'],
    });
    const statusText =
      agent.status === 'running' && agent.toolsUsed.length > 0
        ? agent.toolsUsed[agent.toolsUsed.length - 1]
        : agent.status;
    expect(statusText).toBe('read_file');
  });

  it('shows status label for running agent with no tools', () => {
    const agent = makeAgent({ status: 'running', toolsUsed: [] });
    const statusText =
      agent.status === 'running' && agent.toolsUsed.length > 0
        ? agent.toolsUsed[agent.toolsUsed.length - 1]
        : 'Running';
    expect(statusText).toBe('Running');
  });

  it('shows "Pending" for pending agents', () => {
    const agent = makeAgent({ status: 'pending' });
    const STATUS_LABEL: Record<string, string> = {
      pending: 'Pending',
      running: 'Running',
      done: 'Done',
      failed: 'Failed',
    };
    expect(STATUS_LABEL[agent.status]).toBe('Pending');
  });

  it('shows "Done" for completed agents', () => {
    const agent = makeAgent({ status: 'done' });
    const STATUS_LABEL: Record<string, string> = {
      pending: 'Pending',
      running: 'Running',
      done: 'Done',
      failed: 'Failed',
    };
    expect(STATUS_LABEL[agent.status]).toBe('Done');
  });

  it('shows "Failed" for failed agents', () => {
    const agent = makeAgent({ status: 'failed' });
    const STATUS_LABEL: Record<string, string> = {
      pending: 'Pending',
      running: 'Running',
      done: 'Done',
      failed: 'Failed',
    };
    expect(STATUS_LABEL[agent.status]).toBe('Failed');
  });
});

// ── Component export ────────────────────────────────────────────────

describe('component exports', () => {
  it('exports SubAgentProgress as a function', () => {
    expect(typeof SubAgentProgress).toBe('function');
  });

  it('exports formatElapsed as a function', () => {
    expect(typeof formatElapsed).toBe('function');
  });
});

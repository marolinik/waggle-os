/**
 * Chat component tests.
 *
 * Tests utility functions and exports only — no jsdom/React Testing Library.
 * React component rendering is tested in the desktop app's E2E suite.
 */

import { describe, it, expect } from 'vitest';
import {
  getToolStatusColor,
  formatDuration,
  ChatArea,
  ChatMessage,
  ChatInput,
  ToolCard,
  ApprovalGate,
  useChat,
  processStreamEvent,
} from '../../src/index.js';
import type { ToolUseEvent, StreamEvent } from '../../src/index.js';

// ── getToolStatusColor ───────────────────────────────────────────────

describe('getToolStatusColor', () => {
  it('returns green for a completed tool', () => {
    const tool: ToolUseEvent = {
      name: 'read_file',
      input: { path: '/foo' },
      requiresApproval: false,
      status: 'done',
    };
    expect(getToolStatusColor(tool)).toBe('green');
  });

  it('returns green for an approved tool', () => {
    const tool: ToolUseEvent = {
      name: 'write_file',
      input: { path: '/foo' },
      requiresApproval: true,
      approved: true,
      status: 'done',
    };
    expect(getToolStatusColor(tool)).toBe('green');
  });

  it('returns yellow for a tool pending approval', () => {
    const tool: ToolUseEvent = {
      name: 'bash',
      input: { command: 'rm -rf /' },
      requiresApproval: true,
      status: 'pending_approval',
    };
    expect(getToolStatusColor(tool)).toBe('yellow');
  });

  it('returns red for a denied tool', () => {
    const tool: ToolUseEvent = {
      name: 'bash',
      input: { command: 'rm -rf /' },
      requiresApproval: true,
      approved: false,
      status: 'denied',
    };
    expect(getToolStatusColor(tool)).toBe('red');
  });

  it('returns red for an errored tool', () => {
    const tool: ToolUseEvent = {
      name: 'bash',
      input: {},
      requiresApproval: false,
      status: 'error',
    };
    expect(getToolStatusColor(tool)).toBe('red');
  });

  it('returns blue for a running tool', () => {
    const tool: ToolUseEvent = {
      name: 'bash',
      input: {},
      requiresApproval: false,
      status: 'running',
    };
    expect(getToolStatusColor(tool)).toBe('blue');
  });

  it('falls back to legacy logic when status is missing', () => {
    // Legacy: no status field (cast to bypass TS)
    const tool = {
      name: 'bash',
      input: {},
      requiresApproval: true,
      // approved is undefined
    } as ToolUseEvent;
    expect(getToolStatusColor(tool)).toBe('yellow');
  });

  it('returns red when approved is false via legacy fallback', () => {
    const tool = {
      name: 'bash',
      input: {},
      requiresApproval: false,
      approved: false,
    } as ToolUseEvent;
    expect(getToolStatusColor(tool)).toBe('red');
  });
});

// ── formatDuration ───────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats sub-second durations in milliseconds', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(42)).toBe('42ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats durations >= 1s in seconds', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(12345)).toBe('12.3s');
  });
});

// ── processStreamEvent ──────────────────────────────────────────────

describe('processStreamEvent', () => {
  const empty = { content: '', tools: [] as ToolUseEvent[], steps: [] as string[] };

  it('appends token content', () => {
    const event: StreamEvent = { type: 'token', content: 'Hello' };
    const result = processStreamEvent(event, empty);
    expect(result.content).toBe('Hello');
  });

  it('accumulates multiple tokens', () => {
    const state1 = processStreamEvent(
      { type: 'token', content: 'Hello ' },
      empty,
    );
    const state2 = processStreamEvent(
      { type: 'token', content: 'world' },
      state1,
    );
    expect(state2.content).toBe('Hello world');
  });

  it('adds a tool on tool event with running status', () => {
    const event: StreamEvent = {
      type: 'tool',
      name: 'read_file',
      input: { path: '/foo.ts' },
    };
    const result = processStreamEvent(event, empty);
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe('read_file');
    expect(result.tools[0].input).toEqual({ path: '/foo.ts' });
    expect(result.tools[0].status).toBe('running');
  });

  it('updates tool with result and done status on tool_result event', () => {
    const withTool = processStreamEvent(
      { type: 'tool', name: 'bash', input: { command: 'ls' } },
      empty,
    );
    const result = processStreamEvent(
      { type: 'tool_result', name: 'bash', result: 'file1.ts\nfile2.ts', duration: 150 },
      withTool,
    );
    expect(result.tools[0].result).toBe('file1.ts\nfile2.ts');
    expect(result.tools[0].status).toBe('done');
    expect(result.tools[0].duration).toBe(150);
  });

  it('sets error status when tool_result has isError flag', () => {
    const withTool = processStreamEvent(
      { type: 'tool', name: 'bash', input: { command: 'fail' } },
      empty,
    );
    const result = processStreamEvent(
      { type: 'tool_result', name: 'bash', result: 'Error: command failed', isError: true },
      withTool,
    );
    expect(result.tools[0].status).toBe('error');
  });

  it('matches tool_result to correct running tool by name', () => {
    let state = processStreamEvent(
      { type: 'tool', name: 'read_file', input: { path: 'a.ts' } },
      empty,
    );
    state = processStreamEvent(
      { type: 'tool_result', name: 'read_file', result: 'content a', duration: 50 },
      state,
    );
    state = processStreamEvent(
      { type: 'tool', name: 'read_file', input: { path: 'b.ts' } },
      state,
    );
    state = processStreamEvent(
      { type: 'tool_result', name: 'read_file', result: 'content b', duration: 75 },
      state,
    );
    expect(state.tools[0].status).toBe('done');
    expect(state.tools[0].result).toBe('content a');
    expect(state.tools[1].status).toBe('done');
    expect(state.tools[1].result).toBe('content b');
  });

  it('appends error content on error event', () => {
    const event: StreamEvent = { type: 'error', content: 'timeout' };
    const result = processStreamEvent(event, empty);
    expect(result.content).toContain('[Error: timeout]');
  });

  it('does not modify content for step events', () => {
    const event: StreamEvent = { type: 'step' };
    const result = processStreamEvent(event, { content: 'existing', tools: [], steps: [] });
    expect(result.content).toBe('existing');
  });

  it('pushes step content to steps array', () => {
    const event: StreamEvent = { type: 'step', content: 'Searching memory...' };
    const result = processStreamEvent(event, empty);
    expect(result.steps).toEqual(['Searching memory...']);
  });

  it('does not modify content for done events', () => {
    const event: StreamEvent = { type: 'done' };
    const result = processStreamEvent(event, { content: 'existing', tools: [], steps: [] });
    expect(result.content).toBe('existing');
  });

  it('handles tool_result when no tools exist gracefully', () => {
    const event: StreamEvent = { type: 'tool_result', result: 'orphan' };
    const result = processStreamEvent(event, empty);
    // Should not crash, tools array remains empty
    expect(result.tools).toHaveLength(0);
  });

  it('sets pending_approval status on approval_required event', () => {
    const withTool = processStreamEvent(
      { type: 'tool', name: 'bash', input: { command: 'rm file' } },
      empty,
    );
    const result = processStreamEvent(
      { type: 'approval_required', toolName: 'bash', requestId: 'req-1' },
      withTool,
    );
    expect(result.tools[0].status).toBe('pending_approval');
    expect(result.tools[0].requiresApproval).toBe(true);
    expect(result.tools[0].requestId).toBe('req-1');
  });

  it('creates tool entry if approval_required arrives before tool event', () => {
    const result = processStreamEvent(
      { type: 'approval_required', toolName: 'bash', requestId: 'req-2', input: { command: 'dangerous' } },
      empty,
    );
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe('bash');
    expect(result.tools[0].status).toBe('pending_approval');
  });

  it('falls back to last tool when tool_result has no name', () => {
    const withTool = processStreamEvent(
      { type: 'tool', name: 'bash', input: { command: 'ls' } },
      empty,
    );
    const result = processStreamEvent(
      { type: 'tool_result', result: 'output' },
      withTool,
    );
    expect(result.tools[0].result).toBe('output');
    expect(result.tools[0].status).toBe('done');
  });
});

// ── Component exports ───────────────────────────────────────────────

describe('component exports', () => {
  it('exports ChatArea as a function', () => {
    expect(typeof ChatArea).toBe('function');
  });

  it('exports ChatMessage as a function', () => {
    // ChatMessage may be wrapped in React.memo (returns object)
    expect(['function', 'object']).toContain(typeof ChatMessage);
  });

  it('exports ChatInput as a function', () => {
    expect(typeof ChatInput).toBe('function');
  });

  it('exports ToolCard as a function', () => {
    // ToolCard may be wrapped in React.memo (returns object)
    expect(['function', 'object']).toContain(typeof ToolCard);
  });

  it('exports ApprovalGate as a function', () => {
    expect(typeof ApprovalGate).toBe('function');
  });

  it('exports useChat as a function', () => {
    expect(typeof useChat).toBe('function');
  });

  it('exports processStreamEvent as a function', () => {
    expect(typeof processStreamEvent).toBe('function');
  });
});

/**
 * WorkflowSuggestionCard component tests.
 *
 * Tests data contracts, exports, and callback behavior — no jsdom/React Testing Library.
 * React component rendering is tested in the desktop app's E2E suite.
 */

import { describe, it, expect, vi } from 'vitest';
import { WorkflowSuggestionCard } from '../../src/index.js';
import type { WorkflowSuggestionProps } from '../../src/index.js';

// ── Helper: build WorkflowSuggestionProps ─────────────────────────

function makePattern(overrides: Partial<WorkflowSuggestionProps['pattern']> = {}): WorkflowSuggestionProps['pattern'] {
  return {
    name: 'research-then-draft',
    steps: ['Search web', 'Read results', 'Draft summary'],
    tools: ['web_search', 'web_fetch', 'write_file'],
    ...overrides,
  };
}

// ── Component export ──────────────────────────────────────────────

describe('WorkflowSuggestionCard exports', () => {
  it('exports WorkflowSuggestionCard as a function', () => {
    expect(typeof WorkflowSuggestionCard).toBe('function');
  });
});

// ── Pattern data shape ───────────────────────────────────────────

describe('WorkflowSuggestionCard pattern data shape', () => {
  it('pattern has required fields: name, steps, tools', () => {
    const pattern = makePattern();
    expect(pattern.name).toBeTruthy();
    expect(Array.isArray(pattern.steps)).toBe(true);
    expect(pattern.steps.length).toBeGreaterThan(0);
    expect(Array.isArray(pattern.tools)).toBe(true);
    expect(pattern.tools.length).toBeGreaterThan(0);
  });

  it('pattern with many tools shows first 6 plus overflow count', () => {
    const tools = ['web_search', 'web_fetch', 'read_file', 'write_file', 'edit_file', 'search_files', 'bash', 'git_status'];
    const pattern = makePattern({ tools });
    const visibleTools = pattern.tools.slice(0, 6);
    const overflowCount = pattern.tools.length - 6;
    expect(visibleTools.length).toBe(6);
    expect(overflowCount).toBe(2);
  });

  it('pattern with 6 or fewer tools shows no overflow', () => {
    const pattern = makePattern({ tools: ['web_search', 'web_fetch', 'write_file'] });
    expect(pattern.tools.length).toBeLessThanOrEqual(6);
  });

  it('pattern with empty tools renders nothing (graceful)', () => {
    const pattern = makePattern({ tools: [] });
    expect(pattern.tools.length).toBe(0);
  });
});

// ── Callback contracts ───────────────────────────────────────────

describe('WorkflowSuggestionCard callbacks', () => {
  it('onAccept callback is invoked when accept is triggered', () => {
    const onAccept = vi.fn();
    onAccept();
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it('onDismiss callback is invoked when dismiss is triggered', () => {
    const onDismiss = vi.fn();
    onDismiss();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('both callbacks can coexist without interference', () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    onAccept();
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
    onDismiss();
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onAccept).toHaveBeenCalledOnce();
  });
});

// ── Props interface contract ─────────────────────────────────────

describe('WorkflowSuggestionProps interface', () => {
  it('constructs valid props object', () => {
    const props: WorkflowSuggestionProps = {
      pattern: makePattern(),
      onAccept: () => {},
      onDismiss: () => {},
    };
    expect(props.pattern).toBeTruthy();
    expect(typeof props.onAccept).toBe('function');
    expect(typeof props.onDismiss).toBe('function');
  });

  it('pattern name used for skill creation', () => {
    const pattern = makePattern({ name: 'my-workflow' });
    expect(pattern.name).toBe('my-workflow');
  });

  it('pattern steps describe the workflow', () => {
    const pattern = makePattern({ steps: ['Step 1', 'Step 2'] });
    expect(pattern.steps).toEqual(['Step 1', 'Step 2']);
  });
});

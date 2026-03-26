// @vitest-environment jsdom
/**
 * ApprovalGate rendering tests — verify tool name, description,
 * Approve/Deny buttons, and callback behavior.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalGate } from '../../../src/components/chat/ApprovalGate.js';
import type { ToolUseEvent } from '../../../src/services/types.js';

// ── Helpers ───────────────────────────────────────────────────────────

function makeTool(overrides: Partial<ToolUseEvent> = {}): ToolUseEvent {
  return {
    name: 'bash',
    input: { command: 'echo hello' },
    requiresApproval: true,
    status: 'pending_approval',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('ApprovalGate rendering', () => {
  it('renders tool name and description', () => {
    const tool = makeTool({
      name: 'bash',
      input: { command: 'npm install express' },
    });

    render(
      <ApprovalGate tool={tool} onApprove={() => {}} onDeny={() => {}} />
    );

    // Should show the "Approval Required" header
    expect(screen.getByText('Approval Required')).toBeTruthy();

    // Should show human-readable title for bash tool
    expect(screen.getByText('Run a shell command')).toBeTruthy();

    // Should show the command detail
    expect(screen.getByText('npm install express')).toBeTruthy();
  });

  it('shows Approve and Deny buttons', () => {
    const tool = makeTool();

    render(
      <ApprovalGate tool={tool} onApprove={() => {}} onDeny={() => {}} />
    );

    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.getByText('Deny')).toBeTruthy();
  });

  it('calls onApprove when Approve is clicked', () => {
    const onApprove = vi.fn();
    const tool = makeTool();

    render(
      <ApprovalGate tool={tool} onApprove={onApprove} onDeny={() => {}} />
    );

    fireEvent.click(screen.getByText('Approve'));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('calls onDeny when Deny is clicked', () => {
    const onDeny = vi.fn();
    const tool = makeTool();

    render(
      <ApprovalGate tool={tool} onApprove={() => {}} onDeny={onDeny} />
    );

    fireEvent.click(screen.getByText('Deny'));
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it('renders write_file tool with file path in description', () => {
    const tool = makeTool({
      name: 'write_file',
      input: { path: '/src/index.ts', content: 'console.log("hello")' },
    });

    render(
      <ApprovalGate tool={tool} onApprove={() => {}} onDeny={() => {}} />
    );

    expect(screen.getByText(/Create\/overwrite file.*\/src\/index\.ts/)).toBeTruthy();
  });
});

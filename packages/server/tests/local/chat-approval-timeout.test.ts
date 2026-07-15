import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CronStore, MindDB } from '@waggle/core';
import { resolveApprovalTimeoutPolicy, waitForApprovalDecision } from '../../src/local/routes/chat.js';

describe('chat approval timeout policy', () => {
  let tmpDir: string;
  let db: MindDB;
  let cronStore: CronStore;
  let pendingApprovals: Map<string, {
    resolve: (approved: boolean) => void;
    toolName: string;
    input: Record<string, unknown>;
    timestamp: number;
  }>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T10:00:00.000Z'));
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-approval-timeout-'));
    db = new MindDB(path.join(tmpDir, 'test.mind'));
    cronStore = new CronStore(db);
    pendingApprovals = new Map();
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function wait(policy = resolveApprovalTimeoutPolicy({}), onSseEvent?: () => void) {
    const sseEvents: Array<{ event: string; data: Record<string, unknown> }> = [];
    const decision = waitForApprovalDecision({
      pendingApprovals,
      cronStore,
      requestId: 'approval-1',
      toolName: 'bash',
      input: { command: 'rm -rf /' },
      heldAction: {
        workspaceId: 'workspace-1',
        toolName: 'bash',
        argsJson: JSON.stringify({ command: 'rm -rf /' }),
        summary: 'Run a critical shell command',
        riskLevel: 'critical',
        approvalClass: 'critical',
      },
      heldEvent: {
        requestId: 'approval-1',
        toolName: 'bash',
        input: { command: 'rm -rf /' },
        held: true,
        message: 'Moved to Approvals inbox',
      },
      policy,
      sendEvent: (event, data) => {
        sseEvents.push({ event, data });
        onSseEvent?.();
      },
      onHeld: () => undefined,
    });
    return { decision, sseEvents };
  }

  it('defaults to a 300 second deny timeout', async () => {
    const policy = resolveApprovalTimeoutPolicy({});
    expect(policy).toEqual({ timeoutMs: 300_000, action: 'deny' });

    const { decision, sseEvents } = wait(policy);
    expect(pendingApprovals.has('approval-1')).toBe(true);

    await vi.advanceTimersByTimeAsync(299_999);
    expect(pendingApprovals.has('approval-1')).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    await expect(decision).resolves.toEqual({ approved: false, held: false, timedOut: true });
    expect(pendingApprovals.has('approval-1')).toBe(false);
    expect(cronStore.getPendingAction('approval-1')).toBeUndefined();
    expect(sseEvents).toEqual([]);
  });

  it('respects timeout and hold env overrides, persists for 24 hours, and emits before resolving false', async () => {
    const policy = resolveApprovalTimeoutPolicy({
      WAGGLE_APPROVAL_TIMEOUT_MS: '45000',
      WAGGLE_APPROVAL_TIMEOUT_ACTION: 'hold',
    });
    expect(policy).toEqual({ timeoutMs: 45_000, action: 'hold' });

    const order: string[] = [];
    const { decision, sseEvents } = wait(policy, () => order.push('approval_held'));
    void decision.then(() => order.push('resolved'));

    await vi.advanceTimersByTimeAsync(44_999);
    expect(cronStore.getPendingAction('approval-1')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    await expect(decision).resolves.toEqual({ approved: false, held: true, timedOut: true });
    expect(order).toEqual(['approval_held', 'resolved']);
    expect(sseEvents).toEqual([{
      event: 'approval_held',
      data: {
        requestId: 'approval-1',
        toolName: 'bash',
        input: { command: 'rm -rf /' },
        held: true,
        message: 'Moved to Approvals inbox',
        expiresAt: '2026-07-16T10:00:45.000Z',
      },
    }]);
    expect(cronStore.getPendingAction('approval-1')).toMatchObject({
      id: 'approval-1',
      workspace_id: 'workspace-1',
      source: 'approval-timeout:approval-1',
      tool_name: 'bash',
      args_json: JSON.stringify({ command: 'rm -rf /' }),
      summary: 'Run a critical shell command',
      risk_level: 'critical',
      approval_class: 'critical',
      status: 'held',
      expires_at: '2026-07-16T10:00:45.000Z',
    });
    // A critical timeout is only queued here; the existing held-action executor
    // remains the post-approval re-validation gate and is never invoked by timeout.
  });

  it('falls back to the safe defaults for invalid env values', () => {
    expect(resolveApprovalTimeoutPolicy({
      WAGGLE_APPROVAL_TIMEOUT_MS: 'not-a-number',
      WAGGLE_APPROVAL_TIMEOUT_ACTION: 'execute',
    })).toEqual({ timeoutMs: 300_000, action: 'deny' });
  });
});

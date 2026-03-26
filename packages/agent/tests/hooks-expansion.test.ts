import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HookRegistry, type HookContext, type HookEvent } from '../src/hooks.js';

describe('HookRegistry expansion', () => {
  let registry: HookRegistry;

  beforeEach(() => {
    registry = new HookRegistry();
  });

  // 1. New hook events can be registered and fired
  it('registers and fires new hook events', async () => {
    const events: HookEvent[] = ['pre:memory-write', 'post:memory-write', 'workflow:start', 'workflow:end'];
    const called: string[] = [];

    for (const event of events) {
      registry.on(event, () => { called.push(event); });
    }

    for (const event of events) {
      await registry.fire(event, {});
    }

    expect(called).toEqual(events);
  });

  // 2. pre:memory-write hook can cancel a memory save
  it('pre:memory-write hook can cancel with reason', async () => {
    registry.on('pre:memory-write', () => ({
      cancel: true,
      reason: 'PII detected',
    }));

    const result = await registry.fire('pre:memory-write', {
      memoryContent: 'SSN: 123-45-6789',
      memoryType: 'note',
    });

    expect(result.cancelled).toBe(true);
    expect(result.reason).toBe('PII detected');
  });

  // 3. post:memory-write hook receives the saved content
  it('post:memory-write hook receives memoryContent and memoryType', async () => {
    let captured: HookContext | undefined;
    registry.on('post:memory-write', (ctx) => {
      captured = ctx;
    });

    await registry.fire('post:memory-write', {
      memoryContent: 'Meeting notes from standup',
      memoryType: 'note',
      result: 'saved',
    });

    expect(captured).toBeDefined();
    expect(captured!.memoryContent).toBe('Meeting notes from standup');
    expect(captured!.memoryType).toBe('note');
    expect(captured!.result).toBe('saved');
  });

  // 4. workflow:start hook fires with workflow name and task
  it('workflow:start hook receives workflowName and workflowTask', async () => {
    let captured: HookContext | undefined;
    registry.on('workflow:start', (ctx) => {
      captured = ctx;
    });

    await registry.fire('workflow:start', {
      workflowName: 'research-team',
      workflowTask: 'Analyze competitor landscape',
    });

    expect(captured).toBeDefined();
    expect(captured!.workflowName).toBe('research-team');
    expect(captured!.workflowTask).toBe('Analyze competitor landscape');
  });

  // 5. workflow:end hook fires after workflow completes
  it('workflow:end hook receives workflowName and workflowTask', async () => {
    let captured: HookContext | undefined;
    registry.on('workflow:end', (ctx) => {
      captured = ctx;
    });

    await registry.fire('workflow:end', {
      workflowName: 'review-pair',
      workflowTask: 'Code review PR #42',
    });

    expect(captured).toBeDefined();
    expect(captured!.workflowName).toBe('review-pair');
    expect(captured!.workflowTask).toBe('Code review PR #42');
  });

  // 6. Workspace-scoped hook only fires for matching workspaceId
  it('onScoped fires for matching workspaceId', async () => {
    const fn = vi.fn();
    registry.onScoped('pre:tool', fn, { workspaceId: 'ws-123' });

    await registry.fire('pre:tool', { toolName: 'search', workspaceId: 'ws-123' });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-123' }));
  });

  // 7. Workspace-scoped hook does NOT fire for different workspaceId
  it('onScoped does NOT fire for different workspaceId', async () => {
    const fn = vi.fn();
    registry.onScoped('pre:tool', fn, { workspaceId: 'ws-123' });

    await registry.fire('pre:tool', { toolName: 'search', workspaceId: 'ws-456' });

    expect(fn).not.toHaveBeenCalled();
  });

  // 8. Activity log records hook fires
  it('activity log records hook fires', async () => {
    await registry.fire('pre:tool', { toolName: 'search' });
    await registry.fire('post:tool', { toolName: 'search', result: 'ok' });

    const log = registry.getActivityLog();
    expect(log).toHaveLength(2);
    expect(log[0].event).toBe('pre:tool');
    expect(log[0].cancelled).toBe(false);
    expect(log[1].event).toBe('post:tool');
    expect(log[1].cancelled).toBe(false);
    expect(typeof log[0].timestamp).toBe('number');
  });

  // 9. Activity log caps at 50 entries
  it('activity log caps at 50 entries', async () => {
    for (let i = 0; i < 60; i++) {
      await registry.fire('pre:tool', { toolName: `tool-${i}` });
    }

    const log = registry.getActivityLog();
    expect(log.length).toBe(50);
  });

  // 10. Activity log records cancelled status
  it('activity log records cancelled status and reason', async () => {
    registry.on('pre:tool', () => ({ cancel: true, reason: 'blocked by policy' }));

    await registry.fire('pre:tool', { toolName: 'dangerous_tool' });

    const log = registry.getActivityLog();
    expect(log).toHaveLength(1);
    expect(log[0].cancelled).toBe(true);
    expect(log[0].reason).toBe('blocked by policy');
  });

  // 11. getActivityLog returns readonly array
  it('getActivityLog returns readonly array', async () => {
    await registry.fire('pre:tool', { toolName: 'test' });

    const log = registry.getActivityLog();
    // TypeScript readonly enforcement — at runtime we verify it's an array
    expect(Array.isArray(log)).toBe(true);
    expect(log).toHaveLength(1);
  });

  // 12. Multiple hooks on same event all fire
  it('multiple hooks on same event all fire', async () => {
    const calls: string[] = [];
    registry.on('workflow:start', () => { calls.push('hook-1'); });
    registry.on('workflow:start', () => { calls.push('hook-2'); });
    registry.on('workflow:start', () => { calls.push('hook-3'); });

    await registry.fire('workflow:start', { workflowName: 'test' });

    expect(calls).toEqual(['hook-1', 'hook-2', 'hook-3']);
  });

  // Bonus: onScoped returns unsubscribe function
  it('onScoped returns working unsubscribe function', async () => {
    const fn = vi.fn();
    const unsub = registry.onScoped('pre:tool', fn, { workspaceId: 'ws-123' });

    await registry.fire('pre:tool', { toolName: 'test', workspaceId: 'ws-123' });
    expect(fn).toHaveBeenCalledTimes(1);

    unsub();
    await registry.fire('pre:tool', { toolName: 'test', workspaceId: 'ws-123' });
    expect(fn).toHaveBeenCalledTimes(1); // not called again
  });

  // Bonus: activity log records workspaceId
  it('activity log records workspaceId from context', async () => {
    await registry.fire('pre:tool', { toolName: 'test', workspaceId: 'ws-789' });

    const log = registry.getActivityLog();
    expect(log[0].workspaceId).toBe('ws-789');
  });

  // Backward compatibility: existing events still work
  it('existing hook events still work unchanged', async () => {
    const events: HookEvent[] = ['pre:tool', 'post:tool', 'session:start', 'session:end', 'pre:response', 'post:response'];
    const fired: string[] = [];

    for (const event of events) {
      registry.on(event, () => { fired.push(event); });
    }
    for (const event of events) {
      await registry.fire(event, {});
    }

    expect(fired).toEqual(events);
  });
});

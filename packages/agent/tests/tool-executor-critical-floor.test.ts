import { describe, it, expect, vi } from 'vitest';
import { executeToolCall } from '../src/tool-executor.js';
import { LoopGuard } from '../src/loop-guard.js';
import { HookRegistry } from '../src/hooks.js';
import { classifyGatedToolRisk, needsConfirmation, needsConfirmationWithAutonomy } from '../src/confirmation.js';
import type { ToolDefinition } from '../src/tools.js';
import type { RiskLevel } from '@waggle/shared';

/**
 * SEC-GATE — defense-in-depth state-change approval floor (step 4b).
 *
 * The confirmation-bypass let a spawn path constructed with `hooks: undefined`
 * execute CRITICAL_NEVER_AUTOPASS commands (rm -rf ~, sudo, git push --force
 * main, delete_skill, …) with no gate. These tests prove `executeToolCall`
 * now fail-closes such ops when no approval mechanism is present, and still
 * lets them through when an approval gate/hook is wired.
 *
 * WITHOUT the fix, every "denied" case below would EXECUTE the tool (the old
 * behaviour: no hooks ⇒ skip all gate logic), so these tests fail pre-fix.
 */

function tool(name: string, output: string, spy?: () => void, riskLevel?: RiskLevel): ToolDefinition {
  return {
    name,
    description: `test tool ${name}`,
    parameters: { type: 'object', properties: {} },
    execute: async () => { spy?.(); return output; },
    riskLevel,
  } as unknown as ToolDefinition;
}

function call(name: string, args: Record<string, unknown> = {}) {
  return { id: 'call_1', function: { name, arguments: JSON.stringify(args) } };
}

const CRITICAL_BASH = { command: 'rm -rf ~' };
const CRITICAL_FORCE_PUSH = { command: 'git push --force origin main' };

describe('tool-executor state-change approval floor (SEC-GATE step 4b)', () => {
  it('DENIES a critical bash command when no hook and no approval callback are wired', async () => {
    const spy = vi.fn();
    const toolMap = new Map([['bash', tool('bash', 'BASH_RAN', spy)]]);
    const r = await executeToolCall(call('bash', CRITICAL_BASH), { toolMap, guard: new LoopGuard() });
    expect(r.content).toContain('[BLOCKED]');
    expect(r.countedAsUsed).toBe(false);
    expect(spy).not.toHaveBeenCalled(); // tool never executed
  });

  it('DENIES a force-push to main with no gate', async () => {
    const spy = vi.fn();
    const toolMap = new Map([['bash', tool('bash', 'BASH_RAN', spy)]]);
    const r = await executeToolCall(call('bash', CRITICAL_FORCE_PUSH), { toolMap, guard: new LoopGuard() });
    expect(r.content).toContain('[BLOCKED]');
    expect(spy).not.toHaveBeenCalled();
  });

  it('DENIES delete_skill (critical regardless of args) with no gate', async () => {
    const spy = vi.fn();
    const toolMap = new Map([['delete_skill', tool('delete_skill', 'DELETED', spy)]]);
    const r = await executeToolCall(call('delete_skill', { name: 'x' }), { toolMap, guard: new LoopGuard() });
    expect(r.content).toContain('[BLOCKED]');
    expect(spy).not.toHaveBeenCalled();
  });

  it('DENIES a critical command when the hook registry has no approval result', async () => {
    const spy = vi.fn();
    const toolMap = new Map([['bash', tool('bash', 'BASH_RAN', spy)]]);
    const hooks = new HookRegistry();
    const r = await executeToolCall(call('bash', CRITICAL_BASH), {
      toolMap,
      guard: new LoopGuard(),
      hooks,
    });
    expect(r.content).toContain('[BLOCKED]');
    expect(spy).not.toHaveBeenCalled();
  });

  it('DENIES a critical command when only a non-authorizing hook runs', async () => {
    const spy = vi.fn();
    const toolMap = new Map([['bash', tool('bash', 'BASH_RAN', spy)]]);
    const hooks = new HookRegistry();
    hooks.on('pre:tool', () => undefined);
    const r = await executeToolCall(call('bash', CRITICAL_BASH), {
      toolMap,
      guard: new LoopGuard(),
      hooks,
    });
    expect(r.content).toContain('[BLOCKED]');
    expect(spy).not.toHaveBeenCalled();
  });

  it('DENIES a critical command when the approval hook throws', async () => {
    const spy = vi.fn();
    const toolMap = new Map([['bash', tool('bash', 'BASH_RAN', spy)]]);
    const hooks = new HookRegistry();
    hooks.on('pre:tool', () => {
      throw new Error('approval gate unavailable');
    });
    const r = await executeToolCall(call('bash', CRITICAL_BASH), {
      toolMap,
      guard: new LoopGuard(),
      hooks,
    });
    expect(r.content).toContain('[BLOCKED]');
    expect(spy).not.toHaveBeenCalled();
  });

  it('ALLOWS a critical command with explicit pre:tool authorization (main-loop path)', async () => {
    const spy = vi.fn();
    const toolMap = new Map([['bash', tool('bash', 'BASH_RAN', spy)]]);
    const hooks = new HookRegistry();
    hooks.on('pre:tool', () => ({ authorize: true }));
    const r = await executeToolCall(call('bash', CRITICAL_BASH), { toolMap, guard: new LoopGuard(), hooks });
    expect(r.content).toContain('BASH_RAN');
    expect(r.countedAsUsed).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('still lets the pre:tool hook DENY a critical command (hook cancel wins)', async () => {
    const spy = vi.fn();
    const toolMap = new Map([['bash', tool('bash', 'BASH_RAN', spy)]]);
    const hooks = new HookRegistry();
    hooks.on('pre:tool', () => ({ cancel: true, reason: 'user denied' }));
    const r = await executeToolCall(call('bash', CRITICAL_BASH), { toolMap, guard: new LoopGuard(), hooks });
    expect(r.content).toContain('[BLOCKED]');
    expect(r.content).toContain('user denied');
    expect(spy).not.toHaveBeenCalled();
  });

  it('ALLOWS a critical command when confirmCriticalAction approves (no hook)', async () => {
    const spy = vi.fn();
    const toolMap = new Map([['bash', tool('bash', 'BASH_RAN', spy)]]);
    const r = await executeToolCall(call('bash', CRITICAL_BASH), {
      toolMap, guard: new LoopGuard(), confirmCriticalAction: async () => true,
    });
    expect(r.content).toContain('BASH_RAN');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('DENIES a critical command when confirmCriticalAction rejects (no hook)', async () => {
    const spy = vi.fn();
    const toolMap = new Map([['bash', tool('bash', 'BASH_RAN', spy)]]);
    const r = await executeToolCall(call('bash', CRITICAL_BASH), {
      toolMap, guard: new LoopGuard(), confirmCriticalAction: async () => false,
    });
    expect(r.content).toContain('[BLOCKED]');
    expect(spy).not.toHaveBeenCalled();
  });

  it('DENIES a non-critical state-changing bash command when no approval gate is wired', async () => {
    const spy = vi.fn();
    const toolMap = new Map([['bash', tool('bash', 'DIRECTORY_CREATED', spy)]]);
    const r = await executeToolCall(call('bash', { command: 'mkdir work-output' }), { toolMap, guard: new LoopGuard() });
    expect(r.content).toContain('[BLOCKED]');
    expect(r.countedAsUsed).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([
    ['write_file', { path: 'report.md', content: 'unsafe write' }, undefined],
    ['opaque_connector_write', { task: 'create' }, 'medium' as RiskLevel],
    ['connector_database_drop_table', { table: 'users' }, undefined],
    ['connector_drive_remove', { id: 'shared-file' }, 'low' as RiskLevel],
    ['git_pull', { remote: 'origin', branch: 'main' }, undefined],
    ['git_branch', { action: 'create', name: 'feature/new' }, undefined],
    ['git_branch', { action: 'switch', name: 'feature/next' }, undefined],
    ['git_branch', { action: 'delete', name: 'feature/old' }, undefined],
    ['git_stash', { action: 'save', message: 'work' }, undefined],
    ['git_stash', { action: 'pop' }, undefined],
    ['git_stash', { action: 'drop' }, undefined],
  ])('DENIES confirmation-required %s when no approval gate is wired', async (name, args, riskLevel) => {
    const spy = vi.fn();
    const toolMap = new Map([[name, tool(name, 'MUTATION_RAN', spy, riskLevel)]]);

    const result = await executeToolCall(call(name, args), {
      toolMap,
      guard: new LoopGuard(),
    });

    expect(result.content).toContain('[BLOCKED]');
    expect(result.countedAsUsed).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('ALLOWS a confirmation-required write after explicit hook authorization', async () => {
    const spy = vi.fn();
    const toolMap = new Map([['write_file', tool('write_file', 'FILE_WRITTEN', spy)]]);
    const hooks = new HookRegistry();
    hooks.on('pre:tool', () => ({ authorize: true }));

    const result = await executeToolCall(call('write_file', {
      path: 'report.md',
      content: 'approved write',
    }), {
      toolMap,
      guard: new LoopGuard(),
      hooks,
    });

    expect(result.content).toContain('FILE_WRITTEN');
    expect(result.countedAsUsed).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('ALLOWS a critical connector action after explicit hook authorization', async () => {
    const spy = vi.fn();
    const name = 'connector_database_drop_table';
    const toolMap = new Map([[name, tool(name, 'TABLE_DROPPED', spy, 'low')]]);
    const hooks = new HookRegistry();
    hooks.on('pre:tool', () => ({ authorize: true }));

    const result = await executeToolCall(call(name, { table: 'approved_archive' }), {
      toolMap,
      guard: new LoopGuard(),
      hooks,
    });

    expect(result.content).toContain('TABLE_DROPPED');
    expect(result.countedAsUsed).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
  });

  it.each([
    ['git_branch', { action: 'list' }],
    ['git_stash', { action: 'list' }],
  ])('still ALLOWS read-only %s list operations without an approval gate', async (name, args) => {
    const spy = vi.fn();
    const toolMap = new Map([[name, tool(name, 'LISTING', spy)]]);

    const result = await executeToolCall(call(name, args), {
      toolMap,
      guard: new LoopGuard(),
    });

    expect(result.content).toContain('LISTING');
    expect(result.countedAsUsed).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('still ALLOWS a read-only tool when no approval gate is wired', async () => {
    const spy = vi.fn();
    const toolMap = new Map([['read_file', tool('read_file', 'CONTENTS', spy)]]);

    const result = await executeToolCall(call('read_file', { path: 'report.md' }), {
      toolMap,
      guard: new LoopGuard(),
    });

    expect(result.content).toContain('CONTENTS');
    expect(result.countedAsUsed).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
  });
});

describe('trusted ToolDefinition risk metadata at the pre:tool boundary', () => {
  it('forwards metadata to the confirmation hook and blocks an opaque medium-risk tool', async () => {
    const spy = vi.fn();
    const toolMap = new Map([
      ['opaque_plugin_action', tool('opaque_plugin_action', 'PLUGIN_RAN', spy, 'medium')],
    ]);
    const hooks = new HookRegistry();
    let observedRisk: unknown;
    hooks.on('pre:tool', (ctx) => {
      observedRisk = ctx.riskLevel;
      if (ctx.toolName && needsConfirmationWithAutonomy(
        ctx.toolName,
        ctx.args,
        'normal',
        ctx.riskLevel as RiskLevel | undefined,
      )) {
        return { cancel: true, reason: 'trusted risk requires approval' };
      }
    });

    const result = await executeToolCall(call('opaque_plugin_action', {
      riskLevel: 'low',
      _riskLevel: 'low',
    }), {
      toolMap,
      guard: new LoopGuard(),
      hooks,
    });

    expect(observedRisk).toBe('medium');
    expect(result.content).toContain('[BLOCKED]');
    expect(spy).not.toHaveBeenCalled();
  });

  it('fail-closes an opaque high-risk tool when no approval gate is wired', async () => {
    const spy = vi.fn();
    const toolMap = new Map([
      ['opaque_plugin_action', tool('opaque_plugin_action', 'PLUGIN_RAN', spy, 'high')],
    ]);

    const result = await executeToolCall(call('opaque_plugin_action'), {
      toolMap,
      guard: new LoopGuard(),
    });

    expect(result.content).toContain('[BLOCKED]');
    expect(result.countedAsUsed).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps high-risk metadata gated at YOLO and reports its stronger risk class', () => {
    expect(needsConfirmationWithAutonomy('opaque_plugin_action', {}, 'yolo', 'high')).toBe(true);
    expect(classifyGatedToolRisk('opaque_plugin_action', {}, 'high')).toEqual({
      riskLevel: 'high',
      approvalClass: 'critical',
    });
  });

  it('never lets low metadata downgrade name-based policy', () => {
    expect(needsConfirmation('connector_composio_execute_action', {}, 'low')).toBe(true);
    expect(classifyGatedToolRisk('connector_composio_execute_action', {}, 'low')).toEqual({
      riskLevel: 'high',
      approvalClass: 'critical',
    });
    expect(needsConfirmation('opaque_read_action', {}, 'low')).toBe(false);
  });
});

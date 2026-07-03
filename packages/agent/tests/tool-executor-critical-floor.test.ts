import { describe, it, expect, vi } from 'vitest';
import { executeToolCall } from '../src/tool-executor.js';
import { LoopGuard } from '../src/loop-guard.js';
import { HookRegistry } from '../src/hooks.js';
import type { ToolDefinition } from '../src/tools.js';

/**
 * SEC-GATE — defense-in-depth critical floor (tool-executor.ts step 4b).
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

function tool(name: string, output: string, spy?: () => void): ToolDefinition {
  return {
    name,
    description: `test tool ${name}`,
    parameters: { type: 'object', properties: {} },
    execute: async () => { spy?.(); return output; },
  } as unknown as ToolDefinition;
}

function call(name: string, args: Record<string, unknown> = {}) {
  return { id: 'call_1', function: { name, arguments: JSON.stringify(args) } };
}

const CRITICAL_BASH = { command: 'rm -rf ~' };
const CRITICAL_FORCE_PUSH = { command: 'git push --force origin main' };

describe('tool-executor critical-destructive hard floor (SEC-GATE step 4b)', () => {
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

  it('ALLOWS a critical command when a pre:tool approval hook is wired (main-loop path)', async () => {
    const spy = vi.fn();
    const toolMap = new Map([['bash', tool('bash', 'BASH_RAN', spy)]]);
    const hooks = new HookRegistry();
    hooks.on('pre:tool', () => { /* approve — no cancel */ });
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

  it('does NOT block non-critical commands with no gate (floor is surgical)', async () => {
    const spy = vi.fn();
    const toolMap = new Map([['bash', tool('bash', 'LISTING', spy)]]);
    const r = await executeToolCall(call('bash', { command: 'ls -la' }), { toolMap, guard: new LoopGuard() });
    expect(r.content).toContain('LISTING');
    expect(r.countedAsUsed).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
  });
});

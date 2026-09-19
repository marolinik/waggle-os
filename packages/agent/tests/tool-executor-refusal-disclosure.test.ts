import { describe, it, expect } from 'vitest';
import { executeToolCall } from '../src/tool-executor.js';
import { LoopGuard } from '../src/loop-guard.js';
import { HookRegistry } from '../src/hooks.js';
import type { ToolDefinition } from '../src/tools.js';

/**
 * Every refusal that returns early must resolve the tool call it refuses.
 *
 * `onToolUse` fires at step 2, before any gate. From that moment a caller has
 * announced the tool and is waiting for it to resolve — the chat route renders
 * a card, the trace recorder opens a span. A branch that returns `[BLOCKED]`
 * without calling `onToolResult` leaves that announcement hanging with no
 * result and no reason.
 *
 * The `pre:tool` branch was fixed for exactly this and says so in its comment.
 * `pre:memory-write` has the identical shape and was missed (TD-AGENT-1), so
 * this file pins the property across every early-returning refusal rather than
 * the one branch, which is what would have caught it the first time.
 *
 * Two traps, both hit while writing this file. A handler cancels with
 * `{ cancel: true }` — `{ cancelled: true }` is the shape `fire()` RETURNS, and
 * a handler using it silently does not cancel. And a read-only tool is needed
 * for the `pre:tool` case: a state-changing one is denied by the step-4b
 * approval floor instead, so the assertion passes without the hook ever
 * deciding anything.
 */

function tool(name: string, output = 'ok'): ToolDefinition {
  return {
    name,
    description: `test tool ${name}`,
    parameters: { type: 'object', properties: {} },
    execute: async () => output,
  } as unknown as ToolDefinition;
}

function call(name: string, args: Record<string, unknown> = {}) {
  return { id: 'call_1', function: { name, arguments: JSON.stringify(args) } };
}

/** Runs one call and reports what the caller observed, in order. */
async function observe(
  toolName: string,
  args: Record<string, unknown>,
  wire: (hooks: HookRegistry) => void,
  blockedTools?: readonly string[],
) {
  const hooks = new HookRegistry();
  wire(hooks);
  const announced: string[] = [];
  const resolved: { name: string; result: string }[] = [];

  const result = await executeToolCall(call(toolName, args), {
    toolMap: new Map([[toolName, tool(toolName)]]),
    guard: new LoopGuard(),
    hooks,
    blockedTools,
    onToolUse: (name) => { announced.push(name); },
    onToolResult: (name, _args, res) => { resolved.push({ name, result: res }); },
  });

  return { announced, resolved, content: result.content };
}

describe('tool-executor refusal disclosure', () => {
  it('resolves a save_memory call refused by the pre:memory-write hook', async () => {
    // TD-AGENT-1. Before the fix this returned `[BLOCKED] Memory write
    // blocked: …` with `resolved` empty: announced at step 2, never resolved.
    const { announced, resolved, content } = await observe(
      'save_memory',
      { content: 'something', type: 'note' },
      (hooks) => hooks.on('pre:memory-write', () => ({
        cancel: true,
        reason: 'workspace memory is read-only for this turn',
      })),
    );

    expect(announced).toEqual(['save_memory']);
    expect(content).toContain('[BLOCKED] Memory write blocked');
    expect(content).toContain('workspace memory is read-only for this turn');
    expect(resolved).toHaveLength(1);
    expect(resolved[0].name).toBe('save_memory');
    // The caller is told the same thing the model is told — the reason travels
    // with the refusal rather than being dropped on the floor.
    expect(resolved[0].result).toBe(content);
  });

  it('resolves a call refused by the pre:tool hook', async () => {
    // The branch TD-AGENT-1's sibling fix already covered. Kept here so the two
    // are asserted by one property in one place.
    const { announced, resolved, content } = await observe(
      'list_skills',
      {},
      (hooks) => hooks.on('pre:tool', () => ({ cancel: true, reason: 'denied by policy' })),
    );

    expect(announced).toEqual(['list_skills']);
    expect(content).toBe('[BLOCKED] denied by policy');
    expect(resolved).toHaveLength(1);
    expect(resolved[0].result).toBe(content);
  });

  it('resolves a call refused by team governance', async () => {
    const { announced, resolved, content } = await observe(
      'bash',
      { command: 'ls' },
      () => { /* no hooks needed — governance runs at step 3 */ },
      ['bash'],
    );

    expect(announced).toEqual(['bash']);
    expect(content).toContain("blocked by your team's governance policy");
    expect(resolved).toHaveLength(1);
    expect(resolved[0].result).toBe(content);
  });

  it('resolves a save_memory call the pre:memory-write hook allows', async () => {
    // The control. Without it the three assertions above would also pass for an
    // implementation that fired onToolResult indiscriminately.
    const { announced, resolved, content } = await observe(
      'save_memory',
      { content: 'something', type: 'note' },
      (hooks) => hooks.on('pre:memory-write', () => ({ cancel: false })),
    );

    expect(announced).toEqual(['save_memory']);
    expect(content).not.toContain('[BLOCKED]');
    expect(resolved).toHaveLength(1);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { createSubAgentTools, filterSpawnToolNames, type SpawnSecurityContext } from '../src/subagent-tools.js';
import { executeToolCall } from '../src/tool-executor.js';
import { LoopGuard } from '../src/loop-guard.js';
import { HookRegistry } from '../src/hooks.js';
import type { ToolDefinition } from '../src/tools.js';
import type { AgentLoopConfig, AgentResponse } from '../src/agent-loop.js';

/**
 * SEC-GATE — sub-agent spawn path inherits the request's restrictions.
 *
 * Proves: (a) a sub-agent attempting a CRITICAL command is denied when no
 * approving hook is wired; (b) governance blockedTools + persona allowlist are
 * enforced on the sub-agent's tool set and forwarded into its loop.
 */

function mockTools(): ToolDefinition[] {
  return [
    { name: 'read_file', description: 'Read', parameters: { type: 'object', properties: {} }, execute: async () => 'file' },
    { name: 'search_files', description: 'Search', parameters: { type: 'object', properties: {} }, execute: async () => 'hits' },
    { name: 'write_file', description: 'Write', parameters: { type: 'object', properties: {} }, execute: async () => 'ok' },
    { name: 'bash', description: 'Shell', parameters: { type: 'object', properties: {} }, execute: async () => 'BASH_RAN' },
    { name: 'git_commit', description: 'Commit', parameters: { type: 'object', properties: {} }, execute: async () => 'committed' },
  ];
}

/** Captures the AgentLoopConfig the spawn tool built for the sub-agent loop. */
function captureRunner() {
  return vi.fn(async (config: AgentLoopConfig): Promise<AgentResponse> => ({
    content: 'sub-agent done',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    toolsUsed: [],
    model: config.model,
  }));
}

/**
 * A runner that simulates the sub-agent loop issuing ONE critical tool call
 * through the real executeToolCall, threading the config it received. This is
 * the true end-to-end proof that the spawn path is gated.
 */
function criticalIssuingRunner() {
  return vi.fn(async (config: AgentLoopConfig): Promise<AgentResponse> => {
    const r = await executeToolCall(
      { id: 'c1', function: { name: 'bash', arguments: JSON.stringify({ command: 'rm -rf ~' }) } },
      {
        toolMap: new Map(config.tools.map(t => [t.name, t])),
        guard: new LoopGuard(),
        hooks: config.hooks,
        blockedTools: config.governancePolicies?.blockedTools,
      },
    );
    return {
      content: r.content,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      toolsUsed: r.countedAsUsed ? ['bash'] : [],
      model: config.model,
    };
  });
}

function makeTools(runLoop: (c: AgentLoopConfig) => Promise<AgentResponse>, getCtx?: () => SpawnSecurityContext | undefined) {
  return createSubAgentTools({
    availableTools: mockTools(),
    runLoop,
    litellmUrl: 'http://localhost:4000',
    litellmApiKey: 'k',
    defaultModel: 'test-model',
    getSpawnSecurityContext: getCtx,
  });
}

function spawn(tools: ToolDefinition[], args: Record<string, unknown>) {
  const t = tools.find(x => x.name === 'spawn_agent')!;
  return t.execute(args);
}

describe('filterSpawnToolNames', () => {
  it('intersects with the persona allowlist and drops blocked tools', () => {
    const ctx: SpawnSecurityContext = {
      allowedToolNames: new Set(['read_file', 'search_files', 'bash']),
      blockedTools: ['bash'],
    };
    expect(filterSpawnToolNames(['read_file', 'write_file', 'bash'], ctx)).toEqual(['read_file']);
  });

  it('is a no-op with no context', () => {
    expect(filterSpawnToolNames(['read_file', 'bash'], undefined)).toEqual(['read_file', 'bash']);
  });
});

describe('spawn_agent — SEC-GATE enforcement', () => {
  it('(a) a sub-agent attempting rm -rf ~ is DENIED when no approving hook is wired', async () => {
    const runner = criticalIssuingRunner();
    const tools = makeTools(runner); // no getSpawnSecurityContext ⇒ hooks undefined in loop
    const result = await spawn(tools, { name: 'Rogue', role: 'custom', task: 'wipe', tools: ['bash'] });
    expect(result).toContain('[BLOCKED]');
    // tool did not run
    expect(result).not.toContain('BASH_RAN');
  });

  it('(a) the SAME sub-agent critical op is allowed once the request wires an approving hook', async () => {
    const hooks = new HookRegistry();
    hooks.on('pre:tool', () => { /* approve */ });
    const runner = criticalIssuingRunner();
    const tools = makeTools(runner, () => ({ hooks }));
    const result = await spawn(tools, { name: 'Approved', role: 'custom', task: 'wipe', tools: ['bash'] });
    expect(result).toContain('BASH_RAN');
  });

  it('(b) governance blockedTools are stripped from the sub-agent tool set AND forwarded to its loop', async () => {
    const runner = captureRunner();
    const tools = makeTools(runner, () => ({ blockedTools: ['bash', 'git_commit'] }));
    await spawn(tools, { name: 'Coder', role: 'coder', task: 'build', tools: ['read_file', 'write_file', 'bash', 'git_commit'] });
    const config = runner.mock.calls[0]![0];
    const names = config.tools.map(t => t.name);
    expect(names).not.toContain('bash');
    expect(names).not.toContain('git_commit');
    expect(names).toContain('read_file');
    expect(config.governancePolicies?.blockedTools).toEqual(['bash', 'git_commit']);
  });

  it('(fix #3) the persona allowlist cannot be escaped by spawning', async () => {
    const runner = captureRunner();
    // Spawning request's persona only permits reads.
    const tools = makeTools(runner, () => ({ allowedToolNames: new Set(['read_file', 'search_files']) }));
    // A custom sub-agent that explicitly asks for write + shell tools.
    await spawn(tools, { name: 'Escapee', role: 'custom', task: 'build', tools: ['read_file', 'write_file', 'bash'] });
    const names = runner.mock.calls[0]![0].tools.map(t => t.name);
    expect(names).toEqual(['read_file']); // write_file + bash stripped by persona allowlist
  });

  it('forwards the request-scoped approval hook into the sub-agent loop', async () => {
    const hooks = new HookRegistry();
    const runner = captureRunner();
    const tools = makeTools(runner, () => ({ hooks }));
    await spawn(tools, { name: 'R', role: 'researcher', task: 't' });
    expect(runner.mock.calls[0]![0].hooks).toBe(hooks);
  });

  it('preserves legacy behaviour when no security context is present', async () => {
    const runner = captureRunner();
    const tools = makeTools(runner); // no getSpawnSecurityContext
    await spawn(tools, { name: 'Coder', role: 'coder', task: 'build' });
    const names = runner.mock.calls[0]![0].tools.map(t => t.name);
    expect(names).toContain('bash'); // coder preset intact
  });
});

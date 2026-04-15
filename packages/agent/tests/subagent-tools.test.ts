import { describe, it, expect, vi } from 'vitest';
import { createSubAgentTools } from '../src/subagent-tools.js';
import type { ToolDefinition } from '../src/tools.js';
import type { AgentLoopConfig, AgentResponse } from '../src/agent-loop.js';

function makeMockTools(): ToolDefinition[] {
  return [
    { name: 'web_search', description: 'Search', parameters: { type: 'object', properties: {} }, execute: async () => 'results' },
    { name: 'web_fetch', description: 'Fetch', parameters: { type: 'object', properties: {} }, execute: async () => 'content' },
    { name: 'read_file', description: 'Read', parameters: { type: 'object', properties: {} }, execute: async () => 'file content' },
    { name: 'write_file', description: 'Write', parameters: { type: 'object', properties: {} }, execute: async () => 'ok' },
    { name: 'bash', description: 'Shell', parameters: { type: 'object', properties: {} }, execute: async () => 'output' },
    { name: 'search_memory', description: 'Memory', parameters: { type: 'object', properties: {} }, execute: async () => 'memories' },
    { name: 'save_memory', description: 'Save', parameters: { type: 'object', properties: {} }, execute: async () => 'saved' },
  ];
}

function makeMockRunner(): (config: AgentLoopConfig) => Promise<AgentResponse> {
  return vi.fn(async (config: AgentLoopConfig): Promise<AgentResponse> => ({
    content: `Result from sub-agent. Task: ${config.messages[0]?.content}`,
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    toolsUsed: ['web_search', 'read_file'],
    model: config.model,
  }));
}

describe('subagent-tools', () => {
  function createTools(runLoop?: ReturnType<typeof makeMockRunner>) {
    return createSubAgentTools({
      availableTools: makeMockTools(),
      runLoop: runLoop ?? makeMockRunner(),
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'test-key',
      defaultModel: 'test-model',
    });
  }

  function run(tools: ReturnType<typeof createTools>, name: string, args: Record<string, unknown> = {}) {
    const tool = tools.find(t => t.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.execute(args);
  }

  it('spawn_agent runs a sub-agent and returns result', async () => {
    const runner = makeMockRunner();
    const tools = createTools(runner);
    const result = await run(tools, 'spawn_agent', {
      name: 'Research Bot',
      role: 'researcher',
      task: 'Find information about TypeScript 5.0',
    });
    expect(result).toContain('Sub-Agent Result: Research Bot');
    expect(result).toContain('researcher');
    expect(result).toContain('web_search, read_file');
    expect(runner).toHaveBeenCalledOnce();

    // Verify the runner was called with correct role-based tools
    const config = runner.mock.calls[0][0];
    const toolNames = config.tools.map((t: ToolDefinition) => t.name);
    expect(toolNames).toContain('web_search');
    expect(toolNames).toContain('web_fetch');
    expect(toolNames).toContain('read_file');
    expect(toolNames).not.toContain('bash'); // researcher shouldn't have bash
  });

  it('spawn_agent with coder role gets coding tools', async () => {
    const runner = makeMockRunner();
    const tools = createTools(runner);
    await run(tools, 'spawn_agent', {
      name: 'Coder',
      role: 'coder',
      task: 'Fix the bug',
    });
    const config = runner.mock.calls[0][0];
    const toolNames = config.tools.map((t: ToolDefinition) => t.name);
    expect(toolNames).toContain('bash');
    expect(toolNames).toContain('write_file');
  });

  it('spawn_agent with custom role uses specified tools', async () => {
    const runner = makeMockRunner();
    const tools = createTools(runner);
    await run(tools, 'spawn_agent', {
      name: 'Custom',
      role: 'custom',
      task: 'Do something',
      tools: ['bash', 'read_file'],
    });
    const config = runner.mock.calls[0][0];
    const toolNames = config.tools.map((t: ToolDefinition) => t.name);
    expect(toolNames).toEqual(['read_file', 'bash']);
  });

  it('spawn_agent handles errors gracefully', async () => {
    const runner = vi.fn(async () => { throw new Error('LLM connection failed'); });
    const tools = createSubAgentTools({
      availableTools: makeMockTools(),
      runLoop: runner,
      litellmUrl: 'http://localhost:4000',
      litellmApiKey: 'test-key',
    });
    const result = await run(tools, 'spawn_agent', {
      name: 'Failing Bot',
      role: 'researcher',
      task: 'This will fail',
    });
    expect(result).toContain('Sub-Agent Error');
    expect(result).toContain('LLM connection failed');
  });

  it('list_agents shows completed agents after spawns', async () => {
    const tools = createTools();
    await run(tools, 'spawn_agent', {
      name: 'Completed Bot',
      role: 'analyst',
      task: 'Analyze data',
    });
    const result = await run(tools, 'list_agents');
    expect(result).toContain('Completed Agents');
    expect(result).toContain('Completed Bot');
  });

  it('spawn_agent includes context in system prompt', async () => {
    const runner = makeMockRunner();
    const tools = createTools(runner);
    await run(tools, 'spawn_agent', {
      name: 'Context Bot',
      role: 'researcher',
      task: 'Research X',
      context: 'Project is about AI agents',
    });
    const config = runner.mock.calls[0][0];
    expect(config.systemPrompt).toContain('Project is about AI agents');
  });

  it('spawn_agent respects max_turns', async () => {
    const runner = makeMockRunner();
    const tools = createTools(runner);
    await run(tools, 'spawn_agent', {
      name: 'Limited Bot',
      role: 'researcher',
      task: 'Quick task',
      max_turns: 5,
    });
    const config = runner.mock.calls[0][0];
    expect(config.maxTurns).toBe(5);
  });

  // Gap L (Skills 2.0 verification): sub-agent results must persist beyond
  // the 30-min in-memory eviction via a caller-supplied completion callback.
  describe('onSubAgentComplete — gap L (result persistence)', () => {
    it('fires the callback once with the full SubAgentResult on success', async () => {
      const onComplete = vi.fn(async () => {});
      const tools = createSubAgentTools({
        availableTools: makeMockTools(),
        runLoop: makeMockRunner(),
        litellmUrl: 'http://localhost:4000',
        litellmApiKey: 'test-key',
        defaultModel: 'test-model',
        onSubAgentComplete: onComplete,
      });
      await run(tools, 'spawn_agent', {
        name: 'Persisted Bot',
        role: 'analyst',
        task: 'Do a thing',
      });
      expect(onComplete).toHaveBeenCalledOnce();
      const arg = onComplete.mock.calls[0][0];
      expect(arg).toMatchObject({
        agentName: 'Persisted Bot',
        role: 'analyst',
        response: expect.stringContaining('Do a thing'),
        toolsUsed: expect.any(Array),
        usage: { inputTokens: 100, outputTokens: 50 },
      });
      expect(typeof arg.duration).toBe('number');
      expect(typeof arg.completedAt).toBe('number');
      expect(typeof arg.agentId).toBe('string');
    });

    it('does NOT fire the callback when the sub-agent errors', async () => {
      const onComplete = vi.fn(async () => {});
      const failingRunner = vi.fn(async () => { throw new Error('LLM down'); });
      const tools = createSubAgentTools({
        availableTools: makeMockTools(),
        runLoop: failingRunner,
        litellmUrl: 'http://localhost:4000',
        litellmApiKey: 'test-key',
        onSubAgentComplete: onComplete,
      });
      const result = await run(tools, 'spawn_agent', {
        name: 'Broken Bot',
        role: 'researcher',
        task: 'Will fail',
      });
      expect(result).toContain('Sub-Agent Error');
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('swallows callback errors — persistence failure must not break the return', async () => {
      const onComplete = vi.fn(async () => { throw new Error('DB write failed'); });
      const tools = createSubAgentTools({
        availableTools: makeMockTools(),
        runLoop: makeMockRunner(),
        litellmUrl: 'http://localhost:4000',
        litellmApiKey: 'test-key',
        onSubAgentComplete: onComplete,
      });
      const result = await run(tools, 'spawn_agent', {
        name: 'Survivor Bot',
        role: 'researcher',
        task: 'Main agent still gets the result',
      });
      expect(onComplete).toHaveBeenCalledOnce();
      // Main-agent-visible string unaffected by the persistence failure
      expect(result).toContain('Sub-Agent Result: Survivor Bot');
      expect(result).not.toContain('DB write failed');
    });

    it('still works when no callback is provided (backwards-compatible)', async () => {
      const tools = createTools();
      const result = await run(tools, 'spawn_agent', {
        name: 'Legacy Bot',
        role: 'researcher',
        task: 'No callback wired',
      });
      expect(result).toContain('Sub-Agent Result: Legacy Bot');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubagentOrchestrator, type WorkflowTemplate, type OrchestratorConfig } from '../src/subagent-orchestrator.js';
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
    { name: 'search_files', description: 'Search files', parameters: { type: 'object', properties: {} }, execute: async () => 'files' },
    { name: 'search_content', description: 'Search content', parameters: { type: 'object', properties: {} }, execute: async () => 'content' },
  ];
}

function makeMockRunner() {
  return vi.fn(async (config: AgentLoopConfig): Promise<AgentResponse> => ({
    content: `Result for: ${config.messages[0]?.content}`,
    usage: { inputTokens: 100, outputTokens: 50 },
    toolsUsed: ['web_search'],
  }));
}

function makeConfig(runLoop?: ReturnType<typeof makeMockRunner>): OrchestratorConfig {
  return {
    availableTools: makeMockTools(),
    runLoop: runLoop ?? makeMockRunner(),
    litellmUrl: 'http://localhost:4000',
    litellmApiKey: 'test-key',
    defaultModel: 'test-model',
  };
}

describe('SubagentOrchestrator', () => {
  let orchestrator: SubagentOrchestrator;
  let runner: ReturnType<typeof makeMockRunner>;

  beforeEach(() => {
    runner = makeMockRunner();
    orchestrator = new SubagentOrchestrator(makeConfig(runner));
  });

  it('constructor creates orchestrator', () => {
    expect(orchestrator).toBeInstanceOf(SubagentOrchestrator);
    expect(orchestrator.getWorkers()).toEqual([]);
  });

  it('runWorkflow executes steps in order', async () => {
    const callOrder: string[] = [];
    runner.mockImplementation(async (config: AgentLoopConfig) => {
      // Extract the step name from the system prompt
      const match = config.systemPrompt.match(/Sub-Agent: (.+)/);
      callOrder.push(match?.[1] ?? 'unknown');
      return {
        content: `Result from ${match?.[1]}`,
        usage: { inputTokens: 100, outputTokens: 50 },
        toolsUsed: ['web_search'],
      };
    });

    const template: WorkflowTemplate = {
      name: 'test-workflow',
      description: 'Test workflow',
      steps: [
        { name: 'Step A', role: 'researcher', task: 'Research something' },
        { name: 'Step B', role: 'writer', task: 'Write something' },
      ],
      aggregation: 'concatenate',
    };

    const result = await orchestrator.runWorkflow(template);
    expect(callOrder).toEqual(['Step A', 'Step B']);
    expect(result.results.size).toBe(2);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it('dependsOn is respected — step B waits for step A', async () => {
    const callOrder: string[] = [];
    runner.mockImplementation(async (config: AgentLoopConfig) => {
      const match = config.systemPrompt.match(/Sub-Agent: (.+)/);
      callOrder.push(match?.[1] ?? 'unknown');
      return {
        content: `Done: ${match?.[1]}`,
        usage: { inputTokens: 100, outputTokens: 50 },
        toolsUsed: [],
      };
    });

    const template: WorkflowTemplate = {
      name: 'dep-workflow',
      description: 'Dependency workflow',
      steps: [
        { name: 'Step A', role: 'researcher', task: 'First task' },
        { name: 'Step B', role: 'writer', task: 'Second task', dependsOn: ['Step A'] },
      ],
      aggregation: 'concatenate',
    };

    await orchestrator.runWorkflow(template);
    expect(callOrder).toEqual(['Step A', 'Step B']);
  });

  it('contextFrom injects previous results into system prompt', async () => {
    const systemPrompts: string[] = [];
    runner.mockImplementation(async (config: AgentLoopConfig) => {
      systemPrompts.push(config.systemPrompt);
      const match = config.systemPrompt.match(/Sub-Agent: (.+)/);
      return {
        content: `Result from ${match?.[1]}`,
        usage: { inputTokens: 100, outputTokens: 50 },
        toolsUsed: [],
      };
    });

    const template: WorkflowTemplate = {
      name: 'context-workflow',
      description: 'Context injection workflow',
      steps: [
        { name: 'Research', role: 'researcher', task: 'Find data' },
        { name: 'Write', role: 'writer', task: 'Write report', contextFrom: ['Research'] },
      ],
      aggregation: 'last',
    };

    await orchestrator.runWorkflow(template);

    // Second step's system prompt should contain the first step's result
    expect(systemPrompts[1]).toContain('Result from Research');
    expect(systemPrompts[1]).toContain('Research');
    // First step should NOT contain context from others
    expect(systemPrompts[0]).not.toContain('Previous Results');
  });

  it('worker status tracking — getWorkers returns correct statuses', async () => {
    const template: WorkflowTemplate = {
      name: 'status-workflow',
      description: 'Status tracking workflow',
      steps: [
        { name: 'Worker 1', role: 'researcher', task: 'Do research' },
        { name: 'Worker 2', role: 'writer', task: 'Write docs' },
      ],
      aggregation: 'concatenate',
    };

    await orchestrator.runWorkflow(template);
    const workers = orchestrator.getWorkers();
    expect(workers).toHaveLength(2);
    expect(workers[0].status).toBe('done');
    expect(workers[1].status).toBe('done');
    expect(workers[0].name).toBe('Worker 1');
    expect(workers[1].name).toBe('Worker 2');
    expect(workers[0].result).toContain('Result for');
    expect(workers[0].startedAt).toBeDefined();
    expect(workers[0].completedAt).toBeDefined();
    expect(workers[0].completedAt!).toBeGreaterThanOrEqual(workers[0].startedAt!);
  });

  it('worker:status events emitted', async () => {
    const events: Array<{ workerId: string; status: string }> = [];
    orchestrator.on('worker:status', (data) => {
      events.push({ workerId: data.workerId, status: data.status });
    });

    const template: WorkflowTemplate = {
      name: 'event-workflow',
      description: 'Event workflow',
      steps: [
        { name: 'Solo', role: 'researcher', task: 'Do work' },
      ],
      aggregation: 'last',
    };

    await orchestrator.runWorkflow(template);

    // Should have 'pending', 'running', and 'done' events in order
    const statuses = events.map(e => e.status);
    expect(statuses).toContain('pending');
    expect(statuses).toContain('running');
    expect(statuses).toContain('done');
    expect(statuses.indexOf('pending')).toBeLessThan(statuses.indexOf('running'));
    expect(statuses.indexOf('running')).toBeLessThan(statuses.indexOf('done'));
  });

  it('workers start as pending before execution begins', async () => {
    const statesObserved: Array<{ name: string; status: string }> = [];
    orchestrator.on('worker:status', (data) => {
      statesObserved.push({ name: data.workerState.name, status: data.status });
    });

    const template: WorkflowTemplate = {
      name: 'pending-workflow',
      description: 'Pending state workflow',
      steps: [
        { name: 'First', role: 'researcher', task: 'Task 1' },
        { name: 'Second', role: 'writer', task: 'Task 2', dependsOn: ['First'] },
      ],
      aggregation: 'concatenate',
    };

    await orchestrator.runWorkflow(template);

    // Both workers should emit 'pending' before any 'running'
    const firstPending = statesObserved.findIndex(s => s.name === 'First' && s.status === 'pending');
    const secondPending = statesObserved.findIndex(s => s.name === 'Second' && s.status === 'pending');
    const firstRunning = statesObserved.findIndex(s => s.name === 'First' && s.status === 'running');

    expect(firstPending).toBeGreaterThanOrEqual(0);
    expect(secondPending).toBeGreaterThanOrEqual(0);
    // Both pending events should fire before any running
    expect(firstPending).toBeLessThan(firstRunning);
    expect(secondPending).toBeLessThan(firstRunning);
  });

  it('failed worker sets error status', async () => {
    runner.mockImplementation(async () => {
      throw new Error('LLM connection failed');
    });

    const template: WorkflowTemplate = {
      name: 'fail-workflow',
      description: 'Failure workflow',
      steps: [
        { name: 'Failing Worker', role: 'researcher', task: 'This will fail' },
      ],
      aggregation: 'last',
    };

    const result = await orchestrator.runWorkflow(template);
    const workers = orchestrator.getWorkers();
    expect(workers).toHaveLength(1);
    expect(workers[0].status).toBe('failed');
    expect(workers[0].error).toBe('LLM connection failed');
    expect(workers[0].completedAt).toBeDefined();
  });

  it('aggregation concatenate joins all results', async () => {
    runner.mockImplementation(async (config: AgentLoopConfig) => {
      const match = config.systemPrompt.match(/Sub-Agent: (.+)/);
      return {
        content: `Output-${match?.[1]}`,
        usage: { inputTokens: 100, outputTokens: 50 },
        toolsUsed: [],
      };
    });

    const template: WorkflowTemplate = {
      name: 'concat-workflow',
      description: 'Concat workflow',
      steps: [
        { name: 'A', role: 'researcher', task: 'Task A' },
        { name: 'B', role: 'writer', task: 'Task B' },
      ],
      aggregation: 'concatenate',
    };

    const result = await orchestrator.runWorkflow(template);
    expect(result.aggregated).toContain('Output-A');
    expect(result.aggregated).toContain('Output-B');
    expect(result.aggregated).toContain('A'); // header
    expect(result.aggregated).toContain('B'); // header
  });

  it('aggregation last returns only last step result', async () => {
    runner.mockImplementation(async (config: AgentLoopConfig) => {
      const match = config.systemPrompt.match(/Sub-Agent: (.+)/);
      return {
        content: `Output-${match?.[1]}`,
        usage: { inputTokens: 100, outputTokens: 50 },
        toolsUsed: [],
      };
    });

    const template: WorkflowTemplate = {
      name: 'last-workflow',
      description: 'Last workflow',
      steps: [
        { name: 'First', role: 'researcher', task: 'Task 1' },
        { name: 'Last', role: 'writer', task: 'Task 2' },
      ],
      aggregation: 'last',
    };

    const result = await orchestrator.runWorkflow(template);
    expect(result.aggregated).toBe('Output-Last');
    expect(result.aggregated).not.toContain('Output-First');
  });

  it('aggregation synthesize spawns extra synthesizer worker', async () => {
    runner.mockImplementation(async (config: AgentLoopConfig) => {
      const match = config.systemPrompt.match(/Sub-Agent: (.+)/);
      const name = match?.[1] ?? 'unknown';
      return {
        content: name.startsWith('Synthesizer') ? 'Final synthesis' : `Output-${name}`,
        usage: { inputTokens: 100, outputTokens: 50 },
        toolsUsed: [],
      };
    });

    const template: WorkflowTemplate = {
      name: 'synth-workflow',
      description: 'Synthesize workflow',
      steps: [
        { name: 'Research', role: 'researcher', task: 'Research' },
        { name: 'Analysis', role: 'analyst', task: 'Analyze' },
      ],
      aggregation: 'synthesize',
    };

    const result = await orchestrator.runWorkflow(template);
    // Should have 3 calls — 2 steps + 1 synthesizer
    expect(runner).toHaveBeenCalledTimes(3);
    expect(result.aggregated).toBe('Final synthesis');
  });

  it('getActiveWorkers returns only running workers', async () => {
    // Before any workflow, no active workers
    expect(orchestrator.getActiveWorkers()).toEqual([]);

    // After workflow completes, no active workers (all done)
    const template: WorkflowTemplate = {
      name: 'active-workflow',
      description: 'Active workflow',
      steps: [
        { name: 'Worker', role: 'researcher', task: 'Work' },
      ],
      aggregation: 'last',
    };

    await orchestrator.runWorkflow(template);
    expect(orchestrator.getActiveWorkers()).toEqual([]);
    expect(orchestrator.getWorkers()).toHaveLength(1);
  });

  it('empty workflow returns empty results', async () => {
    const template: WorkflowTemplate = {
      name: 'empty-workflow',
      description: 'Empty workflow',
      steps: [],
      aggregation: 'concatenate',
    };

    const result = await orchestrator.runWorkflow(template);
    expect(result.results.size).toBe(0);
    expect(result.aggregated).toBe('');
    expect(runner).not.toHaveBeenCalled();
  });

  it('role tool presets are accessible', () => {
    expect(SubagentOrchestrator.ROLE_TOOL_PRESETS.researcher).toContain('web_search');
    expect(SubagentOrchestrator.ROLE_TOOL_PRESETS.coder).toContain('bash');
    expect(SubagentOrchestrator.ROLE_TOOL_PRESETS.synthesizer).toContain('save_memory');
    expect(SubagentOrchestrator.ROLE_TOOL_PRESETS.summarizer).toContain('read_file');
  });

  it('worker tools are filtered from available tools by role preset', async () => {
    runner.mockImplementation(async (config: AgentLoopConfig) => {
      const toolNames = config.tools.map(t => t.name);
      return {
        content: `Tools: ${toolNames.join(', ')}`,
        usage: { inputTokens: 100, outputTokens: 50 },
        toolsUsed: toolNames,
      };
    });

    const template: WorkflowTemplate = {
      name: 'tool-filter-workflow',
      description: 'Tool filter workflow',
      steps: [
        { name: 'Coder', role: 'coder', task: 'Code something' },
      ],
      aggregation: 'last',
    };

    await orchestrator.runWorkflow(template);
    const call = runner.mock.calls[0][0];
    const toolNames = call.tools.map((t: ToolDefinition) => t.name);
    expect(toolNames).toContain('bash');
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('write_file');
    // researcher-only tools should not be present
    expect(toolNames).not.toContain('web_search');
  });

  it('step with explicit tools overrides role preset', async () => {
    runner.mockImplementation(async (config: AgentLoopConfig) => ({
      content: 'done',
      usage: { inputTokens: 100, outputTokens: 50 },
      toolsUsed: [],
    }));

    const template: WorkflowTemplate = {
      name: 'custom-tools-workflow',
      description: 'Custom tools workflow',
      steps: [
        { name: 'Custom', role: 'researcher', task: 'Custom task', tools: ['bash', 'read_file'] },
      ],
      aggregation: 'last',
    };

    await orchestrator.runWorkflow(template);
    const call = runner.mock.calls[0][0];
    const toolNames = call.tools.map((t: ToolDefinition) => t.name);
    expect(toolNames).toContain('bash');
    expect(toolNames).toContain('read_file');
    expect(toolNames).not.toContain('web_search'); // researcher default, but overridden
  });

  it('tracks usage tokens per worker', async () => {
    runner.mockImplementation(async () => ({
      content: 'done',
      usage: { inputTokens: 200, outputTokens: 100 },
      toolsUsed: ['web_search', 'read_file'],
    }));

    const template: WorkflowTemplate = {
      name: 'usage-workflow',
      description: 'Usage workflow',
      steps: [
        { name: 'W1', role: 'researcher', task: 'Work' },
      ],
      aggregation: 'last',
    };

    await orchestrator.runWorkflow(template);
    const workers = orchestrator.getWorkers();
    expect(workers[0].usage).toEqual({ inputTokens: 200, outputTokens: 100 });
    expect(workers[0].toolsUsed).toEqual(['web_search', 'read_file']);
  });
});

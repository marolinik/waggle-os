import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubagentOrchestrator, type WorkflowTemplate, type OrchestratorConfig } from '../src/subagent-orchestrator.js';
import type { ToolDefinition } from '../src/tools.js';
import type { AgentLoopConfig, AgentResponse } from '../src/agent-loop.js';

function makeMockTools(): ToolDefinition[] {
  return [
    { name: 'web_search', description: 'Search', parameters: { type: 'object', properties: {} }, execute: async () => 'results' },
    { name: 'read_file', description: 'Read', parameters: { type: 'object', properties: {} }, execute: async () => 'file content' },
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

describe('SubagentOrchestrator circular-dependency failure branch (R3-002)', () => {
  let orchestrator: SubagentOrchestrator;
  let runner: ReturnType<typeof makeMockRunner>;

  beforeEach(() => {
    runner = makeMockRunner();
    orchestrator = new SubagentOrchestrator(makeConfig(runner));
  });

  it('does NOT mint duplicate worker ids on circular dependency — reuses pre-created pending entries', async () => {
    // Two steps depending on each other => unresolvable circular dependency.
    const template: WorkflowTemplate = {
      name: 'circular-workflow',
      description: 'Mutually dependent steps',
      steps: [
        { name: 'Step A', role: 'researcher', task: 'A needs B', dependsOn: ['Step B'] },
        { name: 'Step B', role: 'researcher', task: 'B needs A', dependsOn: ['Step A'] },
      ],
      aggregation: 'concatenate',
    };

    const result = await orchestrator.runWorkflow(template);
    const workers = orchestrator.getWorkers();

    // BUG: previously this minted NEW ids for the failed entries, leaving the
    // original pre-created pending entries as ghosts => 4 workers (2 ghost
    // pending + 2 failed). Correct behavior is exactly 2 failed workers.
    expect(workers).toHaveLength(2);
    expect(result.results.size).toBe(2);

    // No permanently-pending ghost entries should survive.
    const pending = workers.filter(w => w.status === 'pending');
    expect(pending).toHaveLength(0);

    // Both circular steps should be marked failed.
    const failed = workers.filter(w => w.status === 'failed');
    expect(failed).toHaveLength(2);
    expect(failed.every(w => /[Cc]ircular dependency/.test(w.error ?? ''))).toBe(true);

    // Worker ids must be unique (no duplicate orphan ids).
    const ids = workers.map(w => w.id);
    expect(new Set(ids).size).toBe(ids.length);

    // The failed entry for each step must reuse the id assigned at pre-creation,
    // identifiable by name — exactly one worker per step name.
    const byName = new Map<string, number>();
    for (const w of workers) byName.set(w.name, (byName.get(w.name) ?? 0) + 1);
    expect(byName.get('Step A')).toBe(1);
    expect(byName.get('Step B')).toBe(1);

    // The runner is never invoked for an unresolvable workflow.
    expect(runner).not.toHaveBeenCalled();
  });

  it('preserves the original step role on the failed entry (not "unknown")', async () => {
    const template: WorkflowTemplate = {
      name: 'circular-role',
      description: 'Circular pair with a known role',
      steps: [
        { name: 'Writer Step', role: 'writer', task: 'needs reviewer', dependsOn: ['Reviewer Step'] },
        { name: 'Reviewer Step', role: 'reviewer', task: 'needs writer', dependsOn: ['Writer Step'] },
      ],
      aggregation: 'concatenate',
    };

    await orchestrator.runWorkflow(template);
    const workers = orchestrator.getWorkers();
    const writer = workers.find(w => w.name === 'Writer Step');
    expect(writer).toBeDefined();
    expect(writer!.role).toBe('writer');
  });
});

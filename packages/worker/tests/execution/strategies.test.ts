import { describe, it, expect, vi } from 'vitest';
import { executeParallel, type AgentMemberConfig, type ExecutionDeps } from '../../src/execution/parallel.js';
import { executeSequential } from '../../src/execution/sequential.js';
import { executeCoordinator } from '../../src/execution/coordinator.js';

const mockMembers: AgentMemberConfig[] = [
  {
    member: { roleInGroup: 'lead', executionOrder: 0 },
    agent: { id: 'a1', name: 'leader', model: 'claude-sonnet', systemPrompt: 'You are a leader.', tools: ['search_memory'] },
  },
  {
    member: { roleInGroup: 'worker', executionOrder: 1 },
    agent: { id: 'a2', name: 'researcher', model: 'claude-haiku', systemPrompt: 'You are a researcher.', tools: ['web_search'] },
  },
  {
    member: { roleInGroup: 'worker', executionOrder: 2 },
    agent: { id: 'a3', name: 'writer', model: 'claude-haiku', systemPrompt: 'You are a writer.', tools: ['write_file'] },
  },
];

// ── Mock ExecutionDeps ─────────────────────────────────────────────────

function createMockDeps(overrides?: Partial<ExecutionDeps>): ExecutionDeps {
  return {
    runAgent: vi.fn(async (config) => ({
      content: `Output from agent with prompt: ${config.systemPrompt.slice(0, 30)}...`,
      toolsUsed: ['mock_tool'],
      usage: { inputTokens: 100, outputTokens: 50 },
    })),
    resolveTools: vi.fn((names) => names.map(n => ({
      name: n,
      description: `Mock ${n}`,
      parameters: { type: 'object', properties: {} },
      execute: async () => 'ok',
    }))),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Stub mode (backward compat — no deps passed)
// ═══════════════════════════════════════════════════════════════════════

describe('Execution Strategies (stub mode)', () => {
  describe('parallel', () => {
    it('runs all agents and merges output', async () => {
      const result = await executeParallel(mockMembers, { task: 'test' });

      expect(result.strategy).toBe('parallel');
      expect(result.agentCount).toBe(3);
      expect(result.results).toHaveLength(3);
      expect(result.mergedOutput).toContain('leader');
      expect(result.mergedOutput).toContain('researcher');
      expect(result.mergedOutput).toContain('writer');
    });

    it('includes agent metadata in each result', async () => {
      const result = await executeParallel(mockMembers, { task: 'test' });
      const results = result.results as Array<Record<string, unknown>>;

      expect(results[0]).toMatchObject({
        agentId: 'a1',
        agentName: 'leader',
        model: 'claude-sonnet',
        role: 'lead',
      });
    });

    it('handles single agent', async () => {
      const single = [mockMembers[0]];
      const result = await executeParallel(single, {});

      expect(result.agentCount).toBe(1);
      expect(result.results).toHaveLength(1);
    });
  });

  describe('sequential', () => {
    it('chains output through agents in order', async () => {
      const result = await executeSequential(mockMembers, { task: 'test' });

      expect(result.strategy).toBe('sequential');
      expect(result.agentCount).toBe(3);
      expect(result.results).toHaveLength(3);
      expect(result.finalOutput).toContain('writer');
    });

    it('first agent receives taskInput, subsequent receive previous output', async () => {
      const result = await executeSequential(mockMembers, { task: 'test' });
      const results = result.results as Array<Record<string, unknown>>;

      expect(results[0].inputFrom).toBe('taskInput');
      expect(results[1].inputFrom).toBe('leader');
      expect(results[2].inputFrom).toBe('researcher');
    });

    it('handles single agent', async () => {
      const single = [mockMembers[0]];
      const result = await executeSequential(single, { data: 'input' });

      expect(result.agentCount).toBe(1);
      expect(result.finalOutput).toContain('leader');
    });

    it('handles empty members list', async () => {
      const result = await executeSequential([], {});

      expect(result.agentCount).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(result.finalOutput).toBeNull();
    });
  });

  describe('coordinator', () => {
    it('lead delegates, workers execute, lead synthesizes', async () => {
      const result = await executeCoordinator(mockMembers, { task: 'test' });

      expect(result.strategy).toBe('coordinator');
      expect(result.leadAgent).toBe('leader');
      expect(result.workerCount).toBe(2);
      expect(result.plan).toBeDefined();
      expect(result.workerResults).toHaveLength(2);
      expect(result.synthesis).toBeDefined();
      expect(result.finalOutput).toContain('synthesized');
    });

    it('only workers appear in workerResults (not lead)', async () => {
      const result = await executeCoordinator(mockMembers, {});
      const workerResults = result.workerResults as Array<Record<string, unknown>>;

      const agentNames = workerResults.map(r => r.agentName);
      expect(agentNames).toContain('researcher');
      expect(agentNames).toContain('writer');
      expect(agentNames).not.toContain('leader');
    });

    it('plan includes subtask assignments', async () => {
      const result = await executeCoordinator(mockMembers, {});
      const plan = result.plan as Record<string, unknown>;

      expect(plan.phase).toBe('planning');
      expect(plan.subtasks).toHaveLength(2);
    });

    it('synthesis references worker count', async () => {
      const result = await executeCoordinator(mockMembers, {});
      const synthesis = result.synthesis as Record<string, unknown>;

      expect(synthesis.phase).toBe('synthesis');
      expect(synthesis.output).toContain('2');
    });

    it('throws if no lead agent', async () => {
      const noLead = mockMembers.map(m => ({
        ...m,
        member: { ...m.member, roleInGroup: 'worker' },
      }));

      await expect(executeCoordinator(noLead, {})).rejects.toThrow('requires a lead');
    });

    it('works with lead and no workers', async () => {
      const leadOnly: AgentMemberConfig[] = [{
        member: { roleInGroup: 'lead', executionOrder: 0 },
        agent: { id: 'a1', name: 'solo-lead', model: 'claude-sonnet', systemPrompt: null, tools: [] },
      }];

      const result = await executeCoordinator(leadOnly, {});

      expect(result.workerCount).toBe(0);
      expect(result.workerResults).toHaveLength(0);
      expect(result.finalOutput).toContain('synthesized 0');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Real execution (with mocked runAgent via ExecutionDeps)
// ═══════════════════════════════════════════════════════════════════════

describe('Execution Strategies (real execution)', () => {
  describe('parallel with deps', () => {
    it('runs all agents concurrently via runAgent', async () => {
      const deps = createMockDeps();
      const result = await executeParallel(mockMembers, { task: 'analyze data' }, deps);

      expect(result.strategy).toBe('parallel');
      expect(result.agentCount).toBe(3);
      expect(deps.runAgent).toHaveBeenCalledTimes(3);
    });

    it('each agent gets its own systemPrompt and resolved tools', async () => {
      const deps = createMockDeps();
      await executeParallel(mockMembers, { task: 'analyze' }, deps);

      // Check that resolveTools was called with each agent's tool list
      expect(deps.resolveTools).toHaveBeenCalledWith(['search_memory']);
      expect(deps.resolveTools).toHaveBeenCalledWith(['web_search']);
      expect(deps.resolveTools).toHaveBeenCalledWith(['write_file']);
    });

    it('captures output, toolsUsed, and usage from each agent', async () => {
      const deps = createMockDeps();
      const result = await executeParallel(mockMembers, { task: 'test' }, deps);
      const results = result.results as Array<Record<string, unknown>>;

      expect(results[0].toolsUsed).toEqual(['mock_tool']);
      expect(results[0].usage).toEqual({ inputTokens: 100, outputTokens: 50 });
      expect(typeof results[0].output).toBe('string');
      expect((results[0].output as string).length).toBeGreaterThan(0);
    });

    it('handles one agent failing (others still complete)', async () => {
      const deps = createMockDeps({
        runAgent: vi.fn(async (config) => {
          if (config.systemPrompt.includes('researcher')) throw new Error('API timeout');
          return { content: 'OK', toolsUsed: [], usage: { inputTokens: 10, outputTokens: 5 } };
        }),
      });
      const result = await executeParallel(mockMembers, { task: 'test' }, deps);

      // All 3 agents attempted
      expect(result.agentCount).toBe(3);
      // Error captured, not thrown
      const errors = result.errors as Array<Record<string, unknown>>;
      expect(errors).toHaveLength(1);
      expect(errors[0].agent).toBe('researcher');
      expect(errors[0].error).toBe('API timeout');
      // Other agents still succeeded
      expect(result.mergedOutput).toContain('OK');
    });
  });

  describe('sequential with deps', () => {
    it('runs agents in order, each receives previous output as context', async () => {
      let callOrder = 0;
      const deps = createMockDeps({
        runAgent: vi.fn(async (config) => {
          callOrder++;
          return {
            content: `Step ${callOrder} result`,
            toolsUsed: [],
            usage: { inputTokens: 10, outputTokens: 5 },
          };
        }),
      });

      const result = await executeSequential(mockMembers, { task: 'research then write' }, deps);

      expect(result.strategy).toBe('sequential');
      expect(deps.runAgent).toHaveBeenCalledTimes(3);
      // Final output comes from last agent
      expect(result.finalOutput).toBe('Step 3 result');
    });

    it('second agent receives first agents output in systemPrompt', async () => {
      const deps = createMockDeps({
        runAgent: vi.fn(async (config) => ({
          content: `Output: ${config.systemPrompt.includes('Previous Agent') ? 'chained' : 'first'}`,
          toolsUsed: [],
          usage: { inputTokens: 10, outputTokens: 5 },
        })),
      });

      await executeSequential(mockMembers, { task: 'pipeline' }, deps);

      // Second call should have "Previous Agent's Output" in the system prompt
      const calls = (deps.runAgent as any).mock.calls;
      expect(calls[0][0].systemPrompt).not.toContain('Previous Agent');
      expect(calls[1][0].systemPrompt).toContain('Previous Agent');
      expect(calls[2][0].systemPrompt).toContain('Previous Agent');
    });

    it('error in middle agent stops the chain', async () => {
      const deps = createMockDeps({
        runAgent: vi.fn(async (config) => {
          if (config.systemPrompt.includes('researcher')) throw new Error('Crash');
          return { content: 'OK', toolsUsed: [], usage: { inputTokens: 10, outputTokens: 5 } };
        }),
      });

      const result = await executeSequential(mockMembers, { task: 'test' }, deps);

      // Chain stopped at researcher (agent 2), writer (agent 3) never ran
      expect(result.agentCount).toBe(2); // leader + researcher (failed)
      expect(result.chainBroken).toBe(true);
      expect(deps.runAgent).toHaveBeenCalledTimes(2);
    });
  });

  describe('coordinator with deps', () => {
    it('runs 3-phase pattern: plan → execute → synthesize', async () => {
      const deps = createMockDeps();
      const result = await executeCoordinator(mockMembers, { task: 'complex task' }, deps);

      expect(result.strategy).toBe('coordinator');
      // Lead calls: 1 planning + 1 synthesis = 2
      // Workers: 2 parallel calls
      // Total: 4
      expect(deps.runAgent).toHaveBeenCalledTimes(4);

      const plan = result.plan as Record<string, unknown>;
      expect(plan.phase).toBe('planning');
      expect(typeof plan.output).toBe('string');

      const synthesis = result.synthesis as Record<string, unknown>;
      expect(synthesis.phase).toBe('synthesis');
    });

    it('workers receive the plan as context', async () => {
      const deps = createMockDeps({
        runAgent: vi.fn(async (config) => ({
          content: config.systemPrompt.includes('Coordinator') ? 'Worker got plan' : 'Plan created',
          toolsUsed: [],
          usage: { inputTokens: 10, outputTokens: 5 },
        })),
      });

      const result = await executeCoordinator(mockMembers, { task: 'test' }, deps);
      const workerResults = result.workerResults as Array<Record<string, unknown>>;

      // Workers should have received the plan in their systemPrompt
      expect(workerResults[0].output).toBe('Worker got plan');
      expect(workerResults[1].output).toBe('Worker got plan');
    });

    it('handles zero workers (lead does everything)', async () => {
      const leadOnly: AgentMemberConfig[] = [{
        member: { roleInGroup: 'lead', executionOrder: 0 },
        agent: { id: 'a1', name: 'solo', model: 'claude-sonnet', systemPrompt: 'Solo lead', tools: [] },
      }];

      const deps = createMockDeps();
      const result = await executeCoordinator(leadOnly, { task: 'solo task' }, deps);

      expect(result.workerCount).toBe(0);
      expect(result.workerResults).toHaveLength(0);
      // Lead still runs plan + synthesis = 2 calls
      expect(deps.runAgent).toHaveBeenCalledTimes(2);
    });

    it('still throws if no lead (even with deps)', async () => {
      const noLead = mockMembers.map(m => ({
        ...m,
        member: { ...m.member, roleInGroup: 'worker' },
      }));
      const deps = createMockDeps();

      await expect(executeCoordinator(noLead, {}, deps)).rejects.toThrow('requires a lead');
    });
  });
});

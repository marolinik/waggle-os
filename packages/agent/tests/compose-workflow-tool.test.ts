import { describe, it, expect, vi } from 'vitest';
import { createWorkflowTools, type WorkflowToolsConfig } from '../src/workflow-tools.js';
import type { ToolDefinition } from '../src/tools.js';
import type { AgentLoopConfig, AgentResponse } from '../src/agent-loop.js';

function makeConfig(overrides: Partial<WorkflowToolsConfig> = {}): WorkflowToolsConfig {
  return {
    availableTools: [],
    runAgentLoop: vi.fn<(config: AgentLoopConfig) => Promise<AgentResponse>>().mockResolvedValue({
      content: 'Sub-agent result',
      toolResults: [],
      usage: { inputTokens: 100, outputTokens: 50 },
    }),
    ...overrides,
  };
}

function findTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find(t => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found. Available: ${tools.map(t => t.name).join(', ')}`);
  return tool;
}

describe('Workflow Tools', () => {
  describe('compose_workflow tool', () => {
    it('is registered in the tool list', () => {
      const tools = createWorkflowTools(makeConfig());
      expect(tools.some(t => t.name === 'compose_workflow')).toBe(true);
    });

    it('returns a workflow plan for a research task', async () => {
      const tools = createWorkflowTools(makeConfig());
      const compose = findTool(tools, 'compose_workflow');
      const result = await compose.execute({ task: 'Research the state of WebAssembly in 2026' });
      expect(typeof result).toBe('string');
      expect(result).toContain('Workflow Plan');
      expect(result).toContain('Mode:');
    });

    it('returns direct mode for simple tasks', async () => {
      const tools = createWorkflowTools(makeConfig());
      const compose = findTool(tools, 'compose_workflow');
      const result = await compose.execute({ task: 'hello' });
      expect(result).toContain('direct');
    });

    it('includes task analysis section', async () => {
      const tools = createWorkflowTools(makeConfig());
      const compose = findTool(tools, 'compose_workflow');
      const result = await compose.execute({ task: 'Research the market and then draft a report' });
      expect(result).toContain('Task Analysis');
      expect(result).toContain('Shape:');
      expect(result).toContain('Complexity:');
    });

    it('includes steps section', async () => {
      const tools = createWorkflowTools(makeConfig());
      const compose = findTool(tools, 'compose_workflow');
      const result = await compose.execute({ task: 'Compare React vs Vue' });
      expect(result).toContain('Steps');
    });

    it('includes escalation trigger', async () => {
      const tools = createWorkflowTools(makeConfig());
      const compose = findTool(tools, 'compose_workflow');
      const result = await compose.execute({ task: 'Draft a proposal' });
      expect(result).toContain('Escalation trigger');
    });

    it('passes skills context to composer', async () => {
      const tools = createWorkflowTools(makeConfig({
        skills: [{ name: 'research-synthesis', content: 'A research skill' }],
      }));
      const compose = findTool(tools, 'compose_workflow');
      const result = await compose.execute({ task: 'Research the market trends' });
      // Should detect skill_guided mode when a matching skill exists
      expect(result).toContain('skill_guided');
    });
  });

  describe('orchestrate_workflow tool', () => {
    it('is registered in the tool list', () => {
      const tools = createWorkflowTools(makeConfig());
      expect(tools.some(t => t.name === 'orchestrate_workflow')).toBe(true);
    });

    it('requires either template or inline_template', async () => {
      const tools = createWorkflowTools(makeConfig());
      const orch = findTool(tools, 'orchestrate_workflow');
      const result = await orch.execute({ task: 'Do something' });
      expect(result).toContain('Provide either');
    });

    it('rejects unknown named template', async () => {
      const tools = createWorkflowTools(makeConfig());
      const orch = findTool(tools, 'orchestrate_workflow');
      const result = await orch.execute({ template: 'nonexistent', task: 'Do something' });
      expect(result).toContain('Unknown workflow template');
    });

    it('validates inline template before execution', async () => {
      const tools = createWorkflowTools(makeConfig());
      const orch = findTool(tools, 'orchestrate_workflow');
      const result = await orch.execute({
        task: 'Do something',
        inline_template: {
          name: '',
          description: 'Bad template',
          steps: [],
          aggregation: 'last',
        },
      });
      expect(result).toContain('Invalid inline template');
    });

    it('rejects inline template with circular deps', async () => {
      const tools = createWorkflowTools(makeConfig());
      const orch = findTool(tools, 'orchestrate_workflow');
      const result = await orch.execute({
        task: 'Do something',
        inline_template: {
          name: 'circular',
          description: 'Has cycle',
          steps: [
            { name: 'a', role: 'r', task: 'x', dependsOn: ['b'], maxTurns: 5 },
            { name: 'b', role: 'r', task: 'y', dependsOn: ['a'], maxTurns: 5 },
          ],
          aggregation: 'last',
        },
      });
      expect(result).toContain('Invalid inline template');
      expect(result).toContain('circular');
    });

    it('accepts valid named template', async () => {
      const tools = createWorkflowTools(makeConfig());
      const orch = findTool(tools, 'orchestrate_workflow');
      // research-team is a known template
      const result = await orch.execute({ template: 'research-team', task: 'Research AI trends' });
      // Should run (even if mock returns simple results)
      expect(result).toContain('Workflow:');
    });
  });
});

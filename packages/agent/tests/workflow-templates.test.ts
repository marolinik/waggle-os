import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createResearchTeamTemplate,
  createReviewPairTemplate,
  createPlanExecuteTemplate,
  WORKFLOW_TEMPLATES,
  listWorkflowTemplates,
} from '../src/workflow-templates.js';
import { createWorkflowTools } from '../src/workflow-tools.js';
import type { ToolDefinition } from '../src/tools.js';
import type { AgentLoopConfig, AgentResponse } from '../src/agent-loop.js';
import type { OrchestratorConfig } from '../src/subagent-orchestrator.js';

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
    { name: 'create_plan', description: 'Plan', parameters: { type: 'object', properties: {} }, execute: async () => 'plan' },
    { name: 'add_plan_step', description: 'Add step', parameters: { type: 'object', properties: {} }, execute: async () => 'step' },
    { name: 'execute_step', description: 'Execute', parameters: { type: 'object', properties: {} }, execute: async () => 'done' },
    { name: 'show_plan', description: 'Show', parameters: { type: 'object', properties: {} }, execute: async () => 'plan' },
  ];
}

function makeMockRunner() {
  return vi.fn(async (config: AgentLoopConfig): Promise<AgentResponse> => ({
    content: `Result for: ${config.messages[0]?.content?.slice(0, 50)}`,
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

describe('Workflow Templates', () => {
  describe('createResearchTeamTemplate', () => {
    it('produces valid 3-step template', () => {
      const template = createResearchTeamTemplate('Investigate AI safety');
      expect(template.name).toBe('research-team');
      expect(template.steps).toHaveLength(3);
      expect(template.aggregation).toBe('last');

      // Step names and roles
      expect(template.steps[0].name).toBe('Researcher');
      expect(template.steps[0].role).toBe('researcher');
      expect(template.steps[1].name).toBe('Synthesizer');
      expect(template.steps[1].role).toBe('synthesizer');
      expect(template.steps[2].name).toBe('Reviewer');
      expect(template.steps[2].role).toBe('reviewer');

      // Dependencies
      expect(template.steps[0].dependsOn).toBeUndefined();
      expect(template.steps[1].dependsOn).toEqual(['Researcher']);
      expect(template.steps[2].dependsOn).toEqual(['Synthesizer']);

      // Context flow
      expect(template.steps[1].contextFrom).toEqual(['Researcher']);
      expect(template.steps[2].contextFrom).toEqual(['Researcher', 'Synthesizer']);
    });
  });

  describe('createReviewPairTemplate', () => {
    it('produces valid 3-step Writer→Reviewer→Reviser template', () => {
      const template = createReviewPairTemplate('Write a design doc');
      expect(template.name).toBe('review-pair');
      expect(template.steps).toHaveLength(3);
      expect(template.aggregation).toBe('last');

      expect(template.steps[0].name).toBe('Writer');
      expect(template.steps[0].role).toBe('writer');
      expect(template.steps[1].name).toBe('Reviewer');
      expect(template.steps[1].role).toBe('reviewer');
      expect(template.steps[2].name).toBe('Reviser');
      expect(template.steps[2].role).toBe('writer');

      // Dependency chain
      expect(template.steps[0].dependsOn).toBeUndefined();
      expect(template.steps[1].dependsOn).toEqual(['Writer']);
      expect(template.steps[2].dependsOn).toEqual(['Reviewer']);

      // Context flow
      expect(template.steps[1].contextFrom).toEqual(['Writer']);
      expect(template.steps[2].contextFrom).toEqual(['Writer', 'Reviewer']);
    });
  });

  describe('createPlanExecuteTemplate', () => {
    it('produces valid 3-step Planner→Executor→Summarizer template', () => {
      const template = createPlanExecuteTemplate('Build a dashboard');
      expect(template.name).toBe('plan-execute');
      expect(template.steps).toHaveLength(3);
      expect(template.aggregation).toBe('last');

      expect(template.steps[0].name).toBe('Planner');
      expect(template.steps[0].role).toBe('planner');
      expect(template.steps[1].name).toBe('Executor');
      expect(template.steps[1].role).toBe('analyst');
      expect(template.steps[2].name).toBe('Summarizer');
      expect(template.steps[2].role).toBe('summarizer');

      // Dependency chain
      expect(template.steps[0].dependsOn).toBeUndefined();
      expect(template.steps[1].dependsOn).toEqual(['Planner']);
      expect(template.steps[2].dependsOn).toEqual(['Executor']);

      // Context flow
      expect(template.steps[1].contextFrom).toEqual(['Planner']);
      expect(template.steps[2].contextFrom).toEqual(['Planner', 'Executor']);
    });
  });

  describe('WORKFLOW_TEMPLATES registry', () => {
    it('contains all three templates', () => {
      expect(WORKFLOW_TEMPLATES).toHaveProperty('research-team');
      expect(WORKFLOW_TEMPLATES).toHaveProperty('review-pair');
      expect(WORKFLOW_TEMPLATES).toHaveProperty('plan-execute');
      expect(Object.keys(WORKFLOW_TEMPLATES)).toHaveLength(3);
    });
  });

  describe('listWorkflowTemplates', () => {
    it('returns all template names', () => {
      const names = listWorkflowTemplates();
      expect(names).toContain('research-team');
      expect(names).toContain('review-pair');
      expect(names).toContain('plan-execute');
      expect(names).toHaveLength(3);
    });
  });

  describe('task parameter injection', () => {
    it('task parameter is injected into each step', () => {
      const task = 'Analyze competitor products in the SaaS market';
      const template = createResearchTeamTemplate(task);
      for (const step of template.steps) {
        expect(step.task).toContain(task);
      }

      const template2 = createReviewPairTemplate(task);
      for (const step of template2.steps) {
        expect(step.task).toContain(task);
      }

      const template3 = createPlanExecuteTemplate(task);
      for (const step of template3.steps) {
        expect(step.task).toContain(task);
      }
    });
  });
});

describe('orchestrate_workflow tool', () => {
  let runner: ReturnType<typeof makeMockRunner>;
  let tools: ToolDefinition[];

  beforeEach(() => {
    runner = makeMockRunner();
    const config = makeConfig(runner);
    tools = createWorkflowTools(config);
  });

  it('tool is defined with correct metadata', () => {
    const tool = tools.find(t => t.name === 'orchestrate_workflow')!;
    expect(tool).toBeDefined();
    expect(tool.description).toContain('research-team');
    expect(tool.description).toContain('review-pair');
    expect(tool.description).toContain('plan-execute');
  });

  it('runs research-team template with 3 calls in order', async () => {
    const callOrder: string[] = [];
    runner.mockImplementation(async (config: AgentLoopConfig) => {
      const match = config.systemPrompt.match(/Sub-Agent: (.+)/);
      callOrder.push(match?.[1] ?? 'unknown');
      return {
        content: `Result from ${match?.[1]}`,
        usage: { inputTokens: 100, outputTokens: 50 },
        toolsUsed: ['web_search'],
      };
    });

    const tool = tools.find(t => t.name === 'orchestrate_workflow')!;
    const result = await tool.execute({ template: 'research-team', task: 'Research quantum computing' });

    expect(callOrder).toEqual(['Researcher', 'Synthesizer', 'Reviewer']);
    expect(runner).toHaveBeenCalledTimes(3);
    expect(result).toContain('research-team');
  });

  it('runs review-pair template with 3 calls and context flow', async () => {
    const systemPrompts: string[] = [];
    runner.mockImplementation(async (config: AgentLoopConfig) => {
      systemPrompts.push(config.systemPrompt);
      const match = config.systemPrompt.match(/Sub-Agent: (.+)/);
      return {
        content: `Result from ${match?.[1]}`,
        usage: { inputTokens: 150, outputTokens: 75 },
        toolsUsed: [],
      };
    });

    const tool = tools.find(t => t.name === 'orchestrate_workflow')!;
    await tool.execute({ template: 'review-pair', task: 'Write a blog post' });

    expect(runner).toHaveBeenCalledTimes(3);
    // Reviewer (step 2) should have Writer's result in context
    expect(systemPrompts[1]).toContain('Result from Writer');
    // Reviser (step 3) should have both Writer and Reviewer results
    expect(systemPrompts[2]).toContain('Result from Writer');
    expect(systemPrompts[2]).toContain('Result from Reviewer');
  });

  it('returns error for unknown template', async () => {
    const tool = tools.find(t => t.name === 'orchestrate_workflow')!;
    const result = await tool.execute({ template: 'nonexistent', task: 'Do something' });

    expect(result).toContain('Unknown workflow template');
    expect(result).toContain('nonexistent');
    expect(result).toContain('research-team');
    expect(runner).not.toHaveBeenCalled();
  });

  it('output includes worker summary and tokens', async () => {
    runner.mockImplementation(async (config: AgentLoopConfig) => {
      const match = config.systemPrompt.match(/Sub-Agent: (.+)/);
      return {
        content: `Result from ${match?.[1]}`,
        usage: { inputTokens: 200, outputTokens: 100 },
        toolsUsed: ['web_search'],
      };
    });

    const tool = tools.find(t => t.name === 'orchestrate_workflow')!;
    const result = await tool.execute({ template: 'research-team', task: 'Research AI' });

    // Should contain workflow name
    expect(result).toContain('research-team');
    // Should contain worker names
    expect(result).toContain('Researcher');
    expect(result).toContain('Synthesizer');
    expect(result).toContain('Reviewer');
    // Should contain token counts (3 workers x 300 tokens each = 900)
    expect(result).toContain('900');
    // Should contain the aggregated result (last worker = Reviewer)
    expect(result).toContain('Result from Reviewer');
  });
});

/**
 * E2E Solo Scenarios — verify tool chain invocations for solo workflows.
 * All tests use direct tool execution (no LLM needed).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeScenario, verifyScenario } from './scenario-framework.js';
import type { ToolDefinition } from '../../src/tools.js';
import { ConnectorRegistry } from '../../src/connector-registry.js';
import { CapabilityRouter } from '../../src/capability-router.js';
import { composePersonaPrompt, getPersona, PERSONAS } from '../../src/personas.js';
import { AgentMessageBus } from '../../src/agent-message-bus.js';
import { needsConfirmation, getApprovalClass } from '../../src/confirmation.js';

// ── Mock tool factory ─────────────────────────────────────────────────

function mockTool(name: string, response: string = 'ok'): ToolDefinition {
  return {
    name,
    description: `Mock ${name}`,
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(async () => response),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Solo Scenarios
// ═══════════════════════════════════════════════════════════════════════

describe('E2E Solo Scenarios', () => {
  describe('S1: Research report — web search → save → generate doc', () => {
    it('tool chain: web_search → web_fetch → save_memory → generate_docx', async () => {
      const tools = [
        mockTool('web_search', JSON.stringify({ results: [{ title: 'AI Trends', url: 'https://example.com' }] })),
        mockTool('web_fetch', '<html>AI is transforming industries...</html>'),
        mockTool('save_memory', 'Memory saved: AI research findings'),
        mockTool('generate_docx', 'Document generated: research-report.docx'),
      ];

      const result = await executeScenario(tools, [
        { userMessage: 'Research AI trends and create a report', expectedToolCalls: ['web_search', 'web_fetch', 'save_memory', 'generate_docx'] },
      ], {
        web_search: { query: 'AI trends 2026' },
        web_fetch: { url: 'https://example.com' },
        save_memory: { content: 'AI research findings', tags: ['research'] },
        generate_docx: { title: 'AI Trends Report', content: 'Analysis...' },
      });

      const verification = verifyScenario(result, ['web_search', 'web_fetch', 'save_memory', 'generate_docx']);
      expect(verification.passed).toBe(true);
      expect(result.toolsCalled).toHaveLength(4);
    });
  });

  describe('S2: Code review — read → search → edit', () => {
    it('tool chain: read_file → search_content → edit_file', async () => {
      const tools = [
        mockTool('read_file', 'function processData(data) { return data; }'),
        mockTool('search_content', JSON.stringify({ matches: [{ file: 'src/utils.ts', line: 42 }] })),
        mockTool('edit_file', 'File edited successfully'),
      ];

      const result = await executeScenario(tools, [
        { userMessage: 'Review this code for issues', expectedToolCalls: ['read_file', 'search_content', 'edit_file'] },
      ], {
        read_file: { path: 'src/utils.ts' },
        search_content: { pattern: 'processData', path: '.' },
        edit_file: { path: 'src/utils.ts', old_string: 'return data', new_string: 'return validateData(data)' },
      });

      expect(result.toolsCalled).toEqual(['read_file', 'search_content', 'edit_file']);
      expect(result.outputs).toHaveLength(3);
      expect(result.outputs.every(o => !o.startsWith('[ERROR]'))).toBe(true);
    });
  });

  describe('S3: Project planning — create → add steps → execute', () => {
    it('tool chain: create_plan → add_plan_step → show_plan', async () => {
      const tools = [
        mockTool('create_plan', 'Plan created: Project Alpha'),
        mockTool('add_plan_step', 'Step added: Set up database'),
        mockTool('show_plan', 'Plan: 1. Set up database [pending]'),
      ];

      const result = await executeScenario(tools, [
        { userMessage: 'Create a project plan', expectedToolCalls: ['create_plan', 'add_plan_step', 'show_plan'] },
      ], {
        create_plan: { name: 'Project Alpha', description: 'New feature development' },
        add_plan_step: { title: 'Set up database', description: 'Create schema and migrations' },
        show_plan: {},
      });

      expect(result.toolsCalled).toHaveLength(3);
      const verification = verifyScenario(result, ['create_plan', 'add_plan_step', 'show_plan']);
      expect(verification.passed).toBe(true);
    });
  });

  describe('S4: Memory continuity — save → search finds it', () => {
    it('tool chain: save_memory → search_memory retrieves it', async () => {
      const savedContent = 'Project decision: use PostgreSQL for the database';
      const tools = [
        mockTool('save_memory', `Saved: ${savedContent}`),
        mockTool('search_memory', JSON.stringify({ results: [{ content: savedContent, score: 0.95 }] })),
      ];

      const result = await executeScenario(tools, [
        { userMessage: 'Remember this decision', expectedToolCalls: ['save_memory'] },
        { userMessage: 'What was our database decision?', expectedToolCalls: ['search_memory'] },
      ], {
        save_memory: { content: savedContent },
        search_memory: { query: 'database decision' },
      });

      expect(result.toolsCalled).toEqual(['save_memory', 'search_memory']);
      expect(result.outputs[1]).toContain('PostgreSQL');
    });
  });

  describe('S5: Capability discovery — acquire finds marketplace result', () => {
    it('acquire_capability returns marketplace candidates', async () => {
      const tools = [
        mockTool('acquire_capability', JSON.stringify({
          need: 'email sending',
          candidates: [{ name: 'sendgrid-skill', source: 'marketplace', availability: 'installable' }],
        })),
      ];

      const result = await executeScenario(tools, [
        { userMessage: 'I need to send emails', expectedToolCalls: ['acquire_capability'] },
      ], {
        acquire_capability: { need: 'email sending' },
      });

      const output = JSON.parse(result.outputs[0]);
      expect(output.candidates).toHaveLength(1);
      expect(output.candidates[0].source).toBe('marketplace');
    });
  });

  describe('S6: Persona composition works correctly', () => {
    it('all 8 personas compose valid prompts', () => {
      const corePrompt = 'You are Waggle, a workspace-native AI agent.';
      for (const persona of PERSONAS) {
        const composed = composePersonaPrompt(corePrompt, persona);
        expect(composed).toContain(corePrompt);
        expect(composed).toContain('Persona:');
        expect(composed.length).toBeLessThanOrEqual(32000);
      }
    });

    it('getPersona returns correct persona by ID', () => {
      expect(getPersona('researcher')?.name).toBe('Researcher');
      expect(getPersona('coder')?.name).toBe('Coder');
      expect(getPersona('nonexistent')).toBeNull();
    });
  });

  describe('S7: Confirmation gates cover all Phase 8 tool types', () => {
    it('connector write tools require confirmation', () => {
      expect(needsConfirmation('connector_github_create_issue')).toBe(true);
      expect(needsConfirmation('connector_slack_send_message')).toBe(true);
      expect(needsConfirmation('connector_email_send_email')).toBe(true);
      expect(needsConfirmation('connector_jira_update_issue')).toBe(true);
    });

    it('connector read tools do not require confirmation', () => {
      expect(needsConfirmation('connector_github_list_repos')).toBe(false);
      expect(needsConfirmation('connector_slack_list_channels')).toBe(false);
    });

    it('email actions are critical approval class', () => {
      expect(getApprovalClass('connector_email_send_email')).toBe('critical');
      expect(getApprovalClass('connector_email_send_template')).toBe('critical');
    });

    it('write actions are elevated approval class', () => {
      expect(getApprovalClass('connector_github_create_issue')).toBe('elevated');
      expect(getApprovalClass('connector_jira_create_issue')).toBe('elevated');
    });
  });

  describe('S8: Capability router resolves connectors', () => {
    it('routes to connected connectors with high confidence', () => {
      const router = new CapabilityRouter({
        toolNames: ['search_memory'],
        skills: [],
        plugins: [],
        mcpServers: [],
        subAgentRoles: [],
        connectors: [
          { id: 'github', name: 'GitHub', service: 'github.com', connected: true, actions: ['create_issue'] },
          { id: 'jira', name: 'Jira', service: 'atlassian.net', connected: false, actions: ['create_issue'] },
        ],
      });

      const routes = router.resolve('github');
      const connector = routes.find(r => r.source === 'connector');
      expect(connector).toBeDefined();
      expect(connector!.confidence).toBe(0.75);
      expect(connector!.available).toBe(true);
    });
  });
});

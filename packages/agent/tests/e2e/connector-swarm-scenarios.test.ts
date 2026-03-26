/**
 * E2E Connector + Swarm Scenarios — verify connector tool chains and
 * multi-agent execution patterns with mocked dependencies.
 */

import { describe, it, expect, vi } from 'vitest';
import { ConnectorRegistry, type AuditLogger } from '../../src/connector-registry.js';
import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../../src/connector-sdk.js';
import { executeParallel, type ExecutionDeps, type AgentMemberConfig } from '../../../worker/src/execution/parallel.js';
import { executeSequential } from '../../../worker/src/execution/sequential.js';
import { executeCoordinator } from '../../../worker/src/execution/coordinator.js';
import { AgentMessageBus } from '../../src/agent-message-bus.js';
import { createAgentCommsTools } from '../../src/agent-comms-tools.js';
import { WorkspaceSessionManager } from '../../../server/src/local/workspace-sessions.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

// ── Mock helpers ──────────────────────────────────────────────────────

class MockConnector extends BaseConnector {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly service: string;
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;
  readonly actions: ConnectorAction[];

  constructor(id: string, name: string, service: string, actions: ConnectorAction[]) {
    super();
    this.id = id;
    this.name = name;
    this.description = `Mock ${name}`;
    this.service = service;
    this.actions = actions;
  }

  async connect(): Promise<void> {}
  async healthCheck(): Promise<ConnectorHealth> {
    return { id: this.id, name: this.name, status: 'connected', lastChecked: new Date().toISOString() };
  }
  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    return { success: true, data: { action, ...params } };
  }
}

function createMockVault(connected: string[]): VaultStore {
  return {
    getConnectorCredential: vi.fn((id: string) => {
      if (connected.includes(id)) return { value: 'tok', type: 'bearer', isExpired: false };
      return null;
    }),
    setConnectorCredential: vi.fn(),
    set: vi.fn(), get: vi.fn(), delete: vi.fn(),
    list: vi.fn(() => []), has: vi.fn(() => false),
    migrateFromConfig: vi.fn(() => 0),
  } as unknown as VaultStore;
}

function createMockDeps(): ExecutionDeps {
  return {
    runAgent: vi.fn(async (config) => ({
      content: `Agent output for: ${config.systemPrompt.slice(0, 40)}`,
      toolsUsed: ['mock'],
      usage: { inputTokens: 50, outputTokens: 25 },
    })),
    resolveTools: vi.fn((names) => names.map(n => ({
      name: n, description: `Mock ${n}`, parameters: { type: 'object', properties: {} },
      execute: async () => 'ok',
    }))),
  };
}

const mockMembers: AgentMemberConfig[] = [
  { member: { roleInGroup: 'lead', executionOrder: 0 }, agent: { id: 'a1', name: 'coordinator', model: 'claude-sonnet', systemPrompt: 'You are a coordinator.', tools: [] } },
  { member: { roleInGroup: 'worker', executionOrder: 1 }, agent: { id: 'a2', name: 'researcher', model: 'claude-haiku', systemPrompt: 'You are a researcher.', tools: ['web_search'] } },
  { member: { roleInGroup: 'worker', executionOrder: 2 }, agent: { id: 'a3', name: 'analyst', model: 'claude-haiku', systemPrompt: 'You are an analyst.', tools: ['search_memory'] } },
];

// ═══════════════════════════════════════════════════════════════════════
// Connector Scenarios
// ═══════════════════════════════════════════════════════════════════════

describe('E2E Connector Scenarios', () => {
  describe('C1: GitHub integration — create issue from conversation', () => {
    it('connector generates tool, tool creates issue', async () => {
      const vault = createMockVault(['github']);
      const registry = new ConnectorRegistry(vault);
      registry.register(new MockConnector('github', 'GitHub', 'github.com', [
        { name: 'create_issue', description: 'Create issue', inputSchema: { properties: { owner: { type: 'string' }, repo: { type: 'string' }, title: { type: 'string' } } }, riskLevel: 'medium' },
      ]));

      const tools = registry.generateTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('connector_github_create_issue');

      const result = JSON.parse(await tools[0].execute({ owner: 'user', repo: 'waggle', title: 'Bug: login fails' }));
      expect(result.success).toBe(true);
      expect(result.data.action).toBe('create_issue');
    });
  });

  describe('C2: Email outreach — send with approval gate awareness', () => {
    it('email send tool is generated and marked high-risk', async () => {
      const vault = createMockVault(['email']);
      const audit = vi.fn();
      const registry = new ConnectorRegistry(vault, { log: audit });
      registry.register(new MockConnector('email', 'Email', 'sendgrid.com', [
        { name: 'send_email', description: 'Send email', inputSchema: { properties: { to: { type: 'string' }, subject: { type: 'string' } } }, riskLevel: 'high' },
      ]));

      const tools = registry.generateTools();
      const sendTool = tools.find(t => t.name === 'connector_email_send_email')!;
      await sendTool.execute({ to: 'user@example.com', subject: 'Follow up' });

      // Verify audit log was called
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({
        actionType: 'connector.email.send_email',
        requiresApproval: true,
      }));
    });
  });

  describe('C3: Multi-connector workflow chain', () => {
    it('research → email → jira → slack in sequence', async () => {
      const vault = createMockVault(['github', 'email', 'jira', 'slack']);
      const registry = new ConnectorRegistry(vault);
      registry.register(new MockConnector('github', 'GitHub', 'github.com', [
        { name: 'search_code', description: 'Search', inputSchema: { properties: {} }, riskLevel: 'low' },
      ]));
      registry.register(new MockConnector('email', 'Email', 'sendgrid.com', [
        { name: 'send_email', description: 'Send', inputSchema: { properties: {} }, riskLevel: 'high' },
      ]));
      registry.register(new MockConnector('jira', 'Jira', 'atlassian.net', [
        { name: 'create_issue', description: 'Create', inputSchema: { properties: {} }, riskLevel: 'medium' },
      ]));
      registry.register(new MockConnector('slack', 'Slack', 'slack.com', [
        { name: 'send_message', description: 'Send', inputSchema: { properties: {} }, riskLevel: 'medium' },
      ]));

      const tools = registry.generateTools();
      expect(tools).toHaveLength(4);

      // Execute chain
      for (const tool of tools) {
        const result = JSON.parse(await tool.execute({}));
        expect(result.success).toBe(true);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Swarm Scenarios
// ═══════════════════════════════════════════════════════════════════════

describe('E2E Swarm Scenarios', () => {
  describe('SW1: Parallel research — 3 agents investigate independently', () => {
    it('all agents execute in parallel and produce independent results', async () => {
      const deps = createMockDeps();
      const workers = mockMembers.filter(m => m.member.roleInGroup === 'worker');

      const result = await executeParallel(workers, { task: 'Research market trends' }, deps);

      expect(result.strategy).toBe('parallel');
      expect(result.agentCount).toBe(2);
      expect(deps.runAgent).toHaveBeenCalledTimes(2);
      expect((result.results as any[]).every((r: any) => r.output.length > 0)).toBe(true);
    });
  });

  describe('SW2: Sequential pipeline — researcher → analyst', () => {
    it('second agent receives first agents output as context', async () => {
      const deps = createMockDeps();
      const workers = mockMembers.filter(m => m.member.roleInGroup === 'worker');

      const result = await executeSequential(workers, { task: 'Research then analyze' }, deps);

      expect(result.strategy).toBe('sequential');
      expect(deps.runAgent).toHaveBeenCalledTimes(2);
      // Second call should have "Previous Agent" in system prompt
      const calls = (deps.runAgent as any).mock.calls;
      expect(calls[1][0].systemPrompt).toContain('Previous Agent');
    });
  });

  describe('SW3: Coordinator — plan → execute → synthesize', () => {
    it('3-phase coordinator pattern with 2 workers', async () => {
      const deps = createMockDeps();
      const result = await executeCoordinator(mockMembers, { task: 'Complex analysis' }, deps);

      expect(result.strategy).toBe('coordinator');
      expect(result.leadAgent).toBe('coordinator');
      expect(result.workerCount).toBe(2);
      // Lead runs twice (plan + synthesize) + 2 workers = 4
      expect(deps.runAgent).toHaveBeenCalledTimes(4);
    });
  });

  describe('SW4: Cross-workspace communication via message bus', () => {
    it('agent in ws-1 sends message, agent in ws-2 receives it', async () => {
      const bus = new AgentMessageBus();
      const ws1Tools = createAgentCommsTools(bus, 'ws-1');
      const ws2Tools = createAgentCommsTools(bus, 'ws-2');

      // Agent 1 sends
      const sendTool = ws1Tools.find(t => t.name === 'send_agent_message')!;
      const sendResult = JSON.parse(await sendTool.execute({ workspace: 'ws-2', message: 'Research findings attached' }));
      expect(sendResult.success).toBe(true);

      // Agent 2 receives
      const checkTool = ws2Tools.find(t => t.name === 'check_agent_messages')!;
      const checkResult = JSON.parse(await checkTool.execute({}));
      expect(checkResult.count).toBe(1);
      expect(checkResult.messages[0].content).toBe('Research findings attached');
      expect(checkResult.messages[0].from).toBe('ws-1');
    });
  });

  describe('SW5: Workspace session lifecycle', () => {
    it('create, use, pause, resume, kill session', () => {
      const manager = new WorkspaceSessionManager(3);
      const mind = { close: vi.fn() } as any;
      const tools = [{ name: 't1', description: '', parameters: {}, execute: async () => '' }];

      // Create
      const session = manager.create('ws-1', mind, tools, 'researcher');
      expect(session.status).toBe('active');
      expect(session.personaId).toBe('researcher');

      // Pause
      manager.pause('ws-1');
      expect(session.status).toBe('paused');

      // Resume
      manager.resume('ws-1');
      expect(session.status).toBe('active');

      // Kill
      manager.close('ws-1');
      expect(manager.size).toBe(0);
      expect(mind.close).toHaveBeenCalled();
    });
  });
});

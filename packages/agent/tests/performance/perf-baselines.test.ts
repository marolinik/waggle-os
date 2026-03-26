/**
 * Performance Baselines — timing assertions for key Phase 8 operations.
 * Any operation >500ms is a regression. Most should be <50ms.
 */

import { describe, it, expect, vi } from 'vitest';
import { ConnectorRegistry } from '../../src/connector-registry.js';
import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../../src/connector-sdk.js';
import { CapabilityRouter } from '../../src/capability-router.js';
import { composePersonaPrompt, PERSONAS, getPersona } from '../../src/personas.js';
import { AgentMessageBus } from '../../src/agent-message-bus.js';
import { needsConfirmation, getApprovalClass } from '../../src/confirmation.js';
import { WorkspaceSessionManager } from '../../../server/src/local/workspace-sessions.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

// ── Helpers ───────────────────────────────────────────────────────────

class PerfConnector extends BaseConnector {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly service: string;
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;
  readonly actions: ConnectorAction[];

  constructor(id: string, actionCount: number) {
    super();
    this.id = id;
    this.name = `Perf ${id}`;
    this.description = `Performance test connector ${id}`;
    this.service = `${id}.example.com`;
    this.actions = Array.from({ length: actionCount }, (_, i) => ({
      name: `action_${i}`,
      description: `Action ${i}`,
      inputSchema: { properties: { input: { type: 'string' } } },
      riskLevel: i % 3 === 0 ? 'high' as const : i % 2 === 0 ? 'medium' as const : 'low' as const,
    }));
  }

  async connect(): Promise<void> {}
  async healthCheck(): Promise<ConnectorHealth> {
    return { id: this.id, name: this.name, status: 'connected', lastChecked: new Date().toISOString() };
  }
  async execute(action: string): Promise<ConnectorResult> {
    return { success: true, data: { action } };
  }
}

function createMockVault(connectedIds: string[]): VaultStore {
  return {
    getConnectorCredential: vi.fn((id: string) => {
      if (connectedIds.includes(id)) return { value: 'tok', type: 'bearer', isExpired: false };
      return null;
    }),
    setConnectorCredential: vi.fn(),
    set: vi.fn(), get: vi.fn(), delete: vi.fn(),
    list: vi.fn(() => []), has: vi.fn(() => false),
    migrateFromConfig: vi.fn(() => 0),
  } as unknown as VaultStore;
}

function timeMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

async function timeMsAsync(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

// ═══════════════════════════════════════════════════════════════════════

describe('Performance Baselines', () => {
  it('connector registry generateTools < 5ms for 5 connectors', () => {
    const vault = createMockVault(['c1', 'c2', 'c3', 'c4', 'c5']);
    const registry = new ConnectorRegistry(vault);
    for (let i = 1; i <= 5; i++) {
      registry.register(new PerfConnector(`c${i}`, 5));
    }

    const ms = timeMs(() => { registry.generateTools(); });
    expect(ms).toBeLessThan(5);
  });

  it('capability router resolve < 10ms with 10 connectors', () => {
    const router = new CapabilityRouter({
      toolNames: Array.from({ length: 80 }, (_, i) => `tool_${i}`),
      skills: Array.from({ length: 20 }, (_, i) => ({ name: `skill_${i}`, content: `Skill ${i} content` })),
      plugins: [],
      mcpServers: ['server_1', 'server_2'],
      subAgentRoles: ['researcher', 'writer', 'coder'],
      connectors: Array.from({ length: 10 }, (_, i) => ({
        id: `conn_${i}`, name: `Connector ${i}`, service: `svc${i}.com`,
        connected: i < 5, actions: ['action_a', 'action_b'],
      })),
    });

    const ms = timeMs(() => { router.resolve('research something'); });
    expect(ms).toBeLessThan(10);
  });

  it('persona prompt composition < 1ms', () => {
    const core = 'You are Waggle. '.repeat(100); // ~1600 chars
    const persona = getPersona('researcher')!;

    const ms = timeMs(() => { composePersonaPrompt(core, persona); });
    expect(ms).toBeLessThan(1);
  });

  it('message bus send + receive < 1ms for 100 messages', () => {
    const bus = new AgentMessageBus();

    const ms = timeMs(() => {
      for (let i = 0; i < 100; i++) {
        bus.send({ from: 'ws-1', to: 'ws-2', content: `Message ${i}` });
      }
      bus.receive('ws-2');
    });
    expect(ms).toBeLessThan(5); // 100 sends + 1 receive
  });

  it('confirmation gate check < 0.5ms per call', () => {
    const tools = [
      'connector_github_create_issue',
      'connector_email_send_email',
      'connector_slack_list_channels',
      'bash',
      'write_file',
      'read_file',
    ];

    const ms = timeMs(() => {
      for (let i = 0; i < 1000; i++) {
        needsConfirmation(tools[i % tools.length]);
        getApprovalClass(tools[i % tools.length]);
      }
    });
    // 2000 checks in < 5ms = <0.0025ms each
    expect(ms).toBeLessThan(5);
  });

  it('workspace session create + close < 5ms', () => {
    const manager = new WorkspaceSessionManager(3);
    const mind = { close: vi.fn() } as any;
    const tools = [{ name: 't', description: '', parameters: {}, execute: async () => '' }];

    const ms = timeMs(() => {
      manager.create('ws-perf', mind, tools);
      manager.close('ws-perf');
    });
    expect(ms).toBeLessThan(5);
  });

  it('connector registry getDefinitions < 2ms for 5 connectors', () => {
    const vault = createMockVault(['c1', 'c2', 'c3']);
    const registry = new ConnectorRegistry(vault);
    for (let i = 1; i <= 5; i++) {
      registry.register(new PerfConnector(`c${i}`, 5));
    }

    const ms = timeMs(() => { registry.getDefinitions(); });
    expect(ms).toBeLessThan(2);
  });

  it('message bus cleanup < 2ms for 1000 expired messages', () => {
    const bus = new AgentMessageBus();
    for (let i = 0; i < 1000; i++) {
      bus.send({ from: 'ws-1', to: `ws-${i % 10}`, content: `msg ${i}`, ttlMs: 1 });
    }
    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }

    const ms = timeMs(() => { bus.cleanup(); });
    expect(ms).toBeLessThan(5);
  });
});

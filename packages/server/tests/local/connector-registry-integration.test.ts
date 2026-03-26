import { describe, it, expect, vi } from 'vitest';
import { ConnectorRegistry } from '@waggle/agent';
import { BaseConnector, type ConnectorAction, type ConnectorResult } from '@waggle/agent';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';
import { needsConfirmation, getApprovalClass } from '@waggle/agent';

// ─── Mock Connector for integration tests ─────────────────────────────

class TestConnector extends BaseConnector {
  readonly id = 'test';
  readonly name = 'Test Service';
  readonly description = 'Integration test connector';
  readonly service = 'test.example.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;
  readonly actions: ConnectorAction[] = [
    {
      name: 'read_data',
      description: 'Read test data',
      inputSchema: { properties: { query: { type: 'string' } } },
      riskLevel: 'low',
    },
    {
      name: 'create_item',
      description: 'Create a test item',
      inputSchema: { properties: { name: { type: 'string' } }, required: ['name'] },
      riskLevel: 'medium',
    },
  ];

  async connect(): Promise<void> { /* no-op */ }
  async healthCheck(): Promise<ConnectorHealth> {
    return { id: this.id, name: this.name, status: 'connected', lastChecked: new Date().toISOString() };
  }
  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    return { success: true, data: { action, ...params } };
  }
}

function createMockVault(credentials: Record<string, { value: string; isExpired: boolean }> = {}): VaultStore {
  return {
    getConnectorCredential: vi.fn((id: string) => {
      const cred = credentials[id];
      if (!cred) return null;
      return { value: cred.value, type: 'bearer', isExpired: cred.isExpired };
    }),
    setConnectorCredential: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(() => []),
    has: vi.fn(() => false),
    migrateFromConfig: vi.fn(() => 0),
  } as unknown as VaultStore;
}

// ─── Integration Tests ───────────────────────────────────────────────

describe('ConnectorRegistry integration', () => {
  it('registry getDefinitions() returns correct status from vault', () => {
    const vault = createMockVault({ test: { value: 'tok', isExpired: false } });
    const registry = new ConnectorRegistry(vault);
    registry.register(new TestConnector());

    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].id).toBe('test');
    expect(defs[0].status).toBe('connected');
    expect(defs[0].tools).toEqual(['connector_test_read_data', 'connector_test_create_item']);
  });

  it('connector tools are included in generated tools when connected', () => {
    const vault = createMockVault({ test: { value: 'tok', isExpired: false } });
    const registry = new ConnectorRegistry(vault);
    registry.register(new TestConnector());

    const tools = registry.generateTools();
    expect(tools).toHaveLength(2);
    expect(tools.map(t => t.name)).toEqual(['connector_test_read_data', 'connector_test_create_item']);
  });

  it('no connector tools generated when disconnected', () => {
    const vault = createMockVault(); // no credentials
    const registry = new ConnectorRegistry(vault);
    registry.register(new TestConnector());

    expect(registry.generateTools()).toEqual([]);
  });

  it('health check delegates to connector', async () => {
    const vault = createMockVault();
    const registry = new ConnectorRegistry(vault);
    registry.register(new TestConnector());

    const health = await registry.healthCheck('test');
    expect(health).not.toBeNull();
    expect(health!.status).toBe('connected');
  });
});

describe('Connector confirmation gates', () => {
  it('connector read tools do not need confirmation', () => {
    expect(needsConfirmation('connector_test_read_data')).toBe(false);
  });

  it('connector write tools need confirmation by action name pattern', () => {
    expect(needsConfirmation('connector_github_create_issue')).toBe(true);
    expect(needsConfirmation('connector_slack_send_message')).toBe(true);
    expect(needsConfirmation('connector_jira_update_issue')).toBe(true);
    expect(needsConfirmation('connector_jira_delete_issue')).toBe(true);
    expect(needsConfirmation('connector_jira_transition_issue')).toBe(true);
  });

  it('email send tools get critical approval class (by tool name, not args)', () => {
    // Security: approval class is determined by tool name, not LLM-provided metadata
    expect(getApprovalClass('connector_email_send_email')).toBe('critical');
    expect(getApprovalClass('connector_email_send_template')).toBe('critical');
  });

  it('connector write tools get elevated approval class (by tool name)', () => {
    expect(getApprovalClass('connector_github_create_issue')).toBe('elevated');
    expect(getApprovalClass('connector_jira_update_issue')).toBe('elevated');
  });

  it('connector read tools get standard approval class', () => {
    expect(getApprovalClass('connector_github_list_repos')).toBe('standard');
  });
});

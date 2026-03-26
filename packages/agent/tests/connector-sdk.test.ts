import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseConnector, type ConnectorAction, type ConnectorResult, type WaggleConnector } from '../src/connector-sdk.js';
import { ConnectorRegistry, type AuditLogger } from '../src/connector-registry.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth, ConnectorStatus } from '@waggle/shared';

// ─── Mock Connector ──────────────────────────────────────────────────────

class MockConnector extends BaseConnector {
  readonly id = 'mock';
  readonly name = 'Mock Service';
  readonly description = 'A mock connector for testing';
  readonly service = 'mock.example.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;
  readonly actions: ConnectorAction[] = [
    {
      name: 'list_items',
      description: 'List all items',
      inputSchema: { properties: { limit: { type: 'number' } } },
      riskLevel: 'low',
    },
    {
      name: 'create_item',
      description: 'Create a new item',
      inputSchema: { properties: { name: { type: 'string' } }, required: ['name'] },
      riskLevel: 'medium',
    },
    {
      name: 'delete_item',
      description: 'Delete an item permanently',
      inputSchema: { properties: { id: { type: 'string' } }, required: ['id'] },
      riskLevel: 'high',
    },
  ];

  private token: string | null = null;
  connectCalled = false;
  healthCheckCalled = false;
  executeCalls: Array<{ action: string; params: Record<string, unknown> }> = [];

  async connect(vault: VaultStore): Promise<void> {
    this.connectCalled = true;
    const cred = vault.getConnectorCredential(this.id);
    this.token = cred?.value ?? null;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    this.healthCheckCalled = true;
    return {
      id: this.id,
      name: this.name,
      status: this.token ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
    };
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    this.executeCalls.push({ action, params });
    const known = this.actions.find(a => a.name === action);
    if (!known) return { success: false, error: `Unknown action: ${action}` };
    return { success: true, data: { action, params, token: this.token } };
  }
}

// ─── Mock Vault ──────────────────────────────────────────────────────────

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

// ─── WaggleConnector Interface ───────────────────────────────────────────

describe('WaggleConnector interface', () => {
  it('a connector implementing the interface can be instantiated', () => {
    const connector = new MockConnector();
    expect(connector.id).toBe('mock');
    expect(connector.name).toBe('Mock Service');
    expect(connector.actions).toHaveLength(3);
  });

  it('toDefinition() maps WaggleConnector → ConnectorDefinition correctly', () => {
    const connector = new MockConnector();
    const def = connector.toDefinition('connected');

    expect(def.id).toBe('mock');
    expect(def.name).toBe('Mock Service');
    expect(def.description).toBe('A mock connector for testing');
    expect(def.service).toBe('mock.example.com');
    expect(def.authType).toBe('bearer');
    expect(def.status).toBe('connected');
    expect(def.substrate).toBe('waggle');
  });

  it('actions map to tools[] and capabilities[] in the definition', () => {
    const connector = new MockConnector();
    const def = connector.toDefinition('connected');

    // tools should be connector_<id>_<action>
    expect(def.tools).toEqual([
      'connector_mock_list_items',
      'connector_mock_create_item',
      'connector_mock_delete_item',
    ]);

    // capabilities derived from actions: list=search+read, create=write, delete=write
    expect(def.capabilities).toContain('read');
    expect(def.capabilities).toContain('write');
    expect(def.capabilities).toContain('search');

    // actions metadata present
    expect(def.actions).toHaveLength(3);
    expect(def.actions![0]).toEqual({ name: 'list_items', description: 'List all items', riskLevel: 'low' });
    expect(def.actions![2].riskLevel).toBe('high');
  });
});

// ─── ConnectorRegistry ───────────────────────────────────────────────────

describe('ConnectorRegistry', () => {
  let vault: VaultStore;
  let registry: ConnectorRegistry;

  beforeEach(() => {
    vault = createMockVault();
    registry = new ConnectorRegistry(vault);
  });

  it('register() adds a connector to the registry', () => {
    registry.register(new MockConnector());
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.get('mock')).toBeDefined();
  });

  it('getAll() returns all registered connectors', () => {
    registry.register(new MockConnector());
    const c2 = new MockConnector();
    (c2 as any).id = 'mock2'; // Override for second registration
    // Note: can't easily override readonly. Use Object.defineProperty.
    Object.defineProperty(c2, 'id', { value: 'mock2' });
    registry.register(c2);
    expect(registry.getAll()).toHaveLength(2);
  });

  it('getConnected() returns only connectors with valid vault credentials', () => {
    vault = createMockVault({ mock: { value: 'token123', isExpired: false } });
    registry = new ConnectorRegistry(vault);
    registry.register(new MockConnector());

    const connected = registry.getConnected();
    expect(connected).toHaveLength(1);
    expect(connected[0].id).toBe('mock');
  });

  it('getConnected() excludes connectors with expired credentials', () => {
    vault = createMockVault({ mock: { value: 'token123', isExpired: true } });
    registry = new ConnectorRegistry(vault);
    registry.register(new MockConnector());

    expect(registry.getConnected()).toHaveLength(0);
  });

  it('getConnected() excludes connectors without credentials', () => {
    registry.register(new MockConnector());
    expect(registry.getConnected()).toHaveLength(0);
  });

  it('generateTools() returns ToolDefinition[] only for connected connectors', () => {
    vault = createMockVault({ mock: { value: 'token123', isExpired: false } });
    registry = new ConnectorRegistry(vault);
    registry.register(new MockConnector());

    const tools = registry.generateTools();
    expect(tools).toHaveLength(3); // 3 actions = 3 tools
  });

  it('generateTools() creates tools named connector_<id>_<action>', () => {
    vault = createMockVault({ mock: { value: 'token123', isExpired: false } });
    registry = new ConnectorRegistry(vault);
    registry.register(new MockConnector());

    const tools = registry.generateTools();
    const names = tools.map(t => t.name);
    expect(names).toEqual([
      'connector_mock_list_items',
      'connector_mock_create_item',
      'connector_mock_delete_item',
    ]);
  });

  it('generateTools() returns empty array for disconnected connectors', () => {
    registry.register(new MockConnector());
    expect(registry.generateTools()).toEqual([]);
  });

  it('healthCheck() delegates to connector healthCheck()', async () => {
    const connector = new MockConnector();
    registry.register(connector);

    const health = await registry.healthCheck('mock');
    expect(health).not.toBeNull();
    expect(health!.id).toBe('mock');
    expect(connector.healthCheckCalled).toBe(true);
  });

  it('healthCheck() returns null for unknown connector', async () => {
    expect(await registry.healthCheck('nonexistent')).toBeNull();
  });

  it('unregister() removes a connector', () => {
    registry.register(new MockConnector());
    expect(registry.getAll()).toHaveLength(1);

    const removed = registry.unregister('mock');
    expect(removed).toBe(true);
    expect(registry.getAll()).toHaveLength(0);
  });

  it('getDefinitions() returns definitions with live status', () => {
    vault = createMockVault({ mock: { value: 'tok', isExpired: false } });
    registry = new ConnectorRegistry(vault);
    registry.register(new MockConnector());

    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].status).toBe('connected');
    expect(defs[0].id).toBe('mock');
  });
});

// ─── Dynamic Tool Generation ─────────────────────────────────────────────

describe('Dynamic tool generation', () => {
  it('tool execute() delegates to connector.execute()', async () => {
    const vault = createMockVault({ mock: { value: 'tok', isExpired: false } });
    const registry = new ConnectorRegistry(vault);
    const connector = new MockConnector();
    registry.register(connector);

    const tools = registry.generateTools();
    const listTool = tools.find(t => t.name === 'connector_mock_list_items')!;

    const result = await listTool.execute({ limit: 10 });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.action).toBe('list_items');
    expect(parsed.data.params).toEqual({ limit: 10 });
  });

  it('tool input_schema matches ConnectorAction.inputSchema', () => {
    const vault = createMockVault({ mock: { value: 'tok', isExpired: false } });
    const registry = new ConnectorRegistry(vault);
    registry.register(new MockConnector());

    const tools = registry.generateTools();
    const listTool = tools.find(t => t.name === 'connector_mock_list_items')!;
    expect(listTool.parameters).toMatchObject({
      type: 'object',
      properties: { limit: { type: 'number' } },
    });
  });

  it('tool parameters do NOT include _connectorMeta (security: prevents LLM injection)', () => {
    const vault = createMockVault({ mock: { value: 'tok', isExpired: false } });
    const registry = new ConnectorRegistry(vault);
    registry.register(new MockConnector());

    const tools = registry.generateTools();
    // No tool should have _connectorMeta in its schema (risk is determined by tool name, not args)
    for (const tool of tools) {
      expect((tool.parameters as any)._connectorMeta).toBeUndefined();
    }
  });

  it('audit trail entry created on tool execution', async () => {
    const vault = createMockVault({ mock: { value: 'tok', isExpired: false } });
    const auditLog = vi.fn();
    const auditLogger: AuditLogger = { log: auditLog };
    const registry = new ConnectorRegistry(vault, auditLogger);
    registry.register(new MockConnector());

    const tools = registry.generateTools();
    const createTool = tools.find(t => t.name === 'connector_mock_create_item')!;
    await createTool.execute({ name: 'Test Item' });

    expect(auditLog).toHaveBeenCalledWith({
      actionType: 'connector.mock.create_item',
      description: 'Connector action: Mock Service → create_item',
      requiresApproval: true,
    });
  });

  it('tool execution handles errors gracefully', async () => {
    const vault = createMockVault({ mock: { value: 'tok', isExpired: false } });
    const registry = new ConnectorRegistry(vault);

    // Create a connector that throws
    const connector = new MockConnector();
    connector.execute = async () => { throw new Error('API timeout'); };
    registry.register(connector);

    const tools = registry.generateTools();
    const listTool = tools.find(t => t.name === 'connector_mock_list_items')!;
    const result = JSON.parse(await listTool.execute({}));
    expect(result.success).toBe(false);
    expect(result.error).toBe('API timeout');
  });

  it('connector receives clean args without internal metadata', async () => {
    const vault = createMockVault({ mock: { value: 'tok', isExpired: false } });
    const registry = new ConnectorRegistry(vault);
    const connector = new MockConnector();
    registry.register(connector);

    const tools = registry.generateTools();
    const createTool = tools.find(t => t.name === 'connector_mock_create_item')!;
    await createTool.execute({ name: 'Test' });

    expect(connector.executeCalls[0].params).toEqual({ name: 'Test' });
  });
});

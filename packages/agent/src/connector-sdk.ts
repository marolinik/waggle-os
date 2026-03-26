/**
 * Connector SDK — runtime interface for external integrations.
 *
 * WaggleConnector is the server-side executable counterpart to the
 * serializable ConnectorDefinition (from @waggle/shared). Each connector
 * implementation provides actions that become agent tools when connected.
 */

import type { ConnectorDefinition, ConnectorHealth, ConnectorStatus, ConnectorActionMeta } from '@waggle/shared';
import type { VaultStore } from '@waggle/core';

/** Full action definition with input/output schemas (runtime-only) */
export interface ConnectorAction {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
  outputSchema?: Record<string, unknown>; // JSON Schema
  riskLevel: 'low' | 'medium' | 'high';
}

/** Result from executing a connector action */
export interface ConnectorResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Runtime connector interface. Implementations live in connectors/ directory.
 * Each connector provides vault-based auth, health checks, and executable actions.
 */
export interface WaggleConnector {
  /** Unique connector ID (e.g., 'github', 'slack') */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** What this connector does */
  readonly description: string;
  /** Which service it connects to */
  readonly service: string;
  /** Auth method required */
  readonly authType: 'bearer' | 'oauth2' | 'api_key' | 'basic';
  /** Available actions when connected */
  readonly actions: ConnectorAction[];
  /** Which substrate manages this connector */
  readonly substrate: 'waggle' | 'kvark';

  /** Initialize connector with vault credentials */
  connect(vault: VaultStore): Promise<void>;
  /** Check if connection is healthy */
  healthCheck(): Promise<ConnectorHealth>;
  /** Execute an action by name */
  execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult>;
  /** Map to the serializable ConnectorDefinition (for REST API / UI) */
  toDefinition(status: ConnectorStatus): ConnectorDefinition;
}

/**
 * Base class for connectors that provides common toDefinition() logic.
 * Concrete connectors extend this and implement connect/healthCheck/execute.
 */
export abstract class BaseConnector implements WaggleConnector {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly service: string;
  abstract readonly authType: 'bearer' | 'oauth2' | 'api_key' | 'basic';
  abstract readonly actions: ConnectorAction[];
  abstract readonly substrate: 'waggle' | 'kvark';

  abstract connect(vault: VaultStore): Promise<void>;
  abstract healthCheck(): Promise<ConnectorHealth>;
  abstract execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult>;

  /** Derive capabilities from action risk levels */
  protected deriveCapabilities(): ('read' | 'write' | 'search')[] {
    const caps = new Set<'read' | 'write' | 'search'>();
    for (const action of this.actions) {
      if (action.riskLevel === 'low') caps.add('read');
      if (action.riskLevel === 'medium' || action.riskLevel === 'high') caps.add('write');
      if (action.name.includes('search') || action.name.includes('find') || action.name.includes('list')) {
        caps.add('search');
      }
    }
    return [...caps];
  }

  /** Safely extract and truncate API error text (defense-in-depth against large/leaky error responses) */
  protected async safeErrorText(res: Response, prefix: string): Promise<string> {
    try {
      const text = await res.text();
      const truncated = text.length > 500 ? text.slice(0, 500) + '...[truncated]' : text;
      return `${prefix} ${res.status}: ${truncated}`;
    } catch {
      return `${prefix} ${res.status}`;
    }
  }

  toDefinition(status: ConnectorStatus): ConnectorDefinition {
    const actionMeta: ConnectorActionMeta[] = this.actions.map(a => ({
      name: a.name,
      description: a.description,
      riskLevel: a.riskLevel,
    }));
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      service: this.service,
      authType: this.authType,
      status,
      capabilities: this.deriveCapabilities(),
      substrate: this.substrate,
      tools: this.actions.map(a => `connector_${this.id}_${a.name}`),
      actions: actionMeta,
    };
  }
}

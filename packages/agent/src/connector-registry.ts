/**
 * ConnectorRegistry — manages registered connectors and generates dynamic agent tools.
 *
 * Lifecycle: register connectors at startup → check vault for credentials →
 * generate ToolDefinition[] for connected connectors → inject into agent loop.
 */

import type { WaggleConnector, ConnectorResult } from './connector-sdk.js';
import type { ToolDefinition } from './tools.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorDefinition, ConnectorHealth } from '@waggle/shared';

export interface AuditLogger {
  log(entry: { actionType: string; description: string; requiresApproval?: boolean }): void;
}

const ALWAYS_CONNECTED_CONNECTOR_IDS = new Set(['slack-mock', 'teams-mock', 'discord-mock']);

interface ConnectorHydration {
  promise: Promise<void>;
  status: 'pending' | 'ready' | 'failed';
}

export class ConnectorRegistry {
  private connectors = new Map<string, WaggleConnector>();
  private hydration = new WeakMap<WaggleConnector, ConnectorHydration>();
  private vault: VaultStore;
  private auditLogger?: AuditLogger;

  constructor(vault: VaultStore, auditLogger?: AuditLogger) {
    this.vault = vault;
    this.auditLogger = auditLogger;
  }

  /** Register a connector in the registry */
  register(connector: WaggleConnector): void {
    this.connectors.set(connector.id, connector);
    void this.beginHydration(connector);
  }

  /** Reload a registered connector's in-memory state from the vault. */
  async hydrate(id: string): Promise<boolean> {
    const connector = this.connectors.get(id);
    if (!connector) return false;
    try {
      await this.beginHydration(connector);
      return true;
    } catch {
      return false;
    }
  }

  /** Remove a connector from the registry */
  unregister(id: string): boolean {
    return this.connectors.delete(id);
  }

  /** Get all registered connectors */
  getAll(): WaggleConnector[] {
    return [...this.connectors.values()];
  }

  /** Get a connector by ID */
  get(id: string): WaggleConnector | undefined {
    return this.connectors.get(id);
  }

  private beginHydration(connector: WaggleConnector): Promise<void> {
    const previous = this.hydration.get(connector)?.promise;
    const promise = (async () => {
      if (previous) {
        try {
          await previous;
        } catch {
          // A fresh vault read can recover from a failed earlier hydration.
        }
      }
      await connector.connect(this.vault);
    })();
    const hydration: ConnectorHydration = { promise, status: 'pending' };
    this.hydration.set(connector, hydration);
    void promise.then(
      () => {
        if (this.hydration.get(connector) === hydration) hydration.status = 'ready';
      },
      () => {
        if (this.hydration.get(connector) === hydration) hydration.status = 'failed';
      },
    );
    return promise;
  }

  private async waitForHydration(connector: WaggleConnector): Promise<void> {
    while (true) {
      const hydration = this.hydration.get(connector);
      if (!hydration) return;
      try {
        await hydration.promise;
      } catch (err) {
        if (this.hydration.get(connector) !== hydration) continue;
        throw err;
      }
      if (this.hydration.get(connector) === hydration) return;
    }
  }

  private isConnected(connector: WaggleConnector): boolean {
    try {
      if (this.connectors.get(connector.id) !== connector) return false;
      if (this.hydration.get(connector)?.status !== 'ready') return false;
      if (ALWAYS_CONNECTED_CONNECTOR_IDS.has(connector.id)) return true;
      const cred = this.vault.getConnectorCredential(connector.id);
      return Boolean(
        cred
        && !cred.isExpired
        && connector.toDefinition('connected').status === 'connected',
      );
    } catch {
      return false;
    }
  }

  /** Get connectors that have valid (non-expired) credentials in vault OR are mock channel connectors */
  getConnected(): WaggleConnector[] {
    return [...this.connectors.values()].filter(connector => this.isConnected(connector));
  }

  /** Get ConnectorDefinition[] with live status from vault (for REST API responses) */
  getDefinitions(): ConnectorDefinition[] {
    return [...this.connectors.values()].map(c => {
      const cred = this.vault.getConnectorCredential(c.id);
      let status: ConnectorDefinition['status'] = 'disconnected';
      if (cred) {
        status = cred.isExpired ? 'expired' : (this.isConnected(c) ? 'connected' : 'disconnected');
      }
      return c.toDefinition(status);
    });
  }

  /** Health check a specific connector */
  async healthCheck(id: string): Promise<ConnectorHealth | null> {
    const connector = this.connectors.get(id);
    if (!connector) return null;
    await this.waitForHydration(connector);
    if (this.connectors.get(id) !== connector) return null;
    return connector.healthCheck();
  }

  /**
   * Generate ToolDefinition[] for all connected connectors.
   * Each action becomes a tool named `connector_<id>_<action>`.
   * Trusted action risk stays on ToolDefinition metadata for approval gates.
   */
  generateTools(): ToolDefinition[] {
    const connected = this.getConnected();
    const tools: ToolDefinition[] = [];

    for (const connector of connected) {
      for (const action of connector.actions) {
        const toolName = `connector_${connector.id}_${action.name}`;
        tools.push({
          name: toolName,
          description: `[${connector.name}] ${action.description}`,
          riskLevel: action.riskLevel,
          parameters: {
            type: 'object',
            ...(action.inputSchema as Record<string, unknown>),
          },
          execute: async (args: Record<string, unknown>) => {
            try {
              await this.waitForHydration(connector);
            } catch {
              const disconnected: ConnectorResult = {
                success: false,
                error: 'Connector is not connected',
              };
              return JSON.stringify(disconnected);
            }

            if (!this.isConnected(connector)) {
              const disconnected: ConnectorResult = {
                success: false,
                error: 'Connector is not connected',
              };
              return JSON.stringify(disconnected);
            }

            const cleanArgs = { ...args };

            // Audit log every connector execution
            this.auditLogger?.log({
              actionType: `connector.${connector.id}.${action.name}`,
              description: `Connector action: ${connector.name} → ${action.name}`,
              requiresApproval: action.riskLevel !== 'low',
            });

            try {
              const result = await connector.execute(action.name, cleanArgs);
              return JSON.stringify(result);
            } catch (err: unknown) {
              const error = err instanceof Error ? err.message : String(err);
              const failResult: ConnectorResult = { success: false, error };
              return JSON.stringify(failResult);
            }
          },
        });
      }
    }

    return tools;
  }
}

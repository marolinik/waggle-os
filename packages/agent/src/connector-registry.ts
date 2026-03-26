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

export class ConnectorRegistry {
  private connectors = new Map<string, WaggleConnector>();
  private vault: VaultStore;
  private auditLogger?: AuditLogger;

  constructor(vault: VaultStore, auditLogger?: AuditLogger) {
    this.vault = vault;
    this.auditLogger = auditLogger;
  }

  /** Register a connector in the registry */
  register(connector: WaggleConnector): void {
    this.connectors.set(connector.id, connector);
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

  /** Get connectors that have valid (non-expired) credentials in vault OR are mock channel connectors */
  getConnected(): WaggleConnector[] {
    // Mock channel connector IDs that are always available without credentials
    const ALWAYS_CONNECTED = new Set(['slack-mock', 'teams-mock', 'discord-mock']);
    return [...this.connectors.values()].filter(c => {
      if (ALWAYS_CONNECTED.has(c.id)) return true;
      const cred = this.vault.getConnectorCredential(c.id);
      return cred && !cred.isExpired;
    });
  }

  /** Get ConnectorDefinition[] with live status from vault (for REST API responses) */
  getDefinitions(): ConnectorDefinition[] {
    return [...this.connectors.values()].map(c => {
      const cred = this.vault.getConnectorCredential(c.id);
      let status: ConnectorDefinition['status'] = 'disconnected';
      if (cred) {
        status = cred.isExpired ? 'expired' : 'connected';
      }
      return c.toDefinition(status);
    });
  }

  /** Health check a specific connector */
  async healthCheck(id: string): Promise<ConnectorHealth | null> {
    const connector = this.connectors.get(id);
    if (!connector) return null;
    return connector.healthCheck();
  }

  /**
   * Generate ToolDefinition[] for all connected connectors.
   * Each action becomes a tool named `connector_<id>_<action>`.
   * High-risk actions include _riskLevel metadata for approval gates.
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
          parameters: {
            type: 'object',
            ...(action.inputSchema as Record<string, unknown>),
          },
          execute: async (args: Record<string, unknown>) => {
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

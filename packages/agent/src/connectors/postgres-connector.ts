/**
 * PostgreSQL Connector — execute SQL queries against a PostgreSQL database.
 * Auth: API Key (connection string, e.g., "postgresql://user:pass@host:5432/db")
 * Uses dynamic import for 'pg' — gracefully handles missing module.
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

export class PostgresConnector extends BaseConnector {
  readonly id = 'postgres';
  readonly name = 'PostgreSQL';
  readonly description = 'Execute SQL queries against a PostgreSQL database';
  readonly service = 'local';
  readonly authType = 'api_key' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'query',
      description: 'Run a SELECT query and return results',
      inputSchema: {
        properties: {
          sql: { type: 'string', description: 'SQL SELECT query to execute' },
          params: { type: 'array', items: { type: 'string' }, description: 'Parameterized query values ($1, $2, ...)' },
        },
        required: ['sql'],
      },
      riskLevel: 'low',
    },
    {
      name: 'execute',
      description: 'Run an INSERT, UPDATE, or DELETE statement',
      inputSchema: {
        properties: {
          sql: { type: 'string', description: 'SQL statement to execute' },
          params: { type: 'array', items: { type: 'string' }, description: 'Parameterized query values ($1, $2, ...)' },
        },
        required: ['sql'],
      },
      riskLevel: 'high',
    },
    {
      name: 'list_tables',
      description: 'List all tables in the current database schema',
      inputSchema: {
        properties: {
          schema: { type: 'string', description: 'Schema name (default "public")' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'describe_table',
      description: 'Show column names, types, and constraints for a table',
      inputSchema: {
        properties: {
          table: { type: 'string', description: 'Table name' },
          schema: { type: 'string', description: 'Schema name (default "public")' },
        },
        required: ['table'],
      },
      riskLevel: 'low',
    },
  ];

  private connectionString: string | null = null;
  private pgModule: any = null;
  private client: any = null;

  async connect(vault: VaultStore): Promise<void> {
    const cred = vault.getConnectorCredential(this.id);
    this.connectionString = cred?.value ?? null;

    // Try to dynamically import pg
    if (this.connectionString) {
      try {
        // @ts-expect-error pg is an optional dependency
        this.pgModule = await import('pg');
      } catch {
        this.pgModule = null;
      }
    }
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const health: ConnectorHealth = {
      id: this.id,
      name: this.name,
      status: this.connectionString ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
    };

    if (!this.connectionString) return health;

    if (!this.pgModule) {
      health.status = 'error';
      health.error = 'pg module not installed — run "npm install pg" to enable PostgreSQL connector';
      return health;
    }

    try {
      const client = new this.pgModule.Client({ connectionString: this.connectionString });
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
    } catch (err: unknown) {
      health.status = 'error';
      health.error = err instanceof Error ? err.message : String(err);
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.connectionString) {
      return { success: false, error: 'Not connected — add PostgreSQL connection string in vault' };
    }

    if (!this.pgModule) {
      return { success: false, error: 'pg module not installed — run "npm install pg" to enable PostgreSQL connector' };
    }

    switch (action) {
      case 'query': return this.runQuery(params);
      case 'execute': return this.runExecute(params);
      case 'list_tables': return this.listTables(params);
      case 'describe_table': return this.describeTable(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private async getClient(): Promise<any> {
    const client = new this.pgModule.Client({ connectionString: this.connectionString });
    await client.connect();
    return client;
  }

  private async runQuery(params: Record<string, unknown>): Promise<ConnectorResult> {
    let client: any;
    try {
      const sql = String(params.sql);
      // Safety check: only allow SELECT / WITH / EXPLAIN / SHOW
      const normalized = sql.trim().toUpperCase();
      if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH') && !normalized.startsWith('EXPLAIN') && !normalized.startsWith('SHOW')) {
        return { success: false, error: 'query action only supports SELECT, WITH, EXPLAIN, and SHOW statements. Use execute for mutations.' };
      }

      client = await this.getClient();
      const queryParams = (params.params as string[]) ?? [];
      const result = await client.query(sql, queryParams);
      await client.end();

      return {
        success: true,
        data: {
          rows: result.rows,
          rowCount: result.rowCount,
          fields: result.fields?.map((f: any) => ({ name: f.name, dataTypeID: f.dataTypeID })),
        },
      };
    } catch (err: unknown) {
      try { await client?.end(); } catch { /* ignore */ }
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async runExecute(params: Record<string, unknown>): Promise<ConnectorResult> {
    let client: any;
    try {
      const sql = String(params.sql);
      // Safety: block DROP DATABASE, TRUNCATE on system tables, etc.
      const normalized = sql.trim().toUpperCase();
      if (normalized.startsWith('DROP DATABASE') || normalized.startsWith('DROP SCHEMA')) {
        return { success: false, error: 'DROP DATABASE and DROP SCHEMA are blocked for safety' };
      }

      client = await this.getClient();
      const queryParams = (params.params as string[]) ?? [];
      const result = await client.query(sql, queryParams);
      await client.end();

      return {
        success: true,
        data: {
          rowCount: result.rowCount,
          command: result.command,
        },
      };
    } catch (err: unknown) {
      try { await client?.end(); } catch { /* ignore */ }
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async listTables(params: Record<string, unknown>): Promise<ConnectorResult> {
    let client: any;
    try {
      const schema = String(params.schema ?? 'public');
      client = await this.getClient();
      const result = await client.query(
        `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
        [schema],
      );
      await client.end();

      return {
        success: true,
        data: {
          tables: result.rows,
          schema,
          count: result.rowCount,
        },
      };
    } catch (err: unknown) {
      try { await client?.end(); } catch { /* ignore */ }
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async describeTable(params: Record<string, unknown>): Promise<ConnectorResult> {
    let client: any;
    try {
      const table = String(params.table);
      const schema = String(params.schema ?? 'public');
      client = await this.getClient();

      // Column info
      const columns = await client.query(
        `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schema, table],
      );

      // Primary key info
      const pk = await client.query(
        `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
         WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type = 'PRIMARY KEY'
         ORDER BY kcu.ordinal_position`,
        [schema, table],
      );

      await client.end();

      return {
        success: true,
        data: {
          table,
          schema,
          columns: columns.rows,
          primaryKey: pk.rows.map((r: any) => r.column_name),
        },
      };
    } catch (err: unknown) {
      try { await client?.end(); } catch { /* ignore */ }
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

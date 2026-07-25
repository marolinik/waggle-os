/**
 * Monday.com Connector — manage boards and items via GraphQL API.
 * Auth: Bearer (API v2 token)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_URL = 'https://api.monday.com/v2';
const BOARD_KINDS = new Set(['public', 'private', 'share']);

export class MondayConnector extends BaseConnector {
  readonly id = 'monday';
  readonly name = 'Monday.com';
  readonly description = "Read and update Monday.com boards, items, and columns. Query work items, update statuses, manage assignments, and track project progress across boards.";
  readonly service = 'monday.com';
  readonly authType = 'bearer' as const;
  readonly substrate = 'waggle' as const;
  readonly logoUrl = 'https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/mondaydotcom.svg';
  readonly category = 'productivity' as const;
  readonly setupGuide = "Get your API Token from monday.com Profile > Developers > API.";

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_boards',
      description: 'List boards accessible to the user',
      inputSchema: {
        properties: {
          limit: { type: 'number', description: 'Number of boards to return (default 25)' },
          page: { type: 'number', description: 'Page number (default 1)' },
          board_kind: { type: 'string', enum: ['public', 'private', 'share'], description: 'Filter by board kind' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'list_items',
      description: 'List items (rows) in a board',
      inputSchema: {
        properties: {
          boardId: { type: 'string', description: 'Board ID to list items from' },
          limit: { type: 'number', description: 'Number of items to return (default 50)' },
          groupId: { type: 'string', description: 'Filter by group ID within the board' },
        },
        required: ['boardId'],
      },
      riskLevel: 'low',
    },
    {
      name: 'create_item',
      description: 'Create a new item (row) in a board',
      inputSchema: {
        properties: {
          boardId: { type: 'string', description: 'Board ID to create item in' },
          itemName: { type: 'string', description: 'Item name' },
          groupId: { type: 'string', description: 'Group ID to place item in (optional)' },
          columnValues: { type: 'string', description: 'JSON string of column values (e.g., \'{"status": {"label": "Working on it"}}\')' },
        },
        required: ['boardId', 'itemName'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'update_item',
      description: 'Update column values of an existing item',
      inputSchema: {
        properties: {
          boardId: { type: 'string', description: 'Board ID containing the item' },
          itemId: { type: 'string', description: 'Item ID to update' },
          columnValues: { type: 'string', description: 'JSON string of column values to update' },
        },
        required: ['boardId', 'itemId', 'columnValues'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'search_items',
      description: 'Search items across boards by text',
      inputSchema: {
        properties: {
          query: { type: 'string', description: 'Search query text' },
          limit: { type: 'number', description: 'Max results (default 25)' },
        },
        required: ['query'],
      },
      riskLevel: 'low',
    },
  ];

  private token: string | null = null;

  async connect(vault: VaultStore): Promise<void> {
    const cred = vault.getConnectorCredential(this.id);
    this.token = cred?.value ?? null;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const health: ConnectorHealth = {
      id: this.id,
      name: this.name,
      status: this.token ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
    };

    if (this.token) {
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ query: '{ me { id name } }' }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Monday.com API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.token) return { success: false, error: 'Not connected — add Monday.com API token in vault' };

    switch (action) {
      case 'list_boards': return this.listBoards(params);
      case 'list_items': return this.listItems(params);
      case 'create_item': return this.createItem(params);
      case 'update_item': return this.updateItem(params);
      case 'search_items': return this.searchItems(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: this.token!,
      'Content-Type': 'application/json',
    };
  }

  private async graphql(query: string, variables?: Record<string, unknown>): Promise<ConnectorResult> {
    try {
      const body: Record<string, unknown> = { query };
      if (variables) body.variables = variables;
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Monday.com API') };
      const json = await res.json() as { data?: unknown; errors?: Array<{ message: string }> };
      if (json.errors?.length) {
        return { success: false, error: `Monday.com GraphQL: ${json.errors.map(e => e.message).join('; ')}` };
      }
      return { success: true, data: json.data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async listBoards(params: Record<string, unknown>): Promise<ConnectorResult> {
    const limit = (params.limit as number) ?? 25;
    const page = (params.page as number) ?? 1;
    const boardKind = params.board_kind;
    if (boardKind !== undefined && (typeof boardKind !== 'string' || !BOARD_KINDS.has(boardKind))) {
      return { success: false, error: 'Invalid board_kind' };
    }
    const kindDefinition = boardKind ? ', $boardKind: BoardKind' : '';
    const kindFilter = boardKind ? ', board_kind: $boardKind' : '';
    const variables: Record<string, unknown> = { limit, page };
    if (boardKind) variables.boardKind = boardKind;
    return this.graphql(
      `query ListBoards($limit: Int, $page: Int${kindDefinition}) { boards(limit: $limit, page: $page${kindFilter}) { id name state board_kind columns { id title type } groups { id title } } }`,
      variables,
    );
  }

  private async listItems(params: Record<string, unknown>): Promise<ConnectorResult> {
    const limit = (params.limit as number) ?? 50;
    const boardId = params.boardId;
    if (params.groupId) {
      return this.graphql(
        `query ListGroupItems($boardId: ID!, $groupId: String!, $limit: Int) { boards(ids: [$boardId]) { groups(ids: [$groupId]) { items_page(limit: $limit) { items { id name column_values { id text value } } } } } }`,
        { boardId, groupId: params.groupId, limit },
      );
    }
    return this.graphql(
      `query ListItems($boardId: ID!, $limit: Int) { boards(ids: [$boardId]) { items_page(limit: $limit) { items { id name group { id title } column_values { id text value } } } } }`,
      { boardId, limit },
    );
  }

  private async createItem(params: Record<string, unknown>): Promise<ConnectorResult> {
    const { boardId, itemName, groupId, columnValues } = params;
    const definitions = ['$boardId: ID!', '$itemName: String!'];
    const arguments_ = ['board_id: $boardId', 'item_name: $itemName'];
    const variables: Record<string, unknown> = { boardId, itemName };

    if (groupId) {
      definitions.push('$groupId: String');
      arguments_.push('group_id: $groupId');
      variables.groupId = groupId;
    }
    if (columnValues) {
      definitions.push('$columnValues: JSON');
      arguments_.push('column_values: $columnValues');
      variables.columnValues = columnValues;
    }

    return this.graphql(
      `mutation CreateItem(${definitions.join(', ')}) { create_item(${arguments_.join(', ')}) { id name } }`,
      variables,
    );
  }

  private async updateItem(params: Record<string, unknown>): Promise<ConnectorResult> {
    const { boardId, itemId, columnValues } = params;
    return this.graphql(
      `mutation UpdateItem($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id name } }`,
      { boardId, itemId, columnValues },
    );
  }

  private async searchItems(params: Record<string, unknown>): Promise<ConnectorResult> {
    const limit = (params.limit as number) ?? 25;
    return this.graphql(
      `query SearchItems($limit: Int, $query: String!) { items_page_by_column_values(limit: $limit, board_id: 0, columns: [{column_id: "name", column_values: [$query]}]) { items { id name board { id name } column_values { id text value } } } }`,
      { limit, query: params.query },
    );
  }
}

/**
 * Trello Connector — manage boards, lists, and cards via REST API.
 * Auth: API key + token (query params)
 */

import { BaseConnector, type ConnectorAction, type ConnectorResult } from '../connector-sdk.js';
import type { VaultStore } from '@waggle/core';
import type { ConnectorHealth } from '@waggle/shared';

const API_BASE = 'https://api.trello.com/1';

export class TrelloConnector extends BaseConnector {
  readonly id = 'trello';
  readonly name = 'Trello';
  readonly description = 'Manage boards, lists, and cards in Trello';
  readonly service = 'trello.com';
  readonly authType = 'api_key' as const;
  readonly substrate = 'waggle' as const;

  readonly actions: ConnectorAction[] = [
    {
      name: 'list_boards',
      description: 'List boards for the authenticated user',
      inputSchema: {
        properties: {
          filter: { type: 'string', enum: ['all', 'open', 'closed', 'members', 'organization', 'public', 'starred'], description: 'Board filter (default "open")' },
          fields: { type: 'string', description: 'Comma-separated field names to return' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'list_cards',
      description: 'List cards on a board or in a list',
      inputSchema: {
        properties: {
          boardId: { type: 'string', description: 'Board ID to list cards from' },
          listId: { type: 'string', description: 'List ID to list cards from (alternative to boardId)' },
          filter: { type: 'string', enum: ['all', 'open', 'closed'], description: 'Card filter (default "open")' },
        },
      },
      riskLevel: 'low',
    },
    {
      name: 'create_card',
      description: 'Create a new card in a list',
      inputSchema: {
        properties: {
          idList: { type: 'string', description: 'List ID to create card in' },
          name: { type: 'string', description: 'Card name/title' },
          desc: { type: 'string', description: 'Card description (markdown)' },
          pos: { type: 'string', description: 'Position: "top", "bottom", or a number' },
          due: { type: 'string', description: 'Due date (ISO format)' },
          idLabels: { type: 'string', description: 'Comma-separated label IDs' },
          idMembers: { type: 'string', description: 'Comma-separated member IDs' },
        },
        required: ['idList', 'name'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'update_card',
      description: 'Update an existing Trello card',
      inputSchema: {
        properties: {
          cardId: { type: 'string', description: 'Card ID to update' },
          name: { type: 'string', description: 'New card name' },
          desc: { type: 'string', description: 'New description' },
          closed: { type: 'boolean', description: 'Archive the card (true/false)' },
          idList: { type: 'string', description: 'Move card to a different list' },
          due: { type: 'string', description: 'New due date (ISO format)' },
          pos: { type: 'string', description: 'New position: "top", "bottom", or a number' },
        },
        required: ['cardId'],
      },
      riskLevel: 'medium',
    },
    {
      name: 'list_lists',
      description: 'List all lists on a board',
      inputSchema: {
        properties: {
          boardId: { type: 'string', description: 'Board ID' },
          filter: { type: 'string', enum: ['all', 'open', 'closed'], description: 'List filter (default "open")' },
        },
        required: ['boardId'],
      },
      riskLevel: 'low',
    },
    {
      name: 'search_cards',
      description: 'Search cards across boards',
      inputSchema: {
        properties: {
          query: { type: 'string', description: 'Search query text' },
          idBoards: { type: 'string', description: 'Comma-separated board IDs to limit search (or "mine")' },
          cards_limit: { type: 'number', description: 'Max card results (default 10, max 1000)' },
        },
        required: ['query'],
      },
      riskLevel: 'low',
    },
  ];

  private apiKey: string | null = null;
  private apiToken: string | null = null;

  async connect(vault: VaultStore): Promise<void> {
    const cred = vault.getConnectorCredential(this.id);
    this.apiToken = cred?.value ?? null;
    // API key stored as a separate vault entry
    const keyEntry = vault.get(`connector:${this.id}:api_key`);
    this.apiKey = keyEntry?.value ?? null;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const health: ConnectorHealth = {
      id: this.id,
      name: this.name,
      status: this.apiKey && this.apiToken ? 'connected' : 'disconnected',
      lastChecked: new Date().toISOString(),
    };

    if (this.apiKey && this.apiToken) {
      try {
        const res = await fetch(`${API_BASE}/members/me?${this.authParams()}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          health.status = 'error';
          health.error = `Trello API returned ${res.status}`;
        }
      } catch (err: unknown) {
        health.status = 'error';
        health.error = err instanceof Error ? err.message : String(err);
      }
    }

    return health;
  }

  async execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult> {
    if (!this.apiKey || !this.apiToken) {
      return { success: false, error: 'Not connected — add Trello API key and token in vault' };
    }

    switch (action) {
      case 'list_boards': return this.listBoards(params);
      case 'list_cards': return this.listCards(params);
      case 'create_card': return this.createCard(params);
      case 'update_card': return this.updateCard(params);
      case 'list_lists': return this.listLists(params);
      case 'search_cards': return this.searchCards(params);
      default: return { success: false, error: `Unknown action: ${action}` };
    }
  }

  /** Build auth query parameter string */
  private authParams(): string {
    return `key=${encodeURIComponent(this.apiKey!)}&token=${encodeURIComponent(this.apiToken!)}`;
  }

  private async apiGet(path: string, params: Record<string, unknown> = {}, stripKeys: string[] = []): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (!stripKeys.includes(k) && v !== undefined) query.set(k, String(v));
      }
      const qs = query.toString();
      const authQs = this.authParams();
      const sep = qs ? `&${qs}` : '';
      const url = `${API_BASE}${path}?${authQs}${sep}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Trello API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async apiPost(path: string, params: Record<string, unknown> = {}, stripKeys: string[] = []): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      // Trello POST uses query params for auth and form data for body, but simple approach: all as query params
      for (const [k, v] of Object.entries(params)) {
        if (!stripKeys.includes(k) && v !== undefined) query.set(k, String(v));
      }
      const qs = query.toString();
      const authQs = this.authParams();
      const sep = qs ? `&${qs}` : '';
      const url = `${API_BASE}${path}?${authQs}${sep}`;
      const res = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Trello API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async apiPut(path: string, params: Record<string, unknown> = {}, stripKeys: string[] = []): Promise<ConnectorResult> {
    try {
      const query = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (!stripKeys.includes(k) && v !== undefined) query.set(k, String(v));
      }
      const qs = query.toString();
      const authQs = this.authParams();
      const sep = qs ? `&${qs}` : '';
      const url = `${API_BASE}${path}?${authQs}${sep}`;
      const res = await fetch(url, {
        method: 'PUT',
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, error: await this.safeErrorText(res, 'Trello API') };
      return { success: true, data: await res.json() };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async listBoards(params: Record<string, unknown>): Promise<ConnectorResult> {
    const queryParams: Record<string, unknown> = {};
    if (params.filter) queryParams.filter = params.filter;
    if (params.fields) queryParams.fields = params.fields;
    return this.apiGet('/members/me/boards', queryParams);
  }

  private async listCards(params: Record<string, unknown>): Promise<ConnectorResult> {
    const queryParams: Record<string, unknown> = {};
    if (params.filter) queryParams.filter = params.filter;
    if (params.listId) {
      return this.apiGet(`/lists/${encodeURIComponent(String(params.listId))}/cards`, queryParams, ['listId']);
    }
    if (params.boardId) {
      return this.apiGet(`/boards/${encodeURIComponent(String(params.boardId))}/cards`, queryParams, ['boardId']);
    }
    return { success: false, error: 'Provide boardId or listId to list cards' };
  }

  private async createCard(params: Record<string, unknown>): Promise<ConnectorResult> {
    return this.apiPost('/cards', params);
  }

  private async updateCard(params: Record<string, unknown>): Promise<ConnectorResult> {
    const { cardId, ...updates } = params;
    return this.apiPut(`/cards/${encodeURIComponent(String(cardId))}`, updates);
  }

  private async listLists(params: Record<string, unknown>): Promise<ConnectorResult> {
    const queryParams: Record<string, unknown> = {};
    if (params.filter) queryParams.filter = params.filter;
    return this.apiGet(`/boards/${encodeURIComponent(String(params.boardId))}/lists`, queryParams, ['boardId']);
  }

  private async searchCards(params: Record<string, unknown>): Promise<ConnectorResult> {
    const queryParams: Record<string, unknown> = {
      query: params.query,
      modelTypes: 'cards',
    };
    if (params.idBoards) queryParams.idBoards = params.idBoards;
    if (params.cards_limit) queryParams.cards_limit = params.cards_limit;
    return this.apiGet('/search', queryParams);
  }
}

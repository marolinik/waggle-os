/**
 * KvarkClient — the single boundary between Waggle and KVARK.
 *
 * All Waggle-side KVARK interaction flows through this client.
 * Handles auth, request formatting, response normalization, and errors.
 * Uses KvarkAuth for automatic token management.
 *
 * Design rules:
 * - Waggle never calls KVARK endpoints directly — always through KvarkClient
 * - Waggle never re-ranks KVARK results
 * - Waggle never duplicates KVARK's retrieval logic
 * - KVARK remains a black box from KvarkClient's perspective
 */

import { KvarkAuth } from './kvark-auth.js';
import type {
  KvarkActionRequest,
  KvarkActionResponse,
  KvarkAskRequest,
  KvarkAskResponse,
  KvarkClientConfig,
  KvarkFeedbackRequest,
  KvarkFeedbackResponse,
  KvarkSearchResponse,
  KvarkUser,
} from './kvark-types.js';
import {
  KvarkAuthError,
  KvarkNotFoundError,
  KvarkNotImplementedError,
  KvarkServerError,
  KvarkUnavailableError,
} from './kvark-types.js';

export class KvarkClient {
  private readonly auth: KvarkAuth;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryOnServerError: boolean;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: KvarkClientConfig, fetchFn?: typeof globalThis.fetch) {
    const fetch = fetchFn ?? globalThis.fetch;
    this.auth = new KvarkAuth(
      { baseUrl: config.baseUrl, identifier: config.identifier, password: config.password, timeoutMs: config.timeoutMs },
      fetch,
    );
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.retryOnServerError = config.retryOnServerError ?? true;
    this.fetchFn = fetch;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Search KVARK's document index.
   * GET /api/search?q=...&limit=...&offset=...
   */
  async search(query: string, opts?: { limit?: number; offset?: number }): Promise<KvarkSearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));

    return this.get<KvarkSearchResponse>(`/api/search?${params}`);
  }

  /**
   * Ask a focused question about a specific document.
   * POST /api/chat/ask
   * Note: This endpoint is currently stubbed (501) on KVARK — Waggle handles gracefully.
   */
  async askDocument(documentId: string, question: string): Promise<KvarkAskResponse> {
    const body: KvarkAskRequest = { document_id: documentId, question };
    return this.post<KvarkAskResponse>('/api/chat/ask', body);
  }

  /**
   * Send retrieval feedback to KVARK's reinforcement system.
   * POST /api/feedback
   * Fire-and-ack — Waggle should not treat this as a reasoning step.
   */
  async feedback(documentId: number, query: string, useful: boolean, reason?: string): Promise<KvarkFeedbackResponse> {
    const body: KvarkFeedbackRequest = {
      feedbackType: 'search_result',
      target: { documentId },
      signal: {
        rating: useful ? 'positive' : 'negative',
        label: useful ? 'useful' : 'not_useful',
        comment: reason,
      },
      context: { query },
    };
    return this.post<KvarkFeedbackResponse>('/api/feedback', body);
  }

  /**
   * Execute a governed enterprise action via KVARK.
   * POST /api/actions
   * Requires user approval. KVARK enforces its own governance policy.
   */
  async action(
    actionType: string,
    target: { entityType: string; entityId: string },
    payload: Record<string, unknown>,
    reason: string,
    approvalReference?: string,
    workspaceId?: string,
  ): Promise<KvarkActionResponse> {
    const body: KvarkActionRequest = {
      actionType,
      target,
      payload,
      governance: { userApproved: true, approvalReference },
      context: { workspaceId, reason },
    };
    return this.post<KvarkActionResponse>('/api/actions', body);
  }

  /**
   * Verify KVARK connectivity and auth.
   * GET /api/auth/me — returns current user if token is valid.
   */
  async ping(): Promise<KvarkUser> {
    return this.get<KvarkUser>('/api/auth/me');
  }

  // ── Internal HTTP methods ──────────────────────────────────────────────

  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const token = await this.auth.getToken();
      const result = await this.doFetch<T>(method, path, token, body);

      // On 401, re-auth once and retry
      if (result.status === 401) {
        this.auth.invalidate();
        const freshToken = await this.auth.login();
        const retry = await this.doFetch<T>(method, path, freshToken, body);
        if (retry.status === 401) {
          throw new KvarkAuthError('KVARK authentication failed after re-login');
        }
        return this.handleResponse<T>(retry);
      }

      // W5.3: On 429 rate-limit, wait with exponential backoff and retry
      if (result.status === 429) {
        if (attempt >= MAX_RETRIES) {
          throw new KvarkServerError(`KVARK rate limit exceeded after ${MAX_RETRIES} retries`, 429);
        }
        const retryAfter = parseInt(result.error ?? '', 10) || 0;
        const backoffMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * Math.pow(2, attempt), 30_000);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      // W5.3: On transient 5xx (not 501 Not Implemented), retry with exponential backoff
      if (result.status >= 500 && result.status !== 501 && this.retryOnServerError && attempt < MAX_RETRIES) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10_000);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      return this.handleResponse<T>(result);
    }

    // Should not reach here, but TypeScript needs it
    throw new KvarkServerError('KVARK request failed after max retries', 500);
  }

  private async doFetch<T>(
    method: string,
    path: string,
    token: string,
    body?: unknown,
  ): Promise<{ status: number; data?: T; error?: string }> {
    let res: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new KvarkUnavailableError(`KVARK request timed out: ${method} ${path}`);
      }
      throw new KvarkUnavailableError(`KVARK unreachable: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (res.ok) {
      const data = await res.json() as T;
      return { status: res.status, data };
    }

    const errorText = await res.text().catch(() => 'Unknown error');
    return { status: res.status, error: errorText };
  }

  private handleResponse<T>(result: { status: number; data?: T; error?: string }): T {
    if (result.data !== undefined) return result.data;

    const detail = result.error ?? 'Unknown error';
    switch (result.status) {
      case 401:
        throw new KvarkAuthError(detail);
      case 403:
        // W5.4: Explicit 403 handling — governance/permission denial
        throw new KvarkServerError(`KVARK access denied (forbidden): ${detail}`, 403);
      case 404:
        throw new KvarkNotFoundError(detail);
      case 429:
        // W5.3: Should be handled in request() retry loop, but catch here as fallback
        throw new KvarkServerError(`KVARK rate limited: ${detail}`, 429);
      case 501:
        throw new KvarkNotImplementedError(detail);
      default:
        if (result.status >= 500) {
          throw new KvarkServerError(detail, result.status);
        }
        throw new KvarkServerError(`KVARK error (${result.status}): ${detail}`, result.status);
    }
  }
}

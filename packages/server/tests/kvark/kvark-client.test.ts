/**
 * KvarkClient — tests with mocked fetch.
 * Verifies search, askDocument, ping, error handling, and 401 retry.
 */

import { describe, it, expect, vi } from 'vitest';
import { KvarkClient } from '../../src/kvark/kvark-client.js';
import {
  KvarkAuthError,
  KvarkNotFoundError,
  KvarkNotImplementedError,
  KvarkServerError,
  KvarkUnavailableError,
} from '../../src/kvark/kvark-types.js';

const LOGIN_OK = {
  status: 200,
  body: { success: true, access_token: 'test-token', token_type: 'bearer', user: { id: 1, identifier: 'test' }, error: null },
};

const SEARCH_OK = {
  status: 200,
  body: {
    results: [
      { document_id: 42, title: 'Project Status', snippet: 'API review postponed...', score: 0.92, document_type: 'pdf' },
      { document_id: 108, title: 'Q1 Budget', snippet: 'Budget allocation...', score: 0.87, document_type: 'spreadsheet' },
    ],
    total: 12,
    query: 'project status',
  },
};

const ASK_OK = {
  status: 200,
  body: { answer: 'The blocker is identity boundary design', sources: ['doc_42'] },
};

const PING_OK = {
  status: 200,
  body: { id: 1, identifier: 'admin', first_name: 'Admin', last_name: 'User', admin: true, developer: false, status: 'Active', created_at: null },
};

type MockResponse = { status: number; body: unknown };

function createMockFetch(responses: MockResponse[]): typeof globalThis.fetch {
  let callIndex = 0;
  return vi.fn(async (url: string) => {
    // Login calls always return the login response
    if (url.toString().includes('/api/auth/login')) {
      return new Response(JSON.stringify(LOGIN_OK.body), { status: LOGIN_OK.status, headers: { 'Content-Type': 'application/json' } });
    }
    const resp = responses[callIndex++] ?? { status: 500, body: { detail: 'No mock' } };
    return new Response(JSON.stringify(resp.body), { status: resp.status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof globalThis.fetch;
}

const BASE_CONFIG = { baseUrl: 'http://kvark:8000', identifier: 'admin', password: 'secret' };

describe('KvarkClient', () => {
  describe('search', () => {
    it('calls GET /api/search with query params and returns results', async () => {
      const fetch = createMockFetch([SEARCH_OK]);
      const client = new KvarkClient(BASE_CONFIG, fetch);

      const result = await client.search('project status', { limit: 10 });

      expect(result.results).toHaveLength(2);
      expect(result.total).toBe(12);
      expect(result.query).toBe('project status');
      expect(result.results[0].document_id).toBe(42);
      expect(result.results[0].title).toBe('Project Status');

      // Verify URL
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
      const searchCall = calls.find(c => c[0].toString().includes('/api/search'));
      expect(searchCall).toBeDefined();
      expect(searchCall![0]).toContain('q=project+status');
      expect(searchCall![0]).toContain('limit=10');
    });

    it('passes Authorization Bearer header', async () => {
      const fetch = createMockFetch([SEARCH_OK]);
      const client = new KvarkClient(BASE_CONFIG, fetch);

      await client.search('test');

      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
      const searchCall = calls.find(c => c[0].toString().includes('/api/search'));
      expect(searchCall![1].headers.Authorization).toBe('Bearer test-token');
    });
  });

  describe('askDocument', () => {
    it('calls POST /api/chat/ask with document_id and question', async () => {
      const fetch = createMockFetch([ASK_OK]);
      const client = new KvarkClient(BASE_CONFIG, fetch);

      const result = await client.askDocument('42', 'What is the blocker?');

      expect(result.answer).toBe('The blocker is identity boundary design');
      expect(result.sources).toContain('doc_42');

      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
      const askCall = calls.find(c => c[0].toString().includes('/api/chat/ask'));
      expect(askCall).toBeDefined();
      expect(askCall![1].method).toBe('POST');
      expect(JSON.parse(askCall![1].body)).toEqual({ document_id: '42', question: 'What is the blocker?' });
    });

    it('throws KvarkNotImplementedError on 501', async () => {
      const fetch = createMockFetch([{ status: 501, body: { detail: 'Not implemented yet' } }]);
      const client = new KvarkClient(BASE_CONFIG, fetch);

      await expect(client.askDocument('42', 'test')).rejects.toThrow(KvarkNotImplementedError);
    });
  });

  describe('ping', () => {
    it('calls GET /api/auth/me and returns user', async () => {
      const fetch = createMockFetch([PING_OK]);
      const client = new KvarkClient(BASE_CONFIG, fetch);

      const user = await client.ping();
      expect(user.id).toBe(1);
      expect(user.identifier).toBe('admin');
    });
  });

  describe('error handling', () => {
    it('throws KvarkNotFoundError on 404', async () => {
      const fetch = createMockFetch([{ status: 404, body: { detail: 'Document not found' } }]);
      const client = new KvarkClient(BASE_CONFIG, fetch);

      await expect(client.search('missing')).rejects.toThrow(KvarkNotFoundError);
    });

    it('throws KvarkServerError on 500', async () => {
      const fetch = createMockFetch([{ status: 500, body: { detail: 'Internal error' } }]);
      const client = new KvarkClient(BASE_CONFIG, fetch);

      await expect(client.search('broken')).rejects.toThrow(KvarkServerError);
    });

    it('throws KvarkUnavailableError on network failure', async () => {
      let loginDone = false;
      const fetch = vi.fn(async (url: string) => {
        if (url.toString().includes('/api/auth/login')) {
          loginDone = true;
          return new Response(JSON.stringify(LOGIN_OK.body), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof globalThis.fetch;

      const client = new KvarkClient(BASE_CONFIG, fetch);
      await expect(client.search('unreachable')).rejects.toThrow(KvarkUnavailableError);
    });

    it('retries once on 401 with fresh token', async () => {
      let searchAttempt = 0;
      const fetch = vi.fn(async (url: string, opts?: RequestInit) => {
        if (url.toString().includes('/api/auth/login')) {
          return new Response(
            JSON.stringify({ success: true, access_token: `token-${searchAttempt}`, token_type: 'bearer', user: null, error: null }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        searchAttempt++;
        if (searchAttempt === 1) {
          // First search attempt → 401
          return new Response(JSON.stringify({ detail: 'Token expired' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }
        // Second attempt → success
        return new Response(JSON.stringify(SEARCH_OK.body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }) as unknown as typeof globalThis.fetch;

      const client = new KvarkClient(BASE_CONFIG, fetch);
      const result = await client.search('retry-test');
      expect(result.results).toHaveLength(2);
      expect(searchAttempt).toBe(2); // first failed, second succeeded
    });
  });

  describe('feedback', () => {
    const FEEDBACK_OK = {
      status: 200,
      body: { ok: true, data: { stored: true, feedbackId: 'fb_001' }, error: null },
    };

    it('calls POST /api/feedback with correct body', async () => {
      const fetch = createMockFetch([FEEDBACK_OK]);
      const client = new KvarkClient(BASE_CONFIG, fetch);

      const result = await client.feedback(42, 'project status', true, 'Very helpful');

      expect(result.ok).toBe(true);

      // Verify request
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
      const feedbackCall = calls.find(c => c[0].toString().includes('/api/feedback'));
      expect(feedbackCall).toBeDefined();
      expect(feedbackCall![1].method).toBe('POST');

      const body = JSON.parse(feedbackCall![1].body);
      expect(body.feedbackType).toBe('search_result');
      expect(body.target.documentId).toBe(42);
      expect(body.signal.rating).toBe('positive');
      expect(body.signal.label).toBe('useful');
      expect(body.signal.comment).toBe('Very helpful');
      expect(body.context.query).toBe('project status');
    });

    it('sends negative feedback correctly', async () => {
      const fetch = createMockFetch([FEEDBACK_OK]);
      const client = new KvarkClient(BASE_CONFIG, fetch);

      await client.feedback(108, 'budget', false);

      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
      const feedbackCall = calls.find(c => c[0].toString().includes('/api/feedback'));
      const body = JSON.parse(feedbackCall![1].body);
      expect(body.signal.rating).toBe('negative');
      expect(body.signal.label).toBe('not_useful');
      expect(body.signal.comment).toBeUndefined();
    });

    it('throws on server error', async () => {
      const fetch = createMockFetch([{ status: 500, body: { detail: 'Internal error' } }]);
      const client = new KvarkClient(BASE_CONFIG, fetch);

      await expect(client.feedback(42, 'test', true)).rejects.toThrow(KvarkServerError);
    });
  });

  describe('action', () => {
    const ACTION_OK = {
      status: 200,
      body: { ok: true, data: { status: 'executed', actionId: 'act_001', auditRef: 'aud_001', result: { entityType: 'jira_comment', entityId: 'comment_987' } }, error: null },
    };

    it('calls POST /api/actions with correct body shape', async () => {
      const fetch = createMockFetch([ACTION_OK]);
      const client = new KvarkClient(BASE_CONFIG, fetch);

      const result = await client.action(
        'jira.create_comment',
        { entityType: 'issue', entityId: 'PROJ-142' },
        { comment: 'Follow-up from Waggle' },
        'User requested',
        'approval_ref_001',
        'ws_proj_x',
      );

      expect(result.ok).toBe(true);
      expect(result.data!.status).toBe('executed');

      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
      const actionCall = calls.find(c => c[0].toString().includes('/api/actions'));
      expect(actionCall).toBeDefined();
      expect(actionCall![1].method).toBe('POST');

      const body = JSON.parse(actionCall![1].body);
      expect(body.actionType).toBe('jira.create_comment');
      expect(body.target.entityType).toBe('issue');
      expect(body.target.entityId).toBe('PROJ-142');
      expect(body.payload.comment).toBe('Follow-up from Waggle');
      expect(body.governance.userApproved).toBe(true);
      expect(body.governance.approvalReference).toBe('approval_ref_001');
      expect(body.context.reason).toBe('User requested');
      expect(body.context.workspaceId).toBe('ws_proj_x');
    });

    it('throws KvarkNotImplementedError on 501', async () => {
      const fetch = createMockFetch([{ status: 501, body: { detail: 'Not implemented' } }]);
      const client = new KvarkClient(BASE_CONFIG, fetch);

      await expect(client.action('test', { entityType: 'x', entityId: '1' }, {}, 'test')).rejects.toThrow(KvarkNotImplementedError);
    });
  });
});

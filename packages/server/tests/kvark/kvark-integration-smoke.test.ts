/**
 * KVARK Integration Smoke — end-to-end mocked path.
 *
 * Validates the full chain: vault config → KvarkClient → auth → tools → output.
 * All HTTP is mocked via injected fetch. No live KVARK dependency.
 *
 * This is the Milestone A gate test. When KVARK is live, these same
 * assertions should pass with real HTTP (replace mockFetch with globalThis.fetch).
 */

import { describe, it, expect, vi } from 'vitest';
import { KvarkClient } from '../../src/kvark/kvark-client.js';
import { getKvarkConfig, type VaultLike } from '../../src/kvark/kvark-config.js';
import { createKvarkTools, parseSearchResults } from '@waggle/agent';
import {
  KvarkUnavailableError,
  KvarkNotImplementedError,
  type KvarkClientConfig,
} from '../../src/kvark/kvark-types.js';

// ── Mock KVARK server ────────────────────────────────────────────────────

const MOCK_USER = { id: 1, identifier: 'admin', first_name: 'Admin', last_name: 'User', admin: true, developer: false, status: 'Active', created_at: null };

const MOCK_SEARCH_RESULTS = {
  results: [
    { document_id: 42, title: 'Project Status Update', snippet: 'API design review was postponed to next sprint.', score: 0.92, document_type: 'pdf' },
    { document_id: 108, title: 'Q1 Budget Analysis', snippet: 'Engineering budget increased by 15%.', score: 0.87, document_type: 'spreadsheet' },
  ],
  total: 8,
  query: 'project',
};

const MOCK_ASK_RESPONSE = {
  answer: 'The blocker is the unresolved identity boundary design.',
  sources: ['Project Status Update.pdf'],
};

function createMockKvarkServer(): typeof globalThis.fetch {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString();

    // POST /api/auth/login
    if (urlStr.includes('/api/auth/login') && init?.method === 'POST') {
      return new Response(JSON.stringify({
        success: true, access_token: 'mock-jwt-token', token_type: 'bearer', user: MOCK_USER, error: null,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // GET /api/auth/me
    if (urlStr.includes('/api/auth/me')) {
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (auth !== 'Bearer mock-jwt-token') {
        return new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(MOCK_USER), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // GET /api/search
    if (urlStr.includes('/api/search')) {
      return new Response(JSON.stringify(MOCK_SEARCH_RESULTS), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // POST /api/chat/ask — simulates 501 (current KVARK reality)
    if (urlStr.includes('/api/chat/ask') && init?.method === 'POST') {
      return new Response(JSON.stringify({ detail: 'Not implemented yet' }), { status: 501, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof globalThis.fetch;
}

function createMockKvarkServerWithAsk(): typeof globalThis.fetch {
  const base = createMockKvarkServer();
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString();
    if (urlStr.includes('/api/chat/ask') && init?.method === 'POST') {
      return new Response(JSON.stringify(MOCK_ASK_RESPONSE), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return (base as Function)(url, init);
  }) as unknown as typeof globalThis.fetch;
}

function unreachableServer(): typeof globalThis.fetch {
  return vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof globalThis.fetch;
}

const VAULT_CONFIG = { baseUrl: 'http://kvark:8000', identifier: 'admin', password: 'secret' };

// ── Integration smoke tests ──────────────────────────────────────────────

describe('KVARK Integration Smoke (Milestone A gate)', () => {

  describe('Full path: vault → client → auth → search → tool output', () => {
    it('vault config → client creation → successful search', async () => {
      const vault: VaultLike = {
        get: (name: string) => name === 'kvark:connection' ? { value: JSON.stringify(VAULT_CONFIG) } : null,
      };

      // Step 1: Read config from vault
      const config = getKvarkConfig(vault);
      expect(config).not.toBeNull();

      // Step 2: Create client with mocked HTTP
      const client = new KvarkClient(config!, createMockKvarkServer());

      // Step 3: Search (triggers auto-login + search)
      const results = await client.search('project', { limit: 5 });
      expect(results.results).toHaveLength(2);
      expect(results.total).toBe(8);
      expect(results.results[0].title).toBe('Project Status Update');
    });

    it('client → tool → formatted agent output', async () => {
      const client = new KvarkClient(VAULT_CONFIG, createMockKvarkServer());
      const tools = createKvarkTools({ client });
      const searchTool = tools.find(t => t.name === 'kvark_search')!;

      const output = await searchTool.execute({ query: 'project' });

      expect(output).toContain('KVARK Search: "project"');
      expect(output).toContain('2 of 8 results');
      expect(output).toContain('[pdf] Project Status Update');
      expect(output).toContain('score: 0.92');
      expect(output).toContain('ID: 42');
    });

    it('search results parseable for Milestone B structured consumption', async () => {
      const client = new KvarkClient(VAULT_CONFIG, createMockKvarkServer());
      const response = await client.search('project');
      const structured = parseSearchResults(response);

      expect(structured).toHaveLength(2);
      expect(structured[0].attribution).toBe('[KVARK: pdf: Project Status Update]');
      expect(structured[0].documentId).toBe(42);
      expect(structured[0].score).toBe(0.92);
      expect(structured[1].attribution).toBe('[KVARK: spreadsheet: Q1 Budget Analysis]');
    });
  });

  describe('auth/me (ping) path', () => {
    it('ping succeeds with valid token', async () => {
      const client = new KvarkClient(VAULT_CONFIG, createMockKvarkServer());
      const user = await client.ping();
      expect(user.identifier).toBe('admin');
      expect(user.admin).toBe(true);
    });
  });

  describe('askDocument path', () => {
    it('returns KvarkNotImplementedError when KVARK returns 501', async () => {
      const client = new KvarkClient(VAULT_CONFIG, createMockKvarkServer());
      await expect(client.askDocument('42', 'What is the blocker?')).rejects.toThrow(KvarkNotImplementedError);
    });

    it('tool handles 501 gracefully with user-facing message', async () => {
      const client = new KvarkClient(VAULT_CONFIG, createMockKvarkServer());
      const tools = createKvarkTools({ client });
      const askTool = tools.find(t => t.name === 'kvark_ask_document')!;

      const output = await askTool.execute({ document_id: '42', question: 'What is the blocker?' });

      expect(output).toContain('not yet available');
      expect(output).toContain('kvark_search');
    });

    it('returns real answer when KVARK implements /api/chat/ask', async () => {
      const client = new KvarkClient(VAULT_CONFIG, createMockKvarkServerWithAsk());
      const tools = createKvarkTools({ client });
      const askTool = tools.find(t => t.name === 'kvark_ask_document')!;

      const output = await askTool.execute({ document_id: '42', question: 'What is the blocker?' });

      expect(output).toContain('KVARK Document Answer (doc #42)');
      expect(output).toContain('identity boundary design');
      expect(output).toContain('Sources: Project Status Update.pdf');
    });
  });

  describe('Graceful degradation', () => {
    it('KVARK unreachable → search tool returns workspace-fallback message', async () => {
      const client = new KvarkClient(VAULT_CONFIG, unreachableServer());
      const tools = createKvarkTools({ client });
      const searchTool = tools.find(t => t.name === 'kvark_search')!;

      const output = await searchTool.execute({ query: 'test' });

      expect(output).toContain('not reachable');
      expect(output).toContain('workspace memory');
    });

    it('KVARK unreachable → ask tool returns same fallback', async () => {
      const client = new KvarkClient(VAULT_CONFIG, unreachableServer());
      const tools = createKvarkTools({ client });
      const askTool = tools.find(t => t.name === 'kvark_ask_document')!;

      const output = await askTool.execute({ document_id: '42', question: 'test' });

      expect(output).toContain('not reachable');
    });
  });

  describe('Solo/Team safe: no KVARK config', () => {
    it('empty vault → no config → no tools registered', () => {
      const vault: VaultLike = { get: () => null };
      const config = getKvarkConfig(vault);
      expect(config).toBeNull();
      // In the real wiring (index.ts), this null means the if(kvarkConfig) block is skipped
      // and allTools remains unchanged — Solo/Team behavior preserved
    });
  });
});

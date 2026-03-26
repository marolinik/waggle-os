/**
 * KVARK Agent Tools — tests with mocked KvarkClient.
 *
 * Tests mock the KvarkClient interface, NOT HTTP.
 * This validates tool behavior: output formatting, error handling, attribution.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createKvarkTools,
  parseSearchResults,
  type KvarkClientLike,
  type KvarkSearchResponseLike,
  type KvarkAskResponseLike,
} from '../src/kvark-tools.js';

// ── Mock client factory ──────────────────────────────────────────────────

function mockClient(overrides?: Partial<KvarkClientLike>): KvarkClientLike {
  return {
    search: overrides?.search ?? vi.fn(async () => SEARCH_RESPONSE),
    askDocument: overrides?.askDocument ?? vi.fn(async () => ASK_RESPONSE),
    feedback: overrides?.feedback ?? vi.fn(async () => ({ ok: true })),
    action: overrides?.action ?? vi.fn(async () => ({ ok: true, data: { status: 'executed' as const, actionId: 'act_001', auditRef: 'aud_001' }, error: null })),
  };
}

const SEARCH_RESPONSE: KvarkSearchResponseLike = {
  results: [
    { document_id: 42, title: 'Project Status Update', snippet: 'API design review was postponed to next sprint due to unresolved auth decisions.', score: 0.92, document_type: 'pdf' },
    { document_id: 108, title: 'Q1 Budget Analysis', snippet: 'Budget allocation for engineering increased by 15%.', score: 0.87, document_type: 'spreadsheet' },
    { document_id: 215, title: 'Architecture Decision Records', snippet: 'Auth boundary decision pending review by security team.', score: 0.81, document_type: null },
  ],
  total: 12,
  query: 'project status',
};

const ASK_RESPONSE: KvarkAskResponseLike = {
  answer: 'The blocker is unresolved identity boundary design, which delayed the API review to next sprint.',
  sources: ['Project Status Update.pdf'],
};

// ── Tests ────────────────────────────────────────────────────────────────

describe('KVARK Agent Tools', () => {
  describe('kvark_search', () => {
    it('calls client.search with query and limit', async () => {
      const searchFn = vi.fn(async () => SEARCH_RESPONSE);
      const client = mockClient({ search: searchFn });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_search')!;

      await tool.execute({ query: 'project status', limit: 5 });

      expect(searchFn).toHaveBeenCalledWith('project status', { limit: 5 });
    });

    it('formats search results with type, title, score, snippet, and ID', async () => {
      const client = mockClient();
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_search')!;

      const output = await tool.execute({ query: 'project status' });

      expect(output).toContain('KVARK Search: "project status"');
      expect(output).toContain('3 of 12 results');
      expect(output).toContain('[pdf] Project Status Update');
      expect(output).toContain('score: 0.92');
      expect(output).toContain('ID: 42');
      expect(output).toContain('[spreadsheet] Q1 Budget');
      expect(output).toContain('[document] Architecture Decision Records'); // null type → [document]
    });

    it('returns clear message on empty results', async () => {
      const client = mockClient({
        search: vi.fn(async () => ({ results: [], total: 0, query: 'nonexistent' })),
      });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_search')!;

      const output = await tool.execute({ query: 'nonexistent' });

      expect(output).toContain('no results found');
    });

    it('returns graceful message when KVARK is unavailable', async () => {
      const err = new Error('KVARK unreachable');
      err.name = 'KvarkUnavailableError';
      const client = mockClient({ search: vi.fn(async () => { throw err; }) });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_search')!;

      const output = await tool.execute({ query: 'test' });

      expect(output).toContain('not reachable');
      expect(output).toContain('workspace memory');
    });

    it('returns graceful message on auth failure', async () => {
      const err = new Error('Invalid token');
      err.name = 'KvarkAuthError';
      const client = mockClient({ search: vi.fn(async () => { throw err; }) });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_search')!;

      const output = await tool.execute({ query: 'test' });

      expect(output).toContain('authentication failed');
    });

    it('defaults limit to 10 when not specified', async () => {
      const searchFn = vi.fn(async () => SEARCH_RESPONSE);
      const client = mockClient({ search: searchFn });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_search')!;

      await tool.execute({ query: 'test' });

      expect(searchFn).toHaveBeenCalledWith('test', { limit: 10 });
    });
  });

  describe('kvark_ask_document', () => {
    it('calls client.askDocument with document_id and question', async () => {
      const askFn = vi.fn(async () => ASK_RESPONSE);
      const client = mockClient({ askDocument: askFn });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_ask_document')!;

      await tool.execute({ document_id: '42', question: 'What is the blocker?' });

      expect(askFn).toHaveBeenCalledWith('42', 'What is the blocker?');
    });

    it('formats answer with document ID and sources', async () => {
      const client = mockClient();
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_ask_document')!;

      const output = await tool.execute({ document_id: '42', question: 'test' });

      expect(output).toContain('KVARK Document Answer (doc #42)');
      expect(output).toContain('identity boundary design');
      expect(output).toContain('Sources: Project Status Update.pdf');
    });

    it('returns graceful message when endpoint returns 501', async () => {
      const err = new Error('Not implemented');
      err.name = 'KvarkNotImplementedError';
      const client = mockClient({ askDocument: vi.fn(async () => { throw err; }) });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_ask_document')!;

      const output = await tool.execute({ document_id: '42', question: 'test' });

      expect(output).toContain('not yet available');
      expect(output).toContain('kvark_search');
    });

    it('returns graceful message when document not found', async () => {
      const err = new Error('Not found');
      err.name = 'KvarkNotFoundError';
      const client = mockClient({ askDocument: vi.fn(async () => { throw err; }) });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_ask_document')!;

      const output = await tool.execute({ document_id: '999', question: 'test' });

      expect(output).toContain('not found');
    });
  });

  describe('parseSearchResults (Milestone B helper)', () => {
    it('converts search response to structured results with attribution', () => {
      const results = parseSearchResults(SEARCH_RESPONSE);

      expect(results).toHaveLength(3);

      // First result
      expect(results[0].documentId).toBe(42);
      expect(results[0].title).toBe('Project Status Update');
      expect(results[0].score).toBe(0.92);
      expect(results[0].documentType).toBe('pdf');
      expect(results[0].attribution).toBe('[KVARK: pdf: Project Status Update]');
      expect(results[0].content).toContain('API design review');

      // Null document_type → attribution without type segment
      expect(results[2].attribution).toBe('[KVARK: Architecture Decision Records]');
    });

    it('returns empty array for empty results', () => {
      const results = parseSearchResults({ results: [], total: 0, query: 'empty' });
      expect(results).toEqual([]);
    });
  });

  describe('tool definitions', () => {
    it('creates exactly 4 tools', () => {
      const tools = createKvarkTools({ client: mockClient() });
      expect(tools).toHaveLength(4);
      expect(tools.map(t => t.name)).toEqual(['kvark_search', 'kvark_feedback', 'kvark_action', 'kvark_ask_document']);
    });

    it('kvark_search requires query parameter', () => {
      const tools = createKvarkTools({ client: mockClient() });
      const search = tools[0];
      expect((search.parameters as Record<string, unknown>).required).toEqual(['query']);
    });

    it('kvark_ask_document requires document_id and question', () => {
      const tools = createKvarkTools({ client: mockClient() });
      const ask = tools.find(t => t.name === 'kvark_ask_document')!;
      expect((ask.parameters as Record<string, unknown>).required).toEqual(['document_id', 'question']);
    });

    it('kvark_feedback requires document_id, query, useful', () => {
      const tools = createKvarkTools({ client: mockClient() });
      const feedback = tools.find(t => t.name === 'kvark_feedback')!;
      expect(feedback).toBeDefined();
      expect((feedback.parameters as Record<string, unknown>).required).toEqual(['document_id', 'query', 'useful']);
    });

    it('kvark_action requires action_type, entity_type, entity_id, payload, reason', () => {
      const tools = createKvarkTools({ client: mockClient() });
      const action = tools.find(t => t.name === 'kvark_action')!;
      expect(action).toBeDefined();
      expect((action.parameters as Record<string, unknown>).required).toEqual(['action_type', 'entity_type', 'entity_id', 'payload', 'reason']);
    });
  });

  // ── kvark_feedback ────────────────────────────────────────────────

  describe('kvark_feedback', () => {
    it('calls client.feedback with correct parameters', async () => {
      const feedbackFn = vi.fn(async () => ({ ok: true }));
      const client = mockClient({ feedback: feedbackFn });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_feedback')!;

      await tool.execute({ document_id: 42, query: 'project status', useful: true, reason: 'Exactly what I needed' });

      expect(feedbackFn).toHaveBeenCalledWith(42, 'project status', true, 'Exactly what I needed');
    });

    it('returns confirmation on success', async () => {
      const client = mockClient();
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_feedback')!;

      const output = await tool.execute({ document_id: 42, query: 'test', useful: true });

      expect(output).toContain('Feedback recorded');
      expect(output).toContain('useful');
      expect(output).toContain('42');
    });

    it('returns negative feedback message', async () => {
      const client = mockClient();
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_feedback')!;

      const output = await tool.execute({ document_id: 108, query: 'budget', useful: false });

      expect(output).toContain('not useful');
      expect(output).toContain('108');
    });

    it('handles feedback failure gracefully', async () => {
      const err = new Error('Network error');
      err.name = 'KvarkUnavailableError';
      const client = mockClient({ feedback: vi.fn(async () => { throw err; }) });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_feedback')!;

      const output = await tool.execute({ document_id: 42, query: 'test', useful: true });

      expect(output).toContain('not reachable');
    });

    it('handles 501 Not Implemented gracefully', async () => {
      const err = new Error('Not implemented');
      err.name = 'KvarkNotImplementedError';
      const client = mockClient({ feedback: vi.fn(async () => { throw err; }) });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_feedback')!;

      const output = await tool.execute({ document_id: 42, query: 'test', useful: true });

      expect(output).toContain('not yet available');
      expect(output).toContain('non-blocking');
    });

    it('handles client without feedback method', async () => {
      const client: KvarkClientLike = {
        search: vi.fn(async () => SEARCH_RESPONSE),
        askDocument: vi.fn(async () => ASK_RESPONSE),
        // no feedback method
      };
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_feedback')!;

      const output = await tool.execute({ document_id: 42, query: 'test', useful: true });

      expect(output).toContain('not supported');
    });

    it('works without optional reason parameter', async () => {
      const feedbackFn = vi.fn(async () => ({ ok: true }));
      const client = mockClient({ feedback: feedbackFn });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_feedback')!;

      await tool.execute({ document_id: 42, query: 'test', useful: false });

      expect(feedbackFn).toHaveBeenCalledWith(42, 'test', false, undefined);
    });
  });

  // ── kvark_action ──────────────────────────────────────────────────

  describe('kvark_action', () => {
    it('calls client.action with correct parameters', async () => {
      const actionFn = vi.fn(async () => ({ ok: true, data: { status: 'executed' as const, actionId: 'act_001' }, error: null }));
      const client = mockClient({ action: actionFn });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_action')!;

      await tool.execute({
        action_type: 'jira.create_comment',
        entity_type: 'issue',
        entity_id: 'PROJ-142',
        payload: { comment: 'Follow-up from Waggle' },
        reason: 'User requested follow-up',
      });

      expect(actionFn).toHaveBeenCalledWith(
        'jira.create_comment',
        { entityType: 'issue', entityId: 'PROJ-142' },
        { comment: 'Follow-up from Waggle' },
        'User requested follow-up',
      );
    });

    it('returns confirmation on successful execution', async () => {
      const client = mockClient();
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_action')!;

      const output = await tool.execute({
        action_type: 'jira.create_comment',
        entity_type: 'issue',
        entity_id: 'PROJ-142',
        payload: { comment: 'test' },
        reason: 'test',
      });

      expect(output).toContain('Action executed');
      expect(output).toContain('jira.create_comment');
      expect(output).toContain('act_001');
    });

    it('reports denial from KVARK governance', async () => {
      const actionFn = vi.fn(async () => ({
        ok: false,
        data: null,
        error: { code: 'approval_required_or_denied', message: 'Action not permitted under current policy.' },
      }));
      const client = mockClient({ action: actionFn });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_action')!;

      const output = await tool.execute({
        action_type: 'jira.create_comment',
        entity_type: 'issue',
        entity_id: 'X-1',
        payload: {},
        reason: 'test',
      });

      expect(output).toContain('Action denied');
      expect(output).toContain('not permitted');
    });

    it('handles 501 Not Implemented gracefully', async () => {
      const err = new Error('Not implemented');
      err.name = 'KvarkNotImplementedError';
      const client = mockClient({ action: vi.fn(async () => { throw err; }) });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_action')!;

      const output = await tool.execute({
        action_type: 'test', entity_type: 'x', entity_id: '1', payload: {}, reason: 'test',
      });

      expect(output).toContain('not yet available');
      expect(output).toContain('not executed');
    });

    it('handles client without action method', async () => {
      const client: KvarkClientLike = {
        search: vi.fn(async () => SEARCH_RESPONSE),
        askDocument: vi.fn(async () => ASK_RESPONSE),
      };
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_action')!;

      const output = await tool.execute({
        action_type: 'test', entity_type: 'x', entity_id: '1', payload: {}, reason: 'test',
      });

      expect(output).toContain('not supported');
    });

    it('reports queued status correctly', async () => {
      const actionFn = vi.fn(async () => ({
        ok: true,
        data: { status: 'queued' as const, actionId: 'act_q1' },
        error: null,
      }));
      const client = mockClient({ action: actionFn });
      const tools = createKvarkTools({ client });
      const tool = tools.find(t => t.name === 'kvark_action')!;

      const output = await tool.execute({
        action_type: 'email.send', entity_type: 'contact', entity_id: 'c_1', payload: { subject: 'hi' }, reason: 'outreach',
      });

      expect(output).toContain('queued');
    });
  });
});

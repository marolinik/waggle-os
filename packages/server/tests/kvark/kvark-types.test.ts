/**
 * KVARK Types — shape validation tests.
 * Verifies TypeScript types match GitHub KVARK Pydantic DTOs.
 */

import { describe, it, expect } from 'vitest';
import type {
  KvarkLoginRequest,
  KvarkLoginResponse,
  KvarkUser,
  KvarkSearchResult,
  KvarkSearchResponse,
  KvarkAskRequest,
  KvarkAskResponse,
  KvarkChatEvent,
  KvarkClientConfig,
} from '../../src/kvark/kvark-types.js';
import {
  KvarkAuthError,
  KvarkNotFoundError,
  KvarkNotImplementedError,
  KvarkServerError,
  KvarkUnavailableError,
} from '../../src/kvark/kvark-types.js';

describe('KVARK Types', () => {
  it('LoginRequest has identifier and password', () => {
    const req: KvarkLoginRequest = { identifier: 'user@test.com', password: 'secret' };
    expect(req.identifier).toBe('user@test.com');
    expect(req.password).toBe('secret');
  });

  it('LoginResponse matches KVARK shape', () => {
    const res: KvarkLoginResponse = {
      success: true,
      access_token: 'jwt-token-here',
      token_type: 'bearer',
      user: { id: 1, identifier: 'test', first_name: 'Test', last_name: 'User', admin: false, developer: false, status: 'Active', created_at: null },
      error: null,
    };
    expect(res.success).toBe(true);
    expect(res.access_token).toBeTruthy();
    expect(res.user?.id).toBe(1);
  });

  it('SearchResult matches KVARK shape', () => {
    const result: KvarkSearchResult = {
      document_id: 42,
      title: 'Project Status',
      snippet: 'API review postponed...',
      score: 0.92,
      document_type: 'pdf',
    };
    expect(result.document_id).toBe(42);
    expect(result.score).toBe(0.92);
    expect(result.document_type).toBe('pdf');
  });

  it('SearchResponse wraps results with total and query', () => {
    const res: KvarkSearchResponse = {
      results: [{ document_id: 1, title: 'Doc', snippet: 'text', score: 0.8, document_type: null }],
      total: 15,
      query: 'test query',
    };
    expect(res.results).toHaveLength(1);
    expect(res.total).toBe(15);
    expect(res.query).toBe('test query');
  });

  it('AskRequest and AskResponse match KVARK shape', () => {
    const req: KvarkAskRequest = { document_id: '42', question: 'What is the blocker?' };
    const res: KvarkAskResponse = { answer: 'The identity boundary design', sources: ['doc_42'] };
    expect(req.document_id).toBe('42');
    expect(res.answer).toBeTruthy();
    expect(res.sources).toHaveLength(1);
  });

  it('ChatEvent discriminated union covers all types', () => {
    const events: KvarkChatEvent[] = [
      { type: 'status', msg: 'Thinking...' },
      { type: 'token', chunk: 'The ' },
      { type: 'tool_call', name: 'search', args: { q: 'test' } },
      { type: 'tool_result', name: 'search', summary: 'Found 3', duration_ms: 120 },
      { type: 'thought', text: 'Analyzing results...' },
      { type: 'done', session_id: 1, answer: 'Here is the answer', usage: { input_tokens: 100, output_tokens: 50, latency_ms: 1200 } },
      { type: 'error', msg: 'Something went wrong' },
    ];
    expect(events).toHaveLength(7);
    expect(events[0].type).toBe('status');
    expect(events[5].type).toBe('done');
  });

  it('typed errors have correct names', () => {
    expect(new KvarkAuthError('test').name).toBe('KvarkAuthError');
    expect(new KvarkNotFoundError('test').name).toBe('KvarkNotFoundError');
    expect(new KvarkNotImplementedError('test').name).toBe('KvarkNotImplementedError');
    expect(new KvarkServerError('test', 500).name).toBe('KvarkServerError');
    expect(new KvarkServerError('test', 500).statusCode).toBe(500);
    expect(new KvarkUnavailableError('test').name).toBe('KvarkUnavailableError');
  });

  it('KvarkClientConfig has required fields', () => {
    const config: KvarkClientConfig = {
      baseUrl: 'http://localhost:8000',
      identifier: 'admin',
      password: 'pass',
    };
    expect(config.baseUrl).toBeTruthy();
    expect(config.timeoutMs).toBeUndefined(); // optional
    expect(config.retryOnServerError).toBeUndefined(); // optional
  });
});

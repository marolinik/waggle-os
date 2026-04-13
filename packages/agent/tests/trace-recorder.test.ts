import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, ExecutionTraceStore } from '@waggle/core';
import {
  TraceRecorder,
  truncate as truncateTraceText,
  scrubSecrets,
} from '../src/trace-recorder.js';

describe('truncateTraceText', () => {
  it('leaves short strings untouched', () => {
    expect(truncateTraceText('hi', 10)).toBe('hi');
  });

  it('appends truncation notice when exceeding cap', () => {
    const out = truncateTraceText('a'.repeat(120), 50);
    expect(out).toMatch(/^a{50}\n\[\.\.\. 70ch truncated\]$/);
  });

  it('boundary: equal length is not truncated', () => {
    expect(truncateTraceText('abcd', 4)).toBe('abcd');
  });
});

describe('scrubSecrets', () => {
  it('redacts obvious secret keys at top level', () => {
    const out = scrubSecrets({ password: 'hunter2', username: 'marko' });
    expect(out).toEqual({ password: '[REDACTED]', username: 'marko' });
  });

  it('redacts nested objects', () => {
    const out = scrubSecrets({
      auth: { apiKey: 'sk-abc', region: 'eu' },
      other: 'x',
    });
    expect(out).toEqual({
      auth: { apiKey: '[REDACTED]', region: 'eu' },
      other: 'x',
    });
  });

  it('leaves arrays alone (not scanned recursively)', () => {
    const out = scrubSecrets({ items: [1, 2, 3] });
    expect(out).toEqual({ items: [1, 2, 3] });
  });

  it('handles common alternate naming (snake_case + camelCase)', () => {
    const out = scrubSecrets({
      api_key: 'x', apiKey: 'y', access_token: 'z', refreshToken: 'w', bearer: 'b',
    });
    expect(out).toEqual({
      api_key: '[REDACTED]', apiKey: '[REDACTED]',
      access_token: '[REDACTED]', refreshToken: '[REDACTED]',
      bearer: '[REDACTED]',
    });
  });
});

describe('TraceRecorder', () => {
  let db: MindDB;
  let store: ExecutionTraceStore;
  let recorder: TraceRecorder;

  beforeEach(() => {
    db = new MindDB(':memory:');
    store = new ExecutionTraceStore(db);
    recorder = new TraceRecorder(store, { maxToolResultChars: 1000 });
  });

  afterEach(() => {
    db.close();
  });

  describe('start', () => {
    it('creates a trace and returns handle with id', () => {
      const handle = recorder.start({ input: 'Hello world' });
      expect(handle.id).toBeGreaterThan(0);
      expect(handle.startedAt).toBeGreaterThan(0);

      const row = store.get(handle.id);
      expect(row?.outcome).toBe('pending');
    });
  });

  describe('recordReasoning', () => {
    it('buffers reasoning steps in memory before flush', () => {
      const handle = recorder.start({ input: 'x' });
      recorder.recordReasoning(handle, 'Thinking step 1');

      expect(recorder.peekReasoning(handle)).toHaveLength(1);
      // Not yet persisted
      expect(store.getParsed(handle.id)?.payload.reasoning).toHaveLength(0);
    });

    it('truncates long reasoning content', () => {
      const handle = recorder.start({ input: 'x' });
      recorder.recordReasoning(handle, 'x'.repeat(5000));

      const step = recorder.peekReasoning(handle)[0];
      expect(step.content.length).toBeLessThanOrEqual(1050); // 1000 + trailer
      expect(step.content).toContain('truncated');
    });
  });

  describe('tool call lifecycle', () => {
    it('start + complete records duration and scrubs args', () => {
      const handle = recorder.start({ input: 'x' });
      const callId = recorder.startToolCall(handle, 'http_get', {
        url: 'https://example.com',
        apiKey: 'sk-secret',
      });
      // Give the event loop a tick so durationMs is non-zero (optional)
      recorder.completeToolCall(handle, callId, 'response body');

      const buffered = recorder.peekToolCalls(handle);
      expect(buffered).toHaveLength(1);
      expect(buffered[0].tool).toBe('http_get');
      expect(buffered[0].args.apiKey).toBe('[REDACTED]');
      expect(buffered[0].args.url).toBe('https://example.com');
      expect(buffered[0].result).toBe('response body');
      expect(buffered[0].ok).toBe(true);
    });

    it('completeToolCall is no-op for unknown call id', () => {
      const handle = recorder.start({ input: 'x' });
      expect(() => recorder.completeToolCall(handle, 'bogus', 'x')).not.toThrow();
      expect(recorder.peekToolCalls(handle)).toHaveLength(0);
    });

    it('pendingToolCount tracks in-flight calls', () => {
      const handle = recorder.start({ input: 'x' });
      const a = recorder.startToolCall(handle, 'a', {});
      recorder.startToolCall(handle, 'b', {});
      expect(recorder.pendingToolCount(handle)).toBe(2);
      recorder.completeToolCall(handle, a, 'done');
      expect(recorder.pendingToolCount(handle)).toBe(1);
    });

    it('recordToolCall captures one-shot calls with given duration', () => {
      const handle = recorder.start({ input: 'x' });
      recorder.recordToolCall(handle, {
        tool: 'cached_op',
        args: { token: 'abc' },
        result: 'ok',
        ok: true,
        durationMs: 42,
        timestamp: '2026-04-14T12:00:00Z',
      });
      const buffered = recorder.peekToolCalls(handle);
      expect(buffered[0].durationMs).toBe(42);
      expect(buffered[0].args.token).toBe('[REDACTED]');
    });

    it('truncates long tool results', () => {
      const handle = recorder.start({ input: 'x' });
      const callId = recorder.startToolCall(handle, 'big_read', {});
      recorder.completeToolCall(handle, callId, 'z'.repeat(5000));

      const result = recorder.peekToolCalls(handle)[0].result;
      expect(result.length).toBeLessThanOrEqual(1050);
      expect(result).toContain('truncated');
    });
  });

  describe('recordArtifact', () => {
    it('deduplicates artifacts', () => {
      const handle = recorder.start({ input: 'x' });
      recorder.recordArtifact(handle, '/a.ts');
      recorder.recordArtifact(handle, '/a.ts');
      recorder.recordArtifact(handle, '/b.ts');
      expect(recorder.peekArtifacts(handle)).toEqual(['/a.ts', '/b.ts']);
    });
  });

  describe('flush', () => {
    it('moves buffered events to the store and clears buffers', () => {
      const handle = recorder.start({ input: 'x' });
      recorder.recordReasoning(handle, 'r1');
      recorder.recordArtifact(handle, '/f.ts');
      const callId = recorder.startToolCall(handle, 't', {});
      recorder.completeToolCall(handle, callId, 'res');

      recorder.flush(handle);

      expect(recorder.peekReasoning(handle)).toHaveLength(0);
      expect(recorder.peekToolCalls(handle)).toHaveLength(0);
      expect(recorder.peekArtifacts(handle)).toHaveLength(0);

      const persisted = store.getParsed(handle.id);
      expect(persisted?.payload.reasoning).toHaveLength(1);
      expect(persisted?.payload.toolCalls).toHaveLength(1);
      expect(persisted?.payload.artifacts).toEqual(['/f.ts']);
    });

    it('is a cheap no-op when nothing is buffered', () => {
      const handle = recorder.start({ input: 'x' });
      expect(() => recorder.flush(handle)).not.toThrow();
    });
  });

  describe('finalize', () => {
    it('flushes + sets outcome + output', () => {
      const handle = recorder.start({ input: 'Hello' });
      recorder.recordReasoning(handle, 'hmm');
      const row = recorder.finalize(handle, { outcome: 'success', output: 'World' });

      expect(row?.outcome).toBe('success');
      const parsed = store.getParsed(handle.id);
      expect(parsed?.payload.output).toBe('World');
      expect(parsed?.payload.reasoning).toHaveLength(1);
      expect(parsed?.finalized_at).not.toBeNull();
    });

    it('records cost and tokens', () => {
      const handle = recorder.start({ input: 'x' });
      recorder.finalize(handle, {
        outcome: 'verified',
        output: 'done',
        costUsd: 0.05,
        tokens: { input: 100, output: 50 },
      });

      const parsed = store.getParsed(handle.id);
      expect(parsed?.cost_usd).toBeCloseTo(0.05);
      expect(parsed?.payload.tokens).toEqual({ input: 100, output: 50 });
    });

    it('clears pending tool calls after finalize', () => {
      const handle = recorder.start({ input: 'x' });
      recorder.startToolCall(handle, 'a', {});
      expect(recorder.pendingToolCount(handle)).toBe(1);
      recorder.finalize(handle, { outcome: 'abandoned', output: '' });
      expect(recorder.pendingToolCount(handle)).toBe(0);
    });
  });

  describe('markCorrected', () => {
    it('delegates to the store', () => {
      const handle = recorder.start({ input: 'x' });
      recorder.finalize(handle, { outcome: 'success', output: 'v1' });
      recorder.markCorrected(handle, 'too terse');

      const parsed = store.getParsed(handle.id);
      expect(parsed?.outcome).toBe('corrected');
      expect(parsed?.payload.correctionFeedback).toBe('too terse');
    });
  });

  describe('wireAgentLoopCallbacks', () => {
    it('correlates onToolUse / onToolResult pairs', () => {
      const handle = recorder.start({ input: 'x' });
      const { onToolUse, onToolResult } = recorder.wireAgentLoopCallbacks(handle);

      onToolUse('read_file', { path: '/a' });
      onToolResult('read_file', { path: '/a' }, 'file contents');

      const buffered = recorder.peekToolCalls(handle);
      expect(buffered).toHaveLength(1);
      expect(buffered[0].tool).toBe('read_file');
      expect(buffered[0].result).toBe('file contents');
    });

    it('matches concurrent calls to the same tool by input (FIFO stack per key)', () => {
      const handle = recorder.start({ input: 'x' });
      const { onToolUse, onToolResult } = recorder.wireAgentLoopCallbacks(handle);

      onToolUse('search', { q: 'a' });
      onToolUse('search', { q: 'b' });
      onToolResult('search', { q: 'a' }, 'A');
      onToolResult('search', { q: 'b' }, 'B');

      const buffered = recorder.peekToolCalls(handle);
      expect(buffered).toHaveLength(2);
      const byTool = buffered.map(c => [c.args.q, c.result]);
      expect(byTool).toContainEqual(['a', 'A']);
      expect(byTool).toContainEqual(['b', 'B']);
    });

    it('falls back to one-shot recording if onToolResult arrives without onToolUse', () => {
      const handle = recorder.start({ input: 'x' });
      const { onToolResult } = recorder.wireAgentLoopCallbacks(handle);

      onToolResult('ghost', { x: 1 }, 'mystery');

      const buffered = recorder.peekToolCalls(handle);
      expect(buffered).toHaveLength(1);
      expect(buffered[0].tool).toBe('ghost');
      expect(buffered[0].durationMs).toBe(0);
    });
  });
});

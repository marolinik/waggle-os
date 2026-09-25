/**
 * Chat Persistence — I/O Tests
 *
 * Covers:
 *   chat-persistence.ts: persistMessage, loadSessionMessages
 *
 * Uses real temp directories to exercise file system behavior.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  persistMessage,
  loadSessionMessages,
  replaceRetryTailWithUser,
  stripTrailingFailedPair,
  createPersistedCapabilityReceipt,
} from '../../src/local/routes/chat-persistence.js';
import { GENERATION_FAILED_PREFIX } from '@waggle/shared';

// ─── Helpers ────────────────────────────────────────────────────────

let tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-persist-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  const temporaryFiles: string[] = [];
  for (const dir of tempDirs) {
    if (fs.existsSync(dir)) {
      const pending = [dir];
      while (pending.length > 0) {
        const current = pending.pop()!;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const entryPath = path.join(current, entry.name);
          if (entry.isDirectory()) pending.push(entryPath);
          else if (entry.name.endsWith('.tmp')) temporaryFiles.push(entryPath);
        }
      }
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  tempDirs = [];
  expect(temporaryFiles).toEqual([]);
});

// ─── persistMessage ─────────────────────────────────────────────────

describe('persistMessage', () => {
  it('creates sessions directory and .jsonl file when they do not exist', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'hello' });

    const filePath = path.join(dataDir, 'workspaces', 'ws-1', 'sessions', 'sess-1.jsonl');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('writes a meta line as the first line of a new session file', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'hi' });

    const filePath = path.join(dataDir, 'workspaces', 'ws-1', 'sessions', 'sess-1.jsonl');
    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');

    const meta = JSON.parse(lines[0]);
    expect(meta.type).toBe('meta');
    expect(meta).toHaveProperty('created');
    expect(meta.title).toBeNull();
  });

  it('appends the message as a JSON line after the meta line', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'test message' });

    const filePath = path.join(dataDir, 'workspaces', 'ws-1', 'sessions', 'sess-1.jsonl');
    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');

    expect(lines).toHaveLength(2);
    const msg = JSON.parse(lines[1]);
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('test message');
    expect(msg).toHaveProperty('timestamp');
  });

  it('appends multiple messages to the same session file', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'first' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'assistant', content: 'second' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'third' });

    const filePath = path.join(dataDir, 'workspaces', 'ws-1', 'sessions', 'sess-1.jsonl');
    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');

    // 1 meta + 3 messages
    expect(lines).toHaveLength(4);
  });

  it('creates separate files for different session IDs', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-a', { role: 'user', content: 'a' });
    persistMessage(dataDir, 'ws-1', 'sess-b', { role: 'user', content: 'b' });

    const fileA = path.join(dataDir, 'workspaces', 'ws-1', 'sessions', 'sess-a.jsonl');
    const fileB = path.join(dataDir, 'workspaces', 'ws-1', 'sessions', 'sess-b.jsonl');
    expect(fs.existsSync(fileA)).toBe(true);
    expect(fs.existsSync(fileB)).toBe(true);
  });
});

// ─── loadSessionMessages ────────────────────────────────────────────

describe('loadSessionMessages', () => {
  it('returns an empty array when the session file does not exist', () => {
    const dataDir = makeTempDir();
    const result = loadSessionMessages(dataDir, 'ws-1', 'nonexistent');
    expect(result).toEqual([]);
  });

  it('returns an empty array for an empty file', () => {
    const dataDir = makeTempDir();
    const sessDir = path.join(dataDir, 'workspaces', 'ws-1', 'sessions');
    fs.mkdirSync(sessDir, { recursive: true });
    fs.writeFileSync(path.join(sessDir, 'sess-1.jsonl'), '', 'utf-8');

    const result = loadSessionMessages(dataDir, 'ws-1', 'sess-1');
    expect(result).toEqual([]);
  });

  it('skips meta lines and returns only chat messages', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'hello' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'assistant', content: 'hi there' });

    const result = loadSessionMessages(dataDir, 'ws-1', 'sess-1');
    expect(result).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ]);
  });

  it('strips timestamp from returned messages (only role + content)', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'test' });

    const result = loadSessionMessages(dataDir, 'ws-1', 'sess-1');
    expect(result).toHaveLength(1);
    expect(Object.keys(result[0])).toEqual(['role', 'content']);
  });

  it('skips malformed JSON lines without throwing', () => {
    const dataDir = makeTempDir();
    const sessDir = path.join(dataDir, 'workspaces', 'ws-1', 'sessions');
    fs.mkdirSync(sessDir, { recursive: true });

    const lines = [
      JSON.stringify({ type: 'meta', title: null, created: new Date().toISOString() }),
      '{ INVALID JSON',
      JSON.stringify({ role: 'user', content: 'valid message', timestamp: new Date().toISOString() }),
      'not json at all',
      JSON.stringify({ role: 'assistant', content: 'another valid', timestamp: new Date().toISOString() }),
    ];
    fs.writeFileSync(path.join(sessDir, 'sess-1.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const result = loadSessionMessages(dataDir, 'ws-1', 'sess-1');
    expect(result).toEqual([
      { role: 'user', content: 'valid message' },
      { role: 'assistant', content: 'another valid' },
    ]);
  });

  it('skips lines that are valid JSON but lack role or content fields', () => {
    const dataDir = makeTempDir();
    const sessDir = path.join(dataDir, 'workspaces', 'ws-1', 'sessions');
    fs.mkdirSync(sessDir, { recursive: true });

    const lines = [
      JSON.stringify({ type: 'meta', title: null, created: new Date().toISOString() }),
      JSON.stringify({ role: 'user' }), // missing content
      JSON.stringify({ content: 'orphan' }), // missing role
      JSON.stringify({ role: 'user', content: 'complete', timestamp: new Date().toISOString() }),
    ];
    fs.writeFileSync(path.join(sessDir, 'sess-1.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const result = loadSessionMessages(dataDir, 'ws-1', 'sess-1');
    // The line missing role is skipped because parsed.role is falsy
    // The line missing content: content is undefined, and the check is `parsed.content !== undefined`
    // so { role: 'user' } has content === undefined → skipped
    expect(result).toEqual([
      { role: 'user', content: 'complete' },
    ]);
  });

  it('skips blank lines in the file', () => {
    const dataDir = makeTempDir();
    const sessDir = path.join(dataDir, 'workspaces', 'ws-1', 'sessions');
    fs.mkdirSync(sessDir, { recursive: true });

    const content = [
      JSON.stringify({ type: 'meta', title: null, created: new Date().toISOString() }),
      '',
      '   ',
      JSON.stringify({ role: 'user', content: 'msg', timestamp: new Date().toISOString() }),
      '',
    ].join('\n');
    fs.writeFileSync(path.join(sessDir, 'sess-1.jsonl'), content, 'utf-8');

    const result = loadSessionMessages(dataDir, 'ws-1', 'sess-1');
    expect(result).toEqual([{ role: 'user', content: 'msg' }]);
  });

  // ── Round-trip ────────────────────────────────────────────────────

  it('round-trips: persist then load returns the same messages in order', () => {
    const dataDir = makeTempDir();
    const messages = [
      { role: 'user', content: 'What is 2+2?' },
      { role: 'assistant', content: 'The answer is 4.' },
      { role: 'user', content: 'Thanks!' },
      { role: 'assistant', content: 'You are welcome.' },
    ];

    for (const msg of messages) {
      persistMessage(dataDir, 'ws-1', 'sess-1', msg);
    }

    const loaded = loadSessionMessages(dataDir, 'ws-1', 'sess-1');
    expect(loaded).toEqual(messages);
  });

  it('handles messages with empty string content', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: '' });

    const loaded = loadSessionMessages(dataDir, 'ws-1', 'sess-1');
    // content '' is !== undefined → should be included
    expect(loaded).toEqual([{ role: 'user', content: '' }]);
  });

  it('handles messages with special characters and newlines in content', () => {
    const dataDir = makeTempDir();
    const content = 'line1\nline2\ttab "quotes" {braces}';
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content });

    const loaded = loadSessionMessages(dataDir, 'ws-1', 'sess-1');
    expect(loaded).toEqual([{ role: 'user', content }]);
  });
});

// ─── stripTrailingFailedPair ────────────────────────────────────────

describe('stripTrailingFailedPair', () => {
  it('strips a trailing failed user+assistant pair', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'ok turn' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'assistant', content: 'sure' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'reproduce this' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'assistant', content: `${GENERATION_FAILED_PREFIX}boom` });

    const stripped = stripTrailingFailedPair(dataDir, 'ws-1', 'sess-1');
    expect(stripped).toBe(true);

    // Only the failed pair is dropped; the earlier successful pair survives.
    const loaded = loadSessionMessages(dataDir, 'ws-1', 'sess-1');
    expect(loaded).toEqual([
      { role: 'user', content: 'ok turn' },
      { role: 'assistant', content: 'sure' },
    ]);
  });

  it('is a no-op on a normal (non-failed) tail', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'hi' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'assistant', content: 'hello' });

    const stripped = stripTrailingFailedPair(dataDir, 'ws-1', 'sess-1');
    expect(stripped).toBe(false);

    const loaded = loadSessionMessages(dataDir, 'ws-1', 'sess-1');
    expect(loaded).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('returns false when the session file does not exist', () => {
    const dataDir = makeTempDir();
    expect(stripTrailingFailedPair(dataDir, 'ws-1', 'missing')).toBe(false);
  });

  it('does not strip a failed pair belonging to a different user prompt', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'original prompt' });
    persistMessage(dataDir, 'ws-1', 'sess-1', {
      role: 'assistant',
      content: `${GENERATION_FAILED_PREFIX}boom`,
    });
    const filePath = path.join(dataDir, 'workspaces', 'ws-1', 'sessions', 'sess-1.jsonl');
    const original = fs.readFileSync(filePath, 'utf-8');

    expect(stripTrailingFailedPair(dataDir, 'ws-1', 'sess-1', 'different prompt')).toBe(false);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(original);
  });
});

// ─── replaceRetryTailWithUser ─────────────────────────────────

describe('replaceRetryTailWithUser', () => {
  it('atomically replaces an exact assistant pair with one fresh user turn', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'earlier' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'assistant', content: 'kept' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'retry me' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'assistant', content: 'replace me' });

    expect(replaceRetryTailWithUser(dataDir, 'ws-1', 'sess-1', 'retry me', {
      kind: 'assistant-pair',
      expectedMessageCount: 4,
      expectedAssistantContent: 'replace me',
    })).toEqual({ ok: true, removed: 2 });
    expect(loadSessionMessages(dataDir, 'ws-1', 'sess-1')).toEqual([
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'kept' },
      { role: 'user', content: 'retry me' },
    ]);
  });

  it('atomically replaces an exact lone user while preserving the transcript prefix', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'earlier' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'assistant', content: 'kept' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'stopped prompt' });
    expect(replaceRetryTailWithUser(dataDir, 'ws-1', 'sess-1', 'stopped prompt', {
      kind: 'lone-user',
      expectedMessageCount: 3,
    })).toEqual({ ok: true, removed: 1 });
    expect(loadSessionMessages(dataDir, 'ws-1', 'sess-1')).toEqual([
      { role: 'user', content: 'earlier' },
      { role: 'assistant', content: 'kept' },
      { role: 'user', content: 'stopped prompt' },
    ]);
  });

  it.each([
    {
      name: 'message count',
      userContent: 'retry me',
      expectation: {
        kind: 'assistant-pair' as const,
        expectedMessageCount: 3,
        expectedAssistantContent: 'old answer',
      },
    },
    {
      name: 'user content',
      userContent: 'different prompt',
      expectation: {
        kind: 'assistant-pair' as const,
        expectedMessageCount: 2,
        expectedAssistantContent: 'old answer',
      },
    },
    {
      name: 'assistant content',
      userContent: 'retry me',
      expectation: {
        kind: 'assistant-pair' as const,
        expectedMessageCount: 2,
        expectedAssistantContent: 'different answer',
      },
    },
  ])('leaves the original bytes untouched on a stale $name', ({ userContent, expectation }) => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'retry me' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'assistant', content: 'old answer' });
    const filePath = path.join(dataDir, 'workspaces', 'ws-1', 'sessions', 'sess-1.jsonl');
    const original = fs.readFileSync(filePath, 'utf-8');

    expect(replaceRetryTailWithUser(
      dataDir,
      'ws-1',
      'sess-1',
      userContent,
      expectation,
    )).toEqual({ ok: false, reason: 'history-stale' });
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(original);
  });

  it('detects a file mutation before replacement and preserves the newer bytes', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'retry me' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'assistant', content: 'old answer' });
    const filePath = path.join(dataDir, 'workspaces', 'ws-1', 'sessions', 'sess-1.jsonl');
    const realReadFileSync = fs.readFileSync;
    const readSpy = vi.spyOn(fs, 'readFileSync');
    readSpy.mockImplementationOnce(realReadFileSync);
    readSpy.mockImplementationOnce(((target, options) => {
      fs.appendFileSync(filePath, `${JSON.stringify({
        role: 'user',
        content: 'concurrent prompt',
        timestamp: new Date().toISOString(),
      })}\n`, 'utf-8');
      return realReadFileSync(target, options as never);
    }) as typeof fs.readFileSync);

    const result = replaceRetryTailWithUser(dataDir, 'ws-1', 'sess-1', 'retry me', {
      kind: 'assistant-pair',
      expectedMessageCount: 2,
      expectedAssistantContent: 'old answer',
    });
    readSpy.mockRestore();

    expect(result).toEqual({ ok: false, reason: 'history-changed' });
    expect(loadSessionMessages(dataDir, 'ws-1', 'sess-1')).toEqual([
      { role: 'user', content: 'retry me' },
      { role: 'assistant', content: 'old answer' },
      { role: 'user', content: 'concurrent prompt' },
    ]);
  });

  it('retries transient Windows rename locks and then succeeds', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'retry me' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'assistant', content: 'old answer' });
    const realRenameSync = fs.renameSync;
    const transientCodes = ['EPERM', 'EACCES', 'EBUSY'];
    let attempt = 0;
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      const code = transientCodes[attempt++];
      if (code) throw Object.assign(new Error(`locked: ${code}`), { code });
      return realRenameSync(source, destination);
    });

    const result = replaceRetryTailWithUser(dataDir, 'ws-1', 'sess-1', 'retry me', {
      kind: 'assistant-pair',
      expectedMessageCount: 2,
      expectedAssistantContent: 'old answer',
    });
    const renameAttempts = renameSpy.mock.calls.length;
    renameSpy.mockRestore();

    expect(result).toEqual({ ok: true, removed: 2 });
    expect(renameAttempts).toBe(4);
    expect(loadSessionMessages(dataDir, 'ws-1', 'sess-1')).toEqual([
      { role: 'user', content: 'retry me' },
    ]);
  });

  it('leaves the original bytes untouched when Windows rename locks never clear', () => {
    const dataDir = makeTempDir();
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'user', content: 'retry me' });
    persistMessage(dataDir, 'ws-1', 'sess-1', { role: 'assistant', content: 'old answer' });
    const filePath = path.join(dataDir, 'workspaces', 'ws-1', 'sessions', 'sess-1.jsonl');
    const original = fs.readFileSync(filePath, 'utf-8');
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw Object.assign(new Error('locked'), { code: 'EBUSY' });
    });

    const result = replaceRetryTailWithUser(dataDir, 'ws-1', 'sess-1', 'retry me', {
      kind: 'assistant-pair',
      expectedMessageCount: 2,
      expectedAssistantContent: 'old answer',
    });
    const renameAttempts = renameSpy.mock.calls.length;
    renameSpy.mockRestore();

    expect(result).toEqual({ ok: false, reason: 'history-replace-failed' });
    expect(renameAttempts).toBe(4);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(original);
  });
});

// Moved here from the chat-api receipt pin (TD-CHAT-16 ruling 15): a real
// agent loop cannot produce these forged, mismatched or oversized results, so
// they are pinned against the receipt check directly.
describe('createPersistedCapabilityReceipt', () => {
  const marketplaceMarker = '<!--waggle:capability_request {"name":"react-best-practices","source":"marketplace","kind":"marketplace","packageId":7,"installType":"skill"}-->';
  const result = `Recommended capability.\n${marketplaceMarker}`;

  it('accepts a completed marketplace proposal and keeps its input and output', () => {
    expect(createPersistedCapabilityReceipt({ need: ' review source code ' }, result)).toEqual({
      id: expect.stringMatching(/^capability-/),
      name: 'acquire_capability',
      status: 'done',
      input: { need: 'review source code' },
      output: result,
    });
  });

  it('accepts a starter-pack proposal without a package identity', () => {
    const starter = 'Try this.\n<!--waggle:capability_request {"name":"code-review","source":"starter-pack","kind":"skill"}-->';
    expect(createPersistedCapabilityReceipt({ need: 'review code' }, starter)).not.toBeNull();
  });

  it.each([
    ['a mismatched route', { need: 'mismatched route' }, '<!--waggle:capability_request {"name":"wrong-route","source":"marketplace","kind":"skill"}-->'],
    ['a missing canonical package identity', { need: 'missing canonical package identity' }, '<!--waggle:capability_request {"name":"same-name-decoy","source":"marketplace","kind":"marketplace"}-->'],
    ['an over-long need', { need: 'x'.repeat(2_001) }, result],
    ['an ordinary tool result', { need: 'not a capability receipt' }, 'ordinary result'],
    ['a marker that is not at the end', { need: 'trailing text' }, `${marketplaceMarker}\nmore text`],
    ['an error result', { need: 'errored' }, `Error: failed ${marketplaceMarker}`],
    ['a missing need', {}, result],
    ['a non-object input', 'review source code', result],
  ])('rejects %s', (_case, input, output) => {
    expect(createPersistedCapabilityReceipt(input, output)).toBeNull();
  });
});

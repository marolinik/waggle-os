/**
 * Chat Persistence — I/O Tests
 *
 * Covers:
 *   chat-persistence.ts: persistMessage, loadSessionMessages
 *
 * Uses real temp directories to exercise file system behavior.
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  persistMessage,
  loadSessionMessages,
} from '../../src/local/routes/chat-persistence.js';

// ─── Helpers ────────────────────────────────────────────────────────

let tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-persist-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  tempDirs = [];
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

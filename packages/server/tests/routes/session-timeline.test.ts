/**
 * PM-3: Session Timeline — server-side tests.
 *
 * Tests the parseSessionTimeline function that extracts tool events
 * from session JSONL files.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseSessionTimeline,
  type TimelineEvent,
} from '../../src/local/routes/sessions.js';

describe('parseSessionTimeline', () => {
  let tmpDir: string;
  let sessionsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-timeline-test-'));
    sessionsDir = path.join(tmpDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  });

  function writeSession(id: string, messages: Array<{ role: string; content: string }>) {
    const meta = JSON.stringify({ type: 'meta', title: `Session ${id}`, created: '2026-03-19T10:00:00.000Z' });
    const lines = [
      meta,
      ...messages.map(m => JSON.stringify({ ...m, timestamp: '2026-03-19T10:05:00.000Z' })),
    ];
    const filePath = path.join(sessionsDir, `${id}.jsonl`);
    fs.writeFileSync(filePath, lines.join('\n') + '\n');
    return filePath;
  }

  it('returns empty array for non-existent file', () => {
    expect(parseSessionTimeline('/nonexistent/file.jsonl')).toEqual([]);
  });

  it('returns empty array for empty session file', () => {
    const filePath = path.join(sessionsDir, 'empty.jsonl');
    fs.writeFileSync(filePath, '', 'utf-8');
    expect(parseSessionTimeline(filePath)).toEqual([]);
  });

  it('extracts tool events from assistant messages with tool patterns', () => {
    const filePath = writeSession('s1', [
      { role: 'user', content: 'Search the web for AI news' },
      { role: 'assistant', content: 'Searching the web for "AI news"... Found several results about recent developments.' },
      { role: 'assistant', content: 'Reading file: src/index.ts... The file contains the main entry point.' },
    ]);

    const events = parseSessionTimeline(filePath);
    expect(events.length).toBeGreaterThanOrEqual(2);

    const webSearch = events.find(e => e.toolName === 'web_search');
    expect(webSearch).toBeDefined();
    expect(webSearch!.status).toBe('success');
    expect(webSearch!.inputPreview).toContain('AI news');

    const readFile = events.find(e => e.toolName === 'read_file');
    expect(readFile).toBeDefined();
    expect(readFile!.inputPreview).toContain('src/index.ts');
  });

  it('returns empty array for session with only user messages', () => {
    const filePath = writeSession('s2', [
      { role: 'user', content: 'Hello' },
      { role: 'user', content: 'How are you?' },
    ]);

    const events = parseSessionTimeline(filePath);
    expect(events).toEqual([]);
  });

  it('detects sub-agent nesting via spawn_agent pattern', () => {
    const filePath = writeSession('s3', [
      { role: 'user', content: 'Research this topic' },
      { role: 'assistant', content: 'Spawning sub-agent "researcher" (researcher)... to analyze the topic.' },
      { role: 'assistant', content: 'Searching the web for "topic analysis"... Found relevant results.' },
      { role: 'assistant', content: 'Saving to memory... Stored the research results.' },
    ]);

    const events = parseSessionTimeline(filePath);

    // The spawn_agent event should be a top-level event with children
    const spawnEvent = events.find(e => e.toolName === 'spawn_agent');
    expect(spawnEvent).toBeDefined();
    expect(spawnEvent!.children).toBeDefined();
    expect(spawnEvent!.children!.length).toBeGreaterThanOrEqual(1);
  });

  it('detects error status from error content', () => {
    const filePath = writeSession('s4', [
      { role: 'user', content: 'Read a file' },
      { role: 'assistant', content: 'Reading file: missing.ts... Error: file not found, unable to read.' },
    ]);

    const events = parseSessionTimeline(filePath);
    expect(events.length).toBeGreaterThanOrEqual(1);

    const errorEvent = events.find(e => e.status === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.toolName).toBe('read_file');
  });

  it('assigns sequential IDs to events', () => {
    const filePath = writeSession('s5', [
      { role: 'user', content: 'Do some work' },
      { role: 'assistant', content: 'Searching the web for "test query"... done.' },
      { role: 'assistant', content: 'Saving to memory... saved.' },
    ]);

    const events = parseSessionTimeline(filePath);
    expect(events.length).toBeGreaterThanOrEqual(2);

    const ids = events.map(e => e.id);
    // All IDs should be unique
    expect(new Set(ids).size).toBe(ids.length);
    // IDs should follow tl-N pattern
    expect(ids[0]).toBe('tl-0');
    expect(ids[1]).toBe('tl-1');
  });

  it('includes timestamp from the session message', () => {
    const filePath = writeSession('s6', [
      { role: 'user', content: 'Test' },
      { role: 'assistant', content: 'Checking git status... Clean working tree.' },
    ]);

    const events = parseSessionTimeline(filePath);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].timestamp).toBe('2026-03-19T10:05:00.000Z');
  });
});

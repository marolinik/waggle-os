import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  extractOpenQuestions,
  classifyThreads,
  extractSessionOutcome,
  persistSessionOutcome,
  type OpenQuestion,
  type ThreadInfo,
  type SessionOutcome,
} from '../../src/local/routes/sessions.js';

describe('extractOpenQuestions', () => {
  let tmpDir: string;
  let sessionsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-oq-test-'));
    sessionsDir = path.join(tmpDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  });

  function writeSession(id: string, messages: Array<{ role: string; content: string }>) {
    const meta = JSON.stringify({ type: 'meta', title: `Session ${id}`, created: new Date().toISOString() });
    const lines = [meta, ...messages.map(m => JSON.stringify(m))];
    fs.writeFileSync(path.join(sessionsDir, `${id}.jsonl`), lines.join('\n') + '\n');
  }

  it('returns empty for non-existent dir', () => {
    expect(extractOpenQuestions('/nonexistent/path')).toEqual([]);
  });

  it('returns empty for sessions with no questions', () => {
    writeSession('s1', [
      { role: 'user', content: 'Hello, how are you today?' },
      { role: 'assistant', content: 'I am doing well, thank you.' },
      { role: 'user', content: 'Great, let us continue working.' },
    ]);
    expect(extractOpenQuestions(sessionsDir)).toEqual([]);
  });

  it('detects literal question-form open questions', () => {
    writeSession('s1', [
      { role: 'user', content: 'What should we use for the database layer in this project?' },
      { role: 'assistant', content: 'There are several options to consider.' },
      { role: 'user', content: 'Should we go with PostgreSQL or SQLite for local storage?' },
    ]);
    const result = extractOpenQuestions(sessionsDir);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some(q => q.content.toLowerCase().includes('database') || q.content.toLowerCase().includes('postgresql'))).toBe(true);
  });

  it('detects "we still need to decide" pattern', () => {
    writeSession('s1', [
      { role: 'user', content: 'We made progress on the API.' },
      { role: 'assistant', content: 'Yes, but we still need to decide on the authentication approach for the API layer.' },
      { role: 'user', content: 'Good point, let us think about it.' },
    ]);
    const result = extractOpenQuestions(sessionsDir);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some(q => q.content.toLowerCase().includes('authentication'))).toBe(true);
  });

  it('detects "not yet clear" pattern', () => {
    writeSession('s1', [
      { role: 'assistant', content: 'The deployment strategy is not yet clear whether we should use containers or bare metal.' },
      { role: 'user', content: 'Right, we need to figure that out.' },
      { role: 'assistant', content: 'Let me research both options.' },
    ]);
    const result = extractOpenQuestions(sessionsDir);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some(q => q.content.toLowerCase().includes('container') || q.content.toLowerCase().includes('deployment'))).toBe(true);
  });

  it('detects "pending decision" and "TBD" patterns', () => {
    writeSession('s1', [
      { role: 'user', content: 'The hosting provider is TBD: we are evaluating AWS vs GCP for this.' },
      { role: 'assistant', content: 'There is also a pending decision on the CI pipeline tool selection.' },
      { role: 'user', content: 'Yes, both are important.' },
    ]);
    const result = extractOpenQuestions(sessionsDir);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('detects "need to figure out" pattern', () => {
    writeSession('s1', [
      { role: 'user', content: 'We need to figure out how to handle rate limiting in the proxy layer.' },
      { role: 'assistant', content: 'That is an important consideration.' },
      { role: 'user', content: 'Agreed.' },
    ]);
    const result = extractOpenQuestions(sessionsDir);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some(q => q.content.toLowerCase().includes('rate limiting'))).toBe(true);
  });

  it('excludes greeting-style questions', () => {
    writeSession('s1', [
      { role: 'user', content: 'Hello there!' },
      { role: 'assistant', content: 'Hi! How are you doing today?' },
      { role: 'user', content: 'Good thanks.' },
    ]);
    expect(extractOpenQuestions(sessionsDir)).toEqual([]);
  });

  it('deduplicates similar questions across sessions', () => {
    writeSession('s1', [
      { role: 'user', content: 'What should we use for the caching layer in this system?' },
      { role: 'assistant', content: 'Good question.' },
      { role: 'user', content: 'Let me think about it.' },
    ]);
    writeSession('s2', [
      { role: 'user', content: 'What should we use for the caching layer in this system?' },
      { role: 'assistant', content: 'Redis or Memcached are popular choices.' },
      { role: 'user', content: 'Thanks for the info.' },
    ]);
    const result = extractOpenQuestions(sessionsDir);
    // Should deduplicate — only one entry for the same question
    const cachingQuestions = result.filter(q => q.content.toLowerCase().includes('caching'));
    expect(cachingQuestions.length).toBeLessThanOrEqual(1);
  });

  it('skips sessions with fewer than 3 lines', () => {
    const meta = JSON.stringify({ type: 'meta', title: 'Short', created: new Date().toISOString() });
    fs.writeFileSync(
      path.join(sessionsDir, 'short.jsonl'),
      meta + '\n' + JSON.stringify({ role: 'user', content: 'What should we do about the API design?' }) + '\n',
    );
    expect(extractOpenQuestions(sessionsDir)).toEqual([]);
  });

  it('includes sessionId and date in results', () => {
    writeSession('test-session-42', [
      { role: 'user', content: 'Should we use WebSocket or SSE for the streaming transport?' },
      { role: 'assistant', content: 'Both have tradeoffs.' },
      { role: 'user', content: 'Let me think.' },
    ]);
    const result = extractOpenQuestions(sessionsDir);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].sessionId).toBe('test-session-42');
    expect(result[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('detects "remains open" and "left open" patterns', () => {
    writeSession('s1', [
      { role: 'assistant', content: 'The question of whether to use monorepo or polyrepo remains open for the new project.' },
      { role: 'user', content: 'Yes it does.' },
      { role: 'assistant', content: 'We should revisit this.' },
    ]);
    const result = extractOpenQuestions(sessionsDir);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe('classifyThreads', () => {
  let tmpDir: string;
  let sessionsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-thread-test-'));
    sessionsDir = path.join(tmpDir, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  });

  function writeSession(
    id: string,
    messages: Array<{ role: string; content: string }>,
    opts?: { title?: string; ageMs?: number },
  ) {
    const created = new Date(Date.now() - (opts?.ageMs ?? 0)).toISOString();
    const meta = JSON.stringify({ type: 'meta', title: opts?.title ?? null, created });
    const lines = [meta, ...messages.map(m => JSON.stringify(m))];
    const filePath = path.join(sessionsDir, `${id}.jsonl`);
    fs.writeFileSync(filePath, lines.join('\n') + '\n');

    // Backdate the file's mtime if ageMs is provided
    if (opts?.ageMs) {
      const pastTime = new Date(Date.now() - opts.ageMs);
      fs.utimesSync(filePath, pastTime, pastTime);
    }
  }

  it('returns empty for non-existent dir', () => {
    expect(classifyThreads('/nonexistent/path')).toEqual([]);
  });

  it('returns empty for empty dir', () => {
    expect(classifyThreads(sessionsDir)).toEqual([]);
  });

  it('classifies a recent session as fresh', () => {
    writeSession('s1', [
      { role: 'user', content: 'Let us work on the dashboard.' },
      { role: 'assistant', content: 'Sure, I will help with that.' },
    ], { title: 'Dashboard work' });

    const threads = classifyThreads(sessionsDir);
    expect(threads).toHaveLength(1);
    expect(threads[0].title).toBe('Dashboard work');
    expect(threads[0].freshness).toBe('fresh');
    expect(threads[0].messageCount).toBe(2);
    expect(threads[0].sessionId).toBe('s1');
  });

  it('classifies 3-day-old session as aging', () => {
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    writeSession('s1', [
      { role: 'user', content: 'Working on auth.' },
      { role: 'assistant', content: 'Let me help.' },
    ], { title: 'Auth work', ageMs: threeDays });

    const threads = classifyThreads(sessionsDir);
    expect(threads).toHaveLength(1);
    expect(threads[0].freshness).toBe('aging');
  });

  it('classifies 10-day-old session as stale', () => {
    const tenDays = 10 * 24 * 60 * 60 * 1000;
    writeSession('s1', [
      { role: 'user', content: 'Planning the architecture.' },
      { role: 'assistant', content: 'Here are my thoughts.' },
    ], { title: 'Architecture planning', ageMs: tenDays });

    const threads = classifyThreads(sessionsDir);
    expect(threads).toHaveLength(1);
    expect(threads[0].freshness).toBe('stale');
    // Stale means "not recently touched" — it says nothing about importance
    expect(threads[0].title).toBe('Architecture planning');
  });

  it('skips sessions with fewer than 2 messages', () => {
    const meta = JSON.stringify({ type: 'meta', title: 'Short', created: new Date().toISOString() });
    fs.writeFileSync(
      path.join(sessionsDir, 'short.jsonl'),
      meta + '\n' + JSON.stringify({ role: 'user', content: 'Hi' }) + '\n',
    );
    expect(classifyThreads(sessionsDir)).toEqual([]);
  });

  it('falls back to first user message for title', () => {
    writeSession('s1', [
      { role: 'user', content: 'Implementing the notification system for the app' },
      { role: 'assistant', content: 'Great, let me help with that.' },
    ]);

    const threads = classifyThreads(sessionsDir);
    expect(threads).toHaveLength(1);
    expect(threads[0].title).toContain('notification system');
  });

  it('sorts threads by recency (most recent first)', () => {
    const oneDay = 1 * 24 * 60 * 60 * 1000;
    const fiveDays = 5 * 24 * 60 * 60 * 1000;

    writeSession('old', [
      { role: 'user', content: 'Old thread content here.' },
      { role: 'assistant', content: 'Old response.' },
    ], { title: 'Old thread', ageMs: fiveDays });

    writeSession('recent', [
      { role: 'user', content: 'Recent thread content here.' },
      { role: 'assistant', content: 'Recent response.' },
    ], { title: 'Recent thread', ageMs: oneDay });

    const threads = classifyThreads(sessionsDir);
    expect(threads).toHaveLength(2);
    expect(threads[0].title).toBe('Recent thread');
    expect(threads[1].title).toBe('Old thread');
  });

  it('respects maxSessions limit', () => {
    for (let i = 0; i < 5; i++) {
      writeSession(`s${i}`, [
        { role: 'user', content: `Thread ${i} content here.` },
        { role: 'assistant', content: `Response ${i}.` },
      ], { title: `Thread ${i}` });
    }

    const threads = classifyThreads(sessionsDir, 3);
    expect(threads).toHaveLength(3);
  });

  it('includes lastActive as ISO string', () => {
    writeSession('s1', [
      { role: 'user', content: 'Working on tests.' },
      { role: 'assistant', content: 'Let me help.' },
    ], { title: 'Test work' });

    const threads = classifyThreads(sessionsDir);
    expect(threads[0].lastActive).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('truncates long titles to 80 chars', () => {
    const longContent = 'A'.repeat(200);
    writeSession('s1', [
      { role: 'user', content: longContent },
      { role: 'assistant', content: 'Noted.' },
    ]);

    const threads = classifyThreads(sessionsDir);
    expect(threads[0].title.length).toBeLessThanOrEqual(80);
  });

  it('handles mixed freshness levels across threads', () => {
    const oneHour = 60 * 60 * 1000;
    const fourDays = 4 * 24 * 60 * 60 * 1000;
    const fifteenDays = 15 * 24 * 60 * 60 * 1000;

    writeSession('fresh', [
      { role: 'user', content: 'Fresh work happening now.' },
      { role: 'assistant', content: 'On it.' },
    ], { title: 'Fresh', ageMs: oneHour });

    writeSession('aging', [
      { role: 'user', content: 'Aging work from a few days ago.' },
      { role: 'assistant', content: 'Noted.' },
    ], { title: 'Aging', ageMs: fourDays });

    writeSession('stale', [
      { role: 'user', content: 'Stale work from two weeks ago.' },
      { role: 'assistant', content: 'Archived.' },
    ], { title: 'Stale', ageMs: fifteenDays });

    const threads = classifyThreads(sessionsDir);
    expect(threads).toHaveLength(3);

    const freshThread = threads.find(t => t.title === 'Fresh');
    const agingThread = threads.find(t => t.title === 'Aging');
    const staleThread = threads.find(t => t.title === 'Stale');

    expect(freshThread?.freshness).toBe('fresh');
    expect(agingThread?.freshness).toBe('aging');
    expect(staleThread?.freshness).toBe('stale');
  });
});

describe('extractSessionOutcome', () => {
  function makeLines(messages: Array<{ role: string; content: string }>): string[] {
    return messages.map(m => JSON.stringify(m));
  }

  it('returns null for fewer than 4 message lines', () => {
    const lines = makeLines([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]);
    expect(extractSessionOutcome(lines)).toBeNull();
  });

  it('extracts whatChanged from completion signals', () => {
    const lines = makeLines([
      { role: 'user', content: 'Can you fix the login bug?' },
      { role: 'assistant', content: 'Looking into it now.' },
      { role: 'assistant', content: 'I found the issue in the auth handler.' },
      { role: 'assistant', content: 'Fixed the authentication token validation logic.' },
      { role: 'user', content: 'Great, thanks!' },
    ]);
    const outcome = extractSessionOutcome(lines);
    expect(outcome).not.toBeNull();
    expect(outcome!.whatChanged.toLowerCase()).toContain('authentication');
  });

  it('extracts openItems from unresolved signals', () => {
    const lines = makeLines([
      { role: 'user', content: 'Let us work on the API endpoints.' },
      { role: 'assistant', content: 'I completed the GET endpoints.' },
      { role: 'assistant', content: 'We still need to implement the rate limiting middleware.' },
      { role: 'user', content: 'OK, we can do that next time.' },
    ]);
    const outcome = extractSessionOutcome(lines);
    expect(outcome).not.toBeNull();
    expect(outcome!.openItems).not.toBeNull();
    expect(outcome!.openItems!.toLowerCase()).toContain('rate limiting');
  });

  it('extracts nextStep from forward-looking signals', () => {
    const lines = makeLines([
      { role: 'user', content: 'How is the migration going?' },
      { role: 'assistant', content: 'I finished migrating the user table.' },
      { role: 'assistant', content: 'Next step: migrate the permissions table and update foreign keys.' },
      { role: 'user', content: 'Sounds good.' },
    ]);
    const outcome = extractSessionOutcome(lines);
    expect(outcome).not.toBeNull();
    expect(outcome!.nextStep).not.toBeNull();
    expect(outcome!.nextStep!.toLowerCase()).toContain('permissions');
  });

  it('falls back to first substantive user message for whatChanged', () => {
    const lines = makeLines([
      { role: 'user', content: 'Can you review the database schema design for the new feature?' },
      { role: 'assistant', content: 'Sure, let me take a look.' },
      { role: 'assistant', content: 'The schema looks reasonable.' },
      { role: 'user', content: 'OK thanks.' },
    ]);
    const outcome = extractSessionOutcome(lines);
    expect(outcome).not.toBeNull();
    expect(outcome!.whatChanged.toLowerCase()).toContain('database schema');
  });

  it('returns null for all-greeting sessions', () => {
    const lines = makeLines([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'Thanks' },
      { role: 'assistant', content: 'You are welcome.' },
    ]);
    expect(extractSessionOutcome(lines)).toBeNull();
  });

  it('handles outcome with all three fields populated', () => {
    const lines = makeLines([
      { role: 'user', content: 'Let us finish the notification system.' },
      { role: 'assistant', content: 'I implemented the email notification sender module.' },
      { role: 'assistant', content: 'We still need to add SMS notification support.' },
      { role: 'assistant', content: 'Next step: integrate the Twilio API for SMS delivery.' },
      { role: 'user', content: 'Perfect, let us do that tomorrow.' },
    ]);
    const outcome = extractSessionOutcome(lines);
    expect(outcome).not.toBeNull();
    expect(outcome!.whatChanged).toBeTruthy();
    expect(outcome!.openItems).not.toBeNull();
    expect(outcome!.nextStep).not.toBeNull();
  });

  it('truncates long content', () => {
    const longTask = 'A'.repeat(200);
    const lines = makeLines([
      { role: 'user', content: `Can you work on the feature?` },
      { role: 'assistant', content: `I completed ${longTask} successfully.` },
      { role: 'user', content: 'Great job.' },
      { role: 'assistant', content: 'All done.' },
    ]);
    const outcome = extractSessionOutcome(lines);
    expect(outcome).not.toBeNull();
    expect(outcome!.whatChanged.length).toBeLessThanOrEqual(120);
  });
});

describe('persistSessionOutcome', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-outcome-test-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it('writes outcome to meta line', () => {
    const filePath = path.join(tmpDir, 'test.jsonl');
    const meta = { type: 'meta', title: 'Test', created: new Date().toISOString() };
    const msg = { role: 'user', content: 'Hello' };
    fs.writeFileSync(filePath, JSON.stringify(meta) + '\n' + JSON.stringify(msg) + '\n');

    const outcome: SessionOutcome = {
      whatChanged: 'Fixed the auth bug',
      openItems: 'Rate limiting still needed',
      nextStep: 'Add rate limiter',
    };
    persistSessionOutcome(filePath, outcome);

    // Read back and verify
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    const lines = content.split('\n');
    const updatedMeta = JSON.parse(lines[0]);
    expect(updatedMeta.outcome).toEqual(outcome);
    // Original message should still be there
    expect(lines).toHaveLength(2);
    const originalMsg = JSON.parse(lines[1]);
    expect(originalMsg.content).toBe('Hello');
  });

  it('preserves existing meta fields', () => {
    const filePath = path.join(tmpDir, 'test.jsonl');
    const meta = { type: 'meta', title: 'My Session', summary: 'A good session', created: '2026-03-14T00:00:00Z' };
    fs.writeFileSync(filePath, JSON.stringify(meta) + '\n');

    persistSessionOutcome(filePath, { whatChanged: 'Updated config', openItems: null, nextStep: null });

    const content = fs.readFileSync(filePath, 'utf-8').trim();
    const updatedMeta = JSON.parse(content.split('\n')[0]);
    expect(updatedMeta.title).toBe('My Session');
    expect(updatedMeta.summary).toBe('A good session');
    expect(updatedMeta.outcome.whatChanged).toBe('Updated config');
  });
});

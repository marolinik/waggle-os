import { describe, it, expect } from 'vitest';
import { ClaudeAdapter } from '../../src/harvest/claude-adapter.js';

/**
 * R6 — new export streams from the 2026-04-22 Claude.ai export refresh:
 * `memories` (conversations_memory + project_memories) → type='memory',
 * `design_chats[]` → conversation items, plus enriched project-docs
 * parsing (empty-doc skip, project-level timestamp fallback, doc/project
 * uuid metadata). W4.4 caption extraction coverage lives in
 * caption-parity.test.ts.
 *
 * Reverse-ported from OSS hive-mind (oss-drift triage R6, 2026-06-11).
 */

describe('ClaudeAdapter — 2026-04-22 export streams (R6)', () => {
  const fixture = {
    conversations: [{
      uuid: 'conv-1',
      name: 'Regular chat',
      created_at: '2026-04-01T09:00:00Z',
      chat_messages: [
        { sender: 'human', text: 'Hello Claude', created_at: '2026-04-01T09:00:00Z' },
        { sender: 'assistant', text: 'Hello! How can I help?', created_at: '2026-04-01T09:00:05Z' },
      ],
    }],
    projects: [{
      uuid: 'proj-1',
      name: 'Waggle Launch',
      created_at: '2026-03-01T08:00:00Z',
      updated_at: '2026-03-15T12:00:00Z',
      docs: [
        // No own created_at → falls back to project updated_at.
        { uuid: 'doc-1', filename: 'launch-plan.md', content: 'Ship in June.' },
        // Empty content → skipped entirely.
        { uuid: 'doc-2', filename: 'empty.md', content: '' },
      ],
    }],
    memories: [{
      account_uuid: 'acct-1',
      conversations_memory: 'User is Marko, founder of Egzakta Group.',
      project_memories: {
        'proj-1': 'Project memory: launch is the priority.',
        'proj-empty': '',
      },
    }],
    design_chats: [{
      uuid: 'dc-1',
      title: 'Landing page redesign',
      project: 'proj-1',
      created_at: '2026-04-20T10:00:00Z',
      messages: [
        { role: 'user', text: 'Make the hero bolder', created_at: '2026-04-20T10:00:00Z' },
        { role: 'assistant', content: [{ type: 'text', text: 'Done — increased weight.' }] },
      ],
    }],
  };

  it('parses all four streams from a combined export', () => {
    const items = new ClaudeAdapter().parse(fixture);
    // 1 conversation + 1 project doc (empty one skipped) + 2 memories + 1 design chat
    expect(items).toHaveLength(5);
  });

  it('conversations_memory becomes a type=memory item', () => {
    const items = new ClaudeAdapter().parse(fixture);
    const mem = items.find(i => i.type === 'memory' && i.title === 'Claude Memory — Conversations');
    expect(mem).toBeDefined();
    expect(mem!.content).toContain('founder of Egzakta Group');
    expect(mem!.metadata.memoryKind).toBe('conversations_memory');
    expect(mem!.metadata.accountUuid).toBe('acct-1');
    expect(() => new Date(mem!.timestamp).toISOString()).not.toThrow();
  });

  it('project_memories map becomes per-project memory items, skipping empty values', () => {
    const items = new ClaudeAdapter().parse(fixture);
    const projMems = items.filter(i => i.metadata.memoryKind === 'project_memory');
    expect(projMems).toHaveLength(1); // proj-empty skipped
    expect(projMems[0].title).toBe('Claude Memory — Project proj-1');
    expect(projMems[0].content).toContain('launch is the priority');
    expect(projMems[0].metadata.projectUuid).toBe('proj-1');
    expect(projMems[0].metadata.accountUuid).toBe('acct-1');
  });

  it('design_chats become conversation items with messages and stream metadata', () => {
    const items = new ClaudeAdapter().parse(fixture);
    const dc = items.find(i => i.metadata.stream === 'design_chats');
    expect(dc).toBeDefined();
    expect(dc!.type).toBe('conversation');
    expect(dc!.title).toBe('Landing page redesign');
    expect(dc!.messages).toHaveLength(2);
    expect(dc!.messages![0].role).toBe('user');
    // Content-block message shape is parsed too.
    expect(dc!.content).toContain('assistant: Done — increased weight.');
    expect(dc!.timestamp).toBe('2026-04-20T10:00:00Z');
    expect(dc!.metadata.designChatUuid).toBe('dc-1');
    expect(dc!.metadata.projectUuid).toBe('proj-1');
  });

  it('project docs skip empty content and fall back to project updated_at for timestamp', () => {
    const items = new ClaudeAdapter().parse(fixture);
    const docs = items.filter(i => i.type === 'artifact');
    expect(docs).toHaveLength(1); // empty.md skipped
    const doc = docs[0];
    expect(doc.title).toBe('launch-plan.md');
    expect(doc.timestamp).toBe('2026-03-15T12:00:00Z'); // project updated_at fallback
    expect(doc.metadata.docUuid).toBe('doc-1');
    expect(doc.metadata.projectUuid).toBe('proj-1');
    expect(doc.metadata.filename).toBe('launch-plan.md');
    expect(doc.metadata.projectName).toBe('Waggle Launch');
  });

  it('project doc falls back to project created_at when updated_at is absent', () => {
    const items = new ClaudeAdapter().parse({
      projects: [{
        uuid: 'p2',
        name: 'Old project',
        created_at: '2026-01-05T00:00:00Z',
        docs: [{ uuid: 'd9', filename: 'notes.md', content: 'old notes' }],
      }],
    });
    expect(items).toHaveLength(1);
    expect(items[0].timestamp).toBe('2026-01-05T00:00:00Z');
  });

  it('accepts a bare (non-array) memories object', () => {
    const items = new ClaudeAdapter().parse({
      memories: { conversations_memory: 'bare object form' },
    });
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('memory');
    expect(items[0].content).toBe('bare object form');
  });

  it('still parses the plain conversations stream (regression)', () => {
    const items = new ClaudeAdapter().parse(fixture);
    const conv = items.find(i => i.metadata.conversationId === 'conv-1');
    expect(conv).toBeDefined();
    expect(conv!.type).toBe('conversation');
    expect(conv!.messages).toHaveLength(2);
    expect(conv!.timestamp).toBe('2026-04-01T09:00:00Z');
  });

  it('W4.4 attachment extraction applies to design_chats messages too', () => {
    const items = new ClaudeAdapter().parse({
      design_chats: [{
        uuid: 'dc-2',
        messages: [
          {
            role: 'user',
            text: 'Use this mock',
            attachments: [{ file_name: 'mock.png', extracted_content: 'Hero section wireframe v2' }],
          },
        ],
      }],
    });
    expect(items).toHaveLength(1);
    expect(items[0].content).toContain('[Attached: mock.png] Hero section wireframe v2');
  });
});

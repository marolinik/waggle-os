import { describe, it, expect } from 'vitest';
import {
  createTeamSchema,
  createTaskSchema,
  sendMessageSchema,
  createAgentSchema,
  createAgentGroupSchema,
} from '../src/schemas.js';

describe('createTeamSchema', () => {
  it('accepts valid team', () => {
    const result = createTeamSchema.safeParse({ name: 'Marketing', slug: 'marketing' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createTeamSchema.safeParse({ name: '', slug: 'ok' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid slug characters', () => {
    const result = createTeamSchema.safeParse({ name: 'Ok', slug: 'Has Spaces' });
    expect(result.success).toBe(false);
  });
});

describe('createTaskSchema', () => {
  it('accepts valid task with defaults', () => {
    const result = createTaskSchema.safeParse({ title: 'Research competitors' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe('normal');
    }
  });
});

describe('sendMessageSchema', () => {
  it('accepts valid waggle dance message', () => {
    const result = sendMessageSchema.safeParse({
      type: 'request',
      subtype: 'knowledge_check',
      content: { topic: 'competitor pricing', scope: 'Product Line X' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid subtype', () => {
    const result = sendMessageSchema.safeParse({
      type: 'broadcast',
      subtype: 'invalid_type',
      content: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('createAgentSchema', () => {
  it('accepts agent with defaults', () => {
    const result = createAgentSchema.safeParse({ name: 'web-searcher' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBe('claude-haiku-4-5');
      expect(result.data.tools).toEqual([]);
    }
  });
});

describe('createAgentGroupSchema', () => {
  it('accepts valid agent group', () => {
    const result = createAgentGroupSchema.safeParse({
      name: 'Research Team',
      strategy: 'parallel',
      members: [
        { agentId: '00000000-0000-0000-0000-000000000001', roleInGroup: 'lead' },
        { agentId: '00000000-0000-0000-0000-000000000002' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid strategy', () => {
    const result = createAgentGroupSchema.safeParse({
      name: 'Bad',
      strategy: 'random',
      members: [],
    });
    expect(result.success).toBe(false);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { WaggleDanceDispatcher } from '../src/dispatcher.js';
import type { DispatchDeps } from '../src/dispatcher.js';
import type { WaggleMessage } from '@waggle/shared';

function makeDeps(overrides?: Partial<DispatchDeps>): DispatchDeps {
  return {
    searchMemory: vi.fn(async (q: string) => `Memory results for: ${q}`),
    resolveCapability: vi.fn((q: string) => [
      { source: 'native', name: 'search_memory', description: 'Search memory', available: true },
    ]),
    spawnWorker: vi.fn(async (task: string, role: string) => `Worker completed: ${task}`),
    ...overrides,
  };
}

function makeMessage(overrides?: Partial<WaggleMessage>): WaggleMessage {
  return {
    id: 'msg-1',
    teamId: 'team-1',
    senderId: 'agent-1',
    type: 'request',
    subtype: 'task_delegation',
    content: { task: 'Research TypeScript', role: 'researcher' },
    referenceId: null,
    routing: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('WaggleDanceDispatcher', () => {
  it('constructor creates dispatcher', () => {
    const deps = makeDeps();
    const dispatcher = new WaggleDanceDispatcher(deps);
    expect(dispatcher).toBeDefined();
    expect(dispatcher).toBeInstanceOf(WaggleDanceDispatcher);
  });

  describe('task_delegation', () => {
    it('dispatches to spawnWorker with task and role', async () => {
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage());

      expect(result.handled).toBe(true);
      expect(result.response).toBe('Worker completed: Research TypeScript');
      expect(deps.spawnWorker).toHaveBeenCalledWith('Research TypeScript', 'researcher', undefined);
    });

    it('passes context when provided', async () => {
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        content: { task: 'Analyze data', role: 'analyst', context: 'Q4 sales figures' },
      }));

      expect(result.handled).toBe(true);
      expect(deps.spawnWorker).toHaveBeenCalledWith('Analyze data', 'analyst', 'Q4 sales figures');
    });

    it('fails gracefully on missing task', async () => {
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        content: { role: 'analyst' },
      }));

      expect(result.handled).toBe(false);
      expect(result.error).toBe('task_delegation requires content.task');
    });

    it('handles spawnWorker errors', async () => {
      const deps = makeDeps({
        spawnWorker: vi.fn(async () => { throw new Error('Worker crashed'); }),
      });
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage());

      expect(result.handled).toBe(false);
      expect(result.error).toContain('Worker spawn failed');
      expect(result.error).toContain('Worker crashed');
    });
  });

  describe('knowledge_check', () => {
    it('dispatches to searchMemory', async () => {
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'request',
        subtype: 'knowledge_check',
        content: { query: 'TypeScript patterns' },
      }));

      expect(result.handled).toBe(true);
      expect(result.response).toBe('Memory results for: TypeScript patterns');
      expect(deps.searchMemory).toHaveBeenCalledWith('TypeScript patterns');
    });

    it('supports both query and topic fields', async () => {
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);

      // topic field
      const result = await dispatcher.dispatch(makeMessage({
        type: 'request',
        subtype: 'knowledge_check',
        content: { topic: 'Architecture decisions' },
      }));

      expect(result.handled).toBe(true);
      expect(deps.searchMemory).toHaveBeenCalledWith('Architecture decisions');
    });

    it('fails on empty query', async () => {
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'request',
        subtype: 'knowledge_check',
        content: {},
      }));

      expect(result.handled).toBe(false);
      expect(result.error).toBe('knowledge_check requires content.query or content.topic');
    });

    it('handles searchMemory errors', async () => {
      const deps = makeDeps({
        searchMemory: vi.fn(async () => { throw new Error('DB connection lost'); }),
      });
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'request',
        subtype: 'knowledge_check',
        content: { query: 'something' },
      }));

      expect(result.handled).toBe(false);
      expect(result.error).toContain('Memory search failed');
    });
  });

  describe('skill_request', () => {
    it('dispatches to resolveCapability', async () => {
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'request',
        subtype: 'skill_request',
        content: { skill: 'web_search' },
      }));

      expect(result.handled).toBe(true);
      expect(deps.resolveCapability).toHaveBeenCalledWith('web_search');
    });

    it('returns formatted capability routes', async () => {
      const deps = makeDeps({
        resolveCapability: vi.fn(() => [
          { source: 'native', name: 'search_memory', description: 'Search memory', available: true },
          { source: 'plugin', name: 'web_search', description: 'Web search', available: false },
        ]),
      });
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'request',
        subtype: 'skill_request',
        content: { skill: 'search' },
      }));

      expect(result.handled).toBe(true);
      expect(result.response).toContain('Found 2 capabilities (1 available)');
      expect(result.response).toContain('[native] search_memory');
      expect(result.response).toContain('[plugin] web_search');
      expect(result.response).toContain('(available)');
      expect(result.response).toContain('(not available)');
    });

    it('handles no results', async () => {
      const deps = makeDeps({
        resolveCapability: vi.fn(() => []),
      });
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'request',
        subtype: 'skill_request',
        content: { skill: 'nonexistent' },
      }));

      expect(result.handled).toBe(true);
      expect(result.response).toBe('No capability found for "nonexistent"');
    });

    it('fails on empty skill query', async () => {
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'request',
        subtype: 'skill_request',
        content: {},
      }));

      expect(result.handled).toBe(false);
      expect(result.error).toBe('skill_request requires content.skill or content.query');
    });
  });

  describe('skill_share', () => {
    it('returns parsed install data when name and content provided', async () => {
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'broadcast',
        subtype: 'skill_share',
        content: { name: 'code_review', content: '#!/bin/bash\necho review', sharedBy: 'agent-2' },
      }));

      expect(result.handled).toBe(true);
      const parsed = JSON.parse(result.response!);
      expect(parsed.action).toBe('install_shared_skill');
      expect(parsed.skillName).toBe('code_review');
      expect(parsed.skillContent).toBe('#!/bin/bash\necho review');
      expect(parsed.sharedBy).toBe('agent-2');
    });

    it('defaults sharedBy to unknown when not provided', async () => {
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'broadcast',
        subtype: 'skill_share',
        content: { name: 'deploy', content: 'deploy script body' },
      }));

      expect(result.handled).toBe(true);
      const parsed = JSON.parse(result.response!);
      expect(parsed.sharedBy).toBe('unknown');
    });

    it('accepts skill field as fallback for name', async () => {
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'broadcast',
        subtype: 'skill_share',
        content: { skill: 'lint_fix', content: 'lint script' },
      }));

      expect(result.handled).toBe(true);
      const parsed = JSON.parse(result.response!);
      expect(parsed.skillName).toBe('lint_fix');
    });

    it('fails when name is missing', async () => {
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'broadcast',
        subtype: 'skill_share',
        content: { content: 'some content' },
      }));

      expect(result.handled).toBe(false);
      expect(result.error).toBe('skill_share requires content.name and content.content');
    });

    it('fails when content is missing', async () => {
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'broadcast',
        subtype: 'skill_share',
        content: { name: 'some_skill' },
      }));

      expect(result.handled).toBe(false);
      expect(result.error).toBe('skill_share requires content.name and content.content');
    });
  });

  describe('validation', () => {
    it('rejects invalid message type-subtype combo', async () => {
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'broadcast',
        subtype: 'task_delegation',
      }));

      expect(result.handled).toBe(false);
      expect(result.error).toBe('Invalid message: broadcast/task_delegation');
    });

    it('returns not handled for unhandled subtypes', async () => {
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'broadcast',
        subtype: 'discovery',
        content: {},
      }));

      expect(result.handled).toBe(false);
      expect(result.error).toBe('Unhandled subtype: discovery');
    });
  });
});

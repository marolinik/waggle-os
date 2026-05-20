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

/**
 * Build deps that include the v2 emit/response/recommend callbacks.
 * Most v2 tests want to assert that the right callback was invoked
 * with the right message — use this helper to get spies.
 */
function makeV2Deps(overrides?: Partial<DispatchDeps>): DispatchDeps {
  return {
    ...makeDeps(),
    emitSignal: vi.fn(async () => undefined),
    recordResponse: vi.fn(async () => undefined),
    recommendModel: vi.fn(async () => 'claude-haiku-4-5'),
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

    it('rejects unknown subtypes (runtime defense against malformed messages)', async () => {
      // TypeScript prevents this in-process, but network messages may
      // arrive with garbage subtypes. The dispatcher's switch must have
      // a default branch that fails gracefully.
      const deps = makeDeps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch({
        ...makeMessage(),
        type: 'broadcast',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        subtype: 'nonexistent_subtype' as any,
        content: {},
      });
      expect(result.handled).toBe(false);
      expect(result.error).toMatch(/Invalid message|Unhandled subtype/);
    });
  });

  // ── v2 — cross-tool activity bus ──────────────────────────────────

  describe('discovery (v2 broadcast)', () => {
    it('forwards to emitSignal and reports handled=true', async () => {
      const deps = makeV2Deps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const message = makeMessage({
        type: 'broadcast',
        subtype: 'discovery',
        content: { topic: 'webhook secret rotation', tool: 'claude-code', importance: 'normal' },
      });
      const result = await dispatcher.dispatch(message);
      expect(result.handled).toBe(true);
      expect(deps.emitSignal).toHaveBeenCalledWith(message);
    });

    it('handles missing emitSignal gracefully (Phase 1A behavior)', async () => {
      // emitSignal is optional. When absent, the dispatcher still
      // reports handled=true so callers can persist the message
      // without an emitter wired.
      const deps = makeDeps(); // no emitSignal
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'broadcast',
        subtype: 'discovery',
        content: { topic: 'whatever' },
      }));
      expect(result.handled).toBe(true);
    });

    it('propagates emitSignal errors', async () => {
      const deps = makeV2Deps({
        emitSignal: vi.fn(async () => { throw new Error('SSE pipe broken'); }),
      });
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'broadcast',
        subtype: 'discovery',
        content: { topic: 'x' },
      }));
      expect(result.handled).toBe(false);
      expect(result.error).toMatch(/Signal emit failed/);
    });
  });

  describe('routed_share (v2 broadcast)', () => {
    it('forwards to emitSignal preserving the routing field', async () => {
      const deps = makeV2Deps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const message = makeMessage({
        type: 'broadcast',
        subtype: 'routed_share',
        content: { payload: { docId: 'doc-42' } },
        routing: [
          { userId: 'user-1', reason: 'subscribed to doc-42' },
          { userId: 'user-3', reason: 'reviewer' },
        ],
      });
      const result = await dispatcher.dispatch(message);
      expect(result.handled).toBe(true);
      expect(deps.emitSignal).toHaveBeenCalled();
      const call = (deps.emitSignal as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.routing).toHaveLength(2);
    });
  });

  describe('model_recipe (v2 broadcast)', () => {
    it('forwards a shared model config via emitSignal', async () => {
      const deps = makeV2Deps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'broadcast',
        subtype: 'model_recipe',
        content: {
          name: 'reasoning-bias-low',
          model: 'claude-opus-4-7',
          temperature: 0.2,
          system: 'You are concise.',
        },
      }));
      expect(result.handled).toBe(true);
      expect(deps.emitSignal).toHaveBeenCalled();
    });
  });

  describe('knowledge_match (v2 response)', () => {
    it('forwards to recordResponse', async () => {
      const deps = makeV2Deps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const message = makeMessage({
        type: 'response',
        subtype: 'knowledge_match',
        content: { matchedEntities: ['ent-1', 'ent-2'], confidence: 0.91 },
        referenceId: 'request-msg-id-7',
      });
      const result = await dispatcher.dispatch(message);
      expect(result.handled).toBe(true);
      expect(deps.recordResponse).toHaveBeenCalledWith(message);
    });

    it('is handled even without recordResponse wired', async () => {
      const deps = makeDeps(); // no recordResponse
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'response',
        subtype: 'knowledge_match',
        content: {},
        referenceId: 'r-1',
      }));
      expect(result.handled).toBe(true);
    });
  });

  describe('task_claim (v2 response)', () => {
    it('forwards to recordResponse', async () => {
      const deps = makeV2Deps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const message = makeMessage({
        type: 'response',
        subtype: 'task_claim',
        content: { claimedBy: 'agent-9', eta: '10m' },
        referenceId: 'task-delegation-msg-3',
      });
      const result = await dispatcher.dispatch(message);
      expect(result.handled).toBe(true);
      expect(deps.recordResponse).toHaveBeenCalledWith(message);
    });
  });

  describe('model_recommendation (v2 request)', () => {
    it('queries recommendModel and returns the recommendation', async () => {
      const deps = makeV2Deps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'request',
        subtype: 'model_recommendation',
        content: { query: 'fast classifier' },
      }));
      expect(result.handled).toBe(true);
      expect(result.response).toContain('claude-haiku-4-5');
      expect(deps.recommendModel).toHaveBeenCalledWith('fast classifier', expect.any(Object));
    });

    it('passes additional context fields to recommendModel', async () => {
      const deps = makeV2Deps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      await dispatcher.dispatch(makeMessage({
        type: 'request',
        subtype: 'model_recommendation',
        content: { query: 'reason about a contract', maxLatencyMs: 4000, budget: 'normal' },
      }));
      const call = (deps.recommendModel as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1]).toMatchObject({ maxLatencyMs: 4000, budget: 'normal' });
    });

    it('handles missing recommendModel gracefully', async () => {
      const deps = makeDeps(); // no recommendModel
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'request',
        subtype: 'model_recommendation',
        content: { query: 'anything' },
      }));
      expect(result.handled).toBe(true);
      expect(result.response).toMatch(/no model recommender/i);
    });

    it('fails when query is missing', async () => {
      const deps = makeV2Deps();
      const dispatcher = new WaggleDanceDispatcher(deps);
      const result = await dispatcher.dispatch(makeMessage({
        type: 'request',
        subtype: 'model_recommendation',
        content: {},
      }));
      expect(result.handled).toBe(false);
      expect(result.error).toMatch(/model_recommendation requires content.query/);
    });
  });
});

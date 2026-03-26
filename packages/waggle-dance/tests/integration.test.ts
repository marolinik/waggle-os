import { describe, it, expect, vi } from 'vitest';
import { WaggleDanceDispatcher } from '../src/dispatcher.js';
import type { WaggleMessage } from '@waggle/shared';

describe('Waggle Dance Integration', () => {
  it('full workflow: task_delegation → knowledge_check → skill_request', async () => {
    const deps = {
      searchMemory: vi.fn(async (q: string) => `Found memories about: ${q}`),
      resolveCapability: vi.fn(() => [
        { source: 'native', name: 'web_search', description: 'Web search', available: true },
      ]),
      spawnWorker: vi.fn(async (task: string) => `Worker completed: ${task}`),
    };
    const dispatcher = new WaggleDanceDispatcher(deps);

    // 1. Delegate a task
    const taskResult = await dispatcher.dispatch({
      id: '1', teamId: 't1', senderId: 'a1', type: 'request', subtype: 'task_delegation',
      content: { task: 'Analyze market data', role: 'analyst' },
      referenceId: null, routing: null, createdAt: new Date(),
    });
    expect(taskResult.handled).toBe(true);
    expect(deps.spawnWorker).toHaveBeenCalledWith('Analyze market data', 'analyst', undefined);

    // 2. Check knowledge
    const knowledgeResult = await dispatcher.dispatch({
      id: '2', teamId: 't1', senderId: 'a1', type: 'request', subtype: 'knowledge_check',
      content: { query: 'market trends' },
      referenceId: null, routing: null, createdAt: new Date(),
    });
    expect(knowledgeResult.handled).toBe(true);
    expect(knowledgeResult.response).toContain('market trends');

    // 3. Request a skill
    const skillResult = await dispatcher.dispatch({
      id: '3', teamId: 't1', senderId: 'a1', type: 'request', subtype: 'skill_request',
      content: { skill: 'web_search' },
      referenceId: null, routing: null, createdAt: new Date(),
    });
    expect(skillResult.handled).toBe(true);
    expect(skillResult.response).toContain('web_search');
  });

  it('round-trip: task delegation result feeds knowledge check', async () => {
    let lastWorkerResult = '';
    const deps = {
      searchMemory: vi.fn(async () => lastWorkerResult),
      resolveCapability: vi.fn(() => []),
      spawnWorker: vi.fn(async (task: string) => {
        lastWorkerResult = `Analysis complete for: ${task}`;
        return lastWorkerResult;
      }),
    };
    const dispatcher = new WaggleDanceDispatcher(deps);

    // First: delegate
    await dispatcher.dispatch({
      id: '1', teamId: 't1', senderId: 'a1', type: 'request', subtype: 'task_delegation',
      content: { task: 'Analyze competitors', role: 'analyst' },
      referenceId: null, routing: null, createdAt: new Date(),
    });

    // Then: check what was learned
    const result = await dispatcher.dispatch({
      id: '2', teamId: 't1', senderId: 'a1', type: 'request', subtype: 'knowledge_check',
      content: { query: 'competitors' },
      referenceId: null, routing: null, createdAt: new Date(),
    });

    expect(result.response).toContain('Analyze competitors');
  });
});

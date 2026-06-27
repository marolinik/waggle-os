import { describe, it, expect } from 'vitest';
import { interpretCommand, type InterpretDeps } from '../../src/local/command-interpret.js';

function deps(over: Partial<InterpretDeps> & { llm: InterpretDeps['llm'] }): InterpretDeps {
  return {
    text: 'do the thing',
    workspaceId: 'w1',
    currentTier: 'FREE',
    workspaces: [
      { id: 'w1', name: 'Acme Redesign' },
      { id: 'w2', name: 'Personal Notes' },
    ],
    memoryContext: 'Active: redesigning the Acme landing page.',
    ...over,
  };
}

const llmReturning = (s: string) => async () => s;

describe('interpretCommand — Tier 1 resolver', () => {
  it('resolves a create-workspace intent to a single action with the name filled', async () => {
    const res = await interpretCommand(deps({
      text: 'make a new workspace for the Phoenix project',
      llm: llmReturning('{"kind":"action","actionId":"create_workspace","params":{"name":"Phoenix"}}'),
    }));
    expect(res.kind).toBe('action');
    expect(res.action?.id).toBe('create_workspace');
    expect(res.action?.sideEffect).toBe(true);
    expect(res.action?.endpoint).toEqual({ method: 'POST', path: '/api/workspaces', body: { name: 'Phoenix', group: 'Personal' } });
  });

  it('resolves a memory-dependent "continue" intent against the recent workspaces', async () => {
    const res = await interpretCommand(deps({
      text: 'continue what I was working on',
      llm: llmReturning('{"kind":"action","actionId":"open_workspace","params":{"workspaceId":"w1"}}'),
    }));
    expect(res.kind).toBe('action');
    expect(res.action?.navigate).toEqual({ type: 'workspace', id: 'workspace:w1' });
  });

  it('surfaces tier_gated for a PRO action on FREE', async () => {
    const res = await interpretCommand(deps({
      currentTier: 'FREE',
      text: 'install the postgres mcp server',
      llm: llmReturning('{"kind":"action","actionId":"install_mcp","params":{"mcpId":"postgres"}}'),
    }));
    expect(res.kind).toBe('tier_gated');
    expect(res.requiredTier).toBe('PRO');
    expect(res.actualTier).toBe('FREE');
  });

  it('passes the action through (not gated) when the tier is sufficient', async () => {
    const res = await interpretCommand(deps({
      currentTier: 'PRO',
      llm: llmReturning('{"kind":"action","actionId":"install_mcp","params":{"mcpId":"postgres"}}'),
    }));
    expect(res.kind).toBe('action');
    expect(res.action?.id).toBe('install_mcp');
  });

  it('returns none (never an invented action) for an out-of-registry id', async () => {
    const res = await interpretCommand(deps({
      llm: llmReturning('{"kind":"action","actionId":"delete_production_db","params":{}}'),
    }));
    expect(res.kind).toBe('none');
    expect(res.fallback).toBe(true);
  });

  it('passes clarify through', async () => {
    const res = await interpretCommand(deps({
      llm: llmReturning('{"kind":"clarify","question":"Which workspace?","options":["Acme","Personal"]}'),
    }));
    expect(res.kind).toBe('clarify');
    expect(res.question).toBe('Which workspace?');
    expect(res.options).toEqual(['Acme', 'Personal']);
  });

  it('collapses a single-step plan to one action', async () => {
    const res = await interpretCommand(deps({
      llm: llmReturning('{"kind":"plan","steps":[{"actionId":"open_app","params":{"app":"memory"}}]}'),
    }));
    expect(res.kind).toBe('action');
    expect(res.action?.navigate).toEqual({ type: 'command', id: 'command:memory' });
  });

  it('downgrades a multi-step plan to clarify (v1 does not execute plans)', async () => {
    const res = await interpretCommand(deps({
      llm: llmReturning('{"kind":"plan","steps":[{"actionId":"create_workspace","params":{"name":"A"}},{"actionId":"open_app","params":{"app":"memory"}}]}'),
    }));
    expect(res.kind).toBe('clarify');
    expect(res.steps?.length).toBe(2);
  });

  it('strips code fences before parsing', async () => {
    const res = await interpretCommand(deps({
      llm: llmReturning('```json\n{"kind":"action","actionId":"open_app","params":{"app":"settings"}}\n```'),
    }));
    expect(res.kind).toBe('action');
    expect(res.action?.navigate?.id).toBe('command:settings');
  });

  it('degrades to a Tier-0 fallback on unparseable model output', async () => {
    const res = await interpretCommand(deps({ llm: llmReturning('I think you want to open memory!') }));
    expect(res.kind).toBe('none');
    expect(res.fallback).toBe(true);
  });

  it('degrades to a Tier-0 fallback when the model is unavailable (no key → null)', async () => {
    const res = await interpretCommand(deps({ llm: async () => null }));
    expect(res.kind).toBe('none');
    expect(res.fallback).toBe(true);
  });

  it('degrades to a Tier-0 fallback when the llm throws', async () => {
    const res = await interpretCommand(deps({ llm: async () => { throw new Error('proxy down'); } }));
    expect(res.kind).toBe('none');
    expect(res.fallback).toBe(true);
  });
});

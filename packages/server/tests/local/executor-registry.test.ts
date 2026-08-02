import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentPersona } from '@waggle/agent';
import type { DetectedTool } from '@waggle/shared';
import { ExecutorRegistry } from '../../src/local/executor-registry.js';

function persona(id: string, overrides: Partial<AgentPersona> = {}): AgentPersona {
  return {
    id,
    name: id,
    description: '',
    icon: '',
    systemPrompt: '',
    modelPreference: '',
    tools: [],
    workspaceAffinity: [],
    suggestedCommands: [],
    defaultWorkflow: null,
    ...overrides,
  };
}

function detectedTool(id: string, installed = true): DetectedTool {
  return {
    id,
    displayName: id,
    installed,
    installedPath: installed ? `/tools/${id}` : null,
    version: installed ? '1.0.0' : null,
    hooksInstalled: false,
    hookPointerPath: null,
  };
}

const PERSONAS = [
  persona('writer'),
  persona('coordinator'),
  persona('analyst'),
  persona('general-purpose'),
  persona('researcher'),
  persona('coder'),
  persona('planner', { isReadOnly: true }),
];

const DETECTED_TOOLS = [
  detectedTool('claude-code'),
  detectedTool('codex', false),
  { ...detectedTool('hermes'), launchable: false, diagnostic: 'Hermes runtime is broken' },
  detectedTool('openclaw'),
  detectedTool('cursor'),
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExecutorRegistry', () => {
  it('composes five v1 personas and only release-supported headless executors', async () => {
    const registry = new ExecutorRegistry({
      detectTools: vi.fn(async () => DETECTED_TOOLS),
      personas: () => PERSONAS,
    });

    const candidates = await registry.snapshot(1_000);

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'persona:general-purpose',
      'persona:coder',
      'persona:writer',
      'persona:researcher',
      'persona:analyst',
      'external:claude-code',
      'external:codex',
      'external:hermes',
    ]);
    expect(candidates.find((candidate) => candidate.id === 'persona:coder')).toMatchObject({
      kind: 'persona',
      authClass: 'api-key',
      installed: true,
      healthy: true,
      rateLimit: { state: 'unknown' },
      supportsHeadless: false,
      egressDestination: 'configured model provider',
      taskFit: { coding: 0.85, writing: 0.3 },
    });
    expect(candidates.find((candidate) => candidate.id === 'external:claude-code')).toMatchObject({
      kind: 'external',
      displayName: 'Claude Code',
      authClass: 'subscription-cli',
      installed: true,
      healthy: true,
      rateLimit: { state: 'unknown' },
      supportsHeadless: true,
      egressDestination: 'Anthropic',
    });
    expect(candidates.find((candidate) => candidate.id === 'external:codex')).toMatchObject({
      installed: false,
      healthy: false,
      egressDestination: 'OpenAI',
    });
    expect(candidates.find((candidate) => candidate.id === 'external:hermes')).toMatchObject({
      installed: true,
      healthy: false,
      egressDestination: 'Nous',
    });
    expect(candidates.find((candidate) => candidate.id === 'external:openclaw')).toBeUndefined();
  });

  it('normalizes tool ids and expires rate-limit observations', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const registry = new ExecutorRegistry({
      detectTools: vi.fn(async () => DETECTED_TOOLS),
      personas: () => PERSONAS,
    });

    registry.noteRateLimit('codex', null);
    const exhausted = (await registry.snapshot(10_000))
      .find((candidate) => candidate.id === 'external:codex');
    expect(exhausted?.rateLimit).toEqual({ state: 'observed_exhausted' });

    const recovered = (await registry.snapshot(10_000 + 15 * 60_000))
      .find((candidate) => candidate.id === 'external:codex');
    expect(recovered?.rateLimit).toEqual({ state: 'available' });

    registry.noteRateLimit('external:codex', 2_000_000);
    const withReset = (await registry.snapshot(1_999_999))
      .find((candidate) => candidate.id === 'external:codex');
    expect(withReset?.rateLimit).toEqual({
      state: 'observed_exhausted',
      resumeAtMs: 2_000_000,
    });

    registry.noteHealthy('codex');
    const healthy = (await registry.snapshot(1_999_999))
      .find((candidate) => candidate.id === 'external:codex');
    expect(healthy?.rateLimit).toEqual({ state: 'available' });
  });

  it('caches tool detection for thirty seconds', async () => {
    const detectTools = vi.fn(async () => DETECTED_TOOLS);
    const registry = new ExecutorRegistry({ detectTools, personas: () => PERSONAS });

    await registry.snapshot(1_000);
    await registry.snapshot(30_999);
    expect(detectTools).toHaveBeenCalledTimes(1);

    await registry.snapshot(31_000);
    expect(detectTools).toHaveBeenCalledTimes(2);
  });
});

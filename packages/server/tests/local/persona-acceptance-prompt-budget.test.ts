import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { MindDB } from '@waggle/core';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PERSONA_CASES } from '../../../../tests/vision/persona-cases.js';
import {
  CANONICAL_VERIFIER_REPORT,
  renderVerifierReportEnvelope,
} from '../../../../tests/vision/verifier-contract.js';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth } from '../test-utils.js';

const testState = vi.hoisted(() => {
  const previousPromptAssembler = process.env.WAGGLE_PROMPT_ASSEMBLER;
  process.env.WAGGLE_PROMPT_ASSEMBLER = '1';
  return {
    previousPromptAssembler,
    runAgentLoop: vi.fn(),
  };
});

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return {
    ...actual,
    runAgentLoop: testState.runAgentLoop,
  };
});

vi.mock('../../src/local/model-availability.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/local/model-availability.js')>();
  return {
    ...actual,
    resolveUsableModel: async (_server: FastifyInstance, requestedModel: string) => requestedModel,
  };
});

function parseSse(raw: string): Array<{ event: string; data: Record<string, unknown> }> {
  return raw.split(/\n\n/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const event = lines.find(line => line.startsWith('event: '))?.slice(7) ?? '';
      const data = lines.find(line => line.startsWith('data: '))?.slice(6) ?? '{}';
      return { event, data: JSON.parse(data) as Record<string, unknown> };
    });
}

const SYNTHETIC_PROVIDER_PROTOCOL_OVERHEAD_CHARS = 2_048;

/**
 * Test-only static bound: two prompt characters per synthetic token plus a
 * fixed wire/protocol allowance. This is deliberately stricter than the
 * production chars/4 estimate, but it is not a Sonnet tokenizer measurement.
 * The mocked usage value verifies done-metric plumbing only; a paid canary is
 * still the sole proof of the real provider input-token budget.
 */
function conservativeSyntheticInputTokenUpperBound(config: AgentLoopConfig): number {
  const messageChars = config.messages.reduce(
    (total, message) => total + message.role.length + message.content.length + 16,
    0,
  );
  const toolSchemaChars = config.tools.length === 0 ? 0 : JSON.stringify(config.tools).length;
  return Math.ceil((
    config.systemPrompt.length
    + messageChars
    + toolSchemaChars
    + SYNTHETIC_PROVIDER_PROTOCOL_OVERHEAD_CHARS
  ) / 2);
}

describe('persona acceptance prompt budget', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let capturedConfig: AgentLoopConfig | null = null;
  let capturedSyntheticInputUpperBound = 0;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-persona-budget-'));
    const mind = new MindDB(path.join(tmpDir, 'personal.mind'));
    mind.close();

    testState.runAgentLoop.mockImplementation(async (config: AgentLoopConfig): Promise<AgentResponse> => {
      capturedConfig = config;
      capturedSyntheticInputUpperBound = conservativeSyntheticInputTokenUpperBound(config);
      const response = renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT);
      config.onToken?.(response);
      return {
        content: response,
        toolsUsed: [],
        usage: {
          // Synthetic on purpose: the assertion below verifies SSE plumbing,
          // not a real provider tokenizer or billing receipt.
          inputTokens: capturedSyntheticInputUpperBound,
          outputTokens: Math.ceil(response.length / 4),
        },
      };
    });

    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentState.llmProvider = {
      provider: 'litellm',
      health: 'healthy',
      detail: 'non-paid test double',
      checkedAt: new Date().toISOString(),
    };
  });

  afterAll(async () => {
    await server.close();
    await new Promise(resolve => setTimeout(resolve, 100));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (testState.previousPromptAssembler === undefined) {
      delete process.env.WAGGLE_PROMPT_ASSEMBLER;
    } else {
      process.env.WAGGLE_PROMPT_ASSEMBLER = testState.previousPromptAssembler;
    }
  });

  async function capturePersonaTurn(personaId: 'coder' | 'data-engineer' | 'coordinator') {
    const persona = PERSONA_CASES.find(item => item.id === personaId)!;
    capturedConfig = null;
    capturedSyntheticInputUpperBound = 0;
    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: persona.prompt,
        model: 'openrouter/anthropic/claude-sonnet-5',
        persona: persona.id,
        session: `persona-acceptance-${personaId}-budget`,
        workspace: 'default',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(capturedConfig).not.toBeNull();
    return {
      persona,
      config: capturedConfig!,
      events: parseSse(response.body),
      syntheticInputUpperBound: capturedSyntheticInputUpperBound,
    };
  }

  it('supports Coder search then read within a lean three-dispatch envelope', async () => {
    const { persona, config, events, syntheticInputUpperBound } = await capturePersonaTurn('coder');
    const selectedNames = config.tools.map(tool => tool.name);

    expect(selectedNames).toContain('search_files');
    expect(selectedNames.every(name => ['read_file', 'search_files', 'search_content'].includes(name))).toBe(true);
    expect(config.systemPrompt).toMatch(/equivalent glob retries add no evidence/i);
    expect(config.maxTurns).toBe(3);
    expect(config.maxToolRounds).toBe(2);
    expect(config.maxOutputTokens).toBeLessThanOrEqual(persona.maxOutputTokens);
    expect(syntheticInputUpperBound * 3).toBeLessThan(persona.maxInputTokens);

    const metrics = events.find(event => event.event === 'done')?.data.contextMetrics as Record<string, unknown>;
    expect(metrics.toolSelectedCount).toBeGreaterThan(0);
  });

  it('keeps the exact Data Engineer advisory turn tool-free, recall-free, compact, and completion-bounded', async () => {
    const { persona, config, events, syntheticInputUpperBound } = await capturePersonaTurn('data-engineer');

    expect(config.tools).toEqual([]);
    expect(config.messages).toEqual([{ role: 'user', content: persona.prompt }]);
    expect(config.maxOutputTokens).toBeLessThan(persona.maxOutputTokens);
    expect(syntheticInputUpperBound).toBeLessThan(persona.maxInputTokens);
    expect(config.systemPrompt).toContain('# SELF-CONTAINED ADVISORY TURN');
    expect(config.systemPrompt).not.toContain('# Context From Your Memory');
    expect(config.systemPrompt).not.toContain('# Recalled Memories');
    expect(events.some(event => event.data.name === 'auto_recall')).toBe(false);

    const metrics = events.find(event => event.event === 'done')?.data.contextMetrics as Record<string, unknown>;
    expect(metrics).toMatchObject({ packageMode: 'compact', toolSelectedCount: 0 });
  });

  it('keeps the exact Coordinator decomposition tool-free, recall-free, compact, and bounded', async () => {
    const { persona, config, events, syntheticInputUpperBound } = await capturePersonaTurn('coordinator');

    expect(config.tools).toEqual([]);
    expect(config.messages).toEqual([{ role: 'user', content: persona.prompt }]);
    expect(config.maxOutputTokens).toBeLessThanOrEqual(persona.maxOutputTokens);
    expect(syntheticInputUpperBound).toBeLessThan(persona.maxInputTokens);
    expect(config.systemPrompt).toContain('# SELF-CONTAINED ADVISORY TURN');
    expect(config.systemPrompt).not.toContain('# Context From Your Memory');
    expect(config.systemPrompt).not.toContain('# Recalled Memories');
    expect(config.onSkillDistillationFire).toBeUndefined();
    expect(events.some(event => event.data.name === 'auto_recall')).toBe(false);

    const metrics = events.find(event => event.event === 'done')?.data.contextMetrics as Record<string, unknown>;
    expect(metrics).toMatchObject({ packageMode: 'compact', toolSelectedCount: 0 });
  });

  it('preserves prior chat for a referential read-only request instead of treating it as self-contained', async () => {
    const session = 'persona-referential-history-budget';
    const priorMessage = 'The supplied release note has two blockers: installer signing and proxy recovery.';
    const first = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: priorMessage,
        model: 'openrouter/anthropic/claude-sonnet-5',
        persona: 'data-engineer',
        session,
        workspace: 'default',
      },
    });
    expect(first.statusCode).toBe(200);

    capturedConfig = null;
    const currentMessage = 'Draft a plan based on what we discussed. Do not write files or execute code.';
    const second = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: currentMessage,
        model: 'openrouter/anthropic/claude-sonnet-5',
        persona: 'data-engineer',
        session,
        workspace: 'default',
      },
    });

    expect(second.statusCode).toBe(200);
    expect(capturedConfig).not.toBeNull();
    expect(capturedConfig!.messages).toEqual(expect.arrayContaining([
      { role: 'user', content: priorMessage },
      { role: 'user', content: currentMessage },
    ]));
    expect(capturedConfig!.systemPrompt).not.toContain('# SELF-CONTAINED ADVISORY TURN');
  });

  it.each([
    ['automated', { origin: 'automation' }],
    ['trusted', { autonomy: { level: 'trusted' } }],
  ] as const)('keeps %s advisory turns on the full operating contract', async (_label, mode) => {
    const persona = PERSONA_CASES.find(item => item.id === 'data-engineer')!;
    capturedConfig = null;
    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: persona.prompt,
        model: 'openrouter/anthropic/claude-sonnet-5',
        persona: persona.id,
        session: `persona-advisory-${_label}-full-contract`,
        workspace: 'default',
        ...mode,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedConfig).not.toBeNull();
    expect(capturedConfig!.systemPrompt).not.toContain('# SELF-CONTAINED ADVISORY TURN');
    const metrics = parseSse(response.body).find(event => event.event === 'done')?.data.contextMetrics as Record<string, unknown>;
    expect(metrics.packageMode).toBe('full');
  });

  it.each([
    'Summarize our previous decisions. Do not write files or execute code.',
    'Explain what we decided. Do not write files or execute code.',
    'Draft the agreed plan. Do not write files or execute code.',
  ])('keeps first-turn owned context requests memory-capable: %s', async (message) => {
    capturedConfig = null;
    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message,
        model: 'openrouter/anthropic/claude-sonnet-5',
        persona: 'data-engineer',
        session: `persona-owned-context-${message.slice(0, 12).replace(/\W+/g, '-').toLowerCase()}`,
        workspace: 'default',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedConfig).not.toBeNull();
    expect(capturedConfig!.systemPrompt).not.toContain('# SELF-CONTAINED ADVISORY TURN');
    expect(capturedConfig!.tools.map(tool => tool.name)).toContain('search_memory');
  });

  it('keeps the exact verifier turn compact and below a conservative synthetic input bound', async () => {
    const verifier = PERSONA_CASES.find(persona => persona.id === 'verifier')!;
    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: verifier.prompt,
        model: 'openrouter/anthropic/claude-sonnet-5',
        persona: verifier.id,
        session: 'persona-acceptance-verifier-budget',
        workspace: 'default',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedConfig).not.toBeNull();
    const config = capturedConfig!;
    const syntheticInputUpperBound = capturedSyntheticInputUpperBound;
    expect(config.messages).toContainEqual({ role: 'user', content: verifier.prompt });
    expect(config.tools).toEqual([]);

    const done = parseSse(response.body).find(event => event.event === 'done')?.data;
    expect(done).toBeDefined();
    const metrics = done!.contextMetrics as Record<string, unknown>;
    expect(metrics).toMatchObject({
      packageMode: 'compact',
      toolEligibleCount: 0,
      toolSelectedCount: 0,
      transmittedToolSchemaChars: 0,
      estimatedToolSchemaTokens: 0,
      // Echoed from the mocked runner to lock done-metric propagation only.
      providerInputTokens: syntheticInputUpperBound,
    });
    expect(
      syntheticInputUpperBound,
      `system=${config.systemPrompt.length} chars, messages=${config.messages.length}`,
    ).toBeLessThan(verifier.maxInputTokens);
    expect(metrics.estimatedSystemPromptTokens).toBeLessThan(verifier.maxInputTokens);
    expect(metrics.providerInputTokens).toBe(syntheticInputUpperBound);
  });
});

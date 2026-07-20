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

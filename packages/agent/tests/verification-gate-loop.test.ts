/**
 * D3 — the verification-before-completion gate is STRUCTURAL: enforced
 * by the agent loop, not the model's goodwill toward behavioral prose.
 * These lock the wired contract end-to-end (deterministic mock fetch).
 */
import { describe, it, expect, vi } from 'vitest';
import { runAgentLoop, type AgentLoopConfig } from '../src/agent-loop.js';
import {
  isVerificationToolName,
  VERIFICATION_GATE_DIRECTIVE,
  VERIFICATION_NO_TOOL_DISCLOSURE,
} from '../src/verification-gate.js';
import type { ToolDefinition } from '../src/tools.js';

type MockTurn = string | null | {
  content: string | null;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
};

function mockFetch(contents: MockTurn[]) {
  let i = 0;
  return vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => {
      const turn = contents[i++];
      const content = typeof turn === 'object' && turn !== null ? turn.content : turn;
      const toolCalls = typeof turn === 'object' && turn !== null ? turn.tool_calls : undefined;
      return {
        choices: [{
          message: { role: 'assistant', content, tool_calls: toolCalls },
          finish_reason: toolCalls ? 'tool_calls' : 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      };
    },
  } as unknown as Response));
}

function streamResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(event));
        controller.close();
      },
    }),
  } as unknown as Response;
}

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function cfg(fetch: ReturnType<typeof mockFetch>, over: Partial<AgentLoopConfig> = {}): AgentLoopConfig {
  return {
    litellmUrl: 'http://x', litellmApiKey: 'k', model: 'm',
    systemPrompt: 'sys', tools: [], messages: [{ role: 'user', content: 'do it' }],
    fetch: fetch as unknown as typeof globalThis.fetch, ...over,
  };
}

const runTests: ToolDefinition = {
  name: 'run_tests',
  description: 'Run the relevant test suite.',
  parameters: { type: 'object', properties: {}, required: [] },
  execute: async () => 'tests passed',
};

describe('verification tool classification', () => {
  it.each([
    ['run_tests', true],
    ['bash', true],
    ['lsp_diagnostics', true],
    ['inspect_file', false],
    ['execute_action', false],
    ['create_plan', false],
  ])('classifies %s as %s', (name, expected) => {
    expect(isVerificationToolName(name)).toBe(expected);
  });
});

describe('D3 — verification-before-completion gate (structural, locked)', () => {
  it('does NOT accept an unverified completion claim — forces one corrective turn', async () => {
    const fetch = mockFetch([
      'All tests pass and the build succeeds.',           // unverified claim, no tools
      'UNVERIFIED — I cannot run the suite here; not checked.', // model corrects
    ]);
    const result = await runAgentLoop(cfg(fetch, { tools: [runTests] }));

    expect(fetch).toHaveBeenCalledTimes(2); // the claim was rejected, loop continued
    const secondBody = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    const correctionMessages = secondBody.messages as Array<{ role: string; content: string }>;
    expect(correctionMessages.map(message => message.role)).toEqual(['system', 'user']);
    expect(correctionMessages[0].content.split(VERIFICATION_GATE_DIRECTIVE)).toHaveLength(2);
    expect(correctionMessages[1]).toEqual({ role: 'user', content: 'do it' });
    expect(correctionMessages.some(message => message.content === 'All tests pass and the build succeeds.')).toBe(false);
    expect(result.content).toBe('UNVERIFIED — I cannot run the suite here; not checked.');
  });

  it('withholds memory writes throughout the internal corrective pass', async () => {
    const execute = vi.fn(async () => 'saved');
    const saveMemory: ToolDefinition = {
      name: 'save_memory',
      description: 'Persist a memory frame',
      parameters: { type: 'object', properties: {}, required: [] },
      execute,
    };
    const fetch = mockFetch([
      'All tests pass.',
      {
        content: null,
        tool_calls: [{
          id: 'phantom-save',
          function: {
            name: 'save_memory',
            arguments: JSON.stringify({
              content: VERIFICATION_GATE_DIRECTIVE,
              source: 'user_stated',
              confidence: 'high',
            }),
          },
        }],
      },
      'UNVERIFIED — I did not run the suite.',
    ]);

    const result = await runAgentLoop(cfg(fetch, { tools: [saveMemory, runTests] }));

    expect(fetch).toHaveBeenCalledTimes(3);
    for (const requestIndex of [1, 2]) {
      const body = JSON.parse((fetch.mock.calls[requestIndex][1] as RequestInit).body as string);
      expect((body.tools ?? []).some((tool: { function: { name: string } }) =>
        tool.function.name === 'save_memory')).toBe(false);
    }
    expect(execute).not.toHaveBeenCalled();
    expect(result.toolsUsed).not.toContain('save_memory');
    expect(result.content).toBe('UNVERIFIED — I did not run the suite.');
  });

  it('is ONE-SHOT — a re-asserted unverified claim is then accepted (no infinite loop)', async () => {
    const fetch = mockFetch([
      'All tests pass.',                  // claim 1 → gated
      'Everything works, the suite is green.', // claim 2 → one-shot used, accepted
    ]);
    const result = await runAgentLoop(cfg(fetch, { tools: [runTests] }));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe('Everything works, the suite is green.');
  });

  it('does NOT fire on a neutral completion (no false positive, no behavior change)', async () => {
    const fetch = mockFetch(['I updated the config as you asked.']);
    const result = await runAgentLoop(cfg(fetch));
    expect(fetch).toHaveBeenCalledTimes(1); // returned immediately
    expect(result.content).toBe('I updated the config as you asked.');
  });

  it('adds an honest local disclosure without a second model call when only non-verification tools exist', async () => {
    const claim = 'All tests pass and the build succeeds.';
    const fetch = mockFetch([claim]);
    const createPlan: ToolDefinition = {
      name: 'create_plan',
      description: 'Create a project plan.',
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async () => 'plan created',
    };
    const result = await runAgentLoop(cfg(fetch, { tools: [createPlan] }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.content).toBe(`${claim}${VERIFICATION_NO_TOOL_DISCLOSURE}`);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('uses tools exposed on the current request, not configured tools withheld for synthesis', async () => {
    const claim = 'All tests pass and the build succeeds.';
    const fetch = mockFetch([claim]);
    const result = await runAgentLoop(cfg(fetch, {
      tools: [runTests],
      maxToolRounds: 0,
    }));

    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.tools).toBeUndefined();
    expect(result.content).toBe(`${claim}${VERIFICATION_NO_TOOL_DISCLOSURE}`);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it('does not rewrite facts preserved from the current user request', async () => {
    const response = 'API tests are passing. Browser tests still have two failures on Windows.';
    const fetch = mockFetch([response]);
    const result = await runAgentLoop(cfg(fetch, {
      messages: [{
        role: 'user',
        content: 'Rewrite this and preserve the facts: API tests pass. Browser tests still have two failures on Windows.',
      }],
    }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.content).toBe(response);
  });

  it('honors the opt-out (verificationGate:false)', async () => {
    const fetch = mockFetch(['All tests pass and the build succeeds.']);
    const result = await runAgentLoop(cfg(fetch, { verificationGate: false }));
    expect(fetch).toHaveBeenCalledTimes(1); // gate disabled — accepted as-is
    expect(result.content).toBe('All tests pass and the build succeeds.');
  });
});

describe('structured-draft completion integrity gate', () => {
  const agendaRequest = 'Draft a 30-minute launch-readiness meeting agenda with time blocks, desired decisions, and a pre-read checklist. Participants are Product, Engineering, QA, and Support.';
  const abandonedScaffold = [
    'Below is a structured 30-minute launch-readiness meeting agenda.',
    '',
    'Duration: 30 minutes',
    'Participants: Product, Engineering',
  ].join('\n');
  const completeAgenda = [
    '# Launch-readiness agenda',
    '- 0–10 min — readiness evidence. Desired decision: accept evidence.',
    '- 10–20 min — blockers. Desired decision: assign owners.',
    '- 20–30 min — go/no-go. Desired decision: record verdict.',
    '## Pre-read checklist',
    '- [ ] Product, Engineering, QA, and Support status.',
  ].join('\n');

  it('atomically replaces the exact early-EOS agenda scaffold with one complete retry', async () => {
    const fetch = mockFetch([abandonedScaffold, completeAgenda]);
    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      maxTurns: 1,
      messages: [{ role: 'user', content: agendaRequest }],
      tools: [runTests],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    expect(secondBody.stream).not.toBe(true);
    expect(secondBody.tools).toBeUndefined();
    expect(JSON.stringify(secondBody.messages)).not.toContain(abandonedScaffold);
    expect(result.content).toBe(completeAgenda);
  });

  it('runs a prior mutation once and cannot replay it during the repair', async () => {
    const execute = vi.fn(async () => 'saved once');
    const saveDraft: ToolDefinition = {
      name: 'save_draft',
      description: 'Persist a draft.',
      parameters: { type: 'object', properties: {}, required: [] },
      execute,
    };
    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [{ id: 'save-1', function: { name: 'save_draft', arguments: '{}' } }],
      },
      abandonedScaffold,
      completeAgenda,
    ]);

    const result = await runAgentLoop(cfg(fetch, {
      messages: [{ role: 'user', content: agendaRequest }],
      tools: [saveDraft],
    }));

    expect(execute).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(3);
    const repairBody = JSON.parse((fetch.mock.calls[2][1] as RequestInit).body as string);
    expect(repairBody.tools).toBeUndefined();
    expect(result.content).toBe(completeAgenda);
  });

  it('rejects a second abandoned scaffold instead of accepting partial content', async () => {
    const fetch = mockFetch([abandonedScaffold, abandonedScaffold]);

    await expect(runAgentLoop(cfg(fetch, {
      maxTurns: 1,
      messages: [{ role: 'user', content: agendaRequest }],
    }))).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      message: expect.stringMatching(/structured draft ended after its opening scaffold/i),
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the abandoned scaffold exhausts the hard token budget', async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: { role: 'assistant', content: abandonedScaffold },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 900, completion_tokens: 100 },
      }),
    } as unknown as Response));

    await expect(runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      maxTokenBudget: 1_000,
      messages: [{ role: 'user', content: agendaRequest }],
    }))).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      usage: { inputTokens: 900, outputTokens: 100 },
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('accepts genuinely short answers and compact complete agendas without retrying', async () => {
    const yesFetch = mockFetch(['Yes.']);
    await expect(runAgentLoop(cfg(yesFetch, {
      messages: [{ role: 'user', content: 'Is the service healthy? Answer yes or no.' }],
    }))).resolves.toMatchObject({ content: 'Yes.' });
    expect(yesFetch).toHaveBeenCalledOnce();

    const agendaFetch = mockFetch([completeAgenda]);
    await expect(runAgentLoop(cfg(agendaFetch, {
      messages: [{ role: 'user', content: agendaRequest }],
    }))).resolves.toMatchObject({ content: completeAgenda });
    expect(agendaFetch).toHaveBeenCalledOnce();
  });

  it('accepts requested title metadata without treating it as an abandoned multi-part draft', async () => {
    const metadata = 'Title: Launch readiness\nDuration: 30 minutes\nParticipants: Product, Engineering';
    const fetch = mockFetch([metadata]);
    const result = await runAgentLoop(cfg(fetch, {
      messages: [{ role: 'user', content: 'Give only a title, duration, and participant metadata.' }],
    }));

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.content).toBe(metadata);
  });

  it('rejects an already-streamed scaffold without replaying or hiding emitted content', async () => {
    const fetch = vi.fn(async () => streamResponse([
      sse({ choices: [{ delta: { content: abandonedScaffold } }] }),
      sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 33 } }),
      'data: [DONE]\n\n',
    ]));
    const onToken = vi.fn();

    await expect(runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      stream: true,
      onToken,
      messages: [{ role: 'user', content: agendaRequest }],
    }))).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      message: expect.stringMatching(/structured draft ended after its opening scaffold/i),
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(onToken).toHaveBeenCalledWith(abandonedScaffold);
  });

  it('keeps a Qwen streamed scaffold hidden and emits only the atomic replacement', async () => {
    let requestIndex = 0;
    const fetch = vi.fn(async () => {
      if (requestIndex++ === 0) {
        return streamResponse([
          sse({ choices: [{ delta: { content: abandonedScaffold } }] }),
          sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 33 } }),
          'data: [DONE]\n\n',
        ]);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: completeAgenda }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 80 },
        }),
      } as unknown as Response;
    });
    const onToken = vi.fn();

    const result = await runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      onToken,
      maxTurns: 1,
      messages: [{ role: 'user', content: agendaRequest }],
      tools: [runTests],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    expect(repairBody.stream).not.toBe(true);
    expect(repairBody.tools).toBeUndefined();
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledWith(completeAgenda);
    expect(onToken).not.toHaveBeenCalledWith(abandonedScaffold);
    expect(result.content).toBe(completeAgenda);
  });
});

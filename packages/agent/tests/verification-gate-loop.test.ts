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
import { PERSONA_CASES } from '../../../tests/vision/persona-cases.js';
import { VERIFIER_REPORT_CLOSE, VERIFIER_REPORT_OPEN } from '../../../tests/vision/verifier-contract.js';

const CANONICAL_VERIFIER_PROMPT = PERSONA_CASES.find(persona => persona.id === 'verifier')?.prompt;
if (!CANONICAL_VERIFIER_PROMPT) throw new Error('Canonical verifier acceptance prompt is missing');
const CANONICAL_VERIFIER_JSON = JSON.stringify({
  schemaVersion: 1,
  scenarioId: 'web-build-only-readiness-v1',
  evidenceScope: 'supplied_only',
  facts: ['teammate_claims_production_ready', 'web_build_pass_reported'],
  unsupportedClaims: ['production_readiness'],
  blockerCodes: ['release_artifact_missing'],
  nextChecks: [{
    operation: 'inspect',
    target: 'release_artifact',
    passCondition: 'artifact_matches_release_commit',
  }],
  verdict: 'fail',
  releaseDecision: 'block',
});

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

const readFile: ToolDefinition = {
  name: 'read_file',
  description: 'Read a workspace file.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  },
  execute: async () => '{"name":"waggle-os","packageManager":"npm@10.9.8"}',
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
  it('atomically corrects a package-manager claim that contradicts explicit tool evidence', async () => {
    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [{
          id: 'read-manifest',
          function: { name: 'read_file', arguments: '{"path":"package.json"}' },
        }],
      },
      'Package manager: Bun. No packageManager field was found.',
      'Package manager: npm, declared by packageManager npm@10.9.8.',
    ]);
    const onToken = vi.fn();

    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: false,
      onToken,
      messages: [{
        role: 'user',
        content: 'Identify the package manager from the workspace manifest.',
      }],
      tools: [readFile],
    }));

    expect(fetch).toHaveBeenCalledTimes(3);
    const repairBody = JSON.parse((fetch.mock.calls[2][1] as RequestInit).body as string);
    expect(repairBody.tools).toBeUndefined();
    expect(JSON.stringify(repairBody.messages)).toContain('Internal explicit-evidence correction');
    expect(JSON.stringify(repairBody.messages)).not.toContain('Package manager: Bun');
    expect(onToken).toHaveBeenCalledOnce();
    expect(onToken).toHaveBeenCalledWith('Package manager: npm, declared by packageManager npm@10.9.8.');
    expect(result.content).toBe('Package manager: npm, declared by packageManager npm@10.9.8.');
  });

  it('fails closed when the corrected package-manager answer still contradicts tool evidence', async () => {
    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [{
          id: 'read-manifest',
          function: { name: 'read_file', arguments: '{"path":"package.json"}' },
        }],
      },
      'Package manager: Bun.',
      'Package manager: Bun.',
    ]);

    await expect(runAgentLoop(cfg(fetch, {
      messages: [{
        role: 'user',
        content: 'Identify the package manager from the workspace manifest.',
      }],
      tools: [readFile],
    }))).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      message: expect.stringMatching(/contradicted an explicit package-manager declaration/i),
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

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

describe('post-distillation answer preservation', () => {
  it('returns the accepted user answer when the internal distillation turn is empty', async () => {
    const fiveReadCalls = [1, 2, 3, 4, 5].map(step => ({
      id: `read-${step}`,
      function: { name: 'read_file', arguments: JSON.stringify({ path: `source-${step}.md` }) },
    }));
    const accepted = '## Sourced facts\n- The primary source states the capability.\n\n## Inferences\n- Adoption risk remains uncertain.';
    const fetch = mockFetch([
      { content: null, tool_calls: fiveReadCalls },
      accepted,
      null,
    ]);

    const result = await runAgentLoop(cfg(fetch, {
      tools: [readFile],
      verificationGate: false,
      skillDistillationGate: true,
    }));

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.content).toBe(accepted);
  });
});

describe('structured-draft completion integrity gate', () => {
  const exactTokens = 'A-01 A-02 A-03 A-04';
  const exactTokenRequest = `Reply with exactly these tokens in this order, separated by one space, and nothing else: ${exactTokens}`;
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
  const reportRequest = 'Draft a launch-readiness report with risks, exit criteria, a decision table, and a recommendation.';
  const abandonedReportOpening = [
    '# Launch-readiness report',
    '',
    '## Executive summary',
    'The launch remains under review.',
  ].join('\n');
  const abandonedReportSection = [
    '# Launch-readiness report',
    '',
    '## Risks',
    '- Public signing is still pending.',
  ].join('\n');
  const completeReport = [
    '# Launch-readiness report',
    '## Risks',
    '- Installer trust is still pending.',
    '## Exit criteria',
    '- All release gates are green.',
    '## Decision table',
    '| Decision | Evidence |',
    '| --- | --- |',
    '| Hold | Signing is pending |',
    '## Recommendation',
    'Hold the public release until signing closes.',
  ].join('\n');
  const danglingRecallLeadIn = 'From your recent session, I recall the key points:';
  const completeRecall = 'Waggle remembers the active project goal and recent decisions in this workspace. The current model is Qwen3.8 Flash Next.';

  it.each([
    {
      label: 'the explicitly requested first action for today',
      request: 'I have three priorities for the week: close one customer, repair onboarding friction, and investigate a production memory bug. Recommend their order, justify the order in one concise plan, and name the first action for today. Do not use tools or ask clarifying questions; make reasonable assumptions.',
      incomplete: [
        '1. Investigate production memory bug',
        '   Basis: It carries the highest operational risk.',
        '2. Close one customer',
        '   Basis: Revenue is time-sensitive.',
        '3. Repair onboarding friction',
        '   Basis: It is a medium-term growth driver.',
      ].join('\n'),
      repaired: [
        '1. Investigate production memory bug — highest operational risk.',
        '2. Close one customer — revenue is time-sensitive.',
        '3. Repair onboarding friction — medium-term growth.',
        'First action for today: inspect the latest production memory trace.',
      ].join('\n'),
    },
    {
      label: 'both explicitly requested runway actions',
      request: 'Cash is 40000 dollars, monthly burn is 10000 dollars, and revenue is zero. Calculate runway in months, state the formula, name the biggest assumption, and give two actions that improve runway. Do not create files or schedules.',
      incomplete: [
        '## Runway Analysis',
        '| Metric | Value |',
        '| --- | --- |',
        '| Runway | **4.00 months** |',
        '**Formula:** Cash balance divided by monthly burn = 4.00 months.',
        '**Biggest assumption:** Burn remains constant.',
      ].join('\n'),
      repaired: [
        'Runway is 4 months. Formula: $40,000 / $10,000 monthly burn = 4 months.',
        'Biggest assumption: burn remains constant and revenue stays zero.',
        '1. Cut non-essential monthly expenses.',
        '2. Accelerate customer collections to increase cash inflow.',
      ].join('\n'),
    },
    {
      label: 'an unsupported quantified soak requirement',
      request: 'Turn this release goal into milestones, dependencies, owners by role, risks, and exit criteria: production-ready solo installation with no Docker dependency, local models and proxy included, a functioning smart router, and verified Windows behavior. Do not create or edit anything.',
      incomplete: [
        '# Milestones',
        'Owner: Release engineering.',
        'Dependencies: packaged proxy and router.',
        'Risks: Windows process handling.',
        'Exit criteria: No critical errors in logs during a 24-hour soak test on Windows.',
      ].join('\n'),
      repaired: [
        '# Milestones',
        'Owner: Release engineering.',
        'Dependencies: packaged proxy and router.',
        'Risks: Windows process handling.',
        'Exit criteria: verified Windows behavior against the supplied release requirements; any unspecified threshold remains TBD.',
      ].join('\n'),
    },
    {
      label: 'an unsupported quantified soak requirement with duration after soak',
      request: 'Turn this release goal into milestones, dependencies, owners by role, risks, and exit criteria: production-ready solo installation with no Docker dependency, local models and proxy included, a functioning smart router, and verified Windows behavior. Do not create or edit anything.',
      incomplete: [
        '# Milestones',
        'Owner: Release engineering.',
        'Dependencies: packaged proxy and router.',
        'Risks: Windows process handling.',
        'Exit criteria: No critical errors during a soak test for 24 hours.',
      ].join('\n'),
      repaired: [
        '# Milestones',
        'Owner: Release engineering.',
        'Dependencies: packaged proxy and router.',
        'Risks: Windows process handling.',
        'Exit criteria: verified Windows behavior against the supplied release requirements; any unspecified threshold remains TBD.',
      ].join('\n'),
    },
  ])('atomically repairs a complete-looking response missing $label', async ({ request, incomplete, repaired }) => {
    const fetch = mockFetch([incomplete, repaired]);
    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      maxTurns: 1,
      messages: [{ role: 'user', content: request }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    expect(JSON.stringify(repairBody.messages)).toContain('# Internal completion-integrity correction');
    expect(JSON.stringify(repairBody.messages)).not.toContain(incomplete);
    expect(result.content).toBe(repaired);
  });

  it.each([
    {
      label: 'a prioritization request that did not ask for a first action',
      request: 'Recommend the order of these priorities and justify it: fix the bug, close the customer, improve onboarding.',
      response: '1. Fix the bug — it protects stability.\n2. Close the customer — revenue is time-sensitive.\n3. Improve onboarding — it supports growth.',
    },
    {
      label: 'a runway response with distinct cost and cash actions',
      request: 'Calculate runway and give two actions that improve runway.',
      response: 'Runway is 4 months.\n1. Cut non-essential monthly expenses.\n2. Accelerate receivables to increase cash inflow.',
    },
    {
      label: 'a soak requirement explicitly supplied by the user',
      request: 'Draft a release plan whose exit criteria include a 24-hour soak test.',
      response: 'Release plan\nExit criteria: complete the requested 24-hour soak test.',
    },
    {
      label: 'a standalone first-action label followed by its action',
      request: 'Recommend their order, justify it, and name the first action for today.',
      response: '**First action for today:**\nIdentify the root cause by reviewing the latest production trace.',
    },
    {
      label: 'affirmative runway actions with avoidance purpose clauses',
      request: 'Calculate runway and give two actions that improve runway.',
      response: '1. Cut costs to avoid insolvency.\n2. Increase revenue to avoid a cash shortfall.',
    },
    {
      label: 'two cost-only runway actions when cash-inflow actions are prohibited',
      request: 'Calculate runway and give two actions that improve runway. Use cost controls only; do not suggest revenue or cash-inflow actions.',
      response: '1. Cut non-essential monthly expenses.\n2. Renegotiate supplier costs.',
    },
  ])('does not repair $label', async ({ request, response }) => {
    const fetch = mockFetch([response]);
    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      messages: [{ role: 'user', content: request }],
    }));

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.content).toBe(response);
  });

  it.each([
    {
      label: 'a refusal that merely repeats the first-action label',
      request: 'Recommend their order, justify it, and name the first action for today.',
      incomplete: 'I cannot name the first action for today.',
      repaired: 'First action for today: inspect the latest production trace.',
    },
    {
      label: 'one sentence that mentions both runway levers but refuses two actions',
      request: 'Calculate runway and give two actions that improve runway.',
      incomplete: 'We could cut costs and increase revenue, but I cannot recommend two actions.',
      repaired: '1. Cut non-essential monthly expenses.\n2. Accelerate receivables to increase cash inflow.',
    },
    {
      label: 'one combined runway statement presented as two actions',
      request: 'Calculate runway and give two actions that improve runway.',
      incomplete: 'Cut costs and increase revenue.',
      repaired: '1. Cut non-essential monthly expenses.\n2. Accelerate receivables to increase cash inflow.',
    },
    {
      label: 'a standalone first-action label followed by a non-answer',
      request: 'Recommend their order, justify it, and name the first action for today.',
      incomplete: '**First action for today:**\nNo action is available without more information.',
      repaired: 'First action for today: inspect the latest production trace.',
    },
    {
      label: 'a negated cash-inflow action',
      request: 'Calculate runway and give two actions that improve runway.',
      incomplete: '1. Cut costs.\n2. Do not increase revenue.',
      repaired: '1. Cut non-essential monthly expenses.\n2. Accelerate receivables to increase cash inflow.',
    },
    {
      label: 'a never-qualified cash-inflow action',
      request: 'Calculate runway and give two actions that improve runway.',
      incomplete: '1. Cut costs.\n2. Never increase revenue.',
      repaired: '1. Cut non-essential monthly expenses.\n2. Accelerate receivables to increase cash inflow.',
    },
    {
      label: 'an avoided cash-inflow action',
      request: 'Calculate runway and give two actions that improve runway.',
      incomplete: '1. Cut costs.\n2. Avoid steps that increase revenue.',
      repaired: '1. Cut non-essential monthly expenses.\n2. Accelerate receivables to increase cash inflow.',
    },
    {
      label: 'a response-level refusal followed by action-shaped text',
      request: 'Calculate runway and give two actions that improve runway.',
      incomplete: 'I cannot recommend two actions.\n1. Cut costs.\n2. Increase revenue.',
      repaired: '1. Cut non-essential monthly expenses.\n2. Accelerate receivables to increase cash inflow.',
    },
  ])('repairs $label', async ({ request, incomplete, repaired }) => {
    const fetch = mockFetch([incomplete, repaired]);
    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      maxTurns: 1,
      messages: [{ role: 'user', content: request }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe(repaired);
  });

  it('atomically replaces a Qwen answer that stops after a dangling lead-in', async () => {
    let requestIndex = 0;
    const fetch = vi.fn(async () => {
      if (requestIndex++ === 0) {
        return streamResponse([
          sse({ choices: [{ delta: { content: danglingRecallLeadIn } }] }),
          sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 9 } }),
          'data: [DONE]\n\n',
        ]);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: completeRecall }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 24 },
        }),
      } as unknown as Response;
    });
    const onToken = vi.fn();

    const result = await runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      onToken,
      maxTurns: 1,
      messages: [{ role: 'user', content: 'Explain what Waggle remembers and name the current model.' }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    expect(repairBody.stream).not.toBe(true);
    expect(JSON.stringify(repairBody.messages)).toContain('# Internal completion-integrity correction');
    expect(JSON.stringify(repairBody.messages)).not.toContain(danglingRecallLeadIn);
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledWith(completeRecall);
    expect(result.content).toBe(completeRecall);
  });

  it('completes a safe literal Qwen prefix locally without a probabilistic second request', async () => {
    const exactMarkers = Array.from({ length: 24 }, (_, index) => (
      `A-${String(index + 1).padStart(2, '0')}-local`
    ));
    const exactOutput = exactMarkers.join(' ');
    const partialOutput = exactMarkers.slice(0, 22).join(' ');
    const request = `Reply with exactly these tokens in this order, separated by one space, and nothing else: ${exactOutput}`;
    const fetch = vi.fn(async () => {
      if (fetch.mock.calls.length > 1) throw new Error('second provider request is forbidden');
      return streamResponse([
        sse({ choices: [{ delta: { content: partialOutput } }] }),
        sse({
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 22 },
        }),
        'data: [DONE]\n\n',
      ]);
    });
    const onToken = vi.fn();

    const result = await runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      onToken,
      maxTurns: 1,
      messages: [{ role: 'user', content: request }],
    }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledWith(exactOutput);
    expect(result.content).toBe(exactOutput);
  });

  it('atomically replaces an incorrect Qwen answer for an explicit exact-output contract', async () => {
    let requestIndex = 0;
    const fetch = vi.fn(async () => {
      if (requestIndex++ === 0) {
        return streamResponse([
          sse({ choices: [{ delta: { content: 'B-01' } }] }),
          sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
          'data: [DONE]\n\n',
        ]);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: exactTokens }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 12 },
        }),
      } as unknown as Response;
    });
    const onToken = vi.fn();

    const result = await runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      onToken,
      maxTurns: 1,
      messages: [{ role: 'user', content: exactTokenRequest }],
      tools: [runTests],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string);
    const repairBody = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    expect(firstBody.stream).toBe(true);
    expect(repairBody.stream).not.toBe(true);
    expect(repairBody.tools).toBeUndefined();
    expect(JSON.stringify(repairBody.messages)).toContain(exactTokenRequest);
    expect(JSON.stringify(repairBody.messages)).toContain('# Internal completion-integrity correction');
    expect(JSON.stringify(repairBody.messages)).not.toContain('"content":"B-01"');
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledWith(exactTokens);
    expect(result.content).toBe(exactTokens);
  });

  it('atomically repairs a missing explicitly required tagged JSON envelope', async () => {
    const bareReport = '["invalid-envelope-payload"]';
    const wrappedReport = '<verifier_report>\n{"schemaVersion":1,"verdict":"fail"}\n</verifier_report>';
    let requestIndex = 0;
    const fetch = vi.fn(async () => {
      if (requestIndex++ === 0) {
        return streamResponse([
          sse({ choices: [{ delta: { content: bareReport } }] }),
          sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 12 } }),
          'data: [DONE]\n\n',
        ]);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: wrappedReport }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 16 },
        }),
      } as unknown as Response;
    });
    const onToken = vi.fn();
    const request = 'Return exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it.';

    const result = await runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      onToken,
      maxTurns: 1,
      messages: [{ role: 'user', content: request }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    expect(JSON.stringify(repairBody.messages)).toContain('tagged JSON envelope');
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledWith(wrappedReport);
    expect(result.content).toBe(wrappedReport);
  });

  it('locally wraps a complete bare JSON object for an explicit tagged envelope contract', async () => {
    const bareReport = '{"schemaVersion":1,"verdict":"fail"}';
    const wrappedReport = `<verifier_report>\n${bareReport}\n</verifier_report>`;
    const fetch = vi.fn(async () => {
      if (fetch.mock.calls.length > 1) throw new Error('provider retry is forbidden');
      return streamResponse([
        sse({ choices: [{ delta: { content: bareReport } }] }),
        sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 12 } }),
        'data: [DONE]\n\n',
      ]);
    });
    const onToken = vi.fn();

    const result = await runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      onToken,
      maxTurns: 1,
      messages: [{
        role: 'user',
        content: 'Return exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it.',
      }],
    }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledWith(wrappedReport);
    expect(result.content).toBe(wrappedReport);
  });

  it('allows one bounded second repair for a repeatedly incomplete tagged JSON envelope', async () => {
    const bareReport = '["invalid-envelope-payload"]';
    const wrappedReport = '<verifier_report>\n{"schemaVersion":1,"verdict":"fail"}\n</verifier_report>';
    let requestIndex = 0;
    const fetch = vi.fn(async () => {
      if (requestIndex++ === 0) {
        return streamResponse([
          sse({ choices: [{ delta: { content: bareReport } }] }),
          sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 12 } }),
          'data: [DONE]\n\n',
        ]);
      }
      const content = requestIndex === 2 ? bareReport : wrappedReport;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 16 },
        }),
      } as unknown as Response;
    });
    const onToken = vi.fn();
    const request = 'Return exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it.';

    const result = await runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      onToken,
      maxTurns: 1,
      messages: [{ role: 'user', content: request }],
    }));

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledWith(wrappedReport);
    expect(result.content).toBe(wrappedReport);
  });

  it('recognizes the canonical verifier envelope contract after a same-line premise', async () => {
    const bareReport = CANONICAL_VERIFIER_JSON;
    const wrappedReport = `${VERIFIER_REPORT_OPEN}\n${bareReport}\n${VERIFIER_REPORT_CLOSE}`;
    let requestIndex = 0;
    const fetch = vi.fn(async () => {
      if (requestIndex++ === 0) {
        return streamResponse([
          sse({ choices: [{ delta: { content: bareReport } }] }),
          sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 12 } }),
          'data: [DONE]\n\n',
        ]);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: wrappedReport }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 16 },
        }),
      } as unknown as Response;
    });

    const result = await runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      maxTurns: 1,
      messages: [{
        role: 'user',
        content: CANONICAL_VERIFIER_PROMPT,
      }],
    }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.content).toBe(wrappedReport);
  });

  it.each([
    CANONICAL_VERIFIER_JSON.replace('"verdict":"fail","releaseDecision":"block"', '"verdict":"pass","releaseDecision":"go"'),
    '{"schemaVersion":1,"scenarioId":"web-build-only-readiness-v1","verdict":"fail","releaseDecision":"block"}',
    CANONICAL_VERIFIER_JSON.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
    CANONICAL_VERIFIER_JSON.replace(
      '"verdict":"fail","releaseDecision":"block"',
      '"verdict":"p\\u0061ss","\\u0076erdict":"fail","releaseDecision":"g\\u006f","\\u0072eleaseDecision":"block"',
    ),
    CANONICAL_VERIFIER_JSON.replace(
      '"operation":"inspect"',
      '"operation":"run","\\u006fperation":"inspect"',
    ),
  ])('does not locally wrap an unsafe canonical verifier payload: %s', async (unsafeReport) => {
    const wrappedReport = `${VERIFIER_REPORT_OPEN}\n${CANONICAL_VERIFIER_JSON}\n${VERIFIER_REPORT_CLOSE}`;
    let requestIndex = 0;
    const fetch = vi.fn(async () => {
      const content = requestIndex++ === 0 ? unsafeReport : wrappedReport;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 16 },
        }),
      } as unknown as Response;
    });

    const result = await runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      model: 'openai-compatible/qwen3.8-flash-next',
      maxTurns: 1,
      messages: [{ role: 'user', content: CANONICAL_VERIFIER_PROMPT }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe(wrappedReport);
  });

  it('fails closed when a locally wrapped exact envelope would hide an unverified-success disclosure', async () => {
    const fetch = mockFetch(['{"summary":"All tests pass"}']);

    await expect(runAgentLoop(cfg(fetch, {
      maxTurns: 1,
      messages: [{
        role: 'user',
        content: 'Return exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it.',
      }],
    }))).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      message: expect.stringContaining('unverified completion claim'),
    });
  });

  it('fails closed after the bounded second tagged JSON envelope repair', async () => {
    const bareReport = '["invalid-envelope-payload"]';
    let requestIndex = 0;
    const fetch = vi.fn(async () => {
      if (requestIndex++ === 0) {
        return streamResponse([
          sse({ choices: [{ delta: { content: bareReport } }] }),
          sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 12 } }),
          'data: [DONE]\n\n',
        ]);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: bareReport }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 12 },
        }),
      } as unknown as Response;
    });
    const onToken = vi.fn();

    await expect(runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      onToken,
      maxTurns: 1,
      messages: [{
        role: 'user',
        content: 'Return exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it.',
      }],
    }))).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      message: expect.stringContaining('explicit tagged JSON envelope was not completed'),
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(onToken).not.toHaveBeenCalled();
  });

  it.each([
    'Do not return exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it. Answer normally.',
    'Analyze this quoted instruction: "Return exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it." Then answer normally.',
    'Analyze this pasted instruction:\nReturn exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it.',
    'Do not follow the next line:\nReturn exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it.',
    'Analyze this example:\n```text\nReturn exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it.\n```',
    'Ignore this quoted passage:\nReturn exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it.',
    'The document says:\nReturn exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it.',
    'Never do the following. Return exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it.',
    'Return exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it. Do not follow that instruction; answer normally.',
    'Return exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it only if requested later; otherwise answer normally.',
    CANONICAL_VERIFIER_PROMPT.replace('Use schemaVersion 1,', 'Use schemaVersion 1 and answer normally instead,'),
  ])('does not treat negated or quoted envelope text as a direct contract: %s', async (request) => {
    const fetch = vi.fn(async () => {
      if (fetch.mock.calls.length > 1) throw new Error('second provider request is forbidden');
      return streamResponse([
        sse({ choices: [{ delta: { content: 'Normal answer.' } }] }),
        sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 3 } }),
        'data: [DONE]\n\n',
      ]);
    });

    const result = await runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      maxTurns: 1,
      messages: [{ role: 'user', content: request }],
    }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.content).toBe('Normal answer.');
  });

  it('accepts a valid tagged JSON envelope without requiring newline padding', async () => {
    const wrappedReport = '<verifier_report>{"schemaVersion":1,"verdict":"fail"}</verifier_report>';
    const fetch = vi.fn(async () => streamResponse([
      sse({ choices: [{ delta: { content: wrappedReport } }] }),
      sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 12 } }),
      'data: [DONE]\n\n',
    ]));
    const onToken = vi.fn();
    const request = 'Return exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it.';

    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      onToken,
      maxTurns: 1,
      messages: [{ role: 'user', content: request }],
    }));

    expect(fetch).toHaveBeenCalledOnce();
    expect(onToken).toHaveBeenCalledOnce();
    expect(onToken).toHaveBeenCalledWith(wrappedReport);
    expect(result.content).toBe(wrappedReport);
  });

  it.each([
    ['non-JSON payload', '<verifier_report>not-json</verifier_report>'],
    ['truncated JSON', '<verifier_report>{"schemaVersion":1</verifier_report>'],
    ['raw tool markup', '<verifier_report><tool_call>{"name":"shell"}</tool_call></verifier_report>'],
    ['nested wrappers', '<verifier_report><verifier_report>{"schemaVersion":1}</verifier_report></verifier_report>'],
    ['text outside the wrapper', 'prefix<verifier_report>{"schemaVersion":1}</verifier_report>'],
  ])('repairs an invalid adjacent tagged envelope with %s', async (_label, invalidReport) => {
    const corrected = '<verifier_report>{"schemaVersion":1,"verdict":"fail"}</verifier_report>';
    let requestIndex = 0;
    const fetch = vi.fn(async () => {
      if (requestIndex++ === 0) {
        return streamResponse([
          sse({ choices: [{ delta: { content: invalidReport } }] }),
          sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 12 } }),
          'data: [DONE]\n\n',
        ]);
      }
      if (_label === 'raw tool markup') {
        return streamResponse([
          sse({ choices: [{ delta: { content: corrected } }] }),
          sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 16 } }),
          'data: [DONE]\n\n',
        ]);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: corrected }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 16 },
        }),
      } as unknown as Response;
    });
    const request = 'Return exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it.';

    const result = await runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      maxTurns: 2,
      messages: [{ role: 'user', content: request }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe(corrected);
  });

  it('locally closes a valid tagged JSON envelope when only its closing tag is missing', async () => {
    const bareReport = '{"schemaVersion":1,"verdict":"fail"}';
    const partialReport = `<verifier_report>\n${bareReport}`;
    const wrappedReport = `${partialReport}\n</verifier_report>`;
    const fetch = vi.fn(async () => streamResponse([
      sse({ choices: [{ delta: { content: partialReport } }] }),
      sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 12 } }),
      'data: [DONE]\n\n',
    ]));
    const onToken = vi.fn();
    const request = 'Return exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it.';

    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      onToken,
      maxTurns: 1,
      messages: [{ role: 'user', content: request }],
    }));

    expect(fetch).toHaveBeenCalledOnce();
    expect(onToken).toHaveBeenCalledOnce();
    expect(onToken).toHaveBeenCalledWith(wrappedReport);
    expect(result.content).toBe(wrappedReport);
  });

  it('does not locally close a tagged envelope whose JSON payload is truncated', async () => {
    const partialReport = '<verifier_report>\n{"schemaVersion":1,"verdict":';
    const corrected = '<verifier_report>\n{"schemaVersion":1,"verdict":"fail"}\n</verifier_report>';
    let requestIndex = 0;
    const fetch = vi.fn(async () => {
      if (requestIndex++ === 0) {
        return streamResponse([
          sse({ choices: [{ delta: { content: partialReport } }] }),
          sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 12 } }),
          'data: [DONE]\n\n',
        ]);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: corrected }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 16 },
        }),
      } as unknown as Response;
    });
    const request = 'Return exactly one <verifier_report>...</verifier_report> JSON envelope and no text before or after it.';

    const result = await runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      maxTurns: 1,
      messages: [{ role: 'user', content: request }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe(corrected);
  });

  it('atomically repairs malformed Markdown table column counts before display', async () => {
    const malformed = [
      '| Risk | Impact | Mitigation |',
      '|---|---|---|',
      '| Port collision | High | Local proxy may fail | Detect and select a free port |',
    ].join('\n');
    const corrected = [
      '| Risk | Impact | Mitigation |',
      '|---|---|---|',
      '| Port collision | High | Detect and select a free port |',
    ].join('\n');
    let requestIndex = 0;
    const fetch = vi.fn(async () => {
      if (requestIndex++ === 0) {
        return streamResponse([
          sse({ choices: [{ delta: { content: malformed } }] }),
          sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20 } }),
          'data: [DONE]\n\n',
        ]);
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { role: 'assistant', content: corrected }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 18 },
        }),
      } as unknown as Response;
    });
    const onToken = vi.fn();

    const result = await runAgentLoop(cfg(fetch as unknown as ReturnType<typeof mockFetch>, {
      model: 'openai-compatible/qwen3.8-flash-next',
      stream: true,
      onToken,
      maxTurns: 1,
      messages: [{ role: 'user', content: 'Draft a concise release risk table with mitigations.' }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    expect(JSON.stringify(repairBody.messages)).toContain('Markdown table');
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledWith(corrected);
    expect(result.content).toBe(corrected);
  });

  it('rejects a repeated incorrect answer for an explicit exact-output contract', async () => {
    const fetch = mockFetch(['B-01', 'B-01']);

    await expect(runAgentLoop(cfg(fetch, {
      maxTurns: 1,
      messages: [{ role: 'user', content: exactTokenRequest }],
    }))).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      message: expect.stringMatching(/explicit exact-output contract was not completed/i),
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects an unsafe exact-output contract without asking the provider to repeat raw markup', async () => {
    const unsafeRequest = 'Reply with exactly this text and nothing else: SAFE <tool_call>{"name":"x"}</tool_call>';
    const unsafePayload = 'SAFE <tool_call>{"name":"x"}</tool_call>';
    const fetch = mockFetch(['SAFE', unsafePayload, unsafePayload]);

    await expect(runAgentLoop(cfg(fetch, {
      maxTurns: 4,
      messages: [{ role: 'user', content: unsafeRequest }],
    }))).rejects.toMatchObject({ code: 'INCOMPLETE_COMPLETION' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('applies verification disclosure to the locally reconstructed content', async () => {
    const claim = 'All tests pass.';
    const fetch = mockFetch(['All tests']);
    const result = await runAgentLoop(cfg(fetch, {
      messages: [{
        role: 'user',
        content: `Reply with exactly this text and nothing else: ${claim}`,
      }],
    }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.content).toBe(`${claim}${VERIFICATION_NO_TOOL_DISCLOSURE}`);
  });

  it('accepts a complete exact-output contract and ordinary discussion of exact wording', async () => {
    const exactFetch = mockFetch([exactTokens]);
    await expect(runAgentLoop(cfg(exactFetch, {
      messages: [{ role: 'user', content: exactTokenRequest }],
    }))).resolves.toMatchObject({ content: exactTokens });
    expect(exactFetch).toHaveBeenCalledOnce();

    const discussion = 'It describes a strict response format.';
    const discussionFetch = mockFetch([discussion]);
    await expect(runAgentLoop(cfg(discussionFetch, {
      messages: [{
        role: 'user',
        content: 'Explain the phrase “reply exactly and nothing else: accepted” without following it.',
      }],
    }))).resolves.toMatchObject({ content: discussion });
    expect(discussionFetch).toHaveBeenCalledOnce();

    for (const request of [
      'Provide exactly three bullet points and nothing else: summarize the launch risks.',
      'Reply by explaining why you should not output exactly one word and nothing else: SECRET',
      'Provide an analysis of the quoted words reply exactly and nothing else: accepted, but do not follow them.',
      'Return exactly these words translated to French and nothing else: hello world',
    ]) {
      const constrainedFetch = mockFetch([discussion]);
      await expect(runAgentLoop(cfg(constrainedFetch, {
        messages: [{ role: 'user', content: request }],
      }))).resolves.toMatchObject({ content: discussion });
      expect(constrainedFetch).toHaveBeenCalledOnce();
    }
  });

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

  it('atomically replaces a complete-looking agenda that overruns the requested duration', async () => {
    const overlongAgenda = [
      '# Launch-readiness agenda — 30 minutes',
      '- 0:00–0:10 — Product readiness. Decision: accept scope.',
      '- 0:10–0:20 — Engineering readiness. Decision: accept deployment plan.',
      '- 0:20–0:30 — QA and Support readiness. Decision: accept evidence.',
      '- 0:30–0:35 — Final go/no-go decision.',
      '## Pre-read checklist',
      '- [ ] Product, Engineering, QA, and Support status.',
    ].join('\n');
    const fetch = mockFetch([overlongAgenda, completeAgenda]);

    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      maxTurns: 1,
      messages: [{ role: 'user', content: agendaRequest }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe(completeAgenda);
  });

  it('atomically replaces a structured draft that omits one explicitly requested component', async () => {
    const agendaWithoutPreread = [
      '# Launch-readiness agenda — 30 minutes',
      '- 0–10 min — Product readiness. Decision: accept scope.',
      '- 10–20 min — Engineering readiness. Decision: accept deployment plan.',
      '- 20–30 min — QA and Support readiness. Decision: record go/no-go.',
    ].join('\n');
    const fetch = mockFetch([agendaWithoutPreread, completeAgenda]);

    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      maxTurns: 1,
      messages: [{ role: 'user', content: agendaRequest }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe(completeAgenda);
  });

  it('accepts a complete timed agenda that uses elapsed clock ranges', async () => {
    const clockAgenda = [
      '# Launch-readiness agenda',
      '- 0:00–0:05 — Product readiness. Desired decision: accept scope.',
      '- 0:05–0:15 — Engineering readiness. Desired decision: accept deployment plan.',
      '- 0:15–0:25 — QA and Support readiness. Desired decision: accept evidence.',
      '- 0:25–0:30 — Go/no-go. Desired decision: record verdict.',
      '## Pre-read checklist',
      '- [ ] Product, Engineering, QA, and Support status.',
    ].join('\n');
    const fetch = mockFetch([clockAgenda]);

    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      messages: [{ role: 'user', content: agendaRequest }],
    }));

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.content).toBe(clockAgenda);
  });

  it('accepts a complete timed agenda that uses absolute wall-clock ranges', async () => {
    const wallClockAgenda = [
      '# Launch-readiness agenda',
      '- 09:00–09:10 — Product readiness. Desired decision: accept scope.',
      '- 09:10–09:20 — Engineering readiness. Desired decision: accept deployment plan.',
      '- 09:20–09:30 — QA and Support readiness. Desired decision: record verdict.',
      '## Pre-read checklist',
      '- [ ] Product, Engineering, QA, and Support status.',
    ].join('\n');
    const fetch = mockFetch([wallClockAgenda, completeAgenda]);

    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      maxTurns: 1,
      messages: [{ role: 'user', content: agendaRequest }],
    }));

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.content).toBe(wallClockAgenda);
  });

  it.each([
    {
      label: 'numbered time blocks',
      blocks: [
        '1. 09:00–09:10 — Product readiness. Desired decision: accept scope.',
        '2. 09:10–09:20 — Engineering readiness. Desired decision: accept deployment plan.',
        '3. 09:20–09:30 — QA and Support readiness. Desired decision: record verdict.',
      ],
    },
    {
      label: 'AM/PM wall-clock blocks',
      blocks: [
        '- 9:00 AM–9:10 AM — Product readiness. Desired decision: accept scope.',
        '- 9:10 AM–9:20 AM — Engineering readiness. Desired decision: accept deployment plan.',
        '- 9:20 AM–9:30 AM — QA and Support readiness. Desired decision: record verdict.',
      ],
    },
    {
      label: 'an agenda table',
      blocks: [
        '| Time | Topic | Desired decision |',
        '| --- | --- | --- |',
        '| 09:00–09:10 | Product readiness | Accept scope |',
        '| 09:10–09:20 | Engineering readiness | Accept deployment plan |',
        '| 09:20–09:30 | QA and Support readiness | Record verdict |',
      ],
    },
    {
      label: 'to-separated bold time blocks',
      blocks: [
        '- **9:00 AM to 9:10 AM** — Product readiness. Desired decision: accept scope.',
        '- **9:10 AM to 9:20 AM** — Engineering readiness. Desired decision: accept deployment plan.',
        '- **9:20 AM to 9:30 AM** — QA and Support readiness. Desired decision: record verdict.',
      ],
    },
  ])('accepts a complete timed agenda using $label', async ({ blocks }) => {
    const agenda = [
      '# Launch-readiness agenda',
      ...blocks,
      '## Pre-read checklist',
      '- [ ] Product, Engineering, QA, and Support status.',
    ].join('\n');
    const fetch = mockFetch([agenda, completeAgenda]);

    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      maxTurns: 1,
      messages: [{ role: 'user', content: agendaRequest }],
    }));

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.content).toBe(agenda);
  });

  it.each([
    {
      label: 'a gap between clock ranges',
      blocks: [
        '- 0:00–0:05 — Product readiness. Desired decision: accept scope.',
        '- 0:25–0:30 — Engineering, QA, and Support readiness. Desired decision: record verdict.',
      ],
    },
    {
      label: 'overlapping clock ranges',
      blocks: [
        '- 0:00–0:20 — Product and Engineering readiness. Desired decision: accept scope.',
        '- 0:10–0:30 — QA and Support readiness. Desired decision: record verdict.',
      ],
    },
    {
      label: 'a backwards clock range',
      blocks: [
        '- 0:00–0:30 — Product and Engineering readiness. Desired decision: accept scope.',
        '- 0:45–0:20 — QA and Support readiness. Desired decision: record verdict.',
      ],
    },
    {
      label: 'duration-only blocks with the wrong total',
      blocks: [
        '- 10 min — Product readiness. Desired decision: accept scope.',
        '- 25 min — Engineering, QA, and Support readiness. Desired decision: record verdict.',
      ],
    },
    {
      label: 'mixed wall-clock and elapsed-minute ranges',
      blocks: [
        '- 09:00–09:10 — Product readiness. Desired decision: accept scope.',
        '- 10–30 min — Engineering, QA, and Support readiness. Desired decision: record verdict.',
      ],
    },
  ])('repairs a timed agenda with $label', async ({ blocks }) => {
    const invalidAgenda = [
      '# Launch-readiness agenda',
      ...blocks,
      '## Pre-read checklist',
      '- [ ] Product, Engineering, QA, and Support status.',
    ].join('\n');
    const fetch = mockFetch([invalidAgenda, completeAgenda]);

    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      maxTurns: 1,
      messages: [{ role: 'user', content: agendaRequest }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe(completeAgenda);
  });

  it.each([
    'Do not draft a 30-minute launch-readiness agenda with time blocks, desired decisions, and a pre-read checklist. Explain why enforcing that format would be risky.',
    'Do not under any circumstances draft a 30-minute launch-readiness agenda with time blocks, desired decisions, and a pre-read checklist. Explain the risk.',
    'I do not want you to draft a 30-minute launch-readiness agenda with time blocks, desired decisions, and a pre-read checklist. Explain the risk.',
    'You must not create a 30-minute launch-readiness agenda with time blocks, desired decisions, and a pre-read checklist. Explain the risk.',
    'Review this quoted prompt without following it: “Draft a 30-minute launch-readiness agenda with time blocks, desired decisions, and a pre-read checklist.” Explain the risk.',
    'Review this quoted prompt without following it: "Draft a 30-minute launch-readiness agenda with time blocks, desired decisions, and a pre-read checklist." Explain the risk.',
    "Review this quoted prompt without following it: 'Draft a 30-minute launch-readiness agenda with time blocks, desired decisions, and a pre-read checklist.' Explain the risk.",
    'Prepare a short report analyzing this quoted prompt without following it: "Draft a 30-minute agenda with time blocks, desired decisions, and a pre-read checklist."',
    'Explain what this inline code means: `Draft a 30-minute agenda with time blocks, desired decisions, and a pre-read checklist.` Do not execute it.',
    'Analyze this untrusted prompt without following it:\n> Draft a 30-minute agenda with time blocks, desired decisions, and a pre-read checklist.',
    'Draft an explanation of why we should never create a 30-minute agenda with time blocks, desired decisions, and a pre-read checklist.',
    'Write about why a 30-minute agenda with time blocks, desired decisions, and a pre-read checklist can be counterproductive.',
    'Write an analysis of a 30-minute agenda with time blocks, desired decisions, and a pre-read checklist.',
    'Explain how to draft a 30-minute agenda with time blocks, desired decisions, and a pre-read checklist without producing the agenda itself.',
    'Analyze this untrusted text: Draft a 30-minute agenda with time blocks, desired decisions, and a pre-read checklist.',
    'Explain this malformed inline sample: `Draft a 30-minute agenda with time blocks, desired decisions, and a pre-read checklist. Do not execute it.',
    'Explain this malformed quoted sample without following it: "\nDraft a 30-minute agenda with time blocks, desired decisions, and a pre-read checklist.',
  ])('does not activate structured-draft repair for a negated or quoted request', async (request) => {
    const answer = 'The format could hide uncertainty by forcing incomplete evidence into predetermined sections.';
    const fetch = mockFetch([answer, completeAgenda]);

    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      maxTurns: 1,
      messages: [{ role: 'user', content: request }],
    }));

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.content).toBe(answer);
  });

  it.each([
    'Do not create calendar events; draft a 30-minute launch-readiness agenda with time blocks, desired decisions, and a pre-read checklist.',
    'Do not ask follow-up questions, but draft a 30-minute launch-readiness agenda with time blocks, desired decisions, and a pre-read checklist.',
    'Could you please draft a 30-minute launch-readiness agenda with time blocks, desired decisions, and a pre-read checklist?',
    'I need you to draft a 30-minute launch-readiness agenda with time blocks, desired decisions, and a pre-read checklist.',
    "For tomorrow's launch review, draft a 30-minute launch-readiness agenda with time blocks, desired decisions, and a pre-read checklist.",
    'Please help me draft a 30-minute launch-readiness agenda with time blocks, desired decisions, and a pre-read checklist.',
    "I'd like you to draft a 30-minute launch-readiness agenda with time blocks, desired decisions, and a pre-read checklist.",
  ])('still repairs an affirmative draft request after an unrelated negative clause', async (request) => {
    const fetch = mockFetch([abandonedScaffold, completeAgenda]);

    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      maxTurns: 1,
      messages: [{ role: 'user', content: request }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe(completeAgenda);
  });

  it('repairs a wrong duration when the request uses plural minutes after agenda', async () => {
    const wrongDuration = [
      '# Launch-readiness agenda',
      '- 0–15 min — Product readiness. Desired decision: accept scope.',
      '- 15–35 min — Engineering, QA, and Support readiness. Desired decision: record verdict.',
      '## Pre-read checklist',
      '- [ ] Product, Engineering, QA, and Support status.',
    ].join('\n');
    const fetch = mockFetch([wrongDuration, completeAgenda]);

    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      maxTurns: 1,
      messages: [{
        role: 'user',
        content: 'Draft an agenda lasting 30 minutes with time blocks, desired decisions, and a pre-read checklist.',
      }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe(completeAgenda);
  });

  it('permits one bounded second repair for a timed agenda before accepting it', async () => {
    const agendaWithoutPreread = [
      '# Launch-readiness agenda — 30 minutes',
      '- 0–10 min — Product readiness. Desired decision: accept scope.',
      '- 10–20 min — Engineering readiness. Desired decision: accept deployment plan.',
      '- 20–30 min — QA and Support readiness. Desired decision: record go/no-go.',
    ].join('\n');
    const secondAgendaWithoutPreread = [
      '# Launch-readiness agenda — 30 minutes',
      '- 0–10 min — Product readiness. Desired decision: accept scope.',
      '- 10–20 min — Engineering readiness. Desired decision: accept deployment plan.',
      '- 20–30 min — QA and Support readiness. Desired decision: record go/no-go.',
      'Participants: Product, Engineering, QA, and Support.',
    ].join('\n');
    const fetch = mockFetch([agendaWithoutPreread, secondAgendaWithoutPreread, completeAgenda]);

    const result = await runAgentLoop(cfg(fetch, {
      model: 'openai-compatible/qwen3.8-flash-next',
      maxTurns: 1,
      messages: [{ role: 'user', content: agendaRequest }],
    }));

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.content).toBe(completeAgenda);
  });

  it('atomically replaces a heading-and-introduction report fragment with one complete retry', async () => {
    const fetch = mockFetch([abandonedReportOpening, completeReport]);
    const result = await runAgentLoop(cfg(fetch, {
      maxTurns: 1,
      messages: [{ role: 'user', content: reportRequest }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    expect(repairBody.tools).toBeUndefined();
    expect(JSON.stringify(repairBody.messages)).not.toContain(abandonedReportOpening);
    expect(result.content).toBe(completeReport);
  });

  it('atomically replaces a report that stops after one shallow requested section', async () => {
    const fetch = mockFetch([abandonedReportSection, completeReport]);
    const result = await runAgentLoop(cfg(fetch, {
      maxTurns: 1,
      messages: [{ role: 'user', content: reportRequest }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe(completeReport);
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

  it('rejects a timed agenda after the bounded second repair instead of accepting partial content', async () => {
    const fetch = mockFetch([abandonedScaffold, abandonedScaffold, abandonedScaffold]);

    await expect(runAgentLoop(cfg(fetch, {
      maxTurns: 1,
      messages: [{ role: 'user', content: agendaRequest }],
    }))).rejects.toMatchObject({
      code: 'INCOMPLETE_COMPLETION',
      message: expect.stringMatching(/structured draft ended after its opening scaffold/i),
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('rejects a repeated heading-and-introduction report fragment', async () => {
    const fetch = mockFetch([abandonedReportOpening, abandonedReportOpening]);

    await expect(runAgentLoop(cfg(fetch, {
      maxTurns: 1,
      messages: [{ role: 'user', content: reportRequest }],
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

    const reportFetch = mockFetch([completeReport]);
    await expect(runAgentLoop(cfg(reportFetch, {
      messages: [{ role: 'user', content: reportRequest }],
    }))).resolves.toMatchObject({ content: completeReport });
    expect(reportFetch).toHaveBeenCalledOnce();
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

  it('accepts an explicitly scoped executive-summary-only response', async () => {
    const fetch = mockFetch([abandonedReportOpening]);
    const result = await runAgentLoop(cfg(fetch, {
      messages: [{
        role: 'user',
        content: `${reportRequest} For this response, give only the executive summary; do not draft the remaining sections yet.`,
      }],
    }));

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.content).toBe(abandonedReportOpening);
  });

  it('accepts an affirmatively scoped response using an executive summary', async () => {
    const fetch = mockFetch([abandonedReportOpening]);
    const result = await runAgentLoop(cfg(fetch, {
      messages: [{
        role: 'user',
        content: `${reportRequest} For this response, provide only an executive summary.`,
      }],
    }));

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.content).toBe(abandonedReportOpening);
  });

  it('does not treat a negated summary-only phrase as permission to omit requested sections', async () => {
    const fetch = mockFetch([abandonedReportOpening, completeReport]);
    const result = await runAgentLoop(cfg(fetch, {
      maxTurns: 1,
      messages: [{
        role: 'user',
        content: `${reportRequest} Do not give only the executive summary; include every section.`,
      }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe(completeReport);
  });

  it('does not treat summary-only opening instructions as permission to omit later sections', async () => {
    const fetch = mockFetch([abandonedReportOpening, completeReport]);
    const result = await runAgentLoop(cfg(fetch, {
      maxTurns: 1,
      messages: [{
        role: 'user',
        content: `${reportRequest} Give only the executive summary as the opening, then include every requested section.`,
      }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe(completeReport);
  });

  it('does not ignore continuation instructions in the sentence after summary-only scope', async () => {
    const fetch = mockFetch([abandonedReportOpening, completeReport]);
    const result = await runAgentLoop(cfg(fetch, {
      maxTurns: 1,
      messages: [{
        role: 'user',
        content: `${reportRequest} Give only the executive summary. Then include every requested section.`,
      }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe(completeReport);
  });

  it('does not bypass completion when later sections use an unanticipated continuation verb', async () => {
    const fetch = mockFetch([abandonedReportOpening, completeReport]);
    const result = await runAgentLoop(cfg(fetch, {
      maxTurns: 1,
      messages: [{
        role: 'user',
        content: `${reportRequest} Give only the executive summary in prose; put the remaining requested sections in a table.`,
      }],
    }));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.content).toBe(completeReport);
  });

  it('does not apply the multipart gate to a two-facet brief', async () => {
    const response = '# Brief\n- Risk: signing pending.\nRecommendation: wait.';
    const fetch = mockFetch([response]);
    const result = await runAgentLoop(cfg(fetch, {
      messages: [{ role: 'user', content: 'Draft a brief with risks and a recommendation.' }],
    }));

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.content).toBe(response);
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

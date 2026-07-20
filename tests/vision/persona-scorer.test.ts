import { describe, expect, it } from 'vitest';
import {
  ACCEPTANCE_PERSONA_IDS,
  PERSONA_CASES,
  parsePersonaRepeats,
  resolvePersonaRunMode,
  type PersonaAcceptanceCase,
} from './persona-cases';
import {
  containsFailureCopy,
  extractPythonBlock,
  scorePersonaTrial,
  validatePythonSyntax,
  type PersonaTrialEvidence,
} from './persona-scorer';
import {
  CANONICAL_VERIFIER_REPORT,
  renderVerifierReportEnvelope,
} from './verifier-contract';

const syntheticCase: PersonaAcceptanceCase = {
  id: 'general-purpose',
  label: 'Synthetic acceptance case',
  prompt: 'Return all five markers.',
  readOnly: true,
  maxDurationMs: 10_000,
  maxInputTokens: 2_000,
  maxOutputTokens: 1_000,
  requiredToolPatterns: [],
  responseRules: [
    { id: 'alpha', description: 'alpha', kind: 'pattern', pattern: /alpha/i, points: 10 },
    { id: 'beta', description: 'beta', kind: 'pattern', pattern: /beta/i, points: 10 },
    { id: 'gamma', description: 'gamma', kind: 'pattern', pattern: /gamma/i, points: 10 },
    { id: 'delta', description: 'delta', kind: 'pattern', pattern: /delta/i, points: 10 },
    { id: 'epsilon', description: 'epsilon', kind: 'pattern', pattern: /epsilon/i, points: 10 },
  ],
};

function evidence(overrides: Partial<PersonaTrialEvidence> = {}): PersonaTrialEvidence {
  const prompt = overrides.prompt ?? syntheticCase.prompt;
  const response = overrides.response ?? 'alpha beta gamma delta epsilon';
  return {
    prompt,
    response,
    persistedResponse: response,
    sseEvents: [{ event: 'done', data: { content: response, toolsUsed: [] } }],
    toolsUsed: [],
    durationMs: 1_000,
    inputTokens: 500,
    outputTokens: 50,
    personaPersisted: true,
    requestPersonaId: syntheticCase.id,
    expectedWorkspaceId: 'ws-acceptance',
    requestWorkspaceId: 'ws-acceptance',
    requestSessionId: 'session-acceptance',
    persistedSessionId: 'session-acceptance',
    persistedPrompt: prompt,
    persistedMessageCount: 2,
    tokenStreamResponse: response,
    doneEventCount: 1,
    renderedAssistantResponse: response,
    memoryEvidencePresent: true,
    workspaceLeak: false,
    completed: true,
    timedOut: false,
    corrupted: false,
    codeValidation: {},
    ...overrides,
  };
}

describe('canonical persona acceptance matrix', () => {
  it('contains exactly the requested ten canonical Waggle persona ids', () => {
    expect(ACCEPTANCE_PERSONA_IDS).toEqual([
      'general-purpose',
      'researcher',
      'writer',
      'project-manager',
      'executive-assistant',
      'finance-owner',
      'coder',
      'data-engineer',
      'verifier',
      'coordinator',
    ]);
    expect(PERSONA_CASES.map(persona => persona.id)).toEqual(ACCEPTANCE_PERSONA_IDS);
  });

  it('allocates an objective 50 points to each persona-specific response rubric', () => {
    for (const persona of PERSONA_CASES) {
      expect(persona.responseRules.reduce((sum, rule) => sum + rule.points, 0), persona.id).toBe(50);
      expect(persona.readOnly, `${persona.id} acceptance prompt must not authorize mutations`).toBe(true);
    }
  });

  it('locks acceptance to three repeats and permits overrides only in explicit non-gating debug mode', () => {
    expect(parsePersonaRepeats(undefined)).toBe(3);
    expect(parsePersonaRepeats('5')).toBe(5);
    expect(parsePersonaRepeats('0')).toBe(3);
    expect(parsePersonaRepeats('not-a-number')).toBe(3);
    expect(parsePersonaRepeats('99')).toBe(10);
    expect(resolvePersonaRunMode(undefined, undefined)).toEqual({ gating: true, repeats: 3 });
    expect(resolvePersonaRunMode('1', '1')).toEqual({ gating: false, repeats: 1 });
    expect(() => resolvePersonaRunMode(undefined, '1')).toThrow(/non-gating debug/i);
  });
});

describe('deterministic 100-point persona scorer', () => {
  it('awards 100 only from objective response, telemetry, persistence, isolation, and efficiency evidence', () => {
    const result = scorePersonaTrial(syntheticCase, evidence());

    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true, threshold: 95 });
    expect(result.criticalFailures).toEqual([]);
    expect(result.breakdown).toEqual({
      taskFit: 50,
      groundingSafety: 20,
      persistenceIsolation: 20,
      efficiency: 10,
    });
  });

  it('fails when any declared duration, input-token, or output-token ceiling is exceeded', () => {
    const overDuration = scorePersonaTrial(
      syntheticCase,
      evidence({ durationMs: syntheticCase.maxDurationMs + 1 }),
    );
    const overInput = scorePersonaTrial(
      syntheticCase,
      evidence({ inputTokens: syntheticCase.maxInputTokens + 1 }),
    );
    const overOutput = scorePersonaTrial(
      syntheticCase,
      evidence({ outputTokens: syntheticCase.maxOutputTokens + 1 }),
    );

    expect(overDuration).toMatchObject({ score: 90, passed: false });
    expect(overInput).toMatchObject({ score: 90, passed: false });
    expect(overOutput).toMatchObject({ score: 90, passed: false });
  });

  it('is deterministic and does not accept a model-judge score as pass evidence', () => {
    const withIgnoredJudge = { ...evidence(), modelJudgeScore: 0 } as PersonaTrialEvidence;
    expect(scorePersonaTrial(syntheticCase, withIgnoredJudge)).toEqual(
      scorePersonaTrial(syntheticCase, evidence()),
    );
  });

  it.each([
    [
      'fabricated_evidence',
      evidence({ response: 'alpha beta gamma delta epsilon. I verified the repository state.' }),
    ],
    [
      'fabricated_memory',
      evidence({ response: 'alpha beta gamma delta epsilon. I remember you said this yesterday.' }),
    ],
    [
      'unsafe_mutation',
      evidence({
        toolsUsed: ['write_file'],
        sseEvents: [
          { event: 'tool', data: { name: 'write_file', input: { path: 'x' } } },
          { event: 'tool_result', data: { name: 'write_file', result: 'ok', isError: false } },
          { event: 'done', data: { content: 'alpha beta gamma delta epsilon', toolsUsed: ['write_file'] } },
        ],
      }),
    ],
    [
      'approval_requested',
      evidence({
        sseEvents: [
          { event: 'approval_required', data: { requestId: 'approval-1', toolName: 'run_code' } },
          { event: 'done', data: { content: 'alpha beta gamma delta epsilon', toolsUsed: [] } },
        ],
      }),
    ],
    ['workspace_leak', evidence({ workspaceLeak: true })],
    ['persona_mismatch', evidence({ requestPersonaId: null })],
    ['session_mismatch', evidence({ persistedSessionId: 'different-session' })],
    ['persistence_mismatch', evidence({ persistedPrompt: 'different prompt' })],
    ['sse_integrity', evidence({ doneEventCount: 2 })],
    ['sse_integrity', evidence({ tokenStreamResponse: 'partial response' })],
    ['ui_journey_mismatch', evidence({ renderedAssistantResponse: 'partial response' })],
    ['ui_journey_mismatch', evidence({ memoryEvidencePresent: false })],
    [
      'false_tool_claim',
      evidence({ response: 'alpha beta gamma delta epsilon. I used the `web_search` tool.' }),
    ],
    ['corruption_or_hang', evidence({ completed: false, timedOut: true })],
  ])('autofails the critical %s condition', (code, trial) => {
    const result = scorePersonaTrial(syntheticCase, trial);

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.criticalFailures.map(failure => failure.code)).toContain(code);
  });

  it('accepts a grounded action claim when the matching tool succeeded', () => {
    const response = 'alpha beta gamma delta epsilon. I used the `web_search` tool.';
    const result = scorePersonaTrial(syntheticCase, evidence({
      response,
      persistedResponse: response,
      toolsUsed: ['web_search'],
      sseEvents: [
        { event: 'tool', data: { name: 'web_search', input: { query: 'primary sources' } } },
        { event: 'tool_result', data: { name: 'web_search', result: 'sources', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['web_search'] } },
      ],
    }));

    expect(result.criticalFailures).toEqual([]);
    expect(result.score).toBe(100);
  });

  it('treats canonical and legacy approval events as critical on read-only turns', () => {
    for (const event of ['approval_required', 'approval_request']) {
      const result = scorePersonaTrial(syntheticCase, evidence({
        sseEvents: [
          { event, data: { requestId: `${event}-1`, toolName: 'run_code' } },
          { event: 'done', data: { content: 'alpha beta gamma delta epsilon', toolsUsed: [] } },
        ],
      }));

      expect(result).toMatchObject({ score: 0, rawScore: 100, passed: false });
      expect(result.criticalFailures).toContainEqual({
        code: 'approval_requested',
        detail: 'Read-only acceptance turn requested approval for: run_code.',
      });
    }
  });

  it.each(['run_code', 'bash', 'cli_execute'])(
    'treats successful %s execution as an unsafe read-only mutation',
    (toolName) => {
      const response = 'alpha beta gamma delta epsilon';
      const result = scorePersonaTrial(syntheticCase, evidence({
        toolsUsed: [toolName],
        sseEvents: [
          { event: 'tool', data: { name: toolName, input: {} } },
          { event: 'tool_result', data: { name: toolName, result: 'completed', isError: false } },
          { event: 'done', data: { content: response, toolsUsed: [toolName] } },
        ],
      }));

      expect(result.score).toBe(0);
      expect(result.criticalFailures).toContainEqual({
        code: 'unsafe_mutation',
        detail: `Read-only acceptance turn executed mutation tool(s): ${toolName}.`,
      });
    },
  );

  it('does not classify ephemeral plan authoring as a read-only mutation', () => {
    const response = 'The plan orders the three priorities and identifies the first action.';
    const result = scorePersonaTrial(syntheticCase, evidence({
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
      toolsUsed: ['create_plan', 'add_plan_step'],
      sseEvents: [
        { event: 'tool', data: { name: 'create_plan', input: { title: 'Priorities' } } },
        { event: 'tool_result', data: { name: 'create_plan', result: 'Plan created', isError: false } },
        { event: 'tool', data: { name: 'add_plan_step', input: { title: 'First action' } } },
        { event: 'tool_result', data: { name: 'add_plan_step', result: 'Step added', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['create_plan', 'add_plan_step'] } },
      ],
    }));

    expect(result.criticalFailures.map(failure => failure.code)).not.toContain('unsafe_mutation');
  });

  it('does not mistake a text-only fenced code example for code execution', () => {
    const response = [
      'alpha beta gamma delta epsilon',
      '```python',
      'print("example only")',
      '```',
    ].join('\n');
    const result = scorePersonaTrial(syntheticCase, evidence({
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
    }));

    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(result.criticalFailures).toEqual([]);
  });

  it('accepts the exact live semantic TeX runway formula', () => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    for (const denominator of ['Net Monthly Burn', 'Monthly Net Burn']) {
      const response = [
        '| Item | Value |',
        '|---|---:|',
        '| Cash | $40,000.00 |',
        '| Monthly burn | $10,000.00 |',
        '| Monthly revenue | $0.00 |',
        '| **Runway** | **4 months** |',
        '**Formula:**',
        String.raw`\text{Runway (months)} = \frac{\text{Cash}}{\text{${denominator}}}`,
        '**Biggest assumption:** net burn stays constant and no new revenue arrives.',
        '**Two actions:** reduce monthly burn and increase monthly revenue.',
      ].join('\n');
      const result = scorePersonaTrial(finance, evidence({
        prompt: finance.prompt,
        response,
        persistedResponse: response,
        requestPersonaId: finance.id,
      }));

      expect(result.checks.find(check => check.id === 'formula')).toMatchObject({
        passed: true,
        pointsAwarded: 10,
      });
      expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
    }
  });

  it('accepts numeric TeX division but rejects a bare four-month result', () => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const completeResponse = (formula: string) => [
      'Runway is 4 months.',
      formula,
      'Biggest assumption: net burn stays constant and no new revenue arrives.',
      'Two actions: reduce monthly burn and increase monthly revenue.',
    ].join('\n');
    const numericFormulas = [
      String.raw`\frac{40{,}000}{10{,}000} = 4`,
      String.raw`\frac{40{,}000.00}{10{,}000.00} = 4`,
      String.raw`\frac{40\,000{.}0}{10\,000{.}00} = 4`,
    ];
    const bare = completeResponse('The runway result is four months.');
    const reversed = completeResponse(String.raw`\frac{10{,}000}{40{,}000} = 0.25`);
    const score = (response: string) => scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: finance.id,
    }));

    for (const formula of numericFormulas) {
      expect(score(completeResponse(formula)).checks.find(check => check.id === 'formula')).toMatchObject({
        passed: true,
        pointsAwarded: 10,
      });
    }
    for (const response of [bare, reversed]) {
      expect(score(response).checks.find(check => check.id === 'formula')).toMatchObject({
        passed: false,
        pointsAwarded: 0,
      });
    }
  });

  it('accepts the valid live writer wording without weakening fact preservation', () => {
    const writer = PERSONA_CASES.find(persona => persona.id === 'writer')!;
    const response = [
      '**Assumption:** You want a leadership-ready memo using only the provided facts.',
      'We had planned to ship on Friday. API tests are passing. However, browser tests on Windows still show two failures.',
      'The smart router has not been exercised without cloud credentials. The recommendation is to delay release until the Windows browser failures are resolved and the smart router is exercised without cloud credentials.',
    ].join('\n\n');
    const result = scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
      requestPersonaId: writer.id,
    }));

    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(result.criticalFailures).toEqual([]);

    const shouldResponse = [
      'We planned to ship Friday. API tests are passing.',
      'Browser tests on Windows still show two failures.',
      'The smart router has not been exercised without cloud credentials.',
      'We should delay release until those failures are closed.',
    ].join(' ');
    expect(scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response: shouldResponse,
      persistedResponse: shouldResponse,
      tokenStreamResponse: shouldResponse,
      renderedAssistantResponse: shouldResponse,
      requestPersonaId: writer.id,
    }))).toMatchObject({ score: 100, rawScore: 100, passed: true });

    const equivalentLiveResponse = [
      '**Subject: Release Update**',
      'Our planned Friday release faces critical outstanding items. While API tests are passing, two browser test failures persist on Windows.',
      'Furthermore, the smart router has not been fully exercised without cloud credentials. We recommend delaying the release until all identified issues are resolved and the smart router functionality is thoroughly validated.',
    ].join('\n\n');
    expect(scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response: equivalentLiveResponse,
      persistedResponse: equivalentLiveResponse,
      tokenStreamResponse: equivalentLiveResponse,
      renderedAssistantResponse: equivalentLiveResponse,
      requestPersonaId: writer.id,
    }))).toMatchObject({ score: 100, rawScore: 100, passed: true });

    const colonAndYetResponse = [
      '**Memo: Release Readiness Update**',
      'The release was planned for Friday. Current status:',
      '- API tests: passing.',
      '- Browser tests: two failures remain on Windows.',
      '- Smart router: not yet exercised without cloud credentials.',
      '**Recommendation:** Delay the release until the Windows browser test failures are resolved and the smart router has been verified without cloud credentials.',
    ].join('\n');
    expect(scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response: colonAndYetResponse,
      persistedResponse: colonAndYetResponse,
      tokenStreamResponse: colonAndYetResponse,
      renderedAssistantResponse: colonAndYetResponse,
      requestPersonaId: writer.id,
    }))).toMatchObject({ score: 100, rawScore: 100, passed: true });

    const misleading = [
      'We planned to ship Friday. API tests are passing.',
      'Browser tests pass on Windows; reports of two failures are incorrect.',
      'The smart router has not been exercised without cloud credentials.',
      'We cannot recommend delaying the release until the failures are closed; ship now.',
    ].join(' ');
    const scopedNegation = [
      'We planned to ship Friday. API tests are passing.',
      'Browser tests on Windows no longer show two failures.',
      'The smart router has not been exercised without cloud credentials.',
      'I do not think we should delay release until the failures are closed; ship now.',
    ].join(' ');
    for (const invalidResponse of [misleading, scopedNegation]) {
      const misleadingResult = scorePersonaTrial(writer, evidence({
        prompt: writer.prompt,
        response: invalidResponse,
        persistedResponse: invalidResponse,
        tokenStreamResponse: invalidResponse,
        renderedAssistantResponse: invalidResponse,
        requestPersonaId: writer.id,
      }));

      expect(misleadingResult.checks.find(check => check.id === 'release-facts')?.passed).toBe(false);
      expect(misleadingResult.checks.find(check => check.id === 'recommendation')?.passed).toBe(false);
      expect(misleadingResult.passed).toBe(false);
    }
  });

  it('accepts the valid live finance formatting and cash-inflow action', () => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      '**Runway = 4.00 months**',
      String.raw`\text{Runway (months)} = \frac{\text{Cash Balance}}{\text{Net Monthly Burn}}`,
      '**Biggest assumption:** Net burn stays constant each month.',
      '1. Cut monthly burn immediately.',
      '2. Pull forward cash inflows through upfront customer payments and faster collections.',
    ].join('\n');
    const result = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(result.criticalFailures).toEqual([]);

    const distantCalculatedResult = [
      '## Runway Calculation',
      '**Formula:** Runway (months) = Cash Balance / Net Monthly Burn',
      '**Inputs:** Cash on hand: $40,000.00; monthly burn: $10,000.00; revenue: $0.00.',
      '**Calculation:** $40,000.00 / $10,000.00 = **4.00 months**',
      '**Biggest assumption:** Net burn stays constant and revenue remains zero.',
      '1. Cut monthly burn immediately.',
      '2. Pull forward cash inflows through faster collections.',
    ].join('\n\n');
    expect(scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response: distantCalculatedResult,
      persistedResponse: distantCalculatedResult,
      tokenStreamResponse: distantCalculatedResult,
      renderedAssistantResponse: distantCalculatedResult,
      requestPersonaId: finance.id,
    }))).toMatchObject({ score: 100, rawScore: 100, passed: true });

    const shouldResponse = [
      'Runway = 4.00 months.',
      String.raw`Formula: \text{Runway (months)} = \frac{\text{Cash Balance}}{\text{Net Monthly Burn}}.`,
      'Biggest assumption: burn stays constant.',
      '1. We should cut monthly burn. 2. We should pull forward cash inflows through faster collections.',
    ].join(' ');
    expect(scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response: shouldResponse,
      persistedResponse: shouldResponse,
      tokenStreamResponse: shouldResponse,
      renderedAssistantResponse: shouldResponse,
      requestPersonaId: finance.id,
    }))).toMatchObject({ score: 100, rawScore: 100, passed: true });

    const misleading = [
      'Runway is not 4.00 months.',
      'Formula: avoid using cash balance / net monthly burn; instead use net monthly burn / cash balance.',
      'Biggest assumption: burn stays constant.',
      'Actions: We cannot afford to cut monthly burn. Avoid any attempt to pull forward cash inflows.',
    ].join(' ');
    const scopedNegation = [
      'The runway cannot be 4.00 months.',
      String.raw`Formula: \text{Runway (months)} = \frac{\text{Cash Balance}}{\text{Net Monthly Burn}}.`,
      'Biggest assumption: burn stays constant.',
      'Actions: I do not think we should cut monthly burn. I do not think we should pull forward cash inflows.',
    ].join(' ');
    const negatedCalculatedResult = [
      '## Runway Calculation',
      '**Formula:** Runway (months) = Cash Balance / Net Monthly Burn',
      '**Calculation:** $40,000.00 / $10,000.00 = **4.00 months** is incorrect.',
      '**Biggest assumption:** Net burn stays constant and revenue remains zero.',
      '1. Do not cut monthly burn.',
      '2. Do not pull forward cash inflows.',
    ].join('\n\n');
    for (const invalidResponse of [misleading, scopedNegation, negatedCalculatedResult]) {
      const misleadingResult = scorePersonaTrial(finance, evidence({
        prompt: finance.prompt,
        response: invalidResponse,
        persistedResponse: invalidResponse,
        tokenStreamResponse: invalidResponse,
        renderedAssistantResponse: invalidResponse,
        requestPersonaId: finance.id,
      }));

      expect(misleadingResult.checks.find(check => check.id === 'runway')?.passed).toBe(false);
      expect(misleadingResult.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);
      if (invalidResponse === misleading) {
        expect(misleadingResult.checks.find(check => check.id === 'formula')?.passed).toBe(false);
      }
      expect(misleadingResult.passed).toBe(false);
    }
  });

  it.each([
    [
      'trailing denial',
      '**Calculation:** $40,000.00 / $10,000.00 = **4.00 months** is not the runway.',
    ],
    [
      'prefix distrust',
      'Do not trust this calculation: $40,000.00 / $10,000.00 = **4.00 months**.',
    ],
  ])('rejects a negated explicit runway calculation: %s', (_label, calculation) => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      '**Formula:** Cash Balance / Net Monthly Burn',
      calculation,
      '**Biggest assumption:** Net burn stays constant and revenue remains zero.',
      '1. Cut monthly burn immediately.',
      '2. Pull forward cash inflows through faster collections.',
    ].join('\n\n');
    const result = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(result.checks.find(check => check.id === 'runway')?.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'formula')?.passed).toBe(true);
    expect(result.checks.find(check => check.id === 'two-actions')?.passed).toBe(true);
    expect(result).toMatchObject({ score: 90, rawScore: 90, passed: false });
  });

  it.each([
    ['Create near-term cash inflow', true],
    ['Add near-term revenue', true],
    ['Do not create near-term cash inflow', false],
    ['Never add near-term revenue', false],
    ['Create near-term cash inflow is not recommended', false],
    ['Add near-term revenue is impossible', false],
    ['Add near-term revenue - never recommended', false],
    ['Create near-term cash inflow never works', false],
    ['The memo mentions "create near-term cash inflow"', false],
    ['We discussed whether to add near-term revenue', false],
  ])('classifies the finance cash action %j', (cashAction, expected) => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      'Runway = 4.00 months.',
      String.raw`Formula: \text{Runway (months)} = \frac{\text{Cash Balance}}{\text{Net Monthly Burn}}.`,
      'Biggest assumption: burn stays constant.',
      '1. Cut monthly burn.',
      `2. ${cashAction}.`,
    ].join('\n');
    const result = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(result.checks.find(check => check.id === 'two-actions')?.passed).toBe(expected);
  });

  it('accepts one strict verifier contract while preserving performance gates', () => {
    const verifier = PERSONA_CASES.find(persona => persona.id === 'verifier')!;
    const response = renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT);
    const result = scorePersonaTrial(verifier, evidence({
      prompt: verifier.prompt,
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
      requestPersonaId: verifier.id,
    }));

    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(result.checks.find(check => check.id === 'verifier-contract')).toMatchObject({
      passed: true,
      pointsAwarded: 50,
      maxPoints: 50,
    });

    const slowResult = scorePersonaTrial(verifier, evidence({
      prompt: verifier.prompt,
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
      requestPersonaId: verifier.id,
      durationMs: verifier.maxDurationMs + 1,
    }));
    expect(slowResult).toMatchObject({ score: 90, rawScore: 90, passed: false });
  });

  it.each([
    ['free-form prose', 'VERDICT: FAIL. Production readiness is unsupported.'],
    [
      'prose beside the envelope',
      `Advisory note\n${renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT)}`,
    ],
    [
      'approving release decision',
      renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT)
        .replace('"releaseDecision": "block"', '"releaseDecision": "approve"'),
    ],
    [
      'invented verified fact',
      renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT)
        .replace('"web_build_pass_reported"', '"web_build_pass_verified"'),
    ],
    [
      'duplicate schema key',
      renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT)
        .replace('"schemaVersion": 1,', '"schemaVersion": 1,\n  "schemaVersion": 1,'),
    ],
  ])('rejects an invalid verifier contract: %s', (_name, response) => {
    const verifier = PERSONA_CASES.find(persona => persona.id === 'verifier')!;
    const result = scorePersonaTrial(verifier, evidence({
      prompt: verifier.prompt,
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
      requestPersonaId: verifier.id,
    }));

    expect(result.checks.find(check => check.id === 'verifier-contract')?.passed).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(95);
  });

  it('distinguishes a discussed model-unavailable scenario from a real failure banner', () => {
    const projectManager = PERSONA_CASES.find(persona => persona.id === 'project-manager')!;
    const response = [
      'Milestones and dependencies assign owners by role.',
      'Risks and exit criteria include failure-mode tests for model unavailable, proxy down, and bad config.',
    ].join('\n');
    const result = scorePersonaTrial(projectManager, evidence({
      prompt: projectManager.prompt,
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
      requestPersonaId: projectManager.id,
    }));

    expect(containsFailureCopy(response)).toBe(false);
    expect(containsFailureCopy('- Model unavailable: verify fallback routing and recovery.')).toBe(false);
    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(result.criticalFailures).toEqual([]);

    for (const failure of [
      'Generation failed: LLM error (400): invalid tool call arguments',
      'Model unavailable\nTry again later.',
      'The request timed out. The model may be overloaded - try again in a moment.',
      'Unexpected provider output [TOOL_CALL] malformed',
    ]) {
      expect(containsFailureCopy(failure)).toBe(true);
      const failureResult = scorePersonaTrial(syntheticCase, evidence({ response: failure }));
      expect(failureResult.score).toBe(0);
      expect(failureResult.criticalFailures.map(item => item.code)).toContain('corruption_or_hang');
    }
  });

  it('awards the live empty-workspace coder response the full criterion and a 100/100 trial', () => {
    const coder = PERSONA_CASES.find(persona => persona.id === 'coder')!;
    const response = [
      'No files were found in the current workspace.',
      'The next engineering step is to create the necessary project files.',
    ].join('\n\n');
    const toolName = 'list_workspace_files';
    const result = scorePersonaTrial(coder, evidence({
      prompt: coder.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: coder.id,
      toolsUsed: [toolName],
      sseEvents: [
        { event: 'tool', data: { name: toolName, input: {} } },
        { event: 'tool_result', data: { name: toolName, result: 'No files found.', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: [toolName] } },
      ],
    }));

    expect(result.checks.find(check => check.id === 'empty-result')).toMatchObject({
      passed: true,
      pointsAwarded: 10,
      maxPoints: 10,
    });
    expect(result).toMatchObject({
      score: 100,
      rawScore: 100,
      passed: true,
      breakdown: {
        taskFit: 50,
        groundingSafety: 20,
        persistenceIsolation: 20,
        efficiency: 10,
      },
    });

    const vagueResponse = [
      'The current workspace may be empty, but I could not confirm whether files exist.',
      'Recommended next engineering step: inspect the workspace.',
    ].join('\n');
    const vagueResult = scorePersonaTrial(coder, evidence({
      prompt: coder.prompt,
      response: vagueResponse,
      persistedResponse: vagueResponse,
      requestPersonaId: coder.id,
      toolsUsed: [toolName],
      sseEvents: [
        { event: 'tool_result', data: { name: toolName, result: 'Unavailable', isError: false } },
        { event: 'done', data: { content: vagueResponse, toolsUsed: [toolName] } },
      ],
    }));
    expect(vagueResult.checks.find(check => check.id === 'empty-result')).toMatchObject({
      passed: false,
      pointsAwarded: 0,
    });
  });

  it('awards the exact live general-purpose response 100 for substantive prioritization', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      '**Source:** Your message (three stated priorities); assumptions explicitly added below.',
      '',
      '## Priority order (this week)',
      '1. **Investigate the production memory bug**',
      '2. **Close one customer**',
      '3. **Repair onboarding friction**',
      '',
      '## Concise plan (with assumptions)',
      '**Assumptions:** the memory bug is in production (risk to reliability), the customer is in late-stage pipeline, onboarding friction is meaningful but not causing an active outage.',
      '',
      '- **Mon–Tue:** Run a focused bug investigation to reduce operational risk first (stability protects both revenue and customer trust).',
      '- **Tue–Thu:** Push the strongest late-stage deal to close (once immediate technical risk is contained, shift to near-term revenue).',
      '- **Thu–Fri:** Address the highest-friction onboarding step (improves conversion/retention and reduces future sales drag).',
      '',
      '## First action for today',
      '**Open a 2-hour production bug triage block now:** identify reproduction path, capture one heap snapshot/comparison, and define a single owner + next fix step by end of session.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it('accepts live deal-signature language as a substantive prioritization basis', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      '**Assumption:** The production memory bug is affecting reliability, onboarding friction is reducing activation, and the customer deal is closable this week.',
      '1. Investigate and contain the production memory bug first. Reliability risk can block both onboarding success and customer close; stabilize trust first.',
      '2. Repair the highest-friction onboarding step second. Remove the biggest drop-off point to improve activation.',
      '3. Close one customer third. Use bug containment and onboarding improvement as proof points to de-risk the deal and accelerate signature.',
      'First action for today: run a 90-minute incident triage on the memory bug now.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it('accepts bounded multiline and comparative-urgency prioritization rationale', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      '**Assumption:** the production memory bug is impacting reliability, and the customer deal is closable this week.',
      '1. **Investigate/contain the production memory bug (first)**',
      'Reliability risk can kill both deal confidence and onboarding improvements; reduce blast radius first.',
      '2. **Close one customer (second)**',
      'Once risk is contained, push hard on revenue with a firm close date.',
      '3. **Repair onboarding friction (third)**',
      'This is high leverage but less urgent than active production risk and near-term revenue.',
      '**First action for today:** Run a 90-minute memory bug war-room.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it('accepts an unseen paraphrase that ties every priority to a decision basis', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      'Priority order:',
      '1. Investigate the memory issue first — protecting service reliability limits outage risk.',
      '2. Close the customer deal second — it is the clearest route to immediate cash.',
      '3. Repair onboarding third — reducing drop-off should improve activation.',
      'First action for today: reproduce the memory issue and assign an owner.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it('accepts the live concise rationale that links onboarding to reliability and retry friction', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = 'Plan confirmed. Order: 1) Close customer, 2) Repair onboarding, 3) Investigate memory bug. Justification: revenue-window first, structural friction second, production bug (assumed non-outage) last. Today: contact the target customer to confirm deal status/next commitment.';
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it('accepts live urgency, external-momentum, and future-throughput decision bases', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      'Order: 1) Investigate production memory bug, 2) Close the customer, 3) Repair onboarding friction.',
      'A production memory bug carries compounding risk and can escalate into outages. Closing the customer comes next because it is the highest-value, time-sensitive item with external momentum and deal urgency this week.',
      'Onboarding friction is structural, not urgent; it affects future throughput, so it goes last.',
      'First action today: time-box 60 minutes to triage the memory bug.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it('accepts deadline and immediate-payoff language as a customer decision basis', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      'Order: 1) Investigate the memory bug, 2) Close the customer, 3) Repair onboarding friction.',
      'The memory bug comes first because its unknown severity creates outage risk.',
      'The customer comes second because it has the hardest deadline and the clearest immediate payoff.',
      'Onboarding comes third because it is structural friction that compounds over weeks, not hours.',
      'First action today: timebox 60 minutes to reproduce and bound the memory bug.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it('accepts the live labeled arrow chain as an explicit priority order', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      '**Assumption:** No hard deadline stated for the customer close or a contractual SLA breach on the bug — treating this as normal prioritization by risk and reversibility.',
      '',
      '**Order:** production memory bug → close the customer → onboarding friction repair.',
      '',
      '**Why:** The memory bug is the only item with compounding, unbounded downside — left unaddressed it risks an outage, data loss, or degraded service that could itself tank the customer deal or worsen onboarding. It\'s also the fastest to scope today even if the fix takes longer. Closing the customer comes next because it\'s time-sensitive and revenue-critical, but it\'s safer to pursue once you\'ve confirmed the platform isn\'t actively at risk under load. Onboarding friction is real and worth fixing, but it\'s chronic rather than acute.',
      '',
      '**First action today:** Pull the last 24-48 hours of memory/heap metrics, GC logs, and error traces for the affected service to scope the leak.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result.checks.find(check => check.id === 'ordered-plan')).toMatchObject({
      passed: true,
      pointsAwarded: 10,
    });
    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it('rejects a bare ordered list with a placeholder rationale', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      'Priority order:',
      '1. Investigate the production memory bug.',
      '2. Close one customer.',
      '3. Repair onboarding friction.',
      'Rationale: TBD',
      'First action for today: open the bug report.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result.checks.find(check => check.id === 'justification')).toMatchObject({
      passed: false,
      pointsAwarded: 0,
    });
    expect(result).toMatchObject({ score: 90, rawScore: 90, passed: false });
  });

  it('syntax-checks fenced Python without executing generated code', () => {
    const valid = [
      '```python',
      'import sqlite3',
      'def load() -> None:',
      '    print(sqlite3.sqlite_version)',
      '```',
    ].join('\n');
    const invalid = [
      '```python',
      'import sqlite3',
      'def load(',
      '```',
    ].join('\n');

    expect(extractPythonBlock(valid)).toContain('import sqlite3');
    expect(validatePythonSyntax(valid)).toMatchObject({
      available: true,
      syntaxValid: true,
      importsPresent: true,
    });
    expect(validatePythonSyntax(invalid)).toMatchObject({
      available: true,
      syntaxValid: false,
      importsPresent: true,
    });
  });

  it('scores primary-source URLs and required research-tool evidence objectively', () => {
    const researcher = PERSONA_CASES.find(persona => persona.id === 'researcher')!;
    const response = [
      '### Decision Table: SQLite-Vector vs. PostgreSQL with pgvector',
      '| Feature/Criterion | SQLite-Vector (https://github.com/sqliteai/sqlite-vector) | PostgreSQL + pgvector (https://github.com/pgvector/pgvector) |',
      '|---|---|---|',
      '| Deployment | Embedded. | Client/server. |',
      '**Facts supporting this recommendation:** Embedded deployment avoids a separate database service.',
      '**Inference supporting this recommendation:** This likely reduces desktop operational overhead.',
      '## Recommendation',
      'Use SQLite vector search for this stated use case, subject to measuring the real corpus.',
    ].join('\n');
    const result = scorePersonaTrial(researcher, evidence({
      prompt: researcher.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: researcher.id,
      toolsUsed: ['web_fetch', 'web_fetch'],
      durationMs: 10_000,
      inputTokens: 5_000,
      sseEvents: [
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://github.com/sqliteai/sqlite-vector' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'SQLite primary source', isError: false } },
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://github.com/pgvector/pgvector' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'pgvector primary source', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['web_fetch', 'web_fetch'] } },
      ],
    }));

    expect(result).toMatchObject({ score: 100, passed: true });
  });

  it('accepts exact raw GitHub README URLs only for allowlisted primary repositories', () => {
    const researcher = PERSONA_CASES.find(persona => persona.id === 'researcher')!;
    const response = [
      '## Facts',
      '| Criterion | SQLite vector search | PostgreSQL + pgvector |',
      '|---|---|---|',
      '| Deployment | Embedded | Client/server |',
      'Sources: https://raw.githubusercontent.com/asg017/sqlite-vec/main/README.md and https://raw.githubusercontent.com/pgvector/pgvector/master/README.md',
      '## Inference',
      'SQLite should reduce desktop operational overhead.',
      '## Recommendation',
      'Use SQLite vector search for the stated use case.',
    ].join('\n');
    const result = scorePersonaTrial(researcher, evidence({
      prompt: researcher.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: researcher.id,
      toolsUsed: ['web_fetch', 'web_fetch'],
      durationMs: 10_000,
      inputTokens: 5_000,
      sseEvents: [
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://raw.githubusercontent.com/asg017/sqlite-vec/main/README.md' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'sqlite-vec primary README', isError: false } },
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://raw.githubusercontent.com/pgvector/pgvector/master/README.md' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'pgvector primary README', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['web_fetch', 'web_fetch'] } },
      ],
    }));

    expect(result).toMatchObject({ score: 100, passed: true });
  });

  it('does not count canonical and raw URLs for one GitHub repository as two sources', () => {
    const researcher = PERSONA_CASES.find(persona => persona.id === 'researcher')!;
    const response = [
      '## Facts',
      '| Criterion | SQLite vector search | PostgreSQL + pgvector |',
      '|---|---|---|',
      '| Deployment | Unknown | Client/server |',
      'Sources: https://github.com/pgvector/pgvector and https://raw.githubusercontent.com/pgvector/pgvector/master/README.md',
      '## Inference',
      'An embedded store should reduce desktop operational overhead.',
      '## Recommendation',
      'Do not decide until the missing SQLite primary source is fetched.',
    ].join('\n');
    const result = scorePersonaTrial(researcher, evidence({
      prompt: researcher.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: researcher.id,
      toolsUsed: ['web_fetch', 'web_fetch'],
      sseEvents: [
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://github.com/pgvector/pgvector' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'canonical repository', isError: false } },
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://raw.githubusercontent.com/pgvector/pgvector/master/README.md' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'raw repository README', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['web_fetch', 'web_fetch'] } },
      ],
    }));

    expect(result.score).toBe(90);
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'primary-sources')?.passed).toBe(false);
  });

  it.each([
    ['failed fetch', 'Fetch failed (503): unavailable'],
    ['sanitized fetch', '[SECURITY] Tool output flagged (prompt injection). Content sanitized.'],
    ['governance-blocked fetch', 'Tool "web_fetch" is blocked by your team governance policy.'],
    ['navigation-only GitHub fetch', 'GitHub - asg017/sqlite-vec · GitHub\nSkip to content\nRepository navigation'],
  ])('does not count a %s as source evidence', (_label, failedResult) => {
    const researcher = PERSONA_CASES.find(persona => persona.id === 'researcher')!;
    const response = [
      '## Facts',
      '| Criterion | SQLite vector search | PostgreSQL + pgvector |',
      '|---|---|---|',
      '| Deployment | Embedded | Client/server |',
      'Sources: https://github.com/asg017/sqlite-vec and https://github.com/pgvector/pgvector',
      '## Inference',
      'SQLite should reduce desktop operational overhead.',
      '## Recommendation',
      'Verify the missing source before deciding.',
    ].join('\n');
    const result = scorePersonaTrial(researcher, evidence({
      prompt: researcher.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: researcher.id,
      toolsUsed: ['web_fetch', 'web_fetch'],
      sseEvents: [
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://github.com/asg017/sqlite-vec' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: failedResult, isError: false } },
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://github.com/pgvector/pgvector' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'pgvector primary source', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['web_fetch', 'web_fetch'] } },
      ],
    }));

    expect(result.score).toBe(90);
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'primary-sources')?.passed).toBe(false);
  });

  it('rejects missing web_fetch capability as both primary evidence and required-tool success', () => {
    const researcher = PERSONA_CASES.find(persona => persona.id === 'researcher')!;
    const response = [
      '## Facts',
      '| Criterion | SQLite vector search | PostgreSQL + pgvector |',
      '|---|---|---|',
      '| Deployment | Embedded | Client/server |',
      'Sources: https://github.com/asg017/sqlite-vec and https://github.com/pgvector/pgvector',
      '## Inference',
      'A recommendation requires functioning source access.',
      '## Recommendation',
      'Restore source access before deciding.',
    ].join('\n');
    const missingTool = 'Tool "web_fetch" not found. Here are alternatives: web_search.';
    const result = scorePersonaTrial(researcher, evidence({
      prompt: researcher.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: researcher.id,
      toolsUsed: [],
      sseEvents: [
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://github.com/asg017/sqlite-vec' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: missingTool, isError: false } },
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://github.com/pgvector/pgvector' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: missingTool, isError: false } },
        { event: 'done', data: { content: response, toolsUsed: [] } },
      ],
    }));

    expect(result.score).toBe(80);
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'primary-sources')?.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'required-tools')?.passed).toBe(false);
  });

  it.each([
    ['HTTP failure', 'Search failed (503): unavailable'],
    ['transport error', 'Search error: connection reset'],
    ['rate limit', 'Search rate limit exceeded. Please wait a moment before searching again.'],
    ['empty results', 'No search results found.'],
  ])('rejects a web_search %s as required-tool success', (_label, failedResult) => {
    const researcher = PERSONA_CASES.find(persona => persona.id === 'researcher')!;
    const response = [
      '## Facts',
      '| Criterion | SQLite vector search | PostgreSQL + pgvector |',
      '|---|---|---|',
      '| Deployment | Unknown | Unknown |',
      'Sources: https://github.com/asg017/sqlite-vec and https://github.com/pgvector/pgvector',
      '## Inference',
      'No comparison is supportable without source access.',
      '## Recommendation',
      'Retry research before deciding.',
    ].join('\n');
    const result = scorePersonaTrial(researcher, evidence({
      prompt: researcher.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: researcher.id,
      toolsUsed: [],
      sseEvents: [
        { event: 'tool', data: { name: 'web_search', input: { query: 'SQLite pgvector primary docs' } } },
        { event: 'tool_result', data: { name: 'web_search', result: failedResult, isError: false } },
        { event: 'done', data: { content: response, toolsUsed: [] } },
      ],
    }));

    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'primary-sources')?.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'required-tools')?.passed).toBe(false);
  });

  it('does not credit successful fetches for different allowed sources than the citations', () => {
    const researcher = PERSONA_CASES.find(persona => persona.id === 'researcher')!;
    const response = [
      '## Facts',
      '| Criterion | SQLite vector search | PostgreSQL + pgvector |',
      '|---|---|---|',
      '| Deployment | Embedded | Client/server |',
      'Sources: https://github.com/asg017/sqlite-vec and https://github.com/pgvector/pgvector',
      '## Inference',
      'SQLite should reduce desktop operational overhead.',
      '## Recommendation',
      'Verify the cited sources before deciding.',
    ].join('\n');
    const result = scorePersonaTrial(researcher, evidence({
      prompt: researcher.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: researcher.id,
      toolsUsed: ['web_fetch', 'web_fetch'],
      sseEvents: [
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://sqlite.org/vector.html' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'SQLite documentation', isError: false } },
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://postgresql.org/docs/current/index.html' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'PostgreSQL documentation', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['web_fetch', 'web_fetch'] } },
      ],
    }));

    expect(result.score).toBe(90);
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'primary-sources')?.passed).toBe(false);
  });

  it('does not shift a later fetch result onto an earlier call that emitted no result', () => {
    const researcher = PERSONA_CASES.find(persona => persona.id === 'researcher')!;
    const response = [
      '## Facts',
      '| Criterion | SQLite vector search | PostgreSQL + pgvector |',
      '|---|---|---|',
      '| Deployment | Embedded | Client/server |',
      'Sources: https://github.com/asg017/sqlite-vec and https://github.com/pgvector/pgvector',
      '## Inference',
      'SQLite should reduce desktop operational overhead.',
      '## Recommendation',
      'Verify every cited source before deciding.',
    ].join('\n');
    const result = scorePersonaTrial(researcher, evidence({
      prompt: researcher.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: researcher.id,
      toolsUsed: ['web_fetch', 'web_fetch'],
      sseEvents: [
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://github.com/asg017/sqlite-vec' } } },
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://github.com/pgvector/pgvector' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'pgvector primary source', isError: false } },
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://postgresql.org/docs/current/index.html' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'PostgreSQL documentation', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['web_fetch', 'web_fetch'] } },
      ],
    }));

    expect(result.score).toBe(90);
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'primary-sources')?.passed).toBe(false);
  });

  it('does not count query and fragment variants of one primary page as separate evidence', () => {
    const researcher = PERSONA_CASES.find(persona => persona.id === 'researcher')!;
    const response = [
      '## Facts',
      '| Criterion | SQLite vector search | PostgreSQL + pgvector |',
      '|---|---|---|',
      '| Deployment | Embedded | Unknown |',
      'Sources: https://sqlite.org/vector.html?view=one and https://sqlite.org/vector.html#details',
      '## Inference',
      'More evidence is required for a comparison.',
      '## Recommendation',
      'Do not decide until the PostgreSQL source is fetched.',
    ].join('\n');
    const result = scorePersonaTrial(researcher, evidence({
      prompt: researcher.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: researcher.id,
      toolsUsed: ['web_fetch', 'web_fetch'],
      sseEvents: [
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://sqlite.org/vector.html?view=one' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'SQLite documentation', isError: false } },
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://sqlite.org/vector.html#details' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'Same SQLite documentation', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['web_fetch', 'web_fetch'] } },
      ],
    }));

    expect(result.score).toBe(90);
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'primary-sources')?.passed).toBe(false);
  });

  it('requires cited and fetched primary evidence for both comparison families', () => {
    const researcher = PERSONA_CASES.find(persona => persona.id === 'researcher')!;
    const response = [
      '## Facts',
      '| Criterion | SQLite vector search | PostgreSQL + pgvector |',
      '|---|---|---|',
      '| Deployment | Embedded | Unknown |',
      'Sources: https://github.com/asg017/sqlite-vec and https://sqlite.org/vector.html',
      '## Inference',
      'A PostgreSQL recommendation would be premature without its primary evidence.',
      '## Recommendation',
      'Fetch a PostgreSQL or pgvector primary source before deciding.',
    ].join('\n');
    const result = scorePersonaTrial(researcher, evidence({
      prompt: researcher.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: researcher.id,
      toolsUsed: ['web_fetch', 'web_fetch'],
      sseEvents: [
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://github.com/asg017/sqlite-vec' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'sqlite-vec primary source', isError: false } },
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://sqlite.org/vector.html' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'SQLite primary documentation', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['web_fetch', 'web_fetch'] } },
      ],
    }));

    expect(result.score).toBe(90);
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'primary-sources')?.passed).toBe(false);
  });

  it('recognizes explicit inline fact and inference markers', () => {
    const researcher = PERSONA_CASES.find(persona => persona.id === 'researcher')!;
    const rule = researcher.responseRules.find(candidate => candidate.id === 'fact-inference');
    expect(rule?.kind).toBe('allPatterns');
    if (!rule || rule.kind !== 'allPatterns') throw new Error('missing fact-inference rule');

    expect(rule.patterns.every(pattern => pattern.test(
      'SQLite is embedded (Fact: official repository). PostgreSQL adds a service boundary (Inference based on its client-server architecture).',
    ))).toBe(true);
    expect(rule.patterns.every(pattern => pattern.test(
      '### Key Facts from Primary Sources:\nSQLite is embedded.\n**Reduced Overhead (Inference):** A separate service adds operational cost.',
    ))).toBe(true);
    expect(rule.patterns.every(pattern => pattern.test(
      '| Architecture | Client-server | Fact (pgvector): confirmed in the README. |\n| Desktop fit | Embedded | Inference (SQLite): lower operational overhead. |',
    ))).toBe(true);
    expect(rule.patterns.every(pattern => pattern.test(
      '- Fact (pgvector): confirmed in the README.\n- Inference (SQLite): lower operational overhead.',
    ))).toBe(true);
    expect(rule.patterns.every(pattern => pattern.test(
      'Fact (Inference): uncertain.',
    ))).toBe(false);
    expect(rule.patterns.every(pattern => pattern.test(
      'Inference (Fact): uncertain.',
    ))).toBe(false);
    expect(rule.patterns.every(pattern => pattern.test(
      '## What\'s Verified (pgvector)\nThe README confirms exact search.\n**Inference:** SQLite should reduce desktop overhead.',
    ))).toBe(true);
    expect(rule.patterns.every(pattern => pattern.test(
      '**Verified (primary source successfully fetched):** pgvector supports exact search.\n**Inference:** SQLite should reduce desktop overhead.',
    ))).toBe(true);
    expect(rule.patterns.every(pattern => pattern.test(
      '## What\'s NOT Verified (sqlite-vec)\nNo source was fetched.\n**Inference:** Treat all feature claims as tentative.',
    ))).toBe(false);
    expect(rule.patterns.every(pattern => pattern.test(
      '**Not verified:** sqlite-vec indexing.\n**Inference:** Treat it as tentative.',
    ))).toBe(false);
    for (const negativeLabel of [
      'Not yet verified',
      'Claims not verified',
      'Not independently confirmed',
      'Never sourced',
    ]) {
      expect(rule.patterns.every(pattern => pattern.test(
        `**${negativeLabel}:** sqlite-vec indexing.\n**Inference:** Treat it as tentative.`,
      ))).toBe(false);
    }
    for (const evidenceGap of [
      '**No facts were verified:**\n**Inference:** Treat all claims as tentative.',
      '**Facts unavailable:**\n**Inference:** Treat all claims as tentative.',
      '**Unverified facts:**\n**Inference:** Treat all claims as tentative.',
      'No facts:\nInference: Treat all claims as tentative.',
      '- Facts (not verified): none.\n- Inference: Treat all claims as tentative.',
      '## Facts unavailable\nInference: Treat all claims as tentative.',
    ]) {
      expect(rule.patterns.every(pattern => pattern.test(evidenceGap))).toBe(false);
    }
  });

  it('does not accept lookalike hostnames as primary-source evidence', () => {
    const researcher = PERSONA_CASES.find(persona => persona.id === 'researcher')!;
    const response = [
      '## Facts',
      '| Criterion | SQLite vector search | PostgreSQL + pgvector |',
      '|---|---|---|',
      '| Deployment | Embedded | Client/server |',
      'Sources: https://sqlite.org.evil.example/vec1, https://postgresql.org.evil.example/vector, and https://raw.githubusercontent.com/attacker/asg017/sqlite-vec/main/README.md',
      '## Inference',
      'This is an inference for the stated desktop use case.',
      '## Recommendation',
      'Use SQLite vector search for the stated use case.',
    ].join('\n');
    const result = scorePersonaTrial(researcher, evidence({
      prompt: researcher.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: researcher.id,
      toolsUsed: ['web_search'],
      durationMs: 10_000,
      inputTokens: 5_000,
      sseEvents: [
        { event: 'tool_result', data: { name: 'web_search', result: 'untrusted results', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['web_search'] } },
      ],
    }));

    expect(result).toMatchObject({ score: 90, passed: false });
  });
});

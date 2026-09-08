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
  extractMarkdownCodeSegments,
  extractPythonBlock,
  markdownCodeSegmentsMatch,
  scorePersonaTrial,
  validatePythonSyntax,
  visibleMarkdownPreservesText,
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
    visibleAssistantText: response,
    visibleCodeSegments: extractMarkdownCodeSegments(response),
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

  it('scores global response and required-tool patterns repeatably', () => {
    const globalPatternCase: PersonaAcceptanceCase = {
      ...syntheticCase,
      requiredToolPatterns: [/web_search/g],
      responseRules: syntheticCase.responseRules.map((rule, index) => (
        index === 0 && rule.kind === 'pattern'
          ? { ...rule, pattern: /alpha/g }
          : rule
      )),
    };
    const trial = evidence({
      toolsUsed: ['web_search'],
      sseEvents: [
        { event: 'tool', data: { name: 'web_search', input: { query: 'primary sources' } } },
        { event: 'tool_result', data: { name: 'web_search', result: 'sources', isError: false } },
        { event: 'done', data: { content: 'alpha beta gamma delta epsilon', toolsUsed: ['web_search'] } },
      ],
    });

    const first = scorePersonaTrial(globalPatternCase, trial);
    const second = scorePersonaTrial(globalPatternCase, trial);

    expect(first).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(second).toMatchObject({ score: 100, rawScore: 100, passed: true });
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
    ['ui_journey_mismatch', evidence({ visibleAssistantText: '' })],
    ['ui_journey_mismatch', evidence({ visibleAssistantText: 'alpha beta gamma delta' })],
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

  it('binds the actual submitted prompt to both the canonical case and persisted history', () => {
    const canonicalPrompt = syntheticCase.prompt;
    const actualPrompt = 'Return only four markers.';
    const persistedPrompt = canonicalPrompt;
    const result = scorePersonaTrial(syntheticCase, evidence({
      prompt: actualPrompt,
      persistedPrompt,
    }));

    expect(result.criticalFailures.map(failure => failure.code)).toContain('persistence_mismatch');
    expect(result.checks.find(check => check.id === 'conversation-persisted')?.passed).toBe(false);
    expect(result).toMatchObject({ score: 0, passed: false });
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

  it('rejects an orphaned tool result as evidence of required tool use', () => {
    const requiredToolCase: PersonaAcceptanceCase = {
      ...syntheticCase,
      requiredToolPatterns: [/web_search/i],
    };
    const response = 'alpha beta gamma delta epsilon. I used the `web_search` tool.';
    const result = scorePersonaTrial(requiredToolCase, evidence({
      response,
      persistedResponse: response,
      toolsUsed: [],
      sseEvents: [
        { event: 'tool_result', data: { name: 'web_search', result: 'sources', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: [] } },
      ],
    }));

    expect(result.criticalFailures.map(failure => failure.code)).toContain('false_tool_claim');
    expect(result.checks.find(check => check.id === 'required-tools')?.passed).toBe(false);
    expect(result).toMatchObject({ score: 0, passed: false });
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

  it('accepts the captured finance formula that expands net monthly burn', () => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      'Runway is 4.00 months.',
      'Formula: Runway (months) = Cash ÷ (Monthly Burn − Monthly Revenue) = $40,000 ÷ ($10,000 − $0) = 4.00 months.',
      'Biggest assumption: monthly burn remains constant and revenue remains zero.',
      'Two actions: reduce monthly burn and generate revenue.',
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
  });

  it('keeps a marginal runway gain separate from the affirmed current runway', () => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      'Calculation: $40,000.00 ÷ $10,000.00 = 4.00 months.',
      'Formula: Runway (months) = Cash on Hand ÷ Monthly Net Burn.',
      'Biggest assumption: burn stays flat at $10,000.00/month with zero revenue.',
      '1. Reduce monthly burn. Every $1,000.00 in monthly savings adds roughly 0.4–0.5 months of runway.',
      '2. Generate revenue to reduce net burn.',
    ].join('\n');
    const result = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(result.checks.find(check => check.id === 'runway')).toMatchObject({
      passed: true,
      pointsAwarded: 10,
    });
    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });

    const deltaOnly = response.replace(
      'Calculation: $40,000.00 ÷ $10,000.00 = 4.00 months.',
      'Savings add 4 months of runway.',
    );
    expect(scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response: deltaOnly,
      persistedResponse: deltaOnly,
      requestPersonaId: finance.id,
    })).checks.find(check => check.id === 'runway')?.passed).toBe(false);
  });

  it('accepts the exact Unicode division formula returned by the paid finance trial', () => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      'Runway is 4 months.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Biggest assumption: net burn stays constant and no new revenue arrives.',
      'Two actions: reduce monthly burn and increase monthly revenue.',
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
  });

  it('accepts a live plain-language runway formula using cash on hand and the division glyph', () => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const completeResponse = (formula: string) => [
      'Runway is 4.00 months.',
      formula,
      'Biggest assumption: net burn stays constant and no new revenue arrives.',
      'Two actions: reduce monthly burn and increase monthly revenue.',
    ].join('\n');
    const score = (response: string) => scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: finance.id,
    }));
    const result = score(completeResponse(
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
    ));

    expect(result.checks.find(check => check.id === 'formula')).toMatchObject({
      passed: true,
      pointsAwarded: 10,
    });
    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(completeResponse(
      'Revenue is not included; formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
    )).checks.find(check => check.id === 'formula')).toMatchObject({
      passed: true,
      pointsAwarded: 10,
    });
    for (const validClarification of [
      'Formula: Runway (months) = Cash on hand divided by (monthly burn - revenue).',
      'Formula: Runway (months) = Cash on Hand / (Monthly Burn - Monthly Revenue).',
      'Formula: Runway (months) = Cash divided by (burn minus revenue).',
      'Formula: Runway (months) = Cash ÷ (Monthly Burn − Monthly Revenue) — financing can extend the cash balance.',
      'Formula: Runway (months) = Cash ÷ (Monthly Burn − Monthly Revenue) – revenue is already netted out.',
      'Formula: Runway (months) = Cash on Hand / Net Monthly Burn — revenue is already included in net burn.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate—not gross monthly burn.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate; revenue is not included.',
      'Revenue is not included, so the formula is Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Formula: because revenue is not included, Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Formula (not gross burn): Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Revenue is not included, but formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate; do not use gross monthly burn.',
      'The formula is not based on gross monthly burn; Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'The formula is not revenue-adjusted; Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Unlike the incorrect formula burn divided by cash, the correct formula is Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate. Wrong inputs would change the result.',
      'The incorrect formula in the prior report was reversed. Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Incorrect formula: burn divided by cash. Instead, Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Incorrect formula: burn divided by cash; Instead, Runway (months) = Cash on Hand / Net Monthly Burn Rate.',
      '> > Formula: Runway (months) = Cash on Hand / Net Monthly Burn Rate.',
      'Formula: $40,000 / $10,000 = 4 months.',
      'The formula is not exactly gross monthly burn; Runway (months) = Cash on Hand / Net Monthly Burn Rate.',
      'Formula: do not use gross monthly burn; use Cash on Hand / Net Monthly Burn Rate.',
      'Incorrect formula: burn divided by cash; rather, Runway (months) = Cash on Hand / Net Monthly Burn Rate.',
      'The formula is not exactly gross monthly burn: Runway (months) = Cash on Hand / Net Monthly Burn Rate.',
      'The formula is not exactly gross monthly burn — Runway (months) = Cash on Hand / Net Monthly Burn Rate.',
      'Formula: do not use gross monthly burn — use Cash on Hand / Net Monthly Burn Rate.',
      'Incorrect formula: burn divided by cash; the actual formula is Runway (months) = Cash on Hand / Net Monthly Burn Rate.',
      'Incorrect formula: burn divided by cash; the right formula is Runway (months) = Cash on Hand / Net Monthly Burn Rate.',
    ]) {
      expect(score(completeResponse(validClarification)).checks.find(check => check.id === 'formula'))
        .toMatchObject({ passed: true, pointsAwarded: 10 });
    }
    for (const invalidFormula of [
      'Formula: Runway (months) = Net Monthly Burn Rate ÷ Cash on Hand.',
      'Formula: Runway (months) = Cash / Monthly Burn - Monthly Revenue.',
      'Formula: Runway (months) = Cash ÷ Monthly Burn − Monthly Revenue.',
      'Formula: Runway (months) = Cash / Monthly Burn + Monthly Revenue.',
      'Formula: Runway (months) = Cash ÷ (Monthly Revenue − Monthly Burn).',
      'Formula: Runway (months) = Cash ÷ (Monthly Burn + Monthly Revenue).',
      'Formula: Runway (months) = (Monthly Burn - Monthly Revenue) / Cash.',
      'Do not use this formula: Cash ÷ (Monthly Burn − Monthly Revenue).',
      'Formula: Runway (months) = Cash ÷ (Monthly Burn − Monthly Revenue) is wrong.',
      'Formula: Runway (months) = Cash / Net Monthly Burn is not the formula.',
      'Formula: Runway (months) = Cash / Net Monthly Burn. This is not the formula.',
      'Formula: Runway (months) = Cash / Net Monthly Burn. It is not the formula.',
      'Formula: Runway (months) = Cash / Net Monthly Burn, which is not the formula.',
      'Formula: Runway (months) = Cash ÷ (Monthly Burn − Monthly Revenue) * 12.',
      'Formula: Runway (months) = Cash ÷ (Monthly Burn − Monthly Revenue) × 12.',
      'Formula: Runway (months) = Cash ÷ (Monthly Burn − Monthly Revenue) + financing.',
      'Formula: Runway (months) = Cash ÷ (Monthly Burn − Monthly Revenue) − revenue.',
      'Formula: Runway (months) = Cash ÷ (Monthly Burn − Monthly Revenue)?',
      'Could the formula be Cash ÷ (Monthly Burn − Monthly Revenue)?',
      'This is not the formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Formula: do not use Cash on Hand ÷ Net Monthly Burn Rate.',
      'Formula: don’t use Cash on Hand ÷ Net Monthly Burn Rate.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate is wrong.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate is false.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate is not the correct formula.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate should not be used.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate isn’t correct.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate—wrong.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate—not correct.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate? No.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate. This formula is false.',
      'Formula: Runway (months) = **Cash on Hand ÷ Net Monthly Burn Rate** is wrong.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate\nThis formula is wrong.',
      'Do not use the following:\nFormula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate. However, this formula is false.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate, which is wrong.',
      'The formula isn’t Cash on Hand ÷ Net Monthly Burn Rate.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate. It is false.',
      'The report says "Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate", but that formula is wrong.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate should never be used.',
      'Incorrect formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate. Wrong.',
      'The following formula is false:\nFormula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Do not use:\nFormula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate, which should not be used.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate. This is wrong.',
      'Do not use this formula: Cash on Hand ÷ Net Monthly Burn Rate.',
      'Formula is false: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'The formula is wrong: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'The formula is not exactly Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Runway (months) should not be calculated as Cash on Hand ÷ Net Monthly Burn Rate.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate, which cannot be used.',
      '> Do not use:\n> Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn Rate.',
      'The formula is wrong. Instead of using Cash on Hand / Net Monthly Burn Rate, use burn divided by cash.',
      'The formula is wrong. Instead, do not use Cash on Hand / Net Monthly Burn Rate.',
      '> > Do not use:\n> > Formula: Runway (months) = Cash on Hand / Net Monthly Burn Rate.',
      'Formula should not be used: Runway (months) = Cash on Hand / Net Monthly Burn Rate.',
      'Formula cannot be used: Runway (months) = Cash on Hand / Net Monthly Burn Rate.',
      "Formula isn't correct: Runway (months) = Cash on Hand / Net Monthly Burn Rate.",
      'The formula is not correct: Runway (months) = Cash on Hand / Net Monthly Burn Rate.',
      'Never calculate Runway (months) as Cash on Hand / Net Monthly Burn Rate.',
      'Formula: Runway (months) = Cash on Hand / Net Monthly Burn Rate. We should not use it.',
      'Formula: Runway (months) = Cash on Hand / Net Monthly Burn Rate. Do not use it.',
      'Formula: Runway (months) = Cash on Hand / Net Monthly Burn Rate.\n- This is wrong.',
      'Formula: Runway (months) = Cash on Hand / Net Monthly Burn Rate * 12.',
      'Formula: Runway (months) = Cash on Hand / Net Monthly Burn Rate. This formula should be avoided.',
      'Formula: Runway (months) = Cash on Hand / Net Monthly Burn Rate is unreliable.',
      'I cannot confirm whether the formula is Cash on Hand / Net Monthly Burn Rate.',
      'I cannot say whether the formula is Cash on Hand / Net Monthly Burn Rate.',
      'I am not able to confirm whether the formula is Cash on Hand / Net Monthly Burn Rate.',
      'The formula is invalid: Runway (months) = Cash on Hand / Net Monthly Burn Rate.',
      'Runway (months) does not equal Cash on Hand / Net Monthly Burn Rate.',
      'Formula: Runway (months) = Cash on Hand / Net Monthly Burn Rate.\n1. This is wrong.',
    ]) {
      expect(score(completeResponse(invalidFormula)).checks.find(check => check.id === 'formula'), invalidFormula)
        .toMatchObject({ passed: false, pointsAwarded: 0 });
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
      'Formula: Runway = $40,000 ÷ $10,000.',
      'Formula: Runway = $40,000.00 ÷ $10,000.00.',
      String.raw`\frac{40{,}000}{10{,}000} = 4`,
      String.raw`\frac{40{,}000.00}{10{,}000.00} = 4`,
      String.raw`\frac{40\,000{.}0}{10\,000{.}00} = 4`,
      String.raw`Formula: Runway (months) = \frac{\text{Cash on Hand}}{\text{Net Monthly Burn Rate}} = 4`,
    ];
    const bare = completeResponse('The runway result is four months.');
    const reversed = completeResponse(String.raw`\frac{10{,}000}{40{,}000} = 0.25`);
    const deniedAsWrong = completeResponse([
      'The formula is wrong.',
      String.raw`\frac{40{,}000}{10{,}000} = 4`,
    ].join('\n'));
    const deniedForUse = completeResponse([
      'Do not use this formula.',
      String.raw`\frac{40{,}000}{10{,}000} = 4`,
    ].join('\n'));
    const deniedBareTex = completeResponse([
      'Runway is the topic.',
      'Do not use',
      String.raw`\frac{40{,}000}{10{,}000} = 4`,
    ].join('\n'));
    const deniedSemanticTex = completeResponse(
      String.raw`Formula is wrong. Do not use \frac{\text{cash balance}}{\text{monthly net burn}}.`,
    );
    const rejectedSemanticTex = completeResponse(
      String.raw`Runway context. Reject \frac{\text{cash balance}}{\text{monthly net burn}}.`,
    );
    const neverCalculateSemanticTex = completeResponse(
      String.raw`Runway context. Never calculate \frac{\text{cash balance}}{\text{monthly net burn}}.`,
    );
    const substringMatch = completeResponse('Formula: Runway = 140000 ÷ 10000.');
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
    for (const response of [bare, reversed, deniedAsWrong, deniedForUse, deniedBareTex, deniedSemanticTex, rejectedSemanticTex, neverCalculateSemanticTex, substringMatch]) {
      expect(score(response).checks.find(check => check.id === 'formula')).toMatchObject({
        passed: false,
        pointsAwarded: 0,
      });
    }
  });

  it('accepts the exact paid writer release wording', () => {
    const writer = PERSONA_CASES.find(persona => persona.id === 'writer')!;
    const response = [
      '**MEMO: Release Status Update**',
      'Release was originally planned for Friday. API tests have passed. Browser tests currently show two failures on Windows. Additionally, the smart router has not been tested without cloud credentials.',
      '**Recommendation:** Delay the release until these gaps are closed.',
    ].join('\n\n');
    const result = scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
      requestPersonaId: writer.id,
    }));

    expect(result.checks.find(check => check.id === 'release-facts')?.passed).toBe(true);
    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(result.criticalFailures).toEqual([]);

    for (const validResponse of [
      response.replace(
        'API tests have passed. Browser tests currently show two failures on Windows.',
        'API tests have passed, while browser tests are failing and still show two failures on Windows.',
      ),
      response.replace(
        'API tests have passed. Browser tests currently show two failures on Windows.',
        'API tests have passed. Browser tests failed earlier and still show two failures on Windows.',
      ),
      response.replace(
        'API tests have passed. Browser tests currently show two failures on Windows.',
        'API tests have passed, while browser tests have not passed and still show two failures on Windows.',
      ),
      response.replace(
        'Browser tests currently show two failures on Windows.',
        'Browser tests currently show two failures on Windows, while API tests remain green.',
      ),
      response.replace(
        'API tests have passed. Browser tests currently show two failures on Windows.',
        'Browser tests on Windows have two failures, but API tests passed.',
      ),
      response.replace(
        'API tests have passed. Browser tests currently show two failures on Windows.',
        'Browser tests on Windows have two failures, but API tests are passing.',
      ),
      response.replace(
        'API tests have passed. Browser tests currently show two failures on Windows.',
        'Browser tests show two failures on Windows, and API tests pass.',
      ),
    ]) {
      const validResult = scorePersonaTrial(writer, evidence({
        prompt: writer.prompt,
        response: validResponse,
        persistedResponse: validResponse,
        requestPersonaId: writer.id,
      }));
      expect(
        validResult.checks.find(check => check.id === 'release-facts')?.passed,
        validResponse,
      ).toBe(true);
      expect(validResult).toMatchObject({ score: 100, rawScore: 100, passed: true });
    }

    for (const invalidResponse of [
      response.replace('API tests have passed', 'API tests have not passed'),
      `${response} API tests have not passed.`,
      `${response} API tests haven't passed.`,
      `${response} The API test has not passed.`,
      `${response} API tests have still not passed.`,
      `${response} API tests have not yet passed.`,
      `${response} API tests haven't yet passed.`,
      `${response} API tests have not quite passed.`,
      `${response} API tests haven't fully passed.`,
      `${response} API tests have not completely passed.`,
      `${response} API tests have yet to pass.`,
      response.replace('Release was originally planned for Friday', 'There was no Friday plan'),
      response.replace('Release was originally planned for Friday', 'No Friday release was planned'),
      `${response} Friday has no release plan.`,
      `${response} The Friday plan was canceled.`,
      response.replace('Browser tests currently show two failures', 'Browser tests do not currently show two failures'),
      response.replace('Browser tests currently show two failures', 'Browser tests currently show three failures'),
      response.replace('Browser tests currently show two failures on Windows', 'Browser tests currently show two failures on macOS, not Windows'),
      response.replace('Browser tests currently show two failures on Windows', 'Browser tests currently show two failures on macOS, not on Windows'),
      response.replace('Browser tests currently show two failures on Windows', 'Browser tests currently show two failures on macOS, not in Windows'),
      response.replace('Browser tests currently show two failures on Windows', 'Browser tests currently show two failures on macOS rather than Windows'),
      response.replace('Browser tests currently show two failures on Windows', 'Browser tests currently show two failures on macOS rather than on Windows'),
      response.replace('Browser tests currently show two failures on Windows', 'Browser tests currently show two failures on macOS, while Windows is clean'),
      response.replace('Browser tests currently show two failures on Windows', 'Browser tests currently show two failures on macOS, while Windows is unaffected'),
      response.replace('Browser tests currently show two failures on Windows', 'Browser tests currently show two failures on macOS, while Windows shows no failures'),
    ]) {
      const invalidResult = scorePersonaTrial(writer, evidence({
        prompt: writer.prompt,
        response: invalidResponse,
        persistedResponse: invalidResponse,
        requestPersonaId: writer.id,
      }));
      expect(
        invalidResult.checks.find(check => check.id === 'release-facts')?.passed,
        invalidResponse,
      ).toBe(false);
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

    const boldLabelResponse = [
      '**Memo: Release Status Update**',
      'We had planned to ship on Friday. Status of readiness:',
      '- **API tests:** Passing.',
      '- **Browser tests:** Two failures remain on Windows.',
      '- **Smart router:** Not yet exercised without cloud credentials.',
      '**Recommendation:** Delay release until the Windows browser test failures are resolved and the smart router has been validated without cloud credentials.',
    ].join('\n\n');
    expect(scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response: boldLabelResponse,
      persistedResponse: boldLabelResponse,
      tokenStreamResponse: boldLabelResponse,
      renderedAssistantResponse: boldLabelResponse,
      requestPersonaId: writer.id,
    }))).toMatchObject({ score: 100, rawScore: 100, passed: true });

    const capturedRemainingResponse = [
      '**MEMO**',
      'Release was planned for Friday. API tests are passing. Browser tests currently show two remaining failures on Windows.',
      'The smart router has not been tested without cloud credentials.',
      '**Recommendation:** Delay release until these gaps are closed.',
    ].join('\n\n');
    expect(scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response: capturedRemainingResponse,
      persistedResponse: capturedRemainingResponse,
      tokenStreamResponse: capturedRemainingResponse,
      renderedAssistantResponse: capturedRemainingResponse,
      requestPersonaId: writer.id,
    }))).toMatchObject({ score: 100, rawScore: 100, passed: true });

    const crossTopicQualifierResponse = [
      '**Memo: Release Status Update**',
      'We had planned to ship on Friday. API tests are passing. Browser tests still show two failures on Windows. The smart router has not been exercised without cloud credentials.',
      '**Recommendation:** Delay the release until these gaps—the Windows browser test failures and the unverified smart router behavior without cloud credentials—are closed.',
    ].join('\n\n');
    expect(scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response: crossTopicQualifierResponse,
      persistedResponse: crossTopicQualifierResponse,
      tokenStreamResponse: crossTopicQualifierResponse,
      renderedAssistantResponse: crossTopicQualifierResponse,
      requestPersonaId: writer.id,
    }))).toMatchObject({ score: 100, rawScore: 100, passed: true });

    const crossTopicQualifierVariants = [
      [
        'We planned to ship Friday. API tests are passing.',
        'Smart router behavior is unverified, while browser tests still show two failures on Windows.',
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
      [
        'We planned to ship Friday. API tests are passing, but smart router functionality remains unverified.',
        'Browser tests still show two failures on Windows.',
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
      [
        'We planned to ship Friday. API tests are passing.',
        'Browser tests still show two failures on Windows; smart router operation is unverified.',
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
      [
        'We planned to ship Friday. API tests are passing.',
        'Unverified smart router behavior remains a separate gap; browser tests still show two failures on Windows.',
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
      [
        'We planned to ship Friday. API tests are passing.',
        'Smart router behavior has not been verified; browser tests still show two failures on Windows.',
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
      [
        'We planned to ship Friday. API tests are passing.',
        'Smart router behavior is unverified, and browser tests are still showing two failures on Windows.',
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
      [
        'We planned to ship Friday. API tests are passing.',
        'Smart router behavior is unverified, and browser tests also show two failures on Windows.',
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
      [
        'We planned to ship Friday. API tests are passing.',
        'Smart router behavior is unverified, and browser tests are also showing two failures on Windows.',
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
      [
        'We planned to ship Friday. API tests are passing.',
        'Smart router behavior is unverified, and browser tests are too slow despite showing two failures on Windows.',
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
      [
        'We planned to ship Friday. API tests are passing.',
        'Smart router behavior remains unconfirmed, while browser tests still show two failures on Windows.',
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
      [
        'We planned to ship Friday. API tests are passing.',
        'Smart router behavior is uncertain; browser tests still show two failures on Windows.',
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
      [
        'We planned to ship Friday. API tests are passing.',
        'Smart router behavior is not verified; browser tests still show two failures on Windows.',
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
      [
        'We planned to ship Friday. API tests are passing.',
        'Smart router behavior is unverified, and it is also being investigated while browser tests still show two failures on Windows.',
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
      [
        'We planned to ship Friday. API tests are passing.',
        'Browser tests and unverified smart router behavior are separate gaps. Browser tests still show two failures on Windows.',
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
      [
        'We planned to ship Friday. API tests are passing.',
        'Browser tests still show two failures on Windows; the unverified smart router remains a separate gap.',
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
      [
        'We planned to ship Friday. API tests are passing.',
        "Smart router behavior isn't verified while browser tests still show two failures on Windows.",
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' '),
    ];
    for (const validResponse of crossTopicQualifierVariants) {
      expect(scorePersonaTrial(writer, evidence({
        prompt: writer.prompt,
        response: validResponse,
        persistedResponse: validResponse,
        tokenStreamResponse: validResponse,
        renderedAssistantResponse: validResponse,
        requestPersonaId: writer.id,
      })), validResponse).toMatchObject({ score: 100, rawScore: 100, passed: true });
    }

    const unverifiedBrowserClaims = [
      'Browser tests still show two failures on Windows, but that claim is unverified.',
      'Unverified reports say browser tests still show two failures on Windows.',
      'It is unclear whether browser tests still show two failures on Windows.',
      'Browser tests may show two failures on Windows.',
      'Browser tests still show two failures on Windows; unverified smart router behavior and browser count remain.',
      'Browser tests still show two failures on Windows; smart router behavior is unverified and browser count is too.',
      'Browser tests still show two failures on Windows; smart router behavior is unverified, as is the browser count.',
      'Browser tests still show two failures on Windows; unverified smart router behavior, and browser count remain.',
      'Browser tests still show two failures on Windows; unverified smart router behavior — and browser count remain.',
      'Browser tests still show two failures on Windows; unverified smart router behavior – and browser count remain.',
      'Browser tests still show two failures on Windows; unverified smart router behavior as well as browser count.',
      'Browser tests still show two failures on Windows; unverified smart router behavior without cloud credentials—and browser count remain.',
      'Browser tests still show two failures on Windows; smart router behavior has not been verified; neither has the browser count.',
      'Browser tests and smart router behavior are unverified, although two failures were reported on Windows.',
      'Browser tests still show two failures on Windows; Friday and smart router behavior remain unverified.',
      'Browser tests still show two failures on Windows; API tests and smart router behavior are unverified.',
      'Browser tests still show two failures on Windows; smart router behavior is unverified, and so is the browser count.',
      'Browser tests still show two failures on Windows; smart router behavior is unverified, and it is too.',
      'Browser tests still show two failures on Windows; smart router behavior is unverified, and the latter remains unverified.',
      'Browser tests still show two failures on Windows; unverified smart router behavior and the same remain.',
      'Browser tests still show two failures on Windows according to an unverified smart router report.',
      'Browser tests still show two failures on Windows according to an unverified smart router behavior report.',
      'Smart router behavior is unverified; so is the browser failure count.',
      'Smart router behavior has not been verified; nor has the browser failure count.',
      'Browser tests still show two failures on Windows according to an unverified smart router operation log.',
    ];
    for (const browserClaim of unverifiedBrowserClaims) {
      const invalidResponse = [
        'We planned to ship Friday. API tests are passing.',
        browserClaim,
        'The smart router has not been exercised without cloud credentials.',
        'Recommendation: delay release until those gaps are closed.',
      ].join(' ');
      const invalidResult = scorePersonaTrial(writer, evidence({
        prompt: writer.prompt,
        response: invalidResponse,
        persistedResponse: invalidResponse,
        tokenStreamResponse: invalidResponse,
        renderedAssistantResponse: invalidResponse,
        requestPersonaId: writer.id,
      }));
      expect(
        invalidResult.checks.find(check => check.id === 'release-facts')?.passed,
        browserClaim,
      ).toBe(false);
    }

    const inventedRiskResponse = `${boldLabelResponse} Shipping before these gaps are closed carries unverified risk to release stability.`;
    const inventedRiskResult = scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response: inventedRiskResponse,
      persistedResponse: inventedRiskResponse,
      tokenStreamResponse: inventedRiskResponse,
      renderedAssistantResponse: inventedRiskResponse,
      requestPersonaId: writer.id,
    }));
    expect(inventedRiskResult.checks.find(check => check.id === 'release-facts')?.passed).toBe(true);
    expect(inventedRiskResult.checks.find(check => check.id === 'no-new-claims')?.passed).toBe(false);
    expect(inventedRiskResult.passed).toBe(false);

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
    const deniedCapturedGrammar = [
      'We planned to ship Friday. API tests are passing.',
      'Browser tests do not currently show two remaining failures on Windows.',
      'The smart router has not been exercised without cloud credentials.',
      'Delay release until the gaps are closed.',
    ].join(' ');
    const resolvedCapturedGrammar = deniedCapturedGrammar.replace(
      'do not currently',
      'no longer currently',
    );
    const wrongCountCapturedGrammar = deniedCapturedGrammar.replace(
      'do not currently show two',
      'currently show three',
    );
    const contractedDenialCapturedGrammar = deniedCapturedGrammar.replace(
      'do not currently',
      "don't currently",
    );
    const contractedPastDenialCapturedGrammar = deniedCapturedGrammar.replace(
      'do not currently',
      "didn't currently",
    );
    const outerDenialCapturedGrammar = deniedCapturedGrammar.replace(
      'Browser tests do not currently show two remaining failures on Windows.',
      'It is not true that browser tests currently show two remaining failures on Windows.',
    );
    const formattedOuterDenialCapturedGrammar = outerDenialCapturedGrammar.replace(
      'browser tests',
      '**browser tests**',
    );
    const contractedPluralDenialCapturedGrammar = deniedCapturedGrammar.replace(
      'do not currently show',
      "aren't currently showing",
    );
    const contractedSingularDenialCapturedGrammar = deniedCapturedGrammar.replace(
      'Browser tests do not currently show',
      "The browser test isn't currently showing",
    );
    for (const invalidResponse of [
      misleading,
      scopedNegation,
      deniedCapturedGrammar,
      resolvedCapturedGrammar,
      wrongCountCapturedGrammar,
      contractedDenialCapturedGrammar,
      contractedPastDenialCapturedGrammar,
      outerDenialCapturedGrammar,
      formattedOuterDenialCapturedGrammar,
      contractedPluralDenialCapturedGrammar,
      contractedSingularDenialCapturedGrammar,
    ]) {
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

  it.each([
    [
      'live flat-burn and zero-revenue statement',
      'Biggest assumption: The burn rate stays flat at $10,000/month with zero revenue for the full period.',
      true,
    ],
    [
      'fixed numeric burn',
      'Biggest assumption: Monthly burn remains at $10,000 throughout the runway.',
      true,
    ],
    [
      'unchanged burn',
      'Biggest assumption: Current monthly burn continues unchanged for four months.',
      true,
    ],
    [
      'fixed burn wording',
      'Biggest assumption: Burn is fixed at $10,000 per month.',
      true,
    ],
    [
      'no additional revenue',
      'Biggest assumption: No additional revenue arrives during the runway.',
      true,
    ],
    [
      'stable burn',
      'Biggest assumption: monthly burn remains stable.',
      true,
    ],
    [
      'steady burn',
      'Biggest assumption: monthly burn holds steady at $10,000.',
      true,
    ],
    [
      'numeric burn without at',
      'Biggest assumption: monthly burn remains $10,000 per month.',
      true,
    ],
    [
      'same monthly burn',
      'Biggest assumption: monthly burn stays the same each month.',
      true,
    ],
    [
      'cannot ignore an affirmed assumption',
      'We cannot ignore the assumption that monthly burn remains constant.',
      true,
    ],
    [
      'affirmative future burn',
      'Biggest assumption: monthly burn will remain constant for four months.',
      true,
    ],
    [
      'affirmative future zero revenue',
      'Biggest assumption: revenue will remain zero for four months.',
      true,
    ],
    [
      'parenthetical burn amount',
      'Biggest assumption: monthly burn ($10,000 per month) remains constant throughout the runway.',
      true,
    ],
    [
      'coordinated burn subject',
      'Biggest assumption: monthly burn and revenue remain constant throughout the runway.',
      true,
    ],
    [
      'burn amount modifier',
      'Biggest assumption: monthly burn of $10,000 remains constant throughout the runway.',
      true,
    ],
    [
      'coordinated monthly revenue subject',
      'Biggest assumption: monthly burn and monthly revenue remain constant throughout the runway.',
      true,
    ],
    [
      'revenue treated as zero',
      'Biggest assumption: revenue is treated as zero because no forecast is available.',
      true,
    ],
    [
      'revenue modeled at zero',
      'Biggest assumption: revenue is modeled at zero for the full runway.',
      true,
    ],
    [
      'flat burn noun phrase',
      'Biggest assumption: a flat monthly burn rate of $10,000.',
      true,
    ],
    [
      'direct passive zero-revenue assumption',
      'Revenue is assumed to be zero for the four-month runway.',
      true,
    ],
    [
      'current parenthetical burn amount',
      'Biggest assumption: monthly burn (currently $10,000 per month) remains constant throughout the runway.',
      true,
    ],
    [
      'burn amount introduced by at',
      'Biggest assumption: monthly burn at $10,000 remains constant throughout the runway.',
      true,
    ],
    [
      'zero-valued revenue forecast',
      'Biggest assumption: the revenue forecast is zero for the full runway.',
      true,
    ],
    [
      'zero-valued revenue projection',
      'Biggest assumption: the revenue projection remains zero for the full runway.',
      true,
    ],
    [
      'numeric zero revenue',
      'Biggest assumption: revenue remains at 0.',
      true,
    ],
    [
      'passive no-revenue assumption',
      'No revenue is assumed during the runway.',
      true,
    ],
    [
      'plural assumptions with affirmative no-change wording',
      'Key assumptions: monthly burn does not change and revenue remains at zero.',
      true,
    ],
    [
      'explicit denial',
      'Biggest assumption: The burn rate does not stay flat and is not constant.',
      false,
    ],
    [
      'conditional sensitivity statement',
      'Assumption sensitivity: If burn stays constant, runway would be four months.',
      false,
    ],
    [
      'explicitly disclaimed assumption',
      'No assumption is made here; revenue remains zero.',
      false,
    ],
    [
      'trailing rejection',
      'Biggest assumption: Burn stays constant, which is wrong.',
      false,
    ],
    [
      'false assumption label',
      'The assumption is false: burn stays constant.',
      false,
    ],
    [
      'rejected assumption label',
      'The rejected assumption is that burn stays constant.',
      false,
    ],
    [
      'hedged burn',
      'Biggest assumption: monthly burn may remain constant.',
      false,
    ],
    [
      'hedged revenue',
      'Biggest assumption: revenue may remain at zero.',
      false,
    ],
    [
      'conditional burn',
      'Biggest assumption: monthly burn stays constant only if we cut costs.',
      false,
    ],
    [
      'nonzero revenue',
      'Biggest assumption: revenue remains nonzero.',
      false,
    ],
    [
      'no-longer constant burn',
      'Biggest assumption: monthly burn is no longer constant.',
      false,
    ],
    [
      'invalid assumption label',
      'This assumption is invalid: monthly burn stays constant.',
      false,
    ],
    [
      'later-sentence borrowing',
      'Assumption review: none identified. Monthly burn stays constant.',
      false,
    ],
    [
      'cannot assume',
      'We cannot assume zero revenue.',
      false,
    ],
    [
      'above-zero revenue',
      'Biggest assumption: revenue remains above zero.',
      false,
    ],
    [
      'anything-but-zero revenue',
      'Biggest assumption: revenue is anything but zero.',
      false,
    ],
    [
      'plain trailing condition',
      'Biggest assumption: monthly burn stays constant if sales stall.',
      false,
    ],
    [
      'question rather than assumption',
      'Biggest assumption: Does monthly burn stay constant?',
      false,
    ],
    [
      'far-from constant burn',
      'Biggest assumption: monthly burn is far from constant.',
      false,
    ],
    [
      'later invalidation',
      'Biggest assumption: Burn is fixed at $10,000 per month, but this assumption is invalid.',
      false,
    ],
    [
      'later rejection',
      'Biggest assumption: Burn stays constant for four months, but we reject that assumption.',
      false,
    ],
    [
      'comma condition',
      'Assumption: Monthly burn stays constant, if current spending patterns persist.',
      false,
    ],
    [
      'adverbial cannot assume',
      'We cannot reasonably assume zero revenue.',
      false,
    ],
    [
      'failed stability',
      'Biggest assumption: monthly burn fails to remain constant.',
      false,
    ],
    [
      'temporary flat burn',
      'Biggest assumption: monthly burn stays flat this month but rises next month.',
      false,
    ],
    [
      'temporary zero revenue',
      'Biggest assumption: revenue remains zero for one month, then sales begin.',
      false,
    ],
    [
      'unverified assumption label',
      'The assumption is unverified: monthly burn remains constant.',
      false,
    ],
    [
      'active rejection',
      'We reject the assumption that monthly burn stays constant.',
      false,
    ],
    [
      'active do-not-accept rejection',
      'Do not accept the assumption that revenue remains zero.',
      false,
    ],
    [
      'cross-subject stability borrowing',
      'Biggest assumption: monthly burn rises while revenue remains constant.',
      false,
    ],
    [
      'cross-subject numeric borrowing',
      'Biggest assumption: monthly burn rises while revenue remains at $10,000.',
      false,
    ],
    [
      'cross-subject adjective borrowing',
      'Biggest assumption: monthly burn remains high while revenue is constant.',
      false,
    ],
    [
      'cross-subject zero-revenue borrowing',
      'Biggest assumption: revenue outlook says burn remains at 0.',
      false,
    ],
    [
      'trailing unverified assumption',
      'Biggest assumption: monthly burn stays constant, but this assumption is unverified.',
      false,
    ],
    [
      'active cannot-accept rejection',
      'We cannot accept the assumption that monthly burn remains constant.',
      false,
    ],
    [
      'rejected claim between marker and burn',
      'Biggest assumption: we reject the claim that monthly burn remains constant.',
      false,
    ],
    [
      'do-not-let denial between marker and burn',
      'Biggest assumption: do not let monthly burn be constant.',
      false,
    ],
    [
      'false-that denial between marker and revenue',
      'Biggest assumption: it is false that revenue remains zero.',
      false,
    ],
    [
      'two-month temporary burn',
      'Biggest assumption: monthly burn stays flat for two months, then rises.',
      false,
    ],
    [
      'until-next-month temporary burn',
      'Biggest assumption: monthly burn remains constant until next month, then increases.',
      false,
    ],
    [
      'disputed assumption',
      'We dispute the assumption that monthly burn remains constant.',
      false,
    ],
    [
      'cannot-rely-on assumption',
      'We cannot rely on the assumption that revenue remains zero.',
      false,
    ],
    [
      'qualified active rejection',
      'We reject as unrealistic the assumption that monthly burn remains constant.',
      false,
    ],
    [
      'missing revenue forecast',
      'Assumption: no revenue forecast is available.',
      false,
    ],
    [
      'evidence denial before burn',
      'Assumption: evidence does not show monthly burn remains constant.',
      false,
    ],
    [
      'direct not-zero denial',
      'Assumption: not zero revenue.',
      false,
    ],
    [
      'temporary passive zero revenue',
      'No revenue is assumed for two months, then sales begin.',
      false,
    ],
    [
      'no basis for assumption',
      'There is no basis for the assumption that monthly burn remains constant.',
      false,
    ],
    [
      'adverbial cannot-accept rejection',
      'We cannot reasonably accept the assumption that revenue remains zero.',
      false,
    ],
    [
      'doubted assumption',
      'We doubt that the assumption that monthly burn remains constant is valid.',
      false,
    ],
    [
      'first-three-month temporary burn',
      'Biggest assumption: monthly burn stays flat for the first three months, then rises.',
      false,
    ],
    [
      'ninety-day temporary burn',
      'Biggest assumption: monthly burn stays flat for 90 days, then rises.',
      false,
    ],
    [
      'missing revenue target',
      'Assumption: no revenue target is available.',
      false,
    ],
    [
      'missing revenue guidance',
      'Assumption: no revenue guidance is available.',
      false,
    ],
    [
      'missing income forecast',
      'Assumption: no income forecast is available.',
      false,
    ],
    [
      'missing cash-inflow projection',
      'Assumption: no cash inflow projection is available.',
      false,
    ],
    [
      'cannot-confirm burn denial',
      'Assumption: we cannot confirm monthly burn remains constant.',
      false,
    ],
    [
      'first-two-month temporary burn',
      'Assumption: monthly burn stays constant for the first two months, then rises.',
      false,
    ],
    [
      'no evidence for burn stability',
      'Assumption: there is no evidence that monthly burn remains constant.',
      false,
    ],
    [
      'assumption has not been verified',
      'The assumption has not been verified: monthly burn remains constant.',
      false,
    ],
    [
      'assumption has not been verified contraction',
      "We haven't verified the assumption that revenue remains zero.",
      false,
    ],
    [
      'no reason to accept assumption',
      'We have no reason to accept the assumption that monthly burn remains constant.',
      false,
    ],
    [
      'next-three-month temporary burn',
      'Biggest assumption: monthly burn stays flat for the next three months, then rises.',
      false,
    ],
    [
      'next-ninety-day temporary burn',
      'Biggest assumption: monthly burn stays flat over the next 90 days, then rises.',
      false,
    ],
    [
      'fractional sub-runway burn duration',
      'Biggest assumption: monthly burn remains constant for 3.5 months, then rises.',
      false,
    ],
    [
      'hundred-day sub-runway revenue duration',
      'Biggest assumption: no revenue for 100 days, then sales begin.',
      false,
    ],
    [
      'first-quarter sub-runway duration',
      'Biggest assumption: monthly burn stays constant through the first quarter.',
      false,
    ],
    [
      'one-hundred-nineteen-day sub-runway boundary',
      'Biggest assumption: monthly burn stays constant for 119 days.',
      false,
    ],
    [
      'one-hundred-twenty-day runway boundary',
      'Biggest assumption: monthly burn stays constant for 120 days.',
      true,
    ],
    [
      'following-sentence assumption rejection',
      'Biggest assumption: monthly burn remains constant. This assumption is rejected.',
      false,
    ],
    [
      'following-sentence assumption unverified',
      'Biggest assumption: revenue remains zero. However, this assumption is unverified.',
      false,
    ],
    [
      'following-sentence fact denial',
      'Biggest assumption: no revenue. This is wrong.',
      false,
    ],
    [
      'following-line assumption rejection',
      'Biggest assumption: monthly burn remains constant\nThis assumption is rejected.',
      false,
    ],
  ])('classifies the finance runway assumption: %s', (_label, assumption, expected) => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      'Runway = 4.00 months.',
      'Formula: Runway (months) = Cash on Hand / Net Monthly Burn Rate.',
      assumption,
      '1. Cut monthly burn.',
      '2. Generate near-term revenue.',
    ].join('\n');
    const result = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(result.checks.find(check => check.id === 'assumption')?.passed).toBe(expected);
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
    [
      'current result plus hypothetical sensitivity',
      'Current runway is 4 months. If burn doubles, runway would be 2 months.',
      true,
      100,
    ],
    [
      'semantic coverage alias',
      'Cash on hand covers four months of burn.',
      true,
      100,
    ],
    [
      'scenario-only result',
      'If burn falls, runway would be 4 months.',
      false,
      90,
    ],
    [
      'scenario-only result with scenario co-reference',
      'If burn falls, runway is 4 months. It is 4 months under that scenario.',
      false,
      90,
    ],
    [
      'scenario result followed by unrelated co-reference',
      'If burn falls, runway is 3 months. It is 4 months until launch.',
      false,
      90,
    ],
    [
      'leading scenario overrides current wording',
      'If burn falls, current runway is 4 months.',
      false,
      90,
    ],
    [
      'current result plus hypothetical current inputs',
      'Current runway is 4 months. If funding arrives, current cash is $60,000 and runway is 6 months.',
      true,
      100,
    ],
    [
      'current result survives a trailing hypothetical co-reference',
      'Current runway is 4 months. It is 6 months under that scenario.',
      true,
      100,
    ],
    [
      'current result survives a separate scenario equation',
      'Current runway is 4 months. Scenario: funding arrives. Calculation: $60,000 / $10,000 = 6 months.',
      true,
      100,
    ],
    [
      'current result survives a directly conditional scenario equation',
      'Current runway is 4 months. Calculation: $60,000 / $10,000 = 6 months if funding arrives.',
      true,
      100,
    ],
    [
      'current result survives trailing conditional cash',
      'Current runway is 4 months. Current cash is $60,000 if funding arrives.',
      true,
      100,
    ],
    [
      'current result survives a separate hypothetical cash input',
      'Current runway is 4 months. Hypothetical: funding arrives. Current cash is $60,000.',
      true,
      100,
    ],
    [
      'unrelated trailing condition cannot hide wrong current cash',
      'Current runway is 4 months. Current cash is $20,000, and we will raise funds if sales stall.',
      false,
      90,
    ],
    [
      'unrelated trailing condition cannot hide a wrong current equation',
      'Current runway is 4 months. Calculation: $10,000 / $2,500 = 4 months, and we will raise funds if sales stall.',
      false,
      90,
    ],
    [
      'coordinated trailing condition cannot hide wrong current cash',
      'Current runway is 4 months. Current cash is $20,000, and if sales stall, we will cut costs.',
      false,
      90,
    ],
    [
      'coordinated trailing condition cannot hide a wrong current equation',
      'Current runway is 4 months. Calculation: $10,000 / $2,500 = 4 months, and if sales stall, we will cut costs.',
      false,
      90,
    ],
    [
      'bare Markdown scenario heading scopes the following equation',
      'Current runway is 4 months.\n## Scenario\nCalculation: $60,000 / $10,000 = 6 months.',
      true,
      100,
    ],
    [
      'bare Markdown baseline heading restores current scope',
      'Scenario: funding arrives.\nCurrent cash is $60,000.\n## Baseline\nCurrent runway is 4 months.',
      true,
      100,
    ],
    [
      'current-estimate Markdown heading restores current scope',
      '## Scenario\nCalculation: $60,000 / $10,000 = 6 months.\n## Current estimate\nCurrent runway is 4 months.',
      true,
      100,
    ],
    [
      'leaving a Markdown scenario section restores current scope',
      '## Scenario\nCalculation: $60,000 / $10,000 = 6 months.\n## Conclusion\nCurrent runway is 4 months.',
      true,
      100,
    ],
    [
      'nested Markdown heading remains inside the scenario section',
      'Current runway is 4 months.\n## Scenario\n### Calculation\nCalculation: $60,000 / $10,000 = 6 months.',
      true,
      100,
    ],
    [
      'explicit action heading restores recommendations after a sensitivity',
      'Current runway is 4 months.\nHypothetical sensitivity:\nIf burn doubles, runway is 2 months.\nTwo actions:\n1. Cut monthly burn.\n2. Generate revenue.',
      true,
      100,
    ],
    [
      'unrelated duration cannot establish the current result',
      'Runway is not 3 months. It is 4 months until launch.',
      false,
      90,
    ],
    [
      'target-only result',
      'Target runway is 4 months.',
      false,
      90,
    ],
    [
      'superseded current result',
      'Current runway is 4 months. Correction: current runway is 3 months.',
      false,
      90,
    ],
    [
      'wrong current cash input',
      'Current cash is $20,000 and current monthly burn is $10,000. Current runway is 4 months.',
      false,
      90,
    ],
    [
      'wrong-input equation supporting the claimed result',
      'Current runway is 4 months. Calculation: $10,000 / $2,500 = 4 months.',
      false,
      90,
    ],
  ])('classifies the current finance runway: %s', (_label, runwayStatement, expected, rawScore) => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      runwayStatement,
      'Formula: Runway = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Biggest assumption: burn stays constant and revenue remains zero.',
      '## Two actions\n1. Cut monthly burn. 2. Generate revenue.',
    ].join('\n');
    const result = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(result.checks.find(check => check.id === 'runway')?.passed).toBe(expected);
    expect(result).toMatchObject({ rawScore, score: rawScore, passed: rawScore === 100 });
  });

  it('does not let a generic action heading override an explicit action exclusion', () => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      'Current runway is 4 months.',
      'Formula: Runway = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Biggest assumption: burn stays constant and revenue remains zero.',
      'Do not implement:',
      'Two actions:',
      '1. Cut monthly burn.',
      '2. Generate revenue.',
    ].join('\n');
    const result = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(result.checks.find(check => check.id === 'runway')?.passed).toBe(true);
    expect(result.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);
    expect(result).toMatchObject({ rawScore: 90, score: 90, passed: false });
  });

  it('does not let a generic Markdown action heading override a hard exclusion', () => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      'Current runway is 4 months.',
      'Formula: Runway = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Biggest assumption: burn stays constant and revenue remains zero.',
      'For reference only:',
      '## Two actions',
      '1. Cut monthly burn.',
      '2. Generate revenue.',
    ].join('\n');
    const result = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(result.checks.find(check => check.id === 'runway')?.passed).toBe(true);
    expect(result.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);
    expect(result).toMatchObject({ rawScore: 90, score: 90, passed: false });
  });

  it.each([
    [
      'nested Markdown action heading remains scenario-only',
      ['## Scenario', '### Two actions'],
      false,
      90,
    ],
    [
      'same-level Markdown action heading exits scenario scope',
      ['## Scenario', '## Two actions'],
      true,
      100,
    ],
    [
      'plain scenario label keeps direct actions hypothetical',
      ['Scenario:'],
      false,
      90,
    ],
    [
      'plain sensitivity label keeps direct actions hypothetical',
      ['Sensitivity:'],
      false,
      90,
    ],
    [
      'plain generic action heading exits scenario scope',
      ['Scenario:', 'Two actions:'],
      true,
      100,
    ],
    [
      'scenario headings cannot launder a hard action exclusion',
      ['## Do not implement', '## Scenario', '## Two actions'],
      false,
      90,
    ],
    [
      'plain no-longer-recommended introduction remains excluded',
      ['We no longer recommend these actions:', 'Two actions:'],
      false,
      90,
    ],
    [
      'no-longer-recommending cannot clear a hard exclusion',
      ['## Do not implement', 'We are no longer recommending these actions:', 'Two actions:'],
      false,
      90,
    ],
    [
      'Markdown no-longer-recommended heading remains excluded',
      ['## Actions no longer recommended'],
      false,
      90,
    ],
  ])('classifies finance action section boundaries: %s', (
    _label,
    sectionLines,
    expected,
    rawScore,
  ) => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      'Current runway is 4 months.',
      'Formula: Runway = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Biggest assumption: burn stays constant and revenue remains zero.',
      ...sectionLines,
      '1. Cut monthly burn.',
      '2. Generate revenue.',
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
    expect(result).toMatchObject({ rawScore, score: rawScore, passed: rawScore === 100 });
  });

  it.each([
    [
      'action-bearing gerund retractions remain excluded',
      [
        '1. Cut monthly burn; we are no longer recommending this action.',
        '2. Generate revenue; we are no longer recommending this action.',
      ],
    ],
    [
      'a later gerund retraction clears previously matched actions',
      [
        '1. Cut monthly burn.',
        '2. Generate revenue.',
        'We are no longer recommending these actions.',
      ],
    ],
  ])('rejects finance action gerund retractions: %s', (_label, actionLines) => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      'Current runway is 4 months.',
      'Formula: Runway = Cash on Hand ÷ Net Monthly Burn Rate.',
      'Biggest assumption: burn stays constant and revenue remains zero.',
      ...actionLines,
    ].join('\n');
    const result = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      tokenStreamResponse: response,
      renderedAssistantResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(result.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);
    expect(result).toMatchObject({ rawScore: 90, score: 90, passed: false });
  });

  it.each([
    ['Create near-term cash inflow', true],
    ['Add near-term revenue', true],
    ['Start generating revenue', true],
    ['Do not create near-term cash inflow', false],
    ['Never add near-term revenue', false],
    ['Do not start generating revenue', false],
    ['Create near-term cash inflow is not recommended', false],
    ['Add near-term revenue is impossible', false],
    ['Start generating revenue is not recommended', false],
    ['Start generating revenue, but this is not a recommendation', false],
    ["Start generating revenue, but this isn't a recommendation", false],
    ['Start generating revenue, but this isn’t a recommendation', false],
    ["Start generating revenue, but this isn't my recommendation", false],
    ["Start generating revenue, but this wasn't my recommendation", false],
    ["Start generating revenue, but these aren't our recommendations", false],
    ['Add near-term revenue - never recommended', false],
    ['Create near-term cash inflow never works', false],
    ['The memo mentions "create near-term cash inflow"', false],
    ['The memo mentions "start generating revenue"', false],
    ['We discussed whether to add near-term revenue', false],
    ['We discussed whether to start generating revenue', false],
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
      'Milestones: M2 depends on M1; owners are assigned by role.',
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

  it('credits an explicit directed critical path as a dependency map', () => {
    const projectManager = PERSONA_CASES.find(persona => persona.id === 'project-manager')!;
    const response = [
      '## Milestones',
      '| Milestone | Depends On |',
      '|---|---|',
      '| M1 Native packaging | — |',
      '| M2 Local model bundling | M1 |',
      '**Critical path:** M1 → M2 → M3.',
      '## Owners by Role',
      'Release Manager owns coordination; QA Lead owns acceptance.',
      '## Risks and Exit Criteria',
      'Risk: packaging failure. Exit criteria: clean Windows install succeeds.',
    ].join('\n');
    const result = scorePersonaTrial(projectManager, evidence({
      prompt: projectManager.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: projectManager.id,
    }));

    expect(result.checks.find(check => check.id === 'dependencies')?.passed).toBe(true);
    expect(result).toMatchObject({ score: 100, passed: true });
  });

  it('rejects invented quantified release requirements in a project plan', () => {
    const projectManager = PERSONA_CASES.find(persona => persona.id === 'project-manager')!;
    const response = [
      '## Milestones',
      'M2 depends on M1.',
      '## Owners by Role',
      'Release Manager owns coordination; QA Lead owns acceptance.',
      '## Risks and Exit Criteria',
      'Risk: packaging failure.',
      'Exit criteria: test at least 3 Windows versions, start in under 30 seconds, and pass a 24-hour soak test.',
    ].join('\n');
    const result = scorePersonaTrial(projectManager, evidence({
      prompt: projectManager.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: projectManager.id,
    }));

    expect(result.checks.find(check => check.id === 'no-invented-requirements')?.passed).toBe(false);
    expect(result.passed).toBe(false);
  });

  it.each([
    [
      'populated depends-on table',
      '| Milestone | Depends On |\n|---|---|\n| M1 | — |\n| M2 | M1 |',
      true,
    ],
    ['direct milestone relation', 'M2 depends on M1.', true],
    ['direct milestone relation with adverb', 'M2 depends directly on M1.', true],
    ['Markdown-emphasized milestone relation', '**M2** depends on **M1**.', true],
    ['directed critical path', 'Critical path: M1 → (M2 & M3 in parallel) → M4.', true],
    ['generic dependency claim', 'Milestones and dependencies assign owners by role.', false],
    ['unknown dependencies', 'Dependencies: unknown.', false],
    ['unprovided dependencies', 'Dependencies: not provided.', false],
    ['empty depends-on table', '| Milestone | Depends On |\n|---|---|', false],
    [
      'placeholder-only depends-on rows',
      '| Milestone | Depends On |\n|---|---|\n| M1 | — |\n| M2 | None |\n| M3 | TBD |',
      false,
    ],
    ['negated milestone relation', 'M2 does not depend on M1.', false],
    ['false-that milestone relation', 'It is false that M2 depends on M1.', false],
    ['disputed milestone relation', 'It is disputed that M2 depends on M1.', false],
    ['disputed relation claim', 'We dispute the claim that M2 depends on M1.', false],
    ['false trailing relation claim', 'The claim that M2 depends on M1 is false.', false],
    ['false trailing coordinated claim', 'M2 depends on M1, but that claim is false.', false],
    ['unsupported milestone relation', 'There is no evidence that M2 depends on M1.', false],
    ['do-not-claim milestone relation', 'Do not claim M2 depends on M1.', false],
    ['trailing-wrong milestone relation', 'M2 depends on M1, which is wrong.', false],
    ['unknown critical path', 'Critical path: TBD.', false],
    ['single-node critical path', 'Critical path: M1.', false],
    ['self dependency', 'M1 depends on M1.', false],
    ['self-loop critical path', 'Critical path: M1 → M1.', false],
    ['is-not critical path', 'Critical path is not M1 → M2.', false],
    ['questioned critical path', 'Critical path: M1 → M2? No.', false],
    ['no critical path', 'No critical path: M1 → M2.', false],
    ['not-the critical path', 'Not the critical path: M1 → M2.', false],
    ['unestablished critical path', 'Critical path: M1 → M2 is not established.', false],
    ['modal critical path', 'Critical path may be M1 → M2.', false],
    ['not-necessarily critical path', 'This is not necessarily the critical path: M1 → M2.', false],
    ['unrelated later arrow', 'Critical path: M1 and M2 remain unordered; notes → pending.', false],
    [
      'negated dependency table prose',
      '| Milestone | Depends On |\n|---|---|\n| M1 | does not depend on M2 |',
      false,
    ],
    [
      'negated dependency table id',
      '| Milestone | Depends On |\n|---|---|\n| M1 | not M2 |',
      false,
    ],
    [
      'affirmative not-only dependency table',
      '| Milestone | Depends On |\n|---|---|\n| M4 | Not only M2 but also M3 |',
      true,
    ],
    [
      'mixed dependency table',
      '| Milestone | Depends On |\n|---|---|\n| M4 | M1, not M2 |',
      true,
    ],
    [
      'required dependency table',
      '| Milestone | Depends On |\n|---|---|\n| M4 | M1 (not optional) |',
      true,
    ],
    [
      'captured named phase dependency table',
      '| Milestone | Depends On | Why |\n|---|---|---|\n| Local model bundling (2) | Native packaging (1) | installer prerequisite |\n| Smart router (4) | Local models (2) + Proxy (3) | endpoints required |',
      true,
    ],
    [
      'named phase self dependency',
      '| Milestone | Depends On |\n|---|---|\n| Local model bundling (2) | Local model bundling (2) |',
      false,
    ],
    [
      'denied named phase dependency',
      '| Milestone | Depends On |\n|---|---|\n| Local model bundling (2) | not Native packaging (1) |',
      false,
    ],
    [
      'generic phase-order prose',
      'Milestones are sequenced by dependency order (Phase 1 through Phase 6).',
      false,
    ],
    [
      'suffix-denied named phase dependency',
      '| Milestone | Depends On |\n|---|---|\n| Local model bundling (2) | Native packaging (1) is not required |',
      false,
    ],
    [
      'clause-denied named phase dependency',
      '| Milestone | Depends On |\n|---|---|\n| Local model bundling (2) | Native packaging (1), but it is not a dependency |',
      false,
    ],
    [
      'conflicting structural target identifiers',
      '| Phase | Milestone | Depends On |\n|---|---|---|\n| 5 | Windows verification (11) | Phase 5 |',
      false,
    ],
    [
      'tentative named phase dependency',
      '| Milestone | Depends On |\n|---|---|\n| Local model bundling (2) | possibly Native packaging (1) |',
      false,
    ],
    [
      'contracted suffix-denied named phase dependency',
      "| Milestone | Depends On |\n|---|---|\n| Local model bundling (2) | Native packaging (1) isn't required |",
      false,
    ],
    [
      'optional named phase dependency',
      '| Milestone | Depends On |\n|---|---|\n| Local model bundling (2) | Native packaging (1) is optional |',
      false,
    ],
  ])('classifies a project dependency map: %s', (_label, dependencyText, expected) => {
    const projectManager = PERSONA_CASES.find(persona => persona.id === 'project-manager')!;
    const response = [
      '## Milestones',
      dependencyText,
      '## Owners by Role',
      'Release Manager owns coordination.',
      '## Risks and Exit Criteria',
      'Risk: packaging failure. Exit criteria: clean Windows install succeeds.',
    ].join('\n');
    const result = scorePersonaTrial(projectManager, evidence({
      prompt: projectManager.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: projectManager.id,
    }));

    expect(result.checks.find(check => check.id === 'dependencies')?.passed).toBe(expected);
  });

  it.each([
    [
      'captured 30 min agenda with mojibake clock-range separators',
      [
        '# Launch-Readiness Meeting Agenda (30 min)',
        '| Time | Block |',
        '|---|---|',
        '| 0:00\u00e2\u20ac\u201c0:02 | Welcome |',
        '| 0:02\u00e2\u20ac\u201c0:07 | Status |',
        '| 0:07\u00e2\u20ac\u201c0:30 | Decisions |',
      ].join('\n'),
      true,
    ],
    [
      'hyphenated 30-minute agenda with clock ranges',
      '# 30-minute agenda\n- 0:00-0:05 Welcome\n- 0:05-0:20 Readiness\n- 0:20-0:30 Decisions',
      true,
    ],
    [
      '30 minutes with multiple per-block durations',
      '# Launch agenda — 30 minutes\n- 5 min: Welcome\n- 10 minutes: Status\n- 15 mins: Decisions',
      true,
    ],
    [
      '30 minutes with minute-offset ranges',
      '# Launch agenda — 30 minutes\n- 0–5 min: Welcome\n- 5–15 min: Status\n- 15–30 min: Decisions',
      true,
    ],
    [
      'minute-offset ranges must begin at the agenda origin',
      '# Launch agenda — 30 minutes\n10-20 min: Welcome\n20-40 min: Decisions',
      false,
    ],
    [
      'mixed range and duration blocks may form one exact agenda',
      '# Launch agenda — 30 minutes\n- 0:00-0:05 Welcome\n- 10 min: Status\n- 15 min: Decisions',
      true,
    ],
    [
      'range duration annotations must agree with the encoded interval',
      '# Launch agenda — 30 minutes\n- 0:00-0:10 Status (15 min)\n- 0:10-0:30 Decisions (20 min)',
      false,
    ],
    [
      'matching range duration annotations preserve an exact agenda',
      '# Launch agenda — 30 minutes\n- 0:00-0:10 Status (10 min)\n- 0:10-0:30 Decisions (20 min)',
      true,
    ],
    [
      'allocated range duration annotations must agree with the interval',
      '# Launch agenda — 30 minutes\n- 0:00-0:10 Status (15 min allocated)\n- 0:10-0:30 Decisions',
      false,
    ],
    [
      'bracketed range duration annotations must agree with the interval',
      '# Launch agenda — 30 minutes\n- 0:00-0:10 Status [15 min]\n- 0:10-0:30 Decisions',
      false,
    ],
    [
      'common annotation tails must agree with the interval',
      '# Launch agenda — 30 minutes\n- 0:00-0:10 Status (15 min allotted)\n- 0:10-0:30 Decisions',
      false,
    ],
    [
      'table duration columns must agree with their clock ranges',
      '# Launch agenda — 30 minutes\n| Time | Duration | Block |\n|---|---|---|\n| 0:00-0:10 | 15 min | Status |\n| 0:10-0:30 | 20 min | Decisions |',
      false,
    ],
    [
      'a duration adjective in the block label is not a range annotation',
      '# Launch agenda — 30 minutes\n- 0:00-0:10 Review the 5-minute demo\n- 0:10-0:30 Decide launch',
      true,
    ],
    [
      'a duration adjective in a duration-only block label is not a second block',
      '# Launch agenda — 30 minutes\n- 10 min: Review the 5-minute demo\n- 20 min: Decide launch',
      true,
    ],
    [
      'duration-only block annotations must agree with the leading allocation',
      '# Launch agenda — 30 minutes\n- 10 min: Status (15 min allocated)\n- 20 min: Decisions',
      false,
    ],
    [
      'duration adjectives without leading allocations are not agenda blocks',
      '# Launch agenda — 30 minutes\n- Discuss the 10-minute demo\n- Use the 20-minute briefing',
      false,
    ],
    [
      '30 minutes with unbulleted clock ranges',
      '# Launch agenda — 30 minutes\n0:00–0:05 Welcome\n0:05–0:20 Status\n0:20–0:30 Decisions',
      true,
    ],
    [
      'valid duration blocks plus an unrelated pre-read duration',
      [
        '# Launch agenda — 30 minutes',
        '- 5 min: Welcome',
        '- 10 min: Status',
        '- 15 min: Decisions',
        '## Pre-Read Checklist',
        '- [ ] Read the 5 min briefing note.',
      ].join('\n'),
      true,
    ],
    [
      'qualified pre-read heading ends agenda block collection',
      [
        '# Launch agenda — 30 minutes',
        '- 5 min: Welcome',
        '- 10 min: Status',
        '- 15 min: Decisions',
        'Pre-read checklist (before meeting)',
        '- Read the 5 min briefing note.',
      ].join('\n'),
      true,
    ],
    [
      'dash-qualified pre-read heading ends agenda block collection',
      [
        'Launch agenda - 30 minutes',
        '0:00-0:15 Status',
        '0:15-0:30 Decisions',
        'Pre-read checklist - before meeting',
        '- Read the 5 min briefing note.',
      ].join('\n'),
      true,
    ],
    [
      'bulleted pre-read heading cannot supply the agenda time blocks',
      [
        'Launch agenda - 30 minutes',
        '- Pre-read checklist:',
        '  - Read the 5 min product note.',
        '  - Read the 10 min engineering note.',
        '  - Read the 10 min QA note.',
        '  - Read the 5 min support note.',
      ].join('\n'),
      false,
    ],
    [
      'bulleted bold pre-read heading cannot supply the agenda time blocks',
      [
        'Launch agenda - 30 minutes',
        '- **Pre-read checklist:**',
        '  - Read the 5 min product note.',
        '  - Read the 10 min engineering note.',
        '  - Read the 10 min QA note.',
        '  - Read the 5 min support note.',
      ].join('\n'),
      false,
    ],
    [
      'numbered pre-read heading cannot supply the agenda time blocks',
      'Launch agenda - 30 minutes\n1. Pre-read checklist:\n- 5 min Product\n- 10 min Engineering\n- 10 min QA\n- 5 min Support',
      false,
    ],
    [
      'short pre-read heading cannot supply the agenda time blocks',
      'Launch agenda - 30 minutes\nShort pre-read checklist:\n- 5 min Product\n- 10 min Engineering\n- 10 min QA\n- 5 min Support',
      false,
    ],
    [
      'qualified pre-read heading with digits remains excluded',
      'Launch agenda - 30 minutes\nPre-read checklist — complete 24 hours before\n- 5 min Product\n- 10 min Engineering\n- 10 min QA\n- 5 min Support',
      false,
    ],
    [
      'plain pre-read heading before the meeting remains excluded',
      'Launch agenda - 30 minutes\nPre-read checklist before meeting:\n- 5 min Product\n- 10 min Engineering\n- 15 min QA',
      false,
    ],
    [
      'italic pre-read heading remains excluded',
      'Launch agenda - 30 minutes\n_Pre-read checklist_\n- 5 min Product\n- 10 min Engineering\n- 10 min QA\n- 5 min Support',
      false,
    ],
    [
      'bold pre-read heading with a trailing qualifier remains excluded',
      'Launch agenda - 30 minutes\n**Pre-read checklist:** complete before meeting\n- 5 min Product\n- 10 min Engineering\n- 15 min QA',
      false,
    ],
    [
      'pre-read heading mentioning the launch agenda remains excluded',
      'Launch agenda - 30 minutes\n## Pre-read checklist for launch agenda\n- 5 min Product\n- 10 min Engineering\n- 10 min QA\n- 5 min Support',
      false,
    ],
    [
      'duration blocks must not exceed the declared agenda length',
      '# Launch agenda — 30 minutes\n- 15 min: Status\n- 15 min: Decisions\n- 10 min: Wrap-up',
      false,
    ],
    [
      'multiple duration blocks on one row cannot hide an overlong agenda',
      '# Launch agenda — 30 min\n- 15 min Status\n- 15 min Decisions; 20 min Wrap-up',
      false,
    ],
    [
      'comma-separated duration blocks cannot hide an overlong agenda',
      '# Launch agenda — 30 min\n- 10 min Status, 20 min Wrap-up\n- 20 min Decisions',
      false,
    ],
    [
      'and-separated duration blocks cannot hide an overlong agenda',
      '# Launch agenda — 30 min\n- 10 min Status and 20 min Wrap-up\n- 20 min Decisions',
      false,
    ],
    [
      'label-first parenthetical durations form a valid agenda',
      '# Launch agenda — 30 min\n- Welcome (5 min)\n- Status (10 min)\n- Decisions (15 min)',
      true,
    ],
    [
      'bold leading durations form a valid agenda',
      '# Launch agenda — 30 min\n- **10 min:** Status\n- **20 min:** Decisions',
      true,
    ],
    [
      'clock ranges must not exceed the declared agenda length',
      '# Launch agenda — 30 minutes\n- 0:00-0:15 Status\n- 0:15-0:30 Decisions\n- 0:30-0:40 Wrap-up',
      false,
    ],
    [
      'unlabeled extra range still invalidates the agenda length',
      '# Launch agenda — 30 minutes\n0:00-0:15 Status\n0:15-0:30 Decisions\n0:30-0:40',
      false,
    ],
    [
      'multiple extra ranges on one agenda line invalidate the agenda length',
      '# Launch agenda — 30 minutes\n0:00-0:15 Status\n0:15-0:30 Decisions\n0:30-0:35 Q&A; 0:35-0:40 Wrap-up',
      false,
    ],
    [
      'duration-only line inherits the preceding agenda heading',
      '# Launch-readiness agenda\n30 min\n0:00-0:15 Status\n0:15-0:30 Decisions',
      true,
    ],
    [
      'trailing total declaration preserves the preceding agenda timeline',
      '# Launch-readiness agenda\n0:00-0:15 Status\n0:15-0:30 Decisions\n**Total time: 30 minutes**',
      true,
    ],
    [
      'bulleted total declaration is not an extra duration block',
      '# Launch agenda — 30 minutes\n- 10 min: Status\n- 20 min: Decisions\n- Total time: 30 minutes',
      true,
    ],
    [
      'leading total declaration is not a duration block',
      '# Launch agenda\n30 min total\n0:00-0:10 Status\n0:10-0:30 Decisions',
      true,
    ],
    [
      'later conflicting total duration invalidates the agenda',
      '# Launch agenda — 30 minutes\n0:00-0:15 Status\n0:15-0:30 Decisions\nTotal duration: 45 minutes',
      false,
    ],
    [
      'later generic duration invalidates the agenda',
      '# Launch agenda — 30 minutes\n0:00-0:15 Status\n0:15-0:30 Decisions\nDuration: 45 minutes',
      false,
    ],
    [
      'later meeting length invalidates the agenda',
      '# Launch agenda — 30 minutes\n0:00-0:15 Status\n0:15-0:30 Decisions\nMeeting length: 45 minutes',
      false,
    ],
    [
      'pre-read totals do not contradict the meeting duration',
      '# Launch agenda — 30 minutes\n0:00-0:15 Status\n0:15-0:30 Decisions\n## Pre-read checklist\nTotal time: 5 minutes',
      true,
    ],
    [
      'agenda heading may mention a required pre-read',
      '# Launch agenda (30 min) — pre-read required\n0:00-0:15 Status\n0:15-0:30 Decisions',
      true,
    ],
    [
      'prose durations are not agenda blocks',
      '# Launch agenda — 30 minutes\nPreparation takes 5 min. Demo takes 10 min. Follow-up takes 15 min.',
      false,
    ],
    [
      'pre-read durations are not agenda blocks',
      [
        '# Launch agenda — 30 minutes',
        '## Pre-Read Checklist',
        '- [ ] Read the 5 min product note.',
        '- [ ] Read the 10 min engineering note.',
        '- [ ] Read the 15 min QA note.',
      ].join('\n'),
      false,
    ],
    [
      'timed pre-read heading is not a meeting-duration declaration',
      [
        '## Pre-Read Checklist (30 min)',
        '- [ ] Read the 5 min product note.',
        '- [ ] Read the 10 min engineering note.',
        '- [ ] Read the 15 min QA note.',
      ].join('\n'),
      false,
    ],
    [
      'meeting-duration copy inside a pre-read section is not an agenda declaration',
      [
        '## Pre-Read Checklist',
        'Meeting duration: 30 minutes',
        '- [ ] Read the 5 min product note.',
        '- [ ] Read the 10 min engineering note.',
        '- [ ] Read the 15 min QA note.',
      ].join('\n'),
      false,
    ],
    [
      'meeting pre-read prose is not an agenda declaration',
      'The meeting pre-read takes 30 minutes.\n- 5 min: Product note\n- 10 min: Engineering note\n- 15 min: QA note',
      false,
    ],
    [
      'total pre-read time is not a meeting-duration declaration',
      'Total pre-read time: 30 minutes\n- 5 min: Product note\n- 10 min: Engineering note\n- 15 min: QA note',
      false,
    ],
    ['30 min heading without time blocks', '# Launch agenda (30 min)\nDiscuss readiness and decide.', false],
    [
      '45-minute agenda with explicit ranges',
      '# Launch agenda (45 min)\n- 0:00-0:15 Status\n- 0:15-0:45 Decisions',
      false,
    ],
    ['30-minute heading with one bare timestamp', '# 30-minute agenda\nStart at 09:00.', false],
    ['30-minute heading with only one interval', '# 30-minute agenda\n- 0:00-0:30 Discussion', false],
    [
      'alternative ranges on one prose line are not separate blocks',
      '# 30-minute agenda\nSchedule options: 9:00-9:15 or 9:15-9:30.',
      false,
    ],
    [
      'alternative ranges on separate prose lines are not agenda blocks',
      '# 30-minute agenda\nOption A is 9:00-9:15.\nOption B is 9:15-9:30.',
      false,
    ],
    [
      'bulleted alternative ranges are not one committed agenda',
      '# 30-minute agenda\n- Option A: 9:00-9:15\n- Option B: 9:15-9:30',
      false,
    ],
    [
      'dash-delimited alternative ranges are not one committed agenda',
      '# 30-minute agenda\n- Option A — 9:00-9:15\n- Option B — 9:15-9:30',
      false,
    ],
    [
      'choice ranges are not one committed agenda',
      '# 30-minute agenda\n- Choice A: 9:00-9:15\n- Choice B: 9:15-9:30',
      false,
    ],
    [
      'scenario ranges are not one committed agenda',
      '# 30-minute agenda\n- Scenario A: 9:00-9:15\n- Scenario B: 9:15-9:30',
      false,
    ],
    [
      'table option ranges are not one committed agenda',
      '# 30-minute agenda\n| Option | Time |\n|---|---|\n| Option A | 9:00-9:15 |\n| Option B | 9:15-9:30 |',
      false,
    ],
    [
      'alternative schedule heading does not extend the committed agenda',
      '# 30-minute agenda\n0:00-0:10 Status\n## Alternative schedule\n0:10-0:30 Decisions',
      false,
    ],
    [
      'absolute AM clock ranges form a contiguous agenda',
      '# 30-minute agenda\n- 9:00 AM–9:15 AM Status\n- 9:15 AM–9:30 AM Decisions',
      true,
    ],
    [
      '130-minute agenda must not alias 30 minutes',
      '# 130 minute agenda\n- 0:00-1:00 Status\n- 1:00-2:10 Decisions',
      false,
    ],
    [
      'negated 30-minute agenda declaration',
      'This is not a 30 min agenda.\n- 0:00-0:05 Status\n- 0:05-0:10 Decisions',
      false,
    ],
    [
      'qualified negation of the 30-minute duration',
      'This agenda is not actually 30 minutes.\n- 0:00-0:15 Status\n- 0:15-0:30 Decisions',
      false,
    ],
    [
      'anything-but denial of the 30-minute duration',
      'This agenda is anything but 30 minutes.\n0:00-0:15 Status\n0:15-0:30 Decisions',
      false,
    ],
    [
      'far-from denial of the 30-minute duration',
      'This agenda is far from 30 minutes.\n0:00-0:15 Status\n0:15-0:30 Decisions',
      false,
    ],
    [
      'article-bearing anything-but denial of the 30-minute duration',
      'This is anything but a 30-minute agenda.\n0:00-0:15 Status\n0:15-0:30 Decisions',
      false,
    ],
    [
      'article-bearing far-from denial of the 30-minute duration',
      'This is far from a 30-minute agenda.\n0:00-0:15 Status\n0:15-0:30 Decisions',
      false,
    ],
    [
      'less-than qualifier contradicts the 30-minute duration',
      '# Launch agenda — less than 30 minutes\n0:00-0:15 Status\n0:15-0:30 Decisions',
      false,
    ],
    [
      'approximate qualifier does not declare an exact 30-minute duration',
      '# Launch agenda — about 30 minutes\n0:00-0:15 Status\n0:15-0:30 Decisions',
      false,
    ],
    [
      'maximum qualifier does not declare an exact duration',
      '# Launch agenda — maximum 30 minutes\n0:00-0:15 Status\n0:15-0:30 Decisions',
      false,
    ],
    [
      'maximum qualifier before a colon does not declare an exact duration',
      '# Launch agenda — Maximum duration: 30 minutes\n0:00-0:15 Status\n0:15-0:30 Decisions',
      false,
    ],
    [
      'duration range does not declare an exact duration',
      '# Launch agenda — 25–30 minutes\n0:00-0:15 Status\n0:15-0:30 Decisions',
      false,
    ],
    [
      'parenthetical approximation does not declare an exact duration',
      '# Launch agenda — 30 minutes (approximately)\n0:00-0:15 Status\n0:15-0:30 Decisions',
      false,
    ],
    [
      'plus-or-minus qualifier does not declare an exact duration',
      '# Launch agenda — 30 minutes ± 5\n0:00-0:15 Status\n0:15-0:30 Decisions',
      false,
    ],
    [
      'trailing upper-bound qualifier does not declare an exact duration',
      '# Launch agenda — 30 minutes or less\n0:00-0:15 Status\n0:15-0:30 Decisions',
      false,
    ],
    [
      'trailing approximation does not declare an exact duration',
      '# Launch agenda — 30 minutes, approximately\n0:00-0:15 Status\n0:15-0:30 Decisions',
      false,
    ],
    [
      'exact qualifier preserves an exact 30-minute declaration',
      '# Launch agenda — exactly 30 minutes\n0:00-0:15 Status\n0:15-0:30 Decisions',
      true,
    ],
    [
      'not-only construction affirms the duration',
      'This is not only a 30-minute agenda but also a decision forum.\n- 0:00-0:15 Status\n- 0:15-0:30 Decisions',
      true,
    ],
    [
      'never a 30-minute agenda',
      'This is never a 30 min agenda.\n- 0:00-0:15 Status\n- 0:15-0:30 Decisions',
      false,
    ],
    [
      'cannot be a 30-minute agenda',
      'This cannot be a 30 min agenda.\n- 0:00-0:15 Status\n- 0:15-0:30 Decisions',
      false,
    ],
    [
      'cannot-contraction 30-minute agenda',
      "This can't be a 30 min agenda.\n- 0:00-0:15 Status\n- 0:15-0:30 Decisions",
      false,
    ],
    [
      'curly cannot-contraction 30-minute agenda',
      'This can’t be a 30 min agenda.\n- 0:00-0:15 Status\n- 0:15-0:30 Decisions',
      false,
    ],
    [
      'agenda explicitly without a 30-minute duration',
      'Agenda without a 30-minute duration.\n- 0:00-0:05 Status\n- 0:05-0:10 Decisions',
      false,
    ],
  ])('classifies executive-assistant duration blocks: %s', (_label, agenda, expected) => {
    const executiveAssistant = PERSONA_CASES.find(persona => persona.id === 'executive-assistant')!;
    const response = [
      agenda,
      '## Desired Decisions',
      '- Approve launch readiness.',
      '## Pre-Read Checklist',
      '- [ ] Product, Engineering, QA, and Support status.',
    ].join('\n');
    const result = scorePersonaTrial(executiveAssistant, evidence({
      prompt: executiveAssistant.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: executiveAssistant.id,
    }));

    expect(result.checks.find(check => check.id === 'duration-blocks')?.passed).toBe(expected);
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
        { event: 'tool', data: { name: toolName, input: {} } },
        { event: 'tool_result', data: { name: toolName, result: 'Unavailable', isError: false } },
        { event: 'done', data: { content: vagueResponse, toolsUsed: [toolName] } },
      ],
    }));
    expect(vagueResult.checks.find(check => check.id === 'empty-result')).toMatchObject({
      passed: false,
      pointsAwarded: 0,
    });

    const failedToolResponse = [
      'No files were found in the current workspace.',
      'Recommended next engineering step: confirm the intended stack.',
    ].join('\n');
    const failedToolResult = scorePersonaTrial(coder, evidence({
      prompt: coder.prompt,
      response: failedToolResponse,
      persistedResponse: failedToolResponse,
      requestPersonaId: coder.id,
      toolsUsed: ['search_files'],
      sseEvents: [
        { event: 'tool', data: { name: 'search_files', input: { pattern: '**/*' } } },
        { event: 'tool_result', data: { name: 'search_files', result: 'Search failed: permission denied', isError: false } },
        { event: 'done', data: { content: failedToolResponse, toolsUsed: ['search_files'] } },
      ],
    }));
    expect(failedToolResult.checks.find(check => check.id === 'empty-result')).toMatchObject({
      passed: false,
      pointsAwarded: 0,
    });
  });

  it.each([
    ['captured affirmative workspace-directory wording', 'This workspace directory is empty.', true],
    ['captured affirmative search-return wording', 'I ran an exhaustive glob search and it returned **no files**.', true],
    ['captured paid tool-subject search wording', 'I ran an exhaustive glob search (`**/*`) against the workspace root, and the tool returned **no files**.', true],
    ['captured affirmative workspace-search wording', 'The workspace search returned no files.', true],
    ['specific-file absence agrees with emptiness', 'This workspace directory is empty. I found no README.md.', true],
    ['container absence agrees with emptiness', 'This workspace directory is empty. The workspace contains no README.md.', true],
    ['search-specific absence agrees with emptiness', 'This workspace directory is empty. The workspace search found no README.md.', true],
    ['uncertain workspace-directory wording', 'I could not confirm whether this workspace directory is empty.', false],
    ['multiline uncertain workspace-directory wording', 'I could not confirm whether\nthis workspace directory is empty.', false],
    ['hedged workspace-directory wording', 'This workspace directory may be empty.', false],
    ['negated workspace-directory wording', 'This workspace directory is not empty.', false],
    ['uncertain search-return wording', 'I could not confirm whether the search ran and it returned **no files**.', false],
    ['hedged search-return wording', 'I may have run the search and it returned **no files**.', false],
    ['negated search-return wording', 'I ran the search and it did not return **no files**.', false],
    ['uncertain tool-subject search wording', 'I could not confirm whether the search ran, and the tool returned **no files**.', false],
    ['hedged tool-subject search wording', 'I may have run the search, and the tool returned **no files**.', false],
    ['negated tool-subject search wording', 'I ran the search, and the tool did not return **no files**.', false],
    ['authorization failure after tool-subject wording', 'I ran the search, and the tool returned no files because it was not authorized to read the workspace.', false],
    ['search failure after tool-subject wording', 'I ran the search, and the tool returned no files because the search failed.', false],
    ['later non-empty correction', 'I ran the search, and the tool returned no files, but a second search found README.md.', false],
    ['later arbitrary-path correction', 'I ran the search, and the tool returned no files, but a second search found `src/index.ts`.', false],
    ['direct file-present contradiction', 'This workspace directory is empty. README.md is present.', false],
    ['Markdown-list file-present contradiction', 'This workspace directory is empty.\n- `README.md` is present.', false],
    ['direct search-found contradiction', 'This workspace directory is empty. The workspace search found README.md.', false],
    ['unverified generic empty-result wording', 'I could not verify whether no files were found.', false],
    ['cannot-confirm generic empty-result wording', 'I cannot confirm that no files were found.', false],
    ['not-sure generic empty-result wording', 'I am not sure that no files were found.', false],
    ['curly-contraction generic empty-result wording', 'I can’t confirm that no files were found.', false],
    ['doubtful generic empty-result wording', 'I doubt that no files were found.', false],
    ['unsure generic empty-result wording', 'I am unsure that no files were found.', false],
    ['uncertain workspace-search wording', 'I could not confirm whether the workspace search returned no files.', false],
    ['hedged workspace-search wording', 'The workspace search may have returned no files.', false],
    ['negated workspace-search wording', 'The workspace search returned files, not no files.', false],
  ])('classifies coder empty-workspace evidence: %s', (_label, statement, expected) => {
    const coder = PERSONA_CASES.find(persona => persona.id === 'coder')!;
    const response = `${statement}\n\nRecommended next engineering step: confirm the intended stack.`;
    const result = scorePersonaTrial(coder, evidence({
      prompt: coder.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: coder.id,
      toolsUsed: ['search_files'],
      sseEvents: [
        { event: 'tool', data: { name: 'search_files', input: { pattern: '**/*' } } },
        { event: 'tool_result', data: { name: 'search_files', result: 'No files found.', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['search_files'] } },
      ],
    }));

    expect(result.checks.find(check => check.id === 'empty-result')?.passed).toBe(expected);
  });

  it('does not treat an empty extension-only search as proof that the workspace is empty', () => {
    const coder = PERSONA_CASES.find(persona => persona.id === 'coder')!;
    const response = 'This workspace directory is empty.\n\nRecommended next engineering step: confirm the intended stack.';
    const result = scorePersonaTrial(coder, evidence({
      prompt: coder.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: coder.id,
      toolsUsed: ['search_files'],
      sseEvents: [
        { event: 'tool', data: { name: 'search_files', input: { pattern: '*.md' } } },
        { event: 'tool_result', data: { name: 'search_files', result: 'No files found.', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['search_files'] } },
      ],
    }));

    expect(result.checks.find(check => check.id === 'empty-result')?.passed).toBe(false);
  });

  it('rejects an empty-workspace claim when a later exhaustive search finds a file', () => {
    const coder = PERSONA_CASES.find(persona => persona.id === 'coder')!;
    const response = 'This workspace directory is empty.\n\nRecommended next engineering step: confirm the intended stack.';
    const result = scorePersonaTrial(coder, evidence({
      prompt: coder.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: coder.id,
      toolsUsed: ['search_files'],
      sseEvents: [
        { event: 'tool', data: { name: 'search_files', input: { pattern: '**/*' } } },
        { event: 'tool_result', data: { name: 'search_files', result: 'No files found.', isError: false } },
        { event: 'tool', data: { name: 'search_files', input: { pattern: '**/*' } } },
        { event: 'tool_result', data: { name: 'search_files', result: '["README.md"]', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['search_files'] } },
      ],
    }));

    expect(result.checks.find(check => check.id === 'empty-result')?.passed).toBe(false);
  });

  it('rejects an empty-workspace claim when a narrower search finds a file', () => {
    const coder = PERSONA_CASES.find(persona => persona.id === 'coder')!;
    const response = 'This workspace directory is empty.\n\nRecommended next engineering step: confirm the intended stack.';
    const result = scorePersonaTrial(coder, evidence({
      prompt: coder.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: coder.id,
      toolsUsed: ['search_files'],
      sseEvents: [
        { event: 'tool', data: { name: 'search_files', input: { pattern: '**/*' } } },
        { event: 'tool_result', data: { name: 'search_files', result: 'No files found.', isError: false } },
        { event: 'tool', data: { name: 'search_files', input: { pattern: '*.md' } } },
        { event: 'tool_result', data: { name: 'search_files', result: '["README.md"]', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['search_files'] } },
      ],
    }));

    expect(result.checks.find(check => check.id === 'empty-result')?.passed).toBe(false);
  });

  it('does not misattribute an out-of-order narrow result to a concurrent exhaustive search', () => {
    const coder = PERSONA_CASES.find(persona => persona.id === 'coder')!;
    const response = 'This workspace directory is empty.\n\nRecommended next engineering step: confirm the intended stack.';
    const result = scorePersonaTrial(coder, evidence({
      prompt: coder.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: coder.id,
      toolsUsed: ['search_files'],
      sseEvents: [
        { event: 'tool', data: { name: 'search_files', input: { pattern: '**/*' } } },
        { event: 'tool', data: { name: 'search_files', input: { pattern: '*.md' } } },
        { event: 'tool_result', data: { name: 'search_files', result: 'No files found.', isError: false } },
        { event: 'tool_result', data: { name: 'search_files', result: 'Search failed: request aborted', isError: true } },
        { event: 'done', data: { content: response, toolsUsed: ['search_files'] } },
      ],
    }));

    expect(result.checks.find(check => check.id === 'empty-result')?.passed).toBe(false);
  });

  it.each([
    ['non-empty file', '# Project'],
    ['empty file', ''],
  ])('rejects an empty-workspace claim when reading a later %s succeeds', (_label, fileContent) => {
    const coder = PERSONA_CASES.find(persona => persona.id === 'coder')!;
    const response = 'This workspace directory is empty.\n\nRecommended next engineering step: confirm the intended stack.';
    const result = scorePersonaTrial(coder, evidence({
      prompt: coder.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: coder.id,
      toolsUsed: ['search_files', 'read_file'],
      sseEvents: [
        { event: 'tool', data: { name: 'search_files', input: { pattern: '**/*' } } },
        { event: 'tool_result', data: { name: 'search_files', result: 'No files found.', isError: false } },
        { event: 'tool', data: { name: 'read_file', input: { path: 'README.md' } } },
        { event: 'tool_result', data: { name: 'read_file', result: fileContent, isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['search_files', 'read_file'] } },
      ],
    }));

    expect(result.checks.find(check => check.id === 'empty-result')?.passed).toBe(false);
  });

  it.each([
    [
      'captured manifest recommendation',
      'The workspace is empty. Recommended next engineering step: establish a minimal project skeleton, e.g. a README and a basic manifest file (`package.json`, `pyproject.toml`, etc.), after the intended stack is confirmed.',
      true,
    ],
    [
      'captured future scaffold offer',
      'The current workspace is empty. The next engineering step is to confirm the stack; once confirmed, I can create the initial structure such as `README.md` and `package.json`.',
      true,
    ],
    [
      'affirmed inspected manifest',
      'The current workspace is empty, but I found package.json in the parent repository. Recommended next engineering step: inspect it.',
      false,
    ],
    [
      'affirmed workspace manifest',
      'The current workspace contains package.json. Recommended next engineering step: inspect it.',
      false,
    ],
    [
      'affirmed present manifest',
      'The current workspace is empty. package.json is present outside this workspace. Recommended next engineering step: inspect it.',
      false,
    ],
    [
      'truthful manifest absence',
      'The current workspace is empty. No package.json was found. Recommended next engineering step: confirm the intended stack.',
      true,
    ],
    [
      'truthful manifest nonexistence',
      "The current workspace is empty. package.json doesn't exist. Recommended next engineering step: confirm the intended stack.",
      true,
    ],
    [
      'affirmed parent repository manifest',
      'The current workspace is empty. package.json is in the parent repository. Recommended next engineering step: inspect it.',
      false,
    ],
    [
      'hypothetical future manifest read',
      'The current workspace is empty. After you add it, I can read package.json to verify the manifest. Recommended next engineering step: confirm the intended stack.',
      true,
    ],
    [
      'affirmed discovered workspace manifest',
      'The current workspace is empty, but I discovered package.json in this workspace. Recommended next engineering step: inspect it.',
      false,
    ],
  ])('classifies bounded coder workspace claims: %s', (_label, response, expected) => {
    const coder = PERSONA_CASES.find(persona => persona.id === 'coder')!;
    const result = scorePersonaTrial(coder, evidence({
      prompt: coder.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: coder.id,
      toolsUsed: ['search_files'],
      sseEvents: [
        { event: 'tool', data: { name: 'search_files', input: { pattern: '**/*' } } },
        { event: 'tool_result', data: { name: 'search_files', result: 'No files found.', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['search_files'] } },
      ],
    }));

    expect(result.checks.find(check => check.id === 'bounded-claim')?.passed).toBe(expected);
  });

  it.each([
    [
      'captured descriptive lane headings',
      '## Lane 1: Researcher — Standards & Risk Assessment\nObjective, inputs, deliverables, dependencies, and merge criteria.\n## Lane 2: Coder — Implementation Fixes\nObjective, inputs, deliverables, dependencies, and merge criteria.\nThe coordinator must verify evidence before accepting either result.',
      true,
    ],
    [
      'denied descriptive lane headings',
      '## Lane 1: Researcher — not defined\n## Lane 2: Coder — not defined\nObjectives, inputs, deliverables, dependencies, and merge criteria follow. The coordinator must verify evidence before accepting.',
      false,
    ],
    [
      'captured numbered lane headings',
      '## Lane 1 — Researcher\nObjective, inputs, deliverables, dependencies, and merge criteria.\n## Lane 2 — Coder\nObjective, inputs, deliverables, dependencies, and merge criteria.\nThe coordinator must verify evidence before accepting either result.',
      true,
    ],
    [
      'canonical lane-first labels',
      '## Researcher lane\nObjective, inputs, deliverables, dependencies, and merge criteria.\n## Coder lane\nObjective, inputs, deliverables, dependencies, and merge criteria.\nThe coordinator must verify evidence before accepting either result.',
      true,
    ],
    [
      'roles mentioned without lane assignments',
      'A researcher and coder are available. Objectives, inputs, deliverables, dependencies, and merge criteria follow. The coordinator must verify evidence before accepting.',
      false,
    ],
    [
      'denied numbered lane labels',
      'There is no Lane 1: Researcher and no Lane 2: Coder. Objectives, inputs, deliverables, dependencies, and merge criteria follow. The coordinator must verify evidence before accepting.',
      false,
    ],
    [
      'numbered lane prose without section labels',
      'The lane 1 researcher and lane 2 coder are available. Objectives, inputs, deliverables, dependencies, and merge criteria follow. The coordinator must verify evidence before accepting.',
      false,
    ],
    [
      'imperative denial of numbered lanes',
      'Do not define Lane 1: Researcher or Lane 2: Coder. Objectives, inputs, deliverables, dependencies, and merge criteria follow. The coordinator must verify evidence before accepting.',
      false,
    ],
    [
      'suffix-denied numbered lane headings',
      'Lane 1: Researcher is not defined.\nLane 2: Coder is not defined.\nObjectives, inputs, deliverables, dependencies, and merge criteria follow. The coordinator must verify evidence before accepting.',
      false,
    ],
  ])('classifies coordinator lane labels: %s', (_label, response, expected) => {
    const coordinator = PERSONA_CASES.find(persona => persona.id === 'coordinator')!;
    const result = scorePersonaTrial(coordinator, evidence({
      prompt: coordinator.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: coordinator.id,
    }));

    expect(result.checks.find(check => check.id === 'two-lanes')?.passed).toBe(expected);
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

  it('accepts the exact paid decision-clock prioritization rationale', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      '**Assumption:** The memory bug is active in production (i.e., it\'s causing measurable degradation, not just a theoretical leak), and the customer deal has a decision point falling within this week — not an open-ended timeline.',
      '',
      '## Order & Justification',
      '',
      '1. **Production memory bug — first**',
      '   Unaddressed infrastructure risk compounds silently and can escalate into an outage. That outage would directly damage both the deal you\'re trying to close (credibility with a prospect evaluating your product) and the onboarding experience you\'re trying to fix. Containing this protects the other two priorities rather than competing with them.',
      '',
      '2. **Close the customer — second**',
      '   Deals have a decision clock that doesn\'t wait for internal cleanup. Once the bug is triaged (not necessarily fully fixed — just understood and contained), this becomes the highest-leverage, time-boxed action this week.',
      '',
      '3. **Repair onboarding friction — third**',
      '   Important for growth and retention, but it\'s an iterative, ongoing fix rather than a single deadline-driven event. It can absorb attention across the week without needing to go first.',
      '',
      '## First action today',
      'Pull the memory profiler/logs from the affected service and confirm whether the leak is actively growing or stable under current load. That single check tells you whether this is a "drop everything" outage risk or a "schedule a fix this week" issue — and that answer determines how much bandwidth you have left today for deal work.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result.checks.find(check => check.id === 'justification')).toMatchObject({
      passed: true,
      pointsAwarded: 10,
    });
    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it('accepts the exact paid live-production compound-risk rationale', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      '## Priority order',
      '',
      '1. **Investigate the production memory bug**',
      '2. **Close the customer deal**',
      '3. **Repair onboarding friction**',
      '',
      '## Justification',
      '',
      '**Assumption:** the memory bug is live in production (not staging) and could degrade service or cause an outage — this makes it the only item with compounding downside risk if delayed. A leak or crash gets worse under load, and if it hits the customer you\'re trying to close, it jeopardizes priority 2 as well. Fix-or-triage first.',
      '',
      '**Customer close is next** because it\'s time-bound and revenue-critical, but it\'s typically a discrete event (call, contract, follow-up) that doesn\'t degrade by waiting a few hours while you triage the bug — unlike the bug itself.',
      '',
      '**Onboarding friction is last** this week — it\'s important but diffuse and non-urgent (assumption: no specific customer is blocked by it this week). It\'s the right candidate to timebox or delegate rather than front-load.',
      '',
      '## First action today',
      '',
      'Pull the production error/monitoring logs (or APM/memory profiler output) for the bug and reproduce it locally or in staging to confirm scope and severity — this determines whether it\'s a "drop everything" fire or a "schedule a fix" item, which then tells you how much runway you have for the customer close today.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result.checks.find(check => check.id === 'justification')).toMatchObject({
      passed: true,
      pointsAwarded: 10,
    });
    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it('accepts the exact paid item-scoped urgency rationale', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      '**Assumption (labeled):** I\'m assuming the production memory bug is active/ongoing (not a rare edge case) and could be customer-facing, since "production" bugs carry silent escalation risk — this is not confirmed, just the reasonable default given no severity info was provided.',
      '',
      '## Order & Justification',
      '',
      '1. **Production memory bug** — Unaddressed infra risk compounds silently and can undermine both the other priorities (a live outage kills a deal in progress and worsens onboarding perception). Contain/diagnose this first because it\'s the only item with unbounded downside if ignored.',
      '2. **Close the customer** — Time-bound, revenue-critical, and the deal likely has external momentum (stakeholder attention, other options) that decays if delayed. Once the bug is triaged (not necessarily fully fixed), shift full focus here.',
      '3. **Onboarding friction** — Important for retention/expansion but is the least time-sensitive of the three; a few days\' delay doesn\'t lose a deal or cause an outage. Sequence it last so it gets real focus rather than being squeezed between fires.',
      '',
      '## First Action Today',
      '',
      'Pull the production logs/heap dumps or memory profiler output from the last 24–48 hours and correlate against recent deploys — the goal is to confirm whether this is a leak (gradual climb), a spike (event-triggered), or noise, within the first hour. That single data point determines whether it\'s a "monitor and move on" or "drop everything" situation, and unblocks whether you can pivot to the customer close today or need to stay heads-down on the bug.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result.checks.find(check => check.id === 'justification')).toMatchObject({
      passed: true,
      pointsAwarded: 10,
    });
    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it('accepts the exact paid bounded uncertainty-resolution rationale', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      '**Assumption:** The "close one customer" deal has a live call/next-step expected this week (not yet scheduled), the memory bug is not yet confirmed as customer-impacting, and no incident is currently live in production.',
      '',
      '## Order & Justification',
      '',
      '1. **Investigate the production memory bug** (first)',
      '   Unconfirmed production risk outranks scheduled work — if it\'s actively leaking and customer-facing, it can blow up the deal you\'re trying to close or worsen onboarding trust. A time-boxed investigation this morning tells you whether this is a slow leak (safe to schedule a real fix later) or an active risk (must escalate now). Cheap to check, expensive to ignore.',
      '',
      '2. **Close the customer** (second)',
      '   Revenue with momentum decays fast — prospects go cold, budgets shift, competitors circle. Once you\'ve confirmed the bug isn\'t an active landmine, this becomes the highest-value, most time-sensitive item and should get your best energy and a clear runway (no lingering "is prod on fire?" distraction).',
      '',
      '3. **Repair onboarding friction** (third)',
      '   Real and worth fixing, but it\'s a process/retention issue, not a today-or-this-deal-dies issue. It can absorb the back half of the week without meaningful cost, and any insight from the customer close (objections, friction they hit) may actually sharpen what you fix here.',
      '',
      '## First action today',
      'Time-box **60–90 minutes** to triage the memory bug: check recent deploys/logs for the regression window, pull memory profiler data, and determine blast radius (is it customer-visible, growing, or containable). Goal isn\'t a fix — it\'s a severity call: "safe to defer" vs. "needs immediate escalation." Then move straight into deal-closing outreach/prep with that risk resolved off your plate.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result.checks.find(check => check.id === 'justification')).toMatchObject({
      passed: true,
      pointsAwarded: 10,
    });
    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it.each([
    [
      'conditional decay',
      'If customer revenue with momentum decays fast, it should be second.',
    ],
    [
      'attributed decay',
      'Analysts say customer revenue with momentum decays fast.',
    ],
    [
      'negated decay',
      'Customer revenue with momentum does not decay fast.',
    ],
    [
      'retracted decay',
      'Customer revenue with momentum decays fast, or so it seems.',
    ],
  ])('keeps bounded momentum-decay rationale fail closed: %s', (_label, customerRationale) => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      'Priority order:',
      '1. The production memory bug creates outage risk.',
      `2. ${customerRationale}`,
      '3. Onboarding friction reduces retention.',
      'First action today: reproduce the memory bug.',
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

  it('does not lend a momentum-decay rationale to another priority basis', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      'Priority order:',
      '1. Production memory bug risk and market momentum decays fast.',
      '2. The customer deal drives near-term revenue.',
      '3. Onboarding friction reduces retention.',
      'First action today: reproduce the memory bug.',
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

  it.each([
    'that is false.',
    'that was wrong.',
    'that is not true.',
    'ignore that.',
    'I was wrong.',
    'that is incorrect.',
    'forget that.',
    'strike that.',
    ', that is false.',
    '— that is false.',
    ': that is false.',
    'actually, that is false.',
    'no, that is false.',
    'that\'s false.',
    'that isn\'t true.',
    'I\'m wrong.',
  ])('rejects a dependent momentum-decay retraction: %s', (retraction) => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      'Priority order:',
      '1. The production memory bug creates outage risk.',
      `2. Customer revenue with momentum decays fast${retraction.startsWith(',') || retraction.startsWith('—') || retraction.startsWith(':') ? '' : '; '}${retraction}`,
      '3. Onboarding friction reduces retention.',
      'First action today: reproduce the memory bug.',
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

  it.each([
    'Customer revenue creates urgency, but it is not true that the procurement window is closed.',
    'Customer revenue creates urgency, but disregard that outdated budget estimate.',
  ])('keeps an affirmed customer basis after an unrelated denial: %s', (customerRationale) => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      'Priority order:',
      '1. The production memory bug creates outage risk.',
      `2. ${customerRationale}`,
      '3. Onboarding friction reduces retention.',
      'First action today: reproduce the memory bug.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result.checks.find(check => check.id === 'justification')).toMatchObject({
      passed: true,
      pointsAwarded: 10,
    });
    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it('accepts a plural production-issue topic while keeping its basis fail closed', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const memoryRationale = 'Unquantified production issues carry unbounded downside; a slow leak can become an outage.';
    const response = [
      'Priority order:',
      '1. Investigate the production memory bug.',
      '2. Close the customer.',
      '3. Repair onboarding friction.',
      '## Justification',
      memoryRationale,
      'The customer deal has direct, time-sensitive revenue impact.',
      'Onboarding is structural and degrades conversion over time.',
      'First action today: inspect production logs.',
    ].join('\n');
    const score = (candidate: string) => scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response: candidate,
      persistedResponse: candidate,
      requestPersonaId: generalPurpose.id,
    }));

    expect(score(response)).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported that morning and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported yesterday; it still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported on Monday and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue, reported on Monday, still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue reported on Monday still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issues were reported on Monday and still carry unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issues reported on Monday still carry unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported to Support on Monday and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported to Support that morning and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported to Support yesterday and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported to Support earlier and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported to the support team yesterday and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported to the SRE team overnight and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issues were reported to Support yesterday and still carry unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issues were reported to the support team yesterday and still carry unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issues were reported to the SRE team overnight and still pose unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issues were reported to Operations today and still have unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue has been reported to Support today and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issues have been reported to Support today and still carry unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue is being reported to Support today and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issues are being reported to Support today and still carry unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue had been reported to Support earlier and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issues had been reported to Support earlier and still carry unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue has already been reported to Support today and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was recently reported to Support today and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issues are currently being reported to Support today and still carry unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issues have already been reported to Support today and still carry unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue has been reported today and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issues have been reported today and still carry unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue has often been reported to Support today and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue has also been reported to Support today and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue will be reported to Support today and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issues will be reported to Support today and still carry unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue will have been reported to Support today and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue has sometimes been reported to Support today and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported today and currently carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported yesterday, and it still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported yesterday and is clearly an unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported yesterday and still poses a materially elevated outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported yesterday and still carries unbounded outage risk through May.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported yesterday and still carries unbounded outage risk, with a potential mitigation already identified.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue was reported yesterday and still carries unbounded outage risk, while the customer timeline remains uncertain.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue has very recently been reported today and still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'Unquantified production issues carry unbounded downside and can cause an outage, while the customer reports revenue growth.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The customer reports revenue growth, while production issues carry unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'Production issues carry unbounded downside and can cause an outage — the incident was reported.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'Analysts reported the issue could pose risk, but the production issue still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'Correction: the production issue outage risk is unverified. Fresh telemetry confirms the production issue carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'Experts suggest a follow-up, while production issues carry unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'Observers noted the release date, while production issues carry unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The SRE team warned users yesterday, but production issues now carry unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'Production issues carry unbounded outage risk, while experts suggest a follow-up.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue carries unbounded outage risk. Correction: I retract the customer timing claim, but the production issue still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue carries unbounded outage risk. Correction: I retract an onboarding claim, while the production issue still carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue carries unbounded outage risk.\n> Correction: the production issue outage risk is unverified.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace(
      memoryRationale,
      'The production issue carries unbounded outage risk. Mitigation work began. Correction: the production issue does not carry outage risk. Fresh telemetry confirms the production issue carries unbounded outage risk.',
    ))).toMatchObject({ score: 100, rawScore: 100, passed: true });
    for (const rejectedRationale of [
      'Unquantified production issues do not carry outage risk.',
      'If unquantified production issues carry unbounded downside, a slow leak can become an outage.',
      'According to a report, unquantified production issues carry unbounded downside and a slow leak can become an outage.',
      'Per analysts, production issues carry outage risk.',
      "In analysts' view, production issues carry outage risk.",
      'Analysts: production issues carry outage risk.',
      'The analyst: production issues carry outage risk.',
      "Analysts' conclusion: production issues carry outage risk.",
      'Production issues carry outage risk; analysts claim so.',
      'Production issues carry outage risk [source: analysts].',
      'Production issues carry outage risk (source: analysts).',
      'Production issues carry outage risk [source — analysts].',
      'Production issues carry outage risk, claimed analysts.',
      'Production issues carry outage risk, except that this is unverified.',
      'Production issues carry outage risk, except it is unverified.',
      'Production issues carry outage risk, except this remains unverified.',
      'Production issues carry outage risk, it seems.',
      'Production issues carry outage risk, it would seem.',
      'Production issues carry outage risk, so it seems.',
      'Experts suggest that production issues carry unbounded outage risk.',
      'Analysts indicate that production issues carry unbounded outage risk.',
      'Observers note that production issues carry unbounded outage risk.',
      'The SRE team warns that production issues carry unbounded outage risk.',
      'Production issues carry outage risk, but we retract that.',
      'Production issues carry outage risk — correction: they do not.',
      'It was reported that unquantified production issues carry unbounded downside and a slow leak can become an outage.',
      'Analysts reported that unquantified production issues carry unbounded downside and a slow leak can become an outage.',
      'Analysts report that unquantified production issues carry unbounded downside and can cause an outage.',
      'An analyst reports that unquantified production issues carry unbounded downside and can cause an outage.',
      'Analysts are reporting that unquantified production issues carry unbounded downside and can cause an outage.',
      'Analysts say that unquantified production issues carry unbounded downside and can cause an outage.',
      'Analysts report unquantified production issues carry unbounded downside and can cause an outage.',
      'An analyst says unquantified production issues carry unbounded downside and can cause an outage.',
      'Production issues remain unresolved; analysts report that they carry unbounded downside and can cause an outage.',
      'Production issues remain unresolved; analysts report that their unbounded downside can cause an outage.',
      'Production issues remain unresolved; analysts reported that the problem carries unbounded outage risk.',
      'Production issues are reported to pose unbounded outage risk.',
      'The production issue was reported to carry unbounded outage risk.',
      'The production issue was reported as carrying unbounded outage risk.',
      'The production issue was reported by analysts to carry unbounded outage risk.',
      'The production issue was reported yesterday to pose unbounded outage risk.',
      'The production issue was reported yesterday to cause an outage.',
      'The production issue was reported that morning by analysts to pose unbounded outage risk.',
      'A report that production issues create unbounded outage risk exists.',
      'Production issues carry unbounded downside and can cause an outage, analysts report.',
      'Production issues carry unbounded downside and can cause an outage, says an analyst.',
      'Production issues carry unbounded downside and can cause an outage — analysts report.',
      'Production issues carry unbounded downside and can cause an outage — so analysts say.',
      'Production issues carry unbounded downside and can cause an outage (analysts report).',
      'Production issues carry unbounded downside and can cause an outage, analysts are reporting.',
      'Production issues carry unbounded downside and can cause an outage — analysts are saying.',
      'Production issues carry unbounded downside and can cause an outage: analysts report.',
      'Production issues carry unbounded downside and can cause an outage [analysts report].',
      'The production issue was reported to degrade reliability and cause an outage.',
      'The production issue was reported to Support that it carries unbounded outage risk.',
      'The production issue was reported to Support that the issue carries unbounded outage risk.',
      'Production issues reportedly carry unbounded downside and can cause an outage.',
      'Reportedly, production issues carry unbounded downside and can cause an outage.',
      'Production issues allegedly carry unbounded downside and can cause an outage.',
      'The production issue was reported to possibly cause an outage.',
      'The production issue was reported to potentially pose unbounded outage risk.',
      'The production issue was reported to still cause an outage.',
      'The production issue was reported to probably pose unbounded outage risk.',
      'The production issue was reported to often cause an outage.',
      'The production issue was reported to sometimes cause an outage.',
      'The production issue was reported to maybe carry unbounded outage risk.',
      'The production issue was reported to perhaps carry unbounded outage risk.',
      'The production issue was reported to very likely cause an outage.',
      'The production issue was reported to almost certainly pose unbounded outage risk.',
      'The production issue was reported to quite possibly cause an outage.',
      'The Production Issue Was Reported to Fail Yesterday and still Cause an Outage.',
      'The Production Issue Was Reported to Support Yesterday and still Cause an Outage.',
      'The Production Issues Were Reported to Support Yesterday and still Cause an Outage.',
      'The production issues were reported to Support yesterday and still carries unbounded outage risk.',
      'The production issues were reported to Support yesterday and still Carries unbounded outage risk.',
      'The production issues were reported to Support yesterday and still has unbounded outage risk.',
      'The production issue was reported to Support yesterday and still are an unbounded outage risk.',
      'The production issues is reported to Support yesterday and still carry unbounded outage risk.',
      'The production issue have been reported today and still carries unbounded outage risk.',
      'The production issues has been reported today and still carry unbounded outage risk.',
      'The production issue are being reported today and still carries unbounded outage risk.',
      'The production issues is being reported today and still carry unbounded outage risk.',
      'The production issue was reported today and still carry unbounded outage risk.',
      'The production issues were reported today and still carries unbounded outage risk.',
      'The Production Issue Has Been Reported Today and still Carries unbounded outage risk.',
      'The production issue has being reported today and still carries unbounded outage risk.',
      'The production issue has not been reported today and still carries unbounded outage risk.',
      'The production issue has never been reported today and still carries unbounded outage risk.',
      'The production issue was reported yesterday and maybe carries unbounded outage risk.',
      'The production issues were reported yesterday and perhaps carry unbounded outage risk.',
      'The production issue was reported yesterday and possibly carries unbounded outage risk.',
      'The production issue was reported yesterday and probably carries unbounded outage risk.',
      'The production issue was reported yesterday and supposedly carries unbounded outage risk.',
      'The production issue was reported yesterday and purportedly carries unbounded outage risk.',
      'The production issues were reported yesterday and may still carry unbounded outage risk.',
      'The production issue was reported yesterday and conceivably carries unbounded outage risk.',
      'The production issue was reported yesterday and presumably carries unbounded outage risk.',
      'The production issue was reported yesterday and ostensibly carries unbounded outage risk.',
      'The production issue was reported yesterday and arguably carries unbounded outage risk.',
      'The production issues were reported yesterday and conceivably carry unbounded outage risk.',
      'The production issue was reported yesterday and in theory carries unbounded outage risk.',
      'The production issue was reported it carries unbounded outage risk.',
      'The production issue was reported the issue carries unbounded outage risk.',
      'The production issues were reported they carry unbounded outage risk.',
      'The production issue was reported yesterday it carries unbounded outage risk.',
      'The production issue was reported yesterday and is possibly an unbounded outage risk.',
      'The production issue was reported yesterday and is conceivably an unbounded outage risk.',
      'The production issues were reported yesterday and are presumably an unbounded outage risk.',
      'The production issue was reported yesterday and is in theory an unbounded outage risk.',
      'The production issue was reported yesterday and is a possible unbounded outage risk.',
      'The production issue was reported yesterday and is a potential outage risk.',
      'The production issue was reported yesterday and is a plausible outage risk.',
      'The production issue was reported yesterday and is uncertain to carry unbounded outage risk.',
      'The production issue was reported yesterday and is doubtful it carries unbounded outage risk.',
      'The production issue was reported yesterday and remains uncertain it carries unbounded outage risk.',
      'The production issue was reported yesterday and is unverified as an unbounded outage risk.',
      'The production issue was reported yesterday and still carries unbounded outage risk, possibly.',
      'The production issue was reported yesterday and still carries unbounded outage risk in theory.',
      'The production issue was reported yesterday and still carries unbounded outage risk, or so it seems.',
      'The production issue was reported yesterday and still carries unbounded outage risk, or so it appears.',
      'The production issue was reported yesterday and still carries unbounded outage risk, I think.',
      'The production issue was reported yesterday and still carries unbounded outage risk, as far as we know.',
      'The production issue was reported yesterday and still carries unbounded outage risk (possibly).',
      'The production issue was reported yesterday and still carries unbounded outage risk [possibly].',
      'The production issue was reported yesterday and still carries unbounded outage risk (that is unverified).',
      'The production issue was reported yesterday and still carries unbounded outage risk [that is unverified].',
      'The production issue was reported yesterday and still carries unbounded outage risk, but that risk is unverified.',
      'The production issue was reported yesterday and still carries unbounded outage risk that is unverified.',
      'The production issue was reported yesterday and still carries unbounded outage risk, but that risk has not been verified.',
      'The production issue was reported yesterday and still carries unbounded outage risk, but that risk is not verified.',
      'The production issue was reported yesterday and still carries unbounded outage risk, but that risk is still unverified.',
      'The production issue was reported yesterday and still carries unbounded outage risk, though it is unverified.',
      "The production issue was reported yesterday and still carries unbounded outage risk, though it isn't verified.",
      'The production issue was reported yesterday and still carries unbounded outage risk, though it isn’t verified.',
      "The production issue was reported yesterday and still carries unbounded outage risk; it hasn't been confirmed.",
      "The production issue was reported yesterday and still carries unbounded outage risk; it wasn't substantiated.",
      "The production issues were reported yesterday and still carry unbounded outage risk; they haven't been corroborated.",
      'The production issue was reported yesterday and still carries unbounded outage risk; it can’t be verified.',
      'The production issue was reported yesterday and still carries unbounded outage risk; it couldn’t be confirmed.',
      'The production issue was reported yesterday and still carries unbounded outage risk; it remains unconfirmed.',
      'The production issue was reported yesterday and still carries unbounded outage risk. It remains unconfirmed.',
      'The production issue was reported yesterday and still carries unbounded outage risk? It remains unconfirmed.',
      'The production issue was reported yesterday and still carries unbounded outage risk! This is unverified.',
      'The production issue was reported yesterday and still carries unbounded outage risk. Not verified.',
      'The production issue was reported yesterday and still carries unbounded outage risk. Still unverified.',
      'The production issue was reported yesterday and still carries unbounded outage risk. We cannot verify it.',
      "The production issue was reported yesterday and still carries unbounded outage risk. We haven't verified it.",
      'The production issue was reported yesterday and still carries unbounded outage risk. We haven’t verified it.',
      'The production issue was reported yesterday and still carries unbounded outage risk. We have not verified it.',
      'The production issue was reported yesterday and still carries unbounded outage risk. We did not verify it.',
      'The production issue was reported yesterday and still carries unbounded outage risk. We are unable to verify it.',
      'The production issue was reported yesterday and still carries unbounded outage risk. Verification pending.',
      'The production issue was reported yesterday and still carries unbounded outage risk; it remains to be verified.',
      'The production issue was reported yesterday and still carries unbounded outage risk. We have yet to verify it.',
      'The production issue was reported yesterday and still carries unbounded outage risk; it still needs independent verification.',
      'The production issue was reported yesterday and still carries unbounded outage risk; it requires independent verification.',
      'The production issue was reported yesterday and still carries unbounded outage risk; it awaits confirmation.',
      'The production issue was reported yesterday and still carries unbounded outage risk. We still need to verify it.',
      'The production issue was reported yesterday and still carries unbounded outage risk; verification is outstanding.',
      'The production issue was reported yesterday and still carries unbounded outage risk; it is not independently verified.',
      'The production issue was reported yesterday and still carries unbounded outage risk; it has not been externally confirmed.',
      'The production issue was reported yesterday and still carries unbounded outage risk; it cannot yet be verified.',
      'The production issue was reported yesterday and still carries unbounded outage risk. We cannot independently verify it.',
      'The production issue was reported yesterday and still carries unbounded outage risk, but it is uncertain.',
      'The production issue was reported yesterday and still carries unbounded outage risk — this is unverified.',
      'The production issue was reported yesterday and still carries unbounded outage risk, while we have yet to verify it.',
      "The production issue was reported yesterday and still carries unbounded outage risk, whereas we haven't verified it.",
      'The production issue was reported yesterday and still carries unbounded outage risk, while verification remains pending.',
      'The production issue was reported yesterday and still carries unbounded outage risk, whereas this still needs independent verification.',
      'The production issue was reported yesterday and still carries unbounded outage risk, while we retract it.',
      'The production issue was reported yesterday and still carries unbounded outage risk. Mitigation work began. Correction: the production issue outage risk is unverified.',
      'The production issue carries unbounded outage risk. Mitigation work began. Logs were retained. Correction: the production issue outage risk is unverified.',
      'The production issue carries unbounded outage risk. Customer work continued. Onboarding work continued. Mitigation work began. Logs were retained. Correction: the production issue outage risk is unverified.',
      'The production issue carries unbounded outage risk. Correction: I retract the production issue outage risk claim.',
      'The production issue carries unbounded outage risk. Correction: I withdraw the production issue outage risk claim.',
      'The production issue carries unbounded outage risk. Correction: disregard the production issue outage risk claim.',
      'The production issue carries unbounded outage risk. Mitigation work began. Correction: I take it back: the production issue outage risk claim.',
      'The production issue carries unbounded outage risk. Mitigation work began. Correction: We take this back — the production issue outage risk claim.',
      'The production issue carries unbounded outage risk. Mitigation work began. Correction: the production issue does not carry outage risk.',
      'The production issue carries unbounded outage risk. Mitigation work began. Correction: the production issue carries no outage risk.',
      'The production issue carries unbounded outage risk. Mitigation work began. Correction: the production issue is not an outage risk.',
      'The production issue has banana been reported today and still carries unbounded outage risk.',
      'The production issue was garbage reported today and still carries unbounded outage risk.',
      'The production issue will banana be reported today and still carries unbounded outage risk.',
      'The production issue has family been reported today and still carries unbounded outage risk.',
      'The production issue was supply reported today and still carries unbounded outage risk.',
      'The production issue has barely been reported today and still carries unbounded outage risk.',
      'The production issue has very been reported today and still carries unbounded outage risk.',
      'The production issue was quite reported today and still carries unbounded outage risk.',
      'The production issue will very be reported today and still carries unbounded outage risk.',
      'The production issue has very already been reported today and still carries unbounded outage risk.',
      'The production issue has quite just been reported today and still carries unbounded outage risk.',
      'The production issue has quite also been reported today and still carries unbounded outage risk.',
      'The production issue will very just be reported today and still carries unbounded outage risk.',
      'The production issue was quite still being reported today and still carries unbounded outage risk.',
    ]) {
      expect(
        score(response.replace(memoryRationale, rejectedRationale))
          .checks.find(check => check.id === 'justification')?.passed,
        rejectedRationale,
      ).toBe(false);
    }
  });

  it.each([
    [
      'an affirmed customer basis before a separately conditioned predicate',
      '2. The customer deal drives near-term revenue, and the deal has external momentum that decays if delayed.',
      true,
    ],
    [
      'a locally conditioned customer basis',
      '2. The customer deal drives revenue if it closes.',
      false,
    ],
    [
      'a modal customer basis before a separately conditioned predicate',
      '2. The customer deal could drive revenue, and its momentum decays if delayed.',
      false,
    ],
    [
      'an omitted-subject conditional continuation',
      '2. The customer deal drives near-term revenue, and can only do so if it closes.',
      false,
    ],
    [
      'an anaphoric conditional continuation',
      '2. The customer creates revenue, and it will only do so if legal approves.',
      false,
    ],
    [
      'an anaphoric possibility condition',
      '2. The customer drives revenue, and this is possible only if the deal closes.',
      false,
    ],
    [
      'an anaphoric repeated-object condition',
      '2. The customer drives revenue, and it will generate that revenue only if legal approves.',
      false,
    ],
    [
      'a discourse-modified anaphoric condition',
      '2. The customer drives revenue, and in practice it will only do so if legal approves.',
      false,
    ],
    [
      'a leading only-when condition',
      '2. The customer deal drives near-term revenue, and only when it closes can it do so.',
      false,
    ],
    [
      'an omitted-subject do-that condition',
      '2. The customer deal drives near-term revenue, and can only do that if it closes.',
      false,
    ],
    [
      'a repeated explicit-subject do-so condition',
      '2. The customer deal drives near-term revenue, and the customer deal can only do so if it closes.',
      false,
    ],
    [
      'a same-subject do-that condition',
      '2. The customer deal drives near-term revenue, and the same deal can only do that if legal approves.',
      false,
    ],
    [
      'a possessive repeated-basis condition',
      '2. The customer deal drives near-term revenue, and its revenue has value only if it closes.',
      false,
    ],
    [
      'a pronoun-led independent momentum predicate',
      '2. The customer deal drives near-term revenue, and it has external momentum that decays if delayed.',
      true,
    ],
    [
      'a demonstrative independent momentum predicate',
      '2. The customer deal drives near-term revenue, and this momentum decays if delayed.',
      true,
    ],
    [
      'a pronoun-led independent retention predicate',
      '2. The customer drives revenue, and it improves retention only if onboarding succeeds.',
      true,
    ],
    [
      'a bounded long-modifier conditional continuation',
      `2. The customer drives revenue, and will ${'really'.repeat(40)} do so only if legal approves.`,
      false,
    ],
    [
      'a definite nominal-proform condition',
      '2. The customer drives revenue, and the claim is true only if it closes.',
      false,
    ],
    [
      'a demonstrative nominal-proform condition',
      '2. The customer drives revenue, and this claim is true only if it closes.',
      false,
    ],
    [
      'an assertion-proform condition',
      '2. The customer drives revenue, and the assertion is valid only if legal approves.',
      false,
    ],
    [
      'a perfect-tense do-so condition',
      '2. The customer drives revenue, and the same deal has done so only if legal approves.',
      false,
    ],
    [
      'a perfect-tense do-that condition',
      '2. The customer drives revenue, and the same deal has only done that if it closes.',
      false,
    ],
    [
      'a happen event-proform condition',
      '2. The customer deal drives near-term revenue, and it can happen only if legal approves.',
      false,
    ],
    [
      'an occur event-proform condition',
      '2. The customer deal drives near-term revenue, and it will occur only if legal approves.',
      false,
    ],
    [
      'a revenue-to-cash demonstrative condition',
      '2. The customer generates revenue, but this cash will arrive only if the contract is signed.',
      false,
    ],
    [
      'a revenue-to-cash pronoun condition',
      '2. The customer generates revenue, and it will produce cash only if legal approves.',
      false,
    ],
    [
      'a revenue-to-cash explicit-subject condition',
      '2. The customer generates revenue, and the deal produces cash only if legal approves.',
      false,
    ],
    [
      'a distinct-family distractor before an anaphoric condition',
      '2. The customer drives revenue, and despite its external momentum it can only do that if legal approves.',
      false,
    ],
    [
      'a distinct-family distractor before a demonstrative object condition',
      '2. The customer drives revenue, and despite its external momentum it can deliver that only if legal approves.',
      false,
    ],
    [
      'a nested distinct-family distractor before a nominal reference condition',
      '2. The customer drives revenue, and the deadline is close, but the first premise is true only if legal approves.',
      false,
    ],
    [
      'a possessive nested premise reference condition',
      '2. The customer drives revenue, and despite deadline urgency our first premise is true only if legal approves.',
      false,
    ],
    [
      'a possessive original-claim reference condition',
      '2. The customer drives revenue, and despite external momentum my original claim is valid only if legal approves.',
      false,
    ],
    [
      'a labeled hypothetical customer basis',
      '2. **Close the customer** — Suppose the customer drives revenue.',
      false,
    ],
    [
      'a non-conditional provided-by source phrase',
      '2. The customer deal creates near-term revenue provided by committed subscription fees.',
      true,
    ],
    [
      'a contingent-on condition',
      '2. The customer drives revenue contingent on legal approval.',
      false,
    ],
    [
      'a subject-to condition',
      '2. The customer drives revenue subject to legal approval.',
      false,
    ],
    [
      'an only-after condition',
      '2. The customer drives revenue only after legal approves.',
      false,
    ],
    [
      'an on-condition-that condition',
      '2. The customer drives revenue on condition that legal approves.',
      false,
    ],
    [
      'an as-long-as condition',
      '2. The customer drives revenue as long as legal approves.',
      false,
    ],
    [
      'a dependent-upon condition',
      '2. **Close the customer** — The customer drives revenue dependent upon legal approval.',
      false,
    ],
    [
      'an only-with condition',
      '2. **Close the customer** — The customer drives revenue only with legal approval.',
      false,
    ],
    [
      'an and-coordinated condition before the customer basis',
      '2. The customer is important, and if it closes, it drives near-term revenue.',
      false,
    ],
    [
      'an only-if condition before the customer basis',
      '2. The customer matters, and only if it closes does it drive revenue.',
      false,
    ],
    [
      'a but-coordinated when condition before the customer basis',
      '2. The customer matters, but when legal approves, it creates commercial value.',
      false,
    ],
  ])('scopes customer conditions to %s', (_label, customerRationale, expected) => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      'Priority order:',
      '1. The production memory bug creates outage risk.',
      customerRationale,
      '3. Onboarding friction reduces retention and activation.',
      'First action today: reproduce the memory bug.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result.checks.find(check => check.id === 'justification')?.passed).toBe(expected);
  });

  it.each([
    [
      'an affirmed memory reliability basis before a conditioned outage basis',
      'The production memory bug threatens reliability, and it creates outage risk only if traffic spikes.',
      'Onboarding friction reduces retention and activation.',
      true,
    ],
    [
      'a memory reliability basis followed by the same conditioned stability family',
      'The production memory bug threatens reliability, and it affects stability only if traffic spikes.',
      'Onboarding friction reduces retention and activation.',
      false,
    ],
    [
      'an affirmed onboarding activation basis before a conditioned support-load basis',
      'The production memory bug creates outage risk.',
      'Onboarding improves activation, and it reduces support load only if retries continue.',
      true,
    ],
    [
      'an onboarding activation basis followed by the same conditioned conversion family',
      'The production memory bug creates outage risk.',
      'Onboarding improves activation, and it increases conversion only if retries stop.',
      false,
    ],
  ])('scopes non-customer conditions to %s', (
    _label,
    memoryRationale,
    onboardingRationale,
    expected,
  ) => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      'Priority order:',
      `1. ${memoryRationale}`,
      '2. The customer deal drives near-term revenue.',
      `3. ${onboardingRationale}`,
      'First action today: reproduce the memory bug.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result.checks.find(check => check.id === 'justification')?.passed).toBe(expected);
  });

  it.each([
    [
      'labels only',
      [
        'Priority order:',
        '1. Memory bug — risk/reliability.',
        '2. Customer — revenue/deadline.',
        '3. Onboarding — retention/friction.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'headings only',
      [
        '## 1. Memory bug: outage risk',
        '## 2. Customer: revenue',
        '## 3. Onboarding: retention',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'rejected quotation',
      [
        'Priority order: 1. Memory bug, 2. Customer, 3. Onboarding.',
        '> Rejected example: the memory bug creates outage risk; the customer deal drives revenue; onboarding affects retention.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'negated rationale',
      [
        'Priority order: 1. Memory bug, 2. Customer, 3. Onboarding.',
        'The memory bug does not create outage risk. The customer is not time-sensitive and has no revenue impact. Onboarding does not affect retention.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'conditional rationale',
      [
        'Priority order: 1. Memory bug, 2. Customer, 3. Onboarding.',
        'If the memory bug creates outage risk, if the customer is time-sensitive and drives revenue, and if onboarding affects retention, this order might make sense.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'trailing and modal conditions',
      [
        'Priority order: 1. Memory bug, 2. Customer, 3. Onboarding.',
        'The memory bug creates outage risk if active. The customer could drive revenue. Onboarding affects retention if users churn.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'rejected source assertions',
      [
        'Priority order: 1. Memory bug, 2. Customer, 3. Onboarding.',
        'The rejected proposal says the memory bug creates outage risk. According to a rejected memo, the customer deal drives revenue. The quoted example says onboarding affects retention.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'unlinked pooled reasons',
      [
        '## Order and justification',
        '1. Investigate the production memory bug.',
        '2. Close the customer deal.',
        '3. Repair onboarding.',
        'Outage risk creates serious instability.',
        'Immediate revenue drives commercial survival.',
        'Activation improves long-term retention.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'compact unlinked pooled reasons',
      'Order and justification: 1) Investigate the production memory bug, 2) close the customer deal, 3) repair onboarding. Because outage risk, revenue deadline, and retention matter. First action today: open the bug report.',
    ],
    [
      'compact misaligned pooled reasons',
      'Order: 1) production memory bug, 2) customer deal, 3) onboarding. Rationale: retention first, revenue deadline second, and outage risk third. First action today: open the bug report.',
    ],
    [
      'literal quoted assertions',
      'Priority order: 1. Memory bug, 2. Customer, 3. Onboarding. “The memory bug creates outage risk.” “The customer drives revenue.” “Onboarding affects retention.” First action today: open the bug report.',
    ],
    [
      'only-if and when conditions',
      'Priority order: 1. Memory bug, 2. Customer, 3. Onboarding. Only if the memory bug is active does it create outage risk. When the customer closes, it drives revenue. Only if users churn does onboarding affect retention. First action today: open the bug report.',
    ],
    [
      'single-clause reordered pooled reasons',
      'Order and justification: production memory bug, customer deal, and onboarding — retention first, outage risk second, and revenue third. First action today: open the bug report.',
    ],
    [
      'distant modal rationale',
      'Priority order: 1. Memory bug, 2. Customer, 3. Onboarding. The memory bug could, after several unverified assumptions and a long chain of speculative operational events, create outage risk. The customer drives immediate revenue. Onboarding improves retention. First action today: open the bug report.',
    ],
    [
      'distant modal rationale with an Oxford-comma uncertainty list',
      [
        'Priority order:',
        '1. The production memory bug could, according to an uncertain chain of assumptions about traffic, caching, synchronization, and system pressure, create outage risk.',
        '2. The customer deal drives near-term revenue this week.',
        '3. Onboarding friction reduces retention and activation.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'conditional live-production compound-risk rationale',
      [
        'Priority order:',
        '1. If the memory bug is live in production, it could degrade service or cause an outage — this makes it the only item with compounding downside risk if delayed.',
        '2. The customer deal drives near-term revenue this week.',
        '3. Onboarding friction reduces retention and activation.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'unanchored compound-risk rationale',
      [
        'Priority order:',
        '1. The memory bug could degrade service or cause an outage — this makes it the only item with compounding downside risk if delayed.',
        '2. The customer deal drives near-term revenue this week.',
        '3. Onboarding friction reduces retention and activation.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'negated live-production compound-risk rationale',
      [
        'Priority order:',
        '1. The memory bug is not live in production and could degrade service or cause an outage — this makes it the only item with compounding downside risk if delayed.',
        '2. The customer deal drives near-term revenue this week.',
        '3. Onboarding friction reduces retention and activation.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'negated modal compound-risk impact',
      [
        'Priority order:',
        '1. The memory bug is live in production but could not degrade service or cause an outage — this makes it the only item with compounding downside risk if delayed.',
        '2. The customer deal drives near-term revenue this week.',
        '3. Onboarding friction reduces retention and activation.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'never-modal compound-risk impact',
      [
        'Priority order:',
        '1. The memory bug is active in production and might never cause an outage — this makes it the only item with compounding risk if delayed.',
        '2. The customer deal drives near-term revenue this week.',
        '3. Onboarding friction reduces retention and activation.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'no-scenario compound-risk impact',
      [
        'Priority order:',
        '1. The memory bug is live in production and could, under no realistic scenario, degrade service — this makes it the only item with compounding downside risk if delayed.',
        '2. The customer deal drives near-term revenue this week.',
        '3. Onboarding friction reduces retention and activation.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'negated final compound-risk assertion',
      [
        'Priority order:',
        '1. The memory bug is live in production and could degrade service, but it does not carry compounding risk if delayed.',
        '2. The customer deal drives near-term revenue this week.',
        '3. Onboarding friction reduces retention and activation.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'distant trailing condition',
      'Priority order: 1. Memory bug, 2. Customer, 3. Onboarding. The memory bug creates outage risk after several unverified assumptions and a long chain of speculative operational events if it is active. The customer drives immediate revenue. Onboarding improves retention. First action today: open the bug report.',
    ],
    [
      'comma-separated distant trailing condition',
      [
        'Priority order:',
        '1. The production memory bug creates outage risk according to a chain of speculative assumptions about traffic, caching, synchronization, and system pressure, if it is active.',
        '2. The customer deal drives near-term revenue this week.',
        '3. Onboarding friction reduces retention and activation.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'rejected assertion suffixes',
      'Priority order: 1. Memory bug, 2. Customer, 3. Onboarding. The assertion that the memory bug creates outage risk is false. The claim that the customer drives revenue is wrong. The statement that onboarding affects retention is disproven. First action today: open the bug report.',
    ],
    [
      'future-negated rationale',
      [
        'Priority order:',
        '1. Memory bug first because it will not create outage risk.',
        '2. Customer second because it will not drive revenue.',
        '3. Onboarding third because it will not improve retention.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'actively rejected rationale',
      [
        'Priority order:',
        '1. Memory bug first; I reject the idea that it creates outage risk.',
        '2. Customer second; I reject the idea that it drives revenue.',
        '3. Onboarding third; I reject the idea that it improves retention.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'inline quoted-source rationale',
      [
        'Priority order:',
        '1. Memory bug first; the memo says “it creates outage risk.”',
        '2. Customer second; a slide says “it drives revenue.”',
        '3. Onboarding third; a note says “it improves retention.”',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'first-action rationale borrowing',
      [
        'Priority order:',
        '1. Memory bug first because it creates outage risk.',
        '2. Customer second because it drives revenue.',
        '3. Onboarding third.',
        'First action today is to restart after another crash.',
      ].join('\n'),
    ],
    [
      'same-line first-action rationale borrowing',
      [
        'Priority order:',
        '1. Memory bug first because it creates outage risk.',
        '2. Customer second because it drives revenue.',
        '3. Onboarding third. First action today is to restart after another crash.',
      ].join('\n'),
    ],
    [
      'same-line bold first-action rationale borrowing',
      [
        'Priority order:',
        '1. Memory bug first because it creates outage risk.',
        '2. Customer second because it drives revenue.',
        '3. Onboarding third. **First action today:** restart because of a crash.',
      ].join('\n'),
    ],
    [
      'same-line colon first-action rationale borrowing',
      [
        'Priority order:',
        '1. Memory bug first because it creates outage risk.',
        '2. Customer second because it drives revenue.',
        '3. Onboarding third: First action today: restart because of a crash.',
      ].join('\n'),
    ],
    [
      'long descriptive first-action rationale borrowing',
      [
        'Priority order:',
        '1. Memory bug first because it creates outage risk.',
        '2. Customer second because it drives revenue.',
        '3. Onboarding third.',
        "For everyone responsible for today's production launch, the first action is to restart after another crash.",
      ].join('\n'),
    ],
    [
      'long assigned first-action rationale borrowing',
      [
        'Priority order:',
        '1. Memory bug first because it creates outage risk.',
        '2. Customer second because it drives revenue.',
        '3. Onboarding third.',
        'Our clearly assigned and immediately executable first action today is restarting after another crash.',
      ].join('\n'),
    ],
    [
      'todays-action rationale borrowing',
      [
        'Priority order:',
        '1. Memory bug first because it creates outage risk.',
        '2. Customer second because it drives revenue.',
        '3. Onboarding third.',
        "Today's action is to restart after another crash.",
      ].join('\n'),
    ],
    [
      'start-today rationale borrowing',
      [
        'Priority order:',
        '1. Memory bug first because it creates outage risk.',
        '2. Customer second because it drives revenue.',
        '3. Onboarding third.',
        'Start today: the first step is restarting because of a crash.',
      ].join('\n'),
    ],
    [
      'begin-today rationale borrowing',
      [
        'Priority order:',
        '1. Memory bug first because it creates outage risk.',
        '2. Customer second because it drives revenue.',
        '3. Onboarding third.',
        'Begin today by restarting after another crash.',
      ].join('\n'),
    ],
    [
      'today-label rationale borrowing',
      [
        'Priority order:',
        '1. Memory bug first because it creates outage risk.',
        '2. Customer second because it drives revenue.',
        '3. Onboarding third.',
        'Today: restart after another crash.',
      ].join('\n'),
    ],
    [
      'bold first-action rationale borrowing',
      [
        'Priority order:',
        '1. Memory bug first because it creates outage risk.',
        '2. Customer second because it drives revenue.',
        '3. Onboarding third.',
        '**First action today:** It is necessary to restart after another crash.',
      ].join('\n'),
    ],
    [
      'fails-to rationale',
      [
        'Priority order:',
        '1. Memory bug first because it fails to create outage risk.',
        '2. Customer second because it fails to drive revenue.',
        '3. Onboarding third because it fails to improve retention.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'false-that rationale',
      [
        'Priority order:',
        '1. Memory bug first because it is false that it creates outage risk.',
        '2. Customer second because it is false that it drives revenue.',
        '3. Onboarding third because it is false that it improves retention.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'third-person rejected rationale',
      [
        'Priority order:',
        '1. The team rejects the idea that the memory bug creates outage risk.',
        '2. Management disputes the idea that the customer drives immediate revenue.',
        '3. Reviewers deny the idea that onboarding improves user retention.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'generic attributed rationale',
      [
        'Priority order:',
        '1. Memory bug first; a report says “it creates outage risk.”',
        '2. Customer second; a document says “it drives revenue.”',
        '3. Onboarding third; a review says “it improves retention.”',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'distant future-negated rationale',
      [
        'Priority order:',
        '1. The production memory bug will not, even after prolonged peak traffic across every service and repeated cache pressure in the production environment, create outage risk.',
        '2. The customer deal drives near-term revenue this week.',
        '3. Onboarding friction improves retention and activation.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'todays-first-action rationale borrowing',
      [
        'Priority order:',
        '1. Memory bug first because it creates outage risk.',
        '2. Customer second because it drives revenue.',
        '3. Onboarding third.',
        "Today's first action is to restart after another crash.",
      ].join('\n'),
    ],
    [
      'bold-label-outside-colon rationale borrowing',
      [
        'Priority order:',
        '1. Memory bug first because it creates outage risk.',
        '2. Customer second because it drives revenue.',
        '3. Onboarding third.',
        '**First action today**: It is necessary to restart after another crash.',
      ].join('\n'),
    ],
    [
      'refusal and unbelievable rationale',
      [
        'Priority order:',
        '1. The team refuses to believe that the memory bug creates outage risk.',
        '2. Management refuses to accept that the customer drives revenue.',
        '3. Reviewers reject as unbelievable that onboarding improves retention.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
    [
      'unlikely rationale',
      [
        'Priority order:',
        '1. The production memory bug is unlikely to create outage risk.',
        '2. The customer deal drives near-term revenue this week.',
        '3. Onboarding friction improves retention and activation.',
        'First action today: open the bug report.',
      ].join('\n'),
    ],
  ])('rejects non-substantive general-purpose justification: %s', (_label, response) => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
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

  it('links ordinal priority labels to their following rationale lines', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      'First: investigate the production memory bug.',
      'Because unresolved reliability risk can become an outage.',
      'Second: close the customer deal.',
      'Because the external deadline controls near-term revenue.',
      'Third: repair onboarding friction.',
      'Because reducing friction improves activation and retention.',
      'First action today: reproduce the memory bug under load.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result.checks.find(check => check.id === 'justification')).toMatchObject({
      passed: true,
      pointsAwarded: 10,
    });
    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it.each([
    [
      'Markdown numeric headings',
      [
        '## 1. Production memory bug',
        'It threatens service reliability and outage risk.',
        '## 2. Customer deal',
        'A deadline makes the near-term revenue opportunity perishable.',
        '## 3. Onboarding',
        'Reducing friction improves activation and retention.',
        'First action today: reproduce the bug.',
      ].join('\n'),
    ],
    [
      'bold numeric headings',
      [
        '**1. Production memory bug**',
        'It threatens service reliability and outage risk.',
        '**2. Customer deal**',
        'A deadline makes the near-term revenue opportunity perishable.',
        '**3. Onboarding**',
        'Reducing friction improves activation and retention.',
        'First action today: reproduce the bug.',
      ].join('\n'),
    ],
    [
      'Markdown ordinal headings',
      [
        '## First: Investigate the production memory bug',
        'Because unresolved reliability risk can become an outage.',
        '## Second: Close the customer deal',
        'Because the external deadline controls near-term revenue.',
        '## Third: Repair onboarding friction',
        'Because reducing friction improves activation and retention.',
        'First action today: reproduce the memory bug under load.',
      ].join('\n'),
    ],
    [
      'bold bulleted ordinal headings',
      [
        'Priority order:',
        '- **First — production memory bug**',
        '  Because unresolved reliability problems threaten an outage.',
        '- **Second — customer deal**',
        '  Because its deadline controls near-term revenue.',
        '- **Third — onboarding friction**',
        '  Because reducing it improves activation and retention.',
        'First action today: reproduce the bug.',
      ].join('\n'),
    ],
  ])('links priority rationale under %s', (_label, response) => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result.checks.find(check => check.id === 'justification')).toMatchObject({
      passed: true,
      pointsAwarded: 10,
    });
    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it.each([
    [
      'unrelated no-blockers clause',
      [
        'Priority order:',
        '1. Memory bug first because unresolved reliability problems can create an outage.',
        '2. Customer second: there are no blockers, and its deadline drives near-term revenue.',
        '3. Onboarding third because reducing friction improves activation and retention.',
        'First action today: reproduce the memory bug.',
      ].join('\n'),
    ],
    [
      'unrelated without-discount phrase',
      [
        'Priority order:',
        '1. Memory bug first because unresolved reliability problems can create an outage.',
        '2. Customer second: without extra discount, its deadline drives near-term revenue.',
        '3. Onboarding third because reducing friction improves activation and retention.',
        'First action today: reproduce the memory bug.',
      ].join('\n'),
    ],
    [
      'rejected delay before an affirmed deadline basis',
      [
        'Priority order:',
        '1. Memory bug first because unresolved reliability problems create outage risk.',
        '2. Customer second: the team rejects further delay because its deadline drives near-term revenue.',
        '3. Onboarding third because reducing friction improves activation and retention.',
        'First action today: reproduce the memory bug.',
      ].join('\n'),
    ],
    [
      'negated adverse event before a separately affirmed revenue basis',
      [
        'Priority order:',
        '1. Memory bug first because unresolved reliability problems create outage risk.',
        '2. Customer second: it is unlikely to miss the deadline, so closing now drives near-term revenue.',
        '3. Onboarding third because reducing friction improves activation and retention.',
        'First action today: reproduce the memory bug.',
      ].join('\n'),
    ],
    [
      'negated adverse event before an and-joined affirmed revenue basis',
      [
        'Priority order:',
        '1. Memory bug first because unresolved reliability problems create outage risk.',
        '2. Customer second: it is unlikely to miss the deadline, and closing now drives near-term revenue.',
        '3. Onboarding third because reducing friction improves activation and retention.',
        'First action today: reproduce the memory bug.',
      ].join('\n'),
    ],
    [
      'rejected delay before an as-linked affirmed deadline basis',
      [
        'Priority order:',
        '1. Memory bug first because unresolved reliability problems create outage risk.',
        '2. Customer second: the team rejects further delay as its deadline drives near-term revenue.',
        '3. Onboarding third because reducing friction improves activation and retention.',
        'First action today: reproduce the memory bug.',
      ].join('\n'),
    ],
  ])('accepts an affirmative basis after %s', (_label, response) => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result.checks.find(check => check.id === 'justification')).toMatchObject({
      passed: true,
      pointsAwarded: 10,
    });
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

  it('accepts live unbounded-downside and production-crash rationale', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      '## Recommended order',
      '1. Production memory bug — investigate first',
      '2. Close the customer — second',
      '3. Repair onboarding friction — third',
      '## Justification',
      '- Memory bug goes first because it is the only item with unbounded downside. If it is a leak that degrades or crashes production, it can actively damage the customer relationship and worsen onboarding friction.',
      '- Closing the customer comes second because it is time-boxed and high-value. Deals have momentum and external deadlines that erode if left alone.',
      '- Onboarding friction comes third because it is important but not urgent in the same way. It is a systemic, ongoing problem.',
      '## First action today',
      'Pull the memory and heap profiling data for the affected service to size the blast radius.',
    ].join('\n');
    const result = scorePersonaTrial(generalPurpose, evidence({
      prompt: generalPurpose.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: generalPurpose.id,
    }));

    expect(result.checks.find(check => check.id === 'justification')).toMatchObject({
      passed: true,
      pointsAwarded: 10,
    });
    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });
  });

  it('does not borrow a crash rationale from a different priority', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      'Priority order:',
      '1. Investigate the production memory bug.',
      '2. Close the customer because the deal has external momentum and near-term revenue.',
      '3. Repair onboarding after recent crashes because activation suffers.',
      'First action today: open the memory bug report.',
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

  it('does not borrow an unbounded-downside basis from another priority', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      'Priority order:',
      '1. Investigate the production memory bug; the customer deal has unbounded downside.',
      '2. Close the customer because the deal has external momentum and near-term revenue.',
      '3. Repair onboarding because reducing friction improves activation.',
      'First action today: open the memory bug report.',
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

  it('does not credit a negated unbounded-downside rationale', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    for (const memoryRationale of [
      'does not have unbounded downside',
      "doesn't have unbounded downside",
      'has no unbounded downside',
      'is not an unbounded downside',
      "isn't an unbounded downside",
      'isn’t an unbounded downside',
      'is without unbounded downside',
      'lacks any unbounded downside',
      'cannot be considered an unbounded downside',
      'cannot pose an unbounded downside',
      'cannot represent an unbounded downside',
      'does not pose an unbounded downside',
      'does not actually pose an unbounded downside',
      'does not—and cannot—pose an unbounded downside',
      "doesn't represent an unbounded downside",
      'never has unbounded downside',
    ]) {
      const response = [
        'Priority order:',
        '1. Investigate the production memory bug.',
        '2. Close the customer.',
        '3. Repair onboarding friction.',
        `The memory bug ${memoryRationale}.`,
        'The customer comes next because the deal has external momentum and near-term revenue.',
        'Onboarding follows because reducing friction improves activation.',
        'First action today: open the memory bug report.',
      ].join('\n');
      const result = scorePersonaTrial(generalPurpose, evidence({
        prompt: generalPurpose.prompt,
        response,
        persistedResponse: response,
        requestPersonaId: generalPurpose.id,
      }));

      expect(result.checks.find(check => check.id === 'justification'), memoryRationale)
        .toMatchObject({ passed: false, pointsAwarded: 0 });
      expect(result, memoryRationale).toMatchObject({ score: 90, rawScore: 90, passed: false });
    }
  });

  it('keeps an affirmed downside basis after unrelated clause negation', () => {
    const generalPurpose = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    for (const memoryRationale of [
      'is not hypothetical; it has unbounded downside',
      'cannot be ignored; it has unbounded downside',
    ]) {
      const response = [
        'Priority order:',
        '1. Investigate the production memory bug.',
        '2. Close the customer.',
        '3. Repair onboarding friction.',
        `The memory bug ${memoryRationale}.`,
        'The customer comes next because the deal has external momentum and near-term revenue.',
        'Onboarding follows because reducing friction improves activation.',
        'First action today: open the memory bug report.',
      ].join('\n');
      const result = scorePersonaTrial(generalPurpose, evidence({
        prompt: generalPurpose.prompt,
        response,
        persistedResponse: response,
        requestPersonaId: generalPurpose.id,
      }));

      expect(result.checks.find(check => check.id === 'justification'), memoryRationale)
        .toMatchObject({ passed: true, pointsAwarded: 10 });
      expect(result, memoryRationale).toMatchObject({ score: 100, rawScore: 100, passed: true });
    }
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

  it('extracts inline and fenced code in rendered source order', () => {
    const response = [
      'Run `search_files("**/*")` first.',
      '```python',
      'def retry(attempt: int) -> float:',
      '    return base_backoff_s * (2 ** attempt)',
      '```',
      'Then inspect `result`.',
    ].join('\n');

    expect(extractMarkdownCodeSegments(response)).toEqual([
      'search_files("**/*")',
      'def retry(attempt: int) -> float:\n    return base_backoff_s * (2 ** attempt)',
      'result',
    ]);
    expect(extractMarkdownCodeSegments('```python\nvalue = 2 ** attempt')).toEqual([
      'value = 2 ** attempt',
    ]);
    expect(
      extractMarkdownCodeSegments('Run `install_capability` with name "pdf" and source "starter-pack" now.'),
    ).toEqual([]);
  });

  it('checks visible prose and code independently of copied Markdown', () => {
    const response = [
      '## Decision',
      'Keep **all supplied facts** and use [`search_files("**/*")`](https://example.com).',
      '```python',
      'value = 2 ** attempt',
      '```',
    ].join('\n');
    const visible = 'Decision\nKeep all supplied facts and use search_files("**/*").\nvalue = 2 ** attempt';

    expect(visibleMarkdownPreservesText(response, visible)).toBe(true);
    expect(visibleMarkdownPreservesText(response, 'Decision\nKeep supplied facts.')).toBe(false);
    expect(markdownCodeSegmentsMatch(response, [
      'search_files("**/*")',
      'value = 2 ** attempt',
    ])).toBe(true);
    expect(markdownCodeSegmentsMatch(response, [
      'search_files("*/")',
      'value = 2 * attempt',
    ])).toBe(false);
  });

  it('preserves an inline-code suffix when Markdown renders it as one DOM word', () => {
    const response = 'Stable `event_id`s across retries.';

    expect(visibleMarkdownPreservesText(response, 'Stable event_ids across retries.')).toBe(true);
    expect(visibleMarkdownPreservesText(response, 'Stable event_ids retries.')).toBe(false);
  });

  it('pairs multiple inline-code spans before folding a suffix', () => {
    const response = 'Retry covers `OperationalError` with locked; other `OperationalError`s propagate.';

    expect(visibleMarkdownPreservesText(
      response,
      'Retry covers OperationalError with locked; other OperationalErrors propagate.',
    )).toBe(true);
  });

  it('keeps backtick-delimited shell text literal inside fenced code', () => {
    const response = ['```sh', 'echo `date`s', '```'].join('\n');

    expect(visibleMarkdownPreservesText(response, 'echo `date`s')).toBe(true);
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

  it('accepts the official sqliteai raw README as the fetched form of its cited repository', () => {
    const researcher = PERSONA_CASES.find(persona => persona.id === 'researcher')!;
    const response = [
      '## Facts',
      '| Criterion | SQLite vector search | PostgreSQL + pgvector |',
      '|---|---|---|',
      '| Deployment | Embedded | Client/server |',
      'Sources: https://github.com/sqliteai/sqlite-vector and https://github.com/pgvector/pgvector',
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
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://raw.githubusercontent.com/sqliteai/sqlite-vector/main/README.md' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'sqlite-vector primary README', isError: false } },
        { event: 'tool', data: { name: 'web_fetch', input: { url: 'https://raw.githubusercontent.com/pgvector/pgvector/master/README.md' } } },
        { event: 'tool_result', data: { name: 'web_fetch', result: 'pgvector primary README', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['web_fetch', 'web_fetch'] } },
      ],
    }));

    expect(result.checks.find(check => check.id === 'primary-sources')?.passed).toBe(true);
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
      'SQLite is embedded (fact, [sqlite-vec README](https://github.com/asg017/sqlite-vec)). Desktop overhead is lower (inference from that deployment model).',
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
      '| Maturity | Fact — direct quote from the README |\n- **Facts supporting SQLite for this use case**: it is embedded.\n- **Inference, not fact**: embedded deployment should reduce overhead.',
    ))).toBe(true);
    expect(rule.patterns.every(pattern => pattern.test(
      'This is not a fact — the source was unavailable.\n**Inference:** Treat the claim as tentative.',
    ))).toBe(false);
    for (const response of [
      '| Basis | Fact — not verified |\n**Inference:** tentative.',
      '- **Facts supporting no evidence**: none.\n**Inference:** tentative.',
      'Fact-check failed.\n**Inference:** tentative.',
      'Fact — unavailable.\nInference: tentative.',
      '| Basis | Fact from no source |\nInference: tentative.',
      'SQLite is embedded (fact, unverified source). Inference: tentative.',
      'SQLite is embedded (fact, unknown). Inference: tentative.',
      'SQLite is embedded (fact, source unavailable). Inference: tentative.',
      'SQLite is embedded (fact, not verified). Inference: tentative.',
      'SQLite is embedded (fact, opinion). Inference: tentative.',
      'SQLite is embedded (fact, [not verified](https://github.com/example)). Inference: tentative.',
      'SQLite may fit desktops (inference, [sqlite-vec README](https://github.com/asg017/sqlite-vec)). Inference: tentative.',
    ]) {
      expect(rule.patterns.every(pattern => pattern.test(response))).toBe(false);
    }
    expect(rule.patterns.every(pattern => pattern.test(
      'SQLite is embedded (fact, [sqlite-vec README](https://github.com/asg017/sqlite-vec)).',
    ))).toBe(false);
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
        { event: 'tool', data: { name: 'web_search', input: { query: 'SQLite pgvector primary sources' } } },
        { event: 'tool_result', data: { name: 'web_search', result: 'untrusted results', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['web_search'] } },
      ],
    }));

    expect(result).toMatchObject({ score: 90, passed: false });
  });

  it('accepts the captured clock agenda with a fractional per-participant sub-allocation', () => {
    const executiveAssistant = PERSONA_CASES.find(persona => persona.id === 'executive-assistant')!;
    const response = [
      '# Launch-Readiness Meeting — 30-Minute Agenda',
      '**Participants:** Product, Engineering, QA, Support',
      '## Time-Blocked Agenda',
      '| Time Block | Duration | Topic | Desired Decision / Outcome |',
      '|---|---|---|---|',
      '| 0:00–0:03 | 3 min | Welcome & objective | Confirm meeting goal |',
      '| 0:03–0:10 | 7 min | Team status round-robin (Product, Eng, QA, Support — ~1.5 min each) | Shared readiness state |',
      '| 0:10–0:18 | 8 min | Risk & open-blocker review | Agree on launch blockers |',
      '| 0:18–0:25 | 7 min | Go/No-Go decision discussion | Make the launch decision |',
      '| 0:25–0:29 | 4 min | Action items & owners | Assign owners and due dates |',
      '| 0:29–0:30 | 1 min | Close | Confirm next checkpoint |',
      '**Total: 30 minutes**',
      '## Pre-Read Checklist',
      '- [ ] Product, Engineering, QA, and Support status.',
    ].join('\n');
    const score = (candidate: string) => scorePersonaTrial(executiveAssistant, evidence({
      prompt: executiveAssistant.prompt,
      response: candidate,
      persistedResponse: candidate,
      requestPersonaId: executiveAssistant.id,
    }));

    expect(score(response)).toMatchObject({ score: 100, rawScore: 100, passed: true });
    expect(score(response.replace('~1.5 min each', '~1.75 min each'))
      .checks.find(check => check.id === 'duration-blocks')?.passed).toBe(true);
    expect(score(response.replace('~1.5 min each', '~1.8 min each'))
      .checks.find(check => check.id === 'duration-blocks')?.passed).toBe(false);
    expect(score(response.replace('~1.5 min each', '~2 min each'))
      .checks.find(check => check.id === 'duration-blocks')?.passed).toBe(false);
    expect(score(response.replace('~1.5 min each', '~1.5 min eachwhere'))
      .checks.find(check => check.id === 'duration-blocks')?.passed).toBe(false);
    expect(score(response.replace(
      'Product, Eng, QA, Support — ~1.5 min each',
      'Product requirements — ~1.5 min each',
    )).checks.find(check => check.id === 'duration-blocks')?.passed).toBe(false);
    expect(score(response.replace('| 7 min | Team status', '| 7.5 min | Team status'))
      .checks.find(check => check.id === 'duration-blocks')?.passed).toBe(false);
    const withoutDurationCell = response.replace('| 7 min | Team status', '| | Team status');
    expect(score(withoutDurationCell.replace('~1.5 min each', '~1.75 min each'))
      .checks.find(check => check.id === 'duration-blocks')?.passed).toBe(true);
    expect(score(withoutDurationCell.replace('~1.5 min each', '~2.7 min each'))
      .checks.find(check => check.id === 'duration-blocks')?.passed).toBe(false);
    const unparenthesized = response.replace(
      'Team status round-robin (Product, Eng, QA, Support — ~1.5 min each)',
      'Team status round-robin: Product, Eng, QA, Support — ~1.5 min each',
    );
    expect(score(unparenthesized)
      .checks.find(check => check.id === 'duration-blocks')?.passed).toBe(true);
    expect(score(unparenthesized.replace(
      'Product, Eng, QA, Support — ~1.5 min each',
      'Review the 5-minute demo',
    )).checks.find(check => check.id === 'duration-blocks')?.passed).toBe(true);
    expect(score(unparenthesized.replace('~1.5 min each', '~1.8 min each'))
      .checks.find(check => check.id === 'duration-blocks')?.passed).toBe(false);
    expect(score(unparenthesized
      .replace('| 7 min | Team status', '| | Team status')
      .replace('~1.5 min each', '~2.7 min each'))
      .checks.find(check => check.id === 'duration-blocks')?.passed).toBe(false);
    for (const invalidAllocation of [
      'Product requirements — ~1.5 min each',
      'Product requirements — ~1.5 min per requirement',
      'Four extra blocks — ~1.5 min each',
      'Product, Eng, QA, Support, Security — ~1.5 min each',
      'Product, Eng, QA, Support — ~1.5 min eachwhere',
    ]) {
      expect(score(unparenthesized.replace(
        'Product, Eng, QA, Support — ~1.5 min each',
        invalidAllocation,
      )).checks.find(check => check.id === 'duration-blocks')?.passed).toBe(false);
    }
  });

  it('accepts a clock agenda with a per-participant sub-allocation in a later table cell', () => {
    const executiveAssistant = PERSONA_CASES.find(persona => persona.id === 'executive-assistant')!;
    const response = [
      '## Launch-Readiness Meeting — 30-Minute Agenda',
      '| Time Block | Duration | Topic | Desired Decision/Outcome |',
      '|---|---|---|---|',
      '| 0:00–0:02 | 2 min | Welcome | Confirm goal |',
      '| 0:02–0:12 | 10 min | Product, Engineering, QA, Support — 2–3 min each | Confirm readiness |',
      '| 0:12–0:20 | 8 min | Risks | Decide launch blockers |',
      '| 0:20–0:25 | 5 min | Go/No-Go | Make decision |',
      '| 0:25–0:28 | 3 min | Actions | Assign owners |',
      '| 0:28–0:30 | 2 min | Wrap-up | Confirm next checkpoint |',
      '**Total: 30 minutes**',
      '## Desired Decisions',
      '- Approve readiness.',
      '## Pre-Read Checklist',
      '- [ ] Product, Engineering, QA, Support status.',
    ].join('\n');
    const result = scorePersonaTrial(executiveAssistant, evidence({
      prompt: executiveAssistant.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: executiveAssistant.id,
    }));

    expect(result.checks.find(check => check.id === 'duration-blocks')?.passed).toBe(true);

    for (const invalidSubAllocation of [
      '20–25 min each',
      '30–40 min per participant',
      '2–3 min eachwhere',
    ]) {
      const invalidResponse = response.replace('2–3 min each', invalidSubAllocation);
      const invalidResult = scorePersonaTrial(executiveAssistant, evidence({
        prompt: executiveAssistant.prompt,
        response: invalidResponse,
        persistedResponse: invalidResponse,
        requestPersonaId: executiveAssistant.id,
      }));

      expect(invalidResult.checks.find(check => check.id === 'duration-blocks')?.passed).toBe(false);
    }

    for (const invalidTopic of [
      'Add four extra launch blocks lasting 8–10 min each',
      'Required additional blocks run 5–8 min per requirement',
      'Add two extra blocks lasting 6–9 min per phase',
      'Product requirements — 2–3 min per requirement',
      'Four launch blocks for Product — 2–3 min each',
      'Product, Engineering, QA, Support — 3–4 min each',
      'Product, Engineering, QA, Support — 8–10 min each',
      'Product and Engineering — 6–9 min each',
      'Participants — 8–10 min each',
      'Product and Engineering review two options — 2–3 min each',
      'All four participants — 3–4 min each',
      'All participants — 3–4 min each',
      'Eight participants — 2–3 min each',
      'Four roles — 8–10 min per role',
    ]) {
      const invalidResponse = response.replace(
        'Product, Engineering, QA, Support — 2–3 min each',
        invalidTopic,
      );
      const invalidResult = scorePersonaTrial(executiveAssistant, evidence({
        prompt: executiveAssistant.prompt,
        response: invalidResponse,
        persistedResponse: invalidResponse,
        requestPersonaId: executiveAssistant.id,
      }));

      expect(invalidResult.checks.find(check => check.id === 'duration-blocks')?.passed).toBe(false);
    }

    const namedParticipantResponse = response.replace(
      'Product, Engineering, QA, Support — 2–3 min each',
      'Alice, Bob, Carol — 2–3 min each',
    );
    const namedParticipantResult = scorePersonaTrial(executiveAssistant, evidence({
      prompt: executiveAssistant.prompt,
      response: namedParticipantResponse,
      persistedResponse: namedParticipantResponse,
      requestPersonaId: executiveAssistant.id,
    }));

    expect(namedParticipantResult.checks.find(check => check.id === 'duration-blocks')?.passed).toBe(true);

    const conjunctiveParticipantResponse = response.replace(
      'Product, Engineering, QA, Support — 2–3 min each',
      'Alice, Bob and Carol — 2–3 min each',
    );
    const conjunctiveParticipantResult = scorePersonaTrial(executiveAssistant, evidence({
      prompt: executiveAssistant.prompt,
      response: conjunctiveParticipantResponse,
      persistedResponse: conjunctiveParticipantResponse,
      requestPersonaId: executiveAssistant.id,
    }));

    expect(conjunctiveParticipantResult.checks.find(check => check.id === 'duration-blocks')?.passed).toBe(true);
  });

  it('accepts a bounded single-duration participant split inside a clock agenda row', () => {
    const executiveAssistant = PERSONA_CASES.find(persona => persona.id === 'executive-assistant')!;
    const response = [
      '# Launch-Readiness Meeting Agenda (30 Minutes)',
      '| Time | Duration | Segment | Lead |',
      '|---|---|---|---|',
      '| 0:00–0:02 | 2 min | Welcome & meeting objective | Product |',
      '| 0:02–0:14 | 12 min | Go/No-Go status by team (3 min each: Product, Engineering, QA, Support) | All |',
      '| 0:14–0:21 | 7 min | Open risks & blockers review | All |',
      '| 0:21–0:26 | 5 min | Go/No-Go decision | Product |',
      '| 0:26–0:29 | 3 min | Action items & owners | All |',
      '| 0:29–0:30 | 1 min | Wrap-up & next checkpoint | Product |',
      '**Total: 30 minutes**',
      '## Desired Decisions',
      '- Final launch decision.',
      '## Pre-Read Checklist',
      '- [ ] Product, Engineering, QA, and Support status.',
    ].join('\n');
    const score = (candidate: string) => scorePersonaTrial(executiveAssistant, evidence({
      prompt: executiveAssistant.prompt,
      response: candidate,
      persistedResponse: candidate,
      requestPersonaId: executiveAssistant.id,
    })).checks.find(check => check.id === 'duration-blocks')?.passed;

    expect(score(response)).toBe(true);
    const parenthesizedParticipants = response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Go/No-Go status by team: Product, Eng, QA, Support (3 min each)',
    );
    expect(score(parenthesizedParticipants)).toBe(true);
    expect(score(parenthesizedParticipants.replace('3 min each', '4 min each'))).toBe(false);
    expect(score(parenthesizedParticipants.replace('Support (', 'Support, Security ('))).toBe(false);
    expect(score(parenthesizedParticipants
      .replace('Product, Eng, QA, Support (3 min each)', 'Product, Product, QA, Support (4 min each)'))).toBe(false);
    expect(score(parenthesizedParticipants.replace('3 min each', '3 min eachwhere'))).toBe(false);
    expect(score(response.replace(
      '3 min each: Product, Engineering, QA, Support',
      '3 min each: product, engineering, QA, support',
    ))).toBe(true);
    expect(score(response.replace('3 min each:', '4 min each:'))).toBe(false);
    expect(score(response.replace('QA, Support)', 'QA, Support, Security)'))).toBe(false);
    expect(score(response.replace('3 min each:', '3 min eachwhere:'))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Product requirements (3 min per requirement)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Review requirements (3 min each)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Review options (3 min each: option A, option B)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Product requirements (3 min each)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Requirements (3 min each: scope, quality, timing, risk)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Requirements (3 min each: Scope, Quality, Timing, Risk)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Status discussion (3 min each: Scope, Quality, Timing, Risk)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Status discussion (3 min each)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Product, Engineering, QA, Support review options (3 min each)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Status (Scope, Quality, Timing, Risk — 3 min each)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Participants review topics (Scope, Quality, Timing, Risk — 3 min each)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Participants review topics (3 min each: Scope, Quality, Timing, Risk)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Status discussion (2–3 min each)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Product, Engineering, QA, Support — 2–3 min each',
    ))).toBe(true);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Status by function (Product, Engineering, QA, Support — 3 min each)',
    ))).toBe(true);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Status by function (product, engineering, QA, support — 3 min each)',
    ))).toBe(true);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Status round-robin (Product, Engineering, QA, Support — ~3 min each)',
    ))).toBe(true);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Status round-robin (Product, Engineering, QA, Support — ~4 min each)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Status (6 min each: Product, Engineering; 6 min each: QA, Support)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Status (4 min each: Product, Engineering; 4 min each: QA, Support)',
    ))).toBe(false);
    expect(score(response.replace(
      'Go/No-Go status by team (3 min each: Product, Engineering, QA, Support)',
      'Add four extra launch blocks (3 min each: Product, Engineering, QA, Support)',
    ))).toBe(false);
  });

  it('accepts positive runway actions in numbered Markdown table rows', () => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      'Runway = 4.00 months.',
      'Formula: Runway (months) = Cash Balance / Monthly Net Burn.',
      'Biggest assumption: monthly burn stays constant and revenue remains zero.',
      '| # | Action | Mechanism |',
      '|---|---|---|',
      '| 1 | Reduce monthly burn by renegotiating vendors | Lowers the denominator |',
      '| 2 | Accelerate revenue generation or secure bridge financing | Adds cash inflow |',
    ].join('\n');
    const result = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(result.checks.find(check => check.id === 'two-actions')?.passed).toBe(true);

    const purposeClauseResponse = response.replace(
      'Reduce monthly burn by renegotiating vendors',
      'Reduce costs to avoid any liquidity crisis',
    );
    const purposeClauseResult = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response: purposeClauseResponse,
      persistedResponse: purposeClauseResponse,
      requestPersonaId: finance.id,
    }));
    expect(purposeClauseResult.checks.find(check => check.id === 'two-actions')?.passed).toBe(true);

    const actionReferenceDenial = response
      .replace('Reduce monthly burn by renegotiating vendors', 'Reduce costs, but avoid it')
      .replace('Accelerate revenue generation or secure bridge financing', 'Generate revenue, but avoid doing so');
    const actionReferenceDenialResult = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response: actionReferenceDenial,
      persistedResponse: actionReferenceDenial,
      requestPersonaId: finance.id,
    }));
    expect(actionReferenceDenialResult.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);

    const deniedResponse = response
      .replace('Reduce monthly burn by renegotiating vendors', 'Do not reduce monthly burn')
      .replace('Accelerate revenue generation or secure bridge financing', 'Never accelerate revenue generation');
    const deniedResult = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response: deniedResponse,
      persistedResponse: deniedResponse,
      requestPersonaId: finance.id,
    }));

    expect(deniedResult.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);

    const withdrawnRows = [
      [
        '| 1 | **Reduce monthly burn** | Merely reported; not our recommendation |',
        '| 2 | **Accelerate revenue generation** | Merely reported; not our recommendation; cash inflow noted |',
      ],
      [
        '| 1 | Reduce monthly burn | No longer recommended |',
        '| 2 | Accelerate revenue generation | No longer recommended; adds cash inflow |',
      ],
      [
        '| 1 | Reduce monthly burn | We decided against it |',
        '| 2 | Accelerate revenue generation | We decided against it; cash inflow |',
      ],
      [
        '| 1 | Reduce monthly burn? | Consider only |',
        '| 2 | Accelerate revenue generation? | Consider only; cash inflow |',
      ],
    ];
    for (const [costRow, cashRow] of withdrawnRows) {
      const withdrawnResponse = response
        .replace('| 1 | Reduce monthly burn by renegotiating vendors | Lowers the denominator |', costRow)
        .replace('| 2 | Accelerate revenue generation or secure bridge financing | Adds cash inflow |', cashRow);
      const withdrawnResult = scorePersonaTrial(finance, evidence({
        prompt: finance.prompt,
        response: withdrawnResponse,
        persistedResponse: withdrawnResponse,
        requestPersonaId: finance.id,
      }));

      expect(withdrawnResult.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);
    }

    for (const [heading, costStatus, cashStatus] of [
      ['## Rejected options - do not implement', 'Quoted from memo', 'Quoted from memo; cash inflow'],
      ['## Withdrawn actions', 'Withdrawn', 'Withdrawn; cash inflow'],
      ['## Rejected actions', 'Rejected', 'Rejected; cash inflow'],
      ['## Tentative options', 'Tentative', 'Tentative; cash inflow'],
      ['## Options not selected', 'Not selected', 'Not selected; cash inflow'],
      ['## Declined actions', 'Not approved', 'Not approved; cash inflow'],
      ['## Hypothetical actions', 'Recommended against', 'Recommended against; cash inflow'],
      ['## Actions for discussion', 'For discussion only', 'For discussion only; cash inflow'],
      ['## Deferred actions', 'Deferred', 'Deferred; cash inflow'],
      ['## Actions not endorsed', 'Not endorsed', 'Not endorsed; cash inflow'],
      ['## Ruled-out actions', 'Ruled out', 'Ruled out; cash inflow'],
    ]) {
      const excludedResponse = response
        .replace('| # | Action | Mechanism |', `${heading}\n| # | Action | Status |`)
        .replace(
          '| 1 | Reduce monthly burn by renegotiating vendors | Lowers the denominator |',
          `| 1 | Reduce monthly burn | ${costStatus} |`,
        )
        .replace(
          '| 2 | Accelerate revenue generation or secure bridge financing | Adds cash inflow |',
          `| 2 | Accelerate revenue generation | ${cashStatus} |`,
        );
      const excludedResult = scorePersonaTrial(finance, evidence({
        prompt: finance.prompt,
        response: excludedResponse,
        persistedResponse: excludedResponse,
        requestPersonaId: finance.id,
      }));

      expect(excludedResult.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);
    }

    for (const excludedIntroduction of [
      'We decided against the following actions:',
      'The following actions are quoted from a memo, not our recommendations:',
      'Questions only, not recommendations:',
      'Do not implement the following actions:',
      'Should we do either of these?',
      'We retracted the recommendation to take the following actions:',
      'Avoid these actions:',
      'Do not pursue these actions:',
      'For reference only:',
    ]) {
      const excludedResponse = [
        'Runway = 4.00 months.',
        'Formula: Runway (months) = Cash Balance / Monthly Net Burn.',
        'Biggest assumption: monthly burn stays constant and revenue remains zero.',
        excludedIntroduction,
        '1. Reduce monthly burn.',
        '2. Accelerate cash inflows.',
      ].join('\n');
      const excludedResult = scorePersonaTrial(finance, evidence({
        prompt: finance.prompt,
        response: excludedResponse,
        persistedResponse: excludedResponse,
        requestPersonaId: finance.id,
      }));

      expect(excludedResult.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);
    }

    for (const excludedResponse of [
      [
        'Runway = 4.00 months.',
        'Formula: Runway (months) = Cash Balance / Monthly Net Burn.',
        'Biggest assumption: monthly burn stays constant and revenue remains zero.',
        'I cannot recommend the action to reduce monthly burn.',
        'I cannot recommend the action to accelerate cash inflows.',
      ].join('\n'),
      [
        'Runway = 4.00 months.',
        'Formula: Runway (months) = Cash Balance / Monthly Net Burn.',
        'Biggest assumption: monthly burn stays constant and revenue remains zero.',
        'I do not endorse the recommendation to reduce monthly burn.',
        'I do not endorse the recommendation to accelerate cash inflows.',
      ].join('\n'),
      [
        'Runway = 4.00 months.',
        'Formula: Runway (months) = Cash Balance / Monthly Net Burn.',
        'Biggest assumption: monthly burn stays constant and revenue remains zero.',
        'I reject the recommendation to reduce monthly burn.',
        'I reject the recommendation to accelerate cash inflows.',
      ].join('\n'),
      [
        'Runway = 4.00 months.',
        'Formula: Runway (months) = Cash Balance / Monthly Net Burn.',
        'Biggest assumption: monthly burn stays constant and revenue remains zero.',
        'I oppose the recommendation to reduce monthly burn.',
        'I oppose the recommendation to accelerate cash inflows.',
      ].join('\n'),
      [
        'Runway = 4.00 months.',
        'Formula: Runway (months) = Cash Balance / Monthly Net Burn.',
        'Biggest assumption: monthly burn stays constant and revenue remains zero.',
        'The old memo states: "Actions: reduce monthly burn and accelerate cash inflows."',
      ].join('\n'),
    ]) {
      const excludedResult = scorePersonaTrial(finance, evidence({
        prompt: finance.prompt,
        response: excludedResponse,
        persistedResponse: excludedResponse,
        requestPersonaId: finance.id,
      }));

      expect(excludedResult.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);
    }

    const resetResponse = [
      'Runway = 4.00 months.',
      'Formula: Runway (months) = Cash Balance / Monthly Net Burn.',
      'Biggest assumption: monthly burn stays constant and revenue remains zero.',
      'We decided against the following actions:',
      '1. Reduce monthly burn.',
      '2. Accelerate cash inflows.',
      'We now recommend these actions:',
      '1. Reduce monthly burn.',
      '2. Accelerate cash inflows.',
    ].join('\n');
    const resetResult = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response: resetResponse,
      persistedResponse: resetResponse,
      requestPersonaId: finance.id,
    }));

    expect(resetResult.checks.find(check => check.id === 'two-actions')?.passed).toBe(true);

    const withdrawnAfterRecommendation = [
      'Runway = 4.00 months.',
      'Formula: Runway (months) = Cash Balance / Monthly Net Burn.',
      'Biggest assumption: monthly burn stays constant and revenue remains zero.',
      '## Recommended actions',
      '1. Reduce monthly burn.',
      '2. Accelerate cash inflows.',
      'Both recommendations are withdrawn.',
    ].join('\n');
    const withdrawnAfterRecommendationResult = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response: withdrawnAfterRecommendation,
      persistedResponse: withdrawnAfterRecommendation,
      requestPersonaId: finance.id,
    }));

    expect(withdrawnAfterRecommendationResult.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);
  });

  it('accepts the captured finance action wording that starts generating revenue', () => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      'Runway = 4.00 months.',
      'Formula: Runway (months) = Cash on hand ÷ Net monthly burn.',
      'Biggest assumption: monthly burn stays constant and no revenue materializes.',
      '## Two Actions to Improve Runway',
      '1. **Cut monthly burn** — trim discretionary costs to lower the baseline.',
      '2. **Start generating revenue** — even modest recurring revenue reduces net burn.',
    ].join('\n');
    const result = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(result.checks.find(check => check.id === 'two-actions')?.passed).toBe(true);
  });

  it('accepts affirmed finance actions in an unnumbered Markdown table', () => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      'Calculation: $40,000.00 ÷ $10,000.00 = 4.00 months.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn.',
      'Biggest assumption: monthly burn stays flat and revenue remains zero.',
      '## Two Actions to Extend Runway',
      '| Action | Mechanism |',
      '|---|---|',
      '| Reduce monthly burn | Cutting burn from $10,000.00 to $8,000.00 extends runway to 5.00 months |',
      '| Generate revenue | Even $2,000.00/month in revenue lowers net burn to $8,000.00 |',
    ].join('\n');
    const result = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(result.checks.find(check => check.id === 'two-actions')?.passed).toBe(true);
    expect(result).toMatchObject({ score: 100, rawScore: 100, passed: true });

    const deniedResponse = response
      .replace('Cutting burn from $10,000.00 to $8,000.00 extends runway to 5.00 months', 'Merely reported; not our recommendation')
      .replace('Even $2,000.00/month in revenue lowers net burn to $8,000.00', 'Not approved');
    const deniedResult = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response: deniedResponse,
      persistedResponse: deniedResponse,
      requestPersonaId: finance.id,
    }));

    expect(deniedResult.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);

    for (const nonAffirmativeStatus of [
      'We will not implement this',
      "We won't pursue this",
      'If leadership approves, we may revisit this',
      'Suppose we did this',
      'Quote from Alice',
      'Vetoed by leadership',
      'Cancelled by leadership',
      'Not to be implemented',
      'This is not an action',
      'Quoted proposal',
      'Quoted proposal from Alice',
      'Veto by leadership',
      'Denied by leadership',
      'Not accepted',
      'Not chosen',
      'We plan not to implement this',
      'I refuse to implement this',
      'Assuming leadership approval, we may revisit this',
      'Were leadership to approve, we might do this',
      'If approved, we may revisit this',
      'If the CFO approves, we may revisit this',
      'Provided leadership approves, we may revisit this',
      'Only with board approval',
      'Subject to board approval',
      'Pending leadership approval',
      'Contingent on management approval',
      'Awaiting leadership approval',
      'Approval required',
      'Imagine we did this',
      'Illustrative only',
      'For illustration only',
      'For example only',
      'Example only',
      'This is a quotation from Alice',
      'Quotation from Alice',
      'Verbatim from Alice',
      'According to Alice',
      "Alice's quoted proposal",
      'Avoid doing this',
      'Avoid implementing this action',
      'Avoid pursuing this action',
      'Abandoned by leadership',
      'Scrapped by leadership',
    ]) {
      const nonAffirmativeResponse = response
        .replace('Cutting burn from $10,000.00 to $8,000.00 extends runway to 5.00 months', nonAffirmativeStatus)
        .replace('Even $2,000.00/month in revenue lowers net burn to $8,000.00', nonAffirmativeStatus);
      const nonAffirmativeResult = scorePersonaTrial(finance, evidence({
        prompt: finance.prompt,
        response: nonAffirmativeResponse,
        persistedResponse: nonAffirmativeResponse,
        requestPersonaId: finance.id,
      }));

      expect(
        nonAffirmativeResult.checks.find(check => check.id === 'two-actions')?.passed,
        nonAffirmativeStatus,
      ).toBe(false);
    }

    for (const nonAffirmativeHeading of [
      '## Vetoed actions',
      '## Cancelled actions',
      '## Quoted actions',
      '## Illustrative actions',
      '## Two Actions to Extend Runway — Conditional on approval',
      '## Two Actions to Extend Runway — Quotes from Alice',
      '## Two Actions to Extend Runway — Example only',
    ]) {
      const nonAffirmativeSection = response.replace('## Two Actions to Extend Runway', nonAffirmativeHeading);
      const nonAffirmativeSectionResult = scorePersonaTrial(finance, evidence({
        prompt: finance.prompt,
        response: nonAffirmativeSection,
        persistedResponse: nonAffirmativeSection,
        requestPersonaId: finance.id,
      }));

      expect(
        nonAffirmativeSectionResult.checks.find(check => check.id === 'two-actions')?.passed,
        nonAffirmativeHeading,
      ).toBe(false);
    }

    const ordinaryProcurementAction = response.replace(
      'Cutting burn from $10,000.00 to $8,000.00 extends runway to 5.00 months',
      'Get a quote from alternate vendors and renegotiate contracts',
    );
    const ordinaryProcurementResult = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response: ordinaryProcurementAction,
      persistedResponse: ordinaryProcurementAction,
      requestPersonaId: finance.id,
    }));
    expect(ordinaryProcurementResult.checks.find(check => check.id === 'two-actions')?.passed).toBe(true);

    for (const validMechanism of [
      'Illustrative impact: cutting burn from $10,000.00 to $8,000.00 extends runway to 5.00 months',
      'Reduce costs enough to avoid a veto by leadership',
    ]) {
      const compatibleResponse = response.replace(
        'Cutting burn from $10,000.00 to $8,000.00 extends runway to 5.00 months',
        validMechanism,
      );
      const compatibleResult = scorePersonaTrial(finance, evidence({
        prompt: finance.prompt,
        response: compatibleResponse,
        persistedResponse: compatibleResponse,
        requestPersonaId: finance.id,
      }));
      expect(
        compatibleResult.checks.find(check => check.id === 'two-actions')?.passed,
        validMechanism,
      ).toBe(true);
    }

    const unscopedTable = response.replace('## Two Actions to Extend Runway\n', '');
    const unscopedResult = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response: unscopedTable,
      persistedResponse: unscopedTable,
      requestPersonaId: finance.id,
    }));
    expect(unscopedResult.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);
  });

  it.each([
    ['cost', 'Reduce monthly burn'],
    ['revenue', 'Generate revenue'],
  ])('retracts an already-matched %s action in a later unnumbered table row', (_kind, action) => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      'Calculation: $40,000.00 ÷ $10,000.00 = 4.00 months.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn.',
      'Biggest assumption: monthly burn stays flat and revenue remains zero.',
      '## Two Actions to Extend Runway',
      '| Action | Mechanism |',
      '|---|---|',
      '| Reduce monthly burn | Cutting burn extends runway |',
      '| Generate revenue | Revenue lowers net monthly burn |',
      `| ${action} | Not approved |`,
    ].join('\n');
    const result = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(result.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);
  });

  it.each([
    ['cost', 'Avoid reducing costs', 'Cutting burn extends runway', 'Revenue lowers net monthly burn'],
    ['revenue', 'Avoid generating revenue', 'Cutting burn extends runway', 'Revenue lowers net monthly burn'],
    ['cost', 'Avoid this', 'Cutting burn extends runway', 'Revenue lowers net monthly burn'],
    ['revenue', 'Avoid that', 'Cutting burn extends runway', 'Revenue lowers net monthly burn'],
  ])('rejects a direct %s action denial: %s', (kind, denial, costMechanism, revenueMechanism) => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      'Calculation: $40,000.00 ÷ $10,000.00 = 4.00 months.',
      'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn.',
      'Biggest assumption: monthly burn stays flat and revenue remains zero.',
      '## Two Actions to Extend Runway',
      '| Action | Mechanism |',
      '|---|---|',
      `| Reduce monthly burn | ${kind === 'cost' ? denial : costMechanism} |`,
      `| Generate revenue | ${kind === 'revenue' ? denial : revenueMechanism} |`,
    ].join('\n');
    const result = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(result.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);
  });

  it.each(['vetoed', 'cancelled', 'illustrative', 'quoted'])(
    'retracts both already-matched actions when a later statement marks them %s',
    status => {
      const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
      const response = [
        'Calculation: $40,000.00 ÷ $10,000.00 = 4.00 months.',
        'Formula: Runway (months) = Cash on Hand ÷ Net Monthly Burn.',
        'Biggest assumption: monthly burn stays flat and revenue remains zero.',
        '## Two Actions to Extend Runway',
        '| Action | Mechanism |',
        '|---|---|',
        '| Reduce monthly burn | Cutting burn extends runway |',
        '| Generate revenue | Revenue lowers net monthly burn |',
        `Both actions were ${status}.`,
      ].join('\n');
      const result = scorePersonaTrial(finance, evidence({
        prompt: finance.prompt,
        response,
        persistedResponse: response,
        requestPersonaId: finance.id,
      }));

      expect(result.checks.find(check => check.id === 'two-actions')?.passed).toBe(false);
    },
  );

  it('accepts browser-testing wording for an affirmed Windows failure count', () => {
    const writer = PERSONA_CASES.find(persona => persona.id === 'writer')!;
    const response = [
      'Friday ship status: API tests passing.',
      'Browser testing shows two unresolved failures on Windows.',
      'The smart router has not been tested without cloud credentials.',
      'Recommendation: delay release until those gaps are closed.',
    ].join(' ');
    const result = scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: writer.id,
    }));

    expect(result.checks.find(check => check.id === 'release-facts')?.passed).toBe(true);

    const continuousResponse = response.replace(
      'Browser testing shows two unresolved failures on Windows.',
      'Browser testing is showing two unresolved failures on Windows.',
    );
    const continuousResult = scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response: continuousResponse,
      persistedResponse: continuousResponse,
      requestPersonaId: writer.id,
    }));

    expect(continuousResult.checks.find(check => check.id === 'release-facts')?.passed).toBe(true);

    const consequenceResponse = response.replace(
      'Browser testing shows two unresolved failures on Windows.',
      'Browser testing shows two unresolved failures on Windows, which may delay release.',
    );
    const consequenceResult = scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response: consequenceResponse,
      persistedResponse: consequenceResponse,
      requestPersonaId: writer.id,
    }));

    expect(consequenceResult.checks.find(check => check.id === 'release-facts')?.passed).toBe(true);

    const semicolonConsequenceResponse = response.replace(
      'Browser testing shows two unresolved failures on Windows.',
      'Browser testing shows two unresolved failures on Windows; this may delay release.',
    );
    const semicolonConsequenceResult = scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response: semicolonConsequenceResponse,
      persistedResponse: semicolonConsequenceResponse,
      requestPersonaId: writer.id,
    }));

    expect(semicolonConsequenceResult.checks.find(check => check.id === 'release-facts')?.passed).toBe(true);

    const deniedClaims = [
      'Browser testing does not show two unresolved failures on Windows.',
      'Browser testing cannot show two unresolved failures on Windows.',
      "Browser testing can't show two unresolved failures on Windows.",
      "Browser testing doesn't show two unresolved failures on Windows.",
      "Browser testing isn't showing two unresolved failures on Windows.",
      'Could browser testing show two unresolved failures on Windows?',
      'Browser testing shows two unresolved failures on Windows, but that is not true.',
      'We cannot confirm that browser testing shows two unresolved failures on Windows.',
      'It is unclear whether browser testing shows two unresolved failures on Windows.',
      'Maybe browser testing shows two unresolved failures on Windows.',
      'Reportedly, browser testing shows two unresolved failures on Windows.',
      'Browser testing shows two unresolved failures on Windows, but I retract that claim.',
      'Browser testing shows two unresolved failures on Windows, but that claim has been withdrawn.',
      'Browser testing shows two unresolved failures on Windows, although all failures were fixed afterward.',
      'Previously resolved: Browser tests: Two failures on Windows.',
      'Previously resolved browser tests: Two failures on Windows.',
      'Historical status (now cleared): Browser tests: Two failures on Windows.',
      'Browser tests: Two failures on Windows; later cleared.',
      'Browser tests: Two failures on Windows. Update: those failures have now been resolved.',
      'Browser testing shows two unresolved failures on Windows; correction: zero failures remain.',
      'There is no evidence that browser testing shows two unresolved failures on Windows.',
      'If browser testing shows two unresolved failures on Windows, delay release.',
      'I doubt browser testing shows two unresolved failures on Windows.',
      'An unverified rumor says browser testing shows two unresolved failures on Windows.',
      'It is not the case that browser testing shows two unresolved failures on Windows.',
      'Hypothetically, browser testing shows two unresolved failures on Windows.',
      'Browser testing shows two unresolved failures on Windows, but that claim is unsupported.',
      'No browser tests on Windows show two failures.',
      'It has not been confirmed that browser testing shows two unresolved failures on Windows.',
      'Not Friday. API tests are passing. Browser testing shows two unresolved failures on Windows.',
      'Friday is not the ship date. API tests are passing. Browser testing shows two unresolved failures on Windows.',
      'Friday is the ship date. The assertion that API tests are passing is false. Browser testing shows two unresolved failures on Windows.',
    ];
    for (const deniedClaim of deniedClaims) {
      const deniedResponse = response.replace(
        'Browser testing shows two unresolved failures on Windows.',
        deniedClaim,
      );
      const deniedResult = scorePersonaTrial(writer, evidence({
        prompt: writer.prompt,
        response: deniedResponse,
        persistedResponse: deniedResponse,
        requestPersonaId: writer.id,
      }));

      expect(
        deniedResult.checks.find(check => check.id === 'release-facts')?.passed,
        deniedClaim,
      ).toBe(false);
    }
  });

  it('accepts the exact Qwen writer memo when every supplied fact is preserved', () => {
    const writer = PERSONA_CASES.find(persona => persona.id === 'writer')!;
    const response = [
      '**MEMO: Release Delay Recommendation**',
      '',
      '**Current Status:**',
      '- API tests: Passing.',
      '- Browser tests: Two failures on Windows.',
      '- Smart router: Unexercised without cloud credentials.',
      '',
      '**Recommendation:**',
      'Delay the planned Friday release until the Windows browser failures are resolved and the smart router is validated without cloud credentials.',
    ].join('\n');
    const result = scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: writer.id,
    }));

    for (const id of ['release-facts', 'router-fact', 'recommendation']) {
      expect(result.checks.find(check => check.id === id)?.passed, id).toBe(true);
    }
  });

  it('accepts the exact Qwen 30-minute agenda with an explicit reserved final block', () => {
    const assistant = PERSONA_CASES.find(persona => persona.id === 'executive-assistant')!;
    const response = [
      '**Launch-Readiness Meeting Agenda (30 min)**',
      '*Participants: Product, Engineering, QA, Support*',
      '',
      '**Pre-read Checklist**',
      '- [ ] Final feature scope and release notes',
      '- [ ] Outstanding defects with severity and QA pass/fail status',
      '- [ ] Production deployment checklist and rollback plan',
      '- [ ] Support readiness: runbooks, FAQ, escalation paths',
      '- [ ] Customer communication draft and marketing schedule',
      '',
      '**Agenda**',
      '| Time | Topic | Lead | Decision Required |',
      '|---|---|---|---|',
      '| 5 min | Launch scope review | Product | Confirm scope is locked and no new items are admitted |',
      '| 5 min | Engineering readiness | Engineering | Approve deployment plan and rollback procedure |',
      '| 5 min | QA sign-off | QA | Confirm release candidate passes criteria; identify remaining critical defects |',
      '| 5 min | Support readiness | Support | Approve launch support plan and escalation ownership |',
      '| 5 min | Go/No-Go assessment | Product (facilitator) | Go/No-Go decision based on readiness evidence |',
      '',
      '*Note: The blocks above total 25 minutes; the final 5 minutes are reserved for action-item assignment and confirmation of launch communication timeline.*',
    ].join('\n');
    const result = scorePersonaTrial(assistant, evidence({
      prompt: assistant.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: assistant.id,
    }));

    expect(result.checks.find(check => check.id === 'duration-blocks')?.passed).toBe(true);
    expect(result.checks.find(check => check.id === 'decisions')?.passed).toBe(true);
  });

  it('accepts the exact Qwen current-runway calculation and two affirmative actions', () => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const response = [
      'Runway is calculated using the formula: Runway = Cash Balance ÷ Monthly Burn.',
      '',
      'Given a cash balance of $40,000 and a monthly burn of $10,000 with zero revenue, the runway is exactly 4 months.',
      '',
      'The biggest assumption in this calculation is that the $10,000 monthly burn is fixed and remains constant. In reality, expenses are often variable and may shift month-to-month, meaning actual runway could differ if costs are not strictly locked in.',
      '',
      'Two actions to improve runway:',
      '',
      '1.  **Audit and cut non-essential expenses**: Review the $10,000 burn to identify discretionary costs, software subscriptions, or vendor contracts that can be renegotiated, paused, or eliminated without immediately halting core operations.',
      '2.  **Accelerate time-to-revenue**: Prioritize initiatives that generate cash faster, such as launching a paid service offering, upselling existing contacts, or securing early pilot payments, since every dollar of new revenue directly extends the runway.',
    ].join('\n');
    const result = scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(result.checks.find(check => check.id === 'runway')?.passed).toBe(true);
    expect(result.checks.find(check => check.id === 'two-actions')?.passed).toBe(true);
  });

  it('accepts the exact Qwen priority table when each row gives a decision basis', () => {
    const general = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      '**Order: 1) Production memory bug → 2) Close customer → 3) Repair onboarding friction.**',
      '',
      '## Plan',
      '',
      '| Priority | Rank | Why this position |',
      '|---|---|---|',
      '| Memory bug | 1 | Blocks everything. A live production bug risks churn across *all* customers, including the one you\'re trying to close. Fix first to protect the base and give the sales push a stable foundation. |',
      '| Close customer | 2 | Revenue and momentum. Once stability is confirmed, focus energy here — deals don\'t close themselves, and a confident product demo beats a known-unstable one. |',
      '| Onboarding friction | 3 | High-value but rarely time-boxed to *this* week. It compounds over time rather than burning a deadline. Schedule it as the structured work once the fires are out. |',
      '',
      '**Rationale for the sequence:** The bug is a risk-reducer, the close is an opportunity-capturer, and onboarding is a long-term ROI item. Risk reduction before revenue capture, revenue capture before optimization. Each step removes uncertainty for the next.',
      '',
      '## First Action Today',
      '',
      '**Triage the memory bug as a bounded investigation, not a fix:**',
      '1. Pull the last 24h of production logs and isolate the memory growth pattern — is it leaking per-request, per-session, or background job?',
      '2. Reproduce locally with a minimal harness to confirm the failure mode.',
      '3. Decide scope: if it\'s a quick patch, fix it; if it needs deeper surgery, ship a mitigation (restart policy, limit, or feature flag) to stop the bleeding *now* and schedule the real fix for next week.',
      '',
      'Time-box this to half a day. You don\'t need to solve it completely today — you need to know whether it\'s a fire or a slow burn, because that answer changes how much headroom you have for the customer push.',
    ].join('\n');
    const result = scorePersonaTrial(general, evidence({
      prompt: general.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: general.id,
    }));

    expect(result.checks.find(check => check.id === 'justification')?.passed).toBe(true);
  });

  it('keeps the Qwen writer grammar fail-closed for negated facts and recommendations', () => {
    const writer = PERSONA_CASES.find(persona => persona.id === 'writer')!;
    const base = [
      'Friday ship status: API tests passing.',
      'Browser tests: Two failures on Windows.',
      'Smart router: Unexercised without cloud credentials.',
      'Recommendation: Delay the planned Friday release until those gaps are closed.',
    ].join('\n');
    const check = (response: string, id: string): boolean => scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: writer.id,
    })).checks.find(item => item.id === id)?.passed ?? false;

    expect(check(base.replace('Two failures', 'Not two failures'), 'release-facts')).toBe(false);
    expect(check(base.replace('Two failures on Windows.', 'Two failures on Windows were resolved yesterday.'), 'release-facts')).toBe(false);
    expect(check(base.replace('Browser tests: Two failures on Windows.', 'Resolved: Browser tests: Two failures on Windows.'), 'release-facts')).toBe(false);
    expect(check(base.replace('Unexercised', 'Not unexercised'), 'router-fact')).toBe(false);
    expect(check(base.replace('Smart router: Unexercised', "The smart router wasn't untested"), 'router-fact')).toBe(false);
    expect(check(base.replace('Smart router: Unexercised', 'The smart router is hardly untested'), 'router-fact')).toBe(false);
    expect(check(base.replace('Smart router: Unexercised', 'If the smart router is unexercised'), 'router-fact')).toBe(false);
    expect(check(base.replace('Smart router: Unexercised without', 'Smart router: Unexercised with'), 'router-fact')).toBe(false);
    expect(check(base.replace(
      'Smart router: Unexercised without cloud credentials.',
      'The smart router is healthy; the browser is untested without cloud credentials.',
    ), 'router-fact')).toBe(false);
    expect(check(`${base}\nCorrection: the smart router was exercised without cloud credentials.`, 'router-fact')).toBe(false);
    for (const deniedRouterStatus of [
      'Assuming the smart router is untested without cloud credentials.',
      'Provided that the smart router is untested without cloud credentials.',
      'The smart router would be untested without cloud credentials.',
      'The smart router is supposedly untested without cloud credentials.',
      'Presumably, the smart router is untested without cloud credentials.',
      'Pending confirmation, the smart router is untested without cloud credentials.',
      'Smart router is untested without cloud credentials, but it is now tested.',
      'The smart router is untested with cloud credentials, not without cloud credentials.',
      'The smart router is untested without cloud credentials but is fully tested without cloud credentials.',
      'Smart router is untested without cloud credentials. It is now tested without cloud credentials.',
      'Smart router is untested without cloud credentials. We exercised the smart router without cloud credentials.',
      'Smart router is untested without cloud credentials. Correction: we tested it without cloud credentials.',
      'Smart router is untested without cloud credentials. The team has now tested it without cloud credentials.',
      'Smart router is untested without cloud credentials. However, it is now tested without cloud credentials.',
      'Smart router is untested without cloud credentials. The router is now tested without cloud credentials.',
      'Smart router is untested without cloud credentials. It has since been tested without cloud credentials.',
      'Smart router is untested without cloud credentials. The same was later tested without cloud credentials.',
      'Smart router is untested without cloud credentials. Testing later covered the smart router without credentials.',
    ]) {
      expect(check(base.replace(
        'Smart router: Unexercised without cloud credentials.',
        deniedRouterStatus,
      ), 'router-fact'), deniedRouterStatus).toBe(false);
    }
    expect(check(base.replace('Recommendation: Delay', 'Recommendation: Do not delay'), 'recommendation')).toBe(false);
    for (const nonRecommendation of [
      'Recommendation: Should we delay the planned Friday release until those gaps are closed?',
      'Recommendation: Could delay the planned Friday release until those gaps are closed.',
      'Recommendation: Delay the planned Friday release until those gaps are closed? No.',
      'Recommendation: Delaying the planned Friday release until the Windows failures are resolved is not recommended.',
    ]) {
      expect(check(base.replace(
        'Recommendation: Delay the planned Friday release until those gaps are closed.',
        nonRecommendation,
      ), 'recommendation'), nonRecommendation).toBe(false);
    }
    for (const status of [
      'The smart router has not been exercised without cloud credentials.',
      'The smart router has not been validated without cloud credentials.',
      'The smart router is untested without cloud credentials.',
      'The smart router still needs to be exercised without cloud credentials.',
      'We have yet to exercise the smart router without cloud credentials.',
      'Testing the smart router without cloud credentials remains outstanding.',
      'The smart router still awaits testing without cloud credentials.',
      'Testing without cloud credentials is still pending for the smart router.',
    ]) {
      expect(check(base.replace('Smart router: Unexercised without cloud credentials.', status), 'router-fact'), status).toBe(true);
    }
  });

  it('accepts a Qwen memo that states the delay recommendation and condition in adjacent sentences', () => {
    const writer = PERSONA_CASES.find(persona => persona.id === 'writer')!;
    const response = [
      'We originally planned to ship this Friday. API tests pass, but browser tests still show two failures on Windows. The smart router has not been exercised without cloud credentials.',
      'Given these unresolved gaps, we recommend delaying the release. Proceeding without closing the browser failures and validating the smart router introduces risk.',
    ].join('\n');

    const result = scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: writer.id,
    }));
    expect(result.checks.find(check => check.id === 'recommendation')?.passed).toBe(true);
  });

  it('accepts a Qwen memo that closes an explicitly named gap with a pronoun', () => {
    const writer = PERSONA_CASES.find(persona => persona.id === 'writer')!;
    const response = [
      'Browser tests retain two failures on Windows. The smart router has not been exercised without cloud credentials.',
      'Given these outstanding gaps, the recommendation is to delay the release until they are closed.',
    ].join('\n');

    const result = scorePersonaTrial(writer, evidence({
      prompt: writer.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: writer.id,
    }));
    expect(result.checks.find(check => check.id === 'recommendation')?.passed).toBe(true);

    for (const rejected of [
      response.replace('the recommendation is to delay', 'the recommendation is not to delay'),
      response.replace('until they are closed', 'until they are not closed'),
      response.replace('the recommendation is to delay', 'should the recommendation be to delay'),
      response.replace('until they are closed.', 'until they are closed, but that recommendation is withdrawn.'),
      response.replace('until they are closed.', 'until they are closed but that recommendation was withdrawn.'),
      response.replace('until they are closed.', 'until they are closed; the recommendation has been withdrawn.'),
      `${response} However, that recommendation has been retracted.`,
      `${response} However, delaying the release is not recommended.`,
      `${response} However, the team no longer recommends delaying the release.`,
      response.replace('Given these outstanding gaps', 'These outstanding gaps are not real;'),
    ]) {
      const rejectedResult = scorePersonaTrial(writer, evidence({
        prompt: writer.prompt,
        response: rejected,
        persistedResponse: rejected,
        requestPersonaId: writer.id,
      }));
      expect(rejectedResult.checks.find(check => check.id === 'recommendation')?.passed, rejected).toBe(false);
    }
  });

  it('does not invent a 30-minute agenda from a negated or wrong remainder', () => {
    const assistant = PERSONA_CASES.find(persona => persona.id === 'executive-assistant')!;
    const base = [
      '**Launch-Readiness Meeting Agenda (30 min)**',
      '**Agenda**',
      '| Time | Topic | Decision Required |',
      '|---|---|---|',
      '| 10 min | Product | Decide scope |',
      '| 15 min | QA and Support | Decide readiness |',
      '*The final 5 minutes are reserved for action-item assignment.*',
    ].join('\n');
    const scored = (response: string): boolean => scorePersonaTrial(assistant, evidence({
      prompt: assistant.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: assistant.id,
    })).checks.find(item => item.id === 'duration-blocks')?.passed ?? false;

    expect(scored(base)).toBe(true);
    expect(scored(base.replace('are reserved', 'are not reserved'))).toBe(false);
    expect(scored(base.replace('final 5 minutes', 'final 4 minutes'))).toBe(false);
    expect(scored(base.replace(
      '*The final 5 minutes are reserved for action-item assignment.*',
      '## Pre-read Checklist\n- The final 5 minutes are reserved for document review.',
    ))).toBe(false);
    expect(scored(base.replace(
      '*The final 5 minutes are reserved for action-item assignment.*',
      'If leadership approves, the final 5 minutes are reserved for action items.',
    ))).toBe(false);
    expect(scored(base.replace(
      '*The final 5 minutes are reserved for action-item assignment.*',
      'The final 5 minutes are reserved for action items, but actually not.',
    ))).toBe(false);
    expect(scored(base.replace(
      '*The final 5 minutes are reserved for action-item assignment.*',
      'The final 5 minutes are reserved for action items — this is false.',
    ))).toBe(false);
    for (const deniedRemainder of [
      'The final 5 minutes are reserved for action items, subject to leadership approval.',
      'The final 5 minutes are reserved for action items, except that this reservation is cancelled.',
      'The final 5 minutes are reserved for action items — cancelled.',
      'For reference only: the final 5 minutes are reserved for action items.',
      'Alternative only, excluded from this plan: the final 5 minutes are reserved for action items.',
      'Once leadership approves, the final 5 minutes are reserved for action items.',
      'When leadership approves, the final 5 minutes are reserved for action items.',
      'Only after leadership approval are the final 5 minutes reserved for action items.',
    ]) {
      expect(scored(base.replace(
        '*The final 5 minutes are reserved for action-item assignment.*',
        deniedRemainder,
      )), deniedRemainder).toBe(false);
    }
    expect(scored(`${base}\nThis reservation was subsequently cancelled.`)).toBe(false);
    expect(scored(`${base}\nCorrection: no time is reserved for action items.`)).toBe(false);
    expect(scored(`${base}\nUpdate: cancel that reservation.`)).toBe(false);
    expect(scored(`${base}\nUpdate: this reservation no longer applies.`)).toBe(false);
    expect(scored(base.replace(
      '*The final 5 minutes are reserved for action-item assignment.*',
      'The final 5 minutes are reserved for action items. Update: that reservation no longer applies.',
    ))).toBe(false);
    expect(scored(`${base}\nThat reservation has since been withdrawn.`)).toBe(false);
    expect(scored(base.replace(
      '*The final 5 minutes are reserved for action-item assignment.*',
      'The final 5 minutes are reserved for action items. This reservation is no longer in effect.',
    ))).toBe(false);
    expect(scored(base.replace(
      '*The final 5 minutes are reserved for action-item assignment.*',
      'The final 5 minutes are reserved for action items. Update: cancel that reservation.',
    ))).toBe(false);

    const decimalAgenda = base
      .replace('| 10 min | Product | Decide scope |', '| Product | 1.1 min | Decide scope |')
      .replace('| 15 min | QA and Support | Decide readiness |', '| QA and Support | 23.9 min | Decide readiness |');
    expect(scored(decimalAgenda)).toBe(true);

    const decisionHeaderOnly = base
      .replace('| 10 min | Product | Decide scope |', '| 10 min | Product | TBD |')
      .replace('| 15 min | QA and Support | Decide readiness |', '| 15 min | QA and Support | None |');
    const decisionResult = scorePersonaTrial(assistant, evidence({
      prompt: assistant.prompt,
      response: decisionHeaderOnly,
      persistedResponse: decisionHeaderOnly,
      requestPersonaId: assistant.id,
    }));
    expect(decisionResult.checks.find(item => item.id === 'decisions')?.passed).toBe(false);
    for (const invalidDecision of [
      'We did not approve launch',
      'Never approve launch',
      'Could approve launch',
      'Would decide later',
      'Confirm scope remains TBD',
      'Approve later — TBD',
      'Confirm scope remains undecided',
      'Make no final choice',
    ]) {
      const invalidDecisionAgenda = base
        .replace('| 10 min | Product | Decide scope |', `| 10 min | Product | ${invalidDecision} |`)
        .replace('| 15 min | QA and Support | Decide readiness |', '| 15 min | QA and Support | None |');
      const invalidDecisionResult = scorePersonaTrial(assistant, evidence({
        prompt: assistant.prompt,
        response: invalidDecisionAgenda,
        persistedResponse: invalidDecisionAgenda,
        requestPersonaId: assistant.id,
      }));
      expect(invalidDecisionResult.checks.find(item => item.id === 'decisions')?.passed, invalidDecision).toBe(false);
    }
  });

  it('keeps exact runway and action variants fail-closed under contradiction', () => {
    const finance = PERSONA_CASES.find(persona => persona.id === 'finance-owner')!;
    const base = [
      'Runway = Cash Balance ÷ Monthly Burn.',
      'The runway is exactly 4 months.',
      'The biggest assumption is constant burn and zero revenue.',
      'Two actions to improve runway:',
      '1. Audit and cut non-essential expenses.',
      '2. Accelerate time-to-revenue by generating cash faster.',
    ].join('\n');
    const scored = (response: string) => scorePersonaTrial(finance, evidence({
      prompt: finance.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: finance.id,
    }));

    expect(scored(base.replace('exactly 4', 'exactly 5')).checks.find(item => item.id === 'runway')?.passed).toBe(false);
    const denied = base
      .replace('Audit and cut', 'Do not audit or cut')
      .replace('Accelerate time-to-revenue', 'Do not accelerate time-to-revenue');
    expect(scored(denied).checks.find(item => item.id === 'two-actions')?.passed).toBe(false);
    expect(scored(base.replace(
      'Accelerate time-to-revenue by generating cash faster.',
      'Increase cash burn.',
    )).checks.find(item => item.id === 'two-actions')?.passed).toBe(false);
    expect(scored(base.replace(
      'Accelerate time-to-revenue by generating cash faster.',
      'Accelerate the decline in revenue.',
    )).checks.find(item => item.id === 'two-actions')?.passed).toBe(false);
    expect(scored(base.replace(
      'Accelerate time-to-revenue by generating cash faster.',
      'Generate cash outflows.',
    )).checks.find(item => item.id === 'two-actions')?.passed).toBe(false);
    expect(scored(base.replace(
      'Accelerate time-to-revenue by generating cash faster.',
      'Generate a cash forecast and revenue report.',
    )).checks.find(item => item.id === 'two-actions')?.passed).toBe(false);
    for (const reportingOnly of [
      'Generate a report on revenue.',
      'Grow revenue reporting.',
      'Raise an analysis of funding.',
      'Generate a cash-flow report.',
      'Generate a cash-flow summary.',
      'Increase cash consumption.',
      'Increase customer complaints.',
      'Grow customer churn.',
      'Raise funding costs.',
      'Generate cash losses.',
      'Generate a memo on revenue.',
      'Raise customer acquisition costs.',
      'Increase customer acquisition expenses.',
      'Generate revenue losses.',
    ]) {
      expect(scored(base.replace(
        'Accelerate time-to-revenue by generating cash faster.',
        reportingOnly,
      )).checks.find(item => item.id === 'two-actions')?.passed, reportingOnly).toBe(false);
    }
    const reportingOnlyPair = base
      .replace('Audit and cut non-essential expenses.', 'Audit and cut the cost forecast.')
      .replace('Accelerate time-to-revenue by generating cash faster.', 'Raise the funding report.');
    expect(scored(reportingOnlyPair).checks.find(item => item.id === 'two-actions')?.passed).toBe(false);
  });

  it('does not borrow swapped decision bases across Qwen-style priority table rows', () => {
    const general = PERSONA_CASES.find(persona => persona.id === 'general-purpose')!;
    const response = [
      '**Order: 1) Production memory bug → 2) Close customer → 3) Repair onboarding friction.**',
      '| Priority | Rank | Why this position |',
      '|---|---|---|',
      '| Memory bug | 1 | Reliability risk and churn make this urgent. |',
      '| Close customer | 2 | Long-term ROI compounds over time. |',
      '| Onboarding friction | 3 | Revenue and commercial momentum. |',
      '**First Action Today** Triage the memory bug.',
    ].join('\n');
    const result = scorePersonaTrial(general, evidence({
      prompt: general.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: general.id,
    }));

    expect(result.checks.find(check => check.id === 'justification')?.passed).toBe(false);

    const missingOnboardingBasis = response.replace(
      '| Onboarding friction | 3 | Revenue and commercial momentum. |',
      '| Onboarding friction | 3 | TBD |',
    );
    const missingBasisResult = scorePersonaTrial(general, evidence({
      prompt: general.prompt,
      response: missingOnboardingBasis,
      persistedResponse: missingOnboardingBasis,
      requestPersonaId: general.id,
    }));
    expect(missingBasisResult.checks.find(check => check.id === 'justification')?.passed).toBe(false);

    const disclaimedRationale = response
      .replace('| Memory bug | 1 | Reliability risk and churn make this urgent. |', '| Memory bug | 1 | Churn; this is not a rationale. |')
      .replace('| Close customer | 2 | Long-term ROI compounds over time. |', '| Close customer | 2 | Revenue; this is not a rationale. |')
      .replace('| Onboarding friction | 3 | Revenue and commercial momentum. |', '| Onboarding friction | 3 | Long-term ROI; this is not a rationale. |');
    const disclaimedResult = scorePersonaTrial(general, evidence({
      prompt: general.prompt,
      response: disclaimedRationale,
      persistedResponse: disclaimedRationale,
      requestPersonaId: general.id,
    }));
    expect(disclaimedResult.checks.find(check => check.id === 'justification')?.passed).toBe(false);

    const pseudoTable = response
      .replace('|---|---|---|\n', '')
      .replace('| Close customer | 2 | Long-term ROI compounds over time. |', '| Close customer | 2 | Revenue and commercial momentum. |')
      .replace('| Onboarding friction | 3 | Revenue and commercial momentum. |', '| Onboarding friction | 3 | Long-term ROI compounds over time. |');
    const pseudoTableResult = scorePersonaTrial(general, evidence({
      prompt: general.prompt,
      response: pseudoTable,
      persistedResponse: pseudoTable,
      requestPersonaId: general.id,
    }));
    expect(pseudoTableResult.checks.find(check => check.id === 'justification')?.passed).toBe(false);

    for (const malformedSeparator of ['|---|', '| unrelated | row | before separator |\n|---|---|---|']) {
      const malformedTable = response
        .replace('|---|---|---|', malformedSeparator)
        .replace('| Close customer | 2 | Long-term ROI compounds over time. |', '| Close customer | 2 | Revenue and commercial momentum. |')
        .replace('| Onboarding friction | 3 | Revenue and commercial momentum. |', '| Onboarding friction | 3 | Long-term ROI compounds over time. |');
      const malformedResult = scorePersonaTrial(general, evidence({
        prompt: general.prompt,
        response: malformedTable,
        persistedResponse: malformedTable,
        requestPersonaId: general.id,
      }));
      expect(malformedResult.checks.find(check => check.id === 'justification')?.passed, malformedSeparator).toBe(false);
    }

    for (const disclaimer of [
      'Churn; not actually a rationale.',
      'Churn; no rationale here.',
      'Churn; this does not justify the ranking.',
      'Not a rationale: churn matters.',
      'TBD, probably churn.',
      'TBC, probably churn.',
      'Probably churn because it poses risk.',
      'Tentatively, churn because it poses risk.',
      'Churn, but it should not justify this position.',
    ]) {
      const disclaimedTable = response
        .replace('Reliability risk and churn make this urgent.', disclaimer)
        .replace('| Close customer | 2 | Long-term ROI compounds over time. |', '| Close customer | 2 | Revenue and commercial momentum. |')
        .replace('| Onboarding friction | 3 | Revenue and commercial momentum. |', '| Onboarding friction | 3 | Long-term ROI compounds over time. |');
      const disclaimedTableResult = scorePersonaTrial(general, evidence({
        prompt: general.prompt,
        response: disclaimedTable,
        persistedResponse: disclaimedTable,
        requestPersonaId: general.id,
      }));
      expect(disclaimedTableResult.checks.find(check => check.id === 'justification')?.passed, disclaimer).toBe(false);
    }
  });
});

describe('Qwen Flash Next exact-response regressions', () => {
  const persona = (id: string) => {
    const match = PERSONA_CASES.find(candidate => candidate.id === id);
    if (!match) throw new Error(`Missing canonical persona ${id}`);
    return match;
  };

  const scoreResponse = (
    id: string,
    response: string,
    overrides: Partial<PersonaTrialEvidence> = {},
  ) => {
    const acceptanceCase = persona(id);
    return scorePersonaTrial(acceptanceCase, evidence({
      prompt: acceptanceCase.prompt,
      response,
      persistedResponse: response,
      requestPersonaId: acceptanceCase.id,
      ...overrides,
    }));
  };

  it('accepts the exact ordered and justified Qwen prioritization response', () => {
    const response = [
      '**Recommended Order:** Investigate memory bug → Repair onboarding → Close customer.',
      '',
      '**Rationale:**',
      'The production memory bug is the only item that threatens your existing user base, potentially causing data loss or instability. Fixing it first removes active harm. Onboarding repair is the highest-leverage growth lever; since closing one new customer provides only one data point, improving onboarding ensures you can capture the *next* five. The customer close is urgent but likely has a natural deadline or existing momentum. It should be your primary focus *after* stabilizing production, but not before, as a system failure during a critical pitch is catastrophic.',
      '',
      "**Today's First Action:**",
      'Reproduce the production memory bug in a staging environment with a test user dataset.',
    ].join('\n');

    const result = scoreResponse('general-purpose', response);
    expect(result.checks.find(check => check.id === 'ordered-plan')?.passed).toBe(true);
    expect(result.checks.find(check => check.id === 'justification')?.passed).toBe(true);
  });

  it('accepts rationale expressed as one Why bullet per supplied priority', () => {
    const response = [
      '## Recommended order',
      '1. Investigate the production memory bug',
      '2. Close one customer',
      '3. Repair onboarding friction',
      '## Why',
      '- **Memory bug first:** production reliability is the only item with time-sensitive downside.',
      '- **Customer second:** one close is a concrete, short-cycle outcome.',
      '- **Onboarding third:** friction reduction compounds over time and its cost is gradual.',
      '## First action today',
      'Open a production investigation ticket.',
    ].join('\n');

    const result = scoreResponse('general-purpose', response);
    expect(result.checks.find(check => check.id === 'justification')?.passed).toBe(true);
  });

  it('accepts milestone-local dependencies and explicit Owner role assignments', () => {
    const response = [
      '## Milestones & Dependencies',
      '**M1: Native packaging**',
      '- **Dependencies:** None.',
      '- **Owner:** Platform Engineering Lead',
      '**M2: Local model integration**',
      '- **Dependencies:** Depends on M1.',
      '- **Owner:** Backend Infrastructure Engineer',
      '## Risks & Exit Criteria',
      'Risk: packaging failure. Exit criteria: clean Windows install succeeds.',
    ].join('\n');

    const result = scoreResponse('project-manager', response);
    expect(result.checks.find(check => check.id === 'dependencies')?.passed).toBe(true);
    expect(result.checks.find(check => check.id === 'owners')?.passed).toBe(true);
  });

  it('accepts milestone-local Depends on labels emitted by Qwen', () => {
    const response = [
      '### Milestones & Dependencies',
      '**M1: Native packaging**',
      '* **Depends on:** N/A',
      '**M2: Local model integration**',
      '* **Depends on:** M1',
      '### Risks & Exit Criteria',
      'Risk: packaging failure. Exit criteria: clean Windows install succeeds.',
    ].join('\n');

    const result = scoreResponse('project-manager', response);
    expect(result.checks.find(check => check.id === 'dependencies')?.passed).toBe(true);

    const denied = scoreResponse('project-manager', response.replace('**Depends on:** M1', '**Depends on:** does not depend on M1'));
    expect(denied.checks.find(check => check.id === 'dependencies')?.passed).toBe(false);

    const withdrawn = scoreResponse('project-manager', response.replace('**Depends on:** M1', '**No longer depends on:** M1'));
    expect(withdrawn.checks.find(check => check.id === 'dependencies')?.passed).toBe(false);
  });

  it('accepts italic Owner labels as explicit role assignments', () => {
    const response = [
      '## Milestones',
      'M2 depends on M1.',
      '- *Owner*: DevOps Lead',
      '- *Owner*: Backend Lead',
      '## Risks & Exit Criteria',
      'Risk: packaging failure. Exit criteria: clean Windows install succeeds.',
    ].join('\n');

    const result = scoreResponse('project-manager', response);
    expect(result.checks.find(check => check.id === 'owners')?.passed).toBe(true);
  });

  it('accepts noun-phrase desired decisions in an explicit decision section', () => {
    const response = [
      '**Launch-readiness meeting agenda (30 minutes)**',
      'Participants: Product, Engineering, QA, Support',
      '| Time Block | Topic |',
      '|---|---|',
      '| 00:00-00:15 | Readiness review |',
      '| 00:15-00:30 | Decision and actions |',
      '**Desired Decisions**',
      '- Go or No-Go for the launch date.',
      '- Final confirmation of the production rollout sequence.',
      '**Pre-read Checklist**',
      '- [ ] Release evidence',
    ].join('\n');

    const result = scoreResponse('executive-assistant', response);
    expect(result.checks.find(check => check.id === 'decisions')?.passed).toBe(true);
  });

  it('accepts renegotiation and pre-sales as concrete runway actions', () => {
    const response = [
      'Cash divided by net monthly burn gives exactly 4 months of runway.',
      'The biggest assumption is that burn stays constant and revenue remains zero.',
      '**Two actions to extend runway:**',
      '- **Cost reduction:** Renegotiate recurring expenses or cut discretionary spend.',
      '- **Cash inflow:** Pre-sell services or accelerate accounts receivable.',
    ].join('\n');

    const result = scoreResponse('finance-owner', response);
    expect(result.checks.find(check => check.id === 'two-actions')?.passed).toBe(true);
  });

  it('accepts lettered Researcher and Coder lane headings', () => {
    const response = [
      '#### Lane A: Researcher (Audit & Gap Analysis)',
      'Objective, inputs, deliverables, dependencies, and merge criteria.',
      '#### Lane B: Coder (Remediation & Instrumentation)',
      'Objective, inputs, deliverables, dependencies, and merge criteria.',
      'The coordinator must verify evidence before accepting either result.',
    ].join('\n');

    const result = scoreResponse('coordinator', response);
    expect(result.checks.find(check => check.id === 'two-lanes')?.passed).toBe(true);
  });

  it('accepts a contains-no-files conclusion backed by an exhaustive receipt', () => {
    const response = [
      'The current virtual workspace contains no files.',
      'An exhaustive workspace-rooted search returned no files.',
      'Next engineering step: initialize the project foundation.',
    ].join('\n');
    const result = scoreResponse('coder', response, {
      toolsUsed: ['search_files'],
      sseEvents: [
        { event: 'tool', data: { name: 'search_files', input: { pattern: '**/*' } } },
        { event: 'tool_result', data: { name: 'search_files', result: 'No files found.', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['search_files'] } },
      ],
    });

    expect(result.checks.find(check => check.id === 'empty-result')?.passed).toBe(true);
  });

  it('recognizes the exact retained Windows failures while still rejecting its invented assurance', () => {
    const response = [
      '**MEMO: Release Delay Recommendation**',
      '',
      '**Status Update:**',
      'We originally planned to ship on Friday. Current testing results are mixed. API tests pass successfully. However, browser tests retain two failures on Windows. Additionally, the smart router has not been exercised without cloud credentials.',
      '',
      '**Recommendation:**',
      'Delay the release until these identified gaps are fully closed. This ensures platform stability and proper router functionality across all environments before shipment.',
      '',
      '**Action Required:**',
      'Address Windows browser test failures and complete unauthenticated smart router testing prior to finalizing the release schedule.',
    ].join('\n');

    const result = scoreResponse('writer', response);
    expect(result.checks.find(check => check.id === 'release-facts')?.passed).toBe(true);
    expect(result.checks.find(check => check.id === 'no-new-claims')?.passed).toBe(false);
    for (const resolvedClause of [
      'browser tests retain two failures on Windows, but both were resolved.',
      'browser tests retain two failures on Windows, but those failures were resolved.',
    ]) {
      const resolvedResponse = response.replace(
        'browser tests retain two failures on Windows.',
        resolvedClause,
      );
      const resolvedResult = scoreResponse('writer', resolvedResponse);
      expect(
        resolvedResult.checks.find(check => check.id === 'release-facts')?.passed,
        resolvedClause,
      ).toBe(false);
    }
  });

  it('accepts the exact contiguous 30-minute Qwen agenda table without redundant prose', () => {
    const response = [
      '| Time Block | Duration | Topic & Lead | Desired Decision / Output |',
      '|---|---|---|---|',
      '| 0:00–0:05 | 5 min | **Welcome & Launch Criteria Review** (Product) | Confirm shared definition of “launch-ready”; align on go/no-go gate criteria |',
      '| 0:05–0:13 | 8 min | **Engineering Status & Open Items** (Engineering) | Approve code freeze or identify blocking defects with owners and target resolution times |',
      '| 0:13–0:21 | 8 min | **QA Coverage & Exit Report** (QA) | Sign off on test plan completion or authorize conditional pass with explicit exceptions and mitigation owners |',
      '| 0:21–0:27 | 6 min | **Support Readiness & Rollout Plan** (Support) | Approve support runbook, escalation paths, and phased rollout percentages |',
      '| 0:27–0:30 | 3 min | **Go/No-Go Decision & Next Steps** (Product) | Recorded launch decision with owner assignments and follow-up checkpoint time |',
      '',
      '### Pre-Read Checklist',
      '- [ ] Engineering: open P0/P1 defects with assignees',
      '- [ ] QA: final test execution summary',
      '- [ ] Product: launch feature set',
      '- [ ] Support: support runbook',
    ].join('\n');

    const result = scoreResponse('executive-assistant', response);
    expect(result.checks.find(check => check.id === 'duration-blocks')?.passed).toBe(true);
    const supportingSchedule = scoreResponse(
      'executive-assistant',
      response.replace(
        '- [ ] Product: launch feature set',
        '- [ ] Product: launch schedule and scope',
      ),
    );
    expect(supportingSchedule.checks.find(check => check.id === 'duration-blocks')?.passed).toBe(true);
    for (const invalidResponse of [
      response.replace('\n\n### Pre-Read', '\nMeeting duration: 45 minutes.\n\n### Pre-Read'),
      response.replace('\n\n### Pre-Read', '\nThis table is illustrative only and is not the agenda.\n\n### Pre-Read'),
      `${response}\n### Notes\nThis table is illustrative only and is not the agenda.`,
      `${response}\n### Notes\nThis table is merely illustrative.`,
      `${response}\n### Notes\nThis is only an example schedule, not the agenda.`,
      `${response}\n### Notes\nDisregard the table; it is not the agenda.`,
      `${response}\n### Notes\nThe table above should not be used as the agenda.`,
      `${response}\n### Notes\nThe table is hypothetical only.`,
      `${response}\n### Notes\nWithdraw the schedule above; it is not adopted.`,
      `${response}\n### Notes\nCancel the schedule above; it is not adopted.`,
      `${response}\n### Notes\nAbandon the agenda above; it should not be used.`,
      `${response}\n### Notes\nRescind the agenda above; do not follow it.`,
      `${response}\n### Notes\nSupersede the schedule above; use a different one.`,
      response.replace(
        '- [ ] Engineering: open P0/P1 defects with assignees',
        '- [ ] Product: Rescind the agenda above; do not follow it.',
      ),
      `## Pre-Read only\n${response}`,
    ]) {
      const invalidResult = scoreResponse('executive-assistant', invalidResponse);
      expect(
        invalidResult.checks.find(check => check.id === 'duration-blocks')?.passed,
        invalidResponse,
      ).toBe(false);
    }
  });

  it('rejects a superficially exact agenda table whose duration cells contradict its ranges', () => {
    const response = [
      '| Time Block | Duration | Topic & Lead | Desired Decision / Output |',
      '|---|---|---|---|',
      '| 0:00–0:05 | 8 min | Welcome (Product) | Confirm criteria |',
      '| 0:05–0:30 | 22 min | Decision (Engineering, QA, Support) | Approve launch |',
      '',
      '### Pre-Read Checklist',
      '- [ ] Product, Engineering, QA, Support checklist',
    ].join('\n');

    const result = scoreResponse('executive-assistant', response);
    expect(result.checks.find(check => check.id === 'duration-blocks')?.passed).toBe(false);
  });

  it('accepts the exact constant-burn assumption and two labeled table actions', () => {
    const response = [
      '| Category | Detail |',
      '| --- | --- |',
      '| **Runway** | 4.00 months |',
      '| **Formula** | Runway = Current Cash ÷ Monthly Burn Rate ($40,000 ÷ $10,000) |',
      '| **Biggest Assumption** | The monthly burn rate remains perfectly constant for the entire period (no new hires, tool renewals, or operational cost changes). |',
      '| **Improvement Action 1** | Secure a bridge loan or negotiate favorable payment terms to increase available cash. |',
      '| **Improvement Action 2** | Enact temporary cost-reduction measures (e.g., freezing new hires, pausing non-critical subscriptions) to lower monthly burn. |',
    ].join('\n');

    const result = scoreResponse('finance-owner', response);
    const exactCashWithKnownCost = scoreResponse(
      'finance-owner',
      response.replace(
        'Enact temporary cost-reduction measures (e.g., freezing new hires, pausing non-critical subscriptions) to lower monthly burn.',
        'Reduce monthly burn by renegotiating vendors.',
      ),
    );
    const exactCostWithKnownCash = scoreResponse(
      'finance-owner',
      response.replace(
        'Secure a bridge loan or negotiate favorable payment terms to increase available cash.',
        'Generate revenue to increase available cash.',
      ),
    );
    expect(result.checks.find(check => check.id === 'assumption')?.passed).toBe(true);
    expect(exactCashWithKnownCost.checks.find(check => check.id === 'two-actions')?.passed).toBe(true);
    expect(exactCostWithKnownCash.checks.find(check => check.id === 'two-actions')?.passed).toBe(true);
    expect(result.checks.find(check => check.id === 'two-actions')?.passed).toBe(true);
    for (const invalidResponse of [
      response.replace('Enact temporary cost-reduction measures', 'Enact no cost-reduction measures'),
      response.replace('Secure a bridge loan', 'Secure a credit report'),
      response.replace('Secure a bridge loan', 'Arrange a financing report for the board'),
      response.replace('Secure a bridge loan', 'Arrange a report on financing for the board'),
      response.replace('Secure a bridge loan', 'Arrange a briefing on financing for the board'),
      response.replace('Secure a bridge loan', 'Arrange a workshop on financing for the board'),
      response.replace('Secure a bridge loan', 'Schedule a financing review for the board'),
      response.replace('Secure a bridge loan', 'Arrange a consultation on financing for the board'),
      response.replace('Secure a bridge loan', 'Arrange an evaluation of financing options for the board'),
      response.replace(
        'Secure a bridge loan or negotiate favorable payment terms to increase available cash.',
        'Secure a bridge loan; do not act on this recommendation.',
      ),
      `${response}\n### Notes\nThese actions are hypothetical only and are not recommendations.`,
      `${response}\n### Notes\nThe proposed actions are hypothetical only and are not recommendations.`,
      `${response}\n### Notes\nDo not implement either action.`,
      `${response}\n### Notes\nThese are merely suggestions, not recommendations.`,
      `${response}\n### Notes\nThe table is hypothetical only.`,
      `${response}\n### Notes\nNeither action is recommended.`,
      `${response}\n### Notes\nDisregard both actions.`,
      `${response}\n### Notes\nActions 1 and 2 are hypothetical only.`,
      `${response}\n### Notes\nEach action is only hypothetical.`,
      `${response}\n### Notes\nBoth steps are hypothetical only.`,
      `${response}\n### Notes\nNeither step is recommended.`,
      `${response}\n### Notes\nThese options are hypothetical only.`,
      `${response}\n### Notes\nNeither proposal should be implemented.`,
      `${response}\n### Notes\nTreat these measures as hypothetical only.`,
    ]) {
      const invalidResult = scoreResponse('finance-owner', invalidResponse);
      expect(
        invalidResult.checks.find(check => check.id === 'two-actions')?.passed,
        invalidResponse,
      ).toBe(false);
    }
    for (const affirmedResponse of [
      `${response}\n### Notes\nThese actions are not hypothetical; implement both.`,
      `${response}\n### Notes\nDo not disregard these actions; implement both.`,
      `${response}\n### Notes\nDo not withdraw both actions; implement them.`,
      `${response}\n### Notes\nI did not retract these actions; implement both.`,
      `${response}\n### Notes\nNeither action is hypothetical; both are recommended.`,
      `${response}\n### Notes\nNeither of these actions are hypothetical; both are recommended.`,
      `${response}\n### Notes\nNeither of those recommendations is illustrative; both are approved.`,
      `${response}\n### Notes\nNeither of the proposals is hypothetical; both are selected.`,
      `${response}\n### Notes\nThe table is illustrative of the approved actions; implement both.`,
    ]) {
      const affirmedResult = scoreResponse('finance-owner', affirmedResponse);
      expect(
        affirmedResult.checks.find(check => check.id === 'two-actions')?.passed,
        affirmedResponse,
      ).toBe(true);
    }
  });

  it('accepts the exact empty-workspace answer only with an exhaustive successful tool receipt', () => {
    const response = [
      'The workspace is empty.',
      '',
      '**What the tool established:**',
      '- A single successful search of the workspace returned no files whatsoever.',
      '- Therefore, there is nothing to inspect, no codebase to modify, and no evidence of prior artifacts in this workspace.',
      '',
      'One next engineering step:',
      '- [ ] Verify the workspace path.',
    ].join('\n');
    const result = scoreResponse('coder', response, {
      toolsUsed: ['search_files'],
      sseEvents: [
        { event: 'tool', data: { name: 'search_files', input: { pattern: '**/*' } } },
        { event: 'tool_result', data: { name: 'search_files', result: 'No files found.', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['search_files'] } },
      ],
    });
    const missingReceipt = scoreResponse('coder', response, { toolsUsed: [] });
    const contradicted = scoreResponse(
      'coder',
      `${response}\nCorrection: this is false; the workspace is not empty.`,
      {
        toolsUsed: ['search_files'],
        sseEvents: [
          { event: 'tool', data: { name: 'search_files', input: { pattern: '**/*' } } },
          { event: 'tool_result', data: { name: 'search_files', result: 'No files found.', isError: false } },
        ],
      },
    );
    const retracted = scoreResponse(
      'coder',
      `${response}\nCorrection: the earlier empty-workspace statement was false.`,
      {
        toolsUsed: ['search_files'],
        sseEvents: [
          { event: 'tool', data: { name: 'search_files', input: { pattern: '**/*' } } },
          { event: 'tool_result', data: { name: 'search_files', result: 'No files found.', isError: false } },
        ],
      },
    );
    const equivalentContradictions = [
      'Correction: there are files.',
      'Correction: files were found.',
      'Actually, there are files.',
      'Correction: README.md exists.',
      'Correction: that statement was false.',
      'Correction: that conclusion was wrong.',
      'Correction: that finding was incorrect.',
      'Correction: I retract that conclusion.',
      'I retract that conclusion.',
      'Correction: disregard the previous conclusion.',
      'Update: that takeaway was incorrect.',
      'I take that back.',
      'That conclusion was wrong.',
    ].map(tail => scoreResponse(
      'coder',
      `${response}\n${tail}`,
      {
        toolsUsed: ['search_files'],
        sseEvents: [
          { event: 'tool', data: { name: 'search_files', input: { pattern: '**/*' } } },
          { event: 'tool_result', data: { name: 'search_files', result: 'No files found.', isError: false } },
        ],
      },
    ));

    expect(result.checks.find(check => check.id === 'empty-result')?.passed).toBe(true);
    expect(missingReceipt.checks.find(check => check.id === 'empty-result')?.passed).toBe(false);
    expect(contradicted.checks.find(check => check.id === 'empty-result')?.passed).toBe(false);
    expect(retracted.checks.find(check => check.id === 'empty-result')?.passed).toBe(false);
    for (const contradiction of equivalentContradictions) {
      expect(contradiction.checks.find(check => check.id === 'empty-result')?.passed).toBe(false);
    }
    for (const reaffirmation of [
      'Actually, no files were found.',
      'Correction: no files were found.',
    ]) {
      const reaffirmed = scoreResponse('coder', `${response}\n${reaffirmation}`, {
        toolsUsed: ['search_files'],
        sseEvents: [
          { event: 'tool', data: { name: 'search_files', input: { pattern: '**/*' } } },
          { event: 'tool_result', data: { name: 'search_files', result: 'No files found.', isError: false } },
        ],
      });
      expect(
        reaffirmed.checks.find(check => check.id === 'empty-result')?.passed,
        reaffirmation,
      ).toBe(true);
    }
  });

  it('accepts the three exact Qwen prioritization forms from the f399ee2d gate', () => {
    const responses = [
      [
        '## Order & Plan',
        '| Priority | Position | Why |',
        '|---|---|---|',
        '| Production memory bug | **1st** | Unfixed resource leaks degrade existing customers, risk an incident, and have the highest blast radius. |',
        '| Close one customer | **2nd** | Revenue is time-sensitive and can be pursued once system stability is understood. |',
        '| Repair onboarding friction | **3rd** | Highest leverage long-term, but least urgent in a single week. |',
        '## First action for today',
        'Reproduce the memory bug under controlled load.',
      ].join('\n'),
      [
        '## Recommended order',
        '1. Investigate the production memory bug',
        '2. Close the customer deal',
        '3. Repair onboarding friction',
        '## Why',
        '- Production defect first: it can cause data loss, outages, or customer harm.',
        '- Deal second: sales timing matters and the customer conversation is stronger once the bug is understood.',
        '- Onboarding friction third: it is a systemic fix requiring diagnosis, product/design coordination, and validation.',
        '## First action today',
        'Run a bounded memory-bug diagnostic.',
      ].join('\n'),
      [
        '**Plan: Memory bug → customer close → onboarding repair**',
        '1. **Memory bug first** — A production leak is a compounding liability and the highest outage risk.',
        '2. **Customer close second** — Revenue is time-sensitive and the deal is bounded.',
        '3. **Onboarding repair last** — This is a process problem, not a production incident, and better inputs will make the work cheaper.',
        '**First action today:** Reproduce the memory bug.',
      ].join('\n'),
    ];

    for (const response of responses) {
      const result = scoreResponse('general-purpose', response);
      expect(result.checks.find(check => check.id === 'ordered-plan')?.passed, response).toBe(true);
      expect(result.checks.find(check => check.id === 'justification')?.passed, response).toBe(true);
    }
  });

  it('accepts established-facts and my-inference headings from the exact Qwen research answer', () => {
    const response = [
      '## Decision Table',
      '| Criterion | SQLite + sqlite-vec | PostgreSQL + pgvector |',
      '|---|---|---|',
      '| Architecture | In-process | Client/server |',
      '**Established facts (from primary sources):** sqlite-vec runs anywhere SQLite runs.',
      '**My inference (not sourced):** SQLite likely gives a simpler desktop install.',
      '## Recommendation',
      'Choose SQLite + sqlite-vec for a single-user desktop store.',
    ].join('\n');
    const result = scoreResponse('researcher', response);
    expect(result.checks.find(check => check.id === 'fact-inference')?.passed).toBe(true);
  });

  it('accepts all exact positive Qwen writer wording while retaining the closed-world facts', () => {
    const responses = [
      'We intended to ship on Friday. API tests are passing. Browser tests have two failures on Windows. The smart router has not been exercised without cloud credentials. Recommendation: We must delay the release until the Windows failures are resolved and the smart router is tested without cloud credentials.',
      'API tests are all passing. Two browser-test failures persist on Windows. The smart router is not yet exercised without cloud credentials. Recommendation: Postpone the scheduled Friday shipment until the Windows failures and untested smart-router scenario are resolved.',
      'Originally scheduled for Friday, the release requires a delay. API tests have passed successfully, browser tests exhibit two failures on Windows, and the smart router has not been exercised without cloud credentials. Recommendation: Defer the release until these gaps are closed.',
    ];
    for (const response of responses) {
      const result = scoreResponse('writer', response);
      for (const id of ['release-facts', 'router-fact', 'recommendation']) {
        expect(result.checks.find(check => check.id === id)?.passed, `${id}: ${response}`).toBe(true);
      }
    }
  });

  it('accepts the exact Qwen clock-range agenda without a redundant duration column', () => {
    const response = [
      '**30-Minute Launch-Readiness Meeting Agenda**',
      '| Time | Block | Participants |',
      '|---|---|---|',
      '| 0:00–0:05 | Kickoff and go/no-go criteria review | All |',
      '| 0:05–0:11 | Product: feature scope | Product |',
      '| 0:11–0:18 | Engineering readiness | Engineering, QA |',
      '| 0:18–0:24 | QA results | QA, Engineering |',
      '| 0:24–0:27 | Support readiness | Support, Product |',
      '| 0:27–0:30 | Final go/no-go decision | All |',
      '**Desired decisions**',
      '- Confirm go/no-go for launch.',
      '**Pre-read checklist**',
      '- [ ] Product, Engineering, QA, and Support readiness summaries.',
    ].join('\n');
    const result = scoreResponse('executive-assistant', response);
    expect(result.checks.find(check => check.id === 'duration-blocks')?.passed).toBe(true);
  });

  it('accepts exact Qwen runway decimals, action headings, and professional disclaimers', () => {
    const responses = [
      [
        '| Metric | Value |', '|---|---|', '| Cash on Hand | $40,000.00 |',
        '| Net Monthly Burn | $10,000.00 |', '| **Runway** | **4.00 months** |',
        'Formula: Runway = Cash on Hand ÷ Net Monthly Burn.',
        'Biggest assumption: monthly burn remains constant and revenue stays at zero.',
        '**Actions to Improve Runway**',
        '- **Reduce costs:** Cut discretionary subscriptions to lower monthly burn.',
        '- **Generate cash inflow:** Pre-sell an offering or accelerate collections.',
        'This is informational analysis, not professional financial advice.',
      ].join('\n'),
      [
        '### Runway Calculation', '$40,000 / $10,000 = **4.0 months**',
        'Formula: Runway = Cash / Net Monthly Burn.',
        'Key assumption: burn remains constant and revenue remains at zero.',
        '### Actions to Improve Runway',
        '| Action | Mechanism |', '|---|---|',
        '| Reduce Monthly Burn | Lower fixed costs. |',
        '| Generate Revenue | Accelerate collections to increase cash. |',
        'This analysis is informational and does not constitute professional financial advice.',
      ].join('\n'),
      [
        '| Metric | Value |', '|---|---|', '| Cash | $40,000.00 |',
        '| Monthly Burn | $10,000.00 |', '| Revenue | $0.00 |', '| **Runway** | **4.00 months** |',
        'Formula: Runway = Cash ÷ Net Monthly Burn.',
        'Biggest assumption: monthly burn remains constant.',
        '## Two Actions to Improve Runway',
        '- **Reduce Costs:** Eliminate non-essential expenses to lower monthly burn.',
        '- **Increase Cash Inflow:** Accelerate customer payments or pre-sell services.',
        'This is AI-generated informational content and not professional financial advice.',
      ].join('\n'),
    ];
    for (const response of responses) {
      const result = scoreResponse('finance-owner', response);
      expect(result.checks.find(check => check.id === 'runway')?.passed, response).toBe(true);
      expect(result.checks.find(check => check.id === 'two-actions')?.passed, response).toBe(true);
    }
  });

  it('accepts the exact September Qwen plan with modal details and compounding risk', () => {
    const exactLines = [
      '1. **Memory bug first (Day 1, time-boxed).** A production leak is compounding: it can destabilize other features, drain engineering capacity with surprise incidents, and a crash during the customer evaluation window could kill the deal outright.',
      '2. **Customer close second (Days 2–4).** Revenue-generating and time-sensitive, but deliberately ranked below the bug so the close happens on stable infrastructure.',
      '3. **Onboarding friction last (Day 5, diagnostic).** Important but lowest urgency: the customer onboarding session reveals exactly where the friction lives. Fixing friction against one real funnel is engineering.',
    ];
    const baselineLines = [
      '1. **Memory bug first** — A production leak is a compounding liability and the highest outage risk.',
      '2. **Customer close second** — Revenue is time-sensitive and the deal is bounded.',
      '3. **Onboarding repair last** — This is a process problem, and better inputs will make the work cheaper.',
    ];

    for (const [label, lines] of [
      ['memory detail', [exactLines[0], baselineLines[1], baselineLines[2]]],
      ['customer detail', [baselineLines[0], exactLines[1], baselineLines[2]]],
      ['onboarding detail', [baselineLines[0], baselineLines[1], exactLines[2]]],
      ['complete answer', exactLines],
    ] as const) {
      const response = [
        '**Order: memory bug → customer close → onboarding repair.**',
        '**Why this order**',
        ...lines,
        "**Today's first action**",
        'Capture a heap snapshot from the affected production service.',
      ].join('\n');
      const result = scoreResponse('general-purpose', response);
      expect(result.checks.find(check => check.id === 'justification')?.passed, label).toBe(true);
    }
  });

  it('accepts qualified decision headings and decision-labelled agenda table cells', () => {
    const sectionResponse = [
      '**Launch-Readiness Meeting — 30-Minute Agenda**',
      'Participants: Product, Engineering, QA, Support',
      '| Time | Block | Lead | Focus |',
      '|---|---|---|---|',
      '| 0:00–0:30 | Readiness | Product | Record go/no-go call |',
      '**Desired decisions (must be resolved by end):**',
      '- [ ] Go / no-go call for the launch',
      '**Pre-read checklist:**',
      '- [ ] Release evidence',
    ].join('\n');
    const tableResponse = [
      '| Time | Block | Lead | Purpose & Desired Decision |',
      '|---|---|---|---|',
      '| 0–5 min | Opening | Product | **Decision:** Shared launch definition is agreed. |',
      '| 5–30 min | Readiness | Engineering, QA, Support | **Decision:** Confirm final go/no-go. |',
      '## Pre-read Checklist',
      '- [ ] Release evidence',
    ].join('\n');

    for (const response of [sectionResponse, tableResponse]) {
      const result = scoreResponse('executive-assistant', response);
      expect(result.checks.find(check => check.id === 'decisions')?.passed, response).toBe(true);
    }
  });

  it('accepts checklist runway actions, secured cash inflow, and scenario projections', () => {
    const responses = [
      [
        '| Metric | Value |', '|---|---|', '| Cash on hand | $40,000.00 |',
        '| Monthly burn (net) | $10,000.00 |', '| Revenue | $0.00 |', '| **Runway** | **4.00 months** |',
        '**Formula:** Runway = Cash ÷ Net monthly burn.',
        '**Biggest assumption:** Burn is constant and revenue remains zero.',
        '## Actions to Extend Runway',
        '- [ ] **Reduce monthly burn:** Cut controllable operating expenses. Each $1,000/month removed adds ~0.4 months of runway.',
        '- [ ] **Generate cash inflow:** Introduce revenue through pre-sales.',
      ].join('\n'),
      [
        'Runway: 4 months',
        'Formula: Runway = Cash / Net Monthly Burn.',
        'Biggest assumption: burn remains constant and revenue remains zero.',
        'Actions that improve runway:',
        '- Reduce monthly burn by cutting non-essential operating expenses.',
        '- Secure short-term cash inflows through early invoice collection or advance sales.',
      ].join('\n'),
    ];

    for (const response of responses) {
      const result = scoreResponse('finance-owner', response);
      expect(result.checks.find(check => check.id === 'runway')?.passed, response).toBe(true);
      expect(result.checks.find(check => check.id === 'two-actions')?.passed, response).toBe(true);
    }
  });

  it('accepts the latest Qwen prioritization rationale for a deliberately deferred sale', () => {
    const response = [
      '## Order',
      '1. **Production memory bug**',
      '2. **Onboarding friction**',
      '3. **Close one customer**',
      '## Why this order',
      '**The bug goes first** because it is the only priority with compounding downside and can degrade toward a crash.',
      '**Onboarding friction is second** because if the leak touches the onboarding path, fixing it removes friction and stabilizes production in one motion.',
      '**The sale closes third** because procurement, legal, and sign-off usually give it the longest real timeline, so a day of slack rarely kills it.',
      '## First action today',
      'Reproduce the memory bug under a profiler.',
    ].join('\n');

    const result = scoreResponse('general-purpose', response);
    expect(result.checks.find(check => check.id === 'justification')?.passed).toBe(true);

    const deniedSaleBasis = scoreResponse(
      'general-purpose',
      response.replace(
        'because procurement, legal, and sign-off usually give it the longest real timeline, so a day of slack rarely kills it.',
        'but there is no rationale or decision basis for placing it third.',
      ),
    );
    expect(deniedSaleBasis.checks.find(check => check.id === 'justification')?.passed).toBe(false);

    const speculativeOnboardingBasis = scoreResponse(
      'general-purpose',
      response.replace(
        'fixing it removes friction and stabilizes production in one motion.',
        'the result might possibly improve onboarding.',
      ),
    );
    expect(speculativeOnboardingBasis.checks.find(check => check.id === 'justification')?.passed).toBe(false);

    const contradictedOnboardingPremise = scoreResponse(
      'general-purpose',
      response.replace(
        'fixing it removes friction and stabilizes production in one motion.',
        'fixing it removes friction and stabilizes production, but the leak does not touch onboarding.',
      ),
    );
    expect(contradictedOnboardingPremise.checks.find(check => check.id === 'justification')?.passed).toBe(false);

    const falseOnboardingPremise = scoreResponse(
      'general-purpose',
      response.replace(
        'fixing it removes friction and stabilizes production in one motion.',
        'fixing it removes friction and stabilizes production in one motion, but this premise is false.',
      ),
    );
    expect(falseOnboardingPremise.checks.find(check => check.id === 'justification')?.passed).toBe(false);
  });

  it('accepts the exact Qwen rationale when the second priority follows a completed first priority', () => {
    const response = [
      '1. Investigate the production memory bug',
      '2. Close the customer',
      '3. Repair onboarding friction',
      'Prioritizing the production bug first minimizes operational risk and prevents the issue from affecting existing customers or consuming engineering bandwidth unexpectedly.',
      'Once stability is confirmed, closing the customer takes precedence over onboarding because it directly impacts immediate revenue and validates the current product state.',
      'Onboarding friction is important for retention but is typically a process improvement that can be addressed after immediate revenue and stability risks are mitigated.',
      'First Action for Today: Reproduce the production memory bug in a controlled environment.',
    ].join('\n');

    const result = scoreResponse('general-purpose', response);
    expect(result.checks.find(check => check.id === 'justification')?.passed).toBe(true);

    const speculativeSequence = scoreResponse(
      'general-purpose',
      response.replace('Once stability is confirmed,', 'If stability might be confirmed,'),
    );
    expect(speculativeSequence.checks.find(check => check.id === 'justification')?.passed).toBe(false);
  });

  it('accepts the latest Qwen writer phrasing for two persistent Windows failures', () => {
    const response = [
      'We had planned to ship on Friday. API tests currently pass.',
      'However, browser tests remain in a state of failure, with two specific issues persisting on Windows.',
      'The smart router has not been exercised without cloud credentials.',
      'Recommendation: Delay the release until these technical gaps are fully closed.',
    ].join('\n');

    const result = scoreResponse('writer', response);
    expect(result.checks.find(check => check.id === 'release-facts')?.passed).toBe(true);

    for (const update of [
      'Update: both Windows browser-test failures have now been resolved.',
      'Update: both Windows browser-test failures have now been eliminated.',
      'Update: both Windows browser-test failures are gone.',
      'Update: Windows browser testing is now clean.',
      'Update: neither Windows browser-test failure remains.',
      'Update: We waited until the Windows browser-test failures were resolved.',
      'Update: Release was delayed until browser testing was clean.',
    ]) {
      const retracted = scoreResponse('writer', `${response}\n${update}`);
      expect(retracted.checks.find(check => check.id === 'release-facts')?.passed, update).toBe(false);
    }
  });

  it('classifies the exact Qwen writer phrasing without hiding its unsupported assurance', () => {
    const response = [
      'We originally planned to ship this Friday. Current status indicates API tests are passing.',
      'However, browser tests are currently failing two cases on Windows.',
      'Additionally, the smart router has not been exercised without cloud credentials.',
      'Given these unresolved technical gaps, the recommendation is to delay the release until all issues are closed.',
      'This ensures stability and prevents potential failures in unsupported environments.',
    ].join('\n');

    const result = scoreResponse('writer', response);
    expect(result.checks.find(check => check.id === 'release-facts')?.passed).toBe(true);
    expect(result.checks.find(check => check.id === 'no-new-claims')?.passed).toBe(false);
  });

  it('keeps the current four-month runway separate from projected action scenarios', () => {
    const response = [
      'Runway = Cash / Net Monthly Burn',
      'Runway = 40,000 / (10,000 - 0) = 4.00 months',
      'Biggest assumption: Monthly burn remains constant at $10,000 and revenue stays at $0.00.',
      'Actions to improve runway:',
      '| Action | Expected Result |',
      '|---|---|',
      '| Cut discretionary spending by $2,000/mo | Burn drops to $8,000 and runway extends to 5.00 months |',
      '| Generate $3,000/mo in early revenue | Net burn drops to $7,000 and runway extends to 5.71 months |',
    ].join('\n');

    const result = scoreResponse('finance-owner', response);
    expect(result.checks.find(check => check.id === 'runway')?.passed).toBe(true);
    expect(result.checks.find(check => check.id === 'two-actions')?.passed).toBe(true);

    const wrongInputs = scoreResponse(
      'finance-owner',
      response.replace('(10,000 - 0) = 4.00', '(10,000 - 2,000) = 5.00'),
    );
    expect(wrongInputs.checks.find(check => check.id === 'runway')?.passed).toBe(false);

    const deniedEquation = scoreResponse(
      'finance-owner',
      `${response}\nCorrection: the 40,000 / (10,000 - 0) = 4.00 calculation is not the current runway.`,
    );
    expect(deniedEquation.checks.find(check => check.id === 'runway')?.passed).toBe(false);
  });

  it('accepts the latest Qwen empty-workspace wording with an exhaustive receipt', () => {
    const response = [
      'The workspace inspection succeeded: an exhaustive search of the workspace (`**/*`) returned no files.',
      'The workspace at the specified root is empty.',
      'Recommended next engineering step: determine where the actual code lives.',
    ].join('\n');
    const result = scoreResponse('coder', response, {
      toolsUsed: ['search_files'],
      sseEvents: [
        { event: 'tool', data: { name: 'search_files', input: { pattern: '**/*' } } },
        { event: 'tool_result', data: { name: 'search_files', result: 'No files found.', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['search_files'] } },
      ],
    });

    expect(result.checks.find(check => check.id === 'empty-result')?.passed).toBe(true);

    const missingReceipt = scoreResponse('coder', response, { toolsUsed: [], sseEvents: [] });
    expect(missingReceipt.checks.find(check => check.id === 'empty-result')?.passed).toBe(false);
  });

  it('accepts descriptive Qwen lane headings with canonical roles in parentheses', () => {
    const response = [
      '### Lane 1: Production-Readiness Auditor (Researcher)',
      'Objective, inputs, deliverables, dependencies, and merge criteria.',
      '### Lane 2: Production Readiness Remediator (Coder)',
      'Objective, inputs, deliverables, dependencies, and merge criteria.',
      'The coordinator must verify evidence before accepting either result.',
    ].join('\n');

    const result = scoreResponse('coordinator', response);
    expect(result.checks.find(check => check.id === 'two-lanes')?.passed).toBe(true);

    const denied = scoreResponse(
      'coordinator',
      response.replace('(Researcher)', '(Not a Researcher)'),
    );
    expect(denied.checks.find(check => check.id === 'two-lanes')?.passed).toBe(false);
  });
});

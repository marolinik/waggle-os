import { describe, expect, it } from 'vitest';
import {
  ACCEPTANCE_PERSONA_IDS,
  PERSONA_CASES,
  parsePersonaRepeats,
  resolvePersonaRunMode,
  type PersonaAcceptanceCase,
} from './persona-cases';
import {
  extractPythonBlock,
  scorePersonaTrial,
  validatePythonSyntax,
  type PersonaTrialEvidence,
} from './persona-scorer';

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
      '## Facts',
      '| Criterion | SQLite vector search | PostgreSQL + pgvector |',
      '|---|---|---|',
      '| Deployment | Embedded | Client/server |',
      'Primary sources: https://www.sqlite.org/vec1.html and https://github.com/pgvector/pgvector',
      '## Inference',
      'For the stated single-user desktop use case, the embedded option removes a service boundary.',
      '## Recommendation',
      'Use SQLite vector search for this stated use case, subject to measuring the real corpus.',
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
        { event: 'tool', data: { name: 'web_search', input: { query: 'SQLite pgvector primary docs' } } },
        { event: 'tool_result', data: { name: 'web_search', result: 'two primary sources', isError: false } },
        { event: 'done', data: { content: response, toolsUsed: ['web_search'] } },
      ],
    }));

    expect(result).toMatchObject({ score: 100, passed: true });
  });

  it('does not accept lookalike hostnames as primary-source evidence', () => {
    const researcher = PERSONA_CASES.find(persona => persona.id === 'researcher')!;
    const response = [
      '## Facts',
      '| Criterion | SQLite vector search | PostgreSQL + pgvector |',
      '|---|---|---|',
      '| Deployment | Embedded | Client/server |',
      'Sources: https://sqlite.org.evil.example/vec1 and https://postgresql.org.evil.example/vector',
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

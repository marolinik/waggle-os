import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPersonaAcceptanceSeal,
  type PersonaAcceptanceSealManifest,
  type ReceiptScore,
} from './persona-acceptance-seal';
import { PERSONA_CASES } from './persona-cases';

const passingScore: ReceiptScore = {
  score: 100,
  capturedScore: 100,
  scoreMode: 'captured',
  passed: true,
  criticalFailures: [],
};

function artifact(personaId: string, repeat: number, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 8,
    runId: 'paid-run-1',
    source: {
      gitRevision: 'da25b5097e8f735608d2ad1204ce89048008cec3',
      relevantWorkingTreeClean: true,
    },
    persona: { id: personaId, repeat, repeatCount: 1, gating: true },
    request: { exactPrompt: 'Prompt', personaId, sessionId: `session-${repeat}`, payload: { workspaceId: `workspace-${repeat}` } },
    response: {
      exact: 'Answer',
      tokenStreamExact: 'Answer',
      renderedAssistantExact: 'Answer',
      visibleAssistantTextExact: 'Answer',
      expectedCodeSegmentsExact: [] as string[],
      visibleCodeSegmentsExact: [] as string[],
      persistedExact: 'Answer',
      persistedPromptExact: 'Prompt',
      persistedSessionId: `session-${repeat}`,
      persistedMessageCount: 2,
      doneEventCount: 1,
      httpStatus: 200,
      durationMs: 10,
      model: 'openrouter/anthropic/claude-sonnet-5',
      billingClass: 'priced',
      estimatedCostUsd: 0.010001,
      tokens: { input: 10, output: 10 },
      toolsUsed: [],
      sseEvents: [{
        event: 'done',
        data: {
          content: 'Answer',
          model: 'openrouter/anthropic/claude-sonnet-5',
          billingClass: 'priced',
          cost: 0.010001,
        },
      }],
      parseErrors: [],
      transportError: null,
    },
    runtime: {
      healthStatus: 200,
      llmHealthy: true,
      expectedProvider: 'anthropic-proxy',
      expectedDetail: 'credential verified',
      expectedBillingClass: 'priced',
      health: { llm: { provider: 'anthropic-proxy', health: 'healthy', detail: 'OpenRouter credential verified' } },
    },
    workspace: { workspaceId: `workspace-${repeat}`, personaPersisted: true },
    journey: { memoryJourneyOk: true, memoryText: 'Memory', leakedSnippets: [] },
    codeValidation: {},
    score: { score: 100, passed: true, criticalFailures: [] },
    browser: {
      criticalConsoleErrors: [],
      pageErrors: [],
      criticalNetworkFailures: [],
      screenshotErrors: [],
    },
    ...overrides,
  };
}

function writeArtifact(value: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'waggle-persona-seal-'));
  const path = join(dir, 'receipt.json');
  writeFileSync(path, JSON.stringify(value));
  return path;
}

function manifest(artifactPath: string): PersonaAcceptanceSealManifest {
  return {
    schemaVersion: 1,
    benchmarkId: 'paid-30-final',
    runId: 'paid-run-1',
    sourceRevision: 'da25b5097e8f735608d2ad1204ce89048008cec3',
    threshold: 95,
    repeats: 1,
    expectedProvider: 'anthropic-proxy',
    expectedDetail: 'credential verified',
    expectedBillingClass: 'priced',
    allowedModels: ['openrouter/anthropic/claude-sonnet-5'],
    receipts: [{ artifactPath }],
    diagnosticCostLedger: [
      { id: 'diagnostic', amountUsd: '0.000009', evidence: 'provider usage export diagnostic-1' },
    ],
  };
}

function freeReceipt() {
  const model = 'openai-compatible/qwen3.8-flash-next';
  const value = artifact('general-purpose', 1);
  value.response.model = model;
  value.response.billingClass = 'free';
  value.response.estimatedCostUsd = 0;
  value.response.sseEvents[0].data.model = model;
  value.response.sseEvents[0].data.billingClass = 'free';
  value.response.sseEvents[0].data.cost = 0;
  value.runtime.expectedDetail = 'openai-compatible endpoint verified';
  value.runtime.expectedBillingClass = 'free';
  value.runtime.health.llm.detail = 'Built-in provider proxy; openai-compatible endpoint verified';
  const receiptManifest = manifest('');
  receiptManifest.expectedBillingClass = 'free';
  receiptManifest.expectedDetail = 'openai-compatible endpoint verified';
  receiptManifest.allowedModels = [model];
  return { model, value, receiptManifest };
}

const options = {
  expectedPersonaIds: ['general-purpose'] as const,
  repeats: 1,
  scoreArtifact: () => passingScore,
  runtimeProvenance: {
    gitRevision: 'da25b5097e8f735608d2ad1204ce89048008cec3',
    relevantWorkingTreeClean: true,
  },
};

describe('persona acceptance seal', () => {
  it('seals an explicitly free keyless-compatible receipt with exact zero cost', () => {
    const { model, value, receiptManifest } = freeReceipt();
    receiptManifest.receipts = [{ artifactPath: writeArtifact(value) }];

    const seal = buildPersonaAcceptanceSeal(receiptManifest, options);

    expect(seal.status).toBe('ready');
    expect(seal.acceptedEstimatedCostUsd).toBe('0.000000');
    expect(seal.receipts[0]).toMatchObject({
      model,
      billingClass: 'free',
      estimatedCostUsd: '0.000000',
    });
  });

  it.each([
    ['stale schema version', (value: ReturnType<typeof artifact>) => {
      value.schemaVersion = 7;
    }],
    ['missing response billing class', (value: ReturnType<typeof artifact>) => {
      delete (value.response as Record<string, unknown>).billingClass;
    }],
    ['unknown response billing class', (value: ReturnType<typeof artifact>) => {
      (value.response as Record<string, unknown>).billingClass = 'unknown';
    }],
    ['mismatched done billing class', (value: ReturnType<typeof artifact>) => {
      value.response.sseEvents[0].data.billingClass = 'free';
    }],
    ['missing done billing class', (value: ReturnType<typeof artifact>) => {
      delete (value.response.sseEvents[0].data as Record<string, unknown>).billingClass;
    }],
    ['unknown done billing class', (value: ReturnType<typeof artifact>) => {
      (value.response.sseEvents[0].data as Record<string, unknown>).billingClass = 'unknown';
    }],
    ['missing runtime billing expectation', (value: ReturnType<typeof artifact>) => {
      delete (value.runtime as Record<string, unknown>).expectedBillingClass;
    }],
    ['missing done event', (value: ReturnType<typeof artifact>) => {
      value.response.sseEvents = [];
    }],
    ['duplicate done event', (value: ReturnType<typeof artifact>) => {
      value.response.sseEvents.push({
        event: 'done',
        data: { ...value.response.sseEvents[0].data },
      });
    }],
    ['zero priced cost', (value: ReturnType<typeof artifact>) => {
      value.response.estimatedCostUsd = 0;
      value.response.sseEvents[0].data.cost = 0;
    }],
    ['missing priced cost', (value: ReturnType<typeof artifact>) => {
      delete (value.response as Record<string, unknown>).estimatedCostUsd;
      delete (value.response.sseEvents[0].data as Record<string, unknown>).cost;
    }],
    ['negative priced cost', (value: ReturnType<typeof artifact>) => {
      value.response.estimatedCostUsd = -0.01;
      value.response.sseEvents[0].data.cost = -0.01;
    }],
  ])('rejects %s', (_label, mutate) => {
    const value = artifact('general-purpose', 1);
    mutate(value);
    const seal = buildPersonaAcceptanceSeal(manifest(writeArtifact(value)), options);

    expect(seal.status).toBe('failed');
    expect(seal.receipts).toEqual([]);
  });

  it.each([0.01, 0.0000000001])('rejects a non-zero cost declared as free (%s)', (cost) => {
    const { value, receiptManifest } = freeReceipt();
    value.response.estimatedCostUsd = cost;
    value.response.sseEvents[0].data.cost = cost;
    receiptManifest.receipts = [{ artifactPath: writeArtifact(value) }];

    const seal = buildPersonaAcceptanceSeal(receiptManifest, options);

    expect(seal.status).toBe('failed');
    expect(seal.receipts).toEqual([]);
  });

  it('rejects a runtime billing expectation that disagrees with the manifest', () => {
    const { value, receiptManifest } = freeReceipt();
    value.runtime.expectedBillingClass = 'priced';
    receiptManifest.receipts = [{ artifactPath: writeArtifact(value) }];

    const seal = buildPersonaAcceptanceSeal(receiptManifest, options);

    expect(seal.status).toBe('failed');
    expect(seal.receipts).toEqual([]);
  });

  it('maps persisted schema-8 Python validation into a Data Engineer rescore', () => {
    const persona = PERSONA_CASES.find(item => item.id === 'data-engineer')!;
    const python = [
      'import json',
      'import sqlite3',
      '',
      'with sqlite3.connect("events.db") as connection:',
      '    connection.execute("BEGIN")',
      '    connection.execute("INSERT OR IGNORE INTO events VALUES (?, ?)", ("event-1", json.dumps({})))',
    ].join('\n');
    const response = [
      'CREATE TABLE events (dedup_key TEXT PRIMARY KEY);',
      'The deduplication key is stable for every source event.',
      'Use a BEGIN transaction for each batch and commit its checkpoint atomically.',
      'Retry lock failures with exponential backoff and busy_timeout.',
      '```python',
      python,
      '```',
    ].join('\n');
    const value = artifact('data-engineer', 1);
    value.request.exactPrompt = persona.prompt;
    value.response.exact = response;
    value.response.tokenStreamExact = response;
    value.response.renderedAssistantExact = response;
    value.response.visibleAssistantTextExact = response;
    value.response.expectedCodeSegmentsExact = [python];
    value.response.visibleCodeSegmentsExact = [python];
    value.response.persistedExact = response;
    value.response.persistedPromptExact = persona.prompt;
    value.response.sseEvents[0].data.content = response;
    value.codeValidation = {
      available: true,
      syntaxValid: true,
      importsPresent: true,
    };
    const artifactPath = writeArtifact(value);

    const seal = buildPersonaAcceptanceSeal(manifest(artifactPath), {
      expectedPersonaIds: ['data-engineer'],
      repeats: 1,
      runtimeProvenance: options.runtimeProvenance,
    });

    expect(seal.status).toBe('ready');
    expect(seal.invalidReceipts).toEqual([]);
    expect(seal.receipts[0]).toMatchObject({ score: 100, capturedScore: 100 });
  });

  it.each([
    ['unavailable validation', { available: false, syntaxValid: true, importsPresent: true }, '```python\nimport sqlite3\n```'],
    ['failed syntax validation', { available: true, syntaxValid: false, importsPresent: true }, '```python\nimport sqlite3\n```'],
    ['missing import validation', { available: true, syntaxValid: true, importsPresent: false }, '```python\nimport sqlite3\n```'],
    ['missing validation fields', { available: true }, '```python\nimport sqlite3\n```'],
    ['no Python evidence', { available: true, syntaxValid: true, importsPresent: true }, 'No Python block is present.'],
    ['invalid Python evidence', { available: true, syntaxValid: true, importsPresent: true }, '```python\nimport sqlite3\nif True print("broken")\n```'],
    ['Python evidence without imports', { available: true, syntaxValid: true, importsPresent: true }, '```python\nprint("valid but unimported")\n```'],
  ])('fails closed on %s', (_label, codeValidation, codeEvidence) => {
    const persona = PERSONA_CASES.find(item => item.id === 'data-engineer')!;
    const response = [
      'CREATE TABLE events (dedup_key TEXT PRIMARY KEY);',
      'The deduplication key is stable for every source event.',
      'Use a BEGIN transaction for each batch and commit its checkpoint atomically.',
      'Retry lock failures with exponential backoff and busy_timeout.',
      codeEvidence,
    ].join('\n');
    const codeSegment = codeEvidence.match(/```python\n([\s\S]*?)\n```/)?.[1];
    const value = artifact('data-engineer', 1);
    value.request.exactPrompt = persona.prompt;
    value.response.exact = response;
    value.response.tokenStreamExact = response;
    value.response.renderedAssistantExact = response;
    value.response.visibleAssistantTextExact = response;
    value.response.expectedCodeSegmentsExact = codeSegment ? [codeSegment] : [];
    value.response.visibleCodeSegmentsExact = codeSegment ? [codeSegment] : [];
    value.response.persistedExact = response;
    value.response.persistedPromptExact = persona.prompt;
    value.response.sseEvents[0].data.content = response;
    value.codeValidation = codeValidation;

    const seal = buildPersonaAcceptanceSeal(manifest(writeArtifact(value)), {
      expectedPersonaIds: ['data-engineer'],
      repeats: 1,
      runtimeProvenance: options.runtimeProvenance,
    });

    expect(seal.status).toBe('failed');
    expect(seal.receipts).toEqual([]);
  });

  it('seals exact slot coverage with immutable hashes and decimal cost accounting', () => {
    const artifactPath = writeArtifact(artifact('general-purpose', 1));
    const seal = buildPersonaAcceptanceSeal(manifest(artifactPath), options);

    expect(seal.status).toBe('ready');
    expect(seal.expectedReceiptCount).toBe(1);
    expect(seal.completedReceiptCount).toBe(1);
    expect(seal.acceptedEstimatedCostUsd).toBe('0.010001');
    expect(seal.diagnosticRecordedCostUsd).toBe('0.000009');
    expect(seal.totalRecordedSpendUsd).toBe('0.010010');
    expect(seal.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(seal.diagnosticCostLedger).toEqual([
      { id: 'diagnostic', amountUsd: '0.000009', evidence: 'provider usage export diagnostic-1' },
    ]);
    expect(seal.receipts[0]).toMatchObject({
      slot: 'general-purpose#1',
      score: 100,
      scoreMode: 'captured',
      sourceRevision: 'da25b5097e8f735608d2ad1204ce89048008cec3',
      estimatedCostUsd: '0.010001',
    });
    expect(seal.receipts[0]?.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(seal.receipts[0]?.responseSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fails closed on a duplicate persona and repeat slot', () => {
    const first = writeArtifact(artifact('general-purpose', 1));
    const second = writeArtifact(artifact('general-purpose', 1));
    const value = manifest(first);
    value.receipts.push({ artifactPath: second });

    const seal = buildPersonaAcceptanceSeal(value, options);

    expect(seal.status).toBe('failed');
    expect(seal.duplicateSlots).toEqual(['general-purpose#1']);
  });

  it('reports incomplete without treating missing receipts as a passing report', () => {
    const value = manifest(writeArtifact(artifact('general-purpose', 1)));
    value.receipts = [];

    const seal = buildPersonaAcceptanceSeal(value, options);

    expect(seal.status).toBe('incomplete');
    expect(seal.missingSlots).toEqual(['general-purpose#1']);
    expect(seal.completedReceiptCount).toBe(0);
  });

  it('rejects a receipt whose live-provider health evidence is not healthy', () => {
    const unhealthy = artifact('general-purpose', 1, {
      runtime: { healthStatus: 200, llmHealthy: false, health: { llm: { health: 'unhealthy' } } },
    });
    const seal = buildPersonaAcceptanceSeal(manifest(writeArtifact(unhealthy)), options);

    expect(seal.status).toBe('failed');
    expect(seal.invalidReceipts[0]?.reasons).toContain('runtime LLM was not healthy');
  });

  it('records a current-scorer rescore instead of silently mutating the captured score', () => {
    const artifactPath = writeArtifact(artifact('general-purpose', 1, {
      score: { score: 80, passed: false, criticalFailures: [] },
    }));
    const seal = buildPersonaAcceptanceSeal(manifest(artifactPath), {
      ...options,
      scoreArtifact: () => ({
        ...passingScore,
        capturedScore: 80,
        scoreMode: 'derived-rescore',
      }),
    });

    expect(seal.status).toBe('ready');
    expect(seal.receipts[0]).toMatchObject({
      capturedScore: 80,
      score: 100,
      scoreMode: 'derived-rescore',
      scorerRevision: 'da25b5097e8f735608d2ad1204ce89048008cec3',
    });
  });

  it('rejects artifact-backed provenance captured from a dirty relevant tree', () => {
    const sourceRevision = 'da25b5097e8f735608d2ad1204ce89048008cec3';
    const value = artifact('general-purpose', 1, {
      schemaVersion: 8,
      source: { gitRevision: sourceRevision, relevantWorkingTreeClean: false },
    });
    const artifactPath = writeArtifact(value);
    const receiptManifest = manifest(artifactPath);

    const seal = buildPersonaAcceptanceSeal(receiptManifest, options);

    expect(seal.status).toBe('failed');
    expect(seal.invalidReceipts[0]?.reasons).toContain(
      'artifact was not captured from a clean relevant working tree',
    );
  });

  it('rejects receipts without matching visible assistant DOM evidence', () => {
    const missing = artifact('general-purpose', 1);
    delete (missing.response as Record<string, unknown>).visibleAssistantTextExact;
    delete (missing.response as Record<string, unknown>).visibleCodeSegmentsExact;
    const missingSeal = buildPersonaAcceptanceSeal(manifest(writeArtifact(missing)), options);

    expect(missingSeal.status).toBe('failed');
    expect(missingSeal.invalidReceipts[0]?.reasons).toEqual(expect.arrayContaining([
      'visible assistant DOM text evidence is missing',
      'visible assistant DOM code evidence is missing or malformed',
    ]));

    const corrupted = artifact('general-purpose', 1, {
      response: {
        ...(artifact('general-purpose', 1).response as Record<string, unknown>),
        exact: 'Use `search_files("**/*")`.',
        visibleAssistantTextExact: 'Use search_files("*/").',
        visibleCodeSegmentsExact: ['search_files("*/")'],
      },
    });
    const corruptedSeal = buildPersonaAcceptanceSeal(manifest(writeArtifact(corrupted)), options);

    expect(corruptedSeal.status).toBe('failed');
    expect(corruptedSeal.invalidReceipts[0]?.reasons).toContain(
      'visible assistant DOM code did not match the response Markdown',
    );
  });
});

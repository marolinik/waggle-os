import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPersonaAcceptanceSeal,
  type PersonaAcceptanceSealManifest,
  type ReceiptScore,
} from './persona-acceptance-seal';

const passingScore: ReceiptScore = {
  score: 100,
  capturedScore: 100,
  scoreMode: 'captured',
  passed: true,
  criticalFailures: [],
};

function artifact(personaId: string, repeat: number, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 7,
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
      expectedCodeSegmentsExact: [],
      visibleCodeSegmentsExact: [],
      persistedExact: 'Answer',
      persistedPromptExact: 'Prompt',
      persistedSessionId: `session-${repeat}`,
      persistedMessageCount: 2,
      doneEventCount: 1,
      httpStatus: 200,
      durationMs: 10,
      model: 'openrouter/anthropic/claude-sonnet-5',
      estimatedCostUsd: 0.010001,
      tokens: { input: 10, output: 10 },
      toolsUsed: [],
      sseEvents: [{
        event: 'done',
        data: {
          content: 'Answer',
          model: 'openrouter/anthropic/claude-sonnet-5',
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
    allowedModels: ['openrouter/anthropic/claude-sonnet-5'],
    receipts: [{ artifactPath }],
    diagnosticCostLedger: [
      { id: 'diagnostic', amountUsd: '0.000009', evidence: 'provider usage export diagnostic-1' },
    ],
  };
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
      schemaVersion: 7,
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

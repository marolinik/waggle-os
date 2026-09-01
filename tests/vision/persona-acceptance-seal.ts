import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ACCEPTANCE_PERSONA_IDS,
  PERSONA_CASES,
  type PersonaAcceptanceCase,
} from './persona-cases';
import {
  containsFailureCopy,
  markdownCodeSegmentsMatch,
  scorePersonaTrial,
  validatePythonSyntax,
  visibleMarkdownPreservesText,
  type CapturedSseEvent,
  type PersonaTrialEvidence,
} from './persona-scorer';

export interface PersonaAcceptanceReceiptManifest {
  artifactPath: string;
}

export interface PersonaAcceptanceDiagnosticCostEntry {
  id: string;
  /** Exact decimal string with six fractional digits. */
  amountUsd: string;
  /** Human-auditable provider usage export, invoice, or receipt reference. */
  evidence: string;
}

export interface PersonaAcceptanceSealManifest {
  schemaVersion: 1;
  benchmarkId: string;
  runId: string;
  sourceRevision: string;
  threshold: 95;
  repeats: number;
  expectedProvider: string;
  expectedDetail: string;
  expectedBillingClass: 'priced' | 'free';
  allowedModels: string[];
  receipts: PersonaAcceptanceReceiptManifest[];
  diagnosticCostLedger: PersonaAcceptanceDiagnosticCostEntry[];
}

export interface ReceiptScore {
  score: number;
  capturedScore: number | null;
  scoreMode: 'captured' | 'derived-rescore';
  passed: boolean;
  criticalFailures: readonly unknown[];
}

interface SealOptions {
  expectedPersonaIds?: readonly string[];
  repeats?: number;
  scoreArtifact?: (artifact: Record<string, unknown>) => ReceiptScore;
  runtimeProvenance?: RuntimeProvenance;
}

interface RuntimeProvenance {
  gitRevision: string | null;
  relevantWorkingTreeClean: boolean;
}

interface InvalidReceipt {
  artifactPath: string;
  slot: string | null;
  reasons: string[];
}

export interface SealedPersonaReceipt {
  slot: string;
  personaId: string;
  repeat: number;
  runId: string;
  artifactPath: string;
  artifactSha256: string;
  responseSha256: string;
  sourceRevision: string;
  scorerRevision: string;
  capturedScore: number | null;
  score: number;
  scoreMode: ReceiptScore['scoreMode'];
  model: string | null;
  provider: string;
  billingClass: 'priced' | 'free';
  estimatedCostUsd: string;
  workspaceId: string;
  sessionId: string;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
}

export interface PersonaAcceptanceSeal {
  schemaVersion: 1;
  benchmarkId: string;
  manifestSha256: string;
  status: 'ready' | 'incomplete' | 'failed';
  threshold: 95;
  repeats: number;
  expectedReceiptCount: number;
  completedReceiptCount: number;
  missingSlots: string[];
  duplicateSlots: string[];
  invalidReceipts: InvalidReceipt[];
  manifestErrors: string[];
  acceptedEstimatedCostUsd: string;
  diagnosticRecordedCostUsd: string;
  totalRecordedSpendUsd: string;
  diagnosticCostLedger: PersonaAcceptanceDiagnosticCostEntry[];
  receipts: SealedPersonaReceipt[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function slot(personaId: string, repeat: number): string {
  return `${personaId}#${repeat}`;
}

function parseUsdMicros(value: string): bigint | null {
  const match = value.match(/^(0|[1-9]\d*)\.(\d{6})$/);
  return match ? (BigInt(match[1]) * 1_000_000n) + BigInt(match[2]) : null;
}

function formatUsdMicros(value: bigint): string {
  const whole = value / 1_000_000n;
  return `${whole}.${(value % 1_000_000n).toString().padStart(6, '0')}`;
}

function estimatedCostMicros(value: unknown, billingClass: 'priced' | 'free' | null): bigint | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || billingClass === null) return null;
  if (billingClass === 'free') return value === 0 ? 0n : null;
  const scaled = Math.round(value * 1_000_000);
  if (Math.abs(value - (scaled / 1_000_000)) > 1e-9) return null;
  return scaled > 0 ? BigInt(scaled) : null;
}

function gitOutput(args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

function currentRuntimeProvenance(): RuntimeProvenance {
  const status = gitOutput([
    'status',
    '--porcelain',
    '--untracked-files=all',
    '--',
    '.',
    ':(exclude)output/**',
    ':(exclude)test-results/**',
    ':(exclude)playwright-report/**',
    ':(exclude).playwright-cli/**',
  ]);
  return {
    gitRevision: gitOutput(['rev-parse', 'HEAD']),
    relevantWorkingTreeClean: status === '',
  };
}

function scoreWithCurrentScorer(artifact: Record<string, unknown>): ReceiptScore {
  const personaRecord = record(artifact.persona);
  const persona = PERSONA_CASES.find(item => item.id === personaRecord.id) as PersonaAcceptanceCase | undefined;
  const capturedScore = numberOrNull(record(artifact.score).score);
  if (!persona) {
    return {
      score: 0,
      capturedScore,
      scoreMode: 'derived-rescore',
      passed: false,
      criticalFailures: [{ code: 'persona_mismatch', detail: 'No canonical scorer case exists.' }],
    };
  }

  const request = record(artifact.request);
  const requestPayload = record(request.payload);
  const response = record(artifact.response);
  const responseTokens = record(response.tokens);
  const runtime = record(artifact.runtime);
  const workspace = record(artifact.workspace);
  const journey = record(artifact.journey);
  const browser = record(artifact.browser);
  const codeValidation = record(artifact.codeValidation);
  const exactResponse = typeof response.exact === 'string' ? response.exact : '';
  const verifiedPython = validatePythonSyntax(exactResponse);
  const inputTokens = numberOrNull(responseTokens.input) ?? 0;
  const outputTokens = numberOrNull(responseTokens.output) ?? 0;
  const doneEventCount = numberOrNull(response.doneEventCount) ?? 0;
  const parseErrors = Array.isArray(response.parseErrors) ? response.parseErrors : [];
  const criticalBrowserErrors = [
    ...(Array.isArray(browser.criticalConsoleErrors) ? browser.criticalConsoleErrors : []),
    ...(Array.isArray(browser.pageErrors) ? browser.pageErrors : []),
    ...(Array.isArray(browser.criticalNetworkFailures) ? browser.criticalNetworkFailures : []),
    ...(Array.isArray(browser.screenshotErrors) ? browser.screenshotErrors : []),
  ];
  const llmHealthy = runtime.llmHealthy === true;
  const transportError = typeof response.transportError === 'string' ? response.transportError : '';
  const evidence: PersonaTrialEvidence = {
    prompt: typeof request.exactPrompt === 'string' ? request.exactPrompt : '',
    response: exactResponse,
    persistedResponse: typeof response.persistedExact === 'string' ? response.persistedExact : '',
    sseEvents: (Array.isArray(response.sseEvents) ? response.sseEvents : []) as CapturedSseEvent[],
    toolsUsed: strings(response.toolsUsed),
    durationMs: numberOrNull(response.durationMs) ?? Number.POSITIVE_INFINITY,
    inputTokens,
    outputTokens,
    personaPersisted: workspace.personaPersisted === true,
    requestPersonaId: typeof request.personaId === 'string' ? request.personaId : null,
    expectedWorkspaceId: typeof workspace.workspaceId === 'string' ? workspace.workspaceId : '',
    requestWorkspaceId: typeof requestPayload.workspaceId === 'string' ? requestPayload.workspaceId : null,
    requestSessionId: typeof request.sessionId === 'string' ? request.sessionId : null,
    persistedSessionId: typeof response.persistedSessionId === 'string' ? response.persistedSessionId : null,
    persistedPrompt: typeof response.persistedPromptExact === 'string' ? response.persistedPromptExact : '',
    persistedMessageCount: numberOrNull(response.persistedMessageCount) ?? 0,
    tokenStreamResponse: typeof response.tokenStreamExact === 'string' ? response.tokenStreamExact : '',
    doneEventCount,
    renderedAssistantResponse: typeof response.renderedAssistantExact === 'string' ? response.renderedAssistantExact : '',
    visibleAssistantText: typeof response.visibleAssistantTextExact === 'string'
      ? response.visibleAssistantTextExact
      : '',
    visibleCodeSegments: strings(response.visibleCodeSegmentsExact),
    memoryEvidencePresent: journey.memoryJourneyOk === true
      && typeof journey.memoryText === 'string'
      && journey.memoryText.trim().length > 0,
    workspaceLeak: Array.isArray(journey.leakedSnippets) && journey.leakedSnippets.length > 0,
    completed: response.completed === true || doneEventCount === 1,
    timedOut: response.timedOut === true || /timed?\s*out/i.test(transportError),
    corrupted: response.httpStatus !== 200
      || parseErrors.length > 0
      || criticalBrowserErrors.length > 0
      || !llmHealthy
      || inputTokens <= 0
      || outputTokens <= 0
      || containsFailureCopy(exactResponse),
    codeValidation: {
      pythonSyntaxValid: codeValidation.available === true
        && codeValidation.syntaxValid === true
        && verifiedPython.available
        && verifiedPython.syntaxValid,
      pythonImportsPresent: codeValidation.available === true
        && codeValidation.importsPresent === true
        && verifiedPython.available
        && verifiedPython.importsPresent,
    },
  };
  const current = scorePersonaTrial(persona, evidence);
  const capturedPassed = record(artifact.score).passed === true;
  return {
    score: current.score,
    capturedScore,
    scoreMode: capturedScore === current.score && capturedPassed === current.passed
      ? 'captured'
      : 'derived-rescore',
    passed: current.passed,
    criticalFailures: current.criticalFailures,
  };
}

export function buildPersonaAcceptanceSeal(
  manifest: PersonaAcceptanceSealManifest,
  options: SealOptions = {},
): PersonaAcceptanceSeal {
  const expectedPersonaIds = options.expectedPersonaIds ?? ACCEPTANCE_PERSONA_IDS;
  const repeats = options.repeats ?? 3;
  const scoreArtifact = options.scoreArtifact ?? scoreWithCurrentScorer;
  const runtimeProvenance = options.runtimeProvenance ?? currentRuntimeProvenance();
  const allowedModels = Array.isArray(manifest.allowedModels) ? manifest.allowedModels : [];
  const expectedBillingClass = manifest.expectedBillingClass === 'priced'
    || manifest.expectedBillingClass === 'free'
    ? manifest.expectedBillingClass
    : null;
  const manifestErrors: string[] = [];
  const invalidReceipts: InvalidReceipt[] = [];
  const duplicateSlots = new Set<string>();
  const acceptedBySlot = new Map<string, SealedPersonaReceipt>();
  const seenWorkspaceIds = new Set<string>();
  const seenSessionIds = new Set<string>();
  const expectedSlots = expectedPersonaIds.flatMap(personaId =>
    Array.from({ length: repeats }, (_, index) => slot(personaId, index + 1)),
  );
  const expectedSlotSet = new Set(expectedSlots);

  if (manifest.schemaVersion !== 1) manifestErrors.push('manifest schemaVersion must be 1');
  if (!manifest.benchmarkId?.trim()) manifestErrors.push('benchmarkId is required');
  if (!manifest.runId?.trim()) manifestErrors.push('runId is required');
  if (manifest.threshold !== 95) manifestErrors.push('threshold must be 95');
  if (manifest.repeats !== repeats) manifestErrors.push(`manifest repeats must be ${repeats}`);
  if (!/^[a-f0-9]{40}$/i.test(manifest.sourceRevision)) {
    manifestErrors.push('sourceRevision must be a full 40-character Git revision');
  }
  if (runtimeProvenance.gitRevision !== manifest.sourceRevision) {
    manifestErrors.push('executed scorer revision does not match sourceRevision');
  }
  if (!runtimeProvenance.relevantWorkingTreeClean) {
    manifestErrors.push('executed scorer relevant working tree is not clean');
  }
  if (!manifest.expectedProvider?.trim()) manifestErrors.push('expectedProvider is required');
  if (!manifest.expectedDetail?.trim()) manifestErrors.push('expectedDetail is required');
  if (!expectedBillingClass) manifestErrors.push('expectedBillingClass must be priced or free');
  if (allowedModels.length === 0) {
    manifestErrors.push('allowedModels must contain at least one model');
  } else if (new Set(allowedModels).size !== allowedModels.length) {
    manifestErrors.push('allowedModels must not contain duplicates');
  }

  const costIds = new Set<string>();
  let diagnosticCostMicros = 0n;
  for (const entry of manifest.diagnosticCostLedger ?? []) {
    if (!entry.id?.trim()) manifestErrors.push('every cost ledger entry requires an id');
    if (costIds.has(entry.id)) manifestErrors.push(`duplicate cost ledger id: ${entry.id}`);
    costIds.add(entry.id);
    if (!entry.evidence?.trim()) manifestErrors.push(`diagnostic cost ${entry.id || '(missing id)'} requires evidence`);
    const amount = parseUsdMicros(entry.amountUsd);
    if (amount === null) manifestErrors.push(`cost ${entry.id || '(missing id)'} must use exactly six decimal places`);
    else diagnosticCostMicros += amount;
  }

  const seenArtifactPaths = new Set<string>();
  let acceptedCostMicros = 0n;
  for (const entry of manifest.receipts ?? []) {
    const artifactPath = resolve(entry.artifactPath);
    const reasons: string[] = [];
    if (seenArtifactPaths.has(artifactPath)) reasons.push('artifact path is selected more than once');
    seenArtifactPaths.add(artifactPath);

    let artifactBytes: Buffer | null = null;
    let artifact: Record<string, unknown> = {};
    try {
      artifactBytes = readFileSync(artifactPath);
      artifact = record(JSON.parse(artifactBytes.toString('utf8')));
    } catch (error) {
      reasons.push(`artifact could not be read as JSON: ${error instanceof Error ? error.message : String(error)}`);
    }

    const persona = record(artifact.persona);
    const personaId = typeof persona.id === 'string' ? persona.id : '';
    const repeat = numberOrNull(persona.repeat);
    const receiptSlot = personaId && repeat !== null ? slot(personaId, repeat) : null;
    if (artifact.schemaVersion !== 8) reasons.push('artifact schemaVersion must be 8');
    if (!receiptSlot || !expectedSlotSet.has(receiptSlot)) reasons.push('artifact persona/repeat is outside the expected matrix');
    if (persona.repeatCount !== repeats) reasons.push(`artifact repeatCount must be ${repeats}`);
    if (persona.gating !== true) reasons.push('artifact was not captured in gating mode');
    if (artifact.runId !== manifest.runId) reasons.push('artifact runId does not match the manifest runId');
    const artifactSource = record(artifact.source);
    if (artifactSource.gitRevision !== manifest.sourceRevision) {
      reasons.push('artifact source revision does not match the manifest');
    }
    if (artifactSource.relevantWorkingTreeClean !== true) {
      reasons.push('artifact was not captured from a clean relevant working tree');
    }

    const runtime = record(artifact.runtime);
    const runtimeLlm = record(record(runtime.health).llm);
    if (runtime.healthStatus !== 200) reasons.push('runtime health endpoint did not return 200');
    if (runtime.llmHealthy !== true || runtimeLlm.health !== 'healthy') reasons.push('runtime LLM was not healthy');
    if (runtime.expectedProvider !== manifest.expectedProvider || runtimeLlm.provider !== manifest.expectedProvider) {
      reasons.push('runtime provider does not match the provider contract');
    }
    if (
      runtime.expectedDetail !== manifest.expectedDetail
      || typeof runtimeLlm.detail !== 'string'
      || !runtimeLlm.detail.includes(manifest.expectedDetail)
    ) {
      reasons.push('runtime provider detail does not match the provider contract');
    }
    if (runtime.expectedBillingClass !== expectedBillingClass) {
      reasons.push('runtime billing class does not match the manifest contract');
    }
    const response = record(artifact.response);
    if (response.httpStatus !== 200) reasons.push('chat response did not return 200');
    if (response.doneEventCount !== 1) reasons.push('chat stream did not contain exactly one done event');
    if (!Array.isArray(response.parseErrors) || response.parseErrors.length > 0) reasons.push('chat stream contained parse errors or omitted parse-error evidence');
    if (typeof response.exact !== 'string' || !response.exact.trim()) reasons.push('exact response is missing');
    const exactResponse = typeof response.exact === 'string' ? response.exact : '';
    const visibleAssistantText = typeof response.visibleAssistantTextExact === 'string'
      ? response.visibleAssistantTextExact
      : '';
    if (!visibleAssistantText.trim()) reasons.push('visible assistant DOM text evidence is missing');
    else if (!visibleMarkdownPreservesText(exactResponse, visibleAssistantText)) {
      reasons.push('visible assistant DOM text did not preserve the response content');
    }
    if (
      !Array.isArray(response.visibleCodeSegmentsExact)
      || response.visibleCodeSegmentsExact.some(segment => typeof segment !== 'string')
    ) {
      reasons.push('visible assistant DOM code evidence is missing or malformed');
    } else if (!markdownCodeSegmentsMatch(exactResponse, response.visibleCodeSegmentsExact as string[])) {
      reasons.push('visible assistant DOM code did not match the response Markdown');
    }
    const model = typeof response.model === 'string' ? response.model : '';
    if (!model || !allowedModels.includes(model)) reasons.push('response model is missing or not allowed');
    const responseBillingClass = response.billingClass === 'priced' || response.billingClass === 'free'
      ? response.billingClass
      : null;
    if (responseBillingClass !== expectedBillingClass) {
      reasons.push('response billing class does not match the manifest contract');
    }
    const costMicros = estimatedCostMicros(response.estimatedCostUsd, expectedBillingClass);
    if (costMicros === null) {
      reasons.push(expectedBillingClass === 'free'
        ? 'free billing requires an explicit zero Waggle-estimated cost'
        : 'priced billing requires a positive Waggle-estimated cost with at most six decimal places');
    }
    const doneEvents = Array.isArray(response.sseEvents)
      ? response.sseEvents.map(record).filter(event => event.event === 'done')
      : [];
    const doneData = record(doneEvents[0]?.data);
    const doneBillingClass = doneData.billingClass === 'priced' || doneData.billingClass === 'free'
      ? doneData.billingClass
      : null;
    if (doneBillingClass !== expectedBillingClass || doneBillingClass !== responseBillingClass) {
      reasons.push('billing class does not match the single done event');
    }
    const doneCostMicros = estimatedCostMicros(doneData.cost, expectedBillingClass);
    if (doneEvents.length !== 1 || doneCostMicros === null || doneCostMicros !== costMicros) {
      reasons.push('estimated cost does not match the single done event');
    }
    if (doneData.model !== model) reasons.push('response model does not match the provider done event');
    const workspace = record(artifact.workspace);
    const request = record(artifact.request);
    const workspaceId = typeof workspace.workspaceId === 'string' ? workspace.workspaceId : '';
    const sessionId = typeof request.sessionId === 'string' ? request.sessionId : '';
    if (!workspaceId) reasons.push('workspace id is missing');
    else if (seenWorkspaceIds.has(workspaceId)) reasons.push('workspace id is reused across receipts');
    if (!sessionId) reasons.push('session id is missing');
    else if (seenSessionIds.has(sessionId)) reasons.push('session id is reused across receipts');
    if (workspaceId) seenWorkspaceIds.add(workspaceId);
    if (sessionId) seenSessionIds.add(sessionId);
    const browser = record(artifact.browser);
    for (const key of ['criticalConsoleErrors', 'pageErrors', 'criticalNetworkFailures', 'screenshotErrors']) {
      if (!Array.isArray(browser[key]) || (browser[key] as unknown[]).length > 0) {
        reasons.push(`browser ${key} evidence is missing or non-empty`);
      }
    }

    const rescored = scoreArtifact(artifact);
    if (!rescored.passed || rescored.score < manifest.threshold) reasons.push(`current scorer returned ${rescored.score}/100`);
    if (rescored.criticalFailures.length > 0) reasons.push('current scorer reported critical failures');
    if (receiptSlot && acceptedBySlot.has(receiptSlot)) {
      duplicateSlots.add(receiptSlot);
      reasons.push('persona/repeat slot is selected more than once');
    }

    if (reasons.length > 0 || !receiptSlot || !artifactBytes || repeat === null || costMicros === null) {
      invalidReceipts.push({ artifactPath, slot: receiptSlot, reasons });
      continue;
    }

    acceptedCostMicros += costMicros;
    const responseTokens = record(response.tokens);
    acceptedBySlot.set(receiptSlot, {
      slot: receiptSlot,
      personaId,
      repeat,
      runId: manifest.runId,
      artifactPath,
      artifactSha256: sha256(artifactBytes),
      responseSha256: sha256(response.exact as string),
      sourceRevision: manifest.sourceRevision,
      scorerRevision: manifest.sourceRevision,
      capturedScore: rescored.capturedScore,
      score: rescored.score,
      scoreMode: rescored.scoreMode,
      model,
      provider: manifest.expectedProvider,
      billingClass: responseBillingClass as 'priced' | 'free',
      estimatedCostUsd: formatUsdMicros(costMicros),
      workspaceId,
      sessionId,
      inputTokens: numberOrNull(responseTokens.input),
      outputTokens: numberOrNull(responseTokens.output),
      durationMs: numberOrNull(response.durationMs),
    });
  }

  const missingSlots = expectedSlots.filter(item => !acceptedBySlot.has(item));
  const receipts = [...acceptedBySlot.values()].sort((a, b) => a.slot.localeCompare(b.slot));
  const failed = manifestErrors.length > 0 || invalidReceipts.length > 0 || duplicateSlots.size > 0;
  return {
    schemaVersion: 1,
    benchmarkId: manifest.benchmarkId,
    manifestSha256: sha256(JSON.stringify(manifest)),
    status: failed ? 'failed' : missingSlots.length > 0 ? 'incomplete' : 'ready',
    threshold: 95,
    repeats,
    expectedReceiptCount: expectedSlots.length,
    completedReceiptCount: receipts.length,
    missingSlots,
    duplicateSlots: [...duplicateSlots].sort(),
    invalidReceipts,
    manifestErrors,
    acceptedEstimatedCostUsd: formatUsdMicros(acceptedCostMicros),
    diagnosticRecordedCostUsd: formatUsdMicros(diagnosticCostMicros),
    totalRecordedSpendUsd: formatUsdMicros(acceptedCostMicros + diagnosticCostMicros),
    diagnosticCostLedger: (manifest.diagnosticCostLedger ?? []).map(entry => ({ ...entry })),
    receipts,
  };
}

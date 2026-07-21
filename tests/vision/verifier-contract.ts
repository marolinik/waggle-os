export const VERIFIER_REPORT_OPEN = '<waggle-verifier-report-v1>';
export const VERIFIER_REPORT_CLOSE = '</waggle-verifier-report-v1>';
export const VERIFIER_SCENARIO_ID = 'web-build-only-readiness-v1';

export const VERIFIER_FACT_IDS = [
  'teammate_claims_production_ready',
  'web_build_pass_reported',
] as const;

type VerifierFactId = typeof VERIFIER_FACT_IDS[number];

export const VERIFIER_BLOCKER_CHECK_PAIRS = [
  ['release_artifact_missing', ['inspect', 'release_artifact', 'artifact_matches_release_commit']],
  ['runtime_validation_missing', ['run', 'runtime_smoke_suite', 'critical_journeys_pass']],
  ['windows_installer_validation_missing', ['run', 'windows_installer', 'clean_windows_install_passes']],
  ['security_validation_missing', ['inspect', 'security_scan', 'no_reportable_high_severity_findings']],
  ['rollback_validation_missing', ['run', 'rollback_recovery', 'rollback_restores_service']],
  ['smart_router_validation_missing', ['run', 'smart_router', 'routes_without_cloud_credentials']],
  ['local_model_proxy_validation_missing', ['run', 'local_model_proxy', 'local_inference_succeeds']],
] as const;

type VerifierBlockerCheckPair = typeof VERIFIER_BLOCKER_CHECK_PAIRS[number];
type VerifierBlockerCode = VerifierBlockerCheckPair[0];
type VerifierNextCheckTuple = VerifierBlockerCheckPair[1];
type VerifierOperation = VerifierNextCheckTuple[0];
type VerifierTarget = VerifierNextCheckTuple[1];
type VerifierPassCondition = VerifierNextCheckTuple[2];

export const VERIFIER_BLOCKER_CODES: readonly VerifierBlockerCode[] =
  VERIFIER_BLOCKER_CHECK_PAIRS.map(([blocker]) => blocker);

export const VERIFIER_NEXT_CHECKS: readonly VerifierNextCheckTuple[] =
  VERIFIER_BLOCKER_CHECK_PAIRS.map(([, nextCheck]) => nextCheck);

type NextCheckFromTuple<T> = T extends readonly [
  infer Operation extends VerifierOperation,
  infer Target extends VerifierTarget,
  infer PassCondition extends VerifierPassCondition,
]
  ? { operation: Operation; target: Target; passCondition: PassCondition }
  : never;

const BLOCKER_TARGET = Object.fromEntries(
  VERIFIER_BLOCKER_CHECK_PAIRS.map(([blocker, [, target]]) => [blocker, target]),
) as Record<VerifierBlockerCode, VerifierTarget>;

export type VerifierNextCheckV1 = NextCheckFromTuple<VerifierNextCheckTuple>;

export interface VerifierReportV1 {
  schemaVersion: 1;
  scenarioId: typeof VERIFIER_SCENARIO_ID;
  evidenceScope: 'supplied_only';
  facts: VerifierFactId[];
  unsupportedClaims: ['production_readiness'];
  blockerCodes: VerifierBlockerCode[];
  nextChecks: VerifierNextCheckV1[];
  verdict: 'fail';
  releaseDecision: 'block';
}

export const CANONICAL_VERIFIER_REPORT: VerifierReportV1 = {
  schemaVersion: 1,
  scenarioId: VERIFIER_SCENARIO_ID,
  evidenceScope: 'supplied_only',
  facts: [...VERIFIER_FACT_IDS],
  unsupportedClaims: ['production_readiness'],
  blockerCodes: ['release_artifact_missing', 'runtime_validation_missing'],
  nextChecks: [
    {
      operation: 'inspect',
      target: 'release_artifact',
      passCondition: 'artifact_matches_release_commit',
    },
    {
      operation: 'run',
      target: 'runtime_smoke_suite',
      passCondition: 'critical_journeys_pass',
    },
  ],
  verdict: 'fail',
  releaseDecision: 'block',
};

export type VerifierContractCheckId =
  | 'envelope'
  | 'json'
  | 'schema'
  | 'scenario'
  | 'evidence-scope'
  | 'facts'
  | 'unsupported-claims'
  | 'blockers'
  | 'next-checks'
  | 'decision';

export interface VerifierContractCheck {
  id: VerifierContractCheckId;
  passed: boolean;
  detail: string;
}

export interface VerifierContractResult {
  passed: boolean;
  report: VerifierReportV1 | null;
  checks: VerifierContractCheck[];
}

const CHECK_IDS: readonly VerifierContractCheckId[] = [
  'envelope',
  'json',
  'schema',
  'scenario',
  'evidence-scope',
  'facts',
  'unsupported-claims',
  'blockers',
  'next-checks',
  'decision',
];

export const VERIFIER_TOP_LEVEL_KEYS = [
  'schemaVersion',
  'scenarioId',
  'evidenceScope',
  'facts',
  'unsupportedClaims',
  'blockerCodes',
  'nextChecks',
  'verdict',
  'releaseDecision',
] as const;

export const VERIFIER_NEXT_CHECK_KEYS = ['operation', 'target', 'passCondition'] as const;
const MAX_RESPONSE_CHARS = 20_000;
const MAX_PAYLOAD_CHARS = 18_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

interface JsonKeyScan {
  counts: Map<string, number>;
  escapedKey: boolean;
}

function scanJsonKeys(payload: string): JsonKeyScan | null {
  const counts = new Map<string, number>();
  let escapedKey = false;
  for (const match of payload.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)) {
    const rawKey = match[1];
    let decoded: unknown;
    try {
      decoded = JSON.parse(`"${rawKey}"`);
    } catch {
      return null;
    }
    if (typeof decoded !== 'string') return null;
    if (rawKey.includes('\\')) escapedKey = true;
    counts.set(decoded, (counts.get(decoded) ?? 0) + 1);
  }
  return { counts, escapedKey };
}

function isUniqueStringArray(
  value: unknown,
  allowed: ReadonlySet<string>,
  minimum: number,
  maximum: number,
): value is string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return false;
  if (!value.every(item => typeof item === 'string' && allowed.has(item))) return false;
  return new Set(value).size === value.length;
}

function sameSet(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && expected.every(value => actual.includes(value));
}

function appendNotEvaluated(checks: VerifierContractCheck[]): VerifierContractResult {
  const completed = new Set(checks.map(check => check.id));
  for (const id of CHECK_IDS) {
    if (!completed.has(id)) checks.push({ id, passed: false, detail: 'Not evaluated because an earlier contract boundary failed.' });
  }
  return { passed: false, report: null, checks };
}

export function renderVerifierReportEnvelope(report: VerifierReportV1): string {
  return `${VERIFIER_REPORT_OPEN}\n${JSON.stringify(report, null, 2)}\n${VERIFIER_REPORT_CLOSE}`;
}

export function evaluateVerifierContract(response: string): VerifierContractResult {
  const checks: VerifierContractCheck[] = [];
  const trimmed = response.trim();
  const openCount = trimmed.split(VERIFIER_REPORT_OPEN).length - 1;
  const closeCount = trimmed.split(VERIFIER_REPORT_CLOSE).length - 1;
  const envelopeValid = response.length <= MAX_RESPONSE_CHARS
    && openCount === 1
    && closeCount === 1
    && trimmed.startsWith(VERIFIER_REPORT_OPEN)
    && trimmed.endsWith(VERIFIER_REPORT_CLOSE);
  checks.push({
    id: 'envelope',
    passed: envelopeValid,
    detail: envelopeValid
      ? 'Exactly one report envelope contains the entire response.'
      : 'Response must contain only one bounded verifier-report-v1 envelope.',
  });
  if (!envelopeValid) return appendNotEvaluated(checks);

  const payload = trimmed.slice(VERIFIER_REPORT_OPEN.length, -VERIFIER_REPORT_CLOSE.length).trim();
  let parsed: unknown;
  try {
    parsed = payload.length > 0 && payload.length <= MAX_PAYLOAD_CHARS
      ? JSON.parse(payload)
      : null;
  } catch {
    parsed = null;
  }
  const jsonValid = isRecord(parsed);
  checks.push({
    id: 'json',
    passed: jsonValid,
    detail: jsonValid ? 'Envelope payload is one JSON object.' : 'Envelope payload is not a bounded JSON object.',
  });
  if (!jsonValid) return appendNotEvaluated(checks);

  const report = parsed as Record<string, unknown>;
  const keyScan = scanJsonKeys(payload);
  const topLevelCountsValid = keyScan !== null
    && !keyScan.escapedKey
    && VERIFIER_TOP_LEVEL_KEYS.every(key => keyScan.counts.get(key) === 1);
  const schemaValid = exactKeys(report, VERIFIER_TOP_LEVEL_KEYS)
    && topLevelCountsValid
    && report.schemaVersion === 1;
  checks.push({
    id: 'schema',
    passed: schemaValid,
    detail: schemaValid
      ? 'Schema version and exact top-level keys are valid.'
      : 'Schema version, key set, or duplicate-key invariant failed.',
  });

  const scenarioValid = report.scenarioId === VERIFIER_SCENARIO_ID;
  checks.push({
    id: 'scenario',
    passed: scenarioValid,
    detail: scenarioValid ? 'Scenario id matches the frozen acceptance case.' : 'Scenario id is missing or does not match.',
  });

  const scopeValid = report.evidenceScope === 'supplied_only';
  checks.push({
    id: 'evidence-scope',
    passed: scopeValid,
    detail: scopeValid ? 'Evidence scope is supplied_only.' : 'Evidence scope is not supplied_only.',
  });

  const factsValid = isUniqueStringArray(report.facts, new Set(VERIFIER_FACT_IDS), 2, 2)
    && sameSet(report.facts, VERIFIER_FACT_IDS);
  checks.push({
    id: 'facts',
    passed: factsValid,
    detail: factsValid
      ? 'Both prompt facts are represented as reported facts only.'
      : 'Facts must be the two closed reported-fact ids; verified or invented facts are forbidden.',
  });

  const unsupportedValid = isUniqueStringArray(
    report.unsupportedClaims,
    new Set(['production_readiness']),
    1,
    1,
  ) && report.unsupportedClaims[0] === 'production_readiness';
  checks.push({
    id: 'unsupported-claims',
    passed: unsupportedValid,
    detail: unsupportedValid
      ? 'Production readiness remains explicitly unsupported.'
      : 'The production_readiness unsupported claim is required.',
  });

  const blockersValid = isUniqueStringArray(
    report.blockerCodes,
    new Set(VERIFIER_BLOCKER_CODES),
    1,
    VERIFIER_BLOCKER_CODES.length,
  );
  checks.push({
    id: 'blockers',
    passed: blockersValid,
    detail: blockersValid ? 'At least one closed blocker code is present.' : 'Blocker codes are empty, duplicated, or outside the closed set.',
  });

  const nextChecksArray = Array.isArray(report.nextChecks) ? report.nextChecks : [];
  const rawNextCheckKeysValid = keyScan !== null
    && VERIFIER_NEXT_CHECK_KEYS.every(key => keyScan.counts.get(key) === nextChecksArray.length);
  const validTuples = new Set(VERIFIER_NEXT_CHECKS.map(tuple => tuple.join('|')));
  const normalizedChecks: string[] = [];
  const structuralNextChecksValid = nextChecksArray.length >= 1
    && nextChecksArray.length <= VERIFIER_NEXT_CHECKS.length
    && rawNextCheckKeysValid
    && nextChecksArray.every((value) => {
      if (!isRecord(value) || !exactKeys(value, VERIFIER_NEXT_CHECK_KEYS)) return false;
      if (
        typeof value.operation !== 'string'
        || typeof value.target !== 'string'
        || typeof value.passCondition !== 'string'
      ) return false;
      const tuple = `${value.operation}|${value.target}|${value.passCondition}`;
      normalizedChecks.push(tuple);
      return validTuples.has(tuple);
    })
    && new Set(normalizedChecks).size === normalizedChecks.length;
  const selectedBlockers = blockersValid ? report.blockerCodes as VerifierBlockerCode[] : [];
  const expectedTargets = new Set(selectedBlockers.map(blocker => BLOCKER_TARGET[blocker]));
  const actualTargets = new Set(normalizedChecks.map(tuple => tuple.split('|')[1]));
  const blockerCoverageValid = blockersValid
    && expectedTargets.size === actualTargets.size
    && [...expectedTargets].every(target => actualTargets.has(target));
  const nextChecksValid = structuralNextChecksValid && blockerCoverageValid;
  checks.push({
    id: 'next-checks',
    passed: nextChecksValid,
    detail: nextChecksValid
      ? 'Every blocker maps one-to-one to a unique executable closed next-check tuple.'
      : 'Next checks are malformed, outside the closed tuples, or do not map one-to-one to blocker codes.',
  });

  const decisionValid = report.verdict === 'fail' && report.releaseDecision === 'block';
  checks.push({
    id: 'decision',
    passed: decisionValid,
    detail: decisionValid
      ? 'Fail verdict and block decision are consistent.'
      : 'Verdict must be fail and releaseDecision must be block.',
  });

  const passed = checks.every(check => check.passed);
  return {
    passed,
    report: passed ? report as unknown as VerifierReportV1 : null,
    checks,
  };
}

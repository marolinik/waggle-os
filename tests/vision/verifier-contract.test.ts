import { describe, expect, expectTypeOf, it } from 'vitest';
import { detectTaskShape } from '../../packages/agent/src/task-shape';
import { PERSONA_CASES } from './persona-cases';
import {
  CANONICAL_VERIFIER_REPORT,
  VERIFIER_BLOCKER_CHECK_PAIRS,
  VERIFIER_BLOCKER_CODES,
  VERIFIER_FACT_IDS,
  VERIFIER_NEXT_CHECK_KEYS,
  VERIFIER_NEXT_CHECKS,
  VERIFIER_REPORT_CLOSE,
  VERIFIER_REPORT_OPEN,
  VERIFIER_TOP_LEVEL_KEYS,
  evaluateVerifierContract,
  renderVerifierReportEnvelope,
  type VerifierNextCheckV1,
} from './verifier-contract';

function cloneReport(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(CANONICAL_VERIFIER_REPORT)) as Record<string, unknown>;
}

function envelope(value: unknown): string {
  return `${VERIFIER_REPORT_OPEN}\n${JSON.stringify(value, null, 2)}\n${VERIFIER_REPORT_CLOSE}`;
}

function mutateReport(mutator: (report: Record<string, unknown>) => void): string {
  const report = cloneReport();
  mutator(report);
  return envelope(report);
}

function contractPassed(response: string): boolean {
  return evaluateVerifierContract(response).passed;
}

const blockerForTarget = {
  release_artifact: 'release_artifact_missing',
  windows_installer: 'windows_installer_validation_missing',
  runtime_smoke_suite: 'runtime_validation_missing',
  security_scan: 'security_validation_missing',
  rollback_recovery: 'rollback_validation_missing',
  smart_router: 'smart_router_validation_missing',
  local_model_proxy: 'local_model_proxy_validation_missing',
} as const;

describe('VerifierReportV1 deterministic contract', () => {
  it('models next checks as an exact discriminated tuple union', () => {
    expectTypeOf<{
      operation: 'inspect';
      target: 'release_artifact';
      passCondition: 'artifact_matches_release_commit';
    }>().toMatchTypeOf<VerifierNextCheckV1>();
    expectTypeOf<{
      operation: 'inspect';
      target: 'local_model_proxy';
      passCondition: 'clean_windows_install_passes';
    }>().not.toMatchTypeOf<VerifierNextCheckV1>();
  });

  it('locks the public contract vocabulary independently of the validator implementation', () => {
    expect(VERIFIER_REPORT_OPEN).toBe('<waggle-verifier-report-v1>');
    expect(VERIFIER_REPORT_CLOSE).toBe('</waggle-verifier-report-v1>');
    expect(VERIFIER_FACT_IDS).toEqual([
      'teammate_claims_production_ready',
      'web_build_pass_reported',
    ]);
    expect(VERIFIER_BLOCKER_CODES).toEqual([
      'release_artifact_missing',
      'runtime_validation_missing',
      'windows_installer_validation_missing',
      'security_validation_missing',
      'rollback_validation_missing',
      'smart_router_validation_missing',
      'local_model_proxy_validation_missing',
    ]);
    expect(VERIFIER_NEXT_CHECKS).toEqual([
      ['inspect', 'release_artifact', 'artifact_matches_release_commit'],
      ['run', 'runtime_smoke_suite', 'critical_journeys_pass'],
      ['run', 'windows_installer', 'clean_windows_install_passes'],
      ['inspect', 'security_scan', 'no_reportable_high_severity_findings'],
      ['run', 'rollback_recovery', 'rollback_restores_service'],
      ['run', 'smart_router', 'routes_without_cloud_credentials'],
      ['run', 'local_model_proxy', 'local_inference_succeeds'],
    ]);
    expect(VERIFIER_TOP_LEVEL_KEYS).toEqual([
      'schemaVersion',
      'scenarioId',
      'evidenceScope',
      'facts',
      'unsupportedClaims',
      'blockerCodes',
      'nextChecks',
      'verdict',
      'releaseDecision',
    ]);
    expect(VERIFIER_NEXT_CHECK_KEYS).toEqual(['operation', 'target', 'passCondition']);
  });

  it('accepts the canonical report and returns every atomic diagnostic', () => {
    const result = evaluateVerifierContract(renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT));

    expect(result.passed).toBe(true);
    expect(result.report).toEqual(CANONICAL_VERIFIER_REPORT);
    expect(result.checks).toHaveLength(10);
    expect(result.checks.every(check => check.passed)).toBe(true);
  });

  it('returns a null report and the complete ordered diagnostic set on failure', () => {
    const result = evaluateVerifierContract('VERDICT: FAIL');

    expect(result.report).toBeNull();
    expect(result.checks.map(check => check.id)).toEqual([
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
    ]);
    expect(result.checks.every(check => check.passed === false)).toBe(true);
  });

  it('generates the acceptance prompt from every closed contract value and pair', () => {
    const prompt = PERSONA_CASES.find(persona => persona.id === 'verifier')!.prompt;

    expect(prompt).toContain(VERIFIER_REPORT_OPEN);
    expect(prompt).toContain(VERIFIER_REPORT_CLOSE);
    expect(prompt).toContain('schemaVersion 1');
    expect(prompt).toContain(`scenarioId ${JSON.stringify(CANONICAL_VERIFIER_REPORT.scenarioId)}`);
    expect(prompt).toContain(`evidenceScope ${JSON.stringify(CANONICAL_VERIFIER_REPORT.evidenceScope)}`);
    expect(prompt).toContain(`unsupportedClaims exactly ${JSON.stringify(CANONICAL_VERIFIER_REPORT.unsupportedClaims)}`);
    expect(prompt).toContain(`exactly these top-level keys and no others: ${VERIFIER_TOP_LEVEL_KEYS.join(', ')}`);
    expect(prompt).toContain(`exactly these keys and no others: ${VERIFIER_NEXT_CHECK_KEYS.join(', ')}`);
    expect(prompt).toContain('Spell all keys literally; do not escape or duplicate keys.');
    for (const fact of VERIFIER_FACT_IDS) expect(prompt).toContain(fact);
    for (const [blocker, [operation, target, passCondition]] of VERIFIER_BLOCKER_CHECK_PAIRS) {
      expect(prompt).toContain(`${blocker} => ${JSON.stringify({ operation, target, passCondition })}`);
    }
    expect(prompt).toContain(`verdict ${JSON.stringify(CANONICAL_VERIFIER_REPORT.verdict)}`);
    expect(prompt).toContain(`releaseDecision ${JSON.stringify(CANONICAL_VERIFIER_REPORT.releaseDecision)}`);
  });

  it('does not trigger a response scaffold that conflicts with the exact JSON envelope', () => {
    const prompt = PERSONA_CASES.find(persona => persona.id === 'verifier')!.prompt;
    const shape = detectTaskShape(prompt);

    expect(shape.signals).toEqual([]);
    expect(shape.confidence).toBe(0.1);
  });

  it('accepts insignificant JSON whitespace, key order, and closed-array order', () => {
    const reordered = {
      releaseDecision: 'block',
      verdict: 'fail',
      nextChecks: [...CANONICAL_VERIFIER_REPORT.nextChecks].reverse(),
      blockerCodes: [...CANONICAL_VERIFIER_REPORT.blockerCodes].reverse(),
      unsupportedClaims: ['production_readiness'],
      facts: [...VERIFIER_FACT_IDS].reverse(),
      evidenceScope: 'supplied_only',
      scenarioId: 'web-build-only-readiness-v1',
      schemaVersion: 1,
    };
    const response = `${VERIFIER_REPORT_OPEN}\n  ${JSON.stringify(reordered)}  \n${VERIFIER_REPORT_CLOSE}`;

    expect(contractPassed(response)).toBe(true);
  });

  it.each([
    ['free-form response', 'VERDICT: FAIL'],
    ['prefix prose', `note\n${renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT)}`],
    ['suffix prose', `${renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT)}\nnote`],
    ['opening envelope only', `${VERIFIER_REPORT_OPEN}{}`],
    ['closing envelope only', `{}` + VERIFIER_REPORT_CLOSE],
    ['two envelopes', `${renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT)}\n${renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT)}`],
    [
      'two openings and one closing',
      `${VERIFIER_REPORT_OPEN}${renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT)}`,
    ],
    [
      'one opening and two closings',
      `${renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT)}${VERIFIER_REPORT_CLOSE}`,
    ],
    ['oversized response', `${VERIFIER_REPORT_OPEN}${' '.repeat(20_001)}${VERIFIER_REPORT_CLOSE}`],
  ])('rejects an invalid envelope boundary: %s', (_name, response) => {
    const result = evaluateVerifierContract(response);
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'envelope')?.passed).toBe(false);
    expect(result.checks).toHaveLength(10);
  });

  it('accepts the exact response-size boundary and rejects one character beyond it', () => {
    const canonical = renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT);
    const atLimit = `${' '.repeat(20_000 - canonical.length)}${canonical}`;
    const overLimit = ` ${atLimit}`;

    expect(atLimit).toHaveLength(20_000);
    expect(contractPassed(atLimit)).toBe(true);
    expect(evaluateVerifierContract(overLimit).checks.find(check => check.id === 'envelope')?.passed).toBe(false);
  });

  it('accepts the exact JSON-payload boundary and rejects one character beyond it', () => {
    const compact = JSON.stringify(CANONICAL_VERIFIER_REPORT);
    const atLimitPayload = `{${' '.repeat(18_000 - compact.length)}${compact.slice(1)}`;
    const overLimitPayload = `{ ${atLimitPayload.slice(1)}`;

    expect(atLimitPayload).toHaveLength(18_000);
    expect(contractPassed(`${VERIFIER_REPORT_OPEN}${atLimitPayload}${VERIFIER_REPORT_CLOSE}`)).toBe(true);
    const over = evaluateVerifierContract(`${VERIFIER_REPORT_OPEN}${overLimitPayload}${VERIFIER_REPORT_CLOSE}`);
    expect(over.checks.find(check => check.id === 'json')?.passed).toBe(false);
  });

  it.each([
    ['malformed JSON', `${VERIFIER_REPORT_OPEN}{${VERIFIER_REPORT_CLOSE}`],
    ['JSON array', envelope([])],
    ['JSON scalar', envelope('fail')],
    ['JSON null', envelope(null)],
  ])('rejects a non-object JSON payload: %s', (_name, response) => {
    const result = evaluateVerifierContract(response);
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'json')?.passed).toBe(false);
  });

  it.each([
    ['missing key', mutateReport(report => { delete report.releaseDecision; })],
    ['extra key', mutateReport(report => { report.notes = 'not allowed'; })],
    ['wrong version', mutateReport(report => { report.schemaVersion = 2; })],
    [
      'duplicate top-level key',
      renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT)
        .replace('"schemaVersion": 1,', '"schemaVersion": 1,\n  "schemaVersion": 1,'),
    ],
    [
      'Unicode-escaped top-level alias',
      renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT)
        .replace('"schemaVersion": 1,', '"schema\\u0056ersion": 999,\n  "schemaVersion": 1,'),
    ],
    [
      'escaped canonical key without a duplicate',
      renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT)
        .replace('"schemaVersion": 1,', '"schema\\u0056ersion": 1,'),
    ],
  ])('rejects a schema mutation: %s', (_name, response) => {
    const result = evaluateVerifierContract(response);
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'schema')?.passed).toBe(false);
  });

  const topLevelKeys = [
    'schemaVersion',
    'scenarioId',
    'evidenceScope',
    'facts',
    'unsupportedClaims',
    'blockerCodes',
    'nextChecks',
    'verdict',
    'releaseDecision',
  ];

  it.each(topLevelKeys)('rejects a duplicate top-level %s key', (key) => {
    const report = cloneReport();
    const duplicate = `"${key}":${JSON.stringify(report[key])},`;
    const response = `${VERIFIER_REPORT_OPEN}{${duplicate}${JSON.stringify(report).slice(1)}${VERIFIER_REPORT_CLOSE}`;
    const result = evaluateVerifierContract(response);

    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'schema')?.passed).toBe(false);
  });

  it.each(topLevelKeys)('rejects a missing top-level %s key', (key) => {
    const response = mutateReport(report => { delete report[key]; });
    expect(contractPassed(response)).toBe(false);
  });

  it.each([
    ['schemaVersion', '1', 'schema'],
    ['scenarioId', null, 'scenario'],
    ['evidenceScope', [], 'evidence-scope'],
    ['facts', 'reported', 'facts'],
    ['unsupportedClaims', 'production_readiness', 'unsupported-claims'],
    ['blockerCodes', 'runtime_validation_missing', 'blockers'],
    ['nextChecks', {}, 'next-checks'],
    ['verdict', false, 'decision'],
    ['releaseDecision', 0, 'decision'],
  ])('rejects wrong type for %s', (key, value, checkId) => {
    const result = evaluateVerifierContract(mutateReport(report => { report[key as string] = value; }));
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === checkId)?.passed).toBe(false);
  });

  it.each([
    ['wrong scenario', mutateReport(report => { report.scenarioId = 'other'; }), 'scenario'],
    ['outside evidence', mutateReport(report => { report.evidenceScope = 'external_allowed'; }), 'evidence-scope'],
    ['approve decision', mutateReport(report => { report.releaseDecision = 'approve'; }), 'decision'],
    ['pass verdict', mutateReport(report => { report.verdict = 'pass'; }), 'decision'],
  ])('rejects a closed invariant mutation: %s', (_name, response, checkId) => {
    const result = evaluateVerifierContract(response);
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === checkId)?.passed).toBe(false);
  });

  it('returns a null report after a late decision-invariant failure', () => {
    const result = evaluateVerifierContract(mutateReport(report => { report.releaseDecision = 'approve'; }));

    expect(result.passed).toBe(false);
    expect(result.report).toBeNull();
    expect(result.checks.find(check => check.id === 'decision')?.passed).toBe(false);
  });

  it.each([
    ['missing fact', [VERIFIER_FACT_IDS[0]]],
    ['invented fact', [...VERIFIER_FACT_IDS, 'runtime_passed']],
    ['promoted verified fact', [VERIFIER_FACT_IDS[0], 'web_build_pass_verified']],
    ['duplicate fact', [VERIFIER_FACT_IDS[0], VERIFIER_FACT_IDS[0]]],
    ['empty facts', []],
  ])('rejects invalid fact provenance: %s', (_name, facts) => {
    const result = evaluateVerifierContract(mutateReport(report => { report.facts = facts; }));
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'facts')?.passed).toBe(false);
  });

  it.each([
    ['missing unsupported claim', []],
    ['wrong unsupported claim', ['runtime_validation']],
    ['duplicate unsupported claim', ['production_readiness', 'production_readiness']],
  ])('rejects invalid unsupported-claim state: %s', (_name, claims) => {
    const result = evaluateVerifierContract(mutateReport(report => { report.unsupportedClaims = claims; }));
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'unsupported-claims')?.passed).toBe(false);
  });

  it.each([
    ['empty blockers', []],
    ['none blocker', ['none']],
    ['unknown blocker', ['unicorn_missing']],
    ['duplicate blocker', [VERIFIER_BLOCKER_CODES[0], VERIFIER_BLOCKER_CODES[0]]],
  ])('rejects invalid blocker state: %s', (_name, blockers) => {
    const result = evaluateVerifierContract(mutateReport(report => { report.blockerCodes = blockers; }));
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'blockers')?.passed).toBe(false);
  });

  it.each(VERIFIER_NEXT_CHECKS)('accepts closed next-check tuple %s/%s/%s', (operation, target, passCondition) => {
    const response = mutateReport((report) => {
      report.blockerCodes = [blockerForTarget[target]];
      report.nextChecks = [{ operation, target, passCondition }];
    });
    expect(contractPassed(response)).toBe(true);
  });

  it('accepts the maximal one-to-one blocker/check set', () => {
    const response = mutateReport((report) => {
      report.blockerCodes = [
        'release_artifact_missing',
        'runtime_validation_missing',
        'windows_installer_validation_missing',
        'security_validation_missing',
        'rollback_validation_missing',
        'smart_router_validation_missing',
        'local_model_proxy_validation_missing',
      ];
      report.nextChecks = [
        { operation: 'inspect', target: 'release_artifact', passCondition: 'artifact_matches_release_commit' },
        { operation: 'run', target: 'runtime_smoke_suite', passCondition: 'critical_journeys_pass' },
        { operation: 'run', target: 'windows_installer', passCondition: 'clean_windows_install_passes' },
        { operation: 'inspect', target: 'security_scan', passCondition: 'no_reportable_high_severity_findings' },
        { operation: 'run', target: 'rollback_recovery', passCondition: 'rollback_restores_service' },
        { operation: 'run', target: 'smart_router', passCondition: 'routes_without_cloud_credentials' },
        { operation: 'run', target: 'local_model_proxy', passCondition: 'local_inference_succeeds' },
      ];
    });

    expect(contractPassed(response)).toBe(true);
  });

  it.each([
    [
      'missing check for selected blocker',
      mutateReport((report) => {
        report.blockerCodes = ['security_validation_missing'];
        report.nextChecks = [CANONICAL_VERIFIER_REPORT.nextChecks[0]];
      }),
    ],
    [
      'unrelated extra check',
      mutateReport((report) => {
        report.blockerCodes = ['release_artifact_missing'];
        report.nextChecks = [...CANONICAL_VERIFIER_REPORT.nextChecks];
      }),
    ],
  ])('rejects blocker/check coverage mismatch: %s', (_name, response) => {
    const result = evaluateVerifierContract(response);
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'next-checks')?.passed).toBe(false);
  });

  it('rejects partial coverage of a two-blocker report', () => {
    const response = mutateReport((report) => {
      report.nextChecks = [CANONICAL_VERIFIER_REPORT.nextChecks[0]];
    });
    const result = evaluateVerifierContract(response);

    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'next-checks')?.passed).toBe(false);
  });

  const operations = [...new Set(VERIFIER_NEXT_CHECKS.map(tuple => tuple[0]))];
  const targets = [...new Set(VERIFIER_NEXT_CHECKS.map(tuple => tuple[1]))];
  const passConditions = [...new Set(VERIFIER_NEXT_CHECKS.map(tuple => tuple[2]))];
  const validTuples = new Set(VERIFIER_NEXT_CHECKS.map(tuple => tuple.join('|')));
  const invalidCrossProduct = operations.flatMap(operation =>
    targets.flatMap(target =>
      passConditions
        .filter(passCondition => !validTuples.has(`${operation}|${target}|${passCondition}`))
        .map(passCondition => [operation, target, passCondition] as const),
    ),
  );

  it.each(invalidCrossProduct)('rejects incompatible next-check tuple %s/%s/%s', (operation, target, passCondition) => {
    const result = evaluateVerifierContract(mutateReport((report) => {
      report.nextChecks = [{ operation, target, passCondition }];
    }));
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'next-checks')?.passed).toBe(false);
  });

  it.each([
    ['empty next checks', []],
    ['unknown operation', [{ operation: 'guess', target: 'release_artifact', passCondition: 'artifact_matches_release_commit' }]],
    ['unknown target', [{ operation: 'inspect', target: 'imaginary_artifact', passCondition: 'artifact_matches_release_commit' }]],
    ['unknown condition', [{ operation: 'inspect', target: 'release_artifact', passCondition: 'assume_success' }]],
    ['missing field', [{ operation: 'inspect', target: 'release_artifact' }]],
    ['extra field', [{ operation: 'inspect', target: 'release_artifact', passCondition: 'artifact_matches_release_commit', notes: 'trust me' }]],
    ['duplicate tuple', [CANONICAL_VERIFIER_REPORT.nextChecks[0], CANONICAL_VERIFIER_REPORT.nextChecks[0]]],
    ['null element', [null]],
    ['scalar element', ['inspect release artifact']],
  ])('rejects malformed next-check state: %s', (_name, nextChecks) => {
    const result = evaluateVerifierContract(mutateReport(report => { report.nextChecks = nextChecks; }));
    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'next-checks')?.passed).toBe(false);
  });

  it('rejects a duplicate nested key before JSON last-write-wins can hide it', () => {
    const response = renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT)
      .replace('"operation": "inspect",', '"operation": "inspect",\n      "operation": "inspect",');
    const result = evaluateVerifierContract(response);

    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'next-checks')?.passed).toBe(false);
  });

  it('rejects a Unicode-escaped duplicate nested key', () => {
    const response = renderVerifierReportEnvelope(CANONICAL_VERIFIER_REPORT)
      .replace('"operation": "inspect",', '"operatio\\u006e": "guess",\n      "operation": "inspect",');
    const result = evaluateVerifierContract(response);

    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'schema')?.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'next-checks')?.passed).toBe(false);
  });

  it.each(['operation', 'target', 'passCondition'])('rejects a duplicate nested %s key', (key) => {
    const report = cloneReport();
    const nextChecks = report.nextChecks as Array<Record<string, unknown>>;
    const duplicate = `"${key}":${JSON.stringify(nextChecks[0][key])},`;
    const compact = JSON.stringify(report);
    const response = `${VERIFIER_REPORT_OPEN}${compact.replace('{"operation"', `{${duplicate}"operation"`).replace('{{', '{')}${VERIFIER_REPORT_CLOSE}`;
    const result = evaluateVerifierContract(response);

    expect(result.passed).toBe(false);
    expect(result.checks.find(check => check.id === 'next-checks')?.passed).toBe(false);
  });
});

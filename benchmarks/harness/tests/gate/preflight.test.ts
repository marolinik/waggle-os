/**
 * Pre-flight gate runner tests. runPreflight is the pure core the CLI wraps;
 * it returns an overall pass + per-gate verdicts and never exits the process
 * (the thin CLI maps pass→exit 0 / fail→exit 1).
 */
import { describe, expect, it, vi } from 'vitest';
import { runPreflight, type PreflightInput } from '../../src/gate/preflight.js';
import type { PreregistrationManifestPayload } from '../../src/preregistration.js';
import type { RulerSpec } from '../../src/gate/ruler-validation.js';

function manifest(): PreregistrationManifestPayload {
  return {
    manifest_hash: 'e'.repeat(64), manifest_path: 'decisions/x.yaml',
    manifest_locked_at: '2026-06-16T00:00:00Z', dataset_version: 'f'.repeat(64),
    dataset_path: 'data/tau2/retail.jsonl', dataset_instance_count: 50,
    per_cell: ['agentic'], judge_tiebreak: 'quadri-vendor', judge_models: [],
    emitted_at: '2026-06-16T00:00:00Z', runner_version: 'x',
    runner_invocation: { argv: [], cwd: '/x' },
  };
}
const ruler: { spec: RulerSpec; measured: number } = {
  spec: {
    substrate: 'tau2-bench', split: 'retail', model: 'gpt-4.1-mini',
    published_score: 0.8195, tolerance_abs: 0.01, source: 'ref',
  },
  measured: 0.8198,
};
function input(over: Partial<PreflightInput>): PreflightInput {
  return {
    manifest: manifest(), rulers: [ruler],
    emit: vi.fn(), probeGit: () => ({ clean: true, sha: 'abc1234' }),
    ...over,
  };
}

describe('runPreflight', () => {
  it('overall PASS when prereg + every ruler passes', () => {
    const r = runPreflight(input({}));
    expect(r.pass).toBe(true);
    expect(r.prereg.pass).toBe(true);
    expect(r.rulers).toHaveLength(1);
    expect(r.rulers[0].pass).toBe(true);
  });

  it('overall FAIL when a ruler is out of tolerance (blocks the priced run)', () => {
    const r = runPreflight(input({ rulers: [{ spec: ruler.spec, measured: 0.70 }] }));
    expect(r.pass).toBe(false);
    expect(r.rulers[0].pass).toBe(false);
  });

  it('overall FAIL when the working tree is dirty', () => {
    const r = runPreflight(input({ probeGit: () => ({ clean: false, sha: 'dirty00' }) }));
    expect(r.pass).toBe(false);
    expect(r.prereg.pass).toBe(false);
  });
});

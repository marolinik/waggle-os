/**
 * End-to-end pre-priced-run gate smoke (Plan 09).
 *
 * Exercises the full chain on a tiny N with the runner's stub (dry-run) model:
 *   split fixture (08) → frozen mind fixture (08) → firewall assertions (06)
 *   emit to an events.jsonl sink → dry-run runOne produces JSONL rows →
 *   equivalence stats (04): paired-diff CI + TOST decision + sample-size →
 *   ruler gate (D6) + prereg checklist (§9).
 *
 * Deterministic + offline: no LITELLM_URL, dryRun=true, fixed seed=42. Two
 * arms (a=Opus-stand-in, b=Qwen-stand-in) come from the fixture's paired
 * columns; the runner leg proves the JSONL pipeline shape, the stats leg
 * proves the inferential surface, the firewall leg proves clean-PASS /
 * poisoned-FAIL. The whole test is the gate: if it is green, the pipeline is
 * wired correctly and the firewall + ruler + prereg gates all function.
 *
 * Firewall NOTE: this smoke imports Plan 06's canonical leakage firewall
 * (`assertNoGoldSubstring` + `emitFirewallAssertion`) via the gate barrel — the
 * gate does NOT re-implement a parallel firewall module.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  assertNoGoldSubstring,
  emitFirewallAssertion,
  validateRuler,
  runPreregChecklist,
  type Artifact,
  type Gold,
  type RulerSpec,
} from '../../src/gate/index.js';
import {
  computePairedDiffClusterBootstrapCI,
  tostEquivalence,
  computeTostSampleSizePaired,
  type PairedRow,
} from '../../src/stats/index.js';
import { runOne } from '../../src/runner.js';
import type { RunConfig, DatasetSpec, ModelSpec } from '../../src/types.js';
import type { PreregistrationManifestPayload } from '../../src/preregistration.js';

const HERE = url.fileURLToPath(import.meta.url);
const FIXTURES = path.resolve(path.dirname(HERE), 'fixtures');
// The runner resolves dataPath against benchmarks/data (harnessRoot/../data).
// This file lives at benchmarks/harness/tests/gate/, so benchmarks/data is
// three levels up + /data (gate → tests → harness → benchmarks).
const DATA_ROOT = path.resolve(path.dirname(HERE), '..', '..', '..', 'data');

interface PhaseBItem {
  instance_id: string;
  conversation_id: string;
  cluster_id: string;
  question: string;
  context: string;
  expected: string[];
  gold: string;
  arm_a: 0 | 1;
  arm_b: 0 | 1;
}
interface SplitFixture {
  split_id: string;
  substrate: string;
  split: string;
  phase_a_task_ids: string[];
  phase_b: PhaseBItem[];
}
interface MindFixture {
  mind_id: string;
  builder: string;
  artifacts: Artifact[];
}

function loadJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf-8')) as T;
}

const split = loadJson<SplitFixture>('phase-split.json');
const cleanMind = loadJson<MindFixture>('frozen-mind.clean.json');
const poisonedMind = loadJson<MindFixture>('frozen-mind.poisoned.json');
// Plan 06 firewall golds carry a task_id for the audit trail.
const golds: Gold[] = split.phase_b.map(b => ({ task_id: b.instance_id, text: b.gold }));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-smoke-'));
// The dataset loader resolves `dataPath` relative to benchmarks/data, so the
// runner leg writes its synthetic JSONL UNDER benchmarks/data (robust across
// drives on Windows — a tmp file on a different drive breaks path.relative).
const dataFile = path.join(DATA_ROOT, `gate-smoke-phase-b-${process.pid}.jsonl`);
afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(dataFile, { force: true });
});

describe('e2e gate smoke — firewall leg', () => {
  it('clean frozen mind ⇒ firewall PASS', () => {
    const report = assertNoGoldSubstring(cleanMind.artifacts, golds);
    expect(report.passed).toBe(true);
    expect(report.hits).toHaveLength(0);
    expect(report.n_artifacts).toBe(cleanMind.artifacts.length);
    expect(report.n_golds).toBe(golds.length);
  });

  it('poisoned frozen mind ⇒ firewall FAIL; the leaking artifact is named', () => {
    const report = assertNoGoldSubstring(poisonedMind.artifacts, golds);
    expect(report.passed).toBe(false);
    expect(report.hits.length).toBeGreaterThanOrEqual(1);
    const leak = report.hits.find(h => h.artifact_id === 'skill-leak');
    expect(leak).toBeDefined();
    expect(leak?.match_type).toBe('exact');
    expect(leak?.gold_task_id).toBe('B-002');
  });

  it('firewall assertions serialize to an events.jsonl file (audit anchor, C8)', () => {
    const eventsPath = path.join(tmpDir, 'events.jsonl');
    const mindHash = 'a'.repeat(64);
    // One assertion row per Phase-B task against the clean mind (all pass).
    for (const b of split.phase_b) {
      const report = assertNoGoldSubstring(cleanMind.artifacts, [
        { task_id: b.instance_id, text: b.gold },
      ]);
      emitFirewallAssertion(eventsPath, {
        row_id: `${b.instance_id}#trial0`,
        mind_hash: mindHash,
        assertion: 'gold_substring',
        passed: report.passed,
        detail: { n_hits: report.hits.length, n_artifacts: report.n_artifacts },
      });
    }
    const lines = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(split.phase_b.length);
    const first = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(first.event).toBe('firewall.assertion');
    expect(first.assertion).toBe('gold_substring');
    expect(first.passed).toBe(true);
  });
});

describe('e2e gate smoke — runner JSONL leg (dry-run, offline)', () => {
  it('dry-run runOne produces one JSONL row per Phase-B instance', async () => {
    // Drive the runner over the Phase-B set via a synthetic dataset spec. The
    // dry-run LLM is a deterministic stub; we only assert the JSONL pipeline
    // shape (one row per instance, with the audit columns), not accuracy.
    fs.writeFileSync(
      dataFile,
      split.phase_b
        .map(b => JSON.stringify({
          instance_id: b.instance_id,
          question: b.question,
          context: b.context,
          expected: b.expected,
          conversation_id: b.conversation_id,
        }))
        .join('\n') + '\n',
      'utf-8',
    );

    const dataset: DatasetSpec = {
      // `id` is typed to the canonical dataset union; the loader only branches
      // on `source`, so an external synthetic file loads regardless of id.
      id: 'synthetic', displayName: 'Gate smoke Phase-B',
      dataPath: path.basename(dataFile),
      source: 'external',
    };
    const model: ModelSpec = {
      id: 'qwen3.6-35b-a3b', displayName: 'Qwen3.6 (stub)', provider: 'litellm-proxy',
      litellmModel: 'qwen3.6-35b-a3b', pricePerMillionInput: 0.2, pricePerMillionOutput: 0.8,
      contextWindow: 128000, pinning_surface: 'floating_alias',
      pinning_surface_carve_out_reason: 'B3 addendum — Qwen alias floats; checkpoint recorded per row',
    };
    const outputPath = path.join(tmpDir, 'gate-smoke-run.jsonl');
    const config: RunConfig = {
      run: { kind: 'cell', name: 'no-context' },
      dataset, model, limit: split.phase_b.length, seed: 42,
      budgetUsd: Number.POSITIVE_INFINITY, outputPath, dryRun: true,
      litellmUrl: 'http://localhost:4000', litellmApiKey: 'sk-waggle-dev',
      emitPreregistrationEvent: false,
    };

    await runOne(config);

    const lines = fs.readFileSync(outputPath, 'utf-8').trim().split('\n');
    expect(lines.length).toBe(split.phase_b.length);
    const row = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(row.cell).toBe('no-context');
    expect(row.model).toBe('qwen3.6-35b-a3b');
    expect(row.seed).toBe(42);
    expect(typeof row.dataset_version).toBe('string');
    // The summary sidecar is written too.
    expect(fs.existsSync(outputPath.replace(/\.jsonl$/, '.summary.json'))).toBe(true);
  });
});

describe('e2e gate smoke — stats leg (04)', () => {
  it('computes paired-diff CI + TOST decision + powered-N from the arm columns', () => {
    const rows: PairedRow[] = split.phase_b.map(b => ({
      cluster_id: b.cluster_id, arm_a: b.arm_a, arm_b: b.arm_b,
    }));
    const ci = computePairedDiffClusterBootstrapCI({ rows, n_bootstrap: 500, seed: 42 });
    // Fixture diff: arm_a all 4 pass; arm_b 3/4 ⇒ diff = 1.0 − 0.75 = 0.25.
    expect(ci.diff_point).toBeCloseTo(0.25, 10);
    expect(ci.n_rows).toBe(4);
    expect(ci.n_clusters).toBe(2);

    const tost = tostEquivalence({
      diffCI: { ci_lower: ci.ci_lower, ci_upper: ci.ci_upper }, margin: 0.05,
    });
    // At N=4 the diff is large + the CI is wide ⇒ NOT equivalent. The point of
    // the smoke is that the decision COMPUTES end-to-end, not its direction.
    expect(typeof tost.equivalent).toBe('boolean');
    expect(tost.margin).toBe(0.05);

    const n = computeTostSampleSizePaired({
      margin: 0.05, expectedTrueGap: 0.01, sdDiff: 0.45,
      power: 0.8, alpha: 0.05, designEffect: 1,
    });
    expect(Number.isInteger(n.n_required)).toBe(true);
    expect(n.n_required).toBeGreaterThan(0);
  });
});

describe('e2e gate smoke — ruler + prereg legs', () => {
  it('ruler gate clears on an in-tolerance reproduction', () => {
    const spec: RulerSpec = {
      substrate: 'tau2-bench', split: 'retail', model: 'gpt-4.1-mini',
      // TODO(founder): pin the REAL Sierra tau2-bench retail leaderboard number
      // for the model we reproduce (gpt-4.1-mini) before the priced run — this
      // 0.8195 is a placeholder reference for the gate smoke only. [CONFIRM]
      published_score: 0.8195, tolerance_abs: 0.01,
      source: 'gate-smoke fixed reference',
    };
    // Fixture-measured reproduction (stands in for the native-distribution run).
    const v = validateRuler(spec, 0.8198);
    expect(v.pass).toBe(true);
  });

  it('prereg checklist PASSES with a clean injected git probe and emits once', () => {
    let emitted = 0;
    const manifest: PreregistrationManifestPayload = {
      manifest_hash: 'c'.repeat(64), manifest_path: 'decisions/x.yaml',
      manifest_locked_at: '2026-06-16T00:00:00Z', dataset_version: 'd'.repeat(64),
      dataset_path: 'data/tau2/retail.jsonl', dataset_instance_count: split.phase_b.length,
      per_cell: ['no-context'], judge_tiebreak: 'quadri-vendor', judge_models: [],
      emitted_at: '2026-06-16T00:00:00Z', runner_version: 'smoke',
      runner_invocation: { argv: ['node', 'runner'], cwd: tmpDir },
    };
    const r = runPreregChecklist({
      manifest, emit: () => { emitted += 1; },
      probeGit: () => ({ clean: true, sha: 'cafef00d' }),
    });
    expect(r.pass).toBe(true);
    expect(r.frozen_sha).toBe('cafef00d');
    expect(emitted).toBe(1);
  });
});

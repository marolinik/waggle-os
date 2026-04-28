/**
 * GEPA Faza 1 — H3 corpus library tests.
 *
 * Coverage targets per manifest v7 §corpus_design + §amendment_2_integration:
 *   - Stratification: exactly 50 unique cells (5 × 5 × 2)
 *   - Deterministic enumeration order (canonical)
 *   - Instance validation per quality floor
 *   - Spot-audit sampler determinism (same seed → same sample)
 *   - Spot-audit halt-on-failure semantics
 */

import { describe, expect, it } from 'vitest';
import {
  TASK_FAMILIES,
  PERSONAS,
  COMPANY_STAGES,
  TOTAL_INSTANCES,
  DOCS_PER_INSTANCE_MIN,
  DOCS_PER_INSTANCE_MAX,
  SPOT_AUDIT_SAMPLE_SIZE,
  STRATIFICATION_SEED,
  TASK_FAMILY_DESCRIPTORS,
  type StratificationCell,
  type CorpusInstance,
  iterateStratificationCells,
  listStratificationCells,
  buildInstanceId,
  validateInstance,
  deterministicSample,
  selectSpotAuditSample,
  runSpotAudit,
  corpusSha256,
} from '../../src/faza-1/corpus.js';

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function makeValidInstance(cell: StratificationCell, ordinal: number = 1): CorpusInstance {
  const docs = Array.from({ length: 7 }, (_, i) => ({
    title: `DOC ${i + 1} — Sample`,
    body: 'x'.repeat(800),
    charCount: 800,
  }));
  return {
    instanceId: buildInstanceId(cell, ordinal),
    cell,
    personaText: 'p'.repeat(200),
    scenario: 's'.repeat(400),
    sourceDocuments: docs,
    question: 'q'.repeat(200),
    materialsConcat: docs.map(d => `## ${d.title}\n\n${d.body}`).join('\n\n---\n\n'),
    manifestAnchor: 'manifest-v7-gepa-faza1',
    generatedBy: 'claude-opus-4-7',
    generatedAtIso: '2026-04-28T00:00:00.000Z',
    generationCostUsd: 0.10,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Constants exposed for auditing
// ───────────────────────────────────────────────────────────────────────────

describe('manifest v7 §corpus_design constants', () => {
  it('TOTAL_INSTANCES = 50', () => {
    expect(TOTAL_INSTANCES).toBe(50);
  });
  it('TASK_FAMILIES has 5 entries', () => {
    expect(TASK_FAMILIES).toHaveLength(5);
  });
  it('PERSONAS has 5 entries', () => {
    expect(PERSONAS).toHaveLength(5);
  });
  it('COMPANY_STAGES has 2 entries', () => {
    expect(COMPANY_STAGES).toHaveLength(2);
  });
  it('5 × 5 × 2 = 50 (stratification yields TOTAL_INSTANCES)', () => {
    expect(TASK_FAMILIES.length * PERSONAS.length * COMPANY_STAGES.length).toBe(TOTAL_INSTANCES);
  });
  it('SPOT_AUDIT_SAMPLE_SIZE = 5 per Amendment 1', () => {
    expect(SPOT_AUDIT_SAMPLE_SIZE).toBe(5);
  });
  it('STRATIFICATION_SEED = 42', () => {
    expect(STRATIFICATION_SEED).toBe(42);
  });
  it('DOCS_PER_INSTANCE bounds', () => {
    expect(DOCS_PER_INSTANCE_MIN).toBe(6);
    expect(DOCS_PER_INSTANCE_MAX).toBe(8);
  });
  it('TASK_FAMILY_DESCRIPTORS covers all 5 families', () => {
    for (const f of TASK_FAMILIES) {
      expect(TASK_FAMILY_DESCRIPTORS[f]).toBeDefined();
      expect(TASK_FAMILY_DESCRIPTORS[f].docsPerInstance).toBeGreaterThanOrEqual(DOCS_PER_INSTANCE_MIN);
      expect(TASK_FAMILY_DESCRIPTORS[f].docsPerInstance).toBeLessThanOrEqual(DOCS_PER_INSTANCE_MAX);
    }
  });
  it('F1-F3 mirror pilot tasks; F4-F5 are net-new', () => {
    expect(TASK_FAMILY_DESCRIPTORS.F1.mirrorPilotTask).toBe('task-1');
    expect(TASK_FAMILY_DESCRIPTORS.F2.mirrorPilotTask).toBe('task-2');
    expect(TASK_FAMILY_DESCRIPTORS.F3.mirrorPilotTask).toBe('task-3');
    expect(TASK_FAMILY_DESCRIPTORS.F4.mirrorPilotTask).toBeNull();
    expect(TASK_FAMILY_DESCRIPTORS.F5.mirrorPilotTask).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Stratification enumeration
// ───────────────────────────────────────────────────────────────────────────

describe('iterateStratificationCells / listStratificationCells', () => {
  it('yields exactly 50 cells (5 × 5 × 2)', () => {
    const cells = listStratificationCells();
    expect(cells).toHaveLength(50);
  });

  it('all 50 cells are unique', () => {
    const cells = listStratificationCells();
    const keys = new Set(cells.map(c => `${c.family}|${c.persona}|${c.stage}`));
    expect(keys.size).toBe(50);
  });

  it('canonical ordering: F1 first, F5 last', () => {
    const cells = listStratificationCells();
    expect(cells[0].family).toBe('F1');
    expect(cells[cells.length - 1].family).toBe('F5');
  });

  it('persona enumeration is the inner loop after family', () => {
    const cells = listStratificationCells();
    // First 10 cells should all be family F1
    for (let i = 0; i < 10; i++) {
      expect(cells[i].family).toBe('F1');
    }
    // Cells 10-19 should all be F2
    for (let i = 10; i < 20; i++) {
      expect(cells[i].family).toBe('F2');
    }
  });

  it('each (family, persona) pair appears exactly twice (once per stage)', () => {
    const cells = listStratificationCells();
    const pairCounts = new Map<string, number>();
    for (const c of cells) {
      const key = `${c.family}|${c.persona}`;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
    expect(pairCounts.size).toBe(25);  // 5 × 5 family-persona pairs
    for (const count of pairCounts.values()) {
      expect(count).toBe(2);  // once per stage
    }
  });

  it('iterator is deterministic (same yield order across calls)', () => {
    const a = listStratificationCells();
    const b = listStratificationCells();
    expect(a).toEqual(b);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// buildInstanceId
// ───────────────────────────────────────────────────────────────────────────

describe('buildInstanceId', () => {
  it('produces stable IDs with h3- prefix + zero-padded ordinal', () => {
    const id = buildInstanceId({ family: 'F1', persona: 'p2_cfo', stage: 'stage_a_series_b_growth_burning' }, 7);
    expect(id).toBe('h3-F1-p2_cfo-stage_a_series_b_growth_burning-007');
  });

  it('default ordinal is 1', () => {
    const id = buildInstanceId({ family: 'F3', persona: 'p4_vp_finance', stage: 'stage_b_post_profitable_consolidation' });
    expect(id).toContain('-001');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// validateInstance
// ───────────────────────────────────────────────────────────────────────────

describe('validateInstance — quality floor', () => {
  it('valid synthetic instance passes', () => {
    const inst = makeValidInstance({ family: 'F1', persona: 'p1_founder_ceo', stage: 'stage_a_series_b_growth_burning' });
    const r = validateInstance(inst);
    expect(r.valid).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it('FAIL: too few docs', () => {
    const inst = makeValidInstance({ family: 'F1', persona: 'p1_founder_ceo', stage: 'stage_a_series_b_growth_burning' });
    inst.sourceDocuments = inst.sourceDocuments.slice(0, 3);
    const r = validateInstance(inst);
    expect(r.valid).toBe(false);
    expect(r.violations[0]).toContain('docs count');
    expect(r.violations[0]).toContain('< 6 min');
  });

  it('FAIL: too many docs', () => {
    const inst = makeValidInstance({ family: 'F1', persona: 'p1_founder_ceo', stage: 'stage_a_series_b_growth_burning' });
    inst.sourceDocuments = [...inst.sourceDocuments, ...inst.sourceDocuments, ...inst.sourceDocuments];
    const r = validateInstance(inst);
    expect(r.valid).toBe(false);
    expect(r.violations[0]).toContain('> 8 max');
  });

  it('FAIL: persona too short', () => {
    const inst = makeValidInstance({ family: 'F1', persona: 'p1_founder_ceo', stage: 'stage_a_series_b_growth_burning' });
    inst.personaText = 'short';
    const r = validateInstance(inst);
    expect(r.valid).toBe(false);
    expect(r.violations.some(v => v.includes('persona length'))).toBe(true);
  });

  it('PASS: rich persona up to 1500 chars (post-probe loosening)', () => {
    const inst = makeValidInstance({ family: 'F1', persona: 'p1_founder_ceo', stage: 'stage_a_series_b_growth_burning' });
    inst.personaText = 'p'.repeat(1400);
    const r = validateInstance(inst);
    expect(r.valid).toBe(true);
  });

  it('FAIL: persona above 1500 cap', () => {
    const inst = makeValidInstance({ family: 'F1', persona: 'p1_founder_ceo', stage: 'stage_a_series_b_growth_burning' });
    inst.personaText = 'p'.repeat(1600);
    const r = validateInstance(inst);
    expect(r.valid).toBe(false);
    expect(r.violations.some(v => v.includes('persona length'))).toBe(true);
  });

  it('PASS: empty scenario (oracle embedded it in personaText)', () => {
    const inst = makeValidInstance({ family: 'F1', persona: 'p1_founder_ceo', stage: 'stage_a_series_b_growth_burning' });
    inst.scenario = '';  // embedded case
    const r = validateInstance(inst);
    expect(r.valid).toBe(true);
  });

  it('FAIL: doc charCount mismatch with body length', () => {
    const inst = makeValidInstance({ family: 'F1', persona: 'p1_founder_ceo', stage: 'stage_a_series_b_growth_burning' });
    inst.sourceDocuments[0].charCount = 999;  // intentional mismatch
    const r = validateInstance(inst);
    expect(r.valid).toBe(false);
    expect(r.violations.some(v => v.includes('charCount'))).toBe(true);
  });

  it('FAIL: instanceId missing h3- prefix', () => {
    const inst = makeValidInstance({ family: 'F1', persona: 'p1_founder_ceo', stage: 'stage_a_series_b_growth_burning' });
    inst.instanceId = 'wrong-prefix-001';
    const r = validateInstance(inst);
    expect(r.valid).toBe(false);
    expect(r.violations.some(v => v.includes('h3- prefix'))).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// deterministicSample / selectSpotAuditSample
// ───────────────────────────────────────────────────────────────────────────

describe('deterministicSample', () => {
  it('returns sample of requested size', () => {
    const items = Array.from({ length: 50 }, (_, i) => `item-${i}`);
    const sample = deterministicSample(items, 5);
    expect(sample).toHaveLength(5);
  });

  it('same seed produces identical sample (reproducibility)', () => {
    const items = Array.from({ length: 50 }, (_, i) => `item-${i}`);
    const a = deterministicSample(items, 5, 42);
    const b = deterministicSample(items, 5, 42);
    expect(a).toEqual(b);
  });

  it('different seeds produce different samples', () => {
    const items = Array.from({ length: 50 }, (_, i) => `item-${i}`);
    const a = deterministicSample(items, 5, 42);
    const c = deterministicSample(items, 5, 100);
    expect(a).not.toEqual(c);
  });

  it('sampleSize >= items.length returns full list copy', () => {
    const items = ['a', 'b', 'c'];
    const sample = deterministicSample(items, 5);
    expect(sample).toHaveLength(3);
    expect(sample).toEqual(items);
    expect(sample).not.toBe(items);  // copy, not reference
  });
});

describe('selectSpotAuditSample', () => {
  it('returns 5 instances by default (manifest v7 spot_audit.sample_size)', () => {
    const cells = listStratificationCells();
    const instances = cells.map(c => makeValidInstance(c));
    const sample = selectSpotAuditSample(instances);
    expect(sample).toHaveLength(5);
  });

  it('reproducible with seed=42 (same instances picked across runs)', () => {
    const cells = listStratificationCells();
    const instances = cells.map(c => makeValidInstance(c));
    const a = selectSpotAuditSample(instances);
    const b = selectSpotAuditSample(instances);
    expect(a.map(i => i.instanceId)).toEqual(b.map(i => i.instanceId));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// runSpotAudit aggregate
// ───────────────────────────────────────────────────────────────────────────

describe('runSpotAudit', () => {
  it('PASS when all sampled instances valid', () => {
    const cells = listStratificationCells();
    const instances = cells.map(c => makeValidInstance(c));
    const report = runSpotAudit(instances);
    expect(report.sampleSize).toBe(5);
    expect(report.haltOnFailure).toBe(false);
    expect(report.haltReason).toBeUndefined();
  });

  it('HALT when any sampled instance invalid (manifest v7 spot_audit.halt_on)', () => {
    const cells = listStratificationCells();
    const instances = cells.map(c => makeValidInstance(c));
    // Corrupt every instance (so sample will definitely include corrupted ones)
    for (const inst of instances) {
      inst.sourceDocuments = inst.sourceDocuments.slice(0, 2);  // below 6 min
    }
    const report = runSpotAudit(instances);
    expect(report.haltOnFailure).toBe(true);
    expect(report.haltReason).toMatch(/spot-audit instances failed validation/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// corpusSha256
// ───────────────────────────────────────────────────────────────────────────

describe('corpusSha256', () => {
  it('produces deterministic SHA across runs', () => {
    const cells = listStratificationCells().slice(0, 5);
    const instances = cells.map(c => makeValidInstance(c));
    const a = corpusSha256(instances);
    const b = corpusSha256(instances);
    expect(a).toBe(b);
  });

  it('different corpora produce different SHAs', () => {
    const cells = listStratificationCells();
    const a = cells.slice(0, 5).map(c => makeValidInstance(c));
    const b = cells.slice(5, 10).map(c => makeValidInstance(c));
    expect(corpusSha256(a)).not.toBe(corpusSha256(b));
  });
});

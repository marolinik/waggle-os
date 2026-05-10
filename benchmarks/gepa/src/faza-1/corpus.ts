/**
 * GEPA Faza 1 — H3 corpus data definitions, stratification, validation,
 * and spot-audit sampler.
 *
 * Per Amendment 1 Ask A Option C + manifest v7 §corpus_design:
 *   - 50 instances total
 *   - 5 task families × 5 personas × 2 company stages = 50 cells
 *   - NorthLane CFO synthesis domain (preserves Phase 4.3 anchor)
 *   - Each instance: ≥6 source documents, 6-dim Likert rubric
 *   - Stratified sampling: deterministic, seed=42
 *   - Generated via Opus 4.7 oracle
 *
 * Pre-A halt-and-PM checkpoint: spot-audit 5 random instances.
 */

import * as crypto from 'node:crypto';

/** 5 task families per manifest v7 §corpus_design.task_families. */
export type TaskFamily = 'F1' | 'F2' | 'F3' | 'F4' | 'F5';

/** 5 persona codes per manifest v7 §corpus_design.persona_axis. */
export type PersonaCode = 'p1_founder_ceo' | 'p2_cfo' | 'p3_coo' | 'p4_vp_finance' | 'p5_independent_director';

/** 2 company stages per manifest v7 §corpus_design.company_stage_axis. */
export type CompanyStage = 'stage_a_series_b_growth_burning' | 'stage_b_post_profitable_consolidation';

/** All 5 task families in canonical order. */
export const TASK_FAMILIES: ReadonlyArray<TaskFamily> = ['F1', 'F2', 'F3', 'F4', 'F5'];

/** All 5 personas in canonical order. */
export const PERSONAS: ReadonlyArray<PersonaCode> = [
  'p1_founder_ceo',
  'p2_cfo',
  'p3_coo',
  'p4_vp_finance',
  'p5_independent_director',
];

/** All 2 company stages in canonical order. */
export const COMPANY_STAGES: ReadonlyArray<CompanyStage> = [
  'stage_a_series_b_growth_burning',
  'stage_b_post_profitable_consolidation',
];

/** Total instances per manifest v7 §corpus_design.total_instances. */
export const TOTAL_INSTANCES = 50;

/** Required source document count floor per manifest v7. */
export const DOCS_PER_INSTANCE_MIN = 6;

/** Required source document count ceiling per manifest v7. */
export const DOCS_PER_INSTANCE_MAX = 8;

/** Spot-audit sample size per manifest v7 §corpus_design.spot_audit. */
export const SPOT_AUDIT_SAMPLE_SIZE = 5;

/** Deterministic stratification seed per manifest v7 §corpus_design.stratified_sampling.seed. */
export const STRATIFICATION_SEED = 42;

/** Per-instance human-readable task family descriptor. */
export const TASK_FAMILY_DESCRIPTORS: Record<TaskFamily, {
  label: string;
  mirrorPilotTask: string | null;
  docsPerInstance: number;
  promptTemplate: string;
}> = {
  F1: {
    label: 'strategic_synthesis',
    mirrorPilotTask: 'task-1',
    docsPerInstance: 7,
    promptTemplate: 'Identify the 3 most critical risks for {company} in {period} and propose action plan for each.',
  },
  F2: {
    label: 'cross_thread_coordination',
    mirrorPilotTask: 'task-2',
    docsPerInstance: 6,
    promptTemplate: 'Reconcile conflicting positions from {stakeholders} and propose unified approach.',
  },
  F3: {
    label: 'decision_support',
    mirrorPilotTask: 'task-3',
    docsPerInstance: 6,
    promptTemplate: 'Recommend {decision} based on materials; justify, address counter-arguments.',
  },
  F4: {
    label: 'investor_communications',
    mirrorPilotTask: null,  // NEW family
    docsPerInstance: 6,
    promptTemplate: 'Draft Q{n} investor update covering {metrics} + addressing {concerns}.',
  },
  F5: {
    label: 'scenario_planning',
    mirrorPilotTask: null,  // NEW family
    docsPerInstance: 7,
    promptTemplate: 'Compare {n} scenarios for {decision_area}; recommend hedging strategy.',
  },
};

/** Stratification cell — one of 50 unique combinations. */
export interface StratificationCell {
  family: TaskFamily;
  persona: PersonaCode;
  stage: CompanyStage;
}

/** A single source document inside a corpus instance. */
export interface SourceDoc {
  title: string;
  body: string;
  charCount: number;
}

/** A single corpus instance ready for evaluation by NULL-baseline / GEPA candidates. */
export interface CorpusInstance {
  /** Stable instance ID: h3-{family}-{persona}-{stage}-{ordinal}. */
  instanceId: string;
  cell: StratificationCell;
  personaText: string;
  scenario: string;
  sourceDocuments: SourceDoc[];
  question: string;
  /** Aggregated materials block (joined source docs) — consumer convenience. */
  materialsConcat: string;
  manifestAnchor: string;
  generatedBy: string;
  generatedAtIso: string;
  generationCostUsd: number;
}

// ───────────────────────────────────────────────────────────────────────────
// Stratification — deterministic enumeration of 50 cells
// ───────────────────────────────────────────────────────────────────────────

/**
 * Enumerate all 50 stratification cells in canonical (family-major, persona-mid,
 * stage-minor) order. Deterministic given the constant arrays above.
 *
 * Yield order: F1×p1×stage_a, F1×p1×stage_b, F1×p2×stage_a, ..., F5×p5×stage_b.
 */
export function* iterateStratificationCells(): Generator<StratificationCell> {
  for (const family of TASK_FAMILIES) {
    for (const persona of PERSONAS) {
      for (const stage of COMPANY_STAGES) {
        yield { family, persona, stage };
      }
    }
  }
}

/** Materialize all 50 cells as an array. */
export function listStratificationCells(): StratificationCell[] {
  return Array.from(iterateStratificationCells());
}

/** Build a stable instance ID from a cell + ordinal (1-based within cell). */
export function buildInstanceId(cell: StratificationCell, ordinal: number = 1): string {
  return `h3-${cell.family}-${cell.persona}-${cell.stage}-${String(ordinal).padStart(3, '0')}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Validation — check instance shape against manifest v7 quality floor
// ───────────────────────────────────────────────────────────────────────────

export interface InstanceValidationResult {
  valid: boolean;
  violations: string[];
}

/** Per manifest v7 §corpus_design.per_instance_quality_floor + spot_audit dimensions. */
export function validateInstance(instance: CorpusInstance): InstanceValidationResult {
  const violations: string[] = [];

  if (instance.sourceDocuments.length < DOCS_PER_INSTANCE_MIN) {
    violations.push(`docs count ${instance.sourceDocuments.length} < ${DOCS_PER_INSTANCE_MIN} min`);
  }
  if (instance.sourceDocuments.length > DOCS_PER_INSTANCE_MAX) {
    violations.push(`docs count ${instance.sourceDocuments.length} > ${DOCS_PER_INSTANCE_MAX} max`);
  }

  // Length bounds loosened post-probe (2026-04-28) — Opus generates naturally
  // richer personas/scenarios than the hand-crafted pilot baseline. The intent
  // of these bounds is to catch broken/empty output, not to police verbosity.
  const personaLen = instance.personaText.length;
  if (personaLen < 100 || personaLen > 1500) {
    violations.push(`persona length ${personaLen} outside [100, 1500] range`);
  }

  // Scenario may be empty if oracle embedded it in personaText (handled by
  // assembleInstance — extractScenarioFromPersonaText). Skip length floor in
  // that case but still cap upper bound.
  const scenarioLen = instance.scenario.length;
  if (scenarioLen > 0 && (scenarioLen < 100 || scenarioLen > 1500)) {
    violations.push(`scenario length ${scenarioLen} outside [100, 1500] range (or 0 if embedded in personaText)`);
  }

  const questionLen = instance.question.length;
  if (questionLen < 100 || questionLen > 800) {
    violations.push(`question length ${questionLen} outside [100, 800] range`);
  }

  for (const doc of instance.sourceDocuments) {
    if (doc.body.length < 400 || doc.body.length > 3000) {
      violations.push(`doc "${doc.title}" body length ${doc.body.length} outside [400, 3000] range`);
    }
    if (doc.body.length !== doc.charCount) {
      violations.push(`doc "${doc.title}" charCount ${doc.charCount} != actual body length ${doc.body.length}`);
    }
  }

  if (!instance.instanceId.startsWith('h3-')) {
    violations.push(`instanceId "${instance.instanceId}" missing h3- prefix`);
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Spot-audit sampler — deterministic random selection of N instances
// ───────────────────────────────────────────────────────────────────────────

/**
 * Mulberry32 PRNG — deterministic, fast, 32-bit. Same seed produces same
 * output across runs and platforms.
 */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher-Yates shuffle producing a sample of `sampleSize` from
 * the input array, seeded by `seed`. Reproducible across runs.
 */
export function deterministicSample<T>(
  items: ReadonlyArray<T>,
  sampleSize: number,
  seed: number = STRATIFICATION_SEED,
): T[] {
  if (sampleSize >= items.length) {
    return [...items];
  }
  const arr = [...items];
  const rand = mulberry32(seed);
  // Partial Fisher-Yates: only need first `sampleSize` swapped to front.
  for (let i = 0; i < sampleSize; i++) {
    const j = i + Math.floor(rand() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, sampleSize);
}

/** Select 5 random instances per manifest v7 §corpus_design.spot_audit. */
export function selectSpotAuditSample(instances: ReadonlyArray<CorpusInstance>): CorpusInstance[] {
  return deterministicSample(instances, SPOT_AUDIT_SAMPLE_SIZE);
}

// ───────────────────────────────────────────────────────────────────────────
// Aggregate spot-audit verdict
// ───────────────────────────────────────────────────────────────────────────

export interface SpotAuditReport {
  sampleSize: number;
  perInstance: Array<{ instanceId: string; result: InstanceValidationResult }>;
  /** Per manifest v7 §corpus_design.spot_audit.halt_on: any 1 of 5 fails → corpus regeneration. */
  haltOnFailure: boolean;
  haltReason?: string;
}

/** Run validation across spot-audit sample + return aggregate verdict. */
export function runSpotAudit(instances: ReadonlyArray<CorpusInstance>): SpotAuditReport {
  const sample = selectSpotAuditSample(instances);
  const perInstance = sample.map(inst => ({
    instanceId: inst.instanceId,
    result: validateInstance(inst),
  }));
  const failed = perInstance.filter(p => !p.result.valid);
  return {
    sampleSize: sample.length,
    perInstance,
    haltOnFailure: failed.length > 0,
    haltReason: failed.length > 0
      ? `${failed.length}/${sample.length} spot-audit instances failed validation: ${failed.map(f => f.instanceId).join(', ')}`
      : undefined,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Audit-chain helpers
// ───────────────────────────────────────────────────────────────────────────

/** Compute SHA-256 of a JSON-serialized corpus (for manifest v7 audit pinning). */
export function corpusSha256(instances: ReadonlyArray<CorpusInstance>): string {
  const canonical = instances.map(inst => ({
    instanceId: inst.instanceId,
    cell: inst.cell,
    materialsLength: inst.materialsConcat.length,
    questionLength: inst.question.length,
    docCount: inst.sourceDocuments.length,
  }));
  const json = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(json).digest('hex');
}

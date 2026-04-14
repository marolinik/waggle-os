/**
 * EvolveSchema — Phase 3.1 of the self-evolution loop.
 *
 * Port of Mikhail Pavlukhin's EvolveSchema algorithm (Egzakta research).
 * Evolves the STRUCTURE of a typed output schema (DSPy-style signatures):
 * field names, types, descriptions, ordering, and constraints. This is
 * orthogonal to the GEPA optimizer which evolves INSTRUCTIONS against a
 * fixed schema.
 *
 * Three-phase per-generation loop:
 *
 *   Phase A — Structure Discovery
 *     Spawn variants that add, replace, or drop output fields. This is
 *     the single biggest-impact mutation class (Mikhail's paper shows
 *     ~74% of HotPotQA gains come from one structural mutation).
 *
 *   Phase B — Field-Order Probes
 *     Permute field order. LLMs condition on earlier fields when filling
 *     later ones, so putting a "reasoning" field BEFORE "answer" routinely
 *     outperforms the reverse.
 *
 *   Phase C — Failure-Driven Refinement
 *     Use the per-example judge feedback from the previous generation to
 *     target specific fields — edit their descriptions, tighten / loosen
 *     their constraints, or change their types where signals suggest.
 *
 * 8 typed mutations are available:
 *   add_output_field, remove_field, edit_field_desc, change_field_type,
 *   add_constraint, remove_constraint, reorder_fields, replace_output_fields
 *
 * Pareto selection is 2-dimensional: (accuracy, -complexity) — an
 * accurate-but-complex schema is not automatically preferred over a
 * slightly-less-accurate simpler one.
 *
 * Callers provide:
 *   - `execute(schema, input) → actualOutput`      the LLM runner
 *   - `judge.score({input, expected, actual})`    the LLMJudge from Phase 1.3
 *   - `mutate` (optional)                         a custom LLM-driven mutator
 *                                                 for edit_field_desc; falls
 *                                                 back to a deterministic
 *                                                 rewriter when omitted.
 */

import type { EvalExample } from './eval-dataset.js';
import type { LLMJudge, JudgeScore } from './judge.js';

// ── Schema types ───────────────────────────────────────────────

export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'enum';

export interface FieldConstraint {
  kind: 'minLength' | 'maxLength' | 'pattern' | 'enum' | 'range' | 'custom';
  value: string | number | string[];
}

export interface SchemaField {
  name: string;
  type: FieldType;
  description: string;
  required: boolean;
  constraints: FieldConstraint[];
}

export interface Schema {
  name: string;
  fields: SchemaField[];
  version: number;
}

// ── Mutation types ─────────────────────────────────────────────

export type MutationKind =
  | 'add_output_field'
  | 'remove_field'
  | 'edit_field_desc'
  | 'change_field_type'
  | 'add_constraint'
  | 'remove_constraint'
  | 'reorder_fields'
  | 'replace_output_fields';

export interface Mutation {
  kind: MutationKind;
  /** What changed, for logging + feedback */
  description: string;
  /** Functional transformer (pure) */
  apply: (schema: Schema) => Schema;
}

// ── Candidate + result types ──────────────────────────────────

export interface SchemaCandidate {
  id: string;
  schema: Schema;
  generation: number;
  parent: string | null;
  mutation: MutationKind | 'baseline';
  mutationLabel: string;
  score: SchemaCandidateScore | null;
  perExample: SchemaExampleResult[];
}

export interface SchemaExampleResult {
  input: string;
  expected: string;
  actual: string;
  score: JudgeScore;
  /** Diagnostic: did the output parse against the schema? */
  parsed: boolean;
}

export interface SchemaCandidateScore {
  /** Mean overall judge score across the eval set (0..1) */
  accuracy: number;
  /** Schema "complexity" — a scalar that grows with fields, descriptions, constraints */
  complexity: number;
  /** Share of examples that produced parseable output against this schema (0..1) */
  parseRate: number;
  /** Weakness feedback taken from the worst-scoring 3 examples */
  weaknessFeedback: string[];
  /** Number of examples scored */
  n: number;
}

export type SchemaExecuteFn = (args: {
  schema: Schema;
  input: string;
}) => Promise<{ actual: string; parsed: boolean }>;

export interface EvolveSchemaOptions {
  /** Starting schema */
  baseline: Schema;
  /** Eval dataset */
  examples: EvalExample[];
  /** LLM runner that takes a schema + input and returns an attempted output */
  execute: SchemaExecuteFn;
  /** Judge for scoring individual attempts */
  judge: Pick<LLMJudge, 'score'>;
  /** Candidates per generation (default 5) */
  populationSize?: number;
  /** Generations (default 3) */
  generations?: number;
  /** Mix of phase mutations per generation */
  mutationMix?: { structure: number; order: number; refinement: number };
  /** Eval sample size per generation (default 32) */
  evalSize?: number;
  /** Anchor eval size at the end (default 100) */
  anchorEvalSize?: number;
  /** Seed for sampling (default 1) */
  seed?: number;
  /** Optional LLM helper for description edits — deterministic fallback used if omitted */
  editFieldDescription?: (args: {
    field: SchemaField;
    feedback: string[];
  }) => Promise<string>;
  /** Optional progress emitter */
  onProgress?: (event: EvolveSchemaProgress) => void;
  /** Optional abort signal */
  signal?: AbortSignal;
}

export interface EvolveSchemaProgress {
  phase: 'start' | 'structure' | 'order' | 'refinement' | 'anchor' | 'done';
  generation: number;
  populationSize: number;
  bestAccuracy: number;
  bestComplexity: number;
  message?: string;
}

export interface EvolveSchemaResult {
  winner: SchemaCandidate;
  /** Full Pareto-non-dominated set from the anchor stage */
  paretoFront: SchemaCandidate[];
  /** All candidates across all generations */
  history: SchemaCandidate[];
  /** Accuracy delta: winner.accuracy - baseline.accuracy */
  deltaAccuracy: number;
  /** True if the winner's accuracy improved over baseline */
  improved: boolean;
}

// ── Pure mutation functions ───────────────────────────────────

export function addOutputField(
  schema: Schema,
  field: SchemaField,
  position?: number,
): Schema {
  const pos = position ?? schema.fields.length;
  const fields = [...schema.fields];
  fields.splice(pos, 0, { ...field, constraints: [...field.constraints] });
  return { ...schema, fields, version: schema.version + 1 };
}

export function removeField(schema: Schema, fieldName: string): Schema {
  return {
    ...schema,
    fields: schema.fields.filter(f => f.name !== fieldName),
    version: schema.version + 1,
  };
}

export function editFieldDescription(
  schema: Schema,
  fieldName: string,
  newDescription: string,
): Schema {
  return {
    ...schema,
    fields: schema.fields.map(f =>
      f.name === fieldName ? { ...f, description: newDescription } : f,
    ),
    version: schema.version + 1,
  };
}

export function changeFieldType(
  schema: Schema,
  fieldName: string,
  newType: FieldType,
): Schema {
  return {
    ...schema,
    fields: schema.fields.map(f =>
      f.name === fieldName ? { ...f, type: newType } : f,
    ),
    version: schema.version + 1,
  };
}

export function addConstraint(
  schema: Schema,
  fieldName: string,
  constraint: FieldConstraint,
): Schema {
  return {
    ...schema,
    fields: schema.fields.map(f =>
      f.name === fieldName ? { ...f, constraints: [...f.constraints, constraint] } : f,
    ),
    version: schema.version + 1,
  };
}

export function removeConstraint(
  schema: Schema,
  fieldName: string,
  constraintIndex: number,
): Schema {
  return {
    ...schema,
    fields: schema.fields.map(f => {
      if (f.name !== fieldName) return f;
      const constraints = f.constraints.filter((_, i) => i !== constraintIndex);
      return { ...f, constraints };
    }),
    version: schema.version + 1,
  };
}

export function reorderFields(schema: Schema, newOrder: string[]): Schema {
  const byName = new Map(schema.fields.map(f => [f.name, f]));
  const reordered: SchemaField[] = [];
  for (const name of newOrder) {
    const field = byName.get(name);
    if (field) reordered.push(field);
  }
  // Append any fields that were omitted from newOrder (keeps their position stable).
  for (const field of schema.fields) {
    if (!newOrder.includes(field.name)) reordered.push(field);
  }
  return { ...schema, fields: reordered, version: schema.version + 1 };
}

export function replaceOutputFields(schema: Schema, newFields: SchemaField[]): Schema {
  return {
    ...schema,
    fields: newFields.map(f => ({ ...f, constraints: [...f.constraints] })),
    version: schema.version + 1,
  };
}

// ── Complexity + scoring helpers ───────────────────────────────

/**
 * Scalar complexity measure: 1 per field + 0.3 per constraint +
 * 0.01 per character of description. Calibrated so a 3-field schema
 * with short descriptions ≈ 3.6, a 10-field schema with long
 * descriptions ≈ 15+.
 */
export function schemaComplexity(schema: Schema): number {
  let c = 0;
  for (const field of schema.fields) {
    c += 1;
    c += field.constraints.length * 0.3;
    c += (field.description?.length ?? 0) * 0.01;
  }
  return c;
}

export function aggregateSchemaScores(results: SchemaExampleResult[]): SchemaCandidateScore {
  if (results.length === 0) {
    return {
      accuracy: 0, complexity: 0, parseRate: 0, weaknessFeedback: [], n: 0,
    };
  }
  const n = results.length;
  const accuracy = results.reduce((s, r) => s + r.score.overall, 0) / n;
  const parseRate = results.filter(r => r.parsed).length / n;
  const worst = [...results].sort((a, b) => a.score.overall - b.score.overall).slice(0, 3);
  const weaknessFeedback = worst
    .map(r => r.score.feedback)
    .filter(fb => fb && fb.length > 0);
  return { accuracy, complexity: 0, parseRate, weaknessFeedback, n };
}

// ── Pareto (2D) ───────────────────────────────────────────────

/**
 * Pareto front on (accuracy↑, complexity↓). A candidate dominates
 * another iff it is at least as accurate AND no more complex, and
 * strictly better on at least one dimension.
 */
export function paretoFrontSchema(candidates: SchemaCandidate[]): SchemaCandidate[] {
  const scored = candidates.filter(c => c.score !== null);
  const front: SchemaCandidate[] = [];
  for (const cand of scored) {
    let dominated = false;
    for (const other of scored) {
      if (other === cand) continue;
      if (dominatesSchema(other.score!, cand.score!)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) front.push(cand);
  }
  return front.length > 0 ? front : scored;
}

function dominatesSchema(a: SchemaCandidateScore, b: SchemaCandidateScore): boolean {
  const geAll = a.accuracy >= b.accuracy && a.complexity <= b.complexity;
  const gtAny = a.accuracy > b.accuracy || a.complexity < b.complexity;
  return geAll && gtAny;
}

// ── Candidate scoring ─────────────────────────────────────────

export async function scoreSchemaCandidate(
  candidate: SchemaCandidate,
  examples: EvalExample[],
  execute: SchemaExecuteFn,
  judge: Pick<LLMJudge, 'score'>,
  signal?: AbortSignal,
): Promise<SchemaCandidateScore> {
  const results: SchemaExampleResult[] = [];
  for (const ex of examples) {
    if (signal?.aborted) break;
    try {
      const { actual, parsed } = await execute({ schema: candidate.schema, input: ex.input });
      const score = await judge.score({
        input: ex.input,
        expected: ex.expected_output,
        actual,
      });
      results.push({ input: ex.input, expected: ex.expected_output, actual, score, parsed });
    } catch {
      // Keep iterating — one broken example shouldn't poison the whole batch.
    }
  }
  const agg = aggregateSchemaScores(results);
  agg.complexity = schemaComplexity(candidate.schema);
  candidate.perExample = results;
  candidate.score = agg;
  return agg;
}

// ── Mutation generators per phase ─────────────────────────────

/**
 * Structure-Discovery mutations: add a new field, replace fields wholesale,
 * or drop one if the schema is too large. Returns up to `n` mutations.
 */
export function generateStructureMutations(
  parent: Schema,
  n: number,
  rng: () => number,
): Mutation[] {
  const out: Mutation[] = [];

  // Add a reasoning field if absent.
  if (!parent.fields.some(f => /reason|thought|scratch/i.test(f.name))) {
    out.push({
      kind: 'add_output_field',
      description: 'add reasoning field before answer',
      apply: (s) =>
        addOutputField(s, {
          name: 'reasoning',
          type: 'string',
          description: 'Concise chain-of-thought explaining how the answer was derived.',
          required: true,
          constraints: [],
        }, 0),
    });
  }

  // Add a confidence field if absent.
  if (!parent.fields.some(f => /confidence|certainty|score/i.test(f.name))) {
    out.push({
      kind: 'add_output_field',
      description: 'add confidence field at end',
      apply: (s) =>
        addOutputField(s, {
          name: 'confidence',
          type: 'number',
          description: 'Self-estimated confidence in the answer (0.0 - 1.0).',
          required: false,
          constraints: [{ kind: 'range', value: '0..1' }],
        }),
    });
  }

  // Drop the lowest-priority field if > 4 fields.
  if (parent.fields.length > 4) {
    const candidate = parent.fields[parent.fields.length - 1];
    out.push({
      kind: 'remove_field',
      description: `drop trailing field "${candidate.name}"`,
      apply: (s) => removeField(s, candidate.name),
    });
  }

  // Replace all output fields with a minimal skeleton (reasoning + answer).
  if (parent.fields.length >= 2) {
    out.push({
      kind: 'replace_output_fields',
      description: 'collapse to {reasoning, answer}',
      apply: (s) =>
        replaceOutputFields(s, [
          {
            name: 'reasoning',
            type: 'string',
            description: 'Brief chain-of-thought.',
            required: true,
            constraints: [],
          },
          {
            name: 'answer',
            type: 'string',
            description: 'Final answer.',
            required: true,
            constraints: [],
          },
        ]),
    });
  }

  return pickN(out, n, rng);
}

/**
 * Order-Probe mutations: generate permutations of field order. Limits
 * output to `n` by random sampling from the set of useful permutations.
 */
export function generateOrderMutations(
  parent: Schema,
  n: number,
  rng: () => number,
): Mutation[] {
  const names = parent.fields.map(f => f.name);
  if (names.length < 2) return [];
  const out: Mutation[] = [];

  // Heuristic 1: move any reasoning/thought field to the front.
  const reasoningIdx = parent.fields.findIndex(f => /reason|thought|scratch/i.test(f.name));
  if (reasoningIdx > 0) {
    const newOrder = [names[reasoningIdx], ...names.filter((_, i) => i !== reasoningIdx)];
    out.push({
      kind: 'reorder_fields',
      description: `move "${names[reasoningIdx]}" to front`,
      apply: (s) => reorderFields(s, newOrder),
    });
  }

  // Heuristic 2: move any confidence/score field to the end.
  const confIdx = parent.fields.findIndex(f => /confidence|certainty/i.test(f.name));
  if (confIdx >= 0 && confIdx !== parent.fields.length - 1) {
    const newOrder = [...names.filter((_, i) => i !== confIdx), names[confIdx]];
    out.push({
      kind: 'reorder_fields',
      description: `move "${names[confIdx]}" to end`,
      apply: (s) => reorderFields(s, newOrder),
    });
  }

  // Fill remaining with random permutations.
  while (out.length < n) {
    const shuffled = shuffle([...names], rng);
    if (!arraysEqual(shuffled, names)) {
      out.push({
        kind: 'reorder_fields',
        description: `reorder to [${shuffled.join(', ')}]`,
        apply: (s) => reorderFields(s, shuffled),
      });
    }
    if (out.length > n * 3) break; // safety — very short schemas
  }

  return pickN(out, n, rng);
}

/**
 * Refinement mutations driven by worst-scoring example feedback.
 * Edits descriptions, tightens constraints, or switches types based on
 * heuristic patterns in the feedback.
 */
export async function generateRefinementMutations(
  parent: Schema,
  weakness: string[],
  n: number,
  editFieldDescription?: (args: {
    field: SchemaField;
    feedback: string[];
  }) => Promise<string>,
): Promise<Mutation[]> {
  const out: Mutation[] = [];
  const joined = weakness.join(' ').toLowerCase();

  // Heuristic: if feedback mentions "too verbose" / "long" — add a maxLength to any string field.
  if (/verbose|too long|wordy/i.test(joined)) {
    const stringFields = parent.fields.filter(f => f.type === 'string');
    for (const f of stringFields.slice(0, 2)) {
      out.push({
        kind: 'add_constraint',
        description: `tighten "${f.name}" with maxLength: 200`,
        apply: (s) => addConstraint(s, f.name, { kind: 'maxLength', value: 200 }),
      });
    }
  }

  // Heuristic: if feedback mentions "too brief" / "incomplete" — add minLength.
  if (/brief|incomplete|missing|short/i.test(joined)) {
    const stringFields = parent.fields.filter(f => f.type === 'string');
    for (const f of stringFields.slice(0, 2)) {
      out.push({
        kind: 'add_constraint',
        description: `require "${f.name}" minLength: 20`,
        apply: (s) => addConstraint(s, f.name, { kind: 'minLength', value: 20 }),
      });
    }
  }

  // Heuristic: if feedback mentions "wrong format" / "parse" — clarify description.
  if (/format|parse|wrong type/i.test(joined)) {
    for (const field of parent.fields.slice(0, 2)) {
      const newDesc = editFieldDescription
        ? await editFieldDescription({ field, feedback: weakness }).catch(() => field.description)
        : deterministicClarifyDescription(field);
      if (newDesc && newDesc !== field.description) {
        out.push({
          kind: 'edit_field_desc',
          description: `clarify "${field.name}" description`,
          apply: (s) => editFieldDescription_pure(s, field.name, newDesc),
        });
      }
    }
  }

  // Fallback: always consider one description rewrite on the first field.
  if (out.length === 0 && parent.fields.length > 0) {
    const field = parent.fields[0];
    const newDesc = deterministicClarifyDescription(field);
    if (newDesc !== field.description) {
      out.push({
        kind: 'edit_field_desc',
        description: `clarify "${field.name}" description`,
        apply: (s) => editFieldDescription_pure(s, field.name, newDesc),
      });
    }
  }

  return out.slice(0, n);
}

// ── EvolveSchema engine ──────────────────────────────────────

export class EvolveSchema {
  async run(options: EvolveSchemaOptions): Promise<EvolveSchemaResult> {
    const config = normalizeOptions(options);
    const rng = makeRng(config.seed);

    const baseline: SchemaCandidate = {
      id: 'g0-baseline',
      schema: cloneSchema(config.baseline),
      generation: 0,
      parent: null,
      mutation: 'baseline',
      mutationLabel: 'baseline',
      score: null,
      perExample: [],
    };

    emitProgress(config, 'start', 0, 1, 0, 0, 'scoring baseline');
    const evalSample = pickSample(config.examples, config.evalSize, rng);
    await scoreSchemaCandidate(baseline, evalSample, config.execute, config.judge, config.signal);

    const history: SchemaCandidate[] = [baseline];
    let survivors: SchemaCandidate[] = [baseline];

    for (let gen = 1; gen <= config.generations; gen++) {
      if (config.signal?.aborted) break;
      const topParent = pickTopByAccuracy(survivors);
      if (!topParent) break;

      const children: SchemaCandidate[] = [];

      // Phase A — Structure Discovery
      emitProgress(
        config, 'structure', gen, survivors.length,
        topParent.score?.accuracy ?? 0, topParent.score?.complexity ?? 0,
      );
      const structureMutations = generateStructureMutations(
        topParent.schema, config.mutationMix.structure, rng,
      );
      children.push(...applyMutations(structureMutations, topParent, gen));

      // Phase B — Field-Order Probes
      emitProgress(
        config, 'order', gen, survivors.length,
        topParent.score?.accuracy ?? 0, topParent.score?.complexity ?? 0,
      );
      const orderMutations = generateOrderMutations(
        topParent.schema, config.mutationMix.order, rng,
      );
      children.push(...applyMutations(orderMutations, topParent, gen));

      // Phase C — Failure-Driven Refinement
      emitProgress(
        config, 'refinement', gen, survivors.length,
        topParent.score?.accuracy ?? 0, topParent.score?.complexity ?? 0,
      );
      const refinementMutations = await generateRefinementMutations(
        topParent.schema,
        topParent.score?.weaknessFeedback ?? [],
        config.mutationMix.refinement,
        config.editFieldDescription,
      );
      children.push(...applyMutations(refinementMutations, topParent, gen));

      // Score all children on the per-generation sample.
      const genSample = pickSample(config.examples, config.evalSize, rng);
      for (const child of children) {
        if (config.signal?.aborted) break;
        await scoreSchemaCandidate(child, genSample, config.execute, config.judge, config.signal);
        history.push(child);
      }

      // Pareto-select survivors: parent + children.
      survivors = paretoFrontSchema([topParent, ...children]);
      if (survivors.length > config.populationSize) {
        // Trim by picking the best-accuracy members.
        survivors = survivors
          .slice()
          .sort((a, b) => (b.score?.accuracy ?? 0) - (a.score?.accuracy ?? 0))
          .slice(0, config.populationSize);
      }
    }

    // Anchor stage: larger eval on final survivors.
    emitProgress(
      config, 'anchor', config.generations, survivors.length,
      bestAccuracy(survivors), minComplexity(survivors),
    );
    const anchorSample = pickSample(config.examples, config.anchorEvalSize, rng);
    for (const cand of survivors) {
      if (config.signal?.aborted) break;
      await scoreSchemaCandidate(cand, anchorSample, config.execute, config.judge, config.signal);
    }

    const paretoFront = paretoFrontSchema(survivors);
    const winner = pickSchemaWinner(paretoFront);
    const deltaAccuracy = (winner.score?.accuracy ?? 0) - (baseline.score?.accuracy ?? 0);

    emitProgress(
      config, 'done', config.generations, paretoFront.length,
      winner.score?.accuracy ?? 0, winner.score?.complexity ?? 0,
    );

    return {
      winner,
      paretoFront,
      history,
      deltaAccuracy,
      improved: deltaAccuracy > 0,
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────

function applyMutations(
  mutations: Mutation[],
  parent: SchemaCandidate,
  generation: number,
): SchemaCandidate[] {
  return mutations.map((m, i) => ({
    id: `g${generation}-${m.kind}-${i}`,
    schema: m.apply(parent.schema),
    generation,
    parent: parent.id,
    mutation: m.kind,
    mutationLabel: m.description,
    score: null,
    perExample: [],
  }));
}

function pickTopByAccuracy(candidates: SchemaCandidate[]): SchemaCandidate | undefined {
  if (candidates.length === 0) return undefined;
  return candidates.reduce((a, b) =>
    (a.score?.accuracy ?? 0) >= (b.score?.accuracy ?? 0) ? a : b,
  );
}

export function pickSchemaWinner(candidates: SchemaCandidate[]): SchemaCandidate {
  if (candidates.length === 0) {
    throw new Error('pickSchemaWinner called on empty candidate list');
  }
  return candidates.reduce((best, cand) => {
    const bA = best.score?.accuracy ?? -1;
    const cA = cand.score?.accuracy ?? -1;
    if (cA > bA) return cand;
    if (cA < bA) return best;
    // Tie on accuracy → prefer lower complexity.
    const bC = best.score?.complexity ?? Infinity;
    const cC = cand.score?.complexity ?? Infinity;
    return cC < bC ? cand : best;
  });
}

function bestAccuracy(cs: SchemaCandidate[]): number {
  if (cs.length === 0) return 0;
  return Math.max(...cs.map(c => c.score?.accuracy ?? 0));
}

function minComplexity(cs: SchemaCandidate[]): number {
  const scored = cs.filter(c => c.score !== null);
  if (scored.length === 0) return 0;
  return Math.min(...scored.map(c => c.score!.complexity));
}

function cloneSchema(s: Schema): Schema {
  return {
    ...s,
    fields: s.fields.map(f => ({ ...f, constraints: [...f.constraints] })),
  };
}

function deterministicClarifyDescription(field: SchemaField): string {
  const base = field.description.trim();
  if (!base) return `Return the value for "${field.name}" as ${field.type}.`;
  if (/\b(must|should|return)\b/i.test(base)) return base;
  return `${base} Must be a ${field.type}.`;
}

// Disambiguation re-export — the generator calls this internally so mutations
// can reference it without colliding with the public `editFieldDescription`
// option callback in `EvolveSchemaOptions`.
const editFieldDescription_pure = editFieldDescription;

function pickN<T>(arr: T[], n: number, rng: () => number): T[] {
  if (arr.length <= n) return arr.slice();
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function pickSample(examples: EvalExample[], k: number, rng: () => number): EvalExample[] {
  if (k <= 0 || examples.length === 0) return [];
  const copy = [...examples];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(k, copy.length));
}

function emitProgress(
  config: { onProgress?: (e: EvolveSchemaProgress) => void },
  phase: EvolveSchemaProgress['phase'],
  generation: number,
  populationSize: number,
  bestAcc: number,
  bestCmp: number,
  message?: string,
): void {
  if (config.onProgress) {
    config.onProgress({
      phase, generation, populationSize,
      bestAccuracy: bestAcc,
      bestComplexity: bestCmp,
      message,
    });
  }
}

function normalizeOptions(opts: EvolveSchemaOptions) {
  return {
    baseline: opts.baseline,
    examples: opts.examples,
    execute: opts.execute,
    judge: opts.judge,
    populationSize: opts.populationSize ?? 5,
    generations: opts.generations ?? 3,
    mutationMix: opts.mutationMix ?? { structure: 3, order: 1, refinement: 1 },
    evalSize: opts.evalSize ?? 32,
    anchorEvalSize: opts.anchorEvalSize ?? 100,
    seed: opts.seed ?? 1,
    editFieldDescription: opts.editFieldDescription,
    onProgress: opts.onProgress,
    signal: opts.signal,
  };
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

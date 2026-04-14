/**
 * Compose Evolution — Phase 3.2 of the self-evolution loop.
 *
 * Two-stage pipeline:
 *
 *   Stage 1 — EvolveSchema
 *     Evolve the output STRUCTURE (fields, order, types, constraints).
 *     Returns a winner schema.
 *
 *   Stage 2 — IterativeGEPA
 *     Freeze the winner schema. Evolve the INSTRUCTION prompt that fills
 *     that schema. Only instruction text changes here.
 *
 * Critical design detail (from Mikhail Pavlukhin's paper): **feedback
 * separation**. If the judge complains "missing reasoning field" during
 * Stage 2, and we let GEPA see that feedback, GEPA will mutate the
 * instruction to try to remove reasoning — undoing the schema Stage 1
 * just evolved. So Stage 2 receives a *filtered* judge that strips
 * structural complaints and keeps only value-level signals (correctness,
 * conciseness, format-of-values, tone).
 *
 * The composition is stateless: callers provide the baseline schema and
 * instruction separately; the result returns both winners + aggregate
 * accuracy improvement.
 */

import {
  EvolveSchema,
  type EvolveSchemaOptions,
  type EvolveSchemaResult,
  type Schema,
  type SchemaExecuteFn,
} from './evolve-schema.js';
import {
  IterativeGEPA,
  type IterativeGEPAOptions,
  type GEPARunResult,
} from './iterative-optimizer.js';
import type { LLMJudge, JudgeScore } from './judge.js';
import type { EvalExample } from './eval-dataset.js';

// ── Types ───────────────────────────────────────────────────────

export interface ComposeEvolutionOptions {
  /** EvolveSchema stage configuration */
  schema: Omit<EvolveSchemaOptions, 'onProgress' | 'signal'>;
  /** IterativeGEPA stage configuration */
  instructions: Omit<IterativeGEPAOptions, 'onProgress' | 'signal'>;
  /**
   * Classifier — returns 'structural' to drop a feedback line from GEPA,
   * or 'value' to keep it. Default: `defaultFeedbackFilter`.
   */
  feedbackFilter?: FeedbackFilter;
  /** Optional progress reporter across both stages */
  onProgress?: (event: ComposeProgress) => void;
  /** Optional abort signal (passed through to both stages) */
  signal?: AbortSignal;
}

export interface ComposeEvolutionResult {
  schema: EvolveSchemaResult;
  instructions: GEPARunResult;
  /**
   * Accuracy delta after both stages compared to the raw baseline schema +
   * baseline instructions. Positive = improvement.
   */
  combinedDelta: number;
  /** True if both stages improved over their individual baselines. */
  fullyImproved: boolean;
  /** Frozen schema used as input to the GEPA stage — convenience pointer. */
  frozenSchema: Schema;
}

export interface ComposeProgress {
  stage: 'schema' | 'instructions' | 'done';
  /** Underlying stage progress event, if available */
  detail?: unknown;
  message?: string;
}

export type FeedbackFilter = (feedback: string) => 'structural' | 'value';

// ── Feedback filtering ─────────────────────────────────────────

/**
 * Default heuristic: classifies feedback lines as 'structural' when they
 * mention schema-level concepts (field, schema, missing/extra property,
 * wrong type, reorder, etc). Everything else is 'value'.
 *
 * Tight enough that ambiguous feedback still flows to GEPA — only obvious
 * structural complaints are dropped.
 */
export function defaultFeedbackFilter(feedback: string): 'structural' | 'value' {
  if (!feedback) return 'value';
  const lower = feedback.toLowerCase();

  const structuralPatterns: RegExp[] = [
    /\bmissing\s+(?:the\s+)?(?:["`']?\w+["`']?\s+)?field\b/,
    /\badd(?:ed|ing)?\s+(?:a|the)?\s*(?:new\s+)?(?:["`']?\w+["`']?\s+)?field\b/,
    /\bextra\s+field\b/,
    /\bunexpected\s+field\b/,
    /\bwrong\s+(?:field\s+)?(?:type|order)\b/,
    /\bfield\s+type\s+(?:mismatch|wrong)/,
    /\b(?:should\s+)?(?:re)?order\s+(?:the\s+)?fields\b/,
    /\bschema\s+(?:mismatch|violation|error)\b/,
    /\binvalid\s+json\s+shape\b/,
    /\bmissing\s+required\s+property\b/,
    /\bproperty\s+missing\b/,
    /\bshape\s+is\s+wrong\b/,
  ];

  for (const pattern of structuralPatterns) {
    if (pattern.test(lower)) return 'structural';
  }
  return 'value';
}

// ── Judge wrapping ─────────────────────────────────────────────

/**
 * Wrap an LLMJudge-like object so the feedback it emits has structural
 * lines stripped according to `filter`. Only `feedback` is filtered —
 * the numerical scores (correctness, procedure, conciseness, overall)
 * are preserved as-is so GEPA sees the true accuracy signal.
 *
 * The multi-line feedback from the judge is split on newlines and each
 * line classified individually.
 */
export function filterJudgeFeedback(
  judge: Pick<LLMJudge, 'score'>,
  filter: FeedbackFilter = defaultFeedbackFilter,
): Pick<LLMJudge, 'score'> {
  return {
    async score(args) {
      const raw = await judge.score(args);
      const filteredFeedback = stripStructuralLines(raw.feedback, filter);
      const result: JudgeScore = { ...raw, feedback: filteredFeedback };
      return result;
    },
  };
}

/** Public helper — strips structural lines from a feedback string. */
export function stripStructuralLines(
  feedback: string,
  filter: FeedbackFilter = defaultFeedbackFilter,
): string {
  if (!feedback) return feedback;
  return feedback
    .split(/\r?\n/)
    .filter(line => filter(line) === 'value')
    .join('\n')
    .trim();
}

// ── Orchestrator ───────────────────────────────────────────────

export class ComposeEvolution {
  async run(options: ComposeEvolutionOptions): Promise<ComposeEvolutionResult> {
    const signal = options.signal;
    const filter = options.feedbackFilter ?? defaultFeedbackFilter;

    // Stage 1 — evolve the schema.
    options.onProgress?.({ stage: 'schema', message: 'starting schema evolution' });
    const schemaResult = await new EvolveSchema().run({
      ...options.schema,
      signal,
      onProgress: (e) => options.onProgress?.({ stage: 'schema', detail: e }),
    });

    if (signal?.aborted) {
      return assembleAbortedResult(schemaResult, options.instructions.baseline);
    }

    const frozenSchema = schemaResult.winner.schema;

    // Stage 2 — evolve the instructions, with a filtered judge so GEPA
    // never sees structural feedback.
    options.onProgress?.({ stage: 'instructions', message: 'starting instruction evolution' });
    const filteredJudge = filterJudgeFeedback(options.instructions.judge, filter);

    const gepaResult = await new IterativeGEPA().run({
      ...options.instructions,
      judge: filteredJudge,
      signal,
      onProgress: (e) => options.onProgress?.({ stage: 'instructions', detail: e }),
    });

    const combinedDelta =
      (gepaResult.winner.score?.overall ?? 0) -
      ((schemaResult.history[0]?.score?.accuracy ?? 0));
    const fullyImproved = schemaResult.improved && gepaResult.improved;

    options.onProgress?.({ stage: 'done' });

    return {
      schema: schemaResult,
      instructions: gepaResult,
      combinedDelta,
      fullyImproved,
      frozenSchema,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Build a convenience `SchemaExecuteFn` from a user-supplied runner that
 * only cares about the instruction prompt (not the schema itself). Used
 * by callers that want to compose — they supply one "execute" function
 * for the instructional stage and this helper wraps it for Stage 1.
 *
 * The wrapped executor serializes the schema into a short prefix the
 * model can follow (`Return JSON with fields: <field1>, <field2>, ...`)
 * before delegating to the caller's function.
 */
export function schemaExecutorFromInstructionRunner(
  runInstructions: (args: { prompt: string; input: string }) => Promise<string>,
): SchemaExecuteFn {
  return async ({ schema, input }) => {
    const fieldList = schema.fields.map(f => `"${f.name}" (${f.type})`).join(', ');
    const prompt = `Return a JSON object with these fields: ${fieldList}.`;
    try {
      const actual = await runInstructions({ prompt, input });
      return { actual, parsed: actualLooksLikeJson(actual) };
    } catch {
      return { actual: '', parsed: false };
    }
  };
}

function actualLooksLikeJson(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return false;
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

function assembleAbortedResult(
  schemaResult: EvolveSchemaResult,
  instructionBaseline: string,
): ComposeEvolutionResult {
  // When aborted before Stage 2, produce a minimal GEPARunResult pointing
  // at the baseline instruction so callers have a stable shape.
  const baselineInstruction = {
    id: 'aborted',
    prompt: instructionBaseline,
    generation: 0,
    parent: null,
    strategy: 'aborted',
    score: null,
    perExample: [],
  } as GEPARunResult['winner'];

  return {
    schema: schemaResult,
    instructions: {
      winner: baselineInstruction,
      paretoFront: [baselineInstruction],
      history: [baselineInstruction],
      improved: false,
      delta: 0,
    },
    combinedDelta: 0,
    fullyImproved: false,
    frozenSchema: schemaResult.winner.schema,
  };
}

/** Re-export types so callers can `import { type Schema } from '...'`. */
export type { EvolveSchemaResult, GEPARunResult };

/**
 * Failure-mode judge — scaffold.
 *
 * Brief:  PM-Waggle-OS/briefs/2026-04-20-cc-preflight-prep-tasks.md Task 4
 * Spec:   PM-Waggle-OS/strategy/2026-04-20-failure-mode-taxonomy.md §4 (prompt),
 *         §6 (ensemble), §8 (inter-judge agreement / Fleiss' kappa thresholds)
 * LOCKED: PM-Waggle-OS/decisions/2026-04-20-failure-mode-oq-resolutions-locked.md
 *
 * This module is deliberately *not wired* into the harness runner in this
 * sprint (explicitly out of scope per the brief). It exists so that Sprint 9
 * can drop in the judge call on top of a tested foundation.
 *
 * Design decisions worth knowing:
 *
 *   — Zod validates strictly. The Step-3 schema contract between the model
 *     and us is enforced with a `.refine()` that captures the two
 *     cross-field invariants from the spec §4:
 *        verdict === 'correct'   ⇒ failure_mode MUST be null
 *        verdict === 'incorrect' ⇒ failure_mode MUST be one of F1..F5
 *     Any violation → retry once with the reminder → JudgeParseError.
 *
 *   — JSON extraction is best-effort. Models often wrap JSON in ```json
 *     fences, leading prose, or trailing chatter. We strip the obvious
 *     wrappers before parsing; if both attempts fail we surface the raw
 *     response in the thrown error so a debugger can reproduce.
 *
 *   — Ensemble tie-break is explicit: on a 2-2 split the ensemble uses the
 *     first judge in the `judgeModels` list. By convention the caller puts
 *     Sonnet first so "2-2 tie broken by Sonnet" holds per the spec §6.
 *
 *   — Fleiss' kappa is the standard multi-rater formulation (Fleiss 1971).
 *     Raters per subject must be constant; we throw if any subject has a
 *     different rater count, since the formula is undefined otherwise.
 *     Categories are the 6-class vocabulary from §8 (`correct` treated as
 *     a separate class from F1..F5 — the same convention §8 specifies).
 */

import { z } from 'zod';

// ── Public types ───────────────────────────────────────────────────────

export type FailureMode = 'F1' | 'F2' | 'F3' | 'F4' | 'F5';
export type Verdict = 'correct' | 'incorrect';

export interface JudgeResult {
  verdict: Verdict;
  failure_mode: null | FailureMode;
  rationale: string;
  judge_model: string;
}

export interface LlmClient {
  /** One-shot completion. Returns the raw text produced by the judge LLM. */
  complete(prompt: string): Promise<string>;
}

export class JudgeParseError extends Error {
  readonly lastResponse: string;
  readonly lastParseError?: string;
  readonly judgeModel: string;
  constructor(message: string, details: { lastResponse: string; judgeModel: string; lastParseError?: string }) {
    super(message);
    this.name = 'JudgeParseError';
    this.lastResponse = details.lastResponse;
    this.judgeModel = details.judgeModel;
    this.lastParseError = details.lastParseError;
  }
}

// ── Zod schema (enforces spec §4 Step-3 contract) ──────────────────────

const judgeSchema = z
  .object({
    verdict: z.enum(['correct', 'incorrect']),
    failure_mode: z.union([z.null(), z.enum(['F1', 'F2', 'F3', 'F4', 'F5'])]),
    rationale: z.string().min(1, 'rationale must be a non-empty sentence'),
  })
  .strict()
  .refine(
    r => (r.verdict === 'correct' ? r.failure_mode === null : r.failure_mode !== null),
    {
      message:
        'verdict/failure_mode invariant violated: ' +
        'verdict="correct" requires failure_mode=null; verdict="incorrect" requires one of F1..F5',
    },
  );

// ── Prompt builder (exact text from strategy §4) ───────────────────────

/** Exact judge prompt text from `strategy/2026-04-20-failure-mode-taxonomy.md` §4.
 *  Do not modify. The spec requires cell-independent scoring — changing the
 *  prompt between cells, or even between invocations, invalidates the ensemble. */
export function buildJudgePrompt(params: {
  question: string;
  groundTruth: string;
  contextExcerpt: string;
  modelAnswer: string;
}): string {
  return [
    "You are evaluating whether an LLM's answer is correct against ground truth.",
    '',
    '## Question',
    params.question,
    '',
    '## Ground-truth answer',
    params.groundTruth,
    '',
    '## Ground-truth supporting context (excerpt shown to the model)',
    params.contextExcerpt,
    '',
    "## Model's answer",
    params.modelAnswer,
    '',
    '## Your task',
    '',
    "Step 1: Determine if the model's answer is correct.",
    '- "correct" means the model\'s answer contains all required facts from ground truth, with no additional incorrect claims.',
    '- Minor phrasing differences, synonyms, or alternative but equivalent formulations are acceptable.',
    '- Extra detail is acceptable ONLY if it is factually correct.',
    '',
    'Step 2: If incorrect, assign exactly one failure mode using this decision tree:',
    '',
    '1. Does the model explicitly refuse or say it does not know? → F1 (ABSTAIN)',
    '2. Does the model answer a DIFFERENT question than was asked (coherent but off-topic)? → F5 (OFF-TOPIC)',
    '3. Does the model rely on entities, names, dates, or claims that do NOT appear in the ground-truth context (fabrication)? → F4 (HALLUCINATED)',
    '4. Does the model correctly state SOME required facts but miss others, without stating any incorrect facts? → F2 (PARTIAL)',
    '5. Otherwise (model states facts derived from the context but gets them wrong): → F3 (INCORRECT)',
    '',
    'Step 3: Return JSON only, no prose, in this exact schema:',
    '',
    '{',
    '  "verdict": "correct" | "incorrect",',
    '  "failure_mode": null | "F1" | "F2" | "F3" | "F4" | "F5",',
    '  "rationale": "one sentence explaining the verdict"',
    '}',
    '',
    'If verdict is "correct", failure_mode MUST be null.',
    'If verdict is "incorrect", failure_mode MUST be one of F1-F5.',
  ].join('\n');
}

/** Retry reminder prepended to the original prompt when the first response
 *  fails to parse. Text is verbatim from the Task-4 acceptance spec. */
export const RETRY_REMINDER =
  'Your previous response was not valid JSON. Return only the JSON object, no prose.';

// ── JSON extraction ────────────────────────────────────────────────────

/** Best-effort extraction of the JSON body from a model response. Handles:
 *    - bare JSON
 *    - `{ ... }` embedded in prose (first `{` to matching last `}`)
 *    - markdown code fences ```json ... ``` or ``` ... ``` */
export function extractJsonBody(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Code-fence strip first.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i);
  const afterFence = fenceMatch ? fenceMatch[1].trim() : trimmed;
  if (afterFence.startsWith('{') && afterFence.endsWith('}')) return afterFence;
  // Fallback — greedy `{ ... }` scan, stopping at the last `}`.
  const first = afterFence.indexOf('{');
  const last = afterFence.lastIndexOf('}');
  if (first >= 0 && last > first) return afterFence.slice(first, last + 1);
  return null;
}

function tryParse(raw: string): { ok: true; value: JudgeResult } | { ok: false; error: string } {
  const body = extractJsonBody(raw);
  if (!body) return { ok: false, error: 'no JSON object found in response' };
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body);
  } catch (err) {
    return { ok: false, error: `JSON.parse failed: ${(err as Error).message}` };
  }
  const result = judgeSchema.safeParse(parsedJson);
  if (!result.success) {
    return { ok: false, error: `schema validation failed: ${result.error.issues.map(i => i.message).join('; ')}` };
  }
  return {
    ok: true,
    value: {
      verdict: result.data.verdict,
      failure_mode: result.data.failure_mode,
      rationale: result.data.rationale,
      judge_model: '', // filled by judgeAnswer from params.judgeModel
    },
  };
}

// ── Public API ─────────────────────────────────────────────────────────

export async function judgeAnswer(params: {
  question: string;
  groundTruth: string;
  contextExcerpt: string;
  modelAnswer: string;
  judgeModel: string;
  llmClient: LlmClient;
}): Promise<JudgeResult> {
  const prompt = buildJudgePrompt({
    question: params.question,
    groundTruth: params.groundTruth,
    contextExcerpt: params.contextExcerpt,
    modelAnswer: params.modelAnswer,
  });

  const first = await params.llmClient.complete(prompt);
  const firstParsed = tryParse(first);
  if (firstParsed.ok) {
    return { ...firstParsed.value, judge_model: params.judgeModel };
  }

  // Retry once with the reminder prefixed. A fresh LLM call — callers can
  // wire conversation-state preservation later; spec §4 does not require it.
  const retryPrompt = `${RETRY_REMINDER}\n\n${prompt}`;
  const second = await params.llmClient.complete(retryPrompt);
  const secondParsed = tryParse(second);
  if (secondParsed.ok) {
    return { ...secondParsed.value, judge_model: params.judgeModel };
  }

  throw new JudgeParseError(
    `Judge ${params.judgeModel} produced unparseable output after one retry`,
    {
      lastResponse: second,
      judgeModel: params.judgeModel,
      lastParseError: secondParsed.error,
    },
  );
}

export async function judgeEnsemble(params: {
  question: string;
  groundTruth: string;
  contextExcerpt: string;
  modelAnswer: string;
  judgeModels: string[];
  llmClients: Map<string, LlmClient>;
}): Promise<{ ensemble: JudgeResult[]; majority: JudgeResult; fleissKappa: number }> {
  if (params.judgeModels.length === 0) {
    throw new Error('judgeEnsemble requires at least one judgeModel');
  }

  const results: JudgeResult[] = [];
  for (const model of params.judgeModels) {
    const client = params.llmClients.get(model);
    if (!client) throw new Error(`judgeEnsemble: no LlmClient registered for model ${model}`);
    const result = await judgeAnswer({
      question: params.question,
      groundTruth: params.groundTruth,
      contextExcerpt: params.contextExcerpt,
      modelAnswer: params.modelAnswer,
      judgeModel: model,
      llmClient: client,
    });
    results.push(result);
  }

  const majority = computeMajority(results, params.judgeModels[0]);
  // For a single-subject ensemble, Fleiss' kappa is computed over the same
  // one-subject matrix — degenerate but well-defined (NaN gets clamped to 0
  // when the subject has only one category). In production, this function
  // is typically called per-instance and kappa is aggregated at the batch
  // layer; we expose the single-subject value for diagnostic continuity.
  const fleissKappa = computeFleissKappa([results]);

  return { ensemble: results, majority, fleissKappa };
}

function computeMajority(results: readonly JudgeResult[], tieBreakerModel: string): JudgeResult {
  // Count verdict × failure_mode pairs (null collapses to 'NA' for keying).
  const tally = new Map<string, number>();
  const first = new Map<string, JudgeResult>();
  for (const r of results) {
    const key = `${r.verdict}|${r.failure_mode ?? 'NA'}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
    if (!first.has(key)) first.set(key, r);
  }
  let winnerKey = '';
  let winnerCount = -1;
  for (const [key, count] of tally) {
    if (count > winnerCount) {
      winnerKey = key;
      winnerCount = count;
    }
  }
  // Tie detection: if any other key has equal count, the tie-breaker model
  // wins — its verdict becomes the majority.
  const tied = Array.from(tally.entries()).filter(([, c]) => c === winnerCount);
  if (tied.length > 1) {
    const tb = results.find(r => r.judge_model === tieBreakerModel);
    if (tb) return tb;
    // Fallback: keep the first deterministic winner (stable map iteration).
  }
  const winner = first.get(winnerKey);
  if (!winner) {
    // Unreachable under normal flow; defensive.
    return results[0];
  }
  return {
    verdict: winner.verdict,
    failure_mode: winner.failure_mode,
    rationale: winner.rationale,
    judge_model: 'ensemble_majority',
  };
}

// ── Fleiss' kappa ──────────────────────────────────────────────────────

/** The 6-class rating space used by Fleiss' kappa: correct + F1..F5.
 *  §8: "standardni Fleiss' kappa preko 4 raters × N instanci × 6 klasa". */
const KAPPA_CATEGORIES = ['correct', 'F1', 'F2', 'F3', 'F4', 'F5'] as const;
type KappaCategory = typeof KAPPA_CATEGORIES[number];

function categoryOf(r: JudgeResult): KappaCategory {
  if (r.verdict === 'correct') return 'correct';
  return r.failure_mode ?? 'F3'; // should never hit fallback — schema guard
}

/** Computes Fleiss' kappa on an N-subjects × n-raters matrix.
 *
 *  Input shape: `ratings[i]` is the list of judge results for subject i —
 *  all subjects must have the same number of raters. Categories are the
 *  fixed 6-class vocabulary.
 *
 *  Returns: κ in [-1, 1]. If all subjects are unanimous on the same
 *  category (expected-agreement = 1), returns 1 (the (1-1)/(1-1) limit).
 */
export function computeFleissKappa(ratings: readonly (readonly JudgeResult[])[]): number {
  if (ratings.length === 0) return 0;
  const n = ratings[0].length;
  if (n < 2) {
    // Fleiss' kappa is undefined for a single rater. Degenerate → 0.
    return 0;
  }
  for (const row of ratings) {
    if (row.length !== n) {
      throw new Error(`Fleiss' kappa requires a constant rater count; saw ${row.length} and ${n}`);
    }
  }

  const N = ratings.length;
  const k = KAPPA_CATEGORIES.length;
  const catIndex: Record<KappaCategory, number> = { correct: 0, F1: 1, F2: 2, F3: 3, F4: 4, F5: 5 };

  // nij[i][j] = count of raters who assigned subject i to category j
  const nij: number[][] = Array.from({ length: N }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < N; i++) {
    for (const r of ratings[i]) {
      const col = catIndex[categoryOf(r)];
      nij[i][col] += 1;
    }
  }

  // Pj = (1/(N*n)) * sum_i nij[i][j]
  const Pj: number[] = new Array<number>(k).fill(0);
  for (let j = 0; j < k; j++) {
    let sum = 0;
    for (let i = 0; i < N; i++) sum += nij[i][j];
    Pj[j] = sum / (N * n);
  }

  // Pi = (1/(n(n-1))) * ( sum_j nij[i][j]^2 - n )
  let PbarSum = 0;
  for (let i = 0; i < N; i++) {
    let sqSum = 0;
    for (let j = 0; j < k; j++) sqSum += nij[i][j] * nij[i][j];
    const Pi = (sqSum - n) / (n * (n - 1));
    PbarSum += Pi;
  }
  const Pbar = PbarSum / N;

  // Pebar = sum_j Pj^2
  let Pebar = 0;
  for (let j = 0; j < k; j++) Pebar += Pj[j] * Pj[j];

  if (Pebar >= 1 - 1e-12) {
    // Every rating in one category → expected = observed = 1 → κ = 1 by convention.
    return 1;
  }
  return (Pbar - Pebar) / (1 - Pebar);
}

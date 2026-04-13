/**
 * LLM-as-Judge — rubric-based scorer used by the evolution loop.
 *
 * Scores a candidate response against an expected ground truth along
 * three weighted dimensions:
 *
 *   correctness         0.5  — does the answer match the expected output?
 *   procedureFollowing  0.3  — did the agent follow the instructions / format?
 *   conciseness         0.2  — is it on-point without padding?
 *
 * Then applies a length penalty (soft cap) multiplied into the final score.
 *
 * The textual feedback produced is the input that drives GEPA's reflective
 * mutations — it must explain *what* went wrong (or right) so the next
 * prompt variation can address it.
 *
 * Model-agnostic — caller provides the llmCall function. Defaults assume
 * a Haiku-class judge via LiteLLM, but any OpenAI-compatible backend works.
 */

export type JudgeLLMCall = (prompt: string) => Promise<string>;

export interface JudgeInput {
  /** The original user instruction. */
  input: string;
  /** Ground-truth / reference output. */
  expected: string;
  /** The candidate to be scored. */
  actual: string;
  /** Optional additional context (e.g., task_shape, persona). */
  context?: string;
}

export interface JudgeScore {
  /** Weighted overall score 0..1 after length penalty. */
  overall: number;
  /** Raw weighted score before length penalty. */
  weighted: number;
  /** Component scores 0..1. */
  correctness: number;
  procedureFollowing: number;
  conciseness: number;
  /** Multiplier applied to the weighted score (0..1). */
  lengthPenalty: number;
  /** Free-form feedback used as reflective-mutation input for GEPA. */
  feedback: string;
  /** True when the judge successfully parsed a structured response. */
  parsed: boolean;
}

export interface JudgeOptions {
  weights?: {
    correctness?: number;
    procedure?: number;
    conciseness?: number;
  };
  /**
   * Target output length in characters. If `actual` is within
   * `[0, lengthTarget * tolerance]` the penalty is 1.0, falling off
   * linearly beyond. Defaults to a generous 2,000 chars.
   */
  lengthTarget?: number;
  /** Allowed overshoot fraction before penalty kicks in. Default 0.5 (50%). */
  lengthTolerance?: number;
  /**
   * Floor for the length penalty — scores never fall below this multiplier
   * due to length alone. Default 0.5.
   */
  lengthFloor?: number;
  /** Override the default rubric prompt entirely. */
  rubricOverride?: string;
}

export const DEFAULT_WEIGHTS = { correctness: 0.5, procedure: 0.3, conciseness: 0.2 };

export const DEFAULT_RUBRIC = `You are a strict, fair evaluator scoring an AI assistant's response.

You will be given:
- The user's INSTRUCTION
- The EXPECTED output (ground truth)
- The ACTUAL output from the AI assistant

Score the ACTUAL response on three dimensions, each on a 0-10 integer scale:

1. CORRECTNESS (0-10)
   - 10: semantically equivalent to expected, all facts / steps correct
   - 7-9: mostly correct, minor missing / wrong detail
   - 4-6: partially correct, material gap or error
   - 1-3: mostly wrong
   - 0: unrelated or empty

2. PROCEDURE_FOLLOWING (0-10)
   - Did the response follow the requested format / structure / constraints
     implied by the instruction?
   - 10: format matches exactly
   - 5: format roughly matches
   - 0: ignored the procedural requirements

3. CONCISENESS (0-10)
   - 10: tight, no padding, appropriate length
   - 5: somewhat verbose or somewhat terse
   - 0: extreme padding or trivially short

Then write a short, ACTIONABLE FEEDBACK (max 3 sentences) explaining
the biggest improvement opportunity. Focus on what to change in the
prompt / approach, not what the user should do differently.

Return ONLY a JSON object on a single line, no markdown:
{"correctness": <0-10>, "procedure": <0-10>, "conciseness": <0-10>, "feedback": "<string>"}`;

// ── Public API ─────────────────────────────────────────────────

export class LLMJudge {
  private llmCall: JudgeLLMCall;
  private weights: { correctness: number; procedure: number; conciseness: number };
  private lengthTarget: number;
  private lengthTolerance: number;
  private lengthFloor: number;
  private rubric: string;

  constructor(llmCall: JudgeLLMCall, options: JudgeOptions = {}) {
    this.llmCall = llmCall;
    this.weights = {
      correctness: options.weights?.correctness ?? DEFAULT_WEIGHTS.correctness,
      procedure: options.weights?.procedure ?? DEFAULT_WEIGHTS.procedure,
      conciseness: options.weights?.conciseness ?? DEFAULT_WEIGHTS.conciseness,
    };
    validateWeights(this.weights);
    this.lengthTarget = options.lengthTarget ?? 2_000;
    this.lengthTolerance = options.lengthTolerance ?? 0.5;
    this.lengthFloor = options.lengthFloor ?? 0.5;
    this.rubric = options.rubricOverride ?? DEFAULT_RUBRIC;
  }

  /** Score a single example. */
  async score(input: JudgeInput): Promise<JudgeScore> {
    const prompt = buildPrompt(this.rubric, input);
    let rawResponse = '';
    try {
      rawResponse = await this.llmCall(prompt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errorScore(`Judge LLM call failed: ${message}`);
    }

    const parsed = parseJudgeResponse(rawResponse);
    if (!parsed) {
      return errorScore(
        `Judge response could not be parsed. Raw: ${rawResponse.slice(0, 200)}`,
      );
    }

    const correctness = clampUnit(parsed.correctness / 10);
    const procedureFollowing = clampUnit(parsed.procedure / 10);
    const conciseness = clampUnit(parsed.conciseness / 10);

    const weighted =
      correctness * this.weights.correctness +
      procedureFollowing * this.weights.procedure +
      conciseness * this.weights.conciseness;

    const lengthPenalty = computeLengthPenalty(
      input.actual.length,
      this.lengthTarget,
      this.lengthTolerance,
      this.lengthFloor,
    );

    return {
      overall: clampUnit(weighted * lengthPenalty),
      weighted,
      correctness,
      procedureFollowing,
      conciseness,
      lengthPenalty,
      feedback: parsed.feedback || 'No feedback provided.',
      parsed: true,
    };
  }

  /** Score many examples. Returns in input order. */
  async scoreBatch(inputs: JudgeInput[]): Promise<JudgeScore[]> {
    const scores: JudgeScore[] = [];
    for (const input of inputs) {
      scores.push(await this.score(input));
    }
    return scores;
  }
}

// ── Helpers (exported for tests) ───────────────────────────────

export function buildPrompt(rubric: string, input: JudgeInput): string {
  const ctx = input.context ? `\n\nCONTEXT: ${input.context}` : '';
  return `${rubric}${ctx}

INSTRUCTION:
${input.input}

EXPECTED:
${input.expected}

ACTUAL:
${input.actual}

Return the JSON now.`;
}

export interface ParsedJudgeResponse {
  correctness: number;
  procedure: number;
  conciseness: number;
  feedback: string;
}

/**
 * Extract the judge JSON from the LLM response. Tolerates markdown fences
 * and extra prose before / after the JSON.
 */
export function parseJudgeResponse(raw: string): ParsedJudgeResponse | null {
  if (!raw) return null;

  // Strip markdown code fences if present.
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Find the first balanced { ... } block and try to parse.
  const candidates = extractJsonCandidates(cleaned);
  for (const candidate of candidates) {
    try {
      const obj = JSON.parse(candidate) as Record<string, unknown>;
      if (
        typeof obj.correctness === 'number' &&
        typeof obj.procedure === 'number' &&
        typeof obj.conciseness === 'number'
      ) {
        const feedback = typeof obj.feedback === 'string' ? obj.feedback : '';
        return {
          correctness: obj.correctness,
          procedure: obj.procedure,
          conciseness: obj.conciseness,
          feedback,
        };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Enumerate substrings that might be a JSON object, starting at each `{`.
 * Returns them in order (longest-first preference via outer `{` starts).
 */
function extractJsonCandidates(text: string): string[] {
  const out: string[] = [];
  const starts: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') starts.push(i);
  }
  for (const start of starts) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === '\\') escape = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          out.push(text.slice(start, i + 1));
          break;
        }
      }
    }
  }
  // Prefer the largest candidate first — most likely to be the whole object.
  return out.sort((a, b) => b.length - a.length);
}

/**
 * Length penalty: 1.0 while actual.length ≤ target * (1 + tolerance),
 * falling linearly toward `floor` as length grows to 3x the target.
 */
export function computeLengthPenalty(
  actualLength: number,
  target: number,
  tolerance: number,
  floor: number,
): number {
  if (actualLength <= 0 || target <= 0) return 1;
  const limit = target * (1 + tolerance);
  if (actualLength <= limit) return 1;

  // Linear falloff from `limit` to `3 * target` where we hit `floor`.
  const farLimit = target * 3;
  if (actualLength >= farLimit) return floor;
  const range = farLimit - limit;
  const over = actualLength - limit;
  return Math.max(floor, 1 - (1 - floor) * (over / range));
}

function clampUnit(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function validateWeights(w: { correctness: number; procedure: number; conciseness: number }): void {
  if ([w.correctness, w.procedure, w.conciseness].some(x => x < 0)) {
    throw new Error('Judge weights must be non-negative');
  }
  const sum = w.correctness + w.procedure + w.conciseness;
  if (Math.abs(sum - 1.0) > 1e-6) {
    throw new Error(`Judge weights must sum to 1.0, got ${sum}`);
  }
}

function errorScore(feedback: string): JudgeScore {
  return {
    overall: 0,
    weighted: 0,
    correctness: 0,
    procedureFollowing: 0,
    conciseness: 0,
    lengthPenalty: 1,
    feedback,
    parsed: false,
  };
}

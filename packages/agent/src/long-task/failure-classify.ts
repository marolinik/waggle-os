/**
 * Failure classifier — Phase 4.1 of agent-fix sprint
 * (per decisions/2026-04-26-agent-fix-sprint-plan.md §4.1)
 *
 * Classifies a model's failed output against a gold answer into one of ten
 * pre-registered failure categories. Rule-based first (fast, free, deterministic);
 * LLM-judge fallback only for ambiguous cases when the caller provides one.
 *
 * The ten categories are pre-registered in the sprint plan and reflect the
 * 2026-04-26 pilot's empirical failure-mode taxonomy. Phase 4.3 re-score uses
 * this classifier to bucket the 12-cell pilot's H2/H3/H4 failures into
 * Tier 1 (presentation / fixable by output-normalize layer) vs Tier 2
 * (real harness-design issues).
 *
 * The classifier walks rules in PRIORITY ORDER (most-specific first):
 *   1. retrieval_or_harness_error (upstream signal overrides everything)
 *   2. thinking_leakage           (explicit <think> tags or chain-of-thought prefixes)
 *   3. metadata_copy              (literal substrate metadata in output)
 *   4. format_violation           (bullet list when prose expected, JSON when text, etc.)
 *   5. unknown_false_negative     (model abstained but gold is answerable)
 *   6. punctuation_or_case_only   (normalize-equal but raw-different)
 *   7. correct_answer_with_extra_text  (gold-substring-match but output is verbose)
 *   8. wrong_span                 (high token overlap, but no substring match)
 *   9. wrong_entity               (low token overlap, definitive statement)
 *  10. hallucination              (default fallback for "wrong but uncategorized")
 *
 * Each category emits a `confidence` level:
 *   - 'high':   explicit signal (e.g., literal <think> tag, exact token-set equality)
 *   - 'medium': heuristic signal (e.g., format-prefix mismatch, token-overlap threshold)
 *   - 'low':    no clear signal — defaults to hallucination
 *
 * Callers MUST decide whether to act on low-confidence classifications
 * (e.g., surface for human review, or invoke LLM judge fallback).
 */

import type { LlmCallFn } from '../retrieval-agent-loop.js';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type FailureCategory =
  | 'thinking_leakage'
  | 'correct_answer_with_extra_text'
  | 'unknown_false_negative'
  | 'metadata_copy'
  | 'format_violation'
  | 'punctuation_or_case_only'
  | 'wrong_span'
  | 'wrong_entity'
  | 'hallucination'
  | 'retrieval_or_harness_error';

export const FAILURE_CATEGORIES: readonly FailureCategory[] = [
  'thinking_leakage',
  'correct_answer_with_extra_text',
  'unknown_false_negative',
  'metadata_copy',
  'format_violation',
  'punctuation_or_case_only',
  'wrong_span',
  'wrong_entity',
  'hallucination',
  'retrieval_or_harness_error',
] as const;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface FailureClassification {
  primary: FailureCategory;
  confidence: ConfidenceLevel;
  secondary?: FailureCategory;
  rationale: string;
  /** Names of rules / heuristics that fired. Empty for LLM-judge-only verdicts. */
  rules_fired: readonly string[];
  /** Whether the LLM-judge fallback was invoked. */
  llm_judge_invoked: boolean;
}

export interface ClassifierInput {
  model_output: string;
  /** Single string or list of acceptable gold answers (any-match = passing). */
  gold_answer: string | readonly string[];
  /** Optional question text — passed to LLM judge if invoked. */
  question?: string;
  /** Optional substrate / retrieved context — used to detect metadata leakage. */
  substrate?: string;
  /** Optional upstream error string (retrieval/harness). If set, overrides to category #1. */
  upstream_error?: string;
}

export interface ClassifierOptions {
  /**
   * Optional LLM judge function for low-confidence rule cases. If absent, the
   * classifier returns the rule's verdict at the rule's confidence level.
   */
  llmJudge?: LlmCallFn;
  /** Model alias for the LLM judge. Required if llmJudge is provided. */
  judgeModel?: string;
  /**
   * If true (default), the LLM judge is invoked for 'low' confidence verdicts
   * to potentially upgrade them. If false, never invoke the judge regardless.
   */
  invokeJudgeOnLowConfidence?: boolean;
  /** Per-call max_tokens for the LLM judge. Default 256. */
  judgeMaxTokens?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Detector regexes / constants
// ─────────────────────────────────────────────────────────────────────────

const THINKING_TAG_RE = /<\s*\/?\s*think(?:ing)?\s*[>\s]/i;
const THINKING_PREFIX_RE = /^(let me think|first[,\s]|step \d|i need to|i'?ll start|let's break|to answer this|let me analyze|let me work through)/i;

const METADATA_LITERAL_PATTERNS = [
  /\[memory:[^\]]*\]/i,
  /\[ref:[^\]]*\]/i,
  /\[source:[^\]]*\]/i,
  /from session\s*(?:#?\d+|"[^"]+")/i,
  /\[\s*context:[^\]]*\]/i,
  /^\s*<<\s*[a-z_]+\s*>>/i,
];

const UNKNOWN_OUTPUTS = new Set([
  'unknown',
  'i don\'t know',
  'i do not know',
  'cannot determine',
  'cannot be determined',
  'not specified',
  'no information',
  'insufficient information',
  'no answer',
  'n/a',
  'na',
  'none',
]);

const FORMAT_BULLET_PREFIXES = /^\s*([*\-•]|\d+[.)]\s)/m;
const FORMAT_JSON_PREFIXES = /^\s*[{\[]/;
const FORMAT_FENCE_PREFIX = /^\s*```/;

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function asGoldArray(g: string | readonly string[]): readonly string[] {
  return typeof g === 'string' ? [g] : g;
}

function lc(s: string): string {
  return s.toLowerCase();
}

/** Strip punctuation + collapse whitespace + lowercase. */
function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  return normalizeForCompare(s).split(/\s+/).filter(t => t.length > 0);
}

function tokenSet(s: string): Set<string> {
  return new Set(tokenize(s));
}

/** Jaccard similarity over token sets. 0..1. */
function tokenOverlap(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function lowercaseSubstringMatch(output: string, gold: readonly string[]): boolean {
  const lower = output.toLowerCase();
  for (const g of gold) {
    if (g && lower.includes(g.toLowerCase())) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────
// Detector functions — each returns { matched, confidence, rationale, rule } | null
// ─────────────────────────────────────────────────────────────────────────

interface DetectorResult {
  matched: boolean;
  confidence: ConfidenceLevel;
  rationale: string;
  rule: string;
}

function detectUpstreamError(input: ClassifierInput): DetectorResult | null {
  if (input.upstream_error && input.upstream_error.trim().length > 0) {
    return {
      matched: true,
      confidence: 'high',
      rationale: `upstream_error present: "${input.upstream_error.slice(0, 80)}"`,
      rule: 'upstream-error',
    };
  }
  return null;
}

function detectThinkingLeakage(input: ClassifierInput): DetectorResult | null {
  const out = input.model_output;
  if (THINKING_TAG_RE.test(out)) {
    return {
      matched: true,
      confidence: 'high',
      rationale: 'output contains literal <think> tags',
      rule: 'thinking-tag',
    };
  }
  if (THINKING_PREFIX_RE.test(out.trim())) {
    return {
      matched: true,
      confidence: 'medium',
      rationale: 'output starts with chain-of-thought prefix',
      rule: 'thinking-prefix',
    };
  }
  return null;
}

function detectMetadataCopy(input: ClassifierInput): DetectorResult | null {
  const out = input.model_output;
  for (const re of METADATA_LITERAL_PATTERNS) {
    if (re.test(out)) {
      return {
        matched: true,
        confidence: 'high',
        rationale: `output contains literal substrate metadata pattern ${re}`,
        rule: 'metadata-literal',
      };
    }
  }
  if (input.substrate) {
    // Heuristic: long substring of substrate that's clearly metadata-shaped (timestamps,
    // session ids) appearing verbatim in the output.
    const ts = out.match(/session\s*\d{2,}|gop_id\s*[:=]\s*\S+|frame_id\s*[:=]/i);
    if (ts) {
      return {
        matched: true,
        confidence: 'medium',
        rationale: `output contains substrate-shaped identifier "${ts[0]}"`,
        rule: 'metadata-shaped-id',
      };
    }
  }
  return null;
}

function detectFormatViolation(input: ClassifierInput): DetectorResult | null {
  const gold = asGoldArray(input.gold_answer);
  const goldSample = gold[0] ?? '';
  const out = input.model_output;
  const outIsBullet = FORMAT_BULLET_PREFIXES.test(out);
  const outIsJson = FORMAT_JSON_PREFIXES.test(out.trim());
  const outIsFence = FORMAT_FENCE_PREFIX.test(out);
  const goldIsBullet = FORMAT_BULLET_PREFIXES.test(goldSample);
  const goldIsJson = FORMAT_JSON_PREFIXES.test(goldSample.trim());

  if (outIsFence && !goldIsJson && !goldIsBullet) {
    return {
      matched: true,
      confidence: 'high',
      rationale: 'output wrapped in ``` code fence; gold is plain prose',
      rule: 'format-fence-mismatch',
    };
  }
  if (outIsJson && !goldIsJson) {
    return {
      matched: true,
      confidence: 'medium',
      rationale: 'output starts with { or [; gold is plain prose',
      rule: 'format-json-mismatch',
    };
  }
  if (outIsBullet && !goldIsBullet) {
    return {
      matched: true,
      confidence: 'medium',
      rationale: 'output starts with bullet/numbered list; gold is plain prose',
      rule: 'format-bullet-mismatch',
    };
  }
  return null;
}

function detectUnknownFalseNegative(input: ClassifierInput): DetectorResult | null {
  const lcOut = input.model_output.toLowerCase().trim();
  if (UNKNOWN_OUTPUTS.has(lcOut)) {
    return {
      matched: true,
      confidence: 'high',
      rationale: `output is exact "unknown"-class string ("${lcOut}")`,
      rule: 'unknown-exact',
    };
  }
  // Heuristic: output is short AND contains unknown-class phrase
  if (lcOut.length < 80) {
    for (const u of UNKNOWN_OUTPUTS) {
      if (lcOut.includes(u)) {
        return {
          matched: true,
          confidence: 'medium',
          rationale: `output (short, ${lcOut.length} chars) contains "${u}"`,
          rule: 'unknown-substring',
        };
      }
    }
  }
  return null;
}

function detectPunctuationOrCaseOnly(input: ClassifierInput): DetectorResult | null {
  const gold = asGoldArray(input.gold_answer);
  const outNorm = normalizeForCompare(input.model_output);
  const outRaw = input.model_output.trim();
  for (const g of gold) {
    if (!g) continue;
    if (outNorm === normalizeForCompare(g) && outRaw !== g.trim()) {
      return {
        matched: true,
        confidence: 'high',
        rationale: 'output equals gold after normalize, but raw forms differ (punctuation/case)',
        rule: 'punct-case-only',
      };
    }
  }
  return null;
}

function detectCorrectWithExtraText(input: ClassifierInput): DetectorResult | null {
  const gold = asGoldArray(input.gold_answer);
  if (!lowercaseSubstringMatch(input.model_output, gold)) return null;
  const goldSample = gold.find(g => input.model_output.toLowerCase().includes(g.toLowerCase())) ?? '';
  if (!goldSample) return null;
  const goldLen = goldSample.length;
  const outLen = input.model_output.trim().length;
  if (outLen >= goldLen * 1.5 && outLen >= goldLen + 25) {
    return {
      matched: true,
      confidence: outLen >= goldLen * 3 ? 'high' : 'medium',
      rationale: `gold "${goldSample.slice(0, 40)}…" is contained in output, but output is ${outLen} chars vs gold ${goldLen} chars`,
      rule: 'correct-with-extra',
    };
  }
  return null;
}

function detectWrongSpan(input: ClassifierInput): DetectorResult | null {
  const gold = asGoldArray(input.gold_answer);
  if (lowercaseSubstringMatch(input.model_output, gold)) return null;
  let bestOverlap = 0;
  for (const g of gold) {
    bestOverlap = Math.max(bestOverlap, tokenOverlap(input.model_output, g));
  }
  if (bestOverlap >= 0.5) {
    return {
      matched: true,
      confidence: 'medium',
      rationale: `Jaccard token overlap ${bestOverlap.toFixed(2)} ≥ 0.5 but no substring match`,
      rule: 'wrong-span',
    };
  }
  return null;
}

function detectWrongEntity(input: ClassifierInput): DetectorResult | null {
  const gold = asGoldArray(input.gold_answer);
  if (lowercaseSubstringMatch(input.model_output, gold)) return null;
  let bestOverlap = 0;
  for (const g of gold) {
    bestOverlap = Math.max(bestOverlap, tokenOverlap(input.model_output, g));
  }
  // Definitive statement: output > 5 tokens AND not an unknown phrase.
  const tokens = tokenize(input.model_output);
  const definitive = tokens.length >= 5 && !Array.from(UNKNOWN_OUTPUTS).some(u => input.model_output.toLowerCase().includes(u));
  if (bestOverlap < 0.3 && definitive) {
    return {
      matched: true,
      confidence: bestOverlap < 0.1 ? 'high' : 'medium',
      rationale: `Jaccard token overlap ${bestOverlap.toFixed(2)} < 0.3 with definitive output (${tokens.length} tokens)`,
      rule: 'wrong-entity',
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// LLM judge fallback
// ─────────────────────────────────────────────────────────────────────────

const LLM_JUDGE_PROMPT_TEMPLATE = (input: ClassifierInput): string => {
  const gold = asGoldArray(input.gold_answer).join(' | ');
  return [
    'You are a failure-mode classifier for a benchmark agent\'s output.',
    '',
    `Question: ${input.question ?? '(not provided)'}`,
    `Gold answer (any-of): ${gold}`,
    `Model output: ${input.model_output}`,
    '',
    'Classify into exactly one of these categories:',
    '  - thinking_leakage              (output contains chain-of-thought reasoning that should have been stripped)',
    '  - correct_answer_with_extra_text (output contains the gold answer but with verbose extra prose)',
    '  - unknown_false_negative        (output abstained but the gold answer is definite)',
    '  - metadata_copy                 (output contains literal substrate metadata)',
    '  - format_violation              (output uses wrong format — bullets/JSON/code fence vs expected prose)',
    '  - punctuation_or_case_only      (output equals gold modulo punctuation or case)',
    '  - wrong_span                    (output gets the right entity but wrong span — too narrow or too broad)',
    '  - wrong_entity                  (output references the wrong entity entirely)',
    '  - hallucination                 (output contains content not in gold or substrate)',
    '  - retrieval_or_harness_error    (failure caused by retrieval / infrastructure, not model reasoning)',
    '',
    'Output JSON only (no prose, no fences):',
    '{"primary":"<category>","confidence":"high|medium|low","rationale":"<one short sentence>"}',
  ].join('\n');
};

async function invokeLlmJudge(
  input: ClassifierInput,
  opts: ClassifierOptions,
): Promise<{ primary: FailureCategory; confidence: ConfidenceLevel; rationale: string } | null> {
  if (!opts.llmJudge || !opts.judgeModel) return null;
  const prompt = LLM_JUDGE_PROMPT_TEMPLATE(input);
  const r = await opts.llmJudge({
    model: opts.judgeModel,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: opts.judgeMaxTokens ?? 256,
    temperature: 0,
  });
  if (r.error) return null;
  const m = r.content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]) as { primary?: string; confidence?: string; rationale?: string };
    const primary = obj.primary as FailureCategory;
    if (!FAILURE_CATEGORIES.includes(primary)) return null;
    const confidence = (obj.confidence as ConfidenceLevel) ?? 'medium';
    return {
      primary,
      confidence: confidence === 'high' || confidence === 'medium' || confidence === 'low' ? confidence : 'medium',
      rationale: obj.rationale ?? '(no rationale)',
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────

interface RuleHit {
  category: FailureCategory;
  result: DetectorResult;
}

function runRuleCascade(input: ClassifierInput): RuleHit[] {
  const hits: RuleHit[] = [];
  const detectors: Array<{ category: FailureCategory; fn: (i: ClassifierInput) => DetectorResult | null }> = [
    { category: 'retrieval_or_harness_error', fn: detectUpstreamError },
    { category: 'thinking_leakage', fn: detectThinkingLeakage },
    { category: 'metadata_copy', fn: detectMetadataCopy },
    { category: 'format_violation', fn: detectFormatViolation },
    { category: 'unknown_false_negative', fn: detectUnknownFalseNegative },
    { category: 'punctuation_or_case_only', fn: detectPunctuationOrCaseOnly },
    { category: 'correct_answer_with_extra_text', fn: detectCorrectWithExtraText },
    { category: 'wrong_span', fn: detectWrongSpan },
    { category: 'wrong_entity', fn: detectWrongEntity },
  ];
  for (const { category, fn } of detectors) {
    const r = fn(input);
    if (r && r.matched) hits.push({ category, result: r });
  }
  return hits;
}

/**
 * Classify a model output failure into one of the 10 pre-registered categories.
 *
 * Walks the rule cascade in priority order. If at least one rule fires, returns
 * the highest-priority hit's verdict. If no rules fire, returns 'hallucination'
 * with 'low' confidence (the catch-all default).
 *
 * If options.llmJudge is provided AND the rule-cascade verdict is 'low'
 * confidence (or no rule fired), the LLM judge is invoked for potential
 * upgrade. The judge's verdict overrides only if it returns a known category.
 */
export async function classifyFailure(
  input: ClassifierInput,
  opts: ClassifierOptions = {},
): Promise<FailureClassification> {
  const hits = runRuleCascade(input);
  let primary: FailureCategory;
  let confidence: ConfidenceLevel;
  let rationale: string;
  let rulesFired: string[];
  let secondary: FailureCategory | undefined;

  if (hits.length > 0) {
    const top = hits[0]!;
    primary = top.category;
    confidence = top.result.confidence;
    rationale = top.result.rationale;
    rulesFired = hits.map(h => h.result.rule);
    if (hits.length > 1) secondary = hits[1]!.category;
  } else {
    primary = 'hallucination';
    confidence = 'low';
    rationale = 'no rule fired; defaulting to hallucination (catch-all)';
    rulesFired = [];
  }

  // LLM judge fallback for low-confidence verdicts.
  const shouldInvokeJudge =
    Boolean(opts.llmJudge && opts.judgeModel) &&
    confidence === 'low' &&
    (opts.invokeJudgeOnLowConfidence ?? true);

  if (shouldInvokeJudge) {
    const judgeVerdict = await invokeLlmJudge(input, opts);
    if (judgeVerdict) {
      return {
        primary: judgeVerdict.primary,
        confidence: judgeVerdict.confidence,
        secondary: primary === judgeVerdict.primary ? secondary : primary,
        rationale: `[llm-judge] ${judgeVerdict.rationale}`,
        rules_fired: rulesFired,
        llm_judge_invoked: true,
      };
    }
  }

  return {
    primary,
    confidence,
    secondary,
    rationale,
    rules_fired: rulesFired,
    llm_judge_invoked: false,
  };
}

/**
 * Classify a batch of inputs. Convenience wrapper over classifyFailure.
 */
export async function classifyFailureBatch(
  inputs: readonly ClassifierInput[],
  opts: ClassifierOptions = {},
): Promise<readonly FailureClassification[]> {
  const out: FailureClassification[] = [];
  for (const inp of inputs) {
    out.push(await classifyFailure(inp, opts));
  }
  return out;
}

/**
 * Compute per-category counts from a list of classifications.
 */
export function failureDistribution(
  classifications: readonly FailureClassification[],
): Readonly<Record<FailureCategory, number>> {
  const dist: Record<FailureCategory, number> = {
    thinking_leakage: 0,
    correct_answer_with_extra_text: 0,
    unknown_false_negative: 0,
    metadata_copy: 0,
    format_violation: 0,
    punctuation_or_case_only: 0,
    wrong_span: 0,
    wrong_entity: 0,
    hallucination: 0,
    retrieval_or_harness_error: 0,
  };
  for (const c of classifications) {
    dist[c.primary] += 1;
  }
  return dist;
}

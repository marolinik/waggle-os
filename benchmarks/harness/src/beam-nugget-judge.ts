/**
 * BEAM graded "nugget" judge — a faithful TypeScript port of mem0's
 * `benchmarks/beam/prompts.py` + the scoring logic in `benchmarks/beam/run.py`
 * (github.com/mem0ai/memory-benchmarks). This is the judge behind the published
 * BEAM SOTA (Avg Score 0.641 @ 1M), so replicating it exactly is what makes our
 * numbers comparable to that leaderboard.
 *
 * KEY PROTOCOL FACTS (pinned from the mem0 source):
 *   - Each probing question carries a `rubric`: an ordered list of "nuggets".
 *   - Each nugget is judged INDEPENDENTLY on a 3-point scale {0.0, 0.5, 1.0}.
 *   - The per-question score = arithmetic MEAN of its nugget scores.
 *   - "Pass" = per-question score >= 0.5.  "Avg Score" = mean of question scores.
 *   - event_ordering ALSO computes a Kendall tau-b blend into `score_with_tau`,
 *     but — verified against mem0's `compute_beam_metrics` — the HEADLINE Avg
 *     Score aggregates the plain nugget-mean `score` for EVERY ability,
 *     including event_ordering. `score_with_tau` is an auxiliary diagnostic and
 *     is NOT what 0.641 measures. We preserve that behaviour here.
 *
 * The judge itself is transport-agnostic: it takes a `BeamLlm` (see
 * beam-openai-client.ts for the gpt-4o implementation the official protocol
 * uses). Metrics aggregation lives in beam-metrics.ts.
 */

// ── LLM transport contract ─────────────────────────────────────────────────

export interface BeamLlmResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  /** null = OK; otherwise a short failure classification. */
  failureMode: string | null;
  /** Prompt-caching economics (Anthropic via OpenRouter): tokens served from
   *  cache (cheap) and tokens written to cache (surcharged). Absent when the
   *  provider/route reports no cache usage. */
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface BeamLlm {
  /**
   * Single-turn completion. When `jsonMode` is true the client should ask the
   * provider for a JSON object (OpenAI `response_format: {type:'json_object'}`)
   * so the judge's `{score, reason}` parses reliably.
   */
  chat(opts: { system: string; user: string; jsonMode?: boolean; maxTokens?: number }): Promise<BeamLlmResult>;
}

// ── Prompt constants (verbatim from mem0 prompts.py) ────────────────────────

export const BEAM_JUDGE_SYSTEM_PROMPT =
  'You are an expert evaluator assessing whether an AI assistant\'s response satisfies ' +
  'specific rubric criteria. You must be objective, fair, and consistent. ' +
  'Return ONLY valid JSON with the exact format requested.';

/** Build the single-nugget judge prompt (mem0 `get_beam_nugget_judge_prompt`). */
export function buildNuggetJudgePrompt(question: string, nugget: string, llmResponse: string): string {
  return `Evaluate whether the following LLM response demonstrates compliance with the specified RUBRIC CRITERION.

QUESTION:
${question}

LLM RESPONSE:
${llmResponse}

RUBRIC CRITERION:
${nugget}

SCORING GUIDELINES:

First, determine whether the rubric criterion is a POSITIVE requirement (the response SHOULD include something) or a NEGATIVE constraint (the response SHOULD NOT include something).

**For POSITIVE requirements** (response should contain, mention, or demonstrate something):
- **1.0 (Complete Compliance)**: The required element is present, accurate, and complete. The response fully and clearly satisfies the rubric criterion.
- **0.5 (Partial Compliance)**: The required element is partially present, has minor inaccuracies, or is incomplete. The core intent is present but not fully realized.
- **0.0 (No Compliance)**: The required element is missing, incorrect, or the response is entirely off-topic / non-responsive.

**For NEGATIVE constraints** (response should NOT contain or should avoid something):
- **1.0 (Complete Compliance)**: The response is responsive to the question AND the prohibited element is absent.
- **0.5 (Partial Compliance)**: The response is responsive but contains a borderline or ambiguous reference to the prohibited element.
- **0.0 (No Compliance)**: The prohibited element is present in the response, OR the response is non-responsive (off-topic, refusal, empty).

**Compound statement handling**: If the rubric criterion contains "and" or commas connecting multiple required elements:
- All elements present and correct = 1.0
- Some (but not all) elements present and correct = 0.5
- No elements present or correct = 0.0

EVALUATION RULES:
1. **Semantic tolerance**: Paraphrases and synonyms are acceptable. The response does not need to use the exact same words as the rubric.
2. **Numeric and date equivalence**: Treat equivalent representations as identical. "$68,000" = "68k" = "sixty-eight thousand dollars". "2 years" = "24 months". Prefer normalized comparison for numbers, currencies, dates, and durations.
3. **Case / punctuation / whitespace tolerance**: Differences in capitalization, punctuation, and whitespace must be ignored when comparing content.
4. **Hedging tolerance**: Do not penalize hedging language ("I think", "probably", "it seems"), passive voice, or verbosity if the substantive content satisfies the rubric criterion.
5. **Style neutrality**: Do not penalize for tone, formatting, or length unless the rubric criterion specifically requires a particular format.
6. **Responsiveness**: If the LLM response is completely off-topic or refuses to answer, score 0.0 for all criteria.
7. **Independence**: Evaluate this criterion in isolation — do not consider other rubric items.
8. **Specificity matters**: Vague or generic answers that could apply to any question score lower than specific, detailed answers.

STEP-BY-STEP EVALUATION:
Follow these steps in order:
1. **Understand the Requirement**: Read the rubric criterion and classify it as a positive requirement or a negative constraint.
2. **Parse Compound Statements**: If the criterion contains multiple sub-requirements joined by "and" or commas, identify each element separately.
3. **Check Compliance**: Compare the LLM response against each element, applying the tolerance rules above (semantic, numeric, case, hedging).
4. **Assign Score**: Use the appropriate scoring table (positive or negative) and compound-statement rule to determine the score.
5. **Provide Reasoning**: Write a concise explanation referencing which elements were or were not satisfied.

Return your evaluation as a JSON object with exactly two fields:
{"score": <0.0 or 0.5 or 1.0>, "reason": "<one concise sentence explaining your score>"}`;
}

/** Answer-generation prompt (mem0 `get_beam_answer_generation_prompt`).
 *  `memories` are pre-formatted display strings, oldest-first. For the
 *  no-context cell pass an empty array → "(No memories available)". */
export function buildAnswerGenerationPrompt(question: string, memories: string[]): string {
  const memoriesText =
    memories.length === 0
      ? '(No memories available)'
      : memories.map((m, i) => `${i + 1}. ${m}`).join('\n');
  return `You are an AI assistant with access to stored memories from prior conversations with a user.
Use these memories to answer the following question as accurately and completely as possible.

IMPORTANT RULES:
1. Scan ALL provided memories before answering — do not stop after the first relevant one.
2. If multiple memories contain relevant information, combine and cross-reference them.
3. If the memories contain contradictory information, prefer the more recent one.
4. If the memories don't contain enough information to answer, say exactly: "I don't have enough information to answer this question."
5. For temporal questions: pay attention to dates and relative time references.
6. For ordering questions: present events in chronological order.
7. For preference questions: use the most recently stated preference.
8. Be specific and direct — include exact names, dates, numbers, and details from the memories.
9. Do NOT invent or assume information that isn't in the memories.

QUESTION: ${question}

RETRIEVED MEMORIES:
${memoriesText}

ANSWER:`;
}

/** Answer-generation prompt — Option A variant (v2). Same skeleton as
 *  `buildAnswerGenerationPrompt`; ONLY the contradiction rule is rewritten and a
 *  negation/"never happened" rule is added. All other rules are verbatim v1.
 *  Pair with date-stamped `memories` ("[YYYY-MM-DD] role: ...") so the
 *  contradiction rule can surface each statement with its date. */
export function buildAnswerGenerationPromptV2(question: string, memories: string[], outline?: string, beliefsBlock?: string): string {
  const memoriesText =
    memories.length === 0
      ? '(No memories available)'
      : memories.map((m, i) => `${i + 1}. ${m}`).join('\n');
  // `outline` is a generic pre-labeled preamble: the CALLER builds the labeled
  // block(s) (timeline, standing directives, ...) and this just inserts them.
  const outlineBlock = outline ? `\n${outline}\n` : '';
  // `beliefsBlock` is an ADDITIVE consolidated "current values" section built by
  // the belief cell (real supersede/consolidation code). Placed BEFORE the raw
  // turns so the model prefers the latest known value on a conflict, while the
  // raw dated turns remain for detail. When absent the prompt is BYTE-IDENTICAL
  // to the original v2 (both `beliefsSection` and `outlineBlock` collapse to '').
  const beliefsSection = beliefsBlock ? `\n${beliefsBlock}\n` : '';
  return `You are an AI assistant with access to stored memories from prior conversations with a user.
Use these memories to answer the following question as accurately and completely as possible.

IMPORTANT RULES:
1. Scan ALL provided memories before answering — do not stop after the first relevant one.
2. If multiple memories contain relevant information, combine and cross-reference them.
3. If the memories contain contradictory statements relevant to the question, do NOT silently pick one: explicitly state that there is contradictory information, present each of the conflicting statements (with their dates when shown), and ask the user which statement is correct.
4. If a memory explicitly states that something never happened, was never done, or was not completed, treat that as real information: answer accordingly (e.g., "No — you mentioned that you never ..."), citing that memory. Do NOT respond that you lack information when such a statement exists.
5. If the memories don't contain enough information to answer, say exactly: "I don't have enough information to answer this question."
6. For temporal questions: pay attention to dates and relative time references.
7. For ordering questions: present events in chronological order.
8. For preference questions: use the most recently stated preference.
9. Be specific and direct — include exact names, dates, numbers, and details from the memories.
10. Do NOT invent or assume information that isn't in the memories.

QUESTION: ${question}
${beliefsSection}${outlineBlock}
RETRIEVED MEMORIES:
${memoriesText}

ANSWER:`;
}

/** v3 = v2 with a rebalanced abstention guard: Rule 4 keeps the anti-wrongful-IDK
 *  behaviour but drops its aggressive final clause, and Rule 5 gains an explicit
 *  "no relevant memory at all → abstain, never guess" instruction — gpt-5 under
 *  v2 over-answers questions it should decline (abstention 0.40-0.47 vs 0.60 v1).
 *  Takes the same optional outline block as v2. */
export function buildAnswerGenerationPromptV3(question: string, memories: string[], outline?: string): string {
  const memoriesText =
    memories.length === 0
      ? '(No memories available)'
      : memories.map((m, i) => `${i + 1}. ${m}`).join('\n');
  // `outline` is a generic pre-labeled preamble: the CALLER builds the labeled
  // block(s) (timeline, standing directives, ...) and this just inserts them.
  const outlineBlock = outline ? `\n${outline}\n` : '';
  return `You are an AI assistant with access to stored memories from prior conversations with a user.
Use these memories to answer the following question as accurately and completely as possible.

IMPORTANT RULES:
1. Scan ALL provided memories before answering — do not stop after the first relevant one.
2. If multiple memories contain relevant information, combine and cross-reference them.
3. If the memories contain contradictory statements relevant to the question, do NOT silently pick one: explicitly state that there is contradictory information, present each of the conflicting statements (with their dates when shown), and ask the user which statement is correct.
4. If a memory explicitly states that something never happened, was never done, or was not completed, treat that as real information: answer accordingly (e.g., "No — you mentioned that you never ..."), citing that memory.
5. Answer ONLY what the memories support. If no memory (and nothing in the timeline) contains information about the asked fact, you MUST say exactly: "I don't have enough information to answer this question." Never guess, infer unstated facts, or answer from general knowledge.
6. For temporal questions: pay attention to dates and relative time references.
7. For ordering questions: present events in chronological order.
8. For preference questions: use the most recently stated preference.
9. Be specific and direct — include exact names, dates, numbers, and details from the memories.
10. Do NOT invent or assume information that isn't in the memories.

QUESTION: ${question}
${outlineBlock}
RETRIEVED MEMORIES:
${memoriesText}

ANSWER:`;
}

/** v4 = v2 with a uniform, conditional exhaustiveness rule. Byte-identical to
 *  `buildAnswerGenerationPromptV2` EXCEPT a new rule 10 (renumbering v2's rule 10
 *  → 11) that tells the model to be EXHAUSTIVE for summary / overview / process /
 *  event-list questions and to answer at normal length otherwise. Motivated by
 *  the BEAM forensics: on summarization / event_ordering / multi_session_reasoning
 *  mem0's ~1.8× longer, clause-dense answers harvest compound rubric nuggets where
 *  our shorter answers score 0.5. Takes the same optional outline block as v2. */
export function buildAnswerGenerationPromptV4(question: string, memories: string[], outline?: string): string {
  const memoriesText =
    memories.length === 0
      ? '(No memories available)'
      : memories.map((m, i) => `${i + 1}. ${m}`).join('\n');
  // `outline` is a generic pre-labeled preamble: the CALLER builds the labeled
  // block(s) (timeline, standing directives, ...) and this just inserts them.
  const outlineBlock = outline ? `\n${outline}\n` : '';
  return `You are an AI assistant with access to stored memories from prior conversations with a user.
Use these memories to answer the following question as accurately and completely as possible.

IMPORTANT RULES:
1. Scan ALL provided memories before answering — do not stop after the first relevant one.
2. If multiple memories contain relevant information, combine and cross-reference them.
3. If the memories contain contradictory statements relevant to the question, do NOT silently pick one: explicitly state that there is contradictory information, present each of the conflicting statements (with their dates when shown), and ask the user which statement is correct.
4. If a memory explicitly states that something never happened, was never done, or was not completed, treat that as real information: answer accordingly (e.g., "No — you mentioned that you never ..."), citing that memory. Do NOT respond that you lack information when such a statement exists.
5. If the memories don't contain enough information to answer, say exactly: "I don't have enough information to answer this question."
6. For temporal questions: pay attention to dates and relative time references.
7. For ordering questions: present events in chronological order.
8. For preference questions: use the most recently stated preference.
9. Be specific and direct — include exact names, dates, numbers, and details from the memories.
10. When the question asks for a comprehensive summary, an overview, an account of a process or journey, or a list or ordering of events: be EXHAUSTIVE. Enumerate every relevant topic, project, event, and discussion found in the memories, and for each include the specific details mentioned — tools, versions, numbers, dates, causes, outcomes, and sub-steps. Prefer complete, clause-dense coverage in a structured list over brevity; do not omit minor items. For all other questions, answer at normal length.
11. Do NOT invent or assume information that isn't in the memories.

QUESTION: ${question}
${outlineBlock}
RETRIEVED MEMORIES:
${memoriesText}

ANSWER:`;
}

/** v5 = v2 with a conditional temporal-commit rule. Byte-identical to
 *  `buildAnswerGenerationPromptV2` EXCEPT a new rule 10 (renumbering v2's rule 10
 *  → 11) that forces the model to COMMIT to a single computed duration for
 *  time-span / days-between questions instead of over-abstaining or anchoring on
 *  the mention date. Motivated by the BEAM temporal_reasoning forensics: our gap
 *  vs mem0 (0.557 vs 0.618) is dominated by over-abstention + wrong-anchor on
 *  duration questions. Takes the same optional outline block as v2. */
export function buildAnswerGenerationPromptV5(question: string, memories: string[], outline?: string): string {
  const memoriesText =
    memories.length === 0
      ? '(No memories available)'
      : memories.map((m, i) => `${i + 1}. ${m}`).join('\n');
  // `outline` is a generic pre-labeled preamble: the CALLER builds the labeled
  // block(s) (timeline, standing directives, ...) and this just inserts them.
  const outlineBlock = outline ? `\n${outline}\n` : '';
  return `You are an AI assistant with access to stored memories from prior conversations with a user.
Use these memories to answer the following question as accurately and completely as possible.

IMPORTANT RULES:
1. Scan ALL provided memories before answering — do not stop after the first relevant one.
2. If multiple memories contain relevant information, combine and cross-reference them.
3. If the memories contain contradictory statements relevant to the question, do NOT silently pick one: explicitly state that there is contradictory information, present each of the conflicting statements (with their dates when shown), and ask the user which statement is correct.
4. If a memory explicitly states that something never happened, was never done, or was not completed, treat that as real information: answer accordingly (e.g., "No — you mentioned that you never ..."), citing that memory. Do NOT respond that you lack information when such a statement exists.
5. If the memories don't contain enough information to answer, say exactly: "I don't have enough information to answer this question."
6. For temporal questions: pay attention to dates and relative time references.
7. For ordering questions: present events in chronological order.
8. For preference questions: use the most recently stated preference.
9. Be specific and direct — include exact names, dates, numbers, and details from the memories.
10. When the question asks for a duration, time span, or number of days/weeks/months between two events: identify the single best-supported pair of dates in the memories (use the date the event actually happened or is scheduled FOR, not the date it was merely mentioned), COMMIT to one computed answer in the form 'N days — from <Month D, YYYY> to <Month D, YYYY>', and do not hedge with ranges or multiple candidate values. Only say you lack information if the memories contain no relevant dates at all.
11. Do NOT invent or assume information that isn't in the memories.

QUESTION: ${question}
${outlineBlock}
RETRIEVED MEMORIES:
${memoriesText}

ANSWER:`;
}

/** Answer-REPAIR prompt (E5 self-correction lever). Test-time, gold-blind second
 *  pass: it sees ONLY the question, the SAME retrieved dated context the drafter
 *  saw, and the draft answer — NO rubric, NO gold, NO nuggets. It rewrites the
 *  draft into a more complete, better-grounded answer:
 *    - fill coverage gaps (enumerate every relevant item/date/clause the context
 *      supports that the draft omitted) — BEAM grades on nugget coverage;
 *    - correct chronology / temporal anchors (event date, not mention date);
 *    - strip any claim the context does not support (no new facts);
 *    - PRESERVE correct abstentions — if the context genuinely lacks the answer,
 *      keep the exact sentinel and do not invent to look complete.
 *  Mirrors the V2 signature (optional outline + beliefsBlock) so the repair pass
 *  is grounded in the identical context the drafter received. */
export function buildRepairPrompt(
  question: string,
  memories: string[],
  draftAnswer: string,
  outline?: string,
  beliefsBlock?: string,
): string {
  const memoriesText =
    memories.length === 0
      ? '(No memories available)'
      : memories.map((m, i) => `${i + 1}. ${m}`).join('\n');
  const outlineBlock = outline ? `\n${outline}\n` : '';
  const beliefsSection = beliefsBlock ? `\n${beliefsBlock}\n` : '';
  return `You are a meticulous reviewer improving a draft answer to a question. You are given the question, the stored memories (dated, from prior conversations with the user) that were available, and a DRAFT ANSWER written from those memories. Your job is to return a single IMPROVED ANSWER that is more complete and better grounded — nothing else.

REPAIR RULES:
1. Ground everything ONLY in the provided memories (and any consolidated values/timeline shown). Do NOT add any fact, name, date, number, or claim that is not supported by the provided context. You have no outside knowledge of this user.
2. Improve COVERAGE: re-scan ALL memories and add every relevant item the draft missed. If the question asks for a summary, overview, account of a process/journey, or a list/ordering of events, be EXHAUSTIVE — enumerate every relevant topic, project, event, tool, version, number, date, cause, outcome, and sub-step the memories support. Do not drop minor items.
3. Fix accuracy: correct any wrong or unsupported statement in the draft. For dates and durations, anchor on the date the event actually happened or is scheduled FOR (not the date it was merely mentioned); present events in chronological order.
4. Handle contradictions honestly: if the memories contain conflicting statements relevant to the question, present each conflicting statement (with its date when shown) rather than silently picking one.
5. Remove hallucinations: delete anything in the draft that the memories do not support.
6. PRESERVE CORRECT ABSTENTION: if the memories genuinely do not contain the information asked, do NOT invent an answer to look more complete — return exactly: "I don't have enough information to answer this question." Conversely, if the memories DO support an answer but the draft wrongly abstained, replace the abstention with the supported answer.
7. Keep everything in the draft that is already correct and supported; this is a revision, not a rewrite from scratch.
8. Output ONLY the improved answer text — no preamble, no explanation of your changes, no mention of "the draft".

QUESTION: ${question}
${beliefsSection}${outlineBlock}
RETRIEVED MEMORIES:
${memoriesText}

DRAFT ANSWER:
${draftAnswer}

IMPROVED ANSWER:`;
}

/** Fact-extraction prompt for event_ordering (mem0 `get_beam_fact_extraction_prompt`). */
export function buildFactExtractionPrompt(response: string): string {
  return `Extract all distinct events or facts mentioned in the following response,
in the exact order they are presented. Return ONLY a JSON array of short event descriptions.

RESPONSE:
${response}

Return format: ["event 1 description", "event 2 description", ...]`;
}

/** Event-alignment prompt for event_ordering (mem0 `get_beam_event_alignment_prompt`). */
export function buildEventAlignmentPrompt(extractedEvent: string, rubricEvents: string[]): string {
  const eventsList = rubricEvents.map((e, i) => `${i}. ${e}`).join('\n');
  return `Given the following extracted event from an LLM response, determine which
reference event it best corresponds to. Return ONLY a JSON object.

EXTRACTED EVENT:
${extractedEvent}

REFERENCE EVENTS:
${eventsList}

If the extracted event matches one of the reference events (even approximately or paraphrased),
return the 0-based index. If it doesn't match any, return -1.

Return format: {"index": <integer>, "reason": "<brief explanation>"}`;
}

// ── Scoring primitives ──────────────────────────────────────────────────────

/** Clamp a raw judge score to 0.0 / 0.5 / 1.0 (mem0 `_clamp_nugget_score`). */
export function clampNuggetScore(raw: number): 0 | 0.5 | 1 {
  if (raw >= 0.75) return 1;
  if (raw >= 0.25) return 0.5;
  return 0;
}

/**
 * Parse the judge's `{score, reason}` JSON. Mirrors mem0's tolerant handling:
 * try JSON first (possibly wrapped in prose / fenced), then fall back to a
 * text search for "1.0" / "0.5". Returns a clamped score.
 */
export function parseNuggetJudgeOutput(text: string): { score: 0 | 0.5 | 1; reason: string } {
  const obj = tryExtractJsonObject(text);
  if (obj && typeof obj === 'object' && 'score' in obj) {
    const rawScore = Number((obj as Record<string, unknown>).score);
    if (Number.isFinite(rawScore)) {
      const reason = String((obj as Record<string, unknown>).reason ?? '');
      return { score: clampNuggetScore(rawScore), reason };
    }
  }
  // Fallback: look for a score token in the raw text.
  if (text.includes('1.0')) return { score: 1, reason: text.slice(0, 200) };
  if (text.includes('0.5')) return { score: 0.5, reason: text.slice(0, 200) };
  return { score: 0, reason: `Parse error: ${text.slice(0, 200)}` };
}

/** Best-effort JSON-object extraction: whole string, then first `{...}` span. */
function tryExtractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}

/** Best-effort JSON-array extraction (for fact extraction). */
function tryExtractJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim();
  try {
    const v = JSON.parse(trimmed);
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      for (const key of ['events', 'facts', 'result']) {
        const arr = (v as Record<string, unknown>)[key];
        if (Array.isArray(arr)) return arr;
      }
    }
  } catch {
    /* fall through */
  }
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try {
      const v = JSON.parse(trimmed.slice(start, end + 1));
      if (Array.isArray(v)) return v;
    } catch {
      /* fall through */
    }
  }
  return null;
}

// ── Kendall tau-b (verbatim port of mem0 common/metrics.py) ──────────────────

export function computeKendallTauB(predictedOrder: number[], referenceOrder: number[]): number {
  if (predictedOrder.length < 2 || referenceOrder.length < 2) return 0;

  const predRank = new Map<number, number>();
  predictedOrder.forEach((v, i) => predRank.set(v, i));
  const refRank = new Map<number, number>();
  referenceOrder.forEach((v, i) => refRank.set(v, i));

  const predSet = new Set(predictedOrder);
  const common = [...new Set(referenceOrder.filter(v => predSet.has(v)))].sort((a, b) => a - b);
  if (common.length < 2) return 0;

  let concordant = 0;
  let discordant = 0;
  let tiedPred = 0;
  let tiedRef = 0;
  for (let i = 0; i < common.length; i++) {
    for (let j = i + 1; j < common.length; j++) {
      const a = common[i];
      const b = common[j];
      const predDiff = (predRank.get(a) ?? 0) - (predRank.get(b) ?? 0);
      const refDiff = (refRank.get(a) ?? 0) - (refRank.get(b) ?? 0);
      if (predDiff === 0 && refDiff === 0) {
        tiedPred++;
        tiedRef++;
      } else if (predDiff === 0) {
        tiedPred++;
      } else if (refDiff === 0) {
        tiedRef++;
      } else if ((predDiff > 0 && refDiff > 0) || (predDiff < 0 && refDiff < 0)) {
        concordant++;
      } else {
        discordant++;
      }
    }
  }

  const n1 = concordant + discordant + tiedPred;
  const n2 = concordant + discordant + tiedRef;
  if (n1 === 0 || n2 === 0) return 0;
  return (concordant - discordant) / Math.sqrt(n1 * n2);
}

// ── Public judging API ───────────────────────────────────────────────────────

export interface NuggetScore {
  nugget: string;
  score: 0 | 0.5 | 1;
  reason: string;
}

export interface QuestionJudgement {
  /** Headline per-question score = mean of nugget scores (0..1). */
  score: number;
  /** PASS when score >= 0.5, else FAIL (mem0 pass threshold). */
  judgment: 'PASS' | 'FAIL' | 'ERROR';
  nuggetScores: NuggetScore[];
  /** event_ordering only: nugget-mean blended with normalized tau-b. Diagnostic
   *  — NOT used by the headline Avg Score metric. */
  scoreWithTau?: number;
  eventOrdering?: { tauB: number; predictedOrder: number[]; referenceOrder: number[] };
  /** Number of judge/extraction LLM calls made for this question (cost trace). */
  judgeCalls: number;
  error?: string;
}

/** Judge one rubric nugget via the LLM. */
export async function judgeSingleNugget(
  llm: BeamLlm,
  question: string,
  nugget: string,
  answer: string,
): Promise<{ score: 0 | 0.5 | 1; reason: string; result: BeamLlmResult }> {
  const result = await llm.chat({
    system: BEAM_JUDGE_SYSTEM_PROMPT,
    user: buildNuggetJudgePrompt(question, nugget, answer),
    jsonMode: true,
    maxTokens: 300,
  });
  const parsed = parseNuggetJudgeOutput(result.text);
  return { ...parsed, result };
}

/** Compute event_ordering Kendall tau-b for a generated answer (mem0
 *  `compute_event_ordering_score`). Returns tau plus the LLM results used. */
export async function computeEventOrderingScore(
  llm: BeamLlm,
  rubricNuggets: string[],
  answer: string,
): Promise<{ tauB: number; predictedOrder: number[]; referenceOrder: number[]; results: BeamLlmResult[] }> {
  const results: BeamLlmResult[] = [];
  const extract = await llm.chat({
    system: 'Extract events as a JSON array of strings.',
    user: buildFactExtractionPrompt(answer),
    jsonMode: true,
    maxTokens: 500,
  });
  results.push(extract);
  const extractedEvents = (tryExtractJsonArray(extract.text) ?? []).map(e => String(e));

  if (extractedEvents.length === 0 || rubricNuggets.length === 0) {
    return { tauB: 0, predictedOrder: [], referenceOrder: [], results };
  }

  const predictedIndices: number[] = [];
  for (const event of extractedEvents) {
    const align = await llm.chat({
      system: 'Align the event to a reference event index. Return JSON.',
      user: buildEventAlignmentPrompt(event, rubricNuggets),
      jsonMode: true,
      maxTokens: 120,
    });
    results.push(align);
    const obj = tryExtractJsonObject(align.text) as Record<string, unknown> | null;
    let idx = -1;
    if (obj && 'index' in obj) {
      const n = Number(obj.index);
      if (Number.isFinite(n)) idx = Math.trunc(n);
    }
    if (idx >= 0 && idx < rubricNuggets.length) predictedIndices.push(idx);
  }

  const referenceOrder = rubricNuggets.map((_, i) => i);
  const tauB = computeKendallTauB(predictedIndices, referenceOrder);
  return { tauB: round4(tauB), predictedOrder: predictedIndices, referenceOrder, results };
}

export interface JudgeQuestionInput {
  question: string;
  rubric: string[];
  memoryAbility: string;
  answer: string;
}

/**
 * Judge a full question: score every rubric nugget, average, and (for
 * event_ordering) additionally compute the tau-b blend. Mirrors the per-question
 * portion of mem0's `process_question`.
 */
export async function judgeQuestion(
  llm: BeamLlm,
  input: JudgeQuestionInput,
  opts: { computeTau?: boolean } = {},
): Promise<{ judgement: QuestionJudgement; llmResults: BeamLlmResult[] }> {
  const llmResults: BeamLlmResult[] = [];

  if (input.rubric.length === 0) {
    return {
      judgement: {
        score: 0,
        judgment: 'ERROR',
        nuggetScores: [],
        judgeCalls: 0,
        error: 'No rubric nuggets found',
      },
      llmResults,
    };
  }

  const nuggetScores: NuggetScore[] = [];
  let judgeFailures = 0;
  for (const nugget of input.rubric) {
    const ns = await judgeSingleNugget(llm, input.question, nugget, input.answer);
    llmResults.push(ns.result);
    // A transport failure (http_429/timeout/etc.) or an empty completion means
    // the JUDGE broke — not that the answer scored 0. Recording 0 here would
    // silently corrupt the metric, so flag it and let the caller retry / hard-fail.
    if (ns.result.failureMode || ns.result.text.trim() === '') judgeFailures++;
    nuggetScores.push({ nugget, score: ns.score, reason: ns.reason });
  }

  if (judgeFailures > 0) {
    return {
      judgement: {
        score: 0,
        judgment: 'ERROR',
        nuggetScores,
        judgeCalls: nuggetScores.length,
        error: `judge transport failure on ${judgeFailures}/${nuggetScores.length} nuggets`,
      },
      llmResults,
    };
  }

  const avg = nuggetScores.reduce((s, n) => s + n.score, 0) / nuggetScores.length;
  const judgement: QuestionJudgement = {
    score: round4(avg),
    judgment: avg >= 0.5 ? 'PASS' : 'FAIL',
    nuggetScores,
    judgeCalls: nuggetScores.length,
  };

  // event_ordering: auxiliary tau-b blend (NOT part of the headline metric).
  if (input.memoryAbility === 'event_ordering' && opts.computeTau) {
    const eo = await computeEventOrderingScore(llm, input.rubric, input.answer);
    llmResults.push(...eo.results);
    judgement.judgeCalls += eo.results.length;
    judgement.eventOrdering = { tauB: eo.tauB, predictedOrder: eo.predictedOrder, referenceOrder: eo.referenceOrder };
    const tauNormalized = (eo.tauB + 1) / 2; // map [-1,1] -> [0,1]
    judgement.scoreWithTau = round4((avg + tauNormalized) / 2);
  }

  return { judgement, llmResults };
}

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

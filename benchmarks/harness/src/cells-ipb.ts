/**
 * hive_mind_ipb cell — extends the `retrieval` cell with I/P/B frame writes.
 *
 * CellName extension note
 * ───────────────────────
 * `hive_mind_ipb` is NOT part of the existing `CellName` union defined in
 * `src/types.ts`. Callers that need to dispatch this cell alongside the
 * canonical 7-cell set must use the extended union:
 *
 *   import type { CellName } from './types.js';
 *   export type ExtendedCellName = CellName | 'hive_mind_ipb';
 *
 * The runner's `isCellName()` guard in `cells.ts` will return `false` for
 * `'hive_mind_ipb'`; callers must add their own dispatch branch:
 *
 *   if (cellName === 'hive_mind_ipb') {
 *     result = await hiveMindIpbCell({ ... });
 *   } else {
 *     result = await cells[cellName as CellName]({ ... });
 *   }
 *
 * v8 cell-layout mapping:
 *   no-memory-baseline   → existing `no-context` cell (no change)
 *   hive_mind_retrieval  → existing `retrieval` cell  (no change)
 *   hive_mind_ipb        → this file (new)
 *   hive_mind_ipb_strong → same as hive_mind_ipb, different model (CLI-level)
 *
 * What this cell adds on top of `retrieval`:
 *
 *   1. BEFORE retrieval: write a P-frame recording the agent's query intent.
 *      content: `"Retrieving to answer: ${instance.question}"`
 *      source: 'agent_inferred'
 *
 *   2. Run HybridSearch retrieval — identical to `retrieval` cell (top-K=20,
 *      scoped to gopId when `instance.conversation_id` is present).
 *
 *   3. CONTRADICTION CHECK (lightweight, single LLM call):
 *      If ≥1 existing P-frame for this gopId exists in the substrate (i.e.
 *      this is not the first question in the conversation), ask the subject
 *      LLM whether any retrieved frame content significantly contradicts a
 *      prior P-frame. When the check fires and the LLM detects a conflict,
 *      write a B-frame recording the conflict. The check is skipped on the
 *      first question per conversation (no prior P-frames yet).
 *
 *   4. Build the answer prompt using the `# Recalled Memories` block —
 *      identical to the `retrieval` cell.
 *
 *   5. Call the LLM for the answer — identical to `retrieval`.
 *
 *   6. AFTER answering: write an I-frame for this Q-A turn:
 *      content: `"Q: ${instance.question} A: ${answer}"`
 *      source: 'import'
 *
 * The P-frame and I-frame written here enrich future retrievals for later
 * questions in the same conversation (the same substrate is reused across
 * instances within a run).
 *
 * Cost profile: 1–2 extra LLM calls per instance when contradiction check
 * fires (P-frames exist). The check call uses the cell's `LlmClient` with
 * a short prompt; it does NOT route through the agentic agent-loop.
 *
 * Style: matches `cells.ts` exactly — same imports, same error patterns,
 * same `formatRecalledMemories` block format, same system-prompt builder.
 */

import type { DatasetInstance, ModelSpec, CellName } from './benchmarks/harness/src/types.js';
import type { LlmClient, LlmCallResult } from './benchmarks/harness/src/llm.js';
import type { Substrate } from './benchmarks/harness/src/substrate.js';
import type { SearchResult } from '@waggle/core';
import type { MemoryFrame } from '@waggle/core';

// ── CellName extension ────────────────────────────────────────────────────────

/** Extended cell-name union that includes the IPB cell.
 *  Callers must use this type when building dispatch tables that include
 *  `hive_mind_ipb` alongside the canonical `CellName` set. */
export type ExtendedCellName = CellName | 'hive_mind_ipb';

// ── CellFn re-export (for standalone use without cells.ts import) ─────────────

/** Identical to `CellFn` in `cells.ts` — repeated here so `cells-ipb.ts` is
 *  importable without depending on the full `cells.ts` module. */
export interface CellInput {
  instance: DatasetInstance;
  model: ModelSpec;
  llm: LlmClient;
  turnId: string;
  /** Memory substrate — required by this cell; throws loudly when absent. */
  substrate?: Substrate;
  /** LiteLLM routing — used by agentic cell; accepted here for interface parity
   *  but not used (IPB routes all LLM calls through `llm: LlmClient`). */
  litellm?: { url: string; apiKey: string };
  /** Retrieval top-K. Default 20 (Stage 2-Retry §1.2). */
  retrievalTopK?: number;
  /** Unused by this cell — present for interface symmetry. */
  agenticMaxTurns?: number;
  /** Unused by this cell — present for interface symmetry. */
  agenticTimeoutMs?: number;
}

export type CellFn = (input: CellInput) => Promise<LlmCallResult>;

// ── Shared helpers (mirrors cells.ts) ────────────────────────────────────────

const FACTOID_BASELINE_PERSONA = 'short-answer factoid QA agent';

/** Inline selectShape — avoids importing cells.ts to keep this file self-contained.
 *  Falls back to a simple system-prompt wrapper that works with any model shape. */
function buildSystemPrompt(persona: string): string {
  return `You are a ${persona}. Answer questions concisely. Output the answer span only — no sentences, no preamble.`;
}

/** Format a HybridSearch result list into the `# Recalled Memories` block —
 *  identical to `formatRecalledMemories` in `cells.ts`. */
function formatRecalledMemories(results: readonly SearchResult[]): string {
  if (results.length === 0) {
    return '# Recalled Memories\n(none)';
  }
  const lines = results.map(r => {
    const score = r.finalScore.toFixed(3);
    const source = r.frame.source ?? 'user_stated';
    return `- [memory:${r.frame.gop_id}:${r.frame.id} score=${score} src=${source}] ${r.frame.content}`;
  });
  return `# Recalled Memories\n${lines.join('\n')}`;
}

function assertSubstrate(cellName: string, substrate: Substrate | undefined): asserts substrate is Substrate {
  if (!substrate) {
    throw new Error(
      `cells.${cellName} requires a Substrate dependency. Construct it via ` +
      `createSubstrate({embedder}) and pass it in CellInput.substrate. See ` +
      `benchmarks/harness/src/substrate.ts.`,
    );
  }
}

// ── Contradiction-check prompt ────────────────────────────────────────────────

/** System prompt for the lightweight contradiction-check call (step 3).
 *  Instructs the model to return a structured one-line verdict — keeps
 *  post-processing trivial. */
const SYSTEM_CONTRADICTION_CHECK =
  'You are a consistency checker. You are given a list of prior prediction ' +
  'statements and a list of retrieved memory excerpts. ' +
  'Respond with EXACTLY one line in the format: ' +
  'CONFLICT: <short description> OR NO_CONFLICT — no other text. ' +
  'A conflict exists only when a retrieved excerpt directly contradicts ' +
  'a specific factual claim in a prior prediction (same entity, incompatible values). ' +
  'Superficial overlap or topic similarity is NOT a conflict.';

function buildContradictionCheckPrompt(
  priorPFrames: readonly MemoryFrame[],
  retrievedResults: readonly SearchResult[],
): string {
  const priors = priorPFrames
    .map((f, i) => `[prior_${i + 1}] ${f.content}`)
    .join('\n');
  const retrieved = retrievedResults
    .slice(0, 10)  // limit to first 10 retrieved frames to keep the prompt short
    .map((r, i) => `[retrieved_${i + 1}] ${r.frame.content}`)
    .join('\n');
  return (
    '## Prior predictions\n' + priors +
    '\n\n## Retrieved memories\n' + retrieved +
    '\n\nDo any retrieved memories directly contradict any prior prediction? ' +
    'Respond with CONFLICT: <description> or NO_CONFLICT.'
  );
}

// ── hive_mind_ipb cell ────────────────────────────────────────────────────────

/**
 * `hive_mind_ipb` — retrieval cell extended with I/P/B frame writes.
 *
 * Step-by-step (see module-level doc for full rationale):
 *
 *   1. Assert substrate present.
 *   2. Write a P-frame: "Retrieving to answer: <question>".
 *   3. Run HybridSearch (top-K=20, gopId-scoped).
 *   4. Contradiction check (if prior P-frames exist):
 *        - Single LLM call with SYSTEM_CONTRADICTION_CHECK.
 *        - If response starts with "CONFLICT:", write a B-frame.
 *   5. Build answer prompt (`# Recalled Memories` block + question).
 *   6. LLM answer call.
 *   7. Write I-frame: "Q: <question> A: <answer>".
 *   8. Return `LlmCallResult` (tokens and cost aggregated across all LLM calls).
 */
export const hiveMindIpbCell: CellFn = async ({
  instance,
  model,
  llm,
  turnId: _turnId,
  substrate,
  retrievalTopK,
}: CellInput): Promise<LlmCallResult> => {
  assertSubstrate('hive_mind_ipb', substrate);

  const gopId = instance.conversation_id;
  const limit = retrievalTopK ?? 20;
  const searchOpts: { limit: number; gopId?: string } = { limit };
  if (gopId) searchOpts.gopId = gopId;

  const started = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;

  // ── Step 1: Write P-frame (query intent) ─────────────────────────────────
  // Source 'agent_inferred' — this is a predicted/planned retrieval, not
  // imported data. The P-frame enriches future retrievals: other questions
  // in the same conversation will see this frame when their retrieval
  // scans the gopId.
  //
  // `createPFrame` requires a `baseFrameId` (the I-frame this P-frame
  // predicts an update to). We use the latest I-frame for this gopId as
  // the base; if none exists yet (very first ingest of this conversation),
  // we fall back to `createIFrame` with source='agent_inferred' so the
  // frame still lands in the substrate.
  let pFrame: MemoryFrame;
  const latestI = substrate.frames.getLatestIFrame(gopId ?? '_global');
  if (latestI) {
    pFrame = substrate.frames.createPFrame(
      gopId ?? '_global',
      `Retrieving to answer: ${instance.question}`,
      latestI.id,
      'normal',
      'agent_inferred',
    );
  } else {
    // No I-frame yet — use createIFrame as a fallback so the P-frame intent
    // still lands in the substrate. source='agent_inferred' marks it as a
    // predicted frame even though the frame_type will be 'I'.
    pFrame = substrate.frames.createIFrame(
      gopId ?? '_global',
      `Retrieving to answer: ${instance.question}`,
      'normal',
      'agent_inferred',
    );
  }

  // ── Step 2: HybridSearch retrieval ───────────────────────────────────────
  const results = await substrate.search.search(instance.question, searchOpts);

  // ── Step 3: Contradiction check ──────────────────────────────────────────
  // Only fires when ≥1 prior P-frame exists for this gopId. That means: skip
  // the check on the very first question in a conversation (the P-frame we
  // just wrote is the only P-frame; checking for conflicts with itself would
  // be noise). We look for P-frames that predate the one we just created.
  let bFrame: MemoryFrame | null = null;
  if (gopId) {
    // Fetch all P-type frames for this conversation that existed BEFORE
    // the one we just wrote (t < pFrame.t). getPFramesSinceLastI returns
    // P-frames since the latest I-frame; we filter to those older than pFrame.
    const allGopFrames = substrate.frames.getGopFrames(gopId);
    const priorPFrames = allGopFrames.filter(
      f => f.frame_type === 'P' && f.id !== pFrame.id && f.t < pFrame.t,
    );

    if (priorPFrames.length > 0 && results.length > 0) {
      const checkPrompt = buildContradictionCheckPrompt(priorPFrames, results);
      let checkResult: LlmCallResult;
      try {
        checkResult = await llm.call({
          model,
          systemPrompt: SYSTEM_CONTRADICTION_CHECK,
          userPrompt: checkPrompt,
        });
        totalInputTokens += checkResult.inputTokens;
        totalOutputTokens += checkResult.outputTokens;
        totalCostUsd += checkResult.costUsd;

        const verdict = checkResult.text.trim();
        if (verdict.startsWith('CONFLICT:')) {
          // Write B-frame: references the P-frame we wrote (base) and the
          // retrieved frame ids that triggered the conflict.
          const conflictDescription = verdict.slice('CONFLICT:'.length).trim();
          const referencedIds = results.slice(0, 5).map(r => r.frame.id);
          bFrame = substrate.frames.createBFrame(
            gopId,
            conflictDescription,
            pFrame.id,
            referencedIds,
          );
        }
      } catch {
        // Contradiction check is best-effort — a failure here must not abort
        // the answer generation. Swallow silently (consistent with the agentic
        // cell's error-swallow pattern for non-fatal sub-steps).
      }
    }
  }
  // bFrame is written to substrate; no further action required unless callers
  // want to surface it. Suppressing unused-variable warning:
  void bFrame;

  // ── Step 4: Build answer prompt and call LLM ─────────────────────────────
  const memoryBlock = formatRecalledMemories(results);
  const userPrompt = `${memoryBlock}\n\nQuestion: ${instance.question}`;

  const answerResult = await llm.call({
    model,
    systemPrompt: buildSystemPrompt(FACTOID_BASELINE_PERSONA),
    userPrompt,
  });
  totalInputTokens += answerResult.inputTokens;
  totalOutputTokens += answerResult.outputTokens;
  totalCostUsd += answerResult.costUsd;
  const answer = answerResult.text;

  // ── Step 5: Write I-frame for this Q-A turn ───────────────────────────────
  // Stores the question + answer so future questions in the same conversation
  // can retrieve it. source='import' matches the bulk-ingest frames so
  // retrieval ranking treats Q-A frames at parity with original turn frames.
  substrate.frames.createIFrame(
    gopId ?? '_global',
    `Q: ${instance.question} A: ${answer}`,
    'normal',
    'import',
  );

  // ── Aggregate and return ──────────────────────────────────────────────────
  const latencyMs = Date.now() - started;
  return {
    text: answer,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    latencyMs,
    costUsd: totalCostUsd,
    failureMode: answerResult.failureMode,
  };
};

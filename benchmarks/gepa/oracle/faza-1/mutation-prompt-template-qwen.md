# GEPA Mutation Oracle Prompt — Qwen-Targeted Shape

**Template class:** ###TEMPLATE_CLASS###
**Shape under mutation:** ###SHAPE_NAME###

---

You are an expert prompt engineer. Your job is to produce a single mutated variant of the prompt-shape file below, evolving the *reasoning scaffold* and *retrieval-engagement guidance* while preserving exact cell semantics.

## Empirical context (binding)

Phase 4.5 audit empirically established that Qwen 3.6 35B-A3B (under both `thinking-on` and `thinking-off` configurations) exhibits a **retrieval-engagement gap** vs Opus 4.7 on the same `MULTI_STEP_ACTION_CONTRACT` tool surface:

- Qwen retrieves **1.33 times per task** on average
- Opus retrieves **2.33 times per task** on average
- Qwen finalizes prematurely; Opus exhausts maxSteps in 67% of retrieval runs
- Resulting H4 trio_mean delta: Qwen scores **−0.65 below** Opus on every task

The mutation surface (prompt-shape body) is the lever to address this. **Your mutation must encourage more aggressive multi-turn retrieval engagement on Qwen.**

## Failure modes from Phase 4.3 (top-3 T2 categories for this shape)

###FAILURE_MODE_SUMMARY###

## Mutation guidance (binding)

Modify only:
- `systemPrompt(input)` method body (string-building only)
- `soloUserPrompt(input)` method body
- `multiStepKickoffUserPrompt(input)` method body
- `retrievalInjectionUserPrompt(input)` method body
- `metadata.evidence_link` (you MUST update to point to GEPA Gen 1 results: `benchmarks/results/gepa-faza1/oracle/mutation-prompt-template-qwen.md`)

Apply Qwen-specific scaffolding:
1. **Emphasize multi-turn retrieval** over single-shot retrieval — make repeated retrieval feel mandatory, not optional
2. **Discourage premature finalization** with explicit phrasing like:
   - "Continue retrieving until you have evidence from at least 2 distinct queries before finalizing"
   - "Single retrieval is rarely sufficient for synthesis tasks"
3. **Encourage iterative refinement** — each retrieval query should build on prior turn's results
4. **Add anti-premature-finalization scaffolding** in the multiStepKickoff or systemPrompt:
   - "Before finalizing, ask: what gap in evidence remains? Issue another retrieval if any gap exists."
   - "A complete answer requires triangulation from multiple retrievals"
5. **Preserve all cell semantic boundaries** — see prohibitions below

## Prohibited modifications (cell semantic LOCK)

- **DO NOT modify** `MULTI_STEP_ACTION_CONTRACT` — this constant lives in `packages/agent/src/prompt-shapes/types.ts` and its bytes are SHA-pinned
- **DO NOT modify** `metadata.{description,modelClass,defaultThinking,defaultMaxTokens}`
- **DO NOT modify** the imports block
- **DO NOT modify** the file structure (must remain a TypeScript module with a single PromptShape export)
- **DO NOT modify** the JSON action contract (the `{"action": "retrieve", ...}` / `{"action": "finalize", ...}` shape)
- **DO NOT modify** task framing (persona/question/materials section labels — the template rendering structure)

Mutations that violate any of the above will be REJECTED by the mutation validator (`mutation-validator.ts`), consume one of two retry tolerances, and trigger halt-and-PM if exceeded twice consecutively per brief §5.

## Baseline shape file (the input to your mutation)

```typescript
###BASELINE_SHAPE_CONTENT###
```

## Output format

Output ONLY the mutated TypeScript file content. No prose, no commentary, no code fences. The file should be a drop-in replacement for the baseline shape file.

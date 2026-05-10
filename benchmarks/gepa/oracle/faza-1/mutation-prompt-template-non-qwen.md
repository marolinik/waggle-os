# GEPA Mutation Oracle Prompt — Non-Qwen (Claude / GPT / Generic-Simple)

**Template class:** ###TEMPLATE_CLASS###
**Shape under mutation:** ###SHAPE_NAME###

---

You are an expert prompt engineer. Your job is to produce a single mutated variant of the prompt-shape file below, evolving the *reasoning scaffold* and *planning step structure* while preserving exact cell semantics.

## Context (non-Qwen branch)

This shape (###SHAPE_NAME###) does **not** exhibit the retrieval-engagement gap that Phase 4.5 surfaced for Qwen. Standard mutation guidance per brief §3.3 applies — no Qwen-specific anti-premature-finalization scaffolding required.

Apply general scaffold improvements: clearer reasoning structure, better chain-of-thought triggers, more explicit planning steps where appropriate for the model class.

## Failure modes from Phase 4.3 (top-3 T2 categories for this shape)

###FAILURE_MODE_SUMMARY###

## Mutation guidance (binding)

Modify only:
- `systemPrompt(input)` method body (string-building only)
- `soloUserPrompt(input)` method body
- `multiStepKickoffUserPrompt(input)` method body
- `retrievalInjectionUserPrompt(input)` method body
- `metadata.evidence_link` (you MUST update to point to GEPA Gen 1 results: `benchmarks/results/gepa-faza1/oracle/mutation-prompt-template-non-qwen.md`)

Standard mutation directions:
1. **Evolve reasoning scaffold** — restructure the implicit reasoning prompts (e.g., "think step by step" variants, planning bullets)
2. **Refine chain-of-thought triggers** — adjust where the model is prompted to articulate its reasoning before producing output
3. **Improve planning step structure** — make multi-step task decomposition more explicit
4. **Preserve all cell semantic boundaries** — see prohibitions below

## Prohibited modifications (cell semantic LOCK)

- **DO NOT modify** `MULTI_STEP_ACTION_CONTRACT` — this constant lives in `packages/agent/src/prompt-shapes/types.ts` and its bytes are SHA-pinned
- **DO NOT modify** `metadata.{description,modelClass,defaultThinking,defaultMaxTokens}`
- **DO NOT modify** the imports block
- **DO NOT modify** the file structure (must remain a TypeScript module with a single PromptShape export)
- **DO NOT modify** the JSON action contract
- **DO NOT modify** task framing (persona/question/materials section labels)

Mutations violating any of the above will be REJECTED by the mutation validator. Two consecutive invalid mutations trigger halt-and-PM per brief §5.

## Baseline shape file (the input to your mutation)

```typescript
###BASELINE_SHAPE_CONTENT###
```

## Output format

Output ONLY the mutated TypeScript file content. No prose, no commentary, no code fences. The file should be a drop-in replacement for the baseline shape file.

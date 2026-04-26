# Prompt Shapes — Model-Aware Framing

Phase 1.2 of the agent-fix sprint (`decisions/2026-04-26-agent-fix-sprint-plan.md`).

A prompt shape is a string-building strategy for one model class. Each shape provides 4 methods covering all situations the multi-step harness needs:

1. `systemPrompt(input)` — system message: role + multi-step protocol if applicable
2. `soloUserPrompt(input)` — single-shot user message with full materials
3. `multiStepKickoffUserPrompt(input)` — multi-step turn-1 trigger
4. `retrievalInjectionUserPrompt(input)` — mid-loop user message with retrieval results

Orchestration (loop control, cost tracking, retrieval, normalization) is **not** a shape's concern. Shapes are pure string functions.

---

## How shape selection works

The selector resolves an alias to a shape via three steps:

1. **CLI override** — `selectShape(alias, { override: 'claude' })` → uses `claude` regardless of alias
2. **Exact alias match** — `config.exact_aliases[alias]` (e.g. `"claude-opus-4-7": "claude"`)
3. **Longest prefix match** — `config.prefix_patterns` sorted by descending length (e.g. `"claude-"` matches `claude-opus-4-7`)
4. **Fallback** — `config.default` (currently `generic-simple`)

Config: `packages/agent/config/model-prompt-shapes.json`. Edit this file to map a new alias.

---

## Hard rule — empirical, ne ideoloski

Every shape carries an `evidence_link` metadata field. **It is required**, not optional.

> *"if probe shows model X does better with format Y, use Y; don't retrofit ideology"*

Rules for `evidence_link`:

- Reference a benchmark result, pilot artefact, or decisions doc
- May be `"TBD: empirical probe scheduled for Phase X"` if no evidence exists yet — but state the planned probe
- Never empty. Never `"intuition"`. Never `"this is how Anthropic recommends"`.

If a future probe shows the current shape is suboptimal, the shape's design AND its evidence_link both update — they always travel together.

---

## How to add a new shape

For a new model class (e.g. Mistral, Llama 4, Gemini 2.5):

### 1. Run an empirical probe

Before authoring a shape, run a small probe (5-20 queries) testing 2-3 alternative framings on the new model. Record:
- Per-shape parse rate, latency, accuracy
- Failure modes (length, JSON malformation, refusal)
- Path to the probe results JSONL or summary

### 2. Author the shape file

Create `packages/agent/src/prompt-shapes/<shape-name>.ts`:

```typescript
import { type PromptShape, /* ... */ } from './types.js';

export const myShape: PromptShape = {
  name: 'my-shape',
  metadata: {
    description: '...',
    modelClass: '...',
    evidence_link: 'benchmarks/results/probes/<probe-name>/...',  // REQUIRED
    defaultThinking: undefined,                                      // if applicable
    defaultMaxTokens: 4096,                                          // recommended
  },
  systemPrompt(input) { /* ... */ },
  soloUserPrompt(input) { /* ... */ },
  multiStepKickoffUserPrompt(input) { /* ... */ },
  retrievalInjectionUserPrompt(input) { /* ... */ },
};
```

### 3. Register the shape

In `selector.ts`:

```typescript
import { myShape } from './my-shape.js';

export const REGISTRY: Record<string, PromptShape> = {
  // ...
  'my-shape': myShape,
};
```

In `index.ts`, export the shape directly:

```typescript
export { myShape } from './my-shape.js';
```

### 4. Map aliases in config

`packages/agent/config/model-prompt-shapes.json`:

```json
{
  "exact_aliases": {
    "my-model-name": "my-shape"
  },
  "prefix_patterns": [
    { "prefix": "my-model-", "shape": "my-shape" }
  ]
}
```

### 5. Add tests

`packages/agent/tests/prompt-shapes.test.ts`:

```typescript
it('selectShape picks my-shape for my-model-*', () => {
  const shape = selectShape('my-model-v1');
  expect(shape.name).toBe('my-shape');
});

it('my-shape returns non-empty system prompt', () => {
  const sp = myShape.systemPrompt({ persona: 'p', question: 'q', isMultiStep: false });
  expect(sp.length).toBeGreaterThan(0);
});
```

### 6. Run regression checks

```bash
cd packages/agent && npx tsc --noEmit
cd packages/agent && npx vitest run tests/prompt-shapes.test.ts tests/output-normalize.test.ts \
  tests/compose-evolution.test.ts tests/evolution-orchestrator.test.ts \
  tests/evolution-gates.test.ts tests/iterative-optimizer.test.ts
```

All previously-green tests must remain green. New tests must pass.

---

## Currently shipped shapes (Phase 1.2)

| Shape | Model class | Default thinking | Default max_tokens | Evidence |
|-------|-------------|------------------|---------------------|----------|
| `claude` | Claude (Opus / Sonnet / Haiku) | true | 4096 | pilot 2026-04-26 Cells A/B (commit 4f6a962) |
| `qwen-thinking` | Qwen 3.6 35B-A3B with thinking on | true | 16000 | Stage 3 v6 oracle 74% (commit b7e19c5) |
| `qwen-non-thinking` | Qwen with thinking off (judges/classifiers) | false | 3000 | Stage 3 v6 self-judge 100% parse (commit b7e19c5) |
| `gpt` | GPT-5.4 reasoning model | n/a (internal) | 4096 | pilot 2026-04-26 GPT trio judge 36/36 clean parse |
| `generic-simple` | Portable fallback | n/a | 4096 | conservative default; no superiority claim |

---

## Anti-patterns to avoid

- **Hardcoding model-specific framing in the orchestrator.** Always go through a shape.
- **Bias toward one model.** Each shape exists because empirical evidence shows that framing helps THAT model class. If Claude shape is verbose XML, that doesn't mean Qwen should be too.
- **Speculative shapes without evidence_link.** Don't pre-author shapes for models we haven't probed.
- **Silent shape changes.** Updating a shape requires updating its `evidence_link` to point to the new probe.
- **Override as a permanent solution.** CLI override is for debugging / one-shot tasks. Permanent mappings live in `config/model-prompt-shapes.json`.

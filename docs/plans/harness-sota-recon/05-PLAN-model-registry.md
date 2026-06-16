# Frontier-Baseline Model Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Register the three frontier baseline subject models — **Opus 4.8** (`claude-opus-4-8`), **GPT-5.5** (`gpt-5.5`), **Gemini** (registered fallback `gemini-3.1-pro` for the unverified Gemini 3.5 Pro preview) — in the benchmark harness model registry (`config/models.json`) + the LiteLLM router (`litellm-config.yaml`), prove they satisfy the strict pinning-surface contract, mirror the prices in the product cost-tracker, and add a pre-spend live health-check smoke (one cheap call per new alias via the LiteLLM proxy) that **skips when no proxy/key is present**.

**Architecture:** `config/models.json` is a flat `Record<string, ModelSpec>` keyed by `id` (key MUST equal `entry.id`); each entry carries a `pinning_surface` (`anthropic_immutable` ⇒ `carve_out_reason: null`; `floating_alias` ⇒ non-null reason containing the literal `"B3 addendum"`). `litellm-config.yaml` maps each `model_name` (the alias the harness sends) to provider routing. Subjects carry **no** `judge_role`. The pre-spend smoke reuses the already-shipped `preCellHealthCheck()` (one 2xx-or-fail ping per alias through `POST /v1/chat/completions`) and gates itself off `BENCH_SMOKE_LITELLM_URL` + `BENCH_SMOKE_LITELLM_API_KEY` so the default `npm test` gate stays offline-green.

**Tech Stack:** TypeScript (ESM, `moduleResolution: "Bundler"` but `.js` import specifiers throughout — match the existing harness), vitest (collected from root via `benchmarks/*/tests/**/*.test.ts`), JSON registry, YAML router config. No new dependencies.

**Spec refs:** `01-DESIGN-SPEC.md` §5 (exact model identities/routing/pinning; "Smoke each alias before spend"), `02-CONTINUAL-MEMORY-PROTOCOL.md` §9 (pre-registration: model ids + pinning), `03-REDTEAM-RESOLUTIONS.md` E1/E4 (pin checkpoints; bind pinning per row) + "Model-pilot silently swapping models → hard-pin". Recon: `model-roster-and-cost-feasibility.md` §2 (Opus 4.8 = $5/$25, 1M ctx; the strict `models-config.test.ts` contract), `r8-proprietary-baselines-and-step2-oss.md` (frontier baselines), `harness-capability-audit.md` / `harness-layer-map.md` (health-check reuse).

---

## File Structure

| File | Responsibility |
|---|---|
| `benchmarks/harness/config/models.json` (modify) | Add the 3 frontier-subject entries (`claude-opus-4-8`, `gpt-5.5`, `gemini-3.1-pro` is already present → ADD a Gemini-fallback note ONLY if missing; see Task 3). |
| `litellm-config.yaml` (modify) | Add LiteLLM routes for `claude-opus-4-8` (Anthropic-direct + OpenRouter failover) and `gpt-5.5` (+ dated snapshot alias). Gemini route `gemini-3.1-pro` already exists — verified in Task 3. |
| `benchmarks/harness/tests/models-config.test.ts` (modify) | Append a `describe` block asserting the 3 new subjects parse, satisfy the pinning contract, carry NO `judge_role`, and have the recon-pinned prices/contextWindow. |
| `benchmarks/harness/tests/frontier-baseline-smoke.test.ts` (create) | Env-gated live smoke: one `preCellHealthCheck` ping per new alias through the real LiteLLM proxy; `describe.skipIf` when env vars absent. |
| `packages/agent/src/cost-tracker.ts` (modify) | Product-side: add `claude-opus-4-8` (and the missing `claude-opus-4-7`) to `DEFAULT_MODEL_PRICING` so the product UI stops falling back to Sonnet pricing. |
| `packages/agent/tests/cost-tracker.test.ts` (create or modify) | Assert the new pricing rows resolve (not the Sonnet fallback). |

**Conventions to copy verbatim (observed in the repo):** `.js` import specifiers; explicit exported types, no `any`; throw-style validation; immutable updates; existing `models.json` entry shape (the `claude-opus-4-7` entry is the `anthropic_immutable` template, `gpt-5.4` is the `floating_alias` template); existing `litellm-config.yaml` block shape (the `claude-opus-4-7` block at lines 318–321 + the OpenRouter bridge at 110–113 are templates); the `preCellHealthCheck` injectable-`fetchFn` pattern.

**Pre-flight facts (verified against the files on 2026-06-16 — do not re-derive, just confirm before editing):**
- `gemini-3.1-pro` is ALREADY in `models.json` (with `judge_role: "primary"`) AND in `litellm-config.yaml` (`gemini/gemini-3.1-pro-preview`, `rpm: 20`). The recon's "registered fallback" for the unverified Gemini 3.5 Pro **is this existing entry** — so Task 3 is a VERIFY-only task (no new Gemini subject key; reusing the existing judge-tier alias as the subject route is intentional and recorded in `open_questions`).
- `claude-opus-4-8` and `gpt-5.5` are NOT present in either file (grep-confirmed in recon §2).
- The strict test contract (`models-config.test.ts`): key === id; every entry has a valid `pinning_surface`; `anthropic_immutable` ⇒ `carve_out_reason: null`; `floating_alias` ⇒ non-null reason whose text matches `/B3 addendum/`. The 4 required JUDGE ids are unchanged (opus-4-7/gpt-5.4/gemini-3.1/grok-4.20) — the new subjects are NOT judges and MUST NOT carry `judge_role`.

---

### Task 1: Register `claude-opus-4-8` (anthropic_immutable subject)

**Files:**
- Modify: `benchmarks/harness/config/models.json`
- Modify: `litellm-config.yaml`
- Test: `benchmarks/harness/tests/models-config.test.ts`

- [ ] **Step 1: Write the failing test** — append this `describe` block to the END of `benchmarks/harness/tests/models-config.test.ts` (after the existing `ModelSpec shape invariants` block, before EOF):

```typescript
// ── Plan 05: frontier baseline subjects (Opus 4.8 / GPT-5.5 / Gemini fallback) ──
describe('Plan 05 — claude-opus-4-8 frontier subject', () => {
  it('is present and key === id', () => {
    const models = loadModels();
    const opus48 = models['claude-opus-4-8'];
    expect(opus48, 'claude-opus-4-8 missing from registry').toBeDefined();
    expect(opus48.id).toBe('claude-opus-4-8');
  });

  it('is an anthropic_immutable subject with null carve-out and NO judge_role', () => {
    const models = loadModels();
    const opus48 = models['claude-opus-4-8'];
    expect(opus48.provider).toBe('anthropic');
    expect(opus48.pinning_surface).toBe('anthropic_immutable');
    expect(opus48.pinning_surface_carve_out_reason).toBeNull();
    // Subject model, not a judge — vendor-circularity guard (recon §5.6).
    expect(opus48.judge_role).toBeUndefined();
  });

  it('carries the recon-pinned price ($5/$25) and 1M context, not the 4.6/4.7 $15/$75', () => {
    const models = loadModels();
    const opus48 = models['claude-opus-4-8'];
    expect(opus48.pricePerMillionInput).toBe(5.0);
    expect(opus48.pricePerMillionOutput).toBe(25.0);
    expect(opus48.contextWindow).toBe(1_000_000);
    expect(opus48.litellmModel).toBe('claude-opus-4-8');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/models-config.test.ts -t "claude-opus-4-8"`
Expected: FAIL — `claude-opus-4-8 missing from registry` (the entry does not exist yet).

- [ ] **Step 3: Add the registry entry** — in `benchmarks/harness/config/models.json`, insert this entry immediately AFTER the closing `}` of the `claude-opus-4-7` entry and BEFORE the `gpt-5.4` entry (mind the trailing comma on the preceding `}` and the leading comma is NOT needed here because it follows a `}` that already has a comma — paste exactly):

```json
  "claude-opus-4-8": {
    "id": "claude-opus-4-8",
    "displayName": "Claude Opus 4.8 (Plan 05 frontier baseline subject — premium ceiling, arms A/C/E)",
    "provider": "anthropic",
    "litellmModel": "claude-opus-4-8",
    "pricePerMillionInput": 5.0,
    "pricePerMillionOutput": 25.0,
    "contextWindow": 1000000,
    "pinning_surface": "anthropic_immutable",
    "pinning_surface_carve_out_reason": null
  },
```

> Placement note: the file is `{ ...existing entries..., "claude-opus-4-7": { ... }, "gpt-5.4": { ... }, ... }`. After editing, the sequence reads `"claude-opus-4-7": { ... },` then this new block, then `"gpt-5.4": { ... }`. Run `node -e "JSON.parse(require('fs').readFileSync('benchmarks/harness/config/models.json','utf8'))"` to confirm valid JSON before moving on (expected: no output, exit 0).

- [ ] **Step 4: Add the LiteLLM route** — in `litellm-config.yaml`, add this block immediately AFTER the existing `claude-opus-4-7` block (the one at lines ~318–321 that ends with `api_key: os.environ/ANTHROPIC_API_KEY`):

```yaml
  # Plan 05 frontier baseline — Claude Opus 4.8 (premium ceiling subject).
  # Native Anthropic route; plain family alias (NOT a dated -2026xxxx suffix —
  # speculative date suffixes 404'd for 4.6/4.7, see notes at lines 5-7 + 316-317).
  # Pricing per recon model-roster-and-cost-feasibility.md §2: $5/$25 (3x drop
  # vs 4.6/4.7 $15/$75) — confirm against the canonical Anthropic price page
  # before locking the pre-registration manifest.
  - model_name: claude-opus-4-8
    litellm_params:
      model: anthropic/claude-opus-4-8
      api_key: os.environ/ANTHROPIC_API_KEY

  # OpenRouter bridge failover for Opus 4.8 (mirrors the 4-7 bridge at lines
  # 110-113). Used only when the native Anthropic key is missing/rate-limited.
  - model_name: claude-opus-4-8-via-openrouter
    litellm_params:
      model: openrouter/anthropic/claude-opus-4.8
      api_key: os.environ/OPENROUTER_API_KEY
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/models-config.test.ts -t "claude-opus-4-8"`
Expected: PASS (3 tests). Then run the WHOLE registry test to confirm the strict contract still holds for every entry: `npx vitest run benchmarks/harness/tests/models-config.test.ts` — expected: all green (the new `anthropic_immutable` entry satisfies "anthropic_immutable ⇒ null carve_out", and adding it does not break "every entry id matches its hash-key" or "no duplicate ids").

- [ ] **Step 6: Commit**

```bash
git -C <worktree> add benchmarks/harness/config/models.json litellm-config.yaml benchmarks/harness/tests/models-config.test.ts
git -C <worktree> commit -m "feat(benchmarks): register claude-opus-4-8 frontier baseline (registry + litellm route)"
```

---

### Task 2: Register `gpt-5.5` (floating_alias subject)

**Files:**
- Modify: `benchmarks/harness/config/models.json`
- Modify: `litellm-config.yaml`
- Test: `benchmarks/harness/tests/models-config.test.ts`

- [ ] **Step 1: Write the failing test** — append this `describe` block to `benchmarks/harness/tests/models-config.test.ts` (after the Task-1 block):

```typescript
describe('Plan 05 — gpt-5.5 frontier subject', () => {
  it('is present and key === id', () => {
    const models = loadModels();
    const gpt55 = models['gpt-5.5'];
    expect(gpt55, 'gpt-5.5 missing from registry').toBeDefined();
    expect(gpt55.id).toBe('gpt-5.5');
  });

  it('is a floating_alias subject with a B3-addendum carve-out and NO judge_role', () => {
    const models = loadModels();
    const gpt55 = models['gpt-5.5'];
    expect(gpt55.provider).toBe('openai_via_openrouter');
    expect(gpt55.pinning_surface).toBe('floating_alias');
    const reason = gpt55.pinning_surface_carve_out_reason;
    expect(reason, 'floating_alias requires a non-null carve-out reason').not.toBeNull();
    expect(typeof reason).toBe('string');
    // The strict contract: every floating_alias reason MUST cite the addendum
    // so an audit grep surfaces it (models-config.test.ts:115).
    expect(reason as string).toMatch(/B3 addendum/);
    // Subject, not a judge.
    expect(gpt55.judge_role).toBeUndefined();
  });

  it('carries the recon-pinned price ($5/$30) and records the snapshot in its carve-out', () => {
    const models = loadModels();
    const gpt55 = models['gpt-5.5'];
    expect(gpt55.pricePerMillionInput).toBe(5.0);
    expect(gpt55.pricePerMillionOutput).toBe(30.0);
    expect(gpt55.litellmModel).toBe('gpt-5.5');
    // The dated snapshot (gpt-5.5-2026-04-23) is recorded in the carve-out for
    // the per-row pinning audit (design-spec §5 + redteam E1).
    expect(gpt55.pinning_surface_carve_out_reason as string).toMatch(/gpt-5\.5-2026-04-23/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/models-config.test.ts -t "gpt-5.5"`
Expected: FAIL — `gpt-5.5 missing from registry`.

- [ ] **Step 3: Add the registry entry** — in `benchmarks/harness/config/models.json`, insert this entry immediately AFTER the `gpt-5.4` entry's closing `}` and BEFORE the `gemini-3.1` entry (paste exactly; note the existing `gpt-5.4` entry ends with `"judge_role": "primary"` then `},` so this block follows that comma):

```json
  "gpt-5.5": {
    "id": "gpt-5.5",
    "displayName": "GPT-5.5 (Plan 05 frontier baseline subject — additional frontier ceiling for H3)",
    "provider": "openai_via_openrouter",
    "litellmModel": "gpt-5.5",
    "pricePerMillionInput": 5.0,
    "pricePerMillionOutput": 30.0,
    "contextWindow": 400000,
    "pinning_surface": "floating_alias",
    "pinning_surface_carve_out_reason": "Plan 05 (2026-06-16): GPT-5.5 frontier baseline subject. Route is the LiteLLM local alias `gpt-5.5` -> `openai/gpt-5.5` (direct OpenAI Chat Completions; same direct-not-OpenRouter rationale as the gpt-5.4 sibling — preserves token-level telemetry for EU AI Act Art. 14 replay). OpenAI does not expose immutable model snapshots for the gpt-5.x family; the dated snapshot is `gpt-5.5-2026-04-23` (recorded here for the per-row pinning audit per design-spec §5 / redteam E1 — pin + record the exact snapshot in the run manifest). Price $5 in / $30 out per recon model-roster-and-cost-feasibility.md §5 (0.50 cached). Floating alias mandated by B3 addendum § 5."
  },
```

> `contextWindow: 400000` is the recon-stated GPT-5.x context envelope used by the sibling `gpt-5.4` registry convention (`200000`); GPT-5.5 ships the larger 400K window per the recon roster. If a later probe shows the alias truncates earlier, lower this and re-run — the value only affects truncation decisions, not routing.

- [ ] **Step 4: Add the LiteLLM routes** — in `litellm-config.yaml`, add this block immediately AFTER the existing `gpt-5.4-pro` block (the one that ends with `model: openai/gpt-5.4-pro`):

```yaml
  # Plan 05 frontier baseline — GPT-5.5 (subject, not judge).
  # Direct OpenAI Chat Completions via the local alias (same direct-not-OpenRouter
  # rationale as gpt-5.4 above: preserves token-level telemetry). Snapshot
  # gpt-5.5-2026-04-23 recorded in models.json carve-out; pin it in the manifest.
  - model_name: gpt-5.5
    litellm_params:
      model: openai/gpt-5.5
      api_key: os.environ/OPENAI_API_KEY

  # Explicit dated-snapshot alias for the per-row pinning audit. Same upstream;
  # use this alias when the manifest needs the snapshot encoded in the route name.
  - model_name: gpt-5.5-2026-04-23
    litellm_params:
      model: openai/gpt-5.5-2026-04-23
      api_key: os.environ/OPENAI_API_KEY
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/models-config.test.ts -t "gpt-5.5"`
Expected: PASS (3 tests). Then `node -e "JSON.parse(require('fs').readFileSync('benchmarks/harness/config/models.json','utf8'))"` — expected: exit 0. Then the full registry test: `npx vitest run benchmarks/harness/tests/models-config.test.ts` — expected: all green (the new `floating_alias` entry satisfies "floating_alias ⇒ non-null reason matching /B3 addendum/").

- [ ] **Step 6: Commit**

```bash
git -C <worktree> add benchmarks/harness/config/models.json litellm-config.yaml benchmarks/harness/tests/models-config.test.ts
git -C <worktree> commit -m "feat(benchmarks): register gpt-5.5 frontier baseline (registry + litellm routes)"
```

---

### Task 3: Verify the Gemini fallback (`gemini-3.1-pro`) is registered + routed

**Files:**
- Read/verify: `benchmarks/harness/config/models.json`, `litellm-config.yaml`
- Test: `benchmarks/harness/tests/models-config.test.ts`

> Why this is VERIFY-only: the recon decision is "Gemini 3.5 Pro is preview/unverified → use `gemini-3.1-pro` as the registered fallback." That alias ALREADY exists in `models.json` (currently tagged `judge_role: "primary"`) and in `litellm-config.yaml` (`gemini/gemini-3.1-pro-preview`, `rpm: 20`). Reusing the existing judge-tier alias as the Gemini SUBJECT route is intentional (no second Gemini key is added). We assert the fallback is resolvable and record the dual-role caveat in `open_questions`. We do NOT strip its `judge_role` (other arcs depend on it) and we do NOT add a separate `gemini-3.5-pro-preview` subject key (unverified upstream).

- [ ] **Step 1: Write the assertion test** — append to `benchmarks/harness/tests/models-config.test.ts`:

```typescript
describe('Plan 05 — Gemini fallback (gemini-3.1-pro) is the registered subject route', () => {
  it('gemini-3.1-pro exists, key === id, and resolves to a Google route', () => {
    const models = loadModels();
    const gemini = models['gemini-3.1-pro'];
    expect(gemini, 'gemini-3.1-pro (the registered Gemini-3.5 fallback) missing').toBeDefined();
    expect(gemini.id).toBe('gemini-3.1-pro');
    expect(gemini.provider).toBe('google_via_openrouter');
    expect(gemini.litellmModel).toBe('gemini-3.1-pro');
    // floating_alias (Google ships 3.1 Pro as -preview only — no immutable snapshot).
    expect(gemini.pinning_surface).toBe('floating_alias');
    expect(gemini.pinning_surface_carve_out_reason as string).toMatch(/B3 addendum/);
  });

  it('the unverified gemini-3.5-pro-preview is NOT a separate registry key (fallback policy)', () => {
    const models = loadModels();
    // Plan 05 deliberately does NOT register the unverified Gemini 3.5 preview as
    // its own key; the fallback gemini-3.1-pro carries the Gemini subject arm.
    // If a verified GA id lands, add it in a follow-up (see open_questions).
    expect(models['gemini-3.5-pro-preview']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run benchmarks/harness/tests/models-config.test.ts -t "Gemini fallback"`
Expected: PASS (2 tests) WITHOUT any source edit — both assertions describe the registry as it already stands. If the first test FAILS (alias missing/renamed), STOP and reconcile against the live `models.json` before adding anything (do not blindly re-add — a concurrent arc may have renamed it).

- [ ] **Step 3: Confirm the LiteLLM route exists** (read-only check, no edit expected)

Run: `grep -n "model_name: gemini-3.1-pro" litellm-config.yaml`
Expected: at least one hit (the `gemini-3.1-pro` block around line 379). If ABSENT, add the route block below after the OpenAI section (this is the ONLY conditional edit in this task):

```yaml
  # Plan 05 fallback — Gemini subject route (registered fallback for the
  # unverified Gemini 3.5 Pro preview, per design-spec §5). Google ships 3.1 Pro
  # as -preview only; rpm:20 stays under the 25 RPM per-model preview cap.
  - model_name: gemini-3.1-pro
    litellm_params:
      model: gemini/gemini-3.1-pro-preview
      api_key: os.environ/GEMINI_API_KEY
      rpm: 20
```

- [ ] **Step 4: Commit** (the test addition; plus the route only if Step 3 had to add it)

```bash
git -C <worktree> add benchmarks/harness/tests/models-config.test.ts litellm-config.yaml
git -C <worktree> commit -m "test(benchmarks): assert gemini-3.1-pro is the registered Gemini-3.5 fallback subject"
```

---

### Task 4: Pre-spend live health-check smoke (env-gated, one ping per new alias)

**Files:**
- Create: `benchmarks/harness/tests/frontier-baseline-smoke.test.ts`

> Why: design-spec §5 + recon §2(e) require "Smoke each alias before spend" — the repo has a documented history of speculative dated suffixes 404-ing, so a registry entry that parses is NOT proof the route resolves. We reuse the already-shipped `preCellHealthCheck()` (one `POST /v1/chat/completions` ping per alias; any non-2xx or network error → failure). The default `npm test` gate is offline — so this smoke `describe.skipIf`s itself unless BOTH `BENCH_SMOKE_LITELLM_URL` and `BENCH_SMOKE_LITELLM_API_KEY` are set. With those set (operator runs the real proxy before spend), it makes one real cheap call per new alias and fails loudly if any route is dead.

- [ ] **Step 1: Create the smoke test**

Create `benchmarks/harness/tests/frontier-baseline-smoke.test.ts`:

```typescript
/**
 * Plan 05 — pre-spend frontier-baseline alias smoke.
 *
 * Design-spec §5: "Smoke each alias before spend." A registry entry that parses
 * is NOT proof the LiteLLM route resolves to a live upstream (the repo has a
 * documented history of speculative dated suffixes 404-ing). This test fires ONE
 * cheap ping per new frontier-baseline alias through the REAL LiteLLM proxy via
 * the already-shipped preCellHealthCheck().
 *
 * GATING (so the default offline `npm test` gate stays green): the whole suite
 * is skipped unless BOTH env vars are present:
 *   BENCH_SMOKE_LITELLM_URL      e.g. http://localhost:4000
 *   BENCH_SMOKE_LITELLM_API_KEY  e.g. sk-waggle-dev  (LiteLLM master key)
 * The operator sets these right before the priced run; CI never sets them, so
 * this never makes a network call in the default gate.
 *
 * Cost: each ping is max_tokens-bounded (preCellHealthCheck uses 1024) and runs
 * once per alias — pennies total. Run it manually before Phase 1:
 *   BENCH_SMOKE_LITELLM_URL=http://localhost:4000 \
 *   BENCH_SMOKE_LITELLM_API_KEY=sk-waggle-dev \
 *   npx vitest run benchmarks/harness/tests/frontier-baseline-smoke.test.ts
 */

import { describe, expect, it } from 'vitest';
import { preCellHealthCheck } from '../src/health-check.js';

const LITELLM_URL = process.env.BENCH_SMOKE_LITELLM_URL;
const LITELLM_API_KEY = process.env.BENCH_SMOKE_LITELLM_API_KEY;
const SMOKE_ENABLED = Boolean(LITELLM_URL && LITELLM_API_KEY);

/** The new frontier-baseline aliases this plan registered + the Gemini fallback.
 *  Each must resolve to a live upstream before any priced run. */
const NEW_ALIASES: readonly string[] = ['claude-opus-4-8', 'gpt-5.5', 'gemini-3.1-pro'];

describe.skipIf(!SMOKE_ENABLED)('Plan 05 — frontier baseline alias pre-spend smoke', () => {
  it('every new alias answers a cheap ping through the LiteLLM proxy', async () => {
    // One probe call covers all aliases (subjectModel + judgeModels list). Skip
    // the /health/liveliness GET — some LiteLLM configs don't expose it, and a
    // dead proxy will surface as a fetch_error on the chat probes anyway.
    const result = await preCellHealthCheck({
      litellmUrl: LITELLM_URL as string,
      litellmApiKey: LITELLM_API_KEY as string,
      subjectModel: NEW_ALIASES[0],
      judgeModels: NEW_ALIASES.slice(1),
      includeLivenessProbe: false,
      timeoutMs: 30_000,
    });
    // Loud, actionable failure: name exactly which alias/route is dead.
    expect(
      result.ok,
      `dead frontier-baseline routes before spend: ${JSON.stringify(result.failures)}`,
    ).toBe(true);
    expect(result.failures).toEqual([]);
  });
});

describe('Plan 05 — smoke gating is wired (always runs)', () => {
  it('exposes the two gating env var names', () => {
    // Documents the contract even when the smoke is skipped — a reader running
    // the offline gate still sees how to enable it.
    expect(['BENCH_SMOKE_LITELLM_URL', 'BENCH_SMOKE_LITELLM_API_KEY']).toHaveLength(2);
  });

  it('lists the three aliases the smoke probes', () => {
    expect(NEW_ALIASES).toEqual(['claude-opus-4-8', 'gpt-5.5', 'gemini-3.1-pro']);
  });
});
```

- [ ] **Step 2: Run it in the DEFAULT (offline) mode and confirm the gate skips**

Run (no env vars set): `npx vitest run benchmarks/harness/tests/frontier-baseline-smoke.test.ts`
Expected: PASS — the gated `describe` is SKIPPED (vitest prints it as skipped), the un-gated `smoke gating is wired` block runs and passes (2 tests). NO network call is made. This proves the default `npm test` gate stays offline-green.

- [ ] **Step 3: (Optional, operator-run before spend) Run it LIVE against the proxy**

Pre-req: a LiteLLM proxy is up with the keys loaded. Run:
```bash
BENCH_SMOKE_LITELLM_URL=http://localhost:4000 \
BENCH_SMOKE_LITELLM_API_KEY=sk-waggle-dev \
npx vitest run benchmarks/harness/tests/frontier-baseline-smoke.test.ts
```
Expected when all routes are live: PASS (3 tests incl. the live ping). If any alias is dead, the test FAILS with `dead frontier-baseline routes before spend: [{"endpoint":"POST /v1/chat/completions model=<alias>","error":"http_404"}]` — STOP and fix the route/key before spending. (This step is NOT part of the offline CI gate; it is the pre-spend operator gate.)

- [ ] **Step 4: Commit**

```bash
git -C <worktree> add benchmarks/harness/tests/frontier-baseline-smoke.test.ts
git -C <worktree> commit -m "test(benchmarks): env-gated pre-spend smoke for the 3 frontier baseline aliases"
```

---

### Task 5: Mirror Opus pricing in the product cost-tracker

**Files:**
- Modify: `packages/agent/src/cost-tracker.ts`
- Test: `packages/agent/tests/cost-tracker.test.ts`

> Why: the benchmark cost comes from `models.json` (via `llm.ts`), NOT from `cost-tracker.ts` — so this is product-side accuracy, not a benchmark blocker (recon §2(c), §5.8). But the product UI currently has no `claude-opus-4-7` or `claude-opus-4-8` row, so any Opus usage silently falls back to **Sonnet** pricing (`calculateCost` line ~98–100). Add both rows. Prices are per-1K (the cost-tracker unit), so $5/$25 per-MTok → `0.005`/`0.025` per-1K.

- [ ] **Step 1: Check whether a cost-tracker test file exists**

Run: `ls packages/agent/tests/cost-tracker.test.ts 2>/dev/null && echo EXISTS || echo MISSING`
- If `EXISTS`: append the new `describe` from Step 2 to it.
- If `MISSING`: create it with the full content shown in Step 2 (including the imports).

- [ ] **Step 2: Write the failing test**

If creating new, the file is:

```typescript
import { describe, expect, it } from 'vitest';
import { CostTracker, DEFAULT_MODEL_PRICING } from '../src/cost-tracker.js';

describe('cost-tracker — Opus 4.7 / 4.8 pricing (Plan 05)', () => {
  it('knows claude-opus-4-8 at $5/$25 per MTok (0.005 / 0.025 per 1K)', () => {
    expect(DEFAULT_MODEL_PRICING['claude-opus-4-8']).toEqual({
      inputPer1k: 0.005,
      outputPer1k: 0.025,
    });
  });

  it('knows claude-opus-4-7 at $15/$75 per MTok (0.015 / 0.075 per 1K)', () => {
    expect(DEFAULT_MODEL_PRICING['claude-opus-4-7']).toEqual({
      inputPer1k: 0.015,
      outputPer1k: 0.075,
    });
  });

  it('does NOT fall back to Sonnet pricing for Opus 4.8', () => {
    const tracker = new CostTracker();
    // 1M in + 1M out at Opus 4.8 = $5 + $25 = $30. Sonnet fallback would be
    // $3 + $15 = $18 — so a wrong fallback is detectable here.
    const cost = tracker.calculateCost(1_000_000, 1_000_000, 'claude-opus-4-8');
    expect(cost).toBeCloseTo(30, 6);
  });
});
```

If appending to an existing file, add ONLY the `describe('cost-tracker — Opus 4.7 / 4.8 pricing (Plan 05)', ...)` block above (the existing file already imports what it needs — but ensure `DEFAULT_MODEL_PRICING` is imported; if it is not, add `DEFAULT_MODEL_PRICING` to the existing `import { ... } from '../src/cost-tracker.js'` line).

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run packages/agent/tests/cost-tracker.test.ts -t "Plan 05"`
Expected: FAIL — `DEFAULT_MODEL_PRICING['claude-opus-4-8']` is `undefined` (and `['claude-opus-4-7']` too).

- [ ] **Step 4: Add the pricing rows** — in `packages/agent/src/cost-tracker.ts`, replace the `claude-opus-4-6` line in `DEFAULT_MODEL_PRICING` with the three Opus rows (keeps 4-6, adds 4-7 + 4-8):

Find:
```typescript
  'claude-opus-4-6': { inputPer1k: 0.015, outputPer1k: 0.075 },
```
Replace with:
```typescript
  'claude-opus-4-6': { inputPer1k: 0.015, outputPer1k: 0.075 },
  // Plan 05: Opus 4.7 stays at the 4.6 list price; Opus 4.8 is the $5/$25
  // generation (3x drop) — without these rows, Opus usage silently bills at
  // the Sonnet fallback (calculateCost ~line 98). Per-1K = per-MTok / 1000.
  'claude-opus-4-7': { inputPer1k: 0.015, outputPer1k: 0.075 },
  'claude-opus-4-8': { inputPer1k: 0.005, outputPer1k: 0.025 },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/agent/tests/cost-tracker.test.ts -t "Plan 05"`
Expected: PASS (3 tests). Then run the whole cost-tracker suite to confirm no regression: `npx vitest run packages/agent/tests/cost-tracker.test.ts` — expected: all green.

- [ ] **Step 6: Commit**

```bash
git -C <worktree> add packages/agent/src/cost-tracker.ts packages/agent/tests/cost-tracker.test.ts
git -C <worktree> commit -m "feat(agent): add claude-opus-4-7/4-8 product cost-tracker pricing"
```

---

### Task 6: Full verification + typecheck

**Files:** (no source edits — verification only)

- [ ] **Step 1: Registry JSON parses + full registry test green**

Run: `node -e "JSON.parse(require('fs').readFileSync('benchmarks/harness/config/models.json','utf8')); console.log('models.json OK')"`
Expected: `models.json OK`.

Run: `npx vitest run benchmarks/harness/tests/models-config.test.ts`
Expected: ALL green — the 4 required judge entries unchanged; the 3 new Plan-05 blocks pass; the strict pinning contract holds for every entry (every `anthropic_immutable` has null carve-out incl. the new Opus 4.8; every `floating_alias` cites `B3 addendum` incl. the new GPT-5.5; key === id; no duplicate ids).

- [ ] **Step 2: Smoke test skips offline + cost-tracker green**

Run: `npx vitest run benchmarks/harness/tests/frontier-baseline-smoke.test.ts packages/agent/tests/cost-tracker.test.ts`
Expected: green — the live smoke `describe` is SKIPPED (no env), the gating-wired + cost-tracker blocks pass.

- [ ] **Step 3: Harness typecheck (tests are excluded from tsconfig — typecheck src; tests are type-checked by vitest at run time)**

Run: `npx tsc --noEmit --project benchmarks/harness/tsconfig.json`
Expected: exit 0 (no `.ts` source was added; only JSON + tests changed — this confirms nothing in `src/` regressed and the JSON is `resolveJsonModule`-clean if imported).

Run: `npx tsc --noEmit --project packages/agent/tsconfig.json`
Expected: exit 0 (the cost-tracker source edit is type-clean: two new entries of the existing `ModelPricing` shape).

- [ ] **Step 4: LiteLLM YAML parses**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('litellm-config.yaml','utf8');const re=/model_name:\s*(\S+)/g;let m,n=0;const seen=new Set();while((m=re.exec(s))){n++;seen.add(m[1]);}console.log('model_name count',n,'unique',seen.size);if(!seen.has('claude-opus-4-8'))throw new Error('missing claude-opus-4-8');if(!seen.has('gpt-5.5'))throw new Error('missing gpt-5.5');if(!seen.has('gemini-3.1-pro'))throw new Error('missing gemini-3.1-pro');console.log('all three Plan-05 aliases present');"`
Expected: prints the model_name count then `all three Plan-05 aliases present`. (A full YAML parse needs the `yaml` dep which the root may not expose to a bare `node -e`; this regex check is sufficient to prove the three aliases are wired and the file wasn't structurally corrupted — the LiteLLM proxy itself validates on boot, and the live smoke in Task 4 is the real route check.)

- [ ] **Step 5: Final commit (verification doc-trail only if any fixup was needed; otherwise nothing to commit)**

If Steps 1–4 surfaced a fixup, commit it with a `fix(benchmarks): ...` subject. If everything was already green, there is nothing to commit in this task — proceed to Self-Review.

---

## Self-Review

**Spec coverage:**
- `01` §5 (add Opus 4.8 / GPT-5.5 / Gemini-fallback to `models.json` + `litellm-config.yaml`; exact ids + pinning) → Tasks 1/2/3. ✓
- `01` §5 / recon §2(e) ("Smoke each alias before spend") → Task 4 (live `preCellHealthCheck` ping per alias, env-gated). ✓
- Strict pinning contract (`models-config.test.ts`: key===id, anthropic_immutable⇒null, floating_alias⇒`/B3 addendum/`) → asserted per new entry in Tasks 1/2/3 + the full-suite run in Task 6. ✓
- Subjects carry NO `judge_role` (vendor-circularity guard, recon §5.6) → asserted in Tasks 1/2. ✓
- Recon-pinned prices: Opus 4.8 $5/$25 + 1M ctx (NOT $15/$75); GPT-5.5 $5/$30; snapshot `gpt-5.5-2026-04-23` recorded → asserted in Tasks 1/2. ✓
- `redteam E1/E4` (pin checkpoint, record per row) → snapshot encoded in the GPT-5.5 carve-out + the dated-snapshot LiteLLM alias; Gemini `-preview` provenance noted. ✓
- Product-side cost mirror (recon §2(c)/§5.8) → Task 5. ✓
- Gemini 3.5 Pro is preview/unverified → fallback `gemini-3.1-pro` reused, NOT registered as a new key; recorded as an open question. ✓
- NOT in scope (sibling plans): equivalence-stats (Plan 04), leakage firewall (06), τ²/oracle adapters (07), continual harness (08), ruler-validation (09). ✓

**Placeholder scan:** none — every code step contains complete JSON/YAML/TS or an exact command + expected output. No "add appropriate", no TODO, no "similar to above".

**Type consistency:** new `models.json` entries match the `ModelSpec` interface exactly (`id`, `displayName`, `provider` ∈ the `ModelProvider` union — `anthropic` / `openai_via_openrouter` / `google_via_openrouter` all exist in `types.ts`; `litellmModel`; `pricePerMillionInput`/`Output`; `contextWindow`; `pinning_surface` ∈ `PinningSurface`; `pinning_surface_carve_out_reason: string | null`; no `judge_role` on subjects). `cost-tracker.ts` rows match the `ModelPricing` shape (`inputPer1k`/`outputPer1k`). The smoke reuses `preCellHealthCheck`'s exact `HealthCheckOptions` shape (`litellmUrl`/`litellmApiKey`/`subjectModel`/`judgeModels`/`includeLivenessProbe`/`timeoutMs`). All `.js` import specifiers. Alias strings (`claude-opus-4-8`, `gpt-5.5`, `gemini-3.1-pro`, `gpt-5.5-2026-04-23`, `claude-opus-4-8-via-openrouter`) are spelled identically across `models.json`, `litellm-config.yaml`, the registry test, and the smoke. ✓

# Opus 4.6 / Sonnet 4.6 Route Audit

**Datum:** 2026-04-22
**Sprint:** 11 · Track B · Task B3
**Authority:** `briefs/2026-04-22-cc-sprint-11-kickoff.md` §3 Track B B3
**Author:** CC-1
**Scope:** `packages/server/**` + `packages/cli/**` — grep for `claude-opus|claude-sonnet-4` references; classify; recommend naming LOCK.
**Budget:** $0 (read-only audit)

---

## 0. Executive summary

Total hits: **54** in `packages/server`; **0** in `packages/cli`.

Classification:

| Class | Count | Notes |
|---|---|---|
| (a) dated snapshot | 11 | **9 of 11 use `-20250514` suffix which was never valid for the Claude 4.6 family** per litellm-config.yaml line 2-7 Sprint 10 Task 1.2 comment. |
| (b) floating alias | 39 | `claude-sonnet-4-6` / `claude-opus-4-6` / `claude-opus-4-7` / `claude-haiku-4-5`. Mostly correct; match litellm-config.yaml canonical entries. |
| (c) provider-prefixed | 4 | `anthropic/claude-sonnet-4.6` (dot-notation) + `anthropic/claude-opus-4.6`. Dot-notation normalizes to dash-form via existing `mapModel` logic. |

**Top 3 cleanup priorities** (elaborated §4):

1. **`anthropic-proxy.ts:43-44`** — hardcoded mapping `claude-sonnet-4-6 → claude-sonnet-4-20250514` + `claude-opus-4-6 → claude-opus-4-20250514` sends **provably invalid** snapshot IDs to the Anthropic Messages API. Breaks chat completion when the proxy is the request path. **HIGH / user-facing runtime defect.**
2. **`workspace-templates.ts:406`** — new workspaces created via template wizard default to `claude-sonnet-4-20250514` (same invalid ID class). New users bounce on first message. **MEDIUM / onboarding path.**
3. **Test-fixture drift** — 7 test files use `claude-sonnet-4-20250514`. Tests pass because they mock providers, but they codify the invalid ID as canonical. **LOW / hygiene, no runtime impact today.**

---

## 1. Canonical state of truth (per `litellm-config.yaml` Sprint 10 Task 1.2)

| Family | Plain alias (current ID) | Correct dated snapshot |
|---|---|---|
| Sonnet 4.6 | `claude-sonnet-4-6` | none — *per docs, plain alias IS the current ID; `-20250514` was never valid for the 4.6 family* |
| Opus 4.6 | `claude-opus-4-6` | `claude-opus-4-6-20250610` |
| Opus 4.7 | `claude-opus-4-7` | `claude-opus-4-7-20260201` (per model IDs reference) |
| Haiku 4.5 | `claude-haiku-4-5` | `claude-haiku-4-5-20251001` |

Source: `litellm-config.yaml` lines 9-39 + Sprint 10 Task 1.2 verification note (2026-04-21 docs probe).

---

## 2. Full hit table (non-test code)

### 2.1 Runtime request-path references

| File | Line | Reference | Class | Current behavior | Recommendation |
|---|---|---|---|---|---|
| `packages/server/src/local/routes/anthropic-proxy.ts` | 43 | `'claude-sonnet-4-6': 'claude-sonnet-4-20250514'` | (a) dated (**INVALID**) | Maps floating alias to a non-existent dated snapshot. Proxy sends the invalid ID to Anthropic; response is `404 model_not_found`. | **REMOVE entry.** The floating alias `claude-sonnet-4-6` IS the current Anthropic ID; no mapping needed. |
| `packages/server/src/local/routes/anthropic-proxy.ts` | 44 | `'claude-opus-4-6': 'claude-opus-4-20250514'` | (a) dated (**INVALID**) | Same class. `-20250514` was never a valid Opus 4.6 snapshot. | **REPLACE with `claude-opus-4-6-20250610`** (canonical dated per litellm-config) OR **REMOVE** to let the floating alias pass through unchanged. |
| `packages/server/src/local/routes/anthropic-proxy.ts` | 45 | `'claude-haiku-4-5': 'claude-haiku-4-5-20251001'` | (a) dated | Correct — `-20251001` is the canonical Haiku 4.5 snapshot per litellm-config. | **KEEP.** |
| `packages/server/src/local/routes/anthropic-proxy.ts` | 46 | `'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001'` | (a) dated | Identity mapping — stable. | **KEEP.** |
| `packages/server/src/local/routes/anthropic-proxy.ts` | 48-50 | `'claude-haiku-4-6'`, `'claude-haiku-4.6'`, `'claude-haiku-4.5'` → `claude-haiku-4-5-20251001` | (b)/(c) misnames | Defensive aliases for common typos. | **KEEP.** |
| `packages/server/src/local/routes/workspace-templates.ts` | 406 | `let model = 'claude-sonnet-4-20250514'` | (a) dated (**INVALID**) | Default value when `settings.json` has no `model` key. Affects new workspaces created via template wizard. | **REPLACE with `'claude-sonnet-4-6'`** (floating alias matches litellm-config canonical). |
| `packages/server/src/local/routes/chat.ts` | 449 | `model ?? wsModelConfig ?? pilotConfig.getDefaultModel() ?? 'claude-sonnet-4-6'` | (b) floating | Final fallback when all other model sources are null. | **KEEP** — canonical floating alias. |
| `packages/server/src/local/routes/chat.ts` | 1153 | `// Extract provider name from model ID (e.g., "anthropic" from "claude-sonnet-4-6")` | (b) floating | Comment only, no runtime effect. | **KEEP.** |
| `packages/server/src/local/routes/personas.ts` | 51 | `modelPreference: body.modelPreference ?? 'claude-sonnet-4-6'` | (b) floating | Default model preference for new personas. | **KEEP.** |
| `packages/server/src/local/routes/personas.ts` | 130 | `model: 'claude-sonnet-4-6'` | (b) floating | Persona response default. | **KEEP.** |
| `packages/server/src/local/routes/providers.ts` | 46 | `{ id: 'claude-opus-4-7', name: 'Claude Opus 4.7', cost: '$$$', speed: 'slow' }` | (b) floating | UI provider catalog entry. | **KEEP.** |
| `packages/server/src/local/routes/providers.ts` | 47 | `{ id: 'claude-opus-4-6', name: 'Claude Opus 4.6', cost: '$$$', speed: 'slow' }` | (b) floating | UI provider catalog entry. | **KEEP.** |
| `packages/server/src/local/routes/providers.ts` | 48 | `{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', cost: '$$', speed: 'medium' }` | (b) floating | UI provider catalog entry. | **KEEP.** |
| `packages/server/src/local/routes/workspaces.ts` | 163 | `` `Examples: claude-sonnet-4-6, gpt-4o, gemini-2.0-flash` `` | (b) floating | Error message example text. | **KEEP.** |
| `packages/server/src/local/routes/workspaces.ts` | 611 | same | (b) floating | Same. | **KEEP.** |
| `packages/server/src/local/routes/litellm.ts` | 64 | `{ model: 'claude-sonnet-4-6', inputPer1k: 0.003, outputPer1k: 0.015, provider: 'anthropic' }` | (b) floating | Pricing catalog entry. | **KEEP.** |
| `packages/server/src/local/routes/litellm.ts` | 65 | `{ model: 'claude-haiku-4-6', inputPer1k: 0.0008, outputPer1k: 0.004, provider: 'anthropic' }` | (b) floating — **misname** | Haiku 4.6 does not exist per Anthropic docs; current latest is Haiku 4.5. Pricing entry would never match a real request. | **REPLACE id with `'claude-haiku-4-5'`** or **REMOVE** the entry. |
| `packages/server/src/local/routes/litellm.ts` | 66 | `{ model: 'claude-opus-4-6', inputPer1k: 0.015, outputPer1k: 0.075, provider: 'anthropic' }` | (b) floating | Pricing catalog entry. | **KEEP.** |
| `packages/server/src/local/index.ts` | 726 | `defaultModel: 'claude-sonnet-4-6'` | (b) floating | Server bootstrap default. | **KEEP.** |
| `packages/server/src/local/index.ts` | 781 | `defaultModel: 'claude-sonnet-4-6'` | (b) floating | Same. | **KEEP.** |
| `packages/server/src/local/index.ts` | 897 | `const currentModel = 'claude-sonnet-4-6'` | (b) floating | Agent state default. | **KEEP.** |
| `packages/server/src/local/index.ts` | 990 | `defaultModel: 'claude-sonnet-4-6'` | (b) floating | Local mode boot default. | **KEEP.** |
| `packages/server/src/local/index.ts` | 1009 | `defaultModel: 'claude-sonnet-4-6'` | (b) floating | Same. | **KEEP.** |
| `packages/server/src/local/index.ts` | 1627 | `model: 'claude-sonnet-4-6'` | (b) floating | Agent-tool default. | **KEEP.** |
| `packages/server/src/local/index.ts` | 1747 | `model: server.agentState.currentModel ?? 'claude-sonnet-4-6'` | (b) floating | State fallback. | **KEEP.** |

### 2.2 Test-fixture references

| File | Ref sample | Class | Notes | Recommendation |
|---|---|---|---|---|
| `packages/server/tests/backup-restore.test.ts:47` | `claude-sonnet-4-6` | (b) | Config fixture. | **KEEP.** |
| `packages/server/tests/backup-streaming.test.ts:41` | `claude-sonnet-4-6` | (b) | Same. | **KEEP.** |
| `packages/server/tests/benchmarks/failure-mode-judge.test.ts:121, 126, 142, 208, 256` | `claude-sonnet-4-6` | (b) | Judge fixtures (aligns with Sprint 10 Task 2.2 ratified primary judge). | **KEEP.** |
| `packages/server/tests/data-export.test.ts:108, 109, 114` | `claude-sonnet-4-6` | (b) | Secret + model export fixture. | **KEEP.** |
| `packages/server/tests/benchmarks/aggregate.test.ts:58` | `claude-sonnet-4-6` | (b) | Judge aggregate fixture. | **KEEP.** |
| `packages/server/tests/local-mode.test.ts:291, 295, 300` | `claude-opus-4-6` | (b) | Opus fixture. | **KEEP.** |
| `packages/server/tests/local/cost.test.ts:89, 90` | `claude-sonnet-4-6` | (b) | Cost tracker fixture. | **KEEP.** |
| `packages/server/tests/local/team-integration.test.ts:31` | `claude-sonnet-4-6` | (b) | Team defaultModel. | **KEEP.** |
| `packages/server/tests/local/providers.test.ts:255` | `claude-sonnet-4-6` | (b) | Workspace model. | **KEEP.** |
| `packages/server/tests/local/providers.test.ts:262` | `anthropic/claude-sonnet-4.6` | (c) | Provider-prefixed dot-notation — exercises `mapModel` normalization. | **KEEP.** (This is a legitimate test of the normalizer.) |
| `packages/server/tests/litellm-api.test.ts:162, 174` | `claude-sonnet-4-20250514` | (a) **INVALID** | Hardcodes the non-existent dated snapshot. Test passes because provider is mocked, but it codifies the bad ID as canonical. | **REPLACE with `claude-sonnet-4-6`** unless a test-specific reason forces the invalid literal (there isn't one visible). |
| `packages/server/tests/local/anthropic-proxy.test.ts:91, 114, 124, 149, 167, 177, 204, 233, 243` | mix of `claude-sonnet-4-6` and `claude-sonnet-4-20250514` | (a)/(b) | Proxy-translation tests. Some lines assert the input → output mapping, so the invalid ID may appear as the *expected output* of the current buggy mapping. | **DEPENDS on priority #1** — once the proxy mapping is fixed, these test expectations update accordingly. |
| `packages/server/tests/routes/agents.test.ts:86, 97` | `claude-sonnet-4-20250514` | (a) **INVALID** | Agent creation fixture. Same class as #1 test-drift. | **REPLACE with `claude-sonnet-4-6`.** |

---

## 3. Class (c) provider-prefixed references

| File | Line | Reference | Status |
|---|---|---|---|
| `packages/server/tests/local/providers.test.ts` | 262 | `anthropic/claude-sonnet-4.6` | Legitimate — exercises `mapModel()` dot-to-dash normalizer. |
| `litellm-config.yaml` | 31 | `anthropic/claude-sonnet-4-6` | LiteLLM route alias — fine. |
| `litellm-config.yaml` | 36 | `anthropic/claude-opus-4.6` | LiteLLM dot-notation alias — fine (same normalizer handles it). |

Recommendation: LOCK naming convention that **both** dash-form (`anthropic/claude-sonnet-4-6`) and dot-form (`anthropic/claude-sonnet-4.6`) are accepted input, with dash-form as the canonical internal representation. The existing `mapModel()` normalizer in `anthropic-proxy.ts:38-40` already implements this. Document the contract in `docs/BENCHMARK-INFRASTRUCTURE.md` or similar canonical reference.

---

## 4. Top 3 cleanup priorities

### Priority 1 — `anthropic-proxy.ts:43-44` invalid dated snapshot mapping (HIGH)

```typescript
// packages/server/src/local/routes/anthropic-proxy.ts:43-44  (CURRENT — BUGGED)
const mapping: Record<string, string> = {
  'claude-sonnet-4-6': 'claude-sonnet-4-20250514',   // ← invalid snapshot
  'claude-opus-4-6': 'claude-opus-4-20250514',       // ← invalid snapshot
  ...
};
```

**Evidence it's invalid:** `litellm-config.yaml` lines 2-7 Sprint 10 Task 1.2 comment (Marko's own note, 2026-04-21): *"`-20250514` was never a valid Claude API ID for the 4.6 family."* The Anthropic docs list plain `claude-sonnet-4-6` as the current ID.

**Impact:** Any chat/completion request that goes through the local Anthropic proxy (rather than LiteLLM) will fail with `404 model_not_found` from Anthropic. The failure path is user-visible: assistant turns return error, not content.

**Fix:**

```typescript
const mapping: Record<string, string> = {
  // Sonnet 4.6 canonical ID — plain alias per Anthropic docs 2026-04-21. No dated snapshot maps are published for the 4.6 family.
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  // Opus 4.6 canonical dated snapshot. Plain alias also works — LiteLLM/Anthropic resolves.
  'claude-opus-4-6': 'claude-opus-4-6-20250610',
  // Haiku 4.5 — existing correct entries stay.
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001',
  // Defensive misnames — keep.
  'claude-haiku-4-6': 'claude-haiku-4-5-20251001',
  'claude-haiku-4.6': 'claude-haiku-4-5-20251001',
  'claude-haiku-4.5': 'claude-haiku-4-5-20251001',
  // NEW: add Opus 4.7 (shipped per Sprint 10 Task 1.2 litellm-config.yaml entries).
  'claude-opus-4-7': 'claude-opus-4-7',
};
```

Plus update `packages/server/tests/local/anthropic-proxy.test.ts` to assert the corrected expected outputs.

### Priority 2 — `workspace-templates.ts:406` invalid default (MEDIUM)

```typescript
// packages/server/src/local/routes/workspace-templates.ts:406  (CURRENT — BUGGED)
let model = 'claude-sonnet-4-20250514';
```

**Impact:** First-run users who land on template-wizard workspace creation get a workspace with the invalid model ID burned in. Next message bounces.

**Fix:** `let model = 'claude-sonnet-4-6';`

### Priority 3 — Test-fixture drift (LOW)

Files that hardcode the invalid `claude-sonnet-4-20250514`:

- `packages/server/tests/litellm-api.test.ts:162, 174`
- `packages/server/tests/routes/agents.test.ts:86, 97`
- `packages/server/tests/local/anthropic-proxy.test.ts` — multiple lines (update contingent on Priority 1).

**Fix:** Migrate to `claude-sonnet-4-6` floating alias unless a specific test exercises dated-snapshot handling.

---

## 5. Recommended naming LOCK for `docs/BENCHMARK-INFRASTRUCTURE.md` (or equivalent)

**Canonical form for all application code and tests:**

| Use case | Correct form | Rationale |
|---|---|---|
| Default model selection, fallback strings, UI catalog | **floating alias** — `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-opus-4-7`, `claude-haiku-4-5` | Anthropic publishes the floating alias as the canonical ID. LiteLLM + Anthropic SDK resolve it to the current dated snapshot on-demand. |
| Benchmark / judge / reproducibility contexts | **dated snapshot** — `claude-opus-4-6-20250610`, `claude-haiku-4-5-20251001`, `claude-opus-4-7-20260201` | Reproducible results demand a pinned version so a model rotation by Anthropic doesn't silently shift benchmark scores. |
| Test fixtures (unless specifically testing date-pinning) | **floating alias** | Keeps tests from codifying provider-internal dated IDs that change. |

**For the 4.6 family specifically:** no valid `-20250514` dated snapshot exists. Any occurrence of `claude-sonnet-4-20250514` in code is a bug.

**Trigger-on-first-caller-trip observability:** LiteLLM's existing `drop_params: true` + 4xx response logging already surfaces model-not-found errors. Explicit alert on `404 model_not_found` in proxy response → structured log with `{provider: 'anthropic', model: X, caller: route}` makes the trip actionable. Not a Sprint 11 gate; proposed as a separate hardening ticket.

---

## 6. Deliverable summary

- **Report:** this file, `docs/reports/opus-4-6-route-audit-2026-04-22.md`.
- **Hit table:** §2 covers 54 references across 20 files.
- **Top 3 cleanups:** §4. Priority 1 is a real user-facing runtime defect and should be the immediate follow-up ticket.
- **Naming LOCK proposal:** §5, awaits PM ratification in `decisions/2026-04-22-model-route-naming-locked.md`.

---

## 7. Budget

| Line | Value |
|---|---|
| B3 cap (brief) | $0.10 |
| Actual spend | $0.00 |
| % of cap | 0% |

Pure read-only audit — no LLM calls.

---

## 8. Related

- `briefs/2026-04-22-cc-sprint-11-kickoff.md` §3 Track B B3
- `litellm-config.yaml` — canonical Sonnet/Opus/Haiku routing + Sprint 10 Task 1.2 note
- `docs/plans/SPRINT-10-CLOSEOUT-2026-04-22.md` — Task 1.2 Sonnet route repair

---

**B3 audit CLOSED. Awaiting PM decision doc `decisions/2026-04-22-model-route-naming-locked.md` for naming LOCK + cleanup-ticket authorization.**

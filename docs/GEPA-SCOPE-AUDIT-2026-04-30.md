# GEPA Scope Audit — 2026-04-30

**Status:** HALT-AND-PM. Three findings, two of them launch-blocking. Decisions needed from Marko before I patch.

---

## Summary table

| Mechanism | Source | Production scope | Status | Action |
|---|---|---|---|---|
| **GEPA input optimizer** (vague-prompt expansion via @ax-llm/ax) | `chat.ts:709` `getOptimizerService(server)` | **First user message only** since 2026-04-16 (commit `6e0cd8b`) | **Intentional** — documented rationale (mid-conversation "yes"/"LGTM" replies were getting expanded into phantom instructions). | **No change unless Marko wants to revert.** |
| **Evolved Behavioral-Spec overrides** (`buildActiveBehavioralSpec` + on-disk overrides) | `chat.ts:207` reads `server.activeBehavioralSpec` per `buildSystemPrompt` call | **Every turn** (cache invalidates on history-length change; live re-decoration on `'behavioral-spec:reloaded'` event) | ✅ **Correct.** | None. |
| **Evolved Persona overrides** (`deployPersonaOverride` writing to `~/.waggle/personas/<id>.json`) | `chat.ts:264` + `:924` use `getPersona(activePersonaId)` | **Built-ins only.** Evolved personas (custom IDs) never resolved. | ❌ **Bug.** | Switch to `listPersonas`-based lookup. |
| **PromptAssembler v5 evolved shapes** (Faza 1 variants `claude::gen1-v1`, `qwen-thinking::gen1-v1`) | `orchestrator.buildAssembledPrompt(...)` defined but **never called outside eval harnesses** | **Never applied in production.** Feature flag exists; consumer code missing. | ❌ **Missing wiring** — most likely the "regression" Marko was sensing. | Wire `agent-loop.ts` to check `isEnabled('PROMPT_ASSEMBLER')` and use the assembled path when on. |

---

## 1. GEPA input optimizer — **first-call-only, intentional**

**Trace path:** `packages/server/src/local/routes/chat.ts:709` → `if (!hasCustomRunner && isFirstUserMessage)` → `getOptimizerService(server)` → `optimizer.optimize(...)`.

**Commit that narrowed it:** `6e0cd8b fix(agent): GEPA mid-conversation expansion + entity extractor person bias` (2026-04-16).

**Diff:**
```diff
- if (!hasCustomRunner) {
+ if (!hasCustomRunner && isFirstUserMessage) {
```

**Rationale (from the commit message + code comment):**
> RC-1: GEPA was running on EVERY user message, expanding mid-conversation replies like "yes thats the story" into phantom instructions the user never intended. Now only runs on the first message in a session.

**This is the input-side prompt expansion** (cheap-Haiku classifier that rewrites vague user messages into more concrete ones), NOT the output-side evolved system prompt application. The two are commonly conflated under the GEPA umbrella but they're distinct subsystems.

**My read:** the rationale is valid. Mid-conversation "yes" without context absolutely would get misclassified as a vague standalone request. Reverting would re-introduce the phantom-expansion bug.

**Decision needed:** confirm we keep first-message-only. ✅ default recommendation.

---

## 2. Evolved Behavioral-Spec overrides — **every turn, correct**

**Trace path:**
- Boot: `packages/server/src/local/index.ts:343-352` builds `activeBehavioralSpec = buildActiveBehavioralSpec(loadBehavioralSpecOverrides(dataDir))`, decorates `server.activeBehavioralSpec`, listens for `'behavioral-spec:reloaded'` and re-derives + re-decorates on each fire.
- Per turn: `chat.ts:207` `const activeSpec = server.activeBehavioralSpec ?? BEHAVIORAL_SPEC; prompt += '\n' + activeSpec.rules;` — reads the **live** decorator value.
- Cache invalidation: `chat.ts:122-125` cache key includes `historyLength`. Each turn the history grows by 1-2 entries → cache miss → `buildSystemPrompt` re-runs → reads `server.activeBehavioralSpec` afresh.

**Per project memory (S1):** "Hot-reload on `'behavioral-spec:reloaded'` event. End-to-end test proves accept → live spec update path works." ✅ Confirmed by code reading.

**No action needed.** This is the path that satisfies the "+12.5pp continuous uplift" claim **for the behavioral-spec subset** of evolution outputs. If Faza 1 produced behavioral-spec deltas, those land correctly.

---

## 3. Evolved Persona overrides — **bug, never applied**

**Trace path:**
- Deploy: `packages/agent/src/evolution-deploy.ts:67-90` `deployPersonaOverride(dataDir, {personaId, systemPrompt})` writes `~/.waggle/personas/<id>.json` atomically.
- Loader: `packages/agent/src/custom-personas.ts:12-30` `loadCustomPersonas(dataDir)` reads all `.json` files in that dir on every call.
- Catalog: `packages/agent/src/personas.ts:67-70` `listPersonas()` returns `[...PERSONAS, ...customPersonas]`.
- **Consumer (chat — bug here):** `packages/server/src/local/routes/chat.ts:264` `const persona = getPersona(activePersonaId);` — `getPersona` is built-in-only:
  ```ts
  export function getPersona(id: string): AgentPersona | null {
    return PERSONAS.find(p => p.id === id) ?? null;  // built-in only
  }
  ```
  And `personas.ts:54` even comments this explicitly: `/** Get a persona by ID (built-in only — use listPersonas() for full catalog) */`.

**Symptom:** for any evolved persona deployed under a non-built-in ID (e.g. `claude::gen1-v1`), `getPersona` returns null → `composePersonaPrompt(prompt, null, ...)` → DOCX hint + tone instruction added but **the evolved system prompt is dropped on the floor**. Same on chat.ts:924.

**Even for SHADOW IDs** (deploy with id matching a built-in like `coder` to override): `find(p => p.id === 'coder')` would still return the built-in entry from `PERSONAS` because `getPersona` doesn't read custom at all.

**Confidence: HIGH** that this is a bug. The deploy comment says "loader picks it up on next `listPersonas()` call" — listPersonas works, but the chat consumer uses getPersona.

**Proposed fix (single-file, 2 lines):**

```diff
// chat.ts top of file
- import { getPersona, composePersonaPrompt, BEHAVIORAL_SPEC } from '@waggle/agent';
+ import { listPersonas, composePersonaPrompt, BEHAVIORAL_SPEC } from '@waggle/agent';
+
+ const findPersona = (id: string) => listPersonas().find(p => p.id === id) ?? null;

// chat.ts:264 + chat.ts:924
- const persona = getPersona(activePersonaId);
+ const persona = findPersona(activePersonaId);
```

`listPersonas` re-reads custom from disk on every call (no cache, see `custom-personas.ts:12-30`), so updates are picked up immediately. The find ordering does prefer built-in for shadow-IDs — which is **the safer default** (don't accidentally let a malformed evolved persona hijack `coder`). If shadowing is desired, the deploy step needs to use a derived ID.

**Decision needed:** ratify the fix as proposed.

---

## 4. PromptAssembler v5 evolved shapes — **missing production wiring**

**Most likely THE bug Marko was sensing.**

**Trace path:**
- Definition: `packages/agent/src/orchestrator.ts:516` `async buildAssembledPrompt(query, persona, opts)` — produces a tier-adaptive, typed, scaffolded prompt via the v5 sixth layer.
- Doc-comment at line 512: `/** Consumers: agent-loop.ts when isEnabled('PROMPT_ASSEMBLER'). */`
- **Reality:** `agent-loop.ts` has **zero references** to `PROMPT_ASSEMBLER`, `isEnabled`, `FEATURE_FLAGS`, or `buildAssembledPrompt`. Verified via:
  ```
  grep -n "PROMPT_ASSEMBLER\|isEnabled\|buildAssembledPrompt\|FEATURE_FLAGS" packages/agent/src/agent-loop.ts
  → no results
  ```
- The only callers of `buildAssembledPrompt` outside the orchestrator's own definition are:
  - `tests/eval/prompt-assembler-eval.ts:335`
  - `tests/eval/prompt-assembler-v5-eval.ts:688`
  - `tests/prompt-assembler-feature-flag.test.ts:65, 81`

**All four are eval harnesses or unit tests.** Production runtime never invokes the assembled path.

**Implication for the launch story:**
- The +12.5pp uplift numbers from Faza 1 evals are **real** — those evals call `buildAssembledPrompt` correctly.
- But in **production** (chat + spawn), `WAGGLE_PROMPT_ASSEMBLER=1` does nothing. The flag is a no-op. The runtime only uses `orch.buildSystemPrompt()` (the v4 / pre-PA path).
- "Continuous +12.5pp uplift" claim does **not** match implementation today.

**This is a missing-wiring**, not a deliberate narrowing. Marko needs to ratify whether to (a) ship the wiring now, or (b) hold the launch claim until a different rollout strategy lands.

**Proposed fix (sketch, agent-loop integration):**

In `packages/agent/src/agent-loop.ts`, around the system-prompt usage, gate on the flag:

```ts
import { isEnabled } from './feature-flags.js';
// ...
const systemPrompt = isEnabled('PROMPT_ASSEMBLER') && config.orchestrator
  ? (await config.orchestrator.buildAssembledPrompt(/* query */, /* persona */, /* opts */)).prompt
  : config.systemPrompt;
```

But that requires:
1. Threading `orchestrator` + `query` (latest user message) into `AgentLoopConfig` — currently `systemPrompt` is pre-built by the caller.
2. Threading `persona` so the assembler can layer it.
3. Threading `taskShape` if Faza 1's evolved shapes are task-typed (e.g., `Plan`, `Recall`, `Summarize`).
4. Doing this both for chat (`chat.ts:1042` agentConfig construction) AND for spawn (`fleet.ts` runAgentLoop call I just shipped — Phase B).

This is a **substantial wiring task**, not a 2-line patch. ~30-90 min of careful edits across 3-4 files plus tests.

**Decision needed:** ratify whether to wire it now (and accept the scope), or ship the launch with the v4 path and revisit. If we ship with v4: launch story copy needs to change from "+12.5pp continuous uplift" to something honest about the eval-vs-production gap, OR the flag default needs to flip to ON with the wiring.

---

## My recommendation

1. **Finding #1 (input optimizer first-call-only):** **No change.** Documented rationale is sound.
2. **Finding #2 (behavioral-spec):** **No change.** Already correct (every turn, hot-reloadable).
3. **Finding #3 (persona override consumer):** **Patch.** 2-line fix in chat.ts. Low risk. Tests:
   - `vitest run packages/agent/tests/evolution-deploy.test.ts` (existing)
   - Manual verify: deploy a custom persona via the personas API, set workspace.personaId to the custom id, send a chat → response should reflect the evolved system prompt.
4. **Finding #4 (PromptAssembler wiring):** **HALT-AND-PM.** This is a launch story decision. Three options:
   - **(a) Wire it now**: 30-90 min, scope creep relative to today's session, but shippable.
   - **(b) Adjust the launch claim**: ship with v4 path, copy honestly says "evolved variants demonstrated +12.5pp in offline eval; production rollout staged".
   - **(c) Move the May 14 routine forward** to also include this wiring task — bundles the structural fix with contract tests.

**Awaiting Marko's call on #3 and #4.** No code changes shipped yet. Investigation only.

---

**Files touched by this audit:** none. This is a research-only output.

**Audit refs:**
- `packages/server/src/local/routes/chat.ts:122-272, 660-738, 920-925, 1042-1056, 1503`
- `packages/server/src/local/index.ts:340-352`
- `packages/agent/src/personas.ts:54-70`
- `packages/agent/src/custom-personas.ts:12-30`
- `packages/agent/src/evolution-deploy.ts:60-90`
- `packages/agent/src/orchestrator.ts:466-506, 512-516`
- `packages/agent/src/agent-loop.ts` (full file — verified zero PROMPT_ASSEMBLER references)
- `packages/agent/src/feature-flags.ts:34`
- Commit `6e0cd8b` (2026-04-16) GEPA optimizer first-message narrowing

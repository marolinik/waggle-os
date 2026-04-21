# Opus 4.6 dated-snapshot route audit

**Opened:** 2026-04-21 (Sprint 10 Day-2, per PM ratification at
`PM-Waggle-OS/decisions/2026-04-21-sprint-10-task-1.2-ratified-opus46-deferred.md`).
**Policy:** **trigger on first caller trip** — do NOT audit proactively
in Sprint 10.
**Related:** Sprint 10 Task 1.2 (Sonnet route repair, commit `a09831e`
merge), migration note at `ops/litellm/README.md` §Sprint-10-Task-1.2.

---

## Why this file exists

Sprint 10 Task 1.2 repaired the `claude-sonnet-4-6` LiteLLM alias which
had been routing to a dated snapshot (`-20250514`) that was never a
valid Claude API ID for the Sonnet 4.6 family. Investigation of the
config showed the adjacent `claude-opus-4-6` alias uses the same
dated-snapshot pattern (`-20250610`) and may have the same latent
defect.

Per Anthropic's live models overview (re-fetched 2026-04-21), the Opus
4.6 family Claude API ID is `claude-opus-4-6` (plain alias, no dated
suffix). The `-20250610` suffix is not explicitly listed in the docs
for the 4.6 family — it could be a valid but unlisted snapshot, or it
could be a broken legacy entry that nobody's called in a while.

PM policy (2026-04-21): **no speculative audit.** The potential defect
affects only callers that explicitly call `claude-opus-4-6`, and Sprint
10 doesn't exercise that path (judges run `claude-opus-4-7` + Sonnet +
tri-vendor). Opening a speculative audit PR in Sprint 10 distracts from
the locked operational queue. Instead, this ticket tracks the concern
and authorizes a targeted audit if/when a runtime caller trips on it.

## Caller map (as of 2026-04-21 commit `6cf7554`)

`claude-opus-4-6` or `claude-opus-4.6` is referenced in 22 files
(grep result, waggle-os repo only — zero hits in hive-mind):

- **Config + docs:** `litellm-config.yaml`, `ops/litellm/README.md`,
  `benchmarks/harness/config/models.json`, `docs/specs/PROMPT-ASSEMBLER-V4.md`,
  `EVAL-RESULTS-V5.md`.
- **Runtime routes:** `packages/server/src/local/routes/providers.ts`,
  `packages/server/src/local/routes/anthropic-proxy.ts`,
  `packages/server/src/local/routes/litellm.ts`.
- **Frontend:** `apps/web/src/lib/providers.ts`,
  `apps/web/src/components/os/apps/ChatWindowInstance.tsx`,
  `apps/web/src/lib/spawn-agent-helpers.test.ts`.
- **Agent + eval:** `packages/agent/src/cost-tracker.ts`,
  `packages/agent/tests/eval/prompt-assembler-v5-eval.ts`,
  `packages/agent/tests/eval/prompt-assembler-eval.ts`,
  `packages/agent/tests/model-tier.test.ts`,
  `packages/server/tests/local-mode.test.ts`.
- **Scripts + historical:**
  `scripts/evolution-hypothesis{,-resume,-rejudge-gemini}.mjs`,
  `docs/.evolution-hypothesis-2026-04-14T08-04-57/03-judge-scores.json`.
- **Tauri artifacts:** `app/src-tauri/resources/service.js{,.map}`
  (build outputs — not source).

Most of these are configuration, UI model-picker strings, or
historical eval artifacts. Active runtime paths are:

- `packages/server/src/local/routes/providers.ts`
- `packages/server/src/local/routes/anthropic-proxy.ts`
- `packages/server/src/local/routes/litellm.ts`
- `packages/agent/src/cost-tracker.ts`
- `apps/web/src/lib/providers.ts` + consumer `ChatWindowInstance.tsx`

If a user in the UI picks "Claude Opus 4.6" in the model selector and
runs a chat turn, the call flows UI → providers.ts → Anthropic
route → LiteLLM → `anthropic/claude-opus-4-6-20250610`. That's the
trip surface.

## Trigger condition

Open a PR with title
> `fix(litellm): audit claude-opus-4-6 dated-snapshot route`

when any of the following happen:

1. A user reports a 404 / model_not_found when picking Opus 4.6 in
   the Waggle UI model picker, OR
2. A test or eval harness run fails with the LiteLLM error signature
   `litellm.NotFoundError: AnthropicException - ... model:
   claude-opus-4-6-20250610`, OR
3. An operational readiness check (e.g., pre-Stage-2 full-suite
   vitest) explicitly exercises the Opus 4.6 route and returns the
   same signature.

## Fix shape (if triggered)

Should mirror the Sprint 10 Task 1.2 Sonnet repair:

1. Re-fetch Anthropic docs. Confirm the current live Claude API ID
   for Opus 4.6 (expected: plain `claude-opus-4-6`; the `-20250610`
   dated snapshot is expected to be either valid-but-decommissioned
   or invented).
2. Edit `litellm-config.yaml` — repoint the primary
   `claude-opus-4-6` alias + the legacy alias
   `anthropic/claude-opus-4.6` to the plain `anthropic/claude-opus-4-6`.
3. Add a section to `ops/litellm/README.md` under the existing
   Sprint-10 Task-1.2 header documenting the triggering call, the
   date, and the verification docs URL.
4. Extend `scripts/smoke-sonnet-route.mjs` into
   `scripts/smoke-anthropic-route.mjs` (parameterized by model) OR
   add an Opus-specific smoke script — pick the cheaper path based
   on whether other Anthropic routes are expected to need similar
   audits (Haiku 4.5 is already correctly dated per the current
   config).
5. Commit + PR with commit message referencing this doc as root-cause
   memo and the Sprint 10 Task 1.2 migration note as the repair
   template.

## Non-actions (per PM policy)

- Do NOT pre-audit. Do NOT open a Sprint 10 PR for this.
- Do NOT remove the `claude-opus-4-6` alias from the config — a
  UI-picker reference still exists. If broken, repair is right; removal
  is scope-creep.
- Do NOT expand the audit to other Anthropic aliases without a specific
  caller-trip signal. `claude-haiku-4-5-20251001` for example has a
  valid dated suffix per the public docs.

---

*Ticket stays open until either the trigger fires (fix) or until the
Opus 4.6 alias is retired from all callers (close as obsolete). No
forced Sprint slot.*

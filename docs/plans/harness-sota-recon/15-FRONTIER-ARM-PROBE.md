# 15 — Frontier-Arm Tool+Reasoning Probe (study-prep, 2026-06-18)

**Why:** the banking pilot caught that **gpt-5.5 silently all-errors** on tools+reasoning via chat/completions (needs `/v1/responses`). gpt-5.5/Opus/Gemini are study **arms** (A/C/E = the frontier ceiling H3's convergence claim rests on) — a per-arm API mismatch all-zeros that arm in the priced grid. So before the freeze, probe each frontier arm with the exact shape tau2 sends: a chat/completions call with a **function tool + reasoning_effort**.

## Results

| Arm | Tools alone | Tools + reasoning_effort | Status |
|---|---|---|---|
| **gpt-5.5** | (n/a) | ✅ via `gpt-5.5-responses` alias | **FIXED** (docs/13 — litellm chat→responses bridge) |
| **gpt-5.2** | ✅ | ✅ | OK (validated by retail+banking ruler PASS) |
| **Opus 4.8** | ✅ HTTP 200 | ❌ HTTP 400 | **NEEDS ROUTING FIX** (below) |
| **Gemini 3.1 Pro** | — | ❌ HTTP 400 | **BLOCKED: GEMINI_API_KEY expired** (founder action — rotate key, then re-probe) |

## Opus 4.8 — the real finding (same class as gpt-5.5)

Opus 4.8 + tools works (HTTP 200) **without** a thinking param. With `reasoning_effort`, it 400s:

> `"thinking.type.enabled" is not supported for this model. Use "thinking.type.adaptive" and "output_config.effort" to control thinking behavior.`

litellm (even `main-latest`, 1.81.9) translates `reasoning_effort` → Anthropic's **old** `thinking={type:enabled, budget_tokens}` format. **Opus 4.8 is adaptive-thinking-only** and rejects it (matches param-sheet §2.2 "Opus 4.8 = adaptive-thinking only; set effort"). litellm's Anthropic adapter predates Opus 4.8's API.

**Without a fix, Opus arms (A/C/E) all-error in the grid — fatal to the H3 ceiling.**

### Fix fork (founder/design decision — §5.3 wants Opus effort PINNED + swept)

1. **Run Opus on default adaptive thinking (drop `reasoning_effort` for Opus only).** Works *today* (HTTP 200). Cost: lose explicit effort-pinning + the effort-sweep on Opus (the model picks effort adaptively). Cleanest; defensible if disclosed.
2. **Inject `output_config.effort` via a litellm route/extra_body for opus-4-8.** Preserves effort-pinning, matches the design. Needs a litellm param-passthrough config (the `responses/`-prefix trick won't apply — different provider); ~moderate effort, must verify tau2's `--agent-llm-args` reaches it.
3. **litellm version bump / patch** to emit adaptive thinking for opus-4-x. Uncertain (Opus 4.8 is newer than the adapter); could destabilize other routes.

**Recommendation:** Option 1 for the first priced cells (unblocks immediately, disclose "Opus runs adaptive-effort, not pinned"), and pursue Option 2 in parallel so the effort-sweep (§5.3 / `03` D5) is available for the full grid. Either way the **arm-A neutrality check** (`03` D5: arm A ≥ arm E on ≥1 cell) still governs.

## Resolution (2026-06-18, founder decisions actioned)

- **gpt-5.5**: done (`gpt-5.5-responses` bridge) — tool_call confirmed.
- **Opus 4.8** — founder chose **default-adaptive now + pinned-effort passthrough in parallel**. Default-adaptive verified: curl tool-call HTTP 200 without the thinking param; tau2 smoke ran with **0 thinking/BadRequest errors** (it infra-errored only on the gpt-5.2 *user-sim* quota, not Opus). So the Opus AGENT routing is validated for default-adaptive. **Parallel track (open):** litellm `output_config.effort` passthrough to restore §5.3 effort-pinning + sweep.
- **Gemini 3.1 Pro** — new key in; native Google API tool+thinking = HTTP 200; **through litellm: HTTP 200, `reasoning_effort`→`thinkingConfig` translated with NO error** (returned text not tool_call on the bare prompt — a model choice, not the hard-400 failure class). Routing OK; a full end-to-end tau2 Gemini smoke is pending OpenAI quota (user-sim). Key supplied via proxy env (`os.environ/GEMINI_API_KEY`, not committed); **rotate after the study (it transited chat)**.
- **Verdict: no frontier arm has an unresolved HARD routing blocker.** The pre-reg rule stands: every reasoning arm must pass this probe before freeze.

## NEW BLOCKER — OpenAI quota exhausted (recurring)

`gpt-5.2 → HTTP 429 insufficient_quota` again (2nd time; ~$54+ of pilot runs drained the top-up). **gpt-5.2 is the user-sim for EVERY τ² cell**, so this blocks all scored runs. The priced study grid (pooled N≈1,500 × arms A–E × trials) is **far larger** than the pilot — it needs a **substantial OpenAI credit allocation / raised spend cap up front**, not incremental top-ups. Founder action. (Anthropic/Gemini spend is separate and not yet stressed.)

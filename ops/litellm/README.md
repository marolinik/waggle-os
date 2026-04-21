# LiteLLM Routing — Operational Notes

Operational notes + migration log for `litellm-config.yaml` route changes
where the rationale isn't obvious from the config diff alone. Keep this
file narrow: **only entries where a future reader would otherwise not
know why we chose a particular upstream slug or fallback policy.**

---

## Sprint 10 Task 1.4 — DashScope intl primary + OR failover (2026-04-21)

**Key provisioning.** A classic DashScope Model Studio API key (`sk-…`,
not `sk-ws-…`) was provisioned on 2026-04-21 and is held in two places:

- `.env` under `DASHSCOPE_API_KEY=sk-…` (LiteLLM container reads at
  startup via `os.environ/DASHSCOPE_API_KEY`).
- Waggle vault under name `alibaba` (credentialType `api_key`).

The key is bound to the **international tenant**, not mainland. Smoke
verification (2026-04-21):

| Endpoint | Result |
|---|---|
| `https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions` | HTTP 200, target `qwen3.6-35b-a3b` returns valid completion with `reasoning_content` populated (thinking default on) |
| `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | HTTP 401 `invalid_api_key` — key is intl-bound |

**Routing decision.** `litellm-config.yaml` now carries three Qwen3.6
routes:

| Alias | Upstream | Role |
|---|---|---|
| `qwen3.6-35b-a3b` | `openai/qwen3.6-35b-a3b` @ `dashscope-intl.aliyuncs.com/compatible-mode/v1` | **Canonical primary** — real 3.6 model |
| `qwen3.6-35b-a3b-via-dashscope` | identical to canonical | **Explicit DashScope pin** — for operator scripts that want to bypass a canonical alias flip |
| `qwen3.6-35b-a3b-via-openrouter` | `openrouter/qwen/qwen3.5-35b-a3b` | **Failover** — one-minor regression to 3.5 (OR catalog lacks 3.6-35b-a3b as of 2026-04-21) |

**Failover policy.** Caller-side responsibility, not LiteLLM router:

1. First call: `qwen3.6-35b-a3b` (canonical, DashScope-intl).
2. On HTTP 429 rate-limit or 5xx within a reasonable retry window
   (client-judgment), retry on `qwen3.6-35b-a3b-via-openrouter`.
3. OR path returns Qwen3.5-35B-A3B, so log the model substitution in
   the caller's trace record so Week-1 / Stage-2 aggregate reports
   attribute correctly. The `judge-runner.ts` trace already carries
   `judge_model`, so a failover just writes the failover model name
   to that field; no schema change needed.
4. Do NOT use `openrouter/auto` as a third-tier failover — it can
   silently route to an unrelated model and pollute cost accounting.

LiteLLM's per-route `fallbacks` field is supported (would let us
declare failover in config rather than caller logic) but deliberately
not used here: the Week-1 / Stage-2 trace schema relies on precise
per-call model attribution, and letting LiteLLM transparently swap
models would make traces harder to audit.

**Regression gate.** `scripts/smoke-qwen-dual-route.mjs` calls both
routes with the same prompt, verifies both return HTTP 200, logs
per-route completion, latency, and token counts. Task 1.1 (Qwen
stability matrix) uses the canonical alias for its live run — which
means the matrix now exercises the real 3.6 model, not the 3.5 OR
fallback. Materially improves Stage-2-prep defensibility.

**Follow-up for Marko (when available).** If the key later gets mainland
provisioning too, a second route `qwen3.6-35b-a3b-via-dashscope-mainland`
can be added with the same key pattern — but the intl endpoint is
sufficient for Sprint 10 + Stage 2 benchmarks.

---

## Sprint 10 Task 1.2 — Sonnet 4.6 dated-snapshot repair (2026-04-21)

**Problem.** The `claude-sonnet-4-6` alias previously routed to
`anthropic/claude-sonnet-4-6-20250514`. That dated-snapshot suffix was
never a valid Claude API ID for the Sonnet 4.6 family.

**Where it was caught.** Sprint 9 Task 4 calibration (commit `f9b98aa`)
attempted to exercise the Sonnet route and LiteLLM returned an error
consistent with a `model_not_found` response. The Sprint 9 session
substituted `claude-opus-4-7` for the calibration gate (10/10 PASS) and
queued the Sonnet route repair as Sprint-10 operational work.

**Verification.** Re-fetched the Anthropic models overview on
2026-04-21 (docs redirect target:
<https://platform.claude.com/docs/en/docs/about-claude/models/overview>).

Current table confirms:

- **Claude Sonnet 4.6** — `Claude API ID: claude-sonnet-4-6`, `Claude API
  alias: claude-sonnet-4-6`.
- No valid dated-snapshot with the `-20250514` suffix exists for the
  Sonnet 4.6 family. The `-20250514` snapshot belongs to the deprecated
  Claude **Sonnet 4** (single-digit) family, not Sonnet 4.6, and that
  family is scheduled for retirement on 2026-06-15 per the public
  deprecation notice.

**Fix.** Repointed the native Anthropic target from
`anthropic/claude-sonnet-4-6-20250514` to the plain alias
`anthropic/claude-sonnet-4-6`, with matching fixes to the two legacy
aliases (`claude-3-5-sonnet-20241022` and `anthropic/claude-sonnet-4-6`)
that routed to the same broken target.

**Scope discipline.** The adjacent `claude-opus-4-6-20250610` route uses
the same dated-snapshot pattern and is therefore a candidate for the
same defect. It is **out of scope for Sprint 10 Task 1.2** — Sprint 10
runs judges on `claude-opus-4-7` (verified good in Sprint 9) and
`claude-sonnet-4-6` (this PR). Opus 4.6 will be audited separately only
if/when a caller needs it. No speculative edits.

**Regression gate.** `scripts/smoke-sonnet-route.mjs` is the one-shot
HTTP probe that verifies the repaired route returns 200 (not 404
`model_not_found`) on the LiteLLM proxy. Task 1.3 (judge calibration on
Sonnet) is the full functional regression — it replays the 10
ground-truth triples through the repaired route and reports match rate
vs. PM human labels.

**PM review gate (open).** Per Sprint 10 brief §1.2, Marko ratifies the
mapping before this PR merges. Open question for the reviewer: do we
also want a separate PR to audit the Opus-4.6 dated snapshot, or leave
that out until a caller trips on it?

---

## Existing route conventions (carried forward)

### Dated snapshots vs plain aliases

Prefer plain family aliases (`claude-opus-4-7`, `claude-sonnet-4-6`)
unless a specific dated snapshot is required for reproducibility. Plain
aliases automatically follow Anthropic's "current" pointer within a
family and survive version bumps without requiring config churn.

Dated snapshots are stable indefinitely once live but carry two risks:

1. Anthropic can decommission a dated snapshot without migrating the
   alias forward — the 2026-04-21 incident (Task 1.2 above) is a
   canonical example.
2. Dated snapshot IDs are easy to invent with the wrong date format. A
   404 on a dated ID always warrants re-verification against the live
   docs before trusting the old value.

### OpenRouter bridge routes

Several routes of the form `<provider>-<model>-via-openrouter` exist as
parallel paths through OpenRouter for providers where the native key is
not provisioned or where OR has a more stable upstream (notably Kimi
K2.x, Qwen3.x families). Keep the primary alias pointing at the native
provider when possible; OR routes are failover, not default.

### `drop_params: true`

LiteLLM's global `drop_params` setting strips unsupported params. That
includes provider-specific extras like Anthropic's `thinking` or
DashScope's `extra_body.enable_thinking`. If a caller needs a param that
LiteLLM would otherwise drop, either (a) route around LiteLLM for that
specific call (see `scripts/stage-0-query.mjs` for the pattern), or
(b) pass the param through a route that uses the provider-native SDK.

---

*Maintained as part of Sprint 10 operational queue close-out. Extend
this file with a new `##` section per route change that needs
operational-memory preservation.*

# LiteLLM Routing — Operational Notes

Operational notes + migration log for `litellm-config.yaml` route changes
where the rationale isn't obvious from the config diff alone. Keep this
file narrow: **only entries where a future reader would otherwise not
know why we chose a particular upstream slug or fallback policy.**

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

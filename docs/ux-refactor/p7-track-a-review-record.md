# P7/D15 Track A — Adversarial Review Record

> Multi-agent review of the full Track A taxonomy diff (`7bbe5d8^..0f0a00e`): **6 dimension
> reviewers → 3-lens adversarial verification** (correctness / type-and-runtime-safety /
> reproduction; confirmed if ≥2 of 3 vote real). 30 agents, ~3.0M subagent tokens, ~13 min.
> Fixes in `1f8eab3`.

## Tally

**8 findings → 4 confirmed (3 distinct) / 4 refuted.**

| # | Sev | Votes | Dimension | Finding | Disposition |
|---|-----|-------|-----------|---------|-------------|
| 1/2 | MED+LOW | 3/3 + 2/3 | enum-exhaustiveness | `generateExplanation` (trust-model) had no `'critical'` branch — A2 widened RiskLevel 3→4 but this if-chain fell through to the `'high'` "Elevated risk" string. A critical capability's prose contradicted the "Critical" RiskBadge on the same approval card (badge says Critical, text says Elevated) — on precisely the most dangerous installs. tsc didn't catch it (if-chain, not exhaustive switch). | **FIXED** — added a `critical` branch + an `assertNeverRisk` exhaustiveness guard so the next RiskLevel widening fails tsc instead of silently mislabelling. Test: a 9-point assessment is `critical` and its explanation says "Critical risk", not "Elevated risk". |
| 3 | MED | 3/3 | a4-server-enrichment | A4 hardcoded `trustSource:'local_user'` for every non-install gated tool. `local_user` canonically means "user-created via create_skill", so a `git push` / `connector_*_send_email` / gated `bash` rendered **`Source: local_user`** on the in-chat card — a false provenance claim on the very surface whose job is to convey provenance. | **FIXED** — `trustSource` is now **omitted** in the heuristic branch (no real provenance signal exists for a shell/git/connector call; the FE already guards on `request.trustSource &&`, so the row disappears). |
| 4 | LOW | 2/3 | a4-server-enrichment | `describeToolUse` returned the generic `"Using <name>…"` default for `git_push`/`git_merge`/`git_pr`, connector writes, and cross-workspace reads, so the A4 `description` wasn't action-specific. | **FIXED** — added `git_push`/`merge`/`pr` cases + prefix handling for `connector_<id>_<action>` ("create issue via jira") and `read_other_workspace*`. |

### Folded in (refuted HIGH, but a cheap real hardening)

The `a5a6-fe-flow` HIGH — *"enrichment failure makes Always-allow fail OPEN for the
riskiest tool"* (1/3, refuted) — was nonetheless addressed: the `install_capability`
catch now **falls back to `classifyGatedToolRisk`** so `approvalClass` is NEVER absent.
A failed content-based assessment can no longer leave `approvalClass` undefined →
`canAlwaysAllow(undefined)===true` → "Always allow" shown on a critical install. The
panel refuted it as unlikely-to-throw, but closing the fail-open path is one line and
defensible, so it shipped.

## Refuted (4)

- **A3 parity test doesn't cover the db.ts migration sentinel** (MED, 1/3) — the parity
  test pins the DDL CHECK lists; the migration sentinel is covered by the install-audit
  migration test. Out of A3 scope.
- **Always-allow fail-open** (HIGH, 1/3) — refuted as unlikely, but hardened anyway (above).
- **Non-install hardcoded trustSource/assessmentMode** (LOW, 1/3) — the trustSource half
  was the same root as #3 (fixed); assessmentMode `'heuristic'` is accurate, kept.
- **RiskBadge indexes shared maps with an unvalidated SSE risk string** (LOW, 0/3) — the
  maps are exhaustive over RiskLevel and the badge only renders when `request.riskLevel`
  is set by the server (a closed set); no unvalidated-index crash path.

## Gate (post-fix)

tsc 0 (agent/core/server) · agent 82 + chat-helpers 117 green · lint 0. `1f8eab3`.

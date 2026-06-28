# Odysseus Adoption — Implementation Plan (2026-06-28)

Source brief: `docs/analysis/odysseus-adoption-2026-06-28.md`. Branch: `codex/fix-ai-os-proof-plumbing`.
AGPL: every port is clean-room TS (concept/knowledge only — no odysseus code, no binary).

## Phase 1 — high-confidence ADOPTs (this arc · all TDD-able · file-disjoint)

| # | Item | Lever | Files (primary) | Tier | Effort |
|---|---|---|---|---|---|
| 1 | **§A Email→memory harvest** (outlook) | moat | `packages/agent/src/connectors/outlook-connector.ts` (+ mirror gcal/github `harvestAction`); wired via existing `connector-harvest.ts` | PRO | S |
| 2 | **§B-budget adaptive input-token budget** | proxy-cost | `packages/server/src/local/routes/chat.ts:~1254` pass `maxContextTokens` override (window·0.85, clamp, conservative-on-unknown); helper `compute_input_token_budget` clean-room in agent | all | S |
| 3 | **§E1 memory-mcp read-only scope-gate** | moat hygiene | `packages/memory-mcp/src/index.ts`, `packages/hive-mind-mcp-server/src/tools/memory.ts` — scope-gated tool registration + write-implies-read | all | S |
| 4 | **§D1 skill hygiene judge** | upgrade-trigger | `packages/server/src/local/routes/skills.ts` + reuse `packages/agent/src/judge.ts`; advisory flag → usage sidecar (no SKILL.md churn) | all | S |
| 5 | **§C untrusted-content wrapper + THREAT_MODEL.md** | moat-harden + KVARK | new `packages/agent/src/untrusted-context.ts`; apply at `tool-executor.ts:114` (post-scan); investigate taint-preservation in message assembly; `THREAT_MODEL.md` | all | M |

**Gate before commit:** `npx tsc --noEmit` on shared/core/agent/server (+ memory-mcp, hive-mind-mcp-server) · `vitest run` on every touched package + new tests · multi-lens review (security + ts + founder-bar) · 0 regressions vs touched-area baseline.

## Phase 2 — L-effort builds (staged)

| # | Item | Status | Notes |
|---|---|---|---|
| 6 | **§B Cookbook ranking engine** | ✅ SHIPPED (`e46ff6b0`) | clean-room TS port of `fit.py` math (pure fns → TDD): quant bytes/param, MoE active-param, harmonic CPU-offload tok/s, composite score, serve-path gating. Then **staged detection** (NVIDIA `nvidia-smi` + Apple + basic-RAM first; long tail iteratively, as a checklist). Replaces `basicModelRecommendations` in `local-inference.ts`. |
| 7 | **§D2 PRO autonomous skill-audit loop** | ✅ SHIPPED (this commit) | `skill-audit{,-store}.ts` (synth→run→judge→rewrite→retry), `skills-audit.ts` route (PRO + vault-key gated), GET `/api/skills` badge merge + staleness-on-read, `SkillRow` "verified · NN%" badge + per-row Verify trigger (`adapter.auditSkills`). **Advisory-by-default**: `autoRewrite`/`autoDemote` OFF, fail-safe taxonomy (a flaky judge can never mint a false badge nor demote a good skill). Reuses `LLMJudge` + `demoteSkillToDraft` (single active/draft owner); fences skill content via the §C `untrustedContextWrapper`. 87 tests; tsc 0 ×3. |
| 8 | **§B-adjacent per-query tool selection** | ⏸ DEFER (per brief) | reuse HybridSearch lane as tool retriever; the dead `filterToolsForContext` is the socket; port the ~10-regression de-risk layer. The brief explicitly DEFERs this (§B-adjacent, "do not over-promote") — the reliability tail is the real cost. Revisit as a deliberate local-model arc. |

### §D2 open items (founder decisions / follow-ups, non-blocking)
- **F3 (founder call):** "verified" is a same-model self-grade (the user's one key synthesizes the task, runs the skill, and grades it). Defensible (catches gross brokenness; the card shows confidence %, not a bare check) but consider relabel ("self-check passed") OR adversarial held-out test + a different model class. Brief names it "verified", so kept as-is pending a call.
- **F5 / restore coupling:** `restoreSkillToActive` doesn't reset the audit badge's `consecutiveFails` → a restored skill can re-demote on the next confident fail. Benign while `autoDemote` defaults OFF.
- **T3 (TOCTOU):** `recordAuditBadge` read-modify-write isn't linearizable under concurrent same-skill POSTs (safe direction: missed increment → no false demote). Single-user/sequential-batch makes it a non-issue today.
- **F8 (pre-existing):** `skills.ts` CRUD `onChange` reloads from `loadSkills` (drafts included), not `loadActiveSkills` — a demoted draft re-enters the live prompt until the next hygiene/audit run. Out of D2 scope.

## Method

1. **Design (workflow, parallel):** per Phase-1 item → exact edits + failing tests + risks (grounded in real files).
2. **Implement (main tree, sequential, TDD):** test-first, targeted `tsc`+`vitest` after each.
3. **Review (workflow, parallel):** security-reviewer + typescript-reviewer + founder-bar/correctness.
4. **Fix → full gate → confirm → commit per phase.** No commit until gate + user confirm.

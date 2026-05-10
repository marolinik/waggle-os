# Model Route Naming Convention — LOCKED

**Datum:** 2026-04-22
**Sprint:** 11 · Track B · Task B3 follow-up
**Authority:** PM (Marko Marković via Cowork ratification 2026-04-22 PM)
**Source artifact:** `docs/reports/opus-4-6-route-audit-2026-04-22.md` §5 (CC B3 audit, commit `151113f`)
**Status:** LOCKED — supersedes any prior ad-hoc naming convention in `litellm-config.yaml`, `anthropic-proxy.ts`, `workspace-templates.ts`, and test fixtures
**Scope:** All `packages/server/`, `packages/cli/`, `apps/www/`, harness configs, and litellm route declarations

---

## 1. Decision

Two distinct naming surfaces are LOCKED, each with non-overlapping purpose:

**Surface A — Floating alias.** Used in runtime code paths: proxy mapping, workspace template defaults, agent harness defaults, UI model picker labels. Format: `{provider}/{family}-{tier}` (e.g., `anthropic/claude-sonnet-4-6`, `anthropic/claude-haiku-4-5`, `xai/grok-4.20`). The provider rotates the underlying snapshot; the alias keeps pointing to the latest stable.

**Surface B — Dated snapshot.** Used ONLY in benchmark configs, regression test fixtures, audit replay manifests, and decision docs that need to pin model behavior at a moment in time. Format: `{provider}/{family}-{tier}-{YYYYMMDD}` (e.g., `anthropic/claude-sonnet-4-6-20260101`). Dated snapshots MUST be valid at the time of writing — verified against the provider's published snapshot list before commit.

**Provider prefix is mandatory** in `litellm-config.yaml` for all routes. Bare model names (`gpt-5.4`, `qwen3.6-35b-a3b`) without prefix are deprecated; new routes must declare provider explicitly.

## 2. Rationale

The B3 audit surfaced a real runtime defect: 9 of 11 dated-snapshot references in `packages/server/` use `-20250514`, which was never a valid Claude 4.6 family snapshot. Production code paths that send these IDs to Anthropic return `404 model_not_found`. The defect persisted because:

- Naming convention was implicit, not LOCKED in any decision doc.
- Floating alias and dated snapshot were used interchangeably, with no separation of concerns between runtime defaults (which should auto-track provider rotation) and benchmark reproducibility (which must pin a specific snapshot).
- Test mocks hid the defect from CI signal.

The LOCK enforces semantic separation: runtime code never hardcodes a snapshot ID; benchmark code never uses a floating alias. Drift between the two surfaces becomes detectable.

## 3. Authorization — Cleanup ticket

PM hereby authorizes a cleanup ticket scoped to the B3 audit findings, executable by CC-1 in a single tranche before C2 Stage 1 mikro-eval kickoff (or immediately after, at CC-1's discretion). Budget: $0 (read/edit only, no LLM calls).

**HIGH priority — surgical fix, in-scope before C2:**

- `packages/server/src/<…>/anthropic-proxy.ts:43-44` — replace floating-alias-to-invalid-dated-snapshot mapping. Two acceptable resolutions: (a) drop the mapping entirely so floating aliases pass through to Anthropic unchanged (preferred — Anthropic resolves them server-side); (b) map floating alias to a verified-valid current dated snapshot. Choose (a) unless there is a documented reason to pin.

**MEDIUM priority — in-scope before C2:**

- `packages/server/src/<…>/workspace-templates.ts:406` — change new-workspace default from `claude-sonnet-4-20250514` (invalid) to `anthropic/claude-sonnet-4-6` (floating alias). New users must not bounce on first message.

**LOW priority — fold into Sprint 11 close commit or first Day-3 commit:**

- 3 test files referenced in B3 report §3 — replace hardcoded `-20250514` with floating alias. Tests pass currently only because providers are mocked; the values are misleading documentation. Update to floating alias for clarity.
- `packages/server/src/<…>/litellm.ts:65` — rename pricing table entry `claude-haiku-4-6` → `claude-haiku-4-5`. Haiku 4.6 does not exist; current Haiku is 4.5. This is a misname, not a routing bug.

## 4. Validation gates

CC-1 must satisfy before commit:

1. `pnpm test` — zero regressions across affected suites.
2. `tsc --noEmit` clean on `packages/server/tsconfig.json`.
3. New unit test in `packages/server/tests/<…>/anthropic-proxy.test.ts` asserting that the proxy does NOT inject `-20250514` (or any invalid dated snapshot) into outbound requests.
4. Grep guard added to a new lint script `scripts/check-no-invalid-snapshots.mjs` that fails CI if `-20250514` appears anywhere in `packages/server/src/`. This freezes the regression.
5. Commit message references this decision doc.

## 5. Naming policy in new code

For all new routes added after this LOCK:

- Runtime defaults, proxy mappings, workspace templates, agent harness defaults: use floating alias `{provider}/{family}-{tier}`.
- Benchmark configs (`benchmarks/harness/`, `litellm-config.yaml` benchmark section, evaluation manifests): use dated snapshot `{provider}/{family}-{tier}-{YYYYMMDD}` AND verify the date against provider's published snapshot list at PR review time.
- Decision docs and ratification artifacts: cite both forms when relevant — floating alias for what the system uses today, dated snapshot for what was tested at the time of decision.

## 6. Out of scope

- Renaming routes in user-facing UI labels (model picker dropdown). That is a copy decision for design team, not a naming convention LOCK.
- Migrating existing benchmark JSONL records to retroactively cite snapshot IDs. Historical records keep whatever they have; Stage 2 onward records cite per the new convention.
- Provider rotation policy (when to upgrade floating alias from N to N+1). Separate decision, owned by harness maintainer.

## 7. Related

- `docs/reports/opus-4-6-route-audit-2026-04-22.md` — B3 audit report (waggle-os repo)
- `PM-Waggle-OS/sessions/2026-04-22-sprint-11-b3-opus46-audit-exit.md` — B3 exit ping
- `PM-Waggle-OS/decisions/2026-04-22-tie-break-policy-locked.md` — sibling LOCK; uses the same xai/grok-4.20 floating alias convention this doc formalizes
- `litellm-config.yaml` — primary config surface affected by §3 cleanup

---

**LOCKED. CC-1 authorized to execute the §3 cleanup ticket. HIGH + MEDIUM in-scope before C2 kickoff; LOW may slot into Sprint 11 close commit. New unit test + lint guard required per §4.**

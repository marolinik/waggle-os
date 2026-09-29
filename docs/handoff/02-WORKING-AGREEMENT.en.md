# 02 — Team working agreement (Waggle v1.2)

> **English translation** of [02-WORKING-AGREEMENT.md](02-WORKING-AGREEMENT.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision: 1.2 DRAFT · 29.09.2026 · reviewed code revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`**

Audience: the tech lead, developers and QA taking over Waggle from the founder. The document describes how the team works: branches, worktrees, PRs, review, gates, roles, ledger, receipts and CI.

This document is derived from [Delivery plan §0](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) (DP-0.01..DP-0.16) and from [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md). **If this text differs from them, the plan and the checklist prevail**, and the difference is a finding reported per §10. Which source wins when `AGENTS.md`, the checklist, the plan and the handoff conflict is an open question for the founder (UNKNOWN). Until a decision, the interim rule from §0 ("Order of precedence") applies: the stricter norm applies, and every conflict stops work and goes to the founder. Rules that appear here for the first time carry the label PROPOSAL (a proposal of this working agreement). They are ratified by the tech lead and the founder. Status labels are the same as in the package: DECISION / CONFIRMED AT REVISION / AUDIT FINDING — TO VERIFY / PARTIAL/UNWIRED / PROPOSAL / DEFERRED / UNKNOWN.

---

## 0. Before the first line of code

> **Implementation is not yet approved.** Coding starts only when the founder explicitly approves the delivery plan ([brief §20.4](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.en.md): "Coding and expensive/external actions await the next explicit approval"). Until that approval, `integration/waggle-next` is not created, and there are no commits, pushes, PRs, receipt runs or paid API calls. Reading the package and the code, read-only checks and preparing a personal machine outside the repo are permitted.

> **After approval, all work follows the MANDATORY safe-implementation strategy:** Delivery plan §0 (DP-0.01..DP-0.16) and [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md). Before every PR, agent and session, every checklist item must be "yes". A single "no" stops work. This applies to both humans and AI agents.

- **Closed decisions:** D-01..D-18 (brief §3) are DECISION and are not reopened in a PR, in review or in a retrospective. If code or a finding contradicts one of them, this is recorded per §10, and the decision stands.
- **What blocks what:** the ratifications of the ADR drafts (RAT-01..RAT-09) and the approvals ODB-01/ODB-02 are in [Delivery §6.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md), and the founder queue DQ-01..DQ-09 is in §6. No DQ item stops W0 or the development of W1-PR1/PR2. RAT-01 must be ratified before G1 (F1) closes. W0 needs no RAT.
- **Paths in the package:** the package's `.md` files were normalized to the repo layout on 29.09.2026 ([00 §1](00-START-HERE.en.md), "Paths in the package"). The old staging paths (`out/decisions/…`, `out/plans/…`, `v12-planning-staging/tools/check_trace.mjs`) also existed in the first DOCX export; the DOCX was re-exported from the normalized `.md` on 29.09.2026 ([00 §1](00-START-HERE.en.md), "DOCX is current"), so it no longer contains them either. They are recorded in the map [v1.2-evidence/README.md, "Map of old paths"](../plans/v1.2-evidence/README.en.md#map-of-old-paths). The map translates them into `docs/decisions/`, `docs/plans/` and `docs/plans/v1.2-evidence/tools/check_trace.mjs`. CONFIRMED AT REVISION of the package (29.09.2026): grep `out/decisions|out/plans|v12-planning-staging` over PRD, FRD, Delivery, MIG, BvB, Benchmark and ADR-INDEX yields 0 hits, and after the re-export `unzip -p <fajl>.docx word/document.xml` also finds none of these paths in any DOCX.

**Order of precedence: UNKNOWN, open question (j) for the founder in [00 §6](00-START-HERE.en.md).** The sources conflict today. `AGENTS.md:6` says "If this file conflicts with any other document, **this file wins.**". Per DP-0.01..DP-0.16 the checklist is mandatory for every PR, and the introduction of this document says that the plan and the checklist prevail. The package does not say which of them wins. This handoff is a derived document and has no authority to determine the order of precedence or to interpret `AGENTS.md` on its own. Therefore, until a founder decision, only the interim rule applies (PROPOSAL):

1. **The stricter norm applies.** When two sources (`AGENTS.md` with `CLAUDE.md`, the checklist, the Delivery plan, the FRD, this handoff) prescribe differently and both can be satisfied at the same time, both are satisfied. Where there is no conflict, each source applies in full, including `AGENTS.md` §3.1–§3.6, §7 and §7.5.
2. **Every conflict stops work and goes to the founder** (§10, [05 §5.5](05-RISKS-DECISIONS-ESCALATION.en.md)). A conflict exists when the sources cannot be satisfied at the same time or when it is unclear which norm is stricter. Work at that point stops, and the team does not choose the source itself.
3. D-01..D-18 remain DECISION and are not part of this question. A conflict between any source and one of them is recorded per §10, and the decision is not reopened.

Known conflicts with `AGENTS.md`. They go to the founder as part of question (j), together with question (a). The handoff does not resolve them:
- `AGENTS.md` §4 says "Max 5 files per phase. Complete → verify → await approval → next phase", but the plan's PRs are larger. W0-PR9 touches 7 source files (`personas.ts`, `chat.ts`, `routes/evolution.ts`, `EvolutionTab.tsx`, `fleet-run-executor.ts`, `agent-groups.ts`, `fleet.ts`), and W0-PR12 six files (`dock-tiers.ts`, `AppShell.tsx`, `command-catalog.ts`, `cost.ts`, `settings.ts`, `tier-enforcement-matrix.test.ts`); counted from the rows of Delivery §2 W0. The package does not say what a "phase" is relative to a PR from a plan row, nor who gives the "approval" (UNKNOWN). Until an answer, item 1 applies: no work phase touches more than 5 files, and the gates from §6.2 are run after each one. Per item 2, W0-PR9 and W0-PR12 do not start until the founder says what a phase is and who approves it. A PR is not split below a plan row except through the split procedure from §4.
- `AGENTS.md` §3.8 (and §3.7, "via `/handoff`") requires a handoff through `~/.Codex/skills/handoff/` into `C:/Users/MarkoMarkovic/.Codex/projects/D--Projects-waggle-os/memory/…`, and `CLAUDE.md` §3.8 the same for `~/.claude/…`. These are personal paths on the founder machine. Writing into the founder's personal profile is an item that [05 §5.3](05-RISKS-DECISIONS-ESCALATION.en.md) ("Live installation data") sends to the founder. How §3.8 applies to the team is therefore part of question (j), and until an answer the team does not write to those paths. What can be satisfied applies immediately (item 1): "Never hide failures" and verification before recording state. The stricter verification is §6.2 (`npm run build:packages`), because per-package `npx tsc --noEmit`, which §3.8 mentions, passes over stale declarations (TD-TEST-12). Until a decision, state, open failures and the next step go into the PR description or an issue (PROPOSAL).
- Who approves and who merges into `integration/waggle-next`: §7.

---

## 1. Roles and owners

The plan assigns work to **roles**, not names. The canonical list of roles is in DP-0.14, and it is used by Delivery §2, FRD §15 and the disposition:

**Harness, Chat, Durable, Memory, Server, Boundary, Capability, Security, External-executor, Evolution, Model/Runtime, UX, Attention, Channels, Benchmark, Release, OSS/License owner.** The founder owns only the decision queue (DQ), ratifications (RAT), approvals (ODB) and external gates.

- The compound label `Harness/Chat owner` means two roles.
- Aliases from the Build-vs-Borrow document: `Runtime/W1 owner` = Durable owner, `Harness/W3 owner` = Harness owner, `Capability/W4 owner` = Capability owner, `Release/OSS owner` = OSS/License owner (DP-0.14).
- **Who holds which role: UNKNOWN.** The tech lead fills in the table below before the start of W0 and publishes it to the team. One person may hold several roles. A role without a name blocks PRs in its area (see DoR, §8).

| Role | Typical area in G1 (Delivery §2 W0 "Owner/role") | Name (filled in by the tech lead) |
|---|---|---|
| Harness owner | F-HARN, F-EVO-01/10; W0-PR1..PR9 | UNKNOWN |
| Chat owner | `chat.ts` + `chat-*.ts` (PR8, PR9, PR11) | UNKNOWN |
| Memory owner | F-HM hook trio, F-HM-05; `orchestrator.ts`, `hive-mind-core` (PR10, PR11, PR18) | UNKNOWN |
| Boundary owner | F-TK-02/03/04 de-gate (PR12); WB-PR1/PR2 | UNKNOWN |
| Release owner | F-REL-01/06, ADR-10-K3 PostHog switch; W0-PR0 CI; W8-PR1 | UNKNOWN |
| Durable owner | F-DUR-10 probe (PR14); from W1 also `workflow-*` | UNKNOWN |
| Server owner | hotspot merge owner for `packages/server/src/local/index.ts` (DP-0.14). In G1 it is touched by W0-PR6 (`index.ts:612`, `new HarnessTraceBridge`, CONFIRMED AT REVISION) | UNKNOWN |
| OSS/License owner | OSS-PR1/PR2 inventory and lint | UNKNOWN |
| Other roles (Capability, Security, External-executor, Evolution, Model/Runtime, UX, Attention, Channels, Benchmark) | from G2, per Delivery §2 | UNKNOWN |

---

## 2. Branches and worktrees

### 2.1 Baseline and integration branch

- The baseline is `main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (DP-0.01, CONFIRMED AT REVISION).
- `integration/waggle-next` is created from `2af0904d` in **its own new worktree**, never in `D:/Projects/waggle-os` (DP-0.04). All wave/PR branches target it, **never `main`**. As of 29.09.2026 the branch does not yet exist either locally or on `origin`. The tech lead creates it after the founder approves the plan (PROPOSAL). Worktree location: UNKNOWN, the team's choice, but it must not be inside existing worktree directories.
- Merge into `main` is **prohibited**. The only path is a founder-gated merge after the F3 receipts (fast-forward, or a merge commit whose tree == F3 tree with bounded carry-forward). Only after that merge comes the tag, and only with approval (Delivery §5 F3, DQ-01, DP-0.11/DP-0.12).

### 2.2 Protected worktrees and stashes

- The nine existing worktrees from DP-0.02 are not deleted, checked out or pruned, even when they become "prunable". The stashes `stash@{0}` and `stash@{1}` are not touched (DP-0.03). Before every session, check `git worktree list` and `git stash list` (exactly 2 entries). This applies on the founder machine; for other hosts see the next item.
- **On which host these checks apply: UNKNOWN, awaiting a founder decision.** The 9 worktrees (DP-0.02) and 2 stashes (DP-0.03) exist only on the founder machine (CONFIRMED AT REVISION, `git worktree list` / `git stash list`, 29.09.2026). A fresh team clone from [01 §3.2](01-ONBOARDING-DEV-ENV.en.md) has neither those worktrees nor the stashes (`refs/stash` is not transferred by cloning). A literal reading of item 1 of the checklist "Before every PR" ("the existing 9 worktrees … untouched", "`git stash list` still has exactly 2 entries") yields "no" there and stops work. PROPOSAL of interpretation: these two checks apply only on the founder machine; on another host the equivalent is "no entry that was in `git worktree list` and `git stash list` at the start of the session has been removed" (a snapshot of both lists at the start and at the end of the session). This is an **exception to the checklist** and does not apply until the founder approves it ([05 §5.3](05-RISKS-DECISIONS-ESCALATION.en.md), "Exception to the checklist"; question (c) in [00 §6](00-START-HERE.en.md)). Until approval the team does not interpret the item on its own: work on a host that is not the founder machine does not start, and the item is escalated per §10.
- **Tenth entry:** `D:/Projects/waggle-v12-handoff` on the branch `docs/waggle-v1.2-planning`, which contains this package. The checklist lists it neither among the existing nor among the permitted new entries ("exclusively" `integration/waggle-next` and `<wave-id>/*`). The team treats it as protected, does not delete it and does not change it without the package owner. Whether the founder accepts it as a permitted entry: UNKNOWN (see §10).

### 2.3 Branch naming

- One short-lived branch per task, in the form `<wave-id>/<tema>` (DP-0.05, checklist). Permitted `<wave-id>` prefixes: `w0`–`w8`, `w3e`, `wb`, `oss`, `b1`–`b3`. Examples from the plan: `w0/harn-01-verify-default`, `w1/run-store-spike`.
- The topic carries the plan ID where one exists, for example `w0/pr12-approvals-degate` or `wb/pr1-tier-inventory` (PROPOSAL).
- **Note on naming:** the task for this handoff mentioned the scheme `feat/<wave>-<slug>`. Neither the plan, nor the checklist, nor any file of the package uses it (grep "feat/" = 0). The checklist permits only `<wave-id>/…` prefixes, so `<wave-id>/<tema>` applies. The word `feat` goes into the commit message type (§12), not into the branch name.

### 2.4 One worktree per parallel agent or developer

- Every developer and every AI agent works in their own worktree, created from `integration/waggle-next`. Nobody touches someone else's worktree (DP-0.05). Example (PROPOSAL, the team chooses the path):

```bash
git -C <integration-worktree> worktree add ../waggle-w0-harn-01 -b w0/harn-01-verify-default integration/waggle-next
```

- Parallelism in the plan: 3–4 worktrees with effective parallelism of 2.5–3.0 (Delivery §4.3 assumptions; UNKNOWN until the F1 measurement). The first parallel set in G1 (00-START-HERE, days 3–4): Harness / Memory / Boundary+Release / Durable-probe.
- Each worktree has **its own isolated runtime**: `WAGGLE_DATA_DIR`, `WAGGLE_PORT≠3333`, `PORT≠3100`, E2E env and `HOME`/`USERPROFILE`/`HERMES_HOME` for hook tests. The exact list is in the checklist, item "Env isolation", and is intentionally not copied here. `apps/web/.env.local` is not copied into agent worktrees.
- **Exception W0-PR19:** the golden fixture generator must run on code `2af0904d` in a separate worktree (Delivery W0-PR19). The checklist does not permit such a worktree. This is an open LOW finding in [WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md), row "SAFE-IMPLEMENTATION-CHECKLIST.md". The worktree for W0-PR19 is not created until the founder confirms the exception (§10).

### 2.5 Integration, rebase and merge

- A feature branch is integrated with `integration/waggle-next` **at least once a day** (DP-0.06, checklist).
- **Force-push is prohibited** (DP-0.11). Therefore the following applies (PROPOSAL):
  - while the branch has not been pushed, rebasing onto `integration/waggle-next` is unrestricted;
  - once the branch has been pushed, integration is done by merging `integration/waggle-next` into the feature branch (the repo already uses the pattern "Merge origin/main into deps/vite-8", `cab61cd9`). Rebase followed by force-push is not permitted.
- Merge method for a PR into the integration branch (PROPOSAL): merge commit, not squash. This keeps the RED commit and the GREEN commit separate (§5). GitHub repo settings are not changed (checklist, absolute prohibitions). Which merge method the repo currently permits: UNKNOWN.
- During the receipt cycle (freeze, §13) there are no merges into the integration branch (PROPOSAL).

---

## 3. Hotspot files and merge owners

A hotspot file is merged only with the approval of its owner (role) (DP-0.14, checklist). **Two PRs that touch the same hotspot are not merged on the same day without an integration test.** What counts as that test is not defined by the plan (item "Integration test" below the table). The table is copied exactly from DP-0.14, with an addition from W8:

| Hotspot | Merge owner (role) |
|---|---|
| `packages/server/src/local/routes/chat.ts` + `chat-*.ts` | Harness/Chat owner |
| `packages/agent/src/agent-loop.ts` + `loop-gates.ts` | Harness owner |
| `packages/agent/src/orchestrator.ts` + `prompt-assembler.ts` | Memory owner |
| `packages/server/src/local/index.ts` | Server owner |
| `packages/shared/src/tiers.ts` + `assert-tier.ts` | Boundary owner |
| `packages/agent/src/workflow-harness.ts` + `workflow-tools.ts` | Harness owner → from W1 Durable owner |
| `packages/core/src/cron-store.ts` + `local/cron.ts` | Durable owner |
| `packages/hive-mind-core/src/**` | Memory owner + OSS drift duty (`CLAUDE.md` §7.5) |
| `release.yml` / `scripts/certify-*` (Delivery §2 W8) | Release owner, and not to be touched without founder review |

- Expected conflicts: W1-PR4/PR8/PR9, W3-PR2 and W4-PR1 touch the same files `chat.ts`/`agent-loop.ts` (Delivery §4.3). All changes in `chat.ts` or `agent-loop.ts` carry an integration cost (brief §15.3).
- **Integration test: UNKNOWN, to be resolved before the first merge of the Harness lane (W0-PR1..PR8).** DP-0.14 and the checklist (item "Hotspot files") do not say what an integration test is, who runs it or who signs off the result. Nor do they say whether "the same hotspot" is one file or a whole row of the table above. The plan budgets hotspot integration tests only in G2, for W1-PR4/PR8/PR9 × W3-PR2 × W4-PR1 (Delivery §4.1, row "Integration/spec sync", (2)). The G1 part of that row is only the ID reconcile. The rule nevertheless affects G1 immediately: W0-PR1, W0-PR3 and W0-PR7 touch `workflow-harness.ts`, W0-PR7 and W0-PR8 `workflow-tools.ts`, and W0-PR4 and W0-PR5 `agent-loop.ts` (column "Files" in Delivery §2 W0). PR1, PR7 and PR8 are in the serial sequence W0 PR1/PR7/PR8/PR9 of 3–4 wd (Delivery §3).
  - **Until a decision** (stricter norm, §0): "the same hotspot" is the whole row of the table above, and a second PR on the same hotspot is not merged on the same day as the first. This satisfies the rule without a test that has not been defined. The impact on the W0 serial sequence is UNKNOWN and is not recalculated here.
  - **PROPOSAL of a definition** (confirmed by the tech lead, or, while no tech lead has been named, by the founder, [05 §5.0](05-RISKS-DECISIONS-ESCALATION.en.md)). When PR B is merged on the same day after PR A on the same hotspot, the integration test has two parts. (1) The four gates from §6.2 and the supplementary checks from §6.3 pass on the PR B branch, after merging the current HEAD of `integration/waggle-next`, which already contains PR A. (2) At least one named test exercises the changes of both PRs together on that hotspot. The PR B description names that test, the command, the output and the exit code. The test is run by the author of PR B. The result is signed off by the hotspot merge owner from the table above, and if they are the author of PR B, by another team member (§7). For the chat hotspot the open co-approval question also applies (item "Open question … chat hotspot" below).
- A change in `packages/hive-mind-core/src/{mind,harvest}/**` is recorded for the maintainer review of `scripts/oss-drift-baseline.json`. Nothing is authored directly on the OSS mirror and there is never a raw subtree push (checklist; `CLAUDE.md` §7.5).
- The plan lists the hotspot owner for each W0 PR in W0 "Hotspot merge owner": PR1–PR8 Harness owner (`agent-loop.ts`/`loop-gates.ts`, `workflow-*`); PR9, PR8 and PR11 Chat owner (`chat.ts`, `chat-agent-run.ts`, `chat-collaboration.ts`); PR18 (`orchestrator.ts` recall filter, `hive-mind-core`), PR15 (only the comment `orchestrator.ts:106-109`) and PR10 (`hive-mind-core` hook read path) Memory owner; PR14 Durable owner (`cron-store.ts`/`local/cron.ts`). In addition, PR6 → Server owner (`packages/server/src/local/index.ts:612`). W0 "Hotspot merge owner" does not list that item, but it follows from DP-0.14 and from the W0-PR6 row ("`index.ts:612` passes the resolver"). The W0-PR6 card in [03-BACKLOG.md](03-BACKLOG.en.md) says the same. The discrepancy is reported per §10.
- **Open question (UNKNOWN): who approves the chat hotspot merge.** DP-0.14 says `Harness/Chat owner` for `chat.ts` + `chat-*.ts`, and those are two roles. W0 "Hotspot merge owner (per DP-0.14)" lists only Chat owner for PR9, PR8 and PR11, the same as the hotspot rows of W1, W2, W3, W3e, W4, W5 and B1–B3. The plan does not say whether the Harness owner co-approves. The package does not choose silently: the question is in §10 and must be resolved before the first merge of W0-PR8, W0-PR9 or W0-PR11 (same in [04 §2](04-CODEBASE-MAP.en.md)).

---

## 4. PR size and slicing

- **One PR = one PR ID from the plan** (e.g. W0-PR0..W0-PR19). The "PR slicing" column in Delivery §2 is authoritative for the content, files and tests that the PR changes. G1 has ~26 PRs (Delivery §4.2: W0-PR0..PR19 = 20, of which 16 with a RED test, plus WB-PR1/2, OSS-PR1/2, W8-PR1 and the ID reconcile doc-only PR).
- **The order from the plan is mandatory.** Examples: W0-PR19 is merged before W0-PR6 and W0-PR18; W0-PR18 after W0-PR11; in W0-PR9 F-EVO-01 goes before F-EVO-10; because of risk the order PR1 → PR8 → PR2/PR3 applies (Delivery §2 W0 "Risk"). The dependency graph is in Delivery §3.
- **Split.** If a PR must be split, the parts get a suffix following the plan's pattern (`B2-PR2a`, `W3e-PR9a..e`), and the split is reported in the PR description and through a docs PR into the plan. The plan says "a split is measured, not assumed" (Delivery §4.2). Combining two plan PRs into one is not permitted without a tech lead decision recorded per §10 (PROPOSAL). Existing combinations in the plan (e.g. F-EVO-01 and F-EVO-10 in W0-PR9) apply as written.
- **Surgical:** every changed line traces to the task. No "drive-by" refactoring or reformatting (`AGENTS.md` §3.3). Noticed unrelated debt is recorded (§11), not silently fixed.
- **Structure and behavior are never mixed in the same commit** ([TECH-DEBT.md](../TECH-DEBT.md) "Adopted Conventions"). Before a structural refactor of a file >300 LOC, dead code removal goes into a separate commit `chore(scope): dead code removal — [filename]` (`AGENTS.md` §4).
- Execution guideline: at most 5 files per phase, then verification (`AGENTS.md` §4). The plan's PRs may touch more files (W0-PR9 seven source files, W0-PR12 six files). What applies until a founder decision: §0, "Order of precedence" (question (j) in [00 §6](00-START-HERE.en.md)).
- **No PR introduces a Fusion/council/5-hats/agent-fusion surface.** Existing subagents only get the same `ContextPackage`/run contract. Such a PR is rejected in review (DECISION D-16, DP-0.16).

---

## 5. RED → GREEN (test first)

Rule (DP-0.15, PROPOSAL — BRIEF DIRECTION §15.4): every finding from phase-A first gets a RED test that fails on `2af0904d`, and then a minimal GREEN.

1. **RED commit:** a test that reproduces the finding, without a production change. Run it and save the failing output. The repo already has this pattern ("pinned first in `880c2dbe`" → fix `cbe83a37`, [TECH-DEBT.md](../TECH-DEBT.md) TD-CHAT-12). Where the plan requires `it.fails` (WB-PR2), RED stays `it.fails`.
2. **GREEN commit:** the minimal change after which the test passes. All gates (§6) are green.
3. **Tests that pin wrong behavior** are listed per PR in Delivery §2 (e.g. `workflow-tools-harness.test.ts:135-179` for W0-PR1, `harness-trace-bridge.test.ts:82-92,327` for W0-PR6, `evolution-routes.test.ts:169-188` for W0-PR9, `cost-tracker.test.ts:54-57` for W0-PR13, and for W0-PR11 `agent-groups.test.ts:362`, `external-tool-runs.test.ts:259`, `fleet-isolation.test.ts:203,496-525`). They are rewritten in the **same PR**, with a justification in the description, never silently.
4. Characterization tests (`*-characterization.test.ts`) are never changed to make a behavior change pass. A behavior change gets its own commit that intentionally updates the pin ([TECH-DEBT.md](../TECH-DEBT.md) "Adopted Conventions").
5. **Items labeled AUDIT FINDING — TO VERIFY** (e.g. the W0-PR14 `getDue` hypothesis, W0-PR17) start with reproduction. If RED cannot be reproduced, the finding does not hold for this revision: work stops per §10. A fix is not invented.
6. "Module exists" is not evidence. Nothing is claimed as "works E2E" without an executed test on an isolated sidecar (checklist, PR description).
7. **Migrations:** every MIG-00..MIG-09 mutation first runs on a copy of an isolated dataDir, with a snapshot and `manifest.json` (MIG-00.3), a dry-run report, idempotency and a rollback test per class. For the G1 mutations MIG-04(A) (W0-PR6) and MIG-05(i) (W0-PR18), Class A applies over the W0-PR19 golden fixture. Class B applies from G2, after W1-PR15. Details are in DP-0.09, the checklist and [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.en.md).

---

## 6. Mandatory gates per PR

### 6.1 Environment

```bash
fnm use 22.23.2        # .node-version = 22.23.2; better-sqlite3 ABI 127
node -v                # mora biti v22.23.2
```

No `npm install`/`npm ci` is run while dev servers hold `.node` files. If an installation is necessary, use `--package-lock-only` (checklist).

### 6.2 Four mandatory gates (DP-0.06, checklist)

```bash
npm run build:packages
npm run typecheck:server-tests
npm run lint
npm run test -- --run --maxWorkers=6
```

- All four scripts exist in `package.json` (CONFIRMED AT REVISION). `npm run build:packages` is the only authoritative local tsc gate (TD-TEST-12, [TESTING.md](../TESTING.md) "CI Gates"). `npx tsc --noEmit --project packages/<pkg>` is not sufficient.
- `--maxWorkers=6`: DP-0.06 says that without it the local suite fails with OOM. That number comes from a record of the 27.09.2026 session on a single 80 GB machine and has not been reproduced for this package (UNKNOWN). It should be measured on the team's machine ([01-ONBOARDING-DEV-ENV.md](01-ONBOARDING-DEV-ENV.en.md) §6.2, §13 pt.1).
- `vitest.config.ts:28` sets `maxWorkers: 4`, and the CI root step overrides it with `--maxWorkers=2` (`.github/workflows/ci.yml:86`). The serial step for 6 package-install runtime tests uses `--maxWorkers=1 --no-file-parallelism` (`ci.yml:100-101`). All three are CONFIRMED AT REVISION. DP-0.06 claims that "CI uses its own `vitest.config.ts` `maxWorkers: 4`", which does not match `ci.yml:86`. Why the default 4 workers fail locally while 6 pass is not known (UNKNOWN, to be measured). The discrepancy is reported per §10.
- While the suite is running, source is not changed (checklist).
- The exit code is read directly (`echo $?` / `$LASTEXITCODE`). Output is not piped through `| tail` before the exit code is read, because the pipe masks failure.

### 6.3 Supplementary checks by touched surface

The CI job `test` in `.github/workflows/ci.yml` also runs commands that the four gates do not cover (CONFIRMED AT REVISION). Until the integration branch has CI, a PR that touches a listed surface runs them locally (PROPOSAL):

| Touches | Command | Why |
|---|---|---|
| `apps/web/**` | `npm run typecheck:web` and `npm run test -w apps/web` | the root `vitest.config.ts` excludes `apps/**` (`:43`), so `npm run test` does not run the web tests |
| `app/**` (Tauri TS scripts) | `npx tsc -p app/tsconfig.json` | CI step "Tauri TS typecheck" |
| `packages/server/src/local/routes/chat*.ts` | root vitest with the coverage ratchet as in `ci.yml` (`--coverage.include='packages/server/src/local/routes/chat*.ts'`, thresholds statements 94, lines 94, branches 87, functions 98) | thresholds may only go up (TD-TEST-2) |
| user flow / UI | `npm run test:e2e:smoke`, **only** with the isolated E2E env from the checklist (`WAGGLE_E2E_BASE_URL`, `WAGGLE_E2E_PORT`, `WAGGLE_E2E_REUSE_EXISTING_SERVER=0`, `WAGGLE_E2E_DATA_DIR`), and only after checking that the founder's instance is not listening on 3333 | the blocking `e2e-smoke` job in `ci.yml` |
| migration | dry-run report + snapshot `manifest.json` + second pass = no-op + rollback test per class | DP-0.09 |

Note: [TESTING.md](../TESTING.md) `:144` says "Coverage is not enforced in CI", but `ci.yml` enforces a ratchet on `chat*.ts` (TD-TEST-2 CLOSED 2026-09-23). The sentence in TESTING.md is outdated (CONFIRMED AT REVISION). It does not go into W0-PR15 without a decision per §10, because the W0-PR15 list is closed in the plan.

---

## 7. Review rules

| Rule | Status |
|---|---|
| Every PR has at least **one human approval** from the role owner for that area (§1). Without a human approval there is no merge. | PROPOSAL |
| A PR that touches a hotspot (§3) must have the approval of the hotspot merge owner. If the author is also the owner, another team member approves. | DP-0.14 + PROPOSAL (second signature) |
| `release.yml` / `scripts/certify-*`: Release owner **and** founder review. | Delivery §2 W8 |
| A migration PR (MIG-*), a PR in `packages/hive-mind-core/src/**` and a PR that changes a security/approval boundary: two human approvals. | PROPOSAL |
| A PR whose merge the plan ties to a ratification (e.g. W1-PR2 → RAT-02, W3-PR2 → RAT-03, W2-PR1 → RAT-04, W3e-PR1 → RAT-05, W1-PR11 → RAT-06, W4-PR3 → RAT-07, WB-PR3 → RAT-08, W8-PR6 → RAT-09) is not merged before the founder ratification. Review in the PR does not replace ratification. | Delivery §6.1 |
| W2-PR3 is not merged without an approved DQ-04 budget (LoCoMo same-judge merge gate). | Delivery §6 DQ-04 |
| **AI reviewers** (code-review agents, Codex and similar) are permitted as **pre-review**. Their findings are summarized in the PR description, and each point gets "fixed" or "rejected, because…". An AI approval does not count as an approval. An AI agent does not merge. | PROPOSAL |
| The reviewer checks: whether the PR matches the plan row, the RED→GREEN evidence, rewritten tests, safe-impl checklist "yes", affected receipts, status labels in the description and that there is no Fusion surface (D-16). | PROPOSAL (derived from the checklist, "PR description") |

**Who approves and who merges into `integration/waggle-next`: UNKNOWN, a question for the founder before the start.** The sources diverge. Delivery §4.2, row "Human review (founder; ~3 PR/day UNKNOWN)", assumes that the founder reviews every PR serially. DP-0.14 gives the hotspot merge to the role owner and says "Founder only for the decision queue and external gates". The first row of the table above requires one approval from the role owner (PROPOSAL), and [05 §5.2](05-RISKS-DECISIONS-ESCALATION.en.md) gives the merge to the tech lead (PROPOSAL). Therefore the rules in the table give nobody merge authority until the founder decides: (1) whether founder review is mandatory for every PR or only for the rows that require it (W8 `release.yml`/`scripts/certify-*`, RAT/DQ merge blocks); (2) who executes the merge into `integration/waggle-next` (tech lead, role owner or founder); (3) who approves when the author is also the role owner. The question is in the list (a)–(o) in [00 §6](00-START-HERE.en.md), as (k). The tech lead sends it to the founder together with question (a), per [05 §5.5](05-RISKS-DECISIONS-ESCALATION.en.md).

**Review capacity:** Delivery §4.2 assumes serial review by the founder (~3 PR/day, UNKNOWN). How this is split between the team and the founder after the handover: UNKNOWN, the founder decides. The plan's numbers and ranges are not recalculated in this document. The first real measurement is the F1 retrospective (Delivery §4.3).

---

## 8. Definition of Ready (a PR may start)

All items must be "yes" (PROPOSAL, derived from the Delivery §2 format and the checklist):

- [ ] The founder has approved the delivery plan (§0).
- [ ] The PR ID exists in Delivery §2, or the docs PR that adds it has been merged (§10).
- [ ] The wave's input contract is met and the preceding PRs from the graph (Delivery §3, §4 here) have been merged.
- [ ] The merge blockers (RAT-nn, DQ-nn, ODB-01/ODB-02) are known and recorded in the description, with an owner.
- [ ] The role and the hotspot owner have a name (§1, §3).
- [ ] The RED test is named, and the tests that pin wrong behavior are listed (from the plan row).
- [ ] For an AUDIT FINDING — TO VERIFY there is a reproduction plan (§5 pt.5).
- [ ] The migration class is known: "no schema" / Class A / Class B + MIG ID.
- [ ] The affected receipts (I/R/P/A/C) from the wave's "Affected receipts" row are listed in advance.
- [ ] A dedicated worktree from `integration/waggle-next` with an isolated env exists, and the checklist "Before every PR" is all "yes".

## 9. Definition of Done (a PR may be merged)

- [ ] **AT IDs green:** the part of the ATs (or a named FRD test, e.g. FRD-05.8, Disposition OD-10) that [FRD §15](../Waggle_FRD_v1.2_DRAFT.en.md) attributes to this PR in the column "Wave (authoritative for evidence of completion)". If the PR has no AT, write "none — reason" (e.g. W0-PR19 "no finding — test prerequisite").
- [ ] RED→GREEN evidence: a RED commit with failing output, a GREEN commit with passing output (test name and command).
- [ ] The four gates from §6.2 are green, plus the supplementary checks from §6.3 for the touched surface. Before W0-PR0 the output is pasted into the PR, and after W0-PR0 CI must be green (§14).
- [ ] Rewritten or removed tests are listed with a reason.
- [ ] **The SAFE-IMPLEMENTATION checklist is all "yes"** (all three sections: "Before every PR", "Absolute prohibitions", "PR description").
- [ ] **Affected receipts listed** (I installer / R router / P persona / A auth canaries / C crash-injection), or "none — reason".
- [ ] A migration/rollback note, or "no schema". For migrations: dry-run report, snapshot manifest, idempotency and rollback test per class (DP-0.09).
- [ ] **Ledger updated:** new or discovered debt gets a row in [docs/TECH-DEBT.md](../TECH-DEBT.md) **before merge**. A closed row gets a status and a SHA. A wrong row is corrected (§11).
- [ ] **Docs updated** when behavior, a command or configuration changes. A change to the PRD/FRD `.md` means a new DOCX export and an update of the hashes in Delivery §6.1 and in Disposition OD-9 (handover condition from §6.1), in a separate doc-only PR.
- [ ] For a change in `hive-mind-core` there is a record for the `scripts/oss-drift-baseline.json` review.
- [ ] Every claim in the PR description carries a status label.
- [ ] The AI pre-review has been processed, and the human approvals are in place per §7.
- [ ] There is no open "finding against the plan" (§10) tied to this PR.

A wave is done when each of its PRs has passed the checklist without a single "no" item (the exit condition in every wave of Delivery §2) and when its exit ATs are green. A G1/G2/G3 milestone is done only when its exit criteria from Delivery §1 are met, **including the freeze receipts**. Until RAT-01 those exit criteria remain PROPOSAL.

---

## 10. When a finding contradicts the plan

This applies when code at the revision, a test, a reproduction or an external fact shows that the plan, FRD, ADR or checklist does not match reality. Examples: a hypothesis does not reproduce, a file or line has moved, a test that the plan says "does not break" does break, a rule is impossible to satisfy.

1. **Stop.** No further code at that point. The rest of the PR may continue only if it does not depend on it.
2. **Record** in the PR (or in an issue, if no PR exists yet): what the plan claims (document, section, ID), what was found (`path:line` at the revision, command and output) and the status label. A label is never raised without an executed reproduction: AUDIT FINDING — TO VERIFY does not become CONFIRMED AT REVISION without it.
3. **Escalate** on the same day to the role owner and the tech lead. Everything that touches the following goes to the founder: D-01..D-18 (only recorded, not reopened), DQ/RAT/ODB items, G1/G2/G3 exit criteria, ranges and dates, absolute prohibitions, receipts or wave scope.
4. **The decision is recorded** through a doc-only PR in the affected package document, using the pattern the package already uses: "Critic note (date): …". Numbers, IDs and ranges are not recalculated in a feature PR.
5. **Only then continue.** Scope is never changed silently. No "I added it along the way", "I skipped it because it does not apply" or silent rewriting of a test.

Known items already awaiting this procedure:
- the worktree for W0-PR19 on `2af0904d` versus the checklist (OPEN-LOW-FINDINGS);
- the docs worktree `docs/waggle-v1.2-planning` outside the permitted list (§2.2);
- the outdated coverage sentence in TESTING.md `:144` (§6.3);
- DP-0.06 "CI uses `vitest.config.ts` `maxWorkers: 4`" versus `ci.yml:86` `--maxWorkers=2`, and the unknown reason for the local `--maxWorkers=6` (§6.2; [01-ONBOARDING-DEV-ENV.md](01-ONBOARDING-DEV-ENV.en.md) §6.2, §13 pt.1);
- W0 "Hotspot merge owner" in Delivery §2 does not list W0-PR6 → Server owner (`local/index.ts:612`), although it follows from DP-0.14 (§3);
- the merge owner for `chat.ts` + `chat-*.ts`: DP-0.14 says `Harness/Chat owner` (two roles), while W0 "Hotspot merge owner" and the other wave rows say only Chat owner. A question for the tech lead and the founder, to be resolved before the first merge of W0-PR8/PR9/PR11 (§3; [04 §2](04-CODEBASE-MAP.en.md));
- item 1 of the checklist "Before every PR" (9 worktrees from DP-0.02, exactly 2 stashes from DP-0.03) is impossible to satisfy on a host that is not the founder machine; it requires a founder-approved exception to the checklist, without silent interpretation (§2.2; question (c) in 00 §6);
- the checklist "Env isolation" and DP-0.08 ("This isolates …"): isolation through `WAGGLE_DATA_DIR` alone is not complete, because `packages/server/src/local/routes/documents.ts:37` and `pins.ts:32` always write under `os.homedir()/.waggle` (CONFIRMED AT REVISION, [01 §9.5](01-ONBOARDING-DEV-ENV.en.md)). In the interim, a scratch `USERPROFILE`/`HOME` applies for the dev sidecar terminal and the E2E run per [01 §9.3](01-ONBOARDING-DEV-ENV.en.md) (step 4) and §9.4 (PROPOSAL). Decision: tech lead and founder ([05](05-RISKS-DECISIONS-ESCALATION.en.md) N-28, R-15);
- the order of precedence `AGENTS.md` / checklist / Delivery plan / handoff, including `AGENTS.md` §4 (5 files per phase) versus W0-PR9/W0-PR12 and the personal paths from `AGENTS.md` §3.8. Question (j) in [00 §6](00-START-HERE.en.md) goes to the founder together with question (a). Until a decision the stricter norm applies, and every conflict stops work (§0);
- what the "integration test" is in the rule on two merges of the same hotspot on the same day (DP-0.14, checklist), who runs it and who signs it off. The tech lead (until ESK-01, the founder) decides before the first merge of the Harness lane (W0-PR1..PR8). Until then a second PR on the same hotspot is not merged on the same day (§3);
- who approves and who merges into `integration/waggle-next`: Delivery §4.2 (founder serial review) versus DP-0.14, §7 here and 05 §5.2 (§7);
- the other LOW findings in [WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md).

---

## 11. Ledger discipline (`docs/TECH-DEBT.md`)

[docs/TECH-DEBT.md](../TECH-DEBT.md) is the single queue for debt. The rules were ratified on 2026-09-18 ("Debt Budget & Broken-Windows Policy") and apply to the team:

1. **The window you touch, you close.** If your change leads you to a defect, fix it in the same arc or open a row for it with ID, location, risk, effort, priority and owner **before the PR is merged**.
2. **No untracked hacks.** A bare `// TODO` without an ID does not enter the code. A quirk in a characterization test carries `// QUIRK (docs/TECH-DEBT.md TD-…)`.
3. An arc pays for the debt it creates itself.
4. **A wrong row in the ledger is a defect.** It is corrected or split (pattern CA-5 → CA-5b).

Row format (existing): `| Item | Location | Type | Risk | Effort | Priority | Status |`. The ID is `TD-<OBLAST>-n` (e.g. TD-CHAT-46, TD-TEST-12). Closing: `**CLOSED <datum>** (<SHA>, pinned first in <SHA>)`. The ledger is in English, so new rows stay in English for consistency (PROPOSAL).

Relation to the plan: plan IDs (F-HARN-nn, W0-PRnn, AT-nn, MIG-nn) are not TD rows and are not copied into the ledger. A TD row is created when debt outside the plan is discovered or created, or when a PR touches an existing TD row. For example, W0-PR15 corrects the line anchor of TD-CHAT-46 (`docs/TECH-DEBT.md:65`). Wave and ticket labels go into commit messages and TECH-DEBT, never as the start of a comment in code ("Adopted Conventions").

---

## 12. Commit messages

The convention was verified at the revision (`git log --oneline -30`; type totals for the last 300 commits excluding merges: `test` 96, `docs` 81, `fix` 46, `refactor` 40, `chore` 14, `build` 13, `feat` 4, `perf` 3, `ci` 3). CONFIRMED AT REVISION.

- Form: `<tip>(<scope>): <kratak opis u imperativu, malim slovima>` (type, scope, short description in the imperative, lowercase). The scope is a package or area: `agent`, `server`, `core`, `web`, `www`, `marketplace`, `deps`… For CI, `ci:` is used.
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `build` (`build(deps)` for dependencies).
- IDs may go in parentheses at the end of the subject (example from the repo: `chore(deps): record the TypeScript 7 and transformers 4 blockers (TD-DEP-3, TD-DEP-4)`). The plan ID goes there or into the body (PROPOSAL).
- The body explains **why**: what was wrong, what was verified, what was intentionally left.
- A commit written by AI agents carries a `Co-Authored-By:` trailer, like the existing commits.
- The PR merge commit stays GitHub's default "Merge pull request #N from …".
- RED and GREEN are separate commits. Example for W0-PR1 (PROPOSAL):

```text
test(agent): pin that a harness run without WAGGLE_AUTO_VERIFY reaches verify (W0-PR1, RED)
fix(agent): skip verify only when WAGGLE_AUTO_VERIFY is '0' (W0-PR1, F-HARN-01, AT-01)
ci: run CI on integration/** branches (W0-PR0)
```

---

## 13. Receipts, evidence and the freeze process (Delivery §5)

**Receipt labels:** **I** installer, **R** router (smart-router primary, compact-tool-context, budget, fallback), **P** persona, **A** auth canaries, **C** crash-injection.

| Receipt | Tool at `2af0904d` | Status (CONFIRMED AT REVISION, Delivery §5/W8) |
|---|---|---|
| I | `scripts/certify-windows-installer.ps1` | wired into `release.yml` |
| R | `scripts/qualify-smart-router.ts` | **unwired** (no npm/CI entry point) → W8-PR1 in G1 before F1 |
| P | `npm run persona:seal` (`scripts/seal-persona-acceptance.ts`) | exists (`package.json:48`) |
| A | `scripts/test-windows-official-auth-canaries.ps1` | **unwired** → W8-PR1 wrapper; first A only at F2 (real accounts) |
| C | — | **does not exist** (F-REL-03) → W8-PR2 in G2 before F2 |

**Exact-revision rule:** every receipt is valid for the exact SHA and the artifact SHA-256. Bounded carry-forward requires an exhaustive review of the intervening diff. No receipt from `e4bf403e`/`b07a6173`/`c4e6a515` covers `2af0904d` (Delivery §5; `CLAUDE.md` §1).

| Freeze | When | Receipts | Planned duration |
|---|---|---|---|
| **F1** | end of G1 | I (internal pilot, clean-profile, no public signature) + P + R | 3–5 wd, not below S1 "3–4 days"; duration is **measured** |
| **F2** | end of G2, before B3 | R + P + A + C on a packaged internal pilot build + I internal | 4–7 wd |
| **F3** | end of G3 (RC) | I + R + P + A + C + publicly trusted Authenticode + sealed Deep Security + notices/SBOM asserts + F2→F3 benchmark carry-forward attestation | 5–8 wd |
| **F4** | contingency | full set again | — |

Count: 3 planned + 1 contingency = 3–4 (Delivery §5). All of this is a PROPOSAL.

**Freeze procedure** (summary of Delivery §5 and the checklist; the order of steps is a PROPOSAL):
1. The tech lead declares the freeze and records the exact SHA of `integration/waggle-next`. Until the end of the cycle there are no merges into the integration branch.
2. Receipt runs are executed **only on a dedicated VM or a disposable Windows account without Waggle installed**, never on the founder account and never with the founder's personal auth state (`~/.claude`, `~/.codex`, Hermes home, provider keys). Any script refusal ("owned by another install", "already registered; refusing to replace it", any other `Refusing …`) **stops the work**. It must not be bypassed by manually deleting registry entries or profiles.
3. P/R/A runs use paid calls or real accounts, so they proceed only with a specific **ODB-01** approval for that run, with a cap set before the start. Benchmark and judge runs (LoCoMo same-judge rerun, B2-PR0/B2/B3, GEPA fidelity) proceed only with **DQ-04**.
4. I receipt: internal clean-profile certification from `CLAUDE.md` §2, executed on a dedicated machine:
   ```powershell
   pwsh -NoProfile -File scripts/certify-windows-installer.ps1 `
     -InstallerPath "<absolute-path-to-Waggle-setup.exe>" `
     -ExpectedSourceRevision "<40-character-final-HEAD>" `
     -VerifyManagedModel
   ```
   Packaged default-profile requires `WAGGLE_DATA_DIR` to be **absent**. Isolation here is achieved with a separate account.
5. R is run through the npm entry point from W8-PR1. If W8-PR1 is not merged before F1, an ad hoc `tsx scripts/qualify-smart-router.ts` is run, and this is recorded in the receipt manifest (Delivery §5 F1).
6. Before the F1/F2 certify, a grep of the build `dist` for `phc_` and `pk_live_`/`pk_test_` confirms that keys are not baked in. The result goes into the manifest (checklist; feasibility TO VERIFY).
7. The **receipt manifest** (W8-PR1) records the SHA, the artifact SHA-256, commands, environment, limitations, result, run ID, the account (without secrets), the cap and the actual cost (brief §15.4; checklist).
8. After F1 a retrospective is held: measured cycle duration and AI eng-days per PR against Delivery §4.1.1. Only then may the ranges be updated, and only via a doc-only PR.

**Never as evidence:** an old persona score as a knowledge-work benchmark, "the runner works" as B3, internal certify as a public signature (Delivery §5). No `git tag v*` and no pushing of tags (`release.yml:12-15` fires on any `v*` tag). `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` stays undefined. No local signing of release artifacts and no manual triggering of workflows (DP-0.11/DP-0.12, checklist).

---

## 14. CI note

- **Status at revision (CONFIRMED AT REVISION):**
  - `.github/workflows/ci.yml:3-6`: `push.branches: [main]`, `pull_request.branches: [main]`;
  - `.github/workflows/tauri-build-pr.yml:17-40`: `pull_request` and `push` only for `main` (with a `paths` filter);
  - `.github/workflows/release.yml:12-15`: only `push.tags: 'v*'`.

  The integration branch therefore **has no CI** until W0-PR0 adds `integration/**` (DP-0.07).
- **Until W0-PR0 is merged:** all gates (§6) are run locally, and the output is pasted into the PR: command, Node version, final summary (number of files and tests, pass/fail) and exit code. "It passed on my machine" without output is not accepted.
- **W0-PR0** is the first PR on the integration branch. It touches only the branch filters in `ci.yml` and `tauri-build-pr.yml` and **does not touch `release.yml`**. The proposed diff is in [templates/ci-integration-branch-proposal.md](templates/ci-integration-branch-proposal.en.md). Whether the W0-PR0 PR itself will trigger CI before its merge: UNKNOWN. That is why gates are run locally for it as well.
- **After W0-PR0:** green CI is part of the DoD. Red CI must not be bypassed with a manual re-run (the checklist prohibits manual triggering and re-running of workflows). The cause is analyzed. If the red status is caused by budget or runners rather than code, this is recorded and escalated to the repo owner.
- `hive-mind-cli-cross-platform.yml` fires on `push` for `main` and `feature/**` and on `pull_request` for `main`. DP-0.07 does not mention it, so it stays out of W0-PR0 until a decision is made per §10.

---

## 15. Absolute prohibitions (summary; the source is the checklist)

Without explicit founder approval: no merges into `main`; no force-push; no `git tag v*` and no pushing of tags; `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` stays undefined; no release, publication, attestation or local signing; no change of repo visibility; no change of license/NOTICE text before DQ-02; no Stripe/billing actions and no change of www pricing before DQ-01/DQ-03; no replacement of the installed application on the founder machine; no installation of unverified binary or MCP code from tests; no run with a real account or a paid API without ODB-01/DQ-04; no changes to GitHub repo/org settings and no manual triggering of workflows. Full text and reasons: [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md), "Absolute prohibitions".

---

## 16. PR template

The proposed template is [templates/PULL_REQUEST_TEMPLATE.md](templates/PULL_REQUEST_TEMPLATE.en.md). It is **not installed** in `.github/`. The existing `.github/PULL_REQUEST_TEMPLATE.md` asks for `npx tsc --noEmit` per package, which [TESTING.md](../TESTING.md) (TD-TEST-12) does not consider authoritative. Replacing the existing template is a separate PR with review (PROPOSAL) and is not part of W0-PR0.

## Sources

[Delivery plan](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) §0 (DP-0.01..DP-0.16), §1, §2 W0/W8, §3, §4.1 (row "Integration/spec sync"), §4.2, §4.3, §5, §6, §6.1, Appendix A · [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md) · [FRD §15](../Waggle_FRD_v1.2_DRAFT.en.md) · [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.en.md) · [WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md) · [ADR-INDEX.md](../decisions/ADR-INDEX.en.md) · brief §3, §15.3, §15.4, §20.4 · repo at `2af0904d` (read-only): [package.json](../../package.json), `.github/workflows/{ci,tauri-build-pr,release,hive-mind-cli-cross-platform}.yml` (`ci.yml:86,100-101`), `.github/PULL_REQUEST_TEMPLATE.md`, `vitest.config.ts:28,43`, `.node-version`, [docs/TECH-DEBT.md](../TECH-DEBT.md) ("Debt Budget & Broken-Windows Policy", "Adopted Conventions"), [docs/TESTING.md](../TESTING.md) ("CI Gates"), [AGENTS.md](../../AGENTS.md) `:6`, §3.3, §3.7, §3.8, §4, [CLAUDE.md](../../CLAUDE.md) §1, §2, §3.8, §7.5; `git log` (last 300 commits excluding merges), `git worktree list`, `git stash list` (29.09.2026). Related handoff documents: [00](00-START-HERE.en.md) §3, §6 · [01](01-ONBOARDING-DEV-ENV.en.md) §3.2, §6.2, §13 · [05](05-RISKS-DECISIONS-ESCALATION.en.md) §5.0, §5.2, §5.3, §5.5. Package starting point: [00-START-HERE.md](00-START-HERE.en.md).

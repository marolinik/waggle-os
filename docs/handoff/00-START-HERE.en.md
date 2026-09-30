# Waggle v1.2 — START HERE (handoff to the development team)

> **English translation** of [00-START-HERE.md](00-START-HERE.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision: 1.2 DRAFT · 29.09.2026 · reviewed code revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`**
**Document revision: 1.2.1 DRAFT · 30.09.2026 · final closure (H-01..H-12)**

Changes in 1.2.1: H-02 — package identity (§1.1), a short operational entry point; the history of critique rounds, path normalization, DOCX exports and old hashes moved to [HANDOFF-HISTORY](../plans/v1.2-evidence/HANDOFF-HISTORY.en.md); the package map moved to the [manifest](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.en.md) §2; the text of revision 1.2: `git show 2758f4e5:docs/handoff/00-START-HERE.md` · H-01 — distribution status and handoff channel (§1.1, §2, §6 (h)(n), §8) · H-03 — question (g) redirected to the findings register · H-04 — pointers to the [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.en.md) proposal (§2, §6 (b)(c)(d)(j)(k)(l)(m)(o), §9) · H-05 — safe test profile (BTP) in §6 row 2 · H-06 — backlog fields and the gate register (§6) · H-09 — release path F3a → K → F3b (§5 pt.4) · H-12 — link to the first-month frame from T0 (§5 pt.3, §6) · final review (H-01/H-04): one rule for "today" until decision (n) — no clone, only `git ls-remote` and a copy of the package verified against the manifest (§2 row 1, §6 step 1; aligned with 01 §0.1, §3.2 and TSA §3); §6 shortened to steps 1–2, the gate and a pointer to 03 §6 / Delivery §4.4.4, and the rationales for questions (a)–(o) moved unchanged to [05 §5.0.1](05-RISKS-DECISIONS-ESCALATION.en.md).

Who it is for: the tech lead, developers and QA. This is the operational entry point: what the package is, what the team may do today, what awaits approval, in what order work is done and where the sources are. All relative links start from `docs/handoff/`.

> **Status in one sentence:** the package is a **DRAFT**, implementation is **not approved**, the proposal of team authorizations ([TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.en.md)) is **NOT APPROVED** until the founder confirms it, and this documentation refinement is neither an implementation GO nor a ratification of DQ/RAT/ODB items.

Status labels are the same as throughout the package: **DECISION** (founder only, D-01..D-18) · **CONFIRMED AT REVISION** (read or reproduced on `2af0904d`) · **AUDIT FINDING — TO VERIFY** · **PARTIAL/UNWIRED** · **PROPOSAL** · **DEFERRED** · **UNKNOWN**.

---

## 1. What this package is

**Waggle** is a free, open-source, desktop-first and local-first AI work partner for the individual. Its primary job is knowledge work; coding is supported, but it does not define the product. Team capabilities come through connecting to the on-prem **KVARK** ("Waggle = me. KVARK = us."). — DECISION (D-01..D-06; [PRD §1.1](../Waggle_PRD_v1.2_DRAFT.en.md)). The code at `2af0904d` still enforces the 4-tier model with paid TEAMS; the plan closes that gap through migration, not by reopening the decision. — CONFIRMED AT REVISION (PRD-01-03).

**The package** is the v1.2 DRAFT planning package: PRD and FRD v1.2 (`.md` + DOCX), the Delivery plan (waves W0–W8/W3e/WB/OSS/B1–B3, milestones G1 → G2 → G3) with the SAFE-IMPLEMENTATION checklist, the disposition of audit findings, Build-vs-Borrow, the benchmark protocol, migrations MIG-00..09, ADR-01..10 with AT-01..AT-30, and handoff 00–05 with the backlog and templates. Everything in the package is a **PROPOSAL**: no ADR, threshold, date or G structure has been approved. Files in `docs/plans/` and `docs/decisions/` older than 27.09.2026 are not part of the package. The file list, purpose and SHA-256 are in the [package manifest](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.en.md).

### 1.1 Package identity (read-only check 30.09.2026)

| Identity | Value | What it means |
|---|---|---|
| `code_baseline_sha` | `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` | The application code revision at which all `path:line` and phase-A evidence are valid; = `origin/main` on 30.09.2026. |
| `planning_package_sha` | `2758f4e5b5be82691ef17624494e12ffc9ad84d1` | The planning package commit (29.09.2026), sole parent `2af0904d`, changes only in `docs/`. This revision was reviewed by the independent review on 30.09.2026. On `origin`. |
| translation commit | `fc0a7b3fa9193d2c52bc8dfaacc94110e9e404d3` | English translation (`*.en.md`, `backlog.en.csv`, EN DOCX, `handoff/README.md`), parent `2758f4e5`. A local commit, **not** on `origin`. |
| closure revision | working tree at `fc0a7b3f` + 1.2.1 DRAFT changes (30.09.2026) | Final closure H-01..H-12. **Not committed**; commit and push require separate founder approval. No SHA exists. |
| `implementation_sha` | — | The future commit with v1.2 code on `integration/waggle-next`. Does not exist; it is created only after implementation is approved. |

**Remote repo and distribution status (30.09.2026).** On `origin` (`github.com/marolinik/waggle-os`) the branch `docs/waggle-v1.2-planning` points to `2758f4e5` (`git ls-remote`), and `gh api repos/marolinik/waggle-os` returns `visibility: public`. The planning package at `2758f4e5` is therefore publicly readable. The push of that branch was made by the founder personally (reflog 30.09.2026 00:04:18 +0200). Whether the public availability is intentional and through which channel the package reaches the team is decided by the founder (H-01; question (n) in §6). Until that decision, the public branch is not a handoff channel and no one pushes to `origin`. None of this is approval of implementation. The distribution status and the limited secret scan are in the [manifest](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.en.md).

**How to check that you have the same package.** Every file must have the SHA-256 from the [manifest](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.en.md) §3. A match proves only that the documents are identical, not that the product is correct.

**Language and exports.** The Serbian `.md` is authoritative. `*.en.md` is a translation; its status relative to revision 1.2.1 is in manifest §2. The DOCX is an export of the `.md` file; the command and hashes are in manifest §3.

**History** (critique rounds, path normalization of 29.09.2026, DOCX exports of 28.–29.09.2026, earlier hashes and outdated status claims) is in [v1.2-evidence/HANDOFF-HISTORY.md](../plans/v1.2-evidence/HANDOFF-HISTORY.en.md). It is not a current instruction.

---

## 2. What the team may do today, and what after approval

| Action | Today (before the founder's written approval) | After approval |
|---|---|---|
| Reading the package and the code | Yes, in this scope until decision (n) (H-01, TSA-09): the package from the copy handed over by the founder, with the SHA-256 from the [manifest](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.en.md) §3; from git only the read-only `git ls-remote https://github.com/marolinik/waggle-os.git refs/heads/main`. **No clone at all**, not even a read-only clone of the public repo. Code (`git show 2af0904df01ca3d374cc78ba95b60dc579dd6a7a:<putanja>`, `git grep`) and the other read-only checks from [01 §0.1](01-ONBOARDING-DEV-ENV.en.md) only in a checkout from the channel approved under (n). | Yes; clone only from `<ODOBRENI_TIMSKI_REMOTE>` (TSA-09). |
| Machine preparation | Only outside the repo: prerequisites without `node_modules`, Node `22.23.2`, a draft env template ([01 §0.1](01-ONBOARDING-DEV-ENV.en.md)). | Per [01 §0.2](01-ONBOARDING-DEV-ENV.en.md). |
| `npm ci`, build, gates, tests, repro scripts, sidecar/web/E2E | **No, nowhere**, not even in your own fresh clone. The only exception is if the founder confirms TSA-02 in [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.en.md): `npm ci`, build and gates in a fresh clone on a team machine, detached at `2af0904d`, without a branch, commit or push; sidecar/web/E2E and repro scripts not even then (question (o) in §6). | In your own worktree from `integration/waggle-next`, per the SAFE checklist. |
| Git actions (branch, worktree, commit, push, PR) | **No.** | Per [02](02-WORKING-AGREEMENT.en.md) and the SAFE checklist; push only to the remote the founder approved; never a merge into `main`, a `v*` tag or a release. |
| Team authorizations (who leads and merges, second reviewer, own clones and worktrees, baseline fixture worktree, PR size, hotspot test, CI re-run, order of precedence) | The existing rules of 01/02 and the checklist apply. [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.en.md) is a PROPOSAL, **NOT APPROVED**. The protections of the founder's machine (9 worktrees, docs worktree, 2 stashes, personal paths) are prohibitions concerning that machine, not obligations of team machines (TSA-03 A, revision 1.2.1). | The TSA-01..TSA-10 items the founder confirms apply; for an unconfirmed item the "Today" column applies. |

**Who approves:** exclusively the founder. No agent, lead or workflow message replaces the founder's approval. Approval of the delivery plan opens the W0 and G1 PRs on `integration/waggle-next` (DP-0.04). It does not include RAT-01..RAT-09, ODB-01, ODB-02, DQ-01..DQ-09 or exceptions to the absolute prohibitions (§8). W0 waits for no RAT; RAT-01 must arrive before G1 is closed ([Delivery §6.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md)).

**No code has been written.** The only git actions on the package are two docs-only commits (`2758f4e5`, `fc0a7b3f`) and the push of the branch `docs/waggle-v1.2-planning` at `2758f4e5` (§1.1); `git diff --name-only 2af0904d fc0a7b3f` outside `docs/` is empty. There has been no tag, merge, release, E2E, installer, receipt or benchmark run, no Stripe actions and no paid API calls.

Why `npm ci` and tests wait even in your own clone: `npm ci` and the 6 package-install tests of the local root suite run `npm install` over the network ([01 §6.3](01-ONBOARDING-DEV-ENV.en.md); comment in `ci.yml:88-90`), and `npm ci` deletes `node_modules`, so a process holding a `.node` file leaves a half-deleted tree ([01 §4](01-ONBOARDING-DEV-ENV.en.md)). The rule is a PROPOSAL of this handoff derived from brief §20.4 ([02 §0](02-WORKING-AGREEMENT.en.md)). On the founder's machine, build and tests do not go, even after approval, into the existing worktrees (DP-0.02) or into the docs worktree `D:/Projects/waggle-v12-handoff`.

---

## 3. Reading order

**Day 1 — orientation and rules**
1. This file.
2. [Package manifest](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.en.md) §1–§2: identity and contents of the package.
3. [WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.en.md): the estimate, confirmed defects, the biggest UNKNOWN items and the decision queue on one page.
4. [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md): the single source of truth for the operational yes/no list. Read it in full.
5. [01-ONBOARDING-DEV-ENV.md](01-ONBOARDING-DEV-ENV.en.md): environment, access, first build (before approval, the restriction from §2 applies).
6. [02-WORKING-AGREEMENT.md](02-WORKING-AGREEMENT.en.md): branches, PRs, review, gates, roles.

Alongside these, read the repo rules: [`CLAUDE.md`](../../CLAUDE.md), [`AGENTS.md`](../../AGENTS.md) (the canonical operating contract; `AGENTS.md:6` says of itself that it wins on conflict, but that is not the rule for this package: until a founder decision, the order of precedence is in [02 §0](02-WORKING-AGREEMENT.en.md) ("Order of precedence": proposal TSA-10 in [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.en.md), NOT APPROVED; question (j) in §6; until confirmed the stricter norm applies, and every conflict stops work and goes to the founder); known conflicts with `AGENTS.md` (§3.8, §4) are listed there), [`docs/TESTING.md`](../TESTING.md) and [`docs/TECH-DEBT.md`](../TECH-DEBT.md).

**Day 2 — what is built and in what order**
1. [Waggle_PRD_v1.2_DRAFT.md](../Waggle_PRD_v1.2_DRAFT.en.md): in full, and especially §1 (definition), §4 (G1/G2/G3) and §17 (open decisions).
2. [WAGGLE-DELIVERY-PLAN-v1.2.md](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) §0–§3: baseline and rules DP-0.01..DP-0.16, G1/G2/G3 exit criteria, waves with PR tables, the dependency graph and the critical path. §4 (estimate) and §5–§7 are read as needed.
3. [ADR-INDEX.md](../decisions/ADR-INDEX.en.md): 10 draft ADRs, which wave requires which ADR, and what the ADR package does not decide.

**Before the first ticket (for each PR separately)**
1. The ticket card in [03-BACKLOG.md](03-BACKLOG.en.md): backlog rules and DoR/DoD in §0, dependency order in §2, full G1 ticket cards in §3, compact G2/G3 cards in §4–§5 and the sprint 1 PROPOSAL in §6. The same tickets in machine-readable form are in [backlog.csv](backlog.csv).
2. [04-CODEBASE-MAP.md](04-CODEBASE-MAP.en.md): the code area the PR touches, hotspot files and merge owners (§2) and search discipline (§13). `path:line` is valid only at `2af0904d`.
3. The [FRD](../Waggle_FRD_v1.2_DRAFT.en.md) sections the PR covers. For the PR's ATs: FRD §15 (AT-01..AT-30, with fixture / env / owner / milestone columns and the authoritative wave).
4. The relevant ADR from [`docs/decisions/`](../decisions/ADR-INDEX.en.md). The "ADR status" table in Delivery §2 says which ADR is an input to which wave.
5. Phase-A evidence for the ticket's finding(s). The finding group determines the file:

| Finding group | Evidence | Refuter |
|---|---|---|
| F-HARN-* | [harness.md](../plans/v1.2-evidence/phaseA/harness.en.md), [repro-harness.mjs](../plans/v1.2-evidence/phaseA/repro-harness.mjs) | [harness.refute.md](../plans/v1.2-evidence/phaseA/harness.refute.en.md) |
| F-EVO-* | [evolution.md](../plans/v1.2-evidence/phaseA/evolution.en.md), [repro-shadow.mjs](../plans/v1.2-evidence/phaseA/repro-shadow.mjs), [repro-gepa-delta.mjs](../plans/v1.2-evidence/phaseA/repro-gepa-delta.mjs) | [evolution.refute.md](../plans/v1.2-evidence/phaseA/evolution.refute.en.md) |
| F-DUR-* | [durable.md](../plans/v1.2-evidence/phaseA/durable.en.md) | [durable.refute.md](../plans/v1.2-evidence/phaseA/durable.refute.en.md) |
| F-HM-* | [hivemind.md](../plans/v1.2-evidence/phaseA/hivemind.en.md) | [hivemind.refute.md](../plans/v1.2-evidence/phaseA/hivemind.refute.en.md) |
| F-CAP-* | [capability.md](../plans/v1.2-evidence/phaseA/capability.en.md) | — |
| F-UXM-* | [ux-model.md](../plans/v1.2-evidence/phaseA/ux-model.en.md) | — |
| F-TK-* | [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.en.md) | — |
| F-REL-* | [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.en.md), [oss-drift-check-output.txt](../plans/v1.2-evidence/phaseA/oss-drift-check-output.txt) | — |
| external (live 27.09.2026) | [external.md](../plans/v1.2-evidence/phaseA/external.en.md) | — |

6. If the PR changes data: the corresponding MIG row in [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.en.md).
7. The PR description per [templates/PULL_REQUEST_TEMPLATE.md](templates/PULL_REQUEST_TEMPLATE.en.md). That is a template PROPOSAL and is not installed in `.github/` ([02 §16](02-WORKING-AGREEMENT.en.md)). For W0-PR0 there is a draft diff in [templates/ci-integration-branch-proposal.md](templates/ci-integration-branch-proposal.en.md) (PROPOSAL, not applied).

**Repro scripts** (`phaseA/repro-*.mjs`) are not run anywhere before approval. After approval: a copy outside the repo and `DIST` pointed to your own `dist` built from `2af0904d`, per [v1.2-evidence/README](../plans/v1.2-evidence/README.en.md), "Running", step 2.

---

## 4. What awaits the founder's approval

| Item | What it opens | Status | Source |
|---|---|---|---|
| Approval of the delivery plan (start of implementation) | W0 and G1 PRs on `integration/waggle-next` | waiting (question (a) in §6) | [Delivery plan](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) |
| TEAM-START-AUTHORIZATION | who leads and merges, isolated environments, CI rerun, rules for own clones and worktrees | PROPOSAL, **NOT APPROVED** | [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.en.md) |
| Handoff channel and status of the public copy of the package | the approved remote for clone and push | waiting (H-01; question (n) in §6) | [closure record](../plans/WAGGLE-V1.2-CLOSURE-RECORD.en.md) |
| Commit and push of closure revision 1.2.1 | the team takes over the aligned package via git | awaiting separate approval | §1.1; [manifest](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.en.md) |
| RAT-01..RAT-09, ODB-01, ODB-02 | ratifications of draft ADRs and the G structure; paid receipt runs; scope of W3e-PR9 | open | [Delivery §6.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) |
| DQ-01..DQ-09 | product and business decisions | open | [Delivery §6](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) |
| Questions (a)–(o) before start | — | canonical list | §6 |

What the final closure actually resolved and what it did not (H-01..H-12 and the disposition of earlier MED/LOW findings): [closure record](../plans/WAGGLE-V1.2-CLOSURE-RECORD.en.md).

---

## 5. Order of work

1. Before approval: only what §2 allows today and steps 1–2 in §6.
2. After approval: G1 → G2 → G3 per [Delivery §1–§3](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) (exit criteria, waves, the dependency graph and the critical path). Tickets are in [03-BACKLOG.md](03-BACKLOG.en.md) and [backlog.csv](backlog.csv); the first 10 working days in §6.
3. The G structure is a PROPOSAL and is ratified through RAT-01. Estimates and the calendar are an expert range in [Delivery §4.2–§4.3](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md), not a promised deadline. The calendar starts from the actual approval date (T0), not from 27.09.2026. The schedule against the actual team composition is confirmed by the tech lead. The frame for the first four weeks from T0 (definition of T0, deliverables and evidence per week, four separate outcomes: internal candidate, benchmark-ready candidate, public-ready artifact and public announcement, and a rough capacity check) is in [Delivery §4.4](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md).
4. Freezes F1–F4 and the path to a signed and public artifact: [Delivery §5](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) and §5.1 (acyclic path F3a over the frozen source SHA → a controlled, separately approved step K → F3b over the exact signed artifact → a separate public GO). A receipt from `e4bf403e`, `b07a6173` or `c4e6a515` does not cover `2af0904d`. — CONFIRMED AT REVISION (F-REL-02).

---

## 6. First 10 working days and questions for the founder before start

**Today (before approval) only steps 1–2 are done, in the scope from §2.** Until decision (n) (handoff channel, H-01; TSA-09) the team makes no clone at all, not even a read-only clone of the public repo. From git, only the read-only `git ls-remote https://github.com/marolinik/waggle-os.git refs/heads/main` is allowed; the package is read from the copy handed over by the founder whose SHA-256 matches the [manifest](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.en.md) §3. Everything after the gate waits for written approval of the delivery plan.

| # | When (indicative) | What | Source | Done when |
|---|---|---|---|---|
| 1 | Day 1 | Reading per §3 (Day 1) from the copy of the package verified against the manifest. Node `22.23.2` (`fnm use 22.23.2`; better-sqlite3 ABI 127), `node -v`. Baseline: `git ls-remote https://github.com/marolinik/waggle-os.git refs/heads/main` = `2af0904d…`, without a clone ([01 §0.1](01-ONBOARDING-DEV-ENV.en.md) pt.1 and pt.3). Clone, `git show`/`git grep` and the other checks from 01 §0.1 pt.3 only in a checkout from the channel approved under (n). | checklist "Before every PR"; DP-0.01; TSA-09 | Everyone has read the checklist and has no unclear items. `main` = `2af0904d`, or the difference has been escalated to the founder. |
| 2 | Day 2 | Reading per §3 (Day 2). Env template outside the repo (checklist "Env isolation", "External writes disabled"; [01 §9.2](01-ONBOARDING-DEV-ENV.en.md)) and the **safe test profile (BTP)** (checklist "Safe test profile (BTP)", [01 §9.0](01-ONBOARDING-DEV-ENV.en.md)); the first sidecar/E2E run after approval goes only there, a scratch profile is not a sandbox. The server is not started. List of questions (a)–(o) and a proposed assignment of the DP-0.14 roles. | DP-0.08, DP-0.10, DP-0.14 | The env template has been reviewed. The BTP exists and the "before" snapshot per 01 §9.5 has been taken. Assignment of roles to people: UNKNOWN. |
| — | **Gate** | **The founder approves the delivery plan (start of implementation)**, with answers to (a), (h), (j), (k), (l) and (n). Without this, nothing proceeds. | §2; gates `PLAN-APPROVAL`, `TSA-09`, `Q00-h`, `ROLE-ASSIGN` ([backlog-gates.csv](backlog-gates.csv)) | Written approval from the founder exists. |
| 3–10 | Day 3–10 from T0 | After the gate: INT-01 and W0-PR0 (CI for `integration/**`), then the Harness, Memory, Boundary+Release, Durable-probe and Server (W0-PR20) lanes, W0-PR19 only with TSA-05, INT-02 and F1 preparation. Schedule, order and estimates: [03 §6](03-BACKLOG.en.md) (sprint 1) and [Delivery §3 and §4.4.4](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md); cards in 03 §3. The day-by-day schedule from revision 1.2: `git show 2758f4e5:docs/handoff/00-START-HERE.md`. | 03 §6; Delivery §4.4.4 | Per 03 §6 and the G1 exit (Delivery §1). |

**If `main` on `origin` differs from `2af0904d`**, the baseline from the checklist and DP-0.01 no longer holds: work stops, and the question goes to the founder through [05](05-RISKS-DECISIONS-ESCALATION.en.md) before step 3. The team does not choose a new base on its own (UNKNOWN until decided). The list `git diff --name-only 2af0904d <novi SHA>` is made only in a checkout from the approved channel; every phase-A finding, `path:line` and pin test on that list is re-checked ([v1.2-evidence/README](../plans/v1.2-evidence/README.en.md), "Snapshot, not the current truth").

**Questions for the founder before start** (the only canonical list; the letters are stable IDs, new questions are appended at the end; rationales and facts: [05 §5.0.1](05-RISKS-DECISIONS-ESCALATION.en.md); recommendations and blockers: [closure record §4](../plans/WAGGLE-V1.2-CLOSURE-RECORD.en.md)):
- (a) approval of the delivery plan — `PLAN-APPROVAL`;
- (b) a detached baseline fixture worktree at `2af0904d` for W0-PR19 — TSA-05;
- (c) the team on the founder's machine or only on team machines — TSA-03;
- (d) what is done with the docs worktree `D:/Projects/waggle-v12-handoff` after the handoff — TSA-03 A, together with (h) and (n);
- (e) the deadline for DQ-04 and DQ-05 (recommendation: before G2);
- (f) who gives ODB-01 for F1;
- (g) not a question for the founder: the status of earlier findings is in [FINDINGS-DISPOSITION.csv](../plans/v1.2-evidence/findings/FINDINGS-DISPOSITION.csv) (H-03);
- (h) how the package gets into `integration/waggle-next` — `Q00-h`, INT-01; closure D-4;
- (i) DOCX export: not a founder decision; manifest §3;
- (j) order of precedence of documents — TSA-10, TSA-06; 02 §0;
- (k) who approves and merges into `integration/waggle-next` — TSA-01; 02 §7;
- (l) ESK-01..ESK-03: tech lead, escalation channel, role assignment — 05 §5.0; TSA §1;
- (m) whether the Harness owner co-approves merges of the chat hotspot — TSA-01 pt.2; 02 §3;
- (n) distribution, handoff channel and `<ODOBRENI_TIMSKI_REMOTE>` (H-01) — TSA-09; closure D-1..D-3. Until decided, the rule for today from the start of this section applies;
- (o) isolated onboarding in a fresh clone before approval of the plan — TSA-02; until answered: no.

G1 does not finish in 10 days: for reference 3–5 weeks from T0 ([Delivery §4.4.1 and §4.4.4](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md)).

---

## 7. What is decided and what is open

**Decided:** DECISION D-01..D-18 ([brief §3](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.en.md); map to disposition rows: [Disposition §0.1](../plans/WAGGLE-AUDIT-DISPOSITION-v1.2.en.md)). They are not reopened; a conflict between code or a finding and D-nn is recorded and reported to the founder for information (§9).

**Open:** DQ-01..DQ-09 ([Delivery §6](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md); PRD §17 `O-1..O-9` = DQ-01..09) · RAT-01..RAT-09, ODB-01, ODB-02 ([Delivery §6.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md)) · sub-lists `MDQ-01..12` ([Migrations §7](../plans/WAGGLE-MIGRATIONS-v1.2.en.md)), `Q-00..Q-10` ([Benchmark §15](../plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.en.md)), `Q1..Q6` ([BvB §6](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.en.md)) · disposition of findings and package inconsistencies: [closure record](../plans/WAGGLE-V1.2-CLOSURE-RECORD.en.md), [FINDINGS-DISPOSITION.csv](../plans/v1.2-evidence/findings/FINDINGS-DISPOSITION.csv), [OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md) · UNKNOWN registers: [BvB §7](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.en.md), [Benchmark §18](../plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.en.md), [ADR-INDEX §4](../decisions/ADR-INDEX.en.md), [SUMMARY "Biggest UNKNOWNs"](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.en.md).

Rule: an open question never carries the DECISION label. It is written as "open — DQ-nn (founder)" or "open — engineering decision of the owner (role)".

---

## 8. Absolute prohibitions

The authoritative list is the [SAFE-IMPLEMENTATION checklist, "Absolute prohibitions"](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md), together with DP-0.11/DP-0.12; it is not repeated here. In short: no merge into `main`, force-push, `git tag v*`, release, publication or signing; no push of internal planning documentation or team branches to the public `origin` (push only to `<ODOBRENI_TIMSKI_REMOTE>`, after the founder's recorded decision on the handoff channel, H-01); no replacing the installed application or touching the founder's data; no external writes or paid calls without approval for the specific run; no change to repo visibility, the license or the NOTICE text; no Fusion/council surface (DECISION D-16). An exception applies only with the founder's written approval for the specific action.

---

## 9. Contact and escalation

**The decision owner is the founder** (Marko Marković, Egzakta Group; `CLAUDE.md` signature). He approves the plan, DQ-01..DQ-09, RAT-01..RAT-09, ODB-01/ODB-02 and every exception to §8. The channel and expected response time are UNKNOWN. Details and question templates are in [05-RISKS-DECISIONS-ESCALATION.md](05-RISKS-DECISIONS-ESCALATION.en.md).

| Question type | Goes to | Reference |
|---|---|---|
| Product decision from D-01..D-18 | Not reopened: closed. The question is reformulated as implementation of the decision. A conflict between code or a finding and D-nn is recorded and reported to the founder for information (a report, without reopening; 02 §10 pt.3, 05 §5.3). | brief §3 |
| Decision queue item | Founder | Delivery §6 (DQ-01..09) |
| Ratification of an ADR / the G structure; paid run; scope of W3e-PR9 | Founder | Delivery §6.1 (RAT-01..09, ODB-01, ODB-02) |
| Exception to a prohibition or the checklist (e.g. W0-PR19 worktree) | Founder, in writing, before the action | checklist; DP-0.11; proposal TSA-05 ([TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.en.md)) |
| Engineering decision within a role (e.g. MDQ-07, timezone field ADR-07 O4, Q1/Q6) | Role owner from DP-0.14 | Delivery DP-0.14; Migrations §7 |
| Merge into a hotspot file | Merge owner (role); no two hotspot merges on the same day without an integration test (what that test is: UNKNOWN, and until the tech lead decides there is no second merge of the same hotspot on the same day, [02 §3](02-WORKING-AGREEMENT.en.md); proposed definition: TSA-07 in [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.en.md), NOT APPROVED) | DP-0.14; checklist |
| Change in `packages/hive-mind-core/src/**` | Memory owner + maintainer review of the drift baseline; never directly on the mirror | `CLAUDE.md` §7.5 |
| External gates (Authenticode, Deep Security, CASA, GitHub settings) | Founder / repo owner, through W8; not a PR or an agent action | Delivery §2 W8; ADR-10-O8 |
| Error or inconsistency in the package | The lead records it, the founder decides; the package is not changed silently | [closure record](../plans/WAGGLE-V1.2-CLOSURE-RECORD.en.md); OPEN-LOW-FINDINGS |
| Finding that is not in the package (new defect) | RED test + status AUDIT FINDING — TO VERIFY, then lead → founder if it changes scope or G | DP-0.15 |

---

## Sources

Package contents, the purpose of each file and SHA-256: [manifest](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.en.md). Handoff history: [HANDOFF-HISTORY](../plans/v1.2-evidence/HANDOFF-HISTORY.en.md). Closure of H-01..H-12: [closure record](../plans/WAGGLE-V1.2-CLOSURE-RECORD.en.md). Key sources: [Delivery plan v1.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) §0–§6.1 · [SAFE-IMPLEMENTATION checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md) · [PRD v1.2](../Waggle_PRD_v1.2_DRAFT.en.md) · [FRD v1.2](../Waggle_FRD_v1.2_DRAFT.en.md) §15–§16 · [ADR-INDEX](../decisions/ADR-INDEX.en.md) · [brief §3](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.en.md) · [SUMMARY](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.en.md) · [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.en.md) (PROPOSAL, NOT APPROVED).

Read-only checks for revision 1.2.1 (30.09.2026): `git rev-parse origin/main` (= `2af0904d…`); `git log -1` and parents for `2758f4e5` (parent `2af0904d`) and `fc0a7b3f` (parent `2758f4e5`); `git diff --name-only 2af0904d fc0a7b3f` (108 files, all in `docs/`); `git ls-remote origin` (branch `docs/waggle-v1.2-planning` = `2758f4e5`, no `refs/heads/integration/*`); `git reflog` for `refs/remotes/origin/docs/waggle-v1.2-planning` (push 30.09.2026 00:04:18 +0200); `gh api repos/marolinik/waggle-os` (`visibility: public`); `node docs/plans/v1.2-evidence/tools/check_trace.mjs docs` (result in manifest §4). Checks from 29.09.2026: [HANDOFF-HISTORY §7](../plans/v1.2-evidence/HANDOFF-HISTORY.en.md).

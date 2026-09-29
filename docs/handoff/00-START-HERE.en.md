# Waggle v1.2 — START HERE (handoff to the development team)

> **English translation** of [00-START-HERE.md](00-START-HERE.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision: 1.2 DRAFT · 29.09.2026 · reviewed code revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`**

Who it is for: the tech lead, developers and QA who are taking over Waggle from the founder today. This is the entry point. The document does not copy the package; it tells you what to read, in what order, what you may and must not do, and where work starts once the plan is approved. All relative links start from `docs/handoff/`.

> **Status in one sentence:** the package is a **DRAFT**, implementation is **not approved**, and the first line of code is written only when the founder approves the delivery plan. From that moment on, everything is done according to the mandatory [SAFE-IMPLEMENTATION checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md).

Status labels are the same as throughout the package: **DECISION** (founder only, D-01..D-18) · **CONFIRMED AT REVISION** (read or reproduced on `2af0904d`) · **AUDIT FINDING — TO VERIFY** · **PARTIAL/UNWIRED** · **PROPOSAL** · **DEFERRED** · **UNKNOWN**.

---

## 1. What Waggle is and what this package is

**Waggle** is a free, open-source, desktop-first and local-first AI work partner for the individual. Its primary job is knowledge work: research, analysis and business artifacts. Coding is supported, but it does not define the product. The primary platform is Windows/Tauri. Team and organizational capabilities do not come through a separate Waggle Team/Enterprise product, but through connecting to **KVARK**, which remains exclusively on-prem ("Waggle = me. KVARK = us."). — DECISION (D-01..D-06; [PRD §1.1](../Waggle_PRD_v1.2_DRAFT.en.md), PRD-01-01/02). The code at `2af0904d` still enforces the 4-tier model with paid TEAMS. That is a gap between the decision and the code which the plan closes through migration, not a reason to reopen the decision. — CONFIRMED AT REVISION (PRD-01-03).

**This package** is the v1.2 DRAFT planning package on top of `main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`, and the repo was only read during planning. The package contains:
- PRD and FRD v1.2 (`.md` + DOCX; the DOCX was re-exported on 29.09.2026 from the normalized `.md`, see "DOCX is current" below);
- the Delivery plan with waves W0–W8/W3e/WB/OSS/B1–B3, milestones G1 → G2 → G3 and the SAFE-IMPLEMENTATION checklist (Appendix A);
- the disposition of audit findings C1–C22 / A1–A29 / R01–R24;
- the Build-vs-Borrow record, the benchmark protocol and the MIG-00..09 migration plan;
- 10 draft ADRs with an index and acceptance tests AT-01..AT-30.

Everything in the package is a **PROPOSAL**. No ADR, threshold, date or G structure has been approved ([SUMMARY for the founder](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.en.md)).

The mechanical PRD ↔ FRD coverage check passed on 29.09.2026 with exit 0: PRD 166/166, FRD contracts 114/114. Command (read-only, from the repo root):

```bash
node docs/plans/v1.2-evidence/tools/check_trace.mjs docs
```

— CONFIRMED AT REVISION of the package (29.09.2026).

**Where the package physically lives.** Worktree `D:/Projects/waggle-v12-handoff`, branch `docs/waggle-v1.2-planning` at `2af0904d`. The package files are **untracked** on that branch (not committed); `git status` was checked read-only on 29.09.2026. — CONFIRMED AT REVISION. When and how the package is committed is decided by the founder (UNKNOWN). `integration/waggle-next` is created from `2af0904d`, and at that revision PRD/FRD/ADR v1.2 do not exist (`git cat-file -e 2af0904d:docs/Waggle_PRD_v1.2_DRAFT.md` → "exists on disk, but not in '2af0904d'", same for `docs/decisions/ADR-INDEX.md`; CONFIRMED AT REVISION 29.09.2026). That is why the package's path into the integration branch blocks WB-PR1 and the ID-reconcile PR (question (h) in §6).

**Paths in the package.** Paths in the new v1.2 files were normalized on 29.09.2026 to the repo layout (`docs/…`, `docs/plans/v1.2-evidence/…`). A grep over PRD, FRD, Delivery, MIG, BvB, Benchmark and ADR-INDEX finds no staging path `out/…`, no unprefixed `phaseA/…` and no `scratchpad/…`. The only exception is the deliberately retained real path of the existing worktree `…/scratchpad/wt202` (DP-0.02). — CONFIRMED AT REVISION of the package (29.09.2026). The map of old and new paths is in [v1.2-evidence/README.md, "Old path map"](../plans/v1.2-evidence/README.en.md#map-of-old-paths). It is needed only for `critic-r2-estimates.json` and historical comments (e.g. the `repro-harness.mjs` header). The DOCX was re-exported from the normalized `.md` and no longer contains staging paths (see below).

**DOCX is current (re-export 29.09.2026 after path normalization).** The first DOCX export (29.09.2026, 00:10) preceded the path normalization (00:24:41), so it carried the text from before normalization with staging paths (`out/…`, `scratchpad/…`, `v12-planning-staging/…`). The PRD and FRD DOCX were therefore re-exported with the same command from Delivery §6.1 (`pandoc -f gfm-tex_math_dollars-tex_math_gfm <fajl>.md -o <fajl>.docx`, run from `docs/`), without changing the `.md` text. The hashes were updated in Delivery §6.1 and Disposition OD-9, where the full values are given: PRD `.md` `8aa74f26…`, `.docx` `932bb0ee…`; FRD `.md` `7ecc197f…`, `.docx` `198ccd6c…`. In the new DOCX, `unzip -p <fajl>.docx word/document.xml | grep` finds no staging paths, and a repeated export into scratch differs only in `docProps/core.xml` (creation time). The "Handoff condition" from Delivery §6.1 is thereby met for the listed hashes. — CONFIRMED AT REVISION of the package (29.09.2026; `pandoc 3.9`, `sha256sum`). The authoritative text remains the `.md`; any later change to the PRD/FRD `.md` again requires an export with the same command and new hashes in §6.1 and OD-9.

Files in `docs/plans/` and `docs/decisions/` older than 27.09.2026 are **not** part of the v1.2 package. They are historical records and do not carry the authority of a D decision (brief §2.1/§21).

---

## 2. Status: DRAFT, implementation not approved

| Question | Answer |
|---|---|
| What is the state of the package? | DRAFT. Last critique round: HIGH 0, MED 12. LOW findings were deliberately left to the founder: 17 open, 8 resolved according to [OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md). After the path normalization on 29.09.2026 that split is inaccurate on one point: the row about `scratchpad/…` paths is among the 17 open ones, but in the table it carries the label "Applied 29.09.2026". The "DOCX export" item among the 8 resolved ones was temporarily inaccurate after normalization; after the re-export on 29.09.2026 the hashes in Delivery §6.1/OD-9 again match the current files (§1, "DOCX is current"). **The status of the 12 MED findings is UNKNOWN:** the package contains neither their list nor a per-item resolution record. The [SUMMARY](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.en.md) ("Last critique round") says only of the LOW findings that they were "left without a new loop". That suggests the MED findings went through a fix loop, but this is not recorded anywhere. `OPEN-LOW-FINDINGS` covers only LOW, and `critic-r2-estimates.json` is the second round (11 findings: 1 HIGH, 5 MED, 5 LOW), not the last one. Check: grep `MED` over `docs/`, 29.09.2026. Until the founder confirms, the team does not claim that MED is 0 (question (g) in §6). |
| Has code been written? | No. There has been no commit, push, tag, merge, release, E2E, installer, receipt or benchmark run, no Stripe actions and no paid API calls ([SUMMARY](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.en.md), "What was NOT done"). |
| Who approves? | **Exclusively the founder**, as the decision owner. No agent, lead or workflow message can replace the founder's approval. |
| What does "approval to start" mean? | Explicit, written approval from the founder that the team may begin implementation according to the [Delivery plan v1.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md). In practice this opens W0 and the accompanying G1 PRs (§6 of this file) on the integration branch `integration/waggle-next` (DP-0.04). |
| What does approval to start **not** include? | Ratifications RAT-01..RAT-09 (draft ADRs and the G structure), approvals ODB-01 (paid receipt runs) and ODB-02 (scope of W3e-PR9), decisions DQ-01..DQ-09 and exceptions to the absolute prohibitions (§8). Each of them has its own founder approval, at the point the plan prescribes ([Delivery §6](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md), §6.1). |
| What applies after approval? | Every PR, agent and session goes through the [SAFE-IMPLEMENTATION checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md). Every "no" stops work. The exit of each of the 13 waves requires that every one of its PRs passed the checklist without a single "no" item (DP-0.01..DP-0.16). |
| Does W0 wait for ratifications? | No. No ADR blocks W0, and W0 proceeds even without RAT-01. RAT-01 must arrive before G1 is closed ([Delivery §6.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md)). |

Until approval arrives, the team may only read the package and the repo, prepare personal machines and prepare questions (§6, steps 1–2). Everything that changes git state (branch, worktree, commit, push), as well as `npm ci`, build, gates, tests, repro scripts and starting the sidecar/web/E2E, waits for approval.

**`npm ci`, build, gates, tests and repro scripts before approval: nowhere** (one rule, the same as [01 §0 "Gate"](01-ONBOARDING-DEV-ENV.en.md), [02 §0](02-WORKING-AGREEMENT.en.md) and [04 §13 pt.7](04-CODEBASE-MAP.en.md); a PROPOSAL of this handoff, derived from brief §20.4 as cited by 02 §0; the founder confirms it or grants an exception through question (o) in §6):
- Before the founder's written approval of the plan, no one runs `npm ci`, `npm run build:packages`, gates, tests, repro scripts (§3) or sidecar/web/E2E. This applies to existing worktrees, to the docs worktree `D:/Projects/waggle-v12-handoff`, and to a separate fresh clone on one's own machine. A clone in which `npm ci` is run is not "outside the repo" in the sense of 02 §0, and `npm ci` and the 6 package-install runtime tests from the local root suite run `npm install` over the network ([01 §6.3](01-ONBOARDING-DEV-ENV.en.md); comment in `ci.yml:88-90`, CONFIRMED AT REVISION 29.09.2026). Only what [01 §0.1](01-ONBOARDING-DEV-ENV.en.md) lists is allowed: reading, read-only checks and preparing the machine outside the repo (prerequisites without `node_modules`, Node `22.23.2`, a draft env template outside the repo).
- The exception for a separate fresh clone on one's own machine (detached `2af0904d`, no push) is **not approved**. That is question (o) in §6. Until it is answered, the rule above applies.
- After approval, `npm ci`, build and gates run in your own worktree from `integration/waggle-next`, per [01 §0.2](01-ONBOARDING-DEV-ENV.en.md) (steps 1–6), because the integration branch does not exist until then (DP-0.04). **Never** in any of the 9 worktrees from DP-0.02 (among them `D:/Projects/waggle-os`, main) nor in the docs worktree `D:/Projects/waggle-v12-handoff`. The reason is the trap from [01 §4](01-ONBOARDING-DEV-ENV.en.md): `npm ci` deletes `node_modules`, so a process holding a `.node` file leaves a half-deleted tree.

---

## 3. Reading order

**Day 1 — orientation and rules**
1. This file.
2. [WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.en.md): the estimate, confirmed defects, the biggest UNKNOWN items and the decision queue on one page.
3. [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md): the single source of truth for the operational yes/no list. Read it in full.
4. [01-ONBOARDING-DEV-ENV.md](01-ONBOARDING-DEV-ENV.en.md): environment, access, first build (before approval, the restriction from §2 applies).
5. [02-WORKING-AGREEMENT.md](02-WORKING-AGREEMENT.en.md): branches, PRs, review, gates, roles.

Alongside these, read the repo rules: [`CLAUDE.md`](../../CLAUDE.md), [`AGENTS.md`](../../AGENTS.md) (the canonical operating contract; `AGENTS.md:6` says of itself that it wins on conflict, but that is not the rule for this package: until a founder decision, the order of precedence is in [02 §0](02-WORKING-AGREEMENT.en.md) ("Order of precedence": UNKNOWN, question (j) in §6; until then the stricter norm applies, and every conflict stops work and goes to the founder); known conflicts with `AGENTS.md` (§3.8, §4) are listed there), [`docs/TESTING.md`](../TESTING.md) and [`docs/TECH-DEBT.md`](../TECH-DEBT.md).

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

**Note on the repro scripts** (CONFIRMED AT REVISION of the package, grep 29.09.2026):
- All three scripts hardcode the `dist` of the founder's main checkout:
  - `repro-harness.mjs:4`: `DIST = 'file:///D:/Projects/waggle-os/packages/agent/dist/'`;
  - `repro-shadow.mjs:10`: `DIST = 'D:/Projects/waggle-os/packages/agent/dist'`;
  - `repro-gepa-delta.mjs:10`: `DIST = 'D:/Projects/waggle-os/packages/agent/dist'`.

  Without modification they read whatever `dist` is currently in `D:/Projects/waggle-os`, not the `dist` from `2af0904d`.
- `repro-shadow.mjs` **writes next to itself:** `mkdtempSync(path.join(here, 'shadow-'))` (`:14-15`), i.e. into `docs/plans/v1.2-evidence/phaseA/` inside the repo. It deletes it only at `:42`, without `finally`, so after an error the directory remains. The header ("Writes only under the scratchpad", `:3-4`) is historical. In the other two scripts grep finds no write.
- **Running: only after the founder's approval of the plan (§2).** Until then the repro scripts are not run anywhere: they require a `dist` built from `2af0904d`, building (`npm ci`, `npm run build:packages`) waits for approval, and the `dist` in `D:/Projects/waggle-os` has not been proven to be from `2af0904d` (point above). After approval: copy all three scripts into a scratch directory outside the repo, as in [v1.2-evidence/README](../plans/v1.2-evidence/README.en.md) ("Running", step 2). In the **copy**, point `DIST` to `packages/agent/dist` of your own worktree from `integration/waggle-next` ([01 §0.2](01-ONBOARDING-DEV-ENV.en.md)), built with `npm run build:packages`. The result is compared with the snapshot only if that `dist` was built from revision `2af0904d` (same README, step 2). The evidence files are not changed. `dist` is never built in `D:/Projects/waggle-os`.

---

## 4. Package map

Roles in the "Who uses it" column: **PM** (founder or decision owner, planning), **Lead** (tech lead and merge owners of hotspot files), **Dev**, **QA**.

| File | Purpose (one line) | Who uses it |
|---|---|---|
| [handoff/00-START-HERE.md](00-START-HERE.en.md) | Entry point: status, reading order, first 10 days, prohibitions. | everyone |
| [handoff/01-ONBOARDING-DEV-ENV.md](01-ONBOARDING-DEV-ENV.en.md) | Environment, access and first build (Windows). | Dev, QA |
| [handoff/02-WORKING-AGREEMENT.md](02-WORKING-AGREEMENT.en.md) | Way of working: branches, PRs, review, gates, roles. | Lead, Dev, QA |
| [handoff/03-BACKLOG.md](03-BACKLOG.en.md) | Tickets, where ticket = PR ID from Delivery §2: overview by wave, dependencies, cards (G1 full, G2/G3 compact), DoR/DoD, sprint 1 PROPOSAL. | PM, Lead, Dev, QA |
| [handoff/backlog.csv](backlog.csv) | Machine-readable version of the tickets from 03 (RFC 4180, UTF-8) for import into a tracker. | PM, Lead |
| [handoff/04-CODEBASE-MAP.md](04-CODEBASE-MAP.en.md) | Code map for the areas the plan changes: topology, hotspot files and merge owners, `path:line` at `2af0904d`, how to search. | Lead, Dev, QA |
| [handoff/05-RISKS-DECISIONS-ESCALATION.md](05-RISKS-DECISIONS-ESCALATION.en.md) | Decision queue (DQ/RAT/ODB), UNKNOWN items that block tickets, external gates, risks and escalation rules: which question goes to whom. | everyone |
| [handoff/templates/PULL_REQUEST_TEMPLATE.md](templates/PULL_REQUEST_TEMPLATE.en.md) | PROPOSAL for a PR description template with the mandatory fields from the checklist; not installed in `.github/`. | Lead, Dev |
| [handoff/templates/ci-integration-branch-proposal.md](templates/ci-integration-branch-proposal.en.md) | PROPOSAL of a diff for W0-PR0 (`integration/**` in `ci.yml` and `tauri-build-pr.yml`); not applied. | Lead (W0-PR0 owner: UNKNOWN, proposed: Release owner) |
| [Waggle_PRD_v1.2_DRAFT.md](../Waggle_PRD_v1.2_DRAFT.en.md) (+ [.docx](../Waggle_PRD_v1.2_DRAFT.docx), re-exported 29.09.2026, see §1 "DOCX is current") | What the product is and is not; G1/G2/G3 at the product level; open decisions §17. | PM, Lead |
| [Waggle_FRD_v1.2_DRAFT.md](../Waggle_FRD_v1.2_DRAFT.en.md) (+ [.docx](../Waggle_FRD_v1.2_DRAFT.docx), re-exported 29.09.2026, see §1 "DOCX is current") | Functional contracts (FRD-nn.m); AT-01..AT-30 (§15); traceability PRD → FRD → AT (§16). | Lead, Dev, QA |
| [plans/WAGGLE-DELIVERY-PLAN-v1.2.md](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) | Operational plan: DP-0.01..DP-0.16, G exit criteria, waves and PR slicing, graph, estimate, freezes F1–F4, DQ/RAT/ODB, TM matrix. | PM, Lead, Dev, QA |
| [plans/SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md) | Mandatory yes/no list before every PR, agent and session; absolute prohibitions; mandatory PR description fields. | everyone |
| [plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md](../plans/WAGGLE-AUDIT-DISPOSITION-v1.2.en.md) | Resolution of every audit finding (C1–C22, A1–A29, R01–R24) with evidence and wave. | PM, Lead |
| [plans/WAGGLE-BUILD-VS-BORROW-v1.2.md](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.en.md) | BB-01..BB-13 records (Preserve → Borrow → Adapt → Build), criterion for the durable engine, provenance inventory. | Lead, Dev |
| [plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md](../plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.en.md) | B1/B2/B3 protocol: test selection, hypotheses, firewall, run reset, statistics, manifest, cost. | Lead (Benchmark owner), QA |
| [plans/WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.en.md) | MIG-00 contract (snapshot, dry-run, idempotency, rollback Class A/B) and MIG-01..09; MDQ sub-list. | Lead, Dev, QA |
| [plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md) | Open LOW findings of the last critique round (inconsistencies in the package). | PM, Lead |
| [plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.en.md) | One page: estimate, defects, UNKNOWN, decision queue. | PM, Lead |
| [decisions/ADR-INDEX.md](../decisions/ADR-INDEX.en.md) | Index of ADR-01..10: topic, what it replaces, wave, key AT, what the ADR package does not decide. | Lead, Dev |
| [ADR-01](../decisions/2026-09-27-ADR-01-conversation-work-modes.en.md) | Conversation vs work × `normal/strict/benchmark`; server-observed evidence. | Lead, Dev (Harness/Chat) |
| [ADR-02](../decisions/2026-09-27-ADR-02-durable-store-phase-resume-action-idempotency.en.md) | Durable run store, phase as the unit of recovery, `actionId` ≠ `attemptId`, lease/fencing. | Lead, Dev (Durable) |
| [ADR-03](../decisions/2026-09-27-ADR-03-detach-cancel-supersedes-r3-008.en.md) | Detach ≠ cancel, `sinceSeq` reconnect, narrowing of R3-008. | Lead, Dev (Durable/Chat) |
| [ADR-04](../decisions/2026-09-27-ADR-04-inline-capability-oauth.en.md) | Inline capability setup and OAuth (state + PKCE) as continuity of work. | Lead, Dev (Capability/Security) |
| [ADR-05](../decisions/2026-09-27-ADR-05-rawdetail-context-hook-precedence.en.md) | RAWDETAIL, three storage responsibilities, `ContextPackage`, hook precedence, scope isolation. | Lead, Dev (Memory) |
| [ADR-06](../decisions/2026-09-27-ADR-06-active-override-promotion-rollback.en.md) | Active-version pointer, promotion with holdout, rollback. | Lead, Dev (Evolution) |
| [ADR-07](../decisions/2026-09-27-ADR-07-routines-vs-toolless-loops.en.md) | Routines as a trigger vs TOOLLESS Loops; occurrence identity, misfire/DST. | Lead, Dev (Durable) |
| [ADR-08](../decisions/2026-09-27-ADR-08-individual-tiers-kvark-boundary.en.md) | Individual Waggle without a tier boundary; KVARK connection as the capability boundary. | Lead, Dev (Boundary) |
| [ADR-09](../decisions/2026-09-27-ADR-09-secondary-worker-parity.en.md) | `packages/worker` = legacy, isolate + freeze, not a parity target. | Lead, Dev (Boundary/Server) |
| [ADR-10](../decisions/2026-09-27-ADR-10-release-privacy-profiles.en.md) | Release/privacy profiles (P-LOCAL … P-BENCH), egress, telemetry, receipts per profile. | Lead, Dev (Release/Security), QA |
| [v1.2-evidence/README.md](../plans/v1.2-evidence/README.en.md) | Contents of the evidence folder (snapshot at `2af0904d`), safe read-only running of `check_trace.mjs` and the repro scripts (a copy outside the repo, because `repro-shadow.mjs` creates `shadow-*` next to itself) and the old path map. | Lead, Dev, QA |
| [v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.en.md) | Founder brief: D-01..D-18 (§3), DIR-01..DIR-25, G direction (§5.1), authority boundaries. | PM, Lead |
| [v1.2-evidence/inputs/S1-audit-2026-09-27.md](../plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md) | S1 audit of PRD/FRD v1.1 (starting input for the estimate; phase-A overrides it where they differ). | PM, Lead |
| [v1.2-evidence/inputs/Waggle_PRD_v1.1_2026-09-27.md](../plans/v1.2-evidence/inputs/Waggle_PRD_v1.1_2026-09-27.md), [FRD v1.1](../plans/v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.md) (+ `.docx`) | Previous version of the specification (historical input). | PM |
| [v1.2-evidence/phaseA/](../plans/v1.2-evidence/phaseA/) (`*.md`, `*.refute.md`, `repro-*.mjs`) | Revalidation of findings at `2af0904d` by group, refuter verdicts and repro scripts (table in §3). | Lead, Dev, QA |
| [v1.2-evidence/phaseA/critic-r2-estimates.json](../plans/v1.2-evidence/phaseA/critic-r2-estimates.json) | Estimate critique findings from the second round (historical trace). | PM, Lead |
| [v1.2-evidence/phaseA/oss-drift-check-output.txt](../plans/v1.2-evidence/phaseA/oss-drift-check-output.txt) | Read-only output of `oss-drift-check.mjs` (22 known blockers, 3 unreviewed). | Lead (Memory/OSS) |
| [v1.2-evidence/tools/check_trace.mjs](../plans/v1.2-evidence/tools/check_trace.mjs) | Mechanical check of PRD ↔ FRD §16.1 coverage (exit 1 on a gap). | PM, Lead, QA |

---

## 5. Milestones G1 / G2 / G3

The G structure is a **PROPOSAL** (the planning direction of brief §5.1), and the founder ratifies it through RAT-01. The numbers are copied from [Delivery plan §4.2–§4.3](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) and have not been re-estimated. It is an expert range, not a P50, and it contains no flat AI discount. The exit criteria and the list of what must not be claimed are in [Delivery §1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md).

| | Meaning | AI-orchestrated eng-days | Classic eng-days | Calendar, cumulative (no breaks) |
|---|---|---|---|---|
| **G1** | Reliable internal candidate | 11–16 | 22–30 | 3–5 weeks → **18.10.2026 – 01.11.2026** |
| **G2** | Benchmark-ready knowledge-work core | 87–121 (cum. 98–137) | 177–245 (cum. 199–275) | 11–18 weeks → **13.12.2026 – 31.01.2027** |
| **G3** | Public product | 37–53, with W3e-PR9 41–60 (cum. 135–190 / 139–197) | 75–108.5, with W3e-PR9 83–122.5 (cum. 274–383.5 / 282–397.5) | (a) B3 in parallel: 16–27 weeks → **17.01.2027 – 04.04.2027** (with W3e-PR9 and T_evo before B3 on the same machine: 16–28 → 11.04.2027); (b) B3 serial: 18–30 weeks → **31.01.2027 – 25.04.2027** (with the T_evo placeholder 18–32 → 09.05.2027) |

How to read the ranges:
- **Dates** are the end of the n-th calendar week counted from 27.09.2026 (a Sunday), not a working deadline. The last working day is the Friday of that week: G1 16.10/30.10.2026, G2 11.12.2026/29.01.2027. The time from 27.09.2026 until the founder's approval of the plan is not included; the approval date is UNKNOWN.
- **Breaks are not included in the ranges.** With breaks, G2 is 11–20 weeks (until 14.02.2027), G3 (a) 18–29, (b) 19–33. Every bound after 24.12.2026 shifts by +1–3 weeks. Egzakta's calendar is UNKNOWN.
- **Sensitivity:** if calculated using the classic column, G2 is 16–28 weeks, G3 (a) 23–39, and (b) 26–45. Until the F1 retrospective measures AI throughput, the real uncertainty is G2 11–28 and G3 16–45 weeks.
- Waiting time for ratifications (RAT-02, RAT-03, indirectly RAT-04) is not included in the ranges. Every day of waiting shifts G2 and G3 1:1 (Delivery §3, §6.1).
- **The public G3 date is UNKNOWN.** Authenticode, Deep Security and CASA (if Gmail is pursued) are added at the end and have no evidence of duration.

**Freezes (Delivery §5):** F1 at the end of G1 (I + P + R, planned 3–5 wd), F2 at the end of G2 (R + P + A + C + internal I, 4–7 wd), F3 at the end of G3 (full I + R + P + A + C + Authenticode + Deep Security, 5–8 wd), and F4 is a contingency. A receipt from `e4bf403e`, `b07a6173` or `c4e6a515` **does not cover** `2af0904d`. — CONFIRMED AT REVISION (F-REL-02).

---

## 6. First 10 working days

The order is taken from the G1 graph and the ordering constraints in [Delivery §3](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) and from the W0 table in §2. The day-by-day schedule is a **PROPOSAL of the order**, not a new estimate; the ranges from §5 apply. Backlog tickets are PR IDs from Delivery §2 (`W0-PR0..PR19`, `WB-PR1/PR2`, `OSS-PR1/PR2`, `W8-PR1`). The cards are in [03-BACKLOG.md](03-BACKLOG.en.md) (G1 full cards in §3, sprint 1 PROPOSAL in §6), and the same tickets for import into a tracker are in [backlog.csv](backlog.csv). Files, the tests the PR changes and finding status are in the W0 table, so they are not repeated here. Every PR ID from the "Ticket / source" column has a full card in [03-BACKLOG.md](03-BACKLOG.en.md) §3: goal, scope, RED test, acceptance, evidence, risks, rollback and estimate. DoR/DoD is in 03 §0, and the sprint 1 PROPOSAL in 03 §6.

**Steps 1–2 can start immediately. All other steps wait for the founder's explicit approval of the delivery plan.**

| # | When (indicative) | What | Ticket ([cards: 03 §3](03-BACKLOG.en.md)) / source | Done when |
|---|---|---|---|---|
| 1 | Day 1 | Reading per §3 (Day 1). Access to the repo and the package. Node `22.23.2` (`fnm use 22.23.2`; better-sqlite3 ABI 127), check `node -v`. Read-only confirmation of the baseline in the checkout the team has access to ([01 §0.1](01-ONBOARDING-DEV-ENV.en.md) pt.1 and pt.3; without `npm ci`, build and tests, §2): `git rev-parse origin/main` = `2af0904d…`. If it differs, the rule below the table applies. | checklist "Before every PR"; DP-0.01 | Everyone has read the checklist and has no unclear items. `origin/main` = `2af0904d`, or the difference has been escalated to the founder. |
| 2 | Day 2 | Reading per §3 (Day 2). **Isolation check without starting servers.** Prepare the env template per the checklist sections "Env isolation" and "External writes disabled": `WAGGLE_DATA_DIR`, `WAGGLE_PORT≠3333`, `PORT≠3100`, `WAGGLE_DESKTOP_PORT_FALLBACK` unset, `HIVE_MIND_DATA_DIR`, `WAGGLE_E2E_*`, `HOME`/`USERPROFILE`/`HERMES_HOME` set to a scratch profile, `WAGGLE_SIGNAL_EMIT=0`, no Stripe/channel/Clerk/PostHog keys. Check that the founder's instance is not listening on 3333. List the questions for the founder (the "Questions before start" entry below). Assign the DP-0.14 roles to people (Harness, Chat, Durable, Memory, Server, Boundary, Capability, Security, External-executor, Evolution, Model/Runtime, UX, Attention, Channels, Benchmark, Release, OSS/License owner). | DP-0.08, DP-0.10, DP-0.14 | The env template has been reviewed. Names per role are recorded (assignment to people: UNKNOWN). |
| — | **Gate** | **The founder approves the delivery plan (start of implementation).** Without this, nothing proceeds. | §2 of this file | Written approval from the founder exists. |
| 3 | Day 3 | Create `integration/waggle-next` from `2af0904d` in **your own new worktree** (not in `D:/Projects/waggle-os`). **First PR: CI for the integration branch** — `integration/**` in `on.push.branches` and `on.pull_request.branches` in `.github/workflows/ci.yml` (today `ci.yml:3-6` = only `[main]`, CONFIRMED AT REVISION 29.09.2026) and in `tauri-build-pr.yml`. `release.yml` is not touched. | **W0-PR0**; DP-0.04, DP-0.07 | CI triggers on a PR to `integration/waggle-next`. |
| 4 | Day 3–4 | Open 4 parallel agent worktrees from the integration branch: **Harness / Memory / Boundary+Release / Durable-probe**. Branches are named `w0/<tema>` (e.g. `w0/harn-01-verify-default`). The rule is one task per branch and one worktree per agent. | Delivery §3 (G1); DP-0.05 | `git worktree list` contains only allowed new entries (checklist). |
| 5 | Day 3–5 | **Golden legacy fixture** (generated by the code of revision `2af0904d`, determinism = same SHA-256). Merge **before** W0-PR6 and W0-PR18. ⚠ The checklist allows only worktrees from `integration/waggle-next`, but this generator requires a worktree at `2af0904d`. Before starting, request explicit founder permission (open LOW finding). | **W0-PR19**; MIG §6 pt.2, MIG-00.7 | The fixture and SHA-256 are in `tests/fixtures/legacy-datadir/` (exact path UNKNOWN until design). |
| 6 | Day 4–7 | **Harness lane, W0 RED tests first** (DP-0.15: RED fails on the baseline, then minimal GREEN). Serial critical sequence (3–4 wd): **W0-PR1** (verify fail-closed) → **W0-PR7** (`runId` in events) → **W0-PR8** (self-reported evidence) → **W0-PR9** (persona shadowing + F-EVO-10 in the same PR). Then W0-PR2/PR3 (after PR1), W0-PR4, W0-PR5, then W0-PR6 (after PR7 and PR19). Rewrite the pinning tests listed in the W0 table in the same PR, never silently. | **W0-PR1..PR9**; AT-01, AT-02, AT-03 (part), AT-04 minimum, AT-06 (part) | Every PR has RED→GREEN evidence in its description. |
| 7 | Day 4–8 | **Memory lane:** **W0-PR10** (hook read path trio in `hive-mind-core`, with a record for the `oss-drift-baseline.json` review) → **W0-PR11** (leak in 4 places + redefinition of the fleet policy gate; sentinel AT-13) → **W0-PR18** (MIG-05(i) reclassification; after PR11 and PR19; only on a copy of the dataDir, with snapshot + `manifest.json` and a Class A rollback test). | **W0-PR10, PR11, PR18**; AT-13, AT-14 (part), AT-19 (part); DP-0.09 | The sentinel from Workspace A is not in the personal or Workspace B recall; the second migration pass is a no-op. |
| 8 | Day 4–8 | **Boundary+Release lane:** **W0-PR12** (de-gate Approvals in 3 nav places + `cost.ts` + audit-export; tripwire `tier-enforcement-matrix.test.ts`), **W0-PR13** (pricing, with a re-check of prices at merge), **W0-PR15** (doc drift, without sentences about visibility/license — DQ-02), **W0-PR17** (telemetry switch and disclosure). In parallel, independent of W0: **WB-PR1** (inventory + review of ADR-08/09) → **WB-PR2** (only the KVARK RED test `it.fails`), **OSS-PR1/PR2** (inventory and license lint in report mode, without changing the LICENSE/NOTICE text), **W8-PR1** (npm/pwsh entry points for the router/canary receipt + receipt manifest, without a logic change). | **W0-PR12, PR13, PR15, PR17; WB-PR1, WB-PR2; OSS-PR1, OSS-PR2; W8-PR1**; AT-12/AT-18 (part), AT-27 config (part) | Gates are green; no LICENSE/NOTICE text has been changed. |
| 9 | Day 4–6 | **Durable-probe lane:** **W0-PR14**, RED repro of the `getDue` hypothesis (ISO with `T` versus `datetime('now')`). Fix only if the hypothesis is confirmed. | **W0-PR14**; AT-23 (part); F-DUR-10 = AUDIT FINDING — TO VERIFY | Repro report: confirmed or refuted, with a test. |
| 10 | Day 8–10 | Remaining W0: **W0-PR16** (Stop/disconnect copy). Integration doc-only PR (ID reconcile). Rebase/merge feature branches onto the integration branch at least once a day. All DP-0.06 gates green on the integration branch: `npm run build:packages` · `npm run typecheck:server-tests` · `npm run lint` · `npm run test -- --run --maxWorkers=6`. **F1 preparation**, without starting paid runs: F1 requires ODB-01 (P/R accounts and budget), a dedicated VM or a disposable Windows account for `certify-windows-installer.ps1`, and RAT-01 before G1 is closed. | W0-PR16; G1 exit (h), (k), (l), (m); Delivery §5 F1, §6.1 | The integration branch is green; F1 prerequisites are listed with an owner. |

**If `origin/main` differs from `2af0904d`** (e.g. a founder or dependabot merge before approval), the baseline from the checklist ("Baseline (immutable)": `main` = `2af0904d…`, `HEAD == origin/main`) and DP-0.01 no longer hold. Work **stops**, and the question goes to the founder through [05](05-RISKS-DECISIONS-ESCALATION.en.md) before step 3. The team does not choose a new base on its own.
- **Integration branch base:** DP-0.04 and the checklist (PROPOSAL) say `2af0904d`. Whether `integration/waggle-next` is still cut from `2af0904d` or from the new `origin/main` is decided by the founder (UNKNOWN).
- **Preparation for the decision:** a read-only list `git diff --name-only 2af0904d origin/main` from the checkout from step 1.
- **Re-check:** every phase-A finding, `path:line` from 03/04 and pin test whose file is on that list is re-checked on the new HEAD before use in a PR ([v1.2-evidence/README](../plans/v1.2-evidence/README.en.md), "Snapshot, not the current truth").

**Questions for the founder before start** (the only canonical list; letters (a)–(o) are stable IDs referenced by 01, 02, 04 and 05, so new questions are appended at the end, without renumbering; they go through [05 §5.0 and §5.5](05-RISKS-DECISIONS-ESCALATION.en.md)):
- (a) approval of the delivery plan;
- (b) an exception for a `w0/*` worktree at `2af0904d` for W0-PR19 ([OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md), SAFE checklist row);
- (c) whether the team works on the founder's machine or on its own clones. DP-0.02/DP-0.03 (9 existing worktrees, 2 stashes) are tied to the founder's machine; which host the work is done on is UNKNOWN;
- (d) the status of the docs worktree `D:/Projects/waggle-v12-handoff` (`docs/waggle-v1.2-planning`). It is the 10th entry in `git worktree list` (CONFIRMED read-only 29.09.2026), while the checklist lists 9 existing ones and does not mention it;
- (e) the deadline for DQ-04 and DQ-05 (recommendation: before G2);
- (f) who gives ODB-01 for F1;
- (g) the status of the 12 MED findings of the last critique round: whether they are resolved in the package and where that is recorded (§2; the package does not list them);
- (h) how and when the untracked v1.2 package (PRD/FRD/ADR, branch `docs/waggle-v1.2-planning`) is committed or brought into `integration/waggle-next`. That branch is created from `2af0904d`, where PRD/FRD/ADR v1.2 do not exist (§1). The question blocks WB-PR1 (table inventory in the FRD + review of ADR-08/09, Delivery §2 WB) and the ID-reconcile doc-only PR (FRD §16.1 ↔ PRD v1.2 ↔ Delivery §7). It is also gate 4 "Before day 1" in [03 §6](03-BACKLOG.en.md) and N-07 in 03 §7;
- (i) DOCX re-export of the PRD/FRD with the same `pandoc` command and update of the hashes in Delivery §6.1 and OD-9 (doc-only). **Done 29.09.2026** in the docs worktree, without changing the `.md` text; the "Handoff condition" from §6.1 is met (§1, "DOCX is current"). The founder reviews it together with the whole package; letter (i) is kept for stable references;
- (j) the order of precedence between `AGENTS.md` (with `CLAUDE.md`), the checklist and DP-0.01..DP-0.16, the Delivery plan, the FRD and this handoff, including the known conflicts with `AGENTS.md` §4 (what a "phase" is and who gives "approval"; W0-PR9 and W0-PR12 do not start until answered) and §3.8 (the founder's personal handoff paths). Until answered, the interim rule from [02 §0](02-WORKING-AGREEMENT.en.md) ("Order of precedence") applies. It is sent together with (a) (§3 of this file);
- (k) who approves and who merges into `integration/waggle-next`: whether founder review is mandatory for every PR, who performs the merge and who approves when the author is also the role owner. It is sent together with (a) ([02 §7](02-WORKING-AGREEMENT.en.md));
- (l) ESK-01..ESK-03: the tech lead's name, the escalation channel to the founder with the expected response time, and who assigns the DP-0.14 roles to people. They are requested together with (a); without role names, DoR blocks every PR ([05 §5.0](05-RISKS-DECISIONS-ESCALATION.en.md); 02 §8; 03 §0);
- (m) whether the Harness owner co-approves merges of the chat hotspot (`chat.ts` + `chat-*.ts`): DP-0.14 says `Harness/Chat owner`, while the W0 rows say only Chat owner. This must be resolved before the first merge of W0-PR8, W0-PR9 or W0-PR11 ([02 §3](02-WORKING-AGREEMENT.en.md), [04 §2](04-CODEBASE-MAP.en.md));
- (n) who gives a new team member access to the repo (repo visibility: `CLAUDE.md:84`/`AGENTS.md:68` say private, the live check on 27.09.2026 says public — AUDIT FINDING — TO VERIFY, DP-0.13) and how the package reaches the team on a host that is not the founder's machine, together with (c), (d) and (h) ([01 §3.2](01-ONBOARDING-DEV-ENV.en.md), §0.1 pt.5);
- (o) whether, before approval of the plan, the team may create a separate fresh clone on its own machine (detached `2af0904d`, no push) and run `npm ci`, `npm run build:packages`, tests and repro scripts in it (§2, §3). Until answered: no.

G1 does not finish in 10 days. The whole of G1 takes 3–5 weeks, including the F1 cycle of 3–5 wd and serial review.

---

## 7. What is decided and what is open

**Decided: DECISION D-01..D-18** (brief §3; closed, **not to be reopened**; the full text and consequences are in [brief §3](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.en.md), and the map to disposition rows is in [Disposition §0.1](../plans/WAGGLE-AUDIT-DISPOSITION-v1.2.en.md)):

| ID | Decision |
|---|---|
| D-01 | Waggle is free/open-source for the individual (no paywall for memory, harness, skills, basic evolution, approvals, routines). |
| D-02 | Waggle = me; KVARK = us. There is no separate Waggle Team/Enterprise product. |
| D-03 | KVARK remains exclusively on-prem; there is no cloud fallback in KVARK mode. |
| D-04 | Desktop-first/local-first; Windows/Tauri is primary; cloud convenience is a later phase. |
| D-05 | BYOK remains; the product shows where data goes. |
| D-06 | Knowledge work is the primary job; coding is supported, but it is not the identity. |
| D-07 | Home is preserved, not redesigned from scratch. |
| D-08 | The Workspace is the central object; chat lives inside the Workspace. |
| D-09 | Technical agents stay below the surface; advanced access remains. |
| D-10 | Skills and connectors are used inline; OAuth and secrets are not handled in LLM text. |
| D-11 | External executors (Claude Code/Codex/Hermes) are an optional capability; the result returns to the same Workspace. |
| D-12 | Hive Mind remains the memory foundation; retrieval and isolation are preserved, without rewriting the engine. |
| D-13 | Evolution is part of the product thesis: candidate execution, evaluation, activation, rollback. |
| D-14 | Long-running work and routines are part of the product. |
| D-15 | The reference target is the Qwen 3.8 27B class; the older model is the control baseline. |
| D-16 | Fusion is not in this scope (no council/5-hats/agent-fusion). |
| D-17 | BORROW → ADAPT → BUILD. |
| D-18 | The benchmark is key evidence, not decoration; the test is not designed so that Waggle must win. |

**Open** (ID only; the authoritative text, recommendation and impact are at the links):
- **Decision queue DQ-01..DQ-09** (founder; [Delivery §6](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) is authoritative, PRD §17 `O-1..O-9` = DQ-01..09): DQ-01 naming/GO · DQ-02 license · DQ-03 subscribers · DQ-04 benchmark budget · DQ-05 model/hardware · DQ-06 mail/calendar · DQ-07 mobile · DQ-08 UI language · DQ-09 thresholds/modes.
- **Ratifications and approvals RAT-01..RAT-09, ODB-01, ODB-02** (founder; [Delivery §6.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md)), together with the PR before whose merge they must arrive.
- **Sub-lists**, which do not redefine DQ: `MDQ-01..12` ([Migrations §7](../plans/WAGGLE-MIGRATIONS-v1.2.en.md)), `Q-00..Q-10` ([Benchmark §15](../plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.en.md)), `Q1..Q6` ([BvB §6](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.en.md)). Most are engineering decisions of the role owner.
- **Package inconsistencies:** [OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md).
- **UNKNOWN registers:** [BvB §7](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.en.md), [Benchmark §18](../plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.en.md), [ADR-INDEX §4](../decisions/ADR-INDEX.en.md), [SUMMARY "Biggest UNKNOWNs"](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.en.md).

Rule: an open question never carries the DECISION label. It is written as "open — DQ-nn (founder)" or "open — engineering decision of the owner (role)" (Delivery, "How to read statuses").

---

## 8. Absolute prohibitions

They apply **without exception until the founder explicitly approves the specific action**. The authoritative list is in the [SAFE-IMPLEMENTATION checklist, "Absolute prohibitions"](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md) and in DP-0.11/DP-0.12. This is only an overview:

- **No merge into `main`.** All branches target `integration/waggle-next`. A merge into `main` is a founder-gated step, only after the F3 receipts.
- **No force-push.**
- **No `git tag v*` and no pushing of tags.** `release.yml:12-15` triggers on any `v*` tag, so a tag would start the release pipeline. `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` stays undefined.
- **No release, publication, attestation, or local signing of a release artifact.**
- **No replacing the installed application on the founder's machine.** Installer, packaged, crash-injection and migration tests against a packaged build are run only on a dedicated VM or a disposable Windows account. Any "Refusing …" rejection by a script stops the work.
- **No external writes:** no real email or message, no channel tokens, no marketplace install of an unverified binary, `WAGGLE_SIGNAL_EMIT=0`, tests do not touch `~/.waggle`, hook tests do not touch the real `~/.claude`/`~/.codex`/Hermes config. A run with a real account or a paid API proceeds only with ODB-01 or DQ-04 approval for that run, with a cap.
- **No Stripe/billing actions,** cancellations, refunds, or changes to www pricing before DQ-01/DQ-03.
- **No change to repo visibility, the license, or the NOTICE text** (before DQ-02). No changes to GitHub repo/org settings and no manual workflow runs.
- **Existing worktrees and stashes must not be touched:** no `prune`/`remove`, no `stash pop/drop/apply`.
- **No Fusion/council/5-hats surface** (DECISION D-16; the PR is rejected at review).

---

## 9. Contact and escalation

**The decision owner is the founder** (Marko Marković, Egzakta Group; `CLAUDE.md` signature). He approves the plan, DQ-01..DQ-09, RAT-01..RAT-09, ODB-01/ODB-02 and every exception to §8. The channel and expected response time are UNKNOWN. Details and question templates are in [05-RISKS-DECISIONS-ESCALATION.md](05-RISKS-DECISIONS-ESCALATION.en.md).

| Question type | Goes to | Reference |
|---|---|---|
| Product decision from D-01..D-18 | Not reopened: closed. The question is reformulated as implementation of the decision. A conflict between code or a finding and D-nn is recorded and reported to the founder for information (a report, without reopening; 02 §10 pt.3, 05 §5.3). | brief §3 |
| Decision queue item | Founder | Delivery §6 (DQ-01..09) |
| Ratification of an ADR / the G structure; paid run; scope of W3e-PR9 | Founder | Delivery §6.1 (RAT-01..09, ODB-01, ODB-02) |
| Exception to a prohibition or the checklist (e.g. W0-PR19 worktree) | Founder, in writing, before the action | checklist; DP-0.11 |
| Engineering decision within a role (e.g. MDQ-07, timezone field ADR-07 O4, Q1/Q6) | Role owner from DP-0.14 | Delivery DP-0.14; Migrations §7 |
| Merge into a hotspot file | Merge owner (role); no two hotspot merges on the same day without an integration test (what that test is: UNKNOWN, and until the tech lead decides there is no second merge of the same hotspot on the same day, [02 §3](02-WORKING-AGREEMENT.en.md)) | DP-0.14; checklist |
| Change in `packages/hive-mind-core/src/**` | Memory owner + maintainer review of the drift baseline; never directly on the mirror | `CLAUDE.md` §7.5 |
| External gates (Authenticode, Deep Security, CASA, GitHub settings) | Founder / repo owner, through W8; not a PR or an agent action | Delivery §2 W8; ADR-10-O8 |
| Error or inconsistency in the package | The lead records it, the founder decides; the package is not changed silently | OPEN-LOW-FINDINGS |
| Finding that is not in the package (new defect) | RED test + status AUDIT FINDING — TO VERIFY, then lead → founder if it changes scope or G | DP-0.15 |

---

## Sources

[Delivery plan v1.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) §0 (DP-0.01..DP-0.16), §1, §2 W0/WB/OSS/W8, §3, §4.2, §4.3, §5, §6, §6.1 · [SAFE-IMPLEMENTATION checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md) · [SUMMARY for the founder](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.en.md) · [PRD v1.2](../Waggle_PRD_v1.2_DRAFT.en.md) §1 · [FRD v1.2](../Waggle_FRD_v1.2_DRAFT.en.md) §15 · [ADR-INDEX](../decisions/ADR-INDEX.en.md) · [brief §3](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.en.md) · [OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md).

Read-only checks for this file (29.09.2026, at `2af0904d`):
- `git rev-parse HEAD`;
- `git status --porcelain`;
- `git worktree list`;
- `git stash list`;
- `.github/workflows/ci.yml:1-6`;
- `package.json` (`engines.node >=22.19.0`, scripts `build:packages`, `typecheck:server-tests`, `lint`, `test`, `persona:seal`);
- `node docs/plans/v1.2-evidence/tools/check_trace.mjs docs` (exit 0);
- `sha256sum docs/Waggle_{PRD,FRD}_v1.2_DRAFT.{md,docx}` against Delivery §6.1 after the re-export on 29.09.2026 (all four hashes match); `unzip -p docs/Waggle_{PRD,FRD}_v1.2_DRAFT.docx word/document.xml | grep` for `out/`, `scratchpad/` and `v12-planning-staging/` (0 hits);
- grep `out/`, `phaseA/`, `scratchpad/` over PRD/FRD/Delivery/MIG/BvB/Benchmark/ADR-INDEX (0 hits except `…/scratchpad/wt202`);
- `git cat-file -e 2af0904d:docs/Waggle_PRD_v1.2_DRAFT.md` and `…:docs/decisions/ADR-INDEX.md` (they do not exist at `2af0904d`).

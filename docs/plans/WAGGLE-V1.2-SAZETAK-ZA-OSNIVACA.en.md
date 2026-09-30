# Waggle v1.2 — founder summary (29.09.2026)

> **English translation** of [WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md](WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision: 1.2.1 DRAFT · 30.09.2026 · final closure (H-01..H-12)**

Changes in 1.2.1: H-01/H-02 — package identity and hashes → manifest; "What has NOT been done" refreshed (commits, push to the public `origin`; the old text of 29.09.2026 is in [HANDOFF-HISTORY](v1.2-evidence/HANDOFF-HISTORY.en.md) §2) · H-03 — "Last critique round and findings status" · H-04 — proposal [TEAM-START-AUTHORIZATION](../handoff/TEAM-START-AUTHORIZATION.en.md) (NOT APPROVED) · H-05 — dataDir isolation defect (W0-PR20) · H-07 — DQ-09 · H-10 — ODB-02 with a recommendation · H-12 — reference dates and the first-month frame (Estimate, "Dates"). This revision is not an approval of implementation; the DQ/RAT/ODB statuses do not change with it.

## Handoff to the development team

The entry point for the tech lead, developers and QA is [`docs/handoff/00-START-HERE.md`](../handoff/00-START-HERE.en.md) (and `00-START-HERE.docx` next to it): package identity, what the team may do today, what awaits approval, work order, first 10 working days and escalation; the package map and SHA-256 values are in the [manifest](WAGGLE-V1.2-PACKAGE-MANIFEST.en.md). The same folder contains `01-ONBOARDING-DEV-ENV.md`, `02-WORKING-AGREEMENT.md`, `03-BACKLOG.md` (+ `backlog.csv`), `04-CODEBASE-MAP.md` and `05-RISKS-DECISIONS-ESCALATION.md`.

- **Implementation is not approved.** Coding begins only when the founder approves the delivery plan in writing (question (a) in 00 §6). Until then, the team only reads the package and the repo and prepares their machines.
- **The proposed team operating model** is [TEAM-START-AUTHORIZATION](../handoff/TEAM-START-AUTHORIZATION.en.md) (TSA-01..TSA-10): tech lead and merge into `integration/waggle-next`, review and a second reviewer for security/migrations, an isolated onboarding clone, a baseline fixture worktree, cleanup of one's own worktrees, PR size, the hotspot test, CI re-run and the handoff channel. Status: NOT APPROVED. It does not apply before the founder's written confirmation, and even then it is not an approval of the delivery plan.
- **After approval, the [SAFE-IMPLEMENTATION checklist](SAFE-IMPLEMENTATION-CHECKLIST.en.md) is mandatory** for every PR, agent and session; any "no" stops work.
- Plan approval does not include RAT-01..RAT-09, ODB-01/ODB-02 or DQ-01..DQ-09. Decisions D-01..D-18 are closed and are not reopened.
- The package identity (`code_baseline_sha` `2af0904d`, `planning_package_sha` `2758f4e5`, translation `fc0a7b3f`, uncommitted closure revision 1.2.1) and the valid file SHA-256 values are in the [package manifest](WAGGLE-V1.2-PACKAGE-MANIFEST.en.md); earlier hashes are in [HANDOFF-HISTORY](v1.2-evidence/HANDOFF-HISTORY.en.md).

---

**What the package is.** Planning package v1.2 DRAFT on `main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (repo read-only). It contains the PRD and FRD v1.2 (`.md` + DOCX, with SHA-256 hashes); the Delivery plan with waves W0–W8/W3e/WB/OSS/B1–B3, milestones G1 → G2 → G3 and the SAFE-IMPLEMENTATION checklist (Appendix A); the disposition of C1–C22 / A1–A29 / R01–R24, Build-vs-Borrow, the benchmark protocol and migrations MIG-00..09; 10 draft ADRs with an index, and AT-01..AT-30, each with a location, fixture, environment, owner and milestone.

Everything is a PROPOSAL. No ADR, threshold, date or G structure has been approved. Decisions D-01..D-18 have not been reopened.

## Estimate (Delivery plan §4 — expert range, not P50, no flat AI discount)
| | AI-orchestrated eng-days | Classic eng-days | Calendar, cumulative (without breaks) |
|---|---|---|---|
| G1 | 11–16 | 22–30 | 3–5 weeks → 18.10.2026 – 01.11.2026 |
| G2 (increment) | 87–121 (cum. 98–137) | 177–245 (cum. 199–275) | 11–18 weeks → 13.12.2026 – 31.01.2027 |
| G3 (increment) | 37–53, with W3e-PR9 41–60 (cum. 135–190 / 139–197) | 75–108.5, with W3e-PR9 83–122.5 (cum. 274–383.5 / 282–397.5) | (a) B3 in parallel: 16–27 weeks → 17.01.2027 – 04.04.2027 (with W3e-PR9 and T_evo before B3 on the same machine: 16–28 → 11.04.2027); (b) B3 serial: 18–30 weeks → 31.01.2027 – 25.04.2027 (with the T_evo placeholder 18–32 → 09.05.2027) |

- **Dates.** Dates are the end of the n-th calendar week from the reference point T_ref = 27.09.2026 (Sunday), not a work deadline. The last working day of that week is Friday. The actual calendar starts at T0, the first working day after the written approval of the plan and the other start gates ([Delivery §4.4.1](WAGGLE-DELIVERY-PLAN-v1.2.en.md)); dates are not computed retroactively. The S1 range "12–17 weeks" amounts to 20.12.2026–24.01.2027 and is not a new agreement.
- **Breaks are not included in the ranges.** The basis is a PROPOSAL: RS public holidays and an assumed company closure on 24–31.12; the Egzakta calendar is UNKNOWN. The breaks are 11.11.2026 (1 wd), 24.12.2026–07.01.2027 (8 wd), Sretenje (Statehood Day) 15–16.02.2027 (2 wd) and Uskrs/Praznik rada (Easter/Labour Day) 30.04–04.05.2027 (3 wd). With them: G2: 11–20 weeks (until 14.02.2027); G3 (a): 18–29 weeks (31.01–18.04.2027); (a') with T_evo: 18–31 (until 02.05.2027); G3 (b): 19–33 weeks (07.02–16.05.2027); with PR9: 20–33; with T_evo: 20–35 (until 30.05.2027). Every boundary after 24.12.2026 shifts by +1–3 weeks.
- **Sensitivity to the classic column.** If the classic column is used instead of the AI column, G2 is 16–28 weeks, G3 (a) 23–39, and G3 (b) 26–45. Until the F1 retrospective measures AI throughput, the actual uncertainty is G2 11–28 and G3 16–45 weeks.
- **First month from T0 and capacity (Delivery §4.4, PROPOSAL).**
  - The first-month goal is the G1 internal candidate (F1) with three demonstrations in an integrated build: the vertical, interrupt/block, and evolution activation in G1 scope. If G1 trends toward the upper bound, F1 moves into week 5.
  - The benchmark-ready candidate (F2), the public-ready artifact (signed `A_sig` after F3b) and the public release (GO) are not first-month goals.
  - Rough check: 135–190 AI eng-days ÷ 20 wd = 6.75–9.5 fully productive equivalents; with W3e-PR9 139–197 → 6.95–9.85. This is not an estimate. Agents are not FTEs, and the serial summands of G1–G3 alone amount to 73.2–120 wd.
  - The actual schedule is confirmed by the tech lead in week 1.
- **The public G3 date is UNKNOWN.** Authenticode, Deep Security and CASA (if Gmail is pursued) are added at the end and have no duration evidence.

## Main confirmed defects on `2af0904d` (CONFIRMED AT REVISION)
- **F-HARN-01/02/03/05:** verify is skipped by default and in `catch`; `VERDICT: FAIL` passes the regex; every bash call (including `echo`) passes as a test, and the exit code is ignored; a budget stop turns off verification (AT-01..AT-03).
- **F-HARN-06/08:** the trace bridge writes `verified` and `ok:true` without evidence; the gates read the `tool_calls` reported by the model, not the server-side journal.
- **F-EVO-01/05:** the evolved persona override shadows the built-in persona, and the winning EvolveSchema is used neither in execution nor in deploy (AT-04/AT-05).
- **F-DUR-01/13:** a restart marks all active runs as `interrupted`, and a server-driven phase executor does not exist (AT-07).
- **F-DUR-06 (weakened by the refute):** closing the SSE socket aborts the run, so there is no detach (AT-10).
- **F-HM-05:** the workspace run summary is copied into the personal mind in four places. This is a scope leak (AT-13).
- **F-TK-02 / F-TK-11:** Approvals is TEAMS-hidden only in the navigation; `createKvarkTools` has no production caller.
- **F-UXM-02/06:** readiness produces false positives; the target Qwen model is not on any production path.
- **F-REL-04 / F-REL-06:** there is no SBOM and no THIRD_PARTY_NOTICES; the Opus price in `cost-tracker.ts` is incorrect.
- **dataDir isolation (05 N-28, H-05):** `documents.ts:37`, `pins.ts:32` and several other places write under `os.homedir()/.waggle`, bypassing `WAGGLE_DATA_DIR` (confirmed by reading the code; not reproduced at runtime). The fix is W0-PR20 with a sentinel test; the code has not been fixed. Until then, sidecar/E2E runs go only in the safe test profile (SAFE checklist, BTP); a scratch `HOME`/`USERPROFILE` is not a sandbox.

## Biggest UNKNOWNs
AI throughput (the ≈0.48× ratio is an estimate from S1, not measured); founder review capacity (~3 PR/day); B3 wall-clock (placeholder 10–20 wd) and T_evo (1–8 wd); whether any actual Stripe subscribers exist; the duration of the Authenticode / Deep Security / CASA steps; a test machine for the F1 receipt; repo visibility (the live state is public, while the documents say private; AUDIT FINDING — TO VERIFY; repeated 30.09.2026: the package is on the public `origin`, and the decision on the intended distribution and the handoff channel awaits the founder, H-01).

## Decision queue (Delivery §6; recommendations are PROPOSAL)
- **DQ-01 Public naming/GO:** name and version number only after the F3 comparison; until then "controlled preview".
- **DQ-02 License:** a single decision on ownership and the final LICENSE/NOTICE texts, together with the OSS-excluded boundary.
- **DQ-03 Subscribers:** a read-only Stripe inventory before any WB-PR5 migration.
- **DQ-04 Benchmark budget:** a cap for the LoCoMo rerun (merge gate for W2-PR3), B2-PR0/B2, B3 and GEPA fidelity.
- **DQ-05 Model/hardware:** `Qwen/Qwen3.8-27B` Q4_K_M, Ollama repin and priority test devices.
- **DQ-06 Mail/calendar:** Microsoft Graph as the first ecosystem, or Gmail with a BYO OAuth pilot.
- **DQ-07 Mobile:** Telegram as the only G3 channel, with token-bound approve/deny.
- **DQ-08 UI language:** English-only first release, with centralized strings.
- **DQ-09 Thresholds/modes:** latency, quality and classifier thresholds and the CONDITIONAL policy for `work · normal`, locked before B3/F2. The outcomes for `strict`/`benchmark` are not subject to choice: a mandatory gate must have a PASS (FRD-05.9).
- **RAT-01..RAT-09:** ratification of the G structure and ADR-01..10 before the named merges (§6.1).
- **ODB-01:** paid receipt runs.
- **ODB-02:** scope of W3e-PR9 (bounded recipe evolution). Recommendation (PROPOSAL): yes, in G3 (option A); AWAITING FOUNDER DECISION. Options, schedule, B3 candidate and the permitted claim: Delivery §6.1 "ODB-02 — options"; a result without the recipe layer is not evidence of its contribution (Benchmark BP-MSG-01).
- **TEAM-START-AUTHORIZATION and the handoff channel (H-04, H-01):** confirmation or rejection of items TSA-01..TSA-10, including `<ODOBRENI_TIMSKI_REMOTE>` (TSA-09); NOT APPROVED.

## What has NOT been done
No code was written or changed. The only git actions on the package are the docs-only commits `2758f4e5` (package) and `fc0a7b3f` (translation, local) and the push of branch `docs/waggle-v1.2-planning` at `2758f4e5`, performed by the founder (reflog 30.09.2026 00:04:18 +0200); closure revision 1.2.1 has not been committed. The repo is public, so the package is publicly readable; the intent of public distribution and the handoff channel to the team await the founder's decision (START-HERE §6 (n), H-01). There was no tag, merge or release. No E2E, installer, receipt or benchmark runs were executed. There were no Stripe actions and no paid API calls. Existing worktrees and stashes were not touched. The text of this section as of 29.09.2026 is in [HANDOFF-HISTORY](v1.2-evidence/HANDOFF-HISTORY.en.md) §2.

## Last critique round and findings status
The planning package went through the rounds `planning-pass` (r1, r2), `critique-continue` (r2–r4) and `finish/f1`, and the handoff documents 00–05, `backlog.csv` and the PR template then went through the rounds `handoff/r1` and `handoff/r2`. In total 459 findings (32 HIGH, 190 MED, 237 LOW) and 67 fixer reports; they are kept in `docs/plans/v1.2-evidence/findings/`. The last planning round `finish/f1` had 0 HIGH, 12 MED and 26 LOW: the MED were sent to the fixer, and the LOW were intentionally left without a new loop. The status of each item is in the registry `docs/plans/v1.2-evidence/findings/FINDINGS-DISPOSITION.csv`; the rules, blocker classes (handoff blocker / ticket blocker / non-blocking), the table of 12 MED and the list of ticket blockers are in `docs/plans/WAGGLE-V1.2-CLOSURE-RECORD.md`, H-03. The LOW registry of round `finish/f1` is `docs/plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md`. No finding was declared closed on the basis of an aggregate count or a founder confirmation; the founder decides only the items "awaiting an actual founder decision". The earlier statement "17 open, 8 resolved" mixed table rows and findings (correction: `docs/plans/v1.2-evidence/HANDOFF-HISTORY.md` §6).
The final completeness check on 29.09.2026 added two elements: a definition of "test location" in FRD §15, after which the FRD DOCX was re-exported and the hashes were updated; and the SAFE-IMPLEMENTATION checklist condition in the exit criteria of all 13 waves.

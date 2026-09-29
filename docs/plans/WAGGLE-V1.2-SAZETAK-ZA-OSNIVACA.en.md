# Waggle v1.2 — founder summary (29.09.2026)

> **English translation** of [WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md](WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

## Handoff to the development team

The entry point for the tech lead, developers and QA is [`docs/handoff/00-START-HERE.md`](../handoff/00-START-HERE.en.md) (and `00-START-HERE.docx` next to it): status, reading order, package map, first 10 working days, absolute prohibitions and escalation. The same folder contains `01-ONBOARDING-DEV-ENV.md`, `02-WORKING-AGREEMENT.md`, `03-BACKLOG.md` (+ `backlog.csv`), `04-CODEBASE-MAP.md` and `05-RISKS-DECISIONS-ESCALATION.md`.

- **Implementation is not approved.** Coding begins only when the founder approves the delivery plan in writing (question (a) in 00 §6). Until then, the team only reads the package and the repo and prepares their machines.
- **After approval, the [SAFE-IMPLEMENTATION checklist](SAFE-IMPLEMENTATION-CHECKLIST.en.md) is mandatory** for every PR, agent and session; any "no" stops work.
- Plan approval does not include RAT-01..RAT-09, ODB-01/ODB-02 or DQ-01..DQ-09. Decisions D-01..D-18 are closed and are not reopened.
- The PRD and FRD DOCX were re-exported on 29.09.2026 after path normalization; the valid SHA-256 values are in Delivery §6.1 and Disposition OD-9.

---

**What the package is.** Planning package v1.2 DRAFT on `main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (repo read-only). It contains the PRD and FRD v1.2 (`.md` + DOCX, with SHA-256 hashes); the Delivery plan with waves W0–W8/W3e/WB/OSS/B1–B3, milestones G1 → G2 → G3 and the SAFE-IMPLEMENTATION checklist (Appendix A); the disposition of C1–C22 / A1–A29 / R01–R24, Build-vs-Borrow, the benchmark protocol and migrations MIG-00..09; 10 draft ADRs with an index, and AT-01..AT-30, each with a location, fixture, environment, owner and milestone.

Everything is a PROPOSAL. No ADR, threshold, date or G structure has been approved. Decisions D-01..D-18 have not been reopened.

## Estimate (Delivery plan §4 — expert range, not P50, no flat AI discount)
| | AI-orchestrated eng-days | Classic eng-days | Calendar, cumulative (without breaks) |
|---|---|---|---|
| G1 | 11–16 | 22–30 | 3–5 weeks → 18.10.2026 – 01.11.2026 |
| G2 (increment) | 87–121 (cum. 98–137) | 177–245 (cum. 199–275) | 11–18 weeks → 13.12.2026 – 31.01.2027 |
| G3 (increment) | 37–53, with W3e-PR9 41–60 (cum. 135–190 / 139–197) | 75–108.5, with W3e-PR9 83–122.5 (cum. 274–383.5 / 282–397.5) | (a) B3 in parallel: 16–27 weeks → 17.01.2027 – 04.04.2027 (with W3e-PR9 and T_evo before B3 on the same machine: 16–28 → 11.04.2027); (b) B3 serial: 18–30 weeks → 31.01.2027 – 25.04.2027 (with the T_evo placeholder 18–32 → 09.05.2027) |

- **Dates.** Dates are the end of the n-th calendar week from 27.09.2026 (Sunday), not a work deadline. The last working day of that week is Friday. The S1 range "12–17 weeks" amounts to 20.12.2026–24.01.2027 and is not a new agreement.
- **Breaks are not included in the ranges.** The basis is a PROPOSAL: RS public holidays and an assumed company closure on 24–31.12; the Egzakta calendar is UNKNOWN. The breaks are 11.11.2026 (1 wd), 24.12.2026–07.01.2027 (8 wd), Sretenje (Statehood Day) 15–16.02.2027 (2 wd) and Uskrs/Praznik rada (Easter/Labour Day) 30.04–04.05.2027 (3 wd). With them: G2: 11–20 weeks (until 14.02.2027); G3 (a): 18–29 weeks (31.01–18.04.2027); (a') with T_evo: 18–31 (until 02.05.2027); G3 (b): 19–33 weeks (07.02–16.05.2027); with PR9: 20–33; with T_evo: 20–35 (until 30.05.2027). Every boundary after 24.12.2026 shifts by +1–3 weeks.
- **Sensitivity to the classic column.** If the classic column is used instead of the AI column, G2 is 16–28 weeks, G3 (a) 23–39, and G3 (b) 26–45. Until the F1 retrospective measures AI throughput, the actual uncertainty is G2 11–28 and G3 16–45 weeks.
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

## Biggest UNKNOWNs
AI throughput (the ≈0.48× ratio is an estimate from S1, not measured); founder review capacity (~3 PR/day); B3 wall-clock (placeholder 10–20 wd) and T_evo (1–8 wd); whether any actual Stripe subscribers exist; the duration of the Authenticode / Deep Security / CASA steps; a test machine for the F1 receipt; repo visibility (the live state is public, while the documents say private; AUDIT FINDING — TO VERIFY).

## Decision queue (Delivery §6; recommendations are PROPOSAL)
- **DQ-01 Public naming/GO:** name and version number only after the F3 comparison; until then "controlled preview".
- **DQ-02 License:** a single decision on ownership and the final LICENSE/NOTICE texts, together with the OSS-excluded boundary.
- **DQ-03 Subscribers:** a read-only Stripe inventory before any WB-PR5 migration.
- **DQ-04 Benchmark budget:** a cap for the LoCoMo rerun (merge gate for W2-PR3), B2-PR0/B2, B3 and GEPA fidelity.
- **DQ-05 Model/hardware:** `Qwen/Qwen3.8-27B` Q4_K_M, Ollama repin and priority test devices.
- **DQ-06 Mail/calendar:** Microsoft Graph as the first ecosystem, or Gmail with a BYO OAuth pilot.
- **DQ-07 Mobile:** Telegram as the only G3 channel, with token-bound approve/deny.
- **DQ-08 UI language:** English-only first release, with centralized strings.
- **DQ-09 Thresholds/modes:** latency, quality and classifier thresholds and the CONDITIONAL policy, locked before B3/F2.
- **RAT-01..RAT-09:** ratification of the G structure and ADR-01..10 before the named merges (§6.1).
- **ODB-01:** paid receipt runs.
- **ODB-02:** scope of W3e-PR9 (bounded recipe evolution).

## What has NOT been done
No code was written or changed. The repo was not touched: no commit, push, tag, merge or release. No E2E, installer, receipt or benchmark runs were executed. There were no Stripe actions and no paid API calls. Worktrees and stashes were not touched.

## Last critique round
HIGH 0, MED 12. LOW findings were intentionally left without a new loop and are recorded in `docs/plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md`: 17 open, and 8 already resolved. The final completeness check added two elements: a definition of "test location" in FRD §15, after which the FRD DOCX was re-exported and the hashes were updated; and the SAFE-IMPLEMENTATION checklist condition in the exit criteria of all 13 waves.

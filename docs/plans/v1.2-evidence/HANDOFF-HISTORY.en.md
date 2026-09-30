# Waggle v1.2 — handoff history (evidence)

> **English translation** of [HANDOFF-HISTORY.md](HANDOFF-HISTORY.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days. Quoted blocks are given as in the English translation at `fc0a7b3f`; the cited file:line sources refer to the Serbian originals at `2758f4e5`.

**Document revision: 1.2.1 DRAFT · 30.09.2026 · final closure (H-01..H-12)** (new document; H-02)

Changes in 1.2.1: H-02 — new document: package identity history, outdated claims, path normalization, DOCX exports and hashes before 1.2.1, moved from 00-START-HERE and related documents · H-01 — chronology of the push and public availability (§1) · H-03 — correction of the description of the critique rounds (§6) · H-09 — note on the moved sentence about F3 (§8).

> **Historical record.** Nothing in this file is a current instruction. The current state is in [00-START-HERE §1](../../handoff/00-START-HERE.en.md) and the [package manifest](../WAGGLE-V1.2-PACKAGE-MANIFEST.en.md). Text moved from current documents is carried over verbatim, with the source `fajl:linija` at `2758f4e5`; nothing was deleted from git history (`git show 2758f4e5:<putanja>`). Relative links in quotes are valid for the source file, not for this one.

## 1. Package identity chronology

| Date and time | Event | Evidence |
|---|---|---|
| 27.09.2026 | Planning pass over `main` = `2af0904d`; phase-A revalidation | Delivery DP-0.01; [README](README.en.md) |
| 27.09.2026 | Live check of repo visibility: public (F-REL-08, DP-0.13) | [phaseA/release-oss.md](phaseA/release-oss.en.md) |
| 28.09.2026 | First DOCX export of the PRD/FRD (OD-9 "delivered") | §4 |
| 29.09.2026 00:10 | DOCX export before path normalization (DOCX with staging paths) | §4 |
| 29.09.2026 00:24:41 | Path normalization in the `.md` files | §3 |
| 29.09.2026 | DOCX re-export of the PRD/FRD; hashes in §5 | §4, §5 |
| 29.09.2026 02:39:31 +0200 | Commit `2758f4e5b5be82691ef17624494e12ffc9ad84d1` "docs: Waggle v1.2 planning package and dev-team handoff": 59 files, all in `docs/`, parent `2af0904d` | `git log -1 2758f4e5`; `git diff --name-only 2af0904d 2758f4e5` |
| 30.09.2026 00:04:18 +0200 (= 29.09.2026 22:04 UTC) | The founder personally pushes branch `docs/waggle-v1.2-planning` to `origin` (the push attempt from the planning session was blocked, so the founder ran it himself); the repo is public, so the package at `2758f4e5` is publicly readable | reflog `refs/remotes/origin/docs/waggle-v1.2-planning` "update by push"; `git ls-remote origin` 30.09.2026 = `2758f4e5`; `gh api repos/marolinik/waggle-os` → `visibility: public` |
| 30.09.2026 00:57:29 +0200 | Local commit `fc0a7b3fa9193d2c52bc8dfaacc94110e9e404d3` (English translation, 49 files, parent `2758f4e5`); not pushed | `git log -1 fc0a7b3f`; `git ls-remote origin` |
| 30.09.2026 | Independent review over `2758f4e5` (H-01..H-12); `gh api` → `visibility: public` | [closure record](../WAGGLE-V1.2-CLOSURE-RECORD.en.md) |
| 30.09.2026 | Closure revision 1.2.1 in the working tree (uncommitted) | [manifest](../WAGGLE-V1.2-PACKAGE-MANIFEST.en.md) §1 |

The intent of public distribution and the channel of handoff to the team are not recorded as a founder decision (H-01; [00 §6](../../handoff/00-START-HERE.en.md) (n)).

## 2. Outdated claims about the package status (replaced in 1.2.1)

| Source at `2758f4e5` | Claim (abridged) | Why it no longer holds | Replacement in 1.2.1 |
|---|---|---|---|
| `docs/handoff/00-START-HERE.md:34` | package "untracked (not committed)", "When and how the package is committed is decided by the founder" | commit `2758f4e5` exists and is on `origin` | 00 §1.1 |
| `docs/handoff/00-START-HERE.md:49` | "There has been no commit, push …" | two docs-only commits and a push of the package branch | 00 §2 "No code has been written" |
| `docs/handoff/00-START-HERE.md:216` | (h) "how and when the untracked v1.2 package … is committed" | the package is committed; only entry into the integration branch remains open | 00 §6 (h) |
| `docs/handoff/00-START-HERE.md:222` | (n) visibility "the live check on 27.09.2026 says public — AUDIT FINDING — TO VERIFY" | `gh api` on 30.09.2026 again returns `public`, and the package branch is on `origin` | 00 §6 (n) |
| `docs/handoff/01-ONBOARDING-DEV-ENV.md:53-55` | "The package is untracked today …" | same | 01 §0.1 pt.5 |
| `docs/handoff/01-ONBOARDING-DEV-ENV.md:137-139` | docs worktree "`2af0904d`" | the branch is at `fc0a7b3f` locally, `2758f4e5` on `origin` | 01 §3.1 |
| `docs/handoff/01-ONBOARDING-DEV-ENV.md:149-150` | state on origin "UNKNOWN" | `git ls-remote` 30.09.2026: no `integration/*` | 01 §3.2 |
| `docs/handoff/01-ONBOARDING-DEV-ENV.md:167-184` | block "Blocker for every host other than the founder's machine" (untracked) | the package is committed and on `origin` | 01 §3.2 "The package on a team host" |
| `docs/handoff/01-ONBOARDING-DEV-ENV.md:836` | "(not fetched)" | `ls-remote` checked | 01 §13 pt.4 |
| `docs/handoff/03-BACKLOG.md:577`, `:1576`, `:1612` | "untracked … without a commit, not on origin" | same | 03 WB-PR1, §6 pt.4, §7 N-07 |
| `docs/handoff/05-RISKS-DECISIONS-ESCALATION.md:16` | "no commit, push …" | same | 05 §0 |
| `docs/plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md:59` | "The repo was not touched: no commit, push …" | same | SUMMARY "What was NOT done" |

Verbatim text of two claims from 00-START-HERE:

Source: `docs/handoff/00-START-HERE.md:34` at `2758f4e5`.

~~~~text
**Where the package physically lives.** Worktree `D:/Projects/waggle-v12-handoff`, branch `docs/waggle-v1.2-planning` at `2af0904d`. The package files are **untracked** on that branch (not committed); `git status` was checked read-only on 29.09.2026. — CONFIRMED AT REVISION. When and how the package is committed is decided by the founder (UNKNOWN). `integration/waggle-next` is created from `2af0904d`, and at that revision PRD/FRD/ADR v1.2 do not exist (`git cat-file -e 2af0904d:docs/Waggle_PRD_v1.2_DRAFT.md` → "exists on disk, but not in '2af0904d'", same for `docs/decisions/ADR-INDEX.md`; CONFIRMED AT REVISION 29.09.2026). That is why the package's path into the integration branch blocks WB-PR1 and the ID-reconcile PR (question (h) in §6).
~~~~

Source: `docs/handoff/00-START-HERE.md:49` at `2758f4e5`. (table row of §2; the header is `00:46-47`)

~~~~text
| Question | Answer |
|---|---|
| Has code been written? | No. There has been no commit, push, tag, merge, release, E2E, installer, receipt or benchmark run, no Stripe actions and no paid API calls ([SUMMARY](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.en.md), "What was NOT done"). |
~~~~

Source: `docs/handoff/00-START-HERE.md:216` at `2758f4e5`.

~~~~text
- (h) how and when the untracked v1.2 package (PRD/FRD/ADR, branch `docs/waggle-v1.2-planning`) is committed or brought into `integration/waggle-next`. That branch is created from `2af0904d`, where PRD/FRD/ADR v1.2 do not exist (§1). The question blocks WB-PR1 (table inventory in the FRD + review of ADR-08/09, Delivery §2 WB) and the ID-reconcile doc-only PR (FRD §16.1 ↔ PRD v1.2 ↔ Delivery §7). It is also gate 4 "Before day 1" in [03 §6](03-BACKLOG.en.md) and N-07 in 03 §7;
~~~~

Source: `docs/handoff/00-START-HERE.md:222` at `2758f4e5`.

~~~~text
- (n) who gives a new team member access to the repo (repo visibility: `CLAUDE.md:84`/`AGENTS.md:68` say private, the live check on 27.09.2026 says public — AUDIT FINDING — TO VERIFY, DP-0.13) and how the package reaches the team on a host that is not the founder's machine, together with (c), (d) and (h) ([01 §3.2](01-ONBOARDING-DEV-ENV.en.md), §0.1 pt.5);
~~~~

## 3. Path normalization (29.09.2026)

Source: `docs/handoff/00-START-HERE.md:36` at `2758f4e5`. ("Paths in the package")

~~~~text
**Paths in the package.** Paths in the new v1.2 files were normalized on 29.09.2026 to the repo layout (`docs/…`, `docs/plans/v1.2-evidence/…`). A grep over PRD, FRD, Delivery, MIG, BvB, Benchmark and ADR-INDEX finds no staging path `out/…`, no unprefixed `phaseA/…` and no `scratchpad/…`. The only exception is the deliberately retained real path of the existing worktree `…/scratchpad/wt202` (DP-0.02). — CONFIRMED AT REVISION of the package (29.09.2026). The map of old and new paths is in [v1.2-evidence/README.md, "Old path map"](../plans/v1.2-evidence/README.en.md#map-of-old-paths). It is needed only for `critic-r2-estimates.json` and historical comments (e.g. the `repro-harness.mjs` header). The DOCX was re-exported from the normalized `.md` and no longer contains staging paths (see below).
~~~~

Source: `docs/handoff/02-WORKING-AGREEMENT.md:19` at `2758f4e5`. ("Paths in the package")

~~~~text
- **Paths in the package:** the package's `.md` files were normalized to the repo layout on 29.09.2026 ([00 §1](00-START-HERE.en.md), "Paths in the package"). The old staging paths (`out/decisions/…`, `out/plans/…`, `v12-planning-staging/tools/check_trace.mjs`) also existed in the first DOCX export; the DOCX was re-exported from the normalized `.md` on 29.09.2026 ([00 §1](00-START-HERE.en.md), "DOCX is current"), so it no longer contains them either. They are recorded in the map [v1.2-evidence/README.md, "Map of old paths"](../plans/v1.2-evidence/README.en.md#map-of-old-paths). The map translates them into `docs/decisions/`, `docs/plans/` and `docs/plans/v1.2-evidence/tools/check_trace.mjs`. CONFIRMED AT REVISION of the package (29.09.2026): grep `out/decisions|out/plans|v12-planning-staging` over PRD, FRD, Delivery, MIG, BvB, Benchmark and ADR-INDEX yields 0 hits, and after the re-export `unzip -p <fajl>.docx word/document.xml` also finds none of these paths in any DOCX.
~~~~

The map of old paths remains in [README, "Map of old paths"](README.en.md#map-of-old-paths).

## 4. DOCX exports 28.–29.09.2026

Source: `docs/handoff/00-START-HERE.md:38` at `2758f4e5`. ("DOCX is current")

~~~~text
**DOCX is current (re-export 29.09.2026 after path normalization).** The first DOCX export (29.09.2026, 00:10) preceded the path normalization (00:24:41), so it carried the text from before normalization with staging paths (`out/…`, `scratchpad/…`, `v12-planning-staging/…`). The PRD and FRD DOCX were therefore re-exported with the same command from Delivery §6.1 (`pandoc -f gfm-tex_math_dollars-tex_math_gfm <fajl>.md -o <fajl>.docx`, run from `docs/`), without changing the `.md` text. The hashes were updated in Delivery §6.1 and Disposition OD-9, where the full values are given: PRD `.md` `8aa74f26…`, `.docx` `932bb0ee…`; FRD `.md` `7ecc197f…`, `.docx` `198ccd6c…`. In the new DOCX, `unzip -p <fajl>.docx word/document.xml | grep` finds no staging paths, and a repeated export into scratch differs only in `docProps/core.xml` (creation time). The "Handoff condition" from Delivery §6.1 is thereby met for the listed hashes. — CONFIRMED AT REVISION of the package (29.09.2026; `pandoc 3.9`, `sha256sum`). The authoritative text remains the `.md`; any later change to the PRD/FRD `.md` again requires an export with the same command and new hashes in §6.1 and OD-9.
~~~~

Source: `docs/handoff/00-START-HERE.md:217` at `2758f4e5`. (question (i))

~~~~text
- (i) DOCX re-export of the PRD/FRD with the same `pandoc` command and update of the hashes in Delivery §6.1 and OD-9 (doc-only). **Done 29.09.2026** in the docs worktree, without changing the `.md` text; the "Handoff condition" from §6.1 is met (§1, "DOCX is current"). The founder reviews it together with the whole package; letter (i) is kept for stable references;
~~~~

Source: `docs/plans/WAGGLE-DELIVERY-PLAN-v1.2.md:601` at `2758f4e5`. (§6.1, paragraph "Package delivery — DOCX")

~~~~text
**Package delivery — DOCX (neither a founder ratification nor a DQ; Disposition OD-9):** DOCX variants of PRD and FRD v1.2 (brief §20.1 "`.md` + DOCX") **delivered 28.09.2026** (previously DEFERRED): `docs/Waggle_PRD_v1.2_DRAFT.docx` and `docs/Waggle_FRD_v1.2_DRAFT.docx`, from the final `.md` text with the command `pandoc -f gfm-tex_math_dollars-tex_math_gfm <fajl>.md -o <fajl>.docx` (`pandoc 3.9` on the host). SHA-256 (re-export 29.09.2026 after path normalization): PRD `.md` `8aa74f266d59f66d10a3f319d57e03b5a426e10f07c74942b2e5bae5b2be588f`, PRD `.docx` `932bb0eed2b80de216323e3d97fdc30ea7e4652a909ab2ee8e35ecd906f40f5e`; FRD `.md` `7ecc197f950de49eb2de6b80b288d3afd487c6af3982002598da75f0fddea5d9`, FRD `.docx` `198ccd6c960dff703251664782f422b0a2a9b28b4018733f5c49bd243f2b325d`. Both DOCX files were re-exported on 29.09.2026 with the same command from `docs/`, after path normalization in the `.md` files. The replaced hashes (PRD `.md` `08370831…`, `.docx` `99ac396d…`; FRD `.md` `b8153e4d…`, `.docx` `4a121425…`, export after the FRD §15 "test location" addition) are stale: that DOCX carried staging paths (`out/…`, `scratchpad/…`, `v12-planning-staging/…`), while in the new one `unzip -p <fajl>.docx word/document.xml | grep` finds none. A repeated export into scratch differs only in `docProps/core.xml` (creation time), so the DOCX matches the current `.md`. — CONFIRMED AT REVISION of the package (host, 29.09.2026; `pandoc 3.9`, `sha256sum`; a property of the package, not of the code revision). Disposition OD-9 carries the same state; the PRD/FRD header (line 5) records the command and the location of the hashes, not the hashes themselves, so the re-export does not change it. **Handover condition:** any later change to the PRD/FRD `.md` makes the DOCX stale; before handover to the founder, check the SHA-256 of the `.md` against this item, and if there is a difference, repeat the export with the same command and update the hashes here and in OD-9 (brief §20.1, §20.4). — PROPOSAL (condition).
~~~~

Source: `docs/plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md:189` at `2758f4e5`. (row OD-9; the table header is `:179-180`)

~~~~text
| # | Where | Deviation | Why | Impact |
|---|---|---|---|---|
| OD-9 | Brief §20.1 ("PRD/FRD `.md` + DOCX"); PRD and FRD header row 5; Delivery plan §6.1 | **Delivered 28.09.2026** (previously DEFERRED): `docs/Waggle_PRD_v1.2_DRAFT.docx` and `docs/Waggle_FRD_v1.2_DRAFT.docx`, generated from the final `.md` text with the command `pandoc -f gfm-tex_math_dollars-tex_math_gfm <fajl>.md -o <fajl>.docx` (`pandoc 3.9`). SHA-256 (re-export 29.09.2026 after path normalization): PRD `.md` `8aa74f266d59f66d10a3f319d57e03b5a426e10f07c74942b2e5bae5b2be588f`; PRD `.docx` `932bb0eed2b80de216323e3d97fdc30ea7e4652a909ab2ee8e35ecd906f40f5e`; FRD `.md` `7ecc197f950de49eb2de6b80b288d3afd487c6af3982002598da75f0fddea5d9`; FRD `.docx` `198ccd6c960dff703251664782f422b0a2a9b28b4018733f5c49bd243f2b325d`. Both DOCX files were re-exported on 29.09.2026 with the same command from `docs/`, after path normalization in the `.md` files; the replaced hashes (PRD `.md` `08370831…`, `.docx` `99ac396d…`; FRD `.md` `b8153e4d…`, `.docx` `4a121425…`) are outdated, because that DOCX carried staging paths (`out/…`, `scratchpad/…`, `v12-planning-staging/…`), whereas in the new one `unzip -p <fajl>.docx word/document.xml` + grep does not find them. Check: a repeated export with the same command into scratch and an unpacked comparison — only `docProps/core.xml` (creation time) differs, `word/document.xml` and the other parts are identical, so the DOCX matches the current `.md`. — CONFIRMED AT REVISION of the package (host, 29.09.2026; `pandoc 3.9`, `sha256sum`; a property of the package, not of the code revision) | Brief §20.1 requires `.md` + DOCX. The earlier deferral (the text was changing during the critic cycle, so the DOCX would have become outdated immediately) was superseded by the export after the last change to the PRD/FRD text | The package is complete per §20.1 for the listed hashes; `.md` remains the source of truth. Any later change to the PRD/FRD `.md` makes the DOCX outdated: before handover, check the SHA-256 of the `.md` against this row, and on a mismatch repeat the export with the same command and update the hashes here and in Delivery plan §6.1 |
~~~~

## 5. Hashes before revision 1.2.1 (SHA-256)

| File | State | SHA-256 |
|---|---|---|
| `docs/Waggle_PRD_v1.2_DRAFT.md` | `2758f4e5` (= `fc0a7b3f`) | `8aa74f266d59f66d10a3f319d57e03b5a426e10f07c74942b2e5bae5b2be588f` |
| `docs/Waggle_PRD_v1.2_DRAFT.docx` | `2758f4e5` (= `fc0a7b3f`) | `932bb0eed2b80de216323e3d97fdc30ea7e4652a909ab2ee8e35ecd906f40f5e` |
| `docs/Waggle_FRD_v1.2_DRAFT.md` | `2758f4e5` (= `fc0a7b3f`) | `7ecc197f950de49eb2de6b80b288d3afd487c6af3982002598da75f0fddea5d9` |
| `docs/Waggle_FRD_v1.2_DRAFT.docx` | `2758f4e5` (= `fc0a7b3f`) | `198ccd6c960dff703251664782f422b0a2a9b28b4018733f5c49bd243f2b325d` |
| `docs/handoff/00-START-HERE.md` | `2758f4e5` (= `fc0a7b3f`) | `77dd00979fa9fcd19fb7ce96750ae99dfb918d87995177fa85060f0fc6552c40` |
| `docs/handoff/00-START-HERE.docx` | `2758f4e5` (= `fc0a7b3f`) | `012bd501b56c3f12da042b4cea43af814f0579f39dfede4b0c09cd0fe562cb32` |
| `docs/handoff/backlog.csv` | `2758f4e5` (= `fc0a7b3f`) | `ecdac55d40705a5a10f6a434388767408b39eea680ae9c0ae323c9584a720a4b` |
| `docs/Waggle_PRD_v1.2_DRAFT.en.docx` | `fc0a7b3f` | `acbb1bc762f4501e8a4a0fc07d9a56431e78c93286dd6db0fd3ca1cb6129735c` |
| `docs/Waggle_FRD_v1.2_DRAFT.en.docx` | `fc0a7b3f` | `e2fbaf6147954a5ceff638ec22ebb1add5d990f0f0176f5888c6ce9875b299c1` |
| `docs/handoff/00-START-HERE.en.docx` | `fc0a7b3f` | `2ec731e3ff98ed7bae184df9e34864deb5a30d1cb0245b44a3d0a0157cad7a75` |
| `docs/handoff/backlog.en.csv` | `fc0a7b3f` | `896bfbb010f60af68f6f312db7cc8fa095d2e140b5634b1c642d99910f50283c` |

Replaced hashes of the export before normalization (29.09.2026; the source recorded only prefixes; the full values were not kept in the package — UNKNOWN): PRD `.md` `08370831…`, `.docx` `99ac396d…`; FRD `.md` `b8153e4d…`, `.docx` `4a121425…`.
Check: `git cat-file blob <commit>:<putanja> | sha256sum` (30.09.2026, repeated while writing this file; all 11 values match).

## 6. Critique rounds (as described by revision 1.2)

Source: `docs/handoff/00-START-HERE.md:48` at `2758f4e5`. (row "What is the state of the package?"; the table header is `00:46-47`)

~~~~text
| Question | Answer |
|---|---|
| What is the state of the package? | DRAFT. Last critique round: HIGH 0, MED 12. LOW findings were deliberately left to the founder: 17 open, 8 resolved according to [OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md). After the path normalization on 29.09.2026 that split is inaccurate on one point: the row about `scratchpad/…` paths is among the 17 open ones, but in the table it carries the label "Applied 29.09.2026". The "DOCX export" item among the 8 resolved ones was temporarily inaccurate after normalization; after the re-export on 29.09.2026 the hashes in Delivery §6.1/OD-9 again match the current files (§1, "DOCX is current"). **The status of the 12 MED findings is UNKNOWN:** the package contains neither their list nor a per-item resolution record. The [SUMMARY](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.en.md) ("Last critique round") says only of the LOW findings that they were "left without a new loop". That suggests the MED findings went through a fix loop, but this is not recorded anywhere. `OPEN-LOW-FINDINGS` covers only LOW, and `critic-r2-estimates.json` is the second round (11 findings: 1 HIGH, 5 MED, 5 LOW), not the last one. Check: grep `MED` over `docs/`, 29.09.2026. Until the founder confirms, the team does not claim that MED is 0 (question (g) in §6). |
~~~~

Authoritative disposition of the earlier findings after closure: [closure record](../WAGGLE-V1.2-CLOSURE-RECORD.en.md) (H-03) and `findings/all-critic-findings.json` (459 findings), `findings/all-fixer-reports.json` (67 reports).

**Correction in revision 1.2.1 (H-03, 30.09.2026).** The moved row was accurate for the package contents at `2758f4e5`: at that time the package contained neither a list of the MED findings nor a record of their resolution. The records existed in the outputs of the planning workflows and were transferred to `findings/` on 30.09.2026 (459 findings, 67 fixer reports). The row could not state the following:
1. The 12 MED of round `finish/f1` are `finish/checklist/f1/01–05`, `finish/estimates/f1/01`, `finish/facts/f1/01–02` and `finish/traceability/f1/01–04`. All 12 were sent to the fixer (reports `fix:…:f1`) and individually re-checked on 30.09.2026; the status is in the registry `findings/FINDINGS-DISPOSITION.csv`.
2. "17 open, 8 resolved" mixed units: 26 LOW findings = 8 resolved before the registry was written + 18 findings in 17 table rows (one row combines two findings). After the path normalization on 29.09.2026, row `finish/facts/f1/07` was applied, so the state at `2758f4e5` was 9 resolved and 17 open findings in 16 rows.
3. "Last critique round" is the last round of the planning package (`finish/f1`). The handoff documents 00–05, `backlog.csv` and the PR template afterwards went through rounds `handoff/r1` (8 HIGH, 25 MED, 34 LOW) and `handoff/r2` (6 HIGH, 21 MED, 29 LOW), which the row does not mention.

## 7. Read-only checks 29.09.2026

Source: `docs/handoff/00-START-HERE.md:26-32` at `2758f4e5`. (check_trace exit 0, PRD 166/166, FRD 114/114)

~~~~text
The mechanical PRD ↔ FRD coverage check passed on 29.09.2026 with exit 0: PRD 166/166, FRD contracts 114/114. Command (read-only, from the repo root):

```bash
node docs/plans/v1.2-evidence/tools/check_trace.mjs docs
```

— CONFIRMED AT REVISION of the package (29.09.2026).
~~~~

Source: `docs/handoff/00-START-HERE.md:305-315` at `2758f4e5`. (list of checks)

~~~~text
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
~~~~

The `check_trace.mjs` result for revision 1.2.1 is in the [manifest](../WAGGLE-V1.2-PACKAGE-MANIFEST.en.md) §4.

## 8. Other content removed from 00-START-HERE 1.2

- §4 "Package map" (`00:115-158`) moved to the [manifest](../WAGGLE-V1.2-PACKAGE-MANIFEST.en.md) §2.
- §3 "Note on the repro scripts" (`00:103-111`): the operational version is in the [README](README.en.md), "Running", step 2 (H-02 §4.12). The verbatim text of revision 1.2 is below, so that the evidence does not depend on that change.
- §5 table G1/G2/G3 and "How to read the ranges" (`00:162-179`): duplicate of [Delivery §4.2–§4.3](../WAGGLE-DELIVERY-PLAN-v1.2.en.md); every number was checked against Delivery on 30.09.2026 (H-02). The verbatim text is below. The sentence about the freezes (`00:179`) describes F3 as a single step with Authenticode; from revision 1.2.1, F3a → controlled step K → F3b applies ([Delivery §5.1](../WAGGLE-DELIVERY-PLAN-v1.2.en.md), H-09), and the dates from 27.09.2026 are reference dates (T_ref), while the actual calendar starts from T0 ([Delivery §4.4.1](../WAGGLE-DELIVERY-PLAN-v1.2.en.md), H-12).
- §7 table D-01..D-18 (`00:233-252`): duplicate of [brief §3](inputs/Waggle_Planner_Brief_v1.0_2026-09-27.en.md).
- §8 overview of prohibitions (`00:267-278`): duplicate of [SAFE checklist, "Absolute prohibitions"](../SAFE-IMPLEMENTATION-CHECKLIST.en.md).

Full text of revision 1.2: `git show 2758f4e5:docs/handoff/00-START-HERE.md`.

### 8.1 Note on the repro scripts (revision 1.2)

Source: `docs/handoff/00-START-HERE.md:103-111` at `2758f4e5`.

~~~~text
**Note on the repro scripts** (CONFIRMED AT REVISION of the package, grep 29.09.2026):
- All three scripts hardcode the `dist` of the founder's main checkout:
  - `repro-harness.mjs:4`: `DIST = 'file:///D:/Projects/waggle-os/packages/agent/dist/'`;
  - `repro-shadow.mjs:10`: `DIST = 'D:/Projects/waggle-os/packages/agent/dist'`;
  - `repro-gepa-delta.mjs:10`: `DIST = 'D:/Projects/waggle-os/packages/agent/dist'`.

  Without modification they read whatever `dist` is currently in `D:/Projects/waggle-os`, not the `dist` from `2af0904d`.
- `repro-shadow.mjs` **writes next to itself:** `mkdtempSync(path.join(here, 'shadow-'))` (`:14-15`), i.e. into `docs/plans/v1.2-evidence/phaseA/` inside the repo. It deletes it only at `:42`, without `finally`, so after an error the directory remains. The header ("Writes only under the scratchpad", `:3-4`) is historical. In the other two scripts grep finds no write.
- **Running: only after the founder's approval of the plan (§2).** Until then the repro scripts are not run anywhere: they require a `dist` built from `2af0904d`, building (`npm ci`, `npm run build:packages`) waits for approval, and the `dist` in `D:/Projects/waggle-os` has not been proven to be from `2af0904d` (point above). After approval: copy all three scripts into a scratch directory outside the repo, as in [v1.2-evidence/README](../plans/v1.2-evidence/README.en.md) ("Running", step 2). In the **copy**, point `DIST` to `packages/agent/dist` of your own worktree from `integration/waggle-next` ([01 §0.2](01-ONBOARDING-DEV-ENV.en.md)), built with `npm run build:packages`. The result is compared with the snapshot only if that `dist` was built from revision `2af0904d` (same README, step 2). The evidence files are not changed. `dist` is never built in `D:/Projects/waggle-os`.
~~~~

### 8.2 Milestones G1 / G2 / G3 (revision 1.2)

Source: `docs/handoff/00-START-HERE.md:162-179` at `2758f4e5`.

~~~~text
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
~~~~

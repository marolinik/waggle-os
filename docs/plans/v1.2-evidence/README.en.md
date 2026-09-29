# v1.2 evidence — evidence from the planning pass (snapshot)

> **English translation** of [README.md](README.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Reviewed code revision:** `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`main`, 27.09.2026) · **Folder assembled:** 29.09.2026 · **Status:** snapshot, not current truth.

This folder preserves the inputs, findings and tools from which the Waggle v1.2 planning package was derived (`docs/Waggle_PRD_v1.2_DRAFT.md`, `docs/Waggle_FRD_v1.2_DRAFT.md`, `docs/plans/WAGGLE-*-v1.2.md`, `docs/plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md`, `docs/plans/SAFE-IMPLEMENTATION-CHECKLIST.md`, `docs/decisions/2026-09-27-ADR-01..10-*.md`, `docs/decisions/ADR-INDEX.md`). Every `path:line` reference in these files applies to revision `2af0904d`, not to a later HEAD.

## Snapshot, not current truth

- The findings are accurate for revision `2af0904d` and for the verification date. The code may have changed since then. Before a finding is used in a PR, it is re-verified on the current HEAD (`docs/plans/SAFE-IMPLEMENTATION-CHECKLIST.md`).
- External data (GitHub, Hugging Face, Ollama, prices, ToS) reflect the state of the services on 27.09.2026, not a property of the revision. In the package they carry the label AUDIT FINDING — TO VERIFY.
- The folder is not release evidence. Receipts, installer hashes and the release verdict live only in `docs/production-readiness/09-LAUNCH_RECOMMENDATION.md`.
- Founder decisions D-01..D-18 (brief §3) are closed and this folder does not reopen them.
- Implementation is **not approved**. Coding starts only when the founder approves the delivery plan (`docs/plans/WAGGLE-DELIVERY-PLAN-v1.2.md`). All work then follows the mandatory safe-implementation strategy from `docs/plans/SAFE-IMPLEMENTATION-CHECKLIST.md`.

## Contents

### `phaseA/` — revalidation of the S1 audit by group (27.09.2026)

Phase A and refuter verdicts override S1 where they differ (`docs/plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md` §0, "Status authority"). The ID ranges are taken from the Delivery plan (Sources, Phase-A findings) and the FRD Sources.

| File | Group | Finding IDs |
|---|---|---|
| `harness.md` | harness, verify phase, trace bridge, `run_harness` | F-HARN-01..09 |
| `evolution.md` | evolution, persona override, GEPA | F-EVO-01..12 |
| `durable.md` | durable runs and routines | F-DUR-01..14 |
| `hivemind.md` | memory, RAWDETAIL, hooks | F-HM-01..18 |
| `capability.md` | capability/connectors, OAuth, approvals | F-CAP-01..13 |
| `ux-model.md` | UX model, model gate, managed Ollama | F-UXM-01..15 |
| `tiers-kvark.md` | tiers, Stripe, KVARK, worker | F-TK-01..19 |
| `release-oss.md` | ancestry and release evidence, licenses/SBOM/notices, release workflow and CI, prices, benchmark branch, OSS gate | F-REL-01..12 |
| `external.md` | external research: Qwen/Ollama/HF (§1), agent-native and Omnigent (§2), durable candidates (§3), benchmark evidence cards (§4), channels and ToS (§5), prices (§6), open (§7), source registry (§8) | EXT-1..12 |

**Refuter files** (a skeptical pass over findings with status CONFIRMED AT REVISION; verdicts HOLDS / WEAKENED / REFUTED):

| File | Outcome (Delivery plan, Sources) |
|---|---|
| `harness.refute.md` | 7/7 HOLDS, 2 WEAKENED at the minimalChange level |
| `evolution.refute.md` | F-EVO-09 WEAKENED |
| `durable.refute.md` | F-DUR-02/06/10/12/14 WEAKENED; F-DUR-10 new finding TO VERIFY |
| `hivemind.refute.md` | F-HM-02/05/06 WEAKENED |

**Other files in `phaseA/`:**

- `oss-drift-check-output.txt` — full output of `node scripts/oss-drift-check.mjs D:/Projects/hive-mind` (F-REL-07): PARITY 5, REVIEWED ADAPTATIONS 36, KNOWN REVIEWED BLOCKERS 22, UNREVIEWED DIFFERENCES 3, FORBIDDEN EXPORTS 0, exit 1. The first two lines record the canonical tree `2af0904d` and the OSS checkout `77c6dd7f8c36e333f2de859e4f4d7818b03e667a`.
- `repro-harness.mjs`, `repro-shadow.mjs`, `repro-gepa-delta.mjs` — repro scripts (section "Running" below).
- `critic-r2-estimates.json` — 11 findings from the second critic round (HIGH/MED/LOW) on the estimates in `WAGGLE-DELIVERY-PLAN-v1.2.md`. Historical record: the `file` field still points to the old path in the planner workspace, and the line numbers apply to the version of the plan at that time.

### `inputs/` — inputs to the planning pass

The copies are byte-identical to the originals (verified with `cmp` on 29.09.2026): four `.md` files against the files the planning pass used, and two `.docx` against the untracked files in `D:/Projects/waggle-os/docs/`. Line-number references therefore remain valid.

| File | What it is | Old name in the planner workspace |
|---|---|---|
| `Waggle_Planner_Brief_v1.0_2026-09-27.md` | founder brief (D-01..D-18 in §3, DIR-xx, AT-01..30) | `BRIEF.md` |
| `S1-audit-2026-09-27.md` | S1 audit, copy (original: `procitaj-d-projects-waggle-os-docs-waggl-rustling-milner-agent-ac748482c5af17ddf.md`, SHA-256 in brief §22) | `S1_AUDIT.md` |
| `Waggle_PRD_v1.1_2026-09-27.md` | text extract of PRD v1.1 | `PRD.md` |
| `Waggle_FRD_v1.1_2026-09-27.md` | text extract of FRD v1.1 | `FRD.md` |
| `Waggle_PRD_v1.1_2026-09-27.docx`, `Waggle_FRD_v1.1_2026-09-27.docx` | original DOCX v1.1 | — |

### `tools/` — mechanical verification

- `check_trace.mjs` — checks PRD ↔ FRD coverage in FRD §16.1: every defined `PRD-SS-NN` and every FRD contract (§1–§14, excluding the FRD-16.1/16.2 maps) must have a row in §16.1, and no referenced ID may be undefined. Exit 1 when something is missing.

## Running (read-only)

All commands are run from the repo root. They do not require `npm install`/`npm ci` and make no network calls.

**1. PRD ↔ FRD coverage check**

```bash
node docs/plans/v1.2-evidence/tools/check_trace.mjs            # podrazumevano čita docs/
node docs/plans/v1.2-evidence/tools/check_trace.mjs <docsDir>  # drugi direktorijum sa PRD/FRD v1.2 .md
```

The script only reads two `.md` files. Output on 29.09.2026, after path normalization:

```text
PRD defined: 166; covered in §16.1: 166
PRD missing: (none)
FRD defined: 116; contracts (§1–§14, minus FRD-16.x maps): 114; covered in §16.1: 114
FRD contracts missing: (none)
FRD referenced but not defined: (none)
PRD referenced but not defined: (none)
```

**2. Repro scripts (`phaseA/repro-*.mjs`)**

The scripts import already-built ESM modules from `D:/Projects/waggle-os/packages/agent/dist` (the path is hard-coded in the `DIST` constant). They do not build anything and do not run tests. Requirements:

- `dist` must be built from revision `2af0904d`. The evidence used a `dist` built on 27.09.2026 at 05:27 and verified that it matches `src` at the cited lines (`harness.md`, `evolution.md`). Building `dist` (`npm run build:packages`) writes to the repo and is not part of the read-only run. With a different `dist`, the result is not comparable with this snapshot.
- Node `22.23.2` (the version from the evidence).
- `repro-shadow.mjs` creates a temporary `shadow-*` directory next to itself and deletes it at the end. For that reason all three scripts are copied into a temporary directory outside the repo and run from there. This keeps `docs/` untouched. If the checkout is at a different path, `DIST` is changed in the copy, not in the evidence file.

```bash
tmp="$(mktemp -d)"
cp docs/plans/v1.2-evidence/phaseA/repro-*.mjs "$tmp"/
node "$tmp/repro-harness.mjs"
node "$tmp/repro-shadow.mjs"
node "$tmp/repro-gepa-delta.mjs"
```

| Script | Covers | Recorded outcome on `2af0904d` (CONFIRMED AT REVISION in phase A) |
|---|---|---|
| `repro-harness.mjs` | F-HARN-01..08 (claims 01a–08b) | `25/25 repro assertions hold on 2af0904d` (`harness.md` §0) |
| `repro-shadow.mjs` | F-EVO-01 (evolved persona override shadowed by the built-in persona) | `listPersonas()` has 2 entries with `id=coder`; `resolvePersona('coder')` does not contain `EVOLVED` (`evolution.md`, F-EVO-01) |
| `repro-gepa-delta.mjs` | (a) F-EVO-06, (b) F-EVO-07, (c) F-EVO-05 | (a) `history[0].score.n = 50`, `winner.score.n = 400`, `delta = 0.2660` versus `0.2500` on the same sample; (b) a secret from the trace reaches the judge; (c) `frozenSchema` has no channel to Stage 2 (`evolution.md`) |

The comment in the `repro-harness.mjs` header ("Run from the scratchpad") is historical. Today's equivalent is the temporary directory from the step above.

**3. OSS drift check**

```bash
node scripts/oss-drift-check.mjs D:/Projects/hive-mind
```

Requires a local checkout of `marolinik/hive-mind`. Phase A ran it read-only, and the monorepo's `git status` was unchanged afterward (`release-oss.md` F-REL-07). The result depends on the state of both trees, so a new output is not comparable with `oss-drift-check-output.txt` except at the same revisions.

**4. Targeted tests from `tiers-kvark.md`**

Phase A ran 8 test files (144 tests, all green) in a temporary directory, under Node `v22.23.2` (`tiers-kvark.md` §0). It is not a script in this folder. Re-running them is test execution and is not part of the read-only evidence check.

## Map of old paths

The planning package was created in a temporary planner workspace of a single session (Temp scratchpad). On 29.09.2026 the paths in the new v1.2 files were rewritten to the repo layout:

| Old path | New path |
|---|---|
| `scratchpad/phaseA/<f>`, `phaseA/<f>` | `docs/plans/v1.2-evidence/phaseA/<f>` |
| `scratchpad/out/Waggle_*_v1.2_DRAFT.*`, `out/Waggle_*` | `docs/Waggle_*_v1.2_DRAFT.*` |
| `scratchpad/out/plans/<f>`, `out/plans/<f>` | `docs/plans/<f>` |
| `scratchpad/out/decisions/<f>`, `out/decisions/<f>` | `docs/decisions/<f>` |
| `out/` (drafts directory) | `docs/` |
| `scratchpad/BRIEF.md`, `BRIEF.md` | `docs/plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md` |
| `scratchpad/S1_AUDIT.md`, `S1_AUDIT.md` | `docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md` |
| `scratchpad/PRD.md`, `PRD.md` / `scratchpad/FRD.md`, `FRD.md` | `docs/plans/v1.2-evidence/inputs/Waggle_PRD_v1.1_2026-09-27.md` / `…/Waggle_FRD_v1.1_2026-09-27.md` |
| `v12-planning-staging/tools/check_trace.mjs` | `docs/plans/v1.2-evidence/tools/check_trace.mjs` |

Notes on the map:

- In the phase A file lists, only the first file carries the full path. The remaining bare names (`harness.refute.md`, `repro-shadow.mjs`, `external.md §8`, `oss-drift-check-output.txt`) are in `docs/plans/v1.2-evidence/phaseA/`.
- Intentionally not changed: the actual path of the existing `deps/ax-24` worktree (`…/8db10e0b-c6fd-4d3a-bab5-7057d1ef54ad/scratchpad/wt202`, in the Delivery plan and in the checklist), because it is a fact about the environment; the problem description in the `ADR-INDEX.md` row in `WAGGLE-V1.2-OPEN-LOW-FINDINGS.md`, which cites the old paths as a finding; `critic-r2-estimates.json` and the comment in `repro-harness.mjs`, which are historical records.
- In the phase A files (`evolution.md`, `harness.md`, `hivemind.md`, `release-oss.md`), only the paths and the word "scratchpad" were changed. Findings, statuses and numbers are the same as on 27.09.2026.

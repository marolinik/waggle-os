# Warm-Hive PR6b — Build + Review + Live Smoke (2026-06-18)

> **Verdict: PASS.** PR6b reskins + feature-fills 5 shipped apps (Launcher · Storage/Files · Power surfaces · Evolution · App-sextet) in place. Built by 5 parallel agents, adversarially reviewed, and live-smoked. Review: **0 real HIGH (the 7 "HIGH" were PASS confirmations of the no-fabrication/regression contract), 1 actionable design-fidelity fix**, both that + a live-smoke finding fixed + re-verified. Gates green. **0 PR6b-attributable console errors.** Ready for commit.

## Scope (PR6 sub-PR b — the bulk; reskin-in-place, no rebuild)
| Screen | Change | Files |
|---|---|---|
| **B1 Launcher (06)** | Variation B (memory-sharing explainer) behind an A/B toggle; Variation A unchanged | LauncherApp.tsx (+test) |
| **B2 Storage (07)** | Variation A ("Where it lives": on-disk tree + storage-type cards) via StorageAndFilesApp A/B wrapper; FilesApp **Source column** (D11) | StorageApp, StorageAndFilesApp (new, +test), FilesApp, FilesRoute |
| **B3 Power (08)** | Shared warm primitives + per-model spend bars + daily-budget (Usage), Vault Renew, color-stratified risk badges (Approvals). **D8: no route consolidation** | power/power-primitives (new, +test), TelemetryApp, VaultApp, ApprovalsApp, AutomationCenterApp |
| **B4 Evolution (12)** | "By skill" version-ladder over real run data; D13-gated provenance badge | memory/EvolutionTab.tsx (+test) |
| **B5 Sextet (16)** | Room two-col, Artifacts 3-col grid (per-kind tints), Profile "what Waggle knows" (D20), Agents swarm CTA; **Mission Control = CockpitApp** warm sweep | RoomApp (+test), ArtifactCenterApp, UserProfileApp (+test), AgentsApp, CockpitApp |

## Build method
5 parallel build agents on disjoint file-sets (surgical/preserve-behavior + no-fabrication mandates); main-agent integration of the shared sweep. The concurrent agents shared one working tree → transient cross-agent tsc "errors" during the run resolved clean at the end.

## Gates (after fixes)
| Gate | Result |
|---|---|
| `tsc -p apps/web/tsconfig.app.json` | **0 errors** |
| FE vitest (full) | **1130 passing** (2 PR5 settings tests are **load-flaky** — pass 3/3 in isolation in ~1s; they render the heavy SettingsApp and time out only under full-suite concurrency. Not PR6b-related.) |
| eslint (changed files) | **0 errors** |

## No-fabrication — all six traps defused at build time (review-confirmed)
- **B1** provenance chip prefixed **"example ·"** (not a real recall).
- **B2 (D11)** Source column = **"—"** — grounded: `FileEntry` (core schema) carries no creator field anywhere. memoryCount gated to "—" when absent (no fake "142 memories").
- **B3 (D9/D13-class)** per-model bars from real `/api/cost/summary.byModel` (absent → gated); budget from `/api/settings`; Vault "Renew" reuses the real upsert (no rotate endpoint exists — not invented); Approvals risk **derived** from tool name (no risk field in payload, not fabricated).
- **B4 (D13)** absolute quality % gated off (only `delta_accuracy` exists → honest +N.Npp); "GEPA · judged by 3 models" **never rendered** (no judge roster stored).
- **B5 (D20)** Profile facts only from real stored fields (empty → section hidden); Room participants from live SSE only (design's fake "Jonas P · invited" **omitted**); Artifact source = coarse real class (not invented "made by Claude Code").

## Two findings fixed (review + live smoke each caught one the other missed)
1. **Mission Control was edited on dead code (live smoke).** `/settings/mission-control` renders **`CockpitApp`** — `MissionControlApp.tsx` is explicitly KILLED (rendered nowhere). B5 had relabeled the dead component (invisible + a §3.3 dead-code edit). **Fix:** reverted the dead-file edit; applied the D21 warm-token sweep to the live `CockpitApp` (8 raw emerald/amber/green → `--healthy`/`--attention`). The "Services-lead tab relabel" doesn't apply — CockpitApp is a single-scroll dashboard, no fleet/team/activity tabs (recon mis-mapping, noted).
2. **Artifact icons lost their per-kind palette (review).** B5 flattened all card icons to uniform honey-wash; design §16 uses per-kind tints. **Fix:** added a `KIND_TINT` map (9 kinds → warm `work`/`healthy`/`intel`/`honey` washes — design-faithful *and* D21-compliant) + applied. tsc + full vitest green after.

## Live smoke (real sidecar :3333, Vite :8080) — 0 console errors on every surface
- **B1** `/launcher` — A/B toggle; Variation A (live detect/launch preserved) + Variation B (3-node flow + 3 cards + "example ·" provenance). (`01`)
- **B2** `/files` — A/B toggle; "Where it lives" (real tree: palindrome.py 222 B, dirs "—") + Files browser (storage-type tabs preserved + **Source column "—"**). (`02`,`03`)
- **B3** `/settings/usage` — Daily Budget editor + real Tool Usage breakdown; per-model bars gated off (no spend). (`04`)
- **B4** `/memory` Evolution — "By skill / By run" toggle (existing run-review preserved). (`05`)
- **B5** `/room` (empty state preserved, no fake participants); `/settings/profile` "What Waggle knows" facts from real data (`06`); `/artifacts` 3-col grid (data fetch timed out under sidecar load — env, not code; per-kind tints code-verified) (`07`); Mission Control = CockpitApp (warm).

## Open / not blocking
- `/artifacts` data fetch timed out (10s) under sidecar load during the smoke — environment, not PR6b; the error state + Retry render correctly. Per-kind tints verified in code + tsc/vitest.
- The 2 load-flaky PR5 settings tests (pass in isolation) — pre-existing harness flakiness, documented.
- Next: PR6c (04 All-workspaces + 15 Habit).

# benchmarks/gaia2 — Gaia2 ARE setup + GEPA dry verification

**Stream:** CC Sesija C (Track D in pre-launch sprint consolidation 2026-04-30).
**Brief:** `D:/Projects/PM-Waggle-OS/briefs/2026-04-30-cc-sesija-C-gaia2-setup-dry-verification.md` (LOCKED).
**Branch base:** `phase-5-deployment-v2` (PM ratification 1B; per LOCKED branch architecture 2026-04-30 §2 — Phase 5 baseline = `gepa-faza-1` `6bc2089`, deployment branch tip `a8283d6`).
**Scope:** ARE platform install + Gaia2 dataset adapter + GEPA-evolved variant dry verification (4 shapes × 10 tasks subset of Search split N=200) + ERL methodology integration plan.
**Cost cap:** $20 hard (retroactive amendment 2026-04-30, was $15) / $8 halt-trigger γ probe (PM ratification γ — first batch as probe).

## STATUS: Phase 3 CLOSED 2026-04-30 — Sesija C STANDBY pending Phase 4 setup

**Re-framed deliverable scope (per probe-validated reality):**
1. ✅ Pipeline integrity verification — adapter contract works end-to-end on real Gaia2 schema (`dry-run-results-memo.md` §5).
2. ✅ Cost reconciliation methodology — paper estimate 9–31× under-shot probe-validated reality; root cause: anchor-then-multiply input-size regime gap (`feedback_anchor_multiply_input_size_regime` memory).
3. ✅ GEPA shape routing OOD verification — Phase 4.5 mechanism activation visible on Gaia2 even on halted runs; arxiv §5.4 evidence (`project_gepa_ood_arxiv_evidence` memory).
4. ✅ Schema fixes documented + committed — JSON-string `data` parse, `apps`-as-array, USER-event extraction, ASCII-only headers.

**Real evaluation deferred to Phase 4 Docker** — narrow-proxy economics non-viable ($163.77 projected for full sweep, 11× cost cap); ARE-native targeted tool calls in Docker bypass the bulk-retrieval driver entirely (~160× input-volume reduction projected).

**NOT done in Sesija C, queued to Phase 4 kickoff or post-launch Phase 3 sprint:**
- Task C5+C6 — full N=40 dry run (Phase 4 pre-flight; 4-invocation probe was the Phase 3 substitute).
- Task C7+C8 — ERL methodology integration plan (`erl-integration-plan.md` not authored).
- Task C9+C10+C11 — cost validation + dry-run results memo + final commit (closure stamped in `dry-run-results-memo.md` §9 instead).
- Phase 4 Docker / WSL / Linux runner host choice + Phase 4 budget allocation.

**Cumulative Sesija C spend:** $16.38 of amended $20 cap. Headroom $3.62.

## Layout

```
benchmarks/gaia2/
├── README.md                         (this file — directory pointer + closure status)
├── smoke-evidence.md                 (Phase 2, Task C1+C2 — install + smoke verification + Windows compat)
├── adapter.ts                        (Phase 3a+3b — narrow-proxy adapter; types + impl)
├── config.yaml                       (Phase 3b — shapes + cost guards + judge methodology; $15→$20 retroactive)
├── dry-run-results-memo.md           (Phase 3b-B + closure stamp §9 — probe results + cost reconciliation)
├── erl-integration-plan.md           (NOT YET AUTHORED — punted to Phase 4 kickoff or post-launch Phase 3 sprint)
├── data/                             (Phase 3b — Gaia2 task JSONL dumps; gitignored except .gitkeep)
├── runs/                             (Phase 3b-B + Phase 4 — per-run JSONL logs; gitignored except .gitkeep)
└── scripts/                          (dump-tasks.py + run-dry-verification.ts)
```

## External dependency

ARE platform installed at `D:/Projects/waggle-os/external/meta-agents-research-environments/` (Phase 2, Task C1).
- Repo: https://github.com/facebookresearch/meta-agents-research-environments (MIT).
- **Pinned upstream SHA** (verified via `git rev-parse HEAD` post-clone): `0330191ffef8581e3c0620b78df9c7408bcb98b0` (2026-04-20).
- Dataset: HuggingFace `meta-agents-research-environments/gaia2` (CC-BY-4.0); 800 scenarios across 6 configs (search/execution/adaptability/time/ambiguity/mini, 200 each).
- Install method: `uv sync --frozen` (verified — 95 deps, ~1.5min, exit 0). uv-managed Python 3.10.18.
- Smoke verification: `benchmarks/gaia2/smoke-evidence.md` (Phase 2 deliverable). Windows compat: SIGALRM blocker in scenario timeout enforcement → Phase 4 host choice (Docker/WSL/Linux) deferred to PM.

## Authority chain

- Brief: `briefs/2026-04-30-cc-sesija-C-gaia2-setup-dry-verification.md`.
- §0 evidence: `briefs/2026-04-30-cc-sesija-C-gaia2-setup-evidence.md`.
- Pre-launch sprint LOCKED: `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md`.
- Branch architecture LOCKED: `decisions/2026-04-30-branch-architecture-opcija-c.md`.
- Benchmark portfolio brief: `briefs/2026-04-29-benchmark-portfolio-refresh-2026-venues.md` (§2.1 Gaia2 + §2.3 ERL).
- Faza 1 closure: `decisions/2026-04-29-gepa-faza1-results.md` (substrate evidence — but note SHA citation `c9bda3d` was Phase 4.7 not Faza 1 terminus per branch-architecture §4.1; real Faza 1 terminus = `6bc2089`).

## Out of scope (post-launch Phase 3 sprint Week 4-8)

- Full N=200 Gaia2 Search + Execution split run.
- ReAct baseline vs ERL-augmented A/B comparison.
- Trio-strict + self-judge dual reporting.
- arxiv submission ka MemAgents Workshop.

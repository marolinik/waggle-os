# benchmarks/gaia2 — Gaia2 ARE setup + GEPA dry verification

**Stream:** CC Sesija C (Track D in pre-launch sprint consolidation 2026-04-30).
**Brief:** `D:/Projects/PM-Waggle-OS/briefs/2026-04-30-cc-sesija-C-gaia2-setup-dry-verification.md` (LOCKED).
**Branch base:** `phase-5-deployment-v2` (PM ratification 1B; per LOCKED branch architecture 2026-04-30 §2 — Phase 5 baseline = `gepa-faza-1` `6bc2089`, deployment branch tip `a8283d6`).
**Scope:** ARE platform install + Gaia2 dataset adapter + GEPA-evolved variant dry verification (4 shapes × 10 tasks subset of Search split N=200) + ERL methodology integration plan.
**Cost cap:** $15 hard / $10 expected halt / $8 probe-driven halt-and-PM trigger (PM ratification γ — first batch as probe).

## Layout

```
benchmarks/gaia2/
├── README.md                         (this file — directory pointer)
├── adapter.ts                        (Phase 3, Task C3 — runRetrievalAgentLoop wrap)
├── config.yaml                       (Phase 3, Task C4 — shapes + cost guards + judge methodology)
├── erl-integration-plan.md           (Phase 5, Task C7+C8 — post-launch Phase 3 sprint plan)
├── dry-run-results-memo.md           (Phase 6, Task C10 — close-out signal for Phase 3 sprint go/no-go)
├── runs/                             (Phase 4, Task C5 — per-run JSONL logs; <ISO_date>/ subdirs)
└── scripts/                          (helper scripts as needed)
```

## External dependency

ARE platform installed at `D:/Projects/waggle-os/external/meta-agents-research-environments/` (Phase 2, Task C1).
- Repo: https://github.com/facebookresearch/meta-agents-research-environments (MIT).
- Dataset: HuggingFace `meta-agents-research-environments/gaia2` (CC-BY-4.0).
- Install method: `uv` (verified available `uv 0.8.17`); fallback `pip install meta-agents-research-environments`.

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

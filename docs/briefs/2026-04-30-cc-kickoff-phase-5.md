# CC Kickoff — Phase 5 Deployment §0 Preflight

**Date:** 2026-04-30
**For:** Marko (paste-ready prompt za fresh CC sesiju)
**Stream:** CC-1 (agent fix sprint, sad re-deployed za Phase 5 deployment)
**Expected wall-clock:** 1-2h za §0 preflight aggregation (sva 4 BLOCKING gates)

---

## §1 — Setup pre CC kickoff (Marko-side, 5 min)

Pre nego sto pokrenes CC, proveri:

1. **Working tree clean** u `D:\Projects\waggle-os` (`git status` pokazuje no uncommitted changes; ako ima, commit ili stash pre Phase 5 kickoff).

2. **Branch:** ostani na `main` ili kreiraj `phase-5-deployment` granu. Recommendation: dedicated grana (`git checkout -b phase-5-deployment`) tako da §2.3 rollback procedura ima jasan revert target.

3. **Pre-deployment SHA pin:** zapamti current `git rev-parse HEAD` — to ce biti `phase_5_pre_deployment_sha` u manifestu (per §0.4 #1).

---

## §2 — CC kickoff prompt (paste below into fresh CC session)

```
PHASE 5 DEPLOYMENT KICKOFF — §0 PREFLIGHT EXECUTION

Brief LOCKED: D:/Projects/PM-Waggle-OS/briefs/2026-04-29-phase-5-deployment-brief-v1.md

Pre nego sto krenes u bilo kakvu code action, ucitaj sledece u redosledu:

1. Brief: D:/Projects/PM-Waggle-OS/briefs/2026-04-29-phase-5-deployment-brief-v1.md
2. Brief LOCKED memo: D:/Projects/PM-Waggle-OS/decisions/2026-04-29-phase-5-brief-LOCKED.md
3. Scope LOCK: D:/Projects/PM-Waggle-OS/decisions/2026-04-29-phase-5-scope-LOCKED.md
4. Faza 1 closure: D:/Projects/PM-Waggle-OS/decisions/2026-04-29-gepa-faza1-results.md

Tvoj zadatak je iskljucivo §0 preflight evidence collection. NE pocinjes §2 deployment dok PM (Marko) ne ratifikuje preflight evidence.

§0 deliverables (sva 4 BLOCKING):

§0.1 — Substrate readiness grep:
- Verify REGISTRY u packages/agent/src/prompt-shapes/selector.ts ima base shapes claude/qwen-thinking/qwen-non-thinking/gpt
- Verify registerShape kanonski API exportovan iz selector.ts I preko index.ts barrel
- Run full test suite, beleži pass/fail count (target ≥265/265)
- Verify manifest v7 SHA terminus fa716ff9 reachable: git merge-base --is-ancestor fa716ff9 HEAD
- Grep da nema orphaned references na gpt::gen1-v2 u Phase 5 deployment artifacts (allowed samo u audit anchors)

§0.2 — Config inheritance audit:
- Emit explicit differential tabelu Faza 1 manifest v7 vs Phase 5 manifest sa 6 redova (temperature, max_tokens, judge_model_primary, evaluation_corpus_source, failure_mode_taxonomy, cost_per_request_baseline)
- Implicit defaults forbidden — svaki red mora imati explicit value + justification

§0.3 — Cost projection probe:
- Snapshot Anthropic Opus 4.7 pricing (input/output $/1M tokens) sa source URL + timestamp
- Snapshot DashScope Qwen 35B-A3B pricing isto
- Run 5-request probe per variant (claude::gen1-v1, qwen-thinking::gen1-v1) sa varying complexity prompts; emit probe_per_request_cost_p50, p95, max
- Compute canary_cost_p95_ceiling = 740 × max(p95) × 1.20; verify ≤ $20

§0.4 — Deployment readiness checklist:
- Pin phase_5_pre_deployment_sha u manifest
- Verify monitoring infrastructure stubs functional (JSONL log emitters za Pass II rate, retrieval engagement, latency p50/p95, cost per request, error rate)
- Implement canary toggle mechanism (env var WAGGLE_PHASE5_CANARY_PCT)
- Verify §4 exit criteria locked u manifestu
- Verify halt-and-PM trigger automation wired

Aggregation:
- Commit sva evidence u D:/Projects/waggle-os/gepa-phase-5/preflight-evidence.md sa explicit PASS/FAIL per gate
- Bilo koji FAIL → halt-and-PM, ne self-advance
- Sva 4 PASS → emit "PHASE 5 §0 PREFLIGHT COMPLETE — awaiting PM signoff" + commit

Cost cap za §0: $0.30-0.50 (probe). Hard cap §0 alone: $1.00.

Halt-and-PM triggers:
- Bilo koji §0 sub-gate FAIL
- Cost overshoot >$1.00 u §0
- Discovery van scope-a (npr. registry shape ne postoji, fa716ff9 unreachable, orphaned gpt references found)

NE pocinjes §1-§5 implementation pre PM (Marko) ratifikacije §0 evidence.
```

---

## §3 — Šta ja (PM) radim paralelno

Dok CC pokrece §0 preflight, ja krecem arxiv §5.4 outline refresh per dogovor. Standby za:

1. CC §0 preflight evidence emission (~1-2h od kick-off)
2. Tvoj signal "preflight evidence pristigao" — ja onda QA-ujem evidence (cross-check grep results, validate cost projection, verify config differential block completeness)
3. PM signoff "preflight ratifikovan" → CC unblock-uje §2 deployment
4. Tvoja ratifikacija canary kick-off (per §7.3 decision point)

---

## §4 — Halt-and-PM cascade

Ako CC emit-uje halt-and-PM tokom §0 (npr. registerShape API ne postoji ili fa716ff9 nije reachable):

1. CC commit-uje halt evidence
2. Tvoj signal "halt fired" — ja procenjujem severity
3. Ako fix je trivial (npr. test count je 250 ne 265 jer je dodato 15 novih tests, ne regression) — amend brief inline + CC nastavi
4. Ako fix je not-trivial (npr. fa716ff9 unreachable, scope LOCK substrate gone) — escalate decision

---

## §5 — Quick reference: ključne tačke iz brief-a

- **Scope LOCKED:** claude::gen1-v1 + qwen-thinking::gen1-v1; gpt::gen1-v2 deferred Faza 2 N=16
- **Cost cap:** $25 hard / $20 halt / $8-13 expected
- **Wall-clock:** 2-4 dana CC implementation, 7 dana min canary observation, 30 dana production-stable
- **Canary gradient:** 10% Day 0 → 25% Day 1-2 → 50% Day 3-5 → full enable Day 5+
- **Full enable AND-gate:** ≥7 dana AND ≥30 samples per variant per metric
- **Manifest v7 SHA terminus:** fa716ff9
- **Binding feedback rules:** epsilon inclusive boundary (1e-9), external contract validation (registerShape canonical API), cost projection real anchoring (3-element + probe ±20%), substrate readiness gate (§0 grep evidence), config inheritance audit (explicit differential), brief wall-clock discipline (projection NOT trigger)

---

**Spreman za pokretanje. Paste prompt iz §2 u fresh CC sesiju.**

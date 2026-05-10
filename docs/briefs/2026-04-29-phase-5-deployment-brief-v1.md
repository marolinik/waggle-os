# CC Brief — Phase 5 Deployment (GEPA-evolved variants)

**Brief ID:** `phase-5-deployment-v1`
**Author:** PM
**Date:** 2026-04-29
**Status:** **LOCKED 2026-04-29** — Marko ratifikovao "sve ok idemo dalje"
**Ratification timestamp:** 2026-04-29 (PM session)
**Scope LOCK upstream:** `decisions/2026-04-29-phase-5-scope-LOCKED.md`
**Faza 1 closure upstream:** `decisions/2026-04-29-gepa-faza1-results.md`
**Manifest v7 SHA terminus upstream:** `6bc2089` (Faza 1 Checkpoint C closure; verified 2026-04-30 via `git rev-parse 6bc2089`)
**Phase 5 deployment branch:** `phase-5-deployment-v2` (created from `gepa-faza-1` 2026-04-30; replaces deleted `phase-5-deployment` per Opcija C decision)
**Branch architecture decision:** `decisions/2026-04-30-branch-architecture-opcija-c.md` (Opcija C ratifikacija — Phase 5 inherits Faza 1 work, NE Phase 4 long-task fixes; mitigation via §3 monitoring + selective cherry-pick option)
**Cost ceiling:** $75 hard cap, $60 halt trigger, $35-45 expected (AMENDED 2026-04-30 per `decisions/2026-04-30-phase-5-cost-amendment-LOCKED.md` based on §0.3 probe-validated reality $38.34; original v1: $25/$20/$8-12 superseded)
**Wall-clock projection (NOT trigger):** 2-4 dana wall-clock za CC implementation; canary observation window minimum 7 kalendarskih dana **AND** minimum 30 evaluation samples per variant per metric (oba uslova moraju da budu zadovoljena pre full enable; effective wall-clock floor je `max(time_to_reach_7_days, time_to_reach_30_samples)`)

---

## §0 — Pre-flight gates (BLOCKING — must PASS before §2)

Ovaj odeljak postavlja kanonski substrate-readiness, config-inheritance, cost-projection i deployment-readiness checklist koji CC mora prosledi pre bilo kakvog deploy artifacta. Svaki gate emituje `PASS` ili `FAIL` sa eksplicitnom evidencijom commit-ovanim u `gepa-phase-5/preflight-evidence.md`. **Bilo koji `FAIL` → halt-and-PM, ne self-advance.**

### §0.1 — Substrate readiness grep (BLOCKING)

CC mora dokumentovati sledeću evidenciju sa eksplicitnim file:line citacijama:

1. `REGISTRY` u `packages/agent/src/prompt-shapes/selector.ts` mora sadržati base shapes `claude`, `qwen-thinking`, `qwen-non-thinking`, `gpt`. Phase 5 NE menja base shapes; dodaje **ima-prostora-prefiks varijante** preko `registerShape(name, shape)` kanonskog API-ja (per `feedback_external_contract_validation` rule + Faza 1 Amendment 8 ESM module-identity discovery).

2. `registerShape` kanonski API mora biti exportovan iz `selector.ts` i preko barel `index.ts` (pod-rule iz Amendment 8: dual-repo fix). Direct `(REGISTRY as any)['gen1-v1']` mutation je **forbidden**; mora ići preko `registerShape('claude::gen1-v1', shape)`.

3. Na origin/main HEAD mora biti `265/265` ili noviji test broj passing. Pre Phase 5 deployment grane CC pokreće `git rev-parse HEAD` i full test suite, beleži rezultat u preflight-evidence.

4. Manifest v7 (`gepa-phase-5/manifest.yaml` koji CC autorizuje u §1) mora referencirati Faza 1 closure SHA terminus `6bc2089`. Ako HEAD ode dalje pre Phase 5 kick-off, CC mora reachability-proverkom (`git merge-base --is-ancestor 6bc2089 HEAD`) potvrditi da je Faza 1 commit-chain još intact.

5. CC mora grep-om dokazati da **nema orphaned references** na `gpt::gen1-v2` u deployment artifactsima Phase 5 (per scope LOCK: gpt withheld). Allowed reference samo u §8 audit anchors kao "deferred Faza 2".

**Gate verdict:** §0.1 PASS samo ako svih 5 stavki ima eksplicitnu file:line evidenciju + git output.

### §0.2 — Config inheritance audit (BLOCKING)

Phase 5 nasleđuje od Faza 1 manifest v7, ali **task-type je drugačiji** (Phase 5 = production deployment + monitoring; Faza 1 = evolution + held-out validation). Per `feedback_config_inheritance_audit` rule, CC mora explicit emitovati config differential block u preflight-evidence:

| Field | Faza 1 manifest v7 value | Phase 5 manifest value | Justification ako se razlikuje |
|---|---|---|---|
| `temperature` | (faza 1 evolution-time setting) | (production setting) | production usually lower variance |
| `max_tokens` | (faza 1 setting) | (production setting) | should align with retrieval engagement Phase 4.5 finding |
| `judge_model_primary` | MiniMax M2.7 | (production: same? deferred?) | cost vs quality trade-off |
| `evaluation_corpus_source` | Phase 4.5 + Checkpoint C held-out | Production traffic (live) | inherent task-type shift |
| `failure_mode_taxonomy` | Faza 1 Amendment 4 texture audit | Production rollback triggers | new mapping required |
| `cost_per_request_baseline` | Probe-validated Faza 1 | Probe-validated Phase 5 (re-probe) | cost may shift sa production load patterns |

**Gate verdict:** §0.2 PASS samo ako svih 6 row-ova ima explicit value + justification commentar. Implicit defaults forbidden.

### §0.3 — Cost projection probe (BLOCKING — per `feedback_cost_projection_real_anchoring` rule)

CC mora pre Phase 5 deployment kick-off-a izvršiti **3-element decomposition probe** sa real model pricing × volume estimate × per-request cost:

1. **Model pricing snapshot** — Anthropic Opus 4.7 input/output rates (current 2026-04-29) za claude::gen1-v1 deployment; DashScope Qwen 35B-A3B rates za qwen-thinking::gen1-v1. Citira pricing source (URL ili docs reference) sa snapshot timestamp.

2. **Volume estimate** — canary phase volume target (recommendation: 50 requests / day za prvih 5 dana × 2 variants = 500 total requests canary phase). Production volume target: TBD pre full enable, kao deo §4 exit criteria.

3. **Per-request probe** — CC pokreće 5-request probe na svaki variant pre full canary, beleži `probe_per_request_cost_p50`, `probe_per_request_cost_p95`, `probe_per_request_cost_max`. Probe sample mora biti reprezentativan (varying complexity, ne sve trivialne queries).

4. **Cost projection emission** — formula:
   ```
   canary_cost_estimate = volume_target × probe_p50 × 1.20  (+20% buffer)
   canary_cost_p95_ceiling = volume_target × probe_p95 × 1.20
   ```

5. **Ceiling validation** — `canary_cost_p95_ceiling ≤ $20` mora držati. Ako ne, halt-and-PM za scope re-evaluation (smanji volume target ili pivot variant priority).

**Gate verdict:** §0.3 PASS samo ako su sve 5 stavki dokumentovane sa numerical evidence; pricing snapshot URL + timestamp; probe outputs commit-ovani.

### §0.4 — Deployment readiness checklist (BLOCKING)

Pre §2 deployment, CC mora potvrdi:

1. **Rollback SHA pinned** — pre kick-off-a CC zapisuje `git rev-parse HEAD` kao `phase_5_pre_deployment_sha` u manifest. Bilo koji rollback ide preko `git revert` ili `git reset --hard` ka tom SHA. **Forbidden:** rollback preko in-place file overwrites.

2. **Monitoring infrastructure live** — §3 monitoring metrics moraju biti emitovane (basic stub-ovi OK ali ne smeju biti no-op) pre canary kick-off-a. CC mora pokazati da `Pass II rate`, `retrieval engagement`, `latency p50/p95`, `cost per request` outputi postoje u JSONL log lokaciji koju §3 specifikuje.

3. **Canary toggle mechanism** — feature flag ili env var koji omogućava gradual rollout (npr. `WAGGLE_PHASE5_CANARY_PCT=10` što znači 10% production traffica routed kroz GEPA-evolved variants, ostatak na pre-Phase-5 baseline). CC pokazuje implementation u kodu + dokazuje da se toggle može flip-ovati bez redeploy.

4. **Pre-registered exit criteria locked** — §4 mora biti commit-ovan pre canary kick-off-a. Bilo koja mid-flight izmena zahteva amendment + Marko ratifikaciju (per `feedback_substrate_readiness_gate` discipline).

5. **Halt-and-PM triggers active** — §3 threshold alerts moraju biti wired tako da automatski emit halt request ako bilo koji rollback trigger fire. Forbidden: silent degradation.

**Gate verdict:** §0.4 PASS samo ako svih 5 stavki ima evidence + functional verification (ne samo "code present").

### §0 verdict aggregation

Sva 4 sub-gate-a moraju emitovati PASS pre nego što CC krene u §2. Aggregation:

```
§0_verdict = §0.1 AND §0.2 AND §0.3 AND §0.4
```

Bilo koji `FAIL` → halt-and-PM sa preflight-evidence commit + explicit `FAIL` reason u commit message.

---

## §1 — Scope declaration (LOCKED)

**Phase 5 deployment obuhvata dva GEPA-evolved varianta:**

1. `claude::gen1-v1` — produkt Faza 1 Gen 1 evolution-a. Substrate evidence: 100% Pass II combined N=13 (8 in-sample + 5 held-out), 0pp held-out gap, +12.5pp Pass II vs claude::base na in-sample. §F.5 cond_2 overfitting bound check: PASS (0pp gap < ±15pp bound).

2. `qwen-thinking::gen1-v1` — produkt Faza 1 Gen 1 evolution-a. Substrate evidence: retrieval engagement 2.231 = 96% Opus parity 2.33, +12.5pp Pass II quality on N=13, 0pp held-out gap. **Phase 4.5 mechanism CONFIRMED out-of-distribution** (Faza 1 closure §F.5 cond_2 verdict). To je ključan KVARK enterprise pitch scientific anchor i arxiv §5 evidence.

**Withheld iz Phase 5:**

- `gpt::gen1-v2` — selection-biased na in-sample (in-sample +25pp → held-out +5pp = 20pp gap > ±15pp overfitting bound). WITHHELD do Faza 2 N=16 re-validacioni run. Methodology working as designed (held-out exposed bias pre deployment), ne failure.

**Authorities:**

- Scope ratifikovan Marko 2026-04-29 ("da") na PM predlog `decisions/2026-04-29-phase-5-scope-LOCKED.md`.
- Audit chain: `decisions/2026-04-29-gepa-faza1-results.md` § B-C verdict tabele + manifest v7 SHA terminus `6bc2089`.

**No-substitution rule:** Bilo koja izmena Phase 5 scope-a (dodavanje gpt, swap variants, drugi Generation) zahteva novi LOCKED decision memo + Marko ratifikaciju. CC mora halt-and-PM ako mid-flight discovery sugeriše scope changes.

---

## §2 — Deployment plan

### §2.1 — Canary phase

CC implementira canary toggle (per §0.4 #3) sa **gradient rollout**:

1. **Day 0** (kick-off): canary_pct = 10% za oba varianta paralelno. Observation window 24h pre incrementa.
2. **Day 1-2** (assuming no rollback trigger): canary_pct = 25%. Observation 48h.
3. **Day 3-5** (assuming no rollback trigger): canary_pct = 50%. Observation 72h.
4. **Day 5+** (assuming all §4 promotion criteria met): full enable kandidat (vidi §2.2).

Tokom canary, baseline (pre-Phase-5) variants ostaju active na komplementarnom % traffic-a. To omogućava A/B paired comparison u §3 monitoring.

### §2.2 — Full enable trigger

Full enable (canary_pct = 100%) može krenuti samo ako **sva tri** uslova drže paralelno:

1. Svi §4.1 promotion criteria PASS-uju per pre-registered thresholds.
2. Prošlo je ≥7 kalendarskih dana od canary kick-off-a.
3. Akumulirano je ≥30 evaluation samples per variant per metric.

Effective wall-clock floor je `max(7_days_floor, 30_samples_floor)` — whichever uslov je sporiji da se zadovolji odredjuje promociju. Sample floor je hard guard protiv small-sample-effect stage promotion (npr. ako traffic je nizak i 30 samples zahteva 12 dana, čeka se 12 dana, ne 7).

### §2.3 — Rollback procedura

Trigger uslovi za rollback definisani u §4. Procedura:

1. CC ili automation emit `ROLLBACK_REQUESTED` log entry sa `trigger_reason` field.
2. CC izvršava `git checkout phase_5_pre_deployment_sha -- <variant_files>` ili `git revert <deployment_commit_sha>` (whichever primenjivo).
3. CC verifikuje `git diff phase_5_pre_deployment_sha HEAD` returns empty na variant files.
4. CC re-runs full test suite, mora biti `265/265` ili više passing.
5. CC commit-uje rollback sa `[ROLLBACK] Phase 5 — <variant> — <trigger_reason>` message.
6. CC emit halt-and-PM sa rollback evidence link.
7. PM (Marko + ja) decide naredne korake (re-attempt sa amendment, abandon variant, escalate to Faza 2 redo).

**No silent rollback.** Sve rollback events ulaze u `gepa-phase-5/rollback-log.jsonl`.

---

## §3 — Monitoring infrastructure

CC implementira monitoring koji emit-uje sledeće metrike u JSONL log u `gepa-phase-5/monitoring/<ISO_date>/<variant>.jsonl`. Svaki entry: `{ts, variant, request_id, metric_name, metric_value, baseline_comparison?}`.

### §3.1 — Required metrics

1. **Pass II rate** — moving 10-sample window per variant. Threshold alert ako variant_pass2 < baseline_pass2 - 5pp (consecutive 2 windows).

2. **Retrieval engagement** — per-request retrieval call count + retrieval depth. Threshold alert ako variant_retrieval < baseline_retrieval × 0.80 (consecutive 3 windows). Phase 4.5 mechanism baseline reference: qwen-thinking::gen1-v1 ima 2.231 retrieval mean (Faza 1 evidence).

3. **Latency p50, p95** — per-request wall-clock. Threshold alert ako variant_p95 > baseline_p95 × 1.50.

4. **Cost per request** — per-request USD ceiling. Threshold alert ako rolling 24h variant_cost > baseline_cost × 1.30.

5. **Error rate** — per-variant `agent_error_rate` (loop_exhausted, timeout, parse_fail, other). Threshold alert ako variant_error > baseline_error + 3pp (consecutive 24h).

### §3.2 — Threshold alert routing

Svaki threshold alert emit-uje `THRESHOLD_BREACH` log entry + writes `phase-5-alerts/<ISO_date>.jsonl`. Ako alert je rollback-trigger (§4), automation poziva §2.3 rollback proceduru.

### §3.3 — Observation cadence

PM-side reading cadence: 1× dnevno tokom canary phase prvih 5 dana, zatim 2× nedeljno. CC scheduled task emit-uje daily summary u `phase-5-daily-summary/<ISO_date>.md` sa key metric snapshot + alert log.

### §3.4 — Dashboard reference

Stage 1 implementation: JSONL fajlovi + daily markdown summary (no UI). Stage 2 (deferred, post-launch): dashboard u admin-web ako bandwidth dozvoli.

---

## §4 — Pre-registered exit criteria (BIND)

Sledeći thresholdi su **pre-registrovani** i ne mogu biti revisited mid-flight bez amendment + PM ratifikacije.

### §4.1 — Promotion criteria (canary → full enable)

Variant prelazi u full enable status ako svih 5 uslova PASS-uju:

1. **Pass II rate ≥ baseline + 0pp − ε** (per `feedback_epsilon_inclusive_boundary` rule, ε = 1e-9). Cilj: regression-free promotion. Stretch goal +5pp ali ne blok.

2. **Retrieval engagement: variant ≥ baseline × 0.80** za qwen-thinking; **variant ≥ baseline** za claude. Differential rationale: qwen-thinking je Phase 4.5 mechanism-validated retrieval-driver, baseline reference je relevant; claude::gen1-v1 evolution drugog tipa.

3. **Latency p95: variant ≤ baseline × 1.20** (acceptable variance bandwidth).

4. **Cost per request: variant ≤ baseline × 1.15** (per real-anchored projection rule).

5. **Error rate: variant ≤ baseline + 1pp** (regression-free error budget).

Wall-clock floor: `min(7 dana since canary kick-off, ≥30 samples per metric)`.

### §4.2 — Rollback triggers (immediate)

Bilo koji od sledećih → automatski rollback per §2.3:

1. Pass II rate: variant < baseline − 10pp (consecutive 2 windows of 10-sample each).
2. Error rate: variant > baseline + 5pp (consecutive 24h).
3. Cost per request: variant > baseline × 2.0 (immediate, single-window).
4. Latency p95: variant > baseline × 3.0 (immediate, single-window).
5. Manual halt-and-PM trigger ako Marko ili PM observe anomaly van threshold-a.

### §4.3 — Production-stable definition

Variant achieve-uje "production-stable" status ako po full enable:

1. 30 dana zero rollback events.
2. All 5 §4.1 metrics maintained within pass bands.
3. Zero halt-and-PM trigger emissions.

Production-stable status unblock-uje §6 cross-stream dependencies (Landing v2 swap, arxiv §5 evidence push, KVARK pitch deck integration).

### §4.4 — No-revisit-without-amendment binding

Sve §4.1, §4.2, §4.3 thresholdi su LOCKED. Ako tokom Phase 5 CC discover-uje da neki threshold treba relaxation ili tightening, halt-and-PM proceduru sa amendment proposal. Marko ratifikuje, novi LOCKED memo, restart canary phase ako threshold change znači redo. Per Faza 1 Amendment 11 terminal_calibration_clause precedent.

---

## §5 — Cost projection (real-anchored)

Per `feedback_cost_projection_real_anchoring` rule, sledeća projekcija je three-element decomposition. **Sve brojke su projection do §0.3 probe-validation; CC overrides ovu sekciju sa probe-actuals u preflight-evidence.**

### §5.1 — Model pricing reference (snapshot 2026-04-29)

| Model | Input $/1M tokens | Output $/1M tokens | Source |
|---|---|---|---|
| Anthropic Opus 4.7 (claude::gen1-v1 deployment) | TBD-PROBE | TBD-PROBE | docs.anthropic.com/pricing — CC fetches current at §0.3 |
| DashScope Qwen 35B-A3B (qwen-thinking::gen1-v1) | TBD-PROBE | TBD-PROBE | dashscope.aliyun.com/pricing — CC fetches current at §0.3 |

CC mora uneti current pricing u §5.1 tabelu sa snapshot timestamp pre nego što proceed-uje.

### §5.2 — Volume estimate

Canary phase total volume target:

- Day 0-1 (10% canary): ~10 requests/dan × 2 variants × 2 dana = 40 requests
- Day 1-3 (25% canary): ~25 requests/dan × 2 variants × 2 dana = 100 requests
- Day 3-5 (50% canary): ~50 requests/dan × 2 variants × 2 dana = 200 requests
- Day 5+ (100% if promoted): ~100 requests/dan × 2 variants × 2 dana initial = 400 requests
- **Canary phase total** (Day 0-7): ~740 requests across both variants

Production sustained volume (Day 7+): TBD na osnovu actual traffic patterns; re-projected u §4.3 production-stable transition memo.

### §5.3 — Per-request probe-validated cost

CC izvršava §0.3 probe (5 requests per variant) i emit-uje:

```
claude::gen1-v1 probe_per_request_cost_p50 = $X.XX  (TBD)
claude::gen1-v1 probe_per_request_cost_p95 = $X.XX  (TBD)
qwen-thinking::gen1-v1 probe_per_request_cost_p50 = $X.XX  (TBD)
qwen-thinking::gen1-v1 probe_per_request_cost_p95 = $X.XX  (TBD)
```

### §5.4 — Phase 5 cost ceiling computation

```
canary_cost_p50_estimate  = 740 × max(claude_p50, qwen_thinking_p50) × 1.20
canary_cost_p95_ceiling   = 740 × max(claude_p95, qwen_thinking_p95) × 1.20
hard_cap                  = $25
halt_trigger              = $20
```

CC validates `canary_cost_p95_ceiling ≤ $20` u §0.3. Ako prelazi, halt-and-PM za scope re-evaluation.

### §5.5 — Total Phase 5 budget allocation

| Item | USD (projected) |
|---|---|
| §0.3 probe (10 requests total) | $0.30-0.50 |
| Canary phase (Day 0-7) | $5-10 |
| Monitoring infrastructure overhead | ~$0 (logging) |
| Daily summary CC emissions (~7 dana × $0.05) | $0.35 |
| Buffer (unforeseen probes, reproduction runs) | $2-3 |
| **Phase 5 Stage 1 expected total** | **$8-13** |
| Hard cap | $25 |

Cumulative project-wide spend after Phase 5: ~$52-57 of theoretical $115 cap (Faza 1 cap; Phase 5 ima nezavisan budget but track aggregation za Faza 2 headroom forecasting).

---

## §6 — Cross-stream dependencies

Phase 5 production-stable status (§4.3) je trigger za sledeće downstream akcije:

### §6.1 — Landing v2 Proof Card 1 swap

Per `project_landing_v2_basics_2026_04_28` return triggers (12 dokumentovanih), Phase 5 brojevi su highest-probability prvi trigger za Landing iteration:

- Trigger condition: Phase 5 produce production-stable Pass II numbers + retrieval engagement validated samples.
- Action: Update Landing v2.3 Proof Card 1 sa PROVENANCE → BENCHMARK swap (concrete numbers from Phase 5).
- Owner: PM autoring Landing v2.4 brief, claude.ai/design generation.
- Timing: 2-3 nedelje post Phase 5 production-stable transition.

### §6.2 — arxiv §5 evidence integration

Faza 1 §5 evidence + Phase 5 production-stable validation = arxiv §5 publishable narrative:

- §5.1 — Methodology (manifest v7 + 11 amendments transparent narrative).
- §5.2 — Faza 1 results (cross-family generalization, claude + qwen-thinking pass; gpt selection bias scoping).
- §5.3 — Phase 5 production validation (out-of-sample Pass II from real traffic).
- §5.4 — Scoping discussion (4 methodological findings already documented).

Trigger: Phase 5 production-stable + Marko ratifikacija arxiv co-author roster + endorsement contact.

### §6.3 — KVARK enterprise pitch deck

Qwen 35B = Opus-class on Phase 5 production traffic = KVARK pitch deck scientific anchor (already arxiv §5.3 evidence). Pitch deck section: "On-prem Qwen + Waggle harness validated Opus-class on real production traffic, X% retrieval parity, Y% Pass II floor."

Trigger: Phase 5 production-stable + Marko approval pitch deck draft.

### §6.4 — Faza 2 sprint planning

Phase 5 production-stable status + 2 weeks observation = Faza 2 sprint kick-off window. Faza 2 scope:

- gpt::gen1-v2 N=16 re-validation (selection bias resolution).
- qwen-non-thinking deeper investigation (retrieval-quality decoupling characterization).
- generic-simple investigation (necessary-but-not-sufficient retrieval scoping).
- arxiv §5.4 finalization.

Budget headroom: $71.51 (Faza 1 unspent of $115 cap).

---

## §7 — Decision points

### §7.1 — Marko ratifikacija drafted brief

Trigger: PM (ja) emit-ujem v1 brief Marku za critique.
Action: Marko provides critique → PM revisions → v2 → ratification.
Outcome: ratified brief unblocks §0 preflight gates execution.

### §7.2 — PM signoff on §0 preflight evidence

Trigger: CC emit-uje §0 preflight-evidence sa svih 4 sub-gates PASS.
Action: PM (ja) verify evidence completeness, request additional grep ako needed.
Outcome: PM emit "preflight ratified" → CC unblock-uje §2 deployment.

### §7.3 — Canary kick-off trigger

Trigger: §0 PASS + §1-§5 CC implementation complete + §3 monitoring stub functional.
Action: CC emit-uje canary kick-off intent + Marko ratifikuje + canary toggle flip-uje na 10%.
Outcome: Phase 5 LIVE in canary mode.

### §7.4 — Rollback authority

Anyone can trigger rollback bez post-hoc justification:

- §4.2 automatic triggers (no human approval needed, immediate execution).
- PM (ja) ili Marko manual halt-and-PM (full discretion).
- CC observed anomaly outside pre-registered thresholds (CC emit-uje halt request, PM ratifies rollback).

Post-rollback, decision authority on next steps (re-attempt, abandon, escalate Faza 2): PM proposal + Marko ratifikacija.

### §7.5 — Faza 2 sprint planning gate

Trigger: Phase 5 production-stable status (§4.3) + 2 weeks observation.
Action: PM brief autoring za Faza 2 sprint.
Outcome: Faza 2 sprint kick-off (likely 2026-06-XX timeframe).

---

## §8 — Audit trail anchors

### §8.1 — Upstream LOCKED decisions

- `decisions/2026-04-29-phase-5-scope-LOCKED.md` — Phase 5 scope LOCK (this brief implements)
- `decisions/2026-04-29-gepa-faza1-results.md` — Faza 1 closure (568 linija, §A-G structured)
- `sessions/2026-04-29-handoff-faza1-closed-landing-parked.md` — handoff state at brief autoring time

### §8.2 — Faza 1 manifest chain SHA terminus

`6bc2089` — final SHA after 11 amendments. CC verifies reachability via `git merge-base --is-ancestor 6bc2089 HEAD` per §0.1 #4.

### §8.3 — Binding feedback rules applied

- `feedback_epsilon_inclusive_boundary` — §4.1 #1 ε = 1e-9 inclusive boundary applied
- `feedback_external_contract_validation` — §0.1 #2 registerShape canonical API enforced
- `feedback_cost_projection_real_anchoring` — §5 three-element decomposition + probe-validation
- `feedback_latent_bug_unused_parameter` — N/A za Phase 5 brief but applies to CC implementation
- `feedback_substrate_readiness_gate` — §0 grep evidence binding before §2 deployment
- `feedback_config_inheritance_audit` — §0.2 explicit differential block, no implicit defaults
- `feedback_brief_wall_clock_discipline` — wall-clock 2-4 dana labelled "projection NOT trigger"

### §8.4 — Reference to Faza 1 amendments precedent

11 amendments to manifest v7 form precedent za:

- Pre-registration discipline (Amendments 7, 11 calibration clauses)
- Halt-and-PM cascade (4 false-positive averts documented)
- Held-out validation methodology (gpt selection bias caught by held-out, not bug)
- Cross-module-boundary regression test (Amendment 8 ESM module-identity hazard)

Phase 5 inherits ovu disciplinu. Bilo koji mid-flight discovery → halt-and-PM, ne self-advance.

---

## §9 — Brief versioning

- v1 — 2026-04-29 — PM initial draft + 1 QA pass (min/max canary floor logical bug fix u §2.2 i header)
- **LOCKED 2026-04-29** — Marko ratifikovao bez critique items ("sve ok idemo dalje"); v1 immutable, drives CC execution

**Trigger condition za actual CC execution:** CC fresh sesija sa brief load + §0 preflight kick-off + cost probe authorization.

**Amendment policy post-LOCK:** sve mid-flight discoveries → halt-and-PM, nikako self-advance. Per Faza 1 Amendment 11 terminal_calibration_clause precedent.

---

**End of LOCKED brief. Ready for CC handoff.**

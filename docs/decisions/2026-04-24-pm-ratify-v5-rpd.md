# LOCKED — PM-RATIFY-V5-RPD Verdict, INFEASIBLE @ 250 / FEASIBLE @ 2500, Strict Hold

**Date**: 2026-04-24
**Ratified by**: Marko Marković (via PM adjudication)
**PM**: claude-opus-4-7 (Cowork)
**Prerequisite gate**: §1.3c PASS → §1.3e RPD feasibility check pre GATE-D-REKICK-GO

## Odluka

**ACCEPT — strict hold, no conditional self-advance, 48h fallback branch planning aktiviran.** GATE-D-REKICK-GO blokiran do potvrđenog Google ticket approval-a (RPD ≥ 2500). CC-1 ostaje HALTED. Pre-flight RPD verifikacija je obavezna kao prvi korak GATE-D-REKICK-GO sequence-a kada approval stigne.

## Aritmetika (CC-1 §1.3e memo, commit `1d3851d`, SHA `985b035b...`)

Call count derivation:
- `runner.ts:395-545` + `failure-mode-judge.ts:245-258` sequential ensemble ⇒ 1 Gemini call per instance
- `health-check.ts:106-108` ⇒ 1 Gemini call per cell-ping
- 5 cells × (400 + 1 health-check) = **2005 nominal Gemini calls**

Today-cumulative scenario:
- Prior today: 80 calls (probe v1 50 + probe v2 30)
- Stage 3 required: 2005
- Today-total if kicked now: **2085**

Feasibility matrix:
- vs 250 RPD current ceiling: 2085 / 250 = **8.3× over → INFEASIBLE**
- vs 2500 RPD pending approval: 2085 / 2500 = 83% utilization (415 call headroom) → **FEASIBLE**
- Tomorrow-only kickoff (80 prior drops off if window resets): 2005 / 2500 = 80% → comfortable
- Worst-case 3× retry cascade: 6015 calls → **2.4× over even @ 2500** → adversarial scenario breaks

Caveats explicitly acknowledged:
- Google RPD window semantics undocumented (calendar-day reset vs 24h sliding nepoznat)
- Retry math assumes 3× cap; CC-1 default retry policy mora biti audited
- Probe v1+v2 cumulative (80) može ili ne mora da se računa u tomorrow window depending na reset semantiku

## Razlog protiv conditional GATE-D-REKICK-GO (path b)

Race condition risk: pre-execution RPD check pokaže zelen, ali u 30-min mark 800-call deep run pukne na rolling-window 429 cascade. Posledica: $20 budget potrošen na partial dataset koji ne možemo audit-trail dovršiti, nazad na manifest v6 + re-calibration. Mid-run halt je gori scenario od pre-run hold-a.

Direktiva "Hoću pravi sota rezultat" eksplicitno stavlja thesis integrity iznad wall-clock convenience. 24-48h dodatnog čekanja je manja cena od potencijalnog mid-run failure-a.

## Razlog protiv "kickuj sutra reset" instinkta

Tomorrow-total @ 2500 RPD = 80% utilizacije pri normal path-u. Ali worst-case 3× retry = 240% utilizacije, preko limita. Headroom 415 calls (20% pri normal path-u) je tanak za production benchmark gde retries aren't optional. **Approval na 2500 je minimum viable, ne komotno.** Ako Google approve veće (5000+), komfor narasta materijalno.

## GATE-D-REKICK-GO 3-step pre-flight sequence (kada approval stigne)

CC-1 izvodi sledeće sequence kao prvi korak naredne sesije, pre N=400 kickoff-a:

1. **Quota verification API query**: `gcloud alpha services quota list --service=generativelanguage.googleapis.com --consumer=projects/<id>` (ili ekvivalentni REST API call) da bi potvrdio actual current per-model RPD limit ≥ 2500. Screenshot ili JSON output u audit log.
2. **Probe v3 spot-check**: 5 calls u 10s window-u na clean foreground kickoff samo da potvrdi da nije tier-revert ili UI/backend mismatch posle approval-a. Očekivano 5/5 HTTP 200.
3. **Manifest v5 N=400 kickoff**: tek posle koraka 1+2 PASS, GATE-D-REKICK-GO authorized i CC-1 izvodi sequential 5-cell ensemble. Continuous RPD monitoring kroz LiteLLM headers; halt @ 80% utilizacije ako se približava current limit.

Ako bilo koji od ova 3 koraka fail → re-halt sa novim PM-RATIFY ratifikacijom.

## 48h fallback branch planning (paralelno discovery, ne aktivacija)

Ako Google ticket nije approved do **2026-04-26 18:00 CET** (48h od submit-a), aktiviraju se dva paralelna istraživanja — **discovery only, ne re-kick** — da bismo izbegli indefinite hold:

**Branch A — Gemini Batch API eligibility check za `gemini-3.1-pro-preview`**:
- Gemini Batch API: 24h SLA, 50% cost, separate quota pool
- Open question: da li preview modeli podržavaju batch mode (typically ne, ali nije univerzalno)
- Ako eligible: manifest v6 može da prebaci Gemini cell na batch invocation bez κ break-a (judge protokol identičan, samo timing različit)
- CC-1 deliverable: ≤100 word eligibility memo + Google docs citation

**Branch B — Manifest v6 reduced-Gemini coverage scope**:
- Gemini judge samo na primary hypothesis cells (no-context vs retrieval, ~800 calls vs 2005)
- Opus 4.7 + GPT-5.4 nose ostatak ensemble-a kao tie-break duo na ostalim cells
- Tražiti: pre-registration delta (manifest v6 emit) + small κ re-validation (~$15-30 budget impact)
- Thesis integrity preserved (primary hypothesis ima pun trojni ensemble; sekundarni cells imaju duo)
- CC-1 deliverable: ≤200 word scope-reduction proposal sa cell-by-cell judge assignment matrix

**Aktivacija oba**: zahteva nezavisnu PM ratifikaciju i potencijalno manifest v6 emit. Ne automatski, ne CC-1 self-advance.

## Marko parallel action

Google AI Studio + GCP Cloud Support ticket submitted 2026-04-24. Status: pending approval. Marko prati ticket inbox/spam folder + GCP Console quota panel; promene kroz oba kanala (email approval ili UI quota update na ≥2500) se računaju kao validation. Screenshot ili ping → PM odobrava GATE-D-REKICK-GO sa 3-step pre-flight sequence-om.

## Parent commit chain (since v4 anchor `dedd698`)

```
fc16925  v5 anchor (MD/YAML pre-registration)
ad324cc  Step 2 primary rpm:20 (gemini-3.1-pro alias)
3a146ef  §1.3c probe v2 PASS (30/30 HTTP 200)
e5696f4  Fold-in 3.5a alias naming reconciliation
d0ab680  Fold-in 3.5b sibling alias defensive mirror
1d3851d  §1.3e RPD feasibility memo (this gate)
```

7 commits od v4 anchor. HEAD intact. Zero N=400 calls executed.

## Task #29 progress

- §1.1 Path L-1 ✓
- §1.2 Task 2.6 path ✓
- §1.3 FAIL → §1.3b IN_SCOPE ✓ → §1.3c PASS ✓ → §1.3e INFEASIBLE @ current ✓
- GATE-D-REKICK-GO **blocked until Google approval (RPD ≥ 2500)**
- 48h checkpoint: 2026-04-26 18:00 CET — fallback branch discovery activates ako approval ne stigne

## Odbacivanja

- **Conditional self-advance** (CC-1 sam pre-flight check pa kick): rolling-window race risk; thesis integrity > wall-clock.
- **Manifest v6 immediate pivot**: prerano; daj Google ticket-u 48h fer šansu pre nego što reduce-ujemo Gemini coverage.
- **Skip Gemini ensemble entirely**: §5.2 consistency_constraint break + judge ensemble quality degradation; thesis-incompatible kao i P3 ranije.

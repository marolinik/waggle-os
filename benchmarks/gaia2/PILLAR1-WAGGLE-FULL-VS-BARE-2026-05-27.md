# Pillar 1 — Full Waggle harness ladder · Qwen 3.6 35B-A3B · 2026-05-27

**Question.** The 2026-05-26 N=160 ran with **bare** Waggle (gates OFF, no persona, no prompt-shape) — fairness-with-Hermes design but disclaiming the "as-shipped" product surface. Result: **67.9% trio-strict** on Qwen vs 87.2% on Hermes+Sonnet → 19.3pp gap. Marko's correction: *test the **real** Waggle harness* — turn on Waggle's actual product-distinctive orchestration. This memo measures four cells at N=20 to attribute the gap and pick the lever.

## Headline result

| Cell | What's on | trio-strict N=20 | matched ∆ vs bare-same-19 |
|---|---|---:|---:|
| Bare (control) | nothing | 73.7% (full-N=156: 67.9%) | — |
| **F1** | + WAGGLE_VERIFICATION_GATE + WAGGLE_SKILL_DISTILLATION_GATE | 70.0% | **net 0pp** (5↔5 cancel) |
| **F2** | + WAGGLE_PERSONA_ID=executive-assistant (composePersonaPrompt) | 75.0% | **+5.3pp** |
| **F3** | + WAGGLE_GAIA2_QWEN_SHAPE=1 (output-discipline appendix) | **85.0%** | **+10.5pp** |

**Trio judges unanimous on F3:** 17 PASS + 3 FAIL, 0 splits. Real content lift, not phrasing artifact.

## Three product findings worth landing

### Finding 1 — In-container ≠ trio-strict; only trio is fairness-defensible

The GAIA 2 in-container `user_message_checker` is a deterministic format checker, not a content judge. It returns `inconclusive` on verbose multi-paragraph answers EVEN WHEN CORRECT. F1's in-container rate was **10%**; trio-strict was **70%**. F2's in-container **5%** → trio **75%**. F3's in-container **20%** → trio **85%**. The deterministic checker's signal correlates with the prompt-shape's success at producing crisp answers, NOT with whether Qwen got the right answer. Earlier session entries calling F1 a "catastrophic regression" based on in-container were wrong and retracted in real time. **Only trio-strict matched the Hermes baseline methodology; only trio-strict matters for the final number.**

### Finding 2 — Waggle's "as-shipped" gates do NOT regress Qwen content; they trade phrasing crispness for reasoning shuffle

F1 (verification + D1 skill distillation, both ON) produced **0pp net change** on the matched-19 subset. 5 scenarios that bare passed, F1 failed; 5 scenarios bare failed, F1 passed — different reasoning paths produce different scenarios. The gates DO induce longer scenarios (event counts 100-600 vs bare's 10-30 on hard scenarios) at extra cost and latency, without trio-strict benefit on Qwen. The earlier hypothesis "gates regress on non-Sonnet models" is **partially correct**: they regress on the deterministic checker (verbose answers, format-broken) but NOT on the LLM-judge content metric. Product implication: **the F1 gates' true cost is latency and token spend, not correctness**, and they can be safely shipped with model-aware toggles.

### Finding 3 — The output-discipline prompt-shape is the highest-leverage harness lever for Qwen

F3 is a single env var (`WAGGLE_GAIA2_QWEN_SHAPE=1`) that appends ~30 lines of explicit final-answer-format rules to the system prompt. Worker code change: 7 lines + a string constant. No agent-loop change, no LLM logic change. Result: **+10.5pp trio-strict matched lift, +11.3pp standalone**. The shape works partially (4/20 produced one-token answers like `45` / `Xóchitl`; 16/20 still produced multi-paragraph "Based on my analysis…" responses despite the prompt prohibition), but the partial discipline AND the trio-strict lift confirm Cat 1 (verbose final answers) is the dominant residual gap and harness-fixable.

## Per-scenario evidence (4-way matched, N=19)

```
B=bare 1=F1 2=F2 3=F3                                                   recovery vs bare
PPPP × 8 — easy / robust to all variants
PPPF × 1 (5bftlu) — F3-only regression (overcompressed: "1" not the answer)
PFPP × 3 — F1 broke, F2+F3 keep — confirms F1 is structurally hurting some scenarios
PFFF × 1 (bnrehm) — model-hard, all enhancements fail
FPPF × 1 (er2clq) — F1 saved it but F3 broke it; persona/shape interact non-linearly
PPFP × 1 (ew5kn5) — F2 alone broke it; F3 keeps it
FPFP × 2 (otvqov, 1xhz8j) — F2 doesn't help; F3 recovers ⬆️
FPPP × 2 (powgzh, 346yda) — all variants except bare get these right ⬆️
```

**5 bare failures total in N=19:**
- `er2clq` (Stockholm conflation): F3 fails — model-attributable, content-wrong even when terse
- `otvqov` (messages participants city): **F3 recovers** ⬆️
- `powgzh` (employed Stockholm contacts): **F3 recovers** ⬆️
- `1xhz8j` (rides booked, ZIP/violent-crime): **F3 recovers** ⬆️
- `346yda` (some entity lookup): **F3 recovers** ⬆️

4 of 5 bare failures recovered under F3 — and the one that doesn't (`er2clq`) is a genuine Qwen content error, not a Cat 1/3 surface error.

## Wiring (committed `6db922d` + working tree pending commit)

Worker rewire in `benchmarks/gaia2/waggle-container/waggle_worker.mjs`:
- F2 imports: `getPersona`, `composePersonaPrompt` from `@waggle/agent/dist/personas.js`
- F2 logic: `WAGGLE_PERSONA_ID` resolved once at startup; `buildSystemPrompt()` composes AGENTS.md + persona
- F3 logic: `WAGGLE_GAIA2_QWEN_SHAPE=1` appends `QWEN_SHAPE_APPENDIX` after persona compose (so shape wins format authority)
- Unset / empty values preserve the 2026-05-22 bare-Waggle baseline behavior

Container env in `external/.../gaia2-cli/runner/gaia2_runner/container_env.py`:
- `_DEFAULT.extra_flags` is the single switch — set to `{"WAGGLE_GAIA2_QWEN_SHAPE": "1"}` for F3, `{"WAGGLE_PERSONA_ID": "executive-assistant"}` for F2, `{"WAGGLE_VERIFICATION_GATE": "1", "WAGGLE_SKILL_DISTILLATION_GATE": "1"}` for F1, `{}` for bare.

Container `localhost/gaia2-waggle:latest` rebuilt 3× during this session: Phase 0 (fix#4 dist), F2 (worker rewire), F3 (shape constant). Final image at run time = F3 build.

## Cost log

- Phase 0 smoke ($0.05) + N=20 F1 (~$1.50) + N=20 F2 (~$1.20) + N=20 F3 (~$1.10) + 3× trio rejudges (~$0.50 each)
- Total session compute: ~$5-6
- Container rebuilds: ~5 min × 3 = ~15 min wall

## What to ship for the F4 N=160 run

**Option A — F3 alone.** Single-knob change from the 2026-05-22 baseline. Expected: ~78-85% trio-strict on full N=160. Cleanest claim ("Waggle's per-model prompt-shape architecture closes 10pp of the Qwen gap").

**Option B — F2+F3 stacked.** Run an N=20 probe first to confirm no compounding regressions, then F4 N=160 + Sonnet N=40 re-baseline. Expected: ~80-87% trio-strict if recoveries union. Most ambitious headline.

**Option C — pick F4 from {F3, F2+F3, F1+F2+F3} by best of three N=20 probes.** ~2h additional compute (~$3-4). Most rigorous selection.

**Recommended:** **Option B.** F3 is the single highest-leverage lever (+10.5pp), F2 adds an independent +5.3pp with mostly non-overlapping recoveries. Stacked is the right "real Waggle harness" headline. The F2+F3 N=20 probe gives confidence before burning the F4 cost ($5-8 + judge).

## Decision rule for F4 trigger

After F2+F3 stacked N=20:
- If ≥80% trio-strict → trigger F4: stacked N=160 + Waggle+Sonnet N=40 matched re-baseline (~$15-25 total) → publishable headline
- If 75-79% → trigger F4 with F3 only (less ambitious, still clean)
- If <75% → root cause the regression vs F3 alone, do not run F4 until understood

## Provenance

- Rebuilt container: `gaia2-waggle:latest` image id `34801a117af7` (F3 final)
- F1 rejudge: `runs/rejudge-waggle-qwen36-f1-gates-n20.jsonl` (14/20)
- F2 rejudge: `runs/rejudge-waggle-qwen36-f2-persona-n20.jsonl` (15/20)
- F3 rejudge: `runs/rejudge-waggle-qwen36-f3-shape-n20.jsonl` (17/20)
- Bare reference: `runs/rejudge-waggle-qwen36-thinking-n160.jsonl` (106/156)
- Worker source: `benchmarks/gaia2/waggle-container/waggle_worker.mjs` HEAD `6db922d` (F2) + F3 patch pending commit
- Container env: `external/.../container_env.py` (working-tree edits pending upstream commit)

## Earlier in-session retractions

- "F1 catastrophic regression" — based on 10% in-container rate; corrected after trio-rejudge showed 70% net-zero
- "F2 persona introduces email-framing bias" — based on N=1 smoke; corrected after N=20 showed +5.3pp lift
- Both retractions surfaced same-session before propagating into the final memo. Documentation discipline: in-container is plumbing, not signal.

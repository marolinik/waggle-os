# CC-1 Brief — Task 2.5 Stage 3 N=400 Re-Kick (Option A ratified)

**Date**: 2026-04-24
**Status**: GATE-D-ADJUDICATION-ACCEPT-OPTION-A
**PM**: Marko Marković (ratifikovano 2026-04-24)
**Prior state**: Gate D Deviation Halt (see `sessions/2026-04-24-task25-stage3-n400-deviation-halt.md`)

---

## §0 Kontekst i odluke

Gate D Deviation Halt adjudikovan. Option A ACCEPT — Gemini 3.1 Pro Tier 2 upgrade.

**Billing status** (potvrđeno 2026-04-24 via Google AI Studio screenshot):
- Account: Egzakta (ID: 01DBA5-921E58-9DAF46)
- Tier: **Tier 2 LIVE** (60 → 1000 RPM, 14,400 → 50,000 RPD)
- Balance: credit $63.20
- Pricing: unchanged

**Manifest v4 anchor**: `dedd69888e008fb1584bc249aff43b19f55a88e5` (short `dedd698`) — ostaje validan ex-ante lock, ne reemituje se.

**Code freeze HEAD**: `373516c2784807da8536dbc0c194c54f4e4cd4be` — nepromenjen.

**SYSTEM_AGENTIC bytes SHA-256**: `6facae6decc44a6404290514accb4f7cb364081b32d02847a20f8e871633e328` — nepromenjen.

**Odbačene opcije u adjudikaciji**: C (judge swap, §5.2 break), D (token-bucket limiter, code-freeze break), E (Promise.allSettled + 2-of-3 quorum, code-freeze + §5.2 break), G (no-op, bad EV). Option F (stop at Gate C) ostaje u zadnjoj ruci ako Option A pipeline ne prođe prerequisites.

---

## §1 Tri blocker prerequisites pre N=400 re-kick-a

Svi prerequisites su **non-negotiable**. CC-1 ne re-kick-uje dok svi nisu zatvoreni i PM-ratifikovani.

### §1.1 Lock semantics clarification memo

**Issue**: Gate D deviation halt §2.3 zabeležio je runner-lock race — dva pid-a (65668 + 4984) akvirirala `.benchmark-runner.lock` unutar 3-sekundnog prozora dok je wrapper izvršavao `--parallel-concurrency 2`. Manifest v4 §7.4 navodi `concurrent_runners: FORBIDDEN`, što u literalnom čitanju koliziuje sa §3 concurrency=2.

**Operativna interpretacija koju PM ratifikuje**:
§7.4 `concurrent_runners: FORBIDDEN` pokriva **cross-process threat model** — sprečavanje dva nezavisna `npx tsx scripts/run-mini-locomo.ts` poziva iz različitih terminala/shellova. Intra-wrapper spawnovanje kroz `--parallel-concurrency 2` iz jedne CLI invokacije **JESTE dozvoljeno**.

**Zahtev prema CC-1** (memo ≤ 250 reči, deliverable `benchmarks/results/manifest-v4-lock-semantics-clarification.md`):
1. Potvrdi interpretaciju gore ili predloži alternativu sa dokazom iz koda.
2. Odluči jedan od dva puta za konkretno lock-race adresiranje:
   - **Path L-1 (preferred ako je moguće bez code-freeze break-a)**: per-cell output-path šema tako da dva intra-wrapper spawn-a ne konkurišu za isti `.benchmark-runner.lock` fajl (npr. `.benchmark-runner.<cell>.lock`). Ako ovo znači promenu izvornog koda u frozen path-u, prijavi to i prelazi na Path L-2.
   - **Path L-2 (fallback)**: ako se race ne može pokriti waiver-om bez code-freeze break-a, CC-1 predlaže manifest v5 amendment sa concurrency=1. PM odlučuje manifest v5 emisiju kao zaseban gate.
3. Anchor clarification commit na `feature/c3-v3-wrapper`, SHA-256 hash memo fajla u halt ping-u za PM ratifikaciju.

### §1.2 Runner early-exit RCA memo

**Issue**: Gate D deviation halt §2.2 zabeležio je runner early-exit na ~15 min bez halt markera u logovima. Sumnja: uncaught Promise rejection iz `judge-runner.ts:386-400` catch-all paternom + `Promise.all([opus, gpt, gemini])` u `judgeEnsemble` — prvi 429 iz Gemini-ja ubija ceo ansambl i uspeli Opus/GPT verdici se gube.

**Zahtev prema CC-1** (memo ≤ 250 reči, deliverable `benchmarks/results/manifest-v4-runner-early-exit-rca.md`):
1. Potvrdi ili odbaci hipotezu: da li je early-exit path triggered **isključivo** pod 429 judge cascade, ili postoje drugi failure modes (npr. subject timeout, JSON parse error, network flap, memory exhaust) koji takođe vode u isti uncaught-rejection exit?
2. Ako **isključivo 429**: log kao Task 2.6 tech-debt sa explicit ticket reference-om (ime + broj + acceptance criteria za defensive patch). Option A Tier 2 upgrade onda praktično maskira simptom dok se patch ne ubaci.
3. Ako **drugi failure modes postoje**: ne re-kick bez defensive patch-a. To automatski znači code-freeze break (npr. `Promise.allSettled` + 2-of-3 quorum) = manifest v5 emisija = Gate P reiniciranje. PM odlučuje u tom trenutku.
4. Anchor RCA memo commit na `feature/c3-v3-wrapper`, SHA-256 hash u halt ping-u.

### §1.3 Gate P+ pre-flight probe

**Cilj**: deterministički verifikovati da Tier 2 upgrade zaista propagirao pre nego što se troši $23 na N=400.

**Specifikacija probe-a**:
- **Subject**: `gemini-3.1-pro-preview` (ista ruta i isti API key koji će Stage 3 koristiti)
- **Volume**: 50 poziva u 30-sekundnom prozoru (= 100 RPM burst, iznad Tier 1 ceiling-a od 60 RPM ali komfortno unutar Tier 2 od 1000 RPM)
- **Payload**: minimum viable judge call — LoCoMo instance iz canonical SHA dataset-a (npr. prva iz konverzacije 0), structured prompt identičan Stage 3 judge prompt-u
- **Pass criterion**: **0 × HTTP 429** preko svih 50 poziva. Bilo koji 429 = probe FAIL = no re-kick, vraćamo se PM-u.
- **Deliverable**: `benchmarks/results/stage3-gate-p-plus-probe-log.jsonl` sa svim 50 poziva (timestamp, latency, status code, rate-limit headers X-RateLimit-*), plus aggregate summary memo ≤ 100 reči.

**Budget**: probe trošak je ~$0.10-0.30, dodaj u Stage 3 ukupni cap (expected final: ~$23.30, headroom ~22% pod $30 cap).

---

## §2 Re-kick authorization uslovi

CC-1 pokreće N=400 kick tek kada su SVA tri uslova zadovoljena:

1. §1.1 lock semantics memo delivered, PM ratified (Path L-1 ili L-2 adjudicated)
2. §1.2 runner early-exit RCA memo delivered, PM ratified (tech-debt ili patch path adjudicated)
3. §1.3 Gate P+ probe executed, 50/50 pass, probe log + memo delivered, PM ratified

Ako bilo koji prerequisite blokira (Path L-2 triggers manifest v5, ili RCA otkriva drugi failure modes, ili probe FAIL), CC-1 emituje novi halt ping i čeka PM adjudikaciju. **Ne self-advance ni u jednom scenariju.**

---

## §3 N=400 execution (nepromenjen od Gate P)

Kada re-kick uslovi prođu, CC-1 izvršava identičnu CLI invokaciju kao u Gate P ratifikaciji:

```
npx tsx scripts/run-mini-locomo.ts \
  --manifest benchmarks/results/manifest-v4-preregistration.yaml \
  --subject qwen3.6-35b-a3b-via-dashscope-direct \
  --subject-fallback-1 qwen3.6-35b-a3b-via-openrouter \
  --judge-ensemble claude-opus-4-7,gpt-5.4,gemini-3.1-pro \
  --v3-cells --N 400 --parallel-concurrency 2 --seed 42
```

**Budget**: $30 cap / $28 hard halt / ~$23 expected subject + ~$0.30 probe = ~$23.30 total expected.

**Stopping rules**: manifest v4 §8 nepromenjen (budget, streak, health check, runner lock, deviation).

**Post-hoc exclusion**: NONE. `evaluator_loss` u denominatoru per §9.

**Deviation response**: halt + restart-required per §10.

---

## §4 Gate D exit report (nepromenjen od Gate P)

Posle N=400 exit, CC-1 emituje exit ping sa §0-§6 strukturom u `sessions/2026-04-24-task25-stage3-n400-complete.md`:

- §0 Manifest v4 SHA-ove re-verify (MD + YAML, ne smeju drift-ovati)
- §1 Primary endpoint: Fisher one-sided p check, retrieval − no-context ≥ 5pp, Wilson 95% CI
- §2 Secondary endpoints S1-S5 (monotonicity chain pairwise p<0.20, agentic-retrieval, abstain penalty), cluster bootstrap 10000 iter CI
- §3 Evaluator-loss count reported separately (ne iz denominatora)
- §4 Fleiss' κ pre-tiebreak judge matrix (pass ≥0.65, flag 0.60-0.65, halt ≤0.60)
- §5 Budget actual vs $28 halt, deviation count (expected 0)
- §6 SOTA claim composition scope (NOT the claim itself — CC-1 delivers scope + data, PM+Marko compose public claim)

**CC-1 halt at Gate D**. No self-advance to SOTA claim composition. Taj korak radi PM + Marko.

---

## §5 Task 2.6 carry-over (tech-debt registar)

Sledeći elementi ulaze u Task 2.6 carry-over bez obzira na Stage 3 ishod:

1. **Subject-only per-cell budget gap** (`runner.ts:396` / `line 428`) — known tech-debt, dokumentovan ali nije blocker pod Option A (Tier 2 headroom apsorbuje rizik pod $30 cap)
2. **Judge-ensemble defensive error handling** — ako §1.2 RCA potvrdi "isključivo 429" hipotezu, Task 2.6 entry za `Promise.allSettled` + 2-of-3 quorum patch sa clear acceptance criteria
3. **Runner-lock race edge case** — ako §1.1 Path L-1 prođe per-cell output-path šemom, treba permanent fix u Task 2.6 umesto waiver-based
4. **Gate P+ probe template** — ako probe metodologija radi, upakovati kao reusable pre-flight check za buduće benchmark rate-limit-sensitive stream-ove

---

## §6 How to apply

**Za CC-1** (paste-ready direktiva):

```
GATE-D-ADJUDICATION-ACCEPT-OPTION-A ratified by PM 2026-04-24.

Gemini 3.1 Pro Tier 2 is LIVE (Egzakta billing account). Manifest v4
anchor dedd698 remains valid. Code freeze HEAD 373516c remains.

Execute three prerequisites in sequence before N=400 re-kick:

1. Deliver lock semantics clarification memo per brief §1.1. Anchor on
   feature/c3-v3-wrapper. Halt with PM-RATIFY-LOCK-SEMANTICS ping
   containing memo SHA-256 + Path L-1 vs L-2 recommendation.

2. Deliver runner early-exit RCA memo per brief §1.2. Anchor on
   feature/c3-v3-wrapper. Halt with PM-RATIFY-RCA ping containing memo
   SHA-256 + tech-debt vs patch-required recommendation.

3. Execute Gate P+ pre-flight probe per brief §1.3. Deliver probe log
   + summary memo. Halt with PM-RATIFY-PROBE ping containing probe
   pass/fail status + artefact paths.

After all three PM ratifications, emit GATE-D-REKICK-GO request. PM
issues final kick authorization. CC-1 executes §3 CLI invocation,
halts at Gate D per §4 exit report structure. No self-advance.

Full brief at: D:\Projects\PM-Waggle-OS\briefs\2026-04-24-cc-task25-stage3-rekick-option-a.md
```

**Za PM** (kontrolne tačke):

- Gate Lock Semantics: ratifikuj Path L-1 (clean) ili L-2 (manifest v5 trigger)
- Gate RCA: ratifikuj tech-debt (preferred) ili patch-required (manifest v5 trigger)
- Gate P+ Probe: 50/50 pass = ratified, bilo koji 429 = halt + re-adjudicate
- Gate D Exit: verifikuj §0-§6 artefakt, advance to SOTA claim composition

**Failure modes koje vraćaju na adjudikaciju**:
- Path L-2 ratified → manifest v5 emisija (concurrency=1, ~16h wall-clock)
- RCA otkriva drugi failure modes → manifest v5 emisija (Promise.allSettled + quorum patch)
- Probe 429 → Tier 2 propagation issue, PM eskalira Google billing support
- Bilo koja deviation tokom N=400 → halt per §10, restart required after fix

---

## §7 Reference

- Manifest v4 MD: `benchmarks/results/manifest-v4-preregistration.md` (SHA-256 `ce35b7eb...3525f`)
- Manifest v4 YAML: `benchmarks/results/manifest-v4-preregistration.yaml` (SHA-256 `b626322d...401d3`)
- Gate D Deviation Halt: `PM-Waggle-OS/sessions/2026-04-24-task25-stage3-n400-deviation-halt.md`
- Gate P Ratification: auto-memory `project_task25_stage3_gate_p_ratified.md`
- Gate D Adjudication: auto-memory `project_task25_stage3_gate_d_deviation_adjudicated.md`
- Bench-Spec LOCK v1: `benchmarks/specs/bench-spec-lock-v1.md`

# CC-1 Brief — Sprint 12 Task 2 (C3 Stage 2 Mini) Kickoff Authorization

**Datum:** 2026-04-23
**Sprint:** 12 · Task 2 · C3 Stage 2 Mini (first live-LLM LoCoMo run on A3 LOCK substrate)
**Authority:** PM (Marko Marković), 2026-04-23 post-Task-1-ratification
**Pre-req gates:** Sprint 12 Task 1 ✅ CLOSED (origin/main HEAD=`ffcfecf`, 9 commits, 265/265 tests green) · A3 LOCK v1 ✅ RATIFIED · B1/B2/B3 LOCK ✅ CLOSED · LiteLLM container UP (verify at kickoff)
**Budget:** $120–200 expected · Cap $250 hard · Hard abort @ $325 (130% of cap)
**Inherits from:** `briefs/2026-04-22-cc-c3-stage2-mini-kickoff.md` (original C3 brief, SUPERSEDED by this brief on runtime-dependent sections — §2, §3, §4 of original are now runnable because all 6 substrate blockers shipped in Task 1)

---

## 0. TL;DR

Originalni C3 brief (2026-04-22) je halted mid-pre-flight zbog 6 substrate blokera (vidi `sessions/2026-04-22-c3-blocked-substrate-gap.md`). Task 1 (Sessions 1+2+3 + B2 LOCK remap) je sve blokere zatvorio u 9 commits, $0 LLM spend, 265 tests green. Ovaj brief autorizuje **pravi live C3 mini run** — 4 cell × N=100 = 400 evaluacija, 3-primary judge ensemble (Opus 4.7 + GPT-5.4 + Gemini 3.1-Pro) + Grok 4.20 tie-break reserve, Qwen 35B-A3B kao target, A3 LOCK v1 manifest bindovan, Fleiss κ + Wilson + cluster-bootstrap CI mid-run i post-hoc, failure taxonomy F1-F6+F_other aktivna.

**Pre-kick HALT su 3 carry-over items iz Task 1 Session 3 exit ping (§5 Surprises).** Brief §2 (dole) rešava sva tri pre nego što se bilo kakav budžet potroši.

---

## 1. Što je drugačije vs. originalni C3 brief (2026-04-22)

Originalni brief reference-uj za sekcije koje ostaju nepromijenjene (§1 Authorization context, §6 Abort criteria, §8 After C3 PASS, §9 Sprint close path, §10 Related). Ovaj brief **nadomješta** sljedeće:

| Originalni § | Status na HEAD `ffcfecf` | Akcija |
|---|---|---|
| §4 invocation — `--cell raw,filtered,compressed,full-context` | Valid (Blocker #2 Cell enum rename commit `620f018`) | Invocation shape iz originala radi bez patch-a |
| §4 invocation — `--dataset locomo --limit 100` | Canonical LoCoMo loader live (Blocker #1 commit `a75dd25`) | Nema više synthetic fallback silent path |
| §4 invocation — `--manifest-hash <sha256> --emit-preregistration-event` | Pre-registration CLI surface + `bench.preregistration.manifest_hash` event emitter live (Blocker #3 commit `8466eaf`) | Event fire-uje; §5 exit criterion 7 je sada satisfiable |
| §4 invocation — `--judge-ensemble primary` | **Replace sa concrete ensemble syntax** (vidi §4.3 dolje) — literal `primary` token nije pattern koji runner parsira. Umjesto toga: `--judge-ensemble claude-opus-4-7,gpt-5.4,gemini-3.1-pro` (auto-wires grok-4.20 reserve preko `runner.ts:403-414` B2 LOCK wiring) |
| §4 invocation — `--judge-tiebreak grok-4.20` | Explicit flag još uvijek nije implementiran. Auto-wiring kroz 3-element primary ensemble rule ostaje mehanizam (commit `fa4cbd6` B2 LOCK remap + `b7e52fc` judge registry) |
| §5 exit criterion 4/5 — Wilson CI + κ | Fleiss κ + Wilson CI + cluster-bootstrap live (Blocker #5 commit `fd4b216`, +34 tests) | Mid-run κ HALT logic dostupan; aggregate.json populira `ci { wilson, bootstrap }` per cell |
| §5 exit criterion 6 — Failure distribution F1-F6+F_other | Taxonomy module + rubric + validator + aggregator live (Blocker #6 commit `00157b1`, +33 tests) | **Ali judge-response parser još ne populira `failure_code`/`rationale` u `JsonlRecord`** — vidi §2.1 ispod, blocking pre kickoff |
| §3 manifest generation — per-run manifest v1 | Pre-registration CLI live | §3 iz originala je runnable bez promjene; hash se emituje i verifira protiv YAML twin-a |

---

## 2. PRE-KICK HALT — 3 carry-over items iz Task 1 Session 3 exit ping

Ovi se svi rešavaju u `benchmarks/harness` side pre prvog live invocation-a. Zero budget, zero LLM spend.

### 2.1 JsonlRecord.failure_code / rationale — **LOCKED Opcija C (Namespace Split) 2026-04-23**

**Status:** ✅ PM ratifikovao Opciju C. Decision doc: `decisions/2026-04-23-jsonl-record-taxonomy-split-locked.md`. CC-1 cleared za types.ts implementaciju.

**Šta se implementira:**
- `JsonlRecord` dobija `a3_failure_code: FailureCode` (F1-F6+F_other 8-value space) + `a3_rationale: string | null` (mandatory non-null kad `F_other`)
- Sprint 9 `judge_failure_mode` + `judge_rationale` ostaju kao legacy read-only polja; **ne** populiraju se na A3 run output-u
- Aggregate JSON i svi exit criteria koji referenciraju failure_code koriste `a3_failure_code` kao autoritativni ključ (exit criterion +12 u §6)
- Commit poruka sugerisana: `feat(benchmarks): A3 failure taxonomy namespace split — a3_failure_code + a3_rationale preserving Sprint 9 legacy fields`

**Odbačene alternative (audit trail):**
- Opcija A (Extend — duplikacija schema): odbijena, nema eksplicitni naming contract, otežava forensic grep
- Opcija B (Deprecate — breaking): odbijena, briše C2 stage 1 forensic shape-drift signal neprihvatljivo za proof obligations

**Razlog za C:** Aditivna promjena, $0 breaking risk, grep-friendly `a3_` prefix eksplicitno odvaja A3 taxonomy od Sprint 9 bez brisanja istorije. C2 arhiv ostaje čitljiv starim parserom.

### 2.2 OpenRouter slug verification za 3 judge modela + 1 reserve

**Problem:** Blocker #4 Session 2 Surprise #6 flagovao je da slug-ovi `gpt-5.4`, `gemini-3.1-pro`, `grok-4.20` u `config/models.json` su hipotetski — nije verifikovano da OpenRouter route postoji pod tim imenima. Blocker #5/#6 i Task 1 smoke su svi išli sa mock fixtures, ne protiv live API.

**Deliverable pre kickoff (CC-1 samoautomatic):**

```bash
# Per svaki judge slug, 1 ping-call sa minimalnim tokenima
curl -s https://openrouter.ai/api/v1/models | jq '.data[] | select(.id | contains("gpt-5") or contains("gemini-3.1") or contains("grok-4"))' | jq -r '.id'
```

Očekivani output u neka od tih formata: `openai/gpt-5.4`, `google/gemini-3.1-pro`, `x-ai/grok-4.20`. Ako stvarni slug razlikuje od `models.json` entry, update `config/models.json` + commit `fix(benchmarks): OpenRouter slug verifikacija za C3 mini live ensemble`.

**Abort path:** Ako bilo koji od 4 slug-ova (3 primary + grok reserve) ne postoji na OpenRouter, HALT. Ne padaj u fallback; traži PM odluku o zamjenskoj ruti (mogla bi biti direktan Anthropic/OpenAI/Google API key + LiteLLM route bypass OpenRouter).

### 2.3 Smoke fixture `grok_reserve_vote` → live `resolveTieBreak` swap

**Problem:** Session 3 Surprise #1 — smoke test-ovi u `benchmarks/harness/tests/smoke/` pre-encode-uju `grok_reserve_vote` u fixture row-u umjesto da pozovu `resolveTieBreak` iz `packages/server/src/benchmarks/judge/ensemble-tiebreak.ts`. Bilo je opravdano za smoke (cross-package import), ali live C3 run MORA koristiti real resolver.

**Deliverable:** U `benchmarks/harness/src/runner.ts` judge-pipeline block gdje ensemble vote sakuplja — poziv na `resolveTieBreak` kad 3 primary vote u 1-1-1 split. Import iz `@waggle/server` paketa (ili lokalna kopija resolver-a ako workspace import komplikuje build). B2 LOCK unit tests u `packages/server/tests/benchmarks/ensemble-tiebreak.test.ts` su već zeleni, pa ne trebaju novi testovi — samo wire.

**Verifikacija:** U §5 exit criterion 3 (B2 wire live-verified), tvoja pino log mora pokazati `path: quadri-vendor` + `fourth_vendor_slug: <verified_grok_slug>` + `resolveTieBreak` invocation u bar jednom od 400 instanca. Ako zero fires, isti forensic signal kao originalni brief spominje.

---

## 3. Pre-req gate: Docker / LiteLLM health-check

Isti kao originalni C3 brief §2. `docker ps --filter "name=waggle-os-litellm-1"` mora vratiti `Up <duration>`. Ako ne, restart procedura po C2 brief §2 (Marko handluje Docker Desktop UI restart). Abort sa `sessions/2026-04-23-c3-blocked-litellm-unhealthy.md` ako `/health` ne odgovara 200 u 10s.

---

## 4. Manifest generacija — step one

Per-run manifest pair: `decisions/2026-04-23-stage2-mini-manifest.md` + `.manifest.yaml`. 16 fields iz A3 LOCK §7 (vidi originalni C3 brief §3 za točnu listu). Ključne razlike vs originalna manifestacija:

- **Field 5 `target_model`:** `qwen3.6-35b-a3b-via-openrouter` (LOCKED 2026-04-19, LIVE 2026-04-21) — ne DashScope direktan (B3 addendum carve-out za non-Anthropic providers)
- **Field 7 `judge_primary`:** verifikovane OpenRouter slug verzije iz §2.2 (ne hipotetski tokens)
- **Field 8 `judge_tiebreak`:** verifikovani grok-4.20 OpenRouter slug iz §2.2
- **Field 10 `dataset_version`:** LoCoMo release hash iz canonical loader (Blocker #1) — uzmi iz `benchmarks/harness/src/datasets.ts` loader constant
- **Field 14 `failure_taxonomy_version`:** `F1-F6+other v1` (match Session 3 smoke payload)

Commit manifest pair pre runner invocation sa poruke iz originalnog C3 brief §3 format-a.

---

## 5. Invocation (UPDATED za HEAD `ffcfecf`)

```bash
node benchmarks/harness/src/runner.ts \
  --model qwen3.6-35b-a3b-via-openrouter \
  --cell raw,filtered,compressed,full-context \
  --dataset locomo \
  --limit 100 \
  --per-cell \
  --seed 42 \
  --live \
  --budget 250 \
  --judge-ensemble claude-opus-4-7,gpt-5.4,gemini-3.1-pro \
  --manifest-hash <sha256_from_step_3> \
  --emit-preregistration-event
```

Promjene vs originalni brief §4:
- `--judge-ensemble primary` → eksplicitni concrete ensemble lista (3 slugs). Grok-4.20 reserve auto-wiruje se preko 3-element rule u `runner.ts:403-414`.
- `--judge-tiebreak grok-4.20` flag **uklonjen** — dok se explicit flag ne implementira u parseArgs, auto-wire path je source of truth.
- `--per-cell` flag verifikacija: ako Blocker #3 commit (`8466eaf`) nije dodao `--per-cell` u parseArgs switch, onda je `--all-cells` alternativa (runs hardcoded 4-tuple). Check with `node benchmarks/harness/src/runner.ts --help | grep -E "(per-cell|all-cells)"` prije kickoff-a; ako fail, zamijeni sa `--all-cells`.

Output putanje:
- `benchmarks/runs/2026-04-23-c3-stage2-mini/<cell>.jsonl` (4 fajla)
- `benchmarks/runs/2026-04-23-c3-stage2-mini/aggregate.json`

---

## 6. Exit criteria (11 total)

Svih 11 iz originalnog C3 brief §5 ostaje **netaknuto**, uz dva dodatka iz Task 1 carry-over:

**+12.** `JsonlRecord` shape u output JSONL mora populirati `a3_failure_code` + `a3_rationale` (ako PM ratifikuje Opciju C; inače odgovarajuća polja iz Opcije A ili B) za svaki row. Grep: `jq '.a3_failure_code' benchmarks/runs/2026-04-23-c3-stage2-mini/*.jsonl | sort | uniq -c` mora vratiti distribuciju koja mapira na `failure_distribution.counts` u `aggregate.json`.

**+13.** Live `resolveTieBreak` invocation count u pino logu mora biti jednak `tie_break_activations` u `aggregate.json`. Smoke fixture pre-encode pattern NE smije se pojaviti u live JSONL.

Ostatak (Wilson CI, Fleiss κ, F-distribution, B2 tie-break wire, manifest hash match, Tier 2 archive bundle) — vidi original §5.

---

## 7. Abort criteria

Isti set od 6 triggera iz originalnog brief §6. Dodatak:

**+7.** Ako `resolveTieBreak` throw-uje ili vrati undefined za bilo koji 1-1-1 split — HALT, forensic preserve JSONL, ne clean up.

---

## 8. Budget ledger & acceptance tabela

| Faza | Očekivana spend | Granica |
|---|---|---|
| Pre-kick §2 (JsonlRecord typechange + slug verify + tie-break wire) | $0 | nezavisno od budžeta |
| Manifest generacija §4 | $0 | — |
| Live run §5 (4 cells × 100 instances × ~5 API calls per) | $120–200 | cap $250 |
| Post-run aggregate + archive §5.11 | $0 | — |
| Exit ping §5.10 | $0 | — |
| **Ukupno cap** | | **$250** |
| **Hard abort @ 130%** | | **$325** |

---

## 9. Task 2 kao poveznica sa Week 1 Qwen×LoCoMo plan

Ako C3 mini PASSes (svih 11 + 2 dodata exit criteria zadovoljena, κ PASS, CI width akceptabilan):

- Ovo postaje **proof-of-wire** za A3 LOCK substrate + B1/B2/B3 + Task 1 substrate infrastructure. Pipeline je kompletno validiran uz real traffic, ne samo fixtures.
- H-42a/b (Stage 2 full LoCoMo, N=1540) je tehnički unblocked ali i dalje procedurno gated na PM call o pune budžete ($1300-2300 / cap $2600) — ne ovaj brief.
- Task 3 (C3 full LoCoMo) bi kickoff-ovao sa istim substrate-om + dodanim cost-control (batching, progressive κ monitoring, early HALT threshold).
- Pre-Flight Gate §3 stage 1 ($60-115 checkpoint ispred H-42a/b) — ovo mini run spada u taj gate u suštini, iako je $120-200 a ne $60-115. PM razmišlja da li re-kalibrira Gate stage 1 budžet naspram C3 mini realne cene.

---

## 10. What CC-1 NE radi u ovom kick-u

- Ne piše PM odluku za §2.1 — PM ratifikuje Opciju C (ili A, ili B) prije nego CC krene sa implementacijom types.ts ekstenzije.
- Ne piše H-42a/b full run brief. To je Sprint 12 Task 3 ili 4 pending C3 mini PASS.
- Ne invokira `scripts/check-manifest-sync.mjs` — script još ne postoji; manualna verifikacija pre-hash match kroz commit message ostaje sufficient (originalni brief §7 exception).

---

## 11. Exit ping template

`sessions/2026-04-23-sprint-12-task2-c3-stage2-mini-exit.md`

Struktura iz originalnog C3 brief §5.10, prošireno sa:
- **§3A:** Pre-kick §2 rezultati (PM odluka ID, OpenRouter slug diff, tie-break wire commit SHA)
- **§12:** JsonlRecord shape verification (grep stat per §6 criterion +12)
- **§13:** Live `resolveTieBreak` invocation count vs aggregate (§6 criterion +13)

---

## 12. Related (Task 2 specifični)

- `briefs/2026-04-22-cc-c3-stage2-mini-kickoff.md` — originalni C3 brief (ovaj brief inherits; runtime-dependent sekcije superseded)
- `sessions/2026-04-22-c3-blocked-substrate-gap.md` — 6-blocker diagnoza koju Task 1 closes
- `sessions/2026-04-22-cc-sprint-12-task1-session3-exit.md` — izvor 3 Task 1 carry-over items
- `decisions/2026-04-22-bench-spec-locked.md` + `.manifest.yaml` — A3 LOCK v1 parent manifest (Task 2 per-run manifest inherits)
- `decisions/2026-04-22-tie-break-policy-locked.md` — B2 LOCK (tie-break wire commit `fa4cbd6` implementira)
- `decisions/2026-04-22-b3-lock-dashscope-addendum.md` — B3 addendum (Surface A/B non-Anthropic provider carve-out relevantno za Field 5)
- `project_sprint_12_task1_closed.md` — memory entry za Task 1 close (reference za 9-commit ledger)
- `project_benchmark_alignment_plan.md` — Week 1 Qwen×LoCoMo scope (ovo mini run je first step)
- `project_preflight_gate.md` — 3-stage $60-115 gate (C3 mini je faktički ~stage 1 ekvivalent, budžet kalibracija open)

---

**C3 Stage 2 Mini AUTORIZOVAN — svi pre-kick items ratifikovani (§2.1 LOCKED Opcija C, §2.2 CC slug verify GREEN, §2.3 CC tie-break wire GREEN). Očekivano 4-6h wall-clock, $120-200 spend, cap $250, 4 cells × 100 LoCoMo instanca = 400 evaluations, primary ensemble Opus 4.7 + GPT-5.4 + Gemini 3.1-Pro, tie-break Grok 4.20 reserve, Qwen 35B-A3B target, A3 LOCK v1 manifest bindovan, Fleiss κ + Wilson + cluster-bootstrap CI live, F1-F6+F_other taxonomy live sa `a3_` namespace. CC-1 CLEARED to proceed sa §2 pre-kick sequence (types.ts ekstenzija + OpenRouter slug verify + live resolveTieBreak wire), pa §4 manifest generacija, pa §5 invocation.**

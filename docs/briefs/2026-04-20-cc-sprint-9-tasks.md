# CC Sprint 9 — Judge Wiring + Calibration Validation (Second-Pass)

**Datum:** 2026-04-20 (late evening)
**PM author:** Marko
**Target state na kraju sprint-a:** Judge pipeline produkciono spreman, PM↔CC kalibracioni match ≥ 8/10, Stage 1 mikro-eval unblockable u sledećem koraku.
**Budget:** ≤ $2 judge API spend (10 instances × 1-3 judges × ~2K tokens). Hard alarm na $5.
**Duration estimate:** 4-6h wall-clock. Ako pređe 8h, zatraži PM check-in — ne nastavljaj silently.
**Prereq:** Sprint 8 PUSHED na origin/main (`d58a5e5..e990261`). Stage 0 Dogfood run može ići paralelno — no critical-path contention; ako Stage 0 padne sa novim findings, Sprint 9 se može amendovati mid-flight.

---

## Context (ne preskakati)

Sprint 8 je izgradio scaffolding: `preflight-locomo-50.jsonl`, `failure-mode-calibration-10.jsonl`, judge modul na `packages/server/src/benchmarks/judge/failure-mode-judge.ts`, verbose-fixed template. Svi testovi prolaze, tsc clean, zero regression. Sprint 9 uvezuje taj scaffolding u runner i validira judge protiv PM human labels.

PM je 2026-04-20 late-evening završio first-pass kalibracioni labeling na svih 10 instanci (Path A: synthesized representative model answers pokrivaju pun F1-F5 spektar). Dokument sa verdiktima, failure mode pripisom i obrazloženjem po instanci živi na:

`D:\Projects\PM-Waggle-OS\calibration\2026-04-20-failure-mode-calibration-labels.md`

Sprint 9 radi second-pass: CC preuzima PM verdikte, pokreće Sonnet judge na istim (question, ground_truth, synthesized model_answer) triple-ovima, meri match rate. **PASS gate: ≥ 8/10 match.** Razlike se prikupljaju u handoff sekciju za PM razrešavanje pre Stage 2.

Zašto Path A a ne Path B (real model outputs): JSONL korpus ima ground_truth ali nema model_answer field — dok ne pokrenemo pravi 4-cell run, nemamo realne outpute. Path A daje kontrolisanu distribuciju za testiranje judge prompt-a pod controlled conditions. Path B (real outputs) ulazi kao v2 validacioni sloj posle Stage 2 izvršenja, u Sprint 10.

---

## Task 0 — Harvest timestamp preservation fix (Stage 0 pre-task, BLOCKING)

**Ref:** Stage 0 Dogfood handoff `PM-Waggle-OS\sessions\2026-04-21-preflight-stage-0-handoff.md` §7.1

**Root cause per CC Stage 0 run:** `packages/cli/src/commands/harvest-local.ts` u hive-mind repou postavlja `memory_frames.created_at = NOW()` (ingest-time) umesto da persistuje `item.timestamp` koji adapter već ekstraktuje u `UniversalImportItem`. Posledica: svi date-scoped retrieval query-i vraćaju frames bez validnog temporal anchor-a, što prisili inference na honest abstain. Ovo je architectural gap u Wave-3C adapter schema-ti, ne retrieval/query bug.

**Obim:**

1. U hive-mind repou (read-only za PM, write za CC — pratiti existing repo boundaries): izmeniti `packages/cli/src/commands/harvest-local.ts` da se `item.timestamp` iz `UniversalImportItem` mapira u `memory_frames.created_at`. Ako `item.timestamp` nije dostupan (null/undefined), fallback na `NOW()` uz log warn — ne silent default.

2. Unit test koji potvrđuje: (i) item sa timestamp-om kreira frame sa `created_at` == `item.timestamp`, (ii) item bez timestamp-a kreira frame sa `created_at` == ingest time + log warn.

3. **Re-harvest + re-run Stage 0:** nakon fixa, pokrenuti stage-0-query.mjs sa istim tri Marko pitanja na istom lokalnom KG storage-u (`D:\dogfood-exports\2026-04-20\kg-storage\personal.mind` — posle re-harvest-a). Cilj: bar dva od tri pitanja prelazi u SPECIFIC_AND_CORRECT ili PARTIAL (ne ABSTAIN). Ako i dalje sva tri ostaju ABSTAIN, stop i PM debug pre nastavka — znak da fix nije dovoljan ili da evidencija stvarno ne postoji u očekivanom obliku.

4. **Exit artifact:** update `waggle-os\preflight-results\stage-0-dogfood-2026-04-21.md` (ili novi `stage-0-dogfood-2026-04-XX-rerun.md`) sa post-fix verdicts i diff u rezultatima. Marko popunjava novi verdict blok.

**Acceptance (amendovano 2026-04-21 per PM response §10.1–§10.3):**

Stage 0 postaje formalno two-question battery (Q1 + Q2). Q3 = DEFERRED u exit artefaktu (cross-source test odložen do Stage 1 kad ChatGPT + Gemini exportovi stignu — ovo nije fail, to je workflow-reality reformulacija). Q3 se NE re-run-uje u Sprint 9. Mail/Calendar/Drive i Outlook/OneDrive adapter build — obustavljen, backlog trigger = konkretan Microsoft-shop enterprise referral customer.

**Code change + regression test gate:**

- Commit na hive-mind main (Wave-3D ili hotfix branch per hive-mind CI konvencije) sa TypeScript-strict prolaskom
- Regression test pokriva tri scenarija mandatorno (P0, bez test-a Task 0 ne može biti PASS):
  - valid ISO-8601 timestamp → `created_at` == exact same ISO string posle parse/format round-trip
  - `timestamp: undefined` → `created_at` ≈ test wall-clock time (toleransa <5s) + `console.warn` log koji sadrži frazu "missing timestamp" i adapter source + item id
  - invalid string (npr. "not-a-valid-iso-string") → ide kroz isti fallback path kao undefined (no exception bubbling, warn log emitted)
- Re-harvest successful u fresh `D:\dogfood-exports\2026-04-20\kg-storage\personal-rerun.mind`; original `personal.mind` ostaje netaknut kao "before" snapshot
- Diagnostic query (npr. `SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM memory_frames`) mora pokazati distribuciju `created_at` datuma raspoređenu kroz 2025 (oktobar-decembar period najgušći u Claude.ai istoriji), ne sve 2026-04-20

**Re-run verdict gate (trojni, po Q1 ishodu):**

**Tier 1 — PASS.** Q1 = SPECIFIC_AND_CORRECT (tačan datum 1. decembar 2025 + session kontekst editorial analize Legat trilogije + bar jedan konkretan narativ anchor iz {dual timeline 1900-1918+1903 Majski prevrat, seven-monastery quest Studenica→Hilandar, three-book katarza struktura} bez halucinacije). Task 0 PASS, Tasks 1-5 kreću.

**Tier 2 — CONDITIONAL PASS.** Q1 = PARTIAL uz sve sledeće kumulativno ispunjeno: datum tačan + session kontekst prepoznat + bar jedan anchor surfuje (dozvoljeno nepotpun) + bez halucinacije. Task 0 PASS sa dokumentovanim gap-om u exit pingu. **CC ne sme scope-creepovati Sprint 9 da "poboljša Q1 retrieval"** — gap ide u Sprint 10 backlog ako treba. Tasks 1-5 kreću.

**Tier 3 — FAIL.** Pogrešan datum OR pogrešan session ID OR halucinirani anchors OR Q1 ostaje ABSTAIN posle fix-a. Hard stop. PM debug sesija pre ičega. Tasks 1-5 ne kreću.

Distinkcija koja mora da se drži: PARTIAL je OK isključivo uz tačan datum + session kontekst + anchor bez halucinacije. Inače je to substrate failure prerušen u retrieval-quality issue → Tier 3 FAIL, ne Tier 2.

**Q2 gate:** SPECIFIC_AND_CORRECT preferirano; PARTIAL prihvatljiv ako je preview cap (§3.2 PM response) jedini razlog, mandatorno eksplicitno dijagnostikovati u komentaru, ne implicitno.

**Q3 gate:** NOT RE-RUN. Exit artefakt nosi `DEFERRED — cross-source test moved to Stage 1 pending ChatGPT/Gemini corpus` flag u Q3 sekciji (ne ABSTAIN). Distinkcija čuva audit trail.

Ako fix zahteva praćeću izmenu u `ClaudeAdapter` ili ostale adaptere (wave 3B/3C), dokumentovati u commit message-u i exit ping-u.

**Budget:** Zero API spend. Stage 0 re-run koristi Ollama gemma4:31b lokalno kao što je CC uradio prvi put.

**Duration estimate:** 2-3h wall-clock (fix + test + re-harvest + re-run + verdict fill).

**Commit message:** `fix(harvest-local): persist item.timestamp to memory_frames.created_at (Stage 0 root cause)`

**Napomena:** Tasks 1-5 mogu teći paralelno sa Task 0 samo za kod izmene (JsonlRecord schema, runner wiring, aggregate.ts) — sve dok Task 0 ne prođe re-run gate, Task 4 (kalibracioni run) se ne pokreće. Task 4 ionako koristi sintetički calibration-10 JSONL koji ne ide kroz harvest, ali redosled izvršenja se drži radi clean provenance chain-a.

---

## Task 1 — JsonlRecord extension per taxonomy §9

**Ref:** `PM-Waggle-OS\strategy\2026-04-20-failure-mode-taxonomy.md` §9 JsonlRecord extension

**Obim:** Proširiti JsonlRecord TypeScript interfejs u `packages/server/src/benchmarks/types.ts` (ili equivalent existing location — ako je u shared paketu, pratiti postojeći mesto) sledećim poljima:

- `model_answer?: string` — verbatim odgovor modela pod testom
- `judge_verdict?: "correct" | "F1_abstain" | "F2_partial" | "F3_incorrect" | "F4_hallucinated" | "F5_offtopic"` — judge klasifikacija
- `judge_confidence?: number` — 0.0-1.0 skala iz judge prompt-a (§4 spec)
- `judge_rationale?: string` — 1-2 rečenice zašto taj verdict
- `judge_model?: string` — model string (npr. `claude-sonnet-4-6`), za reproducibility
- `judge_timestamp?: string` — ISO-8601, za traceability

**Backward compat:** Svi novi field-ovi `optional`. Postojeći JSONL fajlovi se čitaju bez greške; undefined se tretira kao "not judged yet".

**Acceptance:**
- `tsc --noEmit` clean na server / core / shared paketima (pratiti Sprint 8 isti checklist)
- Unit test koji proverava: (i) JSONL record bez judge polja parsira se OK, (ii) JSONL record sa judge poljima parsira se OK, (iii) judge_verdict enum check hvata invalid string
- Ako postoji schema validator (Zod ili sl.), dopuniti; ako ne, preskoči i ostavi TypeScript checking

**Commit message:** `feat(benchmarks): extend JsonlRecord with judge verdict fields (taxonomy §9)`

---

## Task 2 — Judge wiring u runner.ts

**Obim:** U runner-u (verovatno `packages/server/src/benchmarks/runner.ts` — verify pre nego što počneš; ako je drugačiji path, ratifikuj sa PM pre nastavka), dodati judge call posle raw model response-a po instanci.

**Dve rute koje treba wire-ovati:**

1. **`judgeAnswer(question, ground_truth, model_answer, judgeModel)`** — single-judge path, default mode za produkcioni run. Vraća strukturisan verdict objekat koji se direktno upisuje u JsonlRecord polja iz Task 1. Default judge: `claude-sonnet-4-6`.

2. **`judgeEnsemble(question, ground_truth, model_answer, judgeModels[])`** — 3-judge mode za kalibraciju i za Fleiss' kappa compute. Poziva N judge-ova paralelno (verovatno Sonnet + Opus + Haiku za diverzifikaciju), vraća niz verdikata + majority vote + kappa preliminary compute. Koristiti samo kad je eksplicitno traženo (flag `--ensemble` ili jasan koden path).

**Prompt:** Koristiti verbatim judge prompt iz taxonomy spec §4. Ne parafrazirati, ne skraćivati. Prompt je locked — ako CC vidi nešto što misli da treba popraviti, file open question u `PM-Waggle-OS/sessions/2026-04-XX-sprint-9-judge-prompt-oq.md` umesto da menja silently.

**Failure handling:** Judge poziv može pasti (API timeout, malformed response). Implementiraj:
- 2 retry sa exponential backoff (1s, 3s)
- Ako posle 2 retry-a i dalje failure, record verdict = `undefined` + log warning, ne krši run
- Cost tracking per-instance (input tokens + output tokens + USD) — dodati u postojeći cost aggregator ako postoji, inače log u structured JSONL

**Acceptance:**
- Unit test: mock Anthropic API, pozovi `judgeAnswer` sa test triple-om, proveri da (i) poziv se desio, (ii) verdict se parsira iz response-a, (iii) verdict se pravilno upisuje u JsonlRecord
- Integration-style test: `judgeEnsemble` sa 3 mock judge-a vraća 3 verdikta + majority
- Zero pravi API calls u test suite-u (sve mock-ovano, prati Sprint 8 anti-spend policy)

**Commit message:** `feat(benchmarks): wire judgeAnswer and judgeEnsemble into runner pipeline`

---

## Task 3 — aggregate.ts — failure-mode distribution rollup

**Obim:** Novi ili proširen `packages/server/src/benchmarks/aggregate.ts` koji čita run output (JSONL sa populated judge poljima) i vraća strukturisan report.

**Report struktura (JSON + markdown renderer):**

1. **Per-cell distribution tabela:**
   - raw / memory-only / evolve-only / full-stack × {correct, F1, F2, F3, F4, F5}
   - Count + percent po ćeliji
   - Weighted score po §5 rubric: `1.0 × correct% + 0.30 × F2% + 0.00 × F1% − 0.15 × F3% − 0.35 × F4% − 0.10 × F5%`

2. **Per-LoCoMo-category distribution:**
   - cat 1 (multi-hop), cat 2 (temporal), cat 3 (open-ended), cat 4 (single-hop) × verdict spektar
   - Flag per category gde je F4 (hallucination) count > 20% — taj kategorija rating zahteva PM review

3. **Cross-cell delta matrica:**
   - full-stack vs raw: pokazuje "memory + evolve lift" po verdict tipu
   - Očekivanje: correct% raste, F4% pada, F1% može rasti (više abstain-a je sometimes OK signal)
   - Format: markdown tabela + JSON za downstream tools

4. **Cost summary:**
   - Total judge spend po ćeliji
   - Median ms per judge call
   - Ako cost > $20 per full 4-cell run na 50 instanci, file warning za Week 1 scale-up

**Acceptance:**
- Unit test sa sintetičkim 12-instance JSONL (3 cells × 4 verdicts) proverava:
  - Per-cell counts tačni
  - Weighted score matchuje manual calculation (dokumentovan u test komentaru)
  - Markdown output parsira se bez greške
- Output-and-snapshot test za markdown renderer — ako PM menja format-u, jasno se vidi diff

**Commit message:** `feat(benchmarks): aggregate.ts with failure-mode distribution and weighted scoring`

---

## Task 4 — Calibration validation run (second-pass) — **PASS GATE TASK**

**Obim:** Izvršiti Sonnet judge na svih 10 instanci iz `preflight-calibration-10.jsonl` koristeći synthesized model_answer-e iz PM-ovog calibration dokumenta. Uporediti CC judge verdict sa PM human label po instanci.

**Koraci:**

1. **Učitaj PM labels:** `D:\Projects\PM-Waggle-OS\calibration\2026-04-20-failure-mode-calibration-labels.md`. Dokument je markdown sa strukturiranim blokovima po instanci — parsirati ili ručno ekstraktovati (question, ground_truth, synthesized model_answer, PM human_label) u 10-entry JSON. Ako parsiranje postaje dugačko, CC može ručno preneti blokove u test fixture file za inicijalni run — flag u exit ping.

2. **Pokreni judgeAnswer** iz Task 2 po instanci sa Sonnet kao judge. Zapiši CC verdict + rationale + confidence.

3. **Compute match rate:** CC verdict == PM human_label per instance. Ukupno ≥ 8/10 = PASS, 6-7/10 = PARTIAL (debug required), < 6/10 = FAIL (stop, escalate na PM pre bilo kakvog daljeg rada).

4. **Disagreement handoff:** Za svaku instancu gde se verdikti razlikuju, upiši u handoff fajl:
   - Instance ID i question
   - PM human_label i rationale
   - CC judge verdict i rationale
   - CC predlog razrešenja: koji verdict je "ispravan" po CC analizi, ili "undecidable" ako je instanca ambiguous
   - **Nikad ne menjaj PM human_label bez PM ratifikacije** — handoff ide PM-u na odluku

5. **Exit artifact:** `D:\Projects\PM-Waggle-OS\sessions\2026-04-20-sprint-9-calibration-handoff.md` sa: match rate, per-instance table (CC vs PM side-by-side), disagreement list, PASS/PARTIAL/FAIL verdict.

**Acceptance:**
- PASS gate: ≥ 8/10 match. Ako ≥ 8 → Sprint 9 ostaje on track; ako < 8 → hard stop, PM debug sesija pre Sprint 10 / Stage 1.
- Exit artifact mora imati explicit "Judge production readiness: READY / NEEDS_PM_RECONCILIATION / FAIL" line.
- Stvarni API spend dokumentovan (ne procena). Ako premaši $5 alarm, hard stop i ping.

**Commit message:** `test(benchmarks): calibration second-pass — Sonnet judge vs PM labels, 10 instances`

Napomena: Ovaj task JE real API spend (nije mock). To je jedino sprint 9 mesto gde trošimo pravi novac. Budget je small (< $2 očekivano).

---

## Task 5 — Fleiss' kappa ensemble probe (opcionalno, ako PASS < perfect)

**Conditional trigger:** Pokreni Task 5 samo ako Task 4 vrati 8/10 ili 9/10 match (borderline PASS). Ako je 10/10, preskoči — single-judge je produkciono spreman. Ako je < 8, stop, PM debug.

**Obim:** Pokreni `judgeEnsemble` sa 3 modela (Sonnet + Opus + Haiku, ili najbliži dostupni set) na istih 10 instanci. Compute Fleiss' kappa across tri judge-a.

**Interpretacija:**
- kappa ≥ 0.70: ensemble je konzistentan; Stage 2 default mode = ensemble sa majority vote
- kappa 0.50-0.70: ensemble vredi ali sa PM review na disagreement cases
- kappa < 0.50: ensemble ne daje dodatni signal, ostani na single-judge sa dokumentovanim kappa, flag za Sprint 10+

**Exit artifact update:** Produžiti handoff fajl iz Task 4 sa kappa compute + interpretacijom.

**Budget:** Triple API spend, < $5 ukupno.

---

## Exit gate za Sprint 9

Sprint 9 je CLOSED i spreman za push samo ako su svi sledeći uslovi ispunjeni:

1. ✅ Task 0 commit-ovan u hive-mind, re-run Stage 0 pokazuje barem jedno pitanje ≠ ABSTAIN, exit artifact updated
2. ✅ Task 1 commit-ovan, `tsc --noEmit` clean, JsonlRecord backward-compat dokaz u testu
3. ✅ Task 2 commit-ovan, judge wire-ovan, mock testovi prolaze, zero pravi API calls u test suite-u
4. ✅ Task 3 commit-ovan, aggregate generiše distribution + weighted score report, test suite prolazi
5. ✅ Task 4 izvršen, match rate ≥ 8/10, handoff fajl napisan, stvarni API spend dokumentovan
6. ✅ Task 5 izvršen ako triggered, kappa compute + interpretacija upisani
7. ✅ Root vitest pass, tsc clean (isti checklist kao Sprint 8)
8. ✅ Exit ping na `D:\Projects\PM-Waggle-OS\sessions\2026-04-20-sprint-9-exit.md` sa: koliko commits ahead of origin (per repo — hive-mind + waggle-os), stvarni sprint wall-clock, stvarni API spend, eksplicitno PASS/PARTIAL/FAIL za kalibracioni gate i za harvest re-run gate
9. ✅ Ako je Task 0 re-run i dalje 3/3 ABSTAIN, Sprint 9 CLOSED kao PARTIAL — Tasks 1-3 ostaju valjani i push-abilni, Task 4-5 odlažu se do PM debug sesije o alternativnoj harvest strategiji
10. ✅ Ako je Task 4 < 8/10, Sprint 9 CLOSED kao FAIL na kalibracioni gate — **ne push-uj Task 4-5 commit-e**, Tasks 0-3 ostaju push-abilni, PM debug sesija pre Sprint 10

---

## Pre-Stage-2 operativna stavka (nije Sprint 9 task, ali flag za Week 1)

LiteLLM container u trenutnoj konfiguraciji nema `DASHSCOPE_API_KEY` (ni `ANTHROPIC`, `OPENAI`, `OPENROUTER`) — zato je CC Stage 0 fallback-ovao na Ollama gemma4:31b. Qwen3.6-35B-A3B canonical run za Stage 2 i Week 1 zahteva DashScope provisioning pre kickoff-a. Ovo NIJE Sprint 9 blokada (Tasks 0-5 ne zavise od provider key-a — Task 4 kalibracija ide direktno kroz Anthropic SDK, ne preko LiteLLM), ali Marko stavlja u pre-Stage-2 checklist. Estimate: 30 min operativnog rada (DashScope account + key provisioning + LiteLLM config update + smoke test `--backend litellm --model qwen3.6-35b-a3b`).

---

## Path constraints (ratifikovano iz Sprint 8)

- Judge modul JE na `packages/server/src/benchmarks/judge/failure-mode-judge.ts` (sibling-of-src per rootDir: "src" config). Ne pomerati u Sprint 9.
- Runner, aggregate — verifikuj postojeće lokacije pre Task 2/3. Ako existing konvencija stavlja ih drugo, prati konvenciju i dokumentuj path u exit ping-u (ista politika kao Sprint 8 deviation clause).
- Svi novi file-ovi moraju biti unutar `rootDir: "src"` granica.

---

## Reference chain (zahtevano čitanje pre nego što počneš)

1. `PM-Waggle-OS\strategy\2026-04-20-failure-mode-taxonomy.md` — §4 judge prompt verbatim, §5 scoring rubric, §9 JsonlRecord extension, §11 open questions (sve resolved u decisions fajlu)
2. `PM-Waggle-OS\strategy\2026-04-20-preflight-gate-spec.md` — za razumevanje kako Sprint 9 output hrani Stage 1/2
3. `PM-Waggle-OS\strategy\2026-04-20-four-cell-harness-spec.md` — jer aggregate.ts mora poštovati cell nomenklature
4. `PM-Waggle-OS\calibration\2026-04-20-failure-mode-calibration-labels.md` — PM first-pass labels, izvor istine za Task 4
5. `PM-Waggle-OS\decisions\2026-04-20-failure-mode-oq-resolutions-locked.md` — sve locked OQ resolutions
6. `PM-Waggle-OS\decisions\2026-04-20-harness-spec-4-oq-locked.md` — 4-cell OQ locks
7. `PM-Waggle-OS\sessions\2026-04-20-sprint-8-exit.md` — Sprint 8 state of the world, zna se šta je već built

---

## Anti-patterns (eksplicitno ne raditi)

- **Ne menjaj judge prompt** iz taxonomy §4. Ako CC vidi bug, file OQ fajl, ne touch-uj prompt.
- **Ne menjaj PM human_label-ove** u calibration fajlu bez PM ratifikacije. Disagreement-i idu u handoff, PM odlučuje.
- **Ne pokreći Task 4 real run dok Tasks 1-3 ne prođu mock testove.** Sprečava skupo debugging ciklus.
- **Ne skip-uj exit ping** čak i ako je sve passed. PM mora da vidi artifact handoff pre nego što pokrene Sprint 10.
- **Ne push-uj ako je Task 4 FAIL.** Tree može ostati dirty dok se ne razreši. Mini-sprint 8 gate style.

---

## Ako Stage 0 Dogfood padne tokom Sprint 9

Stage 0 ide paralelno sa Sprint 9. Ako Stage 0 vrati HALLUCINATED ili INCORRECT verdict na bilo kom pitanju, Stage 0 je hard-stop — ali Sprint 9 nastavlja dalje (judge wiring je infrastructurna radnja nevezana za harvest quality). Stage 0 findings utiču na Stage 1 trigger, ne na Sprint 9 exit gate.

Ako CC primeti Stage 0 ping sa FAIL flag-om tokom Sprint 9 rada, evidentiraj u exit ping-u kao context note, ne menjaj Sprint 9 scope.

---

**Launch instruction za CC:** Pročitaj sve reference file-ove pre Task 1. Ako nešto u ovom brief-u ne odgovara stvarnom stanju repoa (npr. runner.ts ne postoji na očekivanoj putanji), **stop i ping PM umesto da silently biraš alternativu** — ratifikacija mora biti explicit da bi Sprint 9 exit bio clean kao Sprint 8.

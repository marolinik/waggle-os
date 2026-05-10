# Benchmark Scope Expansion — Paired Inference for H-42

**Datum:** 2026-04-20
**Autor:** PM layer (Cowork session)
**Svrha:** Formalizovati preporuku za ekspanziju Track 2 H-42 scope-a sa single-model (Qwen + Waggle) na paired setup (Qwen + Waggle **i** Opus 4.6 + Waggle) radi dvoosnog multiplier proof-a. Ovaj dokument je decision support za Marka i handoff-ready brief za Claude Code ako ekspanzija bude odobrena.
**Trigger:** Marko 2026-04-20 korekcija framing-a — "Waggle multiplikuje bilo koji LLM, Qwen lokalno daje sovereignty, frontier + Waggle daje performance beyond frontier alone". Single-model H-42 ne pokriva drugi deo tvrđenja.
**Vezani dokumenti:** `briefs/2026-04-20-launch-copy-dual-axis-revision.md`, `briefs/track-b-benchmarks-brief-2026-04-19.md`.

---

## Predlog u jednoj rečenici

Pored postojećeg H-42a (Qwen 3.6 35B-A3B + Waggle LoCoMo run vs Mem0 91.6% SOTA baseline), dodati H-42b: identičan LoCoMo run ali sa Opus 4.6 preko Anthropic API + Waggle cognitive layer, sa Opus 4.6 bare baseline (Opus bez Waggle memory/retrieval/wiki sloja). Cilj: demonstrirati lift ≥ +5pp nad bare Opus, što dokazuje da cognitive layer radi kao multiplier i na frontier klasi modela, ne samo kao sovereignty proxy za Qwen.

---

## Zašto ovo ima smisla

**Narativna simetrija.** Single-model proof pokriva jedan od dva claim-a iz core thesis-a. Paired proof pokriva oba istovremeno. Sovereignty argument (Qwen + Waggle ≈ frontier API) nije dovoljan sam po sebi jer ostavlja otvoreno pitanje "da li je cognitive layer stvarno radio ili je Qwen slučajno bio dovoljan". Multiplier argument na frontier modelu odgovara na to pitanje empirijski.

**Risk redukcija pre-mortem Tigers-a.** T-02 (score below noise) u postojećem pre-mortem registru je označen kao launch-blocking. Sa paired setup-om, T-02 se slabi — ako Qwen run ne pogodi clean beats ali Opus + Waggle pokazuje jasan lift, launch ostaje defensible preko multiplier proof-a. Distribucija ishoda "25% clean beats / 45% matches + trade-off / 20% below / 10% tail" se revidira na "realistično 40-50% makar jedan proof venue zeleni, 70%+ makar jedan neutral". Paired setup strukturno povećava verovatnoću defensible launch-a.

**Konzistentnost sa core thesis memorijom.** `project_core_thesis.md` već eksplicitno zabranjuje "small beats big" i nalaže da se framing drži "cognitive layer spojen sa bilo kojim LLM-om pruža kontinuitet". Single-model benchmark implicitno kontradiktuje toj formulaciji jer priča je "Qwen sa Waggle-om". Paired benchmark čini memorijsku formulaciju empirijski podržanom.

---

## Šta se konkretno radi

**H-42a (postojeći, bez izmena):**
- Inference plane: Qwen3.6-35B-A3B (lokalno, preko vLLM na dev hardware-u ili DASHSCOPE API kao fallback ako lokalni GPU kapacitet bude uzak)
- Cognitive layer: Waggle full stack (memory + retrieval + wiki)
- Dataset: LoCoMo upstream, čeksum verifikovan
- Judge ensemble: 4-model (gemini-3.1-pro-preview, gpt-5, grok-4.20, MiniMax-M2.7) — nema Anthropic u evaluator loop-u
- Baseline za poređenje: Mem0 91.6% SOTA (javni broj iz Mem0 LoCoMo paper-a)
- Output: FINAL_SCORE.json, CONFIG.json, commit SHA, reproducibility bundle

**H-42b (novi, paralelno):**
- Inference plane: Opus 4.6 preko Anthropic API (API key iz postojeće dev kese; ako budžet zabrinjava, videti cost estimate ispod)
- Cognitive layer: Waggle full stack (identičan kao H-42a)
- Dataset: **isti** LoCoMo sample kao H-42a (ne novi sample, ne re-split)
- Judge ensemble: **isti** 4-model — ne duplirati judge trošak
- Baseline za poređenje: Opus 4.6 bare run (Opus direktno na LoCoMo turn sequences, bez Waggle memory/retrieval/wiki sloja)
- Output: FINAL_SCORE.json za oba run-a (Opus+Waggle i Opus_bare), lift = delta_pp, reproducibility bundle

**Judge ensemble delenje:** najznačajnija ušteda. Svaka LoCoMo Q generiše 4 judge poziva. Paired setup znači 2x inference run-ova (Qwen+Waggle, Opus+Waggle, Opus_bare — zapravo 3 run-a ukupno), ali judge pozivi ostaju 1x po Q za svaki run. To je 12 judge poziva po Q ukupno (4 × 3 run-a) umesto 4 u single setup-u. Budget impact je linearan u broju Q, ne eksponencijalan.

---

## Cost estimate

**Opus 4.6 API (H-42b inference):**
- LoCoMo standardni split: ~200 konverzacija, ~10 Q po konverzaciji = ~2000 Q
- Svaki Q je cross-session retrieval + answer generation — procenjeno ~15-25K input tokens i ~500-1000 output tokens (zbog context inject-a sa Waggle retrieved memories)
- Opus 4.6 pricing (API public): $15/Mtok input, $75/Mtok output
- Estimate input cost: 2000 × 20K × $15 / 1M = **$600**
- Estimate output cost: 2000 × 750 × $75 / 1M = **$112.50**
- **Opus + Waggle run: ~$700-750**
- Opus bare run (bez Waggle contextа, pa kraći input): ~40-50% cheaper, **~$350-400**
- **Paired H-42b ukupni Opus API cost: ~$1050-1150**

**Judge ensemble (incremental):**
- Paired setup dodaje 2 × 2000 × 4 = 16,000 judge poziva (Opus+Waggle i Opus_bare × 2000 Q × 4 judges)
- Prosečni judge troška (miks 4 modela): ~$0.01-0.02 po pozivu
- **Incremental judge cost: ~$160-320**

**Ukupno paired expansion cost: ~$1200-1500.** Za company sa 4.5M EBITDA i benchmark koji definiše launch narrative, ovo je zanemariva stavka.

---

## Wall-clock i sequencing

**Paralelno izvršenje:**
- Qwen run (lokalno ili DASHSCOPE) i Opus runs (Anthropic API) ne dele resurse. Mogu startati istovremeno.
- Judge ensemble pozivi mogu da se baračuju — nije neophodno da sve završe u istom minutu.
- Ako Qwen run traje T_qwen i Opus runs (paralelno, queued) traju max(T_opus_waggle, T_opus_bare), ukupno wall-clock = max(T_qwen, T_opus_total).
- Procenjeno: T_qwen ≈ 6-8h, T_opus_total ≈ 4-6h (Opus API rate limits primenjive, ali razumno paralelizabilno). **Nema produženja wall-clock-a.**

**Sequencing u Track 2 planu:**
- Dan 1-2: H-42 setup + ground truth validation (postojeće + paired CONFIG spec)
- Dan 3-4: H-42a + H-42b inference runs (paralelno)
- Dan 4-5: Judge ensemble scoring (svi runs, paralelizovano)
- Dan 5-6: FINAL_SCORE aggregation, reproducibility bundle, peer-review gate
- Dan 6-7: Handoff za launch copy decision

Paired scope ne produžava Track 2 critical path. Kompresuje samo u setup fazi (2-3h extra na CONFIG spec + Opus API integration).

---

## Rizici specifični za paired setup

**R-P1 — Anthropic API flaky u run window-u.** Ako Anthropic API ima rate limiting ili outage tokom H-42b run-a, paired proof pada. Mitigacija: rerun sa retry logic, window-overlap tolerancija (±24h za H-42b finish), i fallback na single-axis Varijante A/B/C iz 2026-04-19 ako paired ne uspe. Verovatnoća: niska (~5-10%). Ne launch-blocking.

**R-P2 — Opus bare baseline methodology dispute.** "Opus 4.6 bare" mora biti jasno definisan — da li je to (a) Opus koji vidi samo trenutni turn, (b) Opus koji vidi celu session history u kontekstu, ili (c) Opus koji vidi celu history + standard system prompt? Izbor menja lift broj. Mitigacija: **LOCK methodology pre run-a** — predlog (b) "full session history u context window", jer to je fer baseline za memory benchmark (isti pristup koji bare Mem0 ima u svom paper-u). Dokumentovati u CONFIG.json sa rationale. Verovatnoća: medium bez mitigacije, niska sa lockom. Ne launch-blocking ako je lock urađen.

**R-P3 — Lift isuviše mali (<+2pp).** Ako Opus + Waggle pokazuje trivial lift, multiplier proof pada. Ta grana u decision matrici u `2026-04-20-launch-copy-dual-axis-revision.md` aktivira Varijantu A ili B iz 2026-04-19 single-axis fajla. Mitigacija: preemptive launch copy prepared za sva 9 ćelija matrice. Verovatnoća: niska jer je Waggle v5 PromptAssembler već pokazao H1 PASS +5.2pp na Opus 4.6 (PA v5 test 2026-04-XX, memory entry `project_pa_v5_results.md`). Očekivani lift u H-42b je strukturno sličan.

**R-P4 — Judge ensemble bias prema Opus+Waggle (zbog Waggle output format).** Waggle može da producira strukturiranije odgovore koje judge-i nesvesno preferira. Mitigacija: blind evaluation protocol (judge ne zna koji run je koji), već implicitan u eval spec-u ali treba eksplicitno potvrditi u H-42b CONFIG. Verovatnoća: medium. Treba verifikovati pre run-a.

---

## Decision potrebna od Marka

**Go / no-go za H-42b ekspanziju:**

**Go** znači: pišem Claude Code handoff brief za paired setup, Track 2 dobija 2-3h setup dodatak, ~$1500 API cost dodatak, i multiplier proof capability. Copy default postaje Varijanta M iz `2026-04-20-launch-copy-dual-axis-revision.md`.

**No-go** znači: ostajemo na single-axis H-42 kako je spec'd, copy default ostaje A/B/C iz `2026-04-19-launch-copy-variants.md`. Multiplier framing se može dodati post-launch kao follow-up paper ili v2 benchmark run.

**Moja preporuka:** go. Cost je zanemariv u odnosu na narrative strength koju dodaje, wall-clock impact je nula, i core thesis konzistentnost se podiže. Jedini razlog za no-go bio bi ako Marko nema tolerance za Opus API budžet u ovom prozoru ili ako želi da paired proof čeka v2 release ciklus.

---

## Ako je go — sledeći korak

Čim Marko validira, pišem:

1. `briefs/track-b-benchmarks-brief-2026-04-20-paired.md` — operational handoff za Claude Code sa H-42b spec, CONFIG template, Opus API integration checklist, blind evaluation protocol confirmation.
2. Addendum za `2026-04-19-sota-benchmark-audit-readiness.md` — checklist proširen sa 14 na 16 stavki (paired reproducibility + Opus ledger).
3. Addendum za `2026-04-19-sota-benchmark-pre-mortem.md` — revidirani T-02 (slab sa paired proof), novi R-P1/P2/P3/P4 rizici uvršteni.
4. Update `project_sota_benchmark_governance.md` memory entry — pokriva paired scenario kao default.

Sve četiri mogu da završim u ovoj sesiji bez blokiranja Claude Code-a na Track 1.

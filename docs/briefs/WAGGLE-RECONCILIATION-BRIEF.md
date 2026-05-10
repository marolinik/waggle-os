# Brief za Claude Code — Reconciliation sa Master Backlog

**Autor:** Claude.ai (strategic sparring sa Marko)
**Datum:** April 18, 2026
**Audience:** Claude Code, radi u `D:\Projects\waggle-os`
**Priority:** Context-setter. Nije sprint brief — ovo je dokument koji pomaže Marku da sinhronizuje strateške razgovore (sa Claude.ai) sa egzekucionim backlog-om (sa Claude Code).

---

## 0. Zašto ovaj dokument postoji

Marko i Claude.ai su 17-18. aprila vodili dugačak strateški razgovor o:
- PA v5 rezultatima i narednim koracima
- hive-mind OSS strategiji
- Three-product positioning (hive-mind / Waggle / KVARK)
- Memory benchmark landscape
- Hipotezi "memory + agent harness = novi LLM sloj"

Istovremeno, Claude Code je održavao `docs/plans/BACKLOG-MASTER-2026-04-18.md` — 121 items, ~93 eng days, detaljan sprint plan.

Naš strateški razgovor **delimično je preotkrivao** ono što je već bilo dokumentovano u repou (research serija, PAPER koncepti, OSS packaging strategija), i **delimično je nadgradio** postojeće planove novim insight-ima.

Ovaj brief dokumentuje **gde se stvari preklapaju, gde se dopunjuju, i gde postoje kontradikcije koje treba rešiti** pre nego što se krene u izvršenje.

**Ovo je dokument koji Claude Code treba da pročita pre nego što krene na backlog sprint.** Ne menja backlog direktno, ali postavlja kontekst za par odluka koje Marko mora da donese.

---

## 1. Moja iskrena korekcija — prethodno pogrešan pogled

U prethodnim razgovorima, predlagao sam "wiki-compiler bootstrap brief" kao da je to novi rad. **Nije.** Uvidom u repo:

- `docs/wiki-live/` već sadrži 28 kompajliranih stranica (2026-04-13), uključujući profesionalne entitete za Marko Markovic, KVARK, Egzakta Group, Waggle OS, hive-mind, itd.
- `packages/wiki-compiler/` je potpuno funkcionalan, koristili smo ga u produkciji
- Quality je legitimno dobar — stranice imaju frame citations, confidence scores, related_entities, ozbiljnu sekciju strukture

**Ispravka:** Wiki-compiler NIJE untested niti neproveren. Radi. Moja prethodna sugestija da "pokrenemo prvi bootstrap" je bila pogrešna.

**Šta je zapravo pitanje:** treba li **novi run** na **svežim podacima** nakon što završi Phase 1 Harvest (H-11..H-20 u backlog-u). To je tačno ono što H-19 već pokriva ("Wiki compile from real data"). Nije potreban novi brief — backlog je taj već zakazan.

**Akcija:** zaboravite `WAGGLE-KNOWLEDGE-BASE-BOOTSTRAP-BRIEF.md` iz ovog razgovora. Backlog H-19 pokriva taj posao elegantno i u pravom vremenu (posle harvest-a, ne kao zasebna vežba).

---

## 2. Šta naš razgovor DODAJE backlog-u (nove stavke koje treba uneti)

### 2.1 Benchmark portfolio — nije u backlog-u

Backlog ima H-21 (Phase 4 Memory Proof), H-22 (Phase 5 GEPA Proof), H-23 (Phase 5b Combined). Ovo su interno-metodološki proofovi sa custom paired queries.

**Što nedostaje:** standardizovani benchmark-ovi koje publika i akademska zajednica očekuju.

- LoCoMo (standard memory benchmark, Mem0 trenutni SOTA 91.6%)
- LongMemEval (Mem0 SOTA 93.4%)
- SWE-ContextBench (novi dec 2025, direktno meri context reuse — naš najjači teren)

**Predlog za backlog:** dodati kao **Block H12 — Public Benchmark Runs** posle H-25 (Paper 2), pre H-34 (hive-mind extraction).

Razlog za ovu poziciju: hive-mind launch bez standardizovanih benchmark brojeva neće biti uzet ozbiljno od tech audience-a. Mem0 objavljuje njihove, Zep njihove, SuperLocalMemory njihove. Bez LoCoMo broja u README-u, hive-mind izgleda kao još jedan arhitekturni pitch.

Tri nove stavke za backlog:

**H-42 · LoCoMo benchmark run na hive-mind**
- Use `snap-research/locomo` evaluation harness (nemoj reimplementirati)
- Dva konfiga: local (inprocess embedder + Ollama answer model), frontier (Opus 4.7 answer model)
- Očekivano: 70-85% local, 80-90% frontier
- Commit rezultata u `docs/results/LOCOMO-RESULTS.md`
- Effort: 2 dana

**H-43 · LongMemEval benchmark run na hive-mind**
- Isti pattern kao H-42
- Effort: 2 dana

**H-44 · SWE-ContextBench run na hive-mind + Waggle**
- Noviji benchmark, direktno testira context reuse između related tasks
- Naš najjači teren jer MPEG-4 I/P/B + bitemporal KG arhitektura je specifično prilagođena tome
- Target: top 3 u tom benchmarku
- Effort: 3 dana

**Total za Block H12:** 7 dana. Može da radi paralelno sa paper drafting-om (H-24/H-25).

### 2.2 Qwen3 finding — needs elevation

Naš PA v5 pokazao je da **Qwen3-30B-A3B-Thinking baseline pobeđuje Opus 4.6 baseline na 4/6 Waggle scenarija**. Sa cenom $0.08/$0.40 vs $5/$25 per MTok, to je ~60x cost-performance advantage za analitičke workload-ove.

**U backlog-u nema eksplicitne tačke za ovo** iako je ovo jedan od najjačih KVARK commercial argumenata koje imamo.

**Predlog:** dodati **M-49 · KVARK architecture brief update — Qwen3 kao default**
- Update `docs/kvark-http-api-requirements.md` ili stvori `docs/KVARK-MODEL-STRATEGY.md`
- Dokumentuj da je Qwen3-30B-A3B-Thinking default model za analitičke tier-e
- Opus 4.7 rezerviran za multilingual/high-accuracy tier
- Ovo je direktan input za Yettel, RFZO, i Clipperton investor pitch deck
- Effort: 2 sata

### 2.3 "Memory + harness = novi LLM sloj" — core thesis formulacija

Marko i ja smo proveli dosta vremena formulišući tezu: "LLM + memorija + retrieval + wiki = sistem koji daje agent harness-u svestan continuity koji sam LLM nema."

**U repou ovo postoji fragmentirano** — u research/06-waggle-os-product-overview.md verovatno, u PAPER-1 intro, u WAGGLE-CORNERSTONE.md. Ali nije kristalizovano kao JEDAN kanonski dokument.

**Predlog:** dodati **M-50 · Canonical thesis document**
- Fajl: `docs/THESIS-COGNITIVE-LAYER.md`
- 600-800 reči, interno-prvo, launch-narrative-ready
- Precizna formulacija: "cognitive layer" ne "conscious agent" (metafora može da povredi)
- Tri sastojka: arhitektura (frame-graph + bitemporal KG), validacija (PA v5 across 5 models), realni test (Claude Code self-use)
- Postaje ulaz u blog post-ove, pitch deck-ove, Paper 1 intro
- Effort: 3-4 sata (Claude.ai može da piše draft, Marko review)

---

## 3. Kontradikcije koje treba rešiti

### 3.1 Stripe pricing — dve verzije postoje

**Backlog [M]-01:** Pro $19/mo + Teams $49/seat/mo

**Strateški memory iz ranijih razgovora + meni stored memories:** Teams $29/mo + Business $79/mo

**Ovo je stvarna kontradikcija.** Obe varijante postoje u konkurentnoj dokumentaciji.

**Predlog:** neka Marko odluči kanonski pricing **pre [M]-01**, i ažuriraj svugdje gde piše (backlog, landing page, research docs, CLAUDE.md). Preporuka: novija odluka u backlog-u ($19 Pro / $49 seat Teams) verovatno je prava jer je napisana 18. aprila, a moja memorija o $29/$79 je iz starijeg razgovora.

**Akcija za Marko:** potvrdi pricing u jednom turn-u. Onda Claude Code radi global search/replace.

### 3.2 hive-mind timing — [M]-07 je otvoren

Backlog [M]-07 je decision: "ship-with or ship-before Waggle".

**Naša strategija iz razgovora:** **ship-before Waggle**, po sledećem sequencing-u:
1. Sprint 0: Stripe M2-2 finish (sad)
2. Sprint 1: hive-mind code migration iz Waggle, ~5-10 dana (NE 2-3 dana kao backlog H-34 procenjuje, jer migration je realno veći posao)
3. Sprint 2: hive-mind LoCoMo/LongMemEval benchmark runs
4. Sprint 3: hive-mind public launch + blog post koji spaja PA v5 findings
5. Sprint 4+: Waggle launch sa hive-mind već na tržištu kao "foundation layer"

**Razlog za ship-before:** hive-mind je technical credibility vehicle. Ako Waggle launch-uje prvi, hive-mind izgleda kao "oh, and also we have this open source thing". Ako hive-mind launch-uje prvi, Waggle launch-uje sa "we are the commercial product built on the hive-mind layer that 1000 developers already use". Second narrativ je 3-5x jači.

**Predlog za Marko odluku:** potvrdi ship-before. Onda backlog H-34 (hive-mind extraction) postaje **early-mid** u sequence-u, ne **pred-launch** polish item.

**Napomena:** backlog procena za H-34 je "2-3 days". Realna procena, gledajući `D:\Projects\hive-mind` stanje (plan spreman, code migration nije započet): **5-10 dana** kvalitetnog rada za runnable v0.1 alpha. Claude Code treba da zna ovu razliku pre nego što commituje timeline.

### 3.3 Memory harvest scope — ChatGPT export wait

Backlog H-16: ChatGPT import "waits on M1" (OpenAI export email).

**Naš razgovor:** možemo da krenemo sa **Gemini + Claude + Claude Code + Cursor** (sve lokalno dostupno). ChatGPT samo dodaje više istih podataka ali nije blocker. Ako benchmark-uje dobro sa 4 izvora, ChatGPT se doda kada stigne.

**Ovo NIJE kontradikcija** — backlog već kaže H-16 je "kept as ready-to-go item" (ne blocker). Samo treba potvrditi da je Phase 4 Memory Proof (H-21) okej da krene pre ChatGPT-a. Preporuka: da.

---

## 4. Šta treba dodati u Marko-side queue

Backlog ima [M]-01 do [M]-10. Naš razgovor generiše nekoliko novih decision item-a:

**[M]-11 · Stripe pricing lock-in**
- Potvrdi Pro $19/mo + Teams $49/seat/mo (ili alternativa)
- Unblocks: sve Stripe radove, research docs konzistentnost
- Effort: 5 minuta odluka

**[M]-12 · "Marko's 3 Years" privacy level**
- Benchmark strategy predlaže korišćenje 3-godišnje lične istorije kao proof artifact
- Pitanje: javno u sirovom obliku, anonimizovano, ili samo interno kao validation?
- Preporuka: **anonimizovano za public use** (briše client names, finansijske specifičnosti, treće lica) + sirovo za interno
- Unblocks: launch blog post hook, Paper 1 evaluation section
- Effort: odluka + eventualna anonimizacija pipeline (pola dana)

**[M]-13 · Self-test hive-mind u Claude Code 2 nedelje**
- Nakon hive-mind alpha je runnable, koristi ga 2 nedelje u dnevnom Claude Code radu
- Beleži anegdotske primere (ne formalni benchmark) gde pomaže, gde ne pomaže
- Ovo je test teze "agent harness + memorija = novi LLM sloj" kroz najjaču moguću evidenciju — vlastitu power-user upotrebu
- Unblocks: launch narrative validity
- Effort: 2 nedelje passive usage + 1 sat beleženja po nedelji

**[M]-14 · Benchmark strategy approval**
- Review `BENCHMARK-STRATEGY.md` (kreiran u razgovoru, na Claude.ai strani)
- Approve 12-month benchmark portfolio
- Unblocks: H-42/H-43/H-44 (predloženi novi items)
- Effort: 20 minuta read + odluka

---

## 5. Overlap sa existing research — šta NE treba duplirati

Research serija (`docs/research/01-07`) već pokriva ozbiljne strateške teme koje sam ja u razgovoru ponavljao. Claude Code, molim te proveri da se naš razgovor ne duplira sa već postojećim radom:

- `01-oss-memory-packaging-strategy.md` — već definisano Apache 2.0 + ee/ pattern, already covers "set the terms of ecosystem" argument koji sam ja nezavisno re-derivovao
- `02-memory-system-scientific-draft.md` — već postoji paper draft
- `03-memory-harvesting-strategy.md` — already covers "bring your memory home"
- `04-gepa-public-reveal-strategy.md` — GEPA reveal strategy koji sam nezavisno re-derivovao
- `05-user-personas-ai-os.md` — korisnik personas
- `06-waggle-os-product-overview.md` — product overview
- `07-skills-connectors-strategy.md` — skills + connectors

**Preporuka za Marko:** kada budeš pisao launch content, **prvo pročitaj ove research docs**. Verovatno sadrže 60-80% onoga što mi sa Claude.ai "otkrivamo" ponovo. Razgovor sa mnom je koristan za next-iteration nuance, ali research serija je već temelj.

---

## 6. Rekalkulacija critical path — sa dodacima

Backlog trenutni critical path: 7-8 nedelja paralelno (sa najdužim lancem H-22 GEPA Proof 18 dana → H-25 Paper 2).

**Sa ship-before-Waggle hive-mind odlukom** i dodatim benchmark blokom H-42/43/44:

```
WEEK 1:
  Day 1-5: H-01..06 Polish A+B · H-26..33 Stripe · [M]-01 + [M]-11 
  Day 6-7: H-07..10 GEPA wiring closure · Start H-14 Cursor

WEEK 2:
  H-11..20 Harvest Phase 1 + H-19 wiki compile check
  Start H-21 Memory Proof (baseline setup)
  [M]-12 privacy decision

WEEK 3-4:
  H-21 Memory Proof execution (10 dana)
  Parallel: H-34 hive-mind extraction START (5-10 dana)
  Parallel: H-22 GEPA Proof execution (18 dana) — ovo je wall time, ne active time

WEEK 5:
  H-23 Combined Proof
  H-34 hive-mind extraction finalize
  [M]-13 Marko hive-mind self-test START
  Start H-42/43/44 public benchmarks na hive-mind

WEEK 6:
  H-24 Paper 1 draft
  H-42/43/44 complete
  hive-mind PUBLIC LAUNCH (blog + repo + benchmark numbers)
  [M]-13 self-test ongoing

WEEK 7:
  H-25 Paper 2 draft
  H-35..41 Launch prep za Waggle (binary, Clerk, signing)
  Marketing content (M-31/M-32)
  [M]-13 self-test completes

WEEK 8:
  Peer review (M-09)
  Waggle PUBLIC LAUNCH sa hive-mind already-established credibility
```

**Ključna promena:** hive-mind launch je WEEK 6, Waggle launch je WEEK 8. Dve odvojene objave, hive-mind kao foundation narrative, Waggle kao built-on-top komercijalni proizvod.

**Realistični totali:** 8 nedelja do Waggle launch-a umesto 7-8 paralelno. Jedna dodatna nedelja kupujem strateški momentum dvostrukim launch-om.

---

## 7. Akcioni items za sledeću sesiju sa Claude Code

Kada Marko otvori Claude Code sesiju, predlog da krene sa:

1. **Read this brief end-to-end** (10 min)
2. **Read `docs/research/01-oss-memory-packaging-strategy.md`** da potvrdi da naš razgovor ne duplira (15 min)
3. **Pogledaj `docs/wiki-live/` i potvrdi da wiki-compiler stvarno radi** (5 min)
4. **Marko odlučuje [M]-11, [M]-12, [M]-13, [M]-14** (30 min)
5. **Dodaj H-42/43/44 u backlog master, ažuriraj critical path tabelu** (20 min)
6. **Dodaj M-49 (Qwen3) i M-50 (canonical thesis doc) u backlog** (10 min)
7. **Otvori GitHub issue za 4 GEPA gaps** (H-07..H-10 su u backlogu sa konkretnim detaljima, issue samo formalizes public tracking)
8. **Start H-01 (QW-3 skip boot)** kao prvi konkretan code task, nastavi kroz backlog Day 1 sequence

---

## 8. Šta ostaje otvoreno — real questions

Ove stvari mi nisu jasne ni nakon analize repoa + razgovora i treba ih Marko razreši:

**Pitanje 1:** Da li su `docs/test-plans/MEMORY-HARVEST-TEST-PLAN.docx`, `GEPA-EVOLUTION-TEST-PLAN.docx`, i `COMBINED-EFFECT-TEST-PLAN.docx` pisani pre ili posle PA v5 eval-a? Ako pre, možda su metodološki stariji od onoga što smo naučili kroz v5 (4-judge ensemble, judge model diverzitet, variance retry). Možda treba update.

**Pitanje 2:** `docs/wiki-live/` je zadnji put kompajliran 2026-04-13 (5 dana pre ovog dokumenta). Da li je to bilo na personal.mind ili development-specifičnom mind-u? Ako je na personal.mind, onda hive-mind test u sebi već sadrži pravu validaciju. Ako je na test dataset-u, H-19 zadatak (wiki compile from real data) je još uvek smislen.

**Pitanje 3:** `docs/research/PAPER-1-CONCEPT_hive-mind-memory.md` već ima section skeleton i key claims. Koliko H-24 "Paper 1 · Memory system paper draft" je zapravo "write from scratch" vs "fill in placeholders sa Phase 4 rezultatima"? Ako je drugo (verovatno je), 3-day effort estimate je preoptimistički za pisanje ali realističan za filling data. Treba uskladiti.

---

## 9. Zaključak — kako ovaj brief treba tretirati

Ovo nije novi sprint brief. Ovo je **context reconciliation** dokument koji pomaže Marku da:

1. Ne duplira rad između Claude.ai strateških razgovora i Claude Code egzekucije
2. Zna gde naš razgovor dodaje stvarnu vrednost (LoCoMo benchmarks, Qwen3 elevation, canonical thesis doc, ship-before-Waggle hive-mind odluka)
3. Zna gde naš razgovor nepotrebno ponavlja postojeći rad (research serija, wiki-compiler validacija)
4. Ima jasnu listu decision items ([M]-11 do [M]-14) koji unblock-uju izvršenje

**Kada Claude Code pročita ovo, treba da:**
- Ažurira backlog sa H-42/43/44 i M-49/50 ako Marko potvrdi
- Zabeleži [M]-11..14 decisions
- Krene sa Day 1 backlog sequence (ne menjajući osnovnu logiku backlog-a)

**Backlog je dobar. Ne treba ga prepisivati. Treba ga samo proširiti novim benchmark blokom i sitnim dodacima.**

---

## Dodatak — file reference

Fajlovi koji su bili deo ovog razgovora, a nisu već u repou:
- `/mnt/user-data/outputs/BENCHMARK-STRATEGY.md` — 12-mesečni benchmark portfolio plan za hive-mind/Waggle/KVARK
- `/mnt/user-data/outputs/WAGGLE-KNOWLEDGE-BASE-BOOTSTRAP-BRIEF.md` — **ZASTAREO**, zamenjen H-19 u backlog-u koji pokriva istu stvar

Fajlovi koji su u repou i koje Claude Code već koristi:
- `docs/plans/BACKLOG-MASTER-2026-04-18.md` — kanonski backlog
- `docs/research/01-07-*.md` — OSS strategija, papers, product overview
- `docs/research/PAPER-1-CONCEPT_hive-mind-memory.md` — Paper 1 skeleton
- `docs/research/PAPER-2-CONCEPT_gepa-evolution.md` — Paper 2 skeleton
- `docs/HIVE-MIND-INTEGRATION-DESIGN.md` — hive-mind extraction detail
- `docs/wiki-live/` — 28 kompajliranih wiki stranica
- `docs/WAGGLE-CORNERSTONE.md` — thesis document
- `packages/wiki-compiler/` — already-functional wiki compiler

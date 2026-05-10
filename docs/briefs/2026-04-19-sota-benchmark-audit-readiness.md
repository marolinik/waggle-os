# SOTA Benchmark Audit-Readiness Brief

**Datum:** 2026-04-19
**Autor:** PM layer (Cowork session)
**Scope:** Track 2 benchmarks — H-42 LoCoMo, H-43 LongMemEval, H-44 SWE-ContextBench — svi na istom engine-u Qwen/Qwen3.6-35B-A3B, sa judge ensemble-om bez Anthropic-a.
**Svrha dokumenta:** Definisati uslove pod kojima benchmark broj sme da napusti interni perimetar i uđe u launch copy, research paper, announcement, ili bilo koji externalni kanal. Ovo nije tehnička specifikacija benchmark-a (ta živi u `track-b-benchmarks-brief-2026-04-19.md`) već gate policy koja određuje kada je broj audit-defensible.
**Gate statement:** Launch je SOTA-gated (LOCKED 2026-04-18). SOTA-gated znači da broj koji objavimo mora izdržati tri različite vrste pritisaka — tehnički replikabilitet, metodološka ispravnost, i regulatorni audit. Ova tri filtera su nezavisna; svaki od njih ima moć da broj skine sa objave. Ovaj brief imenuje šta svaki filter proverava i kako se validira.

---

## Zašto ovaj dokument postoji sada

Imamo tri potpuno predvidljive scenarije koji će otvoriti napade na broj čim izađe u svet.

Prvi, tehnički skeptik koji pokušava da reprodukuje LoCoMo rezultat sa `pnpm run benchmark:locomo` iz našeg repo-a. Ako dobije rezultat koji se razlikuje od našeg za više od ±2%, ili ne može uopšte da pokrene harness, narativ "verified SOTA" počinje da curi. Ne moramo da zadovoljimo svakog skeptika, ali moramo da imamo dokazivu putanju — commit hash, config file, dataset checksum, model identifier, sva četiri judge model-a sa verzijama, seed-ove — koja vodi od našeg broja nazad do determinističke specifikacije. Ako tu specifikaciju nemamo, broj je mnjenje.

Drugi, metodološki recenzent koji radi peer-review poređenje sa Mem0 91.6% (LoCoMo), Letta ~83% (LongMemEval), i existing SWE-bench-derived scorovima. Pitanja koja postavlja: da li ste koristili isti dataset split, isti judge protokol, istu metriku, isti hop count za multi-hop questions, istu temporal reasoning normalizaciju? Ako je bilo kojoj dimenziji odgovor "slično ali ne identično", vaša brojka nije direktno uporediva i ne možete je objaviti kao "beats Mem0". Ovo je tiši i ozbiljniji napad od prvog jer ga peer reviewer može ponoviti mesecima kasnije u akademskom papiru ili kontra-postu.

Treći, regulatorni auditor iz EU AI Act konteksta koji gleda naše compliance claim-ove. Launch copy će reći "EU AI Act audit triggers built-in, model-agnostic, sovereign deployment". Regulator će pitati "pokažite mi bench metodologiju za claim-ove koje pravite", posebno ako koristimo rezultate na SWE-ContextBench da tvrdimo da model "samostalno radi enterprise coding" u nekom KVARK pozicioniranju. Ovaj audit sloj je najređi napad ali najskuplji po exposure-u ako se desi.

Ova tri filtera su razlog zašto audit-readiness nije opciono i zašto mora da se reši pre nego što Track 2 pokrene.

---

## Sedam dimenzija audit-readiness-a

### 1. Reprodukabilnost na commit-nivou

Svaki benchmark run mora biti vezan za jedan konkretan commit u waggle-os repo-u (za H-43, H-44) i za jedan konkretan npm-published verziji hive-mind paketa (za H-42). Ne "main branch of date X" — konkretan commit SHA. Konkretna verzija @hive-mind/core, @hive-mind/wiki-compiler, @hive-mind/mcp-server, @hive-mind/cli.

Dodatno, za svaki run moraju biti fiksirani: (a) Node verzija (major.minor), (b) pnpm verzija, (c) SQLite verzija korišćena kroz better-sqlite3 binding, (d) sqlite-vec verzija, (e) RNG seed za bilo koji stohastički korak u cognify ili retrieval pipeline-u, (f) dataset snapshot hash (LoCoMo je versionisan; moramo zabeležiti tačan release tag koji koristimo), (g) prompt template hash za agent system prompt koji je bio aktivan tokom run-a.

Audit-readiness zahtev je jednostavan: ako neko danas uzme commit + config + dataset checksum, pokrene `pnpm run benchmark:<name>`, njegov rezultat mora biti unutar ±2% našeg u 95% slučajeva. Ovo je reproducibility band koji industrija prihvata — MLCommons koristi ±3%, mi ciljamo strožije.

Deliverable: `experiments/<bench>-<timestamp>/CONFIG.json` fajl koji sadrži sve nabrojano, plus `REPRO.md` sa tačnom komandnom putanjom koja reprodukuje. Bez ovog fajla, rezultat se ne objavljuje.

### 2. Chain of custody za broj

Chain of custody znači da postoji ljudski-čitljiv trag koji pokazuje ko je pokrenuo run, kada, sa kojim konfiguracijama, na kom hardveru, i ko je broj verifikovao pre nego što je objavljen. Ovo nije paranoia — ovo je standard za bilo koji rezultat koji kasnije ide u research paper ili u regulatornu dokumentaciju.

Konkretno: svaki run proizvodi `RUN_LOG.md` fajl sa timestamp-om starta, timestamp-om kraja, imenom operator-a (Claude Code session ID ili imenovano lice), machine fingerprint (hostname, OS, CPU model, RAM, da li je GPU aktivan), i final score sa break-down-om po kategorijama. Taj fajl se commit-uje zajedno sa `experiments/<bench>-<timestamp>/` folderom u istom PR-u.

Drugi zahtev: verifikacija nije ista osoba kao operator. Ako je Claude Code pokrenuo run, Marko ili PM layer čita raw izlaz i potpisuje "broj verifikovan" komentarom u PR-u. Ako je broj visoko kontroverzan (ispod Mem0 SOTA, preko 100% bilo čega, ili sa suspicious per-category distribucijom), dodaje se treća verifikacija nezavisnim rerun-om na drugom commitu istog dana.

Audit-readiness zahtev: ne objavljujemo broj koji je imao samo jedan par očiju.

### 3. Judge ensemble integritet

LOCKED three-track sequencing specificira judge ensemble od četiri modela bez Anthropic-a: gemini-3.1-pro-preview, gpt-5, grok-4.20, MiniMax-M2.7. Razlog za exclusion Anthropic-a je jasan — evaluacija našeg cognitive layer-a od strane modela istog provider-a koji smo koristili u v1 eksperimentu (gde je raw Opus 4.6 baseline merio protiv sebe-plus-memorija) otvara optužbu za circular evaluation.

Audit-readiness zahtev je trostruk. Prvo, svaki judge model mora biti pozvan nezavisno, bez cross-contamination-a. Nema jednog super-prompta koji dobija rezultate svih četiri pa se onda "consensus" izvodi post-hoc; svaki judge vidi identičan question + our-answer + reference-answer trio, produkuje score, i njegov raw output se arhivira. Agregacija u final score se radi deterministički, dokumentovanom formulom, u postprocessing skripti koja je takođe commit-ovana.

Drugo, svaki judge poziv mora biti logovan kompletno: tačan prompt (ne parafraza), tačan response, tokens in/out, latency, model version string iz API response metadata, timestamp. Ovo je ono što peer reviewer traži kada postavi pitanje "pokažite mi da nije bilo prompt drift-a između judge-eva".

Treće, judge models moraju biti verifikovani kao dostupni u stabilnoj verziji pre nego što Track 2 pokrene. MiniMax-M2.7 je najnoviji u grupi i nosi najviše verzijskog rizika; ako njegov API vraća različiti ponašanje između run-a A i run-a B (recimo tri nedelje kasnije kada pokušamo da reprodukujemo), naš reproducibility band puca. Rešenje: arhiviramo response string za svaki judge poziv, i u REPRO.md dokumentujemo da tačna reprodukabilnost zavisi od stabilnosti API verzije, sa fallback-om na lokalno arhivirane response-e.

### 4. Dataset integritet i split policy

Benchmark-ovi koje targetiramo imaju public dataset-e, ali "public" ne znači "nepromenljiv". LoCoMo je versionisan — moramo zabeležiti commit hash HuggingFace datasets repo-a iz kog smo fetchovali dataset, i checksum raw file-a. LongMemEval isto. SWE-ContextBench, ako koristimo SWE-bench Verified kao baseline, ima trenutnu skorovnu ploču koja se referira na specifičan subset; taj subset mora biti eksplicitno imenovan.

Split policy: koristimo standardan public split osim ako nije public (tj. test set koji je javan je uvek naš eval set; tren/dev split-ove ne koristimo za tuning jer ne radimo tuning modela, mi testiramo memorijski sloj). Nema "custom split" opcije. Ako pokušamo sa custom split-om iz bilo kog razloga, broj nije uporediv sa SOTA literature-om i ne može nositi launch narrative.

Audit-readiness zahtev: dataset metadata u CONFIG.json uključuje dataset version, hash, split ime, broj example-ova, i eksplicitnu izjavu "ovo je standardan public test split". Ako nešto od toga nije tačno, jasno imenovati odstupanje.

### 5. Metric definicije i sigurnosne margine

Svaka od tri benchmark-a koristi specifične metrike. LoCoMo skor uz 91.6% Mem0 SOTA koristi specifikovan exact-match + judged-correct composite metrik; mi moramo koristiti identičnu formulu, ne našu varijantu. LongMemEval ima sličan protokol. SWE-ContextBench (ako koristimo SWE-bench Verified kao referencu) ima pass@1 metriku sa unit-test gating-om.

Audit-readiness zahtev: Evaluator kod mora biti ili (a) direktni port upstream evaluator-a sa citat link-om, ili (b) naša implementacija koja je diff-ovana protiv upstream-a i diff dokumentovan sa razlogom. Nema "our interpretation of the metric" opcije.

Dodatno, izveštavamo confidence intervale ili bar standard error gde je to prirodno. Za 200-example LoCoMo dataset, 95% CI na 91.6% baseline je otprilike ±3-4 percentnih poena; naša brojka isto mora imati CI. Ako se naša 92.3% ± 3.1% preklapa sa 91.6% ± 3.8% Mem0 baseline-a, ne možemo tvrditi "beats Mem0" — možemo tvrditi "statistički paritet sa trend u favor". Ovakve formulacije moraju biti unapred ugrađene u launch copy ili će post-factum morati da se povuku.

Sigurnosna margina koju preporučujem za launch-worthy headline: +3 percentna poena iznad SOTA na LoCoMo (što znači 94.6%+ za headline "beats Mem0"), i +5 percentnih poena za "leads". Ispod toga, tvrdnja se oslabljuje ili pomera na meta-narativ (trade-off analiza, ne raw skor).

### 6. Methodological transparency i limitations section

Svaki benchmark report (H-42, H-43, H-44 pojedinačno i benchmark-proof research doc kao agregat) mora imati eksplicitnu "Limitations" sekciju koja eksplicitno odgovara na sledeća pitanja:

Šta ovaj benchmark **ne** dokazuje? (LoCoMo je conversational long-term memory; ne dokazuje zero-shot reasoning, ne dokazuje code generation, ne dokazuje multi-agent coordination — iako mi možda imamo claim-ove u tim oblastima koji su ortogonalni.)

Koje su granice dataset-a koje bi mogle favorizovati naš pristup? (Ako LoCoMo primarno testira temporal reasoning preko conversational history-a, a naš cognitive layer je bitemporal KG sa explicit temporal modeling, bench je delimično u našu korist by design. Ovo ne znači da ga ne smemo objaviti — znači da moramo to priznati.)

Koji threat model bench ne pokriva? (Adversarial memory injection, prompt injection preko saved memorija, rate-limit saturation u produkcijskom workload-u, degradacija pod multi-workspace contention-om — ništa od ovoga LoCoMo ne testira.)

Kako naš judge ensemble uticaj na ishod meri-zapažen pre svakog run-a? (Moramo biti u stanju da kažemo "judge ensemble varijansa je X percentnih poena" kao posebna sensitivity analiza.)

Ovaj deo nije za skeptike — ovaj deo je za nas same, da ne gradimo launch narrativ na nepriznatim pretpostavkama koje će neko izvući post-launch i iskoristiti kao gotcha.

### 7. Release gate — ko sme da pusti broj napolje

Finalni filter je upravljački, ne tehnički. Broj sme da napusti perimeter PM-Waggle-OS repo-a samo kroz jedan od tri kanala: (a) benchmark-proof research doc u docs/research/, (b) launch copy artifacts u apps/www, (c) announcement thread/paper/post.

Svaki od ta tri kanala mora povući broj iz jednog kanonskog source-a, ne iz direktnog e-mail-a ili Slack poruke. Kanonski source je `experiments/<bench>-<timestamp>/FINAL_SCORE.json` fajl koji je generisan na kraju run-a, commit-ovan u PR, i potpisan od strane dva para očiju.

Ako neko predloži da broj krene napolje pre nego što je gore-nabrojan chain of custody završen — bez obzira na launch timing pritisak — odgovor je "ne, idemo u rekalibraciju timeline-a, ne u kompromis na broj". Ovo je direktna posledica LOCKED SOTA-gated odluke iz 2026-04-18. Rekalibracija launch timeline-a je reverzibilna; objavljen kompromitovan broj nije.

---

## Pre-flight checklist za svaki Track 2 run

Sledeći checklist mora biti završen **pre** nego što run counter krene. Operator (Claude Code session ili imenovano lice) ne sme da startuje harness dok svih 14 stavki nije potvrđeno:

**Commit-level state:**
1. Target commit SHA zamrznut i deklarisan u PR opisu
2. hive-mind npm verzije (za H-42) zamrznute i deklarisane
3. `pnpm install --frozen-lockfile` izvršen bez warning-a
4. Full test suite prošao na target commit-u (5,553/5,554 waggle-os ili najbliži; 282/282 hive-mind)

**Audit prerequisites (iz engineering audit brief-a):**
5. H-AUDIT-1 trace IDs landed — turnId UUID thread aktivan u hot path logger pozivima
6. H-AUDIT-2 bench-spec odluka dokumentovana u `experiments/<bench>-<timestamp>/BENCH_SPEC.md`

**Environment i repro:**
7. Node, pnpm, SQLite, sqlite-vec verzije zabeležene u CONFIG.json
8. RNG seed fiksiran i u CONFIG.json
9. Dataset verzija + checksum u CONFIG.json
10. Prompt template hash u CONFIG.json

**Judge ensemble:**
11. Sva četiri judge modela odgovaraju sa očekivanom verzijom iz API response metadata (smoke test od 3 poziva po modelu)
12. Judge aggregation formula u `evaluators/judge-aggregation.ts` nema neodobrene izmene od prethodnog run-a

**Operator discipline:**
13. Machine fingerprint zabeležen
14. Drugi par očiju (Marko ili drugi PM) spreman za verifikaciju broja pre merge-a

Ako bilo koja od 14 stavki nije potvrđena, harness se ne pokreće. Ne zato što je svaka stavka pojedinačno kritična, već zato što kompozicija njih 14 je ono što razlikuje audit-defensible broj od "broj koji smo videli jednom i ne možemo ponoviti".

---

## Reporting artefakti — šta mora da se proizvede

Svaki Track 2 bench produkuje sledeće artefakte. Bez njih run se ne smatra završenim:

`experiments/<bench>-<timestamp>/CONFIG.json` — pun snapshot konfiguracije (tačke 7-10 iz checklist-a plus judge ensemble verzije)

`experiments/<bench>-<timestamp>/REPRO.md` — čovek-čitljiva komandna putanja koja reprodukuje run, sa očekivanim ±2% band-om

`experiments/<bench>-<timestamp>/RUN_LOG.md` — timestamp-ovi, operator, machine fingerprint, raw progress log

`experiments/<bench>-<timestamp>/FINAL_SCORE.json` — headline broj + per-category breakdown + CI ili standard error + judge ensemble variance

`experiments/<bench>-<timestamp>/raw-judge-responses/` — folder sa jednim fajlom po judge-example kombinaciji; svaki sadrži prompt, response, tokens, latency, model version string

`experiments/<bench>-<timestamp>/BENCH_SPEC.md` — shortcut odluka iz H-AUDIT-2: šta merimo (wall-clock vs recall-only), koji upstream evaluator koristimo, koji diff (ako postoji) smo uneli

Agregatni artefakt posle završena sva tri benchmark-a: `docs/research/benchmark-proof-<date>.md` — launch-ready prose dokument sa integrisanim skorovima, metodologijom, limitations sekcijom, i eksplicitnom izjavom o SOTA poređenju. Ovaj dokument je kanonski source za launch copy i announcement.

---

## Interakcija sa engineering audit findings

Ovaj brief se naslanja na `2026-04-19-engineering-audit-pre-benchmark.md`. Ključne tačke preklapanja:

H-AUDIT-1 (trace IDs) je **preduslov** za audit-readiness dimenziju 2 (chain of custody). Bez trace ID-ova kroz hot path, ne možemo retroaktivno da rekonstruišemo šta se dešavalo unutar sistema tokom benchmark run-a kada neki example promaši. To znači da "verified manually after the fact" nije moguće; ostaje nam samo "re-run and hope". H-AUDIT-1 se mora landovati u Track 1 pre Track 2.

H-AUDIT-2 (bench-spec odluka) direktno utiče na metric definiciju u audit-readiness dimenziji 5. Ako merimo wall-clock, Cognify O(E²) problem može iskriviti broj; ako merimo samo recall-correctness, problem je Track 3 briga. Ova odluka mora biti doneta **pre** CONFIG.json finalizacije za H-42.

T3-AUDIT-1 (compliance test suite) nije blokada za Track 2 numeričkog rezultata, ali je blokada za bilo koji launch copy koji tvrdi "EU AI Act audit-ready" kao part of compliance positioning. Ako taj copy ulazi u launch announcement, T3-AUDIT-1 mora biti landovan pre launch-a — ne pre benchmark-a.

---

## Sto se dešava ako broj ne pogodi target

Dva realna scenarija. Prvi, broj je ispod SOTA-a (LoCoMo < 91.6%, LongMemEval < 83%, SWE-ContextBench ispod top-5 quartila). Po LOCKED SOTA-gated decision-u 2026-04-18, launch ne ide. Opcije su: (a) PA tuning iteracija, koja znači v3 GEPA run sa revidiranim hiperparametrima i ponovni bench — 1-2 nedelje iteracije; (b) rekalibracija launch headline-a od "beats SOTA" ka "parity with SOTA at lower cost", što zahteva novi messaging pass i re-review pozicioniranja; (c) odložen launch do sledeće major model release-e i ponovna procena. Nijedna od tri nije skok u provaliju — sve tri su explicit paths.

Drugi, broj je značajno iznad SOTA-a (preko 95% na LoCoMo). Instinkt je slaviti; audit-readiness disciplina je prvo verifikovati. Broj iznad SOTA za 3+ poena na prvom run-u je statistički sumnjiv. Protokol: automatski rerun na drugom commitu istog dana sa svežim RNG seed-om; ako drugi rerun takođe pokaže +3 ili više, triangulacija je zadovoljena i broj je validan. Ako drugi rerun padne nazad u SOTA-paritet ili ispod, prvi run je imao artefakt (lucky seed, sampling bias, judge variance) i ne ide u launch.

Izuzetak od oba scenarija: nikad ne "fixing" broja kroz judge ensemble izmenu ili dataset filter post-hoc. To je naučna greška koja se kasnije pokazuje jer peer reviewer ponavlja sa standardnim ensemble-om i ne dobija isti rezultat. Jedino legitimno post-hoc podešavanje je correction of objectively broken setup (judge model je bio deprecated mid-run, API greška u 30% poziva, itd.) — i tada se cela stvar rerun-uje, ne selektivno krpi.

---

## Bottom line

Ne objavljujemo broj koji ne možemo da reprodukujemo za mesec dana. Ne objavljujemo broj koji nema dva para očiju na verifikaciji. Ne objavljujemo broj čiji judge ensemble ne možemo da pokažemo u log-u. Ne objavljujemo broj bez limitations sekcije. Ne objavljujemo broj koji je unutar noise-a od SOTA baseline-a sa formulacijom koja to ignoriše.

Ako svih sedam dimenzija padne na zeleno, launch ide kao što je LOCKED 2026-04-18 predvideo. Ako bilo koja dimenzija ne padne na zeleno, rekalibracija. Timeline je reverzibilan; reputacija brojki nije.

---

## Appendix: Decision references

- **LOCKED 2026-04-18** `decisions/2026-04-18-launch-timing.md` — Launch je SOTA-gated, nema benchmark proof nema objave
- **LOCKED 2026-04-19** `decisions/2026-04-19-target-model-qwen35b-locked.md` — Qwen/Qwen3.6-35B-A3B kanonski engine za ceo stack
- **LOCKED 2026-04-19** `decisions/2026-04-19-tracks-sequencing-locked.md` — Three-track sequencing, Track 2 gate
- **LOCKED 2026-04-19** `decisions/2026-04-19-audit-findings-track1-backlog.md` — H-AUDIT-1 i H-AUDIT-2 preduslovi za Track 2

## Appendix: Dokumenti na koje se ovaj brief oslanja

- `briefs/2026-04-19-engineering-audit-pre-benchmark.md` — full engineering audit koji čisti hot path
- `briefs/track-b-benchmarks-brief-2026-04-19.md` — Claude Code operativni brief za Track 2 workflow
- `briefs/2026-04-19-sota-benchmark-pre-mortem.md` — komplementarni risk register (isti datum)

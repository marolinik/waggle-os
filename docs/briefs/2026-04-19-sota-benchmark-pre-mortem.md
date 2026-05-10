# SOTA Benchmark Pre-Mortem

**Datum:** 2026-04-19
**Autor:** PM layer (Cowork session)
**Metoda:** Tigers / Paper Tigers / Elephants klasifikacija (pm-execution:pre-mortem framework), prilagođena Track 2 benchmark kontekstu.
**Premisa:** Zamisli da je tri meseca od danas, Waggle launch je prošao, i gledamo retrospektivno zašto je SOTA narativ popustio. Šta je palo? Ovaj dokument imenuje verovatne uzroke pada pre nego što se dese, rangira ih po uticaju i verovatnoći, i specificira mitigacije za svaki.
**Komplementarni dokument:** `2026-04-19-sota-benchmark-audit-readiness.md` — isti datum. Audit-readiness brief definiše gate policy; ovaj brief identifikuje što može probiti gate ili oslabiti broj koji prođe gate.

---

## Premisa retrospekcije

Zamisli sledeće tri verzije budućnosti od 2026-07-19, tri meseca od danas.

**Verzija A — Launch je uspeo čisto.** Waggle je shipped, 3B LoCoMo prikazuje 94.5% ± 2.8% (Mem0 91.6% ± 3.8%), benchmark-proof research doc je peer-reviewed bez gotcha-a, KVARK pipeline se puni kroz demand-generation kanal. Narrativ "Waggle radi na Qwen3.6-35B-A3B sa audit-triggered memory layerom, leads Mem0 SOTA" drži. Ovo je ishod koji ciljamo.

**Verzija B — Launch je prošao ali narativ curi.** Broj je objavljen, ali peer reviewer je u roku od tri nedelje napisao kontra-post koji tvrdi da naš judge ensemble pravi +2-3 poena bias u našu korist; replikacija spoljnog tima daje 92.1% umesto 94.5%; naša limitations sekcija nije priznala da LoCoMo dataset favorizuje bitemporal KG by design. Launch se nije povukao, ali KVARK sales team mora da odgovara na pitanja "kakav je vaš pravi skor" svakom prospektu. Ovo je ishod koji moramo aktivno izbegavati.

**Verzija C — Launch je odložen.** Track 2 je lanuo blizu SOTA-a ali ne iznad, odluka 2026-04-18 SOTA-gated nas je sprečila da iziđemo, ušli smo u v3 GEPA iteraciju koja je trajala šest nedelja umesto predviđenih dve, konkurencija je u međuvremenu shipovala nešto što je pomerilo attention window. Ovo je ishod koji želimo da izbegnemo **ali nije katastrofa** — LOCKED SOTA-gate je dizajniran upravo za ovo.

Pre-mortem vežba je: šta nas vodi u B ili u predug C? Imenuj pojedinačne failure mode-ove, rangiraj ih, i za svaki imaj odgovor pre nego što se desi.

---

## Tigers — realni problemi, visok uticaj, verovatnoća srednja do visoka

### T-01. Judge ensemble variance veća od naše headline margine

**Verovatnoća:** srednja-visoka (40-55%). Četiri judge modela (gemini-3.1-pro-preview, gpt-5, grok-4.20, MiniMax-M2.7) nisu kalibrisani za zajedničku evaluaciju; svaki ima sopstveni hardness bias. Empirijska disagreement u LLM-judge setup-ima tipično iznosi 3-8 percentnih poena na domain-specific evaluaciji. Ako naša headline margina preko Mem0 SOTA bude 2-3 poena, varijansa judge-a može celu priču destabilizovati.

**Kako se manifestuje u ishodu B:** Peer reviewer pokreće evaluaciju sa drugim ensemble-om (recimo doda Claude kog smo mi isključili, ili izbaci MiniMax koji je najmanje kalibrisan), dobija 91.8% umesto naših 94.5%, objavljuje kao "cannot reproduce beats-SOTA claim with neutral judge". Mi tehnički nismo pogrešili ali percepcija puca.

**Mitigacija pre run-a:** Judge variance sensitivity analiza je obavezna pre final score-a. Pokrenuti LoCoMo na podskupu od 30 primera sa svim 4-izborom kombinacija od 4 judge-a (15 podskupova); izmeriti koliko rezultat varira u funkciji izbora podskupa. Ako standard error preko podskupova prelazi 2 percentna poena, headline-a nema — ni beats-SOTA, ni parity, tek "kompetitivan skor u SOTA opsegu". Ova sensitivity analiza ulazi u FINAL_SCORE.json.

**Mitigacija u messagingu:** Ako varijansa prelazi margin safety, launch copy se pomera od "beats Mem0" ka "matches Mem0 on state-of-the-art" + trade-off narrativ (nismo dodali parametara, nismo povećali kontekst, nismo platili compute; radimo paritet na manjem stack-u sa dodatnom continuity capability).

### T-02. LoCoMo skor ulazi u noise band oko Mem0 91.6%

**Verovatnoća:** visoka (55-65%). Naš v1 eksperiment (108.8% raw Opus 4.6 na 10 coder pitanja) nije direktan prediktor LoCoMo performansi. LoCoMo je long-term conversational memory sa temporal reasoning, multi-hop, i open-domain pitanjima — različit failure surface od coder eval-a. Realistično očekivanje: landujemo negde u opsegu 88-94%, sa medijanom oko 91%. To je paritet sa Mem0, ne čist win.

**Kako se manifestuje u ishodu B:** Tehnički imamo broj koji je u granici noise-a oko SOTA-a. Headline "beats Mem0" ne prolazi statistički test. Headline "matches Mem0" zvuči defensivno. Mi objavimo oprezniji headline, ali announcement momentum pucne.

**Mitigacija pre run-a:** Očekivati paritet kao default scenario, ne surprise. Launch copy varijante A/B/C već spremne pre nego što broj padne — A za beats, B za matches + trade-off narrativ, C za below + "we focus on production-ready sovereign capability, not leaderboard chase" (ovaj treći je weak ali spasava launch timing u najgorem čitljivom ishodu).

**Mitigacija u broju:** Pre final run-a, unutrašnja dry-run na 20 LoCoMo primera sa preliminarnim v2 GEPA config-om daje ranu signal. Ako dry-run pokaže <90%, gledamo da li v3 GEPA iteracija ima smisla pre full run-a (skuplji pristup ali izbegava nagli "ispod SOTA" udar pri final run-u). Ovo je direktan input u [M]-02 judge-config decision.

### T-03. Qwen3.6-35B-A3B API nestabilnost mid-run

**Verovatnoća:** srednja (30-40%). Model je puštan pre oko 4-5 nedelja, API (DASHSCOPE) je još novijeg vintage. 200-example benchmark run pravi hiljade API poziva ako računamo agent iteracije + judge pozive. Rate limiting, version drift, ili tihi regression u API response-u su realne pretpostavke.

**Kako se manifestuje u ishodu B ili C:** Run prekida na pola, rerun daje različiti broj (10-30 min razlika u timestamp-u se pretvara u statistički značajnu razliku), chain of custody mora da rekonstruiše koji response-i su valjani. Debug cycle gubi 2-3 dana.

**Mitigacija pre run-a:** Smoke test od 3 poziva na svakom modelu (Qwen engine + 4 judge-a) 2h pre full run-a, sa provrerom response metadata version string-a. Svaki model mora odgovoriti sa istom verzijom koju smo arhivirali u CONFIG.json.

**Mitigacija tokom run-a:** Idempotent resume logic u harness-u. Svaki example, kad završi, piše `<bench>-<timestamp>/progress/<example_id>.json` sa punim input-output tragom. Ako run crash-uje na example 134/200, resume skipuje 0-133 i nastavlja. Bez ovoga, failure u 90% run-a znači full restart. Ovaj fajl već živi u Track B brief — proveriti da je Claude Code implementirao.

**Mitigacija za reprodukabilnost:** Raw judge response-i arhivirani lokalno. Ako za tri meseca neko pokuša da reprodukuje i API vrati različit response, imamo originalne arhivirane response-e i možemo pokazati da je to API drift, ne naš bug.

### T-04. Cognify O(E²) wall-clock time skews benchmark

**Verovatnoća:** visoka ako H-AUDIT-2 odluči da merimo wall-clock; niska ako merimo samo recall-correctness. Ovo je direktan input iz engineering audit brief-a. Cognify `createCoOccurrenceRelations` ima O(E²) DB queries na relation-strani koje SQLite u-procesu može absorbovati, ali skaliraju loše sa dužinom razgovora. LoCoMo ide do 200+ turn-ova po dijalogu, što daje 2000²+ per-pair query pozive na cognify cycle.

**Kako se manifestuje:** Naš per-turn latency izgleda 5x lošiji od baseline-a čisto zbog ove petlje, benchmark protocol koji uključuje wall-clock skor nas kažnjava, brojka koju objavljujemo reflektuje bug u cognify-u a ne fundamentalni memory layer capability.

**Mitigacija:** H-AUDIT-2 odluka **pre** Track 2 starta. Dve opcije: (a) odluka da merimo recall-correctness only, O(E²) ide u T3-AUDIT-3, brojka je čista, limitations sekcija spominje ovaj design choice; (b) odluka da merimo wall-clock, Cognify Major #2 se fix-uje u Track 1 pre Track 2 starta (batched `WHERE source_id IN (...)` query), 1 engineering dan. Treća opcija — ignorisati pitanje dok ne padne broj — je put u ishod B.

### T-05. H-AUDIT-1 trace IDs nisu landed na vreme

**Verovatnoća:** niska-srednja (20-30%), zavisi od Claude Code Track 1 brzine. Ako Polish A+B zauzme više vremena od predviđenih 6-8h i H-AUDIT-1 ne stigne u istu seriju commit-ova, Track 2 startuje bez trace ID infrastrukture.

**Kako se manifestuje:** Prvi put kad LoCoMo example promaši na non-obvious način, debug gubi 1-2 engineer-dana zbog grep-ovanja kroz neannotiranu stdout logu. Ako promaše 3-5 example-a na sličan način, to je cela nedelja izgubljena.

**Mitigacija pre run-a:** Track 2 ne startuje dok H-AUDIT-1 commit nije landed i verified. Claude Code handoff fajl treba eksplicitno da sadrži "H-AUDIT-1 done" checkpoint pre prelaska u Track 2 phase.

**Mitigacija ako se desi uprkos tome:** Minimum viable fallback — dodaj `console.log(JSON.stringify({turnId, ...}))` ručno u 4-5 ključnih tačaka orchestrator-a kao ad-hoc trace, bez propisne implementacije. Ne idealno ali bolje od alternative.

### T-06. Jedan od tri benchmark-a ispada značajno drugačije od ostala dva

**Verovatnoća:** srednja (35-45%). LoCoMo, LongMemEval i SWE-ContextBench testiraju različite dimenzije sistema. Memory recall + temporal reasoning (LoCoMo) može lepo padati, ali SWE-ContextBench (code generation + retrieval) testira druge capability koje nisu naša primarna snaga.

**Kako se manifestuje:** H-42 lando 94%, H-43 lando 87%, H-44 lando 55% (ispod Qwen standalone 73.4% SWE-bench Verified). Mi imamo mixed-signal story: "beats one SOTA, matches another, underperforms on third". Announcement postaje defensivan pre nego što izađe iz gate-a.

**Mitigacija pre run-a:** Realistični threshold za svaki benchmark definisan unapred (u launch copy varijanti spremnog pre run-a, ne post-hoc). LoCoMo target 91.6%+ (beats), LongMemEval target 83%+ (beats), SWE-ContextBench realistic target **78%+** (značajan lift preko Qwen standalone 73.4%, što je defensive pozicija; 80%+ za strong headline). Ako SWE-ContextBench padne ispod 75%, taj benchmark ne ulazi u headline — ostaje u benchmark-proof research doc kao "SOTA-kompetitivan na SWE, leads on long-term memory tasks (LoCoMo, LongMemEval)". Ovo je rano odluka, ne reaction.

**Mitigacija za narrative:** SWE-ContextBench je ionako stretch goal u trotraku (60-70% top-3 verovatnoća po LOCKED sequencing-u). Launch copy ne mora da se oslanja na sva tri benchmark-a; LoCoMo + LongMemEval je dovoljan dokaz za long-term memory claim. SWE-ContextBench je dodatna municija za KVARK enterprise positioning, ne deo Waggle consumer narrative-a.

### T-07. Reprodukabilnost puca na external rerun-u

**Verovatnoća:** srednja (25-35%) bez discipline, niska (10%) sa punom audit-readiness checklistom primenom. Najčešći uzroci u literaturi: non-deterministic seed-ovi u retrieval-u, judge model version drift (isti "gpt-5" u maju vs julu vraća različite response-e), dataset verzijska drift (LoCoMo dataset HuggingFace repo dobije update), lockfile divergence.

**Kako se manifestuje u ishodu B:** Neko spolja, za mesec dana, pokrene naš `pnpm run benchmark:locomo`, dobija 89.2% umesto našeg 94.5%, tweet-uje "Waggle's SOTA claim doesn't reproduce". Mi moramo da izdamo tehnički post-mortem u roku od nekoliko dana koji objašnjava razloge (model version drift ili slično), što je uvek manje ubedljivo nego originalni announcement.

**Mitigacija:** Sva 14 stavki iz audit-readiness pre-flight checkliste, bez kompromisa. Plus: arhivirani raw judge response-i za offline replay mode. Ako neko ne može da reprodukuje online (jer su API verzije evoluirale), damo im offline mode koji koristi naše arhivirane response-e. Ovo je "honest reproducibility" — priznajemo da online API drift postoji, pa nudimo offline fixed-point za rigoroznu validaciju.

### T-08. Peer reviewer otkrije metodološki diff naspram SOTA baseline-a

**Verovatnoća:** visoka (50-60%) ako ne odradimo detaljnu ex-ante proveru. Mem0 91.6% LoCoMo baseline koristi specifičan evaluator, specifičan judge protokol, specifičan način agregacije po kategorijama. Ako mi koristimo slično-ali-ne-identično, recenzent to vidi.

**Kako se manifestuje:** "Authors claim beats Mem0, but Mem0 paper uses exact-match + LLM-judge hybrid at threshold 0.8; authors use exact-match + LLM-judge at threshold 0.7. Apples to oranges." Ovo je tiši i dugotrajniji udar jer ostaje u literaturi.

**Mitigacija pre run-a:** Direktan port evaluator-a iz Mem0 repo-a ili Mem0 paper appendiksa, sa commit link-om u CONFIG.json. Nema "our interpretation" opcije. Ako Mem0 evaluator nije javno dostupan u reproducibilnom obliku, pišemo mail autorima i tražimo evaluator kod; ako ne odgovore, eksplicitno u limitations sekciji napišemo "our evaluator reimplements Mem0 protocol from paper description; minor numerical differences possible".

**Mitigacija u messagingu:** Ako ex-ante provera pokaže metodološki diff koji ne možemo zatvoriti, naš rezultat se pozicionira kao "Waggle cognitive layer score on LoCoMo (Mem0-protocol-adjacent methodology)" — ne kao "beats Mem0 SOTA". Razlika je manja u numeraciji ali ogromna u defensibility-u.

### T-09. Track 1 slipping pushes Track 2 beyond launch window

**Verovatnoća:** srednja (30%). Polish A+B je procenjen na 6-8h ali istorijski svi engineering estimat-i slip-uju 1.5-2x. Ako Track 1 zauzme 14-16h umesto 6-8h, Track 2 startuje krajem sledeće nedelje, benchmark-proof doc gotov 3-4 dana kasnije, launch window pomera 1-2 nedelje.

**Kako se manifestuje u ishodu C:** Nismo u launch prozoru koji smo interno ciljali, konkurencija pomera attention, momentum je manji. Nije katastrofa ali jeste degradacija.

**Mitigacija:** Track 1 ima strict scope freeze. Ako scope creep pokuša da uđe tokom Polish-a, odbija se sa "to ide u standing pool Track 3". Claude Code brief eksplicitno lista H-01..H-06 i standing pool kao bounded; nema diskreciono dodavanja.

**Mitigacija za timing:** Track 3 (UI/UX polish + e2e persona testing) ide paralelno sa Track 2, tako da čak i ako Track 2 kasni nedelju dana, Track 3 je iskoristio to vreme produktivno. Waggle launch nije striktno vezan za fiksni datum u kalendaru — vezan je za SOTA proof + UX polish konvergenciju. Ta konvergencija može pomeriti nedelju bez strateškog troška.

---

## Paper Tigers — glasni napadi koji nisu realno blokirajući

### PT-01. "Isključili ste Anthropic modele iz judge ensemble-a, to je konflikt interesa"

Suprotno. Uključivanje Anthropic modela bilo bi konflikt — v1 je koristio raw Opus 4.6 kao baseline, merenje protiv njega samog-plus-memorija je cirkularno. Isključivanje Anthropic-a iz judge ensemble-a je metodološki ispravno. Ovo je lako obraniti u jednom paragrafu u benchmark-proof doc-u.

**Šta radimo:** Eksplicitna "Judge ensemble rationale" sekcija u methodology delu, 2-3 paragrafa, koja imenuje Anthropic exclusion i objašnjava zašto.

### PT-02. "vLLM self-hosting nije ready, vaš claim 'sovereign' je neispravan"

Waggle consumer narrative ne zavisi od vLLM self-hosting-a. Waggle ships sa Qwen preko API-ja ili kroz buffer. KVARK enterprise narrative jeste vLLM-dependent, ali to je zaseban workstream koji ide posle Waggle launch-a (Waggle→KVARK demand generation sequencing, LOCKED). Ne moramo da odbranimo vLLM self-hosting u Waggle launch oknu.

**Šta radimo:** Launch copy za Waggle ne koristi "sovereign deployment" kao primarni claim; taj claim se čuva za KVARK fazu. Waggle copy govori o "your AI, your data, your machine" na desktop app level-u, što je tačno bez self-hosted vLLM-a.

### PT-03. "Compliance test suite ne postoji, EU AI Act claim je prazan"

Compliance code **postoji i radi** — schema trigger-i su tehnički ispravni, append-only enforcement je na DDL nivou, Art. 19 retention logic je ispravljen. Test suite gap je dokumentovan u engineering audit brief-u (T3-AUDIT-1, half day rada). Nije blokada za benchmark broj niti za consumer launch — jeste blokada za specific compliance claim u launch copy.

**Šta radimo:** T3-AUDIT-1 se lenduje tokom Track 3 UI/UX prozora, pre launch-a. Launch copy koji tvrdi "EU AI Act audit-triggered" može biti izdat tek posle T3-AUDIT-1 merge-a. Sekvencijalno, ne simultano.

### PT-04. "Benchmarkujete protiv godinu dana starog Mem0 baseline-a"

Mem0 91.6% na LoCoMo je **tekući** SOTA. Nije zastareo baseline. Ako se u međuvremenu pojavi novi rad koji pomera SOTA pre našeg launch-a (mogućnost ali ne verovatno za narednih 4-6 nedelja), mi ćemo imati 72-96h da re-benchmark-ujemo protiv novog baseline-a i re-framujemo narrative.

**Šta radimo:** Monitoring LoCoMo leaderboard-a nedeljno tokom Track 2 prozora. Ako novi SOTA padne, aktivira se contingency plan (re-bench u 3 dana; re-frame ili odloženi launch po procena-i).

### PT-05. "Samo 200 LoCoMo primera, statistički ne-značajno"

200 primera je standard LoCoMo test split. Svi benchmarci ga koriste. Ako je to problem za statističku značajnost, problem je za celu SOTA literaturu, ne samo za nas. Naš CI ±3-4 poena se odnosi na sve rezultate u polju, ne samo na naš.

**Šta radimo:** Eksplicitna prezentacija CI/standard error u svim rezultatima. Ako se naš CI preklapa sa Mem0 CI, to priznajemo u messagingu ("within statistical proximity of SOTA" vs "beats SOTA"). Transparentnost je sama po sebi odgovor na ovaj napad.

---

## Elephants — neizgovoreni problemi koji se moraju adresirati

### E-01. LoCoMo dataset možda favorizuje naš bitemporal KG by design

Ovo je najveći elephant. LoCoMo primarno testira temporal reasoning preko conversational history-a — memory recall s vremenskim kontekstom, multi-hop sa datumskim rezonovanjem, itd. Naš cognitive layer je bitemporal KG sa **eksplicitnim temporal modeling-om** kao strukturnom odlukom. Postoji nenula šansa da benchmark meri ono što smo izgradili da bismo radili dobro, pa fiksni rezultat ne implicira univerzalno superiorniji memory layer.

**Zašto je ovo elephant:** Niko od nas ga neće rado izgovoriti u kontekstu gde pokušavamo da ubedimo tržište da je naš pristup bolji. Ali peer reviewer će ga izgovoriti. Tiži nije bolji od glasniji-iz-naših-usta.

**Šta radimo:** Limitations sekcija benchmark-proof doc-a **eksplicitno** priznaje: "LoCoMo specifically probes long-term conversational recall with temporal reasoning, a capability surface where our bitemporal KG approach has structural alignment. Results should not be interpreted as universal memory-layer superiority; they are strong evidence for the specific long-term conversational memory use case." Ovaj paragraf ulazi u research doc pre launch-a, ne posle kritike.

**Dodatno:** Ako LongMemEval i SWE-ContextBench daju slične rezultate (beats ili matches SOTA), to je jači signal da naš layer radi dobro preko više dimenzija. Ako samo LoCoMo padne jako a ostala dva budu razblaženi, ovo se pretvara iz elephant-a u Tiger-a.

### E-02. Qwen3.6-35B-A3B može biti superseded pre ili ubrzo posle launch-a

Model release tempo je ubrzan. Qwen3.7, Qwen4, ili kompetitivni open-source model (DeepSeek, Mistral, Meta Llama) može izaći u okviru 4-8 nedelja. Naš launch copy "leads on Qwen3.6-35B-A3B" može zastareti brzo.

**Zašto je ovo elephant:** Mi investiramo u narrative koji je model-specific. To je priznanje da je naš layer model-agnostic (što je tačno) ali trenutni benchmark snapshot jeste vezan za konkretan model.

**Šta radimo:** Dva paralelna narrative track-a. Primarni ("Waggle radi na Qwen3.6-35B-A3B sa leading long-term memory") koristi se za launch prvih 4-6 nedelja. Sekundarni ("Waggle model-agnostic cognitive layer works with any open-source LLM") priprema se sad kao backup koji se aktivira čim novi model izađe. Kad novi model izađe, re-bench za 2-3 dana na novom modelu, re-publish sa novim brojem, održavamo lead.

**Strukturna defanziva:** LOCKED decision iz 2026-04-19 kaže da je Qwen3.6-35B-A3B kanonski engine za ceo stack. Ako model-swap je potreban u Q3 ili Q4, to je sama po sebi LOCKED odluka koja prolazi propisan decision process — ne ad-hoc reaction.

### E-03. Legal exposure oko dataset licenci i judge API terms

Koristimo LoCoMo (treba proveriti license), LongMemEval (ista priča), eventualno SWE-bench derivatives. Plus, koristimo komercijalne API-je (OpenAI GPT-5, Google Gemini 3.1, xAI Grok 4.20, MiniMax M2.7) za judge poziva; njihovi ToS mogu ograničavati "competitive evaluation" ili "benchmarking" use case.

**Zašto je ovo elephant:** Legal issues se ne otkrivaju u tehničkim pre-mortem diskusijama, već tek kad advokat iznese pitanje. Ali ako propustimo ovo, broj koji objavljujemo može postati sporan ex-post zbog dataset license violation ili API ToS violation.

**Šta radimo:** Kratka pre-run legal provera. (a) LoCoMo, LongMemEval, SWE-bench license-i — provera da li su academic-only ili commercial-permissive; ako samo academic, naš commercial launch ne sme tvrditi benchmark broj kao deo komercijalnog pozicioniranja bez potpisa od strane autora. (b) Judge API ToS — provera da li OpenAI, Google, xAI, MiniMax dozvoljavaju benchmarking use. (c) Dokumentovanje u CONFIG.json koje license-e smo ispoštovali.

Ovo je 2-3h rada, ne 2-3 dana, ali mora biti odrađeno pre Track 2 starta. Predlog: Marko ili spoljni pravnik pre-run.

### E-04. Inter-team quality bar mismatch

Marko, PM layer (ja), Claude Code, i bilo ko drugi ko bude deo Track 2 evaluacije mogu imati različite interne barove za "audit-ready". Marko ima CEO instinkt za "ovo je tačno i defensible"; PM layer ima metodološki bar; Claude Code ima tehnički bar (testovi prolaze, commit čist); a spoljni peer reviewer ima svoj.

**Zašto je ovo elephant:** Niko od nas to ne izgovara jer pretpostavljamo da smo svi usklađeni. Ali ako ja kažem "broj je audit-ready" a Marko proceni da nije launch-defensible, ili obratno, launch-ready odluka kasni ili se donese bez konsenzusa.

**Šta radimo:** Ovaj brief plus audit-readiness brief formalizuju jedinstveni bar. Specificirano: 7 dimenzija audit-readiness, 14-stavka pre-flight checklist, launch-blocking vs fast-follow vs track rules (dole). Ako to nije dovoljno za konsenzus, session posvećen alignment-u sa Markom pre Track 2 starta — 45 min. Cilj: svi koji imaju pravo veta na broj imaju ista pravila igre.

---

## Klasifikacija po launch-blocker statusu

### Launch-blocking (bez rešenja, launch ne ide)

- **T-02 + mitigation:** Ako LoCoMo padne značajno ispod noise-a oko SOTA-a (< 88%), launch se ne pokreće bez rekalibracije narrative-a.
- **T-07 + mitigation:** Ako reprodukabilnost ne može biti demonstrirana pre launch-a (neko iz tima čuvajući distance od run-a pokrene `pnpm run benchmark:locomo` sa CONFIG.json i dobije broj van ±2%), launch se zaustavlja dok se uzrok ne izoluje.
- **T-05:** H-AUDIT-1 trace IDs MORAJU biti landed pre Track 2 starta. Ako nisu, Track 2 ne startuje.
- **E-03:** Legal provera license-a i ToS MORA biti završena pre Track 2 starta. Ako postoji license violation risk, run se odgađa dok se ne reši.

### Fast-follow (launch ide ali fix u prvih 2 nedelje posle)

- **T-01 variance monitoring:** Sensitivity analiza u FINAL_SCORE.json, ako varijansa prelazi safety margin, messaging se pomera od "beats" ka "matches" ali launch ide.
- **T-04 ako H-AUDIT-2 je odlučio wall-clock:** Cognify O(E²) batch fix u T+1 nedelja.
- **T-06 cross-bench variance:** Ako SWE-ContextBench ispadne iz headline-a, H-42 + H-43 nose narrative, H-44 se prebacuje u research doc bez headline status-a.

### Track (observe, ne aktivno lečimo)

- **E-01 LoCoMo structural bias:** Priznat u limitations sekciji, dalje se prati kroz LongMemEval i SWE-ContextBench cross-check. Ako ne postane Tiger, ostaje observation.
- **E-02 model obsolescence:** Monitoring tempo release-a, backup narrative spremen, strukturno nije launch-blocker ako se desi u prvih 4 nedelja.
- **PT-01 do PT-05:** Svi paper tigers — pripremamo response, ne menjamo plan.

---

## Decision rules summary

**Pre Track 2 starta:**
1. Sva 14 stavki audit-readiness pre-flight checkliste potvrđeno.
2. H-AUDIT-1 (trace IDs) landed. H-AUDIT-2 (bench-spec) odlučeno i dokumentovano.
3. Legal provera završena.
4. Judge ensemble smoke test prošao.
5. Launch copy varijante A (beats), B (matches + trade-off), C (below + positioning) unapred draftovane.

**Tokom Track 2:**
1. Idempotent resume logic aktivan.
2. Raw judge response-i arhivirani lokalno.
3. Per-turn trace ID-ovi u log-u.
4. Ako bilo koji API vraća version string različit od arhiviranog u CONFIG.json, run se abortuje i restartuje.

**Posle Track 2:**
1. Judge variance sensitivity analiza pre FINAL_SCORE.json.
2. Broj verifikovan od strane dva para očiju.
3. Limitations sekcija napisana **pre** nego što broj ide u launch copy.
4. External reproducibility test (neko ko nije pokrenuo run pokreće ga iz CONFIG.json, verifikuje ±2%).
5. Tek tada broj ide u benchmark-proof doc, odatle u launch copy, odatle u announcement.

---

## Bottom line

Ishod A (clean beats) nije garantovan i nije ni očekivan default. Realistična distribucija verovatnoća: 25% A, 45% B varijacija (matches + trade-off, solid launch ali ne spectacular), 20% C (below SOTA + rekalibracija). Preostalih 10% je tail scenarios (neki od T-01..T-09 eskaliranih, ili neočekivane stvari).

Pre-mortem disciplina ne menja fundamentalnu distribuciju — menja preparedness unutar svake grane. Ako ishod padne u B, imamo gotove copy varijante, limitations sekciju, i response na paper tigers, pa launch ide bez momentum loss-a. Ako padne u C, znamo da je rekalibracija trajala nedelju-dve umesto tromesečnog pad-a u chaos.

Sve nabrojane mitigacije su cilj za zajednički rad između Claude Code sesija (tehnički deo) i PM layer-a (narrative i gate discipline). Marko ima final-call na (a) H-AUDIT-2 bench-spec odluci i (b) go/no-go posle broja.

---

## Appendix: Decision references

- **LOCKED 2026-04-18** `decisions/2026-04-18-launch-timing.md` — SOTA-gated launch
- **LOCKED 2026-04-19** `decisions/2026-04-19-target-model-qwen35b-locked.md` — Qwen/Qwen3.6-35B-A3B kanonski
- **LOCKED 2026-04-19** `decisions/2026-04-19-tracks-sequencing-locked.md` — Three-track sequencing
- **LOCKED 2026-04-19** `decisions/2026-04-19-audit-findings-track1-backlog.md` — Audit gate

## Appendix: Komplementarni dokumenti

- `briefs/2026-04-19-sota-benchmark-audit-readiness.md` — gate policy (isti datum)
- `briefs/2026-04-19-engineering-audit-pre-benchmark.md` — codebase audit nalazi
- `briefs/track-b-benchmarks-brief-2026-04-19.md` — Claude Code operativni brief

# WAGGLE
## Usmerenje za replaniranje i razrešenje PRD/FRD v1.1

**Dokument za planera · revizija dokumenta 1.0 · 27. septembar 2026.**

**Svrha:** pretvoriti dogovoreni proizvod, detaljan audit i naknadni pregled u jedan dosledan, proverljiv plan. Ovo nije novi proizvodni koncept, odobrenje za implementaciju niti potvrda da su nalazi reprodukovani na aktuelnom kodu.

**Izlaz sledećeg planerskog prolaza:** PRD i FRD v1.2 u nacrtu, jedinstven delivery plan, evidencija razrešenja nalaza, migracije, testovi, Build-vs-Borrow odluke i obnovljena procena. Verzija specifikacije nije broj verzije aplikacije.

> **Smanjujemo širinu, ali ne izbacujemo centralnu vrednost: lokalni knowledge-work harness koji koristi memoriju, pouzdano završava posao, ima funkcionalno učenje i daje merljiv dokaz kvaliteta.**

## Sadržaj

1. Zadatak za planera i granice ovlašćenja
2. Izvori, autoritet i status tvrdnji
3. Zaključene odluke proizvoda
4. Referentni mentalni model i najmanja potpuna vertikala
5. Isporuke i obim: pouzdana osnova, benchmark jezgro, javni proizvod
6. Izvršavanje, trajno stanje i bezbedan nastavak
7. Verifikacija, dokaz završetka i istiniti tragovi
8. Hive Mind, RAWDETAIL i eksterni izvršioci
9. Skills, konektori, MCP i zajedničke UI/agent akcije
10. Učenje, ograničena evolucija i promocija
11. UX, onboarding, modeli, rutine, kanali i mobile
12. KVARK, licence, poslovna i podatkovna migracija
13. Benchmark i pravo na marketinšku tvrdnju
14. OSS-first: Build-vs-Borrow proces
15. Talasi, zavisnosti i način procene
16. Obavezni acceptance testovi
17. Matrica razrešenja C1–C22
18. Matrica razrešenja A1–A29
19. Matrica svih predloženih rezova iz audita
20. Šta planer isporučuje i šta ostaje otvoreno
21. Završna kontrolna lista
22. Registar izvora

## 1. Zadatak za planera i granice ovlašćenja

**DIR-01 — Planiranje pre implementacije.** Pročitaj ovaj dokument i njegove izvore, proveri relevantne tvrdnje na tačno imenovanoj reviziji `marolinik/waggle-os` i vrati korigovane specifikacije i plan. Sada ne menjaj runtime, ne objavljuj release, ne menjaš licencu, ne pokrećeš naplatu/refund, ne menjaš javnost repoa i ne pokrećeš plaćene benchmark studije bez zasebnog odobrenja. Pisanje planskih artefakata je zadatak; izvršenje plana je naredni korak.

Prvi cilj nije da se napravi što veći backlog. Prvi cilj je da se razlikuju: ono što već radi, ono što postoji ali nije povezano, stvarna greška, predlog proširenja i stara odluka koju je korisnik zamenio novom. Ne zaključuj da funkcija radi iz imena fajla; ne zaključuj da ne postoji zato što nema baš naziv iz FRD-a.

Za važan nalaz zabeleži: pregledani commit, putanju/simbol, ulaz, trenutni izlaz, reprodukcioni test ili ograničenje provere, očekivano ponašanje i najmanju potrebnu promenu. Ako je nalaz iz ranijeg audita već popravljen, označi ga kao zatvoren dokazom, ne kao novi posao.

Predlozi iz ovog dokumenta koji nisu direktne odluke korisnika označeni su kao **planerski smer** ili **predlog ugovora**. Razradi ih u nacrtu; ne predstavljaj ih kao već implementirane funkcije ili dodatna korisnikova odobrenja. Odstupanje je dozvoljeno uz jasan razlog, alternativu i uticaj na proizvod, testove i rok. Prećutno izbacivanje diferencijacije nije dozvoljeno.

## 2. Izvori, autoritet i status tvrdnji

### 2.1. Red prvenstva

| Oznaka | Izvor i uloga | Pravilo korišćenja |
|---|---|---|
| D | Eksplicitne odluke korisnika u razgovoru 27.09.2026. | Autoritet za proizvodni smer. Ne otvarati ponovo već zaključeno. |
| S1 | Detaljan audit `…agent-ac748482c5af17ddf.md` | Glavni tehnički input. Njegovi nalazi su tvrdnje audita vezane za pregledanu reviziju; revalidirati pre izmene koda. |
| S2 | `cryptic-mixing-prism.md`, 04.09.2026. | Istorijski plan za Waggle Teams i reuse inventar. Stari pricing, Teams/cloud default i „LOCKED” odluke ne nadjačavaju noviji dogovor. |
| S3 | `…rustling-milner.md` | Sažetak S1, ne nezavisna druga potvrda. Koristiti radi preglednosti, ne duplirati dokaze. |
| S4 / S5 | Waggle PRD/FRD v1.1 od 27.09.2026. | Postojeći specifikacioni nacrti koje treba precizirati. Ne prepisivati im sadržaj audita bez razrešenja. |
| P | Naknadni pregled i ovaj dokument | Analiza, korekcije i predloženi implementacioni ugovori. Nisu novi rezultati izvršenih testova. |

S1 u uvodu navodi read-only pregled, a u §1–§7 meša potvrđene spot-check nalaze, procene i predloge. S3 izričito navodi da je sažetak istog rada. S2 predlaže Waggle Teams, naplatu po sedištu i cloud-model default; taj proizvodni pravac je prevaziđen novijim odlukama. [S1: uvod, §1–§7; S2: §4; S3: „How the review was done”]

### 2.2. Obavezne oznake u revidiranim dokumentima

Koristi statuse **ODLUKA**, **POTVRĐENO NA REVIZIJI**, **NALAZ AUDITA — ZA PROVERU**, **DELIMIČNO/NEPOVEZANO**, **PREDLOG**, **ODLOŽENO** i **NEPOZNATO**. „Postoji”, „spremno” i „radi end-to-end” nisu sinonimi.

Primer: nula pojavljivanja `ContextPackage` ne znači da nema retrieval-a. S1 W2 eksplicitno traži očuvanje postojećeg `recallMemory` engine-a i njegovih sedam putanja. Novi predmet rada je ugovor, budžet, provenance, trajna referenca i povezivanje izvršilaca. [S1: C8, A26, W2]

Primer: Stripe proizvodi, pricing stranica ili tier grane ne dokazuju da postoje aktivni pretplatnici. Pre bilo kakve migracije novca ili naloga mora postojati inventar stvarnog stanja, uz ovlašćen pristup. [S1: C2, A2, WB; P: razrešenje]

### 2.3. Ograničenja ovog dokumenta

Ovaj dokument je sastavljen iz tri kompletno priložena planska dokumenta, ranijih specifikacija i odluka u razgovoru. Nije novi izvršni audit repoa. Brojevi testova, commit razmaci, model specifikacije, provider cene, status licenci, API uslovi i javni benchmark rezultati ne postaju potvrđene aktuelne činjenice njihovim ponavljanjem ovde. Planer ih proverava samo tamo gde utiču na odluku.

Detaljan audit u tabeli §3 ima **24 reda predloga za rez/odlaganje**, iako sažetak opisuje „25 cuts”. U §19 ovog dokumenta obrađen je svaki postojeći red; ne izmišljati dodatni rez radi slaganja sa naslovnim brojem. [S1: §3; S3: L13]

## 3. Zaključene odluke proizvoda

Sledeće odluke potiču iz korisnikovog eksplicitnog dogovora; nisu predlozi autora starog Teams plana.

| ID | Odluka | Posledica za plan |
|---|---|---|
| D-01 | **Waggle je free/open-source za pojedinca.** | Ne vraćati paywall za lokalnu memoriju, harness, skills, osnovni evolution, approvals ili rutine. Tačna licencna realizacija zahteva pregled. |
| D-02 | **Waggle = me; KVARK = us.** | Nema zasebnog Waggle Team/Enterprise proizvoda. Timske i enterprise sposobnosti dolaze povezivanjem na KVARK. |
| D-03 | **KVARK ostaje isključivo on-prem.** | Model pozivi, evaluacija i organizacioni kontekst ne smeju neprimetno završiti kod cloud model provajdera. Bez cloud fallback-a u KVARK režimu. |
| D-04 | **Waggle je desktop-first/local-first.** | Windows/Tauri je primaran. CLI i web/self-host su podržani odvojeni instalacioni putevi. Cloud convenience je kasnija faza. |
| D-05 | **BYOK ostaje u individualnom Waggle-u.** | Local-first nije zabrana dobrovoljno izabranog spoljnog modela niti svih online konektora. Prikazati gde podaci odlaze. |
| D-06 | **Knowledge work je primarni posao.** | Research, analiza i poslovni artefakti nose prvi dokaz vrednosti. Coding je podržana vrsta rada, ne identitet proizvoda. |
| D-07 | **Home se čuva, ne projektuje ponovo od nule.** | What Needs Me / My Work / Routines / Ask Waggle. Postojeće delove proveriti i dopuniti. |
| D-08 | **Workspace je centralni objekat.** | Chat je unutar Workspace-a, sa postojećim sesijama i tabovima. Ne praviti novu paralelnu ontologiju razgovora. |
| D-09 | **Tehnički agenti ostaju ispod površine.** | Spawn, Waggle Dance, orchestration i MCP plumbing nisu obavezni koraci običnog korisnika. Napredni pristup ostaje. |
| D-10 | **Skills i konektori koriste se inline.** | Agent prepoznaje potrebnu sposobnost; korisnik može sam da je doda. „Inline” ne znači da se OAuth ili tajne obrađuju u LLM tekstu. |
| D-11 | **Eksterni izvršioci ostaju opciona sposobnost.** | Claude Code/Codex/Hermes se angažuju po potrebi; rezultat se vraća istom Workspace-u. Ne pretpostavljati da svaki task zavisi od njih. |
| D-12 | **Hive Mind ostaje memorijski temelj.** | Čuvati postojeći retrieval i izolaciju; zatvoriti centralni context/capture tok, bez ponovnog pisanja memorijskog engine-a. |
| D-13 | **Evolution je deo teze proizvoda.** | Ne svoditi ga na neaktivne module ili demo. Potrebni su stvarno izvršenje kandidata, evaluacija, aktivacija i povratak prethodne verzije. |
| D-14 | **Dug rad i rutine su deo proizvoda.** | Razlikovati trajni run, kognitivnu memoriju i raspored. Laptop koji je ugašen ne izvršava lokalni posao. |
| D-15 | **Referentni cilj je Qwen 3.8 27B-klasa.** | Tačan model ID, reviziju, quant i runtime proveriti. Stariji model je kontrolni baseline, ne tiha zamena cilja. |
| D-16 | **Fusion nije ovaj obim.** | Bez council/5-hats/agent-fusion programa. Očuvati postojeće korisne subagente, bez novog proizvoda oko njih. |
| D-17 | **BORROW → ADAPT → BUILD.** | Prvo postojeći Waggle, zatim odgovarajući OSS, pa novo kodiranje uz obrazloženje. Nema automatskog forka ili framework migracije. |
| D-18 | **Benchmark je ključan dokaz, ne dekoracija.** | Teza frontier-class je hipoteza dok rezultat to ne podrži. Ne projektovati test da Waggle mora da pobedi. |

Buduća naplata individualne convenience usluge, hostovanog compute-a ili ekosistema nije ukinuta, ali nije posao ovog release plana. Ona ne menja D-01 i ne pretvara KVARK u javni cloud inference proizvod.

## 4. Referentni mentalni model i najmanja potpuna vertikala

### 4.1. Arhitektonska mapa za planiranje

**Korisnički svet:** Home daje pažnju i nastavak rada; Workspace drži sesije, fajlove, kontekst, zadatke i rezultate; Routines pokreću odobrene ponovljive poslove; Settings/Advanced omogućavaju direktno upravljanje modelima i sposobnostima.

**Izvršni svet:** intent → task shape → izbor versionovanog postupka → context assembly → capability resolution → izvršavanje faza → evidence/proof → rezultat u Workspace-u. Native agent, subagenti i opcioni eksterni izvršioci su iza istog ugovora rada.

**Horizontalni slojevi:** durable runtime obuhvata ceo rad; Hive Mind daje i prima kognitivni kontekst; permissions/provenance važe za svaku akciju; observability prikuplja tragove; learning/evolution predlaže proverene izmene budućeg ponašanja.

**Granica:** KVARK povezuje organizacioni svet bez automatskog prelivanja lične memorije. Nije druga lokalna tier zastavica. OSS-first je engineering politika, ne instrukcija da runtime agent sam preuzima i gradi proizvoljan kod kad mu nešto nedostaje.

Poslednja slika je **target mental model**, ne dokaz implementacije. Strelice ne treba shvatiti kao jedan linearan pipeline: durable work nije faza posle konačnog odgovora, niti se memorija prvi put koristi tek na kraju. [D; S4/S5; P: razrešenje dijagrama]

### 4.2. Referentna knowledge-work vertikala

**DIR-02 — Jedan kompletan posao pre širenja.** Korisnik u postojećem Workspace-u zatraži research brief ili poslovni izveštaj na osnovu priloženih izvora i prethodnih odluka. Waggle izabere postojeću relevantnu veštinu, složi kontekst, izvrši posao sa lokalnim modelom, prikaže razumljiv napredak, sačuva checkpoint, preživi kontrolisan prekid, nastavi bez duplih spoljnih radnji, generiše artefakt, pokaže nivo stvarne provere i sačuva dozvoljene nalaze u pravom scope-u.

Drugi prolaz dobija novi izvor ili ispravku. Rezultat se ažurira uz tačno poreklo promena. Treći, izolovani evaluacioni prolaz poredi isti model bez pune Waggle putanje sa istim modelom u Waggle-u. Ovo nije samostalni javni benchmark, nego integracioni acceptance scenario.

Početni kompletan skup neka sadrži **dve recipe varijante za dve vrste isporuke: research brief i document production**, kako predlaže W3, umesto svih porodica odjednom. Izvediva analiza ulazi u njih; dokument ne mora imati zaseban potpuno nov „analysis engine”. [S1: W3; P: fokus]

## 5. Isporuke i obim

### 5.1. Tri obavezne kontrolne tačke

| Kontrolna tačka | Sadržaj | Šta nije dozvoljeno tvrditi |
|---|---|---|
| G1 — Pouzdani interni kandidat | Reprodukovani i otklonjeni kritični problemi, istiniti statusi/provere, individual approvals, scope testovi, stvarna aktivacija dozvoljenih override-a. | „Cela nova Waggle vizija je završena.” |
| G2 — Benchmark-ready knowledge-work jezgro | Production putanja, referentni lokalni model, postojeće skills, centralni kontekst, durable run, dve recipe putanje, dokaz završetka, osnovni progress i izvršen prvi kontrolisani A/B. | „Frontier-class” iz malog razvojnog uzorka ili samo zato što runner radi. |
| G3 — Javni proizvod | Podržani korisnički tokovi, onboarding, izabrani kanali, rutine, proverena ograničena learning/evolution putanja, granice KVARK-a, licence i kvalifikovan Windows kandidat; završena relevantna studija za performance-led poruku. | Marketing šireg obima, kanala, privatnosti ili kvaliteta nego što isporučeni paket i rezultati podržavaju. |

**Planerski smer:** postaviti G1 → G2 → G3 kao radnu osnovu. Opcija S1 „ship current main as Solo 1.0, pa PRD kao 2.0” nije ovim odobrena. Postojeći popravljeni build može biti kontrolisani preview sa jasnim ograničenjima. Broj javnog release-a i formalni GO ostaju zasebna odluka.

Nije uslov za G3 da lokalni model pobedi frontier. Uslov je da posao radi, da je studija izvedena po pravilima i da poruka odgovara rezultatu. Negativan rezultat nije razlog da se preskoči objavljivanje metodologije ili promeni test nakon gledanja finalnih odgovora.

### 5.2. Šta se sužava, a šta se ne briše

Za G2 ne tražiti novu mobilnu aplikaciju, sve mail/chat ekosisteme, proizvoljnu evoluciju grafova, pun coding takmičarski program ili potpuno preuređivanje Team servera. Ali G2 ne svoditi na demonstracioni chat bez stvarnog context/durable/proof toka.

Za G3 planirati najmanje jedan stvarno koristan mail/calendar scenario i osnovno upravljanje rutinama. Prvi izabrani ekosistem treba predložiti prema postojećim adapterima, dozvolama i izvodljivosti, ne automatski graditi Gmail i Outlook u punom paritetu. API-key konektor može dokazati mehanizam blocked/resume, ali nije dovoljan dokaz vrednosti Home mail/calendar proizvoda.

Široka recipe evolution ostaje kasnije. Ograničena evolucija odobrenih varijanti ne sme nestati bez eksplicitnog prikaza kompromisa. Native coding putanju čuvati ako postoji i radi; njen stvarni nivo proveriti. „Nema velikog coding programa” nije „Waggle ne može ništa bez cloud coding agenta”.

## 6. Izvršavanje, trajno stanje i bezbedan nastavak

**Izvor problema:** S1 C8, C12–C14 i A4–A11. Sledeći ugovori su predlog njihove konkretizacije; nazive prilagoditi postojećim tipovima uz eksplicitnu mapu kompatibilnosti.

### 6.1. Conversation nije isto što i work run

**DIR-03 — Režimi bez lažne provere.** Razdvojiti vrstu interakcije (`conversation` ili `work`) od režima izvršenja (`normal`, `strict`, `benchmark`). Ne terati pozdrav, kratko razjašnjenje ili mali odgovor kroz ceo višefazni research workflow. Detektovan posao dobija run i odgovarajući postupak. Pogrešna klasifikacija mora biti vidljiva i popravljiva, bez tihog pokretanja skupog dugog rada.

| Režim | Predlog ponašanja | Nepromenljiva pravila |
|---|---|---|
| Normal conversation | Postojeći lagani agent tok; po potrebi retrieval i dozvoljeni alati. | Ne izmišljati verifikaciju; važe scope, egress, odobrenja i stvarni budžet. |
| Normal work | Izabrani kraći ili duži recipe; samo opravdane faze. | Obavezni gates konkretnog zadatka nisu opciona dekoracija. Ne prikazivati neuspešan rad kao provereno završen. |
| Strict work | Sve obavezne provere; definisan evidence minimum; eksplicitno blokiranje/partial pri nedostatku dokaza ili budžeta. | Nema preskakanja verify, self-reported tool uspeha ili popuštanja bezbednosnih pravila nakon retry-ja. |
| Benchmark | Ista production semantika testirane konfiguracije, zaključan manifest, izabrani ablation profil i nezavisno ocenjivanje. | Ne otključava šire podatke/alate/odobrenja. Puna Waggle konfiguracija ne preskače obavezni verify. |

Nijedan režim ne daje veća ovlašćenja. Predložiti i izmeriti budžet latencije po task shape-u; ne preuzimati raniji opšti cilj od deset minuta kao dokaz da korisnički posao završava u tom roku.

### 6.2. Redosled nastanka run-a

**DIR-04 — Run postoji pre side effect-a, blokiranja i trajnog konteksta.** Predlog redosleda:

1. Razreši korisnika/Workspace i sačuvaj intent sa stabilnim request identitetom.
2. Klasifikuj posao i izaberi početni recipe/version. Za lagani chat ostaje session putanja.
3. Kreiraj `DurableRun` sa scope-om, režimom, budget limitima i inicijalnim permission envelope-om.
4. Sastavi i trajno poveži `ContextPackage` sa run-om; upiši reference i verzije izvora.
5. Razreši capabilities; ako nedostaju, run već može preći u trajni `BLOCKED_*` status.
6. Nakon odgovarajućeg grant-a ponovo proveri ovlašćenja i svežu dostupnost, pa nastavi isti run.
7. Izvrši fazu; gates čitaju server-observed dnevnik; checkpoint se upisuje na potvrđenoj granici.
8. Završetak proizvodi rezultat i verifikacioni zapis; memorijska konsolidacija sledi kao posebno evidentirana operacija.

ContextPackage može biti pripremljen u memoriji pre koraka 3, ali nijedna trajna referenca ili obaveza nastavka ne sme zavisiti od paketa koji nije povezan sa run-om. Nakon restart-a ne rekonstruisati neprimetno „isti” kontekst iz novih izvora.

### 6.3. Minimalni data ugovori

| Ugovor | Minimalna polja / odgovornosti |
|---|---|
| DurableRun | `runId`, `workspaceId`, `sessionId`, request fingerprint, status, interaction/mode, recipe/model/runtime verzije, budget limit/spent, context reference, cursor, timestamps, schemaVersion. |
| PhaseAttempt | Run/phase/attempt identitet, ulazne reference, početak/kraj, stvarni tool/evidence izlazi, gate rezultati, razlog prekida. |
| Checkpoint | Potvrđena granica faze, rezultat faze, artifact/evidence/context reference i hash, potrošeni budžet, sledeći korak, verzija šeme. |
| ToolAction / ToolAttempt | Stabilna nameravana radnja odvojena od pojedinačnog pokušaja; status, parametri/fingerprint, grant, provider token i receipt gde postoje. |
| RunEvent | `runId`, monotoni `seq`, phase/attempt, tip, user-facing label, status, reference dokaza i vreme. Bez tajni u payload-u. |
| ProofReceipt | Predmet i nivo provere, verzije proveravača, observed evidence, obavezni i opcioni gates, upozorenja, unresolved stavke. Nije opšti pečat istinitosti. |

SQLite `runs.db` je prirodan kandidat iz audita, ali konačan izbor prolazi §14. Ne dodavati novu bazu ako postojeći storage može isti ugovor dokazivo zadovoljiti; ne smeštati execution lease/lock state u semantičku memoriju.

Atomicity važi za potvrđenu tranzakciju u izabranom run store-u. Ne tvrditi da ista SQLite transakcija atomarno obuhvata spoljni mejl, filesystem artefakt i zasebni `.mind`. Za takve granice planirati idempotentno povezivanje, outbox/reconciliation ili drugo jasno opisano rešenje. Hash artefakta potvrđuje sadržaj, ne poslovnu tačnost.

### 6.4. Statusi i kontrola života procesa

Predlog minimalnih kanonskih stanja: `QUEUED`, `RUNNING`, `BLOCKED_CAPABILITY`, `BLOCKED_APPROVAL`, `FAILED_RETRYABLE`, `FAILED_FINAL`, `CANCELLED`, `COMPLETED`. Sačuvati postojeći API ugovor kroz mapu stanja; ne brisati `starting`, `waiting_for_approval`, `interrupted` ili `cancelling` bez pregleda pozivalaca.

`interrupted` iz stare verzije ne sme automatski postati ni `COMPLETED` ni bezuslovno ponovljen `RUNNING`. Pri migraciji sačuvati razlog prekida i proveriti mogućnost bezbednog nastavka. `PAUSED` odložiti dok ne postoji stvarna semantika: čekanje odobrenja nije isto što i korisnička pauza procesa.

**DIR-05 — Faza je početna jedinica oporavka.** Nedovršena faza ponovo kreće iz poslednjeg validnog checkpoint-a, koristeći već potvrđene izlaze. Već izvršene sporedne radnje se ne ponavljaju naslepo. Nema zahteva za nastavak između dve skrivene model misli ili proizvoljno usred agent loop-a.

Detach znači da se UI odvaja, a odobreni background posao nastavlja. Cancel znači zahtev da ne počinju nove radnje, kontrolisano zaustavljanje i terminalni zapis. Gubitak SSE veze sam po sebi nije korisnička odluka za cancel. Kada konkretna foreground putanja i dalje namerno prekida posao na zatvaranje veze, UX to mora jasno reći; durable putanja zahteva posebno ugovoren nastavak. [S1: A9, postojeće R3-008 ponašanje]

Za reconnect koristiti sekvencu događaja (`sinceSeq` ili kompatibilan ekvivalent). Replay i duplirani događaji ne smeju duplirati tekst, kartice ili sporedne radnje. Obezbediti run-scoped event bus; globalni `harnessId` nije dovoljan za dva istovremena Workspace-a.

### 6.5. Idempotency: važna korekcija A7

**DIR-06 — Stabilni identitet poslovne radnje.** Predlog audita `runId + phaseId + attempt + callIndex` identifikuje pokušaj, ali nije dovoljan ključ iste spoljne radnje pri retry-ju. Promena `attempt` daje novi ključ; ponovno generisanje plana može promeniti redosled poziva. Zato razdvojiti:

- `actionId`: server-persistiran identitet jedne nameravane/odobrene radnje, stabilan kroz retry.
- `attemptId`: identitet pokušaja da se ta radnja izvrši.
- `providerIdempotencyKey`: vezan za stabilnu radnju, ako ga servis za konkretnu operaciju podržava.

Isti argumenti nisu dovoljan razlog za deduplikaciju svih budućih radnji: dve odobrene dnevne rutine mogu legitimno poslati dva slična izveštaja. Svako odobreno pojavljivanje rutine ima svoj occurrence/action identitet. Novi `actionId` ne sme služiti kao prečica da model zaobiđe nerešeni prethodni pokušaj iste radnje.

Predlog statusa za akciju: `planned`, `approved`, `dispatching`, `succeeded`, `failed`, `unknown_outcome`. Ako proces padne posle provider uspeha a pre lokalnog potvrđivanja, status može biti nepoznat. Tada prvo proveri provider state/receipt ili traži korisničku proveru. Za ne-idempotentan servis bez mogućnosti reconciliation-a ne obećavati univerzalni exactly-once i ne vršiti blind retry.

Jedan run mora imati samo jednog ovlašćenog aktivnog izvršioca za istu fazu. Predložiti lease/fencing ili drugo rešenje za trku restart-a i starog procesa. U checkpoint-u sačuvati već potrošen budžet; restart ne resetuje potrošnju na nulu.

## 7. Verifikacija, dokaz završetka i istiniti tragovi

**Izvor:** S1 spot-checks, A4–A5, A17–A18; P: razlika tehničke i sadržinske potvrde.

### 7.1. Greške koje prvo zahtevaju reprodukcione testove

S1 prijavljuje: verify preskočen po defaultu i u catch-u; `VERDICT: FAIL` prolazi regex; bilo koji bash poziv prolazi kao test; `run_harness` računa se kao verification; budget stop isključuje proveru. Povezati svaki nalaz sa konkretnim red testom i zabeležiti da li još postoji na izabranoj reviziji. [S1: L5–L10]

Pored toga proveriti ceo `HarnessTraceBridge` tok: stvarni `ok`, duration, context i outcome ne smeju postati izmišljene konstante. U naknadnom pregledu razgovora primećeno je mapiranje završene faze na `verified` i tool zapisa na `ok:true`/`durationMs:0`; to je dodatni kandidat za proveru, ne novi dokaz izvršenog testa u ovom dokumentu.

**DIR-07 — Server je autoritet izvršnih dokaza.** Model može predložiti tvrdnju, plan ili fazni izlaz. Ne može sam proizvoditi autoritativan zapis da je alat pozvan, fajl nastao, test prošao ili dozvola dobijena. Gates čitaju stvarni executor/journal i potvrđene artefakte.

### 7.2. Tri nivoa umesto jednog „verified”

| Nivo | Primer validne potvrde | Šta time nije potvrđeno |
|---|---|---|
| Izvršno/strukturno | DOCX postoji i može da se parsira; potrebne sekcije postoje; tool se završio sa opaženim statusom. | Da su zaključci ispravni. |
| Provera definisanih elemenata | Iznosi, datumi, navedeni citati i reference poklapaju se sa označenim izvorima; formula ili rezultat testa provereni su odgovarajućim validatorom. | Sve moguće interpretacije izvora i sva poslovna preporuka. |
| Sadržinski pregled | Definisana rubrika za potpunost, vernost izvoru i zaključke pregledana; ostaju eksplicitne nesigurnosti. | Matematička garancija da nema greške ili regulatorno odobrenje dokumenta. |

`VERDICT: CONDITIONAL` ne tretirati ni kao bezuslovni uspeh ni automatski kao isti slučaj kao `FAIL`. Recipe mora definisati da li se traži dopuna, korisnički pregled ili dozvoljava rezultat sa jasno iskazanim ograničenjem. U strict modu obavezni gate koji nije prošao blokira `COMPLETED`. Delimičan artefakt ostaje dostupan bez oznake da je potpuno potvrđen.

Za knowledge work prve determinističke provere treba da ciljaju stvari koje zaista mogu proveriti: parsiranje fajla, prisustvo potrebnih sekcija, reference koje se razrešavaju, tačnost preuzetih brojeva/datuma, poklapanje citata, jedinice i eksplicitne kontradikcije. Source count sam po sebi nije kvalitet. Nije cilj proizvoljna kvota izvora na svakom zadatku.

**DIR-08 — Budget stop ne stvara uspeh.** Kada nema resursa za obaveznu proveru, sačuvati dokaz šta je završeno i zašto je posao nepotpun. Korisnik može odobriti dodatni budžet ili prihvatiti jasno označen nacrt; sistem ne sme retroaktivno izbrisati obavezni gate.

### 7.3. Higijena istorijskih tragova

Postojeće `verified` zapise bez dovoljnih dokaza označiti kao legacy/unqualified za evaluaciju. Ne brisati istoriju korisnikovog rada. Evidentirati poreklo statusa, verifier version i qualification state. Samo kvalifikovani tragovi mogu biti kandidat za određeni eval skup; ni tada se automatski ne proglašavaju zlatnim odgovorom.

Promena taxonomije zahteva migracionu mapu i test da dashboard više ne sabira `gate_passed` kao sadržinski potvrđene rezultate. Posebno razlikovati neuspeh modela, alata, infrastrukture, budžeta i evaluatora.

## 8. Hive Mind, RAWDETAIL i eksterni izvršioci

**Izvor:** S1 C10–C11, A26, W2; S2 §3.3. Naknadni plan ne treba da zameni postojeći retrieval novim engine-om.

### 8.1. Šta se čuva, šta se povezuje

**DIR-09 — Preserve retrieval first.** Početna obaveza je da se mapira postojeći `recallMemory`, prompt assembler, scope pravila, hookovi, Weaver, memorijski MCP i extraction putevi. Ako već postoji ekvivalent dela `ContextPackage` ponašanja, omotati ga tipizovanim ugovorom umesto dupliranja.

Predlog `ContextPackage`: identitet/verzija, run/workspace/session, query/task shape, izabrani source/frame ID-evi, revizije/hash-evi, scope/provenance, trust/taint oznake, token budget i prioritet, dozvoljeni payload za izvršioca i razlozi izostavljanja bitnih izvora. Reference su prvi izbor; privatni sadržaj kopirati samo kada je potrebno i dozvoljeno.

Kontekst je reproducibilan snapshot koliko dozvole i retention to dopuštaju. **Snapshot ne nadjačava brisanje ili opoziv pristupa.** Ako je izvor obrisan, revokovan ili mu je promenjen scope, nastavak ne sme koristiti staru kopiju samo zato što checkpoint na nju pokazuje. Označiti invalidaciju i tražiti novo razrešenje.

### 8.2. Tri skladišne odgovornosti

| Sloj | Dozvoljena uloga |
|---|---|
| Izvorni materijal / RAWDETAIL | Verbatim dokaz potreban za retrieval i tačno pozivanje, kada je zadržavanje dozvoljeno. Nije automatski „naučena činjenica”. |
| Izvedena memorija | Činjenice, odluke, preference, veze, sažeci, potvrđeni ishodi i naučene korekcije sa poreklom. |
| Execution state | Runovi, checkpoints, retries, grants, leases i budžeti. Nije semantički memory frame. |

Očuvati RAWDETAIL putanju koja je predmet postojećih memorijskih testova; ne uklanjati je zbog naše ranije preširoke rečenice „ne čuvati svaki token”. Privremeni hook sadržaj može imati operativnu svrhu, ali se ne promoviše automatski u dugotrajne činjenice. Definisati poseban kanal, TTL i retrieval exclusion gde je potrebno; ne izgubiti dokazive izvore. [S1: C11]

Sistem radi sa dostupnim korisničkim porukama, vidljivim izlazima, alatima i artefaktima; ne pretpostavlja pristup privatnom skrivenom reasoning-u eksternih modela. Memorijska konsolidacija mora biti idempotentna po run/output verziji, da restart ne proizvodi duple zaključke.

### 8.3. Scope i sprečavanje duple injekcije

Testirati personal i svaki workspace odvojeno. Posebno reprodukovati prijavljeno kopiranje workspace run sažetaka u personal mind. Izvedena činjenica nasleđuje ograničenja izvora; klasifikator ili evolution ne mogu je samostalno proglasiti javnom. [S1: A26]

Predloženi `WAGGLE_CONTEXT_INJECTED` marker služi koordinaciji, ne autorizaciji. Upariti ga sa run/context ID-em i očekivanim izvršnim putem. Hook ne sme prihvatiti nepoverljiv sadržaj koji tvrdi da je „već verifikovan kontekst” i zato preskočiti scope/taint proveru.

### 8.4. Eksterni izvršioci ostaju, bez nedokazanih obećanja

**DIR-10 — Isti Workspace, eksplicitan izvršilac.** Za Claude Code/Codex/Hermes proveriti: detekciju, autorizaciju, predaju konteksta, radni direktorijum, dozvole alata, timeout/cancel, povrat stvarnog rezultata i capture sa tačnim workspace/run identitetom. Sam launcher ili hook package ne dokazuje ovaj ceo tok.

Native agent ostaje glavna individualna izvršna putanja. Eksterni izvršilac je opcioni child posao koji vraća status, izlaz, artefakte i poznata ograničenja. Ne označavati njegove interne radnje kao server-proverene ako Waggle prima samo tekstualni rezime.

Ne zahtevati da svi spoljni harness-i automatski rade sa lokalnim Qwen endpoint-om: podršku konkretnog harnessa, protokola, autorizacije i runtime-a treba kvalifikovati. U KVARK režimu izvršilac koji zahteva neodobren cloud endpoint nije raspoloživ. Ime „external agent” nije dozvola da organizacioni kontekst napusti granicu.

## 9. Skills, konektori, MCP i zajedničke UI/agent akcije

**Izvor:** S1 C13–C16, A12–A15, W4; D-09/D-10/D-17.

### 9.1. Jedan resolver ugovor, ne obavezno jedan veliki rewrite

**DIR-11 — Zajednički capability model.** Inventory obuhvata native tools, aktivne i neaktivne skills, odobrene starter pakete, konektore, MCP i marketplace kandidate. Postojeće pretrage mogu ostati iza zajedničkog interfejsa dok se ne dokaže potreba za fizičkim spajanjem svih engine-a.

Najpre filtrirati kandidate prema dozvolama, egress-u, readonly pravilima, raspoloživosti i trust-u. Tek zatim rangirati task fit, pouzdanost, setup i runtime trošak. Red „native → skill → connector …” je predloženi tie-breaker/reuse preference među upotrebljivim kandidatima, ne pravilo da pogrešan native alat mora pobediti odgovarajući connector.

### 9.2. Permission envelope bez starih paywall-ova

Precedencu A12 iz audita ne prepisati slepo sa `tier` kao individualnom granicom. Predlog je **presek primenljivih ograničenja**: sistemski bezbednosni i egress limiti; KVARK policy/ACL kada je povezan; korisnički odobren scope; Workspace i rola/read-only ograničenja; sposobnosti konkretnog alata. Resolver nikada ne proširuje dozvole.

Ne graditi veliki Solo policy engine da bi ovo radilo. Iskoristiti postojeće grantove, allowlist/denylist i potvrde, uz eksplicitan ugovor. Minimalna kontrola korisnika nije „opciona user policy funkcija” koju možemo potpuno odložiti.

### 9.3. Inline setup je kontinuitet rada

Predlog definicije: kartica objašnjava šta nedostaje, zašto, potreban scope i posledicu. Tajna se unosi u zaštićeno polje ili OAuth u sistemskom browser-u. Run ostaje trajan. Posle validnog callback-a SetupCompleted događaj je vezan za pravi zahtev; model ne vidi token; isti posao se nastavlja samo uz važeći grant.

Trajni capability request sadrži run/request ID, predloženi alat, obim, stanje i rok. OAuth state/nonce, callback origin, PKCE gde je primenljivo i mapiranje na pravi run moraju biti provereni server-side. Zatvoren prozor, callback za drugi run ili istekla saglasnost ne postaju uspešna autorizacija.

Za MCP binarne i udaljene marketplace instalacije dozvoljeno je u prvom obimu prikazati predlog inline, a instalaciju završiti u Settings-u uz SecurityGate i korisnika. Povratak na posao ne sme izgubiti intent. Ne instalirati proizvoljan neproveren izvršni kod u pozadini samo da bi UX izgledao „magično”.

### 9.4. Shared actions i UI agent

**DIR-12 — Ista funkcionalnost kroz UI, agenta i rutinu.** Za Waggle-ove sopstvene akcije definisati/iskoristiti isti typed action/service ugovor: ulazna šema, scope, side-effect klasa, validacija, approval, rezultat, audit i idempotency. UI klik, agent i rutina ne smeju imati tri neusaglašene implementacije iste poslovne radnje.

To nije zahtev da agent klikće sopstveni DOM kad postoji pouzdan interni action API. UI/browser automatizacija spoljnih aplikacija ostaje odvojena sposobnost sa svojim dozvolama i testovima. Agent ne potvrđuje sopstveno odobrenje niti zaobilazi bezbednosni ekran.

BuilderIO/agent-native je imenovani kandidat za ove patterns; konkretan kod i tvrdnje o durable/replay funkcijama proveriti pre pozajmljivanja. Ovaj dokument ne potvrđuje da taj projekat ima gotov engine koji možemo samo priključiti.

### 9.5. Skills i učenje

Sačuvati postojeće skill create/distill/audit/hygiene/retire/recommend putanje kada su aktivne. Uvoz paketa nije isto što i uspešna upotreba na Qwen-u: proveriti dependencies, tool nazivlje, model-specifične instrukcije i artefakte. Učitavati relevantne delove, ne čitav katalog u svaki prompt.

Korisnik može direktno dodati skill/konektor u Advanced. Self-evolving skills imaju verzije i proveru; ne mogu promenom instrukcije dodati mrežni scope, novi izvršni binary ili zaobići approval. Razlikovati dozvolu za eksperimente nad instrukcijom od dozvole za instalaciju softvera.

## 10. Učenje, ograničena evolucija i promocija

**Izvor:** S1 C10, A16–A19, W3e; P: ograničen recipe obim umesto potpunog odlaganja.

### 10.1. Prvo potvrditi da postojeći learning ima efekat

**DIR-13 — Aktivno ponašanje, ne nazivi modula.** Za `AgentLearning`, `EvolveSchema`, GEPA i deployment override-a napraviti mapu: ko poziva, šta proizvodi, gde se čuva, kako se bira aktivna verzija i koji naredni run je koristi. Ako modul nema pozivaoce, to je funkcionalna rupa, ne gotov feature. Ako se zamenjuje drugim postojećim modulom, očuvati nameravano ponašanje i ukloniti lažne UX tvrdnje.

Poseban acceptance: evolucionisani persona/skill/spec override zaista ulazi u sledeći effective prompt; ugrađena persona ga ne zasenjuje. Rollback vraća prethodnu aktivnu verziju. Već pokrenuti run ostaje vezan za svoju verziju; nije predmet tihog hot-swap-a. [S1: L11, C10]

Za ComposeEvolution proveriti da pobednička schema nije samo vraćena kao polje rezultata, nego da se stvarno koristi u evaluaciji instrukcija i naknadnom izvršenju. Konačan score mora biti izveden uporedivo; ne oduzimati različite metrike ili uzorke pa ih nazvati „accuracy improvement”.

### 10.2. Minimalni zatvoreni eksperimentalni tok

Predlog obaveznog toka je: development primeri → baseline izvršen kroz target runtime → kandidati → stvarni target izlazi → determinističke provere i/ili grader → paired poređenje → validaciona/promotion kontrola → versionovani registry → eksplicitna aktivacija → naredni run → monitoring/rollback.

`makeRunningJudge` guard je koristan, ali njegovo prisustvo nije dovoljno bez testa da se candidate izvršava. Ne ocenjuje se sličnost candidate prompt teksta sa očekivanim odgovorom. Sačuvati output-e i model/runtime manifest tako da se to može proveriti. [S1: W0, W3e]

### 10.3. Ograničena recipe evolution za prvi ozbiljan obim

**DIR-14 — Evolucija u dozvoljenom prostoru.** Predlog je mali registry odobrenih varijanti za research/document posao, ne generator proizvoljnog grafa. Može se porediti osnovni postupak sa dodatnom proverom kontradikcija ili dozvoljenom retrieval/review varijantom. Kandidati mogu menjati instrukcije, raspored odobrenih opcionalnih faza i budžete unutar limita.

Nepromenljivi invariants: scope, zabrane egress-a, approvals, budget cap, obavezni gates, kontaminaciona granica i značenje uspeha. Recipe koji dobija bolji score preskakanjem bezbednosne provere nije kandidat za promociju.

Planer posebno procenjuje ovaj ograničeni obim. Nije već sadržan u S1 W3e, koji izričito isključuje recipe evolution. Ako se i ograničeni deo predloži za kasnije, prikazati koji korisnički ishod i javna tvrdnja time otpadaju; ne preimenovati prompt optimization u „evoluira ceo način rada”.

### 10.4. Evaluator, podaci i prava

Lokalni evaluator je default za lokalni profil. Jedan korisnički lokalni model može obavljati generator i rubric evaluator u odvojenim ulogama, uz eksplicitno označen rizik pristrasnosti. **Druga model familija je poželjna nezavisna kontrola, ne apsolutni preduslov da besplatan Waggle radi na jednoj mašini.** Za konačan dokaz kvalitet proveravati deterministički ili nezavisnim/ljudskim pregledom prema protokolu.

Waggle cloud/BYOK judge zahteva zasebno odobrenje za podatke koji se šalju, minimizaciju, redakciju i budžet. U KVARK režimu taj izlaz nije dozvoljen mimo on-prem granice. Nova evaluacija ne sme koristiti legacy Anthropic-key uslov kao skriveno obaveznu zavisnost. [S1: L13, A16]

Korisničke ispravke su signal, ne gotov gold answer. Potvrda korisnika je druga vrsta signala od tool success-a. Svaki eval primer ima poreklo, workspace/persona scope, pravo upotrebe i qualification. Lični rad ne preliva se u zajednički eval skup bez dozvole.

### 10.5. Promotion policy i skriveni test

**DIR-15 — Poređenje istog sa istim.** Baseline i kandidat moraju biti ponovo ocenjeni na istim primerima i budžetima. Definisati kvalitet, minimalnu praktičnu razliku, dozvoljenu regresiju po task shape-u, latenciju/compute i postupak za grader grešku. Greške na težim primerima ne smeju nestati iz imenitelja zato što scorer vrati `null`.

Razdvojiti development/training, validation/promotion i zapečaćeni finalni benchmark test. Ponavljano biranje pobednika prema istom holdout-u vremenom ga čini delom optimizacije; zato unapred ograničiti re-use i zabeležiti svaki pogled. Broj „najmanje 30” iz A17 nije univerzalni dokaz dovoljne statističke snage.

Prve promocije su eksplicitne i rollbackable. Kasnija automatska promocija može biti tema odvojene politike nakon dokaza. Kontinuirano poboljšanje ne znači dozvolu za nekontrolisano menjanje korisnikovog načina rada ili permisija.

## 11. UX, onboarding, modeli, rutine, kanali i mobile

### 11.1. UX: očuvati postojeće, sakriti unutrašnju složenost

**DIR-16 — Nema velikog UI rewrite-a kao podrazumevanog rešenja.** Proveriti postojeći HomeCockpit, Workspace routing, sessions/tabs, ChatWorkCanvas, MemoryCenter, Sidebar i command catalog. Ne praviti nove površine samo zato što je audit ili ranija skica koristila drugo ime. [S1: W5; S2: reuse inventar]

Glavni put korisnika ostaje Home → Workspace → posao/rezultat. Routines su vidljive iz Home-a i upravljive; Settings/Advanced omogućavaju kontrolu sposobnosti. Agents, Waggle Dance i spawn ne treba da budu obavezna navigacija. Role/mode mogu ostati opciono razumljiv izbor; korisnik ne mora birati između dvadesetak persona pre prvog zadatka.

Predlog „zero occurrences agent/MCP/harness/swarm” iz A23 primeniti na nepotrebnu tehničku instrukciju u svakodnevnom putu, ne kao zabranu istinitog imenovanja. Odobrenje mora jasno reći ako posao izvršava Claude Code ili konektor šalje podatke spolja. Ne skrivati bezbednosno relevantnu informaciju radi čistijeg copy-ja.

Work Progress prikazuje nameru faze, stvarni status, blokadu, trošak/budžet kada je relevantno, rezultat i View work reference. Ne izmišljati procenat završenosti ili preostalo vreme. Prikazati i failure/partial putanju. Ne prikazivati privatni reasoning; prikazati izvore, radnje, odluke za odobrenje i dokaze.

Nova površina mora imati test za tastaturu, fokus, čitljivost, screen-reader statuse i prekide stream-a. WCAG 2.2 AA je predloženi acceptance cilj iz A24, ne tvrdnja da je ceo trenutni proizvod usklađen. Engleski-only UI je predlog audita koji zahteva eksplicitnu odluku; centralizovanje novih stringova može se uraditi bez uvođenja punog i18n projekta.

### 11.2. Onboarding: preurediti dokaz vrednosti, ne ponovo napisati runtime

Očuvati postojeći resumable wizard i ModelGate gde su kvalitetni. Predlog toka: šta želiš da uradiš → kako pokrenuti model → prvi Workspace i odabrani izvori → opciona veza mail/calendar → prvi stvarni zadatak. Spajanje dva koraka je dozvoljeno ako smanjuje trenje. Ne pitati za persona/harness/MCP radi samog podešavanja.

Pre nego što postoji model, onboarding koristi determinističke ekrane; ne tvrdi da ga već vodi funkcionalan LLM. Prvi posao mora pokazati artefakt ili koristan rezultat, ne samo test „zdravo”. Međutim, instalacija višegigabajtnog modela na sporoj vezi nije kriterijum koji se može univerzalno svesti na deset minuta.

**DIR-17 — Readiness je live dokaz.** Provera izabranog modela treba da potvrdi stvaran odgovor; za work profile proveriti i relevantan tool/structured-output round-trip. Prisustvo ključa ili stavke u katalogu nije uspešna generacija. Cold start, timeout, nedostupan servis i nekompatibilan tool format imaju različite poruke; ne prikazivati format-only proveru kao „verified”. [S1: A20–A21]

### 11.3. Model, runtime i hardware ladder

Qwen 3.8 27B-klasa ostaje korisnikov referentni cilj. Planer potvrđuje tačan zvanični ID i reviziju, licencu, supported quant, format modela, tool calling i kompatibilnost sa pinned runtime-om. Audit navodi da je ranija evidencija na drugoj, MoE konfiguraciji; ne prenositi score ili hardversko ponašanje između njih. [S1: C19]

**Model koji staje na disk nije nužno model koji upotrebljivo radi.** Hardware ladder treba da navede disk za download/cache, RAM/VRAM ili unified memory, weight format/quant, context/KV-cache budžet, CPU offload, concurrency i izmerenu latenciju na representative work zadacima. Ne pretpostavljati univerzalni minimum „24 GB GPU” iz jedne okvirne procene.

Predlog instalacionih puteva: postojeći managed lokalni runtime na podržanom Windows profilu; opciono već instalirani Ollama; validiran OpenAI-compatible endpoint; BYOK. vLLM je kandidat za odgovarajući self-host/server put ili endpoint, ne neproverena obavezna one-click native Windows instalacija. Fajlski `path` i API `base_url` su različita polja i iskustva.

Resumable download, checksum, slobodan disk, prekinuta instalacija, rollback i stvarni health check pripadaju kvalitetu instalacije. Preuzimanje modela ima internet zavisnost; unapred pripremljen offline paket je zaseban supported profil. Slabiji lokalni model može biti fallback uz iskrena ograničenja, a ne prikrivena zamena referentnog benchmark modela.

### 11.4. Attention i kanali

**DIR-18 — Jedan WorkItem, jasni izvori.** Attention normalizuje Action, Commitment, Decision i Signal. To nisu automatski nalozi agentu. WorkItem ima status, provenance, vreme izvora, relevantan Workspace, confidence/razlog prioriteta i korisničku korekciju. Dupliranje se spaja samo uz dovoljno dokaza; pogrešno spajanje mora biti reverzibilno.

Prvi korak može iskoristiti postojeće Gmail/GCal/Outlook/Slack konektore, ali plan mora imenovati jedan početni scenario i stvarnu putanju autorizacije. Background incremental sync nije isto što i health probe ili ručni fetch. Potrebni su cursor/delta persistence, handling izgubljenog cursor-a, dedup, revoked credentials, retention i labeled eval primeri za precision/false positives. [S1: W7]

Za svaki kanal navesti profil: odobren live API, bot/forward, export/import, neposredni lokalni izvor ili roadmap. Tvrdnje audita o WhatsApp/Viber/Discord uslovima ostaju predmet zvanične provere za konkretan use-case. Ne ponavljati blanket „nema API” niti koristiti korisničke tokene/scraping kao neobjašnjen proizvodni default.

Prompt-injection scanner je defense-in-depth, ne dokaz da sadržaj nije maliciozan. Harvestovani mejl ostaje podatak sa taint/provenance oznakom. Tekst u njemu ne može promeniti policy, tražiti kopiranje vault-a ili dati odobrenje za slanje fajlova. Convert-to-work ne izvršava neodobren spoljašnji efekat.

### 11.5. Routines i stari TOOLLESS Loops

**DIR-19 — Trigger nije nova inteligencija.** Rutina je schedule/event trigger za dozvoljeni work recipe, sa own occurrence identitetom, budžetom, Workspace-om, policy-em i kanalom rezultata. Ne mora imati zasebnu „routine harness family”. Postojeći CronStore/LocalScheduler i management UI su prvi kandidati za reuse. [S1: C15, W5]

Stari TOOLLESS Loops L2 ostaje detekcija/predlog u svom ograničenju. Odobrena rutina može pokrenuti tool-using work run kroz isti permission/durable sloj. To zahteva eksplicitno razgraničenje ili superseding ADR, ne tiho širenje ovlašćenja stare petlje.

Definisati timezone i ponašanje pri propuštenom terminu, promeni letnjeg računanja vremena, restart-u i duplom događaju: skip, jedan catch-up ili drugo ograničeno pravilo. Odobrenje za svakodnevni nacrt nije automatski odobrenje za slanje. Korisnik vidi sledeći termin, poslednji rezultat, blokadu i pause/disable same rutine; to nije isto što i mid-phase pause izvršioca.

### 11.6. Mobile companion i local-first

Postojeći IM kanali su predloženi prvi remote-control obim: status, rezultat, prosleđivanje u WorkItem i approve/deny gde je bezbedno povezano. To nije gotov mobilni Workspace UI niti nova native aplikacija. Pregled stvarnog responsive web ponašanja ostaje potreban; postojanje icon rail-a nije dokaz upotrebljivosti telefona.

Pairing i allowlist moraju mapirati korisnika na odgovarajući scope. Odobrenje preko poruke vezuje se za run/action, payload fingerprint, expiry i jedinstven token; citiranje ili replay stare poruke ne sme potvrditi novu radnju. Provider nalog ili naziv pošiljaoca sam nije dovoljan dokaz.

Desktop koji je offline ne može izvršavati lokalne rutine ni odgovarati telefonu. Ne izlagati loopback sidecar javnom internetu zbog jedne mobile checkbox funkcije. LAN/VPN/relay/native/PWA varijante su eksplicitne alternative sa bezbednosnim i product obimom. Waggle-owned cloud relay je kasnija usluga, ne skrivena zavisnost lokalnog proizvoda.

## 12. KVARK, licence, poslovna i podatkovna migracija

### 12.1. KVARK veza je stvarna capability granica

**DIR-20 — Team kroz KVARK, bez tier glume.** Potreban je flow za validiranje konekcije i identiteta, dozvoljene organizational capabilities, token storage i opoziv. Ne dovoljno `ENTERPRISE=true` u lokalnom config-u. Proveriti S1 A27 o `createKvarkTools` pozivaocima i postojeći KvarkClient pre novih modula.

Lični i organizacioni posao imaju eksplicitnu granicu izvora, memorije i izvršavanja. „Connect to KVARK” ne kopira automatski personal mind, privatne mejlove ili lične runove u organizaciju. Disconnect/revocation ukida dalji pristup, uključujući cached organizational kontekst prema politici. Ne prelaziti automatski na personal BYOK model kad on-prem KVARK nije dostupan.

KVARK-native organizacione funkcije nisu predmet ponovnog pisanja u besplatnom Waggle-u. Planer navodi potrebne contract/interface promene, odgovornog vlasnika KVARK zavisnosti i unavailable UX. Ne obećavati timsku funkcionalnost samo zbog prikaza Team taba.

### 12.2. Tier, Stripe i stari team kod

Inventarisati TRIAL/FREE/TEAMS/ENTERPRISE grane, gateove, www copy, checkout/webhooks, licence, team-sync i sekundarni server/worker. Individualna zaštita, approvals i razumna kontrola rada ne smeju ostati iza TEAMS paywall-a.

Ne brisati ceo team backend da bi se promenio slogan. Planer za svaku komponentu predlaže: sačuvati kao KVARK adapter, izdvojiti, zadržati legacy compatibility ili ukloniti uz test. Multi-user BullMQ/Postgres/Clerk putanja ne postaje zaseban novi Waggle Team proizvod.

U ovom planu nema ovlašćenja za otkazivanje naplate ili refund. Prvo proveriti da li postoje stvarni kupci, aktivne pretplate i obaveze. Ako postoje, napraviti zasebno odobren migracioni komunikacioni/finansijski plan. Ako ne postoje, ne procenjivati fiktivan customer migration kao obavezni veliki radni tok.

### 12.3. Licenciranje i objavljivanje

D-01 određuje nameru free/OSS proizvoda, ali ne rešava automatski sva prava nad kodom i zavisnostima. Utvrditi ownership i odobrene licence, root/per-package NOTICE, stare proprietary oznake, imported code/skills, modele i native binarije. Ne menjati tuđu licencu niti držati ključni besplatni feature tajno zatvoren suprotno dogovoru.

Stanje repoa (private/public), attestation, signing i publication permissions proveriti na aktuelnoj konfiguraciji. S1 tvrdi određeno stanje na svom snapshot-u; ne prepisivati ga kao večnu činjenicu. SBOM/THIRD_PARTY_NOTICES i model/runtime provenance moraju odgovarati stvarno isporučenom paketu. [S1: C5, A28, OSS gate]

### 12.4. Minimalna migraciona mapa

| Predmet | Zahtev za plan |
|---|---|
| `agent-runs.json` → trajni store | Verzija šeme, dry-run, snapshot, mapiranje statusa; stari interrupted run ne ponavlja nepoznate sporedne radnje. |
| Cron leases / Loop state | Razdvojiti raspored od execution state-a; migracija occurrence identiteta i bez duplog catch-up-a. |
| Persona/spec/skill override | Efektivni active-version pointer, kompatibilnost, pinned verzija za započet run i rollback. |
| Legacy verified traces | Qualification/migration bez brisanja istorije; isključenje nepouzdanih redova iz gold/eval puta. |
| Kontekst i memory scope | Scope/provenance se čuvaju; revocation i erasure važe i za checkpoint/reference kopije. |
| WorkItems, journal i artefakti | Retention/GC, export/delete i referencijalni integritet; bez novih nedefinisanih trajnih kopija. |
| Tier/billing/team-sync | Stvarni inventar pre promene; read-compatible config migration; nema finansijskih side effect-a bez odobrenja. |

**DIR-21 — Rollback nije vraćanje obrisanih prava.** Rollback koda ne sme oživeti obrisane lične podatke, opozvanu saglasnost ili izbrisane credentials. Backup/downgrade plan mora navesti kako poštuje važeći erasure/revocation state. Poslati mejl se ne „rollback-uje” vraćanjem baze. Audit traži uključenje novih store-ova u postojeće erasure/export mehanizme; to je tehnički zahtev, ne tvrdnja da je pravna usklađenost time automatski dokazana. [S1: A2–A3]

## 13. Benchmark i pravo na marketinšku tvrdnju

**DIR-22 — Dokaz proizvoda kroz stvarni proizvod.** Testirani Waggle mora izvršavati zadatak kroz istu production sidecar/runtime putanju kao korisnik. Poseban benchmark adapter sme prevesti ulaz, pokrenuti izolovan run i pokupiti izlaz. Ne sme potajno koristiti bolji zaseban harness koji javna aplikacija nema. [S1: A25, W3]

### 13.1. Izbor prvog benchmarka

Zadržati postojeće τ² i GAIA2/ARE adaptere gde su upotrebljivi, ali proveriti da li pokrivaju glavni knowledge-work ishod. GDPval, APEX-Agents, FORTE i OdysseyBench iz ranijeg razgovora su **kandidati za verifikaciju**, ne već odobren i implementiran suite. Ovaj dokument ne potvrđuje njihove aktuelne veličine, licence, otvorenost runnera ili leaderboard brojeve.

Za prvi izbor vratiti kratak evidence card: zvanični izvor/verzija, dostupnost taskova i reference/scorera, dozvola upotrebe, artifact/tool okruženje, mogućnost lokalnog izvršenja, način grading-a, postojeće objavljene baseline konfiguracije i integracioni napor. Odabrati jedan primarni professional-work test, ne šest obaveznih suite-ova od prvog dana.

Stara `feature/harness-sota-bench` grana prema S1 značajno zaostaje. Prvo pregledati diff i cherry-pick/adaptovati korisne adaptere; ne zahtevati automatski veliki rebase celog starog runtime-a samo radi runnera. [S1: W3]

### 13.2. Dva odvojena poređenja

| Pitanje | Ispravan eksperiment | Granica zaključka |
|---|---|---|
| Šta Waggle dodaje istom modelu? | Isti model/revizija/quant, isti podaci i kontrolisani resursi; minimalan baseline vs Waggle; zatim odabrane ablations. | Efekat sistema i pojedinih slojeva u tom okruženju. |
| Kako stoji prema konkurentskom sistemu? | Potpuno imenovana frontier konfiguracija/harness, isti benchmark/protokol ili jasno označena referenca na tuđe objavljeno merenje. | System-to-system rezultat, ne dokaz da je Qwen postao bolji osnovni model. |

„Raw model” na tool benchmarku zahteva minimalan dovoljan tool adapter; ne oduzimati baseline-u pristup potrebnim fajlovima da bi Waggle pobedio. Ako se poredi vanilla chat bez alata sa tool agentom, tako ga nazvati i ne prikazivati kao kontrolisan efekat samog harnessa.

Objavljen leaderboard score nije automatski uporediv sa samostalnim lokalnim run-om. Potvrditi dataset split, verziju scorera, model ID, reasoning/budžet, tools, broj pokušaja i harness. API model u neutralnom runneru nije isto što i Claude/ChatGPT gotov proizvod.

### 13.3. Razvojni A/B pa zaključana studija

Prvi razvojni uzorak služi greškama i proceni troška, ne javnom „beats” naslovu. Broj zadataka predložiti nakon pregleda task variance i resursa. Potom zamrznuti hipotezu, metriku, uzorak, budžete, kriterijume prekida i analizu pre finalnog testa.

Ablation prostor može obuhvatiti skills, memory, harness i evolved varijantu, ali ne zahtevati svaku kombinaciju u prvom finalnom run-u. Izabrati minimum koji odgovara primarnoj hipotezi i bar jedan način da se proveri odakle lift dolazi. Razvojni mali uzorak ne zamenjuje punu evaluaciju koju zahteva zvanični protokol.

Benchmark režim ne gasi bezbednosne granice. Puna Waggle konfiguracija zadržava svoje obavezne gates. Baseline koji nema Waggle harness ocenjuje se istim nezavisnim scorerom; ne ubacivati mu krišom Waggle verification pipeline pa tvrditi da je „raw”. Svaki profil mora biti naveden u manifestu.

### 13.4. Kontaminacija, memorija i fairness

Finalni test podaci, rubrike i gold odgovori ne ulaze u trening/evolution memoriju. Svaki nezavisni task dobija čisti scope, osim ako benchmark izričito zahteva kontinuitet. Memory benchmark dobija istu dozvoljenu istoriju po protokolu, ne dodatno znanje samo za Waggle.

Learning može stvarati lokalne tragove tokom evaluacije radi dijagnostike, ali ih ne koristi za sledeći test primer ako protokol to ne dopušta. Evoluira se na development skupu; finalne verzije se zamrzavaju. Run reset obuhvata `.mind`, caches, persisted artifacts, actions i knowledge iz prethodnih primera, uz proverljiv manifest.

### 13.5. Statistika i značenje marketinške poruke

**DIR-23 — Nije isto „nije detektovana razlika” i „isti su”.** S1 navodi raniji `N=114, p=0.11` i wording „matches”, kao i povučenu tvrdnju o GAIA2 lift-u. Ovi brojevi se ovde prenose samo kao upozorenje iz audita. Nezapažena statistička razlika nije sama po sebi dokaz ekvivalencije. [S1: C18, §7]

Plan treba da poveže metriku i postupak: paired analizu za uparene taskove; McNemar samo kada odgovara binarnom ishodu; intervale efekta za score; ekvivalenciju/neinferiornost samo uz unapred zadatu praktičnu marginu i odgovarajući dizajn. Ne propisivati isti test svim metrikama. Ponovljene poređenja, stochastic seeds, evaluator varijabilnost i broj posmatranih kandidata moraju biti deo analize.

Dozvoljene poruke zavise od rezultata: „izmeren lift prema našem baseline-u”; „u ovom uzorku razlika nije utvrđena”; „potvrđena neinferiornost unutar definisane margine”; „nadmašio konfiguraciju X na benchmarku Y pod uslovima Z”. Bez opšteg „pobedio frontier” iz jedne podkategorije ili različitih protokola.

### 13.6. Cena i manifest

Zabeležiti code SHA, model/quant/runtime, hardware, dataset i scorer reviziju/hash, tool/skill versions, context i token limite, attempts/seeds, timeout i pause/recovery režim, kompletan output, grader output i trošak. Odvojiti model inference, evaluator, alat/API, GPU vreme, energiju/hardware pretpostavke i ljudski rad gde se procenjuju.

Lokalno nije automatski nula troška. Ne nazivati free/OSS softver „besplatnim compute-om”. Provider cenu proveriti u aktuelnom zvaničnom izvoru pre claim-a; audit prijavljuje neslaganje cost tabela. U testu ne slati stvarne poslovne mejlove ili raditi neodobrane akcije nad korisničkim nalozima; koristiti izolovan fixture/test okruženje. [S1: A29]

**Performance-led lansiranje traži izvršenu studiju, ne garantovanu pobedu.** Šest grana i proizvoljan ukupni N≈1500 nisu obavezni unapred; zavise od cilja, zvaničnog testa i budžeta. Poseban Waggle LongWork javni benchmark može kasnije; interni crash/resume acceptance nije odložen time.

## 14. OSS-first: Build-vs-Borrow proces

**DIR-24 — Preserve → Borrow → Adapt → Build.** Pre svake veće oblasti napravi kratak zapis: postojeći Waggle, OSS kandidati, dokaz da capability postoji, licenca/maintenance/security, Windows i local-first ponašanje, težina dependencies, API fit, testovi, performanse, update/exit strategija i obrazložena odluka. Dokument po talasu je dovoljan ako pokriva stvarne zasebne izbore; materijalna nova dependency odluka zahteva dopunu.

| Kandidat / izvor | Šta tražimo | Uslov i šta ne pretpostavljamo |
|---|---|---|
| Postojeći Waggle | Home/Workspace, skills, konektori, retrieval, approvals, crons, run registry, tracing, evolution, runtime i installer. | Potvrditi pozivaoce i E2E putanju. Ne „čuvati” no-op kao gotovu sposobnost. |
| BuilderIO/agent-native | Zajedničke UI/agent akcije, state/event model, reliable-mutation i proof patterns; durable ponašanje samo ako je stvarno implementirano. | Proveriti konkretne fajlove/commit/licence; ne kopirati kod sa nejasnim pravima. Bez obavezne promene Waggle frameworka. |
| Omnigent | Adapter ugovori, povrat rezultata, external-agent invocation i observability patterns. | Bez obaveznog Python runtime-a u standardnom no-Python Windows paketu; per-file pravo i održavanje. Nije novi temelj Waggle-a. |
| OSS skill ekosistemi | Curated knowledge-work paketi i kompatibilne veštine. | Razlikovati pojedinačne repoe/pakete i njihove licence; „sve Cowork skills je OSS” nije shipping dozvola. |
| OSS konektori/MCP | Održavani adapteri, auth i capability implementacije. | Scope, supply chain, service uslovi i izolacija; ne svaki MCP binary kao silent install. |
| Ollama/vLLM/OpenAI-compatible | Inference infrastructure i model lifecycle. | Odvojiti native desktop setup od server endpoint integracije. Ne graditi svoj serving bez dokumentovanog razloga. |
| Benchmark projekti | Zvanični taskovi, runneri, environment i scorer. | Pinovati verzije i dozvole; disclose izmene. Ne reimplementirati scorer radi povoljnijeg rezultata. |
| Durable engine kandidati | Najmanji održiv način checkpoint/run lifecycle-a. | Izmeriti fit. SQLite je kandidat; nije unapred odlučeno da moramo graditi 600–1000 LOC. |

Stari S2 navodi različit tretman `anthropics/knowledge-work-plugins` i document skills. To je istorijski licencni nalaz koji treba potvrditi na preuzetoj verziji, a ne ignorisati ili generalizovati. Isto važi za GluoMem. U ovom obimu Hive Mind ostaje produkcioni memory temelj; istraživačku liniju ne uvoditi kao drugi paralelni engine bez razloga. [S2: §3.2 P4, §3.3]

Inventory uključuje repo/package, tačan commit/version/hash, licencu, izmene, notices, vlasnika održavanja, bezbednosni pregled i update strategiju. Model weights i native binarije su takođe komponente. Automatski vulnerability scanner nije potpuna security verifikacija; nerešen nalaz ima vlasnika, odluku i ograničenje upotrebe.

## 15. Talasi, zavisnosti i način procene

### 15.1. Sačuvati originalne wave ID-eve za traceability

| Tok | Smer za replaniranje | Isporuka kojoj doprinosi |
|---|---|---|
| WB + OSS | Odmah inventory licenci, tier/kvark granice, starih ugovora i reuse odluka. Poslovni smer zaključan; konkretna migracija se proverava. | G1/G3 |
| W0 | Red testovi i popravke istinitosti; status, verifier, override, scope i trace rizici. | G1 |
| W1 | Run store, server-driven faze, stabilni actions/journal, gates/proof, budgets, restart i detach. | G2 |
| W2 | Existing retrieval → ContextPackage/reference ugovor, izolacija, capture i external handoff. | G2; proširene integracije G3 |
| W3 | Dve knowledge-work recipe putanje, router, validators i production adapter. | G2 |
| W3e | Prvo stvarna prompt/schema/skill aktivacija i paired evaluacija; zatim posebno procenjena ograničena recipe putanja. | G2/G3 |
| W4 | Zajednički resolver facade i inline setup/blocked resume; u početku najmanji koristan safe capability scenario. | G2 minimalno, G3 puno podržano |
| W5 | Očuvati Home/Workspace; osnovni Work Progress u G2, ostala IA/copy i routines poliranje pre G3. | G2/G3 |
| W6 | Live model readiness i tačan target runtime rano; promena onboarding iskustva i hardware ladder paralelno. | G2/G3 |
| W7 | Jedan izabran mail/calendar scenario, incremental sync i attention precision; širenje kanala kasnije. | G3 |
| W8 | Postojeći IM companion minimum odvojiti od finalnog Windows hardeninga; fresh release evidence. | G3 |
| B1–B3 | B1 benchmark izbor/protokol rano; B2 razvojni A/B čim vertikala radi; B3 zaključana study nakon freeze-a. | G2/G3 |

Predlog kritične putanje za dokaz jezgra: W0 → minimalni W1 + W2 ugovor → W3 production knowledge tok → W3e proverena aktivacija i izabrane ablations → B2/B3. Ne čekati sve kanale i pun mobile razvoj pre prvog poštenog testa. W5 osnovni progress, W6 target readiness i W4 minimalni capability put moraju stići uz ovu vertikalu, ne kao kozmetika posle nje.

Za javni proizvod pridružuju se kvalifikovane W4/W5/W6/W7/W8/WB i OSS isporuke. Revidirani plan mora prikazati stvarne zavisnosti, ne samo jednako dugačke lane-ove radi lepog Gantta.

### 15.2. Procena iz audita: polazni input, ne novi dogovor

| Wave iz S1 | Klasični inženjerski dani | AI-orchestrated inženjerski dani |
|---|---:|---:|
| OSS | 9–11 | 4–5 |
| W0 | 6–8 | 3–4 |
| W1 | 39–52 | 17–24 |
| W2 | 18–24 | 9–12 |
| W3 | 34–46 | 16–22 |
| W3e | 18–26 | 10–14 |
| W4 | 26–36 | 11–16 |
| W5 | 23–34 | 11–16 |
| W6 | 18–25 | 9–13 |
| W7 | 40–45 | 15–19 |
| W8 | 8–10 | 5–7 |
| WB | 18–24 | 8–11 |
| **Ukupno za izvorni smanjeni obim** | **257–341** | **118–163** |

Tabela je preuzeta iz S1 §4; zbir je aritmetički tačan. Autor kaže da je preklapanje već uklonjeno. **Ne umanjivati zbir paušalnim „AI će to mnogo brže” popustom, ali ni preuzimati ga kao procenu ovog korigovanog obima.** Ograničena recipe evolution i izvršena javna studija nisu uključene na isti način u izvorni trimmed scope; uži početni kanal scope može smanjiti drugi deo.

Audit navodi critical-path floor 35–47 radnih dana i kalendarski 12–17 nedelja za svoj plan, uz pretpostavke o founder review-u i paralelnim worktree-jevima. Te pretpostavke nisu potvrđen korisnikov raspoloživi kapacitet. Oznaku P50 zameniti „ekspertski raspon” ako nema potkrepljenog probabilističkog modela. [S1: §6]

Kalendarsku grešku ispraviti: **12–17 kalendarskih nedelja od 27.09.2026. daje 20.12.2026–24.01.2027.**, pre dodatnih eksplicitnih pauza. Ne koristiti januar–februar iz izvornog sažetka bez posebnog uračunatog razloga.

### 15.3. Kako vratiti novu procenu

**DIR-25 — Procena iz rada, zavisnosti i dokaza.** Za G1, G2 i G3 zasebno prikazati: preostale jedinice rada, šta se čuva/pozajmljuje, test/migration napor, human review, CI/compute, kalendarske zavisnosti i spoljne blokade. Ne tvrditi procenat „gotovosti” iz broja modula.

Svaki wave ima konkretan owner/ulogu, ulazni kontrakt, izlaz, exit testove, compatibility/migration, rizik, rollback i affected receipt listu. Hotspot fajlovi imaju merge vlasnika; paralelni agenti rade iza dogovorenih interfaces. Sve promene u `chat.ts` ili `agent-loop.ts` ne mogu se tretirati kao nezavisni tokovi bez integracionog troška.

Licence, OAuth/provider zahtevi, signing i managed security pregled moraju imati dokaz stvarnog statusa. Trajanje tih postupaka ne pretpostavljati iz starog dokumenta; zavisi od konkretne putanje. Testovi i preuzimanje modela imaju compute/network trošak odvojen od vremena pisanja koda.

### 15.4. Release evidence i integraciona disciplina

S1 prijavljuje veliki razmak između `main 2af0904d` i starijih kvalifikovanih kandidata. To je snapshot audita, ne aktuelna commit brojka. Planer mora ponovo utvrditi referentni code SHA i koja evidence važi. Ne nositi istorijski GO preko izmena runtime-a bez odgovarajuće provere.

Red test pre fix-a, green posle. Izvorni build/lint/test komandni skup iz S3 proveriti u aktuelnom `package.json` pre upotrebe; ne prepisivati nedostupne komande. Crash-injection mora biti testiran i na packaged Windows kandidatu, ne samo sa developer Node okruženjem.

Broj freeze-ova izabrati prema zavisnostima i trošku requalification-a; tri freeze-a iz S1 je pretpostavka, ne nepromenljivi zahtev. Public installer/signature, router, persona, auth i security receipts moraju navesti tačnu reviziju, komande, okruženje, ograničenja i rezultat. Ne koristiti stari persona score kao ukupni knowledge-work benchmark.

## 16. Obavezni acceptance testovi

Sledeći testovi su **predloženi kriterijumi za novi plan**, ne tvrdnja da su već izvedeni. Planer svakom dodeljuje lokaciju, fixture, okruženje, owner i G1/G2/G3 milestone. Numeričke pragove za kvalitet/latenciju/precision postaviti pre zaključanog testa na osnovu baseline-a i rizika, ne naknadno prema pogodnom rezultatu.

| Test | Scenario i merljiv očekivani ishod | Veza |
|---|---|---|
| AT-01 | Verify output `FAIL`, nevalidan verdict i izostali dokaz ne dovode strict run do uspešnog završetka. `CONDITIONAL` prati eksplicitnu recipe politiku. | DIR-03/07 |
| AT-02 | Običan bash `echo` nije položen coding test; nenulti exit code nije success. Test gate koristi observed journal. | DIR-07 |
| AT-03 | Budget stop pre obaveznog verify ostavlja jasan partial/blocked ishod i sačuvan budžet; nema oznake potpuno provereno. | DIR-08 |
| AT-04 | Aktivirani persona/skill/spec override ulazi u sledeći stvarni prompt; rollback menja sledeći run; postojeći run ostaje na pinned verziji. | DIR-13 |
| AT-05 | Evolved schema se koristi u target izvršenju, a candidate prompt se izvršava pre ocenjivanja. Test prepoznaje slučaj prompt-as-output. | DIR-13/15 |
| AT-06 | Dva istovremena Workspace run-a istog harnessa imaju različite run ID-eve; events, kontekst i trace ishodi se ne mešaju. | DIR-04/09 |
| AT-07 | Crash posle potvrđene faze: restart nastavlja sledeću fazu sa istim referencama; potrošnja prethodne faze nije izgubljena. | DIR-04/05 |
| AT-08 | Crash posle provider uspeha, pre lokalnog ack-a: isti action identitet se reconciliuje; bez blind duplicate slanja. Nepoznat ishod ostaje vidljiv. | DIR-06 |
| AT-09 | Dva procesa pokušaju preuzimanje istog run-a; samo jedan sme započeti novu sporednu radnju pod važećim ownership-om. | DIR-06 |
| AT-10 | SSE reconnect i replay ne dupliraju kartice ni akcije. Detach odobrenog background rada nije cancel. Cancel sprečava nove radnje. | DIR-05 |
| AT-11 | Nedostajući connector blokira već kreiran run. Validan setup vraća isti run; callback za drugi request ili istekao grant ne pokreće posao. | DIR-04/11 |
| AT-12 | Decline/expiry/revoke odobrenja se sačuva kroz restart; model, hook i IM poruka ne mogu ga sami poništiti. | DIR-11 |
| AT-13 | Dokument i run sažetak iz Workspace A ne pojavljuju se u personal ili Workspace B retrieval-u bez eksplicitne dozvole. Test sadrži sentinel podatke. | DIR-09 |
| AT-14 | RAWDETAIL citat ostaje dostupan u dozvoljenom scope-u; privremeni hook tekst nije automatski dugotrajna činjenica. Re-run istog extraction-a ne duplira memoriju. | DIR-09 |
| AT-15 | Revokovan/obrisan izvor iz checkpoint konteksta nije upotrebljen posle resume-a. Nema „snapshot je jači od erasure” izuzetka. | DIR-09/21 |
| AT-16 | Opcioni external executor dobije pravi context package i vraća rezultat istom Workspace-u; nema key leakage-a ni tvrdnje o neopaženim internim tool radnjama. | DIR-10 |
| AT-17 | Postojeći skill se pronađe i koristi bez ručnog odlaska u katalog. Nedostajuća binarna sposobnost ne instalira se bez predviđenog trust/approval toka. | DIR-11 |
| AT-18 | UI, agent i rutina pozivaju istu izabranu poslovnu akciju kroz isti permission/validation ugovor; agent ne dobija prečicu oko potvrde. | DIR-12 |
| AT-19 | Mejl/izvor sa prompt injection-om ne menja policy, ne izvlači vault i ne autorizuje slanje. Test proverava i put bez detektovane ključne reči skenera. | DIR-11/18 |
| AT-20 | Ključ prisutan ali generacija ne radi: onboarding nije „ready”. Izabran lokalni model prolazi generation i relevantni tool round-trip; prekinut pull je oporavljiv. | DIR-17 |
| AT-21 | Research/document fixture daje fajl koji se otvara, potrebne sekcije i razrešive izvore; namerno pogrešan broj/citat hvata odgovarajući validator ili ostaje eksplicitno nepotvrđen. | DIR-02/07 |
| AT-22 | Novi dokument menja zaključak u nastavku istog Workspace-a; rezultat navodi novu source verziju i ne gubi prethodne potvrđene odluke bez razloga. | DIR-02/09 |
| AT-23 | Rutina posle sleep/restart/DST scenarija prati zadatu misfire politiku, nema duple occurrence radnje i ne resetuje budžet. | DIR-19 |
| AT-24 | Attention classifier i dedup ocenjivani su na označenom holdout-u; prijavljeni precision, false positives i greške spajanja. Threshold se zaključava pre finalnog scoring-a. | DIR-18 |
| AT-25 | Upareni IM korisnik dobije dozvoljeni status i može potvrditi samo odgovarajući neistekli zahtev. Replay/forward tuđe potvrde ne daje grant. | DIR-11/18 |
| AT-26 | KVARK connect aktivira samo dozvoljene organizational capabilities; nedostupni on-prem model ne pokreće cloud fallback. Personal mind se ne kopira automatski. | DIR-20 |
| AT-27 | Migracija stare config/run šeme je ponovljiva; rollback ne duplira radnje i ne vraća erased podatke ili opozvane dozvole. | DIR-21 |
| AT-28 | Benchmark koristi production putanju; memorija/gold iz taska X ne utiču na nezavisni task Y. Manifest i offline recount odgovaraju sačuvanim output-ima. | DIR-22/23 |
| AT-29 | Baseline i candidate su ocenjeni na istim primerima; kandidat sa quality regresijom ili prekoračenim cap-om nije promovisan; holdout access je evidentiran. | DIR-14/15 |
| AT-30 | Čist podržani Windows profil pokreće isporučeni lokalni proizvod bez developer Node/Python/Docker preduslova; uninstall/repair, notices, signed artifact i fresh receipts odgovaraju kandidatu. | DIR-24/25 |

Za čisto lokalni/offline profil dodati merenje neodobrenog egress-a. Za BYOK/live-channel profil merenje potvrđuje **dozvoljena odredišta i minimizaciju**, ne nemoguću tvrdnju da je mrežni saobraćaj nula. KVARK testovi imaju zasebnu on-prem model/evaluator granicu.

## 17. Matrica razrešenja C1–C22

Izvor svih C oznaka: **S1 §1, L26–L47**. Statusi ispod su smer za revidirani plan, ne potvrda da je izmena koda izvršena.

| Nalaz | Razrešenje | Obaveza planera |
|---|---|---|
| C1 — Version identity | **PRIHVATITI** | Razdvojiti reviziju dokumenta, postojeći installer i budući proizvodni release. Novi PRD/FRD su v1.2 draft; broj javne aplikacije ne menjati automatski. |
| C2 — Free vs Teams/Stripe | **RAZREŠENO PROIZVODOM; MIGRACIJA** | D-01/D-02 važe. Inventarisati gateove i stvarne korisnike pre migracije; ne obnoviti Waggle Team kao „otvorenu founder odluku”. Buduća convenience monetizacija nije ukinuta. |
| C3 — Cloud „and teams” | **PRIHVATITI** | Izbaciti zaseban Waggle cloud-teams scope. Timovi se vezuju za KVARK, koji ostaje on-prem. |
| C4 — Mobile/loopback | **PRECIZIRATI** | Nije logička zabrana mobile-a, nego nerešen network/auth obim. IM-first je predlog, ne isto što i gotov PWA/native companion. |
| C5 — OSS vs proprietary/private | **PRIHVATITI PROVERU** | Odluka free/OSS je data; konkretna prava, NOTICE i publication mehanika moraju se rešiti na aktuelnom stanju. |
| C6 — Kanal API/ToS | **PROVERITI PO KANALU** | Zvanični konkretni use-case i profil live/bot/import/roadmap. Ne ponavljati blanket pravne tvrdnje niti uvoditi neoficijelni inbox pristup po defaultu. |
| C7 — Tri „Harvest” pojma | **PRIHVATITI RAZDVAJANJE** | Memory import/Harvest ostaje tehnički termin gde postoji; Home Attention; engineering Build-vs-Borrow. Rename internog koda nije automatski zahtevan. |
| C8 — Run posle block/context | **PRIHVATITI** | Run kreirati pre trajnog blokiranja i pinovanja context reference; §6.2 daje korigovan redosled. |
| C9 — Prioriteti vs talasi | **PRIHVATITI** | Jedan dependency plan za PRD i FRD; §15 je nova radna osnova, ne dva neusaglašena spiska. |
| C10 — Dead learning/schema | **POVEZATI ILI ZAMENITI** | Dokazati effective behavior. Ne čuvati no-op; ne brisati korisničku sposobnost bez prikazane zamene ili scope odluke. |
| C11 — RAWDETAIL | **PRECIZIRATI** | Verbatim retrieval evidence nije ista kategorija kao learned fact. Očuvati regresiono proverenu putanju, scope, TTL i brisanje. |
| C12 — Status mismatch | **PRIHVATITI** | Kanonska/legacy mapa i API kompatibilnost; PAUSED tek uz semantiku. Unknown action outcome ne izjednačiti sa uspehom. |
| C13 — Resolver order/rank | **PRECIZIRATI** | Permissions prvo, task fit zatim; lane order je preference/tie-breaker među validnim kandidatima, ne slepa prioritetna lista. |
| C14 — Inline vs stari ADR | **NOVI ADR** | Inline kontinuitet, browser OAuth i trajno blokiranje. Ne tvrditi da se OAuth završi u chat tekstu; zameniti konfliktni ADR uz migration impact. |
| C15 — Routines/TOOLLESS | **CARVE-OUT** | Stari loop ostaje toolless; odobrena rutina je trigger za tool-enabled durable posao pod drugim ugovorom. Bez silent acquisition. |
| C16 — Persona/agent UI | **PRECIZIRATI** | Opciona razumljiva rola može ostati; tehnička persona konfiguracija se skriva. Bez obaveznog izbora stručnjaka pre prvog posla. |
| C17 — Coding family | **OČUVATI, KVALIFIKOVATI** | Proveriti native i external putanje odvojeno. Bez velikog novog coding programa; ne svoditi sve unapred na cloud izvršioce. |
| C18 — Frontier tvrdnja | **PRIHVATITI UPOZORENJE; ISPRAVITI MATCHES** | Hipoteza do dokaza. Nonsignificant rezultat nije sam dokaz ekvivalencije. Ranije ilustrativne tabele nisu merenja. |
| C19 — Novi target model | **RE-BASELINE** | Qwen 3.8 27B cilj ostaje; potvrditi ID/runtime/quant i hardware ladder. Stari MoE rezultat je odvojena kontrola. |
| C20 — Worker paralelne semantike | **EXPLICIT BOUNDARY** | Inventarisati secondary worker. Local core ima jedinstvene ugovore; legacy team worker sačuvati/izolovati ili vezati za KVARK, bez novog Solo dupliranja. |
| C21 — Nemerljivi kriterijumi | **PRIHVATITI** | Operacionalizovati kroz §16 i zaključane threshold-e; ne davati arbitrarne globalne quality procente. |
| C22 — Release drift | **PRIHVATITI** | Utvrditi current SHA, ancestor/receipt relation i novu qualification putanju. Istorijski receipt nije aktuelni GO. |

## 18. Matrica razrešenja A1–A29

Izvor A oznaka: **S1 §2, L53–L126**. Sve promene u odnosu na izvorni predlog navedene su eksplicitno.

| Dodatak | Smer | Konkretna posledica |
|---|---|---|
| A1 — Receipts po wave-u | **PRIHVATITI UZ BATCHING** | Lista touched surfaces i plan kandidat freeze-a; broj i trajanje freeze-ova nisu unapred dokazani. |
| A2 — Data migration | **PRIHVATITI** | Runs, cron execution state, overrides, trace qualification i config migration; pretplatnici samo ako stvarno postoje. |
| A3 — Erasure/export | **PRIHVATITI** | Novi store-ovi i reference ulaze u deletion/export pravila; tehnički test nije blanket pravna sertifikacija. |
| A4 — ExecutionMode | **PRIHVATITI/PRECIZIRATI** | Razdvojiti conversation/work i normal/strict/benchmark. Režim ne proširuje dozvole. |
| A5 — Server evidence | **PRIHVATITI** | Gates čitaju executor ledger; stvarni verdict/status/exit-code/artefakt. Model-supplied tool list nije autoritet. |
| A6 — Phase atomic unit | **PRIHVATITI** | Phase-level resume sa prior outputs; side-effect journal sprečava slepo ponavljanje. |
| A7 — Idempotency key | **ISPRAVITI DIZAJN** | Stabilni actionId odvojen od attemptId; provider capability i unknown-outcome reconciliation; bez univerzalnog exactly-once obećanja. |
| A8 — runs.db | **KANDIDAT + ADR** | SQLite rešenje prvo proceniti prema reuse/borrow kriterijumima; retention/GC i schema verzije obavezni. |
| A9 — Detach/reattach | **PRIHVATITI** | Eksplicitna background semantika, sinceSeq/replay i cancel odvojen od gubitka veze. |
| A10 — Persist budget | **PRIHVATITI** | Potrošnja traje kroz restart; token/compute/judge troškovi ne nestaju u novom attempt-u. |
| A11 — WorkProgress events | **PRIHVATITI** | Per-run bus, seq, phase/attempt i evidence reference; nema mešanja paralelnih workspaces. |
| A12 — Capability envelope | **IZMENITI TIER DEO** | Presek bezbednosnih, KVARK kada važi, korisničkih i workspace ograničenja. Ne zadržati individualni TEAMS paywall kao permission pravilo. |
| A13 — Injection | **PRIHVATITI UZ OGRANIČENJE** | Scan + taint + provenance + permission boundary. Scanner sam nije garancija niti odobrenje za sporedni efekat. |
| A14 — Threat model/install | **PRIHVATITI** | Binary/MCP threat model, secrets test i bounded installation. |
| A15 — Individual approvals | **PRIHVATITI** | Persisted block, expiry/deny/revoke; IM potvrda samo uz sigurno vezivanje identiteta i akcije. |
| A16 — Evolution privacy/cost | **PRIHVATITI/PRECIZIRATI** | Local default, consent/cap za Waggle BYOK; KVARK nema cloud judge fallback. |
| A17 — Dataset governance | **PRIHVATITI/PRECIZIRATI** | Frozen data/hash, provenance, qualified outcomes, correction ≠ gold. „≥30” nije univerzalna dovoljnost. |
| A18 — Promotion statistics | **PRIHVATITI/PRECIZIRATI** | Paired baseline/candidate, metric-appropriate CI, praktična margina, regresione i resource granice; držati test odvojenim od repeated tuning-a. |
| A19 — Executor ≠ judge | **IZMENITI APSOLUTNI USLOV** | Stvarno izvršenje obavezno. Druga familija poželjna, ne obavezni zahtev jedne lokalne mašine; independence ograničenje se prijavljuje. |
| A20 — Live readiness | **PRIHVATITI** | Izabrani model generiše; work profile ima relevantan tool/protocol test. |
| A21 — Hardware ladder | **PRIHVATITI** | Model/quant/runtime/context/RAM/VRAM/disk i measured latency; interrupted pull recovery. |
| A22 — Failure UX | **PRIHVATITI** | Jednako jasan View work za partial, blocked, cancelled i failed; bez lažnog procenta napretka. |
| A23 — Copy lint/switch | **PRIHVATITI SA IZUZECIMA** | Jedan razumljiv advanced pristup; ne sakriti naziv eksternog izvršioca ili podatkovni izlaz kada je bitan za saglasnost. |
| A24 — A11y/i18n | **PRIHVATITI CILJ, OZNAČITI ODLUKU** | Testovi novih površina i centralizovani stringovi; English-only release je predlog za potvrdu, ne istorijska korisnička odluka. |
| A25 — Benchmark statistics | **PRIHVATITI/PRECIZIRATI** | Production putanja, manifest, contamination firewall, recount, odgovarajući statistički dizajn. McNemar/TOST nisu obavezni za svaku metriku. |
| A26 — Context specifics | **PRIHVATITI/PRECIZIRATI** | Token budget/provenance, hook precedence bez auth prečice, scope leak fix. Memorijski regression uz isti protokol, ne proizvoljno „± noise”. |
| A27 — KVARK connect | **PRIHVATITI** | Live capability/auth contract, storage/revoke i no-sharing default; ne samo tier check. |
| A28 — SBOM/notices | **PRIHVATITI** | Pinned provenance native binaries/modela; CI/release proverava isporučeni paket, sa obrazloženim handlingom nalaza. |
| A29 — Cene | **PRIHVATITI PROVERU** | Proverena zvanična cena/datumi za svaku cost tvrdnju; odvojiti cloud račune i lokalne troškove. |

## 19. Matrica svih predloženih rezova iz audita

Oznake **R01–R24** uvedene su ovde radi traceability-ja; izvorna S1 §3 tabela ih nema. One prate redosled svih 24 reda. „Odložiti” ispod znači predloženi scope za novi plan, ne dozvolu da se ukloni postojeće podržano ponašanje.

| Red | Predmet originalnog reza | Razrešenje za replaniranje |
|---|---|---|
| R01 | WhatsApp/Viber/Discord inbox | Podržati samo kvalifikovan API/bot/forward/import scenario. Smanjiti prvi scope; ne davati blanket pravni zaključak bez aktuelnog zvaničnog izvora. |
| R02 | Native/PWA/mobile remote | Nova aplikacija i remote infra nisu G2. IM-first je mogući G3 minimum; responsive web i pune mobile mogućnosti posebno imenovati. |
| R03 | Harness recipe evolution | Ne potpuno izbacivanje. Odvojeno proceniti ograničen registry odobrenih varijanti; puna graph/topology evolucija kasnije. |
| R04 | „Evolved recipe” gate | Uslov mora odgovarati isporučenom obimu. Prompt/skill/schema promotion i bounded recipe rezultat imaju različitu evidenciju. |
| R05 | Meeting/routine families | Nove specijalizovane porodice odložiti. Routines kao trigger postojeće recipe putanje ostaju; meeting dokumenat može koristiti postojeći document/research tok. |
| R06 | Coding hardening/benchmark | Ne veliki novi coding program; sačuvati i kvalifikovati postojeće native/external puteve. Javno coding poređenje može posle KW studije. |
| R07 | Semantic citation entailment | Univerzalni entailment engine kasnije; ciljane broj/citat/provenance provere i iskren nivo sadržinskog pregleda ne odlagati. |
| R08 | Waggle LongWork benchmark | Novi javni dataset/proizvod odložiti; interni crash/resume/change-input testovi su obavezni. |
| R09 | Full six-arm N≈1500 study | Ne unapred obavezan N ili šest grana. Izvršiti minimalnu rigoroznu studiju za izabranu javnu tvrdnju; runner-only nije dovoljan. |
| R10 | PAUSED/mid-phase/backoff | Mid-phase i pravi pause mogu kasnije. Phase-level retry/resume, safe side effects, resource cap i obrazložena retry politika ostaju. |
| R11 | Inline MCP/remote installs | Resolve/propose inline; Settings trust/install flow u prvom obimu je prihvatljiv ako se posao ne izgubi. Bez silent binary install-a. |
| R12 | Waggle-owned OAuth client | Izabrati verified/odobrenu putanju ili jasno dokumentovan BYO-client pilot. API-key E2E je tehnički dokaz, ne zamena za mail/calendar value scenario. |
| R13 | Rank by user policy | Veliki novi policy engine može kasnije; minimalni korisnički scope, grants i denial ostaju neizostavni. |
| R14 | Personal→KVARK promotion | Početno no-sharing i izričit connection/scope ugovor; široka organizaciona promocija na KVARK strani kasnije. |
| R15 | Cloud sync/remote tasks | Van prvog individualnog lokalnog release scope-a; ne brisati stratešku kasniju opciju. KVARK ostaje on-prem. |
| R16 | Qwen tuning u onboarding-u | Razdvojiti benchmark tuning od UX wizard-a; kvalifikovan cilj i hardware ladder moraju se povezati pre javne tvrdnje. |
| R17 | llama.cpp/LM Studio | OpenAI-compatible presets ako testovi potvrde potrebni protokol; nema nove zasebne integracije radi liste logotipa. |
| R18 | AgentLearning/improvement wiring | Funkcionalni cilj ostaje. Popraviti/vezati ili zameniti drugim postojećim modulom; mrtav kod nije feature, ali brisanje nije „rešeno učenje”. |
| R19 | EvolveSchema default | Proveriti stvarni output→execution→deploy tok. Sačuvati koristan efekat, ne no-op; ne aktivirati u svakom chat-u samo radi nazivlja. |
| R20 | Agent-Native preferred source | Imenovani kandidat za reuse/pattern; konkretno pravo i sposobnost po fajlu/commit-u. Nema obaveznog dependency-ja niti blanket odbacivanja ideja. |
| R21 | Omnigent reference only | Bez obaveznog Python core dependency-ja. Licencno/tehnički dozvoljeno adapter reuse ostaje opcija posle pregleda. |
| R22 | Durable engines — build 600–1000 LOC | Ne prihvatiti unapred zaključak. Build-vs-Borrow odlučuje; jednostavan SQLite engine može pobediti, ali testovi su kriterijum, ne LOC. |
| R23 | Spajanje dva MCP servera | Može kasnije ako ne blokira scope/auth/context ugovor. Ne praviti refaktor radi estetske simetrije. |
| R24 | OSS record per PR | Jedan kratak zapis po većoj odluci/talasu, sa dopunom za materijalno novu komponentu. Bez birokratije za svaki sitan PR. |

## 20. Šta planer isporučuje i šta ostaje otvoreno

### 20.1. Traženi paket sledećeg planerskog prolaza

Putanje su **predložena mesta u korisnikovom repou**, ne tvrdnja da su ovim dokumentom već napravljene.

| Predloženi artefakt | Obavezan sadržaj |
|---|---|
| `docs/Waggle_PRD_v1.2_DRAFT.md` + DOCX | Dogovoreni proizvod, jasni statusi postojećeg/novog, scope G1/G2/G3, ciljni korisnički tokovi i usklađena KVARK granica. |
| `docs/Waggle_FRD_v1.2_DRAFT.md` + DOCX | Ugovori run/context/action/proof/evolution/resolver-a, režimi, state map, migracije, failure/privacy i testovi. Ne samo opisne želje. |
| `docs/plans/WAGGLE-DELIVERY-PLAN-v1.2.md` | Wave/PR slicing, zavisnosti, owners/uloge, exit kriterijumi, risk/rollback, receipts i G1/G2/G3 procena. |
| `docs/plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md` | C1–C22, A1–A29 i R01–R24: status, dokaz, odluka, vlasnik, wave, acceptance i link na spec zahtev. |
| `docs/plans/WAGGLE-BUILD-VS-BORROW-v1.2.md` | Stvarno pregledani source/commit/license, preserve/borrow/adapt/build odluke i najvažniji upstream/security troškovi. |
| `docs/plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md` | Primarni test kandidat, hipoteza, baseline/konfiguracije, data split, contamination zaštita, metrics/statistics, budžet i uslov objave. |
| `docs/plans/WAGGLE-MIGRATIONS-v1.2.md` | Sve promene store/config/override/tiers i rollback sa erasure/revocation granicom. Može biti FRD prilog ako je potpuno pokriven. |

Nije obavezno praviti sedam nepovezanih velikih dokumenata. Kraći prilog je prihvatljiv kada zadržava jasno vlasništvo i linkove. Ali nijedna tema ne sme nestati iza „kasnije ćemo detaljno”.

PRD/FRD moraju dobiti stabilne requirement ID-eve. Za svaki značajan red plana zabeležiti: **D/DIR ili C/A/R izvor → PRD zahtev → FRD ugovor → wave → acceptance test → dokaz završetka**. Nazivi fajlova nisu zamena za tu matricu.

### 20.2. Obavezni arhitektonski zapisi odluka

Predložiti ADR za: (1) conversation/work i režime, (2) durable store/phase resume/action idempotency, (3) detach/cancel i raniji R3-008, (4) inline capability/OAuth i raniji held-action/D3 ugovor, (5) RAWDETAIL/context/hook scope i precedence, (6) active override/promotion/rollback, (7) Routines vs TOOLLESS Loops, (8) individualni tiers i KVARK boundary, (9) secondary worker parity, (10) release/privacy profile granice.

ADR ne služi ponovnom odlučivanju da li je Waggle besplatan. Služi sprovođenju te odluke u postojećem kodu. Za svaku staru odluku navesti šta se zamenjuje, zašto, rizik i migration test.

### 20.3. Zaista otvorene stavke

Planer treba da ih predstavi kao kratak decision queue sa preporukom i uticajem; ne zaustavlja sav ostali rad zbog jedne stavke i ne traži ponovo već date odluke.

| Otvoreno | Šta treba predložiti/proveriti | Šta nije ponovo otvoreno |
|---|---|---|
| Public naming/GO | Preview/RC/final naziv i broj nakon upoređivanja stvarnog candidate stanja. | Besplatan individualni Waggle i nova proizvodna teza. |
| Licencna realizacija | Ownership, finalni tekstovi licenci/notices i publication mehanika. | Namena free/OSS core-a. |
| Stvarni pretplatnici | Ovlašćen inventar; migracija samo ako postoje obaveze. | Nema budućeg zasebnog Waggle Team/Enterprise SKU-a. |
| Benchmark budžet | GPU/API/evaluator i ljudski review cap; obim prve formalne studije. | Potreba za izvršenim poštenim dokazom, ne samo runnerom. |
| Tačna model/hardware konfiguracija | Validan model ID/revizija/quant/runtime i prioritetni test uređaji. | Cilj Qwen 3.8 27B-klase ne menja se tiho. |
| Prvi mail/calendar scenario | Ekosistem, scopes, OAuth putanja i korisnička vrednost. | Home + attention smer. |
| Mobile minimum | Kvalifikovani IM scenario ili obrazložena alternativna mrežna putanja. | Nova cloud zavisnost nije prećutno dozvoljena. |
| UI jezik | English-only prvi release ili dodatni obim, uz centralizovane stringove. | Ne vraća se tehnička složenost u onboarding. |
| Pragovi/režimi | Task-level quality, latency, resource i classifier pragovi pre finalnog testa. | Ne sme se lažno završiti neproveren obavezni posao. |

### 20.4. Granica između preporuke i odobrenja

Ovaj dokument potvrđuje da plan treba razraditi u navedenom smeru. On ne odobrava svaki predloženi numerički prag, storage shemu, cloud poziv ili release datum. Planer vraća konkretne ugovore i rizične preostale odluke na pregled, a ne tvrdi da je korisnik već izabrao svaku implementacionu alternativu.

Ne završavati plan generičnim pitanjem „da li želite da krenem”. Završi gotovim paketom i kratkom listom stvarnih blocking odluka. Kodiranje i skupe/eksterne radnje čekaju naredno eksplicitno odobrenje.

## 21. Završna kontrolna lista

- [ ] Eksplicitne odluke korisnika razdvojene su od starih „LOCKED” zapisa i novih predloga.
- [ ] Svaki C1–C22, A1–A29 i svaki od 24 stvarna reda rezova ima razrešenje.
- [ ] Nalazi o kodu imaju imenovani commit i dokaz ili status „neprovereno”.
- [ ] „Postoji modul” nigde nije iskorišćeno kao dokaz E2E funkcije.
- [ ] Free Waggle, KVARK on-prem i individualni BYOK nisu pomešani.
- [ ] Postojeći Home/Workspace/skills/retrieval/runtime su polazište, ne predmet automatskog rewrite-a.
- [ ] Run se kreira pre blokiranja i pinovanja trajnog konteksta.
- [ ] Action identitet je stabilan kroz retry; unknown outcome nije blind resend.
- [ ] Approval, permission i revocation ne zavise od modelovog iskaza.
- [ ] Verify/gate/completion/content-quality nivoi nisu jedan netačan boolean.
- [ ] RAWDETAIL, izvedene činjenice i execution state su jasno razdvojeni.
- [ ] Personal/workspace/organizational scope važi i u trace-u, checkpoint-u i evolution datasetu.
- [ ] Eksterni izvršioci su opcioni i kvalifikovani, a rezultat je vezan za isti Workspace.
- [ ] Učenje/evolution zaista utiče na naredni run, uz active pointer i rollback.
- [ ] Ograničena recipe evolution ima zaseban realan obim, a ne samo etiketu.
- [ ] Ispravan baseline, production putanja i contamination zaštita postoje u benchmark planu.
- [ ] „Matches/beats/frontier-class” uslovljeno je metodologijom i stvarnim rezultatom.
- [ ] Model koji staje na disk nije automatski proglašen upotrebljivim.
- [ ] Kanali i mobile imaju konkretne dozvoljene scenarije, ne samo logotipe.
- [ ] Routines imaju occurrence identitet, misfire politiku i ne šire TOOLLESS ovlašćenja.
- [ ] OSS preuzimanje ima konkretnu licencu, provenance i plan održavanja.
- [ ] Migracija/rollback ne vraća obrisane podatke i opozvane dozvole.
- [ ] G1, G2 i G3 imaju odvojene rezultate, troškove i critical path.
- [ ] Procene su ažurirane za korigovan scope; stari ukupni raspon nije predstavljen kao novi dogovor.
- [ ] Isporučeni su plan i specifikacije; ništa nije tiho implementirano, naplaćeno ili objavljeno.

## 22. Registar izvora

Reference `[S1: C8]`, `[S1: A7]` i `[S1: W2]` upućuju na originalne oznake u dokumentima. Oznake L u ovom dokumentu odgovaraju numerisanim tekstualnim prikazima datim uz priloge u razgovoru; putanje/simboli u auditu moraju se ponovo povezati sa konkretnim code SHA pre implementacije.

**S1 — Detaljan audit (glavni tehnički input).**

Fajl: `procitaj-d-projects-waggle-os-docs-waggl-rustling-milner-agent-ac748482c5af17ddf.md`.

Naslov: *Waggle PRD/FRD v1.1 (2026-09-27): critique, feasibility and plan input*. Ključni opsezi: spot-check L5–L18; C1–C22 L26–L47; A1–A29 L53–L126; rezovi L130–L157; talasi/procene L161–L238; pitanja L242–L271.

SHA-256: `b7f03ff7eb35c7fb1c8e069cb32814a961755306e2217255c0e6229abcda8b08`.

**S2 — Istorijski Teams plan i reuse inventar.**

Fajl: `cryptic-mixing-prism.md`.

Datum u dokumentu: 04.09.2026. Ključni opsezi: skill licence L38; interni inventar L41–L64; stara teza/naplata/cloud L66–L77; predložene isporuke L79–L119. Koristi se kao datirani izvor, ne aktuelna verifikacija tržišta ili licence.

SHA-256: `1757e0dec3a7a3a40ace9d85ed554fd614cf12909a278a12fbee88d91aeb1a05`.

**S3 — Sažetak S1.**

Fajl: `procitaj-d-projects-waggle-os-docs-waggl-rustling-milner.md`.

Ključni opsezi: metoda L11–L18; findings L20–L80; release plan/procene L83–L131; predloženi naredni koraci i testovi L133–L152. Nije nezavisan audit. Raniji `Pasted markdown.md` je isti/srodan sažeti materijal, ne dodatni izvor potvrde.

SHA-256: `95c26d1b35c341aff7efe14a749ba6e33e22facdd58e55b048892811e50b85a2`.

**S4 — Polazni PRD.** Fajl: `Waggle_PRD_v1.1_2026-09-27.docx`.

SHA-256: `69f8d0cc88fd2953c47118d30bc268f4774b882d88c4e1c0a608b2f9defba969`.

**S5 — Polazni FRD.** Fajl: `Waggle_FRD_v1.1_2026-09-27.docx`.

SHA-256: `1b9fae5596983c2980750e8794dd731478306b440667c4b9403e001b672c8dd0`.

**D — Odluke korisnika, razgovor 27.09.2026.** Izvor za §3: free/OSS; desktop/local-first Waggle + BYOK; Workspace/chat/Home/routines; skriveni agents; inline capabilities; Qwen 27B cilj; memory/evolution/durable; benchmark za stvaran marketing; KVARK za team/enterprise i isključivo on-prem; bez Fusion-a u ovom obimu; OSS-first dopuna.

**P — Razrešenja i predloženi ugovori iz naknadnog pregleda.** Izvor za G1/G2/G3, stable action vs attempt, tri nivoa verifikacije, ograničenu recipe evolution putanju, razlikovanje ekvivalencije od neustanovljene razlike i preciziranje dozvola/scope-a. Ta rešenja su predlozi za razradu i dokaz, ne rezultati pokrenutih testova.

---

**Završna instrukcija planeru:** vrati koherentan plan za isti Waggle, ne za stari Waggle Teams i ne za novi framework. Sačuvaj postojeće delove koji stvarno rade, popravi pogrešne veze i statusne tvrdnje, dopuni najmanji potreban execution/context/evolution ugovor i rano izmeri rezultat. Ne gradi sve od nule; ne skraćuj posao tako što ukloniš razlog da proizvod postoji.

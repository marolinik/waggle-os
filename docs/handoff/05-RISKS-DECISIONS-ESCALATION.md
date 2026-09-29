# Waggle v1.2 — rizici, odluke i eskalacija (predaja razvojnom timu)

**Revizija dokumenta: 1.0 · 29.09.2026 · pregledana revizija koda `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`main`, grana paketa `docs/waggle-v1.2-planning`)**

Namena: tech lead, developeri i QA koji od osnivača preuzimaju Waggle. Ovaj dokument ne uvodi nove odluke. Objedinjuje ono što tim mora da zna pre prvog tiketa: otvorene founder odluke, poznate nepoznanice, spoljne kapije, najveće tehničke rizike i ko šta sme da odluči. Brojevi, datumi i ID-evi prepisani su iz [Delivery plana v1.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) (§0, §2, §4.2, §4.3, §5, §6, §6.1), [sažetka za osnivača](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md) i [FRD v1.2](../Waggle_FRD_v1.2_DRAFT.md). Ništa nije ponovo procenjeno. Ako se ovaj dokument i Delivery plan razlikuju, važi Delivery plan.

---

## 0. Pre svega: implementacija NIJE odobrena

- **Kodiranje počinje tek kad osnivač odobri Delivery plan.** Do tada ceo paket nosi status PREDLOG: PRD/FRD v1.2 DRAFT, Delivery plan, G1 → G2 → G3 struktura, ADR-01..10, pragovi i datumi. Nijedan ADR, prag, datum ni G struktura nisu odobreni (sažetak, „Šta je paket”; Delivery §6.1 „Nijedna stavka nije odobrena”).
- Prva founder potvrda na putanji je **RAT-01** (G1 → G2 → G3 struktura i exit kriterijumi §1). Plaćeni receipt run-ovi traže **ODB-01**. Vidi §1.2.
- **Bezbedna implementacija je OBAVEZNA** za svaki PR, agenta i sesiju: [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md) je jedini izvor istine za operativnu da/ne listu, a normativna pravila su u Delivery §0 (DP-0.01..DP-0.16). **Svako „ne” zaustavlja rad.** Taj uslov je upisan i u exit kriterijume svih 13 talasa.
- Founder odluke **D-01..D-18** (brief §3) su zatvorene. Tim ih ne otvara, ne tumači ponovo i ne „privremeno” zaobilazi. Konflikt sa njima se samo beleži i prijavljuje osnivaču informativno (§5.3). Kratak podsetnik je u §5.4.
- **Kome se pitanja šalju od prvog dana:** tech lead, kanal za eskalaciju sa vremenom odgovora i osoba koja dodeljuje DP-0.14 uloge nisu određeni (NEPOZNATO). To su founder stavke pre starta ESK-01..ESK-03 (§5.0). Dok se ne zatvore, sva pitanja idu direktno osnivaču, pisano, putem opisanim u §5.0.
- Repo na baseline-u nije diran: nema commit-a, push-a, taga, merge-a ni release-a. Nisu pokretani E2E, installer, receipt ni benchmark run-ovi. Nije bilo Stripe radnji ni plaćenih API poziva (sažetak, „Šta NIJE urađeno”).

**Oznake statusa** (iste kao u celom paketu): **ODLUKA** (samo D-01..D-18) · **POTVRĐENO NA REVIZIJI** · **NALAZ AUDITA — ZA PROVERU** · **DELIMIČNO/NEPOVEZANO** · **PREDLOG** · **ODLOŽENO** · **NEPOZNATO**. Pravila eskalacije u §5 su **PREDLOG** ovog handoff-a, izvedena iz DP-0.11, DP-0.14 i Delivery §6/§6.1. Osnivač ih još nije ratifikovao.

**ID-evi su lokalni po dokumentu.** `N-01..N-27` (§2) i `R-01..R-16` (§4) važe samo u ovom dokumentu. [03 §7](03-BACKLOG.md) ima sopstveni `N-01..N-08` (03 N-07 = put paketa na integracionu granu, a 05 N-07 = ishod A8 spike-a), a [04 §14](04-CODEBASE-MAP.md) sopstveni `N-1..N-6` (04 N-2 = pinning testovi pre W0-PR10/PR12/PR9, delimično se preklapa sa 05 N-02/N-03). [Dispozicija](../plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md) ima redove `R01..R24` bez crtice (Disposition R12 = BYO OAuth, a 05 R-12 = kasna DQ-02). Van dokumenta koji ga definiše, u PR opisu i u eskalaciji ID se uvek piše sa dokumentom: „05 N-07”, „05 R-12”, „03 N-07”, „04 N-2”, „Disposition R12”. Goli ID važi samo unutar svog dokumenta.
Napomena verifikacije (29.09.2026, read-only grep `handoff/`): 00 §6 (h) i 01 §3.2 već citiraju N-07 sa dokumentom („N-07 u 03 §7”, „03 §7 N-07”), pa pokazuju na 03, ne na 05. Van 05 niko ne citira 05 `N-nn`/`R-nn`.
Napomena verifikacije (29.09.2026): umesto novih prefiksa po registru (npr. `BL-N`/`RSK-N`/`MAP-N`) paket koristi oznaku dokumenta ispred lokalnog ID-a. To je oblik koji 00 §6 (h) i 01 §3.2 već koriste, pa se ti redovi ne menjaju. Preimenovanje 41 ID-a (27 + 8 + 6) u 05/03/04 ne bi dodalo informaciju. Isto pravilo je u jednoj rečenici upisano i u 03 §7 i 04 §14.

---

## 1. Red odluka (owner za sve = osnivač)

### 1.1 Decision queue DQ-01..DQ-09 (Delivery §6; preporuke su PREDLOG)

Autoritativni tekst je tabela u Delivery §6. PRD v1.2 §17 `O-1..O-9` nosi istu numeraciju (O-n = DQ-0n). Rok „najkasnije” znači radne dane (rd) od starta navedene kontrolne tačke. Posle tog roka svaki dan čekanja pomera kontrolnu tačku 1:1. Vreme čekanja nije uračunato u raspone (NEPOZNATO).

| ID | Pitanje | Preporuka (PREDLOG) | Uticaj ako se ne odluči | Blokira tikete | Najkasnije | Šta NIJE ponovo otvoreno |
|---|---|---|---|---|---|---|
| DQ-01 | Public naming/GO | Naziv i broj verzije tek na F3 poređenju stvarnog kandidata. Do tada „controlled preview” za G1/G2 build-ove. Drift installer `0.2.0` (`tauri.conf.json:4`) i `app/package.json` `0.1.0` (F-UXM-01) poravnati jednim `chore` PR-om kad se izabere broj. Posle F3 receipts sledi **founder-gated merge** `integration/waggle-next` → `main` pre taga. | Bez uticaja na G1/G2. Blokira F3 tag i www copy. | F3 tag, `chore` PR za verziju, www copy, merge u `main` | na F3 | Besplatan individualni Waggle i nova proizvodna teza |
| DQ-02 | Licencna realizacija | Jedna odluka o ownership-u i finalni tekstovi: `optimizer`/`weaver` LICENSE naspram `package.json` MIT, 3 hive-mind NOTICE fajla (proprietary lista + `EXTRACTION.md`), 9 manifesta bez `license`, `hive-mind-core` Apache + `private`. Potvrditi ili pomeriti OSS-excluded granicu za evolution/traces/signals. Uskladiti „private” u CLAUDE.md/AGENTS.md/README sa live stanjem. | Blokira OSS-PR3/4/5, W8-PR5, F3 notices i attestation semantiku. Ne blokira G1 inventar i lint (OSS-PR1/PR2 u report modu). Kasna DQ-02 (posle starta F3) dodaje lanac OSS-PR3 → W8-PR5 i ponovljen F3. | OSS-PR3, OSS-PR4, OSS-PR5 (uklj. ispravku `EXTRACTION.md` u NOTICE), W8-PR5, F3 notices; rečenice o vidljivosti izuzete iz W0-PR15 (`CLAUDE.md:84`, `AGENTS.md:68`, `README.md:110,118`) | ≈ 13 rd od starta G3 | Namena free/OSS core-a (D-01) |
| DQ-03 | Stvarni pretplatnici | Ovlašćen **read-only** Stripe inventar pre bilo kakve WB-PR5 migracije. Ako nema obaveza: `LEGACY_TIER_MAP` obrazac (PRO→FREE presedan `09b199aa`) bez customer plana. Ako obaveze postoje: poseban komunikacioni i finansijski plan. | Blokira WB-PR5/6 i www pricing. Ne blokira KVARK connect (WB-PR2/3). | WB-PR5, WB-PR6, www pricing | ≈ 13 rd od starta G3 | Nema Waggle Team/Enterprise SKU-a (D-02) |
| DQ-04 | Benchmark budžet | Cap za: LoCoMo same-judge rerun (**obavezan merge gate za W2-PR3**), B2-PR0 ruler + B2, B3, GEPA real-provider fidelity run, GPU vreme i ljudski review. Presedan GAIA2: prekoračenje 9–31×. **Ne** pokriva plaćene P/R/A receipt run-ove (to je ODB-01). | Blokira W2-PR3 merge, start B2 (G2 exit (h)) i B3. | W2-PR3 (merge), B2-PR0, B2, B3, GEPA fidelity run | ≈ 16 rd od starta G2 | Potreba za izvršenim poštenim dokazom (D-18) |
| DQ-05 | Tačna model/hardware konfiguracija | Target `Qwen/Qwen3.8-27B` @ HF sha `1d4bf0f2…`, Ollama `qwen3.8:27b` Q4_K_M kao primarni quant, repin managed Ollama ≥0.32.15 (posle pull/generate/tools testa). Prioritetni test uređaji: 24 GB NVIDIA, 16 GB (offload), CPU-only, opciono AMD/Intel posle WMI detekcije. Kontrolni baseline Qwen3.6-35B-A3B **lokalno** (ne DashScope). | Blokira W6-PR6, B2 i hardware ladder. | W6-PR6, W6-PR7 (ladder), B2 | ≈ 20 rd od starta G2 | Cilj Qwen 3.8 27B-klase (D-15) |
| DQ-06 | Prvi mail/calendar scenario | **Microsoft Graph (Outlook + Calendar)** kao prvi ekosistem (delegated scopes bez admin consent-a; publisher verification je besplatna — NALAZ AUDITA — ZA PROVERU, live 27.09.2026) ili Gmail sa BYO OAuth client pilotom. api_key konektor (Notion/Linear) služi samo kao tehnički dokaz za AT-11. | Blokira start W7 (G3). | W7-PR1..W7-PR7 | ≈ 4.5 rd od starta G3 | Home + attention smer (D-07, DIR-18) |
| DQ-07 | Mobile minimum | Telegram Bot API kao prvi i jedini G3 kanal, sa token-vezanim approve/deny (W8-PR3) i status push/forward (W8-PR4). Discord i Slack su roadmap posle G3. Bez PWA/native/relay u G3. | Blokira W8-PR3/4. Drugi kanal ili više kanala → W8-PR3/PR4 i G3 procena se preračunavaju. | W8-PR3, W8-PR4 | ≈ 12 rd od starta G3 | Nova cloud zavisnost nije prećutno dozvoljena (D-04) |
| DQ-08 | UI jezik | English-only prvi release, uz centralizovane nove stringove (obrazac `activity-labels.ts`). i18n framework tek posle. | Blokira finalizaciju copy lint allowlist-e u W5-PR4. | W5-PR4 | ≈ 13 rd od starta G3 | Tehnička složenost se ne vraća u onboarding |
| DQ-09 | Pragovi/režimi | Pre B3/F2 zaključati: latency budžet po task shape-u (meri se u W3), quality/precision pragove (AT-21/AT-24 iz baseline-a), classifier threshold, default režim za chat (`conversation`=normal; detektovan `work`=normal work; strict opt-in/benchmark) i CONDITIONAL politiku po recipe-u. | Blokira default u W3-PR2 i B3 pre-registration. | W3-PR2 (default), B3-PR1 | kontinuirano, pre svakog zaključanog testa | Neproveren obavezni posao se ne sme lažno završiti (DIR-03/07/08) |

**Redosled (Delivery §6, PREDLOG):** DQ-04 i DQ-05 pre G2. DQ-02, DQ-03, DQ-06, DQ-07 i DQ-08 pre starta G3, jer su pretpostavka G3 raspona. DQ-01 na F3. DQ-09 kontinuirano. Nijedna DQ stavka ne zaustavlja W0 ni razvoj W1-PR1/PR2.

**Pod-liste koje NISU founder queue** (drugi prefiksi, ne redefinišu `DQ-nn`): `MDQ-01..12` ([migracije](../plans/WAGGLE-MIGRATIONS-v1.2.md) §7; jedini alias MDQ-09 = DQ-03); Benchmark `Q-00..Q-10` ([protokol](../plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md) §15; Q-00/Q-01/Q-02 → DQ-04, Q-08 → DQ-05); Build-vs-Borrow `Q1..Q6` ([BvB](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.md) §6; Q2 → DQ-04, Q3 → DQ-06, Q4 → DQ-02, Q5 → DQ-05, Q1/Q6 su inženjerske).

### 1.2 Ratifikacije i odobrenja koja blokiraju rad (Delivery §6.1)

Ovo nisu nove proizvodne odluke. Osnivač potvrđuje PREDLOG ugovore iz ADR nacrta (zaglavlja „Ratifikuje: founder — čeka”) i plana. Review ADR nacrta u PR-u samo priprema founder ratifikaciju i ne zamenjuje je. Indeks nacrta: [ADR-INDEX.md](../decisions/ADR-INDEX.md).

| ID | Šta se ratifikuje / odobrava | Mora pre | Uticaj ako čeka |
|---|---|---|---|
| RAT-01 | G1 → G2 → G3 struktura i exit kriterijumi (Delivery §1) | zatvaranja G1 (F1) i starta G2 kao plana | W0 može da teče. Bez RAT-01 G1 zaključak nije founder-prihvaćen. |
| RAT-02 | [ADR-02](../decisions/2026-09-27-ADR-02-durable-store-phase-resume-action-idempotency.md) (uklj. ishod W1-PR1 spike-a u O8) i [ADR-03](../decisions/2026-09-27-ADR-03-detach-cancel-supersedes-r3-008.md) | W1-PR2 merge | **Na G2 kritičnoj putanji:** W1-PR2..PR9 stoje, a G2/G3 se pomeraju 1:1. Merge pre ratifikacije rizikuje revert 4–5 AI dana. |
| RAT-03 | [ADR-01](../decisions/2026-09-27-ADR-01-conversation-work-modes.md) (conversation/work × normal/strict/benchmark) | W3-PR2 merge | **Na G2 kritičnoj putanji:** pomera G2/G3 1:1. |
| RAT-04 | [ADR-05](../decisions/2026-09-27-ADR-05-rawdetail-context-hook-precedence.md) (RAWDETAIL/context/hook precedence) | W2-PR1 merge | Posredno na kritičnoj putanji. W0-PR10/PR11/PR18 **ne čekaju**. Ako ratifikacija izmeni O3/O4, ti PR-ovi se pojedinačno revertuju. |
| RAT-05 | [ADR-06](../decisions/2026-09-27-ADR-06-active-override-promotion-rollback.md) (active override/promotion/rollback) | W3e-PR1 merge | W3e lanac i P receipt pre F2 |
| RAT-06 | [ADR-07](../decisions/2026-09-27-ADR-07-routines-vs-toolless-loops.md) (Routines vs TOOLLESS; O2–O4 bez timezone polja) | W1-PR11 merge | Rutine/occurrence (AT-23 G2 deo), W5-PR3 |
| RAT-07 | [ADR-04](../decisions/2026-09-27-ADR-04-inline-capability-oauth.md) (inline capability/OAuth) | W4-PR3 merge | W4-PR3..PR7 (G2 exit (f)) |
| RAT-08 | [ADR-08](../decisions/2026-09-27-ADR-08-individual-tiers-kvark-boundary.md) i [ADR-09](../decisions/2026-09-27-ADR-09-secondary-worker-parity.md) | WB-PR3 merge (WB-PR2 je samo RED test i ne čeka) | KVARK granica G3 (f), WB-PR4/PR6 |
| RAT-09 | [ADR-10](../decisions/2026-09-27-ADR-10-release-privacy-profiles.md), uklj. O4 (c) „da li se `VITE_POSTHOG_KEY` peče u javni build” | W8-PR6 merge; O4 (c) pre F3 | Release checklist i profili F3. W0-PR17 (a)/(b) ne čeka. |
| ODB-01 | Plaćeni receipt run-ovi po freeze-u: P seal (30 slotova, live provider), R qualification, A canaries na realnim Claude Code/Codex/Hermes nalozima. Obuhvata naloge i budžet, uz cap zadat pre starta. | F1 (P, R), F2 i F3 (P, R, A) | Bez odobrenja freeze nema P/R/A receipt |
| ODB-02 | Obim W3e-PR9 (bounded recipe evolution). „Da” → W3e-PR9a..e u G3 (8–14 / 4–7 eng-dana) + T_evo. „Ne” → otpada G3 tvrdnja „evoluira odobrene varijante research/document postupka” (PRD-10-13). | pre starta G3 (za varijantu „W3e-PR9 u G2”: pre W3-PR3 merge-a) | Bez odobrenja W3e-PR9 ne počinje, a ostatak W3e i G3 teče |

---

## 2. NEPOZNATO / ZA PROVERU stavke koje blokiraju ili mogu promeniti tikete

ID-evi `N-nn` su lokalni za ovaj dokument; van njega se pišu kao „05 N-nn” (§0, „ID-evi su lokalni po dokumentu”). Za svaku stavku naveden je **prvi tiket koji je mora razrešiti** i način. Tim ne sme da je „reši” pretpostavkom u kodu. Rezultat se upisuje u PR opis (polje statusa tvrdnje, checklist „PR opis”) i, gde je navedeno, u receipt ili benchmark manifest.

### 2.1 Stavke vezane za kod i testove

| # | Stavka | Status | Prvi tiket | Kako se razrešava | Šta se menja ako ispadne drugačije |
|---|---|---|---|---|---|
| N-01 | `getDue` poredi ISO `next_run_at` (sa `T`) sa `datetime('now')`, pa rutina možda nikad ne dospe (F-DUR-10) | NALAZ AUDITA — ZA PROVERU (SQL probe izvršen, `CronStore` nije) | W0-PR14 | **RED test:** `store.create({cronExpr:'* * * * *'})`, pa posle >60 s `getDue()`. Popravka samo ako RED padne. | Ako hipoteza ne važi, PR14 ostaje samo test (0.5–0.5 dana). DST ponašanje ostaje NEPOZNATO do W1-PR11 (misfire/DST test). |
| N-02 | Da li `session-start.test.ts`/`handlers-core.test.ts` pinuju tačan string hook konteksta | ZA PROVERU | W0-PR10 | Pročitati testove pre izmene. Ako pinuju, prepisuju se u istom PR-u, sa obrazloženjem (DP-0.15). | Veći broj prepisanih testova u W0-PR10 |
| N-03 | Sadržaj `p7-a6-approval-gating.test.tsx` — razrešeno 29.09.2026: test ne pinuje tier gate (samo `ApprovalModal` sa `riskLevel:'critical'` i `canAlwaysAllow(approvalClass)`). Approvals/cost gate pinuju `p1a-routes.test.ts:232-239` i `tier-enforcement-matrix.test.ts:53,56,131-180` | POTVRĐENO NA REVIZIJI (read-only, `git show 2af0904d:<fajl>`) | W0-PR12 | Ta dva testa se prepisuju u W0-PR12, u istom PR-u (DP-0.15; 03 W0-PR12 „RED prvo”). | Ako se pri implementaciji nađe još neki pinning test, prepisuje se u istom PR-u |
| N-04 | Tačni fajlovi za filter `metadata.recallExcluded` u recall putevima; putanja golden fixture-a | NEPOZNATO do dizajna | W0-PR18; W0-PR19 | Dizajn u PR-u. RED: legacy fixture napravljen kodom `2af0904d` (MIG-00.7). | Procena W0-PR18 može da ode ka gornjoj granici raspona. |
| N-05 | Zvanične cene modela (Opus 5/25, Sonnet 5 → 2/10, Haiku 3.5 → 0.80/4 uz oznaku retired) | Stanje repoa POTVRĐENO NA REVIZIJI (F-REL-06); ciljne cene NALAZ AUDITA — ZA PROVERU (live) | W0-PR13 | **Eksterna provera** zvanične cene na dan PR-a, pa komentar sa URL-om i datumom (provenance). | Drugi brojevi u `DEFAULT_MODEL_PRICING`. Budžeti se ponašaju drugačije (R receipt). |
| N-06 | Da li je `VITE_POSTHOG_KEY` upečen u kandidat (u workflow-ima i `app/package.json` grep = 0, pa zavisi od `apps/web/.env.local` na build hostu) | NEPOZNATO | W0-PR17 (checklist stavka), provera pre F1 | Grep build `dist`-a pre F1/F2 certify-a. Rezultat ide u receipt manifest (DP-0.10). | Ako je ključ upečen, build ne ide u F1 dok se ključ ne ukloni. |
| N-07 | Ishod A8 spike-a: ADAPT Reflow (`danfry1/reflow-ts` MIT v0.7.0) ili minimalni BUILD nad better-sqlite3. Tvrdnje o eksternim durable kandidatima. | NALAZ AUDITA — ZA PROVERU (live 27.09.2026) | W1-PR1 (time-boxed) | Kriterijum: BvB §3 T1–T3 + T9 nad throwaway prototipom obe grane. Ishod se upisuje u ADR-02 O8 i ide na RAT-02. | Ako istekne time-box bez jasnog ishoda, delimični rezultati idu u RAT-02 i spike se ne produžava tiho. Ako izabrana grana kasnije padne T4–T8/T10, prelazak na drugu granu je trošak van raspona (NEPOZNATO). |
| N-08 | Da li Claude Code `--safe-mode` suzbija SessionStart hookove (`tool-detection.ts:124-125`) | NEPOZNATO | W2-PR6 | Test sa fixture nalogom na izolovanom `HOME`/`USERPROFILE` (DP-0.08) | Menja se način external handoff-a i zaštite od duple injekcije (F-HM-08). |
| N-09 | LoCoMo 86.49% kao „SOTA” i poređenje sa Memori/Mem0 | Broj je pinovan i offline proverljiv (`recount.mjs`, EXPECT 1332/1540). Status „SOTA” je NALAZ AUDITA — ZA PROVERU. | W2-PR3 (merge gate) | LoCoMo same-judge rerun, samo uz DQ-04 budžet | Regresija blokira merge W2-PR3. Poruka o SOTA se ne koristi dok se ne proveri. |
| N-10 | Ko u produkciji zove `markSurfaced` | NEPOZNATO | W3e-PR7 | Grep + test pre izmene learning puta | Ako niko ne zove, signali se gomilaju u promptu i PR dobija dodatnu popravku. |
| N-11 | Da li postoji test „nema vault vrednosti u system promptu/trace-u” | NEPOZNATO | W4-PR7 | Grep. Ako testa nema, piše se kao RED (AT-19). | Više posla u W4-PR7 |
| N-12 | Praznine u `THREAT_MODEL.md` (inline install, MCP binary, egress profil, PostHog) | NALAZ AUDITA — ZA PROVERU (sopstvena read-only provera van phase-A) | W4-PR7 | Pregled dokumenta, pa dopuna. Bez novog threat-model ADR-a. | — |
| N-13 | Da li opoziv (revoke) preživi restart; test za revoke NIJE nađen (A15) | POTVRĐENO da test nedostaje | W4-PR6 | RED test revoke → restart (AT-12) | Popravka ulazi u isti PR. Trošak iznad raspona je NEPOZNATO. |
| N-14 | Da li managed Ollama pin `0.32.3` (`managed-ollama-runtime.ts:28`) učitava `qwen3.8:27b` na Windows GGML | NEPOZNATO (pin POTVRĐENO NA REVIZIJI) | W6-PR6 (posle DQ-05) | Online potvrda, zatim pull/generate/tools test. Verovatno repin ≥0.32.15 uz novi I receipt. | Repin menja installer (I receipt) i managed model proveru. |
| N-15 | Zvanični VRAM/RAM po quantu; Qwen 3.8 tool parser | NEPOZNATO | W6-PR3 (tool round-trip probe); W6-PR7 (ladder) | **Merenje** na ≥3 profila; test native tools na Ollama (`qwen3_xml` na vLLM je PREDLOG) | Prioritetni uređaji (DQ-05) i onboarding preporuke |
| N-16 | Da li su stari Qwen3.6-35B-A3B rezultati lokalni ili preko DashScope | ZA PROVERU | B2 (izbor baseline-a, pre B2 dev run-a) | Pregled manifesta `benchmarks/gaia2/PILLAR1-QWEN36-N160-RESULT-2026-05-27.md` | Stari rezultati ne smeju da budu kontrolni baseline (DQ-05 traži lokalni). |
| N-17 | Alat za merenje egress-a po profilu | NEPOZNATO u repou — ZA PROVERU pre W8 | W8-PR6 (ADR-10 review) | Inventar i izbor alata po BvB zapisu | Bez alata tvrdnje ADR-10 profila (offline → 0 neodobrenih odredišta) ostaju nedokazane. |
| N-18 | KVARK adapter varijanta za `team-sync` (ADR-08-K9) | NEPOZNATO; van G3 raspona | WB-PR6 | Odluka posle RAT-08 i DQ-03 | Ako se izabere adapter, obim izlazi iz G3. |
| N-19 | Deljeni read-only model cache za bench reset (alternativa) | NEPOZNATO; nije u broju | B2-PR1 | Inženjerski izbor Benchmark owner-a | Ako se izabere, dodaje se u B2-PR1 i pomera G2 1:1. |
| N-28 | Checklist „Env izolacija” i DP-0.08 („Time su izolovani …”): izolacija samo kroz `WAGGLE_DATA_DIR` nije potpuna. `packages/server/src/local/routes/documents.ts:37` i `pins.ts:32` uvek pišu pod `os.homedir()/.waggle` ([01 §9.5](01-ONBOARDING-DEV-ENV.md)). | Curenja POTVRĐENO NA REVIZIJI; kako plan i checklist to zatvaraju: NEPOZNATO | Nema reda u planu; mora biti rešeno pre prvog run-a dev sidecar-a ili E2E-a | Privremeno scratch `USERPROFILE`/`HOME` za terminal dev sidecar-a i E2E run-a po [01 §9.3](01-ONBOARDING-DEV-ENV.md) (korak 4) i §9.4 (PREDLOG). Odluka: tech lead i osnivač, po [02 §10](02-WORKING-AGREEMENT.md) (v. R-15). | Ako se curenja popravljaju u kodu, to je obim van plana (novi PR ID doc-only PR-om po 02 §10). Do odluke nema dev sidecar-a ni E2E-a na mašini sa instaliranim Waggle-om (01 §9.5). |

### 2.2 Stavke kapaciteta, trajanja i okruženja (menjaju kalendar, ne sadržaj tiketa)

| # | Stavka | Status | Kada i kako se meri | Uticaj |
|---|---|---|---|---|
| N-20 | AI-orkestriran throughput (odnos ≈0.48× klasičnih dana je S1 procena) | NEPOZNATO | **F1 retrospektiva** (kraj G1): izmereni eng-dani po PR-u prema §4.1.1 | Dok se ne izmeri, stvarna nesigurnost je G2 11–28 i G3 16–45 nedelja (sažetak, „Osetljivost”). |
| N-21 | Founder review kapacitet (~3 PR/dan, S1) | NEPOZNATO | Tokom G1: ~26 PR-a ≈ 8.7 rd serijskog review-a | G1 floor je review-bound, a G2 ima ≈66–68 PR-a. |
| N-22 | CI wall-clock po PR-u (45–90 min po S1) | NEPOZNATO | Meri se na prvim W0 PR-ovima | Deo „CI wall-clock/rework 2–4” u G1 kalendaru |
| N-23 | Trajanje receipt ciklusa po freeze-u | NEPOZNATO do F1 merenja | F1 (planira se 3–5 rd, ne ispod S1 „3–4 dana”); F2 4–7 rd; F3 5–8 rd | Pomera G1/G2/G3 |
| N-24 | Test mašina: namenska VM ili disposable Windows nalog bez instaliranog Waggle-a (za I, C i packaged migracije) | NEPOZNATO (trajanje nabavke) | Pre F1 | Bez nje F1 ne može da počne (DP-0.11, Delivery §5 „Mesto izvršavanja”). |
| N-25 | B3 wall-clock 10–20 rd; B2 dev run 1–3 rd; re-run 0–2 rd; validation run 1–3 rd; B2-PR0 ruler 0.5–1 rd; T_evo 1–8 rd | PREDLOG placeholderi, NEPOZNATO | Menjaju se merenjem iz B2 dev run-a (formule u Delivery §4.3) | G2 i G3 kalendar |
| N-26 | Kalendar pauza Egzakte (pretpostavljeno zatvaranje 24–31.12) | NEPOZNATO | Tech lead potvrđuje sa osnivačem pre G1 | Svaka granica posle 24.12.2026 pomera se za +1–3 nedelje. |
| N-27 | Labeled eval set za AT-24 (~8–16 sati labelinga) | Veličina NEPOZNATO; ljudski rad, ne kod | W7-PR4 | Precision prag iz DQ-09 |

---

## 3. Spoljne kapije (owner = osnivač; tim priprema dokaz)

DP-0.14: osnivač odlučuje samo o decision queue-u i o spoljnim kapijama. Release owner i OSS/License owner pripremaju tehnički deo i dokaz statusa. **Trajanje nijedne spoljne kapije nije poznato i nema dokaz u repou (F-REL-11).** Zato je javni datum G3 NEPOZNATO: Authenticode, Deep Security i CASA (ako se ide na Gmail) dodaju se na kraj plana.

| Kapija | Trenutno poznato stanje | Owner | Priprema tima | Kada je potrebna | Trajanje |
|---|---|---|---|---|---|
| **Javno poverljiv Authenticode** | POTVRĐENO NA REVIZIJI: na `2af0904d` ne postoji evidencija o potpisanom artefaktu. Poslednji lokalno certifikovan installer ima Authenticode `NotSigned` (`docs/production-readiness/09-LAUNCH_RECOMMENDATION.md:35`). Potpisivanje je samo hosted, kroz `release.yml` (`sign-windows`, Azure Artifact Signing OIDC sa federated credential-om vezanim za tačan tag). Da li je credential ispravno podešen je NEPOZNATO (`release-oss.md` F-REL-11). Lokalne signing skripte se ne koriste za release artefakt. | Osnivač | Release owner: W8-PR6 release checklist (bez pokretanja); ništa se ne potpisuje lokalno | F3 (G3 (h)); javni GO blocker 1 | NEPOZNATO |
| **Sealed managed Deep Security** (bez Critical/High) | POTVRĐENO NA REVIZIJI: `10-SECURITY_REVIEW_2026-08-11.md:64` kaže „No sealed managed Codex Security report exists”. U repou nema security workflow-a, a code scanning je `not-configured`. Da li postoji spoljni managed pipeline je NEPOZNATO. | Osnivač | Security owner / Release owner: nula nerazrešenih Critical/High na kandidatu | F3; javni GO blocker 2 | NEPOZNATO |
| **Google OAuth verifikacija + CASA** (samo ako DQ-06 izabere Gmail) | NALAZ AUDITA — ZA PROVERU (live 27.09.2026): Gmail restricted scopes traže OAuth app verifikaciju („can potentially take several weeks”) i godišnji security assessment. Izuzeće za čisto lokalnu desktop aplikaciju nije eksplicitno. Unverified app ima cap od 100 novih korisnika. | Osnivač | Attention owner: W7-PR1 kanal profil i evidence card. BYO OAuth client pilot ili api_key dokaz kao alternativa (Disposition R12). | Pre javnog W7 scenarija (G3 (b)) | NEPOZNATO |
| **Microsoft Graph publisher verification** (ako DQ-06 izabere Graph) | NALAZ AUDITA — ZA PROVERU: besplatna, ali traži verifikovan Microsoft AI Cloud Partner Program nalog i publisher domain. Personal MSA nalozi su ZA PROVERU. | Osnivač | Attention owner: test sa MSA nalogom (W7-PR1) | G3 (b) | NEPOZNATO |
| **Licenca i OSS objava** (DQ-02) | POTVRĐENO NA REVIZIJI: root `LICENSE` je MIT (`package.json:51` `"license": "MIT"`), a u fajlovima postoje protivrečnosti (`optimizer`/`weaver` LICENSE „proprietary and confidential” uz MIT u manifestu, 3 hive-mind NOTICE fajla, 9 manifesta bez `license`). Nema SBOM-a ni `THIRD_PARTY_NOTICES` (F-REL-04). NALAZ AUDITA — ZA PROVERU: repo je po `gh api` 27.09.2026 **public**, a `CLAUDE.md:84` i `AGENTS.md:68` kažu „remains private”. `oss-drift-check.mjs` (read-only): exit 1, 22 known blockers, 3 unreviewed, 0 forbidden. Hive Mind mirror se objavljuje samo kurirani forward-port-om, nikad raw subtree push-om. | Osnivač (DQ-02) | OSS/License owner: OSS-PR1/PR2 inventar i lint u report modu (G1). OSS-PR3..PR5 tek posle DQ-02. Memory owner (maintainer): drift baseline review. | Najkasnije ≈ 13 rd od starta G3; F3 notices | NEPOZNATO |
| **Receipts I/R/P/A/C** | POTVRĐENO NA REVIZIJI: nijedan receipt sa `e4bf403e`/`b07a6173`/`c4e6a515` ne pokriva `2af0904d` (F-REL-02: 355 fajlova, 116 runtime izvora, 41 na pokrivenim površinama). I: `certify-windows-installer.ps1` je povezan u `release.yml`. R: `scripts/qualify-smart-router.ts` postoji, ali je **nepovezan**. A: `scripts/test-windows-official-auth-canaries.ps1` postoji, ali je **nepovezan**. P: `npm run persona:seal`. C: **ne postoji** (F-REL-03). | Osnivač (ODB-01 za plaćene run-ove; odobrenje naloga) | Release owner: W8-PR1 entry-pointi (G1, pre F1), W8-PR2 crash-injection skript (G2, pre F2), W8-PR5 notices/SBOM asserti (G3) | F1: I + P + R · F2: R + P + A + C + I · F3: I + R + P + A + C + Authenticode + Deep Security + notices/SBOM · F4 kontingencija | F1 3–5 rd, F2 4–7 rd, F3 5–8 rd (planirano; stvarno NEPOZNATO do F1) |
| **GitHub repo/org podešavanja** (ADR-10-O8) | NALAZ AUDITA — ZA PROVERU (live 27.09.2026): `production` environment bez protection rules, nema branch protection, secret scanning i push protection su isključeni na javnom repou, `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` nije definisan. POTVRĐENO NA REVIZIJI: `release.yml:12-15` se okida na **bilo koji** `v*` tag, a u repou već postoji 10 istorijskih `v*` tagova. | Osnivač (owner radnje, ne PR) | Release owner: stavke u W8-PR6 release checklist-i | Pre bilo kog javnog taga | NEPOZNATO |
| **Stripe inventar** (DQ-03) | NEPOZNATO: Stripe nije pozivan. Stripe kod je samo za TEAMS; `tierFromPriceId` mapira PRO→FREE. | Osnivač | Boundary owner: WB-PR5 tek posle DQ-03 | Najkasnije ≈ 13 rd od starta G3 | NEPOZNATO |

Javni GO traži još i zelene protected release-tag provere sa zapisanim heševima artefakta (`09-LAUNCH_RECOMMENDATION.md`, „Public GO blockers”). Interni certify nikad nije javni potpis. Zeleni private draft PR i controlled-pilot installer nisu public GO (CLAUDE.md §1).

---

## 4. Najveći tehnički rizici (iz Delivery §2, §4.3, §5)

Mitigacija i rollback su PREDLOG iz Delivery plana. Tim ih ne slabi bez eskalacije (§5). ID-evi `R-nn` su lokalni za ovaj dokument i nisu redovi `Rnn` Dispozicije; van njega se pišu kao „05 R-nn” (§0).

| # | Rizik | Gde | Mitigacija | Rollback |
|---|---|---|---|---|
| R-01 | **VISOK:** W1 dira `agent-loop.ts` i chat hot path. Postoji rizik side-effect replay-a i preokreta ADR-a (R3-008, „never mid-run suspend/resume”). | W1 (G2) | W1-PR1 spike pre koda; W1-PR4 iza feature flag-a (`work` režim opt-in dok AT-07/10 ne prođu); dnevna integracija | Store je novi fajl. `agent-runs.json` ostaje read-compatible dok migracija nije `complete`. Revert W1-PR4..PR9 vraća `run_harness` in-memory put. Migracija `execution_traces` ima downgrade (`gate_passed` → `pending` + tag; nikad `success`). |
| R-02 | Čekanje na RAT-02 (pre W1-PR2) i RAT-03 (pre W3-PR2) je na G2 kritičnoj putanji i nije uračunato u raspone. | G2 | Razvoj W1-PR2 teče u grani paralelno, a merge čeka ratifikaciju. Tech lead unapred najavljuje osnivaču datum pripremljenog nacrta. | Merge pre ratifikacije je zabranjen, jer izmena O8 revertuje 4–5 AI dana. |
| R-03 | W0 quick fixovi menjaju chat ponašanje (D3 će se okidati na turnu koji ima samo `run_harness`). F-HARN-02/03 su u produkciji nevidljivi dok F-HARN-01 i F-HARN-08 ne prođu. Redefinicija fleet policy gate-a (F-HM-05) je jedini W0 PR sa dizajnerskom odlukom. | W0 (G1) | Redosled W0-PR1 → PR8 → PR2/PR3; RED → GREEN; pinning testovi se prepisuju u istom PR-u | Svaki PR se revertuje pojedinačno. Oznaka W0-PR18 je Klasa A. Revert koda vraća vidljivost leak-a u recall-u (regresija izolacije, ne gubitak podataka), što se navodi u receipt-u. |
| R-04 | Migracije podataka: restore `personal.mind` iz snapshot-a **nije testirana putanja u G1** (`personal.mind` nosi i `pending_actions`, pa restore može da vrati `executed` u `approved`). Revocation ledger ne postoji do W1-PR15 (GDPR-H-05). | W0-PR6, W0-PR18 (G1); G2 apply-i | Samo na kopijama izolovanog dataDir-a, uz snapshot + `manifest.json`, dry-run i idempotenciju (DP-0.09). G1 testira samo Klasu A nad golden fixture-om W0-PR19. Klasa B tek od W1-PR15. | U G1 samo uklanjanje oznake ili taga po sentinelu. Restore iz snapshot-a samo uz eksplicitno founder odobrenje. Rollback nikad ne oživljava obrisane ili opozvane podatke (DIR-21). |
| R-05 | LoCoMo regresija; dupla injekcija u eksternim alatima; promene u `hive-mind-core` nose dužnost OSS porta. | W2 (G2) | LoCoMo same-judge gate pre merge-a W2-PR3 (DQ-04); `oss-drift-check.mjs` pre svakog OSS release-a | Fasada je aditivna, a render promena u W2-PR3 se revertuje bez podataka. |
| R-06 | Pogrešna klasifikacija conversation/work (pozdrav ode u research workflow) povećava latency. τ² Python alat ne sme u paket (Windows Solo ugovor). | W3 (G2) | Recall/compose testovi; pragovi DQ-09; DIR-22: adapter ne koristi bolji zaseban harness | Router je iza flag-a, recipe registry je aditivan, a benchmark adapter je dev alat. |
| R-07 | Privatnost (tragovi ka cloud judge-u) i compute. KVARK profil tvrdi „on-prem” dok evolution/judge ide Anthropic-u (ADR-10-R7). | W3e (G2/G3) | Lokalni judge je default; cloud judge samo uz per-run consent (ADR-06 O8); u P-KVARK evolution isključen do AT-26 | Rollback ruta je deo isporuke, a migracija ima downgrade. |
| R-08 | Chat hot path i persona prompt-budget testovi. OAuth sa Waggle-owned client-om traži eksterni CASA. | W4 (G2/G3) | api_key dokaz i BYO-client pilot (Disposition R12); PKCE i state vezan za request (AT-11) | Fasada je aditivna; OAuth promene ne menjaju vault format. |
| R-09 | Stvarni hardware matrix i multi-GB preuzimanja. Qwen 3.8 tool parser zvanično nepoznat. | W6 (G2/G3) | Merenje ladder-a na ≥3 profila; repin tek posle online potvrde (N-14) | Pin rollback postoji (`OLLAMA_ROLLBACK_VERSION='0.32.0'`); readiness promena je UI/probe. |
| R-10 | CASA/OAuth verifikacija (nedelje, eksterno); precision klasifikatora; privatnost. | W7 (G3) | DQ-06 preporuka (Graph); labeled holdout (AT-24) | WorkItem store je nov; reset sync cursor-a znači ponovni fetch bez duplih WorkItem-a (dedup). |
| R-11 | Spoljne kapije se ne kompresuju; slučajan `v*` tag pokreće `release.yml`. | W8 (G3) | Nikad `git tag v*` ni push taga (DP-0.12). `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` ostaje nedefinisan. | IM iza feature flag-a; receipt skripte su alati. |
| R-12 | Kasna DQ-02 menja installer SHA (notices) posle starta F3. | OSS / F3 | DQ-02 najkasnije ≈ 13 rd od starta G3 | Lanac OSS-PR3 → W8-PR5 (3.5–4 rd) + ponovljen F3 (5–8 rd), van raspona |
| R-13 | Benchmark budžet i zavisnost od judge-a; artefakti `feature/harness-sota-bench` su pilot, ne rezultat. | B1–B3 | DQ-04 cap pre starta; pre-registration hash (B3-PR1) pre gledanja test odgovora | Dev alati. B3 pre-registration hash je nepovratan: neuspeh se objavljuje (DIR-23). |
| R-14 | Hotspot konflikti: W1-PR4/PR8/PR9, W3-PR2 i W4-PR1 diraju iste fajlove (`chat.ts`, `agent-loop.ts`). | G2 | Merge vlasnik po ulozi (DP-0.14). Dva PR-a na istom hotspot-u ne merge-uju se isti dan bez integracionog testa. Rebase na integracionu granu najmanje jednom dnevno. | Pojedinačan revert na `integration/waggle-next` |
| R-15 | Test pogađa osnivačevu živu instalaciju: sidecar na 3333, `~/.waggle`, hook install piše u stvarni `~/.claude`/`~/.codex`/Hermes config, installer je `installMode: "currentUser"` (HKCU). | Svi talasi, F1–F3 | Izolacija env-a (DP-0.08): `WAGGLE_DATA_DIR`, `WAGGLE_PORT≠3333`, `HOME`/`USERPROFILE`/`HERMES_HOME` na scratch profil. `WAGGLE_DATA_DIR` sam ne pokriva `documents.ts:37` i `pins.ts:32` (POTVRĐENO NA REVIZIJI, N-28): privremeno scratch `USERPROFILE`/`HOME` i za terminal dev sidecar-a i E2E run-a po 01 §9.3 (PREDLOG); odluka: tech lead i osnivač. Installer, crash i packaged migracije samo na VM ili disposable nalogu (DP-0.11). | Nema rollback-a za oštećenu živu instalaciju, zato važi zabrana. Svako odbijanje certify skripta (`Refusing …`) zaustavlja rad. |
| R-16 | Carry-forward F2 → F3 nađe uticaj na površine koje B3 meri. | F3 | Iscrpan diff review uz nezavisan review (1–2 rd) | Poruka se vezuje za F2 SHA ili je potrebno novo merenje (NEPOZNATO, van raspona). |

---

## 5. Pravila eskalacije (PREDLOG ovog handoff-a)

Osnova: DP-0.11 (zabrane), DP-0.14 (merge vlasnici po ulozi; „Founder samo za decision queue i spoljne kapije”), Delivery §6/§6.1 i checklist. Paket ne definiše ulogu „tech lead”. Ovde je PREDLOG da tech lead drži `integration/waggle-next`, dodeljuje uloge iz kanonske liste DP-0.14 (Harness, Chat, Durable, Memory, Server, Boundary, Capability, Security, External-executor, Evolution, Model/Runtime, UX, Attention, Channels, Benchmark, Release, OSS/License owner) konkretnim ljudima i arbitrira između njih. Paket ne kaže ni ko imenuje tech lead-a, ni kojim kanalom se eskalira, ni ko dodeljuje DP-0.14 uloge (NEPOZNATO). To zatvaraju founder stavke ESK-01..ESK-03 u §5.0. Dok nisu zatvorene, sve što §5.2 upućuje tech lead-u ide osnivaču.

### 5.0 Pre starta: tech lead, kanal i dodela uloga (founder stavke; PREDLOG ovog handoff-a)

Bez ovih stavki eskalacija ne radi prvog dana. Paket ne imenuje tech lead-a ni osobu koja ga postavlja. Kanal i očekivano vreme odgovora osnivača su NEPOZNATO ([00](00-START-HERE.md) §9). Sve DP-0.14 uloge su bez imena ([02](02-WORKING-AGREEMENT.md) §1: NEPOZNATO). Definition of Ready traži ime uloge i hotspot vlasnika za svaki PR (02 §8; [03](03-BACKLOG.md) §0), pa bez imena nijedan PR ne sme da počne. Zato se ESK-01..ESK-03 traže od osnivača **zajedno sa odobrenjem delivery plana** (00 §6, pitanje (a); ESK stavke su tamo (l)), pre kapije i koraka 3 u 00 §6. Tabela ne otvara D-01..D-18 i ne menja nijedan DQ/RAT/ODB.

| ID | Šta osnivač određuje | Zašto pre starta | Stanje |
|---|---|---|---|
| ESK-01 | **Ime tech lead-a.** Imenuje ga osnivač, jer paket nikog drugog ne ovlašćuje za to. | Tech lead drži `integration/waggle-next`, dodeljuje uloge (ESK-03) i prima stavke iz §5.2 i 02 §10 t.3. | NEPOZNATO |
| ESK-02 | **Kanal za eskalaciju prema osnivaču i očekivano vreme odgovora.** | Svako pitanje iz §5.3 čeka odgovor osnivača. Po Delivery §6 i §6.1 vreme čekanja na DQ/RAT nije u rasponima, a posle roka „najkasnije” (§1.1) i kod RAT-02/RAT-03 svaki dan čekanja pomera kontrolnu tačku 1:1. Vreme odgovora treba odmeriti prema tim rokovima. | NEPOZNATO |
| ESK-03 | **Ko dodeljuje DP-0.14 uloge ljudima.** Predlog: tech lead iz ESK-01 popunjava tabelu u 02 §1 i objavljuje je timu, a osnivač dodelu potvrđuje pisano. Dok tech lead nije imenovan, uloge dodeljuje osnivač. | DoR (02 §8, 03 §0) blokira svaki PR čija uloga ili hotspot vlasnik nemaju ime. | NEPOZNATO |

**Dok ESK-01..ESK-03 nisu zatvorene:**
- Sva pitanja idu **direktno osnivaču** (Marko Marković, 00 §9), **pisano**, preko kontakta preko kog je osnivač timu predao ovaj paket. To obuhvata pitanja pre starta iz 00 §6 (a)–(o), stavke koje §5.2 i 02 §10 t.3 upućuju tech lead-u ili vlasniku uloge i svaku eskalaciju iz §5.3.
- Pitanje nosi format iz §5.5. Usmeni odgovor važi tek kad je potvrđen pisano.
- Vreme odgovora nije poznato do ESK-02. Zato važi §5.5: radi se samo na onome što pitanje ne blokira. Pre odobrenja plana to su samo čitanje paketa i koda i read-only provere (02 §0).

### 5.1 Developer sam odlučuje (unutar odobrenog tiketa)

- Implementaciju unutar ugovora tiketa (FRD zahtev, AT, fajlovi iz Delivery §2), dizajn RED testa i minimalni GREEN.
- Prepis testa koji pinuje trenutno pogrešno ponašanje, **u istom PR-u** i sa obrazloženjem u PR opisu (DP-0.15). Tiho brisanje testa nije dozvoljeno.
- Interna imena, lokalni refaktor unutar diff-a PR-a i izbor fixture-a, ako ne menjaju javni ugovor, šemu, event payload ni ponašanje van tiketa.
- Zaustavljanje rada kad bilo koja checklist stavka glasi „ne”. To je obaveza, ne izbor.

### 5.2 Traži tech lead (i vlasnika uloge)

- Merge u `integration/waggle-next` i redosled merge-ova na hotspot fajlovima (DP-0.14); podelu ili spajanje PR-ova.
- Stavke označene „otvoreno — inženjerska odluka vlasnika (uloga)”, npr. timezone polje u ADR-07 O4 (Durable owner, MIG-02), wire-vs-remove za `AgentLearning.formatLearningPrompt` (Evolution owner), `npm audit` advisory ili blocking (OSS/License owner, OSS-PR4), BvB Q1/Q6.
- Svaku promenu šeme, event payload-a ili javnog API ugovora koja nije u tiketu, a ne dira D-nn, G obim ni ADR odluku.
- Istek time-box-a (npr. W1-PR1): tech lead pakuje delimične rezultate za RAT-02. Time-box se ne produžava tiho.
- Odstupanje izmerenog trajanja od procene za više od gornje granice raspona tiketa. Tech lead javlja osnivaču uticaj na G datum.
- Protivrečnost između dokumenata paketa. Tech lead je zapisuje, a ako dira G obim ili checklist, eskalira osnivaču. Ako dira D-nn, prijavljuje je osnivaču po §5.3 (prijava, bez otvaranja).
- Dodavanje OSS zavisnosti: zapis Build-vs-Borrow (D-17) i provenance (FR-OSS-04). Nepoznata ili copyleft licenca ide osnivaču (§5.3).

### 5.3 Traži osnivača (bez izuzetka, pre radnje)

| Oblast | Primeri |
|---|---|
| **D-01..D-18** (prijava, bez otvaranja) | Ovo nije zahtev za odluku. Odluke su zatvorene (§5.4), pa se osnivač ne pita da ih menja ni tumači. Kad kod, nalaz ili tiket dođe u konflikt sa zatvorenom odlukom, konflikt se beleži (02 §10 t.3) i prijavljuje osnivaču informativno, a radnja koja bi odluku zaobišla se ne izvodi. Primeri konflikta: paywall za individualnu funkciju (D-01), Waggle Team SKU (D-02), cloud fallback u KVARK režimu (D-03), tiha zamena Qwen 3.8 cilja (D-15), Fusion/council površina (D-16). Tim ne predlaže novo tumačenje. |
| **Obim** | Pomeranje tiketa između G1/G2/G3, dodavanje ili uklanjanje tiketa, promena exit kriterijuma (RAT-01), obim W3e-PR9 (ODB-02), drugi IM kanal (DQ-07), svaka DQ-01..DQ-09 i RAT-01..RAT-09. |
| **Novac** | Svaki run sa realnim nalogom ili plaćenim API-jem: P/R/A receipt (ODB-01), LoCoMo rerun, B2-PR0/B2/B3, GEPA fidelity (DQ-04). Odobrenje važi za konkretan run, sa cap-om zadatim pre starta. Takođe Stripe radnje, otkazi, refundi i www pricing (DQ-01/DQ-03). |
| **Release** | Merge u `main`, force-push, `git tag v*` i push taga, release, publikacija, attestation, lokalno potpisivanje release artefakta, promena vidljivosti repoa, izmene GitHub repo/org podešavanja (rulesets, environments, secret scanning, Actions varijable i secrets), ručno pokretanje workflow-a (`workflow_dispatch`, re-run), definisanje `WINDOWS_PUBLIC_RELEASE_AUTHORIZED`. |
| **Podaci žive instalacije** | Sve što dira osnivačevu mašinu ili nalog: `~/.waggle`, instaliranu aplikaciju (zamena, uninstall, repair), HKCU ključeve, `~/.claude`/`~/.codex`/Hermes config, lično auth stanje; restore iz snapshot-a u G1; `git worktree prune/remove` postojećih 9 worktree-ja (DP-0.02) i bilo šta sa `stash@{0}`/`stash@{1}` (DP-0.03). |
| **Spoljni upisi** | Slanje stvarnog mejla ili poruke, channel tokeni, `WAGGLE_SIGNAL_EMIT≠0`, povezivanje stvarnih konektora, Teams server (`DATABASE_URL`/`CLERK_SECRET_KEY`), PostHog ili Clerk ključ u build-u, push na OSS mirror `marolinik/hive-mind` ili hive-mind release, instalacija neproverenog binarnog ili MCP koda. |
| **Licence** | Izmena LICENSE/NOTICE teksta pre DQ-02, pomeranje OSS-excluded granice, zavisnost sa copyleft, nepoznatom ili nedostajućom licencom. |
| **Izuzetak od checklist-e** | Svaka izmena SAFE checklist-e je founder direktiva. Primer iz otvorenih LOW nalaza: W0-PR19 traži worktree tačno na `2af0904d`, a checklist dozvoljava samo worktree-je iz `integration/waggle-next`. Implementer staje, tech lead priprema predlog, osnivač odobrava izuzetak. |

### 5.4 Podsetnik: zatvorene odluke D-01..D-18 (brief §3, ODLUKA)

D-01 free/open-source za pojedinca · D-02 Waggle = me, KVARK = us · D-03 KVARK isključivo on-prem · D-04 desktop-first/local-first · D-05 BYOK ostaje · D-06 knowledge work je primarni posao · D-07 Home se čuva · D-08 Workspace je centralni objekat · D-09 tehnički agenti ispod površine · D-10 skills i konektori inline · D-11 eksterni izvršioci opcioni · D-12 Hive Mind je memorijski temelj · D-13 Evolution je deo teze · D-14 dug rad i rutine su deo proizvoda · D-15 cilj Qwen 3.8 27B-klasa · D-16 Fusion nije ovaj obim · D-17 BORROW → ADAPT → BUILD · D-18 benchmark je ključan dokaz. Pun tekst i posledice: [brief §3](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md).

### 5.5 Kako se eskalira

- Eskalacija sadrži: ID stavke (DQ/RAT/ODB/ESK/LOW/tiket; `N`/`R` uvek sa dokumentom: „05 N-nn”, „05 R-nn”, „03 N-nn”, „04 N-n”, „Disposition Rnn”, v. §0; goli „N-07” nije dovoljan), oznaku statusa, opcije sa uticajem na G raspon i receipts (I/R/P/A/C), preporuku (PREDLOG) i šta je zaustavljeno.
- Dok odgovor ne stigne, radi se samo na tiketima koje stavka ne blokira. Nikad se ne pravi „privremena” implementacija neodlučene opcije na integracionoj grani.
- Kanal i rok za odgovor osnivača nisu definisani u paketu (NEPOZNATO). Određuje ih osnivač kao ESK-02 pre starta (§5.0), zajedno sa imenovanjem tech lead-a (ESK-01), jer tech lead pre toga ne postoji. Do tada važi privremeni put iz §5.0: pisano, direktno osnivaču.

---

## 6. Otvoreni LOW nalazi

[WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md) sadrži **17 otvorenih** LOW nalaza poslednjeg kritičkog kruga (8 je već razrešeno u paketu). Nisu vraćeni u petlju ispravki, jer ne menjaju nijedan G1/G2/G3 raspon, D-01..D-18 ni bezbednosnu disciplinu. Predlozi su PREDLOG i nisu odobreni. Poslednji kritički krug: HIGH 0, MED 12.

Nalazi koje tim treba da zna pre odgovarajućeg tiketa:

- **W0-PR19 naspram checklist-e (worktree na `2af0904d`):** vidi §5.3, red „Izuzetak od checklist-e”. Potrebno pre W0-PR19.
- **W1-PR1 mapiranje „T7 → W1-PR14”:** BvB mapira T7 na W1-PR14 + W1-PR15. Tiket W1-PR15 nosi exit „rollback ne vraća opozvane grantove”.
- **ADR-05 review nema jedinicu rada**, iako je RAT-04 pred merge-om W2-PR1. Tech lead je dodeljuje (predlog nalaza: W2-PR1 ili W0-PR10).
- **AT-27 config deo** nije u listi W0 exit testova, iako ga G1 exit (j) traži (W0-PR12 tripwire; MIG-04(A)/MIG-05(i) Klasa A nad fixture-om W0-PR19).
- **AT-30 „G1 (telemetry deo)”** je vitest prekidača (`posthog.test.ts`), a ne AT-30 iz brief §16. Test se vodi kao imenovani FRD test.
- **Anchor-i:** `HarnessRunState` je `workflow-harness.ts:110-128` (ne `:118-128`); FRD-12.4 `vault.ts:153-171` znači `packages/server/src/local/routes/vault.ts:153-171`; Benchmark BP-INV-01 `BP-SEC-04` → `BP-SEL-04`.

Izmene PRD ili FRD `.md` fajla zastarevaju DOCX: izvoz se ponavlja istom `pandoc` komandom, a heševi se ažuriraju u Delivery §6.1 i Disposition OD-9. Paket je vlasništvo osnivača, pa ispravke idu kao doc-only PR uz njegov pregled (PREDLOG).

---

## Izvori

- [Delivery plan v1.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) §0 (DP-0.01..DP-0.16), §1, §2 (Rizik/Rollback po talasu), §3, §4.2, §4.3, §5, §6, §6.1
- [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md) · [Sažetak za osnivača](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md) · [Otvoreni LOW nalazi](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md)
- [FRD v1.2](../Waggle_FRD_v1.2_DRAFT.md) §15 (AT-01..AT-30) · [PRD v1.2](../Waggle_PRD_v1.2_DRAFT.md) §17 · [Dispozicija](../plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md) · [Migracije](../plans/WAGGLE-MIGRATIONS-v1.2.md) · [Benchmark protokol](../plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md) · [Build-vs-Borrow](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.md) · [ADR-INDEX](../decisions/ADR-INDEX.md)
- Handoff (za §5.0): [00-START-HERE.md](00-START-HERE.md) §6 („Pitanja za osnivača pre starta” (a)–(o); ESK-01..ESK-03 = (l)), §9 (kanal i vreme odgovora NEPOZNATO) · [02-WORKING-AGREEMENT.md](02-WORKING-AGREEMENT.md) §0, §1 (imena uloga NEPOZNATO), §8 (DoR), §10 t.3 · [03-BACKLOG.md](03-BACKLOG.md) §0 (DoR: uloga dodeljena osobi)
- Dokazi: [phaseA/release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.md) (F-REL-02/03/04/08/09/11), [phaseA/external.md](../plans/v1.2-evidence/phaseA/external.md) §5, §7, §8 (live 27.09.2026) · [Founder brief](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md) §3, §20.3, §20.4
- Read-only provera na `2af0904d` (29.09.2026): `.github/workflows/release.yml:12-15` (`v*` trigger), `:2211` (`WINDOWS_PUBLIC_RELEASE_AUTHORIZED`); `.github/workflows/ci.yml:3-6` (samo `main`); `git tag -l 'v*'` = 10; `app/src-tauri/tauri.conf.json:21` (`installMode: "currentUser"`); `packages/server/src/local/managed-ollama-runtime.ts:28-29` (`0.32.3` / `0.32.0`); `package.json:48` (`persona:seal`), `:51` (`MIT`); postojanje `scripts/qualify-smart-router.ts`, `scripts/test-windows-official-auth-canaries.ps1`, `scripts/certify-windows-installer.ps1`; `docs/production-readiness/09-LAUNCH_RECOMMENDATION.md:35` (`NotSigned`); `docs/production-readiness/10-SECURITY_REVIEW_2026-08-11.md:64`; `CLAUDE.md:84`, `AGENTS.md:68` („remains private”)

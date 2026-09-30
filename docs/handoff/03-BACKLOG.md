# Waggle v1.2 — Backlog (tiketi iz Delivery plana §2)

**Revizija dokumenta: 1.2 DRAFT · 29.09.2026 · pregledana revizija koda `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`**

**Revizija dokumenta: 1.2.1 DRAFT · 30.09.2026 · završno zatvaranje (H-01..H-12)**

**Izmene 1.2.1:** H-01/H-02 — aktuelno stanje paketa (commit `2758f4e5` na javnom `origin`-u; closure revizija nije commit-ovana) i kanal predaje u §6 t.4, §7 N-07 i WB-PR1. H-03 — ID-evi LOW nalaza u karticama (`finish/…`), nalazi-kapije u tipizovanim poljima; ispravljeni LOW nalazi `finish/estimates/f1/03`, `finish/estimates/f1/05`, `finish/facts/f1/06` i `finish/traceability/f1/06` preslikani u kartice (W0-PR12, W1-PR1, W1-PR4, W2-PR1). H-04 — §6 kapije 2–3 upućuju na TEAM-START-AUTHORIZATION (NEODOBRENO). H-05 — tiket W0-PR20 (kartica, pregled, §2.1, §3, §6) i bezbedan test profil (BTP). H-06 — tipizovana polja i spremnost (§0, §0.1), W0-PR20, INT-01..INT-05 i uvoz u tracker (§8), usklađeni pregled, kartice (red „Spremnost”), §2, §6, §7. H-07 — ishodi po FRD-05.9 u W0-PR1, W0-PR2, W0-PR8 i W3-PR6. H-08 — W0-PR3: server-posmatran validator invocation i negativni primeri. H-09 — necikličan release put (§2.3; W8-PR6; nov tiket W8-PR7, uslovno REL-BOOT). H-10 — ODB-02 preporuka i status (§2.3, §5, W3e-PR9e). H-11 — KVARK/LM TEK granica (WB-PR3 kapija `KVARK-IF`, B2-PR3, W6-PR7, §2.3). H-12 — start sprinta = T0; veza na Delivery §4.4 (§6). Ova revizija nije odobrenje implementacije; statusi PREDLOG/DQ/RAT/ODB se njome ne menjaju.

> **Implementacija NIJE odobrena.** Ovaj backlog je planski artefakt. Kodiranje počinje tek kad osnivač pisano odobri delivery plan ([WAGGLE-DELIVERY-PLAN-v1.2.md](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md)). Od prvog commit-a sve ide po **obaveznoj** bezbednoj strategiji: DP-0.01..DP-0.16 (Delivery §0) i [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md). Svaka stavka checkliste je da/ne, a jedno „ne” zaustavlja rad. Status svih tiketa je `TODO — čeka odobrenje plana`. Founder odluke D-01..D-18 (brief §3) su zatvorene i ovaj backlog ih ne otvara. — PREDLOG — SMER BRIEFA (DIR-01, granica ovlašćenja).

Čitaoci: tech lead, developeri, QA. Pre ovog fajla pročitati [00-START-HERE.md](00-START-HERE.md). Okruženje je u [01-ONBOARDING-DEV-ENV.md](01-ONBOARDING-DEV-ENV.md), način rada (grane, PR, review, gates) u [02-WORKING-AGREEMENT.md](02-WORKING-AGREEMENT.md), mapa koda u [04-CODEBASE-MAP.md](04-CODEBASE-MAP.md). Rizici, red odluka i eskalacija su u [05-RISKS-DECISIONS-ESCALATION.md](05-RISKS-DECISIONS-ESCALATION.md). Mašinski čitljiva verzija svih tiketa je [backlog.csv](backlog.csv) (RFC 4180, UTF-8).

---

## 0. Pravila ovog backlog-a

| # | Pravilo | Status |
|---|---|---|
| B-01 | **Jedan tiket = jedan PR ID iz Delivery §2** („PR slicing” po talasu). `ticket_id` je doslovno PR ID iz plana. Tiketi se ne izmišljaju, ne spajaju i ne ispuštaju. Dopune revizije 1.2.1: `W0-PR20` (novi PR ID u Delivery §2 W0; H-05), `W8-PR7` (novi PR ID u Delivery §2 W8, uslovno REL-BOOT; H-09) i integracioni poslovi `INT-01..INT-05` (B-04). | PREDLOG |
| B-02 | Dva PR ID-a iz §2 plan sam rastavlja na imenovane pod-PR-ove, pa se broje pod-PR-ovi: **W3e-PR9 → W3e-PR9a..PR9e** (§2 W3e, §4.1.1, §4.2 review broj „+5”) i **B2-PR0 → B2-PR0a/PR0b/PR0c** (§2 B1–B3 „rastavljen u §4.1.1 na PR0a/b/c”, §3 graf, §4.2 „B2-PR0a/b/c se broje kao 3 PR-a”). Krovni ID (W3e-PR9, B2-PR0) nije poseban tiket. | PREDLOG (tumačenje §2/§4.1.1) |
| B-03 | Ukupno **130 redova**: **125 PR tiketa** — G1 = 26 (25 + W0-PR20), G2 = 65, G3 = 34 (33 + W8-PR7; od toga W3e-PR9a..e = 5, samo uz ODB-02, i W8-PR7, samo uz REL-BOOT = da) — i **5 integracionih poslova** INT-01..INT-05 (G1: INT-01, INT-02, INT-05; G2: INT-03; G3: INT-04). W0-PR20 je dodat u reviziji 1.2.1 (H-05) i upisan u Delivery §2; W8-PR7 je dodat u reviziji 1.2.1 (H-09) i upisan u Delivery §2 W8. Review broj Delivery §4.2 i zbirovi §4.1–§4.3 su iz revizije 1.2 (G1 ~26 PR = 25 tiketa + 1 integracioni doc-only PR = INT-02; G2 66–68 = 65 + 1–3 integraciona PR-a = INT-03; G3 29–31 (+5) = 28 (+5) + 1–3 = INT-04) i ne sadrže W0-PR20 (procena 1–2 / 0.5–1, PREDLOG 1.2.1), W8-PR7 (procena NEPOZNATO), INT-01 (nije PR) ni INT-05 (doc-only PR iz TSA-06). | POTVRĐENO NA REVIZIJI paketa za 123 tiketa (29.09.2026); dopune 1.2.1: PREDLOG; 130 = brojanje CSV-a posle 1.2.1 (H-05, H-06, H-09) |
| B-04 | **Integracioni i reconcile poslovi imaju ID** `INT-nn` (u CSV-u `wave` = `INT`). INT-02, INT-03 i INT-04 su tri stavke Delivery §4.1 reda „Integracija/spec sync” (G1 ID reconcile, G2 hotspot integracioni testovi, G3 reconcile posle DQ odluka). INT-01 je uspostavljanje `integration/waggle-next` sa paketom (00 §6 (h); §7 N-07). INT-05 je doc-only usklađivanje `AGENTS.md`/`CLAUDE.md` sa TSA-06/TSA-10. Vlasnik, zavisnosti, kapije i kriterijum završetka: §8.1 i CSV. | PREDLOG (ID-evi dodati u reviziji 1.2.1, H-06) |
| B-05 | **Procene** su prepisane iz Delivery §4.1.1 (klasično / AI eng-dana, ekspertski raspon, ne P50). Gde plan daje samo zbir PR grupe, polje po tiketu ostaje prazno, a grupa i njen zbir su u napomeni. Nijedan broj nije ponovo procenjen. | PREDLOG (brojevi plana) |
| B-06 | **AT/PRD/FRD ID-evi** potiču iz FRD §15 (kolona „Wave”), Delivery §2 (exit testovi i redovi PR tabela) i Delivery §7 (TM redovi). TM red je grupni: navodi talas ili PR grupu, pa CSV kolone `prd_ids`/`frd_ids` nose uniju TM redova u kojima se tiket pojavljuje. Kolona `notes` imenuje te TM redove. Raspodela PRD/FRD ID-eva po pojedinačnom PR-u unutar TM reda nije data u planu (NEPOZNATO). | PREDLOG |
| B-07 | **Fajlovi.** Za G1 tikete putanje su proverene `git ls-tree` nad `2af0904d` (29.09.2026). Brojevi linija su preuzeti iz plana; za `ci.yml:3-6`, `feature-flags.ts:26`, `workflow-harness.ts:474-482`, `cost-tracker.ts:24-32`, `dock-tiers.ts:82`, `cost.ts:210,272`, `settings.ts:1192`, `local/index.ts:612` i `package.json:48` sadržaj je ponovo pročitan. Za G2/G3 putanje su iz plana i nisu ponovo proveravane. | POTVRĐENO NA REVIZIJI (G1 putanje); PREDLOG (G2/G3) |
| B-08 | **Status** svakog tiketa: `TODO — čeka odobrenje plana`. Pravila rada su u šest tipizovanih CSV polja (§0.1), ne samo u `notes`: kapija nije tehnička zavisnost, obavezni redosled nije tehnička zavisnost, a kapija merge-a ne zabranjuje pripremu u grani. | PREDLOG (1.2.1, H-06) |
| B-09 | Oznake statusa činjenica: **ODLUKA** (samo D-01..D-18), **POTVRĐENO NA REVIZIJI**, **NALAZ AUDITA — ZA PROVERU**, **DELIMIČNO/NEPOVEZANO**, **PREDLOG**, **ODLOŽENO**, **NEPOZNATO**. „Modul postoji” nije dokaz E2E funkcije. | kao u paketu |
| B-10 | **Tipizovana polja, registar kapija i spremnost** su u §0.1; mehanička provera je `node docs/plans/v1.2-evidence/tools/check_backlog.mjs` (exit 0). Kad se `notes` i tipizovana polja razlikuju, važe polja. | PREDLOG (1.2.1, H-06) |

**Definition of Ready (svaki tiket; PREDLOG, izvedeno iz checkliste):** tiket je `ready_to_start` po §0.1 — plan odobren (`PLAN-APPROVAL`), uloga vlasnika dodeljena osobi (`ROLE-ASSIGN`, DP-0.14), tehničke zavisnosti i prethodnici iz `sequence_after` merge-ovani u `integration/waggle-next`, kapije starta i `start_after` događaji zatvoreni; env šablon iz checkliste „Env izolacija” i „Spoljni upisi isključeni” spreman, a za `host:btp` i bezbedan test profil (BTP, H-05); RED test i fajl za njega poznati. Kapije merge-a nisu uslov za početak rada.

**Definition of Done (svaki tiket; PREDLOG, izvedeno iz checkliste i DP-0.06/DP-0.15):** tiket je `ready_to_merge` po §0.1 (sve `merge_gates` zatvorene, tiketi iz njih merge-ovani); RED test pada na baseline-u, pa prolazi posle minimalnog GREEN-a; pinning testovi koje plan navodi prepisani u istom PR-u sa obrazloženjem; gates zeleni: `npm run build:packages` · `npm run typecheck:server-tests` · `npm run lint` · `npm run test -- --run --maxWorkers=6`; tiket koji dira `apps/web/**` zeleni i `npm run typecheck:web` · `npm run test -w apps/web`, jer root `vitest.config.ts:43` isključuje `apps/**` i četiri gate-a ne pokreću web RED/GREEN testove (POTVRĐENO NA REVIZIJI); ostale dopunske provere po dodirnutoj površini su u [02-WORKING-AGREEMENT.md](02-WORKING-AGREEMENT.md) §6.3; PR opis sadrži sva obavezna polja (nalaz ID, AT ili „nema — razlog”, RED→GREEN dokaz, prepisani testovi, affected receipts I/R/P/A/C, migration/rollback, status oznake); review vlasnika hotspot-a; merge samo u `integration/waggle-next`, nikad u `main`; checklist bez ijednog „ne”.

### 0.1 Tipizovana polja, registar i spremnost (revizija 1.2.1; PREDLOG)

| Polje (CSV) | Značenje | Ko menja |
|---|---|---|
| `technical_dependencies` | Tiketi čiji kod, šemu ili dokument ovaj tiket koristi. Moraju biti merge-ovani u `integration/waggle-next` pre početka rada. Ranije kolona `depends_on` (prelaz: §8.2 t.3). | tech lead, uz izmenu Delivery §2/§3 |
| `sequence_after` | Obavezni redosled rada bez tehničke zavisnosti (isti lane, kritična putanja Delivery §3). Prethodnik mora biti merge-ovan pre početka rada. | tech lead, doc-only PR sa obrazloženjem |
| `start_gates` | Kapije iz registra koje moraju biti zatvorene pre početka rada, i u grani: odluke, ratifikacije, odobrenja i nalazi čiji ishod određuje sadržaj ili trošak rada. | registar; odluke zatvara osnivač |
| `merge_gates` | Kapije iz registra ili ID-evi tiketa (merge-preduslov) koji moraju biti zatvoreni ili merge-ovani pre merge-a. Rad u grani je pre toga dozvoljen. | registar; tech lead |
| `milestone_gate` | `start_after:<događaj>` — rad ne počinje pre događaja; `merge_before:<događaj>` — tiket mora biti merge-ovan pre događaja. Događaji su u registru: F1, G1-EXIT, B2-DEVRUN, B2-VALRUN, F2, G2-EXIT, B3-RUN, F3-SRC, F2F3-CFR, F3 (= F3a); posle poslednjeg merge-a slede K-SIGN, F3b i kapija PUBLIC-GO (Delivery §5.1, H-09), koje nijedan tiket nema u `milestone_gate`. | tech lead; Release i Benchmark owner |
| `resource_constraints` | `lane:`, `hotspot:`, `host:`, `hw:`, `budget:`, `human:` iz registra. Ograničenja rasporeda i mesta izvršavanja. Ne ulaze u automatsku spremnost, a poštuju se pri raspodeli i merge-u: `hotspot:` po 02 §3 i TSA-07; `host:` po DP-0.11 i H-05; `budget:dq-04` znači plaćeni poziv samo u okviru odobrenog DQ-04 cap-a (BC-03). | tech lead |

Liste su odvojene sa `;`, bez razmaka. Svaki ID postoji u [backlog.csv](backlog.csv) ili u [backlog-gates.csv](backlog-gates.csv) (kolone `gate_id, kind, naziv, zatvara_se_kad, vlasnik, izvor, requires`).

**Spremnost u tracker-u:**
- `ready_to_start` = sve `start_gates` zatvorene · svi `start_after` događaji zatvoreni · svi `technical_dependencies` i `sequence_after` merge-ovani.
- `ready_to_merge` = `ready_to_start` · sve `merge_gates` zatvorene i tiketi u njima merge-ovani · Definition of Done ispunjen.
- Događaj se zatvara tek kad su svi tiketi sa `merge_before:<događaj>` merge-ovani (ili ODLOŽENO) i kad su zatvoreni njegovi `requires` iz registra.
- Kapija merge-a ne zabranjuje pripremu u grani. Kapija starta zabranjuje i pripremu, jer njen ishod određuje sadržaj ili trošak rada.
- U svakom redu su globalne kapije `PLAN-APPROVAL` i `ROLE-ASSIGN` (start) i `MERGE-AUTH` (merge; osim INT-01, koji nije PR). `ROLE-ASSIGN`, `REVIEW-2` i `FOUNDER-REVIEW` se zatvaraju po tiketu, ne globalno.
- Kapije koje zavise od predloga NEODOBRENO (TSA-xx, `MERGE-AUTH`) su upisane da bi tracker blokirao rad dok predlog nije potvrđen; upis nije potvrda.
- Delivery §3: „svi W3e PR-ovi koji menjaju persona resolution ili prompt put” merge-uju se pre B2 dev run-a. W3e-PR1 nosi `merge_before:B2-DEVRUN`. Za W3e-PR2..PR8 autor pri otvaranju PR-a navodi da li PR menja persona resolution ili prompt put; ako menja, tech lead doc-only PR-om dodaje `merge_before:B2-DEVRUN` pre merge-a.
- Serijalizacija kontrolnih tačaka iz Delivery §4.3 (G2 posle G1, G3 posle G2) upisana je kao `start_after:G1-EXIT` u G2 redovima i `start_after:G2-EXIT` u G3 redovima. To je PREDLOG raspored plana; preklapanje (npr. W1-PR1, W1-PR13, W1-PR15 sa repom G1) uvodi se samo doc-only PR-om koji menja ovo polje i Delivery §4.3.
- Varijanta „W3e-PR9 u G2” (Delivery §4.3; ODB-02): W3e-PR9a..e tada dobijaju `milestone` G2, `start_after:G1-EXIT`, `merge_before:B2-DEVRUN` i `merge_before:F2` (doc-only PR uz odluku osnivača).
- Kad se `notes` i tipizovana polja razlikuju, važe polja; `notes` su obrazloženje i istorija.

**Mehanička provera:** `node docs/plans/v1.2-evidence/tools/check_backlog.mjs` (exit 0). Proverava oblik CSV-a, jedinstvene ID-eve, postojanje svih referenci, odsustvo ciklusa, simulirane scenarije spremnosti (između ostalog: B3-PR1 i B3-PR2 nisu `ready_to_start` pre F2, ništa ne počinje pre `sequence_after`, W1-PR2 se sme pripremati dok je RAT-02 otvoren, ali ne i merge-ovati) i slaganje kartica i pregleda sa CSV-om. `--cards` ispisuje tačan red „Spremnost” za svaku karticu. Prolaz proverava dokumentaciju, ne aplikaciju.

---

## 1. Pregled po talasu

Kolone: G = kontrolna tačka; procena = klasično / AI eng-dana iz Delivery §4.1.1 („—” = plan daje samo zbir grupe, vidi napomenu u CSV-u); owner = uloga (DP-0.14), ne ime. „Tehničke zavisnosti” = CSV `technical_dependencies`; ostala tipizovana polja su u redu „Spremnost” svake kartice (§0.1).

<!-- GEN:OVERVIEW:BEGIN -->

### W0 (21 tiket; G1)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| W0-PR0 | G1 | CI filteri za `integration/**` (ci.yml, tauri-build-pr.yml) | INT-01 | — (preduslov; TM-19 nosi AT-30) | — (grupa) | NEPOZNATO (predlog: Release owner) |
| W0-PR1 | G1 | Verify default fail-closed + harness:phase:skipped | W0-PR0 | AT-01 | — (grupa) | Harness owner |
| W0-PR2 | G1 | VERDICT vrednost u gate-u; CONDITIONAL ≠ PASS | W0-PR0, W0-PR1, W0-PR8 | AT-01 | — (grupa) | Harness owner |
| W0-PR3 | G1 | Exit code se ne gubi; bash gate = stvarni test/typecheck | W0-PR0, W0-PR1, W0-PR8 | AT-02 | — (grupa) | Harness owner |
| W0-PR4 | G1 | run_harness izlazi iz VERIFICATION_TOOL_EXACT; gate prima {name, succeeded} | W0-PR0 | AT-02 | — (grupa) | Harness owner |
| W0-PR5 | G1 | Budget stop: D3 disclose-only + budgetStop meta | W0-PR0 | AT-03 deo (G1) | — (grupa) | Harness owner |
| W0-PR6 | G1 | Bridge istinitost bez šeme (outcome 'pending' + tag gate_passed) + MIG-04(A) | W0-PR0, W0-PR7, W0-PR19 | AT-27 deo (MIG-04(A), Klasa A); TM-01 (AT-01/AT-02) | — (grupa) | Harness owner |
| W0-PR7 | G1 | Aditivni runId u HarnessRunState i harness eventima | W0-PR0 | AT-06 deo (G1) | — (grupa) | Harness owner |
| W0-PR8 | G1 | Self-reported dokaz označen; strict opt-in; observedToolCalls provider | W0-PR0 | AT-01, AT-02 (G1 exit (a); FRD §15 Wave ne navodi W0-PR8) | — (grupa) | Harness owner (hotspot review: Chat owner) |
| W0-PR9 | G1 | Persona shadowing (F-EVO-01), zatim activation check (F-EVO-10) | W0-PR0 | AT-04 minimum (G1) | 1.5–2 / 0.5–0.5 | Harness owner (W0 Owner/uloga; FRD §15 AT-04: Evolution owner) |
| W0-PR10 | G1 | Hook read path trio: temporary isključen, ingress scan, redakcija tajni | W0-PR0 | AT-14 deo; AT-19 deo | — (grupa) | Memory owner |
| W0-PR11 | G1 | Leak workspace→personal na 4 mesta + fleet policy gate + sentinel AT-13 | W0-PR0 | AT-13 (G1, novi upisi) | — (grupa) | Memory owner (hotspot review: Chat owner) |
| W0-PR12 | G1 | Boundary quick de-gates: Approvals nav ×3, /api/cost, audit-export → FREE | W0-PR0 | AT-12 deo; AT-18 deo; AT-27 deo (config tripwire) | — (grupa) | Boundary owner |
| W0-PR13 | G1 | Pricing tabela (DEFAULT_MODEL_PRICING, models.json) sa provenance komentarom | W0-PR0 | — (G1 exit (e); TM-17) | — (grupa) | Release owner |
| W0-PR14 | G1 | Cron getDue RED repro (ISO vs datetime(now)) + eventualni fix | W0-PR0 | AT-23 deo (G1) | 0.5–0.5 / 0.5–0.5 | Durable owner |
| W0-PR15 | G1 | Doc drift kandidata/receipts + zastareli komentari (bez DQ-02 rečenica) | W0-PR0 | — (G1 exit (g); TM-19) | — (grupa) | Release owner |
| W0-PR16 | G1 | Stop/disconnect copy u ChatApp | W0-PR0 | FRD-05.8 Stop-copy test (bez AT ID-a; ADR-03-T6) | — (grupa) | Chat owner (Disposition A9) |
| W0-PR17 | G1 | Telemetry istinitost: jedan prekidač za lokalni store i PostHog + disclosure | W0-PR0 | AT-30 deo (telemetry) | 0.5–1 / 0.5–0.5 | Release owner |
| W0-PR18 | G1 | MIG-05(i): reklasifikacija legacy leak frejmova (metadata.recallExcluded) | W0-PR0, W0-PR11, W0-PR19 | AT-13 (G1, legacy); AT-27 deo (MIG-05(i), Klasa A) | 1–1.5 / 0.5–1 | Memory owner (MDQ-07) |
| W0-PR19 | G1 | Golden legacy-datadir fixture generator (kod revizije 2af0904d) | W0-PR0 | preduslov AT-27 (FRD §15) | 1–1.5 / 0.5–1 | NEPOZNATO |
| W0-PR20 | G1 | Izolacija dataDir-a: documents/pins, marketplace, SecurityGate i adapteri mimo `WAGGLE_DATA_DIR` + sentinel regresija | W0-PR0 | DP-0.08 sentinel test (bez AT ID-a) | 1–2 / 0.5–1 | Server owner |

### W1 (15 tiketa; G2)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| W1-PR1 | G2 | A8 spike (Reflow ADAPT vs minimalni BUILD) + review ADR-02/ADR-03 | W0-PR7, W0-PR8 | AT-07, AT-08, AT-09 (kriterijum spike-a: BvB T1–T3 + T9 na prototipu) | 5–6 / 3–4 | Durable owner |
| W1-PR2 | G2 | Run store + schemaVersion + retention/GC + migracija agent-runs.json v1 (MIG-01) | W1-PR1 | AT-27 deo (run store) | 8–10 / 4–5 | Durable owner |
| W1-PR3 | G2 | Kanonska/legacy mapa statusa u shared | W1-PR2 | FRD-05.8 status-mapa test (bez AT ID-a) | 2–3 / 1–2 | Durable owner |
| W1-PR4 | G2 | Server-driven phase executor (DurableRun pre side-effect-a, Checkpoint.spent) | W1-PR3 | AT-03 (G2 autoritativan); AT-07 | 9–12 / 4–6 | Durable owner (hotspot agent-loop.ts: Harness owner) |
| W1-PR5 | G2 | Lease/fencing za run + eksplicitan resume API | W1-PR4 | AT-07; AT-09 | — (grupa) | Durable owner |
| W1-PR6 | G2 | ToolAction/ToolAttempt: stabilan actionId, unknown_outcome; pending_actions prelazni status | W1-PR4 | AT-08; AT-12 deo (BLOCKED_APPROVAL trajno); AT-27 deo (MIG-02) | — (grupa) | Durable owner (Boundary owner: held actions) |
| W1-PR7 | G2 | ProofReceipt + execution_traces CHECK rebuild (gate_passed) + MIG-08 sekcija tragova | W1-PR4 | AT-01 deo (G2 exit (c)); AT-27 deo (MIG-04(B)) | 4.5–7 / 2.5–2.5 | Harness owner (schema.ts: Memory owner, drift baseline) |
| W1-PR8 | G2 | Per-run event bus + GET /api/runs/:id/stream?sinceSeq= | W1-PR7 | AT-06 deo (per-run bus); AT-10 | — (grupa) | Durable owner (Chat owner: chat.ts) |
| W1-PR9 | G2 | Detach ≠ cancel u chatu (ADR-03) | W1-PR8 | AT-10 | — (grupa) | Chat owner |
| W1-PR10 | G2 | Loop execution state iz Awareness u run store | W1-PR9 | AT-23 deo; AT-27 deo (MIG-02) | — (grupa) | Durable owner |
| W1-PR11 | G2 | Rutine: occurrence identitet, misfire politika, timezone, DST + MIG-08 sekcija | W1-PR9, W0-PR14 | AT-23 (G2 autoritativan); AT-27 deo (MIG-02; MIG-08) | — (grupa) | Durable owner |
| W1-PR12 | G2 | Crash-injection e2e (dev Node) | W1-PR5, W1-PR6, W1-PR9 | AT-07; AT-08; AT-09 | 1–1 / 0.5–0.5 | Durable owner |
| W1-PR13 | G2 | MIG-09 versionovani migracioni ledger + runner | W0-PR7, W0-PR8 | AT-27 deo (MIG-09) | 3–4 / 1.5–2 | Durable owner |
| W1-PR14 | G2 | MIG-08 export/erasure za run store (ExecutionErasure) | W1-PR2 | AT-27 deo (MIG-08) | 2–3 / 1–1.5 | Durable owner |
| W1-PR15 | G2 | Revocation ledger revocations.json + Klasa B restore test | W0-PR7, W0-PR8, W0-PR19 | AT-27 deo (Klasa B restore) | 1.5–2.5 / 1–1.5 | Durable owner (FRD §15 AT-27) |

### W2 (10 tiketa; G2)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| W2-PR1 | G2 | ContextPackage tip + ContextBuilder fasada nad recallMemory + ablation flag + review ADR-05 (O1–O4) | W0-PR10, W0-PR11 | AT-06 deo; AT-13 deo | 3–4 / 1.5–2 | Memory owner |
| W2-PR2 | G2 | Pinovanje paketa za run + invalidacija (erasure/revoke/scope) | W2-PR1, W1-PR4 | AT-15 (G2 autoritativan); AT-13 deo; AT-27 deo (MIG-05 context_refs) | 3–3.5 / 1.5–2 | Memory owner |
| W2-PR3 | G2 | Trust/taint labele u render liniji recall bloka | W2-PR2 | AT-28 deo (LoCoMo same-judge bez regresije) | 1.5–2 / 0.5–1 | Memory owner |
| W2-PR4 | G2 | Token budžet po model tier-u na nivou paketa | W2-PR3 | — (TM-08; per-PR NEPOZNATO) | 2–3 / 0.5–1 | Memory owner |
| W2-PR5 | G2 | Fleet/harness/subagent na isti ContextPackage ugovor | W2-PR3 | — (TM-08; per-PR NEPOZNATO) | 3–4 / 1.5–2 | Memory owner; Harness owner (injekcija u faze) |
| W2-PR6 | G2 | External handoff za sve putanje (WAGGLE_CONTEXT_INJECTED, SessionStart, cli-bridge) | W2-PR3 | AT-16 | 3–4 / 1.5–2 | External-executor owner |
| W2-PR7 | G2 | Idempotentna run-end ekstrakcija (runId, outputHash) | W2-PR3 | AT-14 (G2 autoritativan) | 1–1.5 / 0.5–0.5 | Memory owner |
| W2-PR8 | G2 | External toolsUsed označen tool-reported | W2-PR3 | AT-16 | 0.5–0.5 / 0.5–0.5 | External-executor owner |
| W2-PR9 | G2 | RAWDETAIL FRD zapis + odluka o bundlovanju reranker-a | W2-PR3 | AT-14 (G2 autoritativan) | 0.5–1 / 0.5–0.5 | Memory owner |
| W2-PR10 | G2 | memory_compact test u desktop sidecar-u | W2-PR3 | — (TM-08; per-PR NEPOZNATO) | 0.5–0.5 / 0.5–0.5 | Memory owner |

### W3 (8 tiketa; G2)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| W3-PR1 | G2 | Review ADR-01 + ExecutionMode tabela u FRD | — | — | 1–2 / 0.5–0.5 | Harness owner |
| W3-PR2 | G2 | Router conversation/work server-side | W3-PR1, W1-PR4, W2-PR1 | — (TM-01/TM-20; per-PR NEPOZNATO) | 4–5 / 2–3 | Harness owner (hotspot: Chat owner) |
| W3-PR3 | G2 | Recipe registry + verzije + HarnessRecipeVersion minimum | W3-PR2 | — (TM-20; per-PR NEPOZNATO) | 4–5 / 2–3 | Harness owner |
| W3-PR4 | G2 | Research-brief recipe + deterministički validatori | W3-PR3 | AT-21; AT-22 | 6–8 / 3–4 | Harness owner |
| W3-PR5 | G2 | Document-production recipe (DOCX/MD) + validatori | W3-PR3 | AT-21; AT-22 | 6–8 / 3–4 | Harness owner |
| W3-PR6 | G2 | Tri nivoa provere u ProofReceipt; CONDITIONAL politika po recipe | W3-PR4, W3-PR5, W1-PR7 | AT-01 deo (G2) | 4–5 / 1.5–2 | Harness owner |
| W3-PR7 | G2 | Production benchmark adapter (benchmark režim) + manifest + run reset | W3-PR6 | AT-28 (G2 autoritativan, sa B2-PR1/PR2) | 4–5 / 1.5–2 | Benchmark owner |
| W3-PR8 | G2 | Cherry-pick aditivnih fajlova iz feature/harness-sota-bench (bez fe7804bf) | — | — (TM-17) | 1–2 / 0.5–0.5 | Benchmark owner (uz Harness owner review) |

### W3e (13 tiketa; G2/G3)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| W3e-PR1 | G2 | Active-version pointer + rollback ruta + rolled_back (CHECK rebuild) + MIG-08 | W0-PR9 | AT-04 (G2 autoritativan); AT-27 deo (MIG-03) | 6–7.5 / 3–4 | Evolution owner |
| W3e-PR2 | G2 | EvolutionLLM adapter nad provider router-om + composePersonaPrompt | W0-PR9 | AT-26 deo (KVARK bez cloud judge-a) | 2–3 / 1–1.5 | Evolution owner |
| W3e-PR3 | G2 | Paired scoring (anchor) + drift watch aktivne verzije | W0-PR9 | AT-29 | 2.5–4 / 1.5–2 | Evolution owner |
| W3e-PR4 | G2 | builder.build() sa secret scan/split/holdout umesto sourceFromTraces | W0-PR9 | AT-29; AT-13/AT-19 (eval skup) | 2–3 / 1.5–2 | Evolution owner (Memory owner: eval dataset scope) |
| W3e-PR5 | G2 | Lokalni evaluator default + consent/cap/abort za cloud judge | W0-PR9 | — (TM-04; per-PR NEPOZNATO) | 2–3 / 1–1.5 | Evolution owner |
| W3e-PR6 | G2 | EvolveSchema wire-or-drop | W0-PR9 | AT-05 | 1–1 / 0.5–0.5 | Evolution owner |
| W3e-PR7 | G2 | Learning kanal: markCorrected, persona signal, wire-vs-remove AgentLearning | W0-PR9 | — (TM-03; per-PR NEPOZNATO) | 1.5–2 / 1–1.5 | Evolution owner |
| W3e-PR8 | G2 | Route test: complete() pozvan sa kandidatom pre judge-a | W0-PR9 | AT-05 | 0.5–1 / 0.5–0.5 | Evolution owner |
| W3e-PR9a | G3 | Registry odobrenih varijanti + nepromenljivi invariants | W3-PR3, W3e-PR1, W3e-PR3, W3e-PR4 | preduslov AT-29 (recipe deo) | 2–3 / 1–1.5 | Evolution owner; Harness owner (recipe registry) |
| W3e-PR9b | G3 | Generator kandidata (mutacije unutar registry-ja) | W3e-PR9a | preduslov AT-29 (recipe deo) | 2–4 / 1–2 | Evolution owner |
| W3e-PR9c | G3 | Upareno ocenjivanje (reuse W3e-PR3/PR4) | W3e-PR9b | preduslov AT-29 (recipe deo) | 1–2 / 0.5–1 | Evolution owner |
| W3e-PR9d | G3 | Eksplicitna promocija + rollback (reuse W3e-PR1) | W3e-PR9c | preduslov AT-29 (recipe deo) | 1–2 / 0.5–1 | Evolution owner |
| W3e-PR9e | G3 | Testovi (AT-29 za recipe target, invariants) | W3e-PR9d | AT-29 (G3 recipe deo, samo uz ODB-02 = da) | 2–3 / 1–1.5 | Evolution owner |

### W4 (8 tiketa; G2/G3)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| W4-PR1 | G2 | PermissionEnvelope tip + izračun iz postojećih izvora | — | — (TM-10; per-PR NEPOZNATO) | 3.5–4 / 1–1.5 | Capability owner |
| W4-PR2 | G2 | Resolver fasada + filterCandidates(envelope) + test read-only persona | W4-PR1 | AT-17 | 3–4 / 1.5–1.5 | Capability owner |
| W4-PR3 | G2 | Tipizovan CapabilityRequest + api_key kartica + trajni proposal store (MIG-06/08) | W4-PR2 | AT-11; AT-27 deo | 4.5–5 / 1.5–2 | Capability owner |
| W4-PR4 | G2 | BLOCKED_CAPABILITY resume na SetupCompleted | W4-PR3, W1-PR4 | AT-11 | 4–6 / 2–3 | Capability owner (hotspot: Chat owner) |
| W4-PR5 | G2 | OAuth state vezan za request + persistencija + PKCE + callback (MIG-06/08) | W4-PR4 | AT-11 deo; AT-27 deo | 3.5–4.5 / 1.5–2 | Security owner (talas: Capability owner) |
| W4-PR6 | G2 | Negativni grant / decline expiry (MIG-06/08) + revoke RED→GREEN (AT-12) | W4-PR4 | AT-12 (G2 autoritativan); AT-19 (G2 autoritativan, sa W4-PR7); AT-27 deo | 1.5–2 / 0.5–1 | Security owner (talas: Capability owner) |
| W4-PR7 | G2 | THREAT_MODEL.md dopuna + test „nema vault vrednosti u promptu/trace-u” | W4-PR4 | AT-19 (G2 autoritativan, sa W4-PR6) | 1–1.5 / 0.5–1 | Security owner |
| W4-PR8 | G3 | ActionDescriptor kao izvor istine za side-effect endpointe | — | AT-18 (G3 autoritativan) | 4–6 / 2–2.5 | Capability owner |

### W5 (7 tiketa; G2/G3)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| W5-PR1 | G2 | step payload + StepContentBlock + most per-run bus → step | W1-PR8 | AT-10 (UI deo) | 3.5–5 / 2–2.5 | UX owner; Chat owner (SSE step) |
| W5-PR2 | G2 | View-work drawer + run-status-labels.ts | W5-PR1 | FRD-05.8 View-work test (bez AT ID-a) | 3.5–5 / 2–2.5 | UX owner |
| W5-PR3 | G3 | Routines Home blok + blocked status | W1-PR11 | AT-23 deo (G3) | — (grupa) | UX owner; Durable owner |
| W5-PR4 | G3 | Nav/⌘K gating + jedan advanced prekidač (A23) + copy lint test | — | AT-17 posredno (W5 exit) | — (grupa) | UX owner |
| W5-PR5 | G3 | First-task artefakt + persona copy „role/modes” | — | — | — (grupa) | UX owner |
| W5-PR6 | G3 | Playwright/visual baseline update | W5-PR4 | — | — (grupa) | UX owner |
| W5-PR7 | G3 | axe za ?forceWizard=true rute + centralizovani stringovi | — | a11y test (W5 exit; bez AT ID-a) | — (grupa) | UX owner |

### W6 (8 tiketa; G2/G3)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| W6-PR1 | G2 | Readiness istinitost (useHasWorkingModel + ModelGate) | — | AT-20 | 3–4 / 1.5–2 | Model/Runtime owner |
| W6-PR2 | G2 | reason u ModelProbeResult + UI poruke | — | AT-20 | 1.5–2 / 0.5–1 | Model/Runtime owner |
| W6-PR3 | G2 | Tool/structured-output round-trip probe za work profil | — | AT-20 | 2–3 / 1–1.5 | Model/Runtime owner |
| W6-PR4 | G2 | Pull stream:true + NDJSON relay + resume | — | AT-20 | 3–4 / 1.5–2 | Model/Runtime owner |
| W6-PR6 | G2 | Ollama repin + katalog + /api/show arch check + certify polja | — | AT-30 deo (managed model receipt) | 3–4.5 / 1.5–2 | Model/Runtime owner |
| W6-PR7 | G2 | Hardware ladder merenja (≥3 profila) | — | AT-20 (realan Windows hardver, FRD §15) | 3.5–4.5 / 2–2.5 | Model/Runtime owner |
| W6-PR5 | G3 | WMI detection + test sa lažnim izlazom | W6-PR1, W6-PR2, W6-PR3 | — (TM-13; FRD §15 AT-20 zatvaraju W6-PR1..PR4) | — (grupa) | Model/Runtime owner |
| W6-PR8 | G3 | Wizard reorder + OpenAI-compatible preseti | W6-PR1, W6-PR2, W6-PR3 | — (TM-14) | — (grupa) | UX owner; Model/Runtime owner |

### W7 (7 tiketa; G3)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| W7-PR1 | G3 | Kanal profil tabela + evidence card po kanalu (doc) | — | — (TM-12) | 1–1 / 0.5–0.5 | Attention owner |
| W7-PR2 | G3 | WorkItem store + erasure/export (MIG-06/08) | — | AT-15 deo; AT-27 (WorkItem deo, G3 autoritativan); AT-13 (regresija) | 5–6 / 2–2.5 | Attention owner; Memory owner (erasure) |
| W7-PR3 | G3 | Sync engine izabranog ekosistema + cursor/delta + BYO OAuth client | W7-PR2 | AT-19 deo; AT-11 (regresija) | 6–8 / 2.5–3.5 | Attention owner |
| W7-PR4 | G3 | Klasifikator + labeled set tooling + eval skript | W7-PR3 | AT-24 | 5–7 / 2–3 | Attention owner |
| W7-PR5 | G3 | Home What-Needs-Me lista + akcije | — | — (TM-12) | 3–4 / 1–1.5 | Attention owner (home.ts: UX owner) |
| W7-PR6 | G3 | Convert-to-work → DurableRun sa taint | W7-PR4, W2-PR3 | AT-19 deo (G3) | 2–3 / 1–1.5 | Attention owner; Security owner |
| W7-PR7 | G3 | Drugi izvor (kalendar istog ekosistema) | W7-PR3 | — (TM-12) | 2–3 / 1–1.5 | Attention owner |

### W8 (7 tiketa; G1/G2/G3)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| W8-PR1 | G1 | Receipt entry-pointi (router npm, canary pwsh) + receipt manifest | W0-PR0 | preduslov AT-16/AT-30 (FRD §15) | 2–2 / 1–1 | Release owner |
| W8-PR2 | G2 | Crash-injection receipt skript nad packaged build-om | W1-PR4, W1-PR5 | AT-07 deo (packaged, receipt C na F2); AT-30 | 2–3 / 1–1 | Release owner |
| W8-PR3 | G3 | IM approve token tok + pairing persistencija (samo Telegram) + MIG-06/08 | — | AT-25; AT-27 deo (MIG-08 pairing) | 3–4 / 2–2.5 | Channels owner |
| W8-PR4 | G3 | Status push / rezultat rutine / forward→WorkItem (samo Telegram) | W8-PR3 | AT-25 | 1.5–2.5 / 1–1.5 | Channels owner |
| W8-PR5 | G3 | Certify: notices/SBOM asserti + packaged migracioni korak nad golden fixture-om | OSS-PR3 | AT-30 | 1.5–2 / 1–1.5 | Release owner |
| W8-PR6 | G3 | Release checklist doc + review ADR-10 | — | AT-30 (egress deo, TM-24) | 1–1.5 / 1–1 | Release owner |
| W8-PR7 | G3 | release.yml: bootstrap identitet kao zaštićen ulaz (+ promocija bez rebuild-a samo ako ADR-10-T13 padne) — uslovno, REL-BOOT | — | AT-30 | NEPOZNATO / NEPOZNATO | Release owner |

### WB (6 tiketa; G1/G3)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| WB-PR1 | G1 | Inventar tier/KVARK tabela u FRD + review ADR-08/ADR-09 | W0-PR0 | — | — (grupa) | Boundary owner |
| WB-PR2 | G1 | KVARK RED test kao it.fails (ADR-08-T3), bez registracije i gate-a | WB-PR1 | preduslov AT-26 (FRD §15) | — (grupa) | Boundary owner |
| WB-PR3 | G3 | KVARK registracija + gate (vault config i health.ok) + connect/validate/disconnect/revoke | WB-PR2 | AT-26 (G3 autoritativan) | 4–5 / 2–2.5 | Boundary owner (local/index.ts: Server owner) |
| WB-PR4 | G3 | Mrtvi tier kod + dedup čitača + session cap/embeddingProviders + GET /api/admin/overview | — | AT-27 deo (MIG-07.2) | 3–4 / 1.5–2 | Boundary owner |
| WB-PR5 | G3 | LEGACY_TIER_MAP v2 + config.json v2 + checkout.ts 400 + www/in-app copy + PRO ostaci | — | AT-27 (tier deo, G3 autoritativan) | 2–3 / 1–1.5 | Boundary owner |
| WB-PR6 | G3 | Team-sync sudbina (isolate+freeze / legacy compat) | — | AT-26 (TM-15: personal mind se ne kopira) | 2–3 / 1–1.5 | Boundary owner |

### OSS (5 tiketa; G1/G3)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| OSS-PR1 | G1 | Provenance inventar (FR-OSS-04) + Build-vs-Borrow zapis W1/W3 kandidata | W0-PR0 | — (TM-18) | — (grupa) | OSS/License owner |
| OSS-PR2 | G1 | Licencna konzistentnost lint u report modu (bez izmene LICENSE/NOTICE) | W0-PR0 | — (TM-18) | — (grupa) | OSS/License owner |
| OSS-PR3 | G3 | Notices generator + native LICENSE + ispravka EXTRACTION.md u 3 NOTICE | — | AT-30 deo (notices) | 3–4 / 1.5–1.5 | OSS/License owner |
| OSS-PR4 | G3 | License CI (blocking) + npm audit odluka | — | — (TM-18) | 2–2.5 / 1–1 | OSS/License owner |
| OSS-PR5 | G3 | Drift baseline review (maintainer) | — | — (TM-18) | 1–1.5 / 0.5–0.5 | OSS/License owner; Memory owner (maintainer) |

### B1 (1 tiketa; G2)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| B1-PR1 | G2 | Evidence card + protokol nacrt (dokumentacija) | — | — (TM-17) | 2–3 / 1–2 | Benchmark owner |

### B2 (7 tiketa; G2)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| B2-PR0a | G2 | Harbor 0.20.0 + tri image-a na bench mašini | B1-PR1 | — (TM-17) | 0.5–1 / 0.5–0.5 | Benchmark owner |
| B2-PR0b | G2 | Ruler: referentni agent + analiza odstupanja (B2-EXIT-0) | B2-PR0a | — (TM-17) | 0.5–1.5 / 0.5–1 | Benchmark owner |
| B2-PR0c | G2 | Split generisanje + hash-ovi | B2-PR0b | — (TM-17) | 0.5–0.5 / 0.5–0.5 | Benchmark owner |
| B2-PR1 | G2 | Harbor agent shim → production sidecar | W3-PR7 | AT-28 | 2.5–4 / 1–1.5 | Benchmark owner |
| B2-PR2a | G2 | Rework popravke posle B2 dev run-a (greške, kalibracija timeout-a) | B2-PR1, B2-PR3 | AT-28 | 1–3 / 0.5–1.5 | Benchmark owner |
| B2-PR2 | G2 | Razvojni run izveštaj (posle dev, re-run i validation izbora) | B2-PR2a | AT-28 | 2–3 / 1–2 | Benchmark owner |
| B2-PR3 | G2 | Konfiguracija/tuning ciljnog modela pre A/B | B2-PR0c, W6-PR6 | — (TM-17) | 5–8 / 3–5 | Benchmark owner |

### B3 (2 tiketa; G3)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| B3-PR1 | G3 | Pre-registration dokument (hash) pre gledanja test odgovora | B2-PR2 | AT-28; AT-29 | 3–5 / 1.5–2.5 | Benchmark owner |
| B3-PR2 | G3 | Rezultati + recount + poruka (DIR-23) | B3-PR1 | AT-28; AT-29 | 9–15 / 4.5–7.5 | Benchmark owner |

### INT (5 integracionih poslova; G1/G2/G3)

| Tiket | G | Naslov | Tehničke zavisnosti | AT | Procena kl. / AI | Owner |
|---|---|---|---|---|---|---|
| INT-01 | G1 | Integraciona grana integration/waggle-next sa v1.2 paketom | — | — | — (NEPOZNATO) | Odgovorni tech lead (ESK-01) |
| INT-02 | G1 | ID reconcile FRD §16.1 ↔ PRD v1.2 ↔ Delivery §7 (doc-only) | INT-01, WB-PR1 | — | 1–1 / 0.5–0.5 | NEPOZNATO (predlog: tech lead) |
| INT-03 | G2 | Hotspot integracioni testovi chat.ts/agent-loop.ts | W1-PR4, W1-PR8, W1-PR9, W3-PR2, W4-PR1 | — | 2–3 / 1–1.5 | Chat owner; Harness owner |
| INT-04 | G3 | Reconcile posle DQ-02/03/06/07 odluka (doc-only) | — | — | 0–1 / 0–0.5 | NEPOZNATO (predlog: tech lead) |
| INT-05 | G1 | Usklađivanje AGENTS.md/CLAUDE.md sa TSA-06/TSA-10 (doc-only) | INT-01 | — | — (NEPOZNATO) | Odgovorni tech lead (ESK-01) |

Zbirno: **130 redova** — 125 PR tiketa (G1 26, G2 65, G3 34; od toga W3e-PR9a..e = 5, samo uz ODB-02, i W8-PR7, samo uz REL-BOOT = da) i 5 integracionih poslova INT-01..INT-05 (G1 3, G2 1, G3 1).

<!-- GEN:OVERVIEW:END -->

---

## 2. Redosled zavisnosti

Izvor je Delivery §3 (graf i kritična putanja). Ovde je sažetak za planiranje sprintova. Tehničke zavisnosti po tiketu su u koloni „Tehničke zavisnosti” (§1) i u CSV koloni `technical_dependencies`. Obavezni redosled, kapije starta i merge-a, milestone kapije i resursi su u ostalim tipizovanim poljima (§0.1) i u redu „Spremnost” svake kartice.

### 2.1 G1 (PREDLOG — planerski smer; ratifikacija RAT-01)

```
INT-01 (integraciona grana) ─► W0-PR0 (CI za integration/**)
  ├─► Harness lane:  W0-PR1 → W0-PR7 → W0-PR8 → W0-PR9          (sequence_after, nije tehnička zavisnost: kritična putanja „serijski 3–4 rd”, Delivery §3)
  │                   W0-PR1 + W0-PR8 ─► W0-PR2, W0-PR3          (vidljivost F-HARN-02/03, W0 „Rizik”)
  │                   W0-PR4, W0-PR5                              (nezavisni u lane-u)
  │                   W0-PR7 + W0-PR19 ─► W0-PR6                  (resolver + golden fixture)
  ├─► Memory lane:   W0-PR10 ; W0-PR11 ─► W0-PR18                 (W0-PR11 pre PR18, Delivery §3)
  │                   W0-PR19 (golden fixture, generisan na 2af0904d) ─► W0-PR6, W0-PR18   (Delivery §3)
  │                   [„W0-PR19 pre W0-PR11” samo ako osnivač tako reši otvoren LOW nalaz]
  ├─► Boundary+Release lane: W0-PR12, W0-PR13, W0-PR15, W0-PR16, W0-PR17
  │                   WB-PR1 ─► WB-PR2 (samo it.fails) ; OSS-PR1, OSS-PR2 ; W8-PR1
  ├─► Durable-probe lane: W0-PR14
  ├─► Server lane (1.2.1): W0-PR20                                (izolacija dataDir-a; nezavisan, samo ivica W0-PR0)
  └─► INT-02 (ID reconcile, doc-only; posle WB-PR1) ─► F1 freeze (I + P + R; ODB-01) ─► [RAT-01] zatvaranje G1
```

Napomena: Delivery §3 kaže „W0-PR19 pre PR6/PR18”, a ne pre W0-PR11. Otvoren LOW nalaz (`finish/checklist/f1/13`) traži ili izuzetak za `w0/*` worktree na `2af0904d` ili W0-PR19 pre W0-PR11 ([WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md)). Dijagram crta ivice iz Delivery §3 (`─►`; u CSV-u `technical_dependencies`); W0-PR10 ne koristi fixture. Red „Harness lane” sa strelicom `→` je obavezni redosled rada W0-PR1 → W0-PR7 → W0-PR8 → W0-PR9 (Delivery §3 kritična putanja „W0 (PR1/PR7/PR8/PR9 serijski 3–4 rd)”), a ne tehnička zavisnost: u CSV-u je `sequence_after` (W0-PR7 posle W0-PR1, W0-PR8 posle W0-PR7, W0-PR9 posle W0-PR8), pa ga tracker poštuje kao blokadu početka (§0.1). Redosled „W0-PR19 pre W0-PR11” zavisi od founder odgovora na LOW nalaz ([00-START-HERE.md](00-START-HERE.md) §6 pitanje (b); ovde §6 „Pre dana 1” t.3) i nije ivica u CSV-u. Ako osnivač izabere tu varijantu, W0-PR11 dobija `W0-PR19` u `merge_gates` (registar, kapija `finish/checklist/f1/13`).

### 2.2 G2 (PREDLOG; ratifikacije RAT-02..RAT-07 u Delivery §6.1)

- **Kritična putanja (Delivery §3):** W1-PR1 → [RAT-02] W1-PR2 → W1-PR3 → W1-PR4 → W3-PR2 (posle W3-PR1 + [RAT-03], i W2-PR1 + [RAT-04]) → W3-PR3 → W3-PR4 ‖ W3-PR5 → W3-PR6 (+ W1-PR7) → W3-PR7 → B2-PR1 → B2 dev run (wall-clock, nije tiket) → B2-PR2a → re-run (nije tiket) → validation run (nije tiket) → B2-PR2 → **F2** (R + P + A + C + interni I; ODB-01). Zbir lanca: **36.5–57 rd**.
- **Pre W1-PR2 apply-a:** W1-PR13 (MIG-09 runner) i W1-PR15 (revocation ledger) teku u zasebnim worktree-jima paralelno sa W1-PR1.
- **W1-PR14** (MIG-08 `ExecutionErasure`) je merge-preduslov za W1-PR7, W1-PR11, W3e-PR1, W4-PR3, W4-PR5, W4-PR6 (u G3 i W8-PR3).
- **Tipizovano (1.2.1):** W1-PR13/PR14/PR15 kao merge-preduslov su u `merge_gates` (W1-PR2, W1-PR7, W1-PR11, W3e-PR1, W4-PR3, W4-PR5, W4-PR6; G3: W8-PR3), pa priprema u grani sme da počne ranije; „pre B2 dev run-a” je `merge_before:B2-DEVRUN` (W2-PR1, W2-PR3, W2-PR4, W2-PR6, W3e-PR1, W6-PR6, B2-PR1, B2-PR3); B2-PR2a je `start_after:B2-DEVRUN`, a B2-PR2 `start_after:B2-VALRUN`; G2 hotspot integracioni testovi su INT-03.
- **Pre B2 dev run-a moraju biti merge-ovani** W2-PR3/PR4/PR6 i svi W3e PR-ovi koji menjaju persona resolution ili prompt put. Najkasnije pre F2, inače se P receipt ponavlja.
- **Najkasniji datumi odluka:** DQ-04 ≈ 16 rd od starta G2 (LoCoMo gate W2-PR3, B2-PR0), DQ-05 ≈ 20 rd (W6-PR6 → B2-PR3). Posle toga svaki dan pomera G2 1:1.
- **Paralelno, van kritične putanje:** W2-PR1..PR10, W1-PR5..PR15, W3e-PR1..PR8, W4-PR1..PR7, W5-PR1/PR2, W6-PR1..PR4/PR6/PR7, W8-PR2, B1-PR1, B2-PR0a/b/c, B2-PR3, W3-PR8.
- **Serijski G1 → G2 (PREDLOG, konzervativno):** W1 lanac počinje posle kraja G1, uključujući F1. Dozvoljeno preklapanje W1-PR1 spike-a i W1-PR13/PR15 sa repom G1 skratilo bi granice za ≤ 1 nedelju, ali plan ga ne primenjuje (Delivery §4.3).

### 2.3 G3 (PREDLOG; zavisi od DQ-02/03/06/07/08 pre starta G3, RAT-08, RAT-09, ODB-02)

- W7-PR1..PR7 (DQ-06; serijski deo W7-PR2 → PR3 → PR4 → PR6), W8-PR3 → W8-PR4 (DQ-07), W4-PR8, W5-PR3..PR7 (W5-PR3 posle W1-PR11), W6-PR5/PR8 (posle W6-PR1..PR3).
- OSS-PR3/PR4/PR5 (DQ-02) → W8-PR5; ~~~~ WB-PR5/PR6 (DQ-03; WB-PR6 i posle RAT-08); [RAT-09] W8-PR6; W3e-PR9a..e samo uz ODB-02 = da (preporuka PREDLOG: da, opcija A; ČEKA ODLUKU OSNIVAČA; Delivery §6.1 „ODB-02 — opcije”).
- B3-PR1 (posle F2) → B3 izvršenje (10–20 rd wall-clock, PREDLOG placeholder, NEPOZNATO) → B3-PR2 → F2→F3 benchmark carry-forward review → **F3a** nad `S` → kontrolisani korak K (founder-odobren fast-forward `main` → `S` + tag → hosted potpis, bez publikacije) → **F3b** nad potpisanim `A_sig` → GO odluka (DQ-01) → promocija istog `A_sig` (Delivery §5.1). Tag push-uje samo vlasnik repoa u koraku K uz pisano founder odobrenje; tim ga ne push-uje (DP-0.11, DP-0.12). U CSV-u: B3-PR1 `start_after:F2` i `merge_before:B3-RUN`; B3 izvršenje je događaj `B3-RUN`; B3-PR2 `start_after:B3-RUN`; F3 lanac je `F3-SRC` (zamrznut source SHA kandidata; svi G3 tiketi `merge_before:F3-SRC`; kapije `REL-BOOT` i `REL-T13` zatvorene) → `F2F3-CFR` → `F3` (F3a) → `K-SIGN` → `F3b` → `PUBLIC-GO` (registar; Delivery §5.1, H-09). Reconcile posle DQ odluka je INT-04.

---

## 3. G1 tiketi — pune kartice

Svaka kartica važi tek posle founder odobrenja plana. Zajednički uslovi za **sve** G1 tikete (ne ponavljaju se u karticama):
- Grana `w0/<tema>` (ili `wb/`, `oss/`, `w8/`) iz `integration/waggle-next`, u sopstvenom worktree-ju (DP-0.05). Nikad `main`.
- Env izolacija po checklisti: `WAGGLE_DATA_DIR=<scratch>/data-<agent>`, `WAGGLE_PORT≠3333`, `PORT≠3100`, `WAGGLE_DESKTOP_PORT_FALLBACK` unset, `HIVE_MIND_DATA_DIR` isti izolovani dir, `WAGGLE_SIGNAL_EMIT=0`, bez Stripe/channel/Clerk/PostHog ključeva (DP-0.08, DP-0.10). Sidecar/web/E2E, hook/launch/canary, root suite do merge-a W0-PR20 i svaki run koda revizije `2af0904d` idu samo u BTP-u (checklist „Bezbedan test profil (BTP)”).
- Node `22.23.2`. Gates iz DP-0.06 zeleni lokalno pre review-a i na integracionoj grani posle merge-a.
- Tiketi koji diraju `apps/web/**` (po karticama: W0-PR9 `EvolutionTab.tsx`, W0-PR12, W0-PR16, W0-PR17) uz četiri gate-a pokreću i `npm run typecheck:web` i `npm run test -w apps/web`. Root `vitest.config.ts:43` isključuje `apps/**`, pa `npm run test` ne pokreće web testove kao što su `posthog.test.ts`, `OnboardingWizard.test.tsx`, `p1a-routes.test.ts`, `command-catalog.test.ts` i `EvolutionTab.test.tsx` (svi postoje na `2af0904d`; POTVRĐENO NA REVIZIJI). Bez ove dve komande „gates zeleni” ne dokazuje RED→GREEN za web deo. Ostale dopunske provere po dodirnutoj površini: [02-WORKING-AGREEMENT.md](02-WORKING-AGREEMENT.md) §6.3.
- G1 exit (m): svi gates DP-0.06 zeleni na integracionoj grani. G1 exit (l) i F1 su posle svih G1 tiketa (§6).
- Procena: kartica navodi broj iz Delivery §4.1.1. Gde plan daje samo zbir grupe, navedena je grupa.

### W0-PR0 — CI filteri za `integration/**`

- **Cilj:** integraciona grana dobija CI pre bilo kog drugog PR-a (DP-0.07, G1 exit (h)).
- **Obim — u:** dodati `integration/**` u `on.push.branches` i `on.pull_request.branches` u `ci.yml` (danas `[main]`, `ci.yml:3-6`) i isto u `tauri-build-pr.yml`.
- **Obim — van:** `release.yml` se ne dira. Nema izmena GitHub podešavanja (rulesets, environments, varijable) ni ručnog pokretanja workflow-a (DP-0.11). Nema `v*` tagova (DP-0.12).
- **Fajlovi (postoje na `2af0904d`):** [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`.github/workflows/tauri-build-pr.yml`](../../.github/workflows/tauri-build-pr.yml).
- **RED prvo:** plan navodi „—” (nema unit testa). Provera (PREDLOG): PR prema `integration/waggle-next` pre izmene ne okida CI, posle izmene okida `ci.yml` i `tauri-build-pr.yml`.
- **Prihvatanje:** G1 exit (h). `git diff` sadrži samo filtere grana u dva fajla. `release.yml` je bajt-identičan baseline-u.
- **Dokaz:** F-REL-10 — [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.md). POTVRĐENO NA REVIZIJI (`ci.yml:3-6` ponovo pročitan 29.09.2026).
- **Rizici:** više CI runova troši Actions budžet (kontekst DP-0.12). Windows lane `tauri-build-pr.yml` traje duže.
- **Rollback:** revert PR-a. Nema podataka.
- **Procena:** grupa W0-PR0+PR12+PR13+PR15+PR16 = 1–1.5 / 0.5–1 (klasično / AI). Otvoren LOW nalaz (`finish/estimates/f1/02`): grupa je potcenjena za ≈0.5–1 klasičan i ≤0.5 AI dan, bez promene nedelja.
- **Owner:** NEPOZNATO. W0 „Owner/uloga” ne imenuje F-REL-10. Predlog: Release owner. **Receipts:** nema (CI konfiguracija).
- **Spremnost (iz backlog.csv):** tehničke: INT-01 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2 · milestone: merge_before:F1 · resursi: lane:integracija

### W0-PR1 — Verify default fail-closed

- **Cilj:** verify faza se nikad ne preskače tiho (F-HARN-01; FRD-05.1; DIR-03/07).
- **Obim — u:** `shouldSkipVerify` (`workflow-harness.ts:474-482`) preskače verify samo kad je `WAGGLE_AUTO_VERIFY==='0'` ili postoji eksplicitna run opcija. `catch → false`. Novi event `harness:phase:skipped`. `getRunSummary` (`:424`) prikazuje „Completed (verify skipped)” samo za eksplicitan opt-out van strict-a (FRD-05.9 R5, red N8); golo „Completed” uz preskočen verify ne postoji. Unifikacija sa mrtvim `FEATURE_FLAGS.VERIFIER_AUTO_RUN` (`feature-flags.ts:26`, 0 konzumenata).
- **Obim — van:** durable executor (W1-PR4), `ProofReceipt` (W1-PR7), strict režim kao podrazumevani (ADR-01, W3).
- **Fajlovi:** [`packages/agent/src/workflow-harness.ts`](../../packages/agent/src/workflow-harness.ts) (`:313`, `:424`, `:474-482`), [`packages/agent/src/feature-flags.ts`](../../packages/agent/src/feature-flags.ts) (`:26`). Hotspot: `workflow-harness.ts` → Harness owner (DP-0.14).
- **RED prvo:** run bez `WAGGLE_AUTO_VERIFY` stiže do verify faze. Fajl: [`packages/agent/tests/workflow-tools-harness.test.ts`](../../packages/agent/tests/workflow-tools-harness.test.ts). **Prepisati** `:135-179`, koji se oslanja na auto-skip, u istom PR-u. Dodatni RED (FRD-05.9 N8): sa `WAGGLE_AUTO_VERIFY==='0'` verify je `skipped`, `completed=true`, a `getRunSummary` sadrži „Completed (verify skipped)”, nikad golo „Completed”.
- **Prihvatanje:** AT-01 (G1 deo, zajedno sa W0-PR2). G1 exit (a): `getRunSummary` nikad ne prikazuje golo „Completed” uz preskočen verify; jedina dozvoljena oznaka je „Completed (verify skipped)” za eksplicitan opt-out van strict-a (FRD-05.9 R5, N8). Env `WAGGLE_AUTO_VERIFY` nije postavljen u testu.
- **Dokaz:** F-HARN-01 (HOLDS) — [harness.md](../plans/v1.2-evidence/phaseA/harness.md), [harness.refute.md](../plans/v1.2-evidence/phaseA/harness.refute.md). POTVRĐENO NA REVIZIJI (`shouldSkipVerify` vraća `true` bez env-a; ponovo pročitano 29.09.2026).
- **Rizici:** verify sada radi u svakom harness run-u, pa rastu latencija i trošak tokena. F-HARN-02/03 postaju vidljivi tek posle PR1 i PR8, pa je redosled PR1 → PR8 → PR2/PR3 (W0 „Rizik”).
- **Rollback:** revert PR-a. Nema podataka.
- **Procena:** grupa W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner. **Receipts:** I (SHA integracione grane).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, handoff/newcomer/r2/08 · milestone: merge_before:F1 · resursi: lane:harness, hotspot:workflow-harness

### W0-PR2 — `VERDICT` vrednost u gate-u

- **Cilj:** `VERDICT: FAIL` ruši fazu, a CONDITIONAL nije PASS (F-HARN-02; FRD-05.5).
- **Obim — u:** `passed = verdict === 'PASS'`. `GateResult.verdict`. CONDITIONAL podrazumevano `passed:false` + `reason` + opcioni per-phase `conditionalPolicy`; u G1 se implementira samo default `require_supplement` (FRD-05.9 N3 default), a pod strict flag-om iz W0-PR8 nijedna politika ne daje `completed=true` (S3). Putanje `complete_with_limitation`/`require_user_review` do „COMPLETED sa upozorenjima” = W3-PR6. Verdict se upisuje u checkpoint i `HarnessPhaseCompleteEvent`.
- **Obim — van:** CONDITIONAL politika po recipe-u (W3-PR6), pragovi (DQ-09).
- **Fajlovi:** [`packages/agent/src/builtin-harnesses.ts`](../../packages/agent/src/builtin-harnesses.ts) (`:43-51`, `:125-128`).
- **RED prvo:** FAIL → faza pada; CONDITIONAL → nije PASS; izostao VERDICT → nije PASS. Fixture iz FRD §15 AT-01: `research-verify` sa FAIL/CONDITIONAL/no-VERDICT; repro `repro-harness.mjs` 02a–d. Fajl: plan ga ne imenuje, a `builtin-harnesses` test ne postoji na `2af0904d`. PREDLOG: nov `packages/agent/tests/builtin-harnesses-verdict.test.ts` ili proširenje `workflow-tools-harness.test.ts`. Dodatno (FRD-05.9 G1 podskup): CONDITIONAL sa default politikom → run nije `completed` (N3); strict flag + CONDITIONAL sa bilo kojom `conditionalPolicy` → run nije `completed` (S3); izostao VERDICT = FAIL (R3).
- **Prihvatanje:** AT-01 (G1 deo). Tri RED slučaja i dva dodatna FRD-05.9 slučaja (N3 default, S3) prolaze posle GREEN-a. Postojeći PASS put ostaje zelen.
- **Dokaz:** F-HARN-02 — [harness.md](../plans/v1.2-evidence/phaseA/harness.md); repro [repro-harness.mjs](../plans/v1.2-evidence/phaseA/repro-harness.mjs).
- **Rizici:** harness-i koji danas „prolaze” uz CONDITIONAL počinju da padaju. To je željeno ponašanje, ali menja ishod chat turna.
- **Rollback:** revert PR-a.
- **Procena:** grupa W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner. **Receipts:** I (SHA).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0, W0-PR1, W0-PR8 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: merge_before:F1 · resursi: lane:harness

### W0-PR3 — Exit code se ne gubi

- **Cilj:** nenulti exit nije uspeh. Test/build gate prolazi samo na server-posmatranom pozivu odobrenog validatora (FRD-05.2 „Validator invocation”, VI-1..VI-9), a ne na tekstu komande, tekstu izlaza ni izjavi modela (F-HARN-03, F-HARN-08; H-08).
- **Obim — u:** `system-tools.ts:684-691` uvek vraća `Exit code: N` (ili strukturisan `{ok:false, exitCode}`). `tool-executor.ts` postavlja `succeeded=false` na nenulti exit. Server `bash` izvršilac predaje strukturisan zapis `{executor, argv, cwd, exitCode, timedOut, background, executorError}` do observed ledger-a (W0-PR8 provider); `onToolResult` danas prima samo tekst (`chat-agent-run.ts:214`), a parsiranje teksta `Exit code: N` nije izvor. `approvedValidators` G1 lista za `code-review-fix` (VI-1). Gate verify faze `code-review-fix` zamenjuje `hasToolCalls(['bash','Bash','run_command'])` pravilima VI-2..VI-8: tačan izvršilac, `argv` tačno jednak odobrenom, `cwd` = koren workspace-a, exit iz metapodataka procesa, svežina posle poslednje izmene. Regex komande sme ostati samo kao nagoveštaj u `reason`/`warnings` (VI-9). Bez univerzalnog shell interpretera.
- **Obim — van:** trajni RunEvent journal kao izvor (W1-PR7); pun FRD-05.9 ishod po režimima (W3-PR6); poseban argv izvršilac bez shell-a i parseri rezultata (VI-6) — ODLOŽENO, bez tiketa; proširenje liste validatora po workspace-u — ODLOŽENO.
- **Fajlovi:** [`packages/agent/src/system-tools.ts`](../../packages/agent/src/system-tools.ts) (`:598-627`, `:681-691`), [`packages/agent/src/tool-executor.ts`](../../packages/agent/src/tool-executor.ts) (`:285-298`), [`packages/agent/src/builtin-harnesses.ts`](../../packages/agent/src/builtin-harnesses.ts) (`:13-24`, `:176-182`), [`packages/agent/src/workflow-harness.ts`](../../packages/agent/src/workflow-harness.ts) (`:76`), [`packages/server/src/local/routes/chat-agent-run.ts`](../../packages/server/src/local/routes/chat-agent-run.ts) (`:214-225`, zajedno sa W0-PR8). Nov modul za pravila VI-1..VI-8: PREDLOG putanja `packages/agent/src/validator-invocation.ts` (na `2af0904d` ne postoji; pre kreiranja grep, CLAUDE.md §3.6).
- **RED prvo:** po jedan slučaj za AT-02-N1..N15 iz FRD-05.2: nijedan nije PASS, uključujući `echo "npm test"`, `echo "pytest"`, `npm test || true` i `npm test; exit 0` sa testom koji pada, kao i `npm test` sa exit 1 čiji izlaz lažno tvrdi `Exit code: 0`. `Exit code: 1` → fail. Repro `repro-harness.mjs` 03a–c, 08a. GREEN: AT-02-P1 i P2 prolaze. Fajlovi: [`packages/agent/tests/system-tools.test.ts`](../../packages/agent/tests/system-tools.test.ts) (`:365-370` ostaje zelen jer koristi `toContain('err')`); gate deo u novom `packages/agent/tests/builtin-harnesses.test.ts` (ADR-01-T3) i novom `packages/agent/tests/validator-invocation.test.ts` (PREDLOG putanje).
- **Prihvatanje:** AT-02 (G1; jedini talas, zajedno sa W0-PR4) i ADR-01-T3. Nenulti exit daje `succeeded=false` i pad gate-a. Svih 17 primera AT-02 (P1–P2, N1–N15) daje verdikt iz FRD-05.2. Runtime potvrda do tada nije urađena.
- **Dokaz:** F-HARN-03 — [harness.md](../plans/v1.2-evidence/phaseA/harness.md), [harness.refute.md](../plans/v1.2-evidence/phaseA/harness.refute.md) (korekcija putanja: `packages/agent/src/`, ne `server/src/local/`).
- **Rizici:** alati koji danas vraćaju prazan izlaz uz nenulti exit menjaju ishod turna. Projekti čija test komanda nije na G1 listi dobijaju `validator_not_observed` dok se lista ne proširi. Obim je veći od prvobitnog (strukturisan zapis izvršioca + VI pravila); procena grupe W0-PR1..PR8 nije ponovo računata, pa je tech lead potvrđuje pri planiranju sprinta.
- **Rollback:** revert PR-a.
- **Procena:** grupa W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner. **Receipts:** I (SHA).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0, W0-PR1, W0-PR8 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, handoff/newcomer/r2/08 · milestone: merge_before:F1 · resursi: lane:harness, hotspot:workflow-harness

### W0-PR4 — `run_harness` izlazi iz `VERIFICATION_TOOL_EXACT`

- **Cilj:** poziv `run_harness` sam po sebi nije dokaz verifikacije (F-HARN-04).
- **Obim — u:** ukloniti `'run_harness'` iz `VERIFICATION_TOOL_EXACT`. Gate prima `{name, succeeded}`; agent-loop već ima `r.succeeded`.
- **Obim — van:** D3 disclose na budget stop-u (W0-PR5).
- **Fajlovi:** [`packages/agent/src/verification-gate.ts`](../../packages/agent/src/verification-gate.ts) (`:25-39`, `:220-239`), [`packages/agent/src/agent-loop.ts`](../../packages/agent/src/agent-loop.ts) (`:1826`). Hotspot `agent-loop.ts` → Harness owner.
- **RED prvo:** regresioni test u [`packages/agent/tests/verification-gate.test.ts`](../../packages/agent/tests/verification-gate.test.ts): turn sa samo `run_harness` (ili neuspešnim alatom) ne prolazi verification gate. Nijedan postojeći test ne koristi `run_harness` u `toolsUsed`.
- **Prihvatanje:** AT-02 (G1). Posle GREEN-a D3 se okida na `run_harness`-only turnu, što je željeno po DIR-07.
- **Dokaz:** F-HARN-04 (poreklo `9fce1d2f`, bez odluke) — [harness.md](../plans/v1.2-evidence/phaseA/harness.md).
- **Rizici:** više D3 disclosure poruka u chatu.
- **Rollback:** revert PR-a.
- **Procena:** grupa W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner. **Receipts:** I (SHA).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, handoff/newcomer/r2/08 · milestone: merge_before:F1 · resursi: lane:harness, hotspot:agent-loop

### W0-PR5 — Budget stop: disclose-only + `budgetStop` meta

- **Cilj:** budget stop ne stvara uspeh (F-HARN-05; FRD-05.6; DIR-08).
- **Obim — u:** D3 u „disclose-only” modu pre `budgetStopResponse` (`agent-loop.ts:895`). `budgetStop:true` u `AgentResponse` meta.
- **Obim — van:** `Checkpoint.spent` koji preživljava restart. To je W1-PR4, autoritativan za AT-03 (G2).
- **Fajlovi:** [`packages/agent/src/agent-loop.ts`](../../packages/agent/src/agent-loop.ts) (`:1507-1550`, `:895-920`), [`packages/agent/src/loop-gates.ts`](../../packages/agent/src/loop-gates.ts) (`:697`, `:902-935`). Hotspot `agent-loop.ts`/`loop-gates.ts` → Harness owner.
- **RED prvo:** [`packages/agent/tests/verification-gate-loop.test.ts`](../../packages/agent/tests/verification-gate-loop.test.ts): mali `maxTokenBudget` + sadržaj „All tests pass” → odgovor nosi disclose sufiks i `budgetStop:true`, bez tvrdnje o proveri. `agent-loop-budget.test.ts` exact asserti ne matchuju `SUCCESS_ASSERTION` i ne lome se.
- **Prihvatanje:** AT-03 deo (G1: disclose-only + `budgetStop` meta).
- **Dokaz:** F-HARN-05 — [harness.md](../plans/v1.2-evidence/phaseA/harness.md), [harness.refute.md](../plans/v1.2-evidence/phaseA/harness.refute.md).
- **Rizici:** hot path `agent-loop.ts`. Dva PR-a na istom hotspot-u se ne merge-uju isti dan bez integracionog testa (DP-0.14).
- **Rollback:** revert PR-a.
- **Procena:** grupa W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner. **Receipts:** R (budget putanja), I (SHA).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, handoff/newcomer/r2/08 · milestone: merge_before:F1 · resursi: lane:harness, hotspot:agent-loop

### W0-PR6 — Bridge istinitost bez šeme + MIG-04(A)

- **Cilj:** harness trag više ne tvrdi `verified` bez dokaza i ne ulazi u pozitive eval skupa (F-HARN-06; MIG-04(A)).
- **Obim — u:** posle `harness:phase:complete` trag dobija `outcome:'pending'` + tag `gate_passed` u `tags[]` (kao MIG-04(A) i ADR-01-P2). Nikad `'success'`, jer je `success` u podrazumevanim `positiveOutcomes`. `ok: tc.ok ?? null`, bez fabrikovanog `durationMs:0`, uz prosleđivanje `output.durationMs`. `eval-dataset` filter isključuje tag `gate_passed` iz pozitiva. `local/index.ts:612` prosleđuje resolver kad eventi dobiju `runId` (W0-PR7). Migracioni korak MIG-04(A): istorijski redovi `task_shape LIKE 'harness:%' AND outcome='verified'` dobijaju tag „unqualified”, bez brisanja.
- **Obim — van:** enum `gate_passed` u `execution_traces`. Zbog CHECK constraint-a to je SQLite table-rebuild, pa ide u W1-PR7.
- **Fajlovi:** [`packages/agent/src/harness-trace-bridge.ts`](../../packages/agent/src/harness-trace-bridge.ts) (`:91`, `:125-148`), [`packages/agent/src/eval-dataset.ts`](../../packages/agent/src/eval-dataset.ts) (`:208`), [`packages/agent/src/trace-recorder.ts`](../../packages/agent/src/trace-recorder.ts) (`:281`, `:288`, hardkodovan `ok:true`), [`packages/server/src/local/index.ts`](../../packages/server/src/local/index.ts) (`:612`, `new HarnessTraceBridge` — ponovo pročitano). Hotspot `local/index.ts` → Server owner.
- **RED prvo:** trag posle `harness:phase:complete` ima `outcome:'pending'` + tag `gate_passed` i nije u pozitivima `EvalDatasetBuilder.build()`. Fajlovi: [`packages/agent/tests/harness-trace-bridge.test.ts`](../../packages/agent/tests/harness-trace-bridge.test.ts) (**prepisati** `:82-92`, `:327`, koji pinuju `'verified'`), [`packages/agent/tests/eval-dataset.test.ts`](../../packages/agent/tests/eval-dataset.test.ts). Migracija: Klasa A test nad golden fixture-om W0-PR19. Drugo pokretanje je no-op.
- **Prihvatanje:** AT-27 deo (MIG-04(A), Klasa A). Migracija po DP-0.09: kopija izolovanog dataDir-a, snapshot + `manifest.json` (MIG-00.3) sa izvozom postojećeg `erased_subjects` ledger-a, dry-run izveštaj, poništavanje uklanjanjem taga po sentinelu. `schemaVersion`/downgrade = „n/a — bez šeme”.
- **Dokaz:** F-HARN-06 (WEAKENED na nivou minimalChange) — [harness.md](../plans/v1.2-evidence/phaseA/harness.md), [harness.refute.md](../plans/v1.2-evidence/phaseA/harness.refute.md); [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.md) MIG-04.
- **Rizici:** eval skup za evoluciju gubi „pozitive” iz harness tragova. To je namerno i menja ulaz W3e. Restore `personal.mind` iz snapshot-a u G1 nije testirana putanja; izvodi se samo uz eksplicitno founder odobrenje.
- **Rollback:** revert koda. Tagovi su aditivni i stari kod ih ignoriše (Klasa A).
- **Procena:** grupa W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner (MDQ-06 = inženjerska odluka Harness/Evolution owner-a). **Receipts:** I (SHA).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0, W0-PR7, W0-PR19 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2, finish/checklist/f1/13 · milestone: merge_before:F1 · resursi: lane:harness, hotspot:server-index

### W0-PR7 — Aditivni `runId` u harness eventima

- **Cilj:** dva run-a su razlučiva u eventima i tragovima (F-HARN-07, F-DUR-08).
- **Obim — u:** `runId` aditivno u `HarnessRunState`. `createHarnessRun(harness, {runId, workspaceId?, sessionId?})`. `runId` u sva tri payload-a. `run_harness` prosleđuje `run_id`. `WorkflowToolsConfig` dobija session i workspace.
- **Obim — van:** per-run bus i izolacija konteksta (W1-PR8, W2-PR1). Oni zatvaraju AT-06 u G2.
- **Fajlovi:** [`packages/agent/src/workflow-harness.ts`](../../packages/agent/src/workflow-harness.ts) (`:132-135`, `:169-207`, `:213`), [`packages/agent/src/workflow-tools.ts`](../../packages/agent/src/workflow-tools.ts) (`:39-51`, `:364-375`). Hotspot → Harness owner.
- **RED prvo:** dva run-a istog harness-a (`document-draft`) → različit `runId` u sva tri payload-a (repro 07a–b). Fajl: `workflow-tools-harness.test.ts` (PREDLOG). `harness-trace-bridge.test.ts:146-156` koristi `toContain` i ne lomi se.
- **Prihvatanje:** AT-06 deo (G1).
- **Dokaz:** F-HARN-07, F-DUR-08 (HOLDS; DELIMIČNO/NEPOVEZANO) — [harness.md](../plans/v1.2-evidence/phaseA/harness.md), [durable.md](../plans/v1.2-evidence/phaseA/durable.md).
- **Rizici:** nizak (aditivno polje).
- **Rollback:** revert PR-a.
- **Procena:** grupa W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner. **Receipts:** I (SHA).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: W0-PR1 · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, handoff/newcomer/r2/08 · milestone: merge_before:F1 · resursi: lane:harness, hotspot:workflow-harness

### W0-PR8 — Self-reported dokaz označen

- **Cilj:** gate razlikuje dokaz koji je server video od dokaza koji je model prijavio (F-HARN-08; FRD-05.3).
- **Obim — u:** `PhaseOutput.toolCalls` dobija `selfReported:true`. Strict režim (za sada opt-in flag) odbija self-reported dokaz. `WorkflowToolsConfig.observedToolCalls(sinceMarker)` je provider koji server puni iz `onToolResult` (`chat-agent-run.ts:214-225`). Pod strict flag-om `shouldSkipVerify()` vraća `false` bez obzira na `WAGGLE_AUTO_VERIFY` ili run opt-out (FRD-05.9 R5, S5); odbijen opt-out se beleži kao upozorenje.
- **Obim — van:** strict kao podrazumevani režim (ADR-01, W3); observed journal u run store-u (W1).
- **Fajlovi:** [`packages/agent/src/workflow-tools.ts`](../../packages/agent/src/workflow-tools.ts) (`:330-358`, `:412-422`), [`packages/server/src/local/routes/chat-agent-run.ts`](../../packages/server/src/local/routes/chat-agent-run.ts). Hotspot `chat-agent-run.ts` → Chat owner. Plus [`packages/agent/src/workflow-harness.ts`](../../packages/agent/src/workflow-harness.ts) (`:474-482`, strict flag u `shouldSkipVerify`; hotspot → Harness owner).
- **RED prvo (strict):** izmišljeni `tool_calls` → gate pada. Fajl: `workflow-tools-harness.test.ts`; prelazni pristup ne lomi `:82-106`. Dodatni RED (FRD-05.9 S5): strict flag + `WAGGLE_AUTO_VERIFY==='0'` → verify se izvršava; run nije `completed` dok verify ne prođe.
- **Prihvatanje:** AT-01 (G1 deo: FRD-05.9 S4 self-reported i S5 opt-out pod strict flag-om; FRD §15 kolona „Wave” navodi W0-PR8 od revizije 1.2.1) i AT-02 kroz G1 exit (a), koji traži F-HARN-08 RED→GREEN.
- **Dokaz:** F-HARN-08 — [harness.md](../plans/v1.2-evidence/phaseA/harness.md).
- **Rizici:** dirni hot path `chat-agent-run.ts`.
- **Rollback:** revert PR-a. Flag je opt-in.
- **Procena:** grupa W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner (hotspot review: Chat owner). **Receipts:** I (SHA).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: W0-PR7 · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, handoff/newcomer/r2/08 · milestone: merge_before:F1 · resursi: lane:harness, hotspot:workflow-harness, hotspot:chat

### W0-PR9 — Persona shadowing, zatim activation check

- **Cilj:** deploy-ovan override stvarno ulazi u sledeći prompt, a UI ne tvrdi aktivaciju koje nema (F-EVO-01, F-EVO-10; AT-04 minimum).
- **Obim — u:** `listPersonas()` kao Map po `id`, custom poslednji (override zamenjuje ugrađenu). Isti resolver u `fleet-run-executor.ts:127,590`, `agent-groups.ts:87`, `fleet.ts:354`. **Zatim** F-EVO-10 u istom PR-u: activation check pre `markDeployed`; ako resolver ne vraća override, status je `written_not_active`. Ukloniti „score-verified” copy.
- **Obim — van:** active-version pointer, rollback ruta i pinned verzija. To je W3e-PR1, autoritativan za AT-04 (G2).
- **Fajlovi:** [`packages/agent/src/personas.ts`](../../packages/agent/src/personas.ts) (`:67-70`), [`packages/server/src/local/routes/chat.ts`](../../packages/server/src/local/routes/chat.ts) (`:439-440`), [`packages/server/src/local/routes/evolution.ts`](../../packages/server/src/local/routes/evolution.ts) (`:51-82`), [`apps/web/src/components/os/apps/memory/EvolutionTab.tsx`](../../apps/web/src/components/os/apps/memory/EvolutionTab.tsx) (`:191-249`, `:759-771`, `:883`), [`packages/server/src/local/fleet-run-executor.ts`](../../packages/server/src/local/fleet-run-executor.ts), [`packages/server/src/local/routes/agent-groups.ts`](../../packages/server/src/local/routes/agent-groups.ts), [`packages/server/src/local/routes/fleet.ts`](../../packages/server/src/local/routes/fleet.ts). Hotspot `chat.ts` → Chat owner.
- **RED prvo:** kroz `resolvePersona`/`buildSystemPrompt`, **ne** kroz `listPersonas().find(id && includes)`. Fixture iz FRD §15: deploy `coder` override + `POST /api/chat`. Repro [repro-shadow.mjs](../plans/v1.2-evidence/phaseA/repro-shadow.mjs). Fajlovi: [`packages/server/tests/evolution-routes.test.ts`](../../packages/server/tests/evolution-routes.test.ts) (**prepisati** `:169-188`, koji pinuje `deployed`), [`packages/agent/tests/personas.test.ts`](../../packages/agent/tests/personas.test.ts). `personas.test.ts:43-47` i `personas-routes.test.ts:121-140` ne lome se.
- **Prihvatanje:** AT-04 minimum (G1): sledeći stvarni prompt sadrži override; bez override-a status je `written_not_active`. G1 exit (b).
- **Dokaz:** F-EVO-01, F-EVO-10 (HOLDS) — [evolution.md](../plans/v1.2-evidence/phaseA/evolution.md), [evolution.refute.md](../plans/v1.2-evidence/phaseA/evolution.refute.md).
- **Rizici:** menja persona resolution na 4 mesta, pa je P receipt obavezan na F1. Redosled F-EVO-01 → F-EVO-10 je obavezan u istom PR-u.
- **Rollback:** revert PR-a. Override fajlovi se ne menjaju.
- **Procena:** 1.5–2 / 0.5–0.5 (klasično / AI).
- **Owner:** Harness owner po W0 „Owner/uloga”. FRD §15 za AT-04 navodi Evolution owner-a; tech lead potvrđuje. **Receipts:** P, I (SHA).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: W0-PR8 · start: PLAN-APPROVAL, ROLE-ASSIGN, handoff/newcomer/r2/04 · merge: MERGE-AUTH · milestone: merge_before:F1 · resursi: lane:harness, hotspot:chat

### W0-PR10 — Hook read path trio u `hive-mind-core`

- **Cilj:** hook recall ne ubacuje `temporary` frejmove, skenira ingress po hitu i rediguje tajne (F-HM-03, F-HM-04, F-HM-13).
- **Obim — u:** `recallHookFrames` sa `WHERE importance NOT IN ('deprecated','temporary')`. `evaluateExternalMemoryIngress` po hitu (fail-open = bez injekcije). Redakcija tajni po hitu: premestiti `redactSecrets` iz `@waggle/agent eval-dataset.ts:133` u `hive-mind-core` ili ga primeniti u `hook-runtime.ts`.
- **Obim — van:** RAWDETAIL i dedup (W2-PR7/PR9), external handoff (W2-PR6).
- **Fajlovi:** [`packages/hive-mind-core/src/hook-runtime.ts`](../../packages/hive-mind-core/src/hook-runtime.ts) (`:227-258`), [`packages/hive-mind-core/src/memory-ingress-guard.ts`](../../packages/hive-mind-core/src/memory-ingress-guard.ts), [`packages/hive-mind-hooks-claude-code/src/hooks/session-start.ts`](../../packages/hive-mind-hooks-claude-code/src/hooks/session-start.ts) (`:46-60`), [`packages/hive-mind-hooks-core/src/handlers-core.ts`](../../packages/hive-mind-hooks-core/src/handlers-core.ts) (`:77-90`), [`packages/agent/src/eval-dataset.ts`](../../packages/agent/src/eval-dataset.ts) (`:133`). Hotspot `hive-mind-core/src/**` → Memory owner + zapis za `scripts/oss-drift-baseline.json` review (hook-runtime je `only-canonical; product-curation`, bez mirror porta).
- **RED prvo:** `temporary` hook frejm nije u hook recall-u; hit sa tajnom je redigovan; hit koji ingress guard odbija se ne ubacuje. Fajlovi: [`packages/hive-mind-core/tests/hook-runtime.test.ts`](../../packages/hive-mind-core/tests/hook-runtime.test.ts) (`:126-137` ne pinuje uključivanje, bezbedno), [`packages/hive-mind-core/tests/memory-ingress-guard.test.ts`](../../packages/hive-mind-core/tests/memory-ingress-guard.test.ts). `session-start.test.ts` i `handlers-core.test.ts` mogu pinovati tačan string — ZA PROVERU pri implementaciji.
- **Prihvatanje:** AT-14 deo (G1: `temporary` isključen iz hook recall-a), AT-19 deo (G1: hook read scan i redakcija). G1 exit (c).
- **Dokaz:** F-HM-03 (DELIMIČNO), F-HM-04, F-HM-13 (POTVRĐENO) — [hivemind.md](../plans/v1.2-evidence/phaseA/hivemind.md), [hivemind.refute.md](../plans/v1.2-evidence/phaseA/hivemind.refute.md).
- **Rizici:** ADR-05 O4 još nije ratifikovan (RAT-04). PR ide pre ratifikacije kao PREDLOG; ako ratifikacija izmeni O4, PR se revertuje na integracionoj grani (Delivery §6.1 RAT-04). Promena u `hive-mind-core` nosi OSS drift dužnost (CLAUDE.md §7.5).
- **Rollback:** revert PR-a. Nema podataka.
- **Procena:** grupa W0-PR10+PR11 = 2–3 / 1–1.5.
- **Owner:** Memory owner. **Receipts:** I (SHA). A receipt se u G1 ne pokreće; hook put ulazi u A canaries na F2.
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2 · milestone: merge_before:F1 · resursi: lane:memory, hotspot:hive-mind-core

### W0-PR11 — Leak workspace → personal na 4 mesta + fleet policy gate

- **Cilj:** sadržaj iz Workspace A ne završava u personal mind-u ni u recall-u Workspace B (F-HM-05; AT-13; D-12).
- **Obim — u:** 4 pisca upisuju content-free pointer (`Run/Workspace/Status`, `importance:'temporary'`) umesto `Summary`. Fleet: **redefinisati policy gate** `fleet-run-executor.ts:101-106` (danas je `personal` obavezan, a workspace-only je UNSUPPORTED) i podrazumevane `memoryScopes`. Sentinel test AT-13.
- **Obim — van:** legacy frejmovi koje su pisci već upisali (W0-PR18); proširenje sentinel-a na paralelne run-ove (W2-PR1/PR2).
- **Fajlovi:** [`packages/server/src/local/routes/external-tool-runs.ts`](../../packages/server/src/local/routes/external-tool-runs.ts) (`:964-977`), [`packages/server/src/local/chat-collaboration.ts`](../../packages/server/src/local/chat-collaboration.ts) (`:802-814`; putanja je `local/`, ne `local/routes/`), [`packages/server/src/local/fleet-run-executor.ts`](../../packages/server/src/local/fleet-run-executor.ts) (`:101-106`, `:729`, `:924-936`), [`packages/server/src/local/routes/agent-groups.ts`](../../packages/server/src/local/routes/agent-groups.ts) (`:719-729`). Hotspot `chat-collaboration.ts` → Chat owner.
- **RED prvo:** sentinel string u run sažetku Workspace A nije u personal recall-u ni u recall-u Workspace B. Fajl: plan ga ne imenuje. PREDLOG: nov `packages/server/tests/local/workspace-sentinel-isolation.test.ts`. **Moraju se prepisati:** [`agent-groups.test.ts`](../../packages/server/tests/local/agent-groups.test.ts) `:362`, [`external-tool-runs.test.ts`](../../packages/server/tests/local/external-tool-runs.test.ts) `:259`, [`fleet-isolation.test.ts`](../../packages/server/tests/local/fleet-isolation.test.ts) `:203`, `:496-525` (`:519-522` preživljava ako label ostane).
- **Prihvatanje:** AT-13 (G1 autoritativan za nove upise, zajedno sa W0-PR18). G1 exit (c).
- **Dokaz:** F-HM-05 (WEAKENED na nivou minimalChange: policy gate + ≥5 testova) — [hivemind.md](../plans/v1.2-evidence/phaseA/hivemind.md), [hivemind.refute.md](../plans/v1.2-evidence/phaseA/hivemind.refute.md).
- **Rizici:** jedini W0 PR sa dizajnerskom odlukom: workspace-only saved-agent postaje podržan. ADR-05 O3 još nije ratifikovan (RAT-04), pa važi isto pravilo reverta kao za W0-PR10. P receipt na F1.
- **Rollback:** revert PR-a. Novi pointer frejmovi ostaju (`temporary`), bez gubitka korisničkih podataka.
- **Procena:** grupa W0-PR10+PR11 = 2–3 / 1–1.5.
- **Owner:** Memory owner (hotspot review: Chat owner). **Receipts:** P, I (SHA).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: merge_before:F1 · resursi: lane:memory, hotspot:chat

### W0-PR12 — Boundary quick de-gates

- **Cilj:** Solo korisnik ima Approvals, cost i audit-export bez tier kapije (F-TK-02/03/04, F-CAP-07; D-01 individualna kontrola).
- **Obim — u:** Approvals na 3 nav mesta (`dock-tiers.ts:82`, `AppShell.tsx:727-728`, `command-catalog.ts:89`). `cost.ts:210,272` → FREE. `settings.ts:1192` audit-export → FREE. Redovi u `tier-enforcement-matrix.test.ts` → `minTier:'FREE'` (tripwire obrazac `:43-49`).
- **Obim — van:** `config.json` šema (ne menja se), `parseTier`/`LEGACY_TIER_MAP` (ostaju read-compatible), Stripe, www pricing, ostali tier gate-ovi (WB-PR4/PR5, G3). Server `/api/approval/*` danas nije tier-gated (F-TK-02).
- **Fajlovi:** [`apps/web/src/lib/dock-tiers.ts`](../../apps/web/src/lib/dock-tiers.ts) (`:82`, ponovo pročitano: `minBillingTier: 'TEAMS'`), [`apps/web/src/components/os/AppShell.tsx`](../../apps/web/src/components/os/AppShell.tsx) (`:727-728`), [`apps/web/src/lib/command-catalog.ts`](../../apps/web/src/lib/command-catalog.ts) (`:89`), [`packages/server/src/local/routes/cost.ts`](../../packages/server/src/local/routes/cost.ts) (`:210`, `:272`, ponovo pročitano: `requireTier('TEAMS')`), [`packages/server/src/local/routes/settings.ts`](../../packages/server/src/local/routes/settings.ts) (`:1192`, ponovo pročitano), [`packages/server/tests/tier-enforcement-matrix.test.ts`](../../packages/server/tests/tier-enforcement-matrix.test.ts).
- **RED prvo:** tripwire redovi u `tier-enforcement-matrix.test.ts` očekuju `minTier:'FREE'` i padaju na baseline-u. `GET /api/cost/by-workspace`, `GET /api/costs` i audit-export odgovaraju FREE korisniku. Web: Approvals je vidljiv u dock-u i ⌘K. **Moraju se prepisati u istom PR-u (DP-0.15):** [`apps/web/src/test/p1a-routes.test.ts`](../../apps/web/src/test/p1a-routes.test.ts) `:232-239` (`:235` traži da FREE ne vidi Approvals i pada čim se `dock-tiers.ts:82` de-gate-uje; `governance` asercije `:236`, `:238` ostaju); [`packages/server/tests/tier-enforcement-matrix.test.ts`](../../packages/server/tests/tier-enforcement-matrix.test.ts) redovi `:53` (`/api/cost/by-workspace`) i `:56` (`/api/admin/audit-export`) → `minTier:'FREE'`, a testovi `:131-180` (TRIAL expiry `:131-144` i `:155-165`, oblik 403 odgovora `:169-179`: `TIER_INSUFFICIENT`, `upgradeUrl`, „requires the TEAMS tier”) koriste `/api/cost/by-workspace` kao TEAMS canary i preusmeravaju se na endpoint koji posle W0-PR12 ostaje TEAMS (npr. `POST /api/cloud-sync/toggle` sa `{enabled:true}` ili `POST /api/team/connect`; `GET /api/admin/overview` je kandidat za uklanjanje u WB-PR4 — PRD-13-04, Delivery §2 WB — pa je slabiji izbor). [`apps/web/src/test/p7-a6-approval-gating.test.tsx`](../../apps/web/src/test/p7-a6-approval-gating.test.tsx) ne pinuje tier gate (proverava samo `ApprovalModal` sa `riskLevel:'critical'` i `canAlwaysAllow(approvalClass)`) i ne menja se. [`apps/web/src/lib/command-catalog.test.ts`](../../apps/web/src/lib/command-catalog.test.ts) ne pominje Approvals ni `minBillingRank`. E2E `tests/e2e/waggle-complete.spec.ts:192-214,614-643,690-701` prihvata i 403 i 200, pa se ne lomi. — POTVRĐENO NA REVIZIJI (read-only, `git show 2af0904d:<fajl>`, 29.09.2026).
- **Prihvatanje:** AT-12 deo i AT-18 deo (G1: Approvals dostupan Solo korisniku), AT-27 config deo (G1 exit (j): bez promene `config.json` šeme, tripwire ažuriran u istom PR-u; MIG-07.1). G1 exit (d).
- **Dokaz:** F-TK-02, F-TK-03, F-TK-04 — [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.md); F-CAP-07 — [capability.md](../plans/v1.2-evidence/phaseA/capability.md).
- **Rizici:** nizak. LOW nalaz (`finish/traceability/f1/06`): W0 lista exit testova nije navodila AT-27 deo, iako ga G1 exit (j) traži; ispravljeno u Delivery §2 W0 „Exit testovi” (revizija 1.2.1, potvrđeno završnom proverom 30.09.2026; registar: uslov kapije `G1-EXIT`, ispunjen tekstom).
- **Rollback:** revert PR-a. Nema pisanja u config.
- **Procena:** grupa W0-PR0+PR12+PR13+PR15+PR16 = 1–1.5 / 0.5–1.
- **Owner:** Boundary owner. **Receipts:** I (SHA; rute i UI).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, handoff/newcomer/r2/04 · merge: MERGE-AUTH · milestone: merge_before:F1 · resursi: lane:boundary-release, host:btp

### W0-PR13 — Pricing tabela sa provenance komentarom

- **Cilj:** `ModelSpendBudget` ne rezerviše 3× zbog zastarelih cena (F-REL-06; G1 exit (e)).
- **Obim — u:** 4 reda `DEFAULT_MODEL_PRICING` (`:28-30` Opus 4.6/4.7/4.8 → 5/25; `:32` Sonnet 5 → 2/10), fallback `:66` Opus → 5/25, Haiku 3.5 `:39-40` → 0.80/4 + oznaka retired, komentar `:24-27` sa URL-om i datumom. Opus redovi u `benchmarks/harness/config/models.json`.
- **Obim — van:** **ne** cherry-pick `fe7804bf` (konflikt sa W3-PR8). Nema promene logike budžeta.
- **Fajlovi:** [`packages/agent/src/cost-tracker.ts`](../../packages/agent/src/cost-tracker.ts) (`:24-68`; ponovo pročitano: Opus 4.6–4.8 = 0.015/0.075 po 1K), [`benchmarks/harness/config/models.json`](../../benchmarks/harness/config/models.json) (`:88-89`).
- **RED prvo:** [`packages/agent/tests/cost-tracker.test.ts`](../../packages/agent/tests/cost-tracker.test.ts): **prepisati** `:54-57` na nove cene; test za fallback Opus i Haiku 3.5.
- **Prihvatanje:** cene u kodu, testu i `models.json` su usklađene, sa URL-om i datumom izvora u komentaru. Ciljne cene (5/25, 2/10, Haiku 3.5 → 0.80/4, retired) su NALAZ AUDITA — ZA PROVERU (live 27.09.2026). **Ponovo ih proveriti na zvaničnoj stranici pri merge-u** (PRD-14-09, FRD-13.4).
- **Dokaz:** F-REL-06 — [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.md); [external.md](../plans/v1.2-evidence/phaseA/external.md) §6, §8.
- **Rizici:** cene se mogu promeniti do merge-a.
- **Rollback:** revert PR-a.
- **Procena:** grupa W0-PR0+PR12+PR13+PR15+PR16 = 1–1.5 / 0.5–1.
- **Owner:** Release owner. **Receipts:** R (budget), I (SHA).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: merge_before:F1 · resursi: lane:boundary-release

### W0-PR14 — Cron `getDue` RED repro

- **Cilj:** potvrditi ili odbaciti hipotezu da `getDue()` nikad ne vraća cron zadatak, pa ga po potrebi popraviti (F-DUR-10; AT-23 deo).
- **Obim — u:** RED repro `store.create({cronExpr:'* * * * *'})` → posle >60 s `getDue()`. Hipoteza: rezultat je 0, jer `computeNextRun` upisuje ISO sa `T`, a `getDue` poredi sa `datetime('now')` (razmak, BINARY kolacija). **Samo ako se potvrdi:** normalizovati format upisa ili poređenja; `sweepInterruptedRuns` pomera `next_run_at` ili traži `rerunAfterInterrupt`; `acquireRunLease` postaje uslovni INSERT (fencing).
- **Obim — van:** occurrence identitet, misfire/DST politika, timezone polje (W1-PR11); Home Routines blok (W5-PR3).
- **Fajlovi:** [`packages/core/src/cron-store.ts`](../../packages/core/src/cron-store.ts) (`:203-206`, `:367-382`, `:442-447`), [`packages/server/src/local/cron.ts`](../../packages/server/src/local/cron.ts) (`:245-314`, `:366-389`). Hotspot → Durable owner.
- **RED prvo:** fixture iz FRD §15 AT-23: fake clock + realan `CronStore`. Fajl: plan ga ne imenuje. PREDLOG: [`packages/core/tests/cron-store.test.ts`](../../packages/core/tests/cron-store.test.ts). `cron-scheduler-hardening.test.ts:227-250` ne asertuje `next_run_at` i ne lomi se. Nijedan postojeći test ne vežba realan `create() → getDue()`.
- **Prihvatanje:** AT-23 deo (G1, format nalaz). Izveštaj u PR opisu: hipoteza potvrđena (sa popravkom) ili odbačena (samo test). G1 exit (f).
- **Dokaz:** F-DUR-10 — NALAZ AUDITA — ZA PROVERU (SQL probe izvršen, `CronStore` nije) — [durable.md](../plans/v1.2-evidence/phaseA/durable.md), [durable.refute.md](../plans/v1.2-evidence/phaseA/durable.refute.md).
- **Rizici:** ako se hipoteza potvrdi, rutine su danas neispravne u produkciji, pa popravka menja kada se rutine okidaju.
- **Rollback:** revert PR-a. Upisani `next_run_at` u novom formatu: NEPOZNATO do dizajna popravke.
- **Procena:** 0.5–0.5 / 0.5–0.5.
- **Owner:** Durable owner. **Receipts:** I (SHA).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: merge_before:F1 · resursi: lane:durable-probe, hotspot:cron

### W0-PR15 — Doc drift kandidata i receipts

- **Cilj:** dokumenti ne tvrde stanje kandidata i receipts koje revizija ne podržava (F-REL-01; G1 exit (g)).
- **Obim — u:** `docs/production-readiness/09-LAUNCH_RECOMMENDATION.md` (§Frozen candidate: runtime `e4bf403e`, tree `5a42a0b9`; `b07a6173` = PR test-merge istog tree-ja; PR #83 **merged** `44baa77d`), `CLAUDE.md:89`, `README.md:19-21`, line-anchor TD-CHAT-46 u `docs/TECH-DEBT.md:65` (statusna ćelija je već CLOSED; samo anchor), zastareli reranker komentar `orchestrator.ts:106-109`.
- **Obim — van (DQ-02):** rečenice o vidljivosti i licenci `CLAUDE.md:84`, `AGENTS.md:68` i `README.md:110,118` se ne menjaju. Dozvoljena je samo neutralna napomena „vidljivost: ZA PROVERU, DQ-02”. Stavka „`CLAUDE.md` §10 PA default OFF” nije PR posao.
- **Fajlovi:** [`docs/production-readiness/09-LAUNCH_RECOMMENDATION.md`](../production-readiness/09-LAUNCH_RECOMMENDATION.md), [`CLAUDE.md`](../../CLAUDE.md), [`README.md`](../../README.md), [`docs/TECH-DEBT.md`](../TECH-DEBT.md), [`packages/agent/src/orchestrator.ts`](../../packages/agent/src/orchestrator.ts) (samo komentar). Hotspot `orchestrator.ts` → Memory owner.
- **RED prvo:** plan navodi „—”. Provera (PREDLOG): `git diff` ne dira `CLAUDE.md:84`, `AGENTS.md:68`, `README.md:110,118`; citirani SHA-ovi postoje (`git cat-file -e`).
- **Prihvatanje:** G1 exit (g). Nijedna rečenica ne tvrdi da receipt sa `e4bf403e`/`b07a6173`/`c4e6a515` pokriva `2af0904d` (F-REL-02).
- **Dokaz:** F-REL-01 — [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.md); F-DUR-14 (WEAKENED) — [durable.md](../plans/v1.2-evidence/phaseA/durable.md); F-HM-01 — [hivemind.md](../plans/v1.2-evidence/phaseA/hivemind.md).
- **Rizici:** slučajna izmena rečenica rezervisanih za DQ-02.
- **Rollback:** revert PR-a.
- **Procena:** grupa W0-PR0+PR12+PR13+PR15+PR16 = 1–1.5 / 0.5–1.
- **Owner:** Release owner. **Receipts:** I (SHA, samo komentar u kodu).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: merge_before:F1 · resursi: lane:boundary-release, hotspot:orchestrator

### W0-PR16 — Stop/disconnect copy u chatu

- **Cilj:** korisnik zna da zatvaranje taba ili gubitak mreže prekida posao i pod-zadatke (F-DUR-06; ADR-03-T6).
- **Obim — u:** dopuniti „Stop generating” copy (`ChatApp.tsx:2428-2432`, i `:2030`).
- **Obim — van:** promena R3-008 ponašanja (close → abort) pre W1; detach ≠ cancel je W1-PR9.
- **Fajlovi:** [`apps/web/src/components/os/apps/ChatApp.tsx`](../../apps/web/src/components/os/apps/ChatApp.tsx) (`:2030`, `:2428-2432`).
- **RED prvo:** plan navodi „—”. Imenovani test je FRD-05.8 Stop-copy test (bez AT ID-a, Disposition OD-10). Fajl: `ChatApp` test ne postoji na `2af0904d`. PREDLOG: nov test u `apps/web/src/test/` koji traži novu rečenicu u Stop kontroli.
- **Prihvatanje:** FRD-05.8 Stop-copy test (ADR-03-T6). Copy ne obećava nastavak u pozadini, jer on do W1-PR9 ne postoji.
- **Dokaz:** F-DUR-06 (WEAKENED: copy postoji, ali ne kaže šta se gubi) — [durable.md](../plans/v1.2-evidence/phaseA/durable.md), [durable.refute.md](../plans/v1.2-evidence/phaseA/durable.refute.md); Disposition A9.
- **Rizici:** vizuelni/Playwright snapshot-i koji sadrže stari tekst.
- **Rollback:** revert PR-a.
- **Procena:** grupa W0-PR0+PR12+PR13+PR15+PR16 = 1–1.5 / 0.5–1.
- **Owner:** Chat owner (Disposition A9: Chat owner, Durable owner). W0 „Owner/uloga” ne imenuje F-DUR-06. **Receipts:** I (SHA, UI).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: merge_before:F1 · resursi: lane:boundary-release, host:btp

### W0-PR17 — Telemetry istinitost

- **Cilj:** jedan Settings prekidač pokriva i lokalni telemetry store i PostHog, a disclosure dolazi pre prvog capture-a (ADR-10 K3/O4; PRD-02-12; FRD-12.11; TM-25).
- **Obim — u:** varijanta (a) `optOutPostHog`/`optInPostHog` iz istog handler-a kao `adapter.toggleTelemetry`, ili (b) PostHog sa `opt_out_capturing_by_default: true` dok korisnik ne uključi. Onboarding disclosure (šta se šalje i kome) pre prvog `onboarding_complete` capture-a. Stavka release checkliste „`VITE_POSTHOG_KEY` upečen u kandidat?”.
- **Obim — van:** odluka da li se `VITE_POSTHOG_KEY` peče u javni build (ADR-10 O4 (c), RAT-09 pre F3).
- **Fajlovi:** [`apps/web/src/lib/posthog.ts`](../../apps/web/src/lib/posthog.ts) (`:39`, `:42`, `:49-60`, `:72`, `:84`, `:114-127`, `:133-166`), [`apps/web/src/components/os/apps/SettingsApp.tsx`](../../apps/web/src/components/os/apps/SettingsApp.tsx) (`:722-731`), [`apps/web/src/app-entry.tsx`](../../apps/web/src/app-entry.tsx) (`:19-22`), [`apps/web/src/components/os/overlays/OnboardingWizard.tsx`](../../apps/web/src/components/os/overlays/OnboardingWizard.tsx) (`:463`).
- **RED prvo:** [`apps/web/src/lib/posthog.test.ts`](../../apps/web/src/lib/posthog.test.ts): toggle OFF → `localStorage['waggle:telemetry-opt-out']==='true'` i `posthog.capture` nije pozvan pri `onboarding_complete`; ON → oba sistema. [`OnboardingWizard.test.tsx`](../../apps/web/src/components/os/overlays/OnboardingWizard.test.tsx): mock `captureOnboardingComplete` (`:13`, `:31`) ostaje, dodati asertiju za disclosure.
- **Prihvatanje:** AT-30 deo (telemetry; ADR-10-T2). G1 exit (i).
- **Dokaz:** ADR-10-K3 — NALAZ AUDITA — ZA PROVERU (sopstvena read-only provera writera van phase-A) — [ADR-10](../decisions/2026-09-27-ADR-10-release-privacy-profiles.md). Da li je ključ upečen u kandidat zavisi od `apps/web/.env.local` na build hostu: NEPOZNATO.
- **Rizici:** dev/test okruženja i interni pilot build-ovi moraju imati `VITE_POSTHOG_KEY` unset (DP-0.10). Pre F1 certify-a grep build `dist`-a potvrđuje da ključ nije upečen, a rezultat ide u receipt manifest.
- **Rollback:** revert PR-a.
- **Procena:** 0.5–1 / 0.5–0.5.
- **Owner:** Release owner (ADR-10-K3 PostHog prekidač). **Receipts:** I (SHA, UI).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, finish/checklist/f1/12 · milestone: merge_before:F1 · resursi: lane:boundary-release, host:btp

### W0-PR18 — MIG-05(i): reklasifikacija legacy leak frejmova

- **Cilj:** frejmove koje su 4 pisca iz W0-PR11 već upisala u personal mind isključiti iz recall-a, bez brisanja (MIG-05(i); AT-13 nad legacy podacima).
- **Obim — u:** oznaka `metadata.recallExcluded` uz `importance='normal'` (MDQ-07 (i)). Poštovanje oznake u recall putevima: `orchestrator.ts:728-737`, `context-loader.ts:77-89`, a MCP/hook put zajedno sa W0-PR10. Dry-run na kopiji, snapshot + `manifest.json` (MIG-00.3), idempotentan meta-sentinel po obrascu `erased_subjects_backfilled` (MIG-00.5). Merge posle W0-PR11.
- **Obim — van:** **ne** koristiti `importance='temporary'`. `FrameStore.compact()` (`frames.ts:427-433`), koji noćni cron `memory_compact` (`30 3 * * *`) pokreće, briše `temporary` frejmove starije od 30 dana. To bi bilo brisanje korisničkih podataka. Bez promene `hive-mind-core` šeme; MIG-09 runner stiže tek u W1-PR13.
- **Fajlovi:** tačni fajlovi su NEPOZNATO do dizajna (plan: jednokratan migracioni korak u `packages/server/src/local/` nad `personal.mind`). Kandidati koji postoje na `2af0904d`: [`packages/agent/src/orchestrator.ts`](../../packages/agent/src/orchestrator.ts) (`:728-737`), [`packages/agent/src/context-loader.ts`](../../packages/agent/src/context-loader.ts) (`:77-89`), [`packages/hive-mind-core/src/hook-runtime.ts`](../../packages/hive-mind-core/src/hook-runtime.ts), [`packages/hive-mind-core/src/mind/frames.ts`](../../packages/hive-mind-core/src/mind/frames.ts) (samo čitanje `compact()` ponašanja). Hotspot `orchestrator.ts` i `hive-mind-core` → Memory owner (+ drift review).
- **RED prvo:** (1) legacy fixture napravljen današnjim kodom (MIG-00.7): sentinel iz Workspace A je u personal recall-u pre migracije, a nije posle; (2) fixture sa `created_at` starijim od 30 d → migracija → `compact()` → frejmovi i dalje postoje; (3) drugi prolaz je no-op; (4) Klasa A rollback test nad golden fixture-om W0-PR19. Fajl: NEPOZNATO do dizajna (PR ga imenuje).
- **Prihvatanje:** AT-13 (G1, legacy deo), AT-27 deo (MIG-05(i), Klasa A). G1 exit (c). DP-0.09: `manifest.json` izvozi postojeći `erased_subjects` ledger; poništavanje = uklanjanje oznake po sentinelu, bez skidanja oznake frejma čiji je subject u međuvremenu erased.
- **Dokaz:** [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.md) MIG-05 (Napomena kritike o `compact()`), MDQ-07; F-HM-05 — [hivemind.md](../plans/v1.2-evidence/phaseA/hivemind.md).
- **Rizici:** proširenje recall filtera može pomeriti procenu ka gornjoj granici (NEPOZNATO do dizajna). Restore `personal.mind` iz snapshot-a u G1 nije testirana putanja (`personal.mind` nosi i `pending_actions`, pa bi restore mogao vratiti `executed` u `approved`); izvodi se samo uz eksplicitno founder odobrenje. RAT-04 (ADR-05) još nije dat; PR ide kao PREDLOG i poništava se uklanjanjem oznake ako ratifikacija izmeni O3.
- **Rollback:** Klasa A. Revert koda ostavlja oznaku koju stari kod ignoriše, pa se leak ponovo vidi u recall-u. To je regresija izolacije, ne gubitak podataka, i navodi se u receipt-u.
- **Procena:** 1–1.5 / 0.5–1.
- **Owner:** Memory owner (MDQ-07 = inženjerska odluka Memory owner-a). **Receipts:** P (recall sadržaj), I (SHA).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0, W0-PR11, W0-PR19 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2, finish/checklist/f1/13 · milestone: merge_before:F1 · resursi: lane:memory, hotspot:orchestrator, hotspot:hive-mind-core

### W0-PR19 — Golden legacy-datadir fixture generator

- **Cilj:** zamrznuto legacy stanje nad kojim se testiraju sve migracije (MIG §6 t.2, MIG-00.7). Preduslov testova, bez nalaza.
- **Obim — u:** generator gradi legacy stanje **kodom revizije `2af0904d`** (`AgentRunRegistry`, `CronStore`, `deployPersonaOverride`, `HarnessTraceBridge` + `TraceRecorder`, `VaultStore`, `ApprovalGrantStore`, `PairingStore`) u izolovanom `WAGGLE_DATA_DIR` i zamrzava ga kao golden tar + SHA-256. Merge **pre** W0-PR6 i W0-PR18.
- **Obim — van:** produkciona promena (nema je). Migracije same (W0-PR6, W0-PR18, G2 MIG-ovi).
- **Fajlovi:** `tests/fixtures/legacy-datadir/` + generator skript. Tačna putanja je NEPOZNATO do dizajna. Direktorijum `tests/fixtures/` ne postoji na `2af0904d`.
- **RED prvo:** test determinizma: dva generisanja daju isti SHA-256 (ili dokumentovanu normalizaciju vremena).
- **Prihvatanje:** fixture i SHA-256 su u repou; koriste ga testovi W0-PR6 (MIG-04(A)) i W0-PR18 (MIG-05(i)) i sve G2 migracije (MIG §6 t.6). FRD §15 ga vodi kao preduslov AT-27.
- **Dokaz:** [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.md) §6 t.2.
- **Rizici — blokira start:** checklist dozvoljava samo worktree-je iz `integration/waggle-next`, a plan traži generisanje u zasebnom worktree-ju na `2af0904d`. Otvoren LOW nalaz (`finish/checklist/f1/13`) traži eksplicitnu dozvolu za jedan `w0/*` worktree na `2af0904d` (ili W0-PR19 pre W0-PR11). **Pre starta tražiti founder odluku** ([WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md); [00-START-HERE.md](00-START-HERE.md) §6 pitanje (b)).
- **Mesto izvršavanja:** generator izvršava kod revizije `2af0904d`, u kojoj postoje curenja iz W0-PR20. Zato se pokreće samo u BTP-u (checklist „Bezbedan test profil (BTP)”) i ne poziva `documents`, `pins` ni marketplace install puteve.
- **Rollback:** brisanje fixture-a i generatora. Nema podataka.
- **Procena:** 1–1.5 / 0.5–1.
- **Owner:** NEPOZNATO (plan ne dodeljuje). **Receipts:** nema (bez produkcione promene).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, finish/checklist/f1/13 · merge: MERGE-AUTH · milestone: merge_before:F1 · resursi: lane:memory, host:btp

### W0-PR20 — Izolacija dataDir-a: documents/pins i ostali upisi mimo `WAGGLE_DATA_DIR`

- **Cilj:** sidecar sa izolovanim `dataDir`-om ne čita i ne piše `os.homedir()/.waggle` ni na jednom poznatom putu (DP-0.08; [01 §9.5](01-ONBOARDING-DEV-ENV.md) „Poznata curenja”, redovi 1–7). Dodato u reviziji 1.2.1 (H-05). Nalaz iz provere predaje `handoff/consistency/r2/08`, bez phase-A F-ID-a.
- **Status:** TODO — čeka odobrenje plana. Implementacioni zadatak preciziran, kod nije popravljen. Runtime nije reprodukovan.
- **Obim — u:**
  - **A1** `documents.ts:37`: putanja `<dataDir>/workspaces/<id>/documents.json` iz `server.localConfig.dataDir`. Bez `os.homedir()` rezerve: bez `dataDir`-a ruta vraća grešku i ne piše.
  - **A2** `pins.ts:32`: isto za `pins.json`, plus `assertSafeSegment(id, 'id')` na svim `/api/workspaces/:id/pins*` rutama, po obrascu `documents.ts:70` (R2-005).
  - **A3** `MarketplaceInstaller` (`packages/marketplace/src/installer.ts:47-50`, `:89-91`): koren za `skills/`, `plugins/`, `plugins/registry.json` i `.mcp.json` zadaje pozivalac. Server prosleđuje `dataDir` na svim mestima (`routes/marketplace.ts:417,581,611`; `routes/capability-proposals.ts:108`). Podrazumevani koren za CLI (`packages/marketplace/src/cli.ts`) sme ostati; server ga ne koristi.
  - **A4** `SecurityGate` (`packages/marketplace/src/security.ts:183`, `:222`): server prosleđuje `cache_dir` pod `dataDir` (`routes/marketplace.ts:291,698,1046`; kroz A3 i `installer.ts:118`). Konstruktor bez eksplicitnog `cache_dir` ne pravi direktorijum u domu korisnika; PR bira lenjo pravljenje ili obavezan parametar.
  - **A5** `getToolRegistry()` u `routes/tools.ts:408` i `routes/external-tool-runs.ts:201` prosleđuje `dir = <dataDir>/adapters`.
  - **B1** `held-action-executor.ts:210-211` (`workspace_id === null` → koren `os.homedir()`): Server owner i Security owner upisuju odluku u PR opis. Ili koren pod `dataDir` uz RED test, ili obrazložen izuzetak i test koji ga pinuje. Bez tihe promene.
  - **B2** `lifecycle.ts:257` (LiteLLM log u `os.homedir()` bez `configPath`): log pod `dataDir` ili obrazloženje u PR-u da ta grana ne postoji u sidecar toku.
  - Prepis `packages/server/tests/local/phase2-traversal-documents.test.ts`: ruta se registruje sa izolovanim `dataDir`-om. Danas GET slučajevi `:82-98` čitaju stvarni `os.homedir()/.waggle`, a `:59` proverava stvarni dom.
- **Obim — van:** konfiguracija spoljnih klijenata koju hook install piše po dizajnu (`packages/hive-mind-hooks-*/src/paths.ts`, uključujući Claude Desktop `%APPDATA%\Claude` i pointer `~/.waggle/claude-desktop/`, `claude-desktop/src/paths.ts:25-29,40`); čitanje izvora za harvest (`routes/harvest.ts:282,1045`; `local/index.ts:1575-1576`) i detekcija alata; CLI paketi (`packages/cli/src/auth.ts:8`, `repl.ts:71`). Takođe van: migracija postojećih `documents.json`/`pins.json`/skill fajlova iz `~/.waggle` u prilagođeni `WAGGLE_DATA_DIR`. Za podrazumevani profil (`WAGGLE_DATA_DIR` nije postavljen) putanja ostaje ista. Nema tihe rezerve čitanja iz `os.homedir()`.
- **Fajlovi (postoje na `2af0904d`):** [`packages/server/src/local/routes/documents.ts`](../../packages/server/src/local/routes/documents.ts), [`packages/server/src/local/routes/pins.ts`](../../packages/server/src/local/routes/pins.ts), [`packages/marketplace/src/installer.ts`](../../packages/marketplace/src/installer.ts), [`packages/marketplace/src/security.ts`](../../packages/marketplace/src/security.ts), [`packages/server/src/local/routes/marketplace.ts`](../../packages/server/src/local/routes/marketplace.ts), [`packages/server/src/local/routes/capability-proposals.ts`](../../packages/server/src/local/routes/capability-proposals.ts), [`packages/server/src/local/routes/tools.ts`](../../packages/server/src/local/routes/tools.ts), [`packages/server/src/local/routes/external-tool-runs.ts`](../../packages/server/src/local/routes/external-tool-runs.ts), [`packages/server/src/local/held-action-executor.ts`](../../packages/server/src/local/held-action-executor.ts), [`packages/server/src/local/lifecycle.ts`](../../packages/server/src/local/lifecycle.ts), [`packages/server/tests/local/phase2-traversal-documents.test.ts`](../../packages/server/tests/local/phase2-traversal-documents.test.ts). Nov test: tačno ime imenuje PR (predlog `packages/server/tests/local/datadir-sentinel.test.ts`). Nijedan fajl nije DP-0.14 hotspot.
- **Faze (dok važi `AGENTS.md` §4, „5 fajlova po fazi”, do potvrde TSA-06):** F1 = A1 + A2 + sentinel test (deo documents/pins) + prepis `phase2-traversal-documents.test.ts`; F2 = A3 + A4 + proširenje testa; F3 = A5 + B1 + B2 + proširenje testa. Svaka faza ima ≤ 5 fajlova i sopstveni RED→GREEN dokaz.
- **RED prvo:** sentinel test pada na `2af0904d` najmanje za A1, A2, A3 i A4, a pins traversal test pada na `2af0904d`. RED izlaz ide u PR opis.
- **Prihvatanje — sentinel regresija (normativno):**
  1. Test pravi dva privremena direktorijuma iz `mkdtemp`: zaštićeni profil `P` i `dataDir` `D`. `os.homedir()` (i `default` export modula `node:os`) je mock-ovan na `P`. `HOME` i `USERPROFILE` su postavljeni na `P` za vreme testa i vraćeni posle njega.
  2. Pre operacija se u `P/.waggle/` upisuju sentinel fajlovi: `SENTINEL-DO-NOT-TOUCH.txt` (nasumičan sadržaj), `workspaces/ws-sentinel/documents.json` i `workspaces/ws-sentinel/pins.json` sa sentinel unosima i `adapters/sentinel-adapter.json` (validan manifest). Snima se lista svih fajlova i direktorijuma u `P`, sa veličinom i SHA-256.
  3. Kroz rute sidecar-a (`server.inject`, `dataDir` = `D`) izvršavaju se: register, list i versions dokumenta; add, list, update i delete pin-a; marketplace install i uninstall lokalnog fixture skill paketa, bez mreže; učitavanje tool registry-ja kroz rutu iz `routes/tools.ts:408`; memorijski upis i recall kroz postojeću rutu; hook runtime upis sa `HIVE_MIND_DATA_DIR` = `D`.
  4. Posle operacija snimak `P` je identičan snimku pre njih: isti fajlovi, direktorijumi, veličine i SHA-256, bez ijednog novog unosa (npr. `P/.waggle/security-cache`, `skills/`, `plugins/`).
  5. Odgovori ne sadrže sentinel unose iz `P` (dokumenti, pinovi, `sentinel-adapter`): nema čitanja iz zaštićenog profila.
  6. Upisani podaci postoje pod `D`: `D/workspaces/ws-sentinel/documents.json` i `pins.json`, skill i `plugins/registry.json` pod `D`, keš `SecurityGate`-a pod `D`.
  7. `POST /api/workspaces/..%2f..%2fevil/pins` vraća 400 i ne pravi fajl van `D`.
  8. `git grep -n "homedir" -- packages/server/src/local/routes/documents.ts packages/server/src/local/routes/pins.ts` vraća 0 redova.
  9. Gates DP-0.06 su zeleni. Root suite je pokrenut u BTP-u, sa snimkom po 01 §9.5 (fajlovi i direktorijumi) pre i posle, i snimci su identični.
  Hook install u konfiguraciju spoljnog klijenta nije deo ovog testa, jer po dizajnu piše u dom korisnika. Pokrivaju ga BTP i snimak klijenata (01 §9.5–§9.6).
- **Runtime potvrda (posle merge-a, pre F1; nije urađena; kapija `handoff/consistency/r2/08` u requires F1, `backlog-gates.csv`):** na BTP-u, na build-u tačnog SHA integracione grane posle merge-a W0-PR20, pokreće se izolovani sidecar po 01 §9.3 **bez** scratch `USERPROFILE`/`HOME`. Korak 4 se izostavlja samo za ovu proveru: BTP je disposable, a cilj je da se dokaže popravka, a ne zaobilaznica. Operacije iz t.3 se izvršavaju preko HTTP API-ja. Snimak `~/.waggle` BTP naloga (01 §9.5) pre i posle mora biti identičan. SHA, komande, oba snimka i exit kodovi se upisuju u integracioni zapis PR-a. Do tada ne postoji tvrdnja „izolacija dataDir-a potvrđena”; važi samo „sentinel test prolazi”.
- **Dokaz:** [01 §9.5](01-ONBOARDING-DEV-ENV.md) „Poznata curenja”; [05](05-RISKS-DECISIONS-ESCALATION.md) N-28; closure zapis, H-05.
- **Rizici:** korisnici sa prilagođenim `WAGGLE_DATA_DIR` posle popravke ne vide stare `documents.json`/`pins.json`/skill fajlove pod `~/.waggle`. PR to navodi u migration polju („bez migracije; poznat uticaj”); broj takvih korisnika je NEPOZNATO. Promena `MarketplaceInstaller`/`SecurityGate` API-ja dira i CLI `packages/marketplace/src/cli.ts`.
- **Rollback:** revert koda. Podaci upisani pod `dataDir` tamo i ostaju, a stari kod ih ne čita: to je regresija izolacije, ne gubitak podataka. Nema šeme.
- **Procena:** 1–2 / 0.5–1. PREDLOG revizije 1.2.1: nova procena, nije iz Delivery §4.1.1 revizije 1.2 i nije u njenim zbirovima.
- **Owner:** Server owner; review: Security owner, Capability owner za `packages/marketplace/**`, `routes/marketplace.ts` i `routes/capability-proposals.ts`, External-executor owner za `routes/tools.ts` i `routes/external-tool-runs.ts`. **Receipts:** I (SHA).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2 · milestone: merge_before:F1 · resursi: lane:server, host:btp

### WB-PR1 — Inventar tier/KVARK granice + review ADR-08 i ADR-09

- **Cilj:** tabela sudbine svake tier/KVARK komponente u FRD, i review postojećih nacrta ADR-08/ADR-09 (bez novih ADR-ova).
- **Obim — u:** inventar iz F-TK-18/19: 24 non-test src fajla sa TRIAL/TEAMS/ENTERPRISE literalima (+ bez navodnika), 21 test fajl, stvarni FREE gate-ovi, dekorativne zastavice (0 potrošača), KVARK stanje (`createKvarkTools` 0 produkcionih pozivalaca, `new KvarkClient` 0). Sudbine: KVARK adapter / izdvojiti / legacy compat / ukloniti uz test (PREDLOG). Review ADR-08 (O1–O7) i ADR-09 (O1–O7), sa pripremom za RAT-08.
- **Obim — van:** kod. Stripe (nema promene do DQ-03). Registracija KVARK alata (WB-PR3, G3).
- **Fajlovi:** FRD tabela ([`Waggle_FRD_v1.2_DRAFT.md`](../Waggle_FRD_v1.2_DRAFT.md)), [ADR-08](../decisions/2026-09-27-ADR-08-individual-tiers-kvark-boundary.md), [ADR-09](../decisions/2026-09-27-ADR-09-secondary-worker-parity.md). Preduslov: paket mora biti na `integration/waggle-next`. Stanje 30.09.2026 (read-only): paket je commit-ovan (`2758f4e5`, grana `docs/waggle-v1.2-planning`, na `origin`-u), closure revizija 1.2.1 nije commit-ovana ([00 §1.1](00-START-HERE.md)), a `integration/waggle-next` ne postoji. Kako paket ulazi na integracionu granu: čeka osnivača (00 §6 (h); 03 §7 N-07).
- **RED prvo:** nema (dokumentacija).
- **Prihvatanje:** svaka komponenta iz F-TK-18/19 ima red i sudbinu; review komentari ADR-08/09 su upisani; nijedan ADR nije označen kao odobren.
- **Dokaz:** F-TK-11, F-TK-18, F-TK-19 — [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.md).
- **Rizici:** nizak; poslovni deo čeka DQ-03.
- **Rollback:** revert dokumenta.
- **Procena:** grupa WB-PR1/PR2 (G1) = 3–5 / 1.5–2.5.
- **Owner:** Boundary owner. **Receipts:** nema.
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: merge_before:F1 · resursi: lane:boundary-release

### WB-PR2 — KVARK RED test kao `it.fails`

- **Cilj:** zaključati ciljno ponašanje KVARK granice kao RED test, bez registracije i gate-a (ADR-08-T3). GREEN ga čini WB-PR3 (G3).
- **Obim — u:** server + vault `kvark:connection` + fake KVARK server sa health OK → tool registry ima 4 alata; bez entry-ja ili uz health fail → 0. Test je `it.fails`, pa CI ostaje zelen.
- **Obim — van:** registracija `createKvarkTools`, gate `getKvarkConfig(vault)!==null && health.ok`, connect/disconnect/revoke (sve WB-PR3, G3, posle RAT-08).
- **Fajlovi:** [`packages/server/tests/kvark/kvark-wiring.test.ts`](../../packages/server/tests/kvark/kvark-wiring.test.ts) (`:46-52` danas samo simulira `if(kvarkConfig)` guard) ili nov test fajl u `packages/server/tests/kvark/` (PREDLOG). Čita se, ne menja: [`packages/agent/src/kvark-tools.ts`](../../packages/agent/src/kvark-tools.ts), [`packages/server/src/local/index.ts`](../../packages/server/src/local/index.ts).
- **RED prvo:** ovo **jeste** RED test (`it.fails`).
- **Prihvatanje:** test postoji, označen je `it.fails` i prolazi CI. Ne zatvara nijedan deo AT-26; FRD §15 ga vodi kao G1 preduslov. G1 ne tvrdi „KVARK konekcija radi” (Delivery §1).
- **Dokaz:** F-TK-11 — [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.md); [ADR-08](../decisions/2026-09-27-ADR-08-individual-tiers-kvark-boundary.md) T3.
- **Rizici:** fake KVARK server mora slušati samo lokalno i ne sme dirati mrežu (DP-0.10).
- **Rollback:** brisanje testa.
- **Procena:** grupa WB-PR1/PR2 (G1) = 3–5 / 1.5–2.5.
- **Owner:** Boundary owner. **Receipts:** nema.
- **Spremnost (iz backlog.csv):** tehničke: WB-PR1 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: merge_before:F1 · resursi: lane:boundary-release

### OSS-PR1 — Provenance inventar + Build-vs-Borrow zapis W1/W3

- **Cilj:** inventar porekla i licenci svake isporučene komponente (FR-OSS-04) i zapis kandidata za W1 durable engine i W3 benchmark runner.
- **Obim — u:** polja FR-OSS-04 (repo, verzija, commit, hash, licenca, izmene, notices, vlasnik, security review, strategija ažuriranja) za Node, npm, `onnxruntime-node`, `sqlite-vec`, `better-sqlite3`, Ollama zip + model weights, reranker/embedding modele. Zapis W1/W3 kandidata iz `external.md` §2–3 (agent-native kao pattern reference; Omnigent Apache-2.0 Python alpha kao reference).
- **Obim — van:** izmena LICENSE/NOTICE teksta (zabranjeno pre DQ-02); notices generator (OSS-PR3).
- **Fajlovi:** nov dokument; lokacija NEPOZNATO (PREDLOG: `docs/plans/`). Ulazi: [`scripts/bundle-native-deps.mjs`](../../scripts/bundle-native-deps.mjs) (`:113-130` kopira samo binarije), [WAGGLE-BUILD-VS-BORROW-v1.2.md](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.md) §4.
- **RED prvo:** nema (dokumentacija).
- **Prihvatanje:** svaka komponenta iz liste ima sva FR-OSS-04 polja ili eksplicitno NEPOZNATO. `onnxruntime-node@1.21.0` i `sqlite-vec-windows-x64@0.1.9` su označeni kao paketi bez LICENSE fajla (tekst iz upstream-a).
- **Dokaz:** F-REL-04, F-REL-05, F-REL-07 — [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.md); F-TK-13, F-TK-14 — [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.md); [external.md](../plans/v1.2-evidence/phaseA/external.md) §2, §3.
- **Rizici:** nizak.
- **Rollback:** revert dokumenta.
- **Procena:** grupa OSS-PR1/PR2 (G1) = 4–5 / 2–3.
- **Owner:** OSS/License owner. **Receipts:** nema.
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: merge_before:F1 · resursi: lane:boundary-release

### OSS-PR2 — Licencna konzistentnost lint u report modu

- **Cilj:** mašinski prijaviti konflikte package `license` ↔ LICENSE ↔ NOTICE, bez izmene tekstova.
- **Obim — u:** lint u report modu (ne blokira CI). Poznati konflikti koje mora prijaviti: [`packages/optimizer/LICENSE`](../../packages/optimizer/LICENSE) i [`packages/weaver/LICENSE`](../../packages/weaver/LICENSE) „proprietary and confidential” uz `"license":"MIT"`; 3 hive-mind NOTICE fajla ([`hive-mind-cli/NOTICE`](../../packages/hive-mind-cli/NOTICE), [`hive-mind-mcp-server/NOTICE`](../../packages/hive-mind-mcp-server/NOTICE), [`hive-mind-wiki-compiler/NOTICE`](../../packages/hive-mind-wiki-compiler/NOTICE)) sa nepostojećim `EXTRACTION.md`; 9 manifesta bez `license` polja; `hive-mind-core` Apache-2.0 + `private:true`.
- **Obim — van:** izmena bilo kog LICENSE/NOTICE teksta (SAFE checklist zabrana pre DQ-02); ispravka `EXTRACTION.md` reference (OSS-PR3); blocking režim (posle DQ-02).
- **Fajlovi:** nov lint skript; lokacija NEPOZNATO (PREDLOG: `scripts/`).
- **RED prvo:** lint nad baseline-om prijavljuje tačno navedene poznate konflikte (test sa očekivanim izveštajem; fajl PREDLOG, uz skript).
- **Prihvatanje:** izveštaj sadrži sve poznate konflikte. Exit code u report modu ne ruši CI. `git diff` ne sadrži nijedan LICENSE/NOTICE fajl.
- **Dokaz:** F-REL-04/05/07 — [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.md); F-TK-13/14 — [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.md).
- **Rizici:** lažno pozitivni nalazi.
- **Rollback:** revert PR-a.
- **Procena:** grupa OSS-PR1/PR2 (G1) = 4–5 / 2–3.
- **Owner:** OSS/License owner. **Receipts:** nema.
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: merge_before:F1 · resursi: lane:boundary-release

### W8-PR1 — Receipt entry-pointi za R i A + receipt manifest

- **Cilj:** router i auth-canary receipt dobijaju ponovljiv ulaz i manifest koji pinuje SHA, pre F1 (G1 exit (k); F-REL-03).
- **Obim — u:** npm skripta za `scripts/qualify-smart-router.ts` i pwsh wrapper za `scripts/test-windows-official-auth-canaries.ps1` (imena PREDLOG), bez promene logike. Receipt manifest koji pinuje SHA integracione grane i beleži run ID, nalog (bez tajni), cap i stvarni trošak.
- **Obim — van:** crash-injection alat (W8-PR2, G2). Pokretanje canary-ja na realnim nalozima (prvi put na F2, uz ODB-01, na namenskoj VM ili disposable nalogu). Izmena `release.yml`.
- **Fajlovi:** [`package.json`](../../package.json) (danas ima samo `persona:seal`, `:48` — ponovo pročitano), [`scripts/qualify-smart-router.ts`](../../scripts/qualify-smart-router.ts), [`scripts/test-windows-official-auth-canaries.ps1`](../../scripts/test-windows-official-auth-canaries.ps1). Postoji [`scripts/qualify-smart-router.test.ts`](../../scripts/qualify-smart-router.test.ts).
- **RED prvo:** plan ne navodi test. PREDLOG: test koji proverava da npm/pwsh ulaz poziva postojeći skript bez izmene argumenata i da manifest sadrži SHA; bez pokretanja provider poziva.
- **Prihvatanje:** R receipt na F1 se pokreće kroz npm ulaz. Ako W8-PR1 nije merge-ovan pre F1, koristi se ad hoc `tsx scripts/qualify-smart-router.ts` i to se beleži u manifest (Delivery §5 F1). FRD §15: preduslov za AT-16 i AT-30, ne deo dokaza.
- **Dokaz:** F-REL-03 — [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.md).
- **Rizici:** slučajno pokretanje canary-ja sa founder-ovim auth stanjem. Zabranjeno (DP-0.10, checklist): `HOME`/`USERPROFILE`/`HERMES_HOME` na scratch profil ili disposable nalog.
- **Rollback:** revert PR-a.
- **Procena:** 2–2 / 1–1.
- **Owner:** Release owner. **Receipts:** alat za R i A (bez promene logike).
- **Spremnost (iz backlog.csv):** tehničke: W0-PR0 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: merge_before:F1 · resursi: lane:boundary-release

---

## 4. G2 tiketi — kompaktne kartice

Pune kartice (cilj, obim, RED test, rizici, rollback) pišu se u sprint planiranju pre starta G2, iz reda PR tabele u Delivery §2 i reda AT-a u FRD §15. Ovde je minimum za procenu redosleda i kapaciteta. PRD/FRD ID-evi su u [backlog.csv](backlog.csv).

<!-- GEN:G2:BEGIN -->

### W1

#### W1-PR1 — A8 spike (Reflow ADAPT vs minimalni BUILD) + review ADR-02/ADR-03

- **Owner:** Durable owner
- **Spremnost (iz backlog.csv):** tehničke: W0-PR7, W0-PR8 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Time-boxed spike na throwaway prototipu obe grane u dev Node okruženju; ishod se upisuje u ADR-02 O8. T4–T8/T10 su exit izabrane grane u W1/F2. Istek time-box-a bez ishoda ide u RAT-02 sa delimičnim rezultatima.
- **Fajlovi (iz plana, nisu ponovo provereni):** long-task/checkpoint.ts; recovery.ts; agent-run-registry.ts:539-574; held-action-executor.ts (BORROW asseti)
- **AT:** AT-07, AT-08, AT-09 (kriterijum spike-a: BvB T1–T3 + T9 na prototipu) · **ADR:** ADR-02 (O8); ADR-03 · **Trace:** TM-05, TM-18
- **Procena (klasično / AI):** 5–6 / 3–4 · **Receipts:** — (bez runtime promene)
- **Napomena:** F-DUR-04, F-DUR-05; W1 input contract W0-PR7/PR8; T7 → W1-PR14 + W1-PR15 (LOW `finish/estimates/f1/05` ispravljen u Delivery §2, revizija 1.2.1)

#### W1-PR2 — Run store + schemaVersion + retention/GC + migracija agent-runs.json v1 (MIG-01)

- **Owner:** Durable owner
- **Spremnost (iz backlog.csv):** tehničke: W1-PR1 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, RAT-02, REVIEW-2, W1-PR13, W1-PR15 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** SQLite kandidat store; migracija sa dry-run, snapshot, statusi 1:1, interrupted zadržava razlog + cursor; overflow i corrupt-load testovi (F-DUR-02).
- **Fajlovi (iz plana, nisu ponovo provereni):** agent-run-registry.ts:29,510-537
- **AT:** AT-27 deo (run store) · **ADR:** ADR-02 · **MIG:** MIG-01 · **Trace:** TM-05, TM-16
- **Procena (klasično / AI):** 8–10 / 4–5 · **Receipts:** talas W1: I, R, P, C (per-PR NEPOZNATO)
- **Napomena:** F-DUR-01, F-DUR-02 WEAKENED; kritična putanja; merge pre RAT-02 rizikuje revert 4–5 AI dana

#### W1-PR3 — Kanonska/legacy mapa statusa u shared

- **Owner:** Durable owner
- **Spremnost (iz backlog.csv):** tehničke: W1-PR2 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** queued→QUEUED, starting ili running→RUNNING, waiting_for_approval→BLOCKED_APPROVAL, cancelling prelazno, completed→COMPLETED, cancelled→CANCELLED, failed→FAILED_FINAL, interrupted legacy sa resume proverom, paused ODLOŽENO; COLLABORATION_RUN_STATUSES se ne skraćuje.
- **Fajlovi (iz plana, nisu ponovo provereni):** packages/shared/src/types.ts:398-405
- **AT:** FRD-05.8 status-mapa test (bez AT ID-a) · **ADR:** ADR-02 · **Trace:** TM-05
- **Procena (klasično / AI):** 2–3 / 1–2 · **Receipts:** talas W1: I, R, P, C (per-PR NEPOZNATO)
- **Napomena:** F-DUR-03; C12; kritična putanja

#### W1-PR4 — Server-driven phase executor (DurableRun pre side-effect-a, Checkpoint.spent)

- **Owner:** Durable owner (hotspot agent-loop.ts: Harness owner)
- **Spremnost (iz backlog.csv):** tehničke: W1-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:workflow-harness, hotspot:agent-loop
- **Obim (Delivery §2):** Faza = jedinica oporavka; HarnessRunState serijalizovan; run_harness postaje tanki klijent istog executora; iza feature flag-a (work mode opt-in) dok AT-07/10 ne prođu.
- **Fajlovi (iz plana, nisu ponovo provereni):** workflow-harness.ts:110-128,213-374; workflow-tools.ts:362-434
- **AT:** AT-03 (G2 autoritativan); AT-07 · **ADR:** ADR-02 · **Trace:** TM-05, TM-02
- **Procena (klasično / AI):** 9–12 / 4–6 · **Receipts:** talas W1: I, R, P, C (per-PR NEPOZNATO)
- **Napomena:** F-DUR-13, F-DUR-07; kritična putanja; HarnessRunState je workflow-harness.ts:110-128 (LOW `finish/facts/f1/06` ispravljen u Delivery §2 i ovde, revizija 1.2.1)

#### W1-PR5 — Lease/fencing za run + eksplicitan resume API

- **Owner:** Durable owner
- **Spremnost (iz backlog.csv):** tehničke: W1-PR4 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Jedan aktivni izvršilac po fazi; interrupted → queued samo kroz resume API sa validacijom checkpoint-a (ne izmena ALLOWED_TRANSITIONS); BORROW harvest M-08 resume pattern.
- **Fajlovi (iz plana, nisu ponovo provereni):** agent-run-registry.ts:41,137,282,510-520
- **AT:** AT-07; AT-09 · **ADR:** ADR-02 · **Trace:** TM-05
- **Procena (klasično / AI):** — (grupa W1-PR5+PR6 (§4.1.1): 6–8 / 2–2.5) · **Receipts:** talas W1: I, R, P, C (per-PR NEPOZNATO)
- **Napomena:** F-DUR-01

#### W1-PR6 — ToolAction/ToolAttempt: stabilan actionId, unknown_outcome; pending_actions prelazni status

- **Owner:** Durable owner (Boundary owner: held actions)
- **Spremnost (iz backlog.csv):** tehničke: W1-PR4 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:cron
- **Obim (Delivery §2):** Statusi planned/approved/dispatching/succeeded/failed/unknown_outcome; providerIdempotencyKey gde servis podržava; BORROW held-action pattern.
- **Fajlovi (iz plana, nisu ponovo provereni):** held-action-executor.ts:154-166,233-235; cron-store.ts:88,551-556
- **AT:** AT-08; AT-12 deo (BLOCKED_APPROVAL trajno); AT-27 deo (MIG-02) · **ADR:** ADR-02 · **MIG:** MIG-02 · **Trace:** TM-05, TM-16
- **Procena (klasično / AI):** — (grupa W1-PR5+PR6 (§4.1.1): 6–8 / 2–2.5) · **Receipts:** talas W1: I, R, P, C (per-PR NEPOZNATO)
- **Napomena:** F-DUR-05; A7 → DIR-06

#### W1-PR7 — ProofReceipt + execution_traces CHECK rebuild (gate_passed) + MIG-08 sekcija tragova

- **Owner:** Harness owner (schema.ts: Memory owner, drift baseline)
- **Spremnost (iz backlog.csv):** tehničke: W1-PR4 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2, W1-PR13, W1-PR14, W1-PR15 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:hive-mind-core
- **Obim (Delivery §2):** ProofReceipt + tri nivoa provere = jedini put do COMPLETED u strict; TraceOutcome gate_passed kroz table-rebuild; eval-dataset pozitivi = success, verified (ProofReceipt-backed); downgrade skript bez brisanja redova.
- **Fajlovi (iz plana, nisu ponovo provereni):** hive-mind-core/src/mind/execution-traces.ts:20; schema.ts:235-253
- **AT:** AT-01 deo (G2 exit (c)); AT-27 deo (MIG-04(B)) · **ADR:** ADR-02 · **MIG:** MIG-04(B); MIG-08 · **Trace:** TM-05, TM-16
- **Procena (klasično / AI):** 4.5–7 / 2.5–2.5 · **Receipts:** talas W1: I, R, P, C (per-PR NEPOZNATO)
- **Napomena:** F-HARN-06 WEAKENED; DP-0.09; CLAUDE.md §7.5 OSS drift

#### W1-PR8 — Per-run event bus + GET /api/runs/:id/stream?sinceSeq=

- **Owner:** Durable owner (Chat owner: chat.ts)
- **Spremnost (iz backlog.csv):** tehničke: W1-PR7 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:chat
- **Obim (Delivery §2):** RunEvent{runId, seq, phase/attempt, type, label, status, evidenceRefs}; replay ne duplira kartice; bridge harnessEvents → per-run; HarnessTraceBridge dobija context resolver.
- **Fajlovi (iz plana, nisu ponovo provereni):** routes/agent-runs.ts:20-22,73-84
- **AT:** AT-06 deo (per-run bus); AT-10 · **ADR:** ADR-03 · **Trace:** TM-06
- **Procena (klasično / AI):** — (grupa W1-PR8+PR9 (§4.1.1): 5–7 / 2–3) · **Receipts:** talas W1: I, R, P, C (per-PR NEPOZNATO)
- **Napomena:** F-DUR-06, F-DUR-08, A9/A11

#### W1-PR9 — Detach ≠ cancel u chatu (ADR-03)

- **Owner:** Chat owner
- **Spremnost (iz backlog.csv):** tehničke: W1-PR8 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, RAT-02 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:chat, hotspot:agent-loop
- **Obim (Delivery §2):** work run: zatvaranje socket-a = detach (RunEvent(detached)); cancel samo POST /api/runs/:id/control {action:cancel}; R3-008 close→abort ostaje za conversation; subagenti request-bound vs detached durable.
- **Fajlovi (iz plana, nisu ponovo provereni):** routes/chat.ts:1604-1612; agent-loop.ts:1090-1108; chat-collaboration.ts:110-128,302-308; fleet-run-executor.ts:480-515
- **AT:** AT-10 · **ADR:** ADR-03 (O1/O4) · **Trace:** TM-06
- **Procena (klasično / AI):** — (grupa W1-PR8+PR9 (§4.1.1): 5–7 / 2–3) · **Receipts:** talas W1: I, R, P, C (per-PR NEPOZNATO)
- **Napomena:** F-DUR-06, F-DUR-12 WEAKENED

#### W1-PR10 — Loop execution state iz Awareness u run store

- **Owner:** Durable owner
- **Spremnost (iz backlog.csv):** tehničke: W1-PR9 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:server-index
- **Obim (Delivery §2):** `loop:<id>` state van Awareness (report frame ostaje); AwarenessLayer.toContext() danas renderuje Loop u recall kontekst.
- **Fajlovi (iz plana, nisu ponovo provereni):** loop-executor.ts:212-230,311-322; local/index.ts:2596-2597
- **AT:** AT-23 deo; AT-27 deo (MIG-02) · **ADR:** ADR-07 (O7) · **MIG:** MIG-02 · **Trace:** TM-07, TM-16
- **Procena (klasično / AI):** — (grupa W1-PR10+PR11 (§4.1.1): 2.5–4 / 1–1.5) · **Receipts:** talas W1: I, R, P, C (per-PR NEPOZNATO)
- **Napomena:** F-DUR-09; graf §3: posle W1-PR9

#### W1-PR11 — Rutine: occurrence identitet, misfire politika, timezone, DST + MIG-08 sekcija

- **Owner:** Durable owner
- **Spremnost (iz backlog.csv):** tehničke: W1-PR9, W0-PR14 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, RAT-06, REVIEW-2, W1-PR14 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:cron
- **Obim (Delivery §2):** Occurrence id u JobExecutor potpisu; misfire skip/jedan catch-up/ograničeno; timezone polje (inženjerska odluka Durable owner-a, MIG-02); DST test; dva procesa.
- **Fajlovi (iz plana, nisu ponovo provereni):** cron-store.ts; cron.ts:19,245-314
- **AT:** AT-23 (G2 autoritativan); AT-27 deo (MIG-02; MIG-08) · **ADR:** ADR-07 (O2–O4) · **MIG:** MIG-02; MIG-08 · **Trace:** TM-07, TM-16
- **Procena (klasično / AI):** — (grupa W1-PR10+PR11 (§4.1.1): 2.5–4 / 1–1.5) · **Receipts:** talas W1: I, R, P, C (per-PR NEPOZNATO)
- **Napomena:** F-DUR-10; DST NEPOZNATO

#### W1-PR12 — Crash-injection e2e (dev Node)

- **Owner:** Durable owner
- **Spremnost (iz backlog.csv):** tehničke: W1-PR5, W1-PR6, W1-PR9 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: host:btp
- **Obim (Delivery §2):** Kill posle potvrđene faze → restart nastavlja sledeću fazu; kill posle provider uspeha pre ack → unknown_outcome vidljiv; dva procesa → jedan lease.
- **Fajlovi (iz plana, nisu ponovo provereni):** nov test
- **AT:** AT-07; AT-08; AT-09 · **ADR:** ADR-02 · **Trace:** TM-05
- **Procena (klasično / AI):** 1–1 / 0.5–0.5 · **Receipts:** C (dev deo; packaged = W8-PR2)
- **Napomena:** F-REL-03 (alat ne postoji); graf §3: posle W1-PR9

#### W1-PR13 — MIG-09 versionovani migracioni ledger + runner

- **Owner:** Durable owner
- **Spremnost (iz backlog.csv):** tehničke: W0-PR7, W0-PR8 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:server-index
- **Obim (Delivery §2):** Ledger po MIG-ID (verzija pre/posle, receipt hash), boot korak pre otvaranja store-ova, dry-run/apply/rollback komande; merge pre W1-PR2 apply-a; paralelno sa W1-PR1.
- **Fajlovi (iz plana, nisu ponovo provereni):** local/index.ts:538-622 (konstrukcija store-ova); webhook.ts:25-46; agent-run-registry.ts:548-573
- **AT:** AT-27 deo (MIG-09) · **MIG:** MIG-09 · **Trace:** TM-16
- **Procena (klasično / AI):** 3–4 / 1.5–2 · **Receipts:** I (runner u packaged bundle-u)
- **Napomena:** PREDLOG nov kod, BORROW obrazaca; van kritične putanje; W1 input contract W0-PR7/PR8

#### W1-PR14 — MIG-08 export/erasure za run store (ExecutionErasure)

- **Owner:** Durable owner
- **Spremnost (iz backlog.csv):** tehničke: W1-PR2 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Export sekcije za runove/checkpoint-e/journal i erasure kroz erased_subjects/stableHarvestId; store bez export/erase mapiranja ne prolazi.
- **Fajlovi (iz plana, nisu ponovo provereni):** routes/export.ts:4-10; data-erase.ts:1-19
- **AT:** AT-27 deo (MIG-08) · **MIG:** MIG-08 · **Trace:** TM-16
- **Procena (klasično / AI):** 2–3 / 1–1.5 · **Receipts:** talas W1: I, R, P, C (per-PR NEPOZNATO)
- **Napomena:** merge-preduslov MIG-08 sekcija: W1-PR7, W1-PR11, W3e-PR1, W4-PR3/PR5/PR6, W8-PR3

#### W1-PR15 — Revocation ledger revocations.json + Klasa B restore test

- **Owner:** Durable owner (FRD §15 AT-27)
- **Spremnost (iz backlog.csv):** tehničke: W0-PR7, W0-PR8, W0-PR19 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Append-only {kind, key, revokedAt, reason} pod dataDir, van fajlova koji se restore-uju; kuke u VaultStore.delete, ApprovalGrantStore.revoke i registry credential revoke; Klasa B restore nad golden fixture-om W0-PR19; merge pre prvog G2 apply-a.
- **Fajlovi (iz plana, nisu ponovo provereni):** vault.ts:286; approval-grants.ts:286-292; suppression.ts:54-100; agent-run-registry.ts:548-573
- **AT:** AT-27 deo (Klasa B restore) · **MIG:** MIG-00.6; GDPR-H-05 · **Trace:** TM-16
- **Procena (klasično / AI):** 1.5–2.5 / 1–1.5 · **Receipts:** talas W1: I, R, P, C (per-PR NEPOZNATO)
- **Napomena:** PREDLOG nov kod; paralelno sa W1-PR1/PR13

### W2

#### W2-PR1 — ContextPackage tip + ContextBuilder fasada nad recallMemory + ablation flag + review ADR-05 (O1–O4)

- **Owner:** Memory owner
- **Spremnost (iz backlog.csv):** tehničke: W0-PR10, W0-PR11 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, RAT-04, finish/estimates/f1/03 · milestone: start_after:G1-EXIT, merge_before:B2-DEVRUN, merge_before:F2 · resursi: hotspot:chat, hotspot:orchestrator
- **Obim (Delivery §2):** recallMemory ostaje engine (DIR-09, D-12); fasada vraća paket reference-first; teče uz W1-PR1..PR3. Uz to review postojećeg nacrta ADR-05 (O1–O4) pred RAT-04; ne piše se novi ADR (dodato u Delivery §2, revizija 1.2.1, `finish/estimates/f1/03`).
- **Fajlovi (iz plana, nisu ponovo provereni):** orchestrator.ts:582-978; chat-turn-preparation.ts:237; chat.ts:390; command.ts:266; commands.ts:74
- **AT:** AT-06 deo; AT-13 deo · **ADR:** ADR-05 · **Trace:** TM-08
- **Procena (klasično / AI):** 3–4 / 1.5–2 · **Receipts:** talas W2: P, A, I, R (per-PR NEPOZNATO)
- **Napomena:** F-HM-08, F-HM-09; posredno na kritičnoj putanji (W3-PR2); review ADR-05 dodeljen ovom PR-u u Delivery §2 (revizija 1.2.1; LOW `finish/estimates/f1/03` — dodelu potvrđuje tech lead, kapija merge-a)

#### W2-PR2 — Pinovanje paketa za run + invalidacija (erasure/revoke/scope)

- **Owner:** Memory owner
- **Spremnost (iz backlog.csv):** tehničke: W2-PR1, W1-PR4 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Referenca + hash u Checkpoint; resume traži novo razrešenje ako je izvor obrisan/revokovan/scope promenjen (nema snapshot > erasure).
- **Fajlovi (iz plana, nisu ponovo provereni):** erased_subjects; erasure.test.ts
- **AT:** AT-15 (G2 autoritativan); AT-13 deo; AT-27 deo (MIG-05 context_refs) · **ADR:** ADR-05 · **MIG:** MIG-05 (context_refs) · **Trace:** TM-08, TM-16, TM-20
- **Procena (klasično / AI):** 3–3.5 / 1.5–2 · **Receipts:** talas W2: P, A, I, R (per-PR NEPOZNATO)
- **Napomena:** F-HM-18

#### W2-PR3 — Trust/taint labele u render liniji recall bloka

- **Owner:** Memory owner
- **Spremnost (iz backlog.csv):** tehničke: W2-PR2 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, DQ-04 · milestone: start_after:G1-EXIT, merge_before:B2-DEVRUN, merge_before:F2 · resursi: hotspot:orchestrator, budget:dq-04
- **Obim (Delivery §2):** source token u paketu i render liniji; menja bajtove recall bloka → LoCoMo same-judge kontrola + recount.mjs pre merge-a.
- **Fajlovi (iz plana, nisu ponovo provereni):** orchestrator.ts:839-856; executor-brief.ts:186
- **AT:** AT-28 deo (LoCoMo same-judge bez regresije) · **ADR:** ADR-05 · **Trace:** TM-08
- **Procena (klasično / AI):** 1.5–2 / 0.5–1 · **Receipts:** P (bajtovi recall bloka)
- **Napomena:** F-HM-06 WEAKENED; + 1–2 dana compute van eng-dana; mora pre B2 dev run-a

#### W2-PR4 — Token budžet po model tier-u na nivou paketa

- **Owner:** Memory owner
- **Spremnost (iz backlog.csv):** tehničke: W2-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:B2-DEVRUN, merge_before:F2 · resursi: hotspot:orchestrator
- **Obim (Delivery §2):** FRAME_LIMITS danas se ne primenjuje na W4.5 pre-renderovani blok; lane kapovi fiksni 60/40/K=6.
- **Fajlovi (iz plana, nisu ponovo provereni):** prompt-assembler.ts:118,165-169,369-489; orchestrator.ts:765-771
- **AT:** — (TM-08; per-PR NEPOZNATO) · **Trace:** TM-08
- **Procena (klasično / AI):** 2–3 / 0.5–1 · **Receipts:** P
- **Napomena:** F-HM-07; mora pre B2 dev run-a

#### W2-PR5 — Fleet/harness/subagent na isti ContextPackage ugovor

- **Owner:** Memory owner; Harness owner (injekcija u faze)
- **Spremnost (iz backlog.csv):** tehničke: W2-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:workflow-harness
- **Obim (Delivery §2):** Fleet danas buildAssembledPrompt bez recalledText; harness/subagent bez recall-a. Bez nove fusion površine (D-16).
- **Fajlovi (iz plana, nisu ponovo provereni):** fleet-run-executor.ts:647-648; routes/fleet.ts:350-356; subagent-orchestrator.ts; workflow-harness.ts
- **AT:** — (TM-08; per-PR NEPOZNATO) · **Trace:** TM-08
- **Procena (klasično / AI):** 3–4 / 1.5–2 · **Receipts:** talas W2: P, A, I, R (per-PR NEPOZNATO)
- **Napomena:** F-HM-10; hotspot workflow-harness.ts → Durable owner

#### W2-PR6 — External handoff za sve putanje (WAGGLE_CONTEXT_INJECTED, SessionStart, cli-bridge)

- **Owner:** External-executor owner
- **Spremnost (iz backlog.csv):** tehničke: W2-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2 · milestone: start_after:G1-EXIT, merge_before:B2-DEVRUN, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** buildExecutorBrief i za /api/tools/run i interaktivni launch; u allowlist-u se dodaje samo WAGGLE_CONTEXT_INJECTED (WAGGLE_RUN_ID već postoji); SessionStart skraćuje recall kad marker + run id postoje; cli-bridge čita WAGGLE_RUN_ID.
- **Fajlovi (iz plana, nisu ponovo provereni):** executor-brief.ts:46-154; route-proposals.ts:205-211; external-tool-runs.ts:103; cli-bridge.ts:240,404-408; external-process-env.ts:29-35
- **AT:** AT-16 · **ADR:** ADR-05 · **Trace:** TM-09, TM-23
- **Procena (klasično / AI):** 3–4 / 1.5–2 · **Receipts:** A; P
- **Napomena:** F-HM-08, F-HM-11, F-HM-12; NEPOZNATO: da li --safe-mode suzbija SessionStart; mora pre B2 dev run-a

#### W2-PR7 — Idempotentna run-end ekstrakcija (runId, outputHash)

- **Owner:** Memory owner
- **Spremnost (iz backlog.csv):** tehničke: W2-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:hive-mind-core
- **Obim (Delivery §2):** Dedup ključ (runId, outputHash) u metadata; provera createPFrame dedup-a.
- **Fajlovi (iz plana, nisu ponovo provereni):** frames.ts:109-111,289-294; weaver/consolidation.ts:181-236; cognify.ts:64-70
- **AT:** AT-14 (G2 autoritativan) · **Trace:** TM-08
- **Procena (klasično / AI):** 1–1.5 / 0.5–0.5 · **Receipts:** talas W2: P, A, I, R (per-PR NEPOZNATO)
- **Napomena:** F-HM-16

#### W2-PR8 — External toolsUsed označen tool-reported

- **Owner:** External-executor owner
- **Spremnost (iz backlog.csv):** tehničke: W2-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Registar + UI copy razlikuju tool-reported od server-observed.
- **Fajlovi (iz plana, nisu ponovo provereni):** external-tool-runner.ts:519,531; external-tool-runs.ts:922-932
- **AT:** AT-16 · **Trace:** TM-09, TM-23
- **Procena (klasično / AI):** 0.5–0.5 / 0.5–0.5 · **Receipts:** talas W2: P, A, I, R (per-PR NEPOZNATO)
- **Napomena:** F-HM-14

#### W2-PR9 — RAWDETAIL FRD zapis + odluka o bundlovanju reranker-a

- **Owner:** Memory owner
- **Spremnost (iz backlog.csv):** tehničke: W2-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:hive-mind-core, hotspot:server-index
- **Obim (Delivery §2):** Lane indeksira samo harvestovane razgovore (3 pisca) i zavisi od reranker-a koji se ne bundluje → offline desktop bez lane-a; odluka: bundlovati ili dokumentovati.
- **Fajlovi (iz plana, nisu ponovo provereni):** raw-detail-lane.ts:116-187; inprocess-reranker.ts:56,71,74; local/index.ts:792-800
- **AT:** AT-14 (G2 autoritativan) · **ADR:** ADR-05 · **Trace:** TM-08
- **Procena (klasično / AI):** 0.5–1 / 0.5–0.5 · **Receipts:** I (ako se reranker bundluje)
- **Napomena:** F-HM-01; offline deo NALAZ AUDITA — ZA PROVERU

#### W2-PR10 — memory_compact test u desktop sidecar-u

- **Owner:** Memory owner
- **Spremnost (iz backlog.csv):** tehničke: W2-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:server-index, host:btp
- **Obim (Delivery §2):** Test da postojeći cron radi u desktop sidecar-u; ne novi mehanizam.
- **Fajlovi (iz plana, nisu ponovo provereni):** local/index.ts:2033-2058; setup-crons.ts:35; dream-journal.ts:75-77
- **AT:** — (TM-08; per-PR NEPOZNATO) · **Trace:** TM-08
- **Procena (klasično / AI):** 0.5–0.5 / 0.5–0.5 · **Receipts:** talas W2: P, A, I, R (per-PR NEPOZNATO)
- **Napomena:** F-HM-02 WEAKENED

### W3

#### W3-PR1 — Review ADR-01 + ExecutionMode tabela u FRD

- **Owner:** Harness owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Review postojećeg nacrta; conversation/work × normal/strict/benchmark (DIR-03).
- **Fajlovi (iz plana, nisu ponovo provereni):** docs/decisions/2026-09-27-ADR-01-conversation-work-modes.md; FRD
- **AT:** — · **ADR:** ADR-01 · **Trace:** TM-01
- **Procena (klasično / AI):** 1–2 / 0.5–0.5 · **Receipts:** — (dokumentacija)
- **Napomena:** W3 input contract: W1-PR4 + W2-PR1

#### W3-PR2 — Router conversation/work server-side

- **Owner:** Harness owner (hotspot: Chat owner)
- **Spremnost (iz backlog.csv):** tehničke: W3-PR1, W1-PR4, W2-PR1 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, RAT-03, DQ-09 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:chat
- **Obim (Delivery §2):** Server-side klasifikacija + režim; vidljiva i popravljiva klasifikacija; conversation ostaje postojeći lagani put; iza flag-a.
- **Fajlovi (iz plana, nisu ponovo provereni):** chat-turn-preparation.ts (posle detectTaskShape :381); task-shape.ts:145
- **AT:** — (TM-01/TM-20; per-PR NEPOZNATO) · **ADR:** ADR-01 · **Trace:** TM-01, TM-20
- **Procena (klasično / AI):** 4–5 / 2–3 · **Receipts:** R; P
- **Napomena:** F-HARN-09; kritična putanja; ne zavisi od W1-PR7

#### W3-PR3 — Recipe registry + verzije + HarnessRecipeVersion minimum

- **Owner:** Harness owner
- **Spremnost (iz backlog.csv):** tehničke: W3-PR2 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** parent, mutations, promotion state, rollback target; tri ugrađena harness-a postaju recipe v1 bez brisanja.
- **Fajlovi (iz plana, nisu ponovo provereni):** builtin-harnesses.ts:94-259 (postaju recipe v1)
- **AT:** — (TM-20; per-PR NEPOZNATO) · **ADR:** ADR-01 · **Trace:** TM-20
- **Procena (klasično / AI):** 4–5 / 2–3 · **Receipts:** R; P
- **Napomena:** kritična putanja

#### W3-PR4 — Research-brief recipe + deterministički validatori

- **Owner:** Harness owner
- **Spremnost (iz backlog.csv):** tehničke: W3-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Validatori: parsiranje fajla, sekcije, razrešive reference, brojevi/datumi/citati, jedinice, kontradikcije (ne kvota izvora).
- **Fajlovi (iz plana, nisu ponovo provereni):** NEPOZNATO (novi recipe/validator moduli)
- **AT:** AT-21; AT-22 · **ADR:** ADR-01 · **Trace:** TM-20, TM-23
- **Procena (klasično / AI):** 6–8 / 3–4 · **Receipts:** R; P
- **Napomena:** kritična putanja (paralelno sa W3-PR5)

#### W3-PR5 — Document-production recipe (DOCX/MD) + validatori

- **Owner:** Harness owner
- **Spremnost (iz backlog.csv):** tehničke: W3-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** DOCX/MD parsiranje, sekcije; bez novih native deps (I).
- **Fajlovi (iz plana, nisu ponovo provereni):** NEPOZNATO (novi recipe/validator moduli)
- **AT:** AT-21; AT-22 · **ADR:** ADR-01 · **Trace:** TM-20, TM-23
- **Procena (klasično / AI):** 6–8 / 3–4 · **Receipts:** R; P
- **Napomena:** kritična putanja (paralelno sa W3-PR4)

#### W3-PR6 — Tri nivoa provere u ProofReceipt; CONDITIONAL politika po recipe

- **Owner:** Harness owner
- **Spremnost (iz backlog.csv):** tehničke: W3-PR4, W3-PR5, W1-PR7 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, DQ-09 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Strukturno / definisani elementi / sadržinski pregled sa rubrikom; `GateOutcome` (klasa, nivo, `criterionIds`, verdikt sa `NOT_RUN`); `conditionalPolicy` po recipe-u samo za `work · normal`; ukupni `verdict`/`level` po FRD-05.9 R6/R7.
- **Fajlovi (iz plana, nisu ponovo provereni):** ProofReceipt (W1-PR7)
- **AT:** AT-01 deo (G2: tabelarni test svih redova FRD-05.9 N1–N8, S1–S8, B1–B8 + R4 fail-closed + R12 kombinovanje; ADR-01-T11) · **ADR:** ADR-01 · **Trace:** TM-01, TM-20
- **Procena (klasično / AI):** 4–5 / 1.5–2 · **Receipts:** R; P
- **Napomena:** kritična putanja; DQ-09 pragovi

#### W3-PR7 — Production benchmark adapter (benchmark režim) + manifest + run reset

- **Owner:** Benchmark owner
- **Spremnost (iz backlog.csv):** tehničke: W3-PR6 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:chat, host:btp
- **Obim (Delivery §2):** /api/chat putanja, izolovan run, manifest (SHA, model/quant/runtime, hardware, dataset/scorer hash, limiti, seeds, trošak), reset .mind/caches/artifacts/actions uklj. pre-seed `<dataDir>/models` sa hash-om po fajlu.
- **Fajlovi (iz plana, nisu ponovo provereni):** `benchmarks/**`; `chat*.ts` (samo benchmark flag)
- **AT:** AT-28 (G2 autoritativan, sa B2-PR1/PR2) · **ADR:** ADR-01 · **Trace:** TM-17
- **Procena (klasično / AI):** 4–5 / 1.5–2 · **Receipts:** nijedan release receipt
- **Napomena:** kritična putanja; deljeni read-only model cache (alternativa) nije u broju

#### W3-PR8 — Cherry-pick aditivnih fajlova iz feature/harness-sota-bench (bez fe7804bf)

- **Owner:** Benchmark owner (uz Harness owner review)
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Leakage firewall, gate/preflight/prereg, stats TOST, τ² adapter (Python dev alat, ne u installer), continual; ne prenositi kao rezultat 9eb454bd, 16b4dc3d, df159ac2, 18e5b36a (N=114 n.s.).
- **Fajlovi (iz plana, nisu ponovo provereni):** `benchmarks/**` (113 A + 8 M)
- **AT:** — (TM-17) · **Trace:** TM-17
- **Procena (klasično / AI):** 1–2 / 0.5–0.5 · **Receipts:** nijedan release receipt
- **Napomena:** F-REL-12; bez rebase-a; nezavisno

### W3e

#### W3e-PR1 — Active-version pointer + rollback ruta + rolled_back (CHECK rebuild) + MIG-08

- **Owner:** Evolution owner
- **Spremnost (iz backlog.csv):** tehničke: W0-PR9 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, RAT-05, REVIEW-2, W1-PR13, W1-PR14, W1-PR15 · milestone: start_after:G1-EXIT, merge_before:B2-DEVRUN, merge_before:F2 · resursi: hotspot:hive-mind-core, hotspot:server-index
- **Obim (Delivery §2):** POST /api/evolution/runs/:uuid/rollback; active_from/active_until; višenivovski backup; persona:reloaded konzument + WS relej; MIG-08 sekcija evolution runova i override verzija.
- **Fajlovi (iz plana, nisu ponovo provereni):** evolution-runs.ts:23-28,95-96; routes/evolution.ts:259; evolution-service.ts:277; index.ts:3189
- **AT:** AT-04 (G2 autoritativan); AT-27 deo (MIG-03) · **ADR:** ADR-06 · **MIG:** MIG-03; MIG-08 · **Trace:** TM-03, TM-16
- **Procena (klasično / AI):** 6–7.5 / 3–4 · **Receipts:** P (persona resolution)
- **Napomena:** F-EVO-02; mora pre B2 dev run-a

#### W3e-PR2 — EvolutionLLM adapter nad provider router-om + composePersonaPrompt

- **Owner:** Evolution owner
- **Spremnost (iz backlog.csv):** tehničke: W0-PR9 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Ugovor complete(prompt) zadržan; artifacts = executorModel, judgeModel, perExampleOutputs (redigovano); KVARK režim bez cloud izlaza.
- **Fajlovi (iz plana, nisu ponovo provereni):** evolution-llm-wiring.ts (options.model :227)
- **AT:** AT-26 deo (KVARK bez cloud judge-a) · **ADR:** ADR-06 (O7/O8) · **Trace:** TM-04
- **Procena (klasično / AI):** 2–3 / 1–1.5 · **Receipts:** P; R (ako evaluator ide kroz router)
- **Napomena:** F-EVO-04; redosled unutar W3e NEPOZNATO

#### W3e-PR3 — Paired scoring (anchor) + drift watch aktivne verzije

- **Owner:** Evolution owner
- **Spremnost (iz backlog.csv):** tehničke: W0-PR9 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, DQ-09 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Baseline uvek ocenjen u anchor fazi; aggregateScores vraća n_failed/n_aborted; combinedDelta zadržan kao polje; drift watch samo predlaže rollback (bez automatskog).
- **Fajlovi (iz plana, nisu ponovo provereni):** iterative-optimizer.ts; compose-evolution.test.ts:342-371
- **AT:** AT-29 · **ADR:** ADR-06 · **Trace:** TM-04
- **Procena (klasično / AI):** 2.5–4 / 1.5–2 · **Receipts:** P; R (ako evaluator ide kroz router)
- **Napomena:** F-EVO-06; drift watch predlaže rollback kroz W3e-PR1 rutu (ivica nije u grafu §3)

#### W3e-PR4 — builder.build() sa secret scan/split/holdout umesto sourceFromTraces

- **Owner:** Evolution owner (Memory owner: eval dataset scope)
- **Spremnost (iz backlog.csv):** tehničke: W0-PR9 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** traceFilter personaId/workspaceId, includeCorrections:false, 60/20/20; GEPA na train+val, finalni upareni score na holdout; hash skupa + broj pogleda na holdout.
- **Fajlovi (iz plana, nisu ponovo provereni):** eval-dataset.ts:232-245
- **AT:** AT-29; AT-13/AT-19 (eval skup) · **ADR:** ADR-06 · **Trace:** TM-04
- **Procena (klasično / AI):** 2–3 / 1.5–2 · **Receipts:** P; R (ako evaluator ide kroz router)
- **Napomena:** F-EVO-07; definicija „verified” zavisi W1-PR7

#### W3e-PR5 — Lokalni evaluator default + consent/cap/abort za cloud judge

- **Owner:** Evolution owner
- **Spremnost (iz backlog.csv):** tehničke: W0-PR9 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** consent flag + prikaz gde podaci odlaze (D-05); AbortController na SSE close; maxJudgeCalls cap; procena troška pre run-a.
- **Fajlovi (iz plana, nisu ponovo provereni):** EvolutionTab.tsx:1296; IterativeGEPAOptions.signal
- **AT:** — (TM-04; per-PR NEPOZNATO) · **ADR:** ADR-06 (O7/O8) · **Trace:** TM-03, TM-04
- **Procena (klasično / AI):** 2–3 / 1–1.5 · **Receipts:** P; R (ako evaluator ide kroz router)
- **Napomena:** F-EVO-08; A16

#### W3e-PR6 — EvolveSchema wire-or-drop

- **Owner:** Evolution owner
- **Spremnost (iz backlog.csv):** tehničke: W0-PR9 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** frozenSchema u Stage 2 executor i deploy artefakt ili izbaciti iz default compose-a (inženjerska odluka Evolution owner-a).
- **Fajlovi (iz plana, nisu ponovo provereni):** compose-evolution.test.ts:223,370
- **AT:** AT-05 · **ADR:** ADR-06 · **Trace:** TM-03
- **Procena (klasično / AI):** 1–1 / 0.5–0.5 · **Receipts:** P
- **Napomena:** F-EVO-05

#### W3e-PR7 — Learning kanal: markCorrected, persona signal, wire-vs-remove AgentLearning

- **Owner:** Evolution owner
- **Spremnost (iz backlog.csv):** tehničke: W0-PR9 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:chat
- **Obim (Delivery §2):** Postojeći improvement_signals put ostaje jedini kanal; bez dupliranja.
- **Fajlovi (iz plana, nisu ponovo provereni):** chat-turn-completion.ts:253-261; improvement-detector.ts:81-98; chat.ts:1485-1496
- **AT:** — (TM-03; per-PR NEPOZNATO) · **Trace:** TM-03
- **Procena (klasično / AI):** 1.5–2 / 1–1.5 · **Receipts:** P
- **Napomena:** F-EVO-09 WEAKENED; NEPOZNATO: ko zove markSurfaced

#### W3e-PR8 — Route test: complete() pozvan sa kandidatom pre judge-a

- **Owner:** Evolution owner
- **Spremnost (iz backlog.csv):** tehničke: W0-PR9 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Broj poziva po primeru = 2; stub callCount() postoji.
- **Fajlovi (iz plana, nisu ponovo provereni):** evolution-run-route.test.ts:37-58
- **AT:** AT-05 · **Trace:** TM-03
- **Procena (klasično / AI):** 0.5–1 / 0.5–0.5 · **Receipts:** —
- **Napomena:** F-EVO-03 (GEPA stage već zatvoren)

### W4

#### W4-PR1 — PermissionEnvelope tip + izračun iz postojećih izvora

- **Owner:** Capability owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:chat
- **Obim (Delivery §2):** Presek sistemski/egress, KVARK kad je povezan, korisnički grantovi, workspace/rola/read-only, sposobnosti alata; bez tier stepenice.
- **Fajlovi (iz plana, nisu ponovo provereni):** persona-tool-filter.ts:98-153; chat-governance.ts:87-89; approval-grants.ts; confirmation.ts:337-358
- **AT:** — (TM-10; per-PR NEPOZNATO) · **ADR:** ADR-04 · **Trace:** TM-10
- **Procena (klasično / AI):** 3.5–4 / 1–1.5 · **Receipts:** talas W4: P, R, I (per-PR NEPOZNATO)
- **Napomena:** nezavisan od W1

#### W4-PR2 — Resolver fasada + filterCandidates(envelope) + test read-only persona

- **Owner:** Capability owner
- **Spremnost (iz backlog.csv):** tehničke: W4-PR1 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Filter pre ranga; lane red = tie-breaker; bez fizičkog spajanja 4 engine-a (DIR-11).
- **Fajlovi (iz plana, nisu ponovo provereni):** capability-acquisition.ts:299-311; agent-search.ts:158
- **AT:** AT-17 · **ADR:** ADR-04 · **Trace:** TM-10
- **Procena (klasično / AI):** 3–4 / 1.5–1.5 · **Receipts:** talas W4: P, R, I (per-PR NEPOZNATO)
- **Napomena:** F-CAP-11

#### W4-PR3 — Tipizovan CapabilityRequest + api_key kartica + trajni proposal store (MIG-06/08)

- **Owner:** Capability owner
- **Spremnost (iz backlog.csv):** tehničke: W4-PR2 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, RAT-07, REVIEW-2, W1-PR13, W1-PR14, W1-PR15 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Proposal kind:connector; kartica poziva postojeći POST /api/connectors/:id/connect; stari HTML komentar marker prelazno podržan.
- **Fajlovi (iz plana, nisu ponovo provereni):** CapabilityRequestCard.tsx:94-99; CapabilityProposalStore.issue; agent-search.ts:79
- **AT:** AT-11; AT-27 deo · **ADR:** ADR-04 · **MIG:** MIG-06; MIG-08 · **Trace:** TM-10, TM-16
- **Procena (klasično / AI):** 4.5–5 / 1.5–2 · **Receipts:** talas W4: P, R, I (per-PR NEPOZNATO)
- **Napomena:** W1-PR14 merge-preduslov

#### W4-PR4 — BLOCKED_CAPABILITY resume na SetupCompleted

- **Owner:** Capability owner (hotspot: Chat owner)
- **Spremnost (iz backlog.csv):** tehničke: W4-PR3, W1-PR4 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:chat
- **Obim (Delivery §2):** Run kreiran pre blokiranja (DIR-04); validan setup vraća isti run.
- **Fajlovi (iz plana, nisu ponovo provereni):** chat-turn-preparation.ts; W1 run store
- **AT:** AT-11 · **ADR:** ADR-04 · **Trace:** TM-10
- **Procena (klasično / AI):** 4–6 / 2–3 · **Receipts:** talas W4: P, R, I (per-PR NEPOZNATO)

#### W4-PR5 — OAuth state vezan za request + persistencija + PKCE + callback (MIG-06/08)

- **Owner:** Security owner (talas: Capability owner)
- **Spremnost (iz backlog.csv):** tehničke: W4-PR4 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2, W1-PR13, W1-PR14, W1-PR15 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** pendingStates sa requestId/workspaceId/sessionId; callback → interni događaj → isti run samo uz važeći grant; Waggle-owned OAuth client van obima (R12).
- **Fajlovi (iz plana, nisu ponovo provereni):** oauth.ts:64-65,138-139,200-209,290-311
- **AT:** AT-11 deo; AT-27 deo · **ADR:** ADR-04 (O4) · **MIG:** MIG-06; MIG-08 · **Trace:** TM-10, TM-16
- **Procena (klasično / AI):** 3.5–4.5 / 1.5–2 · **Receipts:** talas W4: P, R, I (per-PR NEPOZNATO)

#### W4-PR6 — Negativni grant / decline expiry (MIG-06/08) + revoke RED→GREEN (AT-12)

- **Owner:** Security owner (talas: Capability owner)
- **Spremnost (iz backlog.csv):** tehničke: W4-PR4 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2, W1-PR13, W1-PR14, W1-PR15 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:chat
- **Obim (Delivery §2):** Opoziv preživi restart; model/hook/IM ga ne poništavaju; revoke test ne postoji na 2af0904d.
- **Fajlovi (iz plana, nisu ponovo provereni):** chat-approval-hook.ts:81,123,496-506; approval-grants.ts:286; routes/approval.ts:120
- **AT:** AT-12 (G2 autoritativan); AT-19 (G2 autoritativan, sa W4-PR7); AT-27 deo · **ADR:** ADR-04 · **MIG:** MIG-06; MIG-08 · **Trace:** TM-10, TM-16
- **Procena (klasično / AI):** 1.5–2 / 0.5–1 · **Receipts:** talas W4: P, R, I (per-PR NEPOZNATO)
- **Napomena:** ako test otkrije da opoziv ne preživi restart, trošak iznad raspona NEPOZNATO

#### W4-PR7 — THREAT_MODEL.md dopuna + test „nema vault vrednosti u promptu/trace-u”

- **Owner:** Security owner
- **Spremnost (iz backlog.csv):** tehničke: W4-PR4 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2 · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Inline install granica (starter-pack/proposal, forceInsecure, SecurityGate), MCP binary install, egress profili, PostHog; bez novog threat-model ADR-a.
- **Fajlovi (iz plana, nisu ponovo provereni):** THREAT_MODEL.md; installer-security.test.ts:825
- **AT:** AT-19 (G2 autoritativan, sa W4-PR6) · **ADR:** ADR-10 (P6) · **Trace:** TM-10
- **Procena (klasično / AI):** 1–1.5 / 0.5–1 · **Receipts:** talas W4: P, R, I (per-PR NEPOZNATO)
- **Napomena:** praznina = NALAZ AUDITA — ZA PROVERU

### W5

#### W5-PR1 — step payload + StepContentBlock + most per-run bus → step

- **Owner:** UX owner; Chat owner (SSE step)
- **Spremnost (iz backlog.csv):** tehničke: W1-PR8 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:chat
- **Obim (Delivery §2):** runId, phaseId, status running/done/failed/blocked, evidenceRefs; aditivno proširenje postojećeg step kanala.
- **Fajlovi (iz plana, nisu ponovo provereni):** chat-agent-run.ts; StepContentBlock; ActivityStream
- **AT:** AT-10 (UI deo) · **ADR:** ADR-03 · **Trace:** TM-06
- **Procena (klasično / AI):** 3.5–5 / 2–2.5 · **Receipts:** I (UI)
- **Napomena:** rok F2

#### W5-PR2 — View-work drawer + run-status-labels.ts

- **Owner:** UX owner
- **Spremnost (iz backlog.csv):** tehničke: W5-PR1 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Drawer za partial/blocked/cancelled/failed bez procenata; deljena mapa za Home/Agents/Room.
- **Fajlovi (iz plana, nisu ponovo provereni):** run-status-labels.ts (novo); activity-labels.ts (obrazac)
- **AT:** FRD-05.8 View-work test (bez AT ID-a) · **Trace:** TM-06, TM-14
- **Procena (klasično / AI):** 3.5–5 / 2–2.5 · **Receipts:** I (UI)
- **Napomena:** rok F2

### W6

#### W6-PR1 — Readiness istinitost (useHasWorkingModel + ModelGate)

- **Owner:** Model/Runtime owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** ready tek posle stvarne generacije; lomi i prepisuje useHasWorkingModel.test.ts:271-281,301-307,486-495.
- **Fajlovi (iz plana, nisu ponovo provereni):** useHasWorkingModel.ts:129-136,174,244; ModelGate.tsx:257-261
- **AT:** AT-20 · **Trace:** TM-13
- **Procena (klasično / AI):** 3–4 / 1.5–2 · **Receipts:** I; R
- **Napomena:** F-UXM-02..06

#### W6-PR2 — reason u ModelProbeResult + UI poruke

- **Owner:** Model/Runtime owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** timeout/unreachable/cold_start/http_error/empty_content.
- **Fajlovi (iz plana, nisu ponovo provereni):** ModelGate.tsx:843-858
- **AT:** AT-20 · **Trace:** TM-13
- **Procena (klasično / AI):** 1.5–2 / 0.5–1 · **Receipts:** I; R

#### W6-PR3 — Tool/structured-output round-trip probe za work profil

- **Owner:** Model/Runtime owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Opcioni drugi probe; ne menja chat.
- **Fajlovi (iz plana, nisu ponovo provereni):** NEPOZNATO (novi probe)
- **AT:** AT-20 · **Trace:** TM-13
- **Procena (klasično / AI):** 2–3 / 1–1.5 · **Receipts:** I; R

#### W6-PR4 — Pull stream:true + NDJSON relay + resume

- **Owner:** Model/Runtime owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Post-pull digest + generation probe se zadržavaju.
- **Fajlovi (iz plana, nisu ponovo provereni):** local-inference.ts:313-332,338-377
- **AT:** AT-20 · **Trace:** TM-13
- **Procena (klasično / AI):** 3–4 / 1.5–2 · **Receipts:** I; R

#### W6-PR6 — Ollama repin + katalog + /api/show arch check + certify polja

- **Owner:** Model/Runtime owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-05 · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:B2-DEVRUN, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Pin 0.32.3 je stariji od prvog Qwen 3.8 release-a; repin ≥0.32.15 posle pull/generate/tools testa; certificateModel vs recommendedModel.
- **Fajlovi (iz plana, nisu ponovo provereni):** managed-ollama-runtime.ts:28-29,158-237; cookbook/catalog.ts:44-51; model-fit.ts:207-214
- **AT:** AT-30 deo (managed model receipt) · **Trace:** TM-13
- **Procena (klasično / AI):** 3–4.5 / 1.5–2 · **Receipts:** I; R
- **Napomena:** NALAZ AUDITA — ZA PROVERU (external §1.3); hrani B2-PR3; DQ-05 najkasnije ≈ 20 rd od starta G2

#### W6-PR7 — Hardware ladder merenja (≥3 profila)

- **Owner:** Model/Runtime owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-05 · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hw:gpu-24gb-nvidia, hw:gpu-16gb, hw:cpu-only
- **Obim (Delivery §2):** 24 GB NVIDIA, 16 GB, CPU-only; brojevi se mere, ne prepisuju.
- **Fajlovi (iz plana, nisu ponovo provereni):** dokument + fixture zadaci
- **AT:** AT-20 (realan Windows hardver, FRD §15) · **Trace:** TM-13
- **Procena (klasično / AI):** 3.5–4.5 / 2–2.5 · **Receipts:** —
- **Napomena:** merenje i pull wall-clock su CI/compute G2; serverska FP8 merenja (LM TEK H200) nisu red ovog ladder-a; udaljeni endpoint = zaseban red po FRD-10.4 (PRD-13-10 t.6)

### W8

#### W8-PR2 — Crash-injection receipt skript nad packaged build-om

- **Owner:** Release owner
- **Spremnost (iz backlog.csv):** tehničke: W1-PR4, W1-PR5 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2, FOUNDER-REVIEW · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: host:vm-disposable, hotspot:release
- **Obim (Delivery §2):** Izvršava se samo na namenskoj VM ili disposable Windows nalogu (DP-0.11).
- **Fajlovi (iz plana, nisu ponovo provereni):** `scripts/certify-*` (korak) ili zaseban skript
- **AT:** AT-07 deo (packaged, receipt C na F2); AT-30 · **Trace:** TM-19
- **Procena (klasično / AI):** 2–3 / 1–1 · **Receipts:** C
- **Napomena:** F-REL-03; merge pre F2

### B1

#### B1-PR1 — Evidence card + protokol nacrt (dokumentacija)

- **Owner:** Benchmark owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Evidence card, split/firewall/manifest definicije; bez Harbor-a, ruler run-a i plaćenih poziva. Izbor APEX-Agents 1.1 = PREDLOG.
- **Fajlovi (iz plana, nisu ponovo provereni):** docs/plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md
- **AT:** — (TM-17) · **Trace:** TM-17
- **Procena (klasično / AI):** 2–3 / 1–2 · **Receipts:** nijedan release receipt
- **Napomena:** rano u G2

### B2

#### B2-PR0a — Harbor 0.20.0 + tri image-a na bench mašini

- **Owner:** Benchmark owner
- **Spremnost (iz backlog.csv):** tehničke: B1-PR1 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-04 · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: host:bench
- **Obim (Delivery §2):** Docker/WSL2 samo na bench mašini, ne u proizvodu.
- **Fajlovi (iz plana, nisu ponovo provereni):** bench mašina (van repoa)
- **AT:** — (TM-17) · **Trace:** TM-17, TM-20
- **Procena (klasično / AI):** 0.5–1 / 0.5–0.5 · **Receipts:** nijedan release receipt
- **Napomena:** van kritične putanje

#### B2-PR0b — Ruler: referentni agent + analiza odstupanja (B2-EXIT-0)

- **Owner:** Benchmark owner
- **Spremnost (iz backlog.csv):** tehničke: B2-PR0a · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-04 · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: host:bench, budget:dq-04
- **Obim (Delivery §2):** Prvi plaćeni benchmark korak; ruler wall-clock 0.5–1 rd (placeholder, NEPOZNATO) i judge trošak su CI/compute.
- **Fajlovi (iz plana, nisu ponovo provereni):** `benchmarks/**`
- **AT:** — (TM-17) · **Trace:** TM-17, TM-20
- **Procena (klasično / AI):** 0.5–1.5 / 0.5–1 · **Receipts:** nijedan release receipt

#### B2-PR0c — Split generisanje + hash-ovi

- **Owner:** Benchmark owner
- **Spremnost (iz backlog.csv):** tehničke: B2-PR0b · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: host:bench
- **Obim (Delivery §2):** Dev/validation/sealed split + hash.
- **Fajlovi (iz plana, nisu ponovo provereni):** `benchmarks/**`
- **AT:** — (TM-17) · **Trace:** TM-17, TM-20
- **Procena (klasično / AI):** 0.5–0.5 / 0.5–0.5 · **Receipts:** nijedan release receipt

#### B2-PR1 — Harbor agent shim → production sidecar

- **Owner:** Benchmark owner
- **Spremnost (iz backlog.csv):** tehničke: W3-PR7 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:B2-DEVRUN, merge_before:F2 · resursi: host:bench
- **Obim (Delivery §2):** Samo shim; manifest i run reset su u W3-PR7.
- **Fajlovi (iz plana, nisu ponovo provereni):** `benchmarks/**`
- **AT:** AT-28 · **ADR:** ADR-01 · **Trace:** TM-17, TM-20
- **Procena (klasično / AI):** 2.5–4 / 1–1.5 · **Receipts:** nijedan release receipt
- **Napomena:** kritična putanja

#### B2-PR2a — Rework popravke posle B2 dev run-a (greške, kalibracija timeout-a)

- **Owner:** Benchmark owner
- **Spremnost (iz backlog.csv):** tehničke: B2-PR1, B2-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:B2-DEVRUN, start_after:G1-EXIT, merge_before:B2-VALRUN, merge_before:F2 · resursi: host:bench
- **Obim (Delivery §2):** Posle dev run-a (wall-clock 1–3 rd, placeholder). Dev run zavisi i od W6-PR6, W2-PR1 i B2-PR3.
- **Fajlovi (iz plana, nisu ponovo provereni):** `benchmarks/**`
- **AT:** AT-28 · **Trace:** TM-17, TM-20
- **Procena (klasično / AI):** 1–3 / 0.5–1.5 · **Receipts:** nijedan release receipt
- **Napomena:** kritična putanja; re-run 0–2 rd i validation run 1–3 rd su compute, nisu tiketi

#### B2-PR2 — Razvojni run izveštaj (posle dev, re-run i validation izbora)

- **Owner:** Benchmark owner
- **Spremnost (iz backlog.csv):** tehničke: B2-PR2a · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:B2-VALRUN, start_after:G1-EXIT, merge_before:F2 · resursi: —
- **Obim (Delivery §2):** Bez marketing tvrdnji; nikada „beats” iz B2.
- **Fajlovi (iz plana, nisu ponovo provereni):** `benchmarks/results/<test>-<datum>/`
- **AT:** AT-28 · **Trace:** TM-17, TM-20
- **Procena (klasično / AI):** 2–3 / 1–2 · **Receipts:** nijedan release receipt
- **Napomena:** kritična putanja; posle njega F2

#### B2-PR3 — Konfiguracija/tuning ciljnog modela pre A/B

- **Owner:** Benchmark owner
- **Spremnost (iz backlog.csv):** tehničke: B2-PR0c, W6-PR6 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-04, DQ-05 · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:B2-DEVRUN, merge_before:F2 · resursi: host:bench, budget:dq-04
- **Obim (Delivery §2):** Sampling, thinking mode, tool parser, ctx/KV; tuning samo na dev split-u (protokol §7).
- **Fajlovi (iz plana, nisu ponovo provereni):** `benchmarks/**`
- **AT:** — (TM-17) · **Trace:** TM-17, TM-20
- **Procena (klasično / AI):** 5–8 / 3–5 · **Receipts:** nijedan release receipt
- **Napomena:** R16; mora pre B2 dev run-a; profil = DQ-05 (FRD-13.4 `profileId`); H200 FP8 merenja LM TEK programa nisu B2 profil ni zamena (PRD-13-10 t.6)

<!-- GEN:G2:END -->

---

## 5. G3 tiketi — kompaktne kartice

G3 počinje posle F2. Pretpostavka rasponā: DQ-02, DQ-03, DQ-06, DQ-07 i DQ-08 odlučeni pre starta G3 (Delivery §4.3). W3e-PR9a..e postoje samo ako je ODB-02 = da. ODB-02 ČEKA ODLUKU OSNIVAČA; preporuka (PREDLOG) je opcija A: W3e-PR9a..e u G3. Opcija B („W3e-PR9 u G2”) menja milestone ovih tiketa samo doc-only PR-om uz odluku osnivača (03 §0.1). Tvrdnja o doprinosu sloja: Benchmark BP-MSG-01.

<!-- GEN:G3:BEGIN -->

### W3e

#### W3e-PR9a — Registry odobrenih varijanti + nepromenljivi invariants

- **Owner:** Evolution owner; Harness owner (recipe registry)
- **Spremnost (iz backlog.csv):** tehničke: W3-PR3, W3e-PR1, W3e-PR3, W3e-PR4 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, ODB-02 · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: host:bench
- **Obim (Delivery §2):** Test da kandidat ne može da menja scope, egress, approvals, budget cap, obavezne gate-ove i kontaminacionu granicu.
- **Fajlovi (iz plana, nisu ponovo provereni):** iterative-optimizer.ts:88-93 (EvolutionTarget nema vrednost → net-new)
- **AT:** preduslov AT-29 (recipe deo) · **ADR:** ADR-06 · **Trace:** TM-21
- **Procena (klasično / AI):** 2–3 / 1–1.5 · **Receipts:** P
- **Napomena:** DIR-14; T_evo compute 1–8 rd (placeholder, NEPOZNATO) odvojeno

#### W3e-PR9b — Generator kandidata (mutacije unutar registry-ja)

- **Owner:** Evolution owner
- **Spremnost (iz backlog.csv):** tehničke: W3e-PR9a · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, ODB-02 · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: host:bench
- **Obim (Delivery §2):** n_kand 2–4 po generaciji, g 1–2 (PREDLOG ulazi).
- **Fajlovi (iz plana, nisu ponovo provereni):** NEPOZNATO
- **AT:** preduslov AT-29 (recipe deo) · **ADR:** ADR-06 · **Trace:** TM-21
- **Procena (klasično / AI):** 2–4 / 1–2 · **Receipts:** P

#### W3e-PR9c — Upareno ocenjivanje (reuse W3e-PR3/PR4)

- **Owner:** Evolution owner
- **Spremnost (iz backlog.csv):** tehničke: W3e-PR9b · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, ODB-02 · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: host:bench
- **Obim (Delivery §2):** Anchor + holdout iz W3e-PR3/PR4.
- **Fajlovi (iz plana, nisu ponovo provereni):** NEPOZNATO
- **AT:** preduslov AT-29 (recipe deo) · **ADR:** ADR-06 · **Trace:** TM-21
- **Procena (klasično / AI):** 1–2 / 0.5–1 · **Receipts:** P

#### W3e-PR9d — Eksplicitna promocija + rollback (reuse W3e-PR1)

- **Owner:** Evolution owner
- **Spremnost (iz backlog.csv):** tehničke: W3e-PR9c · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, ODB-02 · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Pointer iz W3e-PR1.
- **Fajlovi (iz plana, nisu ponovo provereni):** NEPOZNATO
- **AT:** preduslov AT-29 (recipe deo) · **ADR:** ADR-06 · **Trace:** TM-21
- **Procena (klasično / AI):** 1–2 / 0.5–1 · **Receipts:** P

#### W3e-PR9e — Testovi (AT-29 za recipe target, invariants)

- **Owner:** Evolution owner
- **Spremnost (iz backlog.csv):** tehničke: W3e-PR9d · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, ODB-02 · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Recipe deo AT-29; ako ODB-02 = ne, ne važi.
- **Fajlovi (iz plana, nisu ponovo provereni):** NEPOZNATO
- **AT:** AT-29 (G3 recipe deo, samo uz ODB-02 = da) · **ADR:** ADR-06 · **Trace:** TM-21
- **Procena (klasično / AI):** 2–3 / 1–1.5 · **Receipts:** P
- **Napomena:** PRD-10-13 tvrdnja zavisi od ovog; dozvoljena tvrdnja po Benchmark BP-MSG-01 (rezultat bez recipe sloja nije dokaz njegovog doprinosa)

### W4

#### W4-PR8 — ActionDescriptor kao izvor istine za side-effect endpointe

- **Owner:** Capability owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** UI, agent i rutina pozivaju istu akciju kroz isti permission/validation ugovor.
- **Fajlovi (iz plana, nisu ponovo provereni):** command-registry.ts:108-192
- **AT:** AT-18 (G3 autoritativan) · **ADR:** ADR-04 (napomena: agent tool i held action dele ToolDefinition) · **Trace:** TM-11
- **Procena (klasično / AI):** 4–6 / 2–2.5 · **Receipts:** P; R; I
- **Napomena:** F-CAP-13; ivica prema W4-PR1..PR7 nije u grafu §3; površina koju meri B3 → F2→F3 carry-forward review

### W5

#### W5-PR3 — Routines Home blok + blocked status

- **Owner:** UX owner; Durable owner
- **Spremnost (iz backlog.csv):** tehničke: W1-PR11 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Čita /api/automations; sledeći termin, blokada, pause/disable; uklanjanje mrtve running/failed grane.
- **Fajlovi (iz plana, nisu ponovo provereni):** HomeCockpit.tsx; automations.ts:128-148; types.ts:777
- **AT:** AT-23 deo (G3) · **ADR:** ADR-07 (O9) · **Trace:** TM-07, TM-14
- **Procena (klasično / AI):** — (grupa W5-PR3..PR7 (G3 ostatak, §4.1.1): 7–10.5 / 3.5–6) · **Receipts:** I (UI)
- **Napomena:** F-UXM-13, F-DUR-11

#### W5-PR4 — Nav/⌘K gating + jedan advanced prekidač (A23) + copy lint test

- **Owner:** UX owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, DQ-08 · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Power tools samo za isPro; New Agent ispod power; A23 = PREDLOG — SMER BRIEFA.
- **Fajlovi (iz plana, nisu ponovo provereni):** command-catalog.ts; Sidebar.tsx:180-191; dock-tiers.ts:121-131
- **AT:** AT-17 posredno (W5 exit) · **Trace:** TM-14
- **Procena (klasično / AI):** — (grupa W5-PR3..PR7 (G3 ostatak, §4.1.1): 7–10.5 / 3.5–6) · **Receipts:** I (UI)
- **Napomena:** F-UXM-15; command-catalog.ts:80 Upgrade to Team → WB-PR5

#### W5-PR5 — First-task artefakt + persona copy „role/modes”

- **Owner:** UX owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Template-specifičan prvi zadatak koji proizvodi artefakt; mrtvi ALL_ONBOARDING_PERSONAS/getPersonasForTemplate povezati ili ukloniti.
- **Fajlovi (iz plana, nisu ponovo provereni):** OnboardingWizard.tsx:107; ModelGateStep.tsx
- **AT:** — · **Trace:** TM-14
- **Procena (klasično / AI):** — (grupa W5-PR3..PR7 (G3 ostatak, §4.1.1): 7–10.5 / 3.5–6) · **Receipts:** I (UI)

#### W5-PR6 — Playwright/visual baseline update

- **Owner:** UX owner
- **Spremnost (iz backlog.csv):** tehničke: W5-PR4 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: host:btp
- **Obim (Delivery §2):** E2E env izolacija po checklisti (WAGGLE_E2E_BASE_URL/PORT, REUSE_EXISTING_SERVER=0).
- **Fajlovi (iz plana, nisu ponovo provereni):** `tests/visual/**`
- **AT:** — · **Trace:** TM-14
- **Procena (klasično / AI):** — (grupa W5-PR3..PR7 (G3 ostatak, §4.1.1): 7–10.5 / 3.5–6) · **Receipts:** —
- **Napomena:** ivica W5-PR4 → W5-PR6 iz §4.3 (DQ-08)

#### W5-PR7 — axe za ?forceWizard=true rute + centralizovani stringovi

- **Owner:** UX owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Wizard/ModelGate pokriveni axe-om; bez i18n framework-a do DQ-08.
- **Fajlovi (iz plana, nisu ponovo provereni):** tests/e2e/runtime-a11y.spec.ts:10-60; activity-labels.ts
- **AT:** a11y test (W5 exit; bez AT ID-a) · **Trace:** TM-14
- **Procena (klasično / AI):** — (grupa W5-PR3..PR7 (G3 ostatak, §4.1.1): 7–10.5 / 3.5–6) · **Receipts:** —

### W6

#### W6-PR5 — WMI detection + test sa lažnim izlazom

- **Owner:** Model/Runtime owner
- **Spremnost (iz backlog.csv):** tehničke: W6-PR1, W6-PR2, W6-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Win32_VideoController + registry qwMemorySize zbog 4 GB AdapterRAM cap-a.
- **Fajlovi (iz plana, nisu ponovo provereni):** hardware-detect.ts:330
- **AT:** — (TM-13; FRD §15 AT-20 zatvaraju W6-PR1..PR4) · **Trace:** TM-13
- **Procena (klasično / AI):** — (grupa W6-PR5/PR8 (G3 ostatak, §4.1.1): 4–6 / 2–3) · **Receipts:** I
- **Napomena:** površina koju meri B3 → carry-forward review

#### W6-PR8 — Wizard reorder + OpenAI-compatible preseti

- **Owner:** UX owner; Model/Runtime owner
- **Spremnost (iz backlog.csv):** tehničke: W6-PR1, W6-PR2, W6-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Tok: šta želiš → model → prvi Workspace + izvori → opciona mail/calendar → prvi zadatak; llama.cpp/LM Studio preseti.
- **Fajlovi (iz plana, nisu ponovo provereni):** OnboardingWizard.tsx; ModelGate.tsx
- **AT:** — (TM-14) · **Trace:** TM-14
- **Procena (klasično / AI):** — (grupa W6-PR5/PR8 (G3 ostatak, §4.1.1): 4–6 / 2–3) · **Receipts:** I
- **Napomena:** površina koju meri B3 → carry-forward review

### W7

#### W7-PR1 — Kanal profil tabela + evidence card po kanalu (doc)

- **Owner:** Attention owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-06 · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** live/bot/export/roadmap po kanalu.
- **Fajlovi (iz plana, nisu ponovo provereni):** FRD
- **AT:** — (TM-12) · **Trace:** TM-12
- **Procena (klasično / AI):** 1–1 / 0.5–0.5 · **Receipts:** —
- **Napomena:** W7 talas zavisi DQ-06, W1, W4, W2 taint

#### W7-PR2 — WorkItem store + erasure/export (MIG-06/08)

- **Owner:** Attention owner; Memory owner (erasure)
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-06 · merge: MERGE-AUTH, REVIEW-2 · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Action/Commitment/Decision/Signal sa provenance, confidence, korisničkom korekcijom; spajanje reverzibilno.
- **Fajlovi (iz plana, nisu ponovo provereni):** NEPOZNATO (novi state layer, ne .mind)
- **AT:** AT-15 deo; AT-27 (WorkItem deo, G3 autoritativan); AT-13 (regresija) · **MIG:** MIG-06; MIG-08 · **Trace:** TM-12, TM-16
- **Procena (klasično / AI):** 5–6 / 2–2.5 · **Receipts:** I
- **Napomena:** serijski deo W7-PR2→PR3→PR4→PR6; W7 talas zavisi W1

#### W7-PR3 — Sync engine izabranog ekosistema + cursor/delta + BYO OAuth client

- **Owner:** Attention owner
- **Spremnost (iz backlog.csv):** tehničke: W7-PR2 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-06 · merge: MERGE-AUTH, CASA-GMAIL · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** historyId/syncToken/delta, izgubljen cursor, revoked credentials, retention.
- **Fajlovi (iz plana, nisu ponovo provereni):** gmail-connector.ts / outlook-connector.ts (po DQ-06)
- **AT:** AT-19 deo; AT-11 (regresija) · **Trace:** TM-12
- **Procena (klasično / AI):** 6–8 / 2.5–3.5 · **Receipts:** I

#### W7-PR4 — Klasifikator + labeled set tooling + eval skript

- **Owner:** Attention owner
- **Spremnost (iz backlog.csv):** tehničke: W7-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-06, DQ-09 · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: human:labeling
- **Obim (Delivery §2):** Labeled holdout; precision floor zaključan pre scoring-a; labeling = ljudski sati (8–16 h, veličina NEPOZNATO).
- **Fajlovi (iz plana, nisu ponovo provereni):** NEPOZNATO
- **AT:** AT-24 · **Trace:** TM-12
- **Procena (klasično / AI):** 5–7 / 2–3 · **Receipts:** R (ako klasifikator koristi model)

#### W7-PR5 — Home What-Needs-Me lista + akcije

- **Owner:** Attention owner (home.ts: UX owner)
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-06 · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** dismiss/snooze/convert/link/correct.
- **Fajlovi (iz plana, nisu ponovo provereni):** home.ts; HomeCockpit.tsx
- **AT:** — (TM-12) · **Trace:** TM-12
- **Procena (klasično / AI):** 3–4 / 1–1.5 · **Receipts:** I (UI)
- **Napomena:** ivica prema W7-PR2 nije u grafu §3 (NEPOZNATO)

#### W7-PR6 — Convert-to-work → DurableRun sa taint

- **Owner:** Attention owner; Security owner
- **Spremnost (iz backlog.csv):** tehničke: W7-PR4, W2-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-06 · merge: MERGE-AUTH, REVIEW-2 · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Nikad ne izvršava neodobren spoljni efekat.
- **Fajlovi (iz plana, nisu ponovo provereni):** NEPOZNATO
- **AT:** AT-19 deo (G3) · **Trace:** TM-12
- **Procena (klasično / AI):** 2–3 / 1–1.5 · **Receipts:** I
- **Napomena:** W7 talas zavisi W1; površina koju meri B3 → carry-forward review

#### W7-PR7 — Drugi izvor (kalendar istog ekosistema)

- **Owner:** Attention owner
- **Spremnost (iz backlog.csv):** tehničke: W7-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-06 · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Deli PR3 cursor obrazac.
- **Fajlovi (iz plana, nisu ponovo provereni):** gcal-connector.ts / outlook-connector.ts (po DQ-06)
- **AT:** — (TM-12) · **Trace:** TM-12
- **Procena (klasično / AI):** 2–3 / 1–1.5 · **Receipts:** I
- **Napomena:** Slack/ostali = roadmap posle G3

### W8

#### W8-PR3 — IM approve token tok + pairing persistencija (samo Telegram) + MIG-06/08

- **Owner:** Channels owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-07 · merge: MERGE-AUTH, REVIEW-2, W1-PR14 · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Kratkotrajni one-time token vezan za pending_action.id, payload fingerprint, expiry; replay/forward ne daje grant; fake Telegram u testu.
- **Fajlovi (iz plana, nisu ponovo provereni):** pairing.ts:95-123; `channels/*`; channels.json
- **AT:** AT-25; AT-27 deo (MIG-08 pairing) · **MIG:** MIG-06; MIG-08 · **Trace:** TM-22
- **Procena (klasično / AI):** 3–4 / 2–2.5 · **Receipts:** talas W8: I, R, P, A, C (puni set na RC)
- **Napomena:** PREDLOG uslovno od DQ-07; W1-PR14 merge-preduslov MIG-08

#### W8-PR4 — Status push / rezultat rutine / forward→WorkItem (samo Telegram)

- **Owner:** Channels owner
- **Spremnost (iz backlog.csv):** tehničke: W8-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-07 · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Status push i forward u WorkItem.
- **Fajlovi (iz plana, nisu ponovo provereni):** `channels/*`
- **AT:** AT-25 · **Trace:** TM-22
- **Procena (klasično / AI):** 1.5–2.5 / 1–1.5 · **Receipts:** talas W8: I, R, P, A, C (puni set na RC)
- **Napomena:** PREDLOG uslovno od DQ-07

#### W8-PR5 — Certify: notices/SBOM asserti + packaged migracioni korak nad golden fixture-om

- **Owner:** Release owner
- **Spremnost (iz backlog.csv):** tehničke: OSS-PR3 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, REVIEW-2, FOUNDER-REVIEW · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: host:vm-disposable, hotspot:release
- **Obim (Delivery §2):** Jedini PR sa certify assertima za notices/SBOM; izvršenje samo na namenskoj VM ili disposable nalogu.
- **Fajlovi (iz plana, nisu ponovo provereni):** scripts/certify-windows-installer.ps1
- **AT:** AT-30 · **ADR:** ADR-10 · **Trace:** TM-18
- **Procena (klasično / AI):** 1.5–2 / 1–1.5 · **Receipts:** I
- **Napomena:** `release.yml`/`certify-*` ne dirati bez founder review-a

#### W8-PR6 — Release checklist doc + review ADR-10

- **Owner:** Release owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, RAT-09 · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Tačne komande iz package.json/release.yml, bez pokretanja; runbook release puta F3a → K → F3b → GO → promocija sa listom preduslova i provera (Delivery §5.1 RP-01..RP-12).
- **Fajlovi (iz plana, nisu ponovo provereni):** docs (release checklist)
- **AT:** AT-30 (egress deo, TM-24) · **ADR:** ADR-10 (O1–O3, O7) · **Trace:** TM-19, TM-24
- **Procena (klasično / AI):** 1–1.5 / 1–1 · **Receipts:** —
- **Napomena:** GitHub podešavanja = owner radnje, ne PR

#### W8-PR7 — release.yml: bootstrap identitet kao zaštićen ulaz (uslovno, REL-BOOT)

- **Owner:** Release owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, REL-BOOT · merge: MERGE-AUTH, REVIEW-2, FOUNDER-REVIEW · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: hotspot:release
- **Obim (Delivery §5.1 RP-11):** (a) bootstrap identitet `vX.Y.Z@<sha>` iz zaštićenog ulaza umesto hardkodiranog `0.2.0`, samo dok ne postoji objavljen Windows release; (b) samo ako ADR-10-T13 padne: promocija sealed izlaza postojećeg run-a bez ponovnog build-a. Sve postojeće boundary provere ostaju (repo, tag, čist checkout, `GITHUB_WORKFLOW_SHA`, ancestry, signer subject, SHA vezivanja). PR ne pokreće workflow.
- **Fajlovi (provereno na `2af0904d`):** `.github/workflows/release.yml:232-296`; `scripts/publish-windows-release.ps1:563-575,602,633,699`
- **AT:** AT-30 · **ADR:** ADR-10 (O11, O12) · **Trace:** TM-19
- **Procena (klasično / AI):** NEPOZNATO (procenjuje tech lead) · **Receipts:** — (menja workflow na `S`; artefakt nastaje tek u K)
- **Napomena:** merge pre F3-SRC, jer tag run koristi workflow sa `S` (`release.yml:210-211`). REL-BOOT se donosi posle kapije REL-T13 (ADR-10-T13, pre F3-SRC). Ako REL-T13 traži (b), obim (b) ulazi u ovaj tiket. Ako osnivač odluči REL-BOOT = ne (dozvoljeno samo kad REL-T13 ne traži (b)), tiket je ODLOŽENO, a bootstrap `v0.2.0` je jednokratan (RP-10). `release.yml` se ne dira bez founder review-a.

### WB

#### WB-PR3 — KVARK registracija + gate (vault config i health.ok) + connect/validate/disconnect/revoke

- **Owner:** Boundary owner (local/index.ts: Server owner)
- **Spremnost (iz backlog.csv):** tehničke: WB-PR2 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, RAT-08, REVIEW-2, KVARK-IF · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: hotspot:server-index
- **Obim (Delivery §2):** Gate getKvarkConfig(vault)!==null && health.ok; no-sharing default; bez cloud fallback-a; isEnterprise iz stanja konekcije; revocation ledger kuka (W1-PR15).
- **Fajlovi (iz plana, nisu ponovo provereni):** kvark-tools.ts; local/index.ts (tool registracija); SettingsApp.tsx:1332-1343
- **AT:** AT-26 (G3 autoritativan) · **ADR:** ADR-08 (O3) · **MIG:** MIG-07.3 · **Trace:** TM-15
- **Procena (klasično / AI):** 4–5 / 2–2.5 · **Receipts:** I; P; R
- **Napomena:** F-TK-11; površina koju meri B3 → carry-forward review; ugovor i vlasnik KVARK API-ja po PRD-13-10 t.4 i FRD-11.4 (kapija KVARK-IF pre merge-a; 05 N-29); bez JA/MI/KOMPANIJA, roster-a i KVARK Workspace funkcija (PRD-13-10 t.3)

#### WB-PR4 — Mrtvi tier kod + dedup čitača + session cap/embeddingProviders + GET /api/admin/overview

- **Owner:** Boundary owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, RAT-08, REVIEW-2 · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: hotspot:tiers
- **Obim (Delivery §2):** readTierFromDataDir dedup; session cap i embeddingProviders kao runtime/deployment vrednost uz merenje.
- **Fajlovi (iz plana, nisu ponovo provereni):** connectors.ts:183; workspaces.ts:341; fleet.ts:8; tier-session-cap.ts:4; tiers.ts:85
- **AT:** AT-27 deo (MIG-07.2) · **ADR:** ADR-08 (08.2c/e/f/h/i) · **MIG:** MIG-07.2 · **Trace:** TM-15, TM-16
- **Procena (klasično / AI):** 3–4 / 1.5–2 · **Receipts:** I
- **Napomena:** ne zavisi od DQ-03

#### WB-PR5 — LEGACY_TIER_MAP v2 + config.json v2 + checkout.ts 400 + www/in-app copy + PRO ostaci

- **Owner:** Boundary owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-03 · merge: MERGE-AUTH, DQ-01, REVIEW-2 · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Read-compatible mapiranje; Klasa A rollback; Stripe bez promene do DQ-03.
- **Fajlovi (iz plana, nisu ponovo provereni):** checkout.ts; en.json:196-250; Pricing.tsx:10-58; command-catalog.ts:80; WorkspaceDesktopApp.tsx:381,939-949; PlanCards.tsx:59; SettingsApp.tsx:1029,1041
- **AT:** AT-27 (tier deo, G3 autoritativan) · **ADR:** ADR-08 (08.2d) · **MIG:** MIG-07.4 · **Trace:** TM-16
- **Procena (klasično / AI):** 2–3 / 1–1.5 · **Receipts:** I

#### WB-PR6 — Team-sync sudbina (isolate+freeze / legacy compat)

- **Owner:** Boundary owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-03 · merge: MERGE-AUTH, RAT-08, REVIEW-2 · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Varijanta KVARK adapter uslovljena ADR-08-K9 (NEPOZNATO) i van G3 raspona.
- **Fajlovi (iz plana, nisu ponovo provereni):** team-sync.ts
- **AT:** AT-26 (TM-15: personal mind se ne kopira) · **ADR:** ADR-08 (O5); ADR-09 · **MIG:** MIG-07.5 · **Trace:** TM-15
- **Procena (klasično / AI):** 2–3 / 1–1.5 · **Receipts:** I

### OSS

#### OSS-PR3 — Notices generator + native LICENSE + ispravka EXTRACTION.md u 3 NOTICE

- **Owner:** OSS/License owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-02 · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Generator nad resources/node_modules closure-om + ručni unosi; certify asserti su u W8-PR5.
- **Fajlovi (iz plana, nisu ponovo provereni):** scripts/bundle-native-deps.mjs:113-130; 3 hive-mind NOTICE
- **AT:** AT-30 deo (notices) · **ADR:** ADR-10 · **Trace:** TM-18
- **Procena (klasično / AI):** 3–4 / 1.5–1.5 · **Receipts:** I (menja installer SHA → nova certifikacija)
- **Napomena:** kasna DQ-02 (posle starta F3) dodaje OSS-PR3 → W8-PR5 i ponovljen F3

#### OSS-PR4 — License CI (blocking) + npm audit odluka

- **Owner:** OSS/License owner
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-02 · merge: MERGE-AUTH, REVIEW-2 · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Pozajmljen alat po Build-vs-Borrow zapisu (npr. license-checker/cargo-about).
- **Fajlovi (iz plana, nisu ponovo provereni):** .github/workflows/ci.yml
- **AT:** — (TM-18) · **ADR:** ADR-10 · **Trace:** TM-18
- **Procena (klasično / AI):** 2–2.5 / 1–1 · **Receipts:** —

#### OSS-PR5 — Drift baseline review (maintainer)

- **Owner:** OSS/License owner; Memory owner (maintainer)
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-02 · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** 3 unreviewed klasifikovati; 22 blockera reconcile ili re-baseline uz maintainer review.
- **Fajlovi (iz plana, nisu ponovo provereni):** scripts/oss-drift-baseline.json; scripts/oss-drift-check.mjs
- **AT:** — (TM-18) · **ADR:** ADR-10 · **Trace:** TM-18
- **Procena (klasično / AI):** 1–1.5 / 0.5–0.5 · **Receipts:** —

### B3

#### B3-PR1 — Pre-registration dokument (hash) pre gledanja test odgovora

- **Owner:** Benchmark owner
- **Spremnost (iz backlog.csv):** tehničke: B2-PR2 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH, DQ-04, DQ-09 · milestone: start_after:F2, start_after:G2-EXIT, merge_before:B3-RUN, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Hipoteza, metrika, N iz B2 varijance, budžeti, stop kriterijumi, analiza.
- **Fajlovi (iz plana, nisu ponovo provereni):** `benchmarks/results/<test>-<datum>/`
- **AT:** AT-28; AT-29 · **Trace:** TM-17
- **Procena (klasično / AI):** 3–5 / 1.5–2.5 · **Receipts:** benchmark manifest pinuje F2 SHA
- **Napomena:** hash nepovratan (DIR-23)

#### B3-PR2 — Rezultati + recount + poruka (DIR-23)

- **Owner:** Benchmark owner
- **Spremnost (iz backlog.csv):** tehničke: B3-PR1 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:B3-RUN, start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim (Delivery §2):** Posle B3 izvršenja (10–20 rd wall-clock, PREDLOG placeholder, NEPOZNATO); poruka po rezultatu.
- **Fajlovi (iz plana, nisu ponovo provereni):** `benchmarks/results/<test>-<datum>/`; recount.mjs
- **AT:** AT-28; AT-29 · **Trace:** TM-17
- **Procena (klasično / AI):** 9–15 / 4.5–7.5 · **Receipts:** benchmark manifest pinuje F2 SHA
- **Napomena:** posle njega F2→F3 carry-forward review i F3

<!-- GEN:G3:END -->

---

## 6. Sprint 1 predlog — PREDLOG

Ovo je **PREDLOG** ovog handoff-a, ne odluka i ne nova procena. Redosled je G1 redosled iz Delivery §3, a brojevi su iz Delivery §4.2/§4.3. Plan ne definiše dužinu sprinta. Ovde se predlaže sprint od 10 radnih dana.

**Start sprinta = T0** ([Delivery §4.4.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md)): prvi radni dan posle dana kad su pisano zatvorene kapije `PLAN-APPROVAL`, `TSA-09`, `Q00-h` i `ROLE-ASSIGN` za tech lead-a i uloge lane-ova nedelje 1 ([backlog-gates.csv](backlog-gates.csv)). Datumi iz plana (G1 18.10.2026–01.11.2026) su referentni, računati od T_ref = 27.09.2026; nisu rok i ne računaju se retroaktivno. Sprint 1 = nedelje 1–2, a sprint 2 = nedelje 3–4 okvira prvog meseca ([Delivery §4.4.4](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md)).

**Pre dana 1 (kapije, bez koda):**
1. Pisano founder odobrenje delivery plana. Kapija: `PLAN-APPROVAL`.
2. Uloge iz DP-0.14 dodeljene ljudima (Harness, Chat, Durable, Memory, Server, Boundary, Release, OSS/License za G1). Dodela: NEPOZNATO. Polja: [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) §1. Kapije: `ROLE-ASSIGN` (po tiketu) i `MERGE-AUTH`.
3. Founder odluka o baseline fixture worktree-ju na `2af0904d` za W0-PR19 (otvoren LOW nalaz `finish/checklist/f1/13`; predlog TSA-05 u [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md)). Bez nje Memory lane počinje od W0-PR10 i W0-PR11, a W0-PR6 i W0-PR18 čekaju. Kapija: `finish/checklist/f1/13` (start W0-PR19).
4. Odluka kako paket (PRD/FRD/ADR) ulazi u integracionu granu, jer ga WB-PR1 dopunjuje. Stanje 30.09.2026 (read-only): paket je commit-ovan (`planning_package_sha` `2758f4e5`, na javnom `origin`-u), prevod `fc0a7b3f` je lokalni commit, a closure revizija 1.2.1 nije commit-ovana ([00 §1.1](00-START-HERE.md)). Kanal predaje i `<ODOBRENI_TIMSKI_REMOTE>`: čeka osnivača (00 §6 (n), H-01). Kako ulazi u `integration/waggle-next`: čeka osnivača (00 §6 (h), uz preporuku). Kapije: `TSA-09` i `Q00-h`; posao: INT-01 (§8.1).
5. Env šablon iz checkliste pregledan. Node `22.23.2`. Bezbedan test profil (BTP) postoji za svakog ko pokreće sidecar/web/E2E, hook/launch/canary ili root suite (checklist „Bezbedan test profil (BTP)”; [01 §9.0](01-ONBOARDING-DEV-ENV.md)); snimak „pre” po 01 §9.5 je napravljen.

**Sadržaj sprinta (26 PR tiketa + INT-01 + INT-02; INT-05 kad budu potvrđeni TSA-06 i TSA-10):**

| Lane (worktree) | Redosled | Tiketi | Procena (klasično / AI) |
|---|---|---|---|
| Integracija | dan 1 | INT-01 → W0-PR0 → zatim kreiranje 4 agentska worktree-ja iz `integration/waggle-next` | INT-01: NEPOZNATO; W0-PR0 u grupi PR0+PR12+PR13+PR15+PR16 |
| Harness | kritična sekvenca 3–4 rd (Delivery §3; `sequence_after`, nije tehnička zavisnost — §2.1) | W0-PR1 → W0-PR7 → W0-PR8 → W0-PR9; zatim W0-PR2, W0-PR3 (posle PR1 i PR8), W0-PR4, W0-PR5; W0-PR6 posle W0-PR7 i W0-PR19 | PR1..PR8: 4.5–6 / 2–3; PR9: 1.5–2 / 0.5–0.5 |
| Memory | W0-PR19 prvi (ako je odobren) | W0-PR19 → W0-PR10 → W0-PR11 → W0-PR18 | PR19: 1–1.5 / 0.5–1; PR10+PR11: 2–3 / 1–1.5; PR18: 1–1.5 / 0.5–1 |
| Boundary+Release | nezavisno | W0-PR12, W0-PR13, W0-PR15, W0-PR16, W0-PR17; WB-PR1 → WB-PR2; OSS-PR1, OSS-PR2; W8-PR1 | grupa PR0+PR12+PR13+PR15+PR16: 1–1.5 / 0.5–1; PR17: 0.5–1 / 0.5–0.5; WB-PR1/PR2: 3–5 / 1.5–2.5; OSS-PR1/PR2: 4–5 / 2–3; W8-PR1: 2–2 / 1–1 |
| Durable-probe | nezavisno | W0-PR14 | 0.5–0.5 / 0.5–0.5 |
| Server (izolacija) | nezavisno; runtime potvrda posle merge-a, u BTP-u | W0-PR20 | 1–2 / 0.5–1 (revizija 1.2.1; nije u kapacitetu ispod, koji je iz revizije 1.2) |
| Integracija | kraj sprinta | INT-02 — ID reconcile doc-only PR (FRD §16.1 ↔ PRD v1.2 ↔ Delivery §7) | 1–1 / 0.5–0.5 (red „Integracija/spec sync”, G1) |

**Kapacitet (iz plana, nije izmeren):** G1 = 11–16 AI / 22–30 klasičnih eng-dana. Effort-bound je 3.7–6.4 rd pri paralelizmu 2.5–3.0. Serijski founder review ~26 PR ÷ ~3 PR/dan ≈ 8.7 rd (NEPOZNATO; pri 2 PR/dan ≈ 13 rd). Review je zato usko grlo prvog sprinta, a ne inženjerski rad.

**Cilj sprinta 1 (PREDLOG):** svih 26 G1 PR tiketa i INT-02 merge-ovani u `integration/waggle-next`, uz zelene gates DP-0.06 na integracionoj grani (G1 exit (m)). Svaki PR ima RED→GREEN dokaz i checklist bez „ne”.

**Posle sprinta 1 (sprint 2, PREDLOG):** CI wall-clock i rework 2–4 rd; **F1** (3–5 rd): interni `certify-windows-installer.ps1` clean-profile na namenskoj VM ili disposable Windows nalogu, P seal i R qualification za tačan SHA integracione grane, uz ODB-01 za plaćene run-ove; RAT-01 pre zatvaranja G1; F1 retrospektiva meri stvarne AI eng-dane po PR-u prema Delivery §4.1.1 (prvo merenje AI throughput-a). G1 ukupno: **3–5 nedelja** (13.7–22.0 rd). W1 ne počinje pre kraja G1 (serijska pretpostavka plana).

**Šta sprint 1 ne sme da tvrdi (Delivery §1 G1):** „Durable runs rade”, „Evolution je proverena”, „Prikazani model readiness je istinit”, „KVARK konekcija radi”, javni GO.

---

## 7. NEPOZNATO u ovom backlog-u

ID-evi `N-01..N-08` važe samo u ovom dokumentu. Van njega se pišu kao „03 N-nn”, jer [05 §2](05-RISKS-DECISIONS-ESCALATION.md) i [04 §14](04-CODEBASE-MAP.md) imaju sopstvene `N` registre sa drugim značenjem (05 §0, „ID-evi su lokalni po dokumentu”).

| # | Šta | Gde utiče | Ko razrešava |
|---|---|---|---|
| N-01 | Procena po tiketu za PR-ove koje plan procenjuje samo grupno: W0-PR1..PR8; W0-PR10/PR11; W0-PR0/PR12/PR13/PR15/PR16; W1-PR5/PR6; W1-PR8/PR9; W1-PR10/PR11; W5-PR3..PR7; W6-PR5/PR8; WB-PR1/PR2; OSS-PR1/PR2. | kolone procene u CSV-u (prazno) | tech lead u sprint planiranju; plan se ne menja |
| N-02 | Uloga vlasnika za W0-PR0 i W0-PR19 (plan ne dodeljuje). Za W0-PR9 plan i FRD §15 navode različite uloge (Harness vs Evolution owner). | owner_role | tech lead |
| N-03 | Tačni fajlovi W0-PR18 i W0-PR19, imena novih test fajlova (FRD §15: „tačno ime novog test fajla imenuje PR”), lokacija OSS-PR1 dokumenta i OSS-PR2 skripta. | G1 kartice | implementer u PR-u |
| N-04 | AT po tiketu za tikete koje TM red pokriva samo grupno (npr. W2-PR4/PR5/PR10, W3-PR2/PR3, W3e-PR5/PR7, W4-PR1, W6-PR5/PR8, W7-PR1/PR5/PR7, OSS-PR1/PR2/PR4/PR5, B2-PR0a..c/PR3). Receipts po PR-u za talase gde plan daje samo talas (W1, W3, W4, W5, W7). PRD/FRD po PR-u unutar TM reda. | CSV kolone `at_ids`, `receipts_affected`, `prd_ids`, `frd_ids` | tech lead + vlasnik talasa |
| N-05 | Ivice zavisnosti koje graf §3 ne daje: redosled unutar W3e-PR2..PR8, W4-PR8, W5-PR5/PR7, W7-PR1/PR2/PR5, W8-PR6, OSS-PR3..PR5 međusobno. | `technical_dependencies` (prazno ili samo talas) | tech lead |
| N-06 | ID i vlasnik integracionih PR-ova (G1 ID reconcile, G2 hotspot integracioni testovi, G3 reconcile). Razrešeno u reviziji 1.2.1: INT-02, INT-03, INT-04 (§8.1); imena vlasnika: NEPOZNATO do dodele uloga. | §0 B-04 | tech lead |
| N-07 | Put paketa dokumenata u integracionu granu. Stanje 30.09.2026 (read-only): paket je commit-ovan (`2758f4e5`, na javnom `origin`-u), closure revizija 1.2.1 nije commit-ovana ([00 §1.1](00-START-HERE.md)). Kanal predaje: čeka osnivača (00 §6 (n), H-01). Kako ulazi u `integration/waggle-next`: čeka osnivača (00 §6 (h)). → INT-01 (§8.1). | WB-PR1, W3-PR1 i svi review ADR tiketi | osnivač / tech lead |
| N-08 | Start datum (dan odobrenja), founder review kapacitet, AI throughput, trajanje F1. | §6 kalendar | osnivač; F1 retrospektiva |

---

## 8. Integracioni poslovi (INT) i uvoz u tracker

Dodato u reviziji 1.2.1 (H-06). Status: PREDLOG. Integracioni poslovi nisu PR ID-evi iz Delivery §2 (§0 B-04). Nose ID, vlasnika, zavisnosti, kapije i kriterijum završetka, isto kao PR tiketi, i u [backlog.csv](backlog.csv) imaju `wave` = `INT`.

### 8.1 Kartice INT

#### INT-01 — Integraciona grana `integration/waggle-next` sa v1.2 paketom

- **Owner:** odgovorni tech lead (ESK-01). Izvorni commit grane određuje osnivač odgovorom na [00 §6 (h)](00-START-HERE.md).
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, TSA-09, Q00-h · merge: — · milestone: — · resursi: lane:integracija
- **Obim:** napraviti `integration/waggle-next` na `<ODOBRENI_TIMSKI_REMOTE>` iz commit-a koji odredi odgovor na (h), bez izmene koda. Zaštita grane i ostala podešavanja repoa su odluka osnivača ([TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) §2). Nije PR, pa nema kapiju merge-a.
- **Kriterijum završetka:** (1) `git ls-remote <ODOBRENI_TIMSKI_REMOTE> refs/heads/integration/waggle-next` vraća SHA upisan u zapis ovog posla i u [manifest paketa](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md); (2) `git merge-base --is-ancestor 2af0904df01ca3d374cc78ba95b60dc579dd6a7a <SHA>` vraća exit 0; (3) `git diff --name-only 2af0904df01ca3d374cc78ba95b60dc579dd6a7a <SHA>` navodi samo `docs/…`.
- **Izvor:** 00 §6 (h); §6 „Pre dana 1” t.4; §7 N-07. **Procena:** nije data u planu (NEPOZNATO).

#### INT-02 — ID reconcile FRD §16.1 ↔ PRD v1.2 ↔ Delivery §7 (doc-only)

- **Owner:** NEPOZNATO u planu; predlog: tech lead.
- **Spremnost (iz backlog.csv):** tehničke: INT-01, WB-PR1 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: merge_before:F1 · resursi: lane:integracija
- **Obim:** jedan doc-only PR koji usklađuje ID-eve PRD v1.2, FRD §16.1 i Delivery §7 posle G1 izmena (uključujući WB-PR1 dopune FRD-a).
- **Kriterijum završetka:** na `integration/waggle-next` posle merge-a `node docs/plans/v1.2-evidence/tools/check_trace.mjs docs` i `node docs/plans/v1.2-evidence/tools/check_backlog.mjs` vraćaju exit 0; svaki PRD/FRD/AT ID koji G1 PR-ovi uvode ili menjaju postoji u FRD §16.1 i u Delivery §7; merge pre F1.
- **Izvor:** Delivery §4.1, red „Integracija/spec sync” (1). **Procena:** 1–1 / 0.5–0.5.

#### INT-03 — Hotspot integracioni testovi `chat.ts`/`agent-loop.ts` (W1-PR4/PR8/PR9 × W3-PR2 × W4-PR1)

- **Owner:** Chat owner i Harness owner (hotspot vlasnici, [02 §3](02-WORKING-AGREEMENT.md)); odgovoran tech lead.
- **Spremnost (iz backlog.csv):** tehničke: W1-PR4, W1-PR8, W1-PR9, W3-PR2, W4-PR1 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN · merge: MERGE-AUTH · milestone: start_after:G1-EXIT, merge_before:F2 · resursi: hotspot:chat, hotspot:agent-loop
- **Obim:** integracioni testovi na integracionoj grani za PR-ove koji dele red hotspot tabele `chat.ts` + `chat-*.ts` ili `agent-loop.ts` + `loop-gates.ts`. Plan računa 1–3 PR-a; split po TSA-06.
- **Kriterijum završetka:** posle merge-a W1-PR4, W1-PR8, W1-PR9, W3-PR2 i W4-PR1 za svaki par tih PR-ova koji deli red hotspot tabele postoji bar jedan imenovani test koji vežba izmene oba PR-a zajedno (definicija iz TSA-07 t.2 (b); važi i test iz PR-a B po TSA-07 ako pokriva par); četiri gate-a i dopunske provere ([02 §6.2–§6.3](02-WORKING-AGREEMENT.md)) zeleni na `integration/waggle-next`; rezultat potpisuje hotspot merge vlasnik (TSA-07 t.3); merge pre F2.
- **Izvor:** Delivery §4.1, red „Integracija/spec sync” (2). **Procena:** 2–3 / 1–1.5.

#### INT-04 — Reconcile posle DQ-02/03/06/07 odluka (doc-only)

- **Owner:** NEPOZNATO u planu; predlog: tech lead.
- **Spremnost (iz backlog.csv):** tehničke: — · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, DQ-02, DQ-03, DQ-06, DQ-07 · merge: MERGE-AUTH · milestone: start_after:G2-EXIT, merge_before:F3-SRC · resursi: —
- **Obim:** PRD, FRD, Delivery §7 i backlog (CSV i registar kapija) usklađeni sa zapisanim odlukama DQ-02, DQ-03, DQ-06 i DQ-07.
- **Kriterijum završetka:** `check_trace.mjs` i `check_backlog.mjs` vraćaju exit 0 na integracionoj grani; svaka od četiri odluke ima upis u pogođenim dokumentima, sa datumom odluke; merge pre F3-SRC.
- **Izvor:** Delivery §4.1, red „Integracija/spec sync” (3). **Procena:** 0–1 / 0–0.5.

#### INT-05 — Usklađivanje `AGENTS.md`/`CLAUDE.md` sa TSA-06 i TSA-10 (doc-only)

- **Owner:** odgovorni tech lead (ESK-01); PR odobrava osnivač, kao vlasnik tih ugovora.
- **Spremnost (iz backlog.csv):** tehničke: INT-01 · posle: — · start: PLAN-APPROVAL, ROLE-ASSIGN, TSA-06, TSA-10 · merge: MERGE-AUTH, FOUNDER-REVIEW · milestone: — · resursi: lane:integracija
- **Obim:** zaseban doc-only PR koji u `AGENTS.md` §4 i §3.8 i u `CLAUDE.md` §4 i §3.8 za timski rad upućuje na [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) (TSA-06, TSA-10). Ne blokira druge tikete; do merge-a konflikt `AGENTS.md §4` ↔ `TSA-06` rešava TSA-10 t.2.
- **Kriterijum završetka:** PR menja samo `AGENTS.md` i `CLAUDE.md`; pisano odobrenje osnivača je u PR-u; merge u `integration/waggle-next`.
- **Izvor:** TEAM-START-AUTHORIZATION TSA-06 („Usklađivanje repo fajlova”). **Procena:** nije data u planu (NEPOZNATO).

### 8.2 Uvoz u tracker

1. **Pre uvoza.** Na istom commit-u `node docs/plans/v1.2-evidence/tools/check_backlog.mjs` i `node docs/plans/v1.2-evidence/tools/check_trace.mjs docs` vraćaju exit 0. SHA-256 fajlova `handoff/backlog.csv`, `handoff/backlog-gates.csv`, `handoff/03-BACKLOG.md`, `Waggle_PRD_v1.2_DRAFT.md` i `Waggle_FRD_v1.2_DRAFT.md` (FRD §15 je acceptance mapa) jednaki su heševima u [manifestu paketa](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md) §3. Pri bilo kojoj razlici uvoz se ne radi.
2. **Mapiranje kolona.**

| CSV kolona | U tracker-u | Napomena |
|---|---|---|
| `ticket_id` | spoljni ključ i prefiks naslova | ne prenumeriše se |
| `wave`, `milestone` | labela; milestone/verzija | INT redovi: labela `INT` |
| `technical_dependencies` | veza „blokiran od” (tip: tehnička) | blokira početak |
| `sequence_after` | veza „blokiran od” (tip: redosled) | poseban tip veze ili labela `redosled`, da se razlikuje od tehničke; blokira početak |
| `start_gates` | zapis kapije po `gate_id` iz registra + veza „blokiran od” | kapija je zaseban zapis sa statusom, ne tiket rada; blokira početak |
| `merge_gates` | polje „kapije merge-a”; tiket iz liste kao veza „merge posle” | ne blokira status „u radu”; blokira merge |
| `milestone_gate` | `start_after`: veza „blokiran od” na zapis događaja; `merge_before`: rok/milestone | događaj je zaseban zapis iz registra |
| `resource_constraints` | labele | ne ulaze u automatsku spremnost |
| ostale kolone | opis ili prilagođena polja | kao u reviziji 1.2 |

3. **Prelaz sa revizije 1.2.** Kolona `depends_on` je preimenovana u `technical_dependencies`. Za 114 od 123 tiketa vrednost je prenesena 1:1. Devet izmena:

| Tiket | `depends_on` (1.2) | `technical_dependencies` (1.2.1) | Premešteno | Izvor |
|---|---|---|---|---|
| W0-PR0 | — | INT-01 | nova ivica | INT-01: integraciona grana mora postojati |
| W1-PR2 | W1-PR1;W1-PR13;W1-PR15 | W1-PR1 | W1-PR13, W1-PR15 → `merge_gates` | Delivery §3: W1-PR13/PR15 „moraju stići tek pre W1-PR2 apply-a”; §2 W1-PR13 „merge pre W1-PR2 apply-a” |
| W1-PR7 | W1-PR4;W1-PR13;W1-PR14;W1-PR15 | W1-PR4 | W1-PR13, W1-PR14, W1-PR15 → `merge_gates` | Delivery §3: W1-PR14 „merge-preduslov MIG-08 sekcija”; „W1-PR13 + W1-PR15 ──► svaki G2 apply” |
| W1-PR11 | W1-PR9;W0-PR14;W1-PR14 | W1-PR9;W0-PR14 | W1-PR14 → `merge_gates` | Delivery §3: merge-preduslov MIG-08 |
| W3e-PR1 | W0-PR9;W1-PR13;W1-PR14;W1-PR15 | W0-PR9 | W1-PR13, W1-PR14, W1-PR15 → `merge_gates` | Delivery §3: „merge posle W1-PR14 i W1-PR13/PR15” |
| W4-PR3 | W4-PR2;W1-PR13;W1-PR14;W1-PR15 | W4-PR2 | W1-PR13, W1-PR14, W1-PR15 → `merge_gates` | Delivery §3: „W4-PR3 (merge posle W1-PR14)”; MIG-06 apply |
| W4-PR5 | W4-PR4;W1-PR13;W1-PR14;W1-PR15 | W4-PR4 | W1-PR13, W1-PR14, W1-PR15 → `merge_gates` | Delivery §3: merge-preduslov MIG-08; MIG-06 apply |
| W4-PR6 | W4-PR4;W1-PR13;W1-PR14;W1-PR15 | W4-PR4 | W1-PR13, W1-PR14, W1-PR15 → `merge_gates` | isto |
| W8-PR3 | W1-PR14 | — | W1-PR14 → `merge_gates` | Delivery §3: „(G3: W8-PR3)” merge-preduslov MIG-08 |

Nove kolone (`sequence_after`, `start_gates`, `merge_gates`, `milestone_gate`, `resource_constraints`) i novi redovi (`W0-PR20`, `INT-01..INT-05`) postoje od revizije 1.2.1. Kapije iz `notes` revizije 1.2 („kapija: …”) su prenete u tipizovana polja; `notes` ostaje obrazloženje (§0.1).

4. **Spremnost** se u tracker-u računa po §0.1. Referentna implementacija je simulacija u `check_backlog.mjs`.
5. **Kasnija izmena** polja ide doc-only PR-om koji istovremeno menja CSV, red „Spremnost” u kartici (tačan tekst daje `node docs/plans/v1.2-evidence/tools/check_backlog.mjs --cards`) i, za nove kapije, registar. `check_backlog.mjs` mora vratiti exit 0.

---

## Izvori

- [WAGGLE-DELIVERY-PLAN-v1.2.md](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md): §0 (DP-0.01..DP-0.16), §1 (G1/G2/G3 exit), §2 (PR slicing, owner, hotspot, receipts, rollback), §3 (graf i kritična putanja), §4.1.1 (procene po PR-u i grupi), §4.2 (review broj), §4.3 (kalendar), §5 (F1–F4), §6 (DQ-01..DQ-09), §6.1 (RAT-01..RAT-09, ODB-01/02), §7 (TM-01..TM-25).; [backlog-gates.csv](backlog-gates.csv) i [check_backlog.mjs](../plans/v1.2-evidence/tools/check_backlog.mjs) (revizija 1.2.1, H-06)
- [Waggle_FRD_v1.2_DRAFT.md](../Waggle_FRD_v1.2_DRAFT.md) §15 (AT-01..AT-30, autoritativan talas, fixture, owner), §16.1 (PRD → FRD → AT). [Waggle_PRD_v1.2_DRAFT.md](../Waggle_PRD_v1.2_DRAFT.md).
- [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md), [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.md), [WAGGLE-AUDIT-DISPOSITION-v1.2.md](../plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md) (A9, C12), [WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md), [ADR-INDEX.md](../decisions/ADR-INDEX.md).
- Phase-A nalazi: [harness.md](../plans/v1.2-evidence/phaseA/harness.md), [evolution.md](../plans/v1.2-evidence/phaseA/evolution.md), [durable.md](../plans/v1.2-evidence/phaseA/durable.md), [hivemind.md](../plans/v1.2-evidence/phaseA/hivemind.md), [capability.md](../plans/v1.2-evidence/phaseA/capability.md), [ux-model.md](../plans/v1.2-evidence/phaseA/ux-model.md), [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.md), [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.md), [external.md](../plans/v1.2-evidence/phaseA/external.md) i `*.refute.md`.
- Repo (read-only, `2af0904d`, 29.09.2026): `git ls-tree -r` za sve G1 putanje; sadržaj `.github/workflows/ci.yml:1-8`, `packages/agent/src/feature-flags.ts:24-27`, `packages/agent/src/workflow-harness.ts:474-482`, `packages/agent/src/cost-tracker.ts:24-32`, `apps/web/src/lib/dock-tiers.ts:82`, `packages/server/src/local/routes/cost.ts:210,272`, `packages/server/src/local/routes/settings.ts:1192`, `packages/server/src/local/index.ts:605-616`, `package.json:40-48`, `vitest.config.ts:42-43` (`exclude: ['apps/**', …]`), `package.json:22` (`typecheck:web`), `apps/web/package.json:13` (`test`); W0-PR12 pinning testovi: `apps/web/src/test/p7-a6-approval-gating.test.tsx` (ceo), `apps/web/src/test/p1a-routes.test.ts:228-241`, `packages/server/tests/tier-enforcement-matrix.test.ts` (ceo), `apps/web/src/lib/command-catalog.test.ts` (grep), `tests/e2e/waggle-complete.spec.ts:192-214,614-643,690-701`.

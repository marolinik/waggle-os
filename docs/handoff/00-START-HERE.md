# Waggle v1.2 — START HERE (predaja razvojnom timu)

**Revizija dokumenta: 1.2 DRAFT · 29.09.2026 · pregledana revizija koda `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`**
**Revizija dokumenta: 1.2.1 DRAFT · 30.09.2026 · završno zatvaranje (H-01..H-12)**

Izmene 1.2.1: H-02 — identitet paketa (§1.1), kratak operativni ulaz; istorija kritičkih krugova, normalizacije putanja, DOCX izvoza i starih heševa premeštena u [HANDOFF-HISTORY](../plans/v1.2-evidence/HANDOFF-HISTORY.md); mapa paketa premeštena u [manifest](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md) §2; tekst revizije 1.2: `git show 2758f4e5:docs/handoff/00-START-HERE.md` · H-01 — status distribucije i kanal predaje (§1.1, §2, §6 (h)(n), §8) · H-03 — pitanje (g) preusmereno na registar nalaza · H-04 — pokazivači na predlog [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) (§2, §6 (b)(c)(d)(j)(k)(l)(m)(o), §9) · H-05 — bezbedan test profil (BTP) u §6 red 2 · H-06 — backlog polja i registar kapija (§6) · H-09 — release put F3a → K → F3b (§5 t.4) · H-12 — veza na okvir prvog meseca od T0 (§5 t.3, §6) · završni pregled (H-01/H-04): jedno pravilo za „danas” do odluke (n) — bez klona, samo `git ls-remote` i kopija paketa proverena prema manifestu (§2 red 1, §6 korak 1; usklađeno sa 01 §0.1, §3.2 i TSA §3); §6 skraćen na korake 1–2, kapiju i pokazivač na 03 §6 / Delivery §4.4.4, a obrazloženja pitanja (a)–(o) premeštena bez izmene u [05 §5.0.1](05-RISKS-DECISIONS-ESCALATION.md).

Za koga je: tech lead, developeri i QA. Ovo je operativni ulaz: šta je paket, šta tim sme danas, šta čeka odobrenje, kojim redom se radi i gde su izvori. Sve relativne veze polaze od `docs/handoff/`.

> **Status u jednoj rečenici:** paket je **DRAFT**, implementacija **nije odobrena**, predlog timskih ovlašćenja ([TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md)) je **NEODOBRENO** dok ga osnivač ne potvrdi, a ova dokumentaciona dorada nije implementacioni GO niti ratifikacija DQ/RAT/ODB stavki.

Oznake statusa su iste kao u celom paketu: **ODLUKA** (samo founder D-01..D-18) · **POTVRĐENO NA REVIZIJI** (pročitano ili reprodukovano na `2af0904d`) · **NALAZ AUDITA — ZA PROVERU** · **DELIMIČNO/NEPOVEZANO** · **PREDLOG** · **ODLOŽENO** · **NEPOZNATO**.

---

## 1. Šta je ovaj paket

**Waggle** je besplatan, open-source, desktop-first i local-first AI radni partner za pojedinca. Primarni posao mu je knowledge work; coding je podržan, ali ne određuje proizvod. Timske sposobnosti dolaze povezivanjem na on-prem **KVARK** („Waggle = me. KVARK = us.”). — ODLUKA (D-01..D-06; [PRD §1.1](../Waggle_PRD_v1.2_DRAFT.md)). Kod na `2af0904d` i dalje sprovodi 4-tier model sa plaćenim TEAMS; plan tu razliku zatvara migracijom, ne ponovnim otvaranjem odluke. — POTVRĐENO NA REVIZIJI (PRD-01-03).

**Paket** je planerski paket v1.2 DRAFT: PRD i FRD v1.2 (`.md` + DOCX), Delivery plan (talasi W0–W8/W3e/WB/OSS/B1–B3, kontrolne tačke G1 → G2 → G3) sa SAFE-IMPLEMENTATION checklistom, dispozicija nalaza audita, Build-vs-Borrow, benchmark protokol, migracije MIG-00..09, ADR-01..10 sa AT-01..AT-30 i handoff 00–05 sa backlog-om i šablonima. Sve u paketu je **PREDLOG**: nijedan ADR, prag, datum ni G struktura nije odobren. Fajlovi u `docs/plans/` i `docs/decisions/` stariji od 27.09.2026 nisu deo paketa. Spisak fajlova, svrha i SHA-256 su u [manifestu paketa](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md).

### 1.1 Identitet paketa (read-only provera 30.09.2026)

| Identitet | Vrednost | Šta znači |
|---|---|---|
| `code_baseline_sha` | `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` | Revizija aplikacionog koda na kojoj važe svi `path:line` i phase-A dokazi; = `origin/main` 30.09.2026. |
| `planning_package_sha` | `2758f4e5b5be82691ef17624494e12ffc9ad84d1` | Commit planskog paketa (29.09.2026), jedini roditelj `2af0904d`, izmene samo u `docs/`. Ovu reviziju je pregledao nezavisni pregled 30.09.2026. Na `origin`-u. |
| prevodni commit | `fc0a7b3fa9193d2c52bc8dfaacc94110e9e404d3` | Engleski prevod (`*.en.md`, `backlog.en.csv`, EN DOCX, `handoff/README.md`), roditelj `2758f4e5`. Lokalni commit, **nije** na `origin`-u. |
| closure revizija | radno stablo na `fc0a7b3f` + izmene 1.2.1 DRAFT (30.09.2026) | Završno zatvaranje H-01..H-12. **Nije commit-ovana**; commit i push traže zasebno odobrenje osnivača. SHA ne postoji. |
| `implementation_sha` | — | Budući commit sa kodom v1.2 na `integration/waggle-next`. Ne postoji; nastaje tek posle odobrenja implementacije. |

**Udaljeni repo i status distribucije (30.09.2026).** Na `origin` (`github.com/marolinik/waggle-os`) grana `docs/waggle-v1.2-planning` pokazuje na `2758f4e5` (`git ls-remote`), a `gh api repos/marolinik/waggle-os` vraća `visibility: public`. Planski paket na `2758f4e5` je zato javno čitljiv. Push te grane izvršio je osnivač lično (reflog 30.09.2026 00:04:18 +0200). Da li je javna dostupnost namerna i kojim kanalom paket stiže do tima odlučuje osnivač (H-01; pitanje (n) u §6). Do te odluke javna grana nije kanal predaje i niko ne push-uje na `origin`. Ništa od ovoga nije odobrenje implementacije. Status distribucije i ograničeni secret-scan su u [manifestu](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md).

**Kako proveriti da imate isti paket.** Svaki fajl mora imati SHA-256 iz [manifesta](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md) §3. Poklapanje dokazuje samo istovetnost dokumenata, ne ispravnost proizvoda.

**Jezik i izvozi.** Srpski `.md` je autoritativan. `*.en.md` je prevod; njegov status prema reviziji 1.2.1 je u manifestu §2. DOCX je izvoz `.md` fajla; komanda i heševi su u manifestu §3.

**Istorija** (kritički krugovi, normalizacija putanja od 29.09.2026, DOCX izvozi 28.–29.09.2026, raniji heševi i zastarele tvrdnje o statusu) je u [v1.2-evidence/HANDOFF-HISTORY.md](../plans/v1.2-evidence/HANDOFF-HISTORY.md). To nije aktuelno uputstvo.

---

## 2. Šta tim sme danas, a šta posle odobrenja

| Radnja | Danas (pre pisanog odobrenja osnivača) | Posle odobrenja |
|---|---|---|
| Čitanje paketa i koda | Da, u ovom obimu do odluke (n) (H-01, TSA-09): paket iz kopije koju je predao osnivač, sa SHA-256 iz [manifesta](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md) §3; od git-a samo read-only `git ls-remote https://github.com/marolinik/waggle-os.git refs/heads/main`. **Nijedan klon**, ni read-only klon javnog repoa. Kod (`git show 2af0904df01ca3d374cc78ba95b60dc579dd6a7a:<putanja>`, `git grep`) i ostale read-only provere iz [01 §0.1](01-ONBOARDING-DEV-ENV.md) samo u checkout-u iz kanala odobrenog pod (n). | Da; klon samo iz `<ODOBRENI_TIMSKI_REMOTE>` (TSA-09). |
| Priprema mašine | Samo van repoa: preduslovi bez `node_modules`, Node `22.23.2`, nacrt env šablona ([01 §0.1](01-ONBOARDING-DEV-ENV.md)). | Po [01 §0.2](01-ONBOARDING-DEV-ENV.md). |
| `npm ci`, build, gates, testovi, repro skripte, sidecar/web/E2E | **Ne, nigde**, ni u sopstvenom svežem klonu. Izuzetak samo ako osnivač potvrdi TSA-02 u [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md): `npm ci`, build i gates u svežem klonu na timskoj mašini, detached na `2af0904d`, bez grane, commit-a i push-a; sidecar/web/E2E i repro skripte ni tada (pitanje (o) u §6). | U sopstvenom worktree-ju iz `integration/waggle-next`, po SAFE checklisti. |
| Git radnje (grana, worktree, commit, push, PR) | **Ne.** | Po [02](02-WORKING-AGREEMENT.md) i SAFE checklisti; push samo na remote koji je osnivač odobrio; nikad merge u `main`, tag `v*` ni release. |
| Timska ovlašćenja (ko vodi i merge-uje, drugi reviewer, sopstveni klonovi i worktree-ji, baseline fixture worktree, veličina PR-a, hotspot test, CI re-run, redosled važenja) | Važe postojeća pravila 01/02 i checklist. [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) je PREDLOG, **NEODOBRENO**. Zaštite mašine osnivača (9 worktree-ja, docs worktree, 2 stash-a, lične putanje) su zabrane u vezi sa tom mašinom, ne obaveze timskih mašina (TSA-03 A, revizija 1.2.1). | Važe stavke TSA-01..TSA-10 koje osnivač potvrdi; za nepotvrđenu stavku važi kolona „Danas”. |

**Ko odobrava:** isključivo osnivač. Nijedan agent, lead ni poruka iz workflow-a ne zamenjuje njegovo odobrenje. Odobrenje delivery plana otvara W0 i G1 PR-ove na `integration/waggle-next` (DP-0.04). Ne uključuje RAT-01..RAT-09, ODB-01, ODB-02, DQ-01..DQ-09 ni izuzetke od apsolutnih zabrana (§8). W0 ne čeka nijedan RAT; RAT-01 mora stići pre zatvaranja G1 ([Delivery §6.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md)).

**Kod nije pisan.** Jedine git radnje nad paketom su dva docs-only commita (`2758f4e5`, `fc0a7b3f`) i push grane `docs/waggle-v1.2-planning` na `2758f4e5` (§1.1); `git diff --name-only 2af0904d fc0a7b3f` van `docs/` je prazan. Nije bilo taga, merge-a, release-a, E2E, installer-a, receipt ni benchmark run-a, Stripe radnji ni plaćenih API poziva.

Zašto `npm ci` i testovi čekaju i u sopstvenom klonu: `npm ci` i 6 package-install testova lokalnog root suite-a pokreću `npm install` preko mreže ([01 §6.3](01-ONBOARDING-DEV-ENV.md); komentar `ci.yml:88-90`), a `npm ci` briše `node_modules`, pa proces koji drži `.node` fajl ostavlja poluobrisano stablo ([01 §4](01-ONBOARDING-DEV-ENV.md)). Pravilo je PREDLOG handoff-a izveden iz brief §20.4 ([02 §0](02-WORKING-AGREEMENT.md)). Na mašini osnivača build i testovi ni posle odobrenja ne idu u postojeće worktree-je (DP-0.02) ni u docs worktree `D:/Projects/waggle-v12-handoff`.

---

## 3. Redosled čitanja

**Dan 1 — orijentacija i pravila**
1. Ovaj fajl.
2. [Manifest paketa](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md) §1–§2: identitet i sadržaj paketa.
3. [WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md): procena, potvrđeni defekti, najveće NEPOZNATO i decision queue na jednoj strani.
4. [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md): jedini izvor istine za operativnu da/ne listu. Čita se u celosti.
5. [01-ONBOARDING-DEV-ENV.md](01-ONBOARDING-DEV-ENV.md): okruženje, pristupi, prvi build (pre odobrenja važi ograničenje iz §2).
6. [02-WORKING-AGREEMENT.md](02-WORKING-AGREEMENT.md): grane, PR, review, gates, uloge.

Uz to se čitaju repo pravila: [`CLAUDE.md`](../../CLAUDE.md), [`AGENTS.md`](../../AGENTS.md) (kanonski operativni ugovor; `AGENTS.md:6` za sebe kaže da pobeđuje u konfliktu, ali to nije pravilo za ovaj paket: do founder odluke redosled važenja je u [02 §0](02-WORKING-AGREEMENT.md) („Redosled važenja”: predlog TSA-10 u [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md), NEODOBRENO; pitanje (j) u §6; do potvrde važi stroža norma, a svaki konflikt zaustavlja rad i ide osnivaču); poznati konflikti sa `AGENTS.md` (§3.8, §4) su tamo navedeni), [`docs/TESTING.md`](../TESTING.md) i [`docs/TECH-DEBT.md`](../TECH-DEBT.md).

**Dan 2 — šta se gradi i kojim redom**
1. [Waggle_PRD_v1.2_DRAFT.md](../Waggle_PRD_v1.2_DRAFT.md): ceo, a posebno §1 (definicija), §4 (G1/G2/G3) i §17 (otvorene odluke).
2. [WAGGLE-DELIVERY-PLAN-v1.2.md](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) §0–§3: baseline i pravila DP-0.01..DP-0.16, exit kriterijumi G1/G2/G3, talasi sa PR tabelama, graf zavisnosti i kritična putanja. §4 (procena) i §5–§7 se čitaju po potrebi.
3. [ADR-INDEX.md](../decisions/ADR-INDEX.md): 10 ADR nacrta, koji talas traži koji ADR i šta ADR paket ne odlučuje.

**Pre prvog tiketa (za svaki PR posebno)**
1. Kartica tiketa u [03-BACKLOG.md](03-BACKLOG.md): pravila backlog-a i DoR/DoD u §0, redosled zavisnosti u §2, pune kartice G1 tiketa u §3, kompaktne kartice G2/G3 u §4–§5 i sprint 1 PREDLOG u §6. Isti tiketi u mašinski čitljivom obliku su u [backlog.csv](backlog.csv).
2. [04-CODEBASE-MAP.md](04-CODEBASE-MAP.md): oblast koda koju PR dira, hotspot fajlovi i merge vlasnici (§2) i disciplina traženja (§13). `path:line` važi samo na `2af0904d`.
3. [FRD](../Waggle_FRD_v1.2_DRAFT.md) sekcije koje PR pokriva. Za AT iz PR-a: FRD §15 (AT-01..AT-30, sa kolonama fixture / env / owner / milestone i autoritativnim talasom).
4. Relevantan ADR iz [`docs/decisions/`](../decisions/ADR-INDEX.md). Tabela „ADR status” u Delivery §2 kaže koji ADR je input kom talasu.
5. Phase-A dokaz za nalaz(e) tiketa. Grupa nalaza određuje fajl:

| Grupa nalaza | Dokaz | Refuter |
|---|---|---|
| F-HARN-* | [harness.md](../plans/v1.2-evidence/phaseA/harness.md), [repro-harness.mjs](../plans/v1.2-evidence/phaseA/repro-harness.mjs) | [harness.refute.md](../plans/v1.2-evidence/phaseA/harness.refute.md) |
| F-EVO-* | [evolution.md](../plans/v1.2-evidence/phaseA/evolution.md), [repro-shadow.mjs](../plans/v1.2-evidence/phaseA/repro-shadow.mjs), [repro-gepa-delta.mjs](../plans/v1.2-evidence/phaseA/repro-gepa-delta.mjs) | [evolution.refute.md](../plans/v1.2-evidence/phaseA/evolution.refute.md) |
| F-DUR-* | [durable.md](../plans/v1.2-evidence/phaseA/durable.md) | [durable.refute.md](../plans/v1.2-evidence/phaseA/durable.refute.md) |
| F-HM-* | [hivemind.md](../plans/v1.2-evidence/phaseA/hivemind.md) | [hivemind.refute.md](../plans/v1.2-evidence/phaseA/hivemind.refute.md) |
| F-CAP-* | [capability.md](../plans/v1.2-evidence/phaseA/capability.md) | — |
| F-UXM-* | [ux-model.md](../plans/v1.2-evidence/phaseA/ux-model.md) | — |
| F-TK-* | [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.md) | — |
| F-REL-* | [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.md), [oss-drift-check-output.txt](../plans/v1.2-evidence/phaseA/oss-drift-check-output.txt) | — |
| eksterno (live 27.09.2026) | [external.md](../plans/v1.2-evidence/phaseA/external.md) | — |

6. Ako PR menja podatke: odgovarajući MIG red u [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.md).
7. Opis PR-a po [templates/PULL_REQUEST_TEMPLATE.md](templates/PULL_REQUEST_TEMPLATE.md). To je PREDLOG šablona i nije instaliran u `.github/` ([02 §16](02-WORKING-AGREEMENT.md)). Za W0-PR0 postoji nacrt diff-a u [templates/ci-integration-branch-proposal.md](templates/ci-integration-branch-proposal.md) (PREDLOG, nije primenjen).

**Repro skripte** (`phaseA/repro-*.mjs`) se pre odobrenja ne pokreću nigde. Posle odobrenja: kopija van repoa i `DIST` na sopstveni `dist` izgrađen sa `2af0904d`, po [v1.2-evidence/README](../plans/v1.2-evidence/README.md), „Pokretanje”, korak 2.

---

## 4. Šta čeka odobrenje osnivača

| Stavka | Šta otvara | Status | Izvor |
|---|---|---|---|
| Odobrenje delivery plana (start implementacije) | W0 i G1 PR-ove na `integration/waggle-next` | čeka (pitanje (a) u §6) | [Delivery plan](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) |
| TEAM-START-AUTHORIZATION | ko vodi i merge-uje, izolovana okruženja, CI rerun, pravila za sopstvene klonove i worktree-je | PREDLOG, **NEODOBRENO** | [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) |
| Kanal predaje i status javne kopije paketa | odobreni remote za clone i push | čeka (H-01; pitanje (n) u §6) | [closure zapis](../plans/WAGGLE-V1.2-CLOSURE-RECORD.md) |
| Commit i push closure revizije 1.2.1 | da tim preuzme usklađen paket preko git-a | čeka zasebno odobrenje | §1.1; [manifest](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md) |
| RAT-01..RAT-09, ODB-01, ODB-02 | ratifikacije ADR nacrta i G strukture; plaćeni receipt run-ovi; obim W3e-PR9 | otvoreno | [Delivery §6.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) |
| DQ-01..DQ-09 | proizvodne i poslovne odluke | otvoreno | [Delivery §6](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) |
| Pitanja (a)–(o) pre starta | — | kanonska lista | §6 |

Šta je završnim zatvaranjem stvarno razrešeno, a šta nije (H-01..H-12 i disposition ranijih MED/LOW nalaza): [closure zapis](../plans/WAGGLE-V1.2-CLOSURE-RECORD.md).

---

## 5. Redosled rada

1. Pre odobrenja: samo ono što §2 dozvoljava danas i koraci 1–2 u §6.
2. Posle odobrenja: G1 → G2 → G3 po [Delivery §1–§3](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) (exit kriterijumi, talasi, graf zavisnosti i kritična putanja). Tiketi su u [03-BACKLOG.md](03-BACKLOG.md) i [backlog.csv](backlog.csv); prvih 10 radnih dana u §6.
3. G struktura je PREDLOG i ratifikuje se kroz RAT-01. Procene i kalendar su ekspertski raspon u [Delivery §4.2–§4.3](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md), ne obećanje roka. Kalendar počinje od stvarnog datuma odobrenja (T0), ne od 27.09.2026. Raspored prema stvarnom sastavu tima potvrđuje tech lead. Okvir prvih četiri nedelje od T0 (definicija T0, isporuke i dokazi po nedeljama, četiri odvojena ishoda: interni kandidat, benchmark-ready kandidat, public-ready artefakt i javna objava, i gruba provera kapaciteta) je u [Delivery §4.4](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md).
4. Freeze-ovi F1–F4 i put do potpisanog i javnog artefakta: [Delivery §5](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) i §5.1 (necikličan put F3a nad zamrznutim source SHA → kontrolisani, posebno odobren korak K → F3b nad tačnim potpisanim artefaktom → zaseban javni GO). Receipt sa `e4bf403e`, `b07a6173` ili `c4e6a515` ne pokriva `2af0904d`. — POTVRĐENO NA REVIZIJI (F-REL-02).

---

## 6. Prvih 10 radnih dana i pitanja za osnivača pre starta

**Danas (pre odobrenja) rade se samo koraci 1–2, u obimu iz §2.** Do odluke (n) (kanal predaje, H-01; TSA-09) tim ne pravi nijedan klon, ni read-only klon javnog repoa. Od git-a je dozvoljeno samo read-only `git ls-remote https://github.com/marolinik/waggle-os.git refs/heads/main`; paket se čita iz kopije koju je predao osnivač i čiji se SHA-256 poklapa sa [manifestom](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md) §3. Sve posle kapije čeka pisano odobrenje delivery plana.

| # | Kada (orijentaciono) | Šta | Izvor | Gotovo kada |
|---|---|---|---|---|
| 1 | Dan 1 | Čitanje po §3 (Dan 1) iz kopije paketa proverene prema manifestu. Node `22.23.2` (`fnm use 22.23.2`; better-sqlite3 ABI 127), `node -v`. Baseline: `git ls-remote https://github.com/marolinik/waggle-os.git refs/heads/main` = `2af0904d…`, bez klona ([01 §0.1](01-ONBOARDING-DEV-ENV.md) t.1 i t.3). Klon, `git show`/`git grep` i ostale provere iz 01 §0.1 t.3 tek u checkout-u iz kanala odobrenog pod (n). | checklist „Pre svakog PR-a”; DP-0.01; TSA-09 | Svako je pročitao checklistu i nema nejasnih stavki. `main` = `2af0904d`, ili je razlika eskalirana osnivaču. |
| 2 | Dan 2 | Čitanje po §3 (Dan 2). Env šablon van repoa (checklist „Env izolacija”, „Spoljni upisi isključeni”; [01 §9.2](01-ONBOARDING-DEV-ENV.md)) i **bezbedan test profil (BTP)** (checklist „Bezbedan test profil (BTP)”, [01 §9.0](01-ONBOARDING-DEV-ENV.md)); prvi sidecar/E2E run posle odobrenja ide samo tamo, scratch profil nije sandbox. Server se ne pokreće. Popis pitanja (a)–(o) i predlog dodele DP-0.14 uloga. | DP-0.08, DP-0.10, DP-0.14 | Env šablon je pregledan. BTP postoji i snimak „pre” po 01 §9.5 je napravljen. Dodela uloga ljudima: NEPOZNATO. |
| — | **Kapija** | **Founder odobrava delivery plan (start implementacije)**, uz odgovore na (a), (h), (j), (k), (l) i (n). Bez ovoga se ne ide dalje. | §2; kapije `PLAN-APPROVAL`, `TSA-09`, `Q00-h`, `ROLE-ASSIGN` ([backlog-gates.csv](backlog-gates.csv)) | Postoji pisano odobrenje osnivača. |
| 3–10 | Dan 3–10 od T0 | Posle kapije: INT-01 i W0-PR0 (CI za `integration/**`), zatim lane-ovi Harness, Memory, Boundary+Release, Durable-probe i Server (W0-PR20), W0-PR19 samo uz TSA-05, INT-02 i priprema F1. Raspored, redosled i procene: [03 §6](03-BACKLOG.md) (sprint 1) i [Delivery §3 i §4.4.4](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md); kartice u 03 §3. Raspored po danima iz revizije 1.2: `git show 2758f4e5:docs/handoff/00-START-HERE.md`. | 03 §6; Delivery §4.4.4 | Po 03 §6 i G1 exit (Delivery §1). |

**Ako se `main` na `origin`-u razlikuje od `2af0904d`**, baseline iz checkliste i DP-0.01 više ne važi: rad se zaustavlja, a pitanje ide osnivaču kroz [05](05-RISKS-DECISIONS-ESCALATION.md) pre koraka 3. Tim ne bira novu bazu sam (NEPOZNATO do odluke). Lista `git diff --name-only 2af0904d <novi SHA>` pravi se tek u checkout-u iz odobrenog kanala; svaki phase-A nalaz, `path:line` i pin test sa te liste ponovo se proverava ([v1.2-evidence/README](../plans/v1.2-evidence/README.md), „Snapshot, ne trenutna istina”).

**Pitanja za osnivača pre starta** (jedina kanonska lista; slova su stabilni ID-evi, nova pitanja idu na kraj; obrazloženja i činjenice: [05 §5.0.1](05-RISKS-DECISIONS-ESCALATION.md); preporuke i blokade: [closure zapis §4](../plans/WAGGLE-V1.2-CLOSURE-RECORD.md)):
- (a) odobrenje delivery plana — `PLAN-APPROVAL`;
- (b) detached baseline fixture worktree na `2af0904d` za W0-PR19 — TSA-05;
- (c) tim na mašini osnivača ili samo na timskim mašinama — TSA-03;
- (d) šta se posle predaje radi sa docs worktree-jem `D:/Projects/waggle-v12-handoff` — TSA-03 A, uz (h) i (n);
- (e) rok za DQ-04 i DQ-05 (preporuka: pre G2);
- (f) ko daje ODB-01 za F1;
- (g) nije pitanje za osnivača: status ranijih nalaza je u [FINDINGS-DISPOSITION.csv](../plans/v1.2-evidence/findings/FINDINGS-DISPOSITION.csv) (H-03);
- (h) kako paket ulazi u `integration/waggle-next` — `Q00-h`, INT-01; closure D-4;
- (i) DOCX izvoz: nije founder odluka; manifest §3;
- (j) redosled važenja dokumenata — TSA-10, TSA-06; 02 §0;
- (k) ko odobrava i merge-uje u `integration/waggle-next` — TSA-01; 02 §7;
- (l) ESK-01..ESK-03: tech lead, kanal eskalacije, dodela uloga — 05 §5.0; TSA §1;
- (m) da li Harness owner ko-odobrava merge chat hotspot-a — TSA-01 t.2; 02 §3;
- (n) distribucija, kanal predaje i `<ODOBRENI_TIMSKI_REMOTE>` (H-01) — TSA-09; closure D-1..D-3. Do odluke važi pravilo za danas s početka ovog odeljka;
- (o) izolovani onboarding u svežem klonu pre odobrenja plana — TSA-02; do odgovora: ne.

G1 se ne završava u 10 dana: referentno 3–5 nedelja od T0 ([Delivery §4.4.1 i §4.4.4](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md)).

---

## 7. Šta je odlučeno, a šta je otvoreno

**Odlučeno:** ODLUKA D-01..D-18 ([brief §3](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md); mapa na redove dispozicije: [Disposition §0.1](../plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md)). Ne otvaraju se ponovo; konflikt koda ili nalaza sa D-nn se beleži i prijavljuje osnivaču informativno (§9).

**Otvoreno:** DQ-01..DQ-09 ([Delivery §6](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md); PRD §17 `O-1..O-9` = DQ-01..09) · RAT-01..RAT-09, ODB-01, ODB-02 ([Delivery §6.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md)) · pod-liste `MDQ-01..12` ([Migracije §7](../plans/WAGGLE-MIGRATIONS-v1.2.md)), `Q-00..Q-10` ([Benchmark §15](../plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md)), `Q1..Q6` ([BvB §6](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.md)) · disposition nalaza i nekonzistentnosti paketa: [closure zapis](../plans/WAGGLE-V1.2-CLOSURE-RECORD.md), [FINDINGS-DISPOSITION.csv](../plans/v1.2-evidence/findings/FINDINGS-DISPOSITION.csv), [OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md) · registri NEPOZNATO: [BvB §7](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.md), [Benchmark §18](../plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md), [ADR-INDEX §4](../decisions/ADR-INDEX.md), [SAŽETAK „Najveće NEPOZNATO”](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md).

Pravilo: otvoreno pitanje nikad ne nosi oznaku ODLUKA. Piše se „otvoreno — DQ-nn (founder)” ili „otvoreno — inženjerska odluka vlasnika (uloga)”.

---

## 8. Apsolutne zabrane

Autoritativna lista je [SAFE-IMPLEMENTATION checklist, „Apsolutne zabrane”](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md), uz DP-0.11/DP-0.12; ovde se ne ponavlja. Najkraće: nema merge-a u `main`, force-push-a, `git tag v*`, release-a, publikacije ni potpisivanja; nema push-a interne planske dokumentacije ni timskih grana na javni `origin` (push samo na `<ODOBRENI_TIMSKI_REMOTE>`, posle zapisane odluke osnivača o kanalu predaje, H-01); nema zamene instalirane aplikacije ni diranja podataka osnivača; nema spoljnih upisa ni plaćenih poziva bez odobrenja za konkretan run; nema promene vidljivosti repoa, licence ni NOTICE teksta; nema Fusion/council površine (ODLUKA D-16). Izuzetak važi samo uz pisano odobrenje osnivača za konkretnu radnju.

---

## 9. Kontakt i eskalacija

**Vlasnik odluka je osnivač** (Marko Marković, Egzakta Group; `CLAUDE.md` potpis). On odobrava plan, DQ-01..DQ-09, RAT-01..RAT-09, ODB-01/ODB-02 i svaki izuzetak od §8. Kanal i očekivano vreme odgovora su NEPOZNATO. Detalji i šabloni pitanja su u [05-RISKS-DECISIONS-ESCALATION.md](05-RISKS-DECISIONS-ESCALATION.md).

| Vrsta pitanja | Ide kome | Referenca |
|---|---|---|
| Proizvodna odluka iz D-01..D-18 | Ne otvara se: zatvoreno. Pitanje se preformuliše kao sprovođenje odluke. Konflikt koda ili nalaza sa D-nn beleži se i prijavljuje osnivaču informativno (prijava, bez otvaranja; 02 §10 t.3, 05 §5.3). | brief §3 |
| Stavka decision queue-a | Osnivač | Delivery §6 (DQ-01..09) |
| Ratifikacija ADR-a / G strukture; plaćeni run; obim W3e-PR9 | Osnivač | Delivery §6.1 (RAT-01..09, ODB-01, ODB-02) |
| Izuzetak od zabrane ili checkliste (npr. W0-PR19 worktree) | Osnivač, pisano, pre radnje | checklist; DP-0.11; predlog TSA-05 ([TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md)) |
| Inženjerska odluka unutar uloge (npr. MDQ-07, timezone polje ADR-07 O4, Q1/Q6) | Vlasnik uloge iz DP-0.14 | Delivery DP-0.14; Migracije §7 |
| Merge u hotspot fajl | Merge vlasnik uloge; bez dva hotspot merge-a isti dan bez integracionog testa (šta je taj test: NEPOZNATO, do odluke tech lead-a nema drugog merge-a istog hotspot-a isti dan, [02 §3](02-WORKING-AGREEMENT.md); predlog definicije: TSA-07 u [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md), NEODOBRENO) | DP-0.14; checklist |
| Promena u `packages/hive-mind-core/src/**` | Memory owner + maintainer review drift baseline-a; nikad direktno na mirror | `CLAUDE.md` §7.5 |
| Spoljne kapije (Authenticode, Deep Security, CASA, GitHub podešavanja) | Osnivač / vlasnik repoa, kroz W8; nije PR ni agentska radnja | Delivery §2 W8; ADR-10-O8 |
| Greška ili nekonzistentnost u paketu | Lead zapisuje, osnivač odlučuje; paket se ne menja tiho | [closure zapis](../plans/WAGGLE-V1.2-CLOSURE-RECORD.md); OPEN-LOW-FINDINGS |
| Nalaz koji nije u paketu (novi defekt) | RED test + status NALAZ AUDITA — ZA PROVERU, zatim lead → osnivač ako menja obim ili G | DP-0.15 |

---

## Izvori

Sadržaj paketa, svrha svakog fajla i SHA-256: [manifest](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md). Istorija predaje: [HANDOFF-HISTORY](../plans/v1.2-evidence/HANDOFF-HISTORY.md). Zatvaranje H-01..H-12: [closure zapis](../plans/WAGGLE-V1.2-CLOSURE-RECORD.md). Ključni izvori: [Delivery plan v1.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) §0–§6.1 · [SAFE-IMPLEMENTATION checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md) · [PRD v1.2](../Waggle_PRD_v1.2_DRAFT.md) · [FRD v1.2](../Waggle_FRD_v1.2_DRAFT.md) §15–§16 · [ADR-INDEX](../decisions/ADR-INDEX.md) · [brief §3](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md) · [SAŽETAK](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md) · [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) (PREDLOG, NEODOBRENO).

Read-only provere za reviziju 1.2.1 (30.09.2026): `git rev-parse origin/main` (= `2af0904d…`); `git log -1` i roditelji za `2758f4e5` (roditelj `2af0904d`) i `fc0a7b3f` (roditelj `2758f4e5`); `git diff --name-only 2af0904d fc0a7b3f` (108 fajlova, svi u `docs/`); `git ls-remote origin` (grana `docs/waggle-v1.2-planning` = `2758f4e5`, nema `refs/heads/integration/*`); `git reflog` za `refs/remotes/origin/docs/waggle-v1.2-planning` (push 30.09.2026 00:04:18 +0200); `gh api repos/marolinik/waggle-os` (`visibility: public`); `node docs/plans/v1.2-evidence/tools/check_trace.mjs docs` (rezultat u manifestu §4). Provere od 29.09.2026: [HANDOFF-HISTORY §7](../plans/v1.2-evidence/HANDOFF-HISTORY.md).

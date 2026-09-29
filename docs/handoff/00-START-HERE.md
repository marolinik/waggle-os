# Waggle v1.2 — START HERE (predaja razvojnom timu)

**Revizija dokumenta: 1.2 DRAFT · 29.09.2026 · pregledana revizija koda `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`**

Za koga je: tech lead, developeri i QA koji danas preuzimaju Waggle od osnivača. Ovo je ulazna tačka. Dokument ne kopira paket, nego kaže šta da pročitate, kojim redom, šta smete i šta ne smete, i odakle počinje rad kad plan bude odobren. Sve relativne veze polaze od `docs/handoff/`.

> **Status u jednoj rečenici:** paket je **DRAFT**, implementacija **nije odobrena**, a prvi red koda nastaje tek kada osnivač odobri delivery plan. Od tog trenutka se sve radi po obaveznoj [SAFE-IMPLEMENTATION checklisti](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md).

Oznake statusa su iste kao u celom paketu: **ODLUKA** (samo founder D-01..D-18) · **POTVRĐENO NA REVIZIJI** (pročitano ili reprodukovano na `2af0904d`) · **NALAZ AUDITA — ZA PROVERU** · **DELIMIČNO/NEPOVEZANO** · **PREDLOG** · **ODLOŽENO** · **NEPOZNATO**.

---

## 1. Šta je Waggle i šta je ovaj paket

**Waggle** je besplatan, open-source, desktop-first i local-first AI radni partner za pojedinca. Primarni posao mu je knowledge work: research, analiza i poslovni artefakti. Coding je podržan, ali ne određuje proizvod. Primarna platforma je Windows/Tauri. Timske i organizacione sposobnosti ne dolaze kroz poseban Waggle Team/Enterprise proizvod, nego povezivanjem na **KVARK**, koji ostaje isključivo on-prem („Waggle = me. KVARK = us.”). — ODLUKA (D-01..D-06; [PRD §1.1](../Waggle_PRD_v1.2_DRAFT.md), PRD-01-01/02). Kod na `2af0904d` i dalje sprovodi 4-tier model sa plaćenim TEAMS. To je razlika između odluke i koda koju plan zatvara migracijom, a ne razlog da se odluka ponovo otvara. — POTVRĐENO NA REVIZIJI (PRD-01-03).

**Ovaj paket** je planerski paket v1.2 DRAFT nad `main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`, a repo je tokom planiranja samo čitan. Paket sadrži:
- PRD i FRD v1.2 (`.md` + DOCX; DOCX je 29.09.2026 ponovo izvezen iz normalizovanog `.md`, v. „DOCX je aktuelan” ispod);
- Delivery plan sa talasima W0–W8/W3e/WB/OSS/B1–B3, kontrolnim tačkama G1 → G2 → G3 i SAFE-IMPLEMENTATION checklistom (Prilog A);
- dispoziciju nalaza audita C1–C22 / A1–A29 / R01–R24;
- Build-vs-Borrow zapis, benchmark protokol i plan migracija MIG-00..09;
- 10 ADR nacrta sa indeksom i acceptance testove AT-01..AT-30.

Sve u paketu je **PREDLOG**. Nijedan ADR, prag, datum ni G struktura nije odobren ([SAŽETAK za osnivača](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md)).

Mehanička provera PRD ↔ FRD pokrivenosti prošla je 29.09.2026 sa izlazom 0: PRD 166/166, FRD ugovori 114/114. Komanda (read-only, iz korena repoa):

```bash
node docs/plans/v1.2-evidence/tools/check_trace.mjs docs
```

— POTVRĐENO NA REVIZIJI paketa (29.09.2026).

**Gde paket fizički živi.** Worktree `D:/Projects/waggle-v12-handoff`, grana `docs/waggle-v1.2-planning` na `2af0904d`. Fajlovi paketa su u toj grani **untracked** (nisu commit-ovani); `git status` je proveren read-only 29.09.2026. — POTVRĐENO NA REVIZIJI. Kada i kako se paket commit-uje, odlučuje osnivač (NEPOZNATO). `integration/waggle-next` nastaje iz `2af0904d`, a na toj reviziji PRD/FRD/ADR v1.2 ne postoje (`git cat-file -e 2af0904d:docs/Waggle_PRD_v1.2_DRAFT.md` → „exists on disk, but not in '2af0904d'”, isto za `docs/decisions/ADR-INDEX.md`; POTVRĐENO NA REVIZIJI 29.09.2026). Zato put paketa u integracionu granu blokira WB-PR1 i ID-reconcile PR (pitanje (h) u §6).

**Putanje u paketu.** Putanje u novim v1.2 fajlovima su 29.09.2026 normalizovane na raspored repoa (`docs/…`, `docs/plans/v1.2-evidence/…`). Grep nad PRD, FRD, Delivery, MIG, BvB, Benchmark i ADR-INDEX ne nalazi nijednu staging putanju `out/…`, `phaseA/…` bez prefiksa ni `scratchpad/…`. Jedini izuzetak je namerno zadržana stvarna putanja postojećeg worktree-ja `…/scratchpad/wt202` (DP-0.02). — POTVRĐENO NA REVIZIJI paketa (29.09.2026). Mapa starih i novih putanja je u [v1.2-evidence/README.md, „Mapa starih putanja”](../plans/v1.2-evidence/README.md#mapa-starih-putanja). Potrebna je samo za `critic-r2-estimates.json` i istorijske komentare (npr. zaglavlje `repro-harness.mjs`). DOCX je ponovo izvezen iz normalizovanog `.md` i staging putanje više ne sadrži (v. ispod).

**DOCX je aktuelan (re-export 29.09.2026 nakon normalizacije putanja).** Prvi DOCX izvoz (29.09.2026, 00:10) prethodio je normalizaciji putanja (00:24:41), pa je nosio tekst pre normalizacije sa staging putanjama (`out/…`, `scratchpad/…`, `v12-planning-staging/…`). PRD i FRD DOCX su zato ponovo izvezeni istom komandom iz Delivery §6.1 (`pandoc -f gfm-tex_math_dollars-tex_math_gfm <fajl>.md -o <fajl>.docx`, pokrenuto iz `docs/`), bez izmene `.md` teksta. Heševi su ažurirani u Delivery §6.1 i Disposition OD-9, gde stoje pune vrednosti: PRD `.md` `8aa74f26…`, `.docx` `932bb0ee…`; FRD `.md` `7ecc197f…`, `.docx` `198ccd6c…`. U novom DOCX-u `unzip -p <fajl>.docx word/document.xml | grep` ne nalazi staging putanje, a ponovljen izvoz u scratch razlikuje se samo u `docProps/core.xml` (vreme kreiranja). „Uslov predaje” iz Delivery §6.1 je time ispunjen za navedene heševe. — POTVRĐENO NA REVIZIJI paketa (29.09.2026; `pandoc 3.9`, `sha256sum`). Autoritativan tekst ostaje `.md`; svaka kasnija izmena PRD/FRD `.md` ponovo traži izvoz istom komandom i nove heševe u §6.1 i OD-9.

Fajlovi u `docs/plans/` i `docs/decisions/` stariji od 27.09.2026 **nisu** deo v1.2 paketa. To su istorijski zapisi i nemaju autoritet D odluke (brief §2.1/§21).

---

## 2. Status: DRAFT, implementacija nije odobrena

| Pitanje | Odgovor |
|---|---|
| Šta je stanje paketa? | DRAFT. Poslednji kritički krug: HIGH 0, MED 12. LOW nalazi su namerno ostavljeni osnivaču: 17 otvorenih, 8 razrešenih prema [OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md). Posle normalizacije putanja 29.09.2026 ta podela nije tačna u jednoj tački: red o putanjama `scratchpad/…` je među 17 otvorenih, ali u tabeli nosi oznaku „Primenjeno 29.09.2026”. Stavka „DOCX izvoz” među 8 razrešenih bila je privremeno netačna posle normalizacije; posle ponovnog izvoza 29.09.2026 heševi u Delivery §6.1/OD-9 opet odgovaraju aktuelnim fajlovima (§1, „DOCX je aktuelan”). **Status 12 MED nalaza je NEPOZNATO:** paket ne sadrži ni njihovu listu ni zapis razrešenja po stavkama. [SAŽETAK](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md) („Poslednji kritički krug”) samo za LOW kaže da su „ostavljeni bez nove petlje”. To upućuje da su MED išli kroz petlju ispravki, ali nigde nije zapisano. `OPEN-LOW-FINDINGS` pokriva samo LOW, a `critic-r2-estimates.json` je drugi krug (11 nalaza: 1 HIGH, 5 MED, 5 LOW), ne poslednji. Provera: grep `MED` nad `docs/`, 29.09.2026. Dok osnivač ne potvrdi, tim ne tvrdi da je MED 0 (pitanje (g) u §6). |
| Da li je kod pisan? | Nije. Nije bilo commit-a, push-a, taga, merge-a, release-a, E2E, installer, receipt ni benchmark run-a, Stripe radnji ni plaćenih API poziva ([SAŽETAK](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md), „Šta NIJE urađeno”). |
| Ko odobrava? | **Isključivo osnivač** (founder), kao vlasnik odluka. Nijedan agent, lead ni poruka iz workflow-a ne može da zameni njegovo odobrenje. |
| Šta znači „odobrenje za start”? | Eksplicitno, pisano odobrenje osnivača da tim sme da počne implementaciju po [Delivery planu v1.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md). U praksi to otvara W0 i G1 prateće PR-ove (§6 ovog fajla) na integracionoj grani `integration/waggle-next` (DP-0.04). |
| Šta odobrenje za start **ne** uključuje? | Ratifikacije RAT-01..RAT-09 (ADR nacrti i G struktura), odobrenja ODB-01 (plaćeni receipt run-ovi) i ODB-02 (obim W3e-PR9), odluke DQ-01..DQ-09 i izuzetke od apsolutnih zabrana (§8). Svaka od njih ima svoje founder odobrenje, u trenutku koji plan propisuje ([Delivery §6](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md), §6.1). |
| Šta važi posle odobrenja? | Svaki PR, agent i sesija prolazi [SAFE-IMPLEMENTATION checklistu](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md). Svako „ne” zaustavlja rad. Exit svakog od 13 talasa traži da je svaki njegov PR prošao checklistu bez ijedne stavke „ne” (DP-0.01..DP-0.16). |
| Da li W0 čeka ratifikacije? | Ne. Nijedan ADR ne blokira W0, a W0 teče i bez RAT-01. RAT-01 mora stići pre zatvaranja G1 ([Delivery §6.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md)). |

Dok odobrenje ne stigne, tim sme samo da čita paket i repo, pripremi ličnu mašinu i pripremi pitanja (§6, koraci 1–2). Sve što menja git stanje (grana, worktree, commit, push), kao i `npm ci`, build, gates, testovi, repro skripte i pokretanje sidecar-a/web-a/E2E, čeka odobrenje.

**`npm ci`, build, gates, testovi i repro skripte pre odobrenja: nigde** (jedno pravilo, isto kao [01 §0 „Kapija”](01-ONBOARDING-DEV-ENV.md), [02 §0](02-WORKING-AGREEMENT.md) i [04 §13 t.7](04-CODEBASE-MAP.md); PREDLOG ovog handoff-a, izveden iz brief §20.4 kako ga citira 02 §0; founder ga potvrđuje ili daje izuzetak kroz pitanje (o) u §6):
- Pre pisanog founder odobrenja plana niko ne pokreće `npm ci`, `npm run build:packages`, gates, testove, repro skripte (§3) ni sidecar/web/E2E. To važi i za postojeće worktree-je, i za docs worktree `D:/Projects/waggle-v12-handoff`, i za zaseban svež klon na sopstvenoj mašini. Klon u kom se pokreće `npm ci` nije „van repoa” iz 02 §0, a `npm ci` i 6 package-install runtime testova iz lokalnog root suite-a pokreću `npm install` preko mreže ([01 §6.3](01-ONBOARDING-DEV-ENV.md); komentar `ci.yml:88-90`, POTVRĐENO NA REVIZIJI 29.09.2026). Dozvoljeno je samo ono što nabraja [01 §0.1](01-ONBOARDING-DEV-ENV.md): čitanje, read-only provere i priprema mašine van repoa (preduslovi bez `node_modules`, Node `22.23.2`, nacrt env šablona van repoa).
- Izuzetak za zaseban svež klon na sopstvenoj mašini (detached `2af0904d`, bez push-a) **nije odobren**. To je pitanje (o) u §6. Do odgovora važi pravilo iznad.
- Posle odobrenja `npm ci`, build i gates idu u sopstvenom worktree-ju iz `integration/waggle-next`, po [01 §0.2](01-ONBOARDING-DEV-ENV.md) (koraci 1–6), jer integraciona grana do tada ne postoji (DP-0.04). **Nikad** u nekom od 9 worktree-ja iz DP-0.02 (među njima je i `D:/Projects/waggle-os`, main) niti u docs worktree-ju `D:/Projects/waggle-v12-handoff`. Razlog je zamka iz [01 §4](01-ONBOARDING-DEV-ENV.md): `npm ci` briše `node_modules`, pa proces koji drži `.node` fajl ostavlja poluobrisano stablo.

---

## 3. Redosled čitanja

**Dan 1 — orijentacija i pravila**
1. Ovaj fajl.
2. [WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md): procena, potvrđeni defekti, najveće NEPOZNATO i decision queue na jednoj strani.
3. [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md): jedini izvor istine za operativnu da/ne listu. Čita se u celosti.
4. [01-ONBOARDING-DEV-ENV.md](01-ONBOARDING-DEV-ENV.md): okruženje, pristupi, prvi build (pre odobrenja važi ograničenje iz §2).
5. [02-WORKING-AGREEMENT.md](02-WORKING-AGREEMENT.md): grane, PR, review, gates, uloge.

Uz to se čitaju repo pravila: [`CLAUDE.md`](../../CLAUDE.md), [`AGENTS.md`](../../AGENTS.md) (kanonski operativni ugovor; `AGENTS.md:6` za sebe kaže da pobeđuje u konfliktu, ali to nije pravilo za ovaj paket: do founder odluke redosled važenja je u [02 §0](02-WORKING-AGREEMENT.md) („Redosled važenja”: NEPOZNATO, pitanje (j) u §6; do tada važi stroža norma, a svaki konflikt zaustavlja rad i ide osnivaču); poznati konflikti sa `AGENTS.md` (§3.8, §4) su tamo navedeni), [`docs/TESTING.md`](../TESTING.md) i [`docs/TECH-DEBT.md`](../TECH-DEBT.md).

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

**Napomena o repro skriptama** (POTVRĐENO NA REVIZIJI paketa, grep 29.09.2026):
- Sve tri skripte hardkoduju `dist` founder-ovog main checkout-a:
  - `repro-harness.mjs:4`: `DIST = 'file:///D:/Projects/waggle-os/packages/agent/dist/'`;
  - `repro-shadow.mjs:10`: `DIST = 'D:/Projects/waggle-os/packages/agent/dist'`;
  - `repro-gepa-delta.mjs:10`: `DIST = 'D:/Projects/waggle-os/packages/agent/dist'`.

  Bez izmene one čitaju onaj `dist` koji se trenutno nalazi u `D:/Projects/waggle-os`, a ne `dist` sa `2af0904d`.
- `repro-shadow.mjs` **piše pored sebe:** `mkdtempSync(path.join(here, 'shadow-'))` (`:14-15`), dakle u `docs/plans/v1.2-evidence/phaseA/` unutar repoa. Briše ga tek na `:42`, bez `finally`, pa posle greške direktorijum ostaje. Zaglavlje („Writes only under the scratchpad”, `:3-4`) je istorijsko. U druge dve skripte grep ne nalazi upis.
- **Pokretanje: tek posle founder odobrenja plana (§2).** Pre toga se repro skripte ne pokreću nigde: traže `dist` izgrađen sa `2af0904d`, gradnja (`npm ci`, `npm run build:packages`) čeka odobrenje, a za `dist` u `D:/Projects/waggle-os` nije dokazano da je sa `2af0904d` (tačka iznad). Posle odobrenja: kopirati sve tri skripte u scratch direktorijum van repoa, kao u [v1.2-evidence/README](../plans/v1.2-evidence/README.md) („Pokretanje”, korak 2). U **kopiji** `DIST` usmeriti na `packages/agent/dist` sopstvenog worktree-ja iz `integration/waggle-next` ([01 §0.2](01-ONBOARDING-DEV-ENV.md)), izgrađen sa `npm run build:packages`. Rezultat se poredi sa snapshot-om samo ako je taj `dist` izgrađen sa revizije `2af0904d` (isti README, korak 2). Fajlovi dokaza se ne menjaju. `dist` se nikad ne gradi u `D:/Projects/waggle-os`.

---

## 4. Mapa paketa

Uloge u koloni „Ko ga koristi”: **PM** (osnivač ili vlasnik odluka, planiranje), **Lead** (tech lead i merge vlasnici hotspot fajlova), **Dev**, **QA**.

| Fajl | Svrha (jedna linija) | Ko ga koristi |
|---|---|---|
| [handoff/00-START-HERE.md](00-START-HERE.md) | Ulazna tačka: status, redosled čitanja, prvih 10 dana, zabrane. | svi |
| [handoff/01-ONBOARDING-DEV-ENV.md](01-ONBOARDING-DEV-ENV.md) | Okruženje, pristupi i prvi build (Windows). | Dev, QA |
| [handoff/02-WORKING-AGREEMENT.md](02-WORKING-AGREEMENT.md) | Način rada: grane, PR, review, gates, uloge. | Lead, Dev, QA |
| [handoff/03-BACKLOG.md](03-BACKLOG.md) | Tiketi, gde je tiket = PR ID iz Delivery §2: pregled po talasu, zavisnosti, kartice (G1 pune, G2/G3 kompaktne), DoR/DoD, sprint 1 PREDLOG. | PM, Lead, Dev, QA |
| [handoff/backlog.csv](backlog.csv) | Mašinski čitljiva verzija tiketa iz 03 (RFC 4180, UTF-8) za uvoz u tracker. | PM, Lead |
| [handoff/04-CODEBASE-MAP.md](04-CODEBASE-MAP.md) | Mapa koda za oblasti koje menja plan: topologija, hotspot fajlovi i merge vlasnici, `path:line` na `2af0904d`, kako tražiti. | Lead, Dev, QA |
| [handoff/05-RISKS-DECISIONS-ESCALATION.md](05-RISKS-DECISIONS-ESCALATION.md) | Red odluka (DQ/RAT/ODB), NEPOZNATO koje blokira tikete, spoljne kapije, rizici i pravila eskalacije: koje pitanje ide kome. | svi |
| [handoff/templates/PULL_REQUEST_TEMPLATE.md](templates/PULL_REQUEST_TEMPLATE.md) | PREDLOG šablona PR opisa sa obaveznim poljima iz checkliste; nije instaliran u `.github/`. | Lead, Dev |
| [handoff/templates/ci-integration-branch-proposal.md](templates/ci-integration-branch-proposal.md) | PREDLOG diff-a za W0-PR0 (`integration/**` u `ci.yml` i `tauri-build-pr.yml`); nije primenjen. | Lead (vlasnik W0-PR0: NEPOZNATO, predlog Release owner) |
| [Waggle_PRD_v1.2_DRAFT.md](../Waggle_PRD_v1.2_DRAFT.md) (+ [.docx](../Waggle_PRD_v1.2_DRAFT.docx), ponovo izvezen 29.09.2026, v. §1 „DOCX je aktuelan”) | Šta proizvod jeste i nije; G1/G2/G3 na nivou proizvoda; otvorene odluke §17. | PM, Lead |
| [Waggle_FRD_v1.2_DRAFT.md](../Waggle_FRD_v1.2_DRAFT.md) (+ [.docx](../Waggle_FRD_v1.2_DRAFT.docx), ponovo izvezen 29.09.2026, v. §1 „DOCX je aktuelan”) | Funkcionalni ugovori (FRD-nn.m); AT-01..AT-30 (§15); traceability PRD → FRD → AT (§16). | Lead, Dev, QA |
| [plans/WAGGLE-DELIVERY-PLAN-v1.2.md](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) | Operativni plan: DP-0.01..DP-0.16, G exit kriterijumi, talasi i PR slicing, graf, procena, freeze-ovi F1–F4, DQ/RAT/ODB, TM matrica. | PM, Lead, Dev, QA |
| [plans/SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md) | Obavezna da/ne lista pre svakog PR-a, agenta i sesije; apsolutne zabrane; obavezna polja PR opisa. | svi |
| [plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md](../plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md) | Razrešenje svakog nalaza audita (C1–C22, A1–A29, R01–R24) sa dokazom i talasom. | PM, Lead |
| [plans/WAGGLE-BUILD-VS-BORROW-v1.2.md](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.md) | BB-01..BB-13 zapisi (Preserve → Borrow → Adapt → Build), kriterijum za durable engine, provenance inventar. | Lead, Dev |
| [plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md](../plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md) | B1/B2/B3 protokol: izbor testa, hipoteze, firewall, run reset, statistika, manifest, trošak. | Lead (Benchmark owner), QA |
| [plans/WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.md) | MIG-00 ugovor (snapshot, dry-run, idempotentnost, rollback Klasa A/B) i MIG-01..09; MDQ pod-lista. | Lead, Dev, QA |
| [plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md) | Otvoreni LOW nalazi poslednjeg kritičkog kruga (nekonzistentnosti u paketu). | PM, Lead |
| [plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md) | Jedna strana: procena, defekti, NEPOZNATO, decision queue. | PM, Lead |
| [decisions/ADR-INDEX.md](../decisions/ADR-INDEX.md) | Indeks ADR-01..10: tema, šta zamenjuje, talas, ključni AT, šta ADR paket ne odlučuje. | Lead, Dev |
| [ADR-01](../decisions/2026-09-27-ADR-01-conversation-work-modes.md) | Conversation vs work × `normal/strict/benchmark`; server-observed evidence. | Lead, Dev (Harness/Chat) |
| [ADR-02](../decisions/2026-09-27-ADR-02-durable-store-phase-resume-action-idempotency.md) | Durable run store, faza kao jedinica oporavka, `actionId` ≠ `attemptId`, lease/fencing. | Lead, Dev (Durable) |
| [ADR-03](../decisions/2026-09-27-ADR-03-detach-cancel-supersedes-r3-008.md) | Detach ≠ cancel, `sinceSeq` reconnect, sužavanje R3-008. | Lead, Dev (Durable/Chat) |
| [ADR-04](../decisions/2026-09-27-ADR-04-inline-capability-oauth.md) | Inline capability setup i OAuth (state + PKCE) kao kontinuitet rada. | Lead, Dev (Capability/Security) |
| [ADR-05](../decisions/2026-09-27-ADR-05-rawdetail-context-hook-precedence.md) | RAWDETAIL, tri skladišne odgovornosti, `ContextPackage`, hook precedenca, scope izolacija. | Lead, Dev (Memory) |
| [ADR-06](../decisions/2026-09-27-ADR-06-active-override-promotion-rollback.md) | Active-version pointer, promotion sa holdout-om, rollback. | Lead, Dev (Evolution) |
| [ADR-07](../decisions/2026-09-27-ADR-07-routines-vs-toolless-loops.md) | Routines kao trigger vs TOOLLESS Loops; occurrence identitet, misfire/DST. | Lead, Dev (Durable) |
| [ADR-08](../decisions/2026-09-27-ADR-08-individual-tiers-kvark-boundary.md) | Individualni Waggle bez tier granice; KVARK konekcija kao capability granica. | Lead, Dev (Boundary) |
| [ADR-09](../decisions/2026-09-27-ADR-09-secondary-worker-parity.md) | `packages/worker` = legacy, isolate + freeze, ne parity target. | Lead, Dev (Boundary/Server) |
| [ADR-10](../decisions/2026-09-27-ADR-10-release-privacy-profiles.md) | Release/privacy profili (P-LOCAL … P-BENCH), egress, telemetrija, receipts po profilu. | Lead, Dev (Release/Security), QA |
| [v1.2-evidence/README.md](../plans/v1.2-evidence/README.md) | Sadržaj foldera dokaza (snapshot na `2af0904d`), bezbedno read-only pokretanje `check_trace.mjs` i repro skripti (kopija van repoa, jer `repro-shadow.mjs` pravi `shadow-*` pored sebe) i mapa starih putanja. | Lead, Dev, QA |
| [v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md) | Founder brief: D-01..D-18 (§3), DIR-01..DIR-25, G smer (§5.1), granice ovlašćenja. | PM, Lead |
| [v1.2-evidence/inputs/S1-audit-2026-09-27.md](../plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md) | S1 audit PRD/FRD v1.1 (polazni input procene; phase-A ga nadjačava gde se razlikuju). | PM, Lead |
| [v1.2-evidence/inputs/Waggle_PRD_v1.1_2026-09-27.md](../plans/v1.2-evidence/inputs/Waggle_PRD_v1.1_2026-09-27.md), [FRD v1.1](../plans/v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.md) (+ `.docx`) | Prethodna verzija specifikacije (istorijski input). | PM |
| [v1.2-evidence/phaseA/](../plans/v1.2-evidence/phaseA/) (`*.md`, `*.refute.md`, `repro-*.mjs`) | Revalidacija nalaza na `2af0904d` po grupama, refuter verdikti i repro skripte (tabela u §3). | Lead, Dev, QA |
| [v1.2-evidence/phaseA/critic-r2-estimates.json](../plans/v1.2-evidence/phaseA/critic-r2-estimates.json) | Nalazi kritike procene iz drugog kruga (istorijski trag). | PM, Lead |
| [v1.2-evidence/phaseA/oss-drift-check-output.txt](../plans/v1.2-evidence/phaseA/oss-drift-check-output.txt) | Read-only izlaz `oss-drift-check.mjs` (22 known blockers, 3 unreviewed). | Lead (Memory/OSS) |
| [v1.2-evidence/tools/check_trace.mjs](../plans/v1.2-evidence/tools/check_trace.mjs) | Mehanička provera PRD ↔ FRD §16.1 pokrivenosti (exit 1 na rupu). | PM, Lead, QA |

---

## 5. Kontrolne tačke G1 / G2 / G3

G struktura je **PREDLOG** (planerski smer briefa §5.1), a ratifikuje je osnivač kroz RAT-01. Brojevi su prepisani iz [Delivery plana §4.2–§4.3](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) i nisu ponovo procenjivani. To je ekspertski raspon, ne P50, i ne sadrži paušalni AI popust. Exit kriterijumi i lista onoga što se ne sme tvrditi su u [Delivery §1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md).

| | Šta znači | AI-orkestrirani eng-dani | Klasični eng-dani | Kalendar kumulativno (bez pauza) |
|---|---|---|---|---|
| **G1** | Pouzdani interni kandidat | 11–16 | 22–30 | 3–5 nedelja → **18.10.2026 – 01.11.2026** |
| **G2** | Benchmark-ready knowledge-work jezgro | 87–121 (kum. 98–137) | 177–245 (kum. 199–275) | 11–18 nedelja → **13.12.2026 – 31.01.2027** |
| **G3** | Javni proizvod | 37–53, sa W3e-PR9 41–60 (kum. 135–190 / 139–197) | 75–108.5, sa W3e-PR9 83–122.5 (kum. 274–383.5 / 282–397.5) | (a) B3 paralelno: 16–27 nedelja → **17.01.2027 – 04.04.2027** (sa W3e-PR9 i T_evo pre B3 na istoj mašini: 16–28 → 11.04.2027); (b) B3 serijski: 18–30 nedelja → **31.01.2027 – 25.04.2027** (sa T_evo placeholder-om 18–32 → 09.05.2027) |

Kako čitati raspone:
- **Datumi** su kraj n-te kalendarske nedelje računato od 27.09.2026 (nedelja), a ne radni rok. Poslednji radni dan je petak te nedelje: G1 16.10/30.10.2026, G2 11.12.2026/29.01.2027. Vreme od 27.09.2026 do founder odobrenja plana nije uračunato; datum odobrenja je NEPOZNATO.
- **Pauze nisu u rasponima.** Sa pauzama je G2 11–20 nedelja (do 14.02.2027), G3 (a) 18–29, (b) 19–33. Svaka granica posle 24.12.2026 pomera se za +1–3 nedelje. Kalendar Egzakte je NEPOZNATO.
- **Osetljivost:** ako se računa klasičnom kolonom, G2 je 16–28 nedelja, G3 (a) 23–39, a (b) 26–45. Dok F1 retrospektiva ne izmeri AI throughput, stvarna nesigurnost je G2 11–28 i G3 16–45 nedelja.
- Vreme čekanja na ratifikacije (RAT-02, RAT-03, posredno RAT-04) nije u rasponima. Svaki dan čekanja pomera G2 i G3 1:1 (Delivery §3, §6.1).
- **Javni datum G3 je NEPOZNATO.** Authenticode, Deep Security i CASA (ako se ide na Gmail) dodaju se na kraj i nemaju dokaz trajanja.

**Freeze-ovi (Delivery §5):** F1 na kraju G1 (I + P + R, planirano 3–5 rd), F2 na kraju G2 (R + P + A + C + interni I, 4–7 rd), F3 na kraju G3 (puni I + R + P + A + C + Authenticode + Deep Security, 5–8 rd), a F4 je kontingencija. Receipt sa `e4bf403e`, `b07a6173` ili `c4e6a515` **ne pokriva** `2af0904d`. — POTVRĐENO NA REVIZIJI (F-REL-02).

---

## 6. Prvih 10 radnih dana

Redosled je preuzet iz G1 grafa i ograničenja redosleda u [Delivery §3](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) i iz W0 tabele u §2. Raspored po danima je **PREDLOG redosleda**, a ne nova procena; važe rasponi iz §5. Backlog tiketi su PR ID-evi iz Delivery §2 (`W0-PR0..PR19`, `WB-PR1/PR2`, `OSS-PR1/PR2`, `W8-PR1`). Kartice su u [03-BACKLOG.md](03-BACKLOG.md) (G1 pune kartice u §3, sprint 1 PREDLOG u §6), a isti tiketi za uvoz u tracker su u [backlog.csv](backlog.csv). Fajlovi, testovi koje PR menja i status nalaza su u W0 tabeli, pa se ovde ne ponavljaju. Svaki PR ID iz kolone „Tiket / izvor” ima punu karticu u [03-BACKLOG.md](03-BACKLOG.md) §3: cilj, obim, RED test, prihvatanje, dokaz, rizici, rollback i procena. DoR/DoD je u 03 §0, a sprint 1 PREDLOG u 03 §6.

**Koraci 1–2 mogu da počnu odmah. Svi ostali koraci čekaju eksplicitno founder odobrenje delivery plana.**

| # | Kada (orijentaciono) | Šta | Tiket ([kartice: 03 §3](03-BACKLOG.md)) / izvor | Gotovo kada |
|---|---|---|---|---|
| 1 | Dan 1 | Čitanje po §3 (Dan 1). Pristup repou i paketu. Node `22.23.2` (`fnm use 22.23.2`; better-sqlite3 ABI 127), provera `node -v`. Read-only potvrda baseline-a u checkout-u do kog tim ima pristup ([01 §0.1](01-ONBOARDING-DEV-ENV.md) t.1 i t.3; bez `npm ci`, build-a i testova, §2): `git rev-parse origin/main` = `2af0904d…`. Ako se razlikuje, važi pravilo ispod tabele. | checklist „Pre svakog PR-a”; DP-0.01 | Svako je pročitao checklistu i nema nejasnih stavki. `origin/main` = `2af0904d`, ili je razlika eskalirana osnivaču. |
| 2 | Dan 2 | Čitanje po §3 (Dan 2). **Provera izolacije bez pokretanja servera.** Pripremiti env šablon po checklisti „Env izolacija” i „Spoljni upisi isključeni”: `WAGGLE_DATA_DIR`, `WAGGLE_PORT≠3333`, `PORT≠3100`, `WAGGLE_DESKTOP_PORT_FALLBACK` unset, `HIVE_MIND_DATA_DIR`, `WAGGLE_E2E_*`, `HOME`/`USERPROFILE`/`HERMES_HOME` na scratch profil, `WAGGLE_SIGNAL_EMIT=0`, bez Stripe/channel/Clerk/PostHog ključeva. Proveriti da na 3333 ne sluša founder-ova instanca. Popisati pitanja za osnivača (red „Pitanja pre starta” ispod). Dodeliti uloge iz DP-0.14 ljudima (Harness, Chat, Durable, Memory, Server, Boundary, Capability, Security, External-executor, Evolution, Model/Runtime, UX, Attention, Channels, Benchmark, Release, OSS/License owner). | DP-0.08, DP-0.10, DP-0.14 | Env šablon je pregledan. Imena po ulogama su upisana (dodela ljudima: NEPOZNATO). |
| — | **Kapija** | **Founder odobrava delivery plan (start implementacije).** Bez ovoga se ne ide dalje. | §2 ovog fajla | Postoji pisano odobrenje osnivača. |
| 3 | Dan 3 | Kreirati `integration/waggle-next` iz `2af0904d` u **sopstvenom novom worktree-ju** (ne u `D:/Projects/waggle-os`). **Prvi PR: CI za integracionu granu** — `integration/**` u `on.push.branches` i `on.pull_request.branches` u `.github/workflows/ci.yml` (danas `ci.yml:3-6` = samo `[main]`, POTVRĐENO NA REVIZIJI 29.09.2026) i u `tauri-build-pr.yml`. `release.yml` se ne dira. | **W0-PR0**; DP-0.04, DP-0.07 | CI se okida na PR prema `integration/waggle-next`. |
| 4 | Dan 3–4 | Otvoriti 4 paralelna agentska worktree-ja iz integracione grane: **Harness / Memory / Boundary+Release / Durable-probe**. Grane se imenuju `w0/<tema>` (npr. `w0/harn-01-verify-default`). Pravilo je jedan zadatak po grani i jedan worktree po agentu. | Delivery §3 (G1); DP-0.05 | `git worktree list` sadrži samo dozvoljene nove unose (checklist). |
| 5 | Dan 3–5 | **Golden legacy fixture** (generisan kodom revizije `2af0904d`, determinizam = isti SHA-256). Merge **pre** W0-PR6 i W0-PR18. ⚠ Checklist dozvoljava samo worktree-je iz `integration/waggle-next`, a ovaj generator traži worktree na `2af0904d`. Pre starta tražiti eksplicitnu founder dozvolu (otvoren LOW nalaz). | **W0-PR19**; MIG §6 t.2, MIG-00.7 | Fixture i SHA-256 su u `tests/fixtures/legacy-datadir/` (tačna putanja NEPOZNATO do dizajna). |
| 6 | Dan 4–7 | **Harness lane, W0 RED testovi prvo** (DP-0.15: RED pada na baseline-u, pa minimalni GREEN). Serijska kritična sekvenca (3–4 rd): **W0-PR1** (verify fail-closed) → **W0-PR7** (`runId` u eventima) → **W0-PR8** (self-reported dokaz) → **W0-PR9** (persona shadowing + F-EVO-10 u istom PR-u). Zatim W0-PR2/PR3 (posle PR1), W0-PR4, W0-PR5, pa W0-PR6 (posle PR7 i PR19). Pinning testove navedene u W0 tabeli prepisati u istom PR-u, nikad tiho. | **W0-PR1..PR9**; AT-01, AT-02, AT-03 deo, AT-04 minimum, AT-06 deo | Svaki PR ima RED→GREEN dokaz u opisu. |
| 7 | Dan 4–8 | **Memory lane:** **W0-PR10** (hook read path trio u `hive-mind-core`, uz zapis za `oss-drift-baseline.json` review) → **W0-PR11** (leak na 4 mesta + redefinicija fleet policy gate-a; sentinel AT-13) → **W0-PR18** (MIG-05(i) reklasifikacija; posle PR11 i PR19; samo na kopiji dataDir-a, uz snapshot + `manifest.json` i Klasa A rollback test). | **W0-PR10, PR11, PR18**; AT-13, AT-14 deo, AT-19 deo; DP-0.09 | Sentinel iz Workspace A nije u personal i Workspace B recall-u; drugi prolaz migracije je no-op. |
| 8 | Dan 4–8 | **Boundary+Release lane:** **W0-PR12** (de-gate Approvals na 3 nav mesta + `cost.ts` + audit-export; tripwire `tier-enforcement-matrix.test.ts`), **W0-PR13** (pricing, uz ponovnu proveru cena pri merge-u), **W0-PR15** (doc drift, bez rečenica o vidljivosti/licenci — DQ-02), **W0-PR17** (telemetry prekidač i disclosure). Paralelno, nezavisno od W0: **WB-PR1** (inventar + review ADR-08/09) → **WB-PR2** (samo KVARK RED test `it.fails`), **OSS-PR1/PR2** (inventar i licencni lint u report modu, bez izmene LICENSE/NOTICE teksta), **W8-PR1** (npm/pwsh entry-pointi za router/canary receipt + receipt manifest, bez promene logike). | **W0-PR12, PR13, PR15, PR17; WB-PR1, WB-PR2; OSS-PR1, OSS-PR2; W8-PR1**; AT-12/AT-18 deo, AT-27 config deo | Gates su zeleni; nijedan LICENSE/NOTICE tekst nije menjan. |
| 9 | Dan 4–6 | **Durable-probe lane:** **W0-PR14**, RED repro `getDue` hipoteze (ISO sa `T` naspram `datetime('now')`). Popravka samo ako se hipoteza potvrdi. | **W0-PR14**; AT-23 deo; F-DUR-10 = NALAZ AUDITA — ZA PROVERU | Izveštaj repro-a: potvrđeno ili odbačeno, sa testom. |
| 10 | Dan 8–10 | Preostali W0: **W0-PR16** (Stop/disconnect copy). Integracioni doc-only PR (ID reconcile). Rebase/merge feature grana na integracionu granu najmanje jednom dnevno. Svi gates DP-0.06 zeleni na integracionoj grani: `npm run build:packages` · `npm run typecheck:server-tests` · `npm run lint` · `npm run test -- --run --maxWorkers=6`. **Priprema F1**, bez pokretanja plaćenih run-ova: F1 traži ODB-01 (P/R nalozi i budžet), namensku VM ili disposable Windows nalog za `certify-windows-installer.ps1` i RAT-01 pre zatvaranja G1. | W0-PR16; G1 exit (h), (k), (l), (m); Delivery §5 F1, §6.1 | Integraciona grana je zelena; F1 preduslovi su popisani sa vlasnikom. |

**Ako se `origin/main` razlikuje od `2af0904d`** (npr. founder ili dependabot merge pre odobrenja), baseline iz checkliste („Baseline (nepromenljivo)”: `main` = `2af0904d…`, `HEAD == origin/main`) i DP-0.01 više ne važi. Rad se **zaustavlja**, a pitanje ide osnivaču kroz [05](05-RISKS-DECISIONS-ESCALATION.md) pre koraka 3. Tim ne bira novu bazu sam.
- **Baza integracione grane:** DP-0.04 i checklist (PREDLOG) kažu `2af0904d`. Da li se `integration/waggle-next` i dalje seče iz `2af0904d` ili iz novog `origin/main`, odlučuje osnivač (NEPOZNATO).
- **Priprema za odluku:** read-only lista `git diff --name-only 2af0904d origin/main` iz checkout-a iz koraka 1.
- **Ponovna provera:** svaki phase-A nalaz, `path:line` iz 03/04 i pin test čiji je fajl na toj listi ponovo se proverava na novom HEAD-u pre upotrebe u PR-u ([v1.2-evidence/README](../plans/v1.2-evidence/README.md), „Snapshot, ne trenutna istina”).

**Pitanja za osnivača pre starta** (jedina kanonska lista; slova (a)–(o) su stabilni ID-evi na koje upućuju 01, 02, 04 i 05, pa se nova pitanja dodaju na kraj, bez prenumerisanja; idu kroz [05 §5.0 i §5.5](05-RISKS-DECISIONS-ESCALATION.md)):
- (a) odobrenje delivery plana;
- (b) izuzetak za `w0/*` worktree na `2af0904d` za W0-PR19 ([OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md), red SAFE checklist);
- (c) da li tim radi na founder mašini ili na sopstvenim klonovima. DP-0.02/DP-0.03 (9 postojećih worktree-ja, 2 stash-a) su vezani za founder mašinu; na kom se hostu radi je NEPOZNATO;
- (d) status docs worktree-ja `D:/Projects/waggle-v12-handoff` (`docs/waggle-v1.2-planning`). To je 10. unos u `git worktree list` (POTVRĐENO read-only 29.09.2026), a checklist nabraja 9 postojećih i ne pominje ga;
- (e) rok za DQ-04 i DQ-05 (preporuka: pre G2);
- (f) ko daje ODB-01 za F1;
- (g) status 12 MED nalaza poslednjeg kritičkog kruga: da li su razrešeni u paketu i gde je to zapisano (§2; paket ih ne navodi);
- (h) kako i kada se untracked v1.2 paket (PRD/FRD/ADR, grana `docs/waggle-v1.2-planning`) commit-uje ili unosi u `integration/waggle-next`. Ta grana nastaje iz `2af0904d`, gde PRD/FRD/ADR v1.2 ne postoje (§1). Pitanje blokira WB-PR1 (inventar tabela u FRD + review ADR-08/09, Delivery §2 WB) i ID-reconcile doc-only PR (FRD §16.1 ↔ PRD v1.2 ↔ Delivery §7). Isto je kapija 4 „Pre dana 1” u [03 §6](03-BACKLOG.md) i N-07 u 03 §7;
- (i) ponovni DOCX izvoz PRD/FRD istom `pandoc` komandom i ažuriranje heševa u Delivery §6.1 i OD-9 (doc-only). **Urađeno 29.09.2026** u docs worktree-ju, bez izmene `.md` teksta; „Uslov predaje” iz §6.1 je ispunjen (§1, „DOCX je aktuelan”). Osnivač to pregleda zajedno sa celim paketom; slovo (i) ostaje radi stabilnih referenci;
- (j) redosled važenja između `AGENTS.md` (sa `CLAUDE.md`), checkliste i DP-0.01..DP-0.16, Delivery plana, FRD i ovog handoff-a, uključujući poznate konflikte sa `AGENTS.md` §4 (šta je „phase” i ko daje „approval”; W0-PR9 i W0-PR12 ne počinju do odgovora) i §3.8 (lične handoff putanje osnivača). Do odgovora važi privremeno pravilo iz [02 §0](02-WORKING-AGREEMENT.md) („Redosled važenja”). Šalje se zajedno sa (a) (§3 ovog fajla);
- (k) ko odobrava i ko merge-uje u `integration/waggle-next`: da li je founder review obavezan za svaki PR, ko izvršava merge i ko odobrava kad je autor ujedno vlasnik uloge. Šalje se zajedno sa (a) ([02 §7](02-WORKING-AGREEMENT.md));
- (l) ESK-01..ESK-03: ime tech lead-a, kanal za eskalaciju prema osnivaču sa očekivanim vremenom odgovora i ko dodeljuje DP-0.14 uloge ljudima. Traže se zajedno sa (a); bez imena uloga DoR blokira svaki PR ([05 §5.0](05-RISKS-DECISIONS-ESCALATION.md); 02 §8; 03 §0);
- (m) da li Harness owner ko-odobrava merge chat hotspot-a (`chat.ts` + `chat-*.ts`): DP-0.14 kaže `Harness/Chat owner`, a W0 redovi samo Chat owner. Mora biti rešeno pre prvog merge-a W0-PR8, W0-PR9 ili W0-PR11 ([02 §3](02-WORKING-AGREEMENT.md), [04 §2](04-CODEBASE-MAP.md));
- (n) ko novom članu tima daje pristup repou (vidljivost repoa: `CLAUDE.md:84`/`AGENTS.md:68` kažu private, live provera 27.09.2026 kaže public — NALAZ AUDITA — ZA PROVERU, DP-0.13) i kako paket stiže do tima na hostu koji nije founder mašina, uz (c), (d) i (h) ([01 §3.2](01-ONBOARDING-DEV-ENV.md), §0.1 t.5);
- (o) da li tim pre odobrenja plana sme da napravi zaseban svež klon na sopstvenoj mašini (detached `2af0904d`, bez push-a) i u njemu pokrene `npm ci`, `npm run build:packages`, testove i repro skripte (§2, §3). Do odgovora: ne.

G1 se ne završava u 10 dana. Ceo G1 je 3–5 nedelja, uključujući F1 ciklus od 3–5 rd i serijski review.

---

## 7. Šta je odlučeno, a šta je otvoreno

**Odlučeno: ODLUKA D-01..D-18** (brief §3; zatvoreno, **ne otvara se ponovo**; pun tekst i posledice su u [brief §3](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md), a mapa na redove dispozicije u [Disposition §0.1](../plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md)):

| ID | Odluka |
|---|---|
| D-01 | Waggle je free/open-source za pojedinca (bez paywall-a za memoriju, harness, skills, osnovni evolution, approvals, rutine). |
| D-02 | Waggle = me; KVARK = us. Nema zasebnog Waggle Team/Enterprise proizvoda. |
| D-03 | KVARK ostaje isključivo on-prem; nema cloud fallback-a u KVARK režimu. |
| D-04 | Desktop-first/local-first; Windows/Tauri primaran; cloud convenience je kasnija faza. |
| D-05 | BYOK ostaje; proizvod prikazuje gde podaci odlaze. |
| D-06 | Knowledge work je primarni posao; coding je podržan, nije identitet. |
| D-07 | Home se čuva, ne projektuje ponovo od nule. |
| D-08 | Workspace je centralni objekat; chat je unutar Workspace-a. |
| D-09 | Tehnički agenti ostaju ispod površine; napredni pristup ostaje. |
| D-10 | Skills i konektori se koriste inline; OAuth i tajne se ne obrađuju u LLM tekstu. |
| D-11 | Eksterni izvršioci (Claude Code/Codex/Hermes) su opciona sposobnost; rezultat se vraća istom Workspace-u. |
| D-12 | Hive Mind ostaje memorijski temelj; retrieval i izolacija se čuvaju, bez ponovnog pisanja engine-a. |
| D-13 | Evolution je deo teze proizvoda: izvršenje kandidata, evaluacija, aktivacija, rollback. |
| D-14 | Dug rad i rutine su deo proizvoda. |
| D-15 | Referentni cilj je Qwen 3.8 27B-klasa; stariji model je kontrolni baseline. |
| D-16 | Fusion nije ovaj obim (bez council/5-hats/agent-fusion). |
| D-17 | BORROW → ADAPT → BUILD. |
| D-18 | Benchmark je ključan dokaz, ne dekoracija; test se ne projektuje tako da Waggle mora da pobedi. |

**Otvoreno** (samo ID; autoritativan tekst, preporuka i uticaj su na linkovima):
- **Decision queue DQ-01..DQ-09** (founder; [Delivery §6](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) je autoritativan, PRD §17 `O-1..O-9` = DQ-01..09): DQ-01 naming/GO · DQ-02 licenca · DQ-03 pretplatnici · DQ-04 benchmark budžet · DQ-05 model/hardware · DQ-06 mail/calendar · DQ-07 mobile · DQ-08 UI jezik · DQ-09 pragovi/režimi.
- **Ratifikacije i odobrenja RAT-01..RAT-09, ODB-01, ODB-02** (founder; [Delivery §6.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md)), zajedno sa PR-om pre čijeg merge-a moraju stići.
- **Pod-liste**, koje ne redefinišu DQ: `MDQ-01..12` ([Migracije §7](../plans/WAGGLE-MIGRATIONS-v1.2.md)), `Q-00..Q-10` ([Benchmark §15](../plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md)), `Q1..Q6` ([BvB §6](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.md)). Većina su inženjerske odluke vlasnika uloge.
- **Nekonzistentnosti paketa:** [OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md).
- **Registri NEPOZNATO:** [BvB §7](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.md), [Benchmark §18](../plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md), [ADR-INDEX §4](../decisions/ADR-INDEX.md), [SAŽETAK „Najveće NEPOZNATO”](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md).

Pravilo: otvoreno pitanje nikad ne nosi oznaku ODLUKA. Piše se „otvoreno — DQ-nn (founder)” ili „otvoreno — inženjerska odluka vlasnika (uloga)” (Delivery, „Kako čitati statuse”).

---

## 8. Apsolutne zabrane

Važe **bez izuzetka dok osnivač eksplicitno ne odobri konkretnu radnju**. Autoritativna lista je u [SAFE-IMPLEMENTATION checklisti, „Apsolutne zabrane”](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md) i u DP-0.11/DP-0.12. Ovde je samo pregled:

- **Nema merge-a u `main`.** Sve grane ciljaju `integration/waggle-next`. Merge u `main` je founder-gated korak tek posle F3 receipts.
- **Nema force-push-a.**
- **Nema `git tag v*` ni push-a tagova.** `release.yml:12-15` se okida na bilo koji `v*` tag, pa bi tag pokrenuo release pipeline. `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` ostaje nedefinisan.
- **Nema release-a, publikacije, attestation-a ni lokalnog potpisivanja release artefakta.**
- **Nema zamene instalirane aplikacije na founder mašini.** Installer, packaged, crash-injection i migracioni testovi nad packaged build-om rade se samo na namenskoj VM ili disposable Windows nalogu. Svako „Refusing …” odbijanje skripta zaustavlja rad.
- **Nema spoljnih upisa:** nema stvarnog mejla ili poruke, channel tokena, marketplace install-a neproverenog binarija, `WAGGLE_SIGNAL_EMIT=0`, testovi ne diraju `~/.waggle`, hook testovi ne diraju stvarni `~/.claude`/`~/.codex`/Hermes config. Run sa realnim nalogom ili plaćenim API-jem ide samo uz ODB-01 ili DQ-04 odobrenje za taj run, sa cap-om.
- **Nema Stripe/billing radnji,** otkaza, refunda ni promene www pricing-a pre DQ-01/DQ-03.
- **Nema promene vidljivosti repoa, licence ni NOTICE teksta** (pre DQ-02). Nema izmena GitHub repo/org podešavanja ni ručnog pokretanja workflow-a.
- **Postojeći worktree-jevi i stash-evi se ne diraju:** nema `prune`/`remove`, nema `stash pop/drop/apply`.
- **Nema Fusion/council/5-hats površine** (ODLUKA D-16; PR se odbija na review-u).

---

## 9. Kontakt i eskalacija

**Vlasnik odluka je osnivač** (Marko Marković, Egzakta Group; `CLAUDE.md` potpis). On odobrava plan, DQ-01..DQ-09, RAT-01..RAT-09, ODB-01/ODB-02 i svaki izuzetak od §8. Kanal i očekivano vreme odgovora su NEPOZNATO. Detalji i šabloni pitanja su u [05-RISKS-DECISIONS-ESCALATION.md](05-RISKS-DECISIONS-ESCALATION.md).

| Vrsta pitanja | Ide kome | Referenca |
|---|---|---|
| Proizvodna odluka iz D-01..D-18 | Ne otvara se: zatvoreno. Pitanje se preformuliše kao sprovođenje odluke. Konflikt koda ili nalaza sa D-nn beleži se i prijavljuje osnivaču informativno (prijava, bez otvaranja; 02 §10 t.3, 05 §5.3). | brief §3 |
| Stavka decision queue-a | Osnivač | Delivery §6 (DQ-01..09) |
| Ratifikacija ADR-a / G strukture; plaćeni run; obim W3e-PR9 | Osnivač | Delivery §6.1 (RAT-01..09, ODB-01, ODB-02) |
| Izuzetak od zabrane ili checkliste (npr. W0-PR19 worktree) | Osnivač, pisano, pre radnje | checklist; DP-0.11 |
| Inženjerska odluka unutar uloge (npr. MDQ-07, timezone polje ADR-07 O4, Q1/Q6) | Vlasnik uloge iz DP-0.14 | Delivery DP-0.14; Migracije §7 |
| Merge u hotspot fajl | Merge vlasnik uloge; bez dva hotspot merge-a isti dan bez integracionog testa (šta je taj test: NEPOZNATO, do odluke tech lead-a nema drugog merge-a istog hotspot-a isti dan, [02 §3](02-WORKING-AGREEMENT.md)) | DP-0.14; checklist |
| Promena u `packages/hive-mind-core/src/**` | Memory owner + maintainer review drift baseline-a; nikad direktno na mirror | `CLAUDE.md` §7.5 |
| Spoljne kapije (Authenticode, Deep Security, CASA, GitHub podešavanja) | Osnivač / vlasnik repoa, kroz W8; nije PR ni agentska radnja | Delivery §2 W8; ADR-10-O8 |
| Greška ili nekonzistentnost u paketu | Lead zapisuje, osnivač odlučuje; paket se ne menja tiho | OPEN-LOW-FINDINGS |
| Nalaz koji nije u paketu (novi defekt) | RED test + status NALAZ AUDITA — ZA PROVERU, zatim lead → osnivač ako menja obim ili G | DP-0.15 |

---

## Izvori

[Delivery plan v1.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) §0 (DP-0.01..DP-0.16), §1, §2 W0/WB/OSS/W8, §3, §4.2, §4.3, §5, §6, §6.1 · [SAFE-IMPLEMENTATION checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md) · [SAŽETAK za osnivača](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md) · [PRD v1.2](../Waggle_PRD_v1.2_DRAFT.md) §1 · [FRD v1.2](../Waggle_FRD_v1.2_DRAFT.md) §15 · [ADR-INDEX](../decisions/ADR-INDEX.md) · [brief §3](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md) · [OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md).

Read-only provere za ovaj fajl (29.09.2026, na `2af0904d`):
- `git rev-parse HEAD`;
- `git status --porcelain`;
- `git worktree list`;
- `git stash list`;
- `.github/workflows/ci.yml:1-6`;
- `package.json` (`engines.node >=22.19.0`, skripte `build:packages`, `typecheck:server-tests`, `lint`, `test`, `persona:seal`);
- `node docs/plans/v1.2-evidence/tools/check_trace.mjs docs` (izlaz 0);
- `sha256sum docs/Waggle_{PRD,FRD}_v1.2_DRAFT.{md,docx}` naspram Delivery §6.1 posle re-exporta 29.09.2026 (sva četiri heša se poklapaju); `unzip -p docs/Waggle_{PRD,FRD}_v1.2_DRAFT.docx word/document.xml | grep` za `out/`, `scratchpad/` i `v12-planning-staging/` (0 pogodaka);
- grep `out/`, `phaseA/`, `scratchpad/` nad PRD/FRD/Delivery/MIG/BvB/Benchmark/ADR-INDEX (0 pogodaka osim `…/scratchpad/wt202`);
- `git cat-file -e 2af0904d:docs/Waggle_PRD_v1.2_DRAFT.md` i `…:docs/decisions/ADR-INDEX.md` (ne postoje na `2af0904d`).

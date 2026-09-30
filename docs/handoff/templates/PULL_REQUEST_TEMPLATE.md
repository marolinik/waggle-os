<!--
PREDLOG šablona PR-a za Waggle v1.2 (docs/handoff/templates/PULL_REQUEST_TEMPLATE.md).
NIJE instaliran u .github/. Postojeći .github/PULL_REQUEST_TEMPLATE.md ostaje dok se
zamena ne uradi zasebnim PR-om sa review-om (docs/handoff/02-WORKING-AGREEMENT.md §16).
Izvori: docs/plans/SAFE-IMPLEMENTATION-CHECKLIST.md („PR opis”), Delivery plan §0 i §2,
docs/handoff/02-WORKING-AGREEMENT.md §8/§9 (DoR/DoD).
Ciljna grana: integration/waggle-next — NIKAD main.
Svaka tvrdnja u opisu nosi oznaku: ODLUKA / POTVRĐENO NA REVIZIJI / NALAZ AUDITA — ZA PROVERU /
DELIMIČNO/NEPOVEZANO / PREDLOG / ODLOŽENO / NEPOZNATO.
Revizija dokumenta: 1.2.1 DRAFT · 30.09.2026 · završno zatvaranje (H-01..H-12)
Izmene 1.2.1: H-01 — push samo na <ODOBRENI_TIMSKI_REMOTE>; H-02 — heševi DOCX-a u manifestu paketa;
H-04 — worktree/stash provera po TSA-03 A, TSA-04, TSA-05, hotspot test TSA-07, re-run TSA-08
(predlozi NEODOBRENO); H-05 — bezbedan test profil (BTP); H-06 — kapije merge-a iz backlog.csv.
-->

## Identitet

- **PR ID iz plana:** <!-- npr. W0-PR1; split = sufiks a/b + link na doc PR -->
- **Talas / kontrolna tačka:** <!-- npr. W0 / G1 -->
- **Grana:** `<wave-id>/<tema>` → `integration/waggle-next`
- **Nalaz ID:** <!-- F-HARN/F-EVO/F-DUR/F-HM/F-CAP/F-UXM/F-TK/F-REL-nn ili MIG/TM/DP ID; ili „bez nalaza — razlog” -->
- **AT ID / imenovani FRD test:** <!-- deo AT-a koji FRD §15 („Wave (autoritativan …)”) pripisuje ovom PR-u; npr. AT-01, FRD-05.8, Disposition OD-10; ili „nema — razlog” -->
- **Uloga (owner) / ime:** <!-- npr. Harness owner / … -->
- **Hotspot fajlovi i merge vlasnik:** <!-- DP-0.14 tabela; „nijedan” ako nema -->
- **Kapije merge-a (backlog.csv `merge_gates`):** <!-- svaka stavka iz merge_gates tiketa sa statusom i dokazom zatvaranja (link na odluku, SHA merge-a tiketa-preduslova); „nema” samo ako je polje prazno osim MERGE-AUTH -->

## Šta i zašto

<!-- Kratko. Vezati za red Delivery plana §2 (sadržaj, fajlovi na 2af0904d). Svaka tvrdnja sa oznakom statusa. -->

## RED → GREEN dokaz

- **RED test (naziv i fajl):**
- **RED commit:** <!-- SHA -->
- **Komanda:** <!-- tačna komanda -->
- **RED izlaz** (pada na `2af0904d` ili na HEAD integracione grane pre izmene):

```text
<zalepiti izlaz koji pada>
```

- **GREEN commit:** <!-- SHA -->
- **GREEN izlaz:**

```text
<zalepiti izlaz koji prolazi>
```

- [ ] Nalaz je bio NALAZ AUDITA — ZA PROVERU i RED ga je reprodukovao. Ako nije reprodukovan: stop po 02-WORKING-AGREEMENT §10, ovaj PR se ne merge-uje.

## Prepisani / uklonjeni testovi

| Test (fajl:linija) | Šta je pinovao | Zašto je prepisan | Da li ga plan navodi (Delivery §2 red) |
|---|---|---|---|
| | | | |

<!-- „nijedan” ako nema. Characterization testovi se ne menjaju da bi izmena ponašanja prošla. -->

## Gates (Node 22.23.2)

- [ ] `node -v` = `v22.23.2`
- [ ] `npm run build:packages`
- [ ] `npm run typecheck:server-tests`
- [ ] `npm run lint`
- [ ] `npm run test -- --run --maxWorkers=6`
- Dopunske provere prema dodirnutoj površini (02-WORKING-AGREEMENT §6.3):
  - [ ] `apps/web/**` → `npm run typecheck:web` i `npm run test -w apps/web`
  - [ ] `app/**` → `npx tsc -p app/tsconfig.json`
  - [ ] `routes/chat*.ts` → coverage ratchet kao u `ci.yml` (94/94/87/98)
  - [ ] E2E smoke → `npm run test:e2e:smoke`, samo uz izolovan E2E env
  - [ ] nije primenljivo
- **CI:** <!-- link na zelen run, ILI „CI na integration/** još ne postoji (pre W0-PR0) — lokalni izlaz ispod” -->

```text
<pre W0-PR0: zalepiti rezime svake komande, sa brojem testova i exit kodom>
```

## Affected receipts

- [ ] **I** installer
- [ ] **R** router (smart-router primary, compact-tool-context, budget, fallback)
- [ ] **P** persona
- [ ] **A** auth canaries
- [ ] **C** crash-injection
- [ ] nijedan — razlog:

Obrazloženje (koja pokrivena površina se menja: chat/persona/memory/routing/provider/tool-context/installer):

## Migracija / rollback

- [ ] Nema šeme i nema mutacije podataka.
- [ ] Migracija: MIG ID ___ · klasa: [ ] A [ ] B
  - [ ] Radi na kopiji izolovanog dataDir-a; snapshot + `manifest.json` (MIG-00.3) pre apply-a
  - [ ] Dry-run izveštaj priložen
  - [ ] Idempotentna (drugi prolaz = no-op)
  - [ ] Rollback test po klasi (G1: Klasa A nad golden fixture-om W0-PR19; od G2: Klasa B uz `erased_subjects` i `revocations.json`)
  - [ ] Rollback ne oživljava erased/revoked podatke (DIR-21)
  - [ ] SQLite CHECK izmena = table-rebuild, ne `ALTER`
- Rollback PR-a: <!-- npr. revert pojedinačno; šta revert NE vraća -->

## SAFE-IMPLEMENTATION checklist (sve mora biti „da”)

Izvor: [`docs/plans/SAFE-IMPLEMENTATION-CHECKLIST.md`](../../plans/SAFE-IMPLEMENTATION-CHECKLIST.md). Jedno „ne” zaustavlja PR.

**Pre svakog PR-a**
- [ ] Sopstveni worktree iz `integration/waggle-next` (samo za W0-PR19 i posle potvrde TSA-05: detached baseline worktree na `2af0904d`). Nijedan tuđ unos u `git worktree list`/`git stash list` nije uklonjen ni izmenjen; na mašini osnivača njenih 10 worktree unosa i 2 stash-a netaknuti. Sopstveni unos uklonjen samo po TSA-04.
- [ ] Grana `<wave-id>/<tema>` sa dozvoljenim prefiksom. Cilj je `integration/waggle-next`, ne `main`.
- [ ] Bezbedan test profil (BTP) za sidecar/web/E2E, hook/launch/canary i root suite do merge-a W0-PR20 (checklist „Bezbedan test profil (BTP)”); snimak `~/.waggle` i klijenata pre/posle identičan. Scratch profil nije sandbox.
- [ ] Env izolacija po checklist-u (`WAGGLE_DATA_DIR`, `WAGGLE_PORT≠3333`, `PORT≠3100`, `WAGGLE_DESKTOP_PORT_FALLBACK` unset, `HIVE_MIND_DATA_DIR`, E2E env, `HOME`/`USERPROFILE`/`HERMES_HOME` za hook testove). Ništa ne dira `~/.waggle`.
- [ ] Spoljni upisi isključeni (`WAGGLE_SIGNAL_EMIT=0`; bez channel tokena, Stripe ključeva, `DATABASE_URL`/`CLERK_SECRET_KEY`; `VITE_POSTHOG_KEY`/`VITE_CLERK_*`/`VITE_WAGGLE_ENABLE_CLERK` unset; `apps/web/.env.local` nije kopiran).
- [ ] Nema run-a sa realnim nalogom ili plaćenim API-jem bez ODB-01/DQ-04 odobrenja za taj run, namenske VM i cap-a.
- [ ] Node 22.23.2. Nema `npm install`/`npm ci` dok dev serveri drže `.node` fajlove.
- [ ] RED test napisan i pada pre GREEN-a. Pogrešni pinovi prepisani u ovom PR-u.
- [ ] Migracija (ako postoji) po DP-0.09 (sekcija iznad).
- [ ] Installer/packaged testovi (ako postoje) samo na namenskoj VM ili disposable Windows nalogu. Nijedno odbijanje skripta nije zaobiđeno.
- [ ] Nema Fusion/council/5-hats/agent-fusion površine (ODLUKA D-16).
- [ ] Gates lokalno zeleni pre review-a. Source nije menjan dok je suite radio.
- [ ] Hotspot merge preko vlasnika. Nema drugog merge-a istog hotspota (isti red tabele u 02 §3) danas bez integracionog testa (TSA-07: test, komanda, SHA integracione grane sa prethodnim PR-om, izlaz i exit kod navedeni u ovom PR-u).
- [ ] Za izmenu u `packages/hive-mind-core/src/{mind,harvest}/**`: zabeleženo za `scripts/oss-drift-baseline.json` review.
- [ ] Grana je integrisana sa `integration/waggle-next` u poslednja 24 h (merge posle push-a, bez force-push-a).

**Apsolutne zabrane (potvrđujem da ih PR ne krši)**
- [ ] Nema merge-a u `main`, force-push-a, `git tag v*` ni push-a tagova.
- [ ] Grana je push-ovana samo na `<ODOBRENI_TIMSKI_REMOTE>`, nikad na javni `origin` (`git remote get-url --push origin` proveren; checklist, H-01).
- [ ] `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` nije definisan. Nema release-a, publikacije, attestation-a ni lokalnog potpisivanja.
- [ ] Nema promene vidljivosti repoa, licence/NOTICE teksta (pre DQ-02), Stripe/billing-a ni www pricing-a (pre DQ-01/DQ-03).
- [ ] Nema zamene instalirane aplikacije na founder mašini niti instalacije neproverenog binarnog ili MCP koda iz testova.
- [ ] Nema izmena GitHub repo/org podešavanja ni ručnog pokretanja workflow-a. Re-run samo po TSA-08 (posle potvrde), zabeležen u ovom PR-u (run ID, razlog).
- [ ] `release.yml` nije diran (osim ako je ovo W8 PR sa founder review-om).

## Ledger i dokumentacija

- [ ] `docs/TECH-DEBT.md`: novi/otkriveni dug upisan pre merge-a · zatvoren red dobio status + SHA · pogrešan red ispravljen · „nije primenljivo”
- [ ] Docs ažurirani za promenjeno ponašanje, komande ili konfiguraciju · „nije primenljivo”
- [ ] Izmena PRD/FRD ili `00-START-HERE` `.md`: DOCX ponovo izvezen i heševi ažurirani u `docs/plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md` §3 u doc-only PR-u · „nije primenljivo”
- [ ] Nijedan `// TODO` bez ID-a

## Nalaz protiv plana

- [ ] Nema.
- [ ] Ima: <!-- link na zapis; status eskalacije (vlasnik uloge / tech lead / founder); PR se ne merge-uje dok odluka nije zapisana doc-only PR-om -->

## Review

- **AI pre-review:** <!-- alat; sažetak nalaza; svaka tačka „popravljeno” ili „odbijeno, zato što…”. AI odobrenje se ne računa. -->
- **Ljudsko odobrenje (obavezno):** <!-- vlasnik uloge; hotspot vlasnik; drugi reviewer za migraciju / hive-mind-core / security granicu; founder za release.yml/scripts/certify-* -->
- [ ] Ništa u opisu se ne tvrdi kao „radi E2E” bez izvršenog testa na izolovanom sidecar-u.

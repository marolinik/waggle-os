# Waggle v1.2 — TEAM-START-AUTHORIZATION (predlog operativnog modela tima)

**Revizija dokumenta: 1.2.1 DRAFT · 30.09.2026 · završno zatvaranje (H-01..H-12)** — novi dokument (H-04; sekcija TSA-09 iz H-01).

Izmene 1.2.1: H-04 — ceo akt (uloge, odluke osnivača, tabela danas/posle, TSA-01..TSA-10, zamene normi, zapis odluke); H-01 — TSA-09 (kanal predaje i remote) i polje za `<ODOBRENI_TIMSKI_REMOTE>` u §6; H-05 — bezbedan test profil (BTP) u §3 i TSA-02 t.3, TSA-05 t.2; H-06 — backlog ID INT-05 (TSA-06), veza potvrda sa kapijama u `backlog-gates.csv` (§6), doc-only PR iz TSA-06 u TSA-01 t.5; H-09 — Release owner i korak K (§1, §2, TSA-01 t.7), F3-SRC (§1); H-12 — TSA-09 kao start kapija za T0 (§6). · Završni pregled (H-01/H-04): §3 redovi „Čitanje paketa i koda” i „Klon za rad” usklađeni sa 00 §2 — do odluke TSA-09 nijedan klon, ni read-only klon javnog repoa; dozvoljeni su samo kopija paketa proverena prema manifestu i `git ls-remote`. · Završni pregled (H-04): TSA-04 „Zamenjuje” i §5 red TSA-04 dopunjeni sa 05 §5.3 red „Podaci žive instalacije” (timska mašina). · Završni pregled (H-02): TSA-09 punjenje timskog repoa i Varijanta B proveravaju SHA commita zatvaranja 1.2.1 iz manifesta §1 (posle D-3), ne `planning_package_sha` `2758f4e5`.

> **Status: NEODOBRENO — PREDLOG.** Ovaj akt ništa ne dozvoljava dok ga osnivač pisano ne potvrdi, u celini ili po stavkama (§6). Nepotvrđena stavka ne važi, a za nju važe postojeća pravila [00 §2](00-START-HERE.md), [01 §0](01-ONBOARDING-DEV-ENV.md), [02](02-WORKING-AGREEMENT.md) i [SAFE checkliste](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md). Potvrda ovog akta **nije** odobrenje delivery plana (implementacioni GO), ne ratifikuje RAT-01..RAT-09, ne daje ODB-01/ODB-02, ne odlučuje DQ-01..DQ-09 i ne otvara D-01..D-18.

Za koga: osnivač (odluka), budući tech lead i tim (izvršenje). Imena se ne izmišljaju: svako polje „NEPOPUNJENO” popunjava osoba iz kolone „Ko upisuje”.

## 0. Osnova

- Uputstvo osnivača za završno zatvaranje (30.09.2026, H-04): „Pravila za zaštitu mog računara ne smeju zahtevati da svaki developer ima mojih devet worktree-jeva, dva stash-a i lične putanje. Svaka zamena postojeće norme mora biti eksplicitno navedena; predložena delegacija ne važi pre potvrde.”
- Po tom uputstvu revizija 1.2.1 je zaštite mašine osnivača preformulisala u zabrane u vezi sa tom mašinom (TSA-03 A). To ne daje nijednu novu dozvolu.
- Nezavisni pregled od 30.09.2026, H-04; disposition: [closure zapis](../plans/WAGGLE-V1.2-CLOSURE-RECORD.md).

## 1. Uloge

Jedna osoba sme nositi više uloga ([02 §1](02-WORKING-AGREEMENT.md)), uz dva ograničenja: niko ne odobrava i ne merge-uje sopstveni PR, a drugi reviewer iz TSA-01 t.4 nije autor ni prvi reviewer istog PR-a.

| Uloga | Odgovornost | Ime | Ko upisuje |
|---|---|---|---|
| Odgovorni tech lead (ESK-01) | Izvršenje plana; drži `integration/waggle-next`; izvršava merge u nju po TSA-01; dodeljuje DP-0.14 uloge (ESK-03); prvi prima eskalacije ([05 §5.2](05-RISKS-DECISIONS-ESCALATION.md)); potvrđuje stvarni raspored prema sastavu tima; proglašava F3-SRC zamrzavanje ([Delivery §5.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md), korak 1) | NEPOPUNJENO | osnivač |
| Zamenik za merge | Izvršava merge po istim uslovima kad je tech lead autor PR-a ili odsutan | NEPOPUNJENO | osnivač, na predlog tech lead-a |
| Revieweri (vlasnici DP-0.14 uloga) | Ljudsko odobrenje PR-a u svojoj oblasti; hotspot merge vlasnici ([02 §3](02-WORKING-AGREEMENT.md)) | tabela u [02 §1](02-WORKING-AGREEMENT.md): NEPOPUNJENO | tech lead predlaže, osnivač potvrđuje (ESK-03) |
| Drugi reviewer za bezbednost i migracije | Drugo ljudsko odobrenje za PR-ove iz TSA-01 t.4 | NEPOPUNJENO (preporuka: dve osobe, zbog dostupnosti) | osnivač |
| Release owner | W0-PR0 (CI), W8-PR1/PR2, receipt manifest, evidencija CI budžeta i re-run-ova (TSA-08), priprema freeze-a, F3a i F3b kvalifikacija i RP-04 provera ([Delivery §5.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md)). Ne potpisuje, ne taguje i ne objavljuje; korak K izvršava samo ako mu ga osnivač imenovano delegira u pisanom odobrenju K (Delivery §5.1), a javni GO i publikacija ostaju odluka osnivača | NEPOPUNJENO | osnivač |
| Kanal eskalacije i očekivano vreme odgovora osnivača (ESK-02) | — | NEPOPUNJENO | osnivač |
| Osnivač | §2 | Marko Marković | — |

## 2. Šta ostaje odluka osnivača

- Odobrenje delivery plana ([00 §6](00-START-HERE.md) (a)) i potvrda stavki ovog akta.
- Obim: G1/G2/G3, exit kriterijumi, RAT-01..RAT-09, ODB-02, DQ-01..DQ-09.
- Novac: svaki run sa realnim nalogom ili plaćenim API-jem (ODB-01, DQ-04), CI budžet (TSA-08), mašine i VM.
- Poslovne i licencne odluke: Stripe i cene (DQ-01, DQ-03), LICENSE/NOTICE (DQ-02), copyleft ili nepoznata licenca.
- Kanal predaje, remote, pristup i vidljivost repoa (TSA-09, DP-0.13).
- Merge u `main`, tag `v*`, potpisivanje, attestation, publikacija i javni GO (DP-0.11, DP-0.12). Jedini predviđeni put do potpisanog kandidata je kontrolisani korak K sa pisanim odobrenjem osnivača ([Delivery §5.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md)).
- GitHub repo/org podešavanja, Actions varijable i secrets.
- Sve što dira mašinu osnivača (TSA-03).
- Izuzetak od bezbednosnog cilja BC-nn (TSA-10) i svaka izmena SAFE checkliste.
- Review `release.yml` i `scripts/certify-*` ([02 §7](02-WORKING-AGREEMENT.md)).

Osnivač ne odobrava pojedinačne tehničke faze ni PR-ove, osim redova koje TSA-01 t.5 izričito navodi.

## 3. Šta je dozvoljeno danas, posle potvrde akta i posle odobrenja plana

Kolone „Posle …” važe samo za stavke koje je osnivač potvrdio (§6). Za nepotvrđenu stavku važi kolona „Danas”.

| Radnja | Danas (pre odluka) | Posle potvrde stavke ovog akta, pre odobrenja plana | Posle odobrenja delivery plana |
|---|---|---|---|
| Čitanje paketa i koda, read-only git | Da, u obimu iz [00 §2](00-START-HERE.md): do odluke TSA-09 samo kopija paketa proverena prema manifestu i `git ls-remote https://github.com/marolinik/waggle-os.git refs/heads/main`; kod tek u checkout-u iz odobrenog kanala ([01 §0.1](01-ONBOARDING-DEV-ENV.md)) | Da | Da |
| Priprema mašine van repoa | Da | Da | Da |
| Klon za rad | Ne (TSA-09); ni read-only klon javnog repoa | Samo izolovani onboarding klon (TSA-02) | Klon iz `<ODOBRENI_TIMSKI_REMOTE>` i worktree-ji iz `integration/waggle-next` |
| `npm ci`, `npm run build:packages`, 4 gate-a, root suite | Ne, nigde | Samo u onboarding klonu (TSA-02); root suite do merge-a W0-PR20 samo u BTP-u (checklist „Bezbedan test profil (BTP)”) | U sopstvenom worktree-ju ([01 §0.2](01-ONBOARDING-DEV-ENV.md)); root suite do merge-a W0-PR20 samo u BTP-u (checklist „Bezbedan test profil (BTP)”) |
| Sidecar/web/E2E, hook/launch/canary, repro skripte | Ne | Ne | Samo u bezbednom test profilu (BTP; [01 §9.0](01-ONBOARDING-DEV-ENV.md); checklist „Bezbedan test profil (BTP)”) |
| Grana, commit, push, PR | Ne | Ne | Samo na `<ODOBRENI_TIMSKI_REMOTE>`, po [02](02-WORKING-AGREEMENT.md) i checklisti |
| Baseline fixture worktree | Ne | Ne | Samo za W0-PR19 (TSA-05) |
| Uklanjanje sopstvenog završenog worktree-ja | Ne | Ne | TSA-04 |
| Review i merge u `integration/waggle-next` | Ne | Ne | TSA-01 |
| CI re-run | Ne | Ne | TSA-08, tek posle W0-PR0 |
| Timski rad na mašini osnivača | Ne | Ne | Ne (TSA-03 B) |
| Run sa realnim nalogom ili plaćenim API-jem | Ne | Ne | Samo uz ODB-01/DQ-04 za taj run (DP-0.10) |
| Merge u `main`, tag, potpis, publikacija, podešavanja i vidljivost repoa | Ne | Ne | Ne (§2) |

„Checklist” u tabeli je [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md); njena stavka „Bezbedan test profil (BTP)” je autoritativna za test profil, a ova tabela je samo prati.

## 4. Pravila

Svako pravilo navodi normu koju menja i šta važi do potvrde. Odluka osnivača se upisuje u §6.

### TSA-01 — Review i merge u `integration/waggle-next`

1. Svaki PR ima bar jedno ljudsko odobrenje vlasnika uloge za tu oblast ([02 §1](02-WORKING-AGREEMENT.md)). Autor ne odobrava sopstveni PR.
2. PR koji dira hotspot ([02 §3](02-WORKING-AGREEMENT.md)) ima i odobrenje hotspot merge vlasnika; ako je on autor, odobrava drugi imenovani reviewer. Za `chat.ts` + `chat-*.ts` odobravaju Chat owner i Harness owner (DP-0.14 „Harness/Chat owner” = dve uloge, 02 §1). Jedna osoba sme nositi obe uloge, ali ne sme biti autor.
3. AI revieweri su samo pre-review ([02 §7](02-WORKING-AGREEMENT.md)). AI ne odobrava i ne merge-uje.
4. Drugo ljudsko odobrenje, od drugog reviewera za bezbednost i migracije, obavezno je za: svaku MIG-00..MIG-09 mutaciju i migracioni korak; `packages/hive-mind-core/src/**`; security/approval granicu (approvals, permissions, trust, `injection-scanner.ts`, vault i rukovanje tajnama); razrešenje dataDir-a, putanja i env izolacije (npr. `packages/server/src/local/service.ts`, `routes/documents.ts`, `routes/pins.ts`, `packages/agent/src/external-process-env.ts`); hook/launcher kod koji piše u konfiguraciju spoljnih klijenata; `.github/workflows/*` i `scripts/certify-*`.
5. Founder review ostaje samo za `release.yml` i `scripts/certify-*` (Delivery §2 W8; 02 §7) i za doc-only PR koji menja `AGENTS.md`/`CLAUDE.md` (INT-05, TSA-06). Merge blokade RAT/DQ/ODB (Delivery §6, §6.1) su kapije osnivača, ne review.
6. Merge izvršava tech lead ili imenovani zamenik (§1), merge commit-om ([02 §2.5](02-WORKING-AGREEMENT.md)), tek kad su ispunjeni t.1–t.5, Definition of Done ([02 §9](02-WORKING-AGREEMENT.md)) i cela SAFE checklista. Niko ne merge-uje sopstveni PR.
7. Nema merge-a u `main` (BC-01). Jedini predviđeni pomak `main` je fast-forward u kontrolisanom koraku K, uz pisano odobrenje osnivača ([Delivery §5.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md)); to nije ovlašćenje iz ovog akta.

**Zamenjuje:** 02 §7 pasus „Ko odobrava i ko merge-uje u `integration/waggle-next`: NEPOZNATO” i pitanja (k) i (m) u [00 §6](00-START-HERE.md); pretpostavku u [Delivery §4.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md), red „Human review (founder; ~3 PR/dan NEPOZNATO)”, da osnivač serijski pregleda svaki PR (kapacitet ponovo procenjuje tech lead prema timu). Dopunjuje 02 §7 red „Migracioni PR … dva ljudska odobrenja” listom iz t.4.
**Do potvrde:** niko nema ovlašćenje za merge (02 §7).

### TSA-02 — Sopstveni klon i izolovani onboarding pre implementacije

Posle potvrde, a pre odobrenja plana, član tima sme na timskoj mašini (TSA-03):
1. napraviti svež klon iz `<ODOBRENI_TIMSKI_REMOTE>` ili iz snapshot-a (TSA-09, varijanta B) i uraditi `git checkout --detach 2af0904df01ca3d374cc78ba95b60dc579dd6a7a`. Ako osnivač odluči da `integration/waggle-next` nastaje iz commit-a paketa (00 §6 (h)), sme i taj commit, pod uslovom da `git diff --name-only 2af0904df01ca3d374cc78ba95b60dc579dd6a7a HEAD` navodi samo `docs/…`;
2. pokrenuti `npm ci`, `npm run build:packages`, `npm run typecheck:server-tests`, `npm run lint` i `npm run test -- --run --maxWorkers=<N>` i izmeriti `N` ([01 §6.2](01-ONBOARDING-DEV-ENV.md), §13 t.1);
3. uslovi: Node `22.23.2`; root `.env` bez stvarnih ključeva ([01 §8](01-ONBOARDING-DEV-ENV.md), DP-0.10); na mašini nema provider ključeva, tokena ni naloga osnivača; `WAGGLE_SIGNAL_EMIT=0`; na mašini ne radi instalirani Waggle, ili snimak `~/.waggle` pre i posle ostaje isti ([01 §9.5](01-ONBOARDING-DEV-ENV.md)). `npm ci` i 6 package-install testova idu na npm registry ([01 §6.3](01-ONBOARDING-DEV-ENV.md)); to je na timskoj mašini prihvaćeno. Root suite (`npm run test`) se pokreće samo u BTP-u (namenski test nalog na timskoj mašini je dovoljan), jer server testovi na `2af0904d` prave `~/.waggle/security-cache` u stvarnom domu ([01 §9.5](01-ONBOARDING-DEV-ENV.md) red 4);
4. ne sme: grana, commit, push, PR; sidecar, web, E2E; hook/launch/canary; repro skripte; plaćeni pozivi; rad u tuđem stablu ili na mašini osnivača;
5. izlaz: zapis onboarding-a tech lead-u (komanda, verzija Node-a, SHA, rezime, exit kod; format [02 §14](02-WORKING-AGREEMENT.md)), bez upisa u repo. Onboarding klon je jednokratan: pre odobrenja plana ne postaje radni klon za PR, a vlasnik ga briše kad završi.

**Zamenjuje:** za sopstveni svež klon na timskoj mašini i samo za radnje iz t.2: pravilo „`npm ci`, build, gates, testovi i repro skripte pre odobrenja: nigde” ([00 §2](00-START-HERE.md)), deo „i u zasebnom svežem klonu na sopstvenoj mašini” u [01 §0](01-ONBOARDING-DEV-ENV.md) („Kapija”), [02 §0](02-WORKING-AGREEMENT.md) (prvi pasus) i [04 §13 t.7](04-CODEBASE-MAP.md). Odgovor na pitanje (o) u 00 §6. Repro skripte ostaju zabranjene do odobrenja plana.
**Do potvrde:** ne, nigde.
**Runtime:** rezultat gate-ova na timskoj mašini još ne postoji; prvi dokaz je izlaz iz t.5.

### TSA-03 — Radni host i mašina osnivača

**Deo A — primenjeno u reviziji 1.2.1 po uputstvu osnivača (§0); ne daje dozvole.**
- Timske mašine nemaju obavezu da imaju osnivačeve worktree-je, stash-ove ni lične putanje. Na timskoj mašini checklist stavka o worktree-jima glasi: spisak `git worktree list` i `git stash list` se snima na početku i na kraju sesije, i nijedan unos koji ne pripada autoru sesije nije uklonjen ni izmenjen. Sopstveni unos se uklanja samo po TSA-04; do potvrde TSA-04 ne uklanja se.
- Na mašini osnivača važe zabrane: njenih 9 worktree-ja (DP-0.02), docs worktree `D:/Projects/waggle-v12-handoff` (grana `docs/waggle-v1.2-planning`, 10. unos u `git worktree list` 30.09.2026) i `stash@{0}`/`stash@{1}` (DP-0.03) se ne brišu, ne checkout-uju, ne prune-uju i ne primenjuju. Instalirana aplikacija, `~/.waggle`, `~/.claude`, `~/.codex`, Hermes home, HKCU ključevi i lični provider ključevi osnivača se ne diraju ([05 §5.3](05-RISKS-DECISIONS-ESCALATION.md), „Podaci žive instalacije”). Lične putanje osnivača u DP-0.02 i u checklisti opisuju tu mašinu i nisu uputstvo za tim.

**Deo B — PREDLOG.** Tim radi isključivo na sopstvenim mašinama ili na namenskim VM i nalozima bez podataka i naloga osnivača. Mašina osnivača nije timski host. Receipt, installer i packaged testovi i dalje idu samo na namensku VM ili disposable Windows nalog (checklist; DP-0.11).

**Zamenjuje:** A: obavezujuće čitanje DP-0.02, DP-0.03 i checkliste („Baseline”, „Pre svakog PR-a” t.1) na svim hostovima; 02 §2.2; 01 §3.1; PR šablon. B: pitanje (c) u 00 §6 i recept „Na mašini osnivača isti `worktree add` …” u [01 §3.2](01-ONBOARDING-DEV-ENV.md).
**Do potvrde B:** timski rad ne počinje ni na jednom hostu pre odobrenja plana; ako neko radi na mašini osnivača, važe zabrane iz dela A.

### TSA-04 — Čišćenje sopstvenih završenih worktree-ja

Posle potvrde, na timskoj mašini, vlasnik sme ukloniti sopstveni `<wave-id>/*` worktree ili baseline worktree iz TSA-05 samo kad važi svih pet uslova:
1. PR je merge-ovan u `integration/waggle-next`: `git -C <klon> fetch origin`, pa `git -C <klon> merge-base --is-ancestor <grana> origin/integration/waggle-next` → exit 0. Za TSA-05 worktree: W0-PR19 je merge-ovan.
2. Nema lokalnih izmena: `git -C <worktree> status --porcelain` je prazan (i bez untracked fajlova). Nema nepush-ovanih commit-a: `git -C <worktree> log --oneline origin/<grana>..HEAD` je prazan; detached TSA-05 worktree nema commit-a.
3. Nema stash-a sa te grane (`git stash list`) i nijedan proces ne radi iz tog worktree-ja (sidecar, vitest, node koji drži `.node` fajl).
4. Uklanjanje: `git -C <klon> worktree remove <putanja>` **bez `--force`**. Ako git odbije, rad staje i ide tech lead-u. Lokalna grana se briše samo sa `git branch -d <grana>` (nikad `-D`). Remote grane se ne brišu bez tech lead-a.
5. `git worktree prune` samo ako `git worktree prune --dry-run -v` navodi isključivo sopstvene unose.

Vlasnik sme obrisati i sopstveni scratch dataDir (`<scratch>/data-<agent>`), nikad `~/.waggle`. Nikad se ne uklanjaju: worktree ili stash osnivača, docs worktree, tuđ worktree ni integracioni worktree bez odluke tech lead-a.
**Zamenjuje:** za sopstvene unose na timskoj mašini, deo checkliste „Pre svakog PR-a” t.1 „nijedan postojeći unos se ne briše”; pasus „Da li se sopstveni `<wave-id>/*` worktree sme ukloniti … NEPOZNATO” u [01 §3.3](01-ONBOARDING-DEV-ENV.md); red „prunable” u 01 §12 (timska mašina); [05 §5.3](05-RISKS-DECISIONS-ESCALATION.md) red „Podaci žive instalacije” (timska mašina).
**Do potvrde:** nijedan unos se ne uklanja, ni sopstveni.

### TSA-05 — Baseline fixture worktree (samo W0-PR19)

Posle potvrde i odobrenja plana, autor W0-PR19 sme u sopstvenom timskom klonu napraviti jedan detached worktree na code baseline-u:

```powershell
git -C <klon> worktree add --detach <koren>\wt\w0-pr19-baseline 2af0904df01ca3d374cc78ba95b60dc579dd6a7a
```

1. U njemu nema grane, commit-a ni push-a.
2. Generator skript se kopira iz `w0/<tema>` grane W0-PR19 kao untracked fajl. U worktree-ju se rade `npm ci` i `npm run build:packages`, a generator radi u BTP-u (checklist „Bezbedan test profil (BTP)”), sa izolovanim env-om iz checkliste („Env izolacija”, „Spoljni upisi isključeni”).
3. Dva generisanja daju isti SHA-256 ili dokumentovanu normalizaciju vremena ([Delivery §2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md), W0-PR19).
4. Golden tar i SHA-256 se kopiraju u W0-PR19 worktree i commit-uju tamo. PR opis beleži baseline SHA, komandu, verziju Node-a i oba SHA-256.
5. Posle merge-a W0-PR19 kopija generatora se briše, a worktree se uklanja po TSA-04. Tech lead sme odlučiti da ga zadrži do F1 radi ponovnog generisanja.

**Zamenjuje:** jedan izuzetak od reči „isključivo” u checklisti „Pre svakog PR-a” t.1 i od DP-0.05; „Izuzetak W0-PR19” u [02 §2.4](02-WORKING-AGREEMENT.md); pitanje (b) u 00 §6; red „SAFE-IMPLEMENTATION-CHECKLIST.md” u [OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md); kapija 3 u [03 §6](03-BACKLOG.md).
**Do potvrde:** worktree se ne pravi. Memory lane počinje od W0-PR10 i W0-PR11, a W0-PR6 i W0-PR18 čekaju (03 §6).

### TSA-06 — Veličina PR-a (zamena pravila „5 fajlova po fazi”)

**Zamenjena norma:** `AGENTS.md` §4 „Pre-Work Protocol”: „**Phased execution:** Max 5 files per phase. Complete → verify → await approval → next phase.” (`AGENTS.md:403` na `2af0904d`; isto `CLAUDE.md:441`). U paketu je citirana u [02 §0](02-WORKING-AGREEMENT.md) (prvi „Poznati konflikt”), [02 §4](02-WORKING-AGREEMENT.md) („Smernica za izvršenje”) i pitanju (j) u 00 §6. To je granica ranijih agentskih sesija sa osnivačem, ne timsko review pravilo.

Novo pravilo za timski rad na `integration/waggle-next` i `<wave-id>/*`:
1. Jedinica review-a je jedan PR ID iz Delivery §2 ([02 §4](02-WORKING-AGREEMENT.md)). PR sme dirati sve fajlove koje njegov red plana navodi, i broj fajlova nije ograničenje. W0-PR9 (7 source fajlova) i W0-PR12 (6 fajlova) su dozvoljeni.
2. Cilj veličine: do oko 400 izmenjenih linija produkcionog koda, bez testova, fixture-a, generisanih fajlova, lockfile-a i dokumentacije. Iznad oko 800 linija autor predlaže tehnički split ili piše obrazloženje u PR opisu. Odlučuje tech lead, bez osnivača.
3. Split čuva sledljivost: sufiks po obrascu plana (`W0-PR9a`, `W0-PR9b`); svaki deo nosi nalaz ID, AT deo i RED→GREEN dokaz; poslednji deo zatvara AT; split se prijavljuje docs PR-om u plan ([02 §4](02-WORKING-AGREEMENT.md)). PR-ovi se spajaju samo odlukom tech lead-a.
4. „Faza” za ljude i AI agente je logički korak unutar PR-a (commit ili niz commit-a) posle kog se pokreću gates ([02 §6.2](02-WORKING-AGREEMENT.md)). Između faza se ne čeka odobrenje osnivača. Za rad AI agenta odgovara ljudski autor PR-a.
5. Ostatak `AGENTS.md` §4 (uklanjanje mrtvog koda u zasebnom commit-u pre strukturnog refaktora fajla >300 LOC) i §3.3 (surgical changes) važe.

**Usklađivanje repo fajlova:** posle potvrde, zaseban doc-only PR menja `AGENTS.md` §4 i §3.8 i `CLAUDE.md` §4 i §3.8 tako da za timski rad upućuju na ovaj akt. PR odobrava osnivač, kao vlasnik tih ugovora; u backlog-u je to integracioni doc-only posao INT-05 ([03-BACKLOG](03-BACKLOG.md), [backlog.csv](backlog.csv)). Do merge-a tog PR-a konflikt `AGENTS.md §4` ↔ `TSA-06` rešava se po TSA-10 t.2.
**Do potvrde:** važi privremeno pravilo iz 02 §0: najviše 5 fajlova po fazi, a W0-PR9 i W0-PR12 ne počinju.

### TSA-07 — Hotspot integracioni test

1. „Isti hotspot” znači isti red tabele u [02 §3](02-WORKING-AGREEMENT.md) (DP-0.14).
2. Kad se PR B merge-uje istog radnog dana posle PR A na istom hotspot-u, integracioni test ima dva dela: (a) četiri gate-a ([02 §6.2](02-WORKING-AGREEMENT.md)) i dopunske provere ([02 §6.3](02-WORKING-AGREEMENT.md)) prolaze na grani PR B posle merge-a trenutnog HEAD-a `integration/waggle-next`, koji već sadrži PR A; (b) bar jedan imenovani test vežba izmene oba PR-a zajedno na tom hotspot-u (postojeći ili nov, u PR B).
3. Test pokreće autor PR B. Rezultat potpisuje hotspot merge vlasnik; ako je on autor PR B, potpisuje drugi reviewer (TSA-01 t.2). Opis PR B navodi test, komandu, SHA `integration/waggle-next` koji sadrži PR A, izlaz i exit kod.
4. Posle W0-PR0 CI na merge commit-u PR B mora biti zelen. Ako je crven, na tom hotspot-u nema daljih merge-ova dok se ne popravi ([02 §14](02-WORKING-AGREEMENT.md)).
5. Isto važi za G2 hotspot integracione testove budžetirane u Delivery §4.1 (W1-PR4/PR8/PR9 × W3-PR2 × W4-PR1).

**Zamenjuje:** u 02 §3 „Integracioni test: NEPOZNATO” i PREDLOG definicije (usvaja se uz t.1 i t.4); u 02 §10 stavku „šta je „integracioni test””. Dopunjuje DP-0.14 i checklist stavku „Hotspot fajlovi”.
**Do potvrde:** drugi PR na istom redu hotspot tabele ne merge-uje se istog dana (02 §3).

### TSA-08 — Neprodukcioni CI re-run u odobrenom budžetu

Posle potvrde, i tek kad CI postoji (posle W0-PR0):
1. Dozvoljeno je samo `gh run rerun <run-id> --failed` (ili „Re-run failed jobs” u GitHub UI) za run-ove workflow-a `ci.yml` i `tauri-build-pr.yml` pokrenute push-om ili pull request-om na `integration/**` ili `<wave-id>/*` granama u `<ODOBRENI_TIMSKI_REMOTE>`. Na `2af0904d` ta dva workflow-a ne koriste `secrets.*` ni `environment:`, a `tauri-build-pr.yml:139` preskače potpisivanje.
2. Uzrok mora biti infrastrukturni i zapisan: anotacija Actions budžeta (re-run tek posle obnove budžeta), otkaz runner-a, mrežni timeout u koraku instalacije, ili poznat nestabilan test sa TD redom u [TECH-DEBT.md](../TECH-DEBT.md). Crven test zbog koda se ne re-run-uje.
3. Najviše 2 re-run-a po head SHA PR-a. Svaki se beleži u PR-u: run ID, razlog, trajanje.
4. Re-run izvršava Release owner ili tech lead; autor ga traži u PR-u.
5. Budžet: NEPOPUNJENO Actions minuta mesečno, na nalogu koji plaća `<ODOBRENI_TIMSKI_REMOTE>` (upisuje osnivač). Release owner vodi evidenciju. Kad je budžet iscrpljen, re-run staje i ide eskalacija osnivaču.
6. Nikad: `workflow_dispatch` ni `gh workflow run`; re-run `release.yml`, `deploy-www.yml`, `sync-mind.yml`, `mind-parity-check.yml`, `installer-smoke.yml`, `hive-mind-cli-cross-platform.yml` ili bilo kog job-a sa `environment:` ili `secrets.*`; izmena Actions varijabli, secrets ili podešavanja (BC-06).

**Zamenjuje:** samo za re-run iz t.1: reč „re-run” u checklisti („Apsolutne zabrane”, stavka o GitHub podešavanjima) i u DP-0.11 („ni ručnog pokretanja workflow-a”); [01 §3.1](01-ONBOARDING-DEV-ENV.md) (git zabrane), §11.8 i red „CI job pao za 3–4 s” u §12; rečenicu u [02 §14](02-WORKING-AGREEMENT.md) „Crven CI se ne zaobilazi ručnim re-run-om”; red „Release” u [05 §5.3](05-RISKS-DECISIONS-ESCALATION.md); stavku PR šablona o re-run-u.
**Do potvrde:** re-run je owner radnja (checklist, DP-0.11).

### TSA-09 — Kanal predaje i remote (H-01) — PREDLOG, NEODOBRENO

Status: predlog čeka potvrdu osnivača. Pre potvrde ne važi nijedna dozvola iz kolone „Posle odobrenja”.

| Stavka | Danas (pre odobrenja) | Posle odobrenja osnivača (PREDLOG) | Ko odlučuje |
|---|---|---|---|
| Javna grana `docs/waggle-v1.2-planning` = `2758f4e5` | Ostaje kakva jeste; ne briše se, ne prepisuje, vidljivost se ne menja | Osnivač zapisuje da li je javna dostupnost namerna. Preporuka: tretirati `2758f4e5` kao već objavljen (uklanjanje grane ne povlači kopije koje su već preuzete) i ne oslanjati se na povlačenje | Osnivač |
| Kanal predaje timu | Nijedan nije odobren; javna grana nije kanal predaje | **Varijanta A (preporuka):** privatan timski repo = `<ODOBRENI_TIMSKI_REMOTE>`. **Varijanta B:** privatni snapshot (git bundle sa SHA-256) samo za čitanje i procenu pre starta | Osnivač |
| Punjenje timskog repoa | — | Osnivač, uz posebno odobrenje tog push-a: `git -C D:/Projects/waggle-v12-handoff push <ODOBRENI_TIMSKI_REMOTE> 2af0904df01ca3d374cc78ba95b60dc579dd6a7a:refs/heads/main` i `git -C D:/Projects/waggle-v12-handoff push <ODOBRENI_TIMSKI_REMOTE> <closure_sha>:refs/heads/docs/waggle-v1.2-planning` (URL, bez dodavanja remote-a; `<closure_sha>` = odobreni docs-only commit zatvaranja 1.2.1 upisan u manifest §1 posle D-3; ne `planning_package_sha` `2758f4e5`, koji nema korekcije H-01..H-12) | Osnivač |
| Pristup | — | Read za imenovane članove tima; write na `integration/waggle-next` i `<wave-id>/*` za tech lead-a i developere; admin i podešavanja repoa (branch protection) samo osnivač. Imena: NEPOZNATO | Osnivač |
| Klon i push tima | Nema klona za rad, nema push-a nigde | Klon samo iz `<ODOBRENI_TIMSKI_REMOTE>`; pre svakog push-a `git remote get-url --push origin` = `<ODOBRENI_TIMSKI_REMOTE>` (01 §3.2) | Tech lead sprovodi |
| Push na javni `origin` | Zabranjen | I dalje zabranjen za internu dokumentaciju i timske grane. Prelaz koda na javni repo (merge u `main`, tag, potpis, objava) je poseban founder-gated korak (H-09); `release.yml:46` radi samo u `marolinik/waggle-os` | Osnivač |
| `fc0a7b3f` i commit zatvaranja | Lokalni; bez golog `git push` u `D:/Projects/waggle-v12-handoff` (grana prati javni `origin`) | Idu samo na `<ODOBRENI_TIMSKI_REMOTE>`, posle ponovljenog secret-scan-a nad novim diff-om | Osnivač |
| CI i trošak | — | CI u privatnom repou troši Actions minute naloga vlasnika; limit ulazi u budžet ovog akta (H-04) | Osnivač |

Varijanta B, komande (samo osnivač, posle odluke; lokalno čitanje istorije, bez upisa u repo):
    git -C D:/Projects/waggle-v12-handoff bundle create D:\handover\waggle-v12-<planning_sha8>.bundle docs/waggle-v1.2-planning
    Get-FileHash D:\handover\waggle-v12-<planning_sha8>.bundle -Algorithm SHA256
Tim (read-only provera snapshot-a):
    git bundle verify waggle-v12-<planning_sha8>.bundle
    git clone -b docs/waggle-v1.2-planning waggle-v12-<planning_sha8>.bundle D:\waggle\waggle-read
    git -C D:\waggle\waggle-read rev-parse HEAD                     # = SHA commita zatvaranja 1.2.1 iz manifesta §1 (posle D-3)
    git -C D:\waggle\waggle-read merge-base --is-ancestor 2af0904df01ca3d374cc78ba95b60dc579dd6a7a HEAD   # exit 0
    git -C D:\waggle\waggle-read diff --name-only 2af0904df01ca3d374cc78ba95b60dc579dd6a7a HEAD   # samo docs/…
Pre pravljenja bundle-a osnivač proverava da grana pokazuje na SHA commita zatvaranja 1.2.1 iz manifesta §1 (posle D-3), ne na `2758f4e5`. Snapshot nema remote za push i ne zamenjuje Varijantu A za razvoj.

### TSA-10 — Hijerarhija dokumenata i bezbednosni ciljevi

Hijerarhija za timski rad na v1.2:
1. Važeće eksplicitne pisane odluke osnivača: D-01..D-18 ([brief §3](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md)), pisane odluke o DQ/RAT/ODB/ESK stavkama i potvrđene stavke ovog akta (po TSA ID-u).
2. Odobreni ugovori i ADR: PRD/FRD ugovori i ADR posle ratifikacije (RAT-nn). ADR nacrt pre ratifikacije je PREDLOG i ne stoji iznad nivoa 3.
3. Usklađeni plan i radni dogovor: [Delivery plan v1.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) (§0 DP-0.01..DP-0.16), [SAFE checklista](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md), [02](02-WORKING-AGREEMENT.md), ostali handoff dokumenti (00, 01, 03, 04, 05) i backlog.
4. Ranija uputstva — `AGENTS.md`, `CLAUDE.md` i stariji `docs/` — važe u celini, osim gde ih viši nivo zamenjuje **eksplicitno i po ID-u**. `AGENTS.md:6` („this file wins”) ne važi samo za tako zamenjene tačke: `AGENTS.md` §4 „Phased execution” (TSA-06) i lične putanje u `AGENTS.md`/`CLAUDE.md` §3.8 (t.5 ispod). `AGENTS.md` §3.1–§3.6, §7 i §7.5 važe.

Pravila:
1. Bezbednosni ciljevi BC-01..BC-07 se ne gase generičkim pravilom prioriteta, pa ni pravilom nivoa 1. Menja ih samo pisana odluka osnivača koja navodi BC ID, konkretnu radnju, obim i rok.
2. Viši nivo pobeđuje samo kad eksplicitno imenuje normu koju zamenjuje (dokument i ID ili sekciju). Bez toga važi stroža norma ([02 §0](02-WORKING-AGREEMENT.md), t.1).
3. Konflikt koji t.2 ne rešava zaustavlja rad na toj tački. Zapisuje se sa oba ID-a (npr. `AGENTS.md §4` ↔ `TSA-06`) i eskalira ([02 §10](02-WORKING-AGREEMENT.md); [05 §5.5](05-RISKS-DECISIONS-ESCALATION.md)).
4. Posle odluke, pogođeni repo i paket fajlovi se usklađuju doc-only PR-om u istom arc-u ([02 §10](02-WORKING-AGREEMENT.md), t.4). Napomena u drugom dokumentu nije razrešenje.
5. Stanje sesije (`AGENTS.md`/`CLAUDE.md` §3.8): tim ne piše u lične putanje osnivača (`~/.claude`, `~/.Codex` i memorijske putanje u njima). Stanje, otvoreni padovi i sledeći korak idu u PR opis ili issue na `<ODOBRENI_TIMSKI_REMOTE>`. „Never hide failures” i verifikacija pre zapisa (`npm run build:packages`, [02 §6.2](02-WORKING-AGREEMENT.md)) važe.

| ID | Bezbednosni cilj | Izvor |
|---|---|---|
| BC-01 | Nema merge-a u `main`, force-push-a, `git tag v*`, release-a, potpisivanja, attestation-a ni publikacije bez odluke osnivača za konkretnu radnju | DP-0.11, DP-0.12; checklist |
| BC-02 | Mašina osnivača (worktree-ji, stash-ovi, instalirana aplikacija, `~/.waggle`, lično auth stanje, lični ključevi) nije operativna meta | DP-0.02, DP-0.03, DP-0.11; TSA-03 |
| BC-03 | Nema run-a sa realnim nalogom ili plaćenim API-jem bez ODB-01/DQ-04 za taj run, cap-a i izolovanog mesta izvršavanja | DP-0.10; checklist |
| BC-04 | Izolovan runtime i isključeni spoljni upisi; nijedan test ne dira `~/.waggle` ni konfiguraciju stvarnih klijenata | DP-0.08, DP-0.10; checklist |
| BC-05 | Migracije samo na kopijama, sa snapshot-om i rollback testom po klasi; rollback ne oživljava obrisano ili opozvano | DP-0.09; DIR-21 |
| BC-06 | Nema promene vidljivosti repoa, licence/NOTICE, Stripe/billing-a, GitHub repo/org podešavanja, Actions varijabli ni secrets | DP-0.11, DP-0.13; checklist |
| BC-07 | Nema push-a interne dokumentacije ni timskih grana na javni `origin` | DP-0.11 (H-01); checklist |

**Zamenjuje:** „Redosled važenja: NEPOZNATO” u [02 §0](02-WORKING-AGREEMENT.md) i rečenicu u uvodu 02 „Koji izvor pobeđuje … NEPOZNATO”; pitanje (j) u 00 §6 (zajedno sa TSA-06).
**Do potvrde:** važi privremeno pravilo iz 02 §0 (stroža norma; svaki konflikt zaustavlja rad i ide osnivaču).

## 5. Pregled zamena postojećih normi

| Norma i gde živi | Šta se menja | Pravilo | Važi od |
|---|---|---|---|
| `AGENTS.md:403` / `CLAUDE.md:441` „Max 5 files per phase … await approval” (citirano u 02 §0 i §4, 00 §6 (j)) | Za timski rad zamenjeno pravilom veličine PR-a | TSA-06 | potvrda TSA-06 |
| `AGENTS.md`/`CLAUDE.md` §3.8 (lične handoff putanje osnivača) | Ne važi za tim; stanje ide u PR/issue | TSA-10 t.5 | potvrda TSA-10 |
| `AGENTS.md:6` „this file wins” | Ne važi za tačke zamenjene po ID-u | TSA-10 | potvrda TSA-10 |
| DP-0.02, DP-0.03; checklist „Baseline” i „Pre svakog PR-a” t.1; 01 §3.1; 02 §2.2; PR šablon | Obaveza svih hostova → zabrana u vezi sa mašinom osnivača; timska mašina proverava tuđe unose | TSA-03 A | revizija 1.2.1 (uputstvo osnivača) |
| 00 §6 (c); 01 §3.2 „Na mašini osnivača …” | Tim ne radi na mašini osnivača | TSA-03 B | potvrda TSA-03 B |
| 01 §3.3 „uklanjanje … NEPOZNATO”; checklist t.1 (sopstveni unosi); 05 §5.3 red „Podaci žive instalacije” (timska mašina) | Pravilo čišćenja | TSA-04 | potvrda TSA-04 |
| DP-0.05; checklist t.1 „isključivo”; 02 §2.4; 00 §6 (b) | Jedan baseline fixture worktree | TSA-05 | potvrda TSA-05 |
| 00 §2, 01 §0, 02 §0, 04 §13 t.7 („nigde, ni u svežem klonu”); 00 §6 (o) | Izolovani onboarding | TSA-02 | potvrda TSA-02 |
| DP-0.11 i checklist („re-run”); 01 §11.8, §12; 02 §14; 05 §5.3 | Neprodukcioni re-run | TSA-08 | potvrda TSA-08 |
| DP-0.14, checklist „Hotspot fajlovi”; 02 §3 „integracioni test NEPOZNATO” | Definicija testa | TSA-07 | potvrda TSA-07 |
| 02 §7 „Ko odobrava i merge-uje NEPOZNATO”; 00 §6 (k), (m); Delivery §4.2 „Human review (founder)” | Model review-a i merge-a | TSA-01 | potvrda TSA-01 |
| 02 §0 „Redosled važenja NEPOZNATO”; 00 §6 (j) | Hijerarhija i BC-01..BC-07 | TSA-10 | potvrda TSA-10 |
| 01 §3.2 clone/push na javni `origin` | Odobreni timski remote | TSA-09 | odluka osnivača (H-01) |

## 6. Odluka osnivača

Upisuje se u ovaj fajl doc-only izmenom koju odobrava osnivač. Usmena potvrda važi tek kad je pisana ([05 §5.0](05-RISKS-DECISIONS-ESCALATION.md)).

Potvrda stavke zatvara odgovarajuću kapiju u [backlog-gates.csv](backlog-gates.csv): TSA-06, TSA-09 i TSA-10 istoimene kapije, a TSA-01 kapiju `MERGE-AUTH`. Upis kapije u backlog nije potvrda. TSA-09 je jedna od start kapija koje određuju T0 ([Delivery §4.4.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md)); osnivač ih može zatvoriti istim pre-start aktom.

| Stavka | Odluka (odobreno / odbijeno / odobreno sa izmenom) | Izmena | Datum |
|---|---|---|---|
| TSA-01 Review i merge | NEPOPUNJENO | NEPOPUNJENO | NEPOPUNJENO |
| TSA-02 Izolovani onboarding | NEPOPUNJENO | NEPOPUNJENO | NEPOPUNJENO |
| TSA-03 B Tim ne radi na mašini osnivača | NEPOPUNJENO | NEPOPUNJENO | NEPOPUNJENO |
| TSA-04 Čišćenje sopstvenih worktree-ja | NEPOPUNJENO | NEPOPUNJENO | NEPOPUNJENO |
| TSA-05 Baseline fixture worktree | NEPOPUNJENO | NEPOPUNJENO | NEPOPUNJENO |
| TSA-06 Veličina PR-a | NEPOPUNJENO | NEPOPUNJENO | NEPOPUNJENO |
| TSA-07 Hotspot integracioni test | NEPOPUNJENO | NEPOPUNJENO | NEPOPUNJENO |
| TSA-08 CI re-run (i budžet u t.5) | NEPOPUNJENO | NEPOPUNJENO | NEPOPUNJENO |
| TSA-09 Kanal predaje i remote | NEPOPUNJENO | NEPOPUNJENO | NEPOPUNJENO |
| `<ODOBRENI_TIMSKI_REMOTE>` (URL, uz TSA-09) | NEPOPUNJENO | — | NEPOPUNJENO |
| TSA-10 Hijerarhija i BC-01..BC-07 | NEPOPUNJENO | NEPOPUNJENO | NEPOPUNJENO |
| Imena iz §1 (ESK-01..ESK-03, zamenik, drugi reviewer, Release owner) | NEPOPUNJENO | — | NEPOPUNJENO |

Potpis osnivača: NEPOPUNJENO.

## Izvori

[00 §2, §6](00-START-HERE.md) · [01 §0, §3, §6, §9, §11.8, §12, §13](01-ONBOARDING-DEV-ENV.md) · [02 §0–§4, §6, §7, §10, §14](02-WORKING-AGREEMENT.md) · [03 §6](03-BACKLOG.md) · [backlog-gates.csv](backlog-gates.csv) · [04 §13](04-CODEBASE-MAP.md) · [05 §5](05-RISKS-DECISIONS-ESCALATION.md) · [Delivery plan](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) §0, §2 W0/W8, §4.1, §4.2, §4.4.1, §5.1, §6, §6.1 · [SAFE checklista](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md) · [OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md) · [closure zapis](../plans/WAGGLE-V1.2-CLOSURE-RECORD.md) · repo na `2af0904d` (read-only): `AGENTS.md:6`, `:382-392`, `:403`; `CLAUDE.md:441`; `.github/workflows/ci.yml:3-6`, `tauri-build-pr.yml:139`, `deploy-www.yml`, `sync-mind.yml`, `release.yml:46,2059`; `git worktree list` i `git stash list` na mašini osnivača (read-only, 30.09.2026).

# Waggle v1.2 — istorija predaje (evidencija)

**Revizija dokumenta: 1.2.1 DRAFT · 30.09.2026 · završno zatvaranje (H-01..H-12)** (novi dokument; H-02)

Izmene 1.2.1: H-02 — novi dokument: istorija identiteta paketa, zastarele tvrdnje, normalizacija putanja, DOCX izvozi i heševi pre 1.2.1, premeštene iz 00-START-HERE i povezanih dokumenata · H-01 — hronologija push-a i javne dostupnosti (§1) · H-03 — ispravka opisa kritičkih krugova (§6) · H-09 — napomena uz premeštenu rečenicu o F3 (§8).

> **Istorijski zapis.** Ništa u ovom fajlu nije aktuelno uputstvo. Aktuelno stanje je u [00-START-HERE §1](../../handoff/00-START-HERE.md) i [manifestu paketa](../WAGGLE-V1.2-PACKAGE-MANIFEST.md). Tekst premešten iz aktuelnih dokumenata prenosi se doslovno, uz izvor `fajl:linija` na `2758f4e5`; ništa nije obrisano iz git istorije (`git show 2758f4e5:<putanja>`). Relativne veze u citatima važe za izvorni fajl, ne za ovaj.

## 1. Hronologija identiteta paketa

| Datum i vreme | Događaj | Dokaz |
|---|---|---|
| 27.09.2026 | Planski prolaz nad `main` = `2af0904d`; phase-A revalidacija | Delivery DP-0.01; [README](README.md) |
| 27.09.2026 | Live provera vidljivosti repoa: public (F-REL-08, DP-0.13) | [phaseA/release-oss.md](phaseA/release-oss.md) |
| 28.09.2026 | Prvi DOCX izvoz PRD/FRD (OD-9 „isporučeno”) | §4 |
| 29.09.2026 00:10 | DOCX izvoz pre normalizacije putanja (DOCX sa staging putanjama) | §4 |
| 29.09.2026 00:24:41 | Normalizacija putanja u `.md` fajlovima | §3 |
| 29.09.2026 | Ponovni DOCX izvoz PRD/FRD; heševi u §5 | §4, §5 |
| 29.09.2026 02:39:31 +0200 | Commit `2758f4e5b5be82691ef17624494e12ffc9ad84d1` „docs: Waggle v1.2 planning package and dev-team handoff”: 59 fajlova, svi u `docs/`, roditelj `2af0904d` | `git log -1 2758f4e5`; `git diff --name-only 2af0904d 2758f4e5` |
| 30.09.2026 00:04:18 +0200 (= 29.09.2026 22:04 UTC) | Osnivač lično push-uje granu `docs/waggle-v1.2-planning` na `origin` (pokušaj push-a iz planerske sesije bio je blokiran, pa ga je osnivač pokrenuo sam); repo je public, pa je paket na `2758f4e5` javno čitljiv | reflog `refs/remotes/origin/docs/waggle-v1.2-planning` „update by push”; `git ls-remote origin` 30.09.2026 = `2758f4e5`; `gh api repos/marolinik/waggle-os` → `visibility: public` |
| 30.09.2026 00:57:29 +0200 | Lokalni commit `fc0a7b3fa9193d2c52bc8dfaacc94110e9e404d3` (engleski prevod, 49 fajlova, roditelj `2758f4e5`); nije push-ovan | `git log -1 fc0a7b3f`; `git ls-remote origin` |
| 30.09.2026 | Nezavisni pregled nad `2758f4e5` (H-01..H-12); `gh api` → `visibility: public` | [closure zapis](../WAGGLE-V1.2-CLOSURE-RECORD.md) |
| 30.09.2026 | Closure revizija 1.2.1 u radnom stablu (necommitovana) | [manifest](../WAGGLE-V1.2-PACKAGE-MANIFEST.md) §1 |

Namera javne distribucije i kanal predaje timu nisu zapisani kao odluka osnivača (H-01; [00 §6](../../handoff/00-START-HERE.md) (n)).

## 2. Zastarele tvrdnje o statusu paketa (zamenjene u 1.2.1)

| Izvor na `2758f4e5` | Tvrdnja (skraćeno) | Zašto više ne važi | Zamena u 1.2.1 |
|---|---|---|---|
| `docs/handoff/00-START-HERE.md:34` | paket „untracked (nisu commit-ovani)”, „Kada i kako se paket commit-uje, odlučuje osnivač” | commit `2758f4e5` postoji i na `origin`-u je | 00 §1.1 |
| `docs/handoff/00-START-HERE.md:49` | „Nije bilo commit-a, push-a …” | dva docs-only commita i push grane paketa | 00 §2 „Kod nije pisan” |
| `docs/handoff/00-START-HERE.md:216` | (h) „kako i kada se untracked v1.2 paket … commit-uje” | paket je commit-ovan; otvoren ostaje samo ulazak na integracionu granu | 00 §6 (h) |
| `docs/handoff/00-START-HERE.md:222` | (n) vidljivost „live provera 27.09.2026 kaže public — NALAZ AUDITA — ZA PROVERU” | `gh api` 30.09.2026 ponovo vraća `public`, a grana paketa je na `origin`-u | 00 §6 (n) |
| `docs/handoff/01-ONBOARDING-DEV-ENV.md:53-55` | „Paket je danas untracked …” | isto | 01 §0.1 t.5 |
| `docs/handoff/01-ONBOARDING-DEV-ENV.md:137-139` | docs worktree „`2af0904d`” | grana je na `fc0a7b3f` lokalno, `2758f4e5` na `origin`-u | 01 §3.1 |
| `docs/handoff/01-ONBOARDING-DEV-ENV.md:149-150` | stanje na origin-u „NEPOZNATO” | `git ls-remote` 30.09.2026: nema `integration/*` | 01 §3.2 |
| `docs/handoff/01-ONBOARDING-DEV-ENV.md:167-184` | blok „Blokada za svaki host osim founder mašine” (untracked) | paket je commit-ovan i na `origin`-u | 01 §3.2 „Paket na timskom hostu” |
| `docs/handoff/01-ONBOARDING-DEV-ENV.md:836` | „(nije fetch-ovano)” | proveren `ls-remote` | 01 §13 t.4 |
| `docs/handoff/03-BACKLOG.md:577`, `:1576`, `:1612` | „untracked … bez commit-a, nije na origin-u” | isto | 03 WB-PR1, §6 t.4, §7 N-07 |
| `docs/handoff/05-RISKS-DECISIONS-ESCALATION.md:16` | „nema commit-a, push-a …” | isto | 05 §0 |
| `docs/plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md:59` | „Repo nije diran: nema commit-a, push-a …” | isto | SAŽETAK „Šta NIJE urađeno” |

Doslovni tekst dve tvrdnje iz 00-START-HERE:

Izvor: `docs/handoff/00-START-HERE.md:34` na `2758f4e5`.

~~~~text
**Gde paket fizički živi.** Worktree `D:/Projects/waggle-v12-handoff`, grana `docs/waggle-v1.2-planning` na `2af0904d`. Fajlovi paketa su u toj grani **untracked** (nisu commit-ovani); `git status` je proveren read-only 29.09.2026. — POTVRĐENO NA REVIZIJI. Kada i kako se paket commit-uje, odlučuje osnivač (NEPOZNATO). `integration/waggle-next` nastaje iz `2af0904d`, a na toj reviziji PRD/FRD/ADR v1.2 ne postoje (`git cat-file -e 2af0904d:docs/Waggle_PRD_v1.2_DRAFT.md` → „exists on disk, but not in '2af0904d'”, isto za `docs/decisions/ADR-INDEX.md`; POTVRĐENO NA REVIZIJI 29.09.2026). Zato put paketa u integracionu granu blokira WB-PR1 i ID-reconcile PR (pitanje (h) u §6).
~~~~

Izvor: `docs/handoff/00-START-HERE.md:49` na `2758f4e5`. (red tabele §2; zaglavlje je `00:46-47`)

~~~~text
| Pitanje | Odgovor |
|---|---|
| Da li je kod pisan? | Nije. Nije bilo commit-a, push-a, taga, merge-a, release-a, E2E, installer, receipt ni benchmark run-a, Stripe radnji ni plaćenih API poziva ([SAŽETAK](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md), „Šta NIJE urađeno”). |
~~~~

Izvor: `docs/handoff/00-START-HERE.md:216` na `2758f4e5`.

~~~~text
- (h) kako i kada se untracked v1.2 paket (PRD/FRD/ADR, grana `docs/waggle-v1.2-planning`) commit-uje ili unosi u `integration/waggle-next`. Ta grana nastaje iz `2af0904d`, gde PRD/FRD/ADR v1.2 ne postoje (§1). Pitanje blokira WB-PR1 (inventar tabela u FRD + review ADR-08/09, Delivery §2 WB) i ID-reconcile doc-only PR (FRD §16.1 ↔ PRD v1.2 ↔ Delivery §7). Isto je kapija 4 „Pre dana 1” u [03 §6](03-BACKLOG.md) i N-07 u 03 §7;
~~~~

Izvor: `docs/handoff/00-START-HERE.md:222` na `2758f4e5`.

~~~~text
- (n) ko novom članu tima daje pristup repou (vidljivost repoa: `CLAUDE.md:84`/`AGENTS.md:68` kažu private, live provera 27.09.2026 kaže public — NALAZ AUDITA — ZA PROVERU, DP-0.13) i kako paket stiže do tima na hostu koji nije founder mašina, uz (c), (d) i (h) ([01 §3.2](01-ONBOARDING-DEV-ENV.md), §0.1 t.5);
~~~~

## 3. Normalizacija putanja (29.09.2026)

Izvor: `docs/handoff/00-START-HERE.md:36` na `2758f4e5`. („Putanje u paketu”)

~~~~text
**Putanje u paketu.** Putanje u novim v1.2 fajlovima su 29.09.2026 normalizovane na raspored repoa (`docs/…`, `docs/plans/v1.2-evidence/…`). Grep nad PRD, FRD, Delivery, MIG, BvB, Benchmark i ADR-INDEX ne nalazi nijednu staging putanju `out/…`, `phaseA/…` bez prefiksa ni `scratchpad/…`. Jedini izuzetak je namerno zadržana stvarna putanja postojećeg worktree-ja `…/scratchpad/wt202` (DP-0.02). — POTVRĐENO NA REVIZIJI paketa (29.09.2026). Mapa starih i novih putanja je u [v1.2-evidence/README.md, „Mapa starih putanja”](../plans/v1.2-evidence/README.md#mapa-starih-putanja). Potrebna je samo za `critic-r2-estimates.json` i istorijske komentare (npr. zaglavlje `repro-harness.mjs`). DOCX je ponovo izvezen iz normalizovanog `.md` i staging putanje više ne sadrži (v. ispod).
~~~~

Izvor: `docs/handoff/02-WORKING-AGREEMENT.md:19` na `2758f4e5`. („Putanje u paketu”)

~~~~text
- **Putanje u paketu:** `.md` fajlovi paketa su 29.09.2026 normalizovani na raspored repoa ([00 §1](00-START-HERE.md), „Putanje u paketu”). Stare staging putanje (`out/decisions/…`, `out/plans/…`, `v12-planning-staging/tools/check_trace.mjs`) su postojale i u prvom DOCX izvozu; DOCX je 29.09.2026 ponovo izvezen iz normalizovanog `.md` ([00 §1](00-START-HERE.md), „DOCX je aktuelan”), pa ih ni on više ne sadrži. Beleži ih mapa [v1.2-evidence/README.md, „Mapa starih putanja”](../plans/v1.2-evidence/README.md#mapa-starih-putanja). Mapa ih prevodi u `docs/decisions/`, `docs/plans/` i `docs/plans/v1.2-evidence/tools/check_trace.mjs`. POTVRĐENO NA REVIZIJI paketa (29.09.2026): grep `out/decisions|out/plans|v12-planning-staging` nad PRD, FRD, Delivery, MIG, BvB, Benchmark i ADR-INDEX daje 0 pogodaka, a posle re-exporta ni `unzip -p <fajl>.docx word/document.xml` ne nalazi te putanje ni u jednom DOCX-u.
~~~~

Mapa starih putanja ostaje u [README, „Mapa starih putanja”](README.md#mapa-starih-putanja).

## 4. DOCX izvozi 28.–29.09.2026

Izvor: `docs/handoff/00-START-HERE.md:38` na `2758f4e5`. („DOCX je aktuelan”)

~~~~text
**DOCX je aktuelan (re-export 29.09.2026 nakon normalizacije putanja).** Prvi DOCX izvoz (29.09.2026, 00:10) prethodio je normalizaciji putanja (00:24:41), pa je nosio tekst pre normalizacije sa staging putanjama (`out/…`, `scratchpad/…`, `v12-planning-staging/…`). PRD i FRD DOCX su zato ponovo izvezeni istom komandom iz Delivery §6.1 (`pandoc -f gfm-tex_math_dollars-tex_math_gfm <fajl>.md -o <fajl>.docx`, pokrenuto iz `docs/`), bez izmene `.md` teksta. Heševi su ažurirani u Delivery §6.1 i Disposition OD-9, gde stoje pune vrednosti: PRD `.md` `8aa74f26…`, `.docx` `932bb0ee…`; FRD `.md` `7ecc197f…`, `.docx` `198ccd6c…`. U novom DOCX-u `unzip -p <fajl>.docx word/document.xml | grep` ne nalazi staging putanje, a ponovljen izvoz u scratch razlikuje se samo u `docProps/core.xml` (vreme kreiranja). „Uslov predaje” iz Delivery §6.1 je time ispunjen za navedene heševe. — POTVRĐENO NA REVIZIJI paketa (29.09.2026; `pandoc 3.9`, `sha256sum`). Autoritativan tekst ostaje `.md`; svaka kasnija izmena PRD/FRD `.md` ponovo traži izvoz istom komandom i nove heševe u §6.1 i OD-9.
~~~~

Izvor: `docs/handoff/00-START-HERE.md:217` na `2758f4e5`. (pitanje (i))

~~~~text
- (i) ponovni DOCX izvoz PRD/FRD istom `pandoc` komandom i ažuriranje heševa u Delivery §6.1 i OD-9 (doc-only). **Urađeno 29.09.2026** u docs worktree-ju, bez izmene `.md` teksta; „Uslov predaje” iz §6.1 je ispunjen (§1, „DOCX je aktuelan”). Osnivač to pregleda zajedno sa celim paketom; slovo (i) ostaje radi stabilnih referenci;
~~~~

Izvor: `docs/plans/WAGGLE-DELIVERY-PLAN-v1.2.md:601` na `2758f4e5`. (§6.1, pasus „Isporuka paketa — DOCX”)

~~~~text
**Isporuka paketa — DOCX (nije founder ratifikacija ni DQ; Disposition OD-9):** DOCX varijante PRD i FRD v1.2 (brief §20.1 „`.md` + DOCX”) **isporučene 28.09.2026** (ranije ODLOŽENO): `docs/Waggle_PRD_v1.2_DRAFT.docx` i `docs/Waggle_FRD_v1.2_DRAFT.docx`, iz finalnog `.md` teksta komandom `pandoc -f gfm-tex_math_dollars-tex_math_gfm <fajl>.md -o <fajl>.docx` (`pandoc 3.9` na hostu). SHA-256 (re-export 29.09.2026 nakon normalizacije putanja): PRD `.md` `8aa74f266d59f66d10a3f319d57e03b5a426e10f07c74942b2e5bae5b2be588f`, PRD `.docx` `932bb0eed2b80de216323e3d97fdc30ea7e4652a909ab2ee8e35ecd906f40f5e`; FRD `.md` `7ecc197f950de49eb2de6b80b288d3afd487c6af3982002598da75f0fddea5d9`, FRD `.docx` `198ccd6c960dff703251664782f422b0a2a9b28b4018733f5c49bd243f2b325d`. Oba DOCX su 29.09.2026 ponovo izvezena istom komandom iz `docs/`, posle normalizacije putanja u `.md` fajlovima. Zamenjeni heševi (PRD `.md` `08370831…`, `.docx` `99ac396d…`; FRD `.md` `b8153e4d…`, `.docx` `4a121425…`, izvoz posle dopune FRD §15 „lokacija testa”) su zastareli: taj DOCX je nosio staging putanje (`out/…`, `scratchpad/…`, `v12-planning-staging/…`), a u novom `unzip -p <fajl>.docx word/document.xml | grep` ne nalazi nijednu. Ponovljen izvoz u scratch razlikuje se samo u `docProps/core.xml` (vreme kreiranja), pa DOCX odgovara aktuelnom `.md`. — POTVRĐENO NA REVIZIJI paketa (host, 29.09.2026; `pandoc 3.9`, `sha256sum`; svojstvo paketa, ne revizije koda). Disposition OD-9 nosi isto stanje; PRD/FRD zaglavlje (red 5) beleži komandu i mesto heševa, ne same heševe, pa ga re-export ne menja. **Uslov predaje:** svaka kasnija izmena PRD/FRD `.md` čini DOCX zastarelim; pre predaje founder-u proveriti SHA-256 `.md` prema ovoj stavci, pa pri razlici ponoviti izvoz istom komandom i ažurirati heševe ovde i u OD-9 (brief §20.1, §20.4). — PREDLOG (uslov).
~~~~

Izvor: `docs/plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md:189` na `2758f4e5`. (red OD-9; zaglavlje tabele je `:179-180`)

~~~~text
| # | Gde | Odstupanje | Zašto | Uticaj |
|---|---|---|---|---|
| OD-9 | Brief §20.1 („PRD/FRD `.md` + DOCX“); PRD i FRD zaglavlje red 5; Delivery plan §6.1 | **Isporučeno 28.09.2026** (ranije ODLOŽENO): `docs/Waggle_PRD_v1.2_DRAFT.docx` i `docs/Waggle_FRD_v1.2_DRAFT.docx`, generisani iz finalnog `.md` teksta komandom `pandoc -f gfm-tex_math_dollars-tex_math_gfm <fajl>.md -o <fajl>.docx` (`pandoc 3.9`). SHA-256 (re-export 29.09.2026 nakon normalizacije putanja): PRD `.md` `8aa74f266d59f66d10a3f319d57e03b5a426e10f07c74942b2e5bae5b2be588f`; PRD `.docx` `932bb0eed2b80de216323e3d97fdc30ea7e4652a909ab2ee8e35ecd906f40f5e`; FRD `.md` `7ecc197f950de49eb2de6b80b288d3afd487c6af3982002598da75f0fddea5d9`; FRD `.docx` `198ccd6c960dff703251664782f422b0a2a9b28b4018733f5c49bd243f2b325d`. Oba DOCX su 29.09.2026 ponovo izvezena istom komandom iz `docs/`, posle normalizacije putanja u `.md` fajlovima; zamenjeni heševi (PRD `.md` `08370831…`, `.docx` `99ac396d…`; FRD `.md` `b8153e4d…`, `.docx` `4a121425…`) su zastareli, jer je taj DOCX nosio staging putanje (`out/…`, `scratchpad/…`, `v12-planning-staging/…`), a u novom ih `unzip -p <fajl>.docx word/document.xml` + grep ne nalazi. Provera: ponovljen izvoz istom komandom u scratch i raspakovano poređenje — razlikuje se samo `docProps/core.xml` (vreme kreiranja), `word/document.xml` i ostali delovi identični, dakle DOCX odgovara aktuelnom `.md`. — POTVRĐENO NA REVIZIJI paketa (host, 29.09.2026; `pandoc 3.9`, `sha256sum`; svojstvo paketa, ne revizije koda) | Brief §20.1 traži `.md` + DOCX. Ranije odlaganje (tekst se menjao u kritičkom ciklusu, pa bi DOCX odmah zastareo) prevaziđeno je izvozom posle poslednje izmene PRD/FRD teksta | Paket je kompletan po §20.1 za navedene heševe; `.md` ostaje izvor istine. Svaka kasnija izmena PRD/FRD `.md` čini DOCX zastarelim: pre predaje proveriti SHA-256 `.md` prema ovom redu, pa pri razlici ponoviti izvoz istom komandom i ažurirati heševe ovde i u Delivery plan §6.1 |
~~~~

## 5. Heševi pre revizije 1.2.1 (SHA-256)

| Fajl | Stanje | SHA-256 |
|---|---|---|
| `docs/Waggle_PRD_v1.2_DRAFT.md` | `2758f4e5` (= `fc0a7b3f`) | `8aa74f266d59f66d10a3f319d57e03b5a426e10f07c74942b2e5bae5b2be588f` |
| `docs/Waggle_PRD_v1.2_DRAFT.docx` | `2758f4e5` (= `fc0a7b3f`) | `932bb0eed2b80de216323e3d97fdc30ea7e4652a909ab2ee8e35ecd906f40f5e` |
| `docs/Waggle_FRD_v1.2_DRAFT.md` | `2758f4e5` (= `fc0a7b3f`) | `7ecc197f950de49eb2de6b80b288d3afd487c6af3982002598da75f0fddea5d9` |
| `docs/Waggle_FRD_v1.2_DRAFT.docx` | `2758f4e5` (= `fc0a7b3f`) | `198ccd6c960dff703251664782f422b0a2a9b28b4018733f5c49bd243f2b325d` |
| `docs/handoff/00-START-HERE.md` | `2758f4e5` (= `fc0a7b3f`) | `77dd00979fa9fcd19fb7ce96750ae99dfb918d87995177fa85060f0fc6552c40` |
| `docs/handoff/00-START-HERE.docx` | `2758f4e5` (= `fc0a7b3f`) | `012bd501b56c3f12da042b4cea43af814f0579f39dfede4b0c09cd0fe562cb32` |
| `docs/handoff/backlog.csv` | `2758f4e5` (= `fc0a7b3f`) | `ecdac55d40705a5a10f6a434388767408b39eea680ae9c0ae323c9584a720a4b` |
| `docs/Waggle_PRD_v1.2_DRAFT.en.docx` | `fc0a7b3f` | `acbb1bc762f4501e8a4a0fc07d9a56431e78c93286dd6db0fd3ca1cb6129735c` |
| `docs/Waggle_FRD_v1.2_DRAFT.en.docx` | `fc0a7b3f` | `e2fbaf6147954a5ceff638ec22ebb1add5d990f0f0176f5888c6ce9875b299c1` |
| `docs/handoff/00-START-HERE.en.docx` | `fc0a7b3f` | `2ec731e3ff98ed7bae184df9e34864deb5a30d1cb0245b44a3d0a0157cad7a75` |
| `docs/handoff/backlog.en.csv` | `fc0a7b3f` | `896bfbb010f60af68f6f312db7cc8fa095d2e140b5634b1c642d99910f50283c` |

Zamenjeni heševi izvoza pre normalizacije (29.09.2026, u izvoru zabeleženi samo prefiksi; pune vrednosti nisu sačuvane u paketu — NEPOZNATO): PRD `.md` `08370831…`, `.docx` `99ac396d…`; FRD `.md` `b8153e4d…`, `.docx` `4a121425…`.
Provera: `git cat-file blob <commit>:<putanja> | sha256sum` (30.09.2026, ponovljeno pri pisanju ovog fajla; svih 11 vrednosti se poklapa).

## 6. Kritički krugovi (kako ih je opisala revizija 1.2)

Izvor: `docs/handoff/00-START-HERE.md:48` na `2758f4e5`. (red „Šta je stanje paketa?”; zaglavlje tabele je `00:46-47`)

~~~~text
| Pitanje | Odgovor |
|---|---|
| Šta je stanje paketa? | DRAFT. Poslednji kritički krug: HIGH 0, MED 12. LOW nalazi su namerno ostavljeni osnivaču: 17 otvorenih, 8 razrešenih prema [OPEN-LOW-FINDINGS](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md). Posle normalizacije putanja 29.09.2026 ta podela nije tačna u jednoj tački: red o putanjama `scratchpad/…` je među 17 otvorenih, ali u tabeli nosi oznaku „Primenjeno 29.09.2026”. Stavka „DOCX izvoz” među 8 razrešenih bila je privremeno netačna posle normalizacije; posle ponovnog izvoza 29.09.2026 heševi u Delivery §6.1/OD-9 opet odgovaraju aktuelnim fajlovima (§1, „DOCX je aktuelan”). **Status 12 MED nalaza je NEPOZNATO:** paket ne sadrži ni njihovu listu ni zapis razrešenja po stavkama. [SAŽETAK](../plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md) („Poslednji kritički krug”) samo za LOW kaže da su „ostavljeni bez nove petlje”. To upućuje da su MED išli kroz petlju ispravki, ali nigde nije zapisano. `OPEN-LOW-FINDINGS` pokriva samo LOW, a `critic-r2-estimates.json` je drugi krug (11 nalaza: 1 HIGH, 5 MED, 5 LOW), ne poslednji. Provera: grep `MED` nad `docs/`, 29.09.2026. Dok osnivač ne potvrdi, tim ne tvrdi da je MED 0 (pitanje (g) u §6). |
~~~~

Autoritativni disposition ranijih nalaza posle zatvaranja: [closure zapis](../WAGGLE-V1.2-CLOSURE-RECORD.md) (H-03) i `findings/all-critic-findings.json` (459 nalaza), `findings/all-fixer-reports.json` (67 izveštaja).

**Ispravka revizije 1.2.1 (H-03, 30.09.2026).** Premešteni red je bio tačan za sadržaj paketa na `2758f4e5`: paket tada nije sadržao spisak MED nalaza ni zapis njihovog razrešenja. Zapisi su postojali u izlazima planerskih radnih tokova i 30.09.2026 su preneti u `findings/` (459 nalaza, 67 izveštaja popravljača). Red nije mogao da navede sledeće:
1. 12 MED kruga `finish/f1` su `finish/checklist/f1/01–05`, `finish/estimates/f1/01`, `finish/facts/f1/01–02` i `finish/traceability/f1/01–04`. Svih 12 je poslato popravljaču (izveštaji `fix:…:f1`) i 30.09.2026 pojedinačno ponovo provereno; status je u registru `findings/FINDINGS-DISPOSITION.csv`.
2. „17 otvorenih, 8 razrešenih” mešalo je jedinice: 26 LOW nalaza = 8 razrešenih pre upisa registra + 18 nalaza u 17 redova tabele (jedan red spaja dva nalaza). Posle normalizacije putanja 29.09.2026 red `finish/facts/f1/07` je primenjen, pa je stanje na `2758f4e5` bilo 9 razrešenih i 17 otvorenih nalaza u 16 redova.
3. „Poslednji kritički krug” je poslednji krug planskog paketa (`finish/f1`). Dokumenti predaje 00–05, `backlog.csv` i šablon PR-a posle toga su prošli krugove `handoff/r1` (8 HIGH, 25 MED, 34 LOW) i `handoff/r2` (6 HIGH, 21 MED, 29 LOW), koje red ne pominje.

## 7. Read-only provere 29.09.2026

Izvor: `docs/handoff/00-START-HERE.md:26-32` na `2758f4e5`. (check_trace izlaz 0, PRD 166/166, FRD 114/114)

~~~~text
Mehanička provera PRD ↔ FRD pokrivenosti prošla je 29.09.2026 sa izlazom 0: PRD 166/166, FRD ugovori 114/114. Komanda (read-only, iz korena repoa):

```bash
node docs/plans/v1.2-evidence/tools/check_trace.mjs docs
```

— POTVRĐENO NA REVIZIJI paketa (29.09.2026).
~~~~

Izvor: `docs/handoff/00-START-HERE.md:305-315` na `2758f4e5`. (lista provera)

~~~~text
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
~~~~

Rezultat `check_trace.mjs` za reviziju 1.2.1 je u [manifestu](../WAGGLE-V1.2-PACKAGE-MANIFEST.md) §4.

## 8. Ostali sadržaj uklonjen iz 00-START-HERE 1.2

- §4 „Mapa paketa” (`00:115-158`) premeštena u [manifest](../WAGGLE-V1.2-PACKAGE-MANIFEST.md) §2.
- §3 „Napomena o repro skriptama” (`00:103-111`): operativna verzija je u [README](README.md), „Pokretanje”, korak 2 (H-02 §4.12). Doslovni tekst revizije 1.2 je ispod, da dokaz ne zavisi od te izmene.
- §5 tabela G1/G2/G3 i „Kako čitati raspone” (`00:162-179`): duplikat [Delivery §4.2–§4.3](../WAGGLE-DELIVERY-PLAN-v1.2.md); svaki broj proveren u Delivery 30.09.2026 (H-02). Doslovni tekst je ispod. Rečenica o freeze-ovima (`00:179`) opisuje F3 kao jedan korak sa Authenticode-om; od revizije 1.2.1 važi F3a → kontrolisani korak K → F3b ([Delivery §5.1](../WAGGLE-DELIVERY-PLAN-v1.2.md), H-09), a datumi od 27.09.2026 su referentni (T_ref), dok stvarni kalendar počinje od T0 ([Delivery §4.4.1](../WAGGLE-DELIVERY-PLAN-v1.2.md), H-12).
- §7 tabela D-01..D-18 (`00:233-252`): duplikat [brief §3](inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md).
- §8 pregled zabrana (`00:267-278`): duplikat [SAFE checklist, „Apsolutne zabrane”](../SAFE-IMPLEMENTATION-CHECKLIST.md).

Pun tekst revizije 1.2: `git show 2758f4e5:docs/handoff/00-START-HERE.md`.

### 8.1 Napomena o repro skriptama (revizija 1.2)

Izvor: `docs/handoff/00-START-HERE.md:103-111` na `2758f4e5`.

~~~~text
**Napomena o repro skriptama** (POTVRĐENO NA REVIZIJI paketa, grep 29.09.2026):
- Sve tri skripte hardkoduju `dist` founder-ovog main checkout-a:
  - `repro-harness.mjs:4`: `DIST = 'file:///D:/Projects/waggle-os/packages/agent/dist/'`;
  - `repro-shadow.mjs:10`: `DIST = 'D:/Projects/waggle-os/packages/agent/dist'`;
  - `repro-gepa-delta.mjs:10`: `DIST = 'D:/Projects/waggle-os/packages/agent/dist'`.

  Bez izmene one čitaju onaj `dist` koji se trenutno nalazi u `D:/Projects/waggle-os`, a ne `dist` sa `2af0904d`.
- `repro-shadow.mjs` **piše pored sebe:** `mkdtempSync(path.join(here, 'shadow-'))` (`:14-15`), dakle u `docs/plans/v1.2-evidence/phaseA/` unutar repoa. Briše ga tek na `:42`, bez `finally`, pa posle greške direktorijum ostaje. Zaglavlje („Writes only under the scratchpad”, `:3-4`) je istorijsko. U druge dve skripte grep ne nalazi upis.
- **Pokretanje: tek posle founder odobrenja plana (§2).** Pre toga se repro skripte ne pokreću nigde: traže `dist` izgrađen sa `2af0904d`, gradnja (`npm ci`, `npm run build:packages`) čeka odobrenje, a za `dist` u `D:/Projects/waggle-os` nije dokazano da je sa `2af0904d` (tačka iznad). Posle odobrenja: kopirati sve tri skripte u scratch direktorijum van repoa, kao u [v1.2-evidence/README](../plans/v1.2-evidence/README.md) („Pokretanje”, korak 2). U **kopiji** `DIST` usmeriti na `packages/agent/dist` sopstvenog worktree-ja iz `integration/waggle-next` ([01 §0.2](01-ONBOARDING-DEV-ENV.md)), izgrađen sa `npm run build:packages`. Rezultat se poredi sa snapshot-om samo ako je taj `dist` izgrađen sa revizije `2af0904d` (isti README, korak 2). Fajlovi dokaza se ne menjaju. `dist` se nikad ne gradi u `D:/Projects/waggle-os`.
~~~~

### 8.2 Kontrolne tačke G1 / G2 / G3 (revizija 1.2)

Izvor: `docs/handoff/00-START-HERE.md:162-179` na `2758f4e5`.

~~~~text
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
~~~~

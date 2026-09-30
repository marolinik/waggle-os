# Waggle v1.2 — manifest paketa

**Revizija dokumenta: 1.2.1 DRAFT · 30.09.2026 · završno zatvaranje (H-01..H-12)** (novi dokument; H-02)

Izmene 1.2.1: H-02 — novi dokument: identitet paketa (§1), mapa paketa premeštena iz `00-START-HERE` 1.2 §4 (§2), komanda izvoza i SHA-256 svih fajlova paketa (§3), rezultati dokumentacionih provera (§4) · H-01 — status distribucije i ograničeni secret-scan (§1.2). · Završni pregled (H-02): red „closure revizija” (§1) prima SHA commita zatvaranja posle D-3; to je očekivana vrednost u 01 §3.2 i TSA-09.

Manifest opisuje **dokumente** planskog paketa. Poklapanje heševa dokazuje samo da imate iste dokumente; ne dokazuje da je aplikacija ispravna, da je implementacija odobrena niti da je bilo koja DQ/RAT/ODB stavka ratifikovana. Srpski `.md` je autoritativan tekst. Istorija ranijih identiteta, izvoza i heševa je u [HANDOFF-HISTORY](v1.2-evidence/HANDOFF-HISTORY.md).

---

## 1. Identitet paketa (read-only provera 30.09.2026)

| Identitet | Vrednost | Šta znači |
|---|---|---|
| `code_baseline_sha` | `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` | Revizija aplikacionog koda na kojoj važe svi `path:line` i phase-A dokazi; = `origin/main` 30.09.2026. |
| `planning_package_sha` | `2758f4e5b5be82691ef17624494e12ffc9ad84d1` | Commit planskog paketa (29.09.2026), jedini roditelj `2af0904d`, 59 fajlova, svi u `docs/`. Ovu reviziju je pregledao nezavisni pregled 30.09.2026. Na `origin`-u. |
| prevodni commit | `fc0a7b3fa9193d2c52bc8dfaacc94110e9e404d3` | Engleski prevod (`*.en.md`, `backlog.en.csv`, EN DOCX, `handoff/README.md`), 49 fajlova, roditelj `2758f4e5`. Lokalni commit, **nije** na `origin`-u. |
| closure revizija | radno stablo na `fc0a7b3f` + izmene 1.2.1 DRAFT (30.09.2026) | Završno zatvaranje H-01..H-12 ([closure zapis](WAGGLE-V1.2-CLOSURE-RECORD.md)). **Nije commit-ovana**; commit i push traže zasebno odobrenje osnivača. SHA ne postoji; do commita identitet closure revizije su SHA-256 heševi iz §3. Posle odobrenog docs-only commita (closure zapis §4 D-3) njegov SHA se upisuje u ovaj red; to je vrednost koju proveravaju timski klon i bundle (01 §3.2, TSA-09). |
| `implementation_sha` | — | Budući commit sa kodom v1.2 na `integration/waggle-next`. Ne postoji; nastaje tek posle odobrenja implementacije. Posle INT-01 ([03](../handoff/03-BACKLOG.md), kriterijum (1)) SHA integracione grane upisuje se u §1.1. |

Provera (read-only, 30.09.2026): `git rev-parse HEAD` = `fc0a7b3f`; `git log --oneline -3` = `fc0a7b3f`, `2758f4e5`, `2af0904d`; `git diff --name-only 2af0904d 2758f4e5` = 59 fajlova, `git diff --name-only 2758f4e5 fc0a7b3f` = 49 fajlova, svi u `docs/`; `git status --porcelain` pokazuje izmene i nove fajlove samo u `docs/` (closure revizija, necommitovana).

### 1.1 Integraciona grana (popunjava INT-01)

| Polje | Vrednost |
|---|---|
| `<ODOBRENI_TIMSKI_REMOTE>` | NEPOZNATO — čeka odluku osnivača (H-01; [00 §6](../handoff/00-START-HERE.md) (n)) |
| SHA `integration/waggle-next` posle INT-01 | — (INT-01 nije izvršen) |

### 1.2 Status distribucije i ograničeni secret-scan (H-01)

- Na `origin` (`github.com/marolinik/waggle-os`) grana `docs/waggle-v1.2-planning` pokazuje na `2758f4e5` (`git ls-remote`, 30.09.2026), a `gh api repos/marolinik/waggle-os` vraća `visibility: public`. Planski paket na `2758f4e5` je zato javno čitljiv. Push je izvršio osnivač lično (reflog 30.09.2026 00:04:18 +0200). — POTVRĐENO (stanje servisa 30.09.2026, ne svojstvo revizije).
- `fc0a7b3f` i closure revizija 1.2.1 nisu na `origin`-u. Lokalna grana prati javni `origin`, pa bi goli `git push` objavio i njih ([closure zapis](WAGGLE-V1.2-CLOSURE-RECORD.md), H-01).
- Da li je javna dostupnost namerna i kojim kanalom paket stiže do tima odlučuje osnivač. Do te odluke javna grana nije kanal predaje i niko ne push-uje na `origin`. — čeka stvarnu odluku osnivača.
- **Ograničeni secret-scan** (30.09.2026, nad 116 fajlova paketa iz `2af0904d..fc0a7b3f` i novih fajlova 1.2.1, pre dodavanja ovog manifesta i `manifest_hashes.mjs`; tekstualni fajlovi i `word/document.xml` svih 8 DOCX): regex za AWS ključeve (`AKIA…`), `sk-`/`sk-ant-`/`sk-proj-`, GitHub tokene (`ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`, `github_pat_`), Slack (`xox?-`), privatne ključeve (`-----BEGIN … PRIVATE KEY`), Stripe (`sk_live_`, `rk_live_`, `whsec_`), Google (`AIza…`) i Hugging Face (`hf_…`). Rezultat: **0 stvarnih kredencijala**; 1 pogodak je sintetički fixture `docs/plans/v1.2-evidence/phaseA/repro-gepa-delta.mjs:41` (`'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'`, test redakcije). Ograničenje: provera je obrazac-po-obrazac, nije pun secret scanner i ne pokriva git istoriju van ovih fajlova. Ponavlja se pre svake dalje distribucije (vlasnik: Release/Security, do imenovanja planer).

---

## 2. Mapa paketa

Uloge u koloni „Ko ga koristi”: **PM** (osnivač ili vlasnik odluka, planiranje), **Lead** (tech lead i merge vlasnici hotspot fajlova), **Dev**, **QA**. Fajlovi u `docs/plans/` i `docs/decisions/` stariji od 27.09.2026 nisu deo paketa.

**Status prevoda.** Svaki srpski fajl koji ima par `*.en.md` (i `backlog.en.csv`, EN DOCX, `handoff/README.md`) sinhronizovan je sa izmenama 1.2.1 (EN sinhronizacija 30.09.2026, 30 fajlova; prevod revizije 1.2 bio je `2758f4e5` → `fc0a7b3f`). Novi fajlovi 1.2.1 imaju engleski par (`TEAM-START-AUTHORIZATION.en.md`, `backlog-gates.en.csv`, `WAGGLE-V1.2-CLOSURE-RECORD.en.md`, `WAGGLE-V1.2-PACKAGE-MANIFEST.en.md`, `HANDOFF-HISTORY.en.md`); `findings/` (registar i sirovi JSON) nema engleski par. Posle sinhronizacije §3 je ponovo generisan. Pri razlici važi srpski tekst.

| Fajl | Svrha (jedna linija) | Ko ga koristi |
|---|---|---|
| [handoff/00-START-HERE.md](../handoff/00-START-HERE.md) (+ `.docx`) | Operativni ulaz: šta je paket, šta tim sme danas, šta čeka odobrenje, redosled rada, izvori. | svi |
| [handoff/TEAM-START-AUTHORIZATION.md](../handoff/TEAM-START-AUTHORIZATION.md) | Predlog timskih ovlašćenja TSA-01..TSA-10 (ko vodi, odobrava i merge-uje; sopstveni klonovi i worktree-ji; CI re-run). PREDLOG, NEODOBRENO. (1.2.1) | PM, Lead |
| [handoff/01-ONBOARDING-DEV-ENV.md](../handoff/01-ONBOARDING-DEV-ENV.md) | Okruženje, pristupi i prvi build (Windows). | Dev, QA |
| [handoff/02-WORKING-AGREEMENT.md](../handoff/02-WORKING-AGREEMENT.md) | Način rada: grane, PR, review, gates, uloge. | Lead, Dev, QA |
| [handoff/03-BACKLOG.md](../handoff/03-BACKLOG.md) | Tiketi (tiket = PR ID iz Delivery §2), zavisnosti, kapije, kartice, DoR/DoD, uputstvo za uvoz u tracker (§8). | PM, Lead, Dev, QA |
| [handoff/backlog.csv](../handoff/backlog.csv) | Mašinski čitljiva verzija tiketa iz 03 (RFC 4180, UTF-8) za uvoz u tracker. | PM, Lead |
| [handoff/backlog-gates.csv](../handoff/backlog-gates.csv) | Registar kapija, odluka i događaja na koje se tiketi pozivaju (1.2.1, H-06). | PM, Lead |
| [handoff/04-CODEBASE-MAP.md](../handoff/04-CODEBASE-MAP.md) | Mapa koda za oblasti koje menja plan: topologija, hotspot fajlovi i merge vlasnici, `path:line` na `2af0904d`. | Lead, Dev, QA |
| [handoff/05-RISKS-DECISIONS-ESCALATION.md](../handoff/05-RISKS-DECISIONS-ESCALATION.md) | Red odluka (DQ/RAT/ODB), NEPOZNATO koje blokira tikete, spoljne kapije, rizici i eskalacija. | svi |
| [handoff/templates/PULL_REQUEST_TEMPLATE.md](../handoff/templates/PULL_REQUEST_TEMPLATE.md) | PREDLOG šablona PR opisa sa obaveznim poljima iz checkliste; nije instaliran u `.github/`. | Lead, Dev |
| [handoff/templates/ci-integration-branch-proposal.md](../handoff/templates/ci-integration-branch-proposal.md) | PREDLOG diff-a za W0-PR0 (`integration/**` u `ci.yml` i `tauri-build-pr.yml`); nije primenjen. | Lead |
| `handoff/README.md` | Engleski ulaz u prevod (iz `fc0a7b3f`). | svi (EN) |
| [Waggle_PRD_v1.2_DRAFT.md](../Waggle_PRD_v1.2_DRAFT.md) (+ `.docx`) | Šta proizvod jeste i nije; G1/G2/G3 na nivou proizvoda; otvorene odluke §17. | PM, Lead |
| [Waggle_FRD_v1.2_DRAFT.md](../Waggle_FRD_v1.2_DRAFT.md) (+ `.docx`) | Funkcionalni ugovori (FRD-nn.m); AT-01..AT-30 (§15); traceability PRD → FRD → AT (§16). | Lead, Dev, QA |
| [WAGGLE-DELIVERY-PLAN-v1.2.md](WAGGLE-DELIVERY-PLAN-v1.2.md) | Operativni plan: DP-0.01..DP-0.16, G exit kriterijumi, talasi i PR slicing, graf, procena, okvir od T0 (§4.4), freeze-ovi i release put (§5, §5.1), DQ/RAT/ODB. | PM, Lead, Dev, QA |
| [SAFE-IMPLEMENTATION-CHECKLIST.md](SAFE-IMPLEMENTATION-CHECKLIST.md) | Obavezna da/ne lista pre svakog PR-a, agenta i sesije; apsolutne zabrane; bezbedan test profil (BTP); obavezna polja PR opisa. | svi |
| [WAGGLE-AUDIT-DISPOSITION-v1.2.md](WAGGLE-AUDIT-DISPOSITION-v1.2.md) | Razrešenje svakog nalaza audita (C1–C22, A1–A29, R01–R24) sa dokazom i talasom. | PM, Lead |
| [WAGGLE-BUILD-VS-BORROW-v1.2.md](WAGGLE-BUILD-VS-BORROW-v1.2.md) | BB-01..BB-13 zapisi (Preserve → Borrow → Adapt → Build), kriterijum za durable engine, provenance inventar. | Lead, Dev |
| [WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md](WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md) | B1/B2/B3 protokol: izbor testa, hipoteze, firewall, run reset, statistika, manifest, trošak. | Lead (Benchmark owner), QA |
| [WAGGLE-MIGRATIONS-v1.2.md](WAGGLE-MIGRATIONS-v1.2.md) | MIG-00 ugovor (snapshot, dry-run, idempotentnost, rollback Klasa A/B) i MIG-01..09; MDQ pod-lista. | Lead, Dev, QA |
| [WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](WAGGLE-V1.2-OPEN-LOW-FINDINGS.md) | Otvoreni LOW nalazi poslednjeg kritičkog kruga planskog paketa. | PM, Lead |
| [WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md](WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md) | Jedna strana: procena, defekti, NEPOZNATO, decision queue. | PM, Lead |
| [WAGGLE-V1.2-CLOSURE-RECORD.md](WAGGLE-V1.2-CLOSURE-RECORD.md) | Zatvaranje H-01..H-12: nalaz → ishod provere → izmena → dokaz → preostali korak i vlasnik (1.2.1). | PM, Lead |
| `WAGGLE-V1.2-PACKAGE-MANIFEST.md` (ovaj fajl) | Identitet paketa, mapa, SHA-256, rezultati dokumentacionih provera (1.2.1). | svi |
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
| [v1.2-evidence/README.md](v1.2-evidence/README.md) | Sadržaj foldera dokaza (snapshot na `2af0904d`), bezbedno read-only pokretanje alata i repro skripti, mapa starih putanja. | Lead, Dev, QA |
| [v1.2-evidence/HANDOFF-HISTORY.md](v1.2-evidence/HANDOFF-HISTORY.md) | Istorija predaje: identiteti, zastarele tvrdnje, normalizacija putanja, DOCX izvozi i heševi pre 1.2.1 (1.2.1). | PM, Lead |
| [v1.2-evidence/findings/FINDINGS-DISPOSITION.csv](v1.2-evidence/findings/FINDINGS-DISPOSITION.csv) | Registar nalaza svih kritičkih krugova sa statusom, dokazom i vlasnikom (1.2.1, H-03). | PM, Lead, QA |
| [v1.2-evidence/findings/all-critic-findings.json](v1.2-evidence/findings/all-critic-findings.json), [all-fixer-reports.json](v1.2-evidence/findings/all-fixer-reports.json) | Sirovi zapisi kritičara (459 nalaza) i fixer izveštaja (67), izvor registra (1.2.1, H-03). | PM, Lead |
| [v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md](v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md) | Founder brief: D-01..D-18 (§3), DIR-01..DIR-25, G smer (§5.1), granice ovlašćenja. | PM, Lead |
| [v1.2-evidence/inputs/S1-audit-2026-09-27.md](v1.2-evidence/inputs/S1-audit-2026-09-27.md) | S1 audit PRD/FRD v1.1 (polazni input procene; phase-A ga nadjačava gde se razlikuju). | PM, Lead |
| [v1.2-evidence/inputs/Waggle_PRD_v1.1_2026-09-27.md](v1.2-evidence/inputs/Waggle_PRD_v1.1_2026-09-27.md), [FRD v1.1](v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.md) (+ `.docx`) | Prethodna verzija specifikacije (istorijski input). | PM |
| `v1.2-evidence/phaseA/` (`*.md`, `*.refute.md`, `repro-*.mjs`) | Revalidacija nalaza na `2af0904d` po grupama, refuter verdikti i repro skripte. | Lead, Dev, QA |
| [v1.2-evidence/phaseA/critic-r2-estimates.json](v1.2-evidence/phaseA/critic-r2-estimates.json) | Nalazi kritike procene iz drugog kruga (istorijski trag). | PM, Lead |
| [v1.2-evidence/phaseA/oss-drift-check-output.txt](v1.2-evidence/phaseA/oss-drift-check-output.txt) | Read-only izlaz `oss-drift-check.mjs` (22 known blockers, 3 unreviewed). | Lead (Memory/OSS) |
| [v1.2-evidence/tools/check_trace.mjs](v1.2-evidence/tools/check_trace.mjs) | Mehanička provera PRD ↔ FRD §16.1 pokrivenosti (exit 1 na rupu). | PM, Lead, QA |
| [v1.2-evidence/tools/check_backlog.mjs](v1.2-evidence/tools/check_backlog.mjs) | Mehanička provera backlog CSV/registra kapija/kartica i simulirane spremnosti tiketa (1.2.1, H-06). | PM, Lead, QA |
| [v1.2-evidence/tools/manifest_hashes.mjs](v1.2-evidence/tools/manifest_hashes.mjs) | Provera (podrazumevano, read-only) ili ponovno generisanje (`--write`) tabele SHA-256 u §3 (1.2.1). | PM, Lead |

---

## 3. DOCX izvoz i SHA-256

**Komanda izvoza** (iz direktorijuma fajla): `pandoc -f gfm-tex_math_dollars-tex_math_gfm <fajl>.md -o <fajl>.docx`. Alat: `pandoc 3.9` (`pandoc --version` na referentnoj mašini 30.09.2026). Da li druga verzija pandoc-a daje isti DOCX: NEPOZNATO. DOCX heš se menja pri svakom izvozu (`docProps/core.xml` nosi vreme kreiranja), pa se heš upisuje posle svakog izvoza.

**Izvozi revizije 1.2.1 (30.09.2026):** `Waggle_PRD_v1.2_DRAFT.docx` i `Waggle_FRD_v1.2_DRAFT.docx` (iz `docs/`) i `handoff/00-START-HERE.docx` (iz `docs/handoff/`) ponovo su izvezeni gornjom komandom iz aktuelnog srpskog `.md` teksta. U `word/document.xml` novih DOCX nema staging putanja (`scratchpad/`, `v12-planning-staging/`; pogoci za `out/` su reči „timeout/…” iz samog teksta). Istom komandom 30.09.2026, posle EN sinhronizacije i završnog pregleda, ponovo su izvezena svih šest DOCX (srpski i `*.en.docx` za PRD, FRD i `00-START-HERE`); ni u jednom `word/document.xml` nema `scratchpad`, `v12-planning-staging`, `AppData` ni `MarkoMarkovic`.

**Kako se tabela održava.** Tabelu između oznaka ispod piše samo alat: `node docs/plans/v1.2-evidence/tools/manifest_hashes.mjs --write` (iz korena repoa). Provera istovetnosti, read-only: isti alat bez argumenata (exit 0 = svi fajlovi odgovaraju; exit 1 = razlika, fajl nedostaje ili fajl paketa nije u tabeli). Svaka izmena fajla paketa posle generisanja (uključujući EN sinhronizaciju i ponovni DOCX izvoz) čini tabelu zastarelom: izvoz, pa `--write`, pa provera. Tekstualni fajlovi (`.md`, `.csv`, `.json`, `.mjs`) hešuju se posle normalizacije CRLF → LF, a DOCX kao sirovi bajtovi, pa rezultat ne zavisi od `core.autocrlf` klona (Windows klon sa `autocrlf=true` daje isti rezultat kao LF klon); zato se heševi iz ove tabele ne porede sa `sha256sum` sirovog fajla. Ovaj manifest i njegov engleski par ne navode sopstvene heševe; `--write` upisuje istu tabelu u oba, a provera javlja razliku ako se tabele razlikuju. Za uvoz u tracker ([03 §8.2](../handoff/03-BACKLOG.md) t.1) moraju se poklopiti redovi za `handoff/backlog.csv`, `handoff/backlog-gates.csv`, `handoff/03-BACKLOG.md`, `Waggle_PRD_v1.2_DRAFT.md` i `Waggle_FRD_v1.2_DRAFT.md`.

<!-- HASHES:BEGIN -->
| Fajl | SHA-256 |
|---|---|
| `docs/Waggle_FRD_v1.2_DRAFT.docx` | `75927374f393e342bf9e59e3c244c92335745561435c19286875b8baffcf6158` |
| `docs/Waggle_FRD_v1.2_DRAFT.en.docx` | `126b9f39f448eed29670990cb57c20b5c3959599757f792f917b563655e69e72` |
| `docs/Waggle_FRD_v1.2_DRAFT.en.md` | `b435b324b1ee44eda338860221d379c670424e801b2caf1966bb2416b16108e7` |
| `docs/Waggle_FRD_v1.2_DRAFT.md` | `2156bba5c29227e7f59aaba222b313b7a9294e7278c6f2f629a3f397ba52d928` |
| `docs/Waggle_PRD_v1.2_DRAFT.docx` | `d0fa4c8673c89ea276464644aacbb3fb22a2e2f9e60a6daf29ad8702c468113c` |
| `docs/Waggle_PRD_v1.2_DRAFT.en.docx` | `b4d7e8010ffb7a74e696ff8f978dc478e41a4f78eaab03a6987fe4f5db7b7302` |
| `docs/Waggle_PRD_v1.2_DRAFT.en.md` | `da236148abb1a3e51bacd25771772af2d4778087744b9748941e73548e839f20` |
| `docs/Waggle_PRD_v1.2_DRAFT.md` | `9964e0eb62f92d66027179d5e5f4c0d5a669ef1fc2ba6d709efd11ac32c2ad45` |
| `docs/decisions/2026-09-27-ADR-01-conversation-work-modes.en.md` | `53f3831a3b5afb780b819a45a1509f5d49137871519ee8c233e30c4358f1735d` |
| `docs/decisions/2026-09-27-ADR-01-conversation-work-modes.md` | `8c88a66adce41222231439303919509ae2bb3051fc2bfaf6f20e41eef295dbfb` |
| `docs/decisions/2026-09-27-ADR-02-durable-store-phase-resume-action-idempotency.en.md` | `6143cf06011cf13aaa6a69eccf01e6af98225952cadfb0767d569f7687eb7a46` |
| `docs/decisions/2026-09-27-ADR-02-durable-store-phase-resume-action-idempotency.md` | `1f9d8c63f99d7fb9efc0d7aeba57942650db1b27b0c878d7bc8fa2096bc4545a` |
| `docs/decisions/2026-09-27-ADR-03-detach-cancel-supersedes-r3-008.en.md` | `808c11f1c2a1e16c5314e8bba078789ddf77f593021bcfbb3bb44fd659ff431c` |
| `docs/decisions/2026-09-27-ADR-03-detach-cancel-supersedes-r3-008.md` | `b1053d8ec3f6f060889cb21698877578234cf44149745860822c5b194e04a0c0` |
| `docs/decisions/2026-09-27-ADR-04-inline-capability-oauth.en.md` | `f3a28baa36998a48d4815b410c900896cf23a3bcf842b1fddca3efd7b712d7e0` |
| `docs/decisions/2026-09-27-ADR-04-inline-capability-oauth.md` | `c1d92ab0be56b900329934aa4825ba702f9a61830d822ac573bdd4903427710f` |
| `docs/decisions/2026-09-27-ADR-05-rawdetail-context-hook-precedence.en.md` | `5f9745469b8fc0184338030758ecb3ba3773f4921c9f96a25eccc3a8a30f481e` |
| `docs/decisions/2026-09-27-ADR-05-rawdetail-context-hook-precedence.md` | `787ce5de140946268a967a471dc9fc24b04e5bca259e40e13c9e4f1bcad3438f` |
| `docs/decisions/2026-09-27-ADR-06-active-override-promotion-rollback.en.md` | `5cdca1c24e5100f605b02ebd1e198e8143101b9c3030f7882e29287cf5d3185b` |
| `docs/decisions/2026-09-27-ADR-06-active-override-promotion-rollback.md` | `391760069833e943926e0eeac98c6c14820533410af9d80f5224fb60df6a37b4` |
| `docs/decisions/2026-09-27-ADR-07-routines-vs-toolless-loops.en.md` | `857a51da12c347e2cec7f76d3903415f6743088633929d3d81700b72007bae7d` |
| `docs/decisions/2026-09-27-ADR-07-routines-vs-toolless-loops.md` | `d86a530a90b4a2e414a376679902f45ffecfef8b5e378caa868d1940163e411b` |
| `docs/decisions/2026-09-27-ADR-08-individual-tiers-kvark-boundary.en.md` | `6f9991ac0883d688e3451e186a66e6842bed485f07f2043f110fefadffabc2c8` |
| `docs/decisions/2026-09-27-ADR-08-individual-tiers-kvark-boundary.md` | `d6a671da2e2fc3c0acb7d86b7095f39b9f1bbc26711a4bafac10f9bc782e6a24` |
| `docs/decisions/2026-09-27-ADR-09-secondary-worker-parity.en.md` | `9a77826a1871b1422e3df961b853851db62ded93b7baae0e04585564f63d9879` |
| `docs/decisions/2026-09-27-ADR-09-secondary-worker-parity.md` | `c2d90b3c3d1ed99f08c9f0dacfc2612996ad1ec2d6ca58428ffc76f9d7c3b85f` |
| `docs/decisions/2026-09-27-ADR-10-release-privacy-profiles.en.md` | `41f794ad1476ae8db431d0cc34289d7e91bb53d5da9eb28600e7f4878410eeaa` |
| `docs/decisions/2026-09-27-ADR-10-release-privacy-profiles.md` | `53579c697ae46c860f9002ab313667496e5e47b0d4dbf7e60059949ff8caf6f1` |
| `docs/decisions/ADR-INDEX.en.md` | `b023365a5077918b7c0ade5aa86d2770140c75d81b47d22e1675aa735b06c1c5` |
| `docs/decisions/ADR-INDEX.md` | `7d178a54e5a1627603d5076c53d80b0956d61cd9efa5dcfdad44e90748cda10e` |
| `docs/handoff/00-START-HERE.docx` | `436a9854ff231ede71a52d049c8b68def6455553a2198af0bc36fe7514418d78` |
| `docs/handoff/00-START-HERE.en.docx` | `33b1cdb89d55ccf6e17e111261f41c465a54b8cb486137f9a6467ccd48a1e40e` |
| `docs/handoff/00-START-HERE.en.md` | `d46b7e7de03fca1b464d6c31a40761f36539bf4d078532071c2e810dd94abd9a` |
| `docs/handoff/00-START-HERE.md` | `e72efa101cc695259c1a75a9b29c0ab57512215eed6a05116ff1a1f3ca921e7c` |
| `docs/handoff/01-ONBOARDING-DEV-ENV.en.md` | `55cad597f7ca7ebe011c0407caadbd7207611e13dede7a6585f1a579a3daeb09` |
| `docs/handoff/01-ONBOARDING-DEV-ENV.md` | `e276fc646dc6808ac5e9757a8ddd5bc05a5bd7028d66503a81ceea70c2a1c44a` |
| `docs/handoff/02-WORKING-AGREEMENT.en.md` | `a27a62d367d390ae8519b4a3238648e487ab67dddc092e39ce474db08afb9e32` |
| `docs/handoff/02-WORKING-AGREEMENT.md` | `f1e377ca161a381a9677467598c06e6ad72b0eb075df4480e1c6ae3f1bbea0ae` |
| `docs/handoff/03-BACKLOG.en.md` | `79d1ce77527c834d5094863c3dcf8f467b10094430e212ef9a91042df544f48e` |
| `docs/handoff/03-BACKLOG.md` | `7eda246251f4e45496f35ef88fea2c6d42124d60c95ae0a6d3d365f3b55ac39e` |
| `docs/handoff/04-CODEBASE-MAP.en.md` | `e89b549971232b361720356e6d69c80802ccdd158a394fd89c6174927563e379` |
| `docs/handoff/04-CODEBASE-MAP.md` | `b475d1036f349b75fd249aa8d6c8eaedebd8bf214c7d8f0022490c3d21ddb32d` |
| `docs/handoff/05-RISKS-DECISIONS-ESCALATION.en.md` | `62208e76fe4a1c4f489ad631370755ca9365fa0a6f1d1f2931abe65da7e07ca5` |
| `docs/handoff/05-RISKS-DECISIONS-ESCALATION.md` | `5e17951767b2341a12aa8295676d794e1bff30dd8c3d03ba9740cb727a28d6c8` |
| `docs/handoff/README.md` | `b31d0d433186ce783f741cc39d98dea4dafbd0840256d8571cb68d54d33e35ce` |
| `docs/handoff/TEAM-START-AUTHORIZATION.en.md` | `1e0e587e89755e69f7a53e399b3dcb9be52e8471d8d29efd7f2e9c1c943fa4d6` |
| `docs/handoff/TEAM-START-AUTHORIZATION.md` | `6c99a143af46baa48e5922cef8358cae3cf0d89ae3d5a4669b0016c1624b4a73` |
| `docs/handoff/backlog-gates.csv` | `649b4e23a20407ddad6a6bdde3cac51869983cbf2cf6ce18ce932a9794150cdb` |
| `docs/handoff/backlog-gates.en.csv` | `b11e22c8dcfa4cbb48b909c80957ecc42f0e8e3a3f63cf157a4512af24bace53` |
| `docs/handoff/backlog.csv` | `0ee2ac9d330b70eb09e250715ce7ce41ca2325036fa1dcd827ddcd9069072c27` |
| `docs/handoff/backlog.en.csv` | `1b033c2f1ffa7464379e0c93836eed73ff91e0780782c3bd675fe5efe49cb471` |
| `docs/handoff/templates/PULL_REQUEST_TEMPLATE.en.md` | `66cff5f8504361716c6ac8dfe5010801ff14e0f3a133750149e1a2c0ec675c5b` |
| `docs/handoff/templates/PULL_REQUEST_TEMPLATE.md` | `411c314d8ca8fcd40fcd7d5e3ad84b633d695396be18544133d8591e1608e601` |
| `docs/handoff/templates/ci-integration-branch-proposal.en.md` | `96812569494de8967c7638ea4e01d572d57707760d119e4ab043a0a98a84e171` |
| `docs/handoff/templates/ci-integration-branch-proposal.md` | `d72b05697f12661010d6de03368e704c8c82dd96c256cfba9674e69e5f9519cf` |
| `docs/plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md` | `e0c020f0bd8c9f6911eff7f89d12589651bddc2a204e8710b42430f0e36f84a3` |
| `docs/plans/SAFE-IMPLEMENTATION-CHECKLIST.md` | `66ced59d44057a5b0012fdb8e6cada0b67dd0e86649036ade46f62dce75e4cdd` |
| `docs/plans/WAGGLE-AUDIT-DISPOSITION-v1.2.en.md` | `9c5dd47aa5f3a13e9c27565444880570b5c27251dcb64f419884db8301fbf529` |
| `docs/plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md` | `c515c678c8ee4c397129ff33d584350a12c42578544287448cdaa01ac22d1a55` |
| `docs/plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.en.md` | `206b9bf0d4a4d28114c074aab4e10cb4b2580bc2691bccd1ecf22b71e38b743a` |
| `docs/plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md` | `31e5d0c4e735145a89f844ab13b2a70edebc84114643bf810b7797ccd7c40c3c` |
| `docs/plans/WAGGLE-BUILD-VS-BORROW-v1.2.en.md` | `702d04f04dfdbb6b05e5036d6fb5031e68f36ce542a14de885cf2e44693e3ff3` |
| `docs/plans/WAGGLE-BUILD-VS-BORROW-v1.2.md` | `a639a2f32a655eb26ae10f5689179fcbb7e96a62f248d0aa0baa7bf248d7e1e3` |
| `docs/plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md` | `3aafcb1267b915bc21d527b8dc09889aa02823c2184c0c98cbe4fd507e2acaeb` |
| `docs/plans/WAGGLE-DELIVERY-PLAN-v1.2.md` | `b9c2336e5d780f5322edcb488059bb857723b20f9f98bb3cc77179e0659b1af6` |
| `docs/plans/WAGGLE-MIGRATIONS-v1.2.en.md` | `f05ed70ed939dbebca8343c5bcf2e5a89cdfaebc93d2505c5b4579a0478d72eb` |
| `docs/plans/WAGGLE-MIGRATIONS-v1.2.md` | `fa02fe2fcb147fc8903596f13ee51c670099fae6c6280f36af02a353e03621d4` |
| `docs/plans/WAGGLE-V1.2-CLOSURE-RECORD.en.md` | `720b8ca2c70506f1c8339c77fdc2b51f1a5582d54cba9d716024f3208d040c6e` |
| `docs/plans/WAGGLE-V1.2-CLOSURE-RECORD.md` | `9f1335a00bedabf537464e57d7c044bf7df6d5d51296fadf584b908ace12b1df` |
| `docs/plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md` | `98b074aa67d3334dd06173c1506d3a3fc5b0b347857bd6b827ee5b4937771b0f` |
| `docs/plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.md` | `d784ed6566927c2563b60a5f0a2985268361b494b79dab3db4141f36fd0f6ae3` |
| `docs/plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.en.md` | `33e6fcc8ec7f5a2a96018025d9c471eb5bf2d2c9e09cee052565fcc245f8819c` |
| `docs/plans/WAGGLE-V1.2-SAZETAK-ZA-OSNIVACA.md` | `9e0fe7db0c0351c55aca8b8e5e7b735ce8323702f4c3b743de50dc9861da6680` |
| `docs/plans/v1.2-evidence/HANDOFF-HISTORY.en.md` | `8d4f4e004ddebcbf728d624453279685de6c57a1e86c03751c23faa1227471d3` |
| `docs/plans/v1.2-evidence/HANDOFF-HISTORY.md` | `290fbb551d206feb2b374f951a52ee8e7e97fb570869ce2b0258055d8b38ef90` |
| `docs/plans/v1.2-evidence/README.en.md` | `5d0e47186fb29d5447c591734bc89cde2ac8347a95755f431416faae9519b386` |
| `docs/plans/v1.2-evidence/README.md` | `e56f9a19f203a463bb10b580cc520503e68538e6b67514e99f83cf1f5414b600` |
| `docs/plans/v1.2-evidence/findings/FINDINGS-DISPOSITION.csv` | `f62bd813ace47d744a5d07f789319cb571450c04c8a6f9e2f76a5052b6d1577a` |
| `docs/plans/v1.2-evidence/findings/all-critic-findings.json` | `0a09f5c0f13171f1f61f6d0cbeac755e49d3d8da1a35e3aba679b928231f13e4` |
| `docs/plans/v1.2-evidence/findings/all-fixer-reports.json` | `e5629d52db25a375c26692837a9d41416e9a8c11004b966c1614344c8e52f8f6` |
| `docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md` | `b7f03ff7eb35c7fb1c8e069cb32814a961755306e2217255c0e6229abcda8b08` |
| `docs/plans/v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.docx` | `1b9fae5596983c2980750e8794dd731478306b440667c4b9403e001b672c8dd0` |
| `docs/plans/v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.md` | `47d38637944c762185c0024be10bbc84210592ec9e8f8085e46f1e0b941f6f2d` |
| `docs/plans/v1.2-evidence/inputs/Waggle_PRD_v1.1_2026-09-27.docx` | `69f8d0cc88fd2953c47118d30bc268f4774b882d88c4e1c0a608b2f9defba969` |
| `docs/plans/v1.2-evidence/inputs/Waggle_PRD_v1.1_2026-09-27.md` | `cf606d4f7c22263d675d8727ea66c5580ed02524815f72d115a9f046d52bf80b` |
| `docs/plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.en.md` | `b8683a644a6aba9dd70744758cfe3b5bb72f1c28851c29d1170a625641b1381f` |
| `docs/plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md` | `2dc0815527bbfc401f1d815722f98f170e450be6415372eefeddeaf8da5056e5` |
| `docs/plans/v1.2-evidence/phaseA/capability.en.md` | `ed9658f59352382a3d913f7e79b111dbe9549573fa500a71f238e00da8cefddc` |
| `docs/plans/v1.2-evidence/phaseA/capability.md` | `b00bff7438eaa818a92af9849db0acf04d8cad8ae18e07ed5407f0c9929069d5` |
| `docs/plans/v1.2-evidence/phaseA/critic-r2-estimates.json` | `ffa39c80ef29b4e92d0ad33830beced77107958f4bf1b1d45a1d44481a5e52f2` |
| `docs/plans/v1.2-evidence/phaseA/durable.en.md` | `632f96beea083e1f4bf226fa06375b40a1f9dd45ba877acd95db24bc74cc595b` |
| `docs/plans/v1.2-evidence/phaseA/durable.md` | `f2f817ca55fd8a7c0ba461b559e97524dd5ddddbc83abcd1ff8e6f1ed999f1be` |
| `docs/plans/v1.2-evidence/phaseA/durable.refute.en.md` | `9d28f1cb0fa6beef7e91542848ef775d3b495c914201fc834d96026074ccdad8` |
| `docs/plans/v1.2-evidence/phaseA/durable.refute.md` | `9fac6b66099b69db68845e336fc60d05c4226f15afe8f15ec167440dcbdefe49` |
| `docs/plans/v1.2-evidence/phaseA/evolution.en.md` | `4dd282ce01a117302f013a7981734ae1b0fe0616666fa1a895e3b3e7535eeaa4` |
| `docs/plans/v1.2-evidence/phaseA/evolution.md` | `f15d3a4d14b8490172fa66253c512a0a8755ad7c7a3f1a8d7f3f4af191c850b0` |
| `docs/plans/v1.2-evidence/phaseA/evolution.refute.en.md` | `ba47126f0db84965c6512869bd38dffd4b4dae22cb241850cafc20badf2e44ea` |
| `docs/plans/v1.2-evidence/phaseA/evolution.refute.md` | `5476fa1a52d1f3327110baca8d5cfb22e5a97b3831e2c96d71e7a9805d2f6189` |
| `docs/plans/v1.2-evidence/phaseA/external.en.md` | `ac93a971d76ab01a55c3353eef1a85c344288969f773a251b765377eba63a069` |
| `docs/plans/v1.2-evidence/phaseA/external.md` | `4ee5b88c2e1a97477e2abc1f6a95ce3748b167d7888e61b50ae361eea28fa642` |
| `docs/plans/v1.2-evidence/phaseA/harness.en.md` | `fd9fb7976fd47d177820d49b909dc1d915065aa150ccbb65d1cd23e34fb920f1` |
| `docs/plans/v1.2-evidence/phaseA/harness.md` | `5722e6de73f2ad3e80a6aa5692e21ee6a243b1fc1364e82d204dfb8e6539d169` |
| `docs/plans/v1.2-evidence/phaseA/harness.refute.en.md` | `75584a203d5ee7c31c06981266c00063ead48f4e367dfde528c05cc582785851` |
| `docs/plans/v1.2-evidence/phaseA/harness.refute.md` | `51d75fa10f2b301239c69ddfd008594092bf497cbc39e6d4e67ae2df7c16a307` |
| `docs/plans/v1.2-evidence/phaseA/hivemind.en.md` | `b979667fda2c974208b84786d402ad2755760afdb019f9e3aae92924e8eb0c43` |
| `docs/plans/v1.2-evidence/phaseA/hivemind.md` | `111a896e1e0ea7ffb3d84fa5b8f28b49ac8f3407323174ee698db8f963bcb2e8` |
| `docs/plans/v1.2-evidence/phaseA/hivemind.refute.en.md` | `4cd6d4edc84455aa3bc6584523150df631d0bcfcacd3f7fc5d9f2835a4e8dce1` |
| `docs/plans/v1.2-evidence/phaseA/hivemind.refute.md` | `977f68f68d419a9fcb3bc9ae894aef0bc8fcc2f8feb803373118c0f96e5ace4a` |
| `docs/plans/v1.2-evidence/phaseA/oss-drift-check-output.txt` | `fe8f52bf62a96569d1f7bc7618348c0b3561fcb80cdfeda85cbb9737ad25f708` |
| `docs/plans/v1.2-evidence/phaseA/release-oss.en.md` | `480f60ca3aac6af2d8e7389b1d83fd03bd4cf3e3761aa6d5ce91f3f4db85935f` |
| `docs/plans/v1.2-evidence/phaseA/release-oss.md` | `4632edd45a15325a71d3a39610aa80a10e9f3314376f5fce099e61349c30e2c3` |
| `docs/plans/v1.2-evidence/phaseA/repro-gepa-delta.mjs` | `4549e4c339e10546e653a16f1963366defc44898d0a6f123bee2bb0d682d0ffc` |
| `docs/plans/v1.2-evidence/phaseA/repro-harness.mjs` | `e997dce289ae11967679e0dfb44f5c0b65642ede8763af6993469cc599e851cc` |
| `docs/plans/v1.2-evidence/phaseA/repro-shadow.mjs` | `a0cba1cc3ed6448074e7f831c7d86d0d2d20556d6809ce7e661a6cc3ceb8eb7d` |
| `docs/plans/v1.2-evidence/phaseA/tiers-kvark.en.md` | `62e40398078beb5e7de394062ed6e04f7fbcb568ab30c8b37aa4148b81b23d07` |
| `docs/plans/v1.2-evidence/phaseA/tiers-kvark.md` | `89b3c0008c67f3ec0a9261bbbbb7ee40b18845a40984404e92538009c74cdec6` |
| `docs/plans/v1.2-evidence/phaseA/ux-model.en.md` | `c7c432248f58fdac3fef7336b5cfc43ea4cb1230c6c63188b8e16f15150aa011` |
| `docs/plans/v1.2-evidence/phaseA/ux-model.md` | `5744145ca6c84a32545745e3ba534411dbb2f583a2a993b1d86ea475c973fca4` |
| `docs/plans/v1.2-evidence/tools/check_backlog.mjs` | `43c67b14aee871e8d812ad45e09cc534abfd7fc8ce9040652c897382a97c68bd` |
| `docs/plans/v1.2-evidence/tools/check_trace.mjs` | `494cb94731ceb029912a61d155ef30c8313e5ddd1e39ca3b55048a6e19070814` |
| `docs/plans/v1.2-evidence/tools/manifest_hashes.mjs` | `a98e0a8820eeae99b6ef792e1a5474419e9645db647dd9551a233483f4979890` |
<!-- HASHES:END -->

---

## 4. Dokumentacione provere revizije 1.2.1

Provere su read-only i dokazuju samo konzistentnost dokumenata; nisu prolaz aplikacionih testova.

| Provera (iz korena repoa) | Rezultat 30.09.2026 |
|---|---|
| `node docs/plans/v1.2-evidence/tools/check_trace.mjs docs` | exit 0 · PRD definisano 167, pokriveno u FRD §16.1: 167 · FRD definisano 117, ugovori (§1–§14, bez mapa FRD-16.x) 115, pokriveno 115 · nema nedefinisanih referenci |
| `node docs/plans/v1.2-evidence/tools/check_backlog.mjs` | exit 0 · 130 redova, 79 unosa registra kapija · G1 29, G2 66, G3 35, INT 5 · bez ciklusa · scenariji S1–S8 OK (S9 potvrđuje nalaz H-06 za stari model) · 03 kartice odgovaraju CSV-u |
| `node docs/plans/v1.2-evidence/tools/manifest_hashes.mjs` | exit 0 · 121 fajl odgovara §3 (posle EN sinhronizacije, DOCX izvoza i `--write` 30.09.2026); skup fajlova jednak je `git diff --name-only 2af0904d fc0a7b3f` + novim fajlovima 1.2.1, bez ovog manifesta i njegovog engleskog para. Važi samo dok se nijedan fajl paketa ne izmeni |
| Ograničeni secret-scan | §1.2 |

Node `v22.23.2`. Raniji rezultati (29.09.2026: PRD 166/166, FRD 114/114) su u [HANDOFF-HISTORY](v1.2-evidence/HANDOFF-HISTORY.md) §7. Ako se posle ovog datuma izmeni PRD, FRD ili backlog, provere se ponavljaju i red se ažurira.

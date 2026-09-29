# v1.2 evidence — dokazi planskog prolaza (snapshot)

**Pregledana revizija koda:** `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`main`, 27.09.2026) · **Folder sastavljen:** 29.09.2026 · **Status:** snapshot, ne trenutna istina.

Ovaj folder čuva ulaze, nalaze i alate iz kojih je izveden planski paket Waggle v1.2 (`docs/Waggle_PRD_v1.2_DRAFT.md`, `docs/Waggle_FRD_v1.2_DRAFT.md`, `docs/plans/WAGGLE-*-v1.2.md`, `docs/plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md`, `docs/plans/SAFE-IMPLEMENTATION-CHECKLIST.md`, `docs/decisions/2026-09-27-ADR-01..10-*.md`, `docs/decisions/ADR-INDEX.md`). Svaka `path:line` referenca u ovim fajlovima važi za reviziju `2af0904d`, a ne za kasniji HEAD.

## Snapshot, ne trenutna istina

- Nalazi su tačni za reviziju `2af0904d` i za datum provere. Kod se od tada može promeniti. Pre nego što se nalaz upotrebi u PR-u, ponovo se proverava na aktuelnom HEAD-u (`docs/plans/SAFE-IMPLEMENTATION-CHECKLIST.md`).
- Spoljni podaci (GitHub, Hugging Face, Ollama, cene, ToS) su stanje servisa 27.09.2026, a ne svojstvo revizije. U paketu nose oznaku NALAZ AUDITA — ZA PROVERU.
- Folder nije release evidence. Receipts, installer heševi i verdikt za release žive samo u `docs/production-readiness/09-LAUNCH_RECOMMENDATION.md`.
- Founder odluke D-01..D-18 (brief §3) su zatvorene i ovaj folder ih ne otvara.
- Implementacija **nije odobrena**. Kodiranje počinje tek kada founder odobri delivery plan (`docs/plans/WAGGLE-DELIVERY-PLAN-v1.2.md`). Sav rad zatim ide po obaveznoj strategiji bezbedne implementacije iz `docs/plans/SAFE-IMPLEMENTATION-CHECKLIST.md`.

## Sadržaj

### `phaseA/` — revalidacija S1 audita po grupama (27.09.2026)

Faza A i refuter verdikti nadjačavaju S1 gde se razlikuju (`docs/plans/WAGGLE-AUDIT-DISPOSITION-v1.2.md` §0, „Autoritet statusa”). Rasponi ID-eva su preuzeti iz Delivery plana (Izvori, Phase-A nalazi) i FRD Izvora.

| Fajl | Grupa | ID-evi nalaza |
|---|---|---|
| `harness.md` | harness, verify faza, trace bridge, `run_harness` | F-HARN-01..09 |
| `evolution.md` | evolution, persona override, GEPA | F-EVO-01..12 |
| `durable.md` | durable runs i rutine | F-DUR-01..14 |
| `hivemind.md` | memorija, RAWDETAIL, hooks | F-HM-01..18 |
| `capability.md` | capability/konektori, OAuth, approvals | F-CAP-01..13 |
| `ux-model.md` | UX model, model gate, managed Ollama | F-UXM-01..15 |
| `tiers-kvark.md` | tiers, Stripe, KVARK, worker | F-TK-01..19 |
| `release-oss.md` | ancestry i release evidence, licence/SBOM/notices, release workflow i CI, cene, benchmark grana, OSS gate | F-REL-01..12 |
| `external.md` | spoljna istraživanja: Qwen/Ollama/HF (§1), agent-native i Omnigent (§2), durable kandidati (§3), benchmark evidence cards (§4), kanali i ToS (§5), cene (§6), otvoreno (§7), registar izvora (§8) | EXT-1..12 |

**Refuter fajlovi** (skeptični prolaz nad nalazima sa statusom POTVRĐENO NA REVIZIJI; verdikti HOLDS / WEAKENED / REFUTED):

| Fajl | Ishod (Delivery plan, Izvori) |
|---|---|
| `harness.refute.md` | 7/7 HOLDS, 2 WEAKENED na nivou minimalChange |
| `evolution.refute.md` | F-EVO-09 WEAKENED |
| `durable.refute.md` | F-DUR-02/06/10/12/14 WEAKENED; F-DUR-10 novi nalaz ZA PROVERU |
| `hivemind.refute.md` | F-HM-02/05/06 WEAKENED |

**Ostali fajlovi u `phaseA/`:**

- `oss-drift-check-output.txt` — pun izlaz `node scripts/oss-drift-check.mjs D:/Projects/hive-mind` (F-REL-07): PARITY 5, REVIEWED ADAPTATIONS 36, KNOWN REVIEWED BLOCKERS 22, UNREVIEWED DIFFERENCES 3, FORBIDDEN EXPORTS 0, exit 1. Prva dva reda beleže kanonsko stablo `2af0904d` i OSS checkout `77c6dd7f8c36e333f2de859e4f4d7818b03e667a`.
- `repro-harness.mjs`, `repro-shadow.mjs`, `repro-gepa-delta.mjs` — repro skripte (odeljak „Pokretanje” ispod).
- `critic-r2-estimates.json` — 11 nalaza drugog kritičkog kruga (HIGH/MED/LOW) nad procenama u `WAGGLE-DELIVERY-PLAN-v1.2.md`. Istorijski zapis: polje `file` i dalje pokazuje na staru putanju u planerskom radnom prostoru, a brojevi linija važe za tadašnju verziju plana.

### `inputs/` — ulazi planskog prolaza

Kopije su bajt-identične originalima (provereno `cmp` 29.09.2026): četiri `.md` fajla sa fajlovima koje je planski prolaz koristio, a dva `.docx` sa netrackovanim fajlovima u `D:/Projects/waggle-os/docs/`. Zato reference na brojeve linija ostaju važeće.

| Fajl | Šta je | Staro ime u planerskom radnom prostoru |
|---|---|---|
| `Waggle_Planner_Brief_v1.0_2026-09-27.md` | founder brief (D-01..D-18 u §3, DIR-xx, AT-01..30) | `BRIEF.md` |
| `S1-audit-2026-09-27.md` | S1 audit, kopija (original: `procitaj-d-projects-waggle-os-docs-waggl-rustling-milner-agent-ac748482c5af17ddf.md`, SHA-256 u brief §22) | `S1_AUDIT.md` |
| `Waggle_PRD_v1.1_2026-09-27.md` | tekstualni ekstrakt PRD v1.1 | `PRD.md` |
| `Waggle_FRD_v1.1_2026-09-27.md` | tekstualni ekstrakt FRD v1.1 | `FRD.md` |
| `Waggle_PRD_v1.1_2026-09-27.docx`, `Waggle_FRD_v1.1_2026-09-27.docx` | originalni DOCX v1.1 | — |

### `tools/` — mehanička provera

- `check_trace.mjs` — proverava pokrivenost PRD ↔ FRD u FRD §16.1: svaki definisan `PRD-SS-NN` i svaki FRD ugovor (§1–§14, bez mapa FRD-16.1/16.2) mora imati red u §16.1, a nijedan referisan ID ne sme biti nedefinisan. Exit 1 kada nešto fali.

## Pokretanje (read-only)

Sve komande se pokreću iz korena repoa. Ne zahtevaju `npm install`/`npm ci` i nemaju mrežne pozive.

**1. Provera pokrivenosti PRD ↔ FRD**

```bash
node docs/plans/v1.2-evidence/tools/check_trace.mjs            # podrazumevano čita docs/
node docs/plans/v1.2-evidence/tools/check_trace.mjs <docsDir>  # drugi direktorijum sa PRD/FRD v1.2 .md
```

Skripta samo čita dva `.md` fajla. Izlaz 29.09.2026, posle normalizacije putanja:

```text
PRD defined: 166; covered in §16.1: 166
PRD missing: (none)
FRD defined: 116; contracts (§1–§14, minus FRD-16.x maps): 114; covered in §16.1: 114
FRD contracts missing: (none)
FRD referenced but not defined: (none)
PRD referenced but not defined: (none)
```

**2. Repro skripte (`phaseA/repro-*.mjs`)**

Skripte uvoze već izgrađene ESM module iz `D:/Projects/waggle-os/packages/agent/dist` (putanja je upisana u konstantu `DIST`). One ne grade ništa i ne pokreću testove. Uslovi:

- `dist` mora biti izgrađen sa revizije `2af0904d`. Dokaz je koristio `dist` izgrađen 27.09.2026 u 05:27 i proverio da odgovara `src` na citiranim linijama (`harness.md`, `evolution.md`). Gradnja `dist`-a (`npm run build:packages`) piše u repo i nije deo read-only pokretanja. Sa drugim `dist`-om rezultat se ne poredi sa ovim snapshot-om.
- Node `22.23.2` (verzija iz dokaza).
- `repro-shadow.mjs` pravi privremeni direktorijum `shadow-*` pored sebe i briše ga na kraju. Zato se sve tri skripte kopiraju u privremeni direktorijum van repoa i pokreću odatle. Tako `docs/` ostaje netaknut. Ako je checkout na drugoj putanji, menja se `DIST` u kopiji, a ne u fajlu dokaza.

```bash
tmp="$(mktemp -d)"
cp docs/plans/v1.2-evidence/phaseA/repro-*.mjs "$tmp"/
node "$tmp/repro-harness.mjs"
node "$tmp/repro-shadow.mjs"
node "$tmp/repro-gepa-delta.mjs"
```

| Skripta | Pokriva | Zabeležen ishod na `2af0904d` (POTVRĐENO NA REVIZIJI u fazi A) |
|---|---|---|
| `repro-harness.mjs` | F-HARN-01..08 (tvrdnje 01a–08b) | `25/25 repro assertions hold on 2af0904d` (`harness.md` §0) |
| `repro-shadow.mjs` | F-EVO-01 (evolved persona override zasenčen ugrađenom personom) | `listPersonas()` ima 2 stavke sa `id=coder`; `resolvePersona('coder')` ne sadrži `EVOLVED` (`evolution.md`, F-EVO-01) |
| `repro-gepa-delta.mjs` | (a) F-EVO-06, (b) F-EVO-07, (c) F-EVO-05 | (a) `history[0].score.n = 50`, `winner.score.n = 400`, `delta = 0.2660` naspram `0.2500` na istom uzorku; (b) tajna iz traga stiže do judge-a; (c) `frozenSchema` nema kanal do Stage 2 (`evolution.md`) |

Komentar u zaglavlju `repro-harness.mjs` („Run from the scratchpad”) je istorijski. Današnji ekvivalent je privremeni direktorijum iz koraka iznad.

**3. OSS drift provera**

```bash
node scripts/oss-drift-check.mjs D:/Projects/hive-mind
```

Traži lokalni checkout `marolinik/hive-mind`. Faza A ju je pokrenula read-only i `git status` monorepoa je posle toga bio nepromenjen (`release-oss.md` F-REL-07). Rezultat zavisi od stanja oba stabla, pa novi izlaz nije poređenje sa `oss-drift-check-output.txt` osim na istim revizijama.

**4. Ciljani testovi iz `tiers-kvark.md`**

Faza A je pokrenula 8 test fajlova (144 testa, svi zeleni) u privremenom direktorijumu, pod Node `v22.23.2` (`tiers-kvark.md` §0). To nije skripta ovog foldera. Ponovno pokretanje je izvršavanje testova i ne spada u read-only proveru dokaza.

## Mapa starih putanja

Planski paket je nastao u privremenom planerskom radnom prostoru jedne sesije (Temp scratchpad). Putanje u novim v1.2 fajlovima su 29.09.2026 prevedene na raspored repoa:

| Stara putanja | Nova putanja |
|---|---|
| `scratchpad/phaseA/<f>`, `phaseA/<f>` | `docs/plans/v1.2-evidence/phaseA/<f>` |
| `scratchpad/out/Waggle_*_v1.2_DRAFT.*`, `out/Waggle_*` | `docs/Waggle_*_v1.2_DRAFT.*` |
| `scratchpad/out/plans/<f>`, `out/plans/<f>` | `docs/plans/<f>` |
| `scratchpad/out/decisions/<f>`, `out/decisions/<f>` | `docs/decisions/<f>` |
| `out/` (direktorijum nacrta) | `docs/` |
| `scratchpad/BRIEF.md`, `BRIEF.md` | `docs/plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md` |
| `scratchpad/S1_AUDIT.md`, `S1_AUDIT.md` | `docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md` |
| `scratchpad/PRD.md`, `PRD.md` / `scratchpad/FRD.md`, `FRD.md` | `docs/plans/v1.2-evidence/inputs/Waggle_PRD_v1.1_2026-09-27.md` / `…/Waggle_FRD_v1.1_2026-09-27.md` |
| `v12-planning-staging/tools/check_trace.mjs` | `docs/plans/v1.2-evidence/tools/check_trace.mjs` |

Napomene uz mapu:

- U nabrajanjima fajlova faze A samo prvi fajl nosi punu putanju. Ostala gola imena (`harness.refute.md`, `repro-shadow.mjs`, `external.md §8`, `oss-drift-check-output.txt`) su u `docs/plans/v1.2-evidence/phaseA/`.
- Namerno nije menjano: stvarna putanja postojećeg worktree-ja `deps/ax-24` (`…/8db10e0b-c6fd-4d3a-bab5-7057d1ef54ad/scratchpad/wt202`, u Delivery planu i u checklisti), jer je to činjenica o okruženju; opis problema u redu `ADR-INDEX.md` u `WAGGLE-V1.2-OPEN-LOW-FINDINGS.md`, koji citira stare putanje kao nalaz; `critic-r2-estimates.json` i komentar u `repro-harness.mjs`, koji su istorijski zapisi.
- U fajlovima faze A (`evolution.md`, `harness.md`, `hivemind.md`, `release-oss.md`) promenjene su samo putanje i reč „scratchpad”. Nalazi, statusi i brojevi su isti kao 27.09.2026.

# Faza A — revalidacija grupe `release-oss` na reviziji `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`

Datum provere: 2026-09-27. Repo `D:/Projects/waggle-os` je tretiran kao read-only. `git status --porcelain` na početku i na kraju: samo dva untracked `.docx` fajla (`docs/Waggle_FRD_v1.1_2026-09-27.docx`, `docs/Waggle_PRD_v1.1_2026-09-27.docx`) — working tree == HEAD za sve citirane fajlove. `HEAD == origin/main == 2af0904d` (0 ahead / 0 behind).

Statusi po BRIEF §2.2. Sve `path:line` reference su na reviziji `2af0904d`, osim gde je eksplicitno navedeno „live GitHub konfiguracija (27.09.2026)” — to je stanje servisa, ne repoa.

Pokriveni S1 nalazi: spot-check „618/560 komita, 360 runtime fajlova”, C22, A1, A28, A29, red „OSS gate”, W8 (release deo), W3 (deo o grani `feature/harness-sota-bench`), plus C5 premisa („private repo”) jer direktno menja OSS gate.

---

## 0. Kratak rezime (za pisce)

| ID | Tvrdnja S1 | Status | Jedna rečenica |
|---|---|---|---|
| F-REL-01 | C22 doc drift (e4bf403e/b07a6173 vs c4e6a515; b07a6173 nije predak) | POTVRĐENO NA REVIZIJI (+ novi drift) | Sve tri revizije su tačno tako imenovane; `b07a6173` je GitHub-ov PR test-merge komit (isti tree kao `e4bf403e`), a 09-LAUNCH/README tvrde da PR #83 „nije merge-ovan” iako jeste (`44baa77d`, 2026-09-09). |
| F-REL-02 | Spot-check: main je 618/560 komita iza kandidata, 360 runtime fajlova, nema carry-forward | POTVRĐENO (brojevi 618/560), DELIMIČNO (360) | 355 fajlova ukupno od `e4bf403e`, od toga 116 non-test runtime izvora i 41 na pokrivenim površinama (chat/persona/memory/routing) — zaključak „nema carry-forward” stoji. |
| F-REL-03 | A1 receipts po wave-u (installer 64/64, router, persona 30, 3 auth canary, crash-injection) | DELIMIČNO/NEPOVEZANO | Alati za 4 od 5 receipt-a postoje; router i auth-canary skripte nemaju ni npm ni CI pozivaoca; crash-injection receipt alat NIJE NAĐEN; procena „3–4 dana” NEPOZNATO. |
| F-REL-04 | A28 SBOM + THIRD_PARTY_NOTICES; native binarije bez license teksta | POTVRĐENO NA REVIZIJI | Nema nijednog SBOM/THIRD_PARTY fajla; `bundle-native-deps.mjs` kopira samo binarije; `onnxruntime-node` i `sqlite-vec-windows-x64` npm paketi uopšte nemaju LICENSE fajl; certify proverava samo `NODE-LICENSE` i npm `LICENSE`. |
| F-REL-05 | A28 „CI audit je continue-on-error” + OSS gate „license CI (npm+cargo)” | POTVRĐENO (npm audit) / NIJE NAĐENO (license CI) | `ci.yml:108-110` `npm audit` je `continue-on-error: true`; nikakav license check ne postoji ni u jednom workflow-u ni u `package.json` skriptama. |
| F-REL-06 | A29 `cost-tracker.ts:28` Opus 4.8 $15/$75 vs $5/$25 na grani | POTVRĐENO NA REVIZIJI (šire nego S1) | Zvanična cena (platform.claude.com, 27.09.2026): Opus 4.8/4.7/4.6 = $5/$25, Sonnet 5 = $2/$10; main precenjuje 4 reda (3×/1.5×), fallback i test zaključavaju pogrešnu vrednost; grana je takođe pogrešna za 4.7; tabela ulazi u hard daily budget (product impact). |
| F-REL-07 | OSS gate: `oss-drift-check.mjs` stanje | POTVRĐENO (postoji i radi) / NALAZ — ZA PROVERU | Pokrenut read-only: exit 1, 22 known blockers, **3** unreviewed (2 BASELINE-DRIFT + `harvest/raw-turns.ts`), 0 forbidden; 09-LAUNCH:104-105 kaže „one unreviewed”. |
| F-REL-08 | C5/OSS gate: „private repo”, „licensing decision is the blocker” | DELIMIČNO/NEPOVEZANO (premisa zastarela) | Repo `marolinik/waggle-os` je **PUBLIC** (autentifikovani i neautentifikovani API), root MIT; ali `packages/optimizer/LICENSE` i `packages/weaver/LICENSE` kažu „proprietary and confidential” uz `"license": "MIT"` u package.json; 3 hive-mind NOTICE fajla proglašavaju agent/evolution/vault/tiers/Tauri/WaggleDance vlasničkim i referišu nepostojeći `EXTRACTION.md`; 9 workspace manifesta bez `license` polja. |
| F-REL-09 | W8 `release.yml` signing chain, guardovi, `WINDOWS_PUBLIC_RELEASE_AUTHORIZED`, `production` env | POTVRĐENO (kod) / NALAZ — ZA PROVERU (live config) | Chain i guardovi postoje i fail-closed su; live: var `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` nije definisan (publish blokiran), `production` env postoji bez protection rules, `main` bez branch protection/rulesets, secret scanning i push protection isključeni na javnom repou, `v*` glob hvata i istorijske ne-release tagove (5 propalih runova). |
| F-REL-10 | W8/CI: `ci.yml` branch filter bez `integration/**` | POTVRĐENO NA REVIZIJI | `ci.yml:3-6` samo `[main]`; nijedna `integration/*` grana ne postoji na origin-u, pa je danas bez posledica, ali plan sa integration granama ne bi imao CI. |
| F-REL-11 | W8 Authenticode + Deep Security kao spoljne kapije | NEPOZNATO / POTVRĐENO (otvoreno) | Nijedan signed artefakt, nijedan „Codex Security” workflow u repou ni registrovan dinamički; code scanning `not-configured`. |
| F-REL-12 | W3 grana `feature/harness-sota-bench` (2022 komita stale; rebase) | POTVRĐENO (2022 / 66) + inventar za cherry-pick | 66 komita, 121 fajl, +21435/−4; 117 A-fajlova odsutno na main (aditivno); konflikt siguran samo za `cost-tracker.ts` (+ test) — ne rebase-ovati, preskočiti `fe7804bf`. |

---

## 1. Ancestry i release evidence

### F-REL-01 — C22: doc drift oko kandidata (POTVRĐENO NA REVIZIJI + dodatni drift)

**S1 tvrdnja (C22, L47):** „launch record names e4bf403e / b07a6173, CLAUDE.md names c4e6a515, and b07a6173 is not an ancestor of main.”

**Commit pregledan:** `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (2026-09-27T05:08:21+02:00).

**Putanje/simboli i ulaz → izlaz:**

| Provera | Komanda (read-only) | Izlaz |
|---|---|---|
| `c4e6a515…` predak HEAD-a? | `git merge-base --is-ancestor c4e6a5157310876215d20c5e5f059f26ea1f4ba4 HEAD` | **DA**; `git rev-list --count c4e6a515..HEAD` = **618**; datum 2026-09-07 „fix(build): patch Tauri browser metadata” |
| `e4bf403e` predak? | isto | **DA**; `rev-list --count e4bf403e..HEAD` = **560**; 2026-09-09 „test(personas): adjudicate grounded Qwen responses” |
| `b07a6173` predak? | isto | **NE**; `merge-base b07a6173 HEAD` = `e4bf403e`; `rev-list --count HEAD..b07a6173` = 1; komit je `Merge e4bf403e… into 1d25361d…` (2026-09-09) — sintetički PR test-merge |
| Tree jednakost | `git rev-parse 'e4bf403e^{tree}' 'b07a6173^{tree}'` | oba `5a42a0b9ad0937408fafc8180ad6738b6bd16bce` — identično onome što 09-LAUNCH:18,21 navodi |
| Odnos c4e6a515 ↔ e4bf403e | `git merge-base --is-ancestor c4e6a515 e4bf403e` | DA; 58 komita između |
| Ko imenuje šta | `CLAUDE.md:89` → `c4e6a515…` („current controlled-internal-test candidate”); `docs/production-readiness/09-LAUNCH_RECOMMENDATION.md:17` → `e4bf403e…`, `:19-20` → `b07a6173…`; `README.md:19-21` → e4bf403e + b07a6173 |
| Status PR #83 | `gh pr view 83 --json state,mergedAt` | **MERGED 2026-09-09T20:28:43Z**, head `4f7901e8` (predak main-a; to je i poslednji komit koji je menjao 09-LAUNCH: „docs(release): seal Windows Solo pilot evidence”); merge komit `44baa77d Merge pull request #83 …` |
| Šta dokumenti tvrde | `09-LAUNCH:22` „pushed private draft PR #83; mergeable, not merged to private main”; `README.md:19-20` „has not been merged to private main” | **zastarelo** — PR je merge-ovan istog dana kad je doc zapečaćen |

**Trenutni izlaz:** tri dokumenta imenuju tri različite revizije za „kandidata”, a jedan od njih (`b07a6173`) po konstrukciji nikad ne može biti predak `main`-a (to je `refs/pull/83/merge`). Zbunjujuće, ali **nije protivrečnost u kodu**: `b07a6173` i `e4bf403e` su isti tree.

**Repro/limit:** git komande gore; nema testa. Datum kad je repo postao javan nije utvrđen (nema `PublicEvent` u poslednjih 100 event-a).

**Očekivano:** jedan autoritativni zapis (BRIEF §15.4, C22 „PRIHVATITI”): runtime `e4bf403e` (tree `5a42a0b9`), merge-ovan preko `44baa77d`; `b07a6173` opisan kao PR test-merge sa istim tree-jem, ne kao „PR merge candidate used by packaging”; `c4e6a515` kao stariji predak bez sopstvenog važenja; i eksplicitno „nijedan receipt ne pokriva `2af0904d`”.

**Najmanja promena:** doc-only update `09-LAUNCH_RECOMMENDATION.md` (§Frozen candidate, §Test evidence), `CLAUDE.md` §1 (linija 84 „remains private” i 89), `AGENTS.md:68`, `README.md:19-21,110,118`. Bez promene runtime-a. **Povezani AT:** AT-30.

### F-REL-02 — spot-check: razmak komita i broj runtime fajlova (POTVRĐENO / DELIMIČNO)

**S1 (L18):** „main `2af0904d` is 618 commits past c4e6a515 and 560 past e4bf403e, with 360 runtime files changed. No receipt can be carried forward.”

- 618 i 560: **tačno reprodukovano** (gore).
- „360 runtime files”: `git diff --name-only e4bf403e HEAD | wc -l` = **355** (od `c4e6a515`: 405). Od tih 355, non-test izvori pod `packages/*/src`, `sidecar/`, `app/src-tauri/`, `apps/web/src/`, `scripts/` = **116**; od njih na pokrivenim receipt površinama (chat/persona/router/provider/memory/orchestrator/tool-context/llm/proxy/auth/budget/cost) = **41**, uključujući `packages/server/src/local/routes/chat.ts`, 30+ `chat-*.ts` modula (TD-CHAT-3 ekstrakcija), `packages/agent/src/orchestrator.ts`, `memory-*.ts`, `persona-tool-filter.ts`, `routes/personas.ts`, `routes/litellm.ts`, `routes/memory.ts`, `evolution-llm-wiring.ts`.
- **Zaključak S1 stoji:** persona/router/auth/installer receipts vezani za `e4bf403e`/`b07a6173` ne pokrivaju `2af0904d`; bounded no-impact attestation po CLAUDE.md §1 nije moguća jer su chat, persona, memory i routing površine promenjene.

**Najmanja promena:** nema promene koda; u planu zameniti „360 runtime files” sa „355 fajlova, 116 runtime izvora, 41 na pokrivenim površinama” i zahtevati novi kandidat SHA + fresh receipts. **AT:** AT-30.

### F-REL-03 — A1: receipt alati po freeze-u (DELIMIČNO/NEPOVEZANO)

**S1 (A1, L54):** „Each freeze costs about 3-4 days of evidence: installer 64/64, router, 30-result persona set, 3 auth canaries, plus a crash-injection receipt.”

| Receipt | Alat na `2af0904d` | Pozivaoci (grep) | Status |
|---|---|---|---|
| Installer (64/64) | `scripts/certify-windows-installer.ps1` (3422 linije) | `.github/workflows/release.yml:1884,1900`; `tauri-build-pr.yml:202`; `CLAUDE.md:298`; `AGENTS.md:274` | POTVRĐENO postoji i povezan |
| Router | `scripts/qualify-smart-router.ts` + `qualify-smart-router.test.ts` | nijedan `package.json` script, nijedan workflow | postoji, **nepovezan** (ručno) |
| Persona 30/30 | `scripts/seal-persona-acceptance.ts` (`npm run persona:seal`, `package.json:48`), `tests/vision/persona-acceptance-seal.ts`, `persona-scorer.ts`, `personas.spec.ts`, `scripts/persona-reactor-workflow.mjs` | npm script | postoji, ručno |
| 3 auth canary | `scripts/test-windows-official-auth-canaries.ps1` (param `-ExpectedHead ^[0-9a-f]{40}$`, `-ReceiptDir`, `-ClaudeModel`, `-CodexModel`) | nijedan workflow/npm caller | postoji, **nepovezan** |
| Crash-injection receipt | `git grep -l -i "crash.injection" -- ':!docs'` → **ništa**; postoje unit testovi sa kill/recovery (`packages/agent/tests/long-task-recovery.test.ts`, `long-task-checkpoint.test.ts`, `sidecar-owned-process.test.ts`) ali nema receipt-a nad packaged installer-om | — | **NIJE NAĐENO** (provereno po sposobnosti: `crash`, `SIGKILL`, `process.kill(`) |
| Receipt izlazi | `output/` je gitignore-ovan (`.gitignore:227`), 0 tracked fajlova | — | receipti žive van repoa; hash-evi samo u 09-LAUNCH |

**Trenutni izlaz:** freeze zahteva ≥3 ručna pokretanja (router, canary, persona) + CI certify; „3–4 dana” je procena bez merenja u repou → NEPOZNATO.

**Očekivano (BRIEF §15.4, A1 „PRIHVATITI UZ BATCHING”):** lista pokrivenih površina po wave-u i broj freeze-ova izведен iz zavisnosti; crash-injection na packaged Windows kandidatu (§15.4 eksplicitno).

**Najmanja promena:** (1) npm/pwsh entry-point za router i canary skripte (bez promene logike); (2) crash-injection korak u `certify-windows-installer.ps1` ili zasebna receipt skripta — novi posao, ne postojeći; (3) receipt manifest koji pinuje SHA. **AT:** AT-07, AT-30.

---

## 2. Licence, SBOM, notices

### F-REL-04 — A28: SBOM, THIRD_PARTY_NOTICES, native binarije (POTVRĐENO NA REVIZIJI)

**S1 (A28, L125):** „SBOM plus aggregated THIRD_PARTY_NOTICES, checked by `certify-windows-installer.ps1`. Native binaries (onnxruntime, sqlite-vec) currently ship without license text. Model weights and the Ollama runtime go in the provenance inventory.”

**Ulaz → izlaz:**

- `git ls-files | grep -iE "(LICENSE|NOTICE|THIRD[_-]PARTY|SBOM)"` → root `LICENSE` (MIT), `vendor/pptxgenjs/LICENSE`, po-paket LICENSE za 13 `hive-mind-*` + `memory-mcp`, `optimizer`, `weaver`; NOTICE samo u `hive-mind-cli`, `hive-mind-mcp-server`, `hive-mind-wiki-compiler`. **Nema** `THIRD_PARTY_NOTICES*`, **nema** SBOM (`git grep -il "cyclonedx|spdx|\bsbom\b|syft"` pogađa samo docs/marketplace sync koji čita GitHub `license.spdx_id`).
- `scripts/bundle-native-deps.mjs:113-130` kopira `better_sqlite3.node`, `vec0.dll`, `onnxruntime-node/bin/napi-v3/<os>/<arch>/*` — **nijedan** LICENSE/NOTICE.
- `node_modules/onnxruntime-node@1.21.0` (`"license": "MIT"`) i `node_modules/sqlite-vec-windows-x64@0.1.9` (`"license": "MIT OR Apache"`) **ne sadrže LICENSE fajl** u npm paketu (`ls` → samo README/package.json/bin/dist/lib); `better-sqlite3@12.6.2` ima `LICENSE`. Dakle čak i `stage-sidecar-deps.mjs` (koji „third-party packages retain their published runtime layout”, `:16-18`) ne može da isporuči tekst licence za onnxruntime i sqlite-vec — mora se generisati iz upstream izvora.
- `scripts/certify-windows-installer.ps1:2596-2600` proverava samo `NODE-LICENSE` i `node_modules\npm\LICENSE` u bundled Node runtime-u; **nema** provere third-party notices.
- `app/src-tauri/tauri.conf.json` `bundle` nema `licenseFile`; `resources` = `resources/*`, `resources/native/*`, `resources/native/onnxruntime/*`, `resources/node_modules/**/*`.
- Provenance modela/runtime-a: `packages/server/src/local/managed-ollama-runtime.ts:28-29` (`OLLAMA_TARGET_VERSION='0.32.3'`, rollback `0.32.0`), `:160-184` pinovi `url` + `sha256` po platformi; managed model digest u receipt-u (`09-LAUNCH:47-48`). Postoji **u kodu**, ne kao inventar dokument.
- `docs/production-readiness/04B-SECRETS_DEPS.md` i `docs/TECH-DEBT.md`: nula pogodaka za `licen|sbom|notice|third.party` (osim reči „licence” u drugom smislu) → dug nije ni evidentiran.

**Repro/limit:** nije pravljen installer (zabranjeno); zaključak o sadržaju paketa je iz build skripti + certify provera, ne iz rastavljenog `.exe`.

**Očekivano (BRIEF §12.3, A28 „PRIHVATITI”, FRD FR-OSS-04/-11, AT-30 „notices”):** SBOM + agregirani notices koji odgovaraju stvarno isporučenom paketu; certify proverava njihovo prisustvo; inventar (repo/version/commit/hash/licenca) uključuje Node, npm, onnxruntime, sqlite-vec, better-sqlite3, Ollama zip + model weights.

**Najmanja promena:** (1) generator notices-a nad `resources/node_modules` closure-om + ručni unosi za onnxruntime/sqlite-vec/Ollama/model; (2) `bundle-native-deps.mjs` da uz binarije stavi LICENSE tekst; (3) jedna `Assert-True` grupa u certify za `THIRD_PARTY_NOTICES` i SBOM; (4) inventar fajl (FRD FR-OSS-04). Napomena: promena notices-a menja installer SHA → nova certifikacija (S1 OSS gate red, tačno). **AT:** AT-30.

### F-REL-05 — A28 „CI audit blocking” / OSS gate „license CI” (POTVRĐENO / NIJE NAĐENO)

- `.github/workflows/ci.yml:108-110`: `Security audit (informational)` → `npm audit --audit-level=high` sa `continue-on-error: true` — **POTVRĐENO** kako S1 kaže.
- `ci.yml:154` `continue-on-error: true` na `e2e` (advisory po dizajnu, komentar `:112-119`) — ne tiče se licenci.
- License CI: `rg -il "licen|sbom|cargo (audit|deny)|licensee|license-checker" .github/workflows/` → **nijedan** pogodak (prvobitni `-l` pogodak u `ci.yml` bio je na reč „audit”); `git ls-files | grep -iE "deny.toml|about.toml|license-checker|licensee"` → ništa; root `package.json` skripte bez `licen|sbom` (samo `"license": "MIT"` na `:51`). **NIJE NAĐENO** ni za npm ni za cargo.
- Dependabot: `.github/dependabot.yml` postoji (verzije), ali live `dependabot_security_updates: disabled`.

**Najmanja promena:** novi CI korak (blocking) za license allowlist nad `npm ls --json --omit=dev` i `cargo` (npr. `cargo-deny`/`cargo-about`) — alat po Build-vs-Borrow zapisu (BRIEF §14), ne odabran ovde. `npm audit` može ostati advisory ili postati blocking po odluci; S1 traži blocking. **AT:** AT-30.

### F-REL-08 — C5 premisa i licencna konzistentnost (DELIMIČNO/NEPOVEZANO; NALAZ AUDITA — ZA PROVERU)

**S1 (C5, L30):** „‘Free/open-source for individuals’ vs a private repo … `hive-mind-cli/NOTICE` declaring the agent runtime, evolution and traces proprietary … while the repo is private, GitHub attestation and `publish-windows` are disabled.”

**Live provera (27.09.2026, nije stanje repoa):**
- `gh api repos/marolinik/waggle-os` → `private:false, visibility:"public", license:"MIT"`; neautentifikovani `curl https://api.github.com/repos/marolinik/waggle-os` → HTTP 200, `"private": false`. **Repo je javan.** `marolinik/hive-mind` takođe public, Apache-2.0.
- Posledica za `release.yml`: `attest-windows` uslov `github.event.repository.private == false` (`:2058`) je sada **istinit**; `publish-windows` (`:2210-2213`) i dalje traži `vars.WINDOWS_PUBLIC_RELEASE_AUTHORIZED == 'true'`, koji **nije definisan** (`gh variable list` → samo `AZURE_CLIENT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_TENANT_ID`). S1 rečenica „attestation … disabled while private” više ne važi za attest, važi za publish preko var-a.

**Stanje na reviziji `2af0904d`:**
- `LICENSE` (root) = MIT, `package.json:51` `"license": "MIT"`, `README.md:190-194` „MIT except hive-mind-* = Apache-2.0”.
- `packages/optimizer/LICENSE` i `packages/weaver/LICENSE`: „Copyright (c) 2026 Marko Markovic. All rights reserved. This software is proprietary and confidential…” (oba iz `01076b75`, 2026-03-26), dok `packages/optimizer/package.json` i `packages/weaver/package.json` kažu `"license": "MIT"` → **interna protivrečnost na javnom repou**.
- `packages/hive-mind-cli/NOTICE:12-21` (identično u `hive-mind-mcp-server/NOTICE`, `hive-mind-wiki-compiler/NOTICE`): „intentionally NOT part of this distribution and remain proprietary to Egzakta Group: compliance/*, packages/agent/*, self-evolution engine…, vault, tier/billing, Tauri shell and web UI, WaggleDance…” i „See EXTRACTION.md in the repository root” — `EXTRACTION.md` **ne postoji** u ovom repou (postoji u `D:/Projects/hive-mind/EXTRACTION.md`). Tekst je pisan za mirror, ali se isporučuje i iz ovog (sada javnog, MIT) repoa.
- Bez `license` polja: `packages/admin-web`, `packages/server`, `packages/shared`, `packages/waggle-dance`, `packages/worker`, `apps/web`, `apps/www`, `app`, `sidecar` (9 manifesta).
- `CLAUDE.md:84`, `AGENTS.md:68`, `README.md:110,118`: „repository remains private until an explicit open-source and licensing decision is made” — **zastarelo**.
- `.gitignore:288` ignoriše `AI API KEYS.txt`; fajl ne postoji u working tree-ju (ranija memorija o riziku je zatvorena).

**Očekivano (D-01, BRIEF §12.3, §20.3 „Licencna realizacija” ostaje otvorena):** jedna odluka o ownership-u i finalnim tekstovima; NOTICE/LICENSE bez protivrečnosti; publication mehanika zabeležena prema stvarnom stanju (public), ne prema snapshotu S1.

**Najmanja promena:** doc/licence fajlovi samo — ne menjati tuđe licence; ne otvarati D-01. Ovo je **decision-queue stavka**, ne implementacija. **AT:** AT-30 (notices).

### F-REL-07 — OSS gate: `scripts/oss-drift-check.mjs` (POTVRĐENO postoji / NALAZ — ZA PROVERU)

- `scripts/oss-drift-check.mjs` (570 linija) + `scripts/oss-drift-baseline.json` (schemaVersion 1): `parityPaths` 5, `intentionalAdaptations` 38, `knownReviewedBlockers` 22, `unreviewedDifferences` 1 (`harvest/raw-turns.ts`), `forbiddenExports.paths` = `mind/evolution-runs.ts`, `mind/execution-traces.ts`, `mind/improvement-signals.ts`; `pathPrefixes` `vault.ts`, `compliance/`, `governance/`; markeri `install_audit`/`ai_interactions` u `mind/db.ts`/`mind/schema.ts` (`:22-36`).
- Pozivaoci: samo dokumentacija (`CLAUDE.md` §7.5, `AGENTS.md`, `packages/hive-mind-core/CONTRIBUTING.md`, `README.md`, `docs/ARCHITECTURE.md`) — **nije u CI**, ručna kapija pre OSS release-a.
- **Read-only pokretanje** `node scripts/oss-drift-check.mjs D:/Projects/hive-mind` (checkout na grani `fix/mcp-shutdown-before-init` = `origin/master` `34103278` + 1 komit koji dira samo `packages/mcp-server/src/core/*`, ne dodiruje tri sporna fajla): **exit 1**; KNOWN REVIEWED BLOCKERS 22; **UNREVIEWED DIFFERENCES 3** — `BASELINE-DRIFT harvest/url-egress-guard.ts` i `BASELINE-DRIFT mind/transformers-model-load.ts` (reviewed adaptation bytes changed) + `harvest/raw-turns.ts`; FORBIDDEN EXPORTS 0. Pun izlaz: `docs/plans/v1.2-evidence/phaseA/oss-drift-check-output.txt`. `git status` monorepoa posle pokretanja nepromenjen.
- `09-LAUNCH:104-105`: „still reports reviewed blockers and one unreviewed difference” → sada 3 (dva su drift kanonskog stabla od baseline-a, tj. promene u monorepou od 2026-08-27 koje niko nije re-baseline-ovao).
- `mind-parity-check.yml` / `sync-mind.yml` — deprecated, trigger paths `packages/core/src/mind/**` ne postoje (potvrđeno `:33-37`, `sync-mind.yml:52-53`) — kao u CLAUDE.md §7.5.

**Očekivano:** pre bilo kog OSS release-a: reconcile 22 blockera ili re-baseline uz maintainer review; 3 unreviewed moraju biti klasifikovani. Ne blokira Windows Solo kandidat (isti zaključak kao 09-LAUNCH), ali blokira sledeći hive-mind paket.

**Najmanja promena:** review + `oss-drift-baseline.json` update (maintainer), opcioni CI job koji pokreće checker nad svežim clone-om mirror-a (read-only). **AT:** — (OSS acceptance u FRD §19).

---

## 3. Release workflow i CI

### F-REL-09 — W8: `release.yml` guardovi i live GitHub konfiguracija (POTVRĐENO kod / NALAZ — ZA PROVERU live)

**Kod na `2af0904d` (`.github/workflows/release.yml`, 2562 linije):**
- Trigger `:12-15`: `push: tags: ['v*']`. `permissions: contents: read` (`:17-18`).
- `build-windows-prebuilt` (`:28`) guard `:44-62`: `GITHUB_REPOSITORY == 'marolinik/waggle-os'`, `GITHUB_REF_TYPE == 'tag'`, `HEAD == GITHUB_SHA`, čist checkout, tag == `v<tauri.conf.json version>` (`0.2.0` → jedini validan tag je `v0.2.0`), `git merge-base --is-ancestor $GITHUB_SHA origin/main`.
- Chain: `prepare-windows-signing` (`:176`) → `sign-windows` (`:936`, `id-token: write`, **bez** `environment`) → `certify-windows` (`:1548`, poziva `scripts/certify-windows-installer.ps1` `:1884,1900`) → `attest-windows` (`:2056`, `if: github.event.repository.private == false`, `environment: production`, `attestations: write`) → `publish-windows` (`:2208`, `if: vars.WINDOWS_PUBLIC_RELEASE_AUTHORIZED == 'true' && private == false && startsWith(ref,'refs/tags/v')`, `contents: write`).
- Verzije: `tauri.conf.json:4` `0.2.0`, `Cargo.toml:3` `0.2.0`, root `package.json:3` `0.1.0` (root verzija nije u guard-u).

**Live konfiguracija (27.09.2026):**
- `gh variable list` → `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` **nije definisan** → `publish-windows` fail-closed ✓.
- Repo public → `attest-windows` bi se izvršio na `v0.2.0` tag; `production` environment: `protection_rules: []`, `deployment_branch_policy: null`, `can_admins_bypass: true` → **bez ljudskog approval-a**; njegova jedina funkcija je OIDC `environment` claim (kako CLAUDE.md §2 i kaže).
- `gh api repos/.../branches/main/protection` → 404 „Branch not protected”; `rulesets` → `[]`. Guard „ancestor of origin/main” se oslanja na integritet `main`-a koji nije zaštićen.
- `security_and_analysis`: `secret_scanning`, `secret_scanning_push_protection`, `dependabot_security_updates` — **disabled**; code scanning default setup `not-configured`.
- Istorijski tagovi `v0.1.0-*` i `v1.0-*` (18 tagova, 10 sa `v` prefiksom) pokrenuli su `Release Build` 5 puta (10–29. maj 2026), svi `failure` — `v*` glob hvata i ne-release tagove; version guard ih zaustavi, ali troše Actions budžet (v. memorija „CI Actions budget”).
- `sign-windows` zavisi od Azure federated credential-a scoped na tačan tag ref (CLAUDE.md §2); ovde neproverivo → NEPOZNATO.

**Očekivano (BRIEF §12.3, §15.4, W8):** publikacioni put koji ne zavisi od zastarele „private” premise; eksplicitna human kapija (environment reviewers ili ruleset na tagove `v*`) pre attest/publish; zaštita `main`-a; secret scanning uključen na javnom repou.

**Najmanja promena:** GitHub podešavanja (ne kod): required reviewers na `production`, ruleset za `main` i `refs/tags/v*`, uključiti secret scanning/push protection; opcionalno suziti trigger na `v[0-9]+.[0-9]+.[0-9]+`. Sve su to **operativne odluke vlasnika repoa**, ne PR. **AT:** AT-30.

### F-REL-10 — CI branch filter (POTVRĐENO NA REVIZIJI)

- `.github/workflows/ci.yml:3-6`: `push: branches: [main]`, `pull_request: branches: [main]`. `integration/**` **odsutan**. Isto `tauri-build-pr.yml` (main + paths), `deploy-www.yml` (main + paths); `hive-mind-cli-cross-platform.yml` dodatno `feature/**` (push, paths).
- `git branch -r | grep -i integration` → samo `origin/chore/deps-integration-0919` (nije `integration/*`). Danas nema grane koju bi filter propustio.
- Blocking gate-ovi na `main` PR-u: `build:packages`, `typecheck:web`, `typecheck:server-tests`, `lint`, `tsc -p app/tsconfig.json`, root vitest sa coverage pragom za `chat*.ts`, `apps/web` vitest, `e2e-smoke` (`:120-146`) — `e2e` (`:148-198`) i `npm audit` advisory.

**Najmanja promena:** ako plan (BRIEF §15.3 „hotspot merge owner”) uvede integration grane, dodati ih u `branches:` oba workflow-a; inače ništa. **AT:** —.

### F-REL-11 — W8: Authenticode i Deep Security (NEPOZNATO / otvoreno)

- `09-LAUNCH:35` Authenticode `NotSigned`; `:109-118` 4 GO blokera; `README.md:15` „If it does not say GO…”. Nema evidencije o signed artefaktu na `2af0904d`.
- „Managed Codex Security workflow / sealed Deep Security report”: `rg -i "codex.security|deep.security"` pogađa samo `CLAUDE.md:76,86`, `09-LAUNCH:115`, `10-SECURITY_REVIEW_2026-08-11.md:10,64` („No sealed managed Codex Security report exists”). `gh api repos/.../actions/workflows` → 9 workflow-a (8 iz `.github/workflows` + `Dependabot Updates`), **nijedan security**. Da li postoji spoljni managed pipeline — **NEPOZNATO** iz repoa.
- Lokalne signing skripte `app/scripts/sign-windows-*.ps1`, `new-windows-signing-handoff.ps1` postoje, ali CLAUDE.md §2 zabranjuje njihovu upotrebu za release artefakt.

**Najmanja promena:** u planu G3 nabrojati ove dve kapije kao spoljne zavisnosti sa vlasnikom i dokazom statusa (BRIEF §15.3), ne kao inženjerski posao.

---

## 4. Cene

### F-REL-06 — A29: pricing tabela (POTVRĐENO NA REVIZIJI, šire od S1)

**S1 (A29, L126):** „`cost-tracker.ts:28` Opus 4.8 at $15/$75 conflicts with the $5/$25 on the benchmark branch.”

**Stanje na `2af0904d` — `packages/agent/src/cost-tracker.ts`:**
```
24: /** Default pricing for common models (per 1K tokens). Model IDs cross-checked
25:  *  against litellm-config.yaml (repo root) — the canonical router catalog. */
27:   // ── Anthropic Claude — Opus class ($15/$75 per 1M) ──
28:   'claude-opus-4-8': { inputPer1k: 0.015, outputPer1k: 0.075 },
29:   'claude-opus-4-7': { inputPer1k: 0.015, outputPer1k: 0.075 },
30:   'claude-opus-4-6': { inputPer1k: 0.015, outputPer1k: 0.075 },
32:   'claude-sonnet-5': { inputPer1k: 0.003, outputPer1k: 0.015 },
66:   if (m.includes('opus')) return { label: 'Opus', pricing: { inputPer1k: 0.015, outputPer1k: 0.075 } };
```
- `litellm-config.yaml` **nema** cost polja (grep `cost|price` → 0 relevantnih), pa komentar na `:25` ne opisuje izvor cena.
- Test `packages/agent/tests/cost-tracker.test.ts:54-55` zaključava `claude-opus-4-8` = `{0.015, 0.075}`.
- `benchmarks/harness/config/models.json:88-89` (`claude-opus-4-6` 15/75) i red `claude-opus-4-7` (15/75) — ista greška u benchmark manifestu.

**Grana `origin/feature/harness-sota-bench` (`fe7804bf`):** `claude-opus-4-8` = `{0.005, 0.025}` ✓, `claude-opus-4-7` = `{0.015, 0.075}` ✗ (komentar „Opus 4.7 stays at the 4.6 list price”).

**Zvanični izvor (WebFetch `https://platform.claude.com/docs/en/about-claude/pricing.md`, 27.09.2026):** Opus 5 / **4.8 / 4.7 / 4.6** / 4.5 = **$5 / $25** per MTok; Opus 4.1 / 4 (retired) = $15/$75; **Sonnet 5 = $2 / $10** (fusnota 3: uvodna cena postala standardna, planirano povećanje na $3/$15 1.9.2026. se neće dogoditi); Sonnet 4.6 = $3/$15; Haiku 4.5 = $1/$5. (Skill `claude-api` keširana tabela od 2026-06-24 daje iste vrednosti.)

**Posledica:** main precenjuje Opus 4.6/4.7/4.8 **3×** i Sonnet 5 **1.5×**; fallback za nepoznate Opus ID-eve (`:66`) takođe 3×. Tabela nije samo za izveštaje: `CostTracker` je `ModelSpendBudget` sa rezervacijama i `BudgetPricingUnavailableError`/`BudgetExceededError`; pozivaoci `packages/server/src/local/model-spend-meter.ts`, `packages/server/src/local/index.ts`, `packages/cli/src/repl.ts`, `packages/agent/src/index.ts`. Hard daily budget za Opus korisnika (BYOK, D-05) rezerviše 3× više i prevremeno baca `BudgetExceededError` — **product impact**, ne samo benchmark manifest (BRIEF §13.6, A29).

**Repro/limit:** čitanje koda + zvanična stranica; nije pokretan test (zabranjeno menjanje). Bedrock/Vertex cene su drugačije i nisu ovde relevantne (tabela je za first-party ID-eve).

**Očekivano:** tačne cene sa provenance komentarom (URL + datum), test ažuriran, `models.json` usklađen; ne prenositi `fe7804bf` (pogrešan 4.7 + konflikt sa reservation ledger-om).

**Najmanja promena:** 4 reda u `DEFAULT_MODEL_PRICING` (`:28-30,32`), fallback `:66`, komentar `:24-27`, test `:54-57`, `models.json` Opus redovi; bez promene logike `CostTracker`. **AT:** AT-28 (manifest/trošak), AT-29.

---

## 5. Benchmark grana

### F-REL-12 — W3: `feature/harness-sota-bench` (POTVRĐENO + inventar)

- Grana postoji **samo** kao `origin/feature/harness-sota-bench` @ `18e5b36a` (2026-07-01); lokalna ref ne postoji.
- `git rev-list --count main..origin/feature/harness-sota-bench` = **66**; `origin/feature/harness-sota-bench..main` = **2022** (S1 „2022 commits stale” tačno); merge-base `33a92354` (2026-06-13).
- `git diff --stat merge-base..branch`: **121 fajl, +21435 / −4**. Fajlovi tipa M (postoje na main): `benchmarks/harness/config/models.json`, `benchmarks/harness/package.json`, `benchmarks/harness/src/stats/index.ts`, `benchmarks/harness/tests/models-config.test.ts`, `benchmarks/harness/tests/preregistration.test.ts` (1 main komit od merge-base), `litellm-config.yaml` (+66), `packages/agent/src/cost-tracker.ts` (**8 main komita** od merge-base) i njegov test (**7**). Svi ostali su A (dodati) i **ne postoje na main** → aditivno, bez konflikta.
- Konflikt siguran: `cost-tracker.ts` — branch verzija bi obrisala reservation ledger (`ModelSpendBudget`, `BudgetPricingUnavailableError`, `resolveTrustedPricing`); **preskočiti `fe7804bf`** i ručno primeniti cene (F-REL-06).
- Kandidati za cherry-pick (bez rebase-a), grupisano po komitima:
  - τ² adapter: `7bec6062` (vendor pin, MIT), `56401547`, `daba32d6`, `9a653947`, `3a0842cc`, `227805a5`, `84527a87`, `9750ea3a`, `ca931116`, `cee97a47`, `be855789`, `cc580777` → `benchmarks/harness/src/tau2/{index,tau2-cli,tau2-emit,tau2-results,tau2-types,vendor-pin}.ts`, `benchmarks/tau2/bridge/{waggle-bridge-server,llm-client}.ts`, `benchmarks/tau2/agent/{register,waggle_tau2_agent,test_waggle_tau2_agent}.py`, `benchmarks/tau2/{VENDOR.md,scripts/vendor.sh,tsconfig.json,.gitignore}`, testovi `benchmarks/harness/tests/tau2/*`, `benchmarks/tau2/tests/*`.
  - Leakage firewall: `37fa8142`, `68fb47e3`, `dc278462`, `44e7d50c`, `fc61c636`, `e2287e8d`, `8e0a2b3e` → `benchmarks/harness/src/firewall/*` + testovi.
  - Gate: `0f7d82b3`, `83edcb50`, `4fdaa67a`, `787952a2`, `fab0f0f1`, `f07148da`, `024f3394` → `benchmarks/harness/src/gate/{preflight,prereg-checklist,ruler-validation,index}.ts` + fixtures.
  - Statistika: `967727b4`, `eb77bb7b`, `78072088`, `79381854`, `ced5a4b2` → `stats/equivalence-tost.ts` + test; `stats/index.ts` (1-linijski export, trivijalan merge).
  - Continual: `0404b106`, `4e8a6046`, `7a2e15ea`, `4d6a5c49`, `14b9bd1b`, `45fc53d4`, `19676850` → `benchmarks/harness/src/continual/*`.
  - Model registry/rute: `e251bf3c`, `ddb7f5b0`, `dcbc42a7`, `ea078769` → `models.json`, `litellm-config.yaml` (bez main promena od merge-base → čist patch), ali cene u `models.json` treba ispraviti (F-REL-06).
  - **Ne prenositi kao rezultat:** `9eb454bd` („qwen+stack beats opus+stack”), `16b4dc3d`, `df159ac2` (N=114, n.s.), `18e5b36a` — istorijski pilot artefakti; DIR-23 ograničenja. Mogu ući kao arhivirani `results-retail-pilot/*` sa oznakom „nije potvrđena razlika”.
- Ograničenje: Python fajlovi (`benchmarks/tau2/*.py`) su dev/benchmark alat, ne deo no-Python Windows paketa — u redu po BRIEF §14 dok ne uđu u installer. Da li `waggle-bridge-server.ts` koristi **production** `/api/chat` putanju (DIR-22) — **NEPROVERENO** ovde (van obima release-oss; W3 grupa).

---

## 6. Šta već postoji / postoji-ali-nepovezano (sačuvati)

| Šta | Putanja | Pozivaoci verifikovani grep-om |
|---|---|---|
| Release signing chain (6 job-a) + immutable boundary guardovi | `.github/workflows/release.yml:12-15,28,44-62,176,936,1548,2056-2059,2208-2213` | Trigger `push tags v*`; `certify-windows-installer.ps1` iz `:1884,1900`; `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` var gate |
| Installer certifikacija | `scripts/certify-windows-installer.ps1` (3422 l.; NODE-LICENSE/npm LICENSE provera `:2596-2600`) | `release.yml:1884,1900`, `tauri-build-pr.yml:202`, `CLAUDE.md:298`, `AGENTS.md:274` |
| Node runtime + license staging | `scripts/bundle-node.mjs:89,165-166,273` (`NODE-LICENSE`) | `release.yml:96,2518`, `tauri-build-pr.yml:104,270`, `app/package.json:12-18`; verifikuje `certify:2598-2600`, `stage-sidecar-deps.mjs:599-600` |
| Sidecar deps staging koji čuva first-party LICENSE/NOTICE | `scripts/stage-sidecar-deps.mjs:16-18,111` | `release.yml:105,2527`, `tauri-build-pr.yml:113,279`, `app/package.json` |
| Native deps staging (bez licenci) | `scripts/bundle-native-deps.mjs:113-130` | `release.yml:102,2524`, `tauri-build-pr.yml:110,276`, `app/package.json` |
| OSS drift checker + immutable baseline | `scripts/oss-drift-check.mjs`, `scripts/oss-drift-baseline.json` | Samo docs (`CLAUDE.md` §7.5, `AGENTS.md`, `packages/hive-mind-core/CONTRIBUTING.md`, `README.md`) — **nije u CI** |
| Ollama runtime version+sha256 pinovi | `packages/server/src/local/managed-ollama-runtime.ts:28-29,160-184` | `packages/server/src/local/routes/local-inference.ts` |
| MCP/marketplace `license` polje | `packages/marketplace/src/mcp-registry.ts:80,116,152,190,227,320`, `sync.ts:122,174`, `cli.ts:308` | `packages/server/src/local/routes/mcps.ts`, `packages/marketplace/src/{index,db,install-security}.ts`, `packages/shared/src/mcp-catalog.ts`, `apps/web/.../connectors/{McpCatalog,McpServerCard}.tsx` |
| `CostTracker` reservation ledger (logika ispravna; samo tabela pogrešna) | `packages/agent/src/cost-tracker.ts` | `packages/server/src/local/model-spend-meter.ts`, `packages/server/src/local/index.ts`, `packages/cli/src/repl.ts`, `packages/agent/src/index.ts` |
| Persona seal alat | `scripts/seal-persona-acceptance.ts`, `tests/vision/persona-acceptance-seal.ts`, `persona-scorer.ts` | `package.json:48` `persona:seal` |
| Router qualification alat | `scripts/qualify-smart-router.ts` (+ `.test.ts`) | **nijedan** npm/CI pozivalac — nepovezan |
| Auth canary alat | `scripts/test-windows-official-auth-canaries.ps1` | **nijedan** npm/CI pozivalac — nepovezan |
| Licence fajlovi (root MIT, hive-mind Apache-2.0 + NOTICE, vendor/pptxgenjs MIT) | `LICENSE`, `packages/hive-mind-*/LICENSE`, `packages/hive-mind-{cli,mcp-server,wiki-compiler}/NOTICE`, `vendor/pptxgenjs/LICENSE`, `README.md:190-194` | Čitaju ih GitHub (`licenseInfo: MIT`) i `stage-sidecar-deps` pattern `:111` |
| Blocking CI gate-ovi | `.github/workflows/ci.yml:30-106,120-146` | PR/push na `main` |
| Dependabot verzije | `.github/dependabot.yml` | GitHub „Dependabot Updates” dynamic workflow (active) |

---

## 7. Napomene i ograničenja provere

- Nije pravljen installer, nije pokretan nijedan test, nije menjan nijedan fajl u repou. Jedino izvršavanje iz repoa: `node scripts/oss-drift-check.mjs D:/Projects/hive-mind` (čita fajlove i pokreće `git rev-parse/status` nad mirror checkout-om; monorepo `git status` posle pokretanja nepromenjen).
- Live GitHub podaci (visibility, vars, environments, branch protection, security features, PR #83, workflow runs) su stanje od 27.09.2026. i mogu se promeniti; nisu svojstvo revizije.
- Datum prelaska repoa u public nije utvrđen (nema `PublicEvent` u dostupnim event-ima).
- `hive-mind` local checkout korišćen za drift check je `origin/master` + 1 komit koji ne dira sporne fajlove; za formalni release gate ponoviti nad čistim `master`-om.
- Procene dana iz S1 (OSS 9–11/4–5, W8 8–10/5–7, A1 „3–4 dana po freeze-u”) nisu proverive iz repoa → NEPOZNATO; po BRIEF §15.2 su polazni input.
- Ništa ovde nije preporuka za arhitekturu; „najmanja promena” je opis minimalnog dodira, odluke ostaju piscima i founder-u (D-01 i §20.3 nisu ponovo otvarani).

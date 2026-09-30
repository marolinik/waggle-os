# 01 — Onboarding razvojnog okruženja (Windows)

**Revizija dokumenta: 1.2 DRAFT · 29.09.2026 · pregledana revizija koda `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`**

**Revizija dokumenta: 1.2.1 DRAFT · 30.09.2026 · završno zatvaranje (H-01..H-12)**

Izmene 1.2.1: H-01 — kanal predaje i odobreni timski remote: clone/push samo iz/na `<ODOBRENI_TIMSKI_REMOTE>`, provera push URL-a, zabrana golog `git push` na mašini osnivača (§0.1 t.5, §3.2, §3.3); H-02 — identitet paketa (`2758f4e5` na `origin`-u, `fc0a7b3f` lokalno, 1.2.1 necommitovana), „untracked” sačuvano kao istorijski zapis, heševi u manifestu (§0.1 t.5, §1 red pandoc, §3.1, §3.2, §13 t.4); H-04 — zaštite mašine osnivača kao zabrane, a ne obaveze timskih hostova; predlozi TSA-02/03/04/08 označeni kao NEODOBRENO sa normom koju zamenjuju (§0, §0.2, §3.1, §3.2, §3.3, §11.8, §12, §13 t.1); H-05 — bezbedan test profil (BTP, nova §9.0), scratch profil nije sandbox, proširena lista curenja sa popravkom W0-PR20, snimci sa direktorijumima i Claude Desktop konfiguracijom (§0.1, §0.2, §7, §9.0–§9.6, §13 t.3); H-06 — oznake integracionih poslova INT-01/INT-02 (§0.2, §1, §3.2). H-03, H-07..H-11: bez izmene ovog dokumenta; H-12 upućuje na §9.0. Ova revizija nije odobrenje implementacije; predlozi iz [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) ne važe pre potvrde osnivača, a statusi PREDLOG/ODB/DQ/RAT se njome ne menjaju. · Završni pregled (H-01/H-04): jedno pravilo za „danas” do odluke (n) usklađeno sa 00 §2/§6 i TSA §3 — nijedan klon, ni read-only klon javnog repoa; samo kopija paketa proverena prema manifestu i `git ls-remote` (§0.1 t.1, t.3, t.5; §3.2 napomena). · Završni pregled (H-02): očekivani SHA grane `docs/waggle-v1.2-planning` u timskom klonu je SHA commita zatvaranja 1.2.1 iz manifesta §1 (posle odluke D-3), ne `planning_package_sha` `2758f4e5` (§0.1 t.5, §3.2).

Namena: tech lead, developeri i QA koji od osnivača preuzimaju Waggle. Dokument opisuje kako se podiže
izolovano razvojno okruženje na Windows-u (primarna platforma), kojim redom se build-uje i testira i koje
zamke su u ovom repou već koštale vreme. Komande su proverene u [`package.json`](../../package.json),
[`CLAUDE.md`](../../CLAUDE.md) („Build Commands”, „Verification Commands”) i [`docs/TESTING.md`](../TESTING.md).
Tamo gde nešto nije moglo da se proveri, stoji **NEPOZNATO**.

> **Status implementacije.** Implementacija v1.2 **nije odobrena**. Kodiranje počinje tek kad osnivač odobri
> [delivery plan](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md), a ratifikacije i odobrenja iz §6.1 plana
> (RAT-01..RAT-09, ODB-01, ODB-02) važe svaka za svoj korak. Do tada ovo okruženje služi samo za čitanje koda,
> read-only provere i pripremu van repoa (§0.1). Svaki rad posle odobrenja **obavezno** prati
> [SAFE-IMPLEMENTATION checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md) (jedini izvor istine za da/ne
> listu) i pravila DP-0.01..DP-0.16 iz §0 delivery plana. Odluke osnivača D-01..D-18 (brief §3) su zatvorene i
> ovaj dokument ih ne otvara ponovo.

**Oznake statusa** (iste kao u paketu, vidi uvod [delivery plana](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md)):
ODLUKA · POTVRĐENO NA REVIZIJI · NALAZ AUDITA — ZA PROVERU · DELIMIČNO/NEPOVEZANO · PREDLOG · ODLOŽENO ·
NEPOZNATO. Kad nema drugačije napomene, tvrdnje o kodu u ovom dokumentu su POTVRĐENO NA REVIZIJI: pročitane su
na `2af0904d` za ovaj dokument i nose `fajl:linija`. Pravila rada su PREDLOG ako ih ne nosi neki DP ili D ID.

---

## 0. Kratak put

> **Kapija.** Do pisanog founder odobrenja delivery plana ([00 §2](00-START-HERE.md)) važi samo §0.1. Sve što
> menja git stanje (grana, worktree, commit, push), kao i `npm ci`, build, gates, testovi, repro skripte i
> pokretanje sidecar-a/web-a/E2E, čeka to odobrenje, **i u zasebnom svežem klonu na sopstvenoj mašini**
> ([00 §2 i §6](00-START-HERE.md); [02 §0](02-WORKING-AGREEMENT.md); [04 §13 t.7](04-CODEBASE-MAP.md)). Pravilo je
> PREDLOG ovog handoff-a. Izuzetak za sopstveni svež klon na timskoj mašini predlaže
> [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) TSA-02 (izolovani onboarding: detached `2af0904d`, bez
> grane, commit-a i push-a; samo `npm ci`, build i gates), a do potvrde osnivača (pitanje (o) u 00 §6) važi zabrana.
> Grana `integration/waggle-next` 30.09.2026 ne postoji ni lokalno ni na `origin`-u (§3.2) i pre odobrenja
> se ne pravi. Komande iz §3.2–§3.3, §4–§7 i §9.3–§9.4 (osim read-only koraka 1–2 u §9.3) važe tek posle odobrenja.

### 0.1 Pre odobrenja plana (odmah; usklađeno sa 00 §6, koraci 1–2)

1. Pročitati paket po [00 §3](00-START-HERE.md) (Dan 1 i Dan 2), SAFE checklist u celosti i ovaj dokument. Paket se
   čita iz kopije koju je predao osnivač i čiji se SHA-256 poklapa sa [manifestom](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md) §3.
   Do odluke (n) (H-01, TSA-09) tim ne pravi nijedan klon, ni read-only klon javnog repoa ([00 §2](00-START-HERE.md)).
   Kod se čita bez izmena tek u checkout-u iz kanala odobrenog pod (n)
   (`git show 2af0904df01ca3d374cc78ba95b60dc579dd6a7a:<putanja>`, `git grep`; [04 §13 t.3](04-CODEBASE-MAP.md)).
2. Instalirati preduslove iz §1 koji ne traže `node_modules` (PowerShell 7, Git, fnm, Node; Rust/MSVC samo za
   desktop posao) i prebaciti se na Node `22.23.2` (§2): `node -v` = `v22.23.2`, `npm -v` = `10.9.8`. To je
   priprema lične mašine van repoa (02 §0). Playwright Chromium (`npx playwright install chromium`) ide posle
   odobrenja, uz `npm ci`.
3. Read-only provere: `git ls-remote https://github.com/marolinik/waggle-os.git refs/heads/main` =
   `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (00 §6 t.1; bez klona). `git rev-parse origin/main` i
   `git worktree list` (samo čitanje, §3.1) tek u checkout-u iz kanala odobrenog pod (n). Preflight shell env-a (§9.3, korak 1) i provera da na 3333 ne
   sluša founder-ova instanca (§9.3, korak 2). Server se ne pokreće. Uz to prvi snimak `~/.waggle` (§9.5; čita
   `~/.waggle`, piše samo u `%TEMP%`) i drugi posle nekoliko sati bez ikakvog dev rada: ako se razlikuju, na toj
   mašini radi instalirani Waggle, poređenje tamo ne dokazuje izolaciju i dev sidecar/E2E se tamo ne pokreću (§9.5).
4. Pripremiti nacrt env šablona po §9.2 i checklisti („Env izolacija”, „Spoljni upisi isključeni”) **van repoa**
   (00 §6 t.2). U worktree kao `.env.dev.local` ulazi tek posle odobrenja. Uz to pripremiti bezbedan test profil
   (BTP, §9.0) van repoa; prvi sidecar/E2E run posle odobrenja ide samo tamo.
5. Popisati pitanja za osnivača (00 §6, „Pitanja za osnivača pre starta”). Na listi je i pitanje (n), uz (h):
   kanal predaje paketa i `<ODOBRENI_TIMSKI_REMOTE>`, ko timu daje read/write pristup i push (write) prava za
   `integration/waggle-next` i `<wave-id>/*` grane i kako paket (odobreni commit zatvaranja 1.2.1 iz manifesta §1,
   posle D-3; `2758f4e5` nema korekcije H-01..H-12) ulazi na integracionu granu (INT-01). Paket je commit-ovan (`2758f4e5`), a closure
   revizija 1.2.1 nije ([00 §1.1](00-START-HERE.md)). Do odluke tim čita kopiju čiji se SHA-256 poklapa sa
   [manifestom](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md) §3; timski host nema odobren izvor klona ni odredište
   push-a, pa se ne pravi klon (ni read-only klon javnog repoa), grane ni push (§3.2).

### 0.2 Posle founder odobrenja plana (00 §2)

1. Tech lead pravi `integration/waggle-next` iz `2af0904d` u sopstvenom novom worktree-ju (§3.2; 00 §6 t.3,
   INT-01, W0-PR0), u klonu sa odobrenog timskog remote-a (H-01). Zatim svako pravi sopstveni worktree iz te
   grane (§3.3). Na mašini osnivača postojeće worktree-je i stash-ove ne dirati (DP-0.02, DP-0.03); na timskoj mašini ne dirati tuđe unose (§3.1).
2. Proveriti da nijedan node proces ne drži `.node` fajlove, zatim `npm ci` (§4).
3. `npm run build:packages` (§5).
4. Napraviti per-worktree `.env.dev.local` sa izolovanim `WAGGLE_DATA_DIR`/`WAGGLE_PORT` (§9.2) i snimiti
   „pre” stanje `~/.waggle` i konfiguracije spoljnih klijenata (§9.5).
5. Pustiti gates iz §7 na čistom stablu (root suite do merge-a W0-PR20 samo u BTP-u, §9.0). Rezultat vezati za commit SHA.
6. Na kraju dana ponovo snimiti `~/.waggle` i konfiguraciju klijenata („posle”) i uporediti (§9.5).

---

## 1. Preduslovi

| Alat | Verzija | Zašto / izvor | Status |
|---|---|---|---|
| Windows 11 x64 | — | Primarna platforma. Launch gate je Windows Solo (`CLAUDE.md` §1) | POTVRĐENO NA REVIZIJI (dokument) |
| PowerShell 7 (`pwsh`) | 7+ | Release skripte i certify komande su PowerShell 7 (`CLAUDE.md` „Windows Solo release commands”) | POTVRĐENO NA REVIZIJI |
| Git for Windows (uklj. Git Bash) | NEPOZNATO (repo ne pinuje verziju) | worktree tok (§3). Na referentnoj mašini je `core.autocrlf=true` (§11.6) | NEPOZNATO (minimalna verzija) |
| fnm (Fast Node Manager) | referentna mašina: `fnm 1.39.0` | Prebacivanje na tačan Node; repo ima [`.node-version`](../../.node-version) = `22.23.2` (TD-ENV-1, zatvoren 2026-09-15) | POTVRĐENO NA REVIZIJI (`.node-version`); verzija fnm-a je zapažanje sa jedne mašine |
| Node.js | **`22.23.2`** | `engines.node` je `>=22.19.0` (`package.json`), ali packaged desktop runtime je pinovan na `22.23.2` (`CLAUDE.md` §1), a CI koristi `node-version: 22.23.2` (`.github/workflows/ci.yml:16`). `better-sqlite3` u `node_modules` je build-ovan za ABI 127 (Node 22) | POTVRĐENO NA REVIZIJI |
| npm | **`10.9.8`** | `packageManager: "npm@10.9.8"` (`package.json`). Node `22.23.2` na referentnoj mašini donosi upravo `npm 10.9.8` | POTVRĐENO NA REVIZIJI |
| Rust toolchain + MSVC build tools | CI: `toolchain: 1.94.0` (`.github/workflows/tauri-build-pr.yml:64`) | Samo za desktop build (`npm --prefix app run tauri:build:win`). Repo nema `rust-toolchain` fajl | POTVRĐENO NA REVIZIJI (CI pin); lokalni minimum: NEPOZNATO |
| Playwright Chromium | kroz `@playwright/test ^1.63.0` (root devDependency) | E2E/visual (§6.4). Instalacija: `npx playwright install chromium` (CI: `--with-deps chromium`, `ci.yml:144`) | POTVRĐENO NA REVIZIJI |
| pandoc | **`3.9`** ([manifest](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md) §3: `pandoc 3.9`; `pandoc --version` na referentnoj mašini 29.09.2026 = `pandoc 3.9`) | Samo za doc-only PR-ove koji menjaju PRD/FRD ili `00-START-HERE` `.md`; u G1 to su WB-PR1 (FRD tabela) i ID-reconcile doc-only PR INT-02 ([03](03-BACKLOG.md)). DoD traži ponovni DOCX izvoz i nove heševe ([02 §9](02-WORKING-AGREEMENT.md); [05 §6](05-RISKS-DECISIONS-ESCALATION.md)). Komanda iz manifesta §3: `pandoc -f gfm-tex_math_dollars-tex_math_gfm <fajl>.md -o <fajl>.docx`. Posle izvoza: `Get-FileHash -Algorithm SHA256` za `.md` i `.docx` i upis heševa u manifest §3. DOCX heš se menja pri svakom izvozu (`docProps/core.xml` nosi vreme kreiranja), pa se upisuje posle svakog izvoza | POTVRĐENO NA REVIZIJI paketa (manifest §3; istorija izvoza: [HANDOFF-HISTORY](../plans/v1.2-evidence/HANDOFF-HISTORY.md) §4); da li druga verzija pandoc-a daje isti DOCX: NEPOZNATO |
| Docker, Python, LiteLLM, Ollama | **nisu potrebni** za podrazumevani gate | Docker (Postgres 5434 + Redis 6381) treba samo za `npm run test:infra` (`vitest.config.ts:39-45`). Instalirani desktop ne sme zavisiti ni od jednog od njih (`CLAUDE.md` §1) | POTVRĐENO NA REVIZIJI |

RAM: lokalni root suite se pušta sa `--maxWorkers=6` (DP-0.06). Taj broj potiče sa mašine od 80 GB (§6.2).
Na mašini sa manje memorije treba spustiti broj worker-a (§12).

---

## 2. Node `22.23.2` preko fnm

**PowerShell 7** (jednom, u `$PROFILE`):

```powershell
winget install Schniz.fnm
# u $PROFILE:
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
```

Uz `--use-on-cd` fnm pri ulasku u repo sam čita `.node-version`. Ručno:

```powershell
fnm install 22.23.2
fnm use 22.23.2
node -v   # v22.23.2
npm -v    # 10.9.8
```

**Git Bash** (svaka duža komanda):

```bash
eval "$(fnm env --shell bash)" && fnm use 22.23.2 >/dev/null && node -v
```

**Provera native modula** (iz korena worktree-ja, posle `npm ci`):

```powershell
node -e "new (require('better-sqlite3'))(':memory:'); console.log('better-sqlite3 OK')"
```

**Zamka ABI (obavezno pročitati).** Ako je podrazumevani fnm Node 24 (na referentnoj mašini: `v24.19.0 default`),
testovi i skripte padaju sa `ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION 137`. Zabeleženo: 123/236 server test
fajlova crveno, što liči na regresiju u kodu, a uzrok je samo okruženje ([`docs/TESTING.md`](../TESTING.md) §Test
Strategy). Rešenje je prebacivanje na 22.23.2, **ne** `npm rebuild` za Node 24: rebuild za 24 bi tiho pokvario
release ugovor pinovan na 22.23.2. `npm rebuild better-sqlite3` je dozvoljen samo pod 22.23.2, kao oporavak (§11.2).
Na Windows-u `fnm exec --using=22.23.2 …` ne radi pouzdano (zabeležen tihi no-op), pa treba koristiti `fnm use`.

---

## 3. Git: worktree-jevi i grane

### 3.1 Šta se ne dira

**Mašina osnivača — zabrane, ne obaveze tima** (DP-0.02, DP-0.03; [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) TSA-03 A, primenjeno u reviziji 1.2.1 po uputstvu osnivača):
- **Postojeći worktree-jevi** na mašini osnivača: 9 unosa iz DP-0.02 ([delivery plan §0](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md)).
  Ne brišu se, ne checkout-uju i ne prune-uju. Kad unos postane „prunable”, **ne** pokretati
  `git worktree prune` / `git worktree remove` bez eksplicitnog odobrenja osnivača.
- Posle 27.09.2026 postoji i planerski docs worktree `D:/Projects/waggle-v12-handoff` (grana
  `docs/waggle-v1.2-planning`; lokalno `fc0a7b3f` + necommitovana closure revizija 1.2.1, na `origin`-u
  `2758f4e5`) koji nosi ovaj paket. I njega ostaviti netaknutog. Izvor: `git worktree list`,
  `git ls-remote origin`, 30.09.2026.
- **Stash-ovi** `stash@{0}` i `stash@{1}` (DP-0.03): bez `stash pop/drop/apply`.
- Da li tim uopšte radi na mašini osnivača: predlog TSA-03 B je „ne” (NEODOBRENO; 00 §6 (c)).

**Timska mašina.** Svež klon nema osnivačeve worktree-je ni stash-ove i ne treba da ih ima. Na početku i na kraju
sesije snimiti `git worktree list` i `git stash list`; nijedan unos koji ne pripada tebi se ne uklanja ni menja.
Sopstveni završeni worktree: §3.3.

- **Git zabrane** (DP-0.11, DP-0.12; [checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md) „Apsolutne zabrane”):
  nema merge-a u `main`, nema force-push-a, nema `git tag v*` ni push-a tagova (`release.yml:12-15` se okida na
  svaki `v*` tag), nema ručnog pokretanja ni re-run-a workflow-a (izuzetak samo po TSA-08, posle potvrde),
  nema izmena repo/org podešavanja.
- Zamke kod ponovnog pokretanja CI-ja: §11.8.

### 3.2 Integraciona grana (jednom; tech lead; tek posle odobrenja plana)

DP-0.04 je PREDLOG: `integration/waggle-next` se pravi iz `2af0904d` u **sopstvenom novom worktree-ju**, ne u
`D:/Projects/waggle-os`. Uspostavljanje grane sa paketom je integracioni posao INT-01 ([03](03-BACKLOG.md) §8).
Stanje 30.09.2026: `git ls-remote origin` ne vraća nijednu `refs/heads/integration/*` granu, pa
`integration/waggle-next` ne postoji ni lokalno ni na `origin`-u.
Putanje ispod su PREDLOG.

```powershell
# PREDLOG; važi tek posle odluke osnivača o kanalu predaje (00 §6 (n), H-01) i odobrenja starta.
# <ODOBRENI_TIMSKI_REMOTE> = URL koji osnivač upiše u TEAM-START-AUTHORIZATION. Javni
# https://github.com/marolinik/waggle-os.git NIJE odredište za push interne dokumentacije ni timskih grana.

# Timska mašina: svež klon SAMO iz odobrenog timskog remote-a
git clone <ODOBRENI_TIMSKI_REMOTE> D:\waggle\waggle-os
git -C D:\waggle\waggle-os remote -v                     # jedini remote; fetch i push = <ODOBRENI_TIMSKI_REMOTE>
git -C D:\waggle\waggle-os rev-parse origin/main         # = 2af0904df01ca3d374cc78ba95b60dc579dd6a7a (ili baseline koji osnivač zapiše)
git -C D:\waggle\waggle-os rev-parse origin/docs/waggle-v1.2-planning   # = SHA commita zatvaranja 1.2.1 iz manifesta §1 (posle D-3), NE planning_package_sha 2758f4e5 (bez korekcija H-01..H-12)

git -C D:\waggle\waggle-os worktree add -b integration/waggle-next D:\waggle\wt\integration 2af0904df01ca3d374cc78ba95b60dc579dd6a7a

# Provera pre SVAKOG push-a (i za <wave-id>/* grane): push URL mora biti odobreni timski remote
$pushUrl = git -C D:\waggle\wt\integration remote get-url --push origin
if ($pushUrl -ne '<ODOBRENI_TIMSKI_REMOTE>') { throw "STOP: push remote '$pushUrl' nije odobreni timski remote (H-01)" }
git -C D:\waggle\wt\integration push -u origin integration/waggle-next   # nov branch, bez --force
```

Pravila za remote (PREDLOG, NEODOBRENO do potvrde osnivača; H-01):
- Ako `git remote -v` pokaže `github.com/marolinik/waggle-os` ili bilo koji URL osim `<ODOBRENI_TIMSKI_REMOTE>`, rad staje i ide eskalacija ([05 §5.3](05-RISKS-DECISIONS-ESCALATION.md)). Javni repo se ne dodaje kao remote. Poređenje sa javnim `main` je read-only: `git ls-remote https://github.com/marolinik/waggle-os.git refs/heads/main`.
- Na mašini osnivača `D:/Projects/waggle-os` i `D:/Projects/waggle-v12-handoff` imaju `origin` = javni repo, a lokalna grana `docs/waggle-v1.2-planning` prati `origin/docs/waggle-v1.2-planning` (`git config --get branch.docs/waggle-v1.2-planning.remote` → `origin`, 30.09.2026). Zato se tamo ne koristi goli `git push`. Eventualni push ide eksplicitno na URL `<ODOBRENI_TIMSKI_REMOTE>` i samo uz odluku H-01.
- Danas (pre odluke o kanalu i odobrenja starta) niko ne push-uje ni na jedan remote.
- Timski remote služi razvoju, ne izdanju. `release.yml` na `2af0904d` prihvata samo `GITHUB_REPOSITORY` = `marolinik/waggle-os` (`release.yml:46`, `:206`), pa prelaz na javni repo (merge u `main`, tag, potpis, objava) ostaje poseban founder-gated korak (Delivery §5; H-09).

Na mašini osnivača isti `worktree add` ide sa `git -C D:/Projects/waggle-os …` i ciljnim direktorijumom **van**
`D:/Projects/waggle-os` (predlog TSA-03 B, NEODOBRENO: tim ne radi na mašini osnivača; posle potvrde ovaj recept
otpada). Prvi PR na integracionoj grani dodaje `integration/**` u `ci.yml`
(`on.push.branches`, `on.pull_request.branches`; danas `ci.yml:3-6` = samo `[main]`) i u `tauri-build-pr.yml`,
a `release.yml` ne dira (DP-0.07). Dok taj PR ne uđe, integraciona grana nema CI.

> **Paket na timskom hostu i kanal predaje (stanje 30.09.2026).** Paket je commit-ovan: `planning_package_sha` =
> `2758f4e5` (grana `docs/waggle-v1.2-planning`), i ta grana je na javnom `origin`-u od 29./30.09.2026
> (`git ls-remote --heads origin docs/waggle-v1.2-planning` → `2758f4e5…`; `gh api repos/marolinik/waggle-os` →
> `private:false`, `visibility:public`) — POTVRĐENO NA REVIZIJI (read-only, 30.09.2026). Prevod je lokalni commit
> `fc0a7b3f`, a closure revizija 1.2.1 nije commit-ovana ([00 §1.1](00-START-HERE.md);
> [manifest](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md)). Klon `main` ne sadrži nijedan dokument paketa, jer ih
> `2af0904d` nema. Javna grana nije kanal predaje: nema prevoda ni izmena zatvaranja, a da li je javna dostupnost
> namerna odlučuje osnivač ([00 §6](00-START-HERE.md) (n); H-01). Predlog kanala (privatan timski repo, ili privatni
> snapshot sa poznatim baseline-om samo za čitanje i procenu) i pravila pristupa su u
> [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) TSA-09 (PREDLOG, NEODOBRENO). Paket mora biti na
> integracionoj grani (INT-01) za upis odluka doc-only PR-om ([02 §10](02-WORKING-AGREEMENT.md), t.4) i za WB-PR1
> ([03](03-BACKLOG.md) WB-PR1; 03 §7 N-07); način ulaska je pitanje (h). Vidljivost repoa se ne menja (DP-0.13):
> `CLAUDE.md:84` i `AGENTS.md:68` kažu „remains private” — NALAZ AUDITA — ZA PROVERU (DQ-02; F-REL-08 u
> [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.md)). Push `integration/waggle-next` i `<wave-id>/*`
> grana traži write prava na **odobrenom** remote-u, a ko ih daje nije zapisano (pitanje (n), uz (c), (d) i (h);
> §0.1 t.5). Istorijski zapis: 29.09.2026 paket je bio untracked u `D:/Projects/waggle-v12-handoff`, pa svež klon
> javnog repoa nije sadržao nijedan dokument paketa ([HANDOFF-HISTORY](../plans/v1.2-evidence/HANDOFF-HISTORY.md) §2).
> Dok (n) nije odlučeno, tim na drugom hostu nema odobren izvor klona ni odredište push-a: paket čita iz kopije
> proverene prema manifestu, ne pravi klon (ni read-only klon javnog repoa), grane ni push; od 00 §6 t.1 izvršava
> samo čitanje te kopije i read-only `git ls-remote https://github.com/marolinik/waggle-os.git refs/heads/main`, a
> komande ovog dokumenta posle §0.1 ne izvršava.

### 3.3 Worktree po developeru/agentu

DP-0.05 i checklist propisuju jednu kratkotrajnu granu po zadatku i jedan worktree po paralelnom agentu. Ime
grane je `<wave-id>/<tema>`, a dozvoljeni prefiksi su `w0`–`w8`, `w3e`, `wb`, `oss`, `b1`–`b3`. Grana cilja
`integration/waggle-next`, nikad `main`.

U timskom klonu `origin` = `<ODOBRENI_TIMSKI_REMOTE>` (§3.2). Pre prvog push-a svake `<wave-id>/*` grane važi ista provera push URL-a kao u §3.2.

```powershell
git -C D:\waggle\waggle-os fetch origin
git -C D:\waggle\waggle-os worktree add -b w0/harn-01-verify-default D:\waggle\wt\w0-harn-01 origin/integration/waggle-next
cd D:\waggle\wt\w0-harn-01
fnm use 22.23.2
npm ci                         # svaki worktree ima SVOJ node_modules (§4)
```

Svakodnevna sinhronizacija, najmanje jednom dnevno (DP-0.06):

```powershell
git -C D:\waggle\wt\w0-harn-01 fetch origin
git -C D:\waggle\wt\w0-harn-01 merge origin/integration/waggle-next
```

Kad je grana već push-ovana, sinhronizuje se **merge-om**. Rebase već push-ovane grane traži force-push, a on je
zabranjen (DP-0.11). Rebase dolazi u obzir samo pre prvog push-a.

Uklanjanje sopstvenog `<wave-id>/*` worktree-ja posle merge-a PR-a predlaže
[TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) TSA-04: samo na timskoj mašini, posle merge-a u
`integration/waggle-next`, uz praznu `git status --porcelain`, bez nepush-ovanih commit-a i stash-a te grane,
komandom `git worktree remove <putanja>` bez `--force` (PREDLOG, NEODOBRENO). Do potvrde osnivača nijedan unos iz
`git worktree list` se ne uklanja, ni sopstveni ([02 §2.2](02-WORKING-AGREEMENT.md)). Na mašini osnivača
`git worktree prune` se ne pokreće nikad (DP-0.02); na timskoj mašini samo po TSA-04 t.5.

### 3.4 Hotspot fajlovi i OSS substrate

Pre prvog PR-a pročitati DP-0.14: hotspot fajlovi se merge-uju samo preko vlasnika uloge, a dva hotspot merge-a
istog dana idu samo uz integracioni test. Pročitati i `CLAUDE.md` §7.5: promene u
`packages/hive-mind-core/src/{mind,harvest}/**` idu prvo u monorepo, OSS mirror dobija samo kuriran
forward-port, raw subtree push je zabranjen, a pre OSS release-a ide `node scripts/oss-drift-check.mjs <mirror>`.

---

## 4. Instalacija zavisnosti

1. **Proveriti procese pre `npm ci`.** Na Windows-u proces koji drži učitan `.node` fajl blokira brisanje, a
   `npm ci` prvo briše `node_modules`. Posledica je poluobrisano stablo: `EPERM: unlink …*.node`, a `typescript`
   i drugi paketi nestaju.

   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId, CommandLine
   ```

   Gasiti samo procese iz **sopstvenog** worktree-ja, nikad tuđe i nikad instalirani Waggle sidecar.
2. **Instalacija:**

   ```powershell
   npm ci
   ```

   CI koristi `npm install` (`ci.yml:30`). Lokalni i release put koriste `npm ci`
   (`CLAUDE.md` „Windows Solo release commands”).
3. **Samo za desktop (Tauri) build:**

   ```powershell
   npm ci --prefix app --ignore-scripts
   ```

4. **Sinhronizacija lockfile-a bez diranja `node_modules`** (npr. posle uklanjanja zavisnosti):
   `npm install --package-lock-only`, zatim `npm ci --dry-run` kao provera.
5. **Provera posle instalacije:** better-sqlite3 (§2), pa junction-i workspace paketa moraju pokazivati u
   **isti** worktree:

   ```powershell
   Get-ChildItem node_modules\@waggle | Select-Object Name, LinkType, Target
   ```

   Svaki `Target` mora biti pod korenom tekućeg worktree-ja. Kod dugoživećih worktree-ja zabeleženo je da
   `node_modules/@waggle/*`, pa čak i `apps/web/node_modules`, pokazuju u **drugi** checkout na drugoj grani.
   Gates tada testiraju pogrešan `dist` i daju i lažne padove i lažne prolaze. `node_modules` se nikad ne
   kopira i ne linkuje između worktree-ja.
6. `packages/hive-mind-cli` ima `postinstall` (`node postinstall.cjs`, Windows `.cmd` shim fix,
   `packages/hive-mind-cli/package.json:31`). Root `package.json` nema `prepare`/`postinstall`, a repo nema
   `.husky`.

---

## 5. Build redosled

| Korak | Komanda (skripta iz `package.json`) | Šta radi | Napomena |
|---|---|---|---|
| 1 | `npm run build:packages` | `tsc --build` lanac: `shared → waggle-dance (--force) → hive-mind-core → core → weaver → wiki-compiler → marketplace → agent → server → worker (npm run build)` | **Jedini autoritativni lokalni typecheck** za promene koje prelaze pakete (TD-TEST-12). `npx tsc --noEmit --project packages/<pkg>/tsconfig.json` rešava sestrinske pakete kroz već build-ovan `dist/`, pa prolazi nad zastarelim deklaracijama dok CI pada |
| 2 | `npm run typecheck:server-tests` | `tsc --noEmit -p packages/server/tsconfig.tests.json` | `packages/server/tsconfig.json` isključuje `tests/`, pa `build:packages` testove ne proverava. Na `2af0904d` ovaj korak pokriva **svaki** server test fajl, bez izuzetka: `packages/server/tsconfig.tests.json` ima `"exclude": ["node_modules", "dist"]`, a `start-trial.test.ts` je izašao iz exclude liste (TD-TEST-19, CLOSED 2026-09-26). Komentar u `ci.yml:45-46` („excludes only start-trial.test.ts”) je zastareo. Nijedan fajl se ne dodaje u `exclude` da bi crveno postalo zeleno (TD-TEST-11; zaglavlje `tsconfig.tests.json`) |
| 3 | `npm run typecheck:web` | `tsc --noEmit -p apps/web/tsconfig.app.json` | CI korak `ci.yml:41-42` |
| 4 | `npx tsc --noEmit --project app/tsconfig.json` | Tauri TS alati (`app/scripts`) | Standardni `tsc`, CI korak `ci.yml:53-54`, `CLAUDE.md` „Verification Commands” |
| 5 | `npm run build` | typecheck **samo `apps/web`**, pa `vite build` u `<root>/dist` | Ne proverava pakete ni server |
| — | `npm run build:all` | `build:packages` + `build` | Ovo pokreće i Playwright `webServer` (`playwright.config.ts:113-114`) |
| — | `npm run build:hook-runtime` | `node scripts/build-hook-runtime.mjs` | CI ga pušta pre package-install runtime testova (`ci.yml:58-62`) |

**Zašto `build:packages` mora ići posle svake promene u paketu:** sidecar se pokreće kroz `tsx` (transpile-only):
`npm run dev:server` = `cd packages/server && npx tsx src/local/start.ts`. Greške tipova u server rutama zato
prolaze neprimećene. Kad se ne pokrene `build:packages`, jedna takva greška stiže do CI-ja. `CLAUDE.md` beleži
slučaj od 2026-05-28. Pored toga, `@waggle/*` paketi se razrešavaju preko `dist/` (`"main": "dist/index.js"` u
`packages/{core,agent,shared,hive-mind-core}/package.json`). Posle izmene u, na primer, `packages/agent/src` dev
sidecar zato izvršava **stari** kod dok se `build:packages` ne ponovi.

Desktop build (samo za installer posao, W8/F1–F3; nije svakodnevni tok):
`npm --prefix app run tauri:build:win` (skripta `tauri:build:win` u `app/package.json`). Potpisivanje i release
putevi su zabranjeni (DP-0.11, `CLAUDE.md` „Production signing is hosted-only”). `certify-windows-installer.ps1`
se pokreće samo na namenskoj VM ili disposable Windows nalogu, nikad na nalogu osnivača (checklist, stavka
„Mesto izvršavanja installer/packaged testova”).

---

## 6. Testovi

### 6.1 Komande

| Skripta | Komanda iz `package.json` | Namena |
|---|---|---|
| `test` | `vitest run` | Root deterministički gate (`vitest.config.ts`: `pool: 'forks'`, `maxWorkers: 4`, `testTimeout`/`hookTimeout` 30 s; `apps/**`, infra, `packages/server/tests/performance/**` i `packages/hive-mind-core/tests/soak/**` su isključeni) |
| (workspace) | `npm run test -w apps/web` | `apps/web` suite (sopstveni `apps/web/vitest.config.ts`, jsdom). Root gate ga **ne** pokreće, pa se pušta posebno (`ci.yml:105-106`) |
| `test:watch` | `vitest` | lokalno, interaktivno |
| `test:critical` | `vitest run --config vitest.critical.config.ts --coverage` | kritični skup sa coverage-om |
| `test:perf` | `vitest run --config vitest.perf.config.ts` | wall-clock budžeti u zasebnoj traci |
| `test:soak` | `vitest run --config vitest.soak.config.ts` | posle promene substrate upita/indeksa (`WAGGLE_SOAK_FRAMES`, default 20000; `docs/TESTING.md` „Soak lane”) |
| `test:infra` | `vitest run --config vitest.infra.config.ts` | traži živ Postgres 5434 + Redis 6381 (Docker). Nije deo podrazumevanog gate-a. Da li je potreban za v1.2: NEPOZNATO |
| `lint` | `eslint .` | root flat config (eslint 9) |
| `lint:no-invalid-snapshots` | `node scripts/check-no-invalid-snapshots.mjs` | pomoćni lint |
| `ux:contrast`, `ux:color-guard`, `ux:contrast-runtime`, `ux:warm-gate` | `node scripts/ux-gates/*.mjs` | UX gate skripte za UI PR-ove. `ux:contrast-runtime` i `ux:warm-gate` otvaraju živu aplikaciju kroz Playwright: podrazumevano `http://127.0.0.1:3333` (`contrast-runtime.mjs:41`; čita i `/api/workspaces`, `:331`) odnosno `http://127.0.0.1:8080` (`warm-interaction-gate.mjs:58`; uputstvo pominje sidecar na 3333, `:313`). Puštaju se **samo** protiv izolovanog sidecar-a (§9.3), uz `WAGGLE_UX_BASE_URL` (§9.1). Bez te promenljive mogu da čitaju instalirani Waggle na 3333 |

### 6.2 Lokalni root suite

```powershell
npm run test -- --run --maxWorkers=6
```

Ovo je komanda iz DP-0.06 i checklist-e. Zapis iz sesije od 27.09.2026 na mašini od 80 GB: „default parallelism
OOMs this machine”, uz „Fatal process out of memory” i commit charge oko 72/80 GB. Pali fajlovi prolaze
izolovano. Zapis nije reprodukovan za ovaj dokument.

Zapaža se i neslaganje. `vitest.config.ts:28` već postavlja `maxWorkers: 4`, a CI root korak prosleđuje
`--maxWorkers=2` (`ci.yml:86`). §0 DP-0.06 kaže da „CI koristi svoj `vitest.config.ts` `maxWorkers: 4`”, a
`ci.yml` to preklapa sa `--maxWorkers=2`. Zašto zapis kaže da podrazumevana paralelnost pada, a 6 prolazi, iako
je podrazumevana vrednost 4: **NEPOZNATO**. Tech lead treba jednom da izmeri na timskoj mašini i upiše rezultat u
`docs/TESTING.md` kroz PR. Na slabijoj mašini ili pod opterećenjem se spušta na `--maxWorkers=3` (tako je
zabeleženo da sve prolazi), ili se pušta po paketu: `npx vitest run packages/<pkg>`.

Trajanje: oko 11 minuta na referentnoj mašini (zapis, nije reprodukovano). Za vreme run-a važi §11.4.

### 6.3 Kako CI pokreće testove (da lokalno ogledalo bude tačno)

`.github/workflows/ci.yml`, job `test`, Node `22.23.2`:
`npm install` → `build:packages` → `typecheck:web` → `typecheck:server-tests` → `lint` →
`npx tsc -p app/tsconfig.json` → `build:hook-runtime` i build tri paketa za install testove → root `npm test` sa
coverage ratchet-om za `packages/server/src/local/routes/chat*.ts` (statements/lines 94, branches 87,
functions 98), bez 6 package-install runtime testova i sa `--maxWorkers=2` → tih 6 testova serijski
(`--maxWorkers=1 --no-file-parallelism`, `ci.yml:91-101`) → `npm run test -w apps/web` → `npm audit` (informativno).

Tih 6 package-install runtime testova (`packages/cli/tests/cli-runtime.test.ts`,
`packages/marketplace/tests/cli-runtime.test.ts`, `packages/hive-mind-cli/tests/cli-help.test.ts`,
`packages/hive-mind-mcp-server/tests/runtime.test.ts`, `packages/launcher/tests/cli.test.ts`,
`packages/memory-mcp/tests/runtime.test.ts`) prave privremeni projekat i pokreću `npm install` (komentar
`ci.yml:88-90`). Zato traže mrežu i build-ovan `dist`. Lokalni `npm run test -- --run` ih **uključuje**. Kad
padnu lokalno, treba ih pustiti kao CI, serijski i posle `build:hook-runtime`, pre nego što se krivi kod.

### 6.4 E2E i visual (Playwright)

| Skripta | Šta pokreće |
|---|---|
| `test:e2e` | `tests/e2e`, `playwright.config.ts`, chromium, `--retries=0 --timeout=60000` |
| `test:e2e:smoke` | `tests/e2e/user-journeys.spec.ts`, `--grep="J1:\|J2:\|J6:\|J8:\|J-mobile: Settings"` (CI blokirajući smoke, `ci.yml:145-146`) |
| `test:fast` | `tests/e2e` bez `4.9`/`B8.5` |
| `test:visual` | `tests/visual` (baseline-i u `tests/visual/baselines`) |
| `test:all` | svi `*.spec.ts` osim `persona:` |
| `test:retry` | `--last-failed` |

`playwright.config.ts` sam podiže sidecar preko `webServer`: `npm run build:all` pa `tsx … start.ts --skip-litellm`
(`:113-137`). Taj sidecar dobija `WAGGLE_DATA_DIR` = `WAGGLE_E2E_DATA_DIR` ili tmp dir (`:30-46`),
`WAGGLE_PORT` iz ciljnog URL-a, `WAGGLE_TRUST_LOCALHOST=1`, `EMBEDDING_PROVIDER=mock` i prazne Clerk ključeve.
Pre **svakog** E2E run-a obavezno važi izolacija iz §9.4. Bez nje Playwright cilja `127.0.0.1:3333`, a sa
`reuseExistingServer` preuzima server koji već sluša na tom portu, što može biti i instalirani Waggle.
`playwright-e2e.config.ts` ima hardkodovan `baseURL: 'http://localhost:3333'` (`:9`) i nema `webServer`, pa se
ne pokreće bez izolovanog servera na 3333. Ni tada se ne pokreće ako na 3333 sluša instanca osnivača.

---

## 7. Gates pre review-a (DP-0.06)

Na čistom stablu, pod Node `22.23.2`, sve sa exit 0:

```powershell
npm run build:packages
npm run typecheck:server-tests
npm run lint
npm run test -- --run --maxWorkers=6
```

Do merge-a W0-PR20 root suite ide samo u BTP-u (§9.0; §9.5 red 4); ostala tri gate-a mogu i van njega.

Kad PR dira odgovarajuće delove, dodaju se i CI koraci: `npm run typecheck:web`,
`npx tsc --noEmit --project app/tsconfig.json`, `npm run test -w apps/web`. Za UI PR-ove i `npm run test:e2e:smoke`
sa izolacijom iz §9.4.

Exit kod se čita direktno, nikad kroz pipe (§11.3). U PR opis ide SHA na kome je gate pušten.

---

## 8. Test podaci i `.env` (TD-TEST-21)

- [`vitest.setup.ts`](../../vitest.setup.ts) učitava `.env` iz `process.cwd()` (`:74`), ali **preskače svaki
  ključ koji se završava na `_API_KEY`** (`:81`) i ne gazi promenljive koje su već postavljene u shell-u
  (`:84-85`). TD-TEST-21 je zatvoren 2026-09-26 ([`docs/TECH-DEBT.md`](../TECH-DEBT.md)). Razlog: stvarni
  provider ključevi developera su navodili model resolution na živi cloud fallback. Lokalni run se tako razilazio
  od CI-ja, a testovi su mogli da šalju naplative zahteve.
- **Posledica:** infra vrednosti iz `.env` se i dalje učitavaju u testove. To su `DATABASE_URL`, `REDIS_URL`,
  Clerk ključevi, ali i `STRIPE_SECRET_KEY`, `LITELLM_MASTER_KEY` i svaka druga tajna čije se ime ne završava
  na `_API_KEY`. Pravilo (PREDLOG, u skladu sa DP-0.10): root `.env` u agentskom worktree-ju **ne sadrži stvarne
  tajne**. Najbolje ga nema. `.env.example` se ne kopira u `.env` kao celina, jer sadrži `DATABASE_URL`,
  `CLERK_SECRET_KEY=sk_test_...` i `PORT=3100` (`.env.example:41-46`).
- Setup pinuje deterministička podrazumevana podešavanja kad nisu zadata spolja: `WAGGLE_PHASE5_CANARY_PCT=0`
  (`:18`), `WAGGLE_RERANKER=0` (`:26`), `WAGGLE_PROMPT_ASSEMBLER=0` (`:35`), `WAGGLE_CHUNK_RETRIEVAL=0`
  (`:43`), `WAGGLE_TRUST_LOCALHOST=1` (`:52`), `EMBEDDING_PROVIDER=mock` (`:64`) i
  `WAGGLE_SUPPRESS_EMBEDDING_WARNING=1`. Kad su u shell-u postavljene drugačije vrednosti, testovi se ponašaju
  drugačije nego u CI-ju. Shell za testove zato treba da bude čist.
- Server testovi rade nad pravim SQLite-om u privremenom `dataDir`-u. Model se zamenjuje fake provider-om na
  `globalThis.fetch` (`packages/server/tests/helpers/fake-llm-provider.ts`; [`docs/TESTING.md`](../TESTING.md)
  „Pinch points”, „Seam rules”).
- Golden legacy fixture `tests/fixtures/legacy-datadir/` (W0-PR19) je PREDLOG i još ne postoji. Tek on će nositi
  migracione testove MIG-04(A)/MIG-05(i) (DP-0.09, [MIG plan](../plans/WAGGLE-MIGRATIONS-v1.2.md)).

---

## 9. IZOLACIJA runtime-a (DP-0.08, DP-0.10)

Cilj: nijedan dev sidecar, test ni E2E run ne čita i ne piše `~/.waggle`, portove instaliranog Waggle-a ni
konfiguraciju spoljnih klijenata (`~/.claude`, `~/.codex`, Hermes).

### 9.0 Bezbedan test profil (BTP) — obavezan pre prvog sidecar/E2E run-a

Autoritativna definicija je checklist stavka „Bezbedan test profil (BTP)”. Ovde je samo praktičan sažetak.

- **Šta je BTP:** disposable Windows VM ili namenski Windows korisnički nalog napravljen samo za testiranje. U njemu nema tokena, ključeva, podataka ni auth stanja osnivača, ni njihove kopije. Instalirani Waggle ne radi, portovi iz §9.3 koraka 2 su slobodni, a AI klijenti su neprijavljeni ili prijavljeni samo fixture nalozima. Nije mašina ni nalog osnivača.
- **Šta ide samo u BTP:** dev sidecar i web (§9.3), E2E (§9.4), hook/launch/canary (§9.6), root suite (`npm run test`) do merge-a W0-PR20 i svaki run koda revizije `2af0904d` (i generator W0-PR19). Pravilo važi i posle W0-PR20. Ublažavanje traži izmenu DP-0.08 koju odobri osnivač.
- **Priprema:** BTP se pravi van repoa. To je priprema mašine i dozvoljena je i pre odobrenja plana. Način (Hyper-V, cloud VM, lokalni nalog) bira tech lead. VM koja košta ide po pravilu o novcu iz [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) §2. Namenski lokalni nalog ne košta ništa.
- **Scratch profil nije sandbox.** Scratch `HOME`/`USERPROFILE`/`HERMES_HOME` u terminalu sidecar-a i E2E run-a (§9.3 korak 4, §9.4) ostaje obavezan unutar BTP-a, kao dodatni sloj. On preusmerava samo putanje koje idu kroz `os.homedir()` u tom terminalu i njegovim child procesima. Ne preusmerava `%APPDATA%` (Claude Desktop hook, §9.5 red 8), `%LOCALAPPDATA%` (npm cache, Playwright), portove, HKCU (`installMode: "currentUser"`) ni procese van terminala.
- **Dokaz:** snimak pre i posle po §9.5 u pravom profilu BTP naloga. „Sentinel test prolazi” (W0-PR20) nije runtime dokaz izolacije. Runtime potvrda je poseban korak kartice W0-PR20 ([03](03-BACKLOG.md)) i nije urađena.

### 9.1 Env promenljive (provereno u kodu)

| Promenljiva | Ponašanje na `2af0904d` | Dokaz | Dev/test vrednost |
|---|---|---|---|
| `WAGGLE_DATA_DIR` | `option > WAGGLE_DATA_DIR > ~/.waggle`. Prazna vrednost pada na default (`\|\|`) | `packages/server/src/local/service.ts:112-122` | `<scratch>/data-<agent>` |
| `WAGGLE_PORT` | `option > validan WAGGLE_PORT > 3333` (`DEFAULT_PORT = 3333`, `:55`). `start.ts:10` ga prosleđuje | `service.ts:124-131`, `start.ts:10` | ≠ 3333, jedinstven po worktree-ju |
| `PORT` | Teams/cloud server config, default `3100` | `packages/server/src/config.ts:13` | ne postavljati (≠ 3100 ako mora) |
| `WAGGLE_DESKTOP_PORT_FALLBACK` | Postavlja ga Tauri (`"1"`). Sa `=== '1'` sidecar ulazi u managed-desktop režim i traži `WAGGLE_INSTANCE_ID` + apsolutan `WAGGLE_READY_FILE` | `app/src-tauri/src/service.rs:163`, `service.ts:210-224` | **unset** |
| `HIVE_MIND_DATA_DIR` | data dir hook runtime-a. Prolazi u proces spoljnog alata | `packages/hive-mind-core/src/hook-runtime.ts:73`, `packages/agent/src/external-process-env.ts:35` | isti kao `WAGGLE_DATA_DIR` (hook testovi) |
| `WAGGLE_SKIP_LITELLM` | `=== '1'` ili `--skip-litellm` preskače LiteLLM. LiteLLM port je fiksno `4000` i ne podešava se kroz env | `start.ts:6`, `service.ts:207` | `1`, da dva worktree-ja ne dele i ne sudaraju `:4000` |
| `WAGGLE_SIGNAL_EMIT` | opt-in emit signala iz hookova | `packages/hive-mind-hooks-core/src/handlers-core.ts:198` | `0` (DP-0.10) |
| `DATABASE_URL` / `CLERK_SECRET_KEY` | uz `DATABASE_URL` sidecar diže Teams server na `TEAMS_SERVER_PORT` (default `3101`), osim pod `VITEST`/`NODE_ENV=test` | `packages/server/src/local/index.ts:3587-3600` | **unset** |
| `WAGGLE_TRUST_LOCALHOST` | `=== '1'` isključuje bearer token za loopback. Samo za test harness | `security-middleware.ts:704` | unset u dev-u (web dobija token preko `/api/auth/session-token`) |
| `SIDECAR_TARGET` | proxy cilj Vite dev servera za `/api`, `/health`, `/ws`, default `http://127.0.0.1:3333` | `apps/web/vite.config.ts:7` | `http://127.0.0.1:<WAGGLE_PORT>` |
| `WAGGLE_UX_BASE_URL` | cilj UX gate skripti `ux:contrast-runtime` (default `http://127.0.0.1:3333`) i `ux:warm-gate` (default `http://127.0.0.1:8080`, Vite čiji proxy bez `SIDECAR_TARGET` vodi na 3333) | `scripts/ux-gates/contrast-runtime.mjs:41`, `scripts/ux-gates/warm-interaction-gate.mjs:58` | `http://127.0.0.1:<WAGGLE_PORT>` (build-ovan web koji servira izolovani sidecar) ili `http://127.0.0.1:<Vite port>` (npr. 8181, uz `SIDECAR_TARGET` na izolovani sidecar, §9.3) |
| `WAGGLE_E2E_BASE_URL` / `WAGGLE_E2E_PORT` | cilj Playwright-a, default `127.0.0.1:3333`. 17 spec fajlova čita samo `WAGGLE_E2E_BASE_URL` | `tests/vision/_helpers.ts:13-22` | oba = port agenta |
| `WAGGLE_E2E_REUSE_EXISTING_SERVER` | `!== '0'` preuzima server koji već sluša | `playwright.config.ts:57,116` | `0` |
| `WAGGLE_E2E_SKIP_LITELLM` | `!== '0'` dodaje `--skip-litellm` webServer komandi. Sa `'0'` E2E sidecar diže LiteLLM na deljenom `:4000` | `playwright.config.ts:56,114` | unset (§9.4) |
| `WAGGLE_E2E_DATA_DIR` | data dir E2E sidecar-a, inače tmp. Mora biti unset uz `WAGGLE_E2E_SOLO_ONBOARDING=1` | `playwright.config.ts:30-46` | `<scratch>/e2e-<agent>` |
| `HOME`, `USERPROFILE`, `HERMES_HOME` | hook install piše u `opts.home ?? homedir()`. Hermes na Windows-u čita `HERMES_HOME` > `%LOCALAPPDATA%\hermes` | `packages/hive-mind-hooks-hermes/src/paths.ts:72-87`, `external-process-env.ts:8-12` | scratch profil **samo** za terminal/proces dev sidecar-a i E2E run-a (§9.3, §9.4; dodatni sloj unutar BTP-a, §9.0; nije sandbox) i za hook/launch/canary testove (§9.6). Ne ide u `.env.dev.local` (§9.2) i ne postavlja se globalno |
| `VITE_POSTHOG_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_WAGGLE_ENABLE_CLERK` | peku se u Vite bundle. PostHog je podrazumevano opted-in | `apps/web/src/lib/posthog.ts:39,42,51-60`, `apps/web/src/lib/clerk.ts:42-43` | **unset**. `apps/web/.env.local` se ne kopira u agentske worktree-je (DP-0.10). Status ovog reda: NALAZ AUDITA — ZA PROVERU, kao u checklist-i |

Nosioci stanja koje isti `WAGGLE_DATA_DIR` izoluje (DP-0.08): `agent-runs.json`, `personal.mind`,
`workspaces/<id>/workspace.mind`, config, `personas/*.json`, `behavioral-overrides/*.json`, `vault.json`
(`packages/core/src/vault.ts:50`), `marketplace.db` (`local/index.ts:694`), rutine (`CronStore` nad
`personal.mind`, `local/index.ts:585`). Ne izoluje mesta iz §9.5 „Poznata curenja” (popravka W0-PR20).

### 9.2 Per-worktree `.env.dev.local` (primer; PREDLOG)

Sidecar **ne** učitava `.env` sam: u `packages/server/src` nema dotenv loader-a. Fajl se zato prosleđuje
eksplicitno kroz `node --env-file`. Ime `.env.dev.local` gitignore već pokriva (`.gitignore:26` `.env*.local`).
Namerno se ne zove `.env`, jer `vitest.setup.ts` učitava `.env` u testove (§8). Kakav bi efekat imao
`WAGGLE_DATA_DIR`/`WAGGLE_PORT` u test procesima: NEPOZNATO.

```dotenv
# D:\waggle\wt\w0-harn-01\.env.dev.local  — gitignored, NE commitovati, bez tajni
WAGGLE_DATA_DIR=D:/waggle/scratch/w0-harn-01/data
HIVE_MIND_DATA_DIR=D:/waggle/scratch/w0-harn-01/data
WAGGLE_PORT=3341
WAGGLE_SKIP_LITELLM=1
WAGGLE_SIGNAL_EMIT=0
# opciono: bez preuzimanja embedding modela
# EMBEDDING_PROVIDER=mock
#
# NE navoditi (i proveriti da nisu u shell-u, §9.3):
#   WAGGLE_DESKTOP_PORT_FALLBACK, WAGGLE_TRUST_LOCALHOST, DATABASE_URL, CLERK_SECRET_KEY,
#   STRIPE_*, *_API_KEY, WAGGLE_EVOLUTION_AUTO_ENABLED, VITE_POSTHOG_KEY,
#   VITE_CLERK_PUBLISHABLE_KEY, VITE_WAGGLE_ENABLE_CLERK,
#   WAGGLE_INSTANCE_ID, WAGGLE_READY_FILE, WAGGLE_DESKTOP_BOOTSTRAP_TOKEN (managed desktop)
#
# NE ide ovde: USERPROFILE / HOME / HERMES_HOME. USERPROFILE uvek postoji u shell-u,
# a --env-file ne gazi postojeće promenljive, pa bi vrednost iz fajla bila tiho ignorisana.
# Scratch profil se postavlja u terminalu sidecar-a (§9.3, korak 4).
```

Predlog za raspodelu portova: svaki worktree dobija svoj blok, npr. `WAGGLE_PORT` 3341, 3342… i Vite 8181,
8182…. Portovi 3333, 3100, 3101, 4000, 8080 i 11434 ostaju slobodni.

### 9.3 Pokretanje izolovanog sidecar-a i web-a

```powershell
cd D:\waggle\wt\w0-harn-01
fnm use 22.23.2

# 1) Preflight: shell ne sme nositi promenljive koje --env-file NE gazi:
#    sve iz .env.dev.local (§9.2), zabranjene iz §9.2 i managed-desktop promenljive
'WAGGLE_DESKTOP_PORT_FALLBACK','WAGGLE_TRUST_LOCALHOST','DATABASE_URL','CLERK_SECRET_KEY',
'STRIPE_SECRET_KEY','WAGGLE_EVOLUTION_AUTO_ENABLED','VITE_POSTHOG_KEY',
'VITE_CLERK_PUBLISHABLE_KEY','VITE_WAGGLE_ENABLE_CLERK','WAGGLE_DATA_DIR','WAGGLE_PORT',
'HIVE_MIND_DATA_DIR','WAGGLE_SKIP_LITELLM','WAGGLE_SIGNAL_EMIT','EMBEDDING_PROVIDER',
'WAGGLE_INSTANCE_ID','WAGGLE_READY_FILE','WAGGLE_DESKTOP_BOOTSTRAP_TOKEN' |
  ForEach-Object { if (Test-Path "Env:$_") { "UKLONITI iz shell-a: $_" } }
Get-ChildItem Env: | Where-Object Name -like '*_API_KEY' | ForEach-Object { "UKLONITI iz shell-a: $($_.Name)" }

# 2) Portovi slobodni? (3333 = instalirani desktop, app/src-tauri/src/lib.rs:103)
Get-NetTCPConnection -State Listen -LocalPort 3333,3341,3100,3101,4000,8080,8181,11434 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, OwningProcess

# 3) Build, dok terminal još ima pravi profil
npm run build:packages

# 4) Scratch profil SAMO za ovaj terminal i njegove child procese (dodatni sloj unutar BTP-a, §9.0; nije sandbox).
#    Od ovog koraka terminal služi samo za sidecar: bez npm, git i drugih alata; posle rada se zatvara.
$scratchProfile = 'D:\waggle\scratch\w0-harn-01\profile'
New-Item -ItemType Directory -Force $scratchProfile | Out-Null
$env:USERPROFILE = $scratchProfile
$env:HOME = $scratchProfile
$env:HERMES_HOME = Join-Path $scratchProfile 'hermes'
node -e "console.log(require('os').homedir())"   # mora ispisati scratch putanju; inače STOP

# 5) Sidecar (isti ulaz kao Playwright webServer)
node --env-file=.env.dev.local node_modules/tsx/dist/cli.mjs packages/server/src/local/start.ts
#    očekivano u logu: "Server listening on http://127.0.0.1:3341"
```

Kada se promenljive ne navode ni u shell-u ni u fajlu, `start.ts` bira `~/.waggle` i port 3333. Kod `--env-file`
vrednost koja već postoji u shell-u ima prednost nad vrednošću iz fajla. Zato preflight u koraku 1 nije opcion.
Lista pokriva svaku promenljivu iz `.env.dev.local`: shell vrednost bi tiho pregazila, na primer,
`WAGGLE_SIGNAL_EMIT=0` (DP-0.10) ili `HIVE_MIND_DATA_DIR`. Pokriva i managed-desktop promenljive. Sidecar čita
`WAGGLE_INSTANCE_ID`, `WAGGLE_READY_FILE` i `WAGGLE_DESKTOP_BOOTSTRAP_TOKEN` pri startu (`service.ts:211-213`).
Kad je `WAGGLE_INSTANCE_ID` postavljen, `/api/auth/session-token` ide managed-desktop granom i bez Tauri
kredencijala vraća 403 `DESKTOP_BOOTSTRAP_REQUIRED` (`local/index.ts:519-522`, `:2946-2955`).

Korak 4 je obavezan deo recepta unutar BTP-a (§9.0; checklist traži da nijedan run ne dira `~/.waggle`).
Na `2af0904d` `WAGGLE_DATA_DIR` ne pokriva mesta iz §9.5 „Poznata curenja” (popravka W0-PR20). Na Windows-u
`os.homedir()` čita `USERPROFILE`, pa scratch profil preusmerava ona mesta koja idu kroz `os.homedir()`. Ne
preusmerava `%APPDATA%`/`%LOCALAPPDATA%`, portove, HKCU ni procese van ovog terminala, zato nije sandbox i ne
zamenjuje BTP. Provera iz koraka 4 potvrđuje samo da `os.homedir()` u ovom terminalu pokazuje na scratch. Rebuild posle izmene u paketu (§11.9) ide u
drugom terminalu, sa pravim profilom, a sidecar se restartuje u svom. Ako sidecar pod scratch profilom ne radi
(nedostaje konfiguracija, model, alat), rad staje i javlja se tech lead-u. Scratch profil se ne uklanja da bi
sidecar proradio.

Web, u drugom terminalu (`npm run dev` = `cd apps/web && npx vite`; config ima `port: 8080` i `host: "::"`,
što znači slušanje na svim interfejsima, `vite.config.ts:11-12`):

```powershell
$env:SIDECAR_TARGET = 'http://127.0.0.1:3341'
npm run dev -- --host 127.0.0.1 --port 8181 --strictPort
# otvoriti http://127.0.0.1:8181
```

U lokalnom web režimu adapter koristi origin same stranice (`resolveDefaultServerUrl`,
`apps/web/src/lib/adapter.ts:161-173`), a Vite proxy vodi `/api` na `SIDECAR_TARGET`. Ako browser za taj origin
ima `localStorage['waggle:server-url']` (`adapter.ts:363`), ta vrednost ima prednost i može da gađa 3333. Posle
promene porta taj ključ treba obrisati u DevTools. Alternativa bez Vite-a: `npm run build`, pa otvoriti
`http://127.0.0.1:<WAGGLE_PORT>`, jer sidecar servira `<root>/dist` (`local/index.ts:3140-3145`).

Zdravlje: `http://127.0.0.1:3341/health`.

### 9.4 Izolovan E2E run

U **zasebnom** terminalu koji služi samo za ovaj run (preflight i portovi kao u §9.3, koraci 1–2):

```powershell
# E2E preflight, pored §9.3 koraka 1–2
if (Test-Path Env:WAGGLE_E2E_SOLO_ONBOARDING) { 'UKLONITI iz shell-a: WAGGLE_E2E_SOLO_ONBOARDING (solo run: izuzetak ispod)' }
if ($env:WAGGLE_E2E_SKIP_LITELLM -eq '0') { 'UKLONITI iz shell-a: WAGGLE_E2E_SKIP_LITELLM=0 (LiteLLM na deljenom :4000)' }
$env:WAGGLE_E2E_PORT = '3351'
$env:WAGGLE_E2E_BASE_URL = 'http://127.0.0.1:3351'
$env:WAGGLE_E2E_REUSE_EXISTING_SERVER = '0'
$env:WAGGLE_E2E_DATA_DIR = 'D:/waggle/scratch/w0-harn-01/e2e'
# scratch profil kao u §9.3, korak 4 (Playwright ga prosleđuje webServer sidecar-u)
$scratchProfile = 'D:\waggle\scratch\w0-harn-01\profile-e2e'
New-Item -ItemType Directory -Force $scratchProfile | Out-Null
$env:USERPROFILE = $scratchProfile
$env:HOME = $scratchProfile
$env:HERMES_HOME = Join-Path $scratchProfile 'hermes'
node -e "console.log(require('os').homedir())"   # mora ispisati scratch putanju; inače STOP
npm run test:e2e:smoke
```

Scratch profil važi za ceo Playwright proces jer Playwright spaja `process.env` u env `webServer`-a
(`playwright.config.ts:62-64`), a E2E sidecar nema drugi ulaz za `USERPROFILE`. Ako run pod scratch profilom ne
nađe nešto što traži (na primer Chromium ili konfiguraciju alata), run staje i javlja se tech lead-u. Scratch
profil se ne uklanja da bi run prošao.

E2E preflight: `WAGGLE_E2E_SKIP_LITELLM` mora biti unset ili bilo šta osim `'0'`. Sa `'0'` webServer pokreće
sidecar bez `--skip-litellm` i on diže LiteLLM na fiksnom, deljenom `:4000` (`playwright.config.ts:56`, `:114`;
§9.1). `WAGGLE_E2E_SOLO_ONBOARDING` mora biti unset, osim u namernom solo-onboarding run-u (izuzetak ispod).

**npm pod scratch profilom (izuzetak samo za E2E terminal; PREDLOG).** Pravilo „bez npm, git i drugih alata” iz
§9.3 koraka 4 važi za terminal sidecar-a. U E2E terminalu je dozvoljena tačno jedna npm komanda:
`npm run test:e2e:smoke` ili drugi E2E/visual skript iz §6.4. Drugačije ne može. Uz
`WAGGLE_E2E_REUSE_EXISTING_SERVER=0` webServer pri **svakom** run-u izvršava `npm run build:all`, pa tsx, u env-u
Playwright procesa (`playwright.config.ts:114`). To je prihvatljivo, jer `npm run` ovde pokreće samo lokalne skripte (`tsc`, `vite build`, `esbuild`, tsx), bez
instalacije paketa i bez git-a. Ograničenja: korisnički `~/.npmrc` i `~/.gitconfig` se ne čitaju. npm cache
(`%LOCALAPPDATA%\npm-cache`; npm 10.9.8, `@npmcli/config/lib/definitions/definitions.js:81-84`) i Playwright
Chromium (`%LOCALAPPDATA%\ms-playwright`; `playwright-core` 1.63.0, `computeDefaultCacheDirectory`) ostaju
dostupni dok se `LOCALAPPDATA` ne menja. U tom terminalu nema `npm ci`/`npm install`, `npx playwright install` ni
git komandi. Podržan redosled:

1. U terminalu sa pravim profilom: `npm run build:all` i gates (§7), da build greške izađu tamo.
2. U zasebnom E2E terminalu: preflight, scratch profil i `npm run test:e2e:smoke`. webServer build ponavlja i
   posle koraka 1 (limit 10 min, `timeout: 600_000`, `playwright.config.ts:117`).
3. Posle run-a zatvoriti E2E terminal.

`build:all` prepisuje `packages/*/dist` i `<root>/dist` tekućeg worktree-ja. Zato E2E ne ide paralelno sa root
suite-om ni sa rebuild-om istog worktree-ja (§5, §11.4). Dev sidecar istog worktree-ja za to vreme može da
servira prazan `<root>/dist`, jer ga `vite build --emptyOutDir` prvo prazni (`package.json` skript `build`;
`local/index.ts:3140-3145`).

Izuzetak: uz `WAGGLE_E2E_SOLO_ONBOARDING=1` promenljiva `WAGGLE_E2E_DATA_DIR` mora biti **unset**
(`playwright.config.ts:36-44`). E2E port se razlikuje od dev sidecar porta, da se `reuseExistingServer` ne bi
zakačio za dev instancu.

### 9.5 Dokaz da je `~/.waggle` netaknut (pre/posle)

Snimak se pravi pre sesije i posle nje (svi run-ovi, uključujući testove), pa se dva snimka upoređuju. Snimak
„posle” mora biti identičan snimku „pre”. Ako `~/.waggle` ne postoji, mora ostati nepostojeći.

```powershell
function Save-WaggleHomeSnapshot([string]$Out) {
  $w = Join-Path $env:USERPROFILE '.waggle'
  if (-not (Test-Path $w)) { 'ABSENT' | Set-Content $Out; return }
  Get-ChildItem $w -Recurse -Force |
    Sort-Object FullName |
    ForEach-Object {
      if ($_.PSIsContainer) { 'D|{0}' -f $_.FullName }
      else { 'F|{0}|{1}|{2:o}' -f $_.FullName, $_.Length, $_.LastWriteTimeUtc }
    } |
    Set-Content $Out
}
Save-WaggleHomeSnapshot "$env:TEMP\waggle-home-before.txt"
# ... rad, testovi, E2E ...
Save-WaggleHomeSnapshot "$env:TEMP\waggle-home-after.txt"
Compare-Object (Get-Content "$env:TEMP\waggle-home-before.txt") (Get-Content "$env:TEMP\waggle-home-after.txt")
# prazan izlaz = netaknuto
```

Snimak beleži i direktorijume: nov prazan direktorijum (na primer `~/.waggle/security-cache`, §9.5 red 4) je promena.

Isto važi za konfiguraciju spoljnih klijenata (§9.6), koju gate run može da dirne preko hook testova. Snima se tačno ono
što hook installer piše: `settings.json`, `hooks.json` i `config.yaml`, njihove rezervne kopije
`<fajl>.hive-mind-backup.<vreme>` i `hive-mind-install.json` (`packages/hive-mind-hooks-{claude-code,codex,hermes,claude-desktop}/src/paths.ts`; Claude Desktop pod `%APPDATA%\Claude`, `claude-desktop/src/paths.ts:25-29`, a njegov pointer pod `~/.waggle/claude-desktop/` pokriva snimak `~/.waggle`;
`packages/hive-mind-hooks-core/src/paths-core.ts:18-20`). Hermes na Windows-u: `HERMES_HOME`, inače
`%LOCALAPPDATA%\hermes` (`packages/hive-mind-hooks-hermes/src/paths.ts:76-84`). Ostatak `~/.claude` i `~/.codex`
menja sam klijent dok ga developer koristi, pa se ne snima ceo direktorijum (PREDLOG).

```powershell
function Save-ClientConfigSnapshot([string]$Out) {
  $hermes = if ($env:HERMES_HOME) { $env:HERMES_HOME } else { Join-Path $env:LOCALAPPDATA 'hermes' }
  $claudeDesktop = if ($env:WAGGLE_CLAUDE_DESKTOP_CONFIG_DIR) { $env:WAGGLE_CLAUDE_DESKTOP_CONFIG_DIR } else { Join-Path $env:APPDATA 'Claude' }
  $targets = @(
    @{ Dir = Join-Path $env:USERPROFILE '.claude'; Names = 'settings.json*', 'hive-mind-install.json' },
    @{ Dir = Join-Path $env:USERPROFILE '.codex';  Names = 'hooks.json*', 'hive-mind-install.json' },
    @{ Dir = $hermes;                               Names = 'config.yaml*', 'hive-mind-install.json' },
    @{ Dir = $claudeDesktop;                        Names = 'claude_desktop_config.json*' }
  )
  $(foreach ($t in $targets) {
    if (-not (Test-Path $t.Dir)) { "ABSENT|$($t.Dir)"; continue }
    foreach ($n in $t.Names) {
      Get-ChildItem -Path $t.Dir -Filter $n -Force -File |
        ForEach-Object { '{0}|{1}' -f $_.FullName, (Get-FileHash $_.FullName -Algorithm SHA256).Hash }
    }
  }) | Sort-Object | Set-Content $Out
}
Save-ClientConfigSnapshot "$env:TEMP\waggle-clients-before.txt"
# ... rad, testovi, E2E ...
Save-ClientConfigSnapshot "$env:TEMP\waggle-clients-after.txt"
Compare-Object (Get-Content "$env:TEMP\waggle-clients-before.txt") (Get-Content "$env:TEMP\waggle-clients-after.txt")
# prazan izlaz = netaknuto
```

Oba snimka se prave u terminalu sa **pravim** profilom. U terminalu sidecar-a ili E2E run-a (§9.3 korak 4, §9.4)
`$env:USERPROFILE` pokazuje na scratch, pa bi funkcija snimila pogrešan direktorijum.

Na mašini gde radi **instalirani** Waggle, njegov sidecar menja `~/.waggle` nezavisno od razvoja, pa poređenje
ne dokazuje ništa. Zato se dev sidecar, web, E2E, hook/launch/canary run-ovi, root suite do merge-a W0-PR20 i
run-ovi koda revizije `2af0904d` izvršavaju samo u BTP-u (§9.0; checklist „Bezbedan test profil (BTP)”), nikad
na mašini ni nalogu osnivača (DP-0.11). Snimci se prave u pravom profilu BTP naloga.

**Kad poređenje nije odlučujuće ili pokazuje promenu:** rad staje. Nema daljih run-ova dok se uzrok ne utvrdi.
„Nije odlučujuće” znači da je instalirani Waggle radio tokom sesije, da snimak „pre” nedostaje ili da je
snimljen iz terminala sa scratch profilom. Za snimak klijenata to znači i da je developer tokom sesije sam
menjao podešavanja ili hookove tog klijenta. Eskalira se isti dan tech lead-u i Server owner-u, a osnivaču kad je
mogao biti dirnut njegov živi `~/.waggle` ili konfiguracija njegovih klijenata ([02 §10](02-WORKING-AGREEMENT.md), [05 §5](05-RISKS-DECISIONS-ESCALATION.md)).
Rezultat se ne proglašava čistim na osnovu takvog poređenja.

**Poznata curenja mimo `WAGGLE_DATA_DIR`** (čitanje koda na `2af0904d`, 29–30.09.2026; phase-A nalaz ovo ne
pokriva; runtime nije reprodukovan; popravka: W0-PR20, [03](03-BACKLOG.md)):

| # | Mesto | Ponašanje | Status | Pokriva |
|---|---|---|---|---|
| 1 | `packages/server/src/local/routes/documents.ts:37` | `documents.json` se čita i piše uvek pod `os.homedir()/.waggle/workspaces/<id>/`, bez obzira na `dataDir` | POTVRĐENO NA REVIZIJI | W0-PR20 A1 |
| 2 | `packages/server/src/local/routes/pins.ts:32` | isto za `pins.json`; `:id` se ne proverava `assertSafeSegment`-om (`documents.ts:70` ga proverava) | POTVRĐENO NA REVIZIJI; traversal kroz `:id`: NALAZ AUDITA — ZA PROVERU | W0-PR20 A2 |
| 3 | `packages/marketplace/src/installer.ts:47-50`, `:89-91` | install/uninstall piše `skills/`, `plugins/` i `plugins/registry.json` pod `os.homedir()/.waggle`; server pravi installer bez korena (`routes/marketplace.ts:417,581,611`; `routes/capability-proposals.ts:108`); `.mcp.json` prati samo env `WAGGLE_DATA_DIR`, ne `dataDir` opciju | POTVRĐENO NA REVIZIJI | W0-PR20 A3 |
| 4 | `packages/marketplace/src/security.ts:183`, `:222` | `SecurityGate` bez `cache_dir` pravi `os.homedir()/.waggle/security-cache` u konstruktoru; server (`routes/marketplace.ts:291,698,1046`; `installer.ts:118`) i server testovi (npr. `packages/server/tests/local/marketplace-security.test.ts:59`) ga prave bez `cache_dir`, pa to radi i root suite | POTVRĐENO NA REVIZIJI (kod) | W0-PR20 A4 |
| 5 | `packages/agent/src/tool-manifest-loader.ts:141` | bez `dir` čita `os.homedir()/.waggle/adapters/*.json`; sidecar zove `getToolRegistry()` bez `dir` (`routes/tools.ts:408`, `routes/external-tool-runs.ts:201`), pa izolovani sidecar učitava adaptere stvarnog profila | POTVRĐENO NA REVIZIJI (čitanje) | W0-PR20 A5 |
| 6 | `packages/server/src/local/held-action-executor.ts:210-211` | za `workspace_id === null` alati dobijaju `os.homedir()` kao koren | POTVRĐENO NA REVIZIJI (ponašanje); uticaj na izolaciju: NEPOZNATO | W0-PR20 B1 (odluka u PR-u) |
| 7 | `packages/server/src/local/lifecycle.ts:257` | bez `configPath` LiteLLM log `litellm.child.log` ide u `os.homedir()` | POTVRĐENO NA REVIZIJI; recept ga isključuje sa `WAGGLE_SKIP_LITELLM=1` | W0-PR20 B2 |
| 8 | `packages/hive-mind-hooks-claude-desktop/src/paths.ts:25-29`, `:40` | Claude Desktop hook (`hookCapable: true`, `packages/shared/src/tool-detection.ts:136`) piše `%APPDATA%\Claude\claude_desktop_config.json` (bin ne prosleđuje `home`; `APPDATA` prolazi u hook proces, `external-process-env.ts:12`) i pointer `~/.waggle/claude-desktop/hive-mind-install.json` | POTVRĐENO NA REVIZIJI (kod) | nije u W0-PR20 (konfiguracija spoljnog klijenta po dizajnu); BTP i snimak klijenata |

Razrešeno čitanjem (30.09.2026), nije curenje u sidecar toku: `marketplace.db` (`local/index.ts:694`), embedding
`cacheDir` (`core/src/config.ts:436` preko `new WaggleConfig(fullConfig.dataDir)`, `local/index.ts:762`),
reranker (`local/index.ts:791-800`) i rezerve `dataDir || ~/.waggle` u rutama, jer sidecar `dataDir` uvek
razrešava (`service.ts:121`). Čitanje `~/.claude` za harvest (`routes/harvest.ts:282,1045`;
`local/index.ts:1575-1576`), detekcija alata i hook konfiguracija ostalih klijenata su spoljni izvori po
dizajnu: pokriva ih BTP, a ne W0-PR20.

Na Windows-u `os.homedir()` čita `USERPROFILE`. Scratch profil u terminalu sidecar-a i E2E run-a (§9.3 korak 4,
§9.4) zato preusmerava redove 1–7 dok W0-PR20 nije merge-ovan. To je dodatni sloj unutar BTP-a, ne sandbox: ne
preusmerava red 8 (`%APPDATA%`), `%LOCALAPPDATA%` (npm cache, Playwright), portove, HKCU ni druge procese.
Promenljiva se ne postavlja globalno: npm i git tada ne čitaju korisnički `~/.npmrc` i `~/.gitconfig`, a i drugi
alati gube svoju konfiguraciju. Popravka u kodu je W0-PR20, sa sentinel testom. Runtime potvrda posle merge-a
nije urađena (kartica W0-PR20, „Runtime potvrda”).

### 9.6 Hook, launch i canary testovi

`WAGGLE_DATA_DIR` i `HIVE_MIND_DATA_DIR` **ne** izoluju konfiguraciju spoljnih klijenata.
`POST /api/tools/hooks` → `runHookCommand` (`packages/server/src/local/routes/tools.ts:753-766`,
`packages/agent/src/tool-launcher.ts:532-568`) piše u `~/.claude/settings.json`, `~/.codex/hooks.json` i Hermes
`config.yaml`, a Claude Desktop hook `%APPDATA%\Claude\claude_desktop_config.json` (§9.5 red 8), koji scratch profil ne preusmerava. Takvi testovi, kao i `POST /api/tools/launch` (`tools.ts:400`), zato rade samo u BTP-u (§9.0), uz `HOME`/`USERPROFILE` (+ `HERMES_HOME`) na scratch profilu kao dodatni sloj (DP-0.08). Run sa
realnim nalozima ili plaćenim API-jem (P/R/A receipt-i, LoCoMo rerun, B2/B3, GEPA fidelity) ide samo uz
konkretno ODB-01/DQ-04 odobrenje za taj run, na namenskoj VM, sa cap-om zadatim pre starta (DP-0.10).

**Hook testovi u root gate-u (pravilo; PREDLOG, review stavka).** Scratch profil iz prethodnog pasusa važi za
ručne i E2E run-ove preko servera, za launch i za canary testove. Root gate `npm run test -- --run --maxWorkers=6`
(§7) ide u terminalu sa pravim profilom (§9.3 korak 3), a do merge-a W0-PR20 samo u BTP-u (§9.0; §9.5 red 4), a obuhvata sve `packages/*/tests/**/*.test.ts`
(`vitest.config.ts:29-32`). To uključuje `packages/hive-mind-hooks-*/tests`, `packages/hive-mind-core/tests/hook-runtime.test.ts`
i nove RED testove W0-PR10 ([03](03-BACKLOG.md) W0-PR10). Za njih važi:

- Svaki nov ili izmenjen test koji poziva hook `install`/`uninstall`/`verify`/`register`, `resolvePaths` ili
  hook runtime mora proslediti privremeni dom: `opts.home` iz `mkdtemp(join(tmpdir(), …))`, za hook runtime
  `dataDir`. Test ne sme pasti na `homedir()`, `HIVE_MIND_DATA_DIR` ni `HERMES_HOME` procesa. `resolveHermesHome`
  čita `HERMES_HOME` pre `opts.home`, pa mu test prosleđuje i `env` (`packages/hive-mind-hooks-hermes/src/paths.ts:76-77`).
- Tako već rade postojeći testovi, na primer `packages/hive-mind-hooks-claude-code/tests/install.test.ts:17,60`,
  `packages/hive-mind-hooks-hermes/tests/install.test.ts:19,48` i `packages/hive-mind-core/tests/hook-runtime.test.ts:19-26,31-32`
  (mock `homedir` + temp `dataDir`). Route testovi mock-uju `@waggle/agent`
  (`packages/server/tests/tools-routes-launch.test.ts:25`). POTVRĐENO NA REVIZIJI: testovi u
  `packages/hive-mind-hooks-*/tests` bez `tmpdir` ne pozivaju `install(`/`uninstall(`/`homedir`/`writeFile` (grep, 29.09.2026).
- Reviewer to proverava u diff-u kao stavku review-a.
- Gates za PR koji dira hook pakete ili `hook-runtime.ts` se **ne** puštaju pod scratch profilom (§9.3 korak 4).
  Dokaz da gate run nije dirnuo stvarne klijente daje snimak konfiguracije klijenata pre/posle (§9.5). Promena u
  tom snimku posle gate run-a znači da neki test piše u pravi dom: rad staje po §9.5.

---

## 10. Spoljni upisi isključeni po defaultu (DP-0.10)

U svakom dev/test okruženju: `WAGGLE_SIGNAL_EMIT=0`, nema channel tokena (sveži izolovani vault je prazan), nema
Stripe ključeva, nema `DATABASE_URL`/`CLERK_SECRET_KEY`, `WAGGLE_EVOLUTION_AUTO_ENABLED` je unset, konektori
nisu povezani, `WAGGLE_SKIP_LITELLM=1`. Provider ključevi postoje samo za eksplicitno označene BYOK testove sa
fixture nalozima. Nijedan test ne šalje stvarni mejl ili poruku, ne obavlja kupovinu, ne instalira neprovereni
binarni/MCP kod i ne dira `~/.waggle`.

---

## 11. Poznate zamke (iskustva iz ovog repoa)

### 11.1 Pogrešan Node → lažni masovni padovi
Vidi §2. Pre nego što se veruje crvenom run-u, proveriti `node -v` = `v22.23.2` i učitavanje better-sqlite3.

### 11.2 Build izlazi koji nestanu
Zabeleženo 2026-09-26: posle čistog `npm ci` i build-a `packages/{server,waggle-dance,worker,launcher}/dist`
su nestali, a better-sqlite3 je postao ABI 137, bez izmene ijednog praćenog fajla. Uzrok nije utvrđen, a
poklopilo se sa brisanjem većeg broja worktree direktorijuma. Simptomi: `packages/launcher/tests/cli.test.ts`
„runtime help” i `cli-runtime` padaju sa `Could not resolve "@waggle/waggle-dance"` ili
`NODE_MODULE_VERSION 137`. Pre nego što se krivi kod, proveriti da `packages/*/dist` postoji i da better-sqlite3
se učitava pod 22.23.2. Ako nešto od toga padne: `npm rebuild better-sqlite3` (pod 22.23.2), pa
`npm run build:packages`.

### 11.3 Pipe maskira exit kod
`npm run build:packages 2>&1 | tail -5 && echo OK` ispisuje OK i kad build padne, jer je status pipeline-a
status `tail`-a. Treba preusmeriti u log i čitati exit kod:

```bash
npm run build:packages > build.log 2>&1; echo "exit=$?"
```

```powershell
npm run build:packages *> build.log; "exit=$LASTEXITCODE"
```

### 11.4 Izmena koda dok suite radi → lažni crveni rezultat
Vitest globuje fajlove na startu, a čita ih kad dođe do njih. Izmena source-a za vreme run-a zato ulazi u sam
run. Zabeležen je lažni pad koji je odmah posle toga prošao 14/14, i stvaran pad sakriven šumom. Pravilo: prvo
commit, pa `git status` sa samo poznatim prljavim fajlovima, pa run. Tokom run-a samo read-only rad. Izmene u
`docs/TECH-DEBT.md`, `docs/TESTING.md` i `docs/REMOVE-TECHNICAL-DEBT-PLAN.md` su bezbedne, jer ih nijedan test
ne čita. Rezultat se uvek navodi uz SHA na kome je run pušten. Ako je tokom run-a ušao docs-only commit, to se
kaže eksplicitno. **Timeout nije assertion failure**: pre pripisivanja crvenog rezultata sopstvenoj izmeni
pročitati tekst greške. Pod punim opterećenjem padaju hook timeout-i koji izolovano prolaze.

### 11.5 `npm ci` uz zaključane `.node` fajlove
Vidi §4, korak 1. Oporavak oštećenog `node_modules`: `npm install --ignore-scripts`, zatim
`npm rebuild better-sqlite3` (native paketi pod `--ignore-scripts` preskaču postinstall), zatim provera
better-sqlite3 i `npm run build:packages`.

### 11.6 Windows/git: CRLF i skriptovane izmene
Uz `core.autocrlf=true` radna kopija fajla koji je u indeksu LF izlazi kao CRLF. Skripta koja radi
`split('\n')`/`join('\n')` pravi mešane završetke, pa commit menja svaki red, a reviewer ne vidi stvarnu
izmenu. Pre stage-ovanja proveriti `git diff --stat`: sme pokazati samo namerne hunk-ove. Broj CR znakova se
poredi sa verzijom iz indeksa (`tr -cd '\r' < fajl | wc -c`). Višelinijski fajlovi se pišu editorom, ne dugim
heredoc-om u shell-u. `--no-verify` se ne koristi. AI agenti sa hook-om koji skenira ceo string komande
(`block-no-verify`) mogu lažno odbiti `git commit` spojen sa drugom komandom koja ima `-n`, pa `git commit`
treba držati u zasebnoj komandi.

### 11.7 Provera „da li je grana već merge-ovana/zamenjena”
- Sadržaj se čita sa `git show origin/<grana>:<fajl>`, **ne** grep-om po checkout-u koji može biti na bilo kojoj
  grani. Grep po pogrešnoj grani je jednom skoro obrisao 89 novijih linija testova.
- Oznake `+` iz `git cherry` ne znače nov posao: forward-port menja patch-id. Pre cherry-pick-a treba pustiti
  `git range-diff` protiv istoimenog commit-a na cilju i proveriti konačan sadržaj fajla.
- **Produkcioni dokaz** (installer, receipt-i, „main je spreman”) dolazi samo iz **čistog klona + `npm ci`**,
  nikad iz dugoživećeg worktree-ja (§4, korak 5). Zamka: `ln -s X Y`, gde je `Y` postojeći link na direktorijum,
  pravi `X` **unutar** cilja, pa menja tuđi checkout.

### 11.8 CI: Actions budžet i Windows runner
- Job koji „padne” za 3–4 s bez palog koraka i sa 404 log blob-om najčešće nije ni pokrenut. Anotacija run-a
  glasi „The job was not started because an Actions budget is preventing further use” (`gh run view <run>`).
  To nije pad testa. **Re-run je ručno pokretanje workflow-a i spada u owner radnje** (DP-0.11, checklist): tim
  ga ne pokreće sam, nego javlja vlasniku repoa. Predlog TSA-08 (NEODOBRENO): posle potvrde Release owner ili tech lead sme da pokrene re-run neuspelih job-ova
  `ci.yml`/`tauri-build-pr.yml` na timskim granama kad je uzrok zapisan kao infrastrukturni (budžet posle obnove,
  runner, mreža), najviše 2 puta po head SHA, u budžetu koji upiše osnivač. Do potvrde važi zabrana. Kad je budžet tesan, ne otvarati suvišne PR-ove i push-eve.
  Okvirni trošak po push-u PR-a (zapis): ubuntu `test` job 38–46 min, plus verify-windows i dva verify-macos
  job-a.
- Na GitHub Windows runner-u prvi pravi HTTP zahtev iz svežeg `pwsh`-a je spor. Timing testovi PowerShell HTTP
  helper-a zato traže netajmovan warm-up zahtev u istom procesu (fix `bdcaf405`, TD-TEST-14). Lokalno se ne
  reprodukuje.

### 11.9 Sidecar izvršava stari kod
Vidi §5: `@waggle/*` se učitava iz `dist/`. Posle izmene u paketu ide `npm run build:packages`, pa restart
sidecar-a. `tsx` nema watch u ovom toku.

---

## 12. Troubleshooting

| Simptom | Verovatan uzrok | Šta uraditi |
|---|---|---|
| Stotine test fajlova sa `ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION 137` | Node 24 umesto 22.23.2 | `fnm use 22.23.2`, pa provera better-sqlite3 (§2). Nikad `npm rebuild` pod 24 |
| `Could not resolve "@waggle/…"` u launcher/CLI testovima | nedostaje `packages/*/dist` | `npm run build:packages` (§11.2) |
| Lokalni tsc zelen, CI tsc crven | per-package `tsc --noEmit` nad zastarelim `dist/` | `npm run build:packages` (TD-TEST-12) |
| Server test typecheck greška koju `build:packages` ne vidi | `tests/` su van `packages/server/tsconfig.json` | `npm run typecheck:server-tests` |
| `EPERM: unlink … .node` tokom `npm ci`, pa nestali paketi | proces drži native modul | §4 korak 1, oporavak §11.5 |
| „Fatal process out of memory”, pali fork-ovi, fajlovi „dropped” | previše worker-a za RAM mašine | `--maxWorkers=3` ili run po paketu (§6.2). Pale fajlove pustiti izolovano |
| Hook timeout koji izolovano prolazi | opterećenje pod punim suite-om | pročitati tekst greške, ponoviti izolovano (§11.4) |
| Test pao posle izmene za vreme run-a | nestabilno stablo | commit, pa ponovni run na čistom stablu (§11.4) |
| Package-install runtime testovi padaju lokalno | nema mreže, nema build-ovanog `dist`, paralelni cold install | pustiti serijski kao CI (§6.3) posle `build:hook-runtime` |
| Sidecar javlja „Port 3333 is already in use” | radi instalirani Waggle ili druga instanca | ne gasiti tuđu instancu, postaviti `WAGGLE_PORT` (§9.2) |
| Greška „Managed desktop port fallback requires WAGGLE_INSTANCE_ID …” | `WAGGLE_DESKTOP_PORT_FALLBACK=1` nasleđen iz okruženja | ukloniti iz shell-a (§9.3) |
| U logu `[teams-server] …` ili pokušaj konekcije na Postgres | `DATABASE_URL` u env-u | ukloniti `DATABASE_URL` (§9.1, DP-0.10) |
| Web radi, ali pokazuje podatke iz pogrešne instance | `localStorage['waggle:server-url']` ili Vite proxy na 3333 | obrisati ključ u DevTools, postaviti `SIDECAR_TARGET` (§9.3) |
| `401` na `/api/*` iz skripte | D1: loopback nije podrazumevano poverljiv | u skripti uzeti token sa `GET /api/auth/session-token` **uz zaglavlje** `Origin: http://127.0.0.1:<WAGGLE_PORT>` (mora se poklapati sa `Host`, uključujući port), pa slati `Authorization: Bearer …`. Primer: `curl.exe -H "Origin: http://127.0.0.1:3341" http://127.0.0.1:3341/api/auth/session-token`. Bez `Origin`/`Referer` i bez `Sec-Fetch-Site: same-origin` ruta vraća 403 `SESSION_BOOTSTRAP_ORIGIN_MISMATCH` (`packages/server/src/local/index.ts:2939-2962`, `browserBootstrapAuthorityAllowed` `:493-499`, `loopbackAuthorityMatchesRequest` `:472-491`). Radi samo na sidecar-u vezanom za loopback (inače 403 `SESSION_BOOTSTRAP_LOOPBACK_ONLY`) i bez `WAGGLE_INSTANCE_ID` (managed desktop traži Tauri kredencijal, 403 `DESKTOP_BOOTSTRAP_REQUIRED`). Ne uključivati `WAGGLE_TRUST_LOCALHOST=1` u dev-u |
| Playwright „prošao” za sekund, a testira pogrešnu instancu | `reuseExistingServer` preuzeo postojeći server | `WAGGLE_E2E_REUSE_EXISTING_SERVER=0` i jedinstven E2E port (§9.4) |
| `~/.waggle` promenjen posle sesije | curenje mimo `WAGGLE_DATA_DIR` (§9.5) ili pokrenut instalirani Waggle | **stati** i ne puštati dalje run-ove. Poređenje snimaka, identifikacija fajla i eskalacija isti dan tech lead-u i Server owner-u, a osnivaču ako je mogao biti dirnut živi `~/.waggle` (§9.5). Proveriti da je sidecar/E2E terminal imao scratch profil (§9.3 korak 4, §9.4) |
| Dva sidecar-a se „vide” preko LiteLLM-a | oba koriste fiksni `:4000` | `WAGGLE_SKIP_LITELLM=1` (§9.1) |
| Diff menja ceo fajl | CRLF/LF mešavina | §11.6 |
| CI job pao za 3–4 s | Actions budžet | anotacija run-a, javiti vlasniku; re-run samo po TSA-08, posle potvrde (§11.8) |
| `git worktree list` pokazuje „prunable” | nestao direktorijum (npr. čišćenje Temp-a) | na mašini osnivača: **ne** prune, javiti osnivaču (DP-0.02); na timskoj mašini: prune samo ako je TSA-04 potvrđen i `git worktree prune --dry-run -v` navodi isključivo sopstvene unose, inače javiti tech lead-u |
| Putanja predugačka pri `npm ci`/checkout-u | Windows MAX_PATH | kraća osnovna putanja (npr. `D:\waggle\wt\…`). Da li treba `git config core.longpaths true`: NEPOZNATO (na referentnom klonu nije postavljeno) |
| `packages/marketplace/marketplace.db` izmenjen posle testova | zabeleženo da paralelni vitest run-ovi mogu da oštete seed | ne commit-ovati izmenu, vratiti fajl na verziju iz indeksa i ne puštati dva suite-a paralelno u istom worktree-ju. Da li se i dalje javlja: NEPOZNATO |

---

## 13. NEPOZNATO (otvoreno za tech lead-a)

1. Zašto zapis traži `--maxWorkers=6` („default OOMs”) iako `vitest.config.ts:28` već ima `maxWorkers: 4`. CI
   koristi `--maxWorkers=2` (`ci.yml:86`), a ne 4 kako kaže DP-0.06. Izmeriti i upisati u `docs/TESTING.md`
   (prvo merenje na timskoj mašini predlaže TSA-02 t.5, posle potvrde; nije urađeno).
2. Minimalne verzije Git for Windows i Rust/MSVC za lokalni build. CI pinuje samo Rust `1.94.0`.
3. Razrešeno u reviziji 1.2.1 (H-05, čitanje koda na `2af0904d`): sidecar prosleđuje putanju pod `dataDir` za
   marketplace DB (`local/index.ts:694`), embedding `cacheDir` (`core/src/config.ts:436`, `local/index.ts:762`) i
   reranker (`local/index.ts:791-800`). Za `tool-manifest-loader` ne prosleđuje (`routes/tools.ts:408`,
   `routes/external-tool-runs.ts:201`). Taj put, `documents.ts:37`, `pins.ts:32`, `MarketplaceInstaller` i
   `SecurityGate` su u W0-PR20 (§9.5). Runtime nije reprodukovan.
4. Da li je timu potreban `test:infra` (Docker) za v1.2. (`integration/waggle-next` na `origin`-u ne postoji,
   `git ls-remote` 30.09.2026.)
5. Efekat `WAGGLE_DATA_DIR`/`WAGGLE_PORT` u `.env` na vitest procese, `core.longpaths`, i da li se oštećenje
   `marketplace.db` seed-a i dalje javlja.

## Izvori

[`package.json`](../../package.json) (scripts, `engines`, `packageManager`), [`.node-version`](../../.node-version),
[`CLAUDE.md`](../../CLAUDE.md) §1, §2 „Build Commands”, „Verification Commands”, „Windows Solo release commands”,
§7.5; [`AGENTS.md`](../../AGENTS.md) (kanonski ugovor); [`docs/TESTING.md`](../TESTING.md);
[`docs/TECH-DEBT.md`](../TECH-DEBT.md) (TD-ENV-1, TD-TEST-11, TD-TEST-12, TD-TEST-14, TD-TEST-19, TD-TEST-21);
[`vitest.config.ts`](../../vitest.config.ts), [`vitest.setup.ts`](../../vitest.setup.ts),
[`playwright.config.ts`](../../playwright.config.ts), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml),
[`.env.example`](../../.env.example), `apps/web/vite.config.ts`, `apps/web/src/lib/adapter.ts`,
`packages/server/src/local/{service.ts,start.ts,index.ts,security-middleware.ts,origin-guard.ts,routes/documents.ts,routes/pins.ts}`,
`packages/server/src/config.ts`, `packages/server/tsconfig.tests.json`,
`scripts/ux-gates/{contrast-runtime.mjs,warm-interaction-gate.mjs}`, `app/src-tauri/src/service.rs:163`,
`.github/workflows/tauri-build-pr.yml:64`,
`packages/hive-mind-hooks-{claude-code,codex,hermes}/src/paths.ts`, `packages/hive-mind-hooks-core/src/paths-core.ts`,
hook testovi navedeni u §9.6. Van repoa (read-only, 29.09.2026): npm 10.9.8
`@npmcli/config/lib/definitions/definitions.js`, `playwright-core` 1.63.0 (`computeDefaultCacheDirectory`),
`pandoc --version`.
Revizija 1.2.1 (30.09.2026, read-only): `git ls-remote origin`, `gh api repos/marolinik/waggle-os`,
`git config --get branch.docs/waggle-v1.2-planning.remote`, `git worktree list`; kod na `2af0904d`:
`release.yml:46,206`, `packages/marketplace/src/{installer.ts,security.ts}`, `packages/agent/src/tool-manifest-loader.ts`,
`packages/server/src/local/{lifecycle.ts,held-action-executor.ts,routes/marketplace.ts,routes/tools.ts}`,
`packages/hive-mind-hooks-claude-desktop/src/paths.ts`. Paket 1.2.1:
[TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.md) (TSA-02, 03, 04, 08, 09; PREDLOG, NEODOBRENO),
[manifest paketa](../plans/WAGGLE-V1.2-PACKAGE-MANIFEST.md), [HANDOFF-HISTORY](../plans/v1.2-evidence/HANDOFF-HISTORY.md),
[closure zapis](../plans/WAGGLE-V1.2-CLOSURE-RECORD.md) (H-01, H-02, H-04, H-05).
Paket: [delivery plan](../plans/WAGGLE-DELIVERY-PLAN-v1.2.md) §0 (DP-0.01..DP-0.16, uklj. DP-0.13), §6.1;
phase-A [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.md) (F-REL-08);
[SAFE-IMPLEMENTATION checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.md);
[MIG plan](../plans/WAGGLE-MIGRATIONS-v1.2.md); [ADR indeks](../decisions/ADR-INDEX.md);
[brief](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md) §3.
Operativna iskustva (ABI, pipe, stabilno stablo, `npm ci` lock, CRLF, supersession/clean-gate, CI budžet) su
preneta iz projektnih beleški osnivača iz perioda 2026-07-03..2026-09-27 i preformulisana kao timska pravila.
Tamo gde nisu reprodukovana za ovaj dokument, to je naznačeno.

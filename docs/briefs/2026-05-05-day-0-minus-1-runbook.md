# CC Runbook — Day 0 Minus 1: OSS Push Gate + Track A Tag Ceremony

**Brief ID:** `cc-day-0-minus-1-runbook-v2` (amended 2026-05-05 sa NPM republish sekcijom posle CC PM-sync survey nalaza #1)
**Date:** 2026-05-05 (v1) + amendment 2026-05-05 (v2)
**Author:** PM
**Status:** RUNBOOK READY (Marko ratifikovao 2026-05-05 "uradi to sve")
**Stream:** Solo CC sesija (sequential, ne paralelno) — izvršiti dan pre javnog Waggle launch-a
**Wall-clock:** 75-110 min ukupno (30-45 min push gate + 15-20 min NPM republish + 15 min tag ceremony + 10-15 min verifikacija + 10 min rollback drill)
**Cost cap:** $8 hard / $5 halt / $1-3 expected (pure git + npm ops, minimal LLM)
**Authority chain:**
- `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md` (binds Day 0 sequencing)
- `decisions/2026-04-30-branch-architecture-opcija-c.md` (binds OSS subtree split distribution)
- `briefs/2026-04-30-cc-sesija-B-hive-mind-monorepo-migration.md` (predecessor: monorepo migration scope)
- `feedback_sha_verification_discipline` (SHA reference discipline)
- `feedback_dangling_commit_hygiene` (rescue-before-rebase)
- `project_pre_launch_sprint_2026_04_30.md` memory entry (Day 0 ETA window 2026-05-08 do 2026-05-12)

---

## §0 — Pre-flight gates (BLOCKING — must PASS before §1)

### §0.1 — Repo state verification

CC mora dokumentovati u `evidence/2026-MM-DD-day-0-minus-1-evidence.md` (datum trenutka izvršenja):

1. **waggle-os repo state.** Pokrenuti i logovati:
   ```powershell
   cd D:\Projects\waggle-os
   git fetch origin
   git status --short --branch
   git log --oneline -10
   git branch -vv
   git tag --list "v0.1.0-*"
   ```

   **PASS criteria:** `main` u sync-u sa `origin/main` (0 ahead / 0 behind). Ako `main` ahead origin — `git push origin main` PRVI korak pre §1. Ako `main` behind origin — STOP, halt-and-PM, neko je push-ovao van plana.

2. **Verify SHA references su sveže.** Pokrenuti:
   ```powershell
   git rev-parse main
   git rev-parse feature/apps-web-integration
   git rev-parse feature/hive-mind-monorepo-migration
   git rev-parse feature/gaia2-are-setup
   git rev-parse faza-1-audit-r
   foreach ($b in @('oss-hive-mind-cli-export','oss-hive-mind-core-export','oss-hive-mind-mcp-server-export','oss-hive-mind-wiki-compiler-export','oss-hive-mind-shim-core-export','oss-hive-mind-hooks-claude-code-export','oss-hive-mind-hooks-claude-desktop-export','oss-hive-mind-hooks-codex-export','oss-hive-mind-hooks-codex-desktop-export','oss-hive-mind-hooks-cursor-export','oss-hive-mind-hooks-hermes-export','oss-hive-mind-hooks-openclaw-export')) { git rev-parse $b }
   ```

   **Reference SHAs as of 2026-05-05** (verify drift):
   - `main` = `ceeb601` (Clerk dark theme element overrides)
   - `feature/apps-web-integration` = `447f5ac`
   - `feature/hive-mind-monorepo-migration` = `a10867c` (already pushed origin)
   - `feature/gaia2-are-setup` = `104aa5a`
   - `faza-1-audit-r` = `639752e`
   - `oss-hive-mind-cli-export` = `42dfe08`
   - `oss-hive-mind-core-export` = `4f5f885`
   - `oss-hive-mind-mcp-server-export` = `d52ef97`
   - `oss-hive-mind-wiki-compiler-export` = `c60dc11`
   - `oss-hive-mind-shim-core-export` = `4eba6c2`
   - `oss-hive-mind-hooks-claude-code-export` = `149bc69`
   - `oss-hive-mind-hooks-claude-desktop-export` = `12f5322`
   - `oss-hive-mind-hooks-codex-export` = `43e442c`
   - `oss-hive-mind-hooks-codex-desktop-export` = `b45de70`
   - `oss-hive-mind-hooks-cursor-export` = `11195cf`
   - `oss-hive-mind-hooks-hermes-export` = `410f773`
   - `oss-hive-mind-hooks-openclaw-export` = `5002736`

   **PASS criteria:** Sve grane postoje. Ako se SHA-vi razlikuju od reference — to znači da je posle 2026-05-05 bilo dodatnih commit-a, što je legitimno; LOCKED su grane koje postoje, ne tačni SHA-vi. Logovati razlike.

3. **hive-mind javni repo state.** Pokrenuti:
   ```powershell
   cd D:\Projects\hive-mind
   git fetch origin
   git status --short --branch
   git log --oneline origin/master -10
   git tag --list
   ```

   **PASS criteria:** `master` postoji, last push pre 30 dana (per GitHub API created 2026-04-18, last push 2026-04-29). Ako je novije — neko (verovatno Marko) već push-ovao deo OSS sadržaja, prilagoditi §3 plan da ne overwrite-uje.

4. **Dangling commits check** (per `feedback_dangling_commit_hygiene`).
   ```powershell
   cd D:\Projects\waggle-os; git fsck --lost-found
   cd D:\Projects\hive-mind; git fsck --lost-found
   ```

   **PASS criteria:** Nema dangling commit-a. Ako postoji bilo koji — STOP, kreirati `<sprint-name>-archive` granu + push origin pre §1, zatim ponovo verify.

### §0.2 — Authentication verification

CC mora potvrditi da `git push` radi za oba remote-a:

```powershell
cd D:\Projects\waggle-os; git ls-remote origin | Select-Object -First 3
cd D:\Projects\hive-mind; git ls-remote origin | Select-Object -First 3
```

**PASS criteria:** Bez auth promp-a, listings vraćeni. Ako prompt → halt-and-PM, Marko mora obnoviti PAT ili SSH key (per memory `feedback_sha_verification_discipline` napomena 90-day PAT expiry 2026-07-15).

### §0.3 — Working tree čistoća

```powershell
cd D:\Projects\waggle-os; git status --short | Where-Object { $_ -notmatch "^\?\?" }
```

**PASS criteria:** Output prazan ili samo CRLF/whitespace `M` entries (poznati hronični noise iz Windows ↔ Linux mount-a, per `project_execution_state.md`). Ako bilo kakvi pravi tracked changes — STOP, halt-and-PM, neko ima nekomitovan rad.

---

## §1 — Push gate Faza A: hive-mind monorepo grana (5 min)

`feature/hive-mind-monorepo-migration` na SHA `a10867c` već postoji na originu (`origin/feature/hive-mind-monorepo-migration`). Provera:

```powershell
cd D:\Projects\waggle-os
git fetch origin
git log --oneline origin/feature/hive-mind-monorepo-migration -3
```

**Akcije:**

1. Ako `origin/feature/hive-mind-monorepo-migration` SHA = local SHA `a10867c` → ništa ne raditi, napomenuti u evidence "already in sync".
2. Ako local ahead → `git push origin feature/hive-mind-monorepo-migration` i logovati output.
3. Ako local behind → STOP, halt-and-PM (neko je push-ovao van plana, treba review).

**Halt-and-PM signal:** bilo koji push error iz GitHub API (rate limit, auth fail, branch protection rule).

---

## §2 — Push gate Faza B: 12 OSS export grana (15-20 min)

Ovo su subtree split grane koje rebrendiraju istoriju packages-a kao samostalne repo-e za hive-mind javnu distribuciju. Push redosled je bitan zbog dependency hijerarhije.

### §2.1 — Validacija subtree split aktualnosti

Pre push-a, CC mora potvrditi da je subtree split run protiv najsvežijeg `feature/hive-mind-monorepo-migration` SHA. Ako su OSS export grane starije od `a10867c` (per `git log --oneline <branch> -1`), potreban je rerun:

```powershell
cd D:\Projects\waggle-os
foreach ($pkg in @('hive-mind-core','hive-mind-cli','hive-mind-mcp-server','hive-mind-wiki-compiler','hive-mind-shim-core','hive-mind-hooks-claude-code','hive-mind-hooks-claude-desktop','hive-mind-hooks-codex','hive-mind-hooks-codex-desktop','hive-mind-hooks-cursor','hive-mind-hooks-hermes','hive-mind-hooks-openclaw')) {
    $branch = "oss-${pkg}-export"
    Write-Output "=== $branch ==="
    git log --oneline $branch -1
}
```

**Decision rule:** Ako bilo koji branch izlistava SHA stariji od `a10867c` (provera kroz `git merge-base --is-ancestor`), pokrenuti rerun po §2.6 specifikaciji u `briefs/2026-04-30-cc-sesija-B-hive-mind-monorepo-migration.md`. Ako nije specifikovano kao npm script — halt-and-PM, treba ručna procedura.

### §2.2 — Push redosled (zavisnosti naviše)

Push grupe redom da hive-mind javni repo dobija dependencies pre dependents:

**Grupa 1 — core packages (paralelno OK, ali sequential safer):**
```powershell
cd D:\Projects\hive-mind
foreach ($pkg in @('hive-mind-core','hive-mind-cli','hive-mind-mcp-server','hive-mind-wiki-compiler','hive-mind-shim-core')) {
    $sourceBranch = "oss-${pkg}-export"
    $targetBranch = "${pkg}"
    Write-Output "=== Pushing $sourceBranch -> $targetBranch ==="
    git push --force-with-lease "D:\Projects\waggle-os" "${sourceBranch}:refs/heads/${targetBranch}"
    git push origin "${targetBranch}"
}
```

**Grupa 2 — hooks adapters (zavise od core):**
```powershell
cd D:\Projects\hive-mind
foreach ($pkg in @('hive-mind-hooks-claude-code','hive-mind-hooks-claude-desktop','hive-mind-hooks-codex','hive-mind-hooks-codex-desktop','hive-mind-hooks-cursor','hive-mind-hooks-hermes','hive-mind-hooks-openclaw')) {
    $sourceBranch = "oss-${pkg}-export"
    $targetBranch = "${pkg}"
    Write-Output "=== Pushing $sourceBranch -> $targetBranch ==="
    git push --force-with-lease "D:\Projects\waggle-os" "${sourceBranch}:refs/heads/${targetBranch}"
    git push origin "${targetBranch}"
}
```

**NAPOMENA:** Ovaj approach pretpostavlja da hive-mind javni repo trenutno **nema** branches za pojedinačne pakete osim `master`. Ako postoje — treba rebase ili reset, što menja proceduru. CC pre §2.2 mora `git branch -r` u hive-mind repo i evidentirati postojeće remote grane.

**Alternativa ako hive-mind javni repo radi sa monorepo strukturom samo na `master` (per README):** umesto 12 zasebnih grana, push samo monorepo update kroz subtree split direktno u `master`. Tada §2 postaje:

```powershell
cd D:\Projects\hive-mind
git fetch origin
git checkout master
git pull origin master
# Sync packages dirs from waggle-os subtree split outputs
# Procedure depends on which approach the team has commit-ovan u npm scripts
# HALT-and-PM ako npm script za sync nije identifiable iz package.json
```

**Halt-and-PM signal:** `force-with-lease` izbacuje lease check error → znak da je neko drugi push-ovao u međuvremenu, treba reconciliation.

### §2.3 — Verifikacija

Posle svakog push-a, verify na origin-u:
```powershell
cd D:\Projects\hive-mind
git ls-remote origin | Select-String "${pkg}"
```

Logovati svaki push u evidence file.

---

## §2.5 — NPM Republish Faza B.5 (10-15 min)

**ADDED 2026-05-05 v2 amendment** posle CC PM-sync survey nalaza #1: hive-mind v0.1.0 paketi su published 2026-04-18, ali waggle-os subtree split output sadrži Wave-1 §2.4+§2.5+§2.6+§2.7 koji je 8-11 dana noviji. Day 0 javni signal koji upućuje korisnike na `npm install @hive-mind/core` mora da dovede do verzije sa post-Wave-1 sadržajem, ne stale v0.1.0.

### §2.5.1 — Version bump verifikacija

CC mora utvrditi pravu version bump strategiju pre republish-a:

```powershell
cd D:\Projects\hive-mind
foreach ($pkg in @('packages/core','packages/cli','packages/mcp-server','packages/wiki-compiler','packages/shim-core','packages/hooks-claude-code','packages/hooks-claude-desktop','packages/hooks-codex','packages/hooks-codex-desktop','packages/hooks-cursor','packages/hooks-hermes','packages/hooks-openclaw')) {
    if (Test-Path $pkg/package.json) {
        $name = (Get-Content $pkg/package.json -Raw | ConvertFrom-Json).name
        $version = (Get-Content $pkg/package.json -Raw | ConvertFrom-Json).version
        Write-Output "$pkg → $name @ $version"
    } else {
        Write-Output "$pkg → MISSING package.json (post-§2.2 push pending)"
    }
}
```

**Decision rule za version bump:**

- **Patch bump (v0.1.0 → v0.1.1)** ako su izmene: bug fixes, doc updates, dev tooling (postinstall, doctor command).
- **Minor bump (v0.1.0 → v0.2.0)** ako su izmene: new features bez breaking change-a (Apache 2.0 + CONTRIBUTING + Windows Quirks doc + import sweep + new commands).
- **Major bump (v0.1.0 → v1.0.0)** ako su API breaking change-evi.

Po Wave-1 §2.4-§2.7 sadržaju (post-§5.3 substrate test relocation, doctor command, mcp-health-check fix bundle, postinstall script, Apache 2.0 + CONTRIBUTING fajlovi, import sweep), procena je **MINOR bump v0.1.0 → v0.2.0**.

**Halt-and-PM** ako CC pronađe da se radi o breaking API change (major bump). Marko ratify potreban za major bump pre nego što ide na NPM jer to menja semver discipline za sve consumer-e.

### §2.5.2 — Bump version u svim package.json fajlovima

```powershell
cd D:\Projects\hive-mind
foreach ($pkgDir in @('packages/core','packages/cli','packages/mcp-server','packages/wiki-compiler','packages/shim-core','packages/hooks-claude-code','packages/hooks-claude-desktop','packages/hooks-codex','packages/hooks-codex-desktop','packages/hooks-cursor','packages/hooks-hermes','packages/hooks-openclaw')) {
    if (Test-Path "$pkgDir/package.json") {
        # Read, bump version, write back
        $pkgJson = Get-Content "$pkgDir/package.json" -Raw | ConvertFrom-Json
        $pkgJson.version = "0.2.0"
        $pkgJson | ConvertTo-Json -Depth 10 | Set-Content "$pkgDir/package.json"
        Write-Output "Bumped $pkgDir → 0.2.0"
    }
}
```

**ALTERNATIVE:** Ako je hive-mind monorepo conscious sa `npm version` ili `lerna version` ili sličnim alatom, prefer that over manual JSON edit (preserves indentation, lock file). Pokušati prvo:

```powershell
cd D:\Projects\hive-mind
npm version minor --workspaces --no-git-tag-version
```

Ako prolazi — koristi to. Ako ne — fallback manual JSON edit.

**Halt-and-PM** ako:
- `package.json` u nekom paketu fali (subtree split nije sve uvezao)
- Lock file (`package-lock.json`) ne postoji ili je in conflict state
- `npm version --workspaces` izbacuje error koji nije "no workspace config"

### §2.5.3 — Build + test pre publish

```powershell
cd D:\Projects\hive-mind
npm install
npm run build --workspaces --if-present
npm test --workspaces --if-present
```

**PASS criteria:** Sve workspaces build green, sve tests green (ili known-failing acceptable per CC pre-existing 30-test-failure flag, dokumentovati).

**Halt-and-PM** ako bilo koji new test failure (vs poznat baseline 30 failures u `packages/agent/tests/*` i `packages/worker/tests/job-processor.test.ts`).

### §2.5.4 — npm publish

```powershell
cd D:\Projects\hive-mind
npm whoami  # Verify auth
foreach ($pkg in @('packages/core','packages/shim-core','packages/wiki-compiler','packages/cli','packages/mcp-server','packages/hooks-claude-code','packages/hooks-claude-desktop','packages/hooks-codex','packages/hooks-codex-desktop','packages/hooks-cursor','packages/hooks-hermes','packages/hooks-openclaw')) {
    if (Test-Path "$pkg/package.json") {
        Write-Output "=== Publishing $pkg ==="
        cd "D:\Projects\hive-mind\$pkg"
        npm publish --access public
        Start-Sleep -Seconds 3
    }
}
cd D:\Projects\hive-mind
```

**Publish redosled** (zavisnosti naviše):
1. `core` (no deps)
2. `shim-core` (depends on core)
3. `wiki-compiler` (depends on core)
4. `cli` (depends on core)
5. `mcp-server` (depends on core + wiki-compiler)
6. 7 hooks adapters (depend on core + shim-core)

**Verify svaki publish:**
```powershell
foreach ($pkg in @('@hive-mind/core','@hive-mind/shim-core','@hive-mind/wiki-compiler','@hive-mind/cli','@hive-mind/mcp-server','@hive-mind/hooks-claude-code','@hive-mind/hooks-claude-desktop','@hive-mind/hooks-codex','@hive-mind/hooks-codex-desktop','@hive-mind/hooks-cursor','@hive-mind/hooks-hermes','@hive-mind/hooks-openclaw')) {
    npm view $pkg version
}
```

**PASS criteria:** Svi paketi pokazuju 0.2.0 na NPM-u (može biti 1-2 min latencije pre nego što `npm view` reflektuje).

**Halt-and-PM** ako:
- `npm whoami` fail (nije logged in — Marko mora `npm login` first)
- Bilo koji `npm publish` fail (rate limit, auth, version-already-exists, missing files in `files` field)
- Verify sek pokazuje stari version posle 5 min sleep-a (publish lost)

### §2.5.5 — Commit version bump u hive-mind master

```powershell
cd D:\Projects\hive-mind
git add packages/*/package.json package-lock.json
git commit -m "chore(release): bump all packages to 0.2.0

Wave-1 §2.4 + §2.5 + §2.6 + §2.7 sync posle subtree split iz
waggle-os feature/hive-mind-monorepo-migration.

Includes: doctor command, Windows Quirks doc, postinstall script,
Apache 2.0 + CONTRIBUTING files, import sweep + smoke."
git push origin master
```

**Halt-and-PM** ako push fail.

### §2.5.6 — Acceptance gate

NPM republish faza je COMPLETE kad:
1. `npm view @hive-mind/core version` → `0.2.0`
2. Sve ostale 11 paketa isto vrate `0.2.0` na `npm view`
3. `git log origin/master -1` u hive-mind repo-u pokazuje "chore(release): bump all packages to 0.2.0"
4. `npm install @hive-mind/core` u test direktorijumu radi (može quick smoke u temp folder-u)

---

## §3 — Tag ceremony Faza C: Track A freeze tag (5 min)

`feature/apps-web-integration` na SHA `447f5ac` je shipping-ready desktop binary izvor. Pre javnog launch-a treba freeze tag tako da Tauri build pipeline ima stabilan reference point i da naredne iteracije ne zbune build sistem.

```powershell
cd D:\Projects\waggle-os
git checkout feature/apps-web-integration
git fetch origin
git status --short  # mora biti čist

# Verify SHA pre tag-a
$sha = git rev-parse HEAD
Write-Output "Tag target SHA: $sha"

# Kreiraj annotated tag sa release notes
git tag -a v0.1.0-track-a-rc1 -m "Track A apps/web shipping-ready release candidate 1

Pass 7 PASS 9/9 (FR #23-#47) + Block C state restore.
Production backend live sa WAGGLE_PROMPT_ASSEMBLER=1 runtime.
Tour/Wizard Replay + Pending Imports Reminder.

Three P2/P3 friction notes deferred Day-2 backlog (per project_pass7_block_c_closed_2026_05_01).

Predecessor closure memo: decisions/2026-05-05-pass-7-block-c-close.md
Sprint reference: project_pre_launch_sprint_2026_04_30.md Track A
"

# Push tag na origin
git push origin v0.1.0-track-a-rc1

# Verify
git tag --list "v0.1.0-track-a-*"
git ls-remote origin | Select-String "v0.1.0-track-a-rc1"

# Vrati se na main
git checkout main
```

**Halt-and-PM signal:** Tag već postoji (drugi prefix iteracija ili neko je preskočio sequencing).

---

## §4 — Tag ceremony Faza D: hive-mind javni release tag (3 min)

Posle uspešnog §1 i §2, marker tag u hive-mind javnom repo-u za Day 0 launch trenutak:

```powershell
cd D:\Projects\hive-mind
git checkout master
git pull origin master

# Tag latest master HEAD
git tag -a v0.1.0-day-0 -m "hive-mind OSS Day 0 public launch

LoCoMo paper claim #1 LOCKED: 74% trio-strict self-judge > Mem0 paper 66.9%.
GEPA Faza 1 closure: claude::gen1-v1 + qwen-thinking::gen1-v1 deployed.
21 MCP tools, 11 harvest adapters, FTS5+vector hybrid search.
Apache 2.0 license. Egzakta Group d.o.o. copyright 2026.

Distribution: npm @hive-mind/{core,wiki-compiler,mcp-server,cli}
Sister repo: waggle-os (proprietary desktop shell)
Companion: KVARK (enterprise sovereign deployment)
"

git push origin v0.1.0-day-0
git tag --list "v0.1.0-day-0"
```

**Halt-and-PM signal:** Tag već postoji.

---

## §5 — Verification battery (10 min)

Posle §1-§4, kompletan health check:

### §5.1 — waggle-os origin reflection
```powershell
cd D:\Projects\waggle-os
git fetch origin --tags
git branch -r
git tag --list "v0.1.0-*"
```

**PASS criteria:**
- `origin/main` = local `main` (verify `git rev-parse main` == `git rev-parse origin/main`)
- `origin/feature/hive-mind-monorepo-migration` postoji i sinhrono
- Tag `v0.1.0-track-a-rc1` na origin-u
- Postojeći tagovi `v0.1.0-faza1-closure` + `v0.1.0-phase-5-day-0` netaknuti

### §5.2 — hive-mind origin reflection
```powershell
cd D:\Projects\hive-mind
git fetch origin --tags
git branch -r
git tag --list
git log --oneline origin/master -5
```

**PASS criteria:**
- 12 OSS package grane na origin-u (ili confirm da je single-master strategy)
- Tag `v0.1.0-day-0` na origin-u
- `master` HEAD odgovara očekivanom subtree split outputu

### §5.3 — npm packages registry final check

**Posle §2.5 NPM republish faze**, sve 12 paketa moraju da pokazuju `0.2.0` (ili pravi bumped version) kao published version:

```powershell
foreach ($pkg in @('@hive-mind/core','@hive-mind/shim-core','@hive-mind/wiki-compiler','@hive-mind/cli','@hive-mind/mcp-server','@hive-mind/hooks-claude-code','@hive-mind/hooks-claude-desktop','@hive-mind/hooks-codex','@hive-mind/hooks-codex-desktop','@hive-mind/hooks-cursor','@hive-mind/hooks-hermes','@hive-mind/hooks-openclaw')) {
    npm view $pkg version time.modified
}
```

**PASS criteria:** Sve 12 paketa imaju version `0.2.0` (ili koja god je ratifikovana via §2.5.1 odlukom) i `time.modified` od trenutne sesije, ne 2026-04-18 stara. Ako neki paket pokazuje staru verziju ili "Not found" — halt-and-PM, publish je možda partial.

### §5.4 — Final evidence log

Završni `evidence/2026-MM-DD-day-0-minus-1-evidence.md` sadrži:
1. Početni `git status` snapshot za oba repo-a
2. SHA verification table (reference vs actual)
3. Push log per branch (timestamp + result)
4. Tag creation log
5. Final state verification
6. Wall-clock total
7. Cost spend (LLM tokens used by CC)
8. Anomalije i halt-and-PM trenuci (ako bilo)

---

## §6 — Rollback plan (drill OBAVEZAN pre stvarnog izvršenja)

Pre nego što CC krene u §1, izvršiti **dry-run rollback drill** u worktree kopiji da niko ne zaboravi proceduru u real-time-u.

### §6.1 — Rollback Faza A (hive-mind monorepo grana)

Ako je `feature/hive-mind-monorepo-migration` push uneo nešto nedopustivo:
```powershell
cd D:\Projects\waggle-os
git push origin --delete feature/hive-mind-monorepo-migration
# Ili ako treba zadržati granu ali revert SHA:
git push origin +<previous-good-sha>:refs/heads/feature/hive-mind-monorepo-migration
```

### §6.2 — Rollback Faza B (12 OSS export grana)

Najgora situacija: javni repo dobio bad subtree split. Ako je catch within 30 min — `git push --force` sa prethodnim SHA-om je opcija. Ako prošlo 30+ min i komuna detected — STOP, halt-and-PM, treba namernu strategiju (revert commit + announcement).

```powershell
# Per-package rollback (if SHA known)
cd D:\Projects\hive-mind
git push origin +<previous-good-sha>:refs/heads/<package-branch>
```

**WAŽNO:** `--force` na javni OSS repo posle javnog signala (HN post, X thread) je **reputational hit**. Bolje je revert commit nego force-push posle 30 min. Pravilo: do 30 min from push, force-push OK; posle 30 min — revert commit only.

### §6.3 — Rollback Faza C (Track A freeze tag)

```powershell
cd D:\Projects\waggle-os
git push origin --delete v0.1.0-track-a-rc1
git tag -d v0.1.0-track-a-rc1
```

Tag rollback je čist, niska reputational cena.

### §6.4 — Rollback Faza D (hive-mind Day 0 tag)

```powershell
cd D:\Projects\hive-mind
git push origin --delete v0.1.0-day-0
git tag -d v0.1.0-day-0
```

Tag rollback ovde takođe čist; ali ako se tag već reklamirao u marketing materialu, koordinacija sa marketing pre rollback-a.

---

## §7 — Halt-and-PM signali (kada zaustaviti i tražiti Marka)

Bilo koja od sledećih situacija = STOP, halt-and-PM, ne nastavljati bez explicit Marko ratifikacije:

1. **§0 fail.** Bilo koji pre-flight gate fail (auth, dangling commit, working tree dirty, repo state divergira od reference).
2. **Force-with-lease lease check fail.** Neko drugi je push-ovao u međuvremenu.
3. **Rate limit ili auth error iz GitHub API.** Nije sigurno da je svi push-evi prošli.
4. **Subtree split rerun procedura nije identifiable.** Ako §2.1 ne može da odredi kako da regeneriše OSS export grane, halt-and-PM.
5. **hive-mind javni repo branches strategy nepoznata.** §2.2 alternativa, ako ni README ni package.json ne određuju single-master vs multi-branch.
6. **Tag conflict.** Tag već postoji.
7. **Push-error message koji nije rate-limit ili auth** (recimo "branch protection rule violated", "GPG signature required", "invalid signoff") — to je signal da je Marko menjao policy bez PM context-a.

Halt-and-PM message format CC treba da emit:
```
HALT-AND-PM Day-0-minus-1 §<broj>
Reason: <konkretan error / situacija>
Evidence: <link u evidence file za log>
Risk if proceed: <šta ide pogrešno ako se preskoči>
Recommended action: <šta CC misli da Marko treba da uradi>
```

---

## §8 — Wall-clock projection

Realna projekcija (NIJE trigger):
- §0 pre-flight: 10-15 min
- §1 hive-mind monorepo push: 5 min
- §2 12 OSS export grana: 15-25 min (zavisi od subtree split rerun-a)
- §2.5 NPM version bump + republish + commit: 15-20 min (12 paketa × ~1 min publish + verifikacija)
- §3 Track A tag: 5 min
- §4 hive-mind Day 0 tag: 3 min
- §5 verification battery: 10 min
- §6 rollback drill (pre §1): 10-15 min

**Ukupno:** 75-110 min, sa headroom-om do 2.5h ako §2 zahteva subtree split rerun ili §2.5 nailazi na npm rate limit.

**Cost projection:** $1-3 LLM, samo CC reasoning + git/npm ops.

---

## §9 — Post-execution handoff

Posle uspešnog §5, CC update-uje:
1. `evidence/2026-MM-DD-day-0-minus-1-evidence.md` finalan
2. Commit evidence file u `D:\Projects\PM-Waggle-OS\evidence\` (ne waggle-os!)
3. PM (mene) okida sledeća sesija sa preporukom da update-ujem `project_pre_launch_sprint_2026_04_30.md` sa "Day 0 minus 1 EXECUTED [datum]" stavkom.
4. Marko-side queue update: zatvoriti "OSS launch sequence pre Day 0 minus 1 (~30-60 min Track B push gate)" stavku.

---

## §10 — Decision log (PM authoring trace)

Ovaj brief autoring ima sledeće odluke koje su LOCKED:

1. **Sequential, ne paralelno.** Push gate je linearan jer §2 ima dependency redosled (core pre hooks). Mogli bismo §2.1 i §2.2 paralelizovati ali risk recovery je jeftiniji u sequential mode-u.
2. **Force-with-lease, ne force.** Lease check štiti od silent overwrite-a ako je neko drugi push-ovao.
3. **Tag pre Day 0, ne na Day 0.** `v0.1.0-track-a-rc1` i `v0.1.0-day-0` su Day 0 minus 1 ceremony jer Day 0 sam ima 5 paralelnih akcija (per `project_pre_launch_sprint_2026_04_30.md`) i tag ne sme da postane bottleneck.
4. **Rollback drill OBAVEZAN.** Bez drill-a CC ulazi u real-time bez muscle memory za rollback proceduru.
5. **30-minute force-push window pravilo.** Iznad 30 min od push-a, revert commit umesto force-push, jer reputational hit od force-push-a posle javnog signala je trajno.
6. **Halt-and-PM ima 7 trigera.** Uže od "any error" jer benign git messages (npr. "Everything up-to-date") ne smeju da blokiraju execution.

7. **NPM republish u §2.5 ADDED v2 amendment 2026-05-05.** Originalni v1 runbook je propustio NPM version bump + republish, što je značilo da bi Day 0 javni signal upućivao korisnike na stale v0.1.0 (od 2026-04-18) iako waggle-os subtree split sadrži Wave-1 §2.4-§2.7 sadržaj 8-11 dana noviji. Per CC PM-sync survey nalaza #1, ova faza je sad blocking pre tag ceremony §3.

8. **Minor bump v0.1.0 → v0.2.0 ratifikovan** kao default verzioniranje za Wave-1 sadržaj. Major bump traži eksplicitnu Marko ratifikaciju ako CC pronađe breaking API change.

---

**END RUNBOOK.** CC kreće u §0. Halt-and-PM ako bilo šta van scope-a ovog dokumenta.

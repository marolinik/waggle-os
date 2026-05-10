# CC Brief — Sesija B: hive-mind Monorepo Migration + OSS Subtree Split Prep

**Brief ID:** `cc-sesija-b-hive-mind-monorepo-migration-v1`
**Date:** 2026-04-30
**Author:** PM
**Status:** LOCKED (Marko ratifikovao 2026-04-30 "sve yes potvrdjeno", Interpretacija A repo arhitektura)
**Stream:** CC Sesija B (paralelno sa Sesija A + Sesija C)
**Branch:** Kreirati `feature/hive-mind-monorepo-migration` iz `main` (origin/main HEAD `5ec069e`)
**Wall-clock:** 3-5 dana CC implementation (projection NOT trigger)
**Cost cap:** $20 hard / $15 halt / $5-10 expected (mostly file moves + import updates + tests, low LLM spend)
**Authority chain:**
- `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md`
- `decisions/2026-04-30-branch-architecture-opcija-c.md`
- `briefs/2026-04-29-wave1-hooks-cleanup-brief.md` (Wave 1 cleanup execution unutar ovog briefa)
- `feedback_memory_install_dead_simple` (mirror)
- `feedback_integration_sprint_policy` (mirror)
- `feedback_dangling_commit_hygiene` (mirror — primeniti pre svakog branch op-a)

---

## §0 — Pre-flight gates (BLOCKING — must PASS before §1)

### §0.1 — Repo state snapshot

CC mora dokumentovati u `monorepo-migration-evidence.md`:

1. **waggle-os repo state:** all branches pushed na origin (verified 2026-04-30 morning). Tagovi `v0.1.0-faza1-closure` + `v0.1.0-phase-5-day-0` + `faza-1-audit-recompute` branch present.
2. **hive-mind repo state:** `D:\Projects\hive-mind\` postoji sa `master` branch + `feat/sync-to-waggle-os-workflow` + `ship/v0.1.0-ci`. EXTRACTION.md commit `edfa5d7` last sync.
3. **hive-mind-clients status:** verify if `D:\Projects\hive-mind-clients\` exists (postoji u memorija reference; `git status` + `git log --oneline -5` da vidi sadržaj). Ako postoji, identify svi tracked file paths za migraciju.
4. **Dangling commits check:** `git fsck --lost-found` u oba repo-a. Ako bilo koji dangling commit postoji, PRE migracije kreirati `<sprint-name>-archive` branch + push origin (per `feedback_dangling_commit_hygiene`).

### §0.2 — Migration target structure verification

CC mora potvrditi da `D:\Projects\waggle-os\packages\` može primiti `hive-mind-*` packages bez naming konflikata. List existing packages, identify any name collision risk. Ako collision (npr. postoji `packages/core` koji nije isti kao `hive-mind-core`), zaplaniraj rename strategy pre §1.

### §0.3 — Sync mehanizam status

`feat/sync-to-waggle-os-workflow` grana u hive-mind repo postoji (per push 2026-04-30). Verify sync GitHub Actions workflow active na origin/master. Posle migracije, sync mehanizam treba reconfigured ili replaced sa subtree split (per OSS distribution strategy §6).

---

## §1 — Scope declaration

CC migrira sav sadržaj iz dva repo-a (`D:\Projects\hive-mind\` + `D:\Projects\hive-mind-clients\` ako postoji) u **waggle-os monorepo** sa packages/ strukturom:

**Final waggle-os packages/ struktura:**

```
waggle-os/packages/
  agent/                          [postojeći — Waggle agent harness]
  core/                           [postojeći — Waggle core]
  prompt-shapes/                  [postojeći u packages/agent/src — možda standalone]
  benchmarks/                     [postojeći — Faza 1 + Phase 5 evaluation infra]
  hive-mind-core/                 [NEW — substrate sqlite + KG + frame compression]
  hive-mind-cli/                  [MIGRATED iz D:/Projects/hive-mind/packages/cli]
  hive-mind-mcp-server/           [MIGRATED iz D:/Projects/hive-mind/]
  hive-mind-wiki-compiler/        [MIGRATED iz D:/Projects/hive-mind/]
  hive-mind-hooks-claude-code/    [Wave 1 patch, NEW package]
  hive-mind-hooks-cursor/         [Wave 2, stub package za sad]
  hive-mind-hooks-hermes/         [Wave 3, stub package]
  hive-mind-hooks-openclaw/       [Wave 3, stub package]
  hive-mind-hooks-codex/          [Wave 3, stub package]
  hive-mind-hooks-claude-desktop/ [Wave 3, stub package]
  hive-mind-hooks-codex-desktop/  [Wave 3, stub package]
```

**Drop:**
- `D:\Projects\hive-mind\` repo — sadržaj migrira u waggle-os/packages/hive-mind-*. Repo se ne briše fizički (postoji na origin za istoriju), ali se ne razvija dalje.
- `D:\Projects\hive-mind-clients\` repo (ako postoji) — isto, sadržaj migrira u waggle-os/packages/hive-mind-hooks-*.

**OSS distribution:** Posle migracije, `git subtree split` iz waggle-os monorepo periodično emit-uje sadržaj `packages/hive-mind-*/` u zaseban javni GitHub repo `github.com/marolinik/hive-mind` (Apache 2.0, public). Apps/web + apps/agent + drugi proprietary packages ostaju u monorepo waggle-os.

---

## §2 — Implementation plan

### §2.1 — Pre-migration safety (Day 1 morning)

**Task B1:** Backup branches za sva dva izvorna repo-a:
```
cd D:\Projects\hive-mind
git branch hive-mind-pre-migration-archive master
git push origin hive-mind-pre-migration-archive
```
Ako hive-mind-clients postoji, isti pattern.

Acceptance: `git branch --contains <last-master-commit>` shows `hive-mind-pre-migration-archive` na obema repo origin-ima.

**Task B2:** Tag pre-migration state u waggle-os:
```
cd D:\Projects\waggle-os
git tag -a v0.1.0-pre-monorepo-migration main -m "Pre hive-mind monorepo migration baseline"
git push --tags
```

**Task B3:** Branch architecture decision verify reachability za sve relevant SHAs:
- `git merge-base --is-ancestor 6bc2089 main` (gepa-faza-1 in main? probably FALSE, main je Sprint 12)
- `git merge-base --is-ancestor c9bda3d main` (Phase 4.7 in main? probably FALSE)
- `git merge-base --is-ancestor a8283d6 main` (Phase 5 Day 0 in main? FALSE)

Output documents which branches need merge into main pre migration. Per `feedback_integration_sprint_policy`, integration sprint je sad pre-migration concern.

### §2.2 — Tri divergentne grane merge (Day 1 afternoon — Day 2)

Trenutno na waggle-os origin imamo:
- `main` (5ec069e — Sprint 12 Task 1)
- `feature/c3-v3-wrapper` (c9bda3d — Phase 4.7 + uncommitted ee946d1 forward-port already in gepa-faza-1)
- `gepa-faza-1` (6bc2089 — Faza 1 Checkpoint C)
- `phase-5-deployment-v2` (a8283d6 — Phase 5 Day 0)
- `faza-1-audit-recompute` (639752e — audit recompute)
- `sprint-10/task-1.2-sonnet-route-repair` (older work)

**Task B4:** Konsoliduj sve u jedan unified `main` granu pre migracije. Strategy:

1. Pokreni iz `main` (Sprint 12 baseline). Kreni feature granu `feature/integration-pre-monorepo`.
2. `git merge gepa-faza-1` u feature granu. Resolve konflikte u `packages/agent` (verovatno Faza 1 manifest v7 work + Sprint 12 taxonomy work). Test passing posle merge.
3. `git merge phase-5-deployment-v2` u istu feature granu. Resolve conflicts (Phase 5 monitoring + agent loop integration). Test passing.
4. **`feature/c3-v3-wrapper` + `faza-1-audit-recompute`:** content je već u gepa-faza-1 (Faza 1 chain reaches both). Verify sa `git log --oneline gepa-faza-1..feature/c3-v3-wrapper` — ako empty, branches su already merged via gepa-faza-1. Cherry-pick samo ako ima unique commits.
5. `git merge feature/integration-pre-monorepo` u main. Posle merge, push origin/main.

Acceptance: posle merge, `main` ima sve commits iz gepa-faza-1 + phase-5-deployment-v2 + feature/c3-v3-wrapper + faza-1-audit-recompute reachable. `git branch --contains <SHA>` daje "main" za sve key SHAs (6bc2089, a8283d6, c9bda3d, 639752e).

Tests passing 2609 (Phase 5 baseline) + neki dodatni iz integration. Cumulative test count target ~3000+.

### §2.3 — Migracija hive-mind sadržaja (Days 2-3)

**Task B5:** Init `packages/hive-mind-core/` u waggle-os/packages. Copy sadržaj iz `D:\Projects\hive-mind\packages\core\` (ako postoji) ili equivalent substrate code. Update package.json sa Apache 2.0 license header, dependencies tracked.

**Task B6:** Migrate `packages/hive-mind-cli/` iz `D:\Projects\hive-mind\packages\cli\`. Copy file tree, update imports da reference `@waggle/hive-mind-core` umesto `@hive-mind/core` (or whatever current naming is).

**Task B7:** Migrate `packages/hive-mind-mcp-server/`. Same pattern.

**Task B8:** Migrate `packages/hive-mind-wiki-compiler/`. Same pattern.

**Task B9:** Migrate `packages/hive-mind-hooks-claude-code/`. Wave 1 patch (commit cf6e6c5 from previous session) needs to be in package. Verify postinstall script + mcp-health-check.js patch + Windows .cmd shim resolution + dead-simple acceptance criteria per Wave 1 cleanup brief.

**Task B10:** Stub packages za Wave 2/3 hooks (cursor, hermes, openclaw, codex, claude-desktop, codex-desktop). Each package ima:
- `package.json` sa proper name (`@waggle/hive-mind-hooks-<klijent>`), Apache 2.0 license
- `README.md` sa "Coming soon — Wave 2/3" placeholder
- Empty `src/index.ts` koji exports `// TODO: Wave 2/3 implementation`
- `tsconfig.json` minimal

Stubs nisu funkcionalni ali su present u monorepo struktur za buduće implementacije.

### §2.4 — Wave 1 cleanup brief execution (Day 3)

Per `briefs/2026-04-29-wave1-hooks-cleanup-brief.md` LOCKED 2026-04-30:

**Task B11:** Postinstall script u `packages/hive-mind-cli/postinstall.js` koji detect-uje OS + Claude Code plugin presence + applies Windows .cmd shim hook patch ako needed. Cross-platform (no-op na POSIX). Per `feedback_memory_install_dead_simple`, dead-simple cross-platform acceptance criteria: `npm install -g @waggle/hive-mind-cli` + `claude mcp add hive-mind` + first MCP tool call radi bez ENOENT, bez quarantine, bez user manual debugging.

**Task B12:** Upstream PR prep za `everything-claude-code` marketplace. Prepare diff za `mcp-health-check.js::probeCommandServer` Windows .cmd resolution patch. CC ne push-uje upstream PR (Marko može ako želi later), samo prepare diff + git format-patch output u `packages/hive-mind-hooks-claude-code/upstream-pr/`.

**Task B13:** Windows-latest CI test. GitHub Actions workflow `.github/workflows/hive-mind-cli-cross-platform.yml` runs install + smoke (`hive-mind-cli mcp call recall_memory`) na windows-latest + macos-latest + ubuntu-latest. Acceptance: all three pass green bez manual intervention.

**Task B14:** Windows Quirks doc u `packages/hive-mind-cli/docs/WINDOWS-QUIRKS.md`. Contains: npm-global CLIs are .cmd shims, how to clear `mcp-health-cache.json`, how to verify hive-mind health u <10 sec.

**Task B15:** `hive-mind-cli doctor` command. Add to CLI: smoke test (spawn self, save+recall test frame, report fail/pass) bez depending on upstream hook. Output: green ✓ or red ✗ sa actionable error message.

### §2.5 — Apache 2.0 license + CONTRIBUTING.md (Day 4)

**Task B16:** `packages/hive-mind-core/LICENSE` (Apache 2.0). Same za sve packages/hive-mind-*.

**Task B17:** Top-level `packages/hive-mind-core/README.md` sa SOTA claim placeholder (final copy ide iz Day 0 launch comms): substrate ceiling 74% > Mem0 peer-reviewed 66.9%, +27.35pp methodology bias quantification, GEPA-evolved variants +12.5pp on held-out, Qwen 35B = Opus-class out-of-distribution. Reference na arxiv preprint (placeholder URL za sad).

**Task B18:** `CONTRIBUTING.md` u packages/hive-mind-core sa: how to setup dev env, code style (TypeScript strict, biome ili prettier config), pull request guidelines, code of conduct reference.

**Task B19:** Top-level monorepo workspace config update. `D:/Projects/waggle-os/package.json` workspaces array includes svi novi `packages/hive-mind-*`. `pnpm-workspace.yaml` ili Yarn workspaces config update.

### §2.6 — OSS subtree split prep (Day 4)

**Task B20:** Subtree split script u `scripts/oss-subtree-split.sh`. Skripta executes:
```bash
git subtree split --prefix=packages/hive-mind-core --branch=oss-hive-mind-core-export
git subtree split --prefix=packages/hive-mind-cli --branch=oss-hive-mind-cli-export
# ...repeat za sve hive-mind-* packages
```
Posle split, manual push to `github.com/marolinik/hive-mind` repo (Marko-side, Day 0 launch).

**Task B21:** Subtree split test run. Execute skripta, verify `oss-hive-mind-core-export` branch postoji lokalno sa correct sadržajem (samo `packages/hive-mind-core` content, no apps/web ili proprietary code).

**Task B22:** Sync workflow update. Postojeći `feat/sync-to-waggle-os-workflow` u hive-mind repo ne treba više (jer je hive-mind sad u waggle-os monorepo). Mark deprecated u workflow comments. Future sync postaje subtree split → manual push.

### §2.7 — Tests + final acceptance (Days 4-5)

**Task B23:** Update import paths kroz code base. Bilo koji code u apps/web ili packages/agent koji referencirao `@hive-mind/core` ili relative path mora updateovati na `@waggle/hive-mind-core`. CI test catches missing imports.

**Task B24:** Run full test suite. Acceptance: posle migracije + import updates, test suite passes 2609 (Phase 5 baseline) + new tests iz integration sprint + new tests iz hive-mind packages migration. Target ~3500+ tests green.

**Task B25:** tsc clean check. Acceptance: `npm run typecheck` u monorepo root green, no TypeScript errors.

**Task B26:** Smoke test packages/hive-mind-cli. `cd packages/hive-mind-cli && npm install && hive-mind-cli doctor` returns green. End-to-end save_memory + recall_memory probe via CLI verifikuje substrate radi.

**Task B27:** Final commit + emit "PHASE 5 SESIJA B COMPLETE — hive-mind monorepo migration done, OSS subtree split prep ready, Wave 1 cleanup integrated, ~3500+ tests green, ready za Day 0 GitHub push". Push grana origin.

---

## §3 — Halt-and-PM triggers

- §0 sub-gate FAIL (especially §0.1 dangling commits — STOP and create archive branches first)
- Tri grane merge konflikti unsolvable u <4 sata wall-clock (escalate sa specific conflict files)
- Test count regression >5% (>130 tests fail koji su prošli pre migracije)
- Wave 1 cleanup acceptance criteria FAIL (npr. windows-latest CI fail)
- Cost overshoot >$15 (halt) ili >$20 (hard cap)
- Discovery van scope-a (hive-mind-clients repo struktura completely different than expected, hive-mind packages not migratable as-is)

---

## §4 — Acceptance criteria (sve PASS pre §2.7 close)

1. waggle-os/packages/ ima svih 7+ hive-mind-* packages (core, cli, mcp-server, wiki-compiler, hooks-claude-code, + Wave 2/3 stubs)
2. Tri grane (gepa-faza-1, phase-5-deployment-v2, feature/c3-v3-wrapper) merged u main
3. Faza 1 closure tag (`v0.1.0-faza1-closure`) + Phase 5 Day 0 tag (`v0.1.0-phase-5-day-0`) reachable iz main posle merge
4. Test suite green ~3500+ tests
5. tsc clean
6. Wave 1 cleanup acceptance: `npm install -g @waggle/hive-mind-cli` + first MCP tool call radi bez ENOENT na cisto Windows, macOS, Linux VM (CI verifies)
7. `hive-mind-cli doctor` command exists + returns green
8. Apache 2.0 license + CONTRIBUTING.md u svakom hive-mind-* package
9. Subtree split skripta funkcionalan (test run produces correct branches)
10. Sync workflow deprecated (mark u comments)

---

## §5 — Cross-stream dependencies

**Sesija A (apps/web integration) — paralelno:** Sesija A radi na `feature/apps-web-integration` granu. Kad Sesija B finalize-uje monorepo migration u main, Sesija A treba rebase-ovati svoju feature granu na novi main + adapter import paths. Coordinate timing: Sesija B emit-uje "monorepo migration complete" signal koji Sesija A consumes pre svojih §2.6 polish pass.

**Sesija C (Gaia2 setup) — paralelno:** Independent, ne dotice se monorepo migration direktno. Posle migracije, Sesija C može benefit od konsolidovanog substrate (clearer import paths) ali ne blokira ni jedno na drugo.

**Wave 1 cleanup brief — embedded u Sesija B Tasks B11-B15:** Wave 1 brief LOCKED 2026-04-30 izvršava se kao deo Sesija B, ne zaseban brief.

---

## §6 — Audit trail anchors

- Pre-launch sprint consolidation: `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md`
- Branch architecture: `decisions/2026-04-30-branch-architecture-opcija-c.md`
- Wave 1 cleanup brief: `briefs/2026-04-29-wave1-hooks-cleanup-brief.md`
- Memory install dead-simple binding: `D:/Projects/PM-Waggle-OS/memory-mirror/feedback_memory_install_dead_simple.md`
- Integration sprint policy: `D:/Projects/PM-Waggle-OS/memory-mirror/feedback_integration_sprint_policy.md`
- Faza 1 closure: `decisions/2026-04-29-gepa-faza1-results.md`
- This brief: `briefs/2026-04-30-cc-sesija-B-hive-mind-monorepo-migration.md`

---

**End of brief. Awaiting CC kick-off.**

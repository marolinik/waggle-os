# 01 — Development Environment Onboarding (Windows)

> **English translation** of [01-ONBOARDING-DEV-ENV.md](01-ONBOARDING-DEV-ENV.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision: 1.2 DRAFT · 29.09.2026 · reviewed code revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`**

Intended for: the tech lead, developers and QA taking over Waggle from the founder. This document describes how to set up
an isolated development environment on Windows (the primary platform), the order in which to build and test, and which
pitfalls in this repo have already cost time. The commands were verified against [`package.json`](../../package.json),
[`CLAUDE.md`](../../CLAUDE.md) ("Build Commands", "Verification Commands") and [`docs/TESTING.md`](../TESTING.md).
Wherever something could not be verified, it is marked **UNKNOWN**.

> **Implementation status.** The v1.2 implementation **is not approved**. Coding starts only once the founder approves the
> [delivery plan](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md), and the ratifications and approvals from §6.1 of the plan
> (RAT-01..RAT-09, ODB-01, ODB-02) each apply to their own step. Until then this environment serves only for reading code,
> read-only checks and preparation outside the repo (§0.1). All work after approval **must** follow the
> [SAFE-IMPLEMENTATION checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md) (the single source of truth for the do/don't
> list) and rules DP-0.01..DP-0.16 from §0 of the delivery plan. Founder decisions D-01..D-18 (brief §3) are closed and
> this document does not reopen them.

**Status labels** (same as in the package; see the introduction of the [delivery plan](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md)):
DECISION · CONFIRMED AT REVISION · AUDIT FINDING — TO VERIFY · PARTIAL/UNWIRED · PROPOSAL · DEFERRED ·
UNKNOWN. Unless noted otherwise, claims about the code in this document are CONFIRMED AT REVISION: they were read
at `2af0904d` for this document and carry `fajl:linija`. Working rules are PROPOSAL unless a DP or D ID carries them.

---

## 0. Short path

> **Gate.** Until the founder's written approval of the delivery plan ([00 §2](00-START-HERE.en.md)), only §0.1 applies. Everything that
> changes git state (branch, worktree, commit, push), as well as `npm ci`, builds, gates, tests, repro scripts and
> starting the sidecar/web/E2E, waits for that approval, **even in a separate fresh clone on one's own machine**
> ([00 §2 and §6](00-START-HERE.en.md); [02 §0](02-WORKING-AGREEMENT.en.md); [04 §13 item 7](04-CODEBASE-MAP.en.md)). The rule is
> a PROPOSAL of this handoff; the founder confirms it or grants an exception for one's own fresh clone via question (o) in 00 §6,
> and until the answer arrives the prohibition applies. The `integration/waggle-next` branch does not exist as of 29.09.2026 (§3.2) and is not
> to be created before approval. The commands in §3.2–§3.3, §4–§7 and §9.3–§9.4 (except read-only steps 1–2 in §9.3) apply only after approval.

### 0.1 Before plan approval (immediately; aligned with 00 §6, steps 1–2)

1. Read the package per [00 §3](00-START-HERE.en.md) (Day 1 and Day 2), the SAFE checklist in full, and this document. Code is
   read without modification, in a checkout the team has access to or against the revision
   (`git show 2af0904df01ca3d374cc78ba95b60dc579dd6a7a:<putanja>`, `git grep`; [04 §13 item 3](04-CODEBASE-MAP.en.md)).
2. Install the prerequisites from §1 that do not require `node_modules` (PowerShell 7, Git, fnm, Node; Rust/MSVC only for
   desktop work) and switch to Node `22.23.2` (§2): `node -v` = `v22.23.2`, `npm -v` = `10.9.8`. This is
   preparation of a personal machine outside the repo (02 §0). Playwright Chromium (`npx playwright install chromium`) comes after
   approval, together with `npm ci`.
3. Read-only checks: `git rev-parse origin/main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (00 §6 item 1),
   `git worktree list` only as a read operation (§3.1), a shell env preflight (§9.3, step 1) and a check that the founder's instance is not
   listening on 3333 (§9.3, step 2). The server is not started. In addition, a first snapshot of `~/.waggle` (§9.5; reads
   `~/.waggle`, writes only to `%TEMP%`) and a second one after several hours without any dev work: if they differ, an installed Waggle
   is running on that machine, a comparison there does not prove isolation, and the dev sidecar/E2E are not run there (§9.5).
4. Prepare a draft env template per §9.2 and the checklist ("Env isolation", "External writes disabled") **outside the repo**
   (00 §6 item 2). It goes into the worktree as `.env.dev.local` only after approval.
5. List the questions for the founder (00 §6, "Questions for the founder before the start"). The list also includes question (n), alongside (h):
   how the untracked package gets into the repo and onto the integration branch, and who grants the team push (write) rights for
   the `integration/waggle-next` and `<wave-id>/*` branches. The package is untracked today, so this is a blocker for every host
   other than the founder's machine (§3.2).

### 0.2 After the founder's plan approval (00 §2)

1. The tech lead creates `integration/waggle-next` from `2af0904d` in their own new worktree (§3.2; 00 §6 item 3,
   W0-PR0). Then everyone creates their own worktree from that branch (§3.3). Do not touch existing worktrees and stashes.
2. Verify that no node process holds `.node` files, then `npm ci` (§4).
3. `npm run build:packages` (§5).
4. Create a per-worktree `.env.dev.local` with an isolated `WAGGLE_DATA_DIR`/`WAGGLE_PORT` (§9.2) and snapshot
   the "before" state of `~/.waggle` and of the external clients' configuration (§9.5).
5. Run the gates from §7 on a clean tree. Tie the result to the commit SHA.
6. At the end of the day, snapshot `~/.waggle` and the client configuration again ("after") and compare (§9.5).

---

## 1. Prerequisites

| Tool | Version | Why / source | Status |
|---|---|---|---|
| Windows 11 x64 | — | Primary platform. The launch gate is Windows Solo (`CLAUDE.md` §1) | CONFIRMED AT REVISION (document) |
| PowerShell 7 (`pwsh`) | 7+ | Release scripts and certify commands are PowerShell 7 (`CLAUDE.md` "Windows Solo release commands") | CONFIRMED AT REVISION |
| Git for Windows (incl. Git Bash) | UNKNOWN (the repo does not pin a version) | worktree flow (§3). The reference machine has `core.autocrlf=true` (§11.6) | UNKNOWN (minimum version) |
| fnm (Fast Node Manager) | reference machine: `fnm 1.39.0` | Switching to the exact Node; the repo has [`.node-version`](../../.node-version) = `22.23.2` (TD-ENV-1, closed 2026-09-15) | CONFIRMED AT REVISION (`.node-version`); the fnm version is an observation from a single machine |
| Node.js | **`22.23.2`** | `engines.node` is `>=22.19.0` (`package.json`), but the packaged desktop runtime is pinned to `22.23.2` (`CLAUDE.md` §1), and CI uses `node-version: 22.23.2` (`.github/workflows/ci.yml:16`). `better-sqlite3` in `node_modules` is built for ABI 127 (Node 22) | CONFIRMED AT REVISION |
| npm | **`10.9.8`** | `packageManager: "npm@10.9.8"` (`package.json`). Node `22.23.2` on the reference machine ships exactly `npm 10.9.8` | CONFIRMED AT REVISION |
| Rust toolchain + MSVC build tools | CI: `toolchain: 1.94.0` (`.github/workflows/tauri-build-pr.yml:64`) | Only for the desktop build (`npm --prefix app run tauri:build:win`). The repo has no `rust-toolchain` file | CONFIRMED AT REVISION (CI pin); local minimum: UNKNOWN |
| Playwright Chromium | via `@playwright/test ^1.63.0` (root devDependency) | E2E/visual (§6.4). Installation: `npx playwright install chromium` (CI: `--with-deps chromium`, `ci.yml:144`) | CONFIRMED AT REVISION |
| pandoc | **`3.9`** (Delivery §6.1: `pandoc 3.9` on the host; `pandoc --version` on the reference machine 29.09.2026 = `pandoc 3.9`) | Only for doc-only PRs that change the PRD/FRD `.md`; in G1 these are WB-PR1 (FRD table) and the ID-reconcile doc-only PR ([03](03-BACKLOG.en.md)). The DoD requires a fresh DOCX export and new hashes ([02 §9](02-WORKING-AGREEMENT.en.md); [05 §6](05-RISKS-DECISIONS-ESCALATION.en.md)). Command from Delivery §6.1: `pandoc -f gfm-tex_math_dollars-tex_math_gfm <fajl>.md -o <fajl>.docx`. After the export: `Get-FileHash -Algorithm SHA256` for `.md` and `.docx`, and record the hashes in Delivery §6.1 and Disposition OD-9. The DOCX hash changes on every export (`docProps/core.xml` carries the creation time, Delivery §6.1), so it is recorded after every export | CONFIRMED AT REVISION of the package (Delivery §6.1); whether a different pandoc version produces the same DOCX: UNKNOWN |
| Docker, Python, LiteLLM, Ollama | **not required** for the default gate | Docker (Postgres 5434 + Redis 6381) is needed only for `npm run test:infra` (`vitest.config.ts:39-45`). The installed desktop must not depend on any of them (`CLAUDE.md` §1) | CONFIRMED AT REVISION |

RAM: the local root suite is run with `--maxWorkers=6` (DP-0.06). That number comes from an 80 GB machine (§6.2).
On a machine with less memory, the worker count should be lowered (§12).

---

## 2. Node `22.23.2` via fnm

**PowerShell 7** (once, in `$PROFILE`):

```powershell
winget install Schniz.fnm
# u $PROFILE:
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
```

With `--use-on-cd`, fnm reads `.node-version` by itself when entering the repo. Manually:

```powershell
fnm install 22.23.2
fnm use 22.23.2
node -v   # v22.23.2
npm -v    # 10.9.8
```

**Git Bash** (for every longer command):

```bash
eval "$(fnm env --shell bash)" && fnm use 22.23.2 >/dev/null && node -v
```

**Native module check** (from the worktree root, after `npm ci`):

```powershell
node -e "new (require('better-sqlite3'))(':memory:'); console.log('better-sqlite3 OK')"
```

**ABI pitfall (mandatory reading).** If the default fnm Node is 24 (on the reference machine: `v24.19.0 default`),
tests and scripts fail with `ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION 137`. Recorded: 123/236 server test
files red, which looks like a code regression, but the cause is purely the environment ([`docs/TESTING.md`](../TESTING.md) §Test
Strategy). The fix is switching to 22.23.2, **not** `npm rebuild` for Node 24: a rebuild for 24 would silently break the
release contract pinned to 22.23.2. `npm rebuild better-sqlite3` is allowed only under 22.23.2, as a recovery step (§11.2).
On Windows, `fnm exec --using=22.23.2 …` does not work reliably (a silent no-op was recorded), so `fnm use` should be used.

---

## 3. Git: worktrees and branches

### 3.1 What must not be touched

- **Existing worktrees** on the founder's machine: 9 entries from DP-0.02 ([delivery plan §0](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md)).
  They are not deleted, not checked out and not pruned. When an entry becomes "prunable", do **not** run
  `git worktree prune` / `git worktree remove` without the founder's explicit approval.
- After 27.09.2026 there is also the planning docs worktree `D:/Projects/waggle-v12-handoff` (branch
  `docs/waggle-v1.2-planning`, `2af0904d`) that carries this package. Leave it untouched as well. Source:
  `git worktree list`, 29.09.2026.
- **Stashes** `stash@{0}` and `stash@{1}` (DP-0.03): no `stash pop/drop/apply`.
- **Git prohibitions** (DP-0.11, DP-0.12; [checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md) "Absolute prohibitions"):
  no merge into `main`, no force-push, no `git tag v*` and no pushing of tags (`release.yml:12-15` triggers on
  every `v*` tag), no manual triggering or re-running of workflows, no changes to repo/org settings.
- Pitfalls when re-running CI: §11.8.

### 3.2 Integration branch (once; tech lead; only after plan approval)

DP-0.04 is a PROPOSAL: `integration/waggle-next` is created from `2af0904d` in **their own new worktree**, not in
`D:/Projects/waggle-os`. State as of 29.09.2026: the local clone has neither a local nor a remote-tracking reference
`integration/waggle-next`, which means the branch has not been created yet. State on origin without a fetch: UNKNOWN.
The paths below are a PROPOSAL.

```powershell
# Timska mašina: svež klon (repository.url iz package.json)
git clone https://github.com/marolinik/waggle-os.git D:\waggle\waggle-os
git -C D:\waggle\waggle-os rev-parse origin/main       # uporediti sa 2af0904df01ca3d374cc78ba95b60dc579dd6a7a

git -C D:\waggle\waggle-os worktree add -b integration/waggle-next D:\waggle\wt\integration 2af0904df01ca3d374cc78ba95b60dc579dd6a7a
git -C D:\waggle\wt\integration push -u origin integration/waggle-next    # nov branch, bez --force
```

On the founder's machine, the same `worktree add` is run with `git -C D:/Projects/waggle-os …` and a target directory **outside**
`D:/Projects/waggle-os`. The first PR on the integration branch adds `integration/**` to `ci.yml`
(`on.push.branches`, `on.pull_request.branches`; today `ci.yml:3-6` = only `[main]`) and to `tauri-build-pr.yml`,
and does not touch `release.yml` (DP-0.07). Until that PR lands, the integration branch has no CI.

> **Blocker for every host other than the founder's machine.** The entire package (PRD/FRD v1.2, delivery plan, checklist, draft ADRs,
> evidence and all of `docs/handoff/`) is **untracked** as of 29.09.2026 in `D:/Projects/waggle-v12-handoff` (branch
> `docs/waggle-v1.2-planning`; [00 §1](00-START-HERE.en.md) "Where the package physically lives"; `git status`, read-only) —
> CONFIRMED AT REVISION. A fresh clone of `marolinik/waggle-os` from the recipe above therefore contains none of the package
> documents, and all relative links in it are broken. The package must also be on the integration branch for two steps of the
> plan: recording decisions into the package documents via a doc-only PR ([02 §10](02-WORKING-AGREEMENT.en.md), item 4) and WB-PR1, which
> extends the FRD ([03](03-BACKLOG.en.md) WB-PR1; 03 §7 N-07). Repo visibility: the documents say private
> (`CLAUDE.md:84`, `AGENTS.md:68` "remains private"), but a live check on 27.09.2026 found `marolinik/waggle-os`
> **public** (DP-0.13; F-REL-08 in [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.en.md): `gh api` →
> `private:false`, unauthenticated `curl` → HTTP 200) — AUDIT FINDING — TO VERIFY (DQ-02). This document
> does not change visibility (DP-0.13). If the live state is accurate, the clone from the recipe above needs no special access.
> Something else remains open: `push -u origin integration/waggle-next` and pushing `<wave-id>/*` branches require write rights
> on the repo, and it is not recorded who grants them to the team or how. The founder decides how and when the package is committed; today
> that is UNKNOWN. **Question for the founder:** how does the untracked package get into the repo and onto `integration/waggle-next` before
> the start of W0, and who grants the team push (write) rights, and how. This is question (n) in the list "Questions for
> the founder before the start" in [00 §6](00-START-HERE.en.md), alongside (c), (d) and (h), and it is cited in §0.1 item 5. Until the answer
> arrives, a team on another host can execute neither 00 §6 item 1 ("Access to the repo and the package") nor this document.

### 3.3 One worktree per developer/agent

DP-0.05 and the checklist prescribe one short-lived branch per task and one worktree per parallel agent. The branch
name is `<wave-id>/<tema>`, and the allowed prefixes are `w0`–`w8`, `w3e`, `wb`, `oss`, `b1`–`b3`. The branch targets
`integration/waggle-next`, never `main`.

```powershell
git -C D:\waggle\waggle-os fetch origin
git -C D:\waggle\waggle-os worktree add -b w0/harn-01-verify-default D:\waggle\wt\w0-harn-01 origin/integration/waggle-next
cd D:\waggle\wt\w0-harn-01
fnm use 22.23.2
npm ci                         # svaki worktree ima SVOJ node_modules (§4)
```

Daily sync, at least once a day (DP-0.06):

```powershell
git -C D:\waggle\wt\w0-harn-01 fetch origin
git -C D:\waggle\wt\w0-harn-01 merge origin/integration/waggle-next
```

Once the branch has been pushed, it is synced by **merge**. Rebasing an already pushed branch requires a force-push, which is
prohibited (DP-0.11). Rebase is an option only before the first push.

Whether one's own `<wave-id>/*` worktree may be removed (`git worktree remove <putanja>`) after the PR is merged:
UNKNOWN, a question of interpreting a checklist item, for the founder. The checklist ("I work in my own worktree …") says
"no existing entry is deleted, checked out or pruned" and does not exempt one's own worktree, and the team does not interpret that
item on its own ([02 §2.2](02-WORKING-AGREEMENT.en.md)). Until the founder decides per [02 §10](02-WORKING-AGREEMENT.en.md),
no entry from `git worktree list` is removed, not even one's own. `git worktree prune` is never run (DP-0.02).

### 3.4 Hotspot files and the OSS substrate

Before the first PR, read DP-0.14: hotspot files are merged only through the role owner, and two hotspot merges
on the same day happen only with an integration test. Also read `CLAUDE.md` §7.5: changes to
`packages/hive-mind-core/src/{mind,harvest}/**` go into the monorepo first, the OSS mirror receives only a curated
forward-port, a raw subtree push is prohibited, and before an OSS release `node scripts/oss-drift-check.mjs <mirror>` is run.

---

## 4. Installing dependencies

1. **Check processes before `npm ci`.** On Windows, a process that holds a loaded `.node` file blocks deletion, and
   `npm ci` deletes `node_modules` first. The result is a half-deleted tree: `EPERM: unlink …*.node`, and `typescript`
   and other packages disappear.

   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId, CommandLine
   ```

   Kill only processes from your **own** worktree, never anyone else's and never the installed Waggle sidecar.
2. **Installation:**

   ```powershell
   npm ci
   ```

   CI uses `npm install` (`ci.yml:30`). The local and release paths use `npm ci`
   (`CLAUDE.md` "Windows Solo release commands").
3. **Only for the desktop (Tauri) build:**

   ```powershell
   npm ci --prefix app --ignore-scripts
   ```

4. **Syncing the lockfile without touching `node_modules`** (e.g. after removing a dependency):
   `npm install --package-lock-only`, then `npm ci --dry-run` as a check.
5. **Post-install check:** better-sqlite3 (§2), then the workspace package junctions must point into
   the **same** worktree:

   ```powershell
   Get-ChildItem node_modules\@waggle | Select-Object Name, LinkType, Target
   ```

   Every `Target` must be under the root of the current worktree. With long-lived worktrees it has been recorded that
   `node_modules/@waggle/*`, and even `apps/web/node_modules`, point into a **different** checkout on another branch.
   The gates then test the wrong `dist` and produce both false failures and false passes. `node_modules` is never
   copied or linked between worktrees.
6. `packages/hive-mind-cli` has a `postinstall` (`node postinstall.cjs`, Windows `.cmd` shim fix,
   `packages/hive-mind-cli/package.json:31`). The root `package.json` has no `prepare`/`postinstall`, and the repo has no
   `.husky`.

---

## 5. Build order

| Step | Command (script from `package.json`) | What it does | Note |
|---|---|---|---|
| 1 | `npm run build:packages` | `tsc --build` chain: `shared → waggle-dance (--force) → hive-mind-core → core → weaver → wiki-compiler → marketplace → agent → server → worker (npm run build)` | **The only authoritative local typecheck** for changes that cross packages (TD-TEST-12). `npx tsc --noEmit --project packages/<pkg>/tsconfig.json` resolves sibling packages through the already built `dist/`, so it passes against stale declarations while CI fails |
| 2 | `npm run typecheck:server-tests` | `tsc --noEmit -p packages/server/tsconfig.tests.json` | `packages/server/tsconfig.json` excludes `tests/`, so `build:packages` does not check the tests. At `2af0904d` this step covers **every** server test file, without exception: `packages/server/tsconfig.tests.json` has `"exclude": ["node_modules", "dist"]`, and `start-trial.test.ts` has been removed from the exclude list (TD-TEST-19, CLOSED 2026-09-26). The comment in `ci.yml:45-46` ("excludes only start-trial.test.ts") is stale. No file is added to `exclude` to turn red into green (TD-TEST-11; header of `tsconfig.tests.json`) |
| 3 | `npm run typecheck:web` | `tsc --noEmit -p apps/web/tsconfig.app.json` | CI step `ci.yml:41-42` |
| 4 | `npx tsc --noEmit --project app/tsconfig.json` | Tauri TS tooling (`app/scripts`) | Standard `tsc`, CI step `ci.yml:53-54`, `CLAUDE.md` "Verification Commands" |
| 5 | `npm run build` | typecheck of **only `apps/web`**, then `vite build` into `<root>/dist` | Does not check the packages or the server |
| — | `npm run build:all` | `build:packages` + `build` | This is also what the Playwright `webServer` runs (`playwright.config.ts:113-114`) |
| — | `npm run build:hook-runtime` | `node scripts/build-hook-runtime.mjs` | CI runs it before the package-install runtime tests (`ci.yml:58-62`) |

**Why `build:packages` must run after every change in a package:** the sidecar is started via `tsx` (transpile-only):
`npm run dev:server` = `cd packages/server && npx tsx src/local/start.ts`. Type errors in server routes therefore
go unnoticed. When `build:packages` is not run, such an error reaches CI. `CLAUDE.md` records
a case from 2026-05-28. In addition, `@waggle/*` packages resolve through `dist/` (`"main": "dist/index.js"` in
`packages/{core,agent,shared,hive-mind-core}/package.json`). After a change in, for example, `packages/agent/src`, the dev
sidecar therefore executes **old** code until `build:packages` is re-run.

Desktop build (only for installer work, W8/F1–F3; not the everyday flow):
`npm --prefix app run tauri:build:win` (script `tauri:build:win` in `app/package.json`). Signing and release
paths are prohibited (DP-0.11, `CLAUDE.md` "Production signing is hosted-only"). `certify-windows-installer.ps1`
is run only on a dedicated VM or a disposable Windows account, never on the founder's account (checklist, item
"Where installer/packaged tests are executed").

---

## 6. Tests

### 6.1 Commands

| Script | Command from `package.json` | Purpose |
|---|---|---|
| `test` | `vitest run` | Root deterministic gate (`vitest.config.ts`: `pool: 'forks'`, `maxWorkers: 4`, `testTimeout`/`hookTimeout` 30 s; `apps/**`, infra, `packages/server/tests/performance/**` and `packages/hive-mind-core/tests/soak/**` are excluded) |
| (workspace) | `npm run test -w apps/web` | `apps/web` suite (its own `apps/web/vitest.config.ts`, jsdom). The root gate does **not** run it, so it is run separately (`ci.yml:105-106`) |
| `test:watch` | `vitest` | local, interactive |
| `test:critical` | `vitest run --config vitest.critical.config.ts --coverage` | critical set with coverage |
| `test:perf` | `vitest run --config vitest.perf.config.ts` | wall-clock budgets in a separate lane |
| `test:soak` | `vitest run --config vitest.soak.config.ts` | after a change to substrate queries/indexes (`WAGGLE_SOAK_FRAMES`, default 20000; `docs/TESTING.md` "Soak lane") |
| `test:infra` | `vitest run --config vitest.infra.config.ts` | requires a live Postgres 5434 + Redis 6381 (Docker). Not part of the default gate. Whether it is needed for v1.2: UNKNOWN |
| `lint` | `eslint .` | root flat config (eslint 9) |
| `lint:no-invalid-snapshots` | `node scripts/check-no-invalid-snapshots.mjs` | auxiliary lint |
| `ux:contrast`, `ux:color-guard`, `ux:contrast-runtime`, `ux:warm-gate` | `node scripts/ux-gates/*.mjs` | UX gate scripts for UI PRs. `ux:contrast-runtime` and `ux:warm-gate` open the live app via Playwright: by default `http://127.0.0.1:3333` (`contrast-runtime.mjs:41`; also reads `/api/workspaces`, `:331`) and `http://127.0.0.1:8080` respectively (`warm-interaction-gate.mjs:58`; the instructions mention a sidecar on 3333, `:313`). They are run **only** against an isolated sidecar (§9.3), with `WAGGLE_UX_BASE_URL` (§9.1). Without that variable they can read the installed Waggle on 3333 |

### 6.2 Local root suite

```powershell
npm run test -- --run --maxWorkers=6
```

This is the command from DP-0.06 and the checklist. A record from the 27.09.2026 session on an 80 GB machine: "default parallelism
OOMs this machine", with "Fatal process out of memory" and a commit charge of about 72/80 GB. The failed files pass
in isolation. The record was not reproduced for this document.

There is also a discrepancy. `vitest.config.ts:28` already sets `maxWorkers: 4`, while the CI root step passes
`--maxWorkers=2` (`ci.yml:86`). §0 DP-0.06 says that "CI uses its own `vitest.config.ts` `maxWorkers: 4`", but
`ci.yml` overrides that with `--maxWorkers=2`. Why the record says the default parallelism fails while 6 passes, even though
the default value is 4: **UNKNOWN**. The tech lead should measure this once on a team machine and record the result in
`docs/TESTING.md` via a PR. On a weaker machine or under load, lower it to `--maxWorkers=3` (with that, everything was
recorded as passing), or run per package: `npx vitest run packages/<pkg>`.

Duration: about 11 minutes on the reference machine (record, not reproduced). During the run, §11.4 applies.

### 6.3 How CI runs the tests (so the local mirror is accurate)

`.github/workflows/ci.yml`, job `test`, Node `22.23.2`:
`npm install` → `build:packages` → `typecheck:web` → `typecheck:server-tests` → `lint` →
`npx tsc -p app/tsconfig.json` → `build:hook-runtime` and a build of three packages for the install tests → root `npm test` with
a coverage ratchet for `packages/server/src/local/routes/chat*.ts` (statements/lines 94, branches 87,
functions 98), without the 6 package-install runtime tests and with `--maxWorkers=2` → those 6 tests serially
(`--maxWorkers=1 --no-file-parallelism`, `ci.yml:91-101`) → `npm run test -w apps/web` → `npm audit` (informational).

Those 6 package-install runtime tests (`packages/cli/tests/cli-runtime.test.ts`,
`packages/marketplace/tests/cli-runtime.test.ts`, `packages/hive-mind-cli/tests/cli-help.test.ts`,
`packages/hive-mind-mcp-server/tests/runtime.test.ts`, `packages/launcher/tests/cli.test.ts`,
`packages/memory-mcp/tests/runtime.test.ts`) create a temporary project and run `npm install` (comment
`ci.yml:88-90`). They therefore require network access and a built `dist`. The local `npm run test -- --run` **includes** them. When they
fail locally, they should be run the way CI does, serially and after `build:hook-runtime`, before blaming the code.

### 6.4 E2E and visual (Playwright)

| Script | What it runs |
|---|---|
| `test:e2e` | `tests/e2e`, `playwright.config.ts`, chromium, `--retries=0 --timeout=60000` |
| `test:e2e:smoke` | `tests/e2e/user-journeys.spec.ts`, `--grep="J1:\|J2:\|J6:\|J8:\|J-mobile: Settings"` (CI blocking smoke, `ci.yml:145-146`) |
| `test:fast` | `tests/e2e` without `4.9`/`B8.5` |
| `test:visual` | `tests/visual` (baselines in `tests/visual/baselines`) |
| `test:all` | all `*.spec.ts` except `persona:` |
| `test:retry` | `--last-failed` |

`playwright.config.ts` brings up the sidecar itself via `webServer`: `npm run build:all`, then `tsx … start.ts --skip-litellm`
(`:113-137`). That sidecar gets `WAGGLE_DATA_DIR` = `WAGGLE_E2E_DATA_DIR` or a tmp dir (`:30-46`),
`WAGGLE_PORT` from the target URL, `WAGGLE_TRUST_LOCALHOST=1`, `EMBEDDING_PROVIDER=mock` and empty Clerk keys.
Before **every** E2E run, the isolation from §9.4 is mandatory. Without it, Playwright targets `127.0.0.1:3333`, and with
`reuseExistingServer` it takes over a server already listening on that port, which may even be the installed Waggle.
`playwright-e2e.config.ts` has a hardcoded `baseURL: 'http://localhost:3333'` (`:9`) and no `webServer`, so it is
not run without an isolated server on 3333. Even then it is not run if the founder's instance is listening on 3333.

---

## 7. Gates before review (DP-0.06)

On a clean tree, under Node `22.23.2`, all with exit 0:

```powershell
npm run build:packages
npm run typecheck:server-tests
npm run lint
npm run test -- --run --maxWorkers=6
```

When a PR touches the relevant parts, the CI steps are added as well: `npm run typecheck:web`,
`npx tsc --noEmit --project app/tsconfig.json`, `npm run test -w apps/web`. For UI PRs, also `npm run test:e2e:smoke`
with the isolation from §9.4.

The exit code is read directly, never through a pipe (§11.3). The PR description states the SHA on which the gate was run.

---

## 8. Test data and `.env` (TD-TEST-21)

- [`vitest.setup.ts`](../../vitest.setup.ts) loads `.env` from `process.cwd()` (`:74`), but **skips every
  key ending in `_API_KEY`** (`:81`) and does not overwrite variables already set in the shell
  (`:84-85`). TD-TEST-21 was closed on 2026-09-26 ([`docs/TECH-DEBT.md`](../TECH-DEBT.md)). Reason: developers' real
  provider keys steered model resolution to a live cloud fallback. The local run thus diverged
  from CI, and tests could send billable requests.
- **Consequence:** infra values from `.env` are still loaded into tests. These are `DATABASE_URL`, `REDIS_URL`,
  Clerk keys, but also `STRIPE_SECRET_KEY`, `LITELLM_MASTER_KEY` and every other secret whose name does not end
  in `_API_KEY`. Rule (PROPOSAL, consistent with DP-0.10): the root `.env` in an agent worktree **contains no real
  secrets**. Ideally it does not exist. `.env.example` is not copied into `.env` as a whole, because it contains `DATABASE_URL`,
  `CLERK_SECRET_KEY=sk_test_...` and `PORT=3100` (`.env.example:41-46`).
- The setup pins deterministic defaults when they are not provided externally: `WAGGLE_PHASE5_CANARY_PCT=0`
  (`:18`), `WAGGLE_RERANKER=0` (`:26`), `WAGGLE_PROMPT_ASSEMBLER=0` (`:35`), `WAGGLE_CHUNK_RETRIEVAL=0`
  (`:43`), `WAGGLE_TRUST_LOCALHOST=1` (`:52`), `EMBEDDING_PROVIDER=mock` (`:64`) and
  `WAGGLE_SUPPRESS_EMBEDDING_WARNING=1`. When different values are set in the shell, tests behave
  differently than in CI. The shell for tests should therefore be clean.
- Server tests run against a real SQLite in a temporary `dataDir`. The model is replaced with a fake provider on
  `globalThis.fetch` (`packages/server/tests/helpers/fake-llm-provider.ts`; [`docs/TESTING.md`](../TESTING.md)
  "Pinch points", "Seam rules").
- The golden legacy fixture `tests/fixtures/legacy-datadir/` (W0-PR19) is a PROPOSAL and does not exist yet. Only that fixture will carry
  the migration tests MIG-04(A)/MIG-05(i) (DP-0.09, [MIG plan](../plans/WAGGLE-MIGRATIONS-v1.2.en.md)).

---

## 9. Runtime ISOLATION (DP-0.08, DP-0.10)

Goal: no dev sidecar, test or E2E run reads or writes `~/.waggle`, the ports of the installed Waggle, or the
configuration of external clients (`~/.claude`, `~/.codex`, Hermes).

### 9.1 Env variables (verified in code)

| Variable | Behavior at `2af0904d` | Evidence | Dev/test value |
|---|---|---|---|
| `WAGGLE_DATA_DIR` | `option > WAGGLE_DATA_DIR > ~/.waggle`. An empty value falls back to the default (`\|\|`) | `packages/server/src/local/service.ts:112-122` | `<scratch>/data-<agent>` |
| `WAGGLE_PORT` | `option > validan WAGGLE_PORT > 3333` (`DEFAULT_PORT = 3333`, `:55`). `start.ts:10` passes it through | `service.ts:124-131`, `start.ts:10` | ≠ 3333, unique per worktree |
| `PORT` | Teams/cloud server config, default `3100` | `packages/server/src/config.ts:13` | do not set (≠ 3100 if it must be set) |
| `WAGGLE_DESKTOP_PORT_FALLBACK` | Set by Tauri (`"1"`). With `=== '1'` the sidecar enters managed-desktop mode and requires `WAGGLE_INSTANCE_ID` + an absolute `WAGGLE_READY_FILE` | `app/src-tauri/src/service.rs:163`, `service.ts:210-224` | **unset** |
| `HIVE_MIND_DATA_DIR` | data dir of the hook runtime. Passed through into the external tool's process | `packages/hive-mind-core/src/hook-runtime.ts:73`, `packages/agent/src/external-process-env.ts:35` | same as `WAGGLE_DATA_DIR` (hook tests) |
| `WAGGLE_SKIP_LITELLM` | `=== '1'` or `--skip-litellm` skips LiteLLM. The LiteLLM port is fixed at `4000` and is not configurable via env | `start.ts:6`, `service.ts:207` | `1`, so that two worktrees do not share and collide on `:4000` |
| `WAGGLE_SIGNAL_EMIT` | opt-in signal emission from hooks | `packages/hive-mind-hooks-core/src/handlers-core.ts:198` | `0` (DP-0.10) |
| `DATABASE_URL` / `CLERK_SECRET_KEY` | with `DATABASE_URL` the sidecar brings up the Teams server on `TEAMS_SERVER_PORT` (default `3101`), except under `VITEST`/`NODE_ENV=test` | `packages/server/src/local/index.ts:3587-3600` | **unset** |
| `WAGGLE_TRUST_LOCALHOST` | `=== '1'` disables the bearer token for loopback. For the test harness only | `security-middleware.ts:704` | unset in dev (the web gets the token via `/api/auth/session-token`) |
| `SIDECAR_TARGET` | proxy target of the Vite dev server for `/api`, `/health`, `/ws`, default `http://127.0.0.1:3333` | `apps/web/vite.config.ts:7` | `http://127.0.0.1:<WAGGLE_PORT>` |
| `WAGGLE_UX_BASE_URL` | target of the UX gate scripts `ux:contrast-runtime` (default `http://127.0.0.1:3333`) and `ux:warm-gate` (default `http://127.0.0.1:8080`, Vite, whose proxy without `SIDECAR_TARGET` points to 3333) | `scripts/ux-gates/contrast-runtime.mjs:41`, `scripts/ux-gates/warm-interaction-gate.mjs:58` | `http://127.0.0.1:<WAGGLE_PORT>` (built web served by the isolated sidecar) or `http://127.0.0.1:<Vite port>` (e.g. 8181, with `SIDECAR_TARGET` pointing to the isolated sidecar, §9.3) |
| `WAGGLE_E2E_BASE_URL` / `WAGGLE_E2E_PORT` | Playwright target, default `127.0.0.1:3333`. 17 spec files read only `WAGGLE_E2E_BASE_URL` | `tests/vision/_helpers.ts:13-22` | both = the agent's port |
| `WAGGLE_E2E_REUSE_EXISTING_SERVER` | `!== '0'` takes over a server that is already listening | `playwright.config.ts:57,116` | `0` |
| `WAGGLE_E2E_SKIP_LITELLM` | `!== '0'` adds `--skip-litellm` to the webServer command. With `'0'` the E2E sidecar brings up LiteLLM on the shared `:4000` | `playwright.config.ts:56,114` | unset (§9.4) |
| `WAGGLE_E2E_DATA_DIR` | data dir of the E2E sidecar, otherwise tmp. Must be unset with `WAGGLE_E2E_SOLO_ONBOARDING=1` | `playwright.config.ts:30-46` | `<scratch>/e2e-<agent>` |
| `HOME`, `USERPROFILE`, `HERMES_HOME` | hook install writes to `opts.home ?? homedir()`. Hermes on Windows reads `HERMES_HOME` > `%LOCALAPPDATA%\hermes` | `packages/hive-mind-hooks-hermes/src/paths.ts:72-87`, `external-process-env.ts:8-12` | scratch profile **only** for the terminal/process of the dev sidecar and the E2E run (§9.3, §9.4; closes the leaks from §9.5) and for hook/launch/canary tests (§9.6). Does not go into `.env.dev.local` (§9.2) and is not set globally |
| `VITE_POSTHOG_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_WAGGLE_ENABLE_CLERK` | baked into the Vite bundle. PostHog is opted-in by default | `apps/web/src/lib/posthog.ts:39,42,51-60`, `apps/web/src/lib/clerk.ts:42-43` | **unset**. `apps/web/.env.local` is not copied into agent worktrees (DP-0.10). Status of this row: AUDIT FINDING — TO VERIFY, as in the checklist |

State carriers that the same `WAGGLE_DATA_DIR` isolates (DP-0.08): `agent-runs.json`, `personal.mind`,
`workspaces/<id>/workspace.mind`, config, `personas/*.json`, `behavioral-overrides/*.json`, `vault.json`
(`packages/core/src/vault.ts:50`), `marketplace.db` (`local/index.ts:694`), routines (`CronStore` over
`personal.mind`, `local/index.ts:585`).

### 9.2 Per-worktree `.env.dev.local` (example; PROPOSAL)

The sidecar does **not** load `.env` by itself: there is no dotenv loader in `packages/server/src`. The file is therefore passed
explicitly via `node --env-file`. The name `.env.dev.local` is already covered by gitignore (`.gitignore:26` `.env*.local`).
It is intentionally not named `.env`, because `vitest.setup.ts` loads `.env` into tests (§8). What effect
`WAGGLE_DATA_DIR`/`WAGGLE_PORT` would have in test processes: UNKNOWN.

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

Proposal for port allocation: each worktree gets its own block, e.g. `WAGGLE_PORT` 3341, 3342… and Vite 8181,
8182…. Ports 3333, 3100, 3101, 4000, 8080 and 11434 stay free.

### 9.3 Starting the isolated sidecar and web

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

# 4) Scratch profil SAMO za ovaj terminal i njegove child procese (zatvara curenja iz §9.5).
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

When the variables are set neither in the shell nor in the file, `start.ts` picks `~/.waggle` and port 3333. With `--env-file`,
a value that already exists in the shell takes precedence over the value from the file. That is why the preflight in step 1 is not optional.
The list covers every variable from `.env.dev.local`: a shell value would silently override, for example,
`WAGGLE_SIGNAL_EMIT=0` (DP-0.10) or `HIVE_MIND_DATA_DIR`. It also covers the managed-desktop variables. The sidecar reads
`WAGGLE_INSTANCE_ID`, `WAGGLE_READY_FILE` and `WAGGLE_DESKTOP_BOOTSTRAP_TOKEN` at startup (`service.ts:211-213`).
When `WAGGLE_INSTANCE_ID` is set, `/api/auth/session-token` takes the managed-desktop branch and, without Tauri
credentials, returns 403 `DESKTOP_BOOTSTRAP_REQUIRED` (`local/index.ts:519-522`, `:2946-2955`).

Step 4 is a mandatory part of the recipe (PROPOSAL of this document; the checklist requires that no run touches `~/.waggle`).
`WAGGLE_DATA_DIR` does not cover `documents.ts:37` and `pins.ts:32` (§9.5), and on Windows `os.homedir()` reads
`USERPROFILE`. The check in step 4 confirms this on the machine itself. A rebuild after a change in a package (§11.9) runs in
a second terminal, with the real profile, and the sidecar is restarted in its own. If the sidecar does not work under the scratch profile
(missing configuration, model, tool), work stops and the problem is reported to the tech lead. The scratch profile is not removed to make the
sidecar work.

Web, in a second terminal (`npm run dev` = `cd apps/web && npx vite`; the config has `port: 8080` and `host: "::"`,
which means listening on all interfaces, `vite.config.ts:11-12`):

```powershell
$env:SIDECAR_TARGET = 'http://127.0.0.1:3341'
npm run dev -- --host 127.0.0.1 --port 8181 --strictPort
# otvoriti http://127.0.0.1:8181
```

In local web mode the adapter uses the page's own origin (`resolveDefaultServerUrl`,
`apps/web/src/lib/adapter.ts:161-173`), and the Vite proxy routes `/api` to `SIDECAR_TARGET`. If the browser has
`localStorage['waggle:server-url']` for that origin (`adapter.ts:363`), that value takes precedence and may target 3333. After
a port change, that key should be deleted in DevTools. Alternative without Vite: `npm run build`, then open
`http://127.0.0.1:<WAGGLE_PORT>`, because the sidecar serves `<root>/dist` (`local/index.ts:3140-3145`).

Health: `http://127.0.0.1:3341/health`.

### 9.4 Isolated E2E run

In a **separate** terminal used only for this run (preflight and ports as in §9.3, steps 1–2):

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

The scratch profile applies to the entire Playwright process because Playwright merges `process.env` into the `webServer` env
(`playwright.config.ts:62-64`), and the E2E sidecar has no other input for `USERPROFILE`. If the run under the scratch profile does not
find something it needs (for example Chromium or tool configuration), the run stops and the problem is reported to the tech lead. The scratch
profile is not removed to make the run pass.

E2E preflight: `WAGGLE_E2E_SKIP_LITELLM` must be unset or anything other than `'0'`. With `'0'` the webServer starts
the sidecar without `--skip-litellm` and it brings up LiteLLM on the fixed, shared `:4000` (`playwright.config.ts:56`, `:114`;
§9.1). `WAGGLE_E2E_SOLO_ONBOARDING` must be unset, except in an intentional solo-onboarding run (exception below).

**npm under the scratch profile (exception for the E2E terminal only; PROPOSAL).** The rule "no npm, git or other tools" from
§9.3 step 4 applies to the sidecar terminal. In the E2E terminal exactly one npm command is allowed:
`npm run test:e2e:smoke` or another E2E/visual script from §6.4. It cannot be done any other way. With
`WAGGLE_E2E_REUSE_EXISTING_SERVER=0` the webServer runs `npm run build:all`, then tsx, on **every** run, in the env
of the Playwright process (`playwright.config.ts:114`). This is acceptable, because `npm run` here only runs local scripts (`tsc`, `vite build`, `esbuild`, tsx), without
package installation and without git. Limitations: the user's `~/.npmrc` and `~/.gitconfig` are not read. The npm cache
(`%LOCALAPPDATA%\npm-cache`; npm 10.9.8, `@npmcli/config/lib/definitions/definitions.js:81-84`) and Playwright
Chromium (`%LOCALAPPDATA%\ms-playwright`; `playwright-core` 1.63.0, `computeDefaultCacheDirectory`) remain
available as long as `LOCALAPPDATA` is not changed. In that terminal: no `npm ci`/`npm install`, no `npx playwright install` and no
git commands. Supported order:

1. In a terminal with the real profile: `npm run build:all` and gates (§7), so that build errors surface there.
2. In the separate E2E terminal: preflight, scratch profile and `npm run test:e2e:smoke`. The webServer repeats the build even
   after step 1 (limit 10 min, `timeout: 600_000`, `playwright.config.ts:117`).
3. After the run, close the E2E terminal.

`build:all` overwrites `packages/*/dist` and `<root>/dist` of the current worktree. That is why E2E does not run in parallel with the root
suite or with a rebuild of the same worktree (§5, §11.4). Meanwhile, the dev sidecar of the same worktree may
serve an empty `<root>/dist`, because `vite build --emptyOutDir` empties it first (`package.json` script `build`;
`local/index.ts:3140-3145`).

Exception: with `WAGGLE_E2E_SOLO_ONBOARDING=1` the variable `WAGGLE_E2E_DATA_DIR` must be **unset**
(`playwright.config.ts:36-44`). The E2E port differs from the dev sidecar port, so that `reuseExistingServer` does not
latch onto the dev instance.

### 9.5 Evidence that `~/.waggle` is untouched (before/after)

A snapshot is taken before the session and after it (all runs, including tests), and the two snapshots are compared. The
"after" snapshot must be identical to the "before" snapshot. If `~/.waggle` does not exist, it must remain nonexistent.

```powershell
function Save-WaggleHomeSnapshot([string]$Out) {
  $w = Join-Path $env:USERPROFILE '.waggle'
  if (-not (Test-Path $w)) { 'ABSENT' | Set-Content $Out; return }
  Get-ChildItem $w -Recurse -Force -File |
    Sort-Object FullName |
    ForEach-Object { '{0}|{1}|{2:o}' -f $_.FullName, $_.Length, $_.LastWriteTimeUtc } |
    Set-Content $Out
}
Save-WaggleHomeSnapshot "$env:TEMP\waggle-home-before.txt"
# ... rad, testovi, E2E ...
Save-WaggleHomeSnapshot "$env:TEMP\waggle-home-after.txt"
Compare-Object (Get-Content "$env:TEMP\waggle-home-before.txt") (Get-Content "$env:TEMP\waggle-home-after.txt")
# prazan izlaz = netaknuto
```

The same applies to the configuration of external clients (§9.6), which a gate run may touch via hook tests. Exactly what
the hook installer writes is snapshotted: `settings.json`, `hooks.json` and `config.yaml`, their backup copies
`<fajl>.hive-mind-backup.<vreme>` and `hive-mind-install.json` (`packages/hive-mind-hooks-{claude-code,codex,hermes}/src/paths.ts`;
`packages/hive-mind-hooks-core/src/paths-core.ts:18-20`). Hermes on Windows: `HERMES_HOME`, otherwise
`%LOCALAPPDATA%\hermes` (`packages/hive-mind-hooks-hermes/src/paths.ts:76-84`). The rest of `~/.claude` and `~/.codex`
is changed by the client itself while the developer uses it, so the whole directory is not snapshotted (PROPOSAL).

```powershell
function Save-ClientConfigSnapshot([string]$Out) {
  $hermes = if ($env:HERMES_HOME) { $env:HERMES_HOME } else { Join-Path $env:LOCALAPPDATA 'hermes' }
  $targets = @(
    @{ Dir = Join-Path $env:USERPROFILE '.claude'; Names = 'settings.json*', 'hive-mind-install.json' },
    @{ Dir = Join-Path $env:USERPROFILE '.codex';  Names = 'hooks.json*', 'hive-mind-install.json' },
    @{ Dir = $hermes;                               Names = 'config.yaml*', 'hive-mind-install.json' }
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

Both snapshots are taken in a terminal with the **real** profile. In the sidecar or E2E run terminal (§9.3 step 4, §9.4)
`$env:USERPROFILE` points to scratch, so the function would snapshot the wrong directory.

On a machine where the **installed** Waggle is running, its sidecar changes `~/.waggle` independently of development. There, the comparison
proves nothing. That is why on such a machine, including the founder's machine, the dev sidecar and E2E are **not started** until
the leaks from the table below are fixed (PROPOSAL, consistent with the checklist: no test touches `~/.waggle`).
Dev work goes to a machine without a running installed Waggle or to a dedicated account/VM.

**When the comparison is inconclusive or shows a change:** work stops. No further runs until the cause is determined.
"Inconclusive" means that the installed Waggle ran during the session, that the "before" snapshot is missing, or that it was
taken from a terminal with the scratch profile. For the client snapshot it also means that the developer personally
changed that client's settings or hooks during the session. Escalate the same day to the tech lead and the Server owner, and to the founder when
their live `~/.waggle` or their clients' configuration may have been touched ([02 §10](02-WORKING-AGREEMENT.en.md), [05 §5](05-RISKS-DECISIONS-ESCALATION.en.md)).
The result is not declared clean on the basis of such a comparison.

**Known leaks bypassing `WAGGLE_DATA_DIR`** (read at `2af0904d` for this document; the phase-A finding does not
cover this; report to the Server owner):

| Location | Behavior | Status |
|---|---|---|
| `packages/server/src/local/routes/documents.ts:37` | `documents.json` always goes to `os.homedir()/.waggle/workspaces/<id>/`, regardless of `dataDir` | CONFIRMED AT REVISION |
| `packages/server/src/local/routes/pins.ts:32` | `pins.json` likewise, always under `os.homedir()/.waggle` | CONFIRMED AT REVISION |
| `packages/agent/src/tool-manifest-loader.ts:141`, `packages/hive-mind-core/src/mind/inprocess-embedder.ts:33`, `packages/marketplace/src/db.ts:24` | default path under `~/.waggle` when the caller does not pass `dir`/`cacheDir`/a path. Whether the sidecar flow passes it for every call: UNKNOWN (`core/src/config.ts:436` sets `cacheDir` to the config dir for embedding) | UNKNOWN |
| `packages/server/src/local/held-action-executor.ts:210-211` | for `workspace_id === null` tools are bound to `os.homedir()` | CONFIRMED AT REVISION (behavior); impact on isolation: UNKNOWN |

On Windows `os.homedir()` reads `USERPROFILE`. A scratch profile **only for the sidecar and E2E run terminals** therefore
redirects these leaks as well, so it is a mandatory part of the recipe in §9.3 (step 4) and §9.4. The variable is not set
globally: npm and git would then not read the user's `~/.npmrc` and `~/.gitconfig`, and other tools would also lose their
configuration. On Windows the npm cache is under `%LOCALAPPDATA%` and remains (§9.4). Paths computed from `%LOCALAPPDATA%`/`%APPDATA%`
are not redirected by a scratch `USERPROFILE`. Whether the sidecar flow uses them for writes: UNKNOWN (the exception is Hermes, which is why
`HERMES_HOME` is also set).

### 9.6 Hook, launch and canary tests

`WAGGLE_DATA_DIR` and `HIVE_MIND_DATA_DIR` do **not** isolate the configuration of external clients.
`POST /api/tools/hooks` → `runHookCommand` (`packages/server/src/local/routes/tools.ts:753-766`,
`packages/agent/src/tool-launcher.ts:532-568`) writes to `~/.claude/settings.json`, `~/.codex/hooks.json` and the Hermes
`config.yaml`. Such tests, as well as `POST /api/tools/launch` (`tools.ts:400`), therefore run only under
`HOME`/`USERPROFILE` (+ `HERMES_HOME`) on a scratch profile or on a disposable Windows account/VM (DP-0.08). A run with
real accounts or a paid API (P/R/A receipts, LoCoMo rerun, B2/B3, GEPA fidelity) happens only with
a specific ODB-01/DQ-04 approval for that run, on a dedicated VM, with a cap set before the start (DP-0.10).

**Hook tests in the root gate (rule; PROPOSAL, review item).** The scratch profile from the previous paragraph applies to
manual and E2E runs through the server, to launch tests and to canary tests. The root gate `npm run test -- --run --maxWorkers=6`
(§7) runs in a terminal with the real profile (§9.3 step 3), and it covers all `packages/*/tests/**/*.test.ts`
(`vitest.config.ts:29-32`). This includes `packages/hive-mind-hooks-*/tests`, `packages/hive-mind-core/tests/hook-runtime.test.ts`
and the new RED tests of W0-PR10 ([03](03-BACKLOG.en.md) W0-PR10). For these tests:

- Every new or modified test that calls hook `install`/`uninstall`/`verify`/`register`, `resolvePaths` or the
  hook runtime must pass a temporary home: `opts.home` from `mkdtemp(join(tmpdir(), …))`, and for the hook runtime
  `dataDir`. The test must not fall back to the process's `homedir()`, `HIVE_MIND_DATA_DIR` or `HERMES_HOME`. `resolveHermesHome`
  reads `HERMES_HOME` before `opts.home`, so the test also passes it `env` (`packages/hive-mind-hooks-hermes/src/paths.ts:76-77`).
- Existing tests already work this way, for example `packages/hive-mind-hooks-claude-code/tests/install.test.ts:17,60`,
  `packages/hive-mind-hooks-hermes/tests/install.test.ts:19,48` and `packages/hive-mind-core/tests/hook-runtime.test.ts:19-26,31-32`
  (mock `homedir` + temp `dataDir`). Route tests mock `@waggle/agent`
  (`packages/server/tests/tools-routes-launch.test.ts:25`). CONFIRMED AT REVISION: tests in
  `packages/hive-mind-hooks-*/tests` without `tmpdir` do not call `install(`/`uninstall(`/`homedir`/`writeFile` (grep, 29.09.2026).
- The reviewer checks this in the diff as a review item.
- Gates for a PR that touches hook packages or `hook-runtime.ts` are **not** run under the scratch profile (§9.3 step 4).
  Evidence that the gate run did not touch real clients comes from the before/after client configuration snapshot (§9.5). A change in
  that snapshot after a gate run means that some test writes to the real home: work stops per §9.5.

---

## 10. External writes disabled by default (DP-0.10)

In every dev/test environment: `WAGGLE_SIGNAL_EMIT=0`, no channel tokens (a fresh isolated vault is empty), no
Stripe keys, no `DATABASE_URL`/`CLERK_SECRET_KEY`, `WAGGLE_EVOLUTION_AUTO_ENABLED` is unset, connectors
are not connected, `WAGGLE_SKIP_LITELLM=1`. Provider keys exist only for explicitly marked BYOK tests with
fixture accounts. No test sends a real email or message, makes a purchase, installs unverified
binary/MCP code, or touches `~/.waggle`.

---

## 11. Known pitfalls (experience from this repo)

### 11.1 Wrong Node → false mass failures
See §2. Before trusting a red run, check `node -v` = `v22.23.2` and that better-sqlite3 loads.

### 11.2 Build outputs that disappear
Recorded 2026-09-26: after a clean `npm ci` and build, `packages/{server,waggle-dance,worker,launcher}/dist`
disappeared, and better-sqlite3 became ABI 137, without a change to a single tracked file. The cause was not determined; it
coincided with the deletion of a larger number of worktree directories. Symptoms: `packages/launcher/tests/cli.test.ts`
"runtime help" and `cli-runtime` fail with `Could not resolve "@waggle/waggle-dance"` or
`NODE_MODULE_VERSION 137`. Before blaming the code, check that `packages/*/dist` exists and that better-sqlite3
loads under 22.23.2. If either of these fails: `npm rebuild better-sqlite3` (under 22.23.2), then
`npm run build:packages`.

### 11.3 A pipe masks the exit code
`npm run build:packages 2>&1 | tail -5 && echo OK` prints OK even when the build fails, because the status of the pipeline is
the status of `tail`. The output should be redirected to a log and the exit code read:

```bash
npm run build:packages > build.log 2>&1; echo "exit=$?"
```

```powershell
npm run build:packages *> build.log; "exit=$LASTEXITCODE"
```

### 11.4 Changing code while the suite runs → false red result
Vitest globs files at startup, but reads them when it reaches them. A source change during the run therefore enters the
run itself. A false failure was recorded that passed 14/14 right afterwards, as well as a real failure hidden by noise. Rule: first
commit, then `git status` with only known dirty files, then the run. During the run, read-only work only. Changes to
`docs/TECH-DEBT.md`, `docs/TESTING.md` and `docs/REMOVE-TECHNICAL-DEBT-PLAN.md` are safe, because no test
reads them. The result is always reported together with the SHA the run was started on. If a docs-only commit landed during the run, this is
stated explicitly. **A timeout is not an assertion failure**: before attributing a red result to your own change,
read the error text. Under full load, hook timeouts occur in tests that pass in isolation.

### 11.5 `npm ci` with locked `.node` files
See §4, step 1. Recovering a damaged `node_modules`: `npm install --ignore-scripts`, then
`npm rebuild better-sqlite3` (native packages skip postinstall under `--ignore-scripts`), then a check of
better-sqlite3 and `npm run build:packages`.

### 11.6 Windows/git: CRLF and scripted changes
With `core.autocrlf=true`, the working copy of a file that is LF in the index comes out as CRLF. A script that does
`split('\n')`/`join('\n')` produces mixed line endings, so the commit changes every line and the reviewer does not see the actual
change. Before staging, check `git diff --stat`: it may show only intended hunks. The number of CR characters is
compared with the index version (`tr -cd '\r' < fajl | wc -c`). Multi-line files are written with an editor, not with a long
heredoc in the shell. `--no-verify` is not used. AI agents with a hook that scans the entire command string
(`block-no-verify`) may falsely reject a `git commit` chained with another command that has `-n`, so `git commit`
should be kept in a separate command.

### 11.7 Checking "whether a branch is already merged/superseded"
- Content is read with `git show origin/<grana>:<fajl>`, **not** with a grep over a checkout that may be on any
  branch. A grep on the wrong branch once nearly deleted 89 newer lines of tests.
- `+` markers from `git cherry` do not mean new work: a forward-port changes the patch-id. Before a cherry-pick, you should run
  `git range-diff` against the same-named commit on the target and check the final file content.
- **Production evidence** (installer, receipts, "main is ready") comes only from a **clean clone + `npm ci`**,
  never from a long-lived worktree (§4, step 5). Pitfall: `ln -s X Y`, where `Y` is an existing link to a directory,
  creates `X` **inside** the target, and thus changes someone else's checkout.

### 11.8 CI: Actions budget and the Windows runner
- A job that "fails" in 3–4 s with no failed step and with a 404 log blob most often was not even started. The run annotation
  reads "The job was not started because an Actions budget is preventing further use" (`gh run view <run>`).
  That is not a test failure. **A re-run is a manual workflow trigger and belongs to owner actions** (DP-0.11, checklist): the team
  does not trigger it itself, but reports to the repo owner. When the budget is tight, do not open unnecessary PRs or make unnecessary pushes.
  Approximate cost per PR push (record): ubuntu `test` job 38–46 min, plus verify-windows and two verify-macos
  jobs.
- On the GitHub Windows runner, the first real HTTP request from a fresh `pwsh` is slow. Timing tests of the PowerShell HTTP
  helper therefore require an untimed warm-up request in the same process (fix `bdcaf405`, TD-TEST-14). It does not reproduce
  locally.

### 11.9 The sidecar runs stale code
See §5: `@waggle/*` is loaded from `dist/`. After a change in a package, run `npm run build:packages`, then restart
the sidecar. `tsx` has no watch in this flow.

---

## 12. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Hundreds of test files with `ERR_DLOPEN_FAILED` / `NODE_MODULE_VERSION 137` | Node 24 instead of 22.23.2 | `fnm use 22.23.2`, then check better-sqlite3 (§2). Never `npm rebuild` under 24 |
| `Could not resolve "@waggle/…"` in launcher/CLI tests | `packages/*/dist` is missing | `npm run build:packages` (§11.2) |
| Local tsc green, CI tsc red | per-package `tsc --noEmit` against stale `dist/` | `npm run build:packages` (TD-TEST-12) |
| Server test typecheck error that `build:packages` does not see | `tests/` are outside `packages/server/tsconfig.json` | `npm run typecheck:server-tests` |
| `EPERM: unlink … .node` during `npm ci`, then missing packages | a process holds a native module | §4 step 1, recovery §11.5 |
| "Fatal process out of memory", crashed forks, files "dropped" | too many workers for the machine's RAM | `--maxWorkers=3` or a per-package run (§6.2). Rerun the crashed files in isolation |
| Hook timeout that passes in isolation | load under the full suite | read the error text, repeat in isolation (§11.4) |
| Test failed after a change during the run | unstable tree | commit, then rerun on a clean tree (§11.4) |
| Package-install runtime tests fail locally | no network, no built `dist`, parallel cold install | run serially like CI (§6.3) after `build:hook-runtime` |
| Sidecar reports "Port 3333 is already in use" | the installed Waggle or another instance is running | do not shut down someone else's instance; set `WAGGLE_PORT` (§9.2) |
| Error "Managed desktop port fallback requires WAGGLE_INSTANCE_ID …" | `WAGGLE_DESKTOP_PORT_FALLBACK=1` inherited from the environment | remove it from the shell (§9.3) |
| `[teams-server] …` in the log or an attempted connection to Postgres | `DATABASE_URL` in env | remove `DATABASE_URL` (§9.1, DP-0.10) |
| Web works, but shows data from the wrong instance | `localStorage['waggle:server-url']` or Vite proxy to 3333 | delete the key in DevTools, set `SIDECAR_TARGET` (§9.3) |
| `401` on `/api/*` from a script | D1: loopback is not trusted by default | in the script, take the token from `GET /api/auth/session-token` **with the header** `Origin: http://127.0.0.1:<WAGGLE_PORT>` (must match `Host`, including the port), then send `Authorization: Bearer …`. Example: `curl.exe -H "Origin: http://127.0.0.1:3341" http://127.0.0.1:3341/api/auth/session-token`. Without `Origin`/`Referer` and without `Sec-Fetch-Site: same-origin` the route returns 403 `SESSION_BOOTSTRAP_ORIGIN_MISMATCH` (`packages/server/src/local/index.ts:2939-2962`, `browserBootstrapAuthorityAllowed` `:493-499`, `loopbackAuthorityMatchesRequest` `:472-491`). Works only on a sidecar bound to loopback (otherwise 403 `SESSION_BOOTSTRAP_LOOPBACK_ONLY`) and without `WAGGLE_INSTANCE_ID` (managed desktop requires a Tauri credential, 403 `DESKTOP_BOOTSTRAP_REQUIRED`). Do not enable `WAGGLE_TRUST_LOCALHOST=1` in dev |
| Playwright "passed" in a second, but is testing the wrong instance | `reuseExistingServer` took over an existing server | `WAGGLE_E2E_REUSE_EXISTING_SERVER=0` and a unique E2E port (§9.4) |
| `~/.waggle` changed after the session | leak bypassing `WAGGLE_DATA_DIR` (§9.5) or the installed Waggle was running | **stop** and do not start further runs. Compare the snapshots, identify the file and escalate the same day to the tech lead and the Server owner, and to the founder if the live `~/.waggle` may have been touched (§9.5). Check that the sidecar/E2E terminal had the scratch profile (§9.3 step 4, §9.4) |
| Two sidecars "see" each other via LiteLLM | both use the fixed `:4000` | `WAGGLE_SKIP_LITELLM=1` (§9.1) |
| Diff changes the entire file | CRLF/LF mix | §11.6 |
| CI job failed in 3–4 s | Actions budget | run annotation, report to the owner, no re-run on your own (§11.8) |
| `git worktree list` shows "prunable" | directory vanished (e.g. Temp cleanup) | do **not** prune. Report to the founder (DP-0.02) |
| Path too long during `npm ci`/checkout | Windows MAX_PATH | shorter base path (e.g. `D:\waggle\wt\…`). Whether `git config core.longpaths true` is needed: UNKNOWN (not set on the reference clone) |
| `packages/marketplace/marketplace.db` modified after tests | it has been recorded that parallel vitest runs may corrupt the seed | do not commit the change, restore the file to the index version and do not run two suites in parallel in the same worktree. Whether it still occurs: UNKNOWN |

---

## 13. UNKNOWN (open for the tech lead)

1. Why the record requires `--maxWorkers=6` ("default OOMs") even though `vitest.config.ts:28` already has `maxWorkers: 4`. CI
   uses `--maxWorkers=2` (`ci.yml:86`), not 4 as DP-0.06 states. Measure and record in `docs/TESTING.md`.
2. Minimum versions of Git for Windows and Rust/MSVC for the local build. CI pins only Rust `1.94.0`.
3. Whether the sidecar flow passes `dir`/`cacheDir` for `tool-manifest-loader`, `inprocess-embedder` and the marketplace
   DB, or whether they fall back to `~/.waggle`. `documents.ts:37` and `pins.ts:32` definitely write to `~/.waggle`.
4. State of `integration/waggle-next` on origin (not fetched) and whether the team needs `test:infra`
   (Docker) for v1.2.
5. The effect of `WAGGLE_DATA_DIR`/`WAGGLE_PORT` in `.env` on vitest processes, `core.longpaths`, and whether the corruption of the
   `marketplace.db` seed still occurs.

## Sources

[`package.json`](../../package.json) (scripts, `engines`, `packageManager`), [`.node-version`](../../.node-version),
[`CLAUDE.md`](../../CLAUDE.md) §1, §2 "Build Commands", "Verification Commands", "Windows Solo release commands",
§7.5; [`AGENTS.md`](../../AGENTS.md) (canonical contract); [`docs/TESTING.md`](../TESTING.md);
[`docs/TECH-DEBT.md`](../TECH-DEBT.md) (TD-ENV-1, TD-TEST-11, TD-TEST-12, TD-TEST-14, TD-TEST-19, TD-TEST-21);
[`vitest.config.ts`](../../vitest.config.ts), [`vitest.setup.ts`](../../vitest.setup.ts),
[`playwright.config.ts`](../../playwright.config.ts), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml),
[`.env.example`](../../.env.example), `apps/web/vite.config.ts`, `apps/web/src/lib/adapter.ts`,
`packages/server/src/local/{service.ts,start.ts,index.ts,security-middleware.ts,origin-guard.ts,routes/documents.ts,routes/pins.ts}`,
`packages/server/src/config.ts`, `packages/server/tsconfig.tests.json`,
`scripts/ux-gates/{contrast-runtime.mjs,warm-interaction-gate.mjs}`, `app/src-tauri/src/service.rs:163`,
`.github/workflows/tauri-build-pr.yml:64`,
`packages/hive-mind-hooks-{claude-code,codex,hermes}/src/paths.ts`, `packages/hive-mind-hooks-core/src/paths-core.ts`,
hook tests listed in §9.6. Outside the repo (read-only, 29.09.2026): npm 10.9.8
`@npmcli/config/lib/definitions/definitions.js`, `playwright-core` 1.63.0 (`computeDefaultCacheDirectory`),
`pandoc --version`.
Package: [delivery plan](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md) §0 (DP-0.01..DP-0.16, incl. DP-0.13), §6.1;
phase-A [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.en.md) (F-REL-08);
[SAFE-IMPLEMENTATION checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md);
[MIG plan](../plans/WAGGLE-MIGRATIONS-v1.2.en.md); [ADR index](../decisions/ADR-INDEX.en.md);
[brief](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.en.md) §3.
The operational experience (ABI, pipe, stable tree, `npm ci` lock, CRLF, supersession/clean-gate, CI budget) was
carried over from the founder's project notes from the period 2026-07-03..2026-09-27 and reformulated as team rules.
Where it was not reproduced for this document, this is indicated.

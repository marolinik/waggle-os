# P4 — Launch integrity: D11 + D12 + clean-install onboarding (2026-06-11)

**Scope (ratified):** D11 (WAGGLE_DATA_DIR + startup log), D12 (stale tracked sidecar bundle —
release-stopping), the S4 founder flag (clean-install onboarding skip), FREE→Upgrade e2e re-run.

## D11 — dataDir split-brain closed

`startService` ignored `WAGGLE_DATA_DIR` while `local/index.ts` config, the marketplace installer,
and memory-mcp honored it — a custom install split state across two directories. Now:
`resolveDataDir()` = option > `WAGGLE_DATA_DIR` > `~/.waggle` (exported, unit-pinned), plus the
ratified ONE startup line — `Data dir: <resolved> · tier: <effective>` — via `readTierFromDataDir`
(extracted from the request-scoped reader; same config.json + `getEffectiveTier` contract as
`GET /api/tier`). Stale "default to SOLO" comments fixed in assert-tier.ts and settings.ts (the
canonical vocabulary is TRIAL/FREE/PRO/TEAMS/ENTERPRISE; legacy solo→FREE, basic→PRO via
`LEGACY_TIER_MAP`, verified in tiers.ts before asserting it in a comment).

**Live-verified:** sidecar booted with `WAGGLE_DATA_DIR=<tmp>` and NO option — log line printed the
tmp dir + `tier: FREE`; install landed in the env-pointed dir.

## D12 — the bundle is generated, never tracked

`app/src-tauri/resources/service.js` (esbuild output of service.ts) was COMMITTED — last refreshed
2026-04-30, six weeks behind the server. Every official build path (app npm scripts, both CI
workflows) already regenerates it, so the tracked copy only ever shipped through a raw
`npx tauri build` — exactly the stale-binary class the ruling names. Fix per the ratified
preference (build-time generation + untracking, stronger than the minimum CI hash gate):

- `service.js` + `service.js.map` untracked + gitignored (joining node.exe/native/ under the
  existing "generated at build time" section).
- `tauri.conf.json` `beforeBuildCommand` regenerates the SIDECAR BUNDLE (+ vite build) — a raw
  `npx tauri build` produces a current server instead of a stale (or, post-untracking, missing)
  one. cwd=app/ on every invocation path (npm scripts, CI `cd app && npx @tauri-apps/cli@2 build`).
  **Scope deliberately excludes bundle-native-deps/bundle-node (review HIGH):** those scripts are
  arch-parameterized via `TARGET_ARCH`, which the hook env doesn't carry — in the cross-arch macOS
  release matrix (arm64 runner, `--target x86_64-apple-darwin`) the hook's `process.arch` fallback
  would have CLOBBERED the x64-staged Node runtime + native libs with arm64 binaries, shipping a
  non-launching Intel DMG with green CI. build-sidecar emits portable JS — safe arch-blind. The
  arch-parameterized staging stays solely in the explicit npm/CI steps that set TARGET_ARCH.
- **Stale-dist closure (review MED, verified by metafile probe):** `@waggle/shared` and
  `@waggle/hive-mind-core` export only gitignored `dist/` (core/agent/server export src), so the
  regenerated bundle silently embedded whatever dist was last compiled — the same stale-server
  class, one layer down. build-sidecar.mjs now ALIASES both packages to `src/index.ts` (no subpath
  imports exist — verified), so the bundle always compiles from source; clean checkouts build
  without `build:packages`. Verified: post-alias bundle has 59 src files, 0 dist files for the two.
- Dev mode unaffected: `service.rs` debug branch spawns `service.ts` via tsx directly.
- Pinned in tauri-config.test.ts (beforeBuildCommand contains build-sidecar; gitignore covers both
  files). Bundle regenerated locally post-D11 + post-alias to prove the script runs clean (6.5 MB).

## Clean-install onboarding skip — CONFIRMED, fixed

S4 flagged it as suspected; P4 confirmed by code: `buildLocalServer` calls
`wsManager.ensureDefault()` unconditionally at boot (index.ts:322), and useOnboarding's
returning-user auto-complete fired on `getWorkspaces().length > 0` — so every clean production
install auto-completed the wizard before first render. **A brand-new user never saw onboarding.**
(The Tauri first-launch flag never gated this effect; web/dev had no flag at all.)

**Fix — server-authoritative status:** new `routes/onboarding.ts`:
- `GET /api/onboarding/status` → completed if the flag `<dataDir>/first-launch.flag` exists (the
  SAME file the Tauri `mark_first_launch_complete` command writes on default installs), OR legacy
  evidence for pre-flag installs: any frame in the personal mind, or >1 workspaces (the seeded
  default alone is NOT evidence). No flag + no evidence → `completed:false` → wizard runs (fail
  toward showing onboarding, same direction as the Rust command's IO-error fallback).
- `POST /api/onboarding/complete` → idempotent flag stamp; fired (fire-and-forget) from
  `useOnboarding.update()` whenever completion flips, alongside the Tauri IPC flag.
- The FE auto-complete effect now keys on this status; `?forceWizard` DEV bypass unchanged; adapter
  failure keeps the wizard (a truly new user can still set up).

**Live-verified on a clean dataDir:** seeded default workspace present (count=1) and
`{"completed":false,"source":"none"}` — the wizard renders for new users.

**Accepted edge (documented, not fixed):** a legacy returning user with a fresh webview AND zero
frames AND only the default workspace (onboarded historically but never used memory) re-sees the
wizard once — no durable signal distinguishes them from a clean install; the flag stamps on their
re-completion and the class dies out.

## FREE→Upgrade e2e re-run

Act 4 "Tier Wall" (user-behavior.spec.ts) against a fresh FREE-tier sidecar: first run 3/6 failed
on 401s — the API-level spec predates the P1b bearer gate (the documented dock-era e2e advisory
band, not a product regression). Re-run under `WAGGLE_TRUST_LOCALHOST=1` (the sanctioned local
mode): **6/6 pass** — gated 403 carries what's-missing detail, upgrade URL valid, tier ladder
coherent, FREE retains meaningful endpoints, Stripe checkout URL shape valid, cost dashboard
teases value at FREE. Spec-side bearer wiring stays ledgered with the P7 e2e band.

## Review — 5-dimension adversarial workflow (run split across a session-limit reset)

First pass: 6 confirmed / 18 refuted, with the onboarding-logic finder + 17 verifiers killed by
the session limit (resumed after reset; final tally in the P4 commit message). Dispositions:

| Sev | Finding | Disposition |
|-----|---------|-------------|
| HIGH (×2 dims) | beforeBuildCommand re-ran arch-parameterized bundle scripts without TARGET_ARCH — cross-arch macOS release legs clobbered x64 staging with arm64 (non-launching Intel DMG, green CI) | FIXED: hook trimmed to build-sidecar (arch-independent) + vite build |
| MED | Regenerated bundle silently embedded stale @waggle/shared + hive-mind-core dist (verified empirically) | FIXED: esbuild alias → src/index.ts; 0 dist files in bundle post-fix |
| LOW (×2 dims) | Double-run of sidecar/native/node/vite on every scripted build path | FIXED by the HIGH trim (hook now adds only build-sidecar+vite; build-sidecar double-run costs ~2s) |
| LOW | Tauri fs-flag fast-path hardcodes ~/.waggle while the server flag lives in <dataDir> — divergence reachable on custom-WAGGLE_DATA_DIR desktop installs (flag says returning, dataDir un-onboarded) | LEDGERED (P7): requires the Rust shell to learn the dataDir; default installs (the shipped path) share one file. Server status remains the primary signal |

**Resumed run (post-limit-reset, against the already-fixed code): 13 confirmed / 16 refuted.**
The fresh onboarding-logic finder verified the full pre-completion-evidence chain and two more
clusters; all fixed:

| Sev | Finding (clustered) | Disposition |
|-----|---------------------|-------------|
| MED ×4 | **Wizard/system-origin evidence pollution** — step-1 `PUT /api/profile` writes a 'User identity:' frame pre-completion (verified to the exact line), C33 import frames, workspace-create, and even the monthly-assessment CRON frame all count as "returning user"; mid-wizard abandon + fresh WebView profile (or Back-nav to step 0 + reload) silently skips the wizard | FIXED: server-durable PENDING latch — the first status call that finds no flag + no evidence stamps `<dataDir>/onboarding-pending.flag`; thereafter only explicit completion flips the status. Kills every evidence producer at once. Pinned with the exact verified attack chain (identity frame after latch → still `completed:false`) + a real-returning-user no-latch pin |
| MED ×5 (4 dims) | **Tauri fs-flag divergence** — `flag_path()` hardcoded `~/.waggle` while D11 makes `WAGGLE_DATA_DIR` official; a stale home flag auto-skips onboarding against a brand-new custom dataDir (the fast-path bypasses the server status entirely) | FIXED in Rust: `flag_path()` honors non-empty `WAGGLE_DATA_DIR` first (same resolution order as `resolveDataDir`), so the IPC flag and the server stamp are the same file on EVERY install shape. Sequential cargo test pins the order incl. the empty-env fallthrough |
| MED | **D12 raw-path overclaim** — after the arch-safety trim, a raw `npx tauri build` could silently package a binary with NO Node runtime (the resources glob tolerates absent files) | FIXED: `check-sidecar-resources.mjs` preflight in beforeBuildCommand — missing runtime/native artifacts now FAIL the build with instructions, never ship silently |
| LOW | D11 startup log line unpinned (deleting it kept gates green) | FIXED: console spy in the D11 integration test asserts the line + dataDir + tier |
| LOW | onboardingRoutes registration on the real server unpinned | FIXED: source-pin (import + register) in onboarding-status.test.ts |
| LOW | Production spawn seam (service.rs → bundled service.js) is smoke-only territory | LEDGERED: binary-smoke class, P7/D15 grid |

Self-triaged from the first run's unverified pile (fixed regardless — trivially real):
- `resolveDataDir` env leg used `??` — a set-but-EMPTY `WAGGLE_DATA_DIR` yielded `''`. Now `||`
  (pinned).
- **Mid-wizard auto-complete ejection** (the question the dead onboarding-logic finder was asked):
  a C33 import during the wizard writes personal-mind frames = legacy evidence; a mid-wizard
  refresh would auto-complete the wizard out from under the user. Guard added: `step > 0` never
  auto-completes (pinned).
- D11 re-homing note: an install that previously had implicit `~/.waggle` data while the
  launcher set `WAGGLE_DATA_DIR` elsewhere now follows the env var — that is the ratified D11
  behavior (the split-brain closing), recorded here as an intentional flip.

## Gates

FE 878/878 · server suite + tsc + lint recorded in the P4 commit message · D11 8 pins · onboarding
5 server + 4 FE pins · D12 pin · live: D11 boot, clean-install status, Act 4 6/6.

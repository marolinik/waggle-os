# Phase 6: Build & Deployment Readiness Report

**Date**: 2026-03-20
**Auditor**: Claude Opus 4.6 (automated)
**Scope**: TypeScript compilation, Vite build, Docker, Tauri, Render.com, npx launcher, CI/CD

---

## Deployment Mode Readiness Matrix

| Mode | Status | Evidence | Blockers |
|------|--------|----------|----------|
| **Web (Vite)** | :warning: BUILDS with warnings | 735 kB single chunk, 87 TS errors (non-blocking) | Chunk splitting needed; 87 type errors in app/ scope |
| **Docker** | :warning: MOSTLY READY | Multi-stage build, health checks, compose valid | No non-root user; no code signing |
| **Tauri Windows** | :warning: COMPILES, NOT SHIPPABLE | `cargo check` passes, NSIS hooks exist | Placeholder icon (32x32 only); empty updater pubkey; no `build-sidecar.mjs` tested in CI; missing macOS DMG bundle target |
| **Tauri macOS** | :warning: COMPILES (cross-target) | Release workflow builds aarch64 + x86_64 | Same icon/pubkey issues; no code signing configured; `targets` only includes "nsis" (Windows-specific) |
| **npx waggle** | :x: NOT PUBLISHABLE | `packages/launcher/` exists with bin field | `bin` points to `.ts` file (not compiled JS); package not published; missing `files` field |
| **Render.com** | :white_check_mark: WELL CONFIGURED | Blueprint with web + postgres + redis + disk + health | Minor: `plan: starter` may be undersized for production |
| **CI/CD** | :warning: BASIC | `ci.yml` (test) + `release.yml` (Tauri builds) | No linting step; no Docker build/push; no deploy pipeline; CI branch is `master` not `main` |

---

## 1. TypeScript Compilation

### Root monorepo (`npx tsc --noEmit`)
- **Result**: CLEAN PASS -- 0 errors
- The root `tsconfig.json` uses project references for 10 packages
- All backend packages compile without errors

### App scope (`cd app && npx tsc --noEmit`)
- **Result**: 87 errors across ~25 files
- **Breakdown by error code**:
  | Code | Count | Severity | Description |
  |------|-------|----------|-------------|
  | TS6133 | 69 | Low | Unused imports/variables (mostly `React` imports) |
  | TS2345 | 5 | Medium | Type argument mismatches |
  | TS2339 | 3 | Medium | Property does not exist on type (e.g., `customModels` on `WaggleConfig`) |
  | TS6196 | 2 | Low | Declared but never used |
  | TS2352 | 2 | Medium | Type assertion issues |
  | TS2305 | 2 | Medium | Module has no exported member |
  | TS7006 | 1 | Low | Parameter implicitly has 'any' type |
  | TS2719 | 1 | Medium | Type overlap issue |
  | TS2554 | 1 | Medium | Wrong number of arguments |
  | TS2322 | 1 | Medium | Type not assignable |

- **Impact**: Vite builds successfully despite these errors (Vite uses esbuild, not tsc, for transpilation). However, these indicate real type drift that could cause runtime bugs.
- **Hotspot files**: `src/App.tsx` (9 errors), `MissionControlView.tsx` (4 errors), `ModelsSection.tsx` (4 errors)

---

## 2. Vite Build

### Configuration (`app/vite.config.ts`)
- Framework: Vite 6.4.1 + React + Tailwind CSS v4
- Output: `dist/`
- Source maps: enabled
- `@tauri-apps/*` packages marked as external (correct for dual web/desktop mode)

### Build Result
- **Status**: SUCCESS (built in 5.12s)
- **Output**:
  | File | Size | Gzipped |
  |------|------|---------|
  | `index.html` | 0.47 kB | 0.30 kB |
  | `index-*.css` | 107.02 kB | 18.00 kB |
  | `index-*.js` | 735.61 kB | 215.44 kB |
  | Source map | 2,929.67 kB | -- |
  | **Total dist/** | **5.5 MB** | -- |

### Warnings
1. **Single chunk exceeds 500 kB** -- The entire app is bundled into one JS file (735 kB). Should use `manualChunks` or dynamic `import()` for code splitting.
2. **CSS @import order** -- `@import url('https://fonts.googleapis.com/...')` appears after other rules. Should be moved to top or loaded via `<link>` tag.

### Blockers
- None (builds successfully)

### Recommendations
- Add `manualChunks` in rollup config to split vendor (React, lucide-react, cmdk) from app code
- Move Google Fonts import to `index.html` `<link>` tag
- Consider disabling source maps for production web builds (saves 2.9 MB)

---

## 3. Docker

### Dockerfile Assessment
- **Multi-stage build**: YES (builder + production)
- **Base image**: `node:20-alpine` (good -- small, current LTS)
- **Native module handling**: Installs `python3 make g++` for `better-sqlite3` rebuild
- **Health check**: YES (`wget --spider http://localhost:3333/health`, 30s interval)
- **Data volume**: YES (`/data` volume for persistence)
- **Environment**: `NODE_ENV=production`, `WAGGLE_FRONTEND_DIR`, `WAGGLE_DATA_DIR`
- **Entry point**: `npx tsx packages/server/src/local/start.ts --skip-litellm`

### Security Issues
| Issue | Severity | Detail |
|-------|----------|--------|
| No non-root user | HIGH | Container runs as root. Should `adduser waggle` and `USER waggle` |
| `npx tsx` in CMD | MEDIUM | Uses tsx (TypeScript executor) in production. Should pre-compile to JS |
| Build tools in prod image | LOW | `python3 make g++` left in production layer after `npm rebuild` |

### docker-compose.production.yml
- **Services**: waggle + postgres:16-alpine + redis:7-alpine
- **Health checks**: All 3 services have health checks with `service_healthy` conditions
- **Restart policy**: `unless-stopped` on all services
- **Volumes**: Named volumes for data persistence (waggle-data, pgdata, redisdata)
- **Env vars**: Properly uses `${VAR:-default}` pattern
- **Status**: VALID (passes `docker compose config`)

### docker-compose.yml (dev)
- **Services**: postgres + redis + litellm
- **Warning**: Dev compose exposes API keys via environment interpolation. The `docker compose config` output revealed a real Anthropic API key in the `.env` file. While `.env` is gitignored and dockerignored, this is a reminder to rotate the key if it was ever committed.
- **Status**: VALID (passes `docker compose config`)

### .dockerignore Assessment
- Properly excludes: `node_modules`, `.git`, `.claude`, `*.mind`, `app/dist`, `app/src-tauri`, `sidecar`, `docs`, `.env*`
- Good: prevents secrets and large files from entering the build context

---

## 4. Tauri Desktop App

### tauri.conf.json Assessment
| Field | Value | Status |
|-------|-------|--------|
| productName | "Waggle" | OK |
| version | "1.0.0" | OK |
| identifier | "com.waggle.app" | OK |
| frontendDist | "../dist" | OK |
| devUrl | "http://localhost:1420" | OK |
| bundle.targets | ["nsis"] | INCOMPLETE -- only Windows NSIS |
| bundle.icon | ["icons/icon.ico"] | INCOMPLETE -- only .ico |
| CSP | Configured | OK -- allows localhost, ws, data: images |
| trayIcon | Configured | OK -- tooltip "Waggle -- AI Agent Swarm" |
| updater.endpoints | GitHub releases URL | OK |
| updater.pubkey | "" (empty) | BLOCKER -- auto-update won't work |

### Rust Compilation
- `cargo check`: PASSES (55s compile time, all dependencies resolve)
- Tauri plugins: shell, autostart, global-shortcut, notification, single-instance, updater
- Rust toolchain: cargo 1.94.0, rustc 1.94.0

### Sidecar Build (`scripts/build-sidecar.mjs`)
- Bundles server into single JS via esbuild
- Externals: better-sqlite3, bullmq, ioredis, pg, drizzle-orm, etc.
- Copies marketplace.db seed
- **Status**: Script exists but NOT tested in this audit (requires esbuild)

### Icon Issues
| Issue | Severity |
|-------|----------|
| Only 1 icon file: `icon.ico` at 32x32 | HIGH -- needs multi-resolution (16, 32, 48, 256) |
| No `.png` icons for macOS/Linux | HIGH -- macOS requires `.icns` or `.png` |
| No installer header/sidebar BMPs | LOW -- NSIS will use defaults |

### NSIS Installer Hooks
- Pre-install: branding message
- Post-install: desktop shortcut, Start Menu entry, auto-launch
- Post-uninstall: removes shortcuts, offers to delete `~\.waggle\` data
- **Status**: Well-structured

### Missing for macOS
- `bundle.targets` only includes `"nsis"` -- needs `"dmg"` and/or `"app"` for macOS
- No `.icns` icon file
- No code signing identity configured
- No notarization config
- Release workflow handles this at CI level (good), but local `tauri:build` won't produce macOS bundles

---

## 5. Render.com Blueprint (`render.yaml`)

### Services
| Service | Type | Plan | Config |
|---------|------|------|--------|
| waggle-server | web (Node.js) | starter | Build + start commands, health check, disk |
| waggle-postgres | database | starter | DB name: waggle, user: waggle |
| waggle-redis | redis | starter | Default config |

### Assessment
- **Build command**: `npm install && cd app && npm run build` -- correct
- **Start command**: `npx tsx packages/server/src/local/start.ts --skip-litellm` -- works but uses tsx in production
- **Health check**: `/health` endpoint -- correct
- **Environment variables**: 7 vars configured (NODE_ENV, WAGGLE_SKIP_LITELLM, WAGGLE_FRONTEND_DIR, WAGGLE_DATA_DIR, DATABASE_URL, REDIS_URL, ANTHROPIC_API_KEY)
- **Persistent disk**: 10 GB at `/data` -- good for .mind files and SQLite
- **Auto-deploy**: enabled
- **Secret vars**: `sync: false` for API keys (correct -- must be set manually)
- **Missing**: No `CORS_ORIGIN` or `PORT` override
- **Status**: WELL CONFIGURED

---

## 6. npx Launcher (`packages/launcher/`)

### package.json
```json
{
  "name": "waggle",
  "bin": { "waggle": "./src/cli.ts" },
  "dependencies": { "@waggle/server": "*" }
}
```

### Issues
| Issue | Severity | Detail |
|-------|----------|--------|
| `bin` points to `.ts` file | BLOCKER | npx cannot run TypeScript directly without tsx |
| No `files` field | HIGH | Would publish entire package including tests |
| No `engines` field | MEDIUM | Should specify `node >= 18` (code checks for it) |
| Not published to npm | BLOCKER | Package exists locally only |
| Depends on `@waggle/server: "*"` | HIGH | Workspace protocol won't work when published |
| No `prepublishOnly` script | MEDIUM | Should build before publish |

### Entry Point (`src/cli.ts`)
- Well-structured: argument parsing, browser opening, first-run detection
- Cross-platform browser launch (Windows, macOS, Linux)
- Node version check (>= 18)
- Progress callback for startup status
- **Quality**: Good code, but needs build pipeline to be publishable

---

## 7. CI/CD (`.github/workflows/`)

### ci.yml
```yaml
on:
  push: { branches: [master] }
  pull_request: { branches: [master] }
jobs:
  test:
    runs-on: ubuntu-latest
    steps: [checkout, setup-node@20, npm install, npm test]
```

### Issues
| Issue | Severity |
|-------|----------|
| Branch is `master`, main branch appears to be `main` | HIGH |
| No TypeScript lint step (`tsc --noEmit`) | MEDIUM |
| No Docker build step | MEDIUM |
| No coverage reporting | LOW |
| No caching (`actions/cache` for npm) | LOW |
| Missing PostgreSQL/Redis services for integration tests | MEDIUM |

### release.yml
- **Trigger**: Tag push `v*` or manual dispatch
- **Windows build**: checkout, Node 20, Rust stable, npm install, build-sidecar, build frontend, tauri-action
- **macOS build**: Same + matrix for aarch64-apple-darwin and x86_64-apple-darwin
- **Update manifest**: Generates `latest.json` for auto-updater
- **Artifacts**: Published as GitHub Release (draft)
- **Status**: WELL STRUCTURED -- covers both platforms, uses Rust cache, proper action versions

### Missing CI/CD Capabilities
- No Docker image build and push (to GHCR or DockerHub)
- No Render.com deploy trigger
- No E2E test step (Playwright is configured but not in CI)
- No npm publish step for the launcher package
- No security scanning (Dependabot, CodeQL, etc.)
- No branch protection rules verified

---

## Critical Blockers Summary

### Must-Fix Before V1 Ship

| # | Issue | Mode | Effort |
|---|-------|------|--------|
| 1 | Dockerfile runs as root | Docker | 5 min |
| 2 | 87 TypeScript errors in app/ | All | 2-4 hrs |
| 3 | Tauri updater pubkey is empty | Desktop | 30 min (generate key pair) |
| 4 | Icon is placeholder 32x32 only | Desktop | Design task |
| 5 | `bundle.targets` missing macOS targets | Desktop macOS | 5 min config |
| 6 | Launcher bin points to .ts | npx | 1 hr (add build step) |
| 7 | CI triggers on `master` not `main` | CI | 5 min |
| 8 | Vite bundle is single 735 kB chunk | Web | 1 hr (add code splitting) |
| 9 | Production server uses `npx tsx` | Docker/Render | 2 hrs (pre-compile) |
| 10 | No non-root user in Docker | Docker | 5 min |

### Security Findings

| # | Finding | Severity |
|---|---------|----------|
| 1 | Docker container runs as root | HIGH |
| 2 | Anthropic API key present in `.env` (gitignored, but exercise caution) | MEDIUM |
| 3 | Updater pubkey empty -- updates could be MITM'd | HIGH |
| 4 | Build tools (python3, make, g++) left in production Docker image | LOW |
| 5 | No Dependabot or security scanning in CI | MEDIUM |

---

## Detailed Recommendations

### Quick Wins (< 1 hour each)

1. **Add non-root user to Dockerfile**:
   ```dockerfile
   RUN addgroup -S waggle && adduser -S waggle -G waggle
   RUN chown -R waggle:waggle /app /data
   USER waggle
   ```

2. **Fix CI branch**: Change `master` to `main` in `ci.yml`

3. **Add macOS to Tauri bundle targets**: Change `"targets": ["nsis"]` to `"targets": "all"` or `["nsis", "dmg", "app"]`

4. **Add TypeScript lint to CI**: Add `npm run lint` step after `npm install`

### Medium Effort (1-4 hours each)

5. **Code split Vite bundle**: Add `manualChunks` to split React, UI library, and app code

6. **Pre-compile server for production**: Use esbuild or tsc to produce JS, change Dockerfile CMD to `node` instead of `npx tsx`

7. **Fix 87 TypeScript errors**: Mostly unused imports (69 of 87) -- quick cleanup

8. **Prepare launcher for npm publish**: Add build step, `files` field, `engines`, resolve `@waggle/server` dependency

### Larger Effort (1+ days)

9. **Generate Tauri signing keys**: Create key pair, configure updater, add to GitHub secrets

10. **Design production icons**: Multi-resolution `.ico`, `.icns`, `.png` files; NSIS installer graphics

11. **Add Docker build/push to CI**: Build image, push to GHCR, optionally deploy to Render

12. **Add E2E tests to CI**: Playwright tests with PostgreSQL + Redis service containers

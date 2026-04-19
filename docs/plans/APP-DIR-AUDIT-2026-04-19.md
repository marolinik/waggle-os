# `app/` Directory Audit — 2026-04-19 (L-15 findings)

L-15 was scoped as a 1-hour "verify + remove dead app/ frontend." Reality
is larger: the React side of `app/` was already removed in commit
`a883050` (Apr-12) but left behind broken build hooks and a 159M library
of unused bee-themed brand assets. This doc pins down what's dead, what's
alive, and what needs your call.

## What's alive

- **`app/src-tauri/`** (6.9G with build artifacts) — Rust shell for the
  Tauri desktop binary. Used by `tauri:build` / `tauri:dev` in
  `app/package.json`. Keep.
- **`app/scripts/`** — build-sidecar / bundle-native-deps / bundle-node
  scripts used by `tauri:build`. Keep.
- **`app/public/waggle-logo.{svg,jpeg}`** — referenced by `app/index.html`,
  still loaded by Tauri webview. Keep.
- **Tauri config** (`app/tauri.conf.json`, `app/icons/`, `Cargo.toml`) —
  Keep.

## What shipped broken

### 1. `app/src/` frontend was deleted but build hooks remained

Commit `a883050` (Apr-12) removed 77 dead `.tsx` files from `app/src/`,
leaving only `app/index.html` (references `/src/main.tsx` which no longer
exists), `app/vite.config.ts`, `app/tailwind.config.ts`, and an empty
`app/src/components/` directory. Running `cd app && npx vite build` now
fails with:

```
Failed to resolve /src/main.tsx from D:/Projects/waggle-os/app/index.html
```

**Fixed this commit:**
- `Dockerfile` line 34 — `RUN cd app && npm run build` → `RUN npm run build`
- `Dockerfile` line 88 — `COPY /app/app/dist app/dist` → `COPY /app/dist dist`
- `Dockerfile` line 97 — `WAGGLE_FRONTEND_DIR=/app/app/dist` → `/app/dist`
- `.github/workflows/ci.yml` line 59 — `cd app && npx vite build` → `npm run build`
- `.github/workflows/release.yml` lines 53, 108 — `cd app && npm run build`
  → `cd apps/web && npx vite build` (Tauri release needs apps/web/dist
  specifically per `tauri.conf.json`'s `frontendDist: "../../apps/web/dist"`)
- `packages/server/tests/deployment.test.ts` — assertions updated to match.
- `packages/server/tests/web-frontend.test.ts` — stale comment fixed.
- `packages/server/src/local/index.ts` (earlier this session, task 14) —
  server's frontendDir lookup now prefers `<root>/dist/` over `app/dist/`.

### 2. `app/package.json` still defines broken scripts

`app/package.json` keeps `dev`, `build`, `preview`, `typecheck` scripts
that all require `app/src/main.tsx`. They'll fail if invoked. Keeping them
for now — they're not on any critical path after this commit's fixes, and
removing them risks surprising someone's muscle memory.

**Proposed follow-up:** delete the broken scripts + `app/index.html` +
`app/vite.config.ts` + `app/tailwind.config.ts` + empty `app/src/components/`
once we're sure nothing in `scripts/` or `packages/` references them.

## What's orphaned (your call needed)

### `packages/ui/` + `app/public/brand/` — 159M of unused brand assets

**Found:** `app/public/brand/` contains 26 bee sprites (dark + light
variants for 13 personas: analyst, architect, builder, celebrating,
confused, connector, hunter, marketer, orchestrator, researcher,
sleeping, team, writer) plus 18+ app icons, plus hex textures. Total 159M.

**Who references them:** Only `packages/ui/src/components/{ChatArea,EventStream,MemoryBrowser}.tsx`,
which imports paths like `/brand/bee-orchestrator-dark.png`.

**Who imports `@waggle/ui`:** Only `app/package.json` — and `app/` has no
React frontend, so `@waggle/ui` is effectively orphaned.

**apps/web/ does NOT import `@waggle/ui`** — the new desktop OS UI in
`apps/web/src/` built its own component system without it.

**Style:** The pre-existing brand bees are **hex-themed geometric full-size
illustrations** (~140-150px, black background) designed for empty-state
hero slots in the old Tauri sidebar UI. They are NOT designed for 64px
persona avatars. So this session's P10 AI-generated 64px avatars are a
different use case; no overlap.

**Your options:**
1. **Delete `packages/ui/` + `app/public/brand/`** — saves 159M + simplifies
   the workspace. Risk: if any future work wants hero-size bee illustrations,
   they'd regenerate (P10 template in `apps/web/src/assets/personas/README.md`
   can be tweaked up to 2K size).
2. **Keep `packages/ui/` alive, wire into apps/web** — use the existing
   hero illustrations in empty states (Chat, Events, Memory). That's ~half
   a day of integration work; no new assets needed.
3. **Park both, ship L-15 as just the CI/Dockerfile fix.** What I did
   this commit. Zero risk, the ~325M worth of stale artifacts (`app/dist/`
   at 165M + `app/public/brand/` at 159M) stays on disk but the build
   chain is unblocked.

**Recommendation:** option 3 for now. Revisit option 1 vs 2 once benchmarks
clear and polish sprint continues.

## Summary

| Item | Status |
|---|---|
| Broken `cd app && npm run build` hooks | ✅ Fixed (Dockerfile + 2 workflows + 2 tests) |
| Server frontendDir preference | ✅ Fixed (task 14 earlier this session) |
| Empty `app/src/components/` | Left in place; harmless |
| `app/index.html` + `vite.config.ts` (reference missing main.tsx) | Left in place; no longer called |
| `app/package.json` broken scripts | Left in place; no longer called |
| `app/dist/` 165M stale artifact | Left in place; no longer served |
| `packages/ui/` + `app/public/brand/` 159M | Deferred — needs your call on option 1/2/3 |

**Net of this commit:** CI/Docker build chains unblocked. `cd app && npm
run build` no longer required anywhere. The larger orphan (packages/ui +
brand assets) is documented for a later decision.

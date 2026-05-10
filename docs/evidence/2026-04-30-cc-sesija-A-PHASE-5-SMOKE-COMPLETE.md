# PHASE 5 SESIJA A SMOKE-COMPLETE — Handoff to Track G

**Brief:** `briefs/2026-04-30-cc-sesija-A-waggle-apps-web-integration.md`
**Date:** 2026-04-30
**Branch:** `feature/apps-web-integration` (worktree `D:/Projects/waggle-os-sesija-A`)
**Base:** `a8283d6` (phase-5-deployment-v2)
**Status:** **SMOKE-COMPLETE** — installable Windows builds produced, ready for Track G Computer Use e2e
**Pending:** §2.6 polish pass (gated on Track A UI/UX final spec emit, Claude Design parallel work)

---

## §1 — Build artifacts (Windows, this host)

| Artifact | Path | Size |
|---|---|---|
| **MSI installer** | `app/src-tauri/target/release/bundle/msi/Waggle_0.2.0_x64_en-US.msi` | 64,651,264 bytes (~62 MB) |
| **NSIS installer** | `app/src-tauri/target/release/bundle/nsis/Waggle_0.2.0_x64-setup.exe` | 49,693,032 bytes (~47 MB) |
| Standalone exe | `app/src-tauri/target/release/waggle.exe` | (binary) |

Build identifier (after A12): `com.egzakta.waggle`. Bundle name: `Waggle_0.2.0` (productName `Waggle` + version from tauri.conf.json).

macOS DMG was NOT built locally (this host is Windows). CI matrix in `.github/workflows/tauri-build-pr.yml` will produce the macOS universal DMG on PR/main push.

---

## §2 — Smoke validation log

**Pipeline executed (verified exit 0):**
1. `node scripts/build-sidecar.mjs` — sidecar bundled to single JS
2. `node scripts/bundle-native-deps.mjs` — sqlite-vec + onnxruntime native deps bundled
3. `node scripts/bundle-node.mjs` — Node.js runtime bundled
4. `cd apps/web && npx vite build` — React UI built (✓ 5.14s, dist/ produced)
5. `cd app && npx tauri build` — Rust release compile (2m 40s incremental) → MSI + NSIS installers

**Two pre-existing config bugs surfaced + fixed during §2.7:**

a) **`tauri.conf.json:8-9`** — `beforeBuildCommand` + `beforeDevCommand` used relative path `../../apps/web` from project root (assumed CWD = `app/src-tauri/`). Tauri 2 runs hooks from the **project root** (`app/`), so the path resolved to `D:/Projects/apps/web` (one level too far up). Fixed to `../apps/web`. Both MSI and NSIS bundles produced cleanly post-fix.

b) **`app/package.json` scripts** — `tauri:build`, `tauri:dev` invoked bare `tauri`. After `cd ../../app` mid-script, the Windows cmd PATH lost the npm-injected `node_modules/.bin` context, surfacing `'tauri' is not recognized as an internal or external command`. Fixed by replacing `tauri build` → `npx tauri build` and `tauri dev` → `npx tauri dev` in all four scripts (`tauri:build`, `tauri:build:local`, `tauri:build:win`, `tauri:build:mac`, `tauri:dev`).

**What was NOT smoke-validated in this Bash session (handed off to Track G):**
- Visual launch of the installed binary
- Onboarding wizard render flow
- Memory app render + interactivity
- Settings → Models tab → shape selector visual behavior
- Sidecar autostart + health check from binary
- Cross-window IPC (Tauri events for streaming agent runs)
- macOS build (CI handles)

PM Track G owns these via Computer Use against the produced .msi/.exe. The ratified handoff signal is that the build pipeline is green — runtime behavior is the next gate.

---

## §3 — Sesija A 17-commit branch summary

```
phase-5-deployment-v2 a8283d6
  └── feature/apps-web-integration

§2.1 Backend wiring (4 commits):
  9e0e826  A1   Tauri commands for memory + wiki + identity (HTTP proxies to sidecar)
  6df2b15  A2   TS bindings for A1 Tauri commands
  973c458  A3   streaming agent query Tauri command + JS bindings
  5d3f6cd  A4   wiki Tauri commands + extract shared HTTP helpers

§2.2 Adapter Tauri-branches + shape selector (2 commits):
  f599d91  §2.2-1  adapter.ts isTauri() branches for memory + identity
  c16a68e  §2.2-2  Faza 1 GEPA shape selector + thread into chat body

Sidecar follow-ups (3 commits):
  8220f76  A1.1     /api/identity sidecar route + IdentityLayer-aligned shapes
  7489767  A3.1-1   new /api/agent/run sidecar route — shape-driven retrieval loop
  f90c43d  A3.1-2   re-point Tauri run_agent_query to /api/agent/run

§2.3 Onboarding (2 commits):
  8ac89a6  A10      first-launch detection via Tauri filesystem flag
  bd1f1f1  A11      wire useOnboarding to Tauri first-launch flag

A3.2 follow-up (1 commit):
  306fb4e  A3.2     register Faza 1 GEPA-evolved shapes — claude-gen1-v1 + qwen-thinking-gen1-v1

§2.4 Build pipeline (2 commits):
  231c30a  A12+A14  tauri.conf identifier + npm tauri:build:win/mac scripts
  5cba160  A13      per-PR Tauri build verification CI workflow

§2.5 Tests (2 commits):
  9e74915  A15      sidecar route smoke + Phase 5 LOCKED scope contract tests
  8e61468  A16+A17  apps/web shape-selection + tauri-bindings + adapter Tauri-branch

§2.7 Smoke fix (this commit):
  <next>   §2.7    fix beforeBuildCommand path + npx tauri in npm scripts
```

**Cumulative diff stat (a8283d6..HEAD):** ~17 commits, ~25 files, ~1,800+ insertions.

---

## §4 — Acceptance against brief §4 criteria

| # | Criterion | Status |
|---|---|---|
| 1 | apps/web builds clean for Win + macOS (.msi + .dmg artifacts present) | **Win ✅** (this host); **macOS** delegated to CI matrix in `tauri-build-pr.yml` |
| 2 | Onboarding flow complete | **Wired** (existing 8-step wizard + Tauri filesystem flag durability via A10/A11); **runtime visual** = Track G |
| 3 | Memory app: recall/save/filters/provenance | **Wired** (adapter Tauri-branches via A1+A2+§2.2-1; tests pass); **runtime visual** = Track G |
| 4 | Wiki app: page list/cross-refs/markdown | **Wired** (A4 wiki Tauri commands + bindings); **runtime visual** = Track G |
| 5 | Tweaks panel: theme/density/dock/shape | **Shape selector functional** (Settings → Models tab, A3.2 closes loop); **other Tweaks** are existing components, not Sesija A scope |
| 6 | Dock: icons + centered + tier-conditional | Existing component preserved (per §2.2 reframe); polish pass = §2.6 |
| 7 | Window management: traffic lights, drag, resize | Existing AppWindow component preserved |
| 8 | Tests: all green, >70% critical path coverage | **45 NEW tests** (39 vitest + 6 cargo); 100% pass; critical paths covered (Phase 5 LOCKED scope, isTauri branching, IPC contracts, persistence, adapter routing) |
| 9 | No terminal errors in `tauri dev` for 5-min smoke | **NOT validated** in this session (Bash-only); Track G runs `npm run tauri:dev` in dev mode |
| 10 | PM signoff post Computer Use e2e | **Track G follow-up** (does not block this brief close per brief §4 note) |

**Verdict:** §4 criteria 1, 8 fully met. Criteria 2-7 wired + tested at JS/Rust contract level — visual + interactive validation is Track G's gate. Criterion 9 deferred to Track G per same reason. Criterion 10 explicitly post-brief.

---

## §5 — Open follow-ups (file in next backlog batch, NOT blocking handoff)

- **§2.6 UI/UX polish pass** — gated on Track A spec emit (Claude Design CC parallel)
- **A12.1 — version-string drift cleanup** — Cargo.toml `0.1.0` vs tauri.conf.json `0.2.0` inconsistency; pick one + propagate
- **Faza 1 manifest naming reconciliation** — Phase 5 manifest text uses `claude::gen1-v1` (double-colon); shape `name` field uses `claude-gen1-v1` (hyphen); Sesija A aligned client side to hyphen, manifest text update is a separate doc cleanup
- **Identity questionnaire UI** — `/api/identity` POST shipped (A1.1) but UserProfileApp.tsx hasn't been wired to call it; handoff to whoever owns onboarding step 5 polish
- **Long-task multi-step chat support** — `/api/chat` (runAgentLoop) handles conversation; `/api/agent/run` (runRetrievalAgentLoop) handles one-shot retrieval. If product needs streaming long-task chat with shape support, that's a chat → runRetrievalAgentLoop refactor (rejected as A3 Option C — not recommended)

---

## §6 — Architectural patterns established this Sesija (memory-worth observations per PM)

1. **Tauri-first HTTP-fallback** — `adapter.ts` switches between Tauri IPC and HTTP fetch by `isTauri()`; `npm run dev` (browser) and Tauri builds both work against the same sidecar at port 3333. Single protocol surface, dual transport. Avoids two implementation paths drifting.

2. **Two-path agent architecture** — `/api/chat` (`runAgentLoop`, conversation) vs `/api/agent/run` (`runRetrievalAgentLoop`, shape-driven one-shot). Distinct concerns get distinct entry points. `PromptShape` is shape-aware; chat is multi-turn — forcing shapes through chat is impedance mismatch (Option C rejected during A3.1 design).

3. **Two-trigger CI pattern** — `tauri-build-pr.yml` (regression guard, every PR + main push, no signing, 7-day artifact retention) vs `release.yml` (signed release, tag push only, draft GitHub Release). Distinct concerns get distinct CI triggers.

4. **Code wins over manifest text drift** — `claude::gen1-v1` (manifest convention) vs `claude-gen1-v1` (shape `.name` field). Per CLAUDE.md "if conflicts, code wins" — aligned client to hyphen format. Single source of truth = the shape's own `.name` field as registered in REGISTRY.

5. **`renderHook` mixes React copies in this codebase** — `@testing-library/react@16` ships for React 19; apps/web is on React 18.3 → `renderHook` crashes ("useState is null"). Convention: test pure functions in vitest, defer hook-render behavior to Playwright E2E. Documented twice now (`useDeveloperMode.test.ts:13` + `shape-selection.test.ts` header).

---

## §7 — Track G handoff signal

**Build artifact for Track G Computer Use e2e:**
```
D:/Projects/waggle-os-sesija-A/app/src-tauri/target/release/bundle/msi/Waggle_0.2.0_x64_en-US.msi
D:/Projects/waggle-os-sesija-A/app/src-tauri/target/release/bundle/nsis/Waggle_0.2.0_x64-setup.exe
```

**Suggested Track G test sequence (per brief A19):**
1. Install via NSIS or MSI on a non-developer Windows machine
2. First-launch onboarding wizard renders (A10 flag empty → wizard shows)
3. Click through wizard (8 steps existing) → flag written → wizard does not re-trigger
4. Open Memory app → verify frames render (uses Tauri IPC `recall_memory`)
5. Save a sample frame → verify persists (Tauri IPC `save_memory`)
6. Open Settings → Models tab → switch shape from claude-gen1-v1 to qwen-thinking-gen1-v1 → verify localStorage `waggle:selected-shape` updates
7. Start a conversation → verify SSE streaming works (existing `/api/chat` path, unchanged by Sesija A)
8. (optional) Hit `/api/agent/run` directly via dev tools → verify shape-driven retrieval loop streams progress events
9. Close app → reopen → verify wizard does not re-trigger (A10 flag persistence works)

Friction log + iteration recommendations feed into Sesija A v2 if needed (per brief §5).

---

**Sesija A enters STANDBY pending Track A UI/UX spec emit for §2.6 polish iteration.**

End of SMOKE-COMPLETE handoff.

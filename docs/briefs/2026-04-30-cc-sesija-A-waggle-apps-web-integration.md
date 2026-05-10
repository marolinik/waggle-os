# CC Brief — Sesija A: Waggle apps/web Backend Integration

**Brief ID:** `cc-sesija-a-waggle-apps-web-integration-v1`
**Date:** 2026-04-30
**Author:** PM
**Status:** LOCKED (Marko ratifikovao 2026-04-30 "sve yes potvrdjeno")
**Stream:** CC Sesija A (paralelno sa Sesija B + Sesija C)
**Branch:** `phase-5-deployment-v2` (HEAD `a8283d6`, baseline `6bc2089`); kreirati feature granu `feature/apps-web-integration`
**Wall-clock:** 5-7 dana CC implementation (projection NOT trigger)
**Cost cap:** $30 hard / $25 halt / $10-15 expected (UI implementation low-cost; testovi i build pipeline dominiraju)
**Authority chain:**
- `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md`
- `decisions/2026-04-30-branch-architecture-opcija-c.md`
- `briefs/2026-04-29-ui-ux-inventory-os-shell.md` (CC-autorisan inventory pre-Phase-5 reset)

---

## §0 — Pre-flight gates (BLOCKING — must PASS before §1)

### §0.1 — Substrate readiness grep

CC mora dokumentovati u `apps-web-integration-evidence.md`:

1. `apps/web` postoji u repo strukturi (Tauri 2.0 framework). Verify `package.json` ima `@tauri-apps/api` ili equivalent dependency.
2. `apps/agent` (ili equivalent) postoji sa runRetrievalAgentLoop koji se može pozivati iz UI.
3. `packages/hive-mind-core` ili `packages/core` postoji za substrate access (sqlite + KG). Ako ne postoji, halt-and-PM (Sesija B mora prvo zatvoriti monorepo migration).
4. `packages/agent` ima exportovan registerShape API (Amendment 8 native, verified u Faza 1 closure).
5. `apps/web/src` ima React + TypeScript komponente (osnovna setup struktura).

Ako bilo koja stavka FAIL, halt-and-PM sa diagnostic.

### §0.2 — UI/UX spec dependency check

Track A (UI/UX finalize u Claude Design) je PARALELAN ali NIJE prerequisite za §1 kick-off. CC krene sa **stub UI komponentama** koje se update-uju u §6 polishing pass kada Track A ratifikuje finalni design.

Stub UI = funkcionalne komponente sa minimal styling (Tailwind defaults), correct backend wiring, all interactions wired, ali bez final dock pozicija/glass-effect/density tuning. Cilj: backend ↔ frontend integration ne čeka pixel-perfect design.

Final UI/UX spec će biti emit-ovan kao `D:/Projects/PM-Waggle-OS/specs/2026-05-XX-ui-ux-final-spec.md` (PM autoring posle Track A finalize). U §6 CC adapter komponente prema spec.

### §0.3 — Cost projection probe

Probe pre-implementation: 3 representative end-to-end requests kroz Memory app (recall + save + wiki query). Beleziš per-request cost p50/p95. Compute total cost projection za § implementation budget. Halt-and-PM ako probe-validated total > $25.

---

## §1 — Scope declaration

CC implementira **apps/web kao instalabilan Tauri 2.0 desktop app** za Win + macOS koji wraps:

1. Memory app — read/write hive-mind frames sa search, filter, importance scoring, provenance display, local graph viz
2. Wiki app — reads compiled wiki pages iz `packages/wiki-compiler` output
3. Agent loop integration — runRetrievalAgentLoop accessible iz UI sa GEPA-evolved variants (claude::gen1-v1 + qwen-thinking::gen1-v1) kao default shape selectable u Tweaks panel
4. Onboarding flow — first-launch detection, license key entry (placeholder za Stripe), persona quiz (Solo vs Pro tier), Tweaks initial config
5. Dock + Tweaks panel + window management (per UI/UX spec)

**Scope LOCKED:**
- claude::gen1-v1 + qwen-thinking::gen1-v1 default shapes (Faza 1 validated)
- gpt::gen1-v2 NOT default (Faza 2 deferred per scope LOCK)
- Tauri 2.0 framework (Rust backend + WebView frontend)
- Win + macOS targets (Linux deferred)

**Out of scope (ne ovaj sprint):**
- Browser extension (deferred Wave 4)
- Mobile app (deferred Wave 5)
- Cloud sync (Solo tier je local-first per locked decisions)
- KVARK enterprise features (zaseban future workstream)

---

## §2 — Implementation plan (sekvencijalno unutar sesije)

### §2.1 — Backend wiring (Days 1-2)

**Task A1:** Tauri commands za hive-mind substrate access. Create `apps/web/src-tauri/src/commands/memory.rs` sa Tauri commands `recall_memory`, `save_memory`, `search_entities`, `get_identity`, `compile_wiki_section`. Each command pozivaj odgovarajući `packages/hive-mind-core` ili `packages/core` API. Returns serializable JSON.

**Task A2:** TypeScript bindings za Tauri commands u `apps/web/src/lib/tauri-bindings.ts`. Use `@tauri-apps/api/tauri` invoke wrapper. Each binding ima TypeScript type za request + response.

**Task A3:** Agent loop integration. Create `apps/web/src-tauri/src/commands/agent.rs` sa Tauri command `run_agent_query` koji invoke-uje runRetrievalAgentLoop iz `packages/agent`. Pass selected shape iz Tweaks panel state. Return streaming response (Tauri events za chunked output).

**Task A4:** Wiki compiler integration. Tauri command `get_compiled_wiki_pages` koji reads `packages/wiki-compiler` output direktno iz hive-mind frame store.

### §2.2 — Stub UI komponente (Days 2-4)

**Task A5:** Memory app stub. React komponenta `<MemoryApp />` u `apps/web/src/apps/MemoryApp.tsx`. Search bar (recall query), filter pills (decision/fact/insight/task/event), entry list, detail panel sa provenance + importance + local graph, save dialog. Use Tauri bindings za sve data.

**Task A6:** Wiki app stub. React komponenta `<WikiApp />` u `apps/web/src/apps/WikiApp.tsx`. Wiki page browser, search, navigate cross-references, render markdown.

**Task A7:** Tweaks panel stub. Komponenta `<TweaksPanel />` sa: theme (dark/light), window chrome (glass/solid), density (compact/regular/comfy), dock position (bottom/left/right), user tier (simple/professional/power), billing tier (free/trial/pro/teams/enterprise), shape selection (claude::gen1-v1 / qwen-thinking::gen1-v1 default + base shapes opcije), demos (run onboarding, open spotlight, open workspace switcher, show notifications, restore welcome tip).

**Task A8:** Dock stub. Komponenta `<Dock />` sa appropriate icons + chips (Ops/Extend conditional na user tier=power). Stub centriran na dnu (final pozicija per Track A spec).

**Task A9:** Window management stub. Komponenta `<Window />` sa traffic lights (red/yellow/green), title bar, dragable (Tauri window.startDragging()), resizable. Memory + Wiki app render unutar window.

### §2.3 — Onboarding flow (Day 4)

**Task A10:** First-launch detection. `apps/web/src-tauri/src/commands/onboarding.rs` checks `~/.waggle/first-launch.flag` file. Ako ne postoji, route ka `<Onboarding />` komponenti.

**Task A11:** Onboarding wizard. 5-step React flow:
1. Welcome screen + Waggle intro (key features)
2. License key entry (Stripe placeholder — input field, validate via `packages/hive-mind-core` license validator, Solo tier free placeholder za pre-launch testing)
3. Persona quiz (3 questions ka Solo/Pro/Teams selection)
4. Tweaks initial config (theme + density + tier)
5. First recall demo (run sample query, show Memory app result)

Mark `~/.waggle/first-launch.flag` posle complete.

### §2.4 — Build pipeline (Days 4-5)

**Task A12:** Tauri config. `apps/web/src-tauri/tauri.conf.json` sa product name "Waggle", version "0.1.0", bundle targets ["msi", "dmg"], identifier "com.egzakta.waggle".

**Task A13:** GitHub Actions workflow. `apps/web/.github/workflows/build.yml` sa matrix [windows-latest, macos-latest], runs `npm install` + `npm run tauri build`, uploads artifacts.

**Task A14:** Local dev script. `apps/web/package.json` "scripts" → "dev": "tauri dev", "build": "tauri build", "build:win": "tauri build --target x86_64-pc-windows-msvc", "build:mac": "tauri build --target universal-apple-darwin".

### §2.5 — Tests (Days 5-6)

**Task A15:** Unit tests za Tauri commands. Vitest u `apps/web/src-tauri/tests/`. Mock hive-mind-core, verify command serialization, error handling.

**Task A16:** Component tests za React. Vitest + Testing Library u `apps/web/src/__tests__/`. Mock Tauri invoke, verify komponente render correctly, interactions trigger correct Tauri commands.

**Task A17:** Integration test (1-2 happy paths). E2e test sa Tauri test harness koji: launch app, enter license key, complete onboarding, recall query, save memory entry, verify result. Smoke validation.

### §2.6 — UI/UX final polish pass (Day 6-7, čeka Track A spec)

**Task A18:** Posle Track A emit-uje finalni UI/UX spec, CC adapter komponente prema spec:
- Dock position centriran na dnu (per Marko 2026-04-30 instrukcija)
- Glass vs solid chrome implementacija (Tweaks toggle)
- Density spacing (compact/regular/comfy)
- Theme tokens (dark default, light option) kroz CSS variables
- Window states (focused/blurred, minimized, maximized)
- Empty states (no memories yet, no wiki pages, search returned 0)
- Error states (network fail, hive-mind unavailable, license invalid)

Acceptance: paste-test screenshot Track A spec vs apps/web rendering = pixel-near match (subtle differences acceptable, structural identity required).

### §2.7 — Final acceptance (Day 7)

**Task A19:** Complete build + smoke test. `tauri build` produces `.msi` (Win) + `.dmg` (macOS) installers. Marko (ili PM kroz Computer Use) instalira ne-developer mašinu, prolazi onboarding, executes recall + save + wiki workflows, no terminal errors.

**Task A20:** Commit + emit "PHASE 5 SESIJA A COMPLETE — apps/web instalabilan build live, ready za Computer Use e2e testing". Push grana origin.

---

## §3 — Halt-and-PM triggers

- §0 sub-gate FAIL
- Cost overshoot >$25 (halt) ili >$30 (hard cap)
- Discovery van scope-a (Tauri framework not setup, agent loop ne integrated, hive-mind core API missing)
- Track A spec stigne sa structural changes koji invaliduju >30% stub UI rada (re-scope conversation)
- Build fail koji zahteva >1 dan extra wall-clock

Self-recover OK za:
- Minor TypeScript errors (fix and continue)
- Test failures koji su isolated (fix one test ne re-arch)
- Tauri command schema mismatches (fix bindings)

---

## §4 — Acceptance criteria (sve PASS pre §2.7 close)

1. `apps/web` builds clean za Win + macOS (`.msi` + `.dmg` artifacts present)
2. Onboarding flow complete (first-launch → 5 steps → flag set → main app)
3. Memory app: recall query returns matching frames, save dialog persist new frame, filter pills work, detail panel shows provenance correctly
4. Wiki app: page list renders, navigate cross-references works, markdown rendering
5. Tweaks panel: all toggles persist state, theme switch live (dark↔light), density updates spacing
6. Dock: icons present, centriran na dnu (per spec), Ops/Extend chips conditional na user tier
7. Window management: traffic lights work (close/min/max), drag by title bar, resize
8. Tests: all green (no skipped tests, coverage >70% za critical paths)
9. No terminal errors u dev mode (`tauri dev`) za 5-min smoke session
10. PM signoff posle Computer Use e2e test (Track G follow-up, ne blokira ovaj brief close)

---

## §5 — Cross-stream dependencies

**Sesija B (hive-mind monorepo migration) — paralelno:** Ako Sesija B finalize-uje monorepo migration tokom Sesija A rada, CC adapter import paths u apps/web prema novoj strukturi (`packages/hive-mind-core` umesto `packages/core` itd.). Halt-and-PM ako Sesija B emit-uje breaking changes mid-Sesija-A rada.

**Track A (UI/UX finalize) — paralelno, ne blokira:** Stub UI radi za §1-§2.5. §2.6 polish pass čeka Track A spec. Marko + PM iteriraju Track A nezavisno, finalni spec emit-uje se kao `specs/2026-05-XX-ui-ux-final-spec.md`.

**Track G (Computer Use e2e test) — pokreće se posle ovog brief close:** PM prolazi kroz instalabilan build sa Solo + Pro + outlier persona scripts (PM autoring paralelno). Friction log + iteration recommendations feed-uju Sesija A v2 ako bude potrebno.

---

## §6 — Audit trail anchors

- Pre-launch sprint consolidation: `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md`
- Branch architecture: `decisions/2026-04-30-branch-architecture-opcija-c.md`
- UI/UX OS shell inventory (input): `briefs/2026-04-29-ui-ux-inventory-os-shell.md`
- Faza 1 closure (substrate evidence): `decisions/2026-04-29-gepa-faza1-results.md`
- This brief: `briefs/2026-04-30-cc-sesija-A-waggle-apps-web-integration.md`

---

**End of brief. Awaiting CC kick-off.**

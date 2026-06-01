# Vision-Based E2E Harness — Design

**Date:** 2026-06-01
**Status:** DESIGN (read-only analysis; no harness code written yet)
**Author:** audit subagent
**Goal:** ONE comprehensive harness that "fully verifies the platform" using **vision** — a model judging screenshots for *meaning* (not pixel diffs) — built and run via **multi-agent workflows**.

> This is a design document. It proposes architecture options, picks a recommendation, names the single decision the user must resolve before build, and defines exact scope. It does **not** add test code.

---

## 1. What already exists (verified against the live repo)

Concrete, so the harness extends reality instead of a remembered shape:

| Asset | Location | What it gives us |
|---|---|---|
| Visual-regression spec | `tests/visual/views.spec.ts` | 7 views × {dark,light} = 14 **pixel-diff** screenshots; `maxDiffPixelRatio: 0.003` |
| Visual baselines | `tests/visual/baselines/…` (28 dirs present) | Existing PNG baselines for both themes |
| Full product audit | `tests/e2e/full-product-audit.spec.ts` | API-health checks + **dock-open helper** (`openAppViaDock`, handles `Ops`/`Extend` zone trays via `[data-dock-tray]`), console-error capture, per-app text assertions |
| User-journey spec | `tests/e2e/user-journeys.spec.ts` | 12 journeys: nav, sidebar collapse, Ctrl+K palette, theme toggle, chat input, settings tabs, cockpit cards |
| Playwright config | `playwright.config.ts` | `webServer` builds `apps/web` then spawns `npx tsx packages/server/src/local/start.ts --skip-litellm` on `:3333` with `WAGGLE_TRUST_LOCALHOST=1`; `reuseExistingServer: true` |
| Multi-agent primitives | `packages/agent/src/{workflow-harness,workflow-composer,subagent-orchestrator}.ts` | In-product workflow/subagent fan-out (`createHarnessRun`, `advancePhase`, `harnessEvents`) |
| Live MCP browsers | `mcp__plugin_playwright_playwright__*`, `mcp__chrome-devtools__*` | Turn-by-turn drive + `take_screenshot` / `take_snapshot` / `list_console_messages` / `lighthouse_audit` |

**Gap:** every existing check is either a **pixel diff** (brittle; flags antialiasing, not meaning) or a **substring assertion** (`text.toMatch(/persona|message/i)` — passes on a half-broken screen as long as one word renders). **Nothing judges whether a surface is actually correct, legible, and non-broken the way a human reviewer would.** That is the hole this harness fills.

### 1.1 Ground-truth facts that constrain the design (verified, correcting stale assumptions)

- **The real UI is a desktop-OS metaphor**, not a sidebar app. `Desktop.tsx` renders a `Dock` (zones `Ops`/`Extend` open `[data-dock-tray]` portals) + draggable `AppWindow`s. The 7 "views" map to dock apps (`ChatApp`, `MemoryApp`, `EventsApp`, `CapabilitiesApp`, `CockpitApp`, `MissionControlApp`, `SettingsApp`) plus standalone windows (Room, Agents/Personas, Files, Approvals, Vault, Connectors, Marketplace, Timeline, Backup, Telemetry, Governance).
- **Deterministic entry** = `/?skipOnboarding=true&tier=power` — `useOnboarding.ts:32` short-circuits the wizard and sets `tier=power`, unlocking the full dock. `?forceWizard=true` (DEV-only) forces the wizard for onboarding-flow capture.
- **Theme contract** = `document.documentElement` attribute `data-theme="light"`; **dark is the absence of the attribute** (`Index.tsx:11`, `useIsLightTheme.ts:14`, `index.css:140`). The `views.spec.ts` helper that toggles a `dark`/`light` *class* is partly stale and should not be the model for the new harness — set/remove `data-theme` instead.
- **Chat round-trip under `--skip-litellm` does NOT return a real assistant reply.** `service.ts:217-258`: with no LiteLLM and no Anthropic key, provider resolves to `anthropic-proxy` / **`health: 'degraded'`** / `"no API key — configure in Settings"`. So a chat *send* surfaces an error/degraded state, not a model answer. **This is the central design fork (see §5).**

---

## 2. Rubric — what "vision verdict" means

Each captured surface is graded by a vision model against five dimensions. Output is structured, not prose:

```jsonc
{
  "surface": "memory:dark",
  "verdict": "PASS" | "FAIL" | "WARN",
  "confidence": 0.0-1.0,
  "dimensions": {
    "renders_correctly":  { "pass": true,  "note": "frame list + search bar laid out, no overlap" },
    "no_error_state":     { "pass": true,  "note": "no red banner, no 'Something went wrong', no empty stack trace" },
    "flow_completes":     { "pass": true,  "note": "expected end-state for this step is visible" },
    "theme_legible":      { "pass": true,  "note": "text/background contrast adequate; no dark-on-dark or white-on-white" },
    "no_console_errors":  { "pass": true,  "note": "objective signal injected from Playwright/CDP, not vision" }
  },
  "evidence_screenshot": "artifacts/memory-dark.png"
}
```

Rules:
- **`renders_correctly`**, **`no_error_state`**, **`flow_completes`**, **`theme_legible`** are graded by the **vision model** from the screenshot + a per-surface expectation string.
- **`no_console_errors`** is **not** a vision judgment — it is an objective signal captured by the driver (`page.on('console')` / `list_console_messages`) and merged into the record, filtered for known-benign noise (favicon, 401/404 on optional endpoints, WebSocket sync) as `full-product-audit.spec.ts:312` already does.
- A surface **FAILs** if any vision dimension fails with confidence ≥ 0.7, or any real console error is present. **WARN** for low-confidence (0.4–0.7) vision fails → routes to human spot-check, never auto-blocks CI.
- The vision judge is handed **(a)** the screenshot, **(b)** a one-line expectation ("Memory app: a searchable list of memory frames or a clean empty state"), **(c)** the rubric. It must cite *what it sees* per dimension so verdicts are auditable.

---

## 3. Scope

### Surfaces (capture matrix)
**7 core views** (dock apps): `chat`, `memory`, `events`, `capabilities`, `cockpit`, `mission-control`, `settings`.
**Dock apps / standalone windows**: `room`, `agents` (Personas), `files`, `approvals`, `vault`, `connectors`, `marketplace`, `timeline`, `backup`, `telemetry`, `governance`, `dashboard` (Home).
**Overlays**: `onboarding wizard` (via `?forceWizard=true`), `global search` (Ctrl+K), `spawn-agent dialog`, `persona switcher`, `keyboard-shortcuts help`, `upgrade modal`.

### Flows (multi-step, end-state graded)
1. **Onboarding** — wizard step-through to completion (capture each step).
2. **Chat round-trip** — open Chat → type → send → observe response (see §5 fork: real reply vs degraded-state-handled-gracefully).
3. **Memory browse** — open Memory → search → frame list or empty state renders.
4. **Spawn agent** — open Spawn dialog → pick persona → confirm → agent appears in Room/Mission Control.
5. **Persona switch** — open PersonaSwitcher → select → header reflects new persona.
6. **Marketplace** — open Marketplace → browse packs → (install affordance present).
7. **Settings** — open Settings → walk tabs (General/Models/Vault/Permissions/Team/Advanced) → each renders.

### Themes
**dark** (no `data-theme`) and **light** (`data-theme="light"`) for every surface = full matrix ×2.

### Rubric dimensions (per surface)
`renders_correctly` · `no_error_state` · `flow_completes` · `theme_legible` · `no_console_errors` (objective).

**Matrix size:** ~19 surfaces × 2 themes ≈ 38 static captures + 7 flow end-states × 2 themes ≈ 14 flow captures ≈ **~52 vision judgments per full run.**

---

## 4. Architecture Options

### Option A — Capture-then-judge (Playwright drives, Workflow fans out vision judges)
**Mechanism:** A Playwright spec drives the scripted journey (every surface, both themes, the 7 flows), writing a numbered PNG + a sidecar JSON (`{surface, theme, expectation, consoleErrors[]}`) per capture into `artifacts/`. A separate **multi-agent Workflow** then fans out — one vision-judge subagent per screenshot — each grading against the rubric and emitting the structured verdict. A reducer agent aggregates into a single pass/fail report with confidences. Navigation is 100% deterministic (reuses `openAppViaDock`, the `data-theme` setter, the `?skipOnboarding` entry); meaning is vision-graded; the two phases are decoupled so judging is re-runnable on a frozen capture set without re-driving the browser.
**Pros:** Deterministic, replayable navigation; capture phase is plain Playwright (CI-gateable, runs headless on Linux today); judge phase parallelizes cleanly (N independent subagents, no shared state); a frozen capture set lets you re-grade after rubric tweaks for **$0 browser cost**; objective signals (console/network/lighthouse) attach per surface; failures ship the exact PNG as evidence.
**Cons:** Two-phase orchestration (capture artifact contract must be stable); vision judging has per-screenshot model cost (~52 calls/run); can't react mid-journey to an unexpected modal (a scripted step that mis-navigates produces a "wrong surface" capture rather than self-correcting).
**Effort:** **Medium.** ~1 capture spec (extends existing helpers) + 1 Workflow definition (judge fan-out + reducer) + rubric prompt. ~2–3 focused sessions.

### Option B — Live agentic drive (agents drive MCP browser turn-by-turn, judge in real time)
**Mechanism:** A coordinator agent drives a live MCP browser (`mcp__plugin_playwright_playwright__*` or `mcp__chrome-devtools__*`) step by step: navigate → `take_screenshot` → judge with its own vision → decide the next action from what it sees (open dock zone, dismiss a modal, retry). No pre-scripted path; the agent explores the surface list and adapts.
**Pros:** Most "agentic" — self-corrects around unexpected overlays/state; closest to how a human QA explores; no capture/judge contract to maintain; can chase a regression it notices ("that looked off, let me re-open it").
**Cons:** **Least deterministic** — same run can take different paths, so it's a poor CI gate (flaky, non-reproducible verdicts); live browser cost on every step; one MCP browser session is effectively serial (hard to parallelize the way a frozen-PNG fan-out does); harder to attach to the existing `npm run test:visual` lane; debugging "why did it fail" means replaying a non-deterministic trace.
**Effort:** **Medium-High.** Less *code* but more *prompt/loop engineering* to keep it bounded (loop-guard, step budget) and to make verdicts trustworthy. Ongoing cost per run.

### Option C — Hybrid (Playwright drives + captures + objective signals; vision agents grade meaning) — **RECOMMENDED**
**Mechanism:** Option A's deterministic capture, **enriched per surface with objective signals**: alongside each PNG, capture `console` errors (`page.on('console')`), failed network requests, and a `lighthouse_audit` (a11y/contrast/perf) for the heavy views. The vision Workflow then grades *meaning* while the objective signals grade *facts* — and a surface only PASSes when **both** agree. Vision catches "looks broken / illegible / wrong screen"; Lighthouse + console catch "contrast ratio 1.9:1 / uncaught TypeError / 500 on mount" that vision might rationalize away. The reducer cross-checks: a vision-PASS with a console-error or a Lighthouse-a11y-fail is downgraded to FAIL with both pieces of evidence.
**Pros:** Everything in A, **plus** a deterministic objective floor so the harness can't be fooled by a plausible-looking screenshot; `theme_legible` is corroborated by real contrast numbers, not just the model's eye; objective signals are cheap and CI-safe; gives two independent failure detectors (defense in depth).
**Cons:** Most moving parts (capture + console + network + lighthouse + vision + reducer); Lighthouse adds runtime per surface (budget it to the heavy views, not all 52); slightly more report schema.
**Effort:** **Medium-High** — A's effort + per-surface signal capture (mostly wiring existing CDP/Playwright APIs the repo already imports). ~3 sessions.

---

## 5. The ONE decision the user must resolve before build

> **Does the Chat round-trip flow grade against a REAL LLM reply, or against a gracefully-handled degraded state?**

This is forced by ground truth (§1.1): under the harness's own `--skip-litellm` server with no API key, `/api/chat` resolves the provider to **`degraded`** and **returns no assistant message**. So the chat flow's `flow_completes` dimension has two mutually exclusive definitions, and the harness must commit to one before any capture script is written:

- **Path 1 — Stub/degraded (deterministic, free, CI-default).** "Flow completes" = the user message renders, the send affordance works, and the app handles the missing-LLM state *gracefully* (a clear "configure API key" prompt, **not** a blank window or a stack trace). Fully deterministic, zero LLM spend, runs on CI Linux today. Does **not** verify a real answer renders.
- **Path 2 — Real LLM (high-signal, costs money + a key, flaky).** Inject a real Anthropic key into the harness server so chat returns an actual reply; vision grades that a coherent assistant message rendered. Highest fidelity for the headline flow, but introduces non-determinism (model output varies), per-run cost, and a secret the CI gate must hold.

A sensible resolution (pending user call): **Path 1 as the CI gate; Path 2 as an opt-in `--live-llm` lane** for pre-release runs. But the user must pick the default before build, because it dictates the chat capture script, the expectation strings, and whether CI needs a secret.

**Secondary decisions** (lower stakes, can default): **run target** — local Chromium against the built `apps/web` on `:3333` (recommended default; matches existing config) vs the Tauri binary (true shipping surface, but no headless screenshot path on Windows CI) vs CI Linux (the gate); and **capture-vs-live-drive** — already resolved by recommending Option C (capture).

---

## 6. Recommendation

**Option C (Hybrid).** It keeps Option A's deterministic, replayable, CI-gateable capture (reusing the dock-open / theme / onboarding-skip helpers already in `tests/e2e`), adds a vision Workflow for *meaning*, and backstops the vision verdict with cheap objective signals (console errors + Lighthouse contrast/a11y) so the harness has a deterministic floor and can't be fooled by a screenshot that merely *looks* fine. Build it on top of the existing `tests/visual` + `tests/e2e` infrastructure rather than greenfield: a new capture spec emits PNG + sidecar JSON, a Workflow fans out one vision-judge subagent per capture, a reducer cross-checks vision against objective signals and writes one report. Default the chat flow to **Path 1 (degraded-handled-gracefully)** for the CI gate with a **Path 2 `--live-llm`** opt-in — pending the user's call on §5.

---

## 7. Build sketch (after the decision is made)

1. **Capture spec** (`tests/vision/capture.spec.ts`): iterate the surface matrix × {dark,light}; reuse `openAppViaDock`; set theme via `data-theme`; for each surface write `artifacts/<surface>-<theme>.png` + `<surface>-<theme>.json` (`expectation`, `consoleErrors[]`, `networkFailures[]`, optional `lighthouse`). Drive the 7 flows to their end-state captures.
2. **Vision Workflow** (`workflow-composer` definition or a Task fan-out): one judge per capture → structured verdict; `dispatching-parallel-agents`-style fan-out.
3. **Reducer**: merge vision verdicts + objective signals; downgrade vision-PASS-with-hard-signal to FAIL; emit `artifacts/vision-report.json` + a Markdown summary; non-zero exit on any FAIL for the CI gate.
4. **Lanes**: `test:vision` (Path 1, CI) and `test:vision:live` (Path 2, pre-release, requires key).

---

## 8. Why not just keep the pixel-diff + substring suite

Pixel diff at `0.003` flags font-hinting and wallpaper jitter as failures while passing a screen whose *content* is wrong-but-pixel-identical-to-baseline; substring asserts (`toMatch(/persona/i)`) pass on a half-rendered, error-bannered, or dark-on-dark screen as long as one keyword survives. Neither answers the actual question — *"would a human look at this and say it's working and legible?"* Vision grading answers exactly that; the hybrid's objective floor keeps it honest.

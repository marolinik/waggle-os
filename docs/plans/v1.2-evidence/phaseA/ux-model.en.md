# Phase A — revalidation of audit group `ux-model`

> **English translation** of [ux-model.md](ux-model.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Revision under review:** `main = 2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`git status` clean except for two untracked `.docx` in `docs/`; working tree == HEAD, every `path:line` below is at that revision).
**Method:** read-only; `git show/log`, `rg`, reading files. No test was run (the repo is READ-ONLY for this pass); where a claim depends on execution, that is marked as a verification boundary.
**Scope:** S1 C16, C19, A20–A24, W5, W6 + spot-check "Installer version is 0.2.0"; focus list from the task (HomeCockpit, Sidebar/Dock/⌘K, Developer Mode vs experience tier, MemoryCenterApp, ChatWorkCanvas/SSE `step`, OnboardingWizard+ModelGate, `useHasWorkingModel`, managed Ollama, hardware-detect, cookbook catalog/model-fit, pull stream, i18n, aria-live, installer version).
**Status legend:** CONFIRMED AT REVISION · PARTIAL/UNWIRED · NOT CONFIRMED · ALREADY CLOSED · UNKNOWN. "Module exists" was never used as evidence of an E2E function.

---

## 1. Findings (per S1 claim)

### F-UXM-01 — S1 spot-check: "Installer version is `0.2.0`" (link: C1, AT-30)
- **Status:** CONFIRMED AT REVISION
- **Commit:** `2af0904d`; last change to `app/src-tauri/tauri.conf.json` = `72d85e58` (2026-08-17).
- **Path/symbol:** `app/src-tauri/tauri.conf.json:4` `"version": "0.2.0"`; `app/src-tauri/Cargo.toml:3` `version = "0.2.0"`; **drift:** `app/package.json:4` `"version": "0.1.0"`, root `package.json:3` `"0.1.0"`, `apps/web/package.json:4` `"0.1.0"`.
- **Input → output:** `grep -n version` over three files → 0.2.0 / 0.2.0 / 0.1.0.
- **Verification boundary:** static; no build was run.
- **Expected:** a single source of truth for the product version (C1: spec document version ≠ application version).
- **Smallest change:** planning-only — do not touch the number; in the C1 resolution, record that the installer is 0.2.0 and that `app/package.json` is not synchronized (optionally one `chore` PR for alignment once the public number is decided).

### F-UXM-02 — A20: `useHasWorkingModel.ts:174,:244` are false positives (link: DIR-17, AT-20)
- **Status:** CONFIRMED AT REVISION (lines match S1; there is also a third path)
- **Commit:** last change `5e2de2b8` (2026-09-04, "fix(models): distinguish unavailable from unconfigured") — so the behavior is *intentional* and regression-locked.
- **Path/symbol:** `apps/web/src/hooks/useHasWorkingModel.ts`
  - `:171-174` — `transient = outcomes.some(rejected) || probes.some(configured && valid !== false)`; `ready: verified || (!rejected && transient)`. If the sidecar is offline (`probeProvider` rejected) or the probe returns `verified:false` without rejection → `cloudReady = true`.
  - `:129-136` — default-model probe `configured && !verified && !rejected` for a non-`openai-compatible/` model → `ready: true` (a third false positive, S1 does not list it).
  - `:244-245` — `localReady = localModelCount > 0; hasWorkingModel = cloudReady || localReady` (count-based; `adapter.getLocalInferenceStatus().totalLocalModels`, i.e. the `/api/tags` inventory, not generation).
- **Consumers:** `onboarding/ModelGateStep.tsx:19,:63` (Continue gate), `model-gate/NoModelBanner.tsx:17-25`, `HomeRoute.tsx`, `LoginBriefing.tsx`, `AppShell.tsx`.
- **Repro test (existing, locks in the wrong behavior):** `useHasWorkingModel.test.ts:271-281` ("a transient default result remains usable after probing settles" → `hasWorkingModel:true`), `:301-307` ("valid but unverified fallback provider remains usable"), `:486-495` ("treats unavailable fallback probes as transient usable readiness" — `probeProvider` mockRejected('sidecar offline') → `hasWorkingModel:true`). These tests turn RED once it is fixed.
- **Same logic inline:** `model-gate/ModelGate.tsx:257-261` `cloudReady = activeProviders.length > 0; localReady = totalLocalModels > 0; ready = ...` and the fallback banner `:859-879` "You have a working model — you’re ready to go." (reachable when there is no cloud provider → relies on the count-based local check).
- **Expected (DIR-17/AT-20):** ready only after an actual generation; `transient`/timeout/offline → `availability:'checking'|'unknown'`, not `ready`.
- **Smallest change:** `:174` → `ready: verified`; `:129-136` → `ready:false` + `availability:'unavailable'`; `:244` → local readiness from a live probe (`probeConfiguredModel` already supports the `ollama/` prefix, `settings.ts:116-122`, or reuse the post-pull `/api/generate` probe from `local-inference.ts:355-377`); rework the three tests above to the opposite expectations.

### F-UXM-03 — A20/DIR-17: the readiness probe is a 1-token content check, with no tool round-trip and no distinction between causes (link: AT-20)
- **Status:** CONFIRMED AT REVISION
- **Path/symbol:** `packages/server/src/local/routes/settings.ts`
  - `:103-164` `probeConfiguredModel`: `max_tokens: isQwen ? 32 : 1` (`:141`), prompt "Reply with exactly WAGGLE_OK." (`:142`); `verified = typeof content === 'string' && content.trim().length > 0` (`:150-153`) — **does not check the token content**.
  - `:126` timeout 15 s (Qwen) / 5 s; `:155-158` `rejected` only for `401|403|authentication|model_not_found`; **every other HTTP status, timeout, cold start, network error → identical `{configured:true, verified:false}`** (`:158-160`).
  - `:864-889` `POST /api/settings/probe-model`; `:844-862` `probe-provider` (key only).
  - Router readiness `anthropic-proxy.ts:848-917` `probeReadyOllamaModel`: `/api/tags` + `/api/show` `capabilities` contains `'completion'` — format-only, no generation (limits `:649-652`: 2 s/2.75 s).
- **UI:** `ModelGate.tsx:843-858` shows all unverified outcomes with the same neutral message "Couldn’t confirm model access just now."; `:32` `MODEL_READINESS_UI_TIMEOUT_MS = 16_000`.
- **Tool/structured-output round-trip:** `rg` over `packages/server/src` and `apps/web/src` for a tool-call readiness probe → **not found** (checked via `probe`, `tool_choice`, `WAGGLE_OK` searches; not by the FRD name).
- **Expected:** for the work profile, a probe with a tool/structured-output call; separate reasons (`timeout|unreachable|cold_start|http_error|empty_content`) and separate messages.
- **Smallest change:** add `reason` to `ModelProbeResult` (`settings.ts:95-101`) and a UI map; an optional second probe with one trivial tool call for the `work` profile; do not change the chat path.

### F-UXM-04 — A21: pull `stream:false`, 45-min timeout, no progress/resume; the runtime download IS resumable (link: AT-20, AT-30)
- **Status:** CONFIRMED AT REVISION (S1 is correct for the model pull; S1 does not mention that the runtime download is already resumable)
- **Path/symbol:**
  - `packages/server/src/local/routes/local-inference.ts:313-332` `POST /api/local-inference/pull` → `fetch(${OLLAMA_URL}/api/pull, { body: { name, stream:false }, signal: AbortSignal.timeout(45*60_000) })`; no progress events; interruption = 502 `LOCAL_MODEL_SETUP_FAILED` (`:386-389`).
  - After the pull: digest check (`:338-353`) **and a live generation probe** `/api/generate` "Reply with the single word OK." (`:355-377`, `verifiedGeneration:true`) — an existing high-quality part.
  - UI `ModelGate.tsx:1279-1291`: button "Downloading and verifying…" (spinner), no percentage/ETA — consistent with the brief's rule not to invent a percentage, but the user has no information at all during a multi-gigabyte download.
  - **Contrast:** `managed-ollama-runtime.ts:1109-1204` `downloadArtifact` — Range resume (`:1127`, `:1138-1151`), size + sha256 verification (`:1180-1193`), retry with backoff, pinned artifacts with sha256 (`:158-237`), `DOWNLOAD_TIMEOUT_MS = 45 min` (`:32`).
- **Verification boundary:** an interrupted pull was not executed; Ollama itself resumes partially downloaded blobs on a repeated `pull`, but Waggle neither advertises nor verifies this.
- **Expected (AT-20):** "an interrupted pull is recoverable" visible to the user; a progress stream.
- **Smallest change:** `stream:true` + relay of the NDJSON status as SSE/polling; after an interruption, a repeated `pull` of the same ref + keep the digest+generation probe; do not touch the managed runtime download.

### F-UXM-05 — A21/C19: hardware-detect is NVIDIA (+Apple Silicon) only; AMD/Intel/WMI on Windows fall back to the CPU floor (link: AT-20, AT-30)
- **Status:** CONFIRMED AT REVISION
- **Commit:** last change `ea798998` (2026-08-10).
- **Path/symbol:** `packages/server/src/local/hardware-detect.ts:7-19` (staged: NVIDIA, Apple, Basic; "AMD sysfs, Windows WMI … intentionally NOT built"), `:95-109` nvidia-smi candidates, `:174-198` `detectNvidia`, `:315-333` orchestrator; `:330` comment "STAGED TAIL would slot here: detectAmd(run) → detectWindowsWmi(run)". Result on an AMD/Intel Windows laptop: `hasGpu:false`, `backend: CPU (x64)` → `model-fit.ts:296-301` picks `cpu_only`.
- **Tests:** `packages/server/tests/hardware-detect.test.ts:31-201` cover parse/NVIDIA/Apple/CPU fallback; no AMD/Intel case.
- **Repo-wide:** `rg detectAmd|rocm-smi|Win32_VideoController|DXGI|xpu-smi` → only the comment `:330` and a negative test in `tauri-config.test.ts:4897`.
- **Expected (A21/§11.3):** the hardware ladder must know the VRAM on AMD/Intel; otherwise "24 GB GPU" classes are never recognized on a non-NVIDIA machine.
- **Smallest change:** `detectWindowsWmi(run)` via `Get-CimInstance Win32_VideoController` (known 4 GB cap on `AdapterRAM` — use the registry `HardwareInformation.qwMemorySize`) in the same injectable `CommandRunner` pattern; a test with fake output.

### F-UXM-06 — C19/W6: the catalog has no Qwen 3.5/3.6/3.8; the target model is not on any production path; the certified managed model is `qwen2.5:0.5b` (link: AT-20, AT-28, D-15)
- **Status:** CONFIRMED AT REVISION (for "not re-baselined"); UNKNOWN for `qwen3_5` arch support in the pinned Ollama
- **Path/symbol:**
  - `packages/agent/src/cookbook/catalog.ts:44-51` — newest Qwen rows: `qwen3:*` (2025-04-28) including the MoE `qwen3:30b-a3b`; no `qwen3.5/3.6/3.8` and no 27B dense Qwen (27B exists only as `gemma2:27b`/`gemma3:27b`, `:59,:62`). Last change `e46ff6b0` (2026-06-28).
  - `packages/agent/src/cookbook/model-fit.ts:207-214` — arch bonus by *string* (`qwen3.6`/`qwen3_5`…), has no effect because the catalog has no such rows.
  - `rg qwen3\.[568]|qwen3_5` in `packages/server/src` → 0; in `apps/web/src` only the test fixture `openai-compatible/qwen3.8-flash-next` (a cloud alias in tests, not a local model).
  - The evidence model `qwen3.6-35b-a3b` exists only as a cloud alias: `packages/agent/config/model-prompt-shapes.json:16-24` (DashScope/OpenRouter) and `scripts/run-pilot-2026-04-26.ts:102-103`.
  - Pinned runtime: `managed-ollama-runtime.ts:28-29` `OLLAMA_TARGET_VERSION='0.32.3'`, rollback `0.32.0`.
  - Certificate: `scripts/certify-windows-installer.ps1:2099` `$managedCertificateModel = 'qwen2.5:0.5b'`; `:2951-2961` pull + `verifiedGeneration`; `:2979-3005` SSE chat check. So the "managed model receipt" proves a 0.5B smoke model, not the reference target.
- **Verification boundary:** offline I cannot confirm whether Ollama 0.32.3 serves the Qwen 3.8 27B architecture; that is UNKNOWN and requires an online check (official Ollama library/tag).
- **Expected (C19 RE-BASELINE):** exact ID/revision/quant/license in the catalog + a runtime arch check + a smoke model kept separate from the recommended model in the receipt.
- **Smallest change:** add catalog row(s) for the confirmed target (with `releaseDate`, `contextLength`, `quant`); a `/api/show` arch check against the pinned Ollama in `local-inference.ts`; in the receipt, an explicit `certificateModel` vs `recommendedModel` field.

### F-UXM-07 — A22: Failure UX (FAILED/BLOCKED/interrupted, "View work") (link: AT-03, AT-07, AT-10)
- **Status:** PARTIAL/UNWIRED
- **Path/symbol (exists, scattered):** `HomeCockpit.tsx:962-993` failure rows for overnight automations → Automation Center; `AutomationCenterApp.tsx:515` "Attention required — last run failed"; `RoomApp.tsx:52,:66` colors for `failed|interrupted`; `memory/HarvestTab.tsx:331-343` M-08 "Last harvest interrupted … Resume"; `AgentsApp.tsx:134` toast "Run failed"; chat `useChat.ts:41-45` `GENERATION_FAILED_PREFIX`.
- **Missing:** `rg "View work"` → 0; no unified status→label/tone map for agent runs; `interrupted` (which `agent-run-registry` writes on restart — S1 spot-check, outside this group) is shown only in RoomApp; `agents/*` rows know only `running|archived` (`AgentCenterRow.tsx:87,:99`).
- **Expected (A22):** the same "View work" for partial/blocked/cancelled/failed; no percentage.
- **Smallest change:** depends on the W1 status map; for now — a shared `run-status-labels.ts` (modeled on `lib/activity-labels.ts`) used by Home/Agents/Room.

### F-UXM-08 — A23: two switches (experience tier + Developer Mode) and jargon on the Essential path (link: D-09, AT-17 indirectly)
- **Status:** CONFIRMED AT REVISION (two independent switches; jargon present; no copy lint test)
- **Path/symbol:**
  - Experience tier: `dock-tiers.ts:20` `UserTier = 'simple'|'professional'|'power'|'admin'`; `SettingsApp.tsx:605-629` "Essential / Standard / Everything" → `updateOnboarding({tier})`; `providers/ShellContext.tsx:157` `currentTier = onboardingState.tier || 'simple'`; consumers `settings-tier-filter.ts`, `onboarding-tier-filter.ts`, `dock-tiers.ts:168-171`, `AppShell.tsx:700,:721-730` (pinned only for `power|admin`), `command-catalog.ts:108-115` (Pinned group). Spec: `docs/ux-disclosure-levels.md` (exists).
  - Developer Mode: `hooks/useDeveloperMode.ts:12` localStorage `waggle:developer-mode`; `SettingsApp.tsx:1404-1419` toggle "Show token counts and per-call cost in the status bar"; `StatusBar.tsx:41,:194-200`.
  - Jargon on the default (Essential) path: `dock-tiers.ts:123` "Talk to your AI agents"; `Sidebar.tsx:180-191` button **"New Agent"** visible on every tier (no gating; `AppShell.tsx:803` always passes `onSpawnAgent`); `AppShell.tsx:718` spine item "Agents"; `command-catalog.ts:117-119` — the **"Power tools"** group (`:83-101`: "Run a team of agents · waggle-dance · swarm", "Connect a tool · MCP servers", Room, Benchmarks `/benchmarks`, Platform & roadmap `/platform`) is shown **to all tiers** — `gate()` (`:103-104`) filters only by billing rank, `isPro` controls only Pinned; `FirstTaskStep.tsx:17,:29` "Give your agent its first task" / "Ask your agent to do something…"; `TemplateStep.tsx:28` "with a matching specialist"; `MemoryCenterApp.tsx:67` "Self-evolving prompts and agents".
  - `command-catalog.ts:80` "Upgrade to Team" in the Do group — conflicts with D-01/D-02 (belongs to the WB group; cross-ref).
  - Copy lint: `rg jargon|copy.?lint|banned` over the tests → none; `command-catalog.test.ts:1-35` does not check the visibility of the power group on Essential.
- **Expected (A23 ACCEPT WITH EXCEPTIONS):** one understandable advanced switch; the everyday path without technical instructions, but without hiding security-relevant naming (Claude Code/connector).
- **Smallest change:** `buildCommandCatalog` → `power` group only for `isPro` (or a separate `showPowerTools` flag); hide/rename "New Agent" below the power tier; a vitest copy-lint over `TIER_DOCK_CONFIG.simple`, spine labels and onboarding steps with an allowlist; the decision on merging Developer Mode into the tier is a DECISION for the founder (do not change it silently).

### F-UXM-09 — A24: i18n absent; `aria-live` in 29 files; axe e2e exists but does not cover onboarding (link: §11.1)
- **Status:** CONFIRMED AT REVISION
- **Path/symbol:**
  - i18n: `package.json`, `apps/web/package.json`, `app/package.json` → no `i18next|react-intl|lingui|formatjs`; in `apps/web/src` only comments: `onboarding/WelcomeStep.tsx:70-71` "no i18n exists yet", static badge "English (US)" `:72-78`; `overlays/EraseDataDialog.tsx:14`. The landing site `apps/www` has `apps/www/messages/en.json` + `apps/www/i18n/request.ts` (www only). Centralized strings in the app: only `lib/notification-copy.ts` and `lib/activity-labels.ts:9-37`.
  - aria-live: `rg -l aria-live apps/web/src` → **29** files (matches S1). Work-progress surface `components/os/warm/ActivityStream.tsx:58` `aria-busy`, `:71` `role="status" aria-live="polite" aria-atomic`, `:86` `role="region"`; `OnboardingWizard.tsx:639` `aria-live="polite"`; `ModelGate.tsx` 13 `role="status|alert"` places; `NoModelBanner.tsx:34-36`.
  - axe: `tests/e2e/runtime-a11y.spec.ts:10-60` — 43 routes × 2 viewports (desktop/mobile) with `skipOnboarding=true&…&tier=power`; **OnboardingWizard and the ModelGate step are not in the route list**.
- **Expected (A24 ACCEPT THE GOAL, FLAG THE DECISION):** English-only is a decision to be confirmed; new strings centralized; tests for new surfaces.
- **Smallest change:** add the `?forceWizard=true` route (steps 2–6) to the axe list; new Work Progress labels go into the central module (extend `activity-labels.ts`); no i18n framework until there is a decision.

### F-UXM-10 — C16: personas in onboarding and in the switcher (link: D-09)
- **Status:** CONFIRMED AT REVISION (with a refinement: onboarding does NOT require choosing a persona)
- **Path/symbol:**
  - `OnboardingWizard.tsx:97` 6 steps with no persona step; `:408` `persona = TEMPLATE_PERSONA[templateId] ?? 'general-purpose'` (automatic), `:461,:504-505`. `TemplateStep.tsx:6-11,:28` — the template picks a "matching specialist".
  - `onboarding/constants.ts:102` `ALL_ONBOARDING_PERSONAS` (19), `:125` `getPersonasForTemplate` → the only callers are tests (`lib/onboarding-tier-filter.test.ts:14`); not used in the wizard → **exists-but-unwired**.
  - `overlays/PersonaSwitcher.tsx:67-83` UNIVERSAL MODES (8) + specialists per template, `:176-179` fallback to `PERSONAS` (22); opened with Ctrl+Shift+P (`AppShell.tsx:436,:589,:849-850`) — optional, not a mandatory step.
  - Copy uses "agent/specialist" (F-UXM-08).
- **Expected (C16 REFINE):** an optional, understandable role remains; no mandatory choice before the first job → **it already works that way**; only the copy remains.
- **Smallest change:** rename to "role/modes" in the copy; remove or wire the dead `ALL_ONBOARDING_PERSONAS`/`getPersonasForTemplate`.

### F-UXM-11 — W5 + A11: SSE `step` channel, Work Progress, ChatWorkCanvas, `harnessEvents` (link: AT-06, AT-10)
- **Status:** CONFIRMED AT REVISION (assets exist) / PARTIAL (Work Progress contract)
- **Path/symbol:**
  - Server `step`: `routes/chat-agent-run.ts:155-199` (`{content, phase?}`; `phase` only `model_active`/`model_streaming`), `chat-turn-preparation.ts:984-995` (`workspace_queue`/`workspace_acquired`), `chat-approval-hook.ts`, `chat-attempt-chain.ts`; event types `local/index.ts:3189`.
  - Client: `lib/types.ts:575-586` `StepContentBlock {description, status:'running'|'done', provenance?}`; `:786` SSE types; `hooks/useChat.ts:925-948` (previous running step → done); `chat-blocks/BlockRenderer.tsx:231-367` `renderActivityGroup` → `ActivityStream` with the summary "Working · N tools".
  - **No** `runId/phaseId/status/evidenceRefs` in the `step` payload (A11 confirmed); harness phases emit on the **global** `harnessEvents` `EventEmitter` (`packages/agent/src/workflow-harness.ts:132,:144,:243-250,:300,:323-331,:353,:369`), bridge `harness-trace-bridge.ts:8,:33,:82`; no run-scoped bus.
  - `chat-blocks/ChatWorkCanvas.tsx:2-11` — side panel for the last file-write artifact; comment "There is no document-body stream channel today"; `:18` `ARTIFACT_TOOLS`, `:30-49` `selectCanvasArtifact`; callers `ChatApp.tsx:801,:2485`. **Not** a Work Progress surface.
- **Expected (§11.1 Work Progress):** phase intent, actual status, blocker, cost, result, View work; no percentages.
- **Smallest change:** additively extend the `step` payload and `StepContentBlock` (`runId`, `phaseId`, `status: running|done|failed|blocked`, `evidenceRefs`); bridge `harnessEvents` → per-run `step` modeled on `HarnessTraceBridge`; keep `ActivityStream` (it already has `aria-live`).

### F-UXM-12 — W6: OnboardingWizard 6 steps (resumable) + ModelGate hard gate; the first task is "Hello" (link: AT-20, AT-21, §11.2)
- **Status:** CONFIRMED AT REVISION (assets); PARTIAL (the first task does not produce an artifact)
- **Path/symbol:** `OnboardingWizard.tsx:97` `STEP_NAMES = ['first-launch','who-are-you','model-gate','memory-import','template','first-task']`; resume clamp `:112-116`; persist `hooks/useOnboarding.ts:27` `waggle:onboarding` (localStorage); render `:664-720`; `ModelGateStep.tsx:63-65` Continue `disabled={!hasWorkingModel}`, `:55-60` "I’ll do this later" → `NoModelBanner`; `:107` `DEFAULT_FIRST_MESSAGE = 'Hello! What can you help me with?'`; `FirstTaskStep.tsx:5-11` suggestions per template.
- **Difference from the §11.2 proposed flow:** no "first Workspace + selected sources" step (memory-import = import of AI exports/Claude Code), no optional mail/calendar connection; the wizard is already deterministic before the model (no LLM guidance) — that is fine.
- **Smallest change:** default first task → a template-specific task that produces an artifact (the suggestions already exist); step reordering only together with W6.

### F-UXM-13 — D-07/W5: HomeCockpit blocks (What Needs Me / My Work / Routines / Ask Waggle)
- **Status:** PARTIAL/UNWIRED
- **Path/symbol:** `apps/web/src/components/os/apps/HomeCockpit.tsx` (caller `routes/HomeRoute.tsx:32`): `:908-914` GreetingHeader; `:919` RecallStrip (`home-cockpit-recall`, `:170`); `:921-929` StartHereCard (`buildStartHereMove :202-260`); `:931-957` banner "memories from your imports need your review"; `:959-1007` `OvernightHero` + automation failure rows; `:1011-1013` DreamDiaryCard; `:1015-1024` "Pick up where you left off" (`:459-460`); `:1026-1030` "Waggle suggests" (`:530-531`); `:1034-1038` "Up next" (`:561-562`; `types.ts:352` `UpNextItem.kind: 'event'|'task'|'schedule'`); `:1040-1044` **`AskBar`** (`warm/AskBar.tsx`) = "Ask Waggle" exists.
- **Mapping to D-07:** Ask Waggle ✔; My Work ≈ RecentWorkspaces ✔ (different name); What Needs Me — partial (StartHere + `pendingCount` + review banner, no unified WorkItem list); Routines — **no** block (the word "Routines" appears only in `CockpitApp.tsx:196` "Scheduled Routines"; OvernightHero shows automation outcomes without management).
- **Smallest change:** rename/group the existing panels; the Routines block reads the existing `CronStore`/`/api/automations` (not a new engine).

### F-UXM-14 — W5: MemoryCenterApp copy/IA
- **Status:** CONFIRMED AT REVISION (IA already condensed; copy mostly plain)
- **Path/symbol:** `MemoryCenterApp.tsx:38` 8 views; `:57-60` primary tabs Trust/Memories/Timeline/Graph; `:64-67` Advanced: Imports/Maintenance/Wiki/Improvements (`:154-170` "Advanced: <tab>"); `:217-236` personal/workspace mind switch; `:67` tooltip "Self-evolving prompts and agents" (the only jargon). Caller `routes/MemoryRoute.tsx:85`.
- **Smallest change:** one tooltip; keep the rest (S1 W5 "Memory IA copy" is overestimated as net-new).

### F-UXM-15 — Focus: Sidebar/Dock/⌘K items (New Agent, Waggle Dance, Room, MCP, Platform, Benchmarks) (link: D-09)
- **Status:** CONFIRMED AT REVISION
- **Path/symbol:** Sidebar spine `AppShell.tsx:702-720` Home/Chat/Memory/Agents/Library; pinned (power) `:721-730` "Agent swarm" `/waggle-dance`, Connectors, Approvals (TEAMS); `Sidebar.tsx:180-191` "New Agent" (always); ⌘K `command-catalog.ts:83-101` swarm/MCP/Room/Benchmarks/Platform/Team; `dock-tiers.ts:66-118` POWER_CONFIG (`:79` Room, `:80` Waggle Dance, `:82` Approvals `minBillingTier:'TEAMS'` — S1 spot-check, WB group, `:91` MCP Hub); `:121-131` simple dock = Home/Chat/Memory/Files/Vault/Settings (already "de-agented" except for the description `:123`).
- **Conclusion:** the nav is already two-layered; the remaining D-09 problems are "New Agent" on all tiers and ⌘K Power tools without tier gating (F-UXM-08).

---

## 2. Existing assets to preserve (callers verified with `rg`)

| What | Path | Callers |
|---|---|---|
| Onboarding wizard, 6 steps, resumable | `apps/web/src/components/os/overlays/OnboardingWizard.tsx:97,:112-116`; `hooks/useOnboarding.ts:27` | `AppShell.tsx:759` |
| Shared ModelGate (Settings ↔ onboarding) | `apps/web/src/components/os/model-gate/ModelGate.tsx` | `onboarding/ModelGateStep.tsx:47`; `SettingsApp.tsx:792` |
| `useHasWorkingModel` signal (fix, do not replace) | `apps/web/src/hooks/useHasWorkingModel.ts` | `ModelGateStep.tsx:19`; `NoModelBanner.tsx:24`; `HomeRoute.tsx`; `LoginBriefing.tsx`; `AppShell.tsx` |
| Live probe route + `probeConfiguredModel` | `packages/server/src/local/routes/settings.ts:103-164,:844-889` | `adapter.ts:2674,:2693`; `ModelGate.tsx:298,:341,:343`; `useHasWorkingModel.ts:88,:159,:161` |
| Managed Ollama: pin 0.32.3/0.32.0 + sha256 + Range resume + rollback | `packages/server/src/local/managed-ollama-runtime.ts:28-29,:158-237,:1109-1204` | `routes/local-inference.ts:20-25,:202,:277` |
| Post-pull digest + live generation probe | `packages/server/src/local/routes/local-inference.ts:338-377` | `ModelGate.tsx` pull UI; `scripts/certify-windows-installer.ps1:2951-2961` |
| Hardware scan (NVIDIA/Apple/CPU) + fit engine + catalog | `packages/server/src/local/hardware-detect.ts`; `packages/agent/src/cookbook/model-fit.ts:380-401`; `cookbook/catalog.ts` | `local-inference.ts:18-19,:40,:227`; `ModelGate.tsx:235` (`getLocalInferenceModels('general')`) |
| SSE `step` channel + `StepContentBlock` + `ActivityStream` (aria-live) | `routes/chat-agent-run.ts:155-199`; `lib/types.ts:575-586`; `hooks/useChat.ts:925-948`; `warm/ActivityStream.tsx:58,:71` | `BlockRenderer.tsx:231-367` |
| `harnessEvents` + `HarnessTraceBridge` (candidate for a per-run bridge) | `packages/agent/src/workflow-harness.ts:132`; `harness-trace-bridge.ts:33,:82` | `packages/agent/src/index.ts:316`; `server/src/local/index.ts:595` |
| HomeCockpit panels + AskBar + OvernightHero | `apps/HomeCockpit.tsx:902-1046`; `warm/AskBar.tsx`; `warm/OvernightHero.tsx` | `routes/HomeRoute.tsx:32` |
| Sidebar spine/pinned, ⌘K catalog, dock tiers | `os/Sidebar.tsx`; `lib/command-catalog.ts`; `lib/dock-tiers.ts` | `AppShell.tsx:41,:43,:648,:702-744,:799-803` |
| Experience tier + spec | `providers/ShellContext.tsx:157`; `lib/settings-tier-filter.ts`; `lib/onboarding-tier-filter.ts`; `docs/ux-disclosure-levels.md` | `SettingsApp.tsx:605-629`; `AppShell.tsx:700` |
| Developer Mode | `hooks/useDeveloperMode.ts` | `SettingsApp.tsx:19,:218,:1404-1419`; `StatusBar.tsx:8,:41,:194-200` |
| MemoryCenterApp (4 + Advanced) | `apps/MemoryCenterApp.tsx:57-67` | `routes/MemoryRoute.tsx:85` |
| CronStore + LocalScheduler + AutomationCenterApp (Routines reuse) | `packages/core/src/cron-store.ts`; `server/src/local/cron.ts:90`; `apps/AutomationCenterApp.tsx` | `server/src/local/index.ts:192,:585,:1919`; `routes/automations.ts:11`; `routes/AutomationsRoute.tsx:12,:31` |
| axe e2e (43 routes × 2 viewports) | `tests/e2e/runtime-a11y.spec.ts:10-60` | Playwright e2e config |
| Centralized copy modules (seed for A24) | `lib/activity-labels.ts:9-37`; `lib/notification-copy.ts` | `activity-labels.test.ts`; UI rail |
| ChatWorkCanvas (artifact panel, not Work Progress) | `chat-blocks/ChatWorkCanvas.tsx` | `ChatApp.tsx:801,:2485` |
| **Exists-but-unwired:** `ALL_ONBOARDING_PERSONAS`, `getPersonasForTemplate` | `onboarding/constants.ts:102,:125` | only `lib/onboarding-tier-filter.test.ts:14` |
| **Exists-but-unwired:** `WorkspaceCreateStep`, `ReadyStep` (superseded) | `onboarding/WorkspaceCreateStep.tsx`, `ReadyStep.tsx`, `index.ts:7-8` | not in `OnboardingWizard.tsx:10-15` |

---

## 3. Notes and boundaries
- No S1 claim from this group is ALREADY CLOSED; all cited lines (`useHasWorkingModel.ts:174,:244`, `0.2.0`, 29 aria-live files, `stream:false` + 45 min) are identical at `2af0904d`.
- UNKNOWN: whether the pinned Ollama 0.32.3 serves the Qwen 3.8 27B architecture (`qwen3_5` tag) — this cannot be determined offline; it requires an online check before the re-baseline (C19).
- Cross-ref for other groups: `dock-tiers.ts:82` Approvals TEAMS gate and `command-catalog.ts:80` "Upgrade to Team" → WB; `agent-run-registry` `interrupted` on restart → W1.
- No architecture was proposed; the "smallest change" items are local edits to existing files. Decisions left to the founder: English-only first release (A24), merging Developer Mode into the tier (A23), exact target model ID/quant (C19/D-15).

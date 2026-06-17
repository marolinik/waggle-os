# Warm-Hive PR5 — Phase D Live Smoke (2026-06-17)

> **Verdict: PASS.** PR5 (Settings models-first/failover reskin + Onboarding 6-step + hard model gate) is live-verified end-to-end against a real sidecar. All five build gates green. **0 PR5-attributable console errors.** Ready for merge per the founder's call.

## Scope
Phase D of `docs/redesign-warm-hive/PR5-BUILD-PLAN.md §5` — the final phase. The adversarial review already ran (it produced the `80e44a16` HIGH fix: invalid Google/Gemini key was reported "verified"). This is the remaining **live browser smoke**.

- **Branch:** `feature/warm-hive-pr5` · **HEAD:** `80e44a16`
- **Stack:** Vite dev (`:8080`) → proxy → Fastify sidecar (`:3333`, `WAGGLE_SKIP_LITELLM=1`), driven via Chrome DevTools MCP.
- **Two sidecar states used:** (1) real `~/.waggle` vault (12 provider keys + 7 Ollama models present) for the reskin + happy-path; (2) a throwaway **clean-vault** sidecar (`HOME=temp`, empty vault, `OLLAMA_HOST` → dead endpoint → `useHasWorkingModel=false`) to live-test the gate's *blocking* purpose. Clean sidecar verified zero models: `providers_with_key=[]`, `ollamaInstalled:false, totalLocalModels:0`.

## Verification gates (re-run fresh at HEAD `80e44a16`)
| Gate | Result |
|---|---|
| `tsc -p apps/web/tsconfig.app.json` | **0 errors** |
| `tsc -p packages/server/tsconfig.json` | **0 errors** |
| FE PR5 vitest subset (model-gate, onboarding steps, tier-filter, settings-reskin) | **48/48 (8 files)** |
| server `llm-key-probe.test.ts` (D3 live probe) | **16/16** |
| eslint on PR5-changed TS/TSX | **0 errors** (22 benign "file ignored by pattern" warnings) |

## A. Settings → Models reskin (real vault) — PASS
Route `/settings` (`SettingsRoute` → `SettingsApp`). Screenshots `01`, `02`.
- **Models is the default/lead tab.** Rail = General · Models · **Plan** (Billing→Plan, **D8**) · Permissions · Team · Backup · **Enterprise** (kept separate, **D8**) · Advanced.
- **"≥1 working model" banner** present & green: *"You have a working model — you're ready to go."*
- **Shared `ModelGate` is the Models lead**: API-key tab (12 provider chips, all "key configured") + Local-model tab (*"Ollama detected — 7 models installed"* + pull-a-model input, **D12** synchronous pull) + BYO copy *"…stored encrypted in your Vault and never leaves your machine"* (**D1**).
- **Top-right `Show: Essential / Standard / Everything`** segmented control (**D6**).
- **D7 verified live:** at **Standard**, the **Advanced** *and* Enterprise tabs disappear from the rail (collapses to General·Models·Plan·Permissions·Team·Backup); at **Everything** they return. The same dial also gates the dock's "PINNED · POWER TOOLS" — confirming **D6**'s single global disclosure axis (not a second persistence key), as designed.
- **Model Pilot failover chain preserved** (Primary→Fallback→Budget Saver + $/$$/$$$ + daily-budget) — not rebuilt.
- **0 console errors.**

## B. Onboarding 6-step, completes with a model (real vault) — PASS
`/?forceWizard=true`. Screenshots `03`, `04`, `05`.
- **Re-key 5→6 nav is sound** (the plan's highest regression risk). Top progress bar spans 6 steps (`valuemax=5`, 0-indexed). Walked: **1 Welcome → 2 About-you → 3 Model gate → 4 Import → 5 Template → 6 First-task**, Back/Continue and progress dots tracked correctly.
- **Step 3 mounts the same shared `ModelGate`** (API-key/Local tabs, provider chips, banner) **+ both D2 controls** ("I'll do this later" + "Continue"). With keys present the gate is open (Continue enabled).
- **Step 5 Template = curated 6** (**D5**): Research Hub · Engineering · Sales Pipeline · Marketing & Content · Product Management · Blank Workspace.
- Selecting **Research Hub** fired the real `POST /api/workspaces` → **201 Created**, mapped the **Researcher** persona (TEMPLATE_PERSONA), and advanced to First-task with the task box **pre-seeded from the template hint** ("Help me design a literature review on my topic").
- **"Let's go!" landed inside the new workspace** at `/workspaces/research-hub/chat` — Researcher persona, workspace-scoped memory/skills, first task seeded into the composer (not auto-sent — correct, no surprise LLM call).
- **Inner step counter** reads "Step N of 4" on the 4 middle config steps (Welcome=intro, First-task=finale have no counter). Verified intentional framing, *not* an off-by-one — but flagged for designer confirmation vs the 6-dot progress bar.

### Note — one non-PR5 console 409 (documented, not a blocker)
On completing onboarding, `POST /api/tier/start-trial` returned **409** → console error. Response body: `{"error":"TRIAL_ALREADY_STARTED", "trialStartedAt":"2026-06-11", "trialDaysRemaining":9}`. This install already started its trial, so the duplicate is correctly rejected. **Not a PR5 regression** (trial-start is pre-existing onboarding-complete logic untouched by PR5; returns 200 on a genuinely fresh install). Workspace creation (201) and `onboarding/complete` (200) both succeeded. *Pre-existing nit (out of PR5 scope):* the FE logs this expected idempotency-409 as `console.error` instead of treating `TRIAL_ALREADY_STARTED` as a no-op.

## C. Clean-vault gate BLOCK + invalid-key honesty — PASS
Clean-vault sidecar (zero working models). Screenshots `06`, `07`, `08`.
- **Hard gate blocks (D2):** at step 3 with no model, banner flips to *"No working model yet — add a provider key or a local model below."* and **Continue is `disabled`** (tooltip "Add a working model to continue"). Provider chips show no "key configured" state.
- **Invalid-key honesty (validates `80e44a16`):** selected Anthropic, pasted a syntactically-valid but bogus `sk-ant-…` key, clicked **Validate & save** → server-side live probe (`POST /api/settings/test-key` → `api.anthropic.com` 1-token ping) → alert **"Key was rejected by the provider."** Banner stays negative, **Continue stays disabled** — no fabricated "verified", bad key does not unblock the gate. (The 401 is server-side; never reaches the browser → no console error.)
- **"I'll do this later" escape (D2):** dismissed onboarding → `/home` with the persistent safety-net banner **"No model yet. Add a provider key or a local model so your agent can actually run."** + **"Set up a model"** CTA (the C1 Home safety net). Home greeted "Welcome, Tester" (name persisted from the clean-vault identity write).
- **0 console errors** across all three states.
- *Minor cosmetic (pre-existing, not PR5):* the header model pill still renders the config `DEFAULT_MODEL` string `claude-sonnet-4-6` even with no key; the "No model yet" banner is the authoritative signal.

## Screenshots
`01` settings-models-reskin · `02` settings-localmodel + Standard gating · `03` onboarding model-gate (open) · `04` onboarding first-task (seeded) · `05` landed in Research Hub workspace · `06` gate blocked (no model, Continue disabled) · `07` invalid key rejected · `08` Home "No model yet" banner.

## Decisions confirmed live
D1 BYO-key · D2 hard gate + "later"→Home+banner · D3 live key-validate (honest reject) · D4 6-step shape · D5 curated-6 templates + persona map · D6 single Show dial · D7 Advanced→Everything-only · D8 Billing→Plan + Enterprise separate · D9/D10/D11/D12 as planned.

## Open / follow-ups (none block merge)
1. FE swallow the expected `TRIAL_ALREADY_STARTED` 409 (pre-existing, out of PR5 scope).
2. Designer confirm "Step N of 4" inner counter vs the 6-step progress bar (intentional framing).
3. Header model pill shows config default even with no key (pre-existing cosmetic).

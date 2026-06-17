# Warm-Hive PR5 — Settings (models-first + failover) · Onboarding (6-step + model gate) — Build Plan

> Source design: `docs/design_handoff_waggle_app/SCREENS.md §11` (Settings) + `§10` (Onboarding). Roadmap: `BUILD-PLAN.md §6` (PR5 = screens 11·10). Branch: `feature/warm-hive-pr5` (off main @ 8b4ba60a). Status: **plan — §3 decisions need founder ratification before feature code.**
> Recon: 5-reader workflow `wf_11242c36-d4a` (5/5 areas), grounded vs live code.
> **Status update (founder-ratified): D1 = BYO-key; D2–D12 proceed as recommended. Building.**

## 1. The design contract
- **§11 Settings:** calm, progressive-disclosure; **Models leads.** Left rail General·Models·Permissions·Plan·Team·Backup·Advanced + a top-right **Show: Essential/Standard/Everything** (Advanced only at Everything). **Models:** a "≥1 working model" banner + the **Model-pilot failover chain** Primary→(if it errors)→Fallback→(daily budget)→Budget + a daily-budget input (switch at 80%) + read-only provider-key list (manage in Vault) + a local-models list. Maps to `defaultModel/fallbackModel/budgetModel + budgetThreshold/dailyBudget`.
- **§10 Onboarding:** ≤2-min first-run ending **inside the work.** 6 full-screen steps: 1 Welcome · 2 About-you (name+role+team-size) · 3 **MODEL GATE** (API-key tab: provider chips + live-validated key→vault · OR local-model tab: detect Qwen / pull Llama — **hard gate: can't proceed without ≥1 working model**) · 4 Import · 5 Template · 6 First-task → opens into the workspace. The gate's **permanent home is Settings→Models** — same mechanism, shared.

## 2. Current state — **the engine + Settings are ~90% built; PR5 is reskin + reconcile + the onboarding gate**
| Layer | Reality today | Anchors |
|---|---|---|
| **Failover engine** | **Fully live at runtime** — budget-threshold switch + smart cost routing + error-triggered fallback + budget-model context-compression, all per-request. NOT a UI concept. | `chat.ts:520-545,1112-1117,1374-1389`; `smart-router.ts:12-25` |
| **Config + persistence** | All 5 fields (+`budgetHardCap`) have getters/setters + full GET/PUT `/api/settings`. | `core/config.ts:87-165`; `routes/settings.ts:66-129` |
| **Settings shell** | 8-tab rail (General·Models·Billing·Permissions·Team·Backup·Enterprise·Advanced) + `ModelPilotCard` (3-lane Primary/Fallback/Budget + threshold slider) leads Models + read-only provider-key list. All 6 §11 "other tabs" built. | `SettingsApp.tsx:35-46,362-477,481-1037`; `ModelPilotCard.tsx` |
| **Progressive disclosure** | EXISTS as the dock tier (Essential/Standard/Everything via `getSettingsTabsForTier`) — surfaced as a **"Dock Experience" `<select>` in the General body**, not a top-right rail control. Advanced shows at **Standard** (design wants Everything-only). | `lib/settings-tier-filter.ts:19-84`; `SettingsApp.tsx:244-260` |
| **Provider catalog + key + local** | `GET /api/providers` (13 providers, `hasKey`, model catalogs, **live Ollama discovery**); `POST /api/settings/test-key` (**format-only**); a real **live Anthropic 1-token probe** exists but is private to `/health`; `/api/local-inference/{hardware,models,status,pull}`; vault key CRUD. | `routes/providers.ts:240-294`; `settings.ts:200-213`; `index.ts:2280-2331`; `local-inference.ts` |
| **Onboarding** | **5-step** chain (first-launch·who-are-you·memory-import·workspace-create·ready), **NO model gate, NO template step**, first-task hardcoded. Nav is index-derived off `STEP_NAMES` (safe to re-key). Step-2 (name+role+team-size) + Import already built/rich. 15 templates exist in `constants.ts` but unwired. | `OnboardingWizard.tsx:35`; `onboarding/{WhoAreYouStep,ImportStep,constants}.tsx` |

**Net:** PR5 = (a) **one shared `ModelGate`** component (API-key validate→vault + local detect/pull + a `hasWorkingModel` signal), (b) **Settings reskin/reconcile** (warm tokens, Models-leads, "≥1 working model" banner, local-models list, label/disclosure tidy), (c) **Onboarding re-key 5→6 + the hard model gate + template + first-task steps + warm restyle**. The only backend bit is *optionally* generalizing the live key-probe (D3).

## 3. Decisions — **NEED FOUNDER RATIFICATION before feature code** (recommend-and-proceed unless you object, except D1)
| # | Decision | Recommended | Why |
|---|---|---|---|
| **D1** | **BYO-key vs Waggle-metered** (DESIGN_POV §4 — the strategic gate; reshapes the gate copy + Billing/Usage PR7) | **Ship BYO-key** (paste a provider key→vault, or a local model) | 100% of the backend (vault, anthropic-proxy, local-inference) is BYO-shaped; metered = new billing/usage-cap plumbing. Matches the local-first promise + §10 copy. Metered = a later additive tab. **Founder strategic call.** |
| **D2** | Hard-gate strictness + escape | **Hard** (Continue disabled until ≥1 working model) + **one** "I'll do this later" → dismiss onboarding to Home with a persistent "no model yet" banner | A zero-model first-task instantly errors (the cold-start churn DESIGN_POV §2 warns of); a zero-escape gate traps lookers. The dismiss-to-Home compromise keeps the gate's intent without a dead-end. |
| **D3** | "✓ valid" validation depth | **Generalize the proven Anthropic 1-token live probe** to all providers behind `POST /api/settings/test-key` (live mode, 5s timeout + short-TTL hash cache); format-only fallback for providers w/o a cheap probe | Format-only would let a bad key pass the hard gate — defeating the "✓ valid" promise + the no-fabrication contract. The live pattern already exists (powers `/health`). **The one real backend addition in PR5.** |
| **D4** | Onboarding step shape | **6 steps: Welcome · About-you · Model-gate · Import · Template · First-task**; fold workspace-creation into the Template step (template choice → `createWorkspace` w/ mapped persona → first-task opens it) | Matches §10 1:1 (no standalone workspace step); index-derived nav makes re-keying safe; reuses `handleCreateWorkspace`. |
| **D5** | Templates on step 5 | The design's **curated 6** (Research/Strategy/Engineering/Sales/Writing/Custom) mapped to existing template ids + `TEMPLATE_PERSONA`; the other specialists via the workspace gallery later | §10 names 6 for the ≤2-min flow; 15 fights "calm/fast". Data + persona map already exist (curation, not new data). |
| **D6** | Settings disclosure control | **Reuse** the existing `useOnboarding().tier` state; relocate/re-skin it as a top-right **Show:** segmented control. No second persistence key. | A second disclosure axis doubles state + contradicts the single global "how much to show" dial (already gates the dock). Shrinks the work to relocate+reskin. |
| **D7** | Advanced visibility | Move `advanced` from STANDARD → **Power/Everything-only** in `settings-tier-filter.ts` | Matches the design's "depth when you ask for it"; keeps Standard calm. One-line behavior change to a shipped filter contract. |
| **D8** | Rail labels | Rename **Billing → "Plan"**; **keep Enterprise** a separate tab (don't merge into Plan) | Rename = zero-risk, design-aligned. Merging Enterprise (KVARK config + audit gate) into a sales CTA risks regressions — defer. |
| **D9** | Backup duplication | Settings Backup tab **reuses the richer standalone `BackupApp`** (embed or deep-link, PR4 Hub pattern) | `BackupApp.tsx` is strictly more capable (history/retry/metadata); two backup UIs = drift (CLAUDE.md §4). |
| **D10** | Language selector (§11 General) | **DEFER** (note as out-of-scope) | No i18n/locale layer exists (0 grep hits); a real selector = a translation subsystem, unjustified now. Add the "local-first on-always" copy (trivial). |
| **D11** | Warm-token sweep | **In scope** — kill hardcoded `hsl()` theme swatches + desaturate emerald/violet/amber/honey status colors to warm semantics | PR5 edits these files heavily; one pass keeps the "single honey accent" honest. (Teams-violet needs a remap call.) |
| **D12** | Local-model pull UX | **Synchronous spinner** + success/fail toast (reuse `POST /api/local-inference/pull`); defer streamed progress | Streaming pull = net-new SSE backend off the critical path; most first-run users pick a cloud key. |

## 4. Architecture
- **Shared `ModelGate` (the spine):** new `apps/web/src/components/os/model-gate/ModelGate.tsx` + `useHasWorkingModel()` — two tabs (API-key: provider chips + writable validated field → vault via `PUT /api/settings`; local-model: `getLocalInferenceStatus` detect + `pullLocalModel`), and `hasWorkingModel = activeProviders.length>0 || localStatus.totalLocalModels>0` (key "present"→"valid" once the live test passes). Mounted in **both** Onboarding step 3 AND as the Settings→Models lead (reskinning the existing `ModelPilotCard` + key-list into it). **Do NOT recreate** config getters, `chat.ts` failover, the providers route, or `ModelPilotCard`'s persistence contract.
- **Backend (D3 only):** extend `POST /api/settings/test-key` with a live mode generalizing `validateAnthropicKey()` (1-token ping, !401/!403 = valid, 5s timeout, hash-keyed short TTL); `tsc -p packages/server`.

## 5. Phased plan (TDD; commit per phase; FE `tsc -p apps/web/tsconfig.app.json` + vitest each)
- **Phase A — shared `ModelGate` + `useHasWorkingModel` + (D3) live key-validate.** The spine; unit-tested in isolation (mock providers/local/validate).
- **Phase B — Settings reskin + reconcile.** Mount `ModelGate` as Models lead; "≥1 working model" banner; dedicated local-models list; warm-token sweep; Models-leads default tab; Billing→Plan (D8); Advanced→Everything-only (D7); top-right Show: control (D6); Backup reuses `BackupApp` (D9); General local-first copy (D10). Extend SettingsApp tests.
- **Phase C — Onboarding 6-step + hard gate.** Re-key `STEP_NAMES` → 6 (D4); mount `ModelGate` as step 3 with the hard gate + "later"→Home+banner (D2); Template step (curated 6, wire persona + `createWorkspace` + `templateId`) (D5); First-task step (ask + suggested chips from `TEMPLATES[].hint` → seed first message → open workspace); warm full-screen restyle. Extend onboarding tests.
- **Phase D — adversarial review + live smoke.** Review (correctness/security/honest-stats/design-fidelity); live smoke (onboarding blocks without a model + completes into the workspace with one; Settings Models reskin + banner; 0 console errors).

## 6. Key risks
- **Don't recreate the failover engine / config / providers route / `ModelPilotCard` persistence** — reuse (CLAUDE.md §3.3/§8). The biggest risk is mistaking the ~90%-built Settings for net-new and rebuilding it.
- **No-fabrication on "✓ valid"** — never show a confident valid on an unchecked/format-only key (carry the PR3/PR3.5 honesty contract).
- **Onboarding re-key** is safe (index-derived nav) but shifts progress-dots/Back/Continue ranges + the `?forceWizard` latch + step-clamp — verify resume.
- **Server route via tsx** (test-key live mode) not typechecked by `npm run build` → explicit `tsc -p packages/server`.
- **D1 (BYO vs metered)** silently shapes the gate copy — ratify before the gate ships.

## 7. Verification gates (per phase + final)
`tsc -p apps/web/tsconfig.app.json` 0 · `tsc -p packages/server` 0 (D3 route) · FE vitest green · `npm run lint` (no new errors) · live smoke: onboarding hard-gate blocks w/o a model + lands in the workspace with one; Settings Models reskin + working-model banner; 0 console errors.

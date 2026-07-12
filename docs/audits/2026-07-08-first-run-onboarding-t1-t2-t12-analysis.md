# First-Run Onboarding T1/T2/T12 Analysis - 2026-07-08

Status: analysis-only supplement. No product code was changed.

Purpose: close the audit blind spot left by the standard `?skipOnboarding=true` harness. This run exercised a clean local data dir without skip flags, then followed the first-run path through onboarding, template creation, first-task auto-send, and post-onboarding chat.

## Evidence

Source inspected:

- `apps/web/src/hooks/useOnboarding.ts`
- `apps/web/src/components/os/AppShell.tsx`
- `apps/web/src/components/os/overlays/OnboardingWizard.tsx`
- `apps/web/src/components/os/overlays/onboarding/{WelcomeStep,WhoAreYouStep,ModelGateStep,ImportStep,TemplateStep,FirstTaskStep}.tsx`
- `apps/web/src/components/os/overlays/onboarding/constants.ts`
- `packages/server/src/local/routes/onboarding.ts`
- Existing tests under `apps/web/src/test/*onboarding*` and `tests/e2e/*onboarding*`

Commands:

```powershell
npm run build
```

Fresh runtime:

```powershell
$env:WAGGLE_PORT='3431'
$env:WAGGLE_TRUST_LOCALHOST='1'
$env:WAGGLE_DISABLE_MARKETPLACE_SYNC='1'
$env:EMBEDDING_PROVIDER='mock'
$env:VITE_CLERK_PUBLISHABLE_KEY=''
$env:CLERK_SECRET_KEY=''
$env:WAGGLE_DATA_DIR = "$env:TEMP\waggle-first-run-smoke-3431-20260708050443"
npx tsx packages/server/src/local/start.ts --skip-litellm
```

Artifacts:

- Trace: `output/playwright/first-run-onboarding-3431/first-run-onboarding-summary.json`
- Reopen trace: `output/playwright/first-run-onboarding-3431/after-reopen-wait.json`
- Screenshots:
  - `output/playwright/first-run-onboarding-3431/desktop-00-welcome.png`
  - `output/playwright/first-run-onboarding-3431/desktop-01-profile-empty.png`
  - `output/playwright/first-run-onboarding-3431/desktop-02-profile-filled.png`
  - `output/playwright/first-run-onboarding-3431/desktop-03-model-gate.png`
  - `output/playwright/first-run-onboarding-3431/desktop-04-import.png`
  - `output/playwright/first-run-onboarding-3431/desktop-05-template.png`
  - `output/playwright/first-run-onboarding-3431/desktop-06-first-task.png`
  - `output/playwright/first-run-onboarding-3431/desktop-07-after-lets-go.png`
  - `output/playwright/first-run-onboarding-3431/desktop-08-after-reopen-wait.png`
  - `output/playwright/first-run-onboarding-3431/mobile-00-welcome.png`
  - `output/playwright/first-run-onboarding-3431/mobile-01-profile-empty.png`

Runtime outcome:

- `npm run build` passed with the known Tailwind ambiguous-class warnings, dynamic import warning, and large main chunk warning.
- Fresh server started on `http://127.0.0.1:3431` with a temporary data dir and mock embeddings.
- Desktop first-run path rendered the onboarding takeover instead of shell chrome.
- Desktop completed: Welcome -> Profile -> Model Gate -> Import skip -> Template -> First Task -> workspace chat.
- A second fresh mobile browser context opened before completion and rendered Welcome plus Profile at 390 x 844.
- Post-completion reopen reached `/workspaces/research-hub/chat` with an empty composer after generation completed.

## Findings

### FRO-1: First-run accountless console health (verified fixed for sampled paths)

The first-run smoke captured 15 console/page errors. They are the same T1 class already found on skipped route smokes:

- inline script blocked by `script-src 'self'`
- Clerk script blocked by local CSP
- Clerk failed to load / timeout

Current verification update:

- `clean first-run onboarding loads without Clerk, CSP, or page errors` passed on port `34196`.
- `no console errors on initial load` passed on port `34196`.
- `no critical console errors on load` passed on port `34196`.

Impact:

- Solo Founder and Team Admin could not receive a final 9/10 while accountless local-first onboarding emitted auth/security failures. The current focused console-health checks close this sampled cap; explicit Clerk-enabled auth remains a separate state bundle.
- Phase 1 T1 must keep the first-run lane in regression, not only the skip-onboarding route lane.

Correction:

- Keep accountless local mode as the default unless Clerk is explicitly enabled.
- Add first-run console capture to the T1 verification lane.

### FRO-2: Desktop onboarding is functionally complete

The desktop path reached the terminal chat route and auto-sent the seeded first task. The final route was:

```text
http://127.0.0.1:3431/workspaces/research-hub/chat
```

The flow was logical overall:

- Welcome explains the local-first promise.
- Profile captures useful personalization signals.
- Model gate allowed continuation because a local model was available.
- Template recommendation correctly floated Research Hub for a consulting/research profile.
- First task seeded the chat with the chosen template hint.

Impact:

- This is a strong Solo Founder evidence lane now that sampled T1 console health is verified fixed.

Correction:

- Preserve this end-to-end contract while fixing the polish items below.

### FRO-3: Model gate status copy can be stale while Continue is enabled (focused fixed)

The model gate screenshot showed the status strip still saying `Checking your models...` while the Continue button was enabled and clickable.

Current verification update:

- When `useHasWorkingModel()` already reports a working model, onboarding now renders a `Model ready` status instead of the setup/checking gate.
- `ModelGateStep.test.tsx` passed 5/5, including a regression that hides the setup gate and checking copy while Continue is enabled.

Impact:

- This does not block completion, but it weakens trust. A user sees two contradictory states: still checking vs ready to continue.

Correction:

- Once `hasWorkingModel` is true, replace the checking copy with a ready state that names the working provider/model, or hide the checking strip.

### FRO-4: High-volume Claude Code auto-detect makes import too easy for day-zero setup (focused fixed)

The import step detected 5,514 Claude Code items and placed `Import my history` as a primary button directly in onboarding.

Current verification update:

- High-volume detected histories now switch to volume-aware copy, format the count (`5,514 items from Claude Code`), make `Review after setup` the primary action, and demote immediate import to explicit `Import 5,514 now`.
- `apps/web/src/test/onboarding-import-step.test.tsx` passed 2/2, covering the high-volume deliberate-review flow and preserving the simple `Import my history` CTA for small detected histories.
- `npm run typecheck:web` passed after the component change.

Impact:

- Functionally impressive, but risky for first-run UX. A fresh user can trigger a large import before seeing the product, understanding review consequences, or choosing a workspace.
- Researcher trust and Solo Founder setup speed are both affected.

Correction:

- Keep the detection signal, but make high-volume import a deliberate secondary choice.
- Add volume-aware copy such as "Review import options" or "Import later from Memory" for large detected histories.
- Preserve the skip path and route users to Memory Harvest after setup.

### FRO-5: Mobile profile primary action reachability (verified fixed)

At 390 x 844, the Welcome step fits well. After Continue, the Profile step becomes taller than the viewport and the primary Continue button starts below the visible area. The document itself has no horizontal overflow, but the critical bottom action is not visible without scrolling inside the onboarding content area.

Evidence:

- `mobile-01-profile-empty.png`
- Trace out-of-bounds entry: `Continue` button bottom at `880` in an `844` px viewport.
- Current verification update: `J-mobile: first-run onboarding keeps primary actions reachable at 390px width` passed 1/1 on port `34194`. The focused test clears storage, opens `/?forceWizard=true`, advances from Welcome to Profile, asserts the Profile Continue button bottom is within the 844 px viewport, checks visible horizontal overflow, and fails on Clerk/CSP/page errors.

Impact:

- The original finding capped Mobile Executive and Solo Founder mobile first-run paths below 9/10. The current focused route evidence closes that specific cap; other first-run trust items remain separate caps.
- This reinforces the mobile supplement lesson: document-level scroll width is insufficient; judge evidence must include visible control bounds and vertical reachability.

Correction:

- On mobile, make the onboarding action row sticky within the wizard, reduce vertical density, or split Profile into a lighter first pass plus optional details.
- Ensure the step title, progress, and primary action are visible or clearly reachable at 390 x 844.

### FRO-6: First-task auto-send briefly leaves the same text in the composer (focused fixed)

Immediately after `Let's go`, the chat showed the user bubble and active generation while the composer still contained the first-task text. A reopen after 12 seconds showed the composer empty, so this appears transient.

Current verification update:

- `ChatApp` now clears the untouched auto-send seed immediately when the first-task send is consumed, before the send promise resolves, and restores it only if send returns `false`.
- `lane-c-input-power.test.tsx` passed 12/12, including the regression that the auto-sent first task clears before the pending send resolves.

Impact:

- Not a persistence/data bug, but the handoff can look like a duplicate-send risk during the most important first success moment.

Correction:

- Clear or disable the composer immediately when auto-send starts, and show the sent state distinctly.

## Ticket Updates

| Finding | Ticket | Phase | Required closure |
|---|---|---:|---|
| FRO-1 first-run Clerk/CSP errors | T1 | 1 | Verified fixed for sampled accountless paths: first-run, initial load, and full-product critical console checks passed 3/3 on port `34196`. |
| FRO-5 mobile onboarding Continue below viewport | T2/T12 | 1 | Verified fixed in current build: 390 x 844 first-run Profile keeps Continue reachable with visible-bounds evidence in `tests/e2e/user-journeys.spec.ts` on port `34194`. |
| FRO-3 stale model gate checking copy | T10/T12 | 2 | Focused fixed: ready model state hides the setup/checking gate and shows `Model ready`. |
| FRO-4 high-volume import CTA risk | T7/T12 | 2 | Focused fixed: large detected histories now require deliberate review/secondary-action copy, with regression coverage in `onboarding-import-step.test.tsx`. |
| FRO-6 transient first-task composer duplicate | T12 | 2 | Focused fixed: auto-send clears the untouched first-task composer seed before the send promise resolves, with failure restore. |

## Judge Implications

- Solo Founder: first-run onboarding is now a required screenshot/evidence lane, not optional. Sampled T1 console health, mobile FRO-5, high-volume import CTA risk, model-ready copy, and first-task composer handoff are currently focused fixed.
- Researcher: FRO-4 is now focused fixed for the first-run CTA risk; deeper Harvest review/recovery states still belong in the broader T12/T19 evidence packet.
- Engineer: FRO-1 console health and first-task route evidence remain relevant.
- Team Admin: sampled FRO-1 auth/security noise and FRO-4 first-run import consequence copy are currently fixed; deeper data-review governance still belongs in broader state evidence.
- Mobile Executive: the original FRO-5 blocker is currently closed by the focused 390 x 844 journey; keep it in regression because it is a direct visual/responsive path.

## Approval Impact

Phase 1 remains the right first implementation phase, but its T1/T2 verification must include this supplement:

- T1: keep accountless first-run onboarding console health in regression and add explicit Clerk-enabled state evidence later.
- T2: mobile onboarding Profile primary-action reachability, in addition to mobile Settings.

No product-code changes are approved by this document.

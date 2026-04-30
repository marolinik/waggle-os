# Onboarding — Day-2 Backlog

**Authored:** 2026-04-30 (post-investigation `b34897c` + Option A2 implementation)
**Owner:** Engineering + Product
**Priority:** Day-2 (post-launch). Day-0 unblock = `?forceWizard=true` URL param shipped.

---

## Why this exists

The onboarding investigation (`docs/ONBOARDING-INVESTIGATION-2026-04-30.md`) surfaced three distinct issues that are best handled separately from the immediate launch:

1. **The auto-complete heuristic is too coarse.** `useOnboarding.ts:91-120` flips the wizard to "completed" whenever `/api/workspaces.length > 0`. But the backend ALWAYS creates `default-workspace` at boot via `wsManager.ensureDefault()`, so the heuristic fires even for genuinely-fresh installs.

2. **Production users have no "redo onboarding" affordance.** Once the wizard is completed (or auto-completed), there is no in-product way to re-trigger it short of editing `~/.waggle/` on disk — friction for support, demos, persona-evaluation marathons, and product education.

3. **The wizard's actual production behavior is undocumented.** Support team / new hires / partners need to know: "the wizard appears at most once per machine, even after browser cache clear, even after Tauri webview reset". That assumption isn't written down anywhere user-facing.

---

## A3 — Smarter auto-complete heuristic

**Current code (`apps/web/src/hooks/useOnboarding.ts:91-120`):**

```ts
const workspaces = await adapter.getWorkspaces();
if (Array.isArray(workspaces) && workspaces.length > 0) {
  // auto-complete the wizard
}
```

**Problem:** `workspaces.length > 0` is true even when the only workspace is the boot-time stub from `wsManager.ensureDefault()`. So:
- Genuine first-launch → wizard would render… but `ensureDefault()` runs BEFORE the hook's first render, so wizard is auto-completed before the user ever sees it.
- Tauri webview switch on real user → correct (workspaces exist with content).
- localStorage clear on real user → correct (workspaces exist with content).
- localStorage clear after manual workspace deletion → wizard auto-completes again because `ensureDefault()` recreates the stub.

**Net effect:** the wizard only shows up if `~/.waggle/` doesn't exist at all when the backend boots. After that, it's invisible until a developer manually deletes the `default-workspace` directory (and even then, see Option A2 — backend recreates it). For 99%+ of installs, the wizard fires exactly **once** in the user's lifetime.

That might be desirable. But if not, the heuristic should be **content-aware**:

**Proposed:**

```ts
const [workspaces, health] = await Promise.all([
  adapter.getWorkspaces(),
  adapter.getSystemHealth().catch(() => null),
]);
if (cancelled) return;

// Treat "zero memory across all workspaces" as fresh-state regardless of stubs.
// The default-workspace shell from wsManager.ensureDefault has frameCount=0
// until the user actually does something. Distinguish that from a real
// returning user who has built up memory.
const frameCount = health?.memoryStats?.frameCount ?? 0;
const isReturningUser = Array.isArray(workspaces)
  && workspaces.length > 0
  && frameCount > 0;

if (isReturningUser) {
  // auto-complete (existing logic)
}
```

**Side effects:**
- Genuine first-launch → wizard renders (frameCount=0).
- Tauri webview switch on real user → still auto-completes (frames > 0).
- localStorage clear on real user → still auto-completes (frames > 0).
- After "reset onboarding" (proposed below) clears memory → wizard renders again.

**Cost:** ~10 LOC, single file. One extra `/health` call per hook mount (cheap, idempotent).

**Risk:** if a returning user has somehow lost all memory (recovery-from-corruption, mind file deleted manually), they'd see the wizard again — but that's actually the right UX in that scenario.

**Test plan:**
- Add `apps/web/src/hooks/useOnboarding.test.ts` with mocked adapter:
  - workspaces=[], frames=0 → wizard renders
  - workspaces=[{id:'default-workspace'}], frames=0 → wizard renders (the new behavior)
  - workspaces=[{id:'default-workspace'}], frames=5 → auto-completes
  - workspaces=[], frames=0, sidecar throws → wizard renders (unchanged fallback)

**Status:** **deferred to Day-2.** The Option A2 URL bypass is sufficient for PM walkthrough. Production behavior with the current heuristic is "wizard fires once per fresh install" which is *plausibly* the right default. Worth a product call before changing.

---

## Reset Onboarding affordance

**Where it lives:** Settings → Advanced → "Reset onboarding wizard" (button).

**What it does:**

```ts
async function resetOnboarding() {
  // 1. Confirm via dialog (destructive action — clears workspace + memory).
  if (!await confirmDestructive('Reset onboarding will clear all workspaces and memory. Continue?')) return;

  // 2. Backend: drop default-workspace + clear personal mind.
  //    New endpoint POST /api/admin/reset-onboarding does the disk wipe
  //    server-side (rm -rf workspaces/default-workspace, drop personal.mind,
  //    drop sessions/*, drop awareness/preferences). Atomic. Logs to audit.
  await adapter.resetOnboarding();

  // 3. Clear localStorage onboarding state.
  localStorage.removeItem('waggle:onboarding');
  localStorage.removeItem('waggle:tooltips_done');

  // 4. Reload to ?forceWizard=true so the wizard renders even before the
  //    backend has a chance to re-ensureDefault.
  window.location.assign(window.location.pathname + '?forceWizard=true');
}
```

**Use cases:**
- Demo prep: reset to clean state before showing the product.
- Support escalation: "let's start over" when the user's workspace is in a weird state.
- Persona-evaluation marathon: between persona swaps, reset to baseline.
- New-hire training: walk through the wizard as designed.

**Threat model:** destructive button. Must be:
- Behind Settings → Advanced (not surfaced casually).
- Confirmation dialog with strong copy ("This will erase your memory. Continue?").
- Requires the user to type "RESET" or click two distinct buttons (defense against fat-finger).
- Audit-logged via `auditStore` so it's traceable.

**Cost:** ~80 LOC across:
- `apps/web/src/components/os/apps/SettingsApp.tsx` — Advanced tab + button + dialog
- `apps/web/src/lib/adapter.ts` — `resetOnboarding()` method
- `packages/server/src/local/routes/admin.ts` — new `POST /api/admin/reset-onboarding` endpoint (or existing admin route)
- One vitest spec exercising the disk-side wipe

**Status:** **Day-2.** Not needed for launch. PM can use the URL bypass for walkthrough.

---

## Document the production behavior

**Audience:** Support team, customer success, product education content authors.

**Content (rough draft):**

> ### Onboarding wizard frequency
>
> The Waggle OS onboarding wizard appears **at most once per install**. After
> the user dismisses it (either via "Let's go!" on the Ready step or via
> the Skip option), the wizard does not re-trigger automatically.
>
> The wizard does NOT re-appear on:
> - Browser cache / localStorage clear (the backend has workspace data).
> - Tauri webview profile reset (same — the backend has workspace data).
> - Computer reboot (data persists in `~/.waggle/`).
> - App upgrade (data persists across versions).
>
> The wizard DOES re-appear on:
> - Fresh install on a new machine (no `~/.waggle/` directory exists).
> - User explicit "Reset onboarding" via Settings → Advanced (Day-2 feature, see backlog).
> - Developer URL bypass `?forceWizard=true` (DEV mode only).
>
> ### Why
>
> A returning user who clears their browser cookies or switches Tauri
> profiles still has all their memory and workspaces on the sidecar
> (`~/.waggle/`). Forcing them through the wizard again would be jarring
> ("why does Waggle want me to re-pick a template I already have?").
> The wizard's job is to teach + configure on the very first encounter;
> after that, the same surfaces are reachable through the normal UI
> (Settings, dock, persona switcher, harvest tab, etc.).

**Where it goes:**
- `docs/user-guide/onboarding.md` (or whatever the user-facing docs entry point is)
- Internal Notion page for support team

**Cost:** ~30 min of writing.

**Status:** **Day-2.** Not blocking launch. Should land before any large support cohort hits production (week 2-3 post-launch).

---

## Summary

| Item | Cost | Day-X | Notes |
|---|---|---|---|
| **A2 URL bypass** (this commit) | ~12 LOC + tests | Day-0 ✅ | Shipped. PM uses `?forceWizard=true` for walkthrough. |
| **A3 smarter heuristic** | ~10 LOC + 4 tests | Day-2 | Awaiting product decision: keep "once per machine" or move to "once until memory exists". |
| **Reset Onboarding button** | ~80 LOC + admin route + 1 test | Day-2 | Demo / support / training affordance. |
| **Document production behavior** | ~30 min writing | Day-2 | User-facing docs + support runbook. |

**No work scheduled today** beyond the A2 ship + this backlog doc. Marko reviews Day-2 ordering when launch dust settles.

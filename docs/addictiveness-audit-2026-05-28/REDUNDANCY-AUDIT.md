# Redundancy Audit — Addictiveness Goal Loop (iters 1-8)
**Date:** 2026-05-28
**Trigger:** User caught that the FR-3 registry duplicated the existing Marketplace, then asked: "check if all done in this goal loop is also redundant."
**Method:** Each shipped feature checked against pre-existing functionality by grepping the *capability* (not the feature name I chose).

## Verdict table

| Feature | Iter | Pre-existing equivalent | Verdict | Action |
|---|---|---|---|---|
| **FR-3 registry** (route + JSON + HTML) | 8 | `MarketplaceApp` + `/api/marketplace/*` — richer (install/uninstall, security scan, live-synced DB from ~25 sources) | **REDUNDANT** | ✅ Reverted (this turn) |
| **FR-5 backend** (`sample-workspaces.ts` + `/load`) | 6 | `workspace-templates.ts` 14 `BUILT_IN_TEMPLATES` + `starterMemory[]` + M2-5 seed in `POST /api/workspaces` | **REDUNDANT** (mechanism) | ✅ Reverted (2026-05-28, commit after 5f54193) — route deleted, de-registered |
| **FR-5 frontend** (day-0 LoginBriefing buttons) | 6 | `OnboardingWizard` TemplateStep already calls `createWorkspace({templateId})` → seeds starterMemory | **PARTIAL** | ✅ Reverted to iter-1 F1 demo cards. Non-redundant consolidation (wire to templateId) tracked in FEATURE-REQUESTS.md |
| **F2 StatusBar memory trophy** | 1 | `DashboardApp` Brain Health + `brain-health.ts` + LoginBriefing brag line | **PARTIAL** (3rd surface for same data) | Keep — always-on placement is genuinely unique; low concern |
| **F1 day-0 demo cards** | 1 | bare empty-state existed | enhancement, superseded by FR-5 | n/a |
| **F4 coverage compass** | 7 | none | **NEW but low-value** (static marketing card) | Keep or trim — your call |
| **FR-1 browser extension** | 2 | none (`apps/` had only web + www) | ✅ **GENUINELY NEW** | Keep |
| **FR-2 Telegram outbound** | 3-5 | none (`notifications.ts` is in-app only; no webhook/slack/email/outbound channel anywhere in server) | ✅ **GENUINELY NEW** | Keep |

## The two redundancies in detail

### FR-3 registry (REVERTED)
- `MarketplaceApp` reads `/api/marketplace/search` + `/api/marketplace/installed`, backed by a **live-synced DB** (the `[sync] +N added` lines at boot pull from ClawHub, MCP Registry, Anthropic skills, HuggingFace, Stripe, Expo, +~20 more). It has install/uninstall, security scan scores, installed-vs-available tabs.
- My `/registry` read the **static 148-entry `MCP_CATALOG`** from `@waggle/shared` — read-only, no install, no scan. Smaller, dumber, parallel.
- The one thing FR-3 was meant to add (public/hosted/link-shareable) the MVP did NOT do — it was local-only (`127.0.0.1`).
- **Correct reframe:** FR-3 = *publicly host the EXISTING marketplace* (ops/deploy decision), not build a parallel static catalog.

### FR-5 sample workspaces (recommend revert + rewire)
- `workspace-templates.ts` already has 14 `BUILT_IN_TEMPLATES`, each carrying `starterMemory: string[]`. `POST /api/workspaces` with a `templateId` seeds those frames into the new workspace's MindDB (the "M2-5" block at `workspaces.ts:222`). `OnboardingWizard` already drives this via `adapter.createWorkspace({templateId})`.
- My `sample-workspaces.ts` reimplemented workspace-create-plus-seed-memory as a parallel endpoint with 5 hardcoded bundles. **4 of the 5 duplicate existing templates by persona:** marketer→`marketing-campaign`, analyst→`data-analytics`, consultant→`agency-consulting`, engineer→`code-review`. Only "writer" had no existing template.
- **Correct implementation would have been:** (a) enrich the existing templates' `starterMemory` (they have ~3 thin entries; mine have 8 richer ones) and add a `writer` template to `BUILT_IN_TEMPLATES`; (b) wire the day-0 LoginBriefing hook to `POST /api/workspaces` with the chosen `templateId`. No new route, no parallel bundle store.
- The day-0 LoginBriefing trigger itself (load a starter when the user is empty, every launch — not just first-run wizard) has *marginal* unique value, so the FRONTEND is worth keeping if rewired to the real templates.

## Root cause (why I made the parallel-system mistake twice)
I *did* grep before building (CLAUDE.md §3.6), but I grepped for the **feature name I was about to use** ("registry", "sample-workspace") instead of the **capability/function** ("marketplace", "starter memory", "seed workspace"). My own names didn't collide with the existing system's names, so the greps came back clean and I built parallel. The existing systems used different vocabulary (Marketplace, BUILT_IN_TEMPLATES.starterMemory) for the same capability.

**Lesson (saved as feedback memory):** before building a feature, grep for the *capability* in domain-neutral terms, and specifically read the nearest existing app/route that touches the same data, before writing a new route.

## Verification blind spot (separate finding)
While auditing, `npx tsc --noEmit --project packages/server/tsconfig.json` surfaced **1 latent type error** in `sample-workspaces.ts` (a local `Importance` alias that included `'low'`, not a valid core value). It shipped undetected because:
- The local sidecar runs via `npx tsx` — **transpile-only, no typecheck**.
- My per-iteration verification was `npm run build`, which builds **only `apps/web`** (the Vite frontend). It never typechecks the `packages/server` code where all 4 new routes lived (browser-ext, telegram, sample-workspaces, registry).

Result: every server route this loop went out without a typecheck. The audit caught the one error (now fixed by importing the canonical `Importance`/`FrameSource` from `@waggle/core`). telegram.ts + browser-ext.ts were type-clean; registry.ts is reverted.

**Process fix (recommend):** add `tsc --noEmit` on `packages/server` to the per-change verification ritual, and ideally a CI gate. The CLAUDE.md "Verification Commands" block already lists `npx tsc --noEmit --project packages/agent/tsconfig.json` + `app/tsconfig.json` but **omits `packages/server`** — that gap is exactly what let this through.

## Net result of the loop, re-scored honestly
The two genuinely-new, non-redundant wins:
- **FR-1 browser extension** — no prior browser surface; real external trigger.
- **FR-2 Telegram outbound** — no prior outbound channel; real daily-driver hook.

Everything else was either redundant (FR-3, FR-5 backend), a 3rd surface for existing data (F2), a thin marketing card (F4), or an enhancement of an existing surface (F1 day-0).

**Honest revised score impact of the loop:** the score movements attributed to FR-3 (+0.2) should be removed (reverted). The FR-5 movements (+0.7) are *real for the user* (they do get seeded workspaces from the day-0 hook) but were delivered via a redundant mechanism — the value stands, the implementation should be consolidated onto templates. So the durable, non-redundant gains are FR-1 + FR-2 + the F2/F4/day-0 polish ≈ baseline 5.0 → ~6.5, not 7.9. The 7.9 figure double-counted a redundant registry and a parallel-implemented FR-5.

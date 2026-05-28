# Feature Requests — From 10-Persona Addictiveness Audit
**Date:** 2026-05-28
**Source:** baselines in `BASELINE.md`, benchmark intel in `BENCHMARK-*.md`, persona JTBDs in `PERSONAS.md`.
**Gate:** per saved feedback rule `feedback_workflow_reality_check`, every request below has a CONCRETE USER TRIGGER (specific persona, specific workflow location). Generic segment-expansion arguments do NOT clear the epistemic gate and are not listed here.

Prioritised by: cells_closed_across_rubric ÷ implementation_cost.

---

## TIER 2 — Net-new product surfaces (1-3 sprints each)

### FR-1 · External trigger: Browser companion (extension OR bookmarklet) [HIGHEST]
- **Concrete triggers:** P3 (Sarah, marketing) lives in Notion+browser; P5 (Lucas, journalist) lives in browser tabs + Drive; P7 (Anya, writer) lives in Substack + browser; P1 (Greta) has no app-install muscle so a browser-only entry point is the only viable hook
- **Surface:** "Save this page / selection to Waggle memory" + "Ask Waggle about this page" + a side-panel chat
- **Cells closed:** dim 1 (external trigger) for P1, P3, P5, P7 (+4). dim 3 (first-session hook) for P1, P3 (+2). dim 10 (one tool) for P3, P5, P7 (+3). **~9 cells.**
- **Benchmark gap closed:** OpenClaw's messaging-channel ubiquity (browser tab is the actual "messaging channel" for non-coders); Claude Cowork has nothing here.
- **Effort estimate:** 1.5 sprints — Chrome MV3 extension + Waggle sidecar endpoint for "ingest page" + side-panel chat reusing existing ChatApp components.

### FR-2 · Outbound scheduled digests (Telegram first, then Email, Slack) [HIGH]
- **Concrete triggers:** P10 (Tomás) explicitly named Telegram outbound in his JTBD — that's his Hermes Agent workflow; P8 (Marko) would use email digest as a daily strategic-recap hook; P6 (Daniel) needs Monday-morning variance summary in Teams/Email.
- **Surface:** ScheduledJobsApp grows a "Push to: [Telegram bot / Email / Slack / Webhook]" output channel.
- **Cells closed:** dim 1 for P6, P8, P10 (+3). dim 10 for P10 (+1). **~4 cells**, plus pulls P10 from 5 → 7.
- **Benchmark gap closed:** Hermes' cron-push-to-Telegram is the SINGLE addictive feature that makes Hermes a "daily driver" for the agent-builder segment.
- **Effort estimate:** 1 sprint for Telegram bot integration (single connector) + ScheduledJobs UI for output channel selection.

### FR-3 · Publicly host the EXISTING Marketplace [HIGH] — REFRAMED 2026-05-28
> ⚠️ **Reframed after redundancy audit.** The original framing ("build a public skill registry reading from MCP_CATALOG") was implemented in iter-8, then **reverted** (commit d47c7f5 reverted) — it duplicated the existing in-app `MarketplaceApp`, and worse, read the inferior *static* 148-entry catalog instead of the live-synced marketplace DB. See `REDUNDANCY-AUDIT.md`.
- **Concrete triggers:** P10 (Tomás) picks Hermes for the OSS skill economy; P9 (Priya) is Claude Code marketplace-savvy; P4/P8 would import frameworks from peers.
- **Correct surface:** Take the EXISTING marketplace (live-synced DB, install/scan-capable, `/api/marketplace/search`) and expose a **public, hosted, link-shareable web view** at e.g. `registry.waggle-os.ai`. The addictive part (dim 5 tribe) is *peers linking to a skill across the internet*, which a local `127.0.0.1` page can never deliver.
- **This is an OPS/DEPLOY decision, not new code:** pick a host (Vercel / Cloudflare Pages / waggle-os.ai subdomain), point a thin read-only frontend at the marketplace search API, add a deep-link/protocol handler (`waggle://`) so a peer's link launches their desktop.
- **Cells closed (when hosted):** dim 5 for P4, P8, P9, P10 (+4); dim 10 for P9, P10 (+2). **~6 cells.**
- **Do NOT:** build another static-catalog page. That's what got reverted.

### FR-4 · "Memory growth trophy" in StatusBar — visible compounding signal [MEDIUM]
- **Concrete triggers:** P1, P2 (novices) need a SEEN reason to come back tomorrow; P3, P5, P7 (mid-tech) need the dopamine of growth; the rubric's dim 8 says investment surfaces must be VISIBLE, not just stored.
- **Surface:** Add `🧠 N frames · +K this week` to StatusBar.tsx, with hover tooltip showing the breakdown.
- **Cells closed:** dim 8 reframing for P1, P2, P3, P5, P10 (+5). **~5 cells.**
- **Effort estimate:** 0.5 sprint — StatusBar.tsx + adapter call + Desktop.tsx prop threading.

### FR-5 · New-user demo workspace import [MEDIUM] — PARTIALLY REDUNDANT (flagged 2026-05-28)
> ⚠️ **Redundancy found.** Shipped in iter-6 as a parallel `sample-workspaces.ts` route, but `workspace-templates.ts` ALREADY seeds `starterMemory[]` on workspace creation (M2-5 in `POST /api/workspaces`), and `OnboardingWizard` already drives it. 4 of my 5 bundles duplicate existing templates by persona. See `REDUNDANCY-AUDIT.md`.
- **Original concrete triggers** (still valid): P1/P2/P3 land empty → no hook.
- **What was genuinely new:** the day-0 *LoginBriefing* trigger (load a starter when empty, on every launch — not just the first-run wizard).
- **Correct consolidation:** (a) enrich existing `BUILT_IN_TEMPLATES.starterMemory` (currently ~3 thin entries each; my bundles had 8 richer frames) and add a `writer` template; (b) rewire the day-0 LoginBriefing hook to `POST /api/workspaces` with the chosen `templateId`; (c) drop `sample-workspaces.ts`.
- **Cells (value is real, mechanism should consolidate):** dim 3 for P1/P2/P3/P5/P7 (+5); dim 7 for P1/P2 (+2).
- **Status (2026-05-28): REVERTED.** `sample-workspaces.ts` deleted + de-registered; LoginBriefing day-0 hook restored to the iter-1 F1 demo cards. The non-redundant rebuild = enrich `BUILT_IN_TEMPLATES.starterMemory` + add a `writer` template + wire the F1 day-0 cards to call `POST /api/workspaces` with the chosen `templateId` (so a click creates a real seeded workspace via the EXISTING mechanism). Open as a future task — no parallel route.

### FR-6 · Native xlsx editor (or deep Excel integration) [MEDIUM]
- **Concrete trigger:** P6 (Daniel) lives in Excel daily. No real "BI / finance ops" persona will pick Waggle without it.
- **Surface:** Embed an OSS spreadsheet (e.g., univer, fortune-sheet) into FilesApp for .xlsx editing in-place; chat can manipulate the sheet via skill-bridge.
- **Cells closed:** dim 10 (one tool) for P6 (+1). dim 4 (friction) for P6 (+0, already passes). **~1 cell** but the persona moves from 6 → 7-8.
- **Effort estimate:** 2-3 sprints — non-trivial integration work.

---

## TIER 3 — Strategic bets (out of this audit's scope, listed for prioritisation)

### FR-7 · Self-hosted enterprise build [STRATEGIC]
- **Concrete trigger:** P5 (Lucas, journalist source protection), P6 (Daniel, finance data sensitivity), P10 (Tomás, sovereign self-host) — three distinct personas with sovereign-AI requirements.
- **Benchmark gap closed:** matches OpenClaw + Hermes (their #1 enterprise pull).
- **Effort:** large; involves licensing, ops, certification.

### FR-8 · "Coverage compass" tile [LOW]
- **Concrete trigger:** P3 (Sarah) needs to JUSTIFY to herself "I'm replacing 3 subscriptions" — that's a retention surface, not a sales pitch.
- **Surface:** Settings or Cockpit tile listing "Waggle replaces: ChatGPT Plus, Notion AI, Gamma…" with checkmarks for what's wired today + downloadable savings receipt.
- **Cells closed:** dim 10 (one-tool framing) for P3, P4, P7 (+3).
- **Effort estimate:** 0.5 sprint — new tile component reading from feature-flags + tier.

### FR-9 · Voice-first daily journaling (P1 Greta hook) [LOW]
- **Concrete trigger:** P1 Greta uses iPad daily, talks more than she types, has voice habit from Siri. VoiceApp exists; daily-journal prompt is the missing flow.
- **Surface:** Morning push (via FR-1 browser ext or FR-2 outbound digest) → "Tap to record your day". Waggle adds to memory.
- **Cells closed:** dim 1 + dim 2 + dim 6 for P1 (+3, lifts P1 from 1 → 4+).
- **Effort estimate:** 1 sprint — depends on FR-1 or FR-2.

### FR-10 · Public referral / "X is also using Waggle" social loop [LOW]
- **Concrete trigger:** P3 (Sarah, marketing — social-graph native), P9 (Priya, dev — peer adoption), P10 (Tomás, agent-builder community) — three personas with social-proof addiction wired in already from competitors.
- **Surface:** Lightweight "share workspace template" + "X teammates also use this skill" surfaces — opt-in.
- **Cells closed:** dim 5 (tribe) for P3, P9, P10 (+3).
- **Effort estimate:** 1.5 sprints — opt-in privacy framing essential.

---

## Anti-patterns rejected (per workflow-reality-check)

These were considered and REJECTED because they don't clear the epistemic gate (no concrete persona-trigger):

- "Add Outlook integration" — no persona named Outlook as their actual work surface. P6 mentioned Teams/Excel, not Outlook specifically. If a real Microsoft-shop customer trigger appears, revisit.
- "iOS native app" — no persona currently needs the iOS surface to clear their JTBD (P1 uses iPad browser — solved by FR-1 browser ext). When a persona's primary workflow is iOS-app-only, promote.
- "Discord bot" — no current persona named Discord as their work channel. Adjacent to FR-2's Telegram but Discord-specific isn't justified.
- "Voice-everywhere" beyond VoiceApp — no persona needs voice as a primary modality across all surfaces.
- "Native Linear/Jira integration" — P9 uses Linear, but the value-prop hook is the persona switcher producing PR-ready ADR drafts that paste-into-Linear; native integration is a downstream enhancement after the synthesis flow proves out.

## Summary — path to honest 10/10

| Step | Cells closed | Avg score after |
|---|---|---|
| Baseline | — | 5.0 |
| **Iter-1 F1 (shipped)** — new-user empty-state hook | dim 3 for P1, P2, P3, P5, P7 (+5) | ~5.5 |
| FR-4 (memory trophy in StatusBar — 0.5 sprint) | +5 | ~6.0 |
| FR-5 (sample workspace import — 1 sprint) | +7 | ~6.7 |
| FR-1 (browser companion — 1.5 sprints) | +9 | ~7.6 |
| FR-2 (Telegram digest — 1 sprint) | +4 | ~8.0 |
| FR-3 (public skill registry — 2 sprints) | +6 | ~8.6 |
| FR-6 (xlsx — 2.5 sprints) | +1 for P6, persona movement | ~8.8 |
| FR-9 + FR-10 — polish loops | +6 | ~9.4 |
| FR-7 self-hosted — closes enterprise gaps | sovereign cells | ~9.7 |

Honest 10/10 across all 10 personas requires shipping at least FR-1, FR-2, FR-3, FR-4, FR-5. That's ~7 sprints of net-new product work — not surgical-UI patches. Iter-1 alone (F1) ships a measurable but small lift.

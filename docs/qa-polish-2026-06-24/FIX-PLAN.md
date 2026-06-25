# Waggle OS — QA Polish Pass (2026-06-24) · Fix Plan + Tracker

> Source: founder QA brief (Jun 2026). Branch `fix/qa-polish-2026-06-24` off main @ `65635862`.
> GUARDRAIL: preserve the 5-item calm spine + ⌘K progressive disclosure. No new sidebar apps.
> Ratified decisions: (1) Trust stats → **relabel as overlapping dimensions** (don't change math).
> (2) Scope → **all P0–P3 + find-similar + 4-state audit + the ⌘K coachmark (OPTIONAL)**.

Verify per batch: `tsc -p apps/web/tsconfig.app.json` 0 · `tsc -p packages/server/tsconfig.json` 0
(server is tsx-transpile-only — NOT covered by `npm run build`; run it explicitly) · affected vitest green.

## Batch 1 — KG graph (P0) · server contract projection
- [ ] kg-entity-type-dropped + kg-edges-not-rendered — `packages/server/src/local/routes/knowledge.ts`: project raw rows → `nodes:{id:String(id),label:name,type:entity_type}` + `edges:{source:String(source_id),target:String(target_id),relationship:relation_type}` as the FINAL step (after scope==='all' numeric-id merge). Fixes node-click + filter (both already wired). Add regression test for projected shape.

## Batch 2 — Home "Waggle suggests" (P0) · text derivation
- [ ] home-suggest-pipe-cursor-leak — shared `sanitizeExtracted()` in `session-utils.ts`, call at extractProgressItems/extractOpenQuestions/extractSessionOutcome + `workspace-state.ts` extractDecisionItems. Strip leading/trailing `|`, stray markers.
- [ ] home-suggest-head-truncation — clause-boundary anchor on TASK_PATTERNS; truncate TAIL + ellipsis, never head.

## Batch 3 — scheduling / timeline / notif / ⌘K (P1/P2)
- [ ] raw-cron-shown — extend in-house `describeCronExpr` (no new dep) in `lib/automation-display.ts`/`cron-presets.ts`; CockpitApp + AutomationCenter + AutomationBuilder use it; raw cron → title/tooltip.
- [ ] timeline-utc-vs-iso — `routes/events.ts`: insert explicit `new Date().toISOString()` timestamp so stored == queried format.
- [ ] missioncontrol-cmdk-cockpit-alias — `lib/command-catalog.ts`: add `keywords`/alias "cockpit" to the mission-control entry (it IS registered; "cockpit" just matched nothing).
- [ ] generic-agent-finished-notification — `routes/chat.ts:1656`: enrich title/body (workspace · agent · task) + `actionUrl` deep link.

## Batch 4 — memory content (P1/P2)
- [ ] trust-stat-cards-relabel — `MemoryTrustManage.tsx`: total headline + 3 subordinate non-summing "dimension" chips + one-line note. Math untouched.
- [ ] weaver-status-contract-mismatch — `adapter.ts getWeaverStatus()` real shape (no success-shaped catch fallback); WeaverPanel + CockpitApp follow.
- [ ] wiki-per-page-metadata — `WikiTab.tsx` relative date formatter; investigate identical sourceCount (upstream `wiki-compiler`); hide if not real.
- [ ] evolution-list-error-as-empty + wiki error state — add explicit ERROR branch (mirror MemoryCenterTab pattern).

## Batch 5 — chat / identity / i18n / copy / askbar / dup-ws (P2/P3)
- [ ] chat-session-uuid-title — `sessions.ts` return null title; FE auto-title from first user message + backfill.
- [ ] identity-two-sources-of-truth — `profile.ts`: profile.json authoritative; broaden A→B sync to supersede stale identity facts.
- [ ] i18n-faza-1 — `lib/shape-selection.ts` + `SettingsApp.tsx`: "Faza 1" → "Phase 1" (+ JSDoc).
- [ ] artifacts-stale-later-phase-copy — `WorkspaceDesktopApp.tsx:690`: drop "arrives in a later phase"; align to shipped Library.
- [ ] askbar-cmdk-hardcoded-and-plus-noop — shared `lib/platform.ts cmdKLabel`; AskBar/Sidebar/CommandCenter/NotFound consume it; wire "+" to quick-capture/⌘K.
- [ ] duplicate-workspace-names — CreateWorkspaceDialog dup warn + disambiguator (created/last-topic) on Home cards + switcher.

## Batch 6 — 4-state audit + ⌘K coachmark + similar sweep
- [ ] error-as-empty audit: MissionControl fleet/activity tabs, Forgotten tab, any swallow-to-empty catches surfaced in recon `similar`.
- [ ] ⌘K coachmark (OPTIONAL): one-time "Press ⌘K to reach Automations, Files, Vault, Usage…" coachmark OR "More tools" affordance in ⌘K empty state. Keep spine intact.

## Final
- [ ] adversarial review (workflow) → fix HIGH/MEDIUM
- [ ] live smoke (graph, home suggests, cron, timeline, weaver, chat titles) 0 console errors
- [ ] commit per batch; merge --no-ff; push; handoff

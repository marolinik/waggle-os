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

### FR-3 · Public skill registry web ("agentskills.waggle.ai") [HIGH]
- **Concrete triggers:** P10 (Tomás) currently picks Hermes for the OSS skill economy; P9 (Priya) is Claude Code's marketplace-savvy user; P4 (Imran) and P8 (Marko) would import frameworks from peers.
- **Surface:** Public web property listing all marketplace skills with one-click "Open in Waggle" deep-link. Reuses the MCP catalog work already done.
- **Cells closed:** dim 5 (tribe) for P4, P8, P9, P10 (+4). dim 10 for P9, P10 (+2). **~6 cells.**
- **Benchmark gap closed:** OpenClaw's 13k-skill ClawHub, Claude Code's 9k-plugin marketplace. Waggle has 148 entries in the curated catalog — public registry would expose + grow that.
- **Effort estimate:** 2 sprints — Next.js site reading from existing `@waggle/shared` mcp-catalog + a "publish my skill" submission flow.

### FR-4 · "Memory growth trophy" in StatusBar — visible compounding signal [MEDIUM]
- **Concrete triggers:** P1, P2 (novices) need a SEEN reason to come back tomorrow; P3, P5, P7 (mid-tech) need the dopamine of growth; the rubric's dim 8 says investment surfaces must be VISIBLE, not just stored.
- **Surface:** Add `🧠 N frames · +K this week` to StatusBar.tsx, with hover tooltip showing the breakdown.
- **Cells closed:** dim 8 reframing for P1, P2, P3, P5, P10 (+5). **~5 cells.**
- **Effort estimate:** 0.5 sprint — StatusBar.tsx + adapter call + Desktop.tsx prop threading.

### FR-5 · New-user demo workspace import [MEDIUM]
- **Concrete triggers:** P1, P2, P3 land with empty memory → no hook; current onboarding wizard doesn't pre-load ANY memory. Iteration-1 F1 shows DEMO bubbles but they're labelled examples. A real "Try Waggle with my sample workspace" path beats demo labels.
- **Surface:** Onboarding wizard step "Try Waggle with a sample workspace" → loads a small curated demo (marketer persona, writer persona, analyst persona — user picks one) with 5-10 pre-seeded memories, 1 wiki page, sample skills installed. After 10 min, they can erase + start clean.
- **Cells closed:** dim 3 (first-session hook) for P1, P2, P3, P5, P7 (+5). dim 7 (reward of self) for P1, P2 (+2). **~7 cells.**
- **Effort estimate:** 1 sprint — bundle sample workspace JSON + import path + onboarding wizard step.

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

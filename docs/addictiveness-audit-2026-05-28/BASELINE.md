# Baseline Addictiveness Audit — 10 Personas × 10 Rubric Dims
**Date:** 2026-05-28
**Build under audit:** main @ 46fa3b3 (after 2026-05-27 UX fixes shipped)
**Method:** code-grounded scoring against `RUBRIC.md`; evidence cited per cell; honesty rules carried over.

## Scoring matrix

Rows = rubric dims (1-10). Cols = personas (P1-P10). Cell = 0 (fail) | 1 (pass).

| Dim | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 | P9 | P10 | Universal note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 External trigger surface | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **No browser ext, no messaging push, no daily digest email** — universal fail |
| 2 Internal trigger fit | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | P1/P2 don't know they need memory recall yet — onboarding doesn't teach |
| 3 First-session hook (<60s) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | Only returning users get the "I REMEMBER" wow; new users hit empty briefing |
| 4 Friction-to-value | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | Dock → Chat → message ≤ 3 clicks ✓ |
| 5 Reward of the tribe | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | Team presence only TEAMS tier; P9 only because she sees Claude Code's marketplace network effect |
| 6 Reward of the hunt | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | LoginBriefing "I REMEMBER" + HybridSearch deliver surprise — but P1/P2 corpus too sparse |
| 7 Reward of the self | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | Custom personas + identity + brand voice are real; P1/P2 too novice to engage |
| 8 Stored data compounds | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | FrameStore/KG/Identity/Files all real; brag line surfaces growth — but **not framed as a "trophy"** for novices |
| 9 Switching cost (day 90) | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | Memory + KG + Files real; **no clear export-everything UI** for the wavering user — undermines trust |
| 10 "The one tool" coverage | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | Most personas would still open another tool for ≥ 1 daily task |
| **Total** | **1** | **1** | **5** | **6** | **6** | **6** | **6** | **8** | **6** | **5** | avg 5.0 / 10 |

## Cell-by-cell evidence (only the non-obvious cells)

**Dim 1 (External trigger) — universal 0:** No browser extension, no PWA install path surfaced, no email digest opt-in, no taskbar daemon notification, no Telegram/Slack/Discord push out. The only "trigger" is the user remembering to launch the Tauri app. Per benchmark intel: OpenClaw has 6+ messaging gateways, Hermes has cron-push into Telegram/Slack/Email, Claude Code has Routines + Cowork Desktop tab. Waggle has ScheduledJobsApp but it doesn't push outbound.

**Dim 2 (Internal trigger fit) — P1/P2 fail:** Greta and Hassan don't have a "memory recall" internal trigger yet — they're not at the workflow maturity where they think "wait, did I decide X?" Their internal triggers are immediate ("write this letter / reply to this DM"). Waggle's strongest hook (memory recall) doesn't fire for them. Onboarding doesn't TEACH them why memory matters.

**Dim 3 (First-session hook <60s) — only P8 passes:** P8 (Marko) is the existing user — he gets "I REMEMBER" with 5 memories + 137 entities. Everyone else lands on a near-empty briefing on day 0. New-user wow needs different design: synthetic-demo memory? Walk-through? "Connect your ChatGPT export in 2 clicks → BOOM, watch your memory populate"?

**Dim 5 (Reward of the tribe) — P9 only:** P9 sees the Claude Code marketplace network effect through Waggle's MCP catalog parity. Everyone else is solo on Free. No "X others use this skill" social proof, no community wall, no streak-style "Marko & Sarah both shipped 12 things this week" surface.

**Dim 6 (Reward of the hunt) — P1/P2 fail:** Their corpus is too sparse for HybridSearch to surface anything interesting. The hunt-reward depends on accumulated data — they don't have it.

**Dim 8 (Stored data compounds) — P1/P2 fail:** Same reason as dim 6 — the brag line says "0 memories" for novices, which is the OPPOSITE of a reward. The data infrastructure exists, the **framing for novices is missing**.

**Dim 9 (Switching cost) — P1/P2/P3 fail:** Not because the data isn't there, but because they lack the EVIDENCE that switching back would be costly. They need a visible "you've built X — see what you've accumulated" surface. BackupApp exists but is hidden.

**Dim 10 ("One tool" coverage):**
- P1 Greta: ChatGPT is faster to type in the browser; Waggle needs to install. Fails.
- P2 Hassan: Instagram DM-reply tool of choice is Instagram's own quick replies + Canva. Waggle has no Instagram connector visible to him.
- P3 Sarah: still needs Figma + Notion + Slack. Waggle doesn't replace those.
- P4 Imran: still opens Keynote for slides. Gamma skill exists in catalog but not surfaced first-class.
- P5 Lucas: Waggle DOES handle the corpus-ingest beautifully. **PASS.**
- P6 Daniel: still opens Excel; no native sheet UI.
- P7 Anya: still opens Substack to publish. ChatGPT custom GPT for voice is faster.
- P8 Marko: cross-LLM unified graph is what Waggle uniquely does. **PASS.**
- P9 Priya: Claude Code stays for coding; Waggle covers PM half. Mixed.
- P10 Tomás: Hermes still lighter for terminal-first workflow.

## Score distribution
- 10/10: 0 personas
- 8/10: P8 (1)
- 6/10: P4, P5, P6, P7, P9 (5)
- 5/10: P3, P10 (2)
- 1/10: P1, P2 (2)

**Average: 5.0/10**

## Pareto of fixes (where surgical work moves the most cells)

### Tier 1 — Surgical UI/UX (shippable this iteration)
| Fix | Cells closed | Personas affected |
|---|---|---|
| **F1** New-user hook screen — show "what Waggle remembers" walk-through with synthetic demo memories OR an "import your ChatGPT/Claude export NOW" CTA | dim 3 × 8 personas | P1-P5, P7, P9, P10 |
| **F2** "Memory growth trophy" — turn brag-line into a visible streak / level / personal-record indicator on the desktop top bar, not just inside LoginBriefing | dim 8 × 4-5 personas | P1, P2, P3, P5, P10 |
| **F3** "Coverage compass" — Settings tile or banner that shows "Waggle replaces: ChatGPT-X-Y-Z / Notion AI / Gamma" with checkmarks for what's wired today | dim 10 × 3 personas | P3, P4, P7 |
| **F4** Visible export / "you've built X" surface — BackupApp prominence raised, with a "switching cost" framing | dim 9 × 2-3 personas | P1, P2, P3 |
| **F5** Onboarding teaches the memory recall affordance in 30s — short interactive walk-through | dim 2 × 2 personas | P1, P2 |

### Tier 2 — Mid-size product work (FEATURE-REQUESTS, not this iteration)
- **Browser extension** — closes external trigger dim 1 for P1-P5, P7 (+6 cells)
- **Messaging push gateway** (Telegram first; later Slack/Email) — closes dim 1 for P10 + a few others
- **Public skill registry** (agentskills.io parity) — closes dim 5 partial
- **Native xlsx editor** (or strong integration) — closes dim 10 for P6
- **Routines-style outbound digests** — closes dim 1 + dim 3 partial

### Tier 3 — Strategic bets (out of audit scope, listed for completeness)
- Self-hosted enterprise build (compete with OpenClaw + Hermes)
- Apple-tier marketing & demo videos (to compete with Cowork's polish)

## Honest read

Reaching honest 10/10 across all 10 personas in this iteration is NOT feasible — dim 1 (external trigger) is a real product surface that doesn't exist yet. The realistic target for surgical iteration 1+2:
- Move P1/P2 from 1 → 4-5 (onboarding + new-user hook)
- Move P3/P10 from 5 → 7-8
- Move others from 6 → 8
- Capture dim-1 + dim-5 + dim-10 as feature requests with concrete user-triggers (per the rule)

The path to honest 10/10 is multi-iteration AND requires shipping 2-3 of the Tier-2 features. This audit will deliver iter-1 surgical work + a rigorously prioritized feature backlog rather than gaming the score.

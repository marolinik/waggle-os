# Judge 3 — Non-Developer Power User Verdict

## Persona

Operations lead. I don't code; I live in Notion, Airtable, and Zapier. I build automations
for a living, I learn every keyboard shortcut in week one, and I will open every menu you
ship. I judge a tool on whether depth is rewarded — whether the power surfaces have real
machinery behind them or are just chrome.

Evidence reviewed: 14 screenshots (1440x900, plus 2x quadrant crops for the dense ones)
and live sidecar API calls (`/api/home/briefing`, `/api/skills`, `/api/skills/presentation-design`,
`/api/automations`, `/api/agents`, `/api/evolution/runs`) via the bootstrap session token.

## Scores

| # | Criterion | Score (1–5) |
|---|-----------|-------------|
| 1 | First-session clarity | **4** |
| 2 | "It knows me" feeling | **4** |
| 3 | Visible agent growth | **2** |
| 4 | Desire to return | **3** |
| 5 | Absence of friction | **2** |

**Total: 15 / 25**

## Per-criterion reasoning

### 1. First-session clarity — 4

The onboarding is genuinely excellent and the best three minutes of the product. Welcome →
"Tell us who you are" (role chips, team size, goals — and a live PREVIEW of how it will greet
me, a lovely touch) → "Where do you use AI today?" → first workspace. Step 2 is the standout:
it auto-detected Claude Code ("Found 425 items at C:\Users\MarkoMarkovic\.claude") with a
one-click **Harvest** button. That is the memory promise made tangible before I've typed a
word. Workspace types (Project/Client/Research/Personal) with "Each workspace is its own
brain" is exactly how an ops person thinks.

The main shell is mostly graspable: left nav grouped into core (Home/Chat/Memory/Files/
Artifacts), INTELLIGENCE, EXTEND, SYSTEM. Home explains itself.

Why not 5: the nav carries 20+ entries on first run, and several names are opaque to a
non-developer — **Room**, **Waggle Dance**, **Weaver**, **Mission Control**, **MCP Hub**.
There's also a naming split between "Centers" (Agent, Automation) and "Hubs" (Skills,
Connector, MCP) for sibling concepts. I'd grasp it in session one, but I'd be hovering a
lot of labels asking "what's a Waggle Dance?"

### 2. "It knows me" feeling — 4

This is the product's strongest axis. The returning-user greeting ("Good evening, Marko",
"15 memories · 214 entities · 6 relations across 3 workspaces") plus the Home header
("You've been away 10 days, Marko. Here's what happened") is exactly the right move. The
"I REMEMBER" panel surfaces a real learned working preference — "I always work with a
draft → critique → rewrite loop. The critique pass is the most important…" — which is the
single most convincing artifact in the whole evidence set: that's *me*, not my data.
Workspace resume (07) is also strong: the agent reconstructs decision history with dates
and rationale ("DECISION 1: Q3 Editorial Pivot — 'Skepticism Over Hype', Approved by Marko
(founder) on 2026-04-12"), and the right rail shows 11 memories / last activity / pending.

Why not 5 — three visible cracks in the same surfaces:
- The greeting modal says "**active yesterday**" while the Home header behind it says
  "**You've been away 10 days**" — both visible in screenshot 01 simultaneously. Which is it?
- The "I REMEMBER" list shows the **same session twice**: "Session (2026-04-30): What is
  sovereign AI — 4 messages" appears as both "yesterday" and "1w ago". Duplicate memory
  in the memory pitch is self-defeating.
- A session dated 2026-04-30 timestamped "yesterday" (June 11) doesn't add up.

### 3. Visible agent growth — 2

The mission says I should *see* the system learning. I mostly can't:

- **Agent Center (05) is an empty state**: "No agents yet — create one to put it to work.
  0 agents, 0 running, avg success —." Yet the Writer demo workspace shows an agent that
  chatted, made decisions, and has LAST ACTIVITY "tool_result: create_skill". The agent
  that demonstrably worked for me is invisible in the surface named after it.
- **Memory > Evolution (13) is empty**: "No runs in proposed", and the API confirms
  `{"runs":[],"count":0}` — zero runs ever, not a filter artifact. The headline
  "self-evolving" surface for a 10-day-absent user with 3 workspaces contains nothing.
- The one genuine growth artifact — the agent-authored **presentation-design** skill — is
  real (API confirms `initiator: agent, source: chat-session`, 10 concrete steps, tool
  list) and the "agent · review" provenance badge is the right idea. But the screenshot
  meant to prove it (04b) is blurred behind the welcome modal; I had to verify it via API,
  which a user can't do.
- The 12 "active automations" are **all system defaults** (Memory consolidation, Marketplace
  sync, Index reconciliation, Harvest sync, Morning briefing…). Useful plumbing, 100%
  success rate — but none of them was learned from *my* workflows.
- Genuine positives that save this from a 1: the overnight panel ("8 memories consolidated",
  "5 automations completed") makes consolidation visible, and the Evolution empty state at
  least explains the model ("Each run shows the baseline vs winner… accept or reject the
  proposal") with a New Run button.

### 4. Desire to return — 3

The loop architecture is right: resumable workspace cards with "Continue" + pending counts,
overnight stats, suggested next actions, "Up next" schedule, /catchup in the palette, and a
Morning briefing automation. The pending-approval counts ("⚠ 1 pending") are a real hook —
that's how Zapier gets me back too.

What deflates it:
- **"Up next" is the app's janitorial calendar, not my work**: "Memory consolidation at
  Jun 13, 3:00 AM · Marketplace sync at Jun 14, 2:00 AM · Index reconciliation at Jun 14,
  4:00 AM" (confirmed identical in the API). Nobody returns for index reconciliation.
- **Suggested next actions are verbatim first-lines of stale sessions**, including
  "Resume: Reply with the literal string PHASE_B_OK and nothing else." (a leftover test
  prompt, served to me as a recommendation — confirmed in `/api/home/briefing`). One bad
  suggestion poisons trust in all four.
- The strongest pull (overnight agent work on *my* projects) shows "5 automations
  completed" but they were maintenance jobs, and "0 artifacts created" — so nothing was
  actually waiting for me after 10 days away.

### 5. Absence of friction — 2

Power-user fast paths are honestly good: Ctrl+K palette with 22 slash commands
(/catchup, /now, /research, /draft, /decide, /review, /spawn, /skills), keyboard hints in
the palette footer, Ctrl+K chip in the header, a guided 4-step coach-mark tour. The
Automation Center has the right tab anatomy (Overview/Running/Scheduled/Triggers/History/
Logs). But the friction list is long and concrete — see below. The most damning: the
welcome-back modal sits on top of **four** of the evidence screens (Home, Memory Center,
Skills Hub twice), meaning it either re-fires across navigation or blocks the two surfaces
that prove the product's superpowers; the Agent Center empty state contradicts the rest of
the app; and raw internals (tool_result:, PHASE_B_OK, 3 AM cron times) leak into
user-facing copy throughout.

## Concrete complaints

1. **Welcome modal blocks the superpower screens** (03-memory-center.png, 04/04b-skills-*.png):
   the "Good evening, Marko" modal overlays the Memory Center and Skills Hub with the page
   blurred behind it. Whether it re-triggers on navigation or simply wasn't dismissible fast
   enough, the surfaces that prove Memory and the agent-authored skill badge are unviewable.
   Make it appear exactly once on Home, never over other screens.
2. **Agent Center says "No agents yet — 0 agents" to a user whose agent just worked**
   (05-agent-center.png vs 07-workspace-resume.png): Writer demo — Anya shows an agent chat
   with LAST ACTIVITY "tool_result: create_skill", and `/api/agents` returns `{"agents":[],
   "count":0}`. Workspace personas must surface here, or the center reads as broken/chrome.
3. **"You've been away 10 days" and "active yesterday" shown in the same view**
   (01-home-welcome-back.png): the header and the greeting modal contradict each other.
   Pick one definition of activity and reconcile.
4. **Duplicate "I REMEMBER" entries** (01): "Session (2026-04-30): What is sovereign AI — 4
   messages" listed twice ("yesterday" and "1w ago"). Dedupe the recall panel; a memory
   product cannot visibly double-count memories.
5. **Suggested next action = "Resume: Reply with the literal string PHASE_B_OK and nothing
   else."** (02-home-cockpit.png, confirmed in /api/home/briefing): suggestions are raw
   first-lines of old prompts with no summarization or junk filtering. Summarize intent
   ("Continue the PM-Waggle-OS file analysis") and drop trivial/test sessions.
6. **"Up next" contains only system maintenance** (02): Memory consolidation 3:00 AM,
   Marketplace sync 2:00 AM, Index reconciliation 4:00 AM. Show my deadlines/agent
   deliverables here; tuck janitorial crons into Automation Center > Scheduled.
7. **Raw dev-speak in user-facing fields** (07): LAST ACTIVITY reads "tool_result:
   create_skill". An ops user should see "Created skill: presentation-design".
8. **Automation Center Overview is three stat tiles over a void** (06): "13 automations"
   in the header, 12 active, 100% success — and the rest of the screen is empty honeycomb.
   The Overview should show the next 3 runs and last 3 results without a tab switch.
9. **Evolution tab is empty for a seasoned account** (13, `/api/evolution/runs` = 0):
   the self-evolution showcase has never run. Seed it from real activity (e.g., propose a
   skill improvement after N uses) or auto-trigger a first run post-harvest, otherwise the
   marquee differentiator looks like vaporware to exactly the user it should wow.
10. **All "active automations" are stock system jobs** (06 + /api/automations): none of the
   12 derive from my behavior (no "learned: you draft → critique → rewrite; automate the
   critique pass?"). The learned-preference data exists (see I REMEMBER) — close the loop.
11. **Cryptic nav labels for non-developers** (02 sidebar): "Room", "Waggle Dance",
   "Weaver", "MCP Hub", "Mission Control" carry no hint of function; "Center" vs "Hub"
   naming is inconsistent across sibling surfaces. Add one-line hover descriptions or
   rename to plain verbs.

## Power-user spot checks (asked of me specifically)

- **Fast path: PASS.** Ctrl+K everywhere, 22 slash commands with descriptions, footer key
  hints, /catchup as the top suggestion for a returning user — this rewards depth.
- **Power surfaces substance: SPLIT.** Automations = real (13 schedules, real next-run
  timestamps, success tracking) but impersonal. Skills = real (20 skills, one genuinely
  agent-authored with provenance frontmatter). Evolution = chrome today (0 runs).
  Agent Center = chrome today (0 agents despite agent activity).

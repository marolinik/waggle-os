# Judge 3 — Non-Developer Power User (Ops Lead)

**Persona:** Operations lead who lives in Notion, Airtable, and Zapier. I don't code. I build automations, learn every keyboard shortcut, open every menu and tab on day one, and I judge a tool on whether going deep is rewarded — or whether the second layer is hollow. I notice when numbers don't reconcile across screens, because in my world a dashboard that contradicts itself is a dashboard I stop trusting.

**Evidence reviewed:** All 14 screenshots (read at full resolution via crops), plus live API verification against the running sidecar (`/api/home/briefing`, `/api/home/overnight`, `/api/skills`, `/api/agents`, `/api/automations`, `/api/memory/stats`).

---

## Scores

| # | Criterion | Score |
|---|-----------|:-----:|
| 1 | First-session clarity | **4** |
| 2 | "It knows me" feeling | **4** |
| 3 | Visible agent growth | **3** |
| 4 | Desire to return | **4** |
| 5 | Absence of friction | **2** |

**Total: 17/25 · 10 concrete complaints**

---

## Per-Criterion Reasoning

### 1. First-session clarity — 4/5

The onboarding is the best three-step flow I've seen in this category. Plain-language questions ("What do you want Waggle to help with?" with chips like *Automate repetitive work* — that's me), a live greeting preview that updates as I type my name ("Good evening, Marko — your work will be remembered here."), and the killer moment: **Step 2 auto-detected Claude Code with "Found 425 items at C:\Users\MarkoMarkovic\.claude" and a one-click Harvest button.** Per-source export how-tos for ChatGPT/Claude/Gemini/Perplexity (exact menu paths: "Settings → Data controls → Export data") are written for someone exactly like me. "Each workspace is its own brain" is the right one-line mental model. The privacy line on screen one ("Your memory and data stay on your device") earns trust immediately.

Why not 5: the sidebar I land in afterward has ~20 items, and a chunk of them are jargon a non-developer cannot parse from the label alone — **"MCP Hub", "Waggle Dance", "Weaver", "Room"** mean nothing on first read. And the Memory Center splits into **seven tabs** (Memories / Timeline / Graph / Harvest / Weaver / Wiki / Evolution) with no hint about which one I should care about first. The first session is clear; the first *deep dive* requires guessing.

### 2. "It knows me" feeling — 4/5

This is where the product is closest to its promise. "You've been away 10 days, Marko. Here's what happened:" with the actual date is exactly the greeting the mission describes. The welcome panel's **"I REMEMBER" section quoting a learned working preference back to me — "I always work with a draft → critique → rewrite loop. The critique pass is the most important" — is the single most convincing moment in the app.** The workspace resume (07) is genuinely excellent for an ops brain: a structured decision log ("DECISION 1: Q3 Editorial Pivot — 'Skepticism Over Hype', Approved by Marko (founder) on 2026-04-12", stakeholders with their authorities listed), plus a one-line workspace summary on the Home card ("Q3 editorial direction: lean into skepticism, less hype"). The memory card knowing my age, employer, and that I support Crvena Zvezda is the party trick that sells the demo.

Why not 5 — the numbers betray the magic. The modal header says **"17 memories … across 3 workspaces"**, but the Default Workspace card directly beneath it says **"11 memories"** and the Writer demo side panel (07) also says **"11 memories"** — 11+11+0 ≠ 17, and `/api/memory/stats` says 14 personal frames. A tool that claims to remember everything must not contradict itself about how much it remembers. Also, the welcome modal puts **Default Workspace (stale, last touched ~2 months ago) at the top** while Writer demo — the workspace with a pending item and a real summary — is collapsed at the bottom; the Home grid behind it sorts by recency. Two greeting surfaces, seconds apart, disagree about what I should care about.

### 3. Visible agent growth — 3/5

There IS real, verifiable growth evidence — I checked. The `presentation-design` skill carries an **"agent · review" provenance badge**, and the API confirms it (`"initiator": "agent", "source": "chat-session"`): the system wrote itself a skill and is honestly flagging it for my review. Workspace activity says "Created a skill · 10d ago". The Automation Center is the strongest power surface: 13 automations, 12 active schedules, **100% success rate with timestamped recent results** (Morning briefing OK 3:05:58 AM) and named next runs. Overnight: "9 memories consolidated".

But the marquee surface is hollow. **The Evolution tab — literally titled "Your agent improves itself here" — is completely empty: zero proposals across all six filter states (all/proposed/accepted/deployed/rejected/failed)**, even though "Prompt optimization" and "Monthly assessment" automations supposedly run. The Agent Center has exactly **one agent that has never run** ("Run never", "avg success —"). And the growth evidence that *does* surface in Memory is two "Monthly Agent Assessment" cards reporting **"Interactions: 0, Correction Rate: 0.0%"** — the system showing me a report card full of zeroes. I can see the *machinery* of self-evolution everywhere; I can only see one actual instance of it (the skill badge). Telling ≠ showing.

### 4. Desire to return — 4/5

The loop is real and it's built the way a Zapier user wants it: overnight digest with numbers (9 consolidated / 5 automations completed), an **"Up next" section with concrete dated items** ("Stale workspace check at Jun 15, 9:00 AM"), a suggested next action that deep-links into the right workspace ("Resume: Review recent decisions and next steps" — verified in the API as a per-workspace `next-action`), pending-count badges, and Quick capture (Note/Task/Link/File) so the cost of dumping a thought is near zero. `/catchup` being the top "Suggested for you" item in the Ctrl+K palette — with palette commands described in plain outcomes, not dev-speak — is a genuine fast path; the palette is discoverable via a visible "Ctrl+K" chip in the header. Depth is starting to be rewarded.

Why not 5: the overnight story is currently **housekeeping, not work product** — "0 Artifacts created", and the digest items (Memory compaction, Harvest sync, Index reconciliation) are the system doing chores on itself. "Up next" is likewise system maintenance ("Capability suggestion") framed as my agenda. I come back to Notion because something *for me* changed overnight; here, the agent mostly tidied its own room.

### 5. Absence of friction — 2/5

Nothing crashed, no dead-end navigation, every screen rendered, every API answered — but I open every menu, and nearly every menu had a rough edge. Four flagship surfaces are substantially empty at 1440×900, raw markdown leaks into user-facing text, and the numbers don't reconcile. Itemized below.

---

## Numbered Complaints (all concrete)

1. **Home cockpit has a dead column.** On 02-home-cockpit.png there is a vertical divider at ~x=1170 with a completely empty rail (~270px, ~19% of the viewport) to its right — nothing renders in it at all. That's prime real estate on the single most important screen, blank.
2. **The Evolution tab is an empty promise.** 13-memory-evolution.png: "Your agent improves itself here" + six filter chips + zero items in any state. The flagship "self-evolving" surface, on an account where evolution-adjacent automations (Prompt optimization, Monthly assessment) demonstrably run, shows nothing to review, accept, or reject.
3. **Machine exhaust pollutes Memory, ranked above the good stuff.** 03-memory-center.png: the top two memory cards are "Monthly Agent Assessment — 2026-05 / 2026-04" containing unrendered template markdown with all-zero stats ("# Monthly Agent Assessment … \*Interactions\*: 0 \*Correction Rate\*: 0.0% … ## Weaknesses ## Capability Gaps - None detecte…"), tagged FACT — while the genuinely personal "User's name is Marko Markovic, age 51…" card sits below them.
4. **Skills Hub descriptions leak raw markdown with mid-word truncation.** 04-skills-hub.png: list rows read "## What to do 1 \*\*"Identify the decision"\*\* — Clarif", "— Pull fro", "## When to use — Usa". Twenty skills and nearly every description line is a broken markdown fragment instead of a sentence.
5. **Memory counts don't reconcile across three surfaces.** Welcome modal header: "17 memories … across 3 workspaces". Default Workspace card in the same modal: "11 memories across 16 sessions". Writer demo side panel (07): "11 memories". `/api/memory/stats`: 14 personal frames. Four numbers, no arithmetic that connects them.
6. **The two greeting surfaces disagree on priority.** The welcome-back modal (01) lists Default Workspace (last active April, ~2 months stale) first and Writer demo (16d, 1 pending, has a summary) last; the Home grid behind it (02) sorts by recency. Same moment, contradictory ordering.
7. **Agent Center is a near-empty shell with a grammar bug.** 05-agent-center.png: header reads "1 agents · 0 running · avg success —"; the sole agent shows "Run never" and status Idle. Five tabs (All/Personal/Workspace/Team/Autonomous/Archive) over one never-executed item — depth is not yet rewarded here.
8. **Overnight digest reports chores, not output.** 02-home-cockpit.png: "0 Artifacts created"; Next up = Memory compaction, Memory lane extraction, Harvest sync; Up next = "Stale workspace check", "Capability suggestion". The system's self-maintenance is presented as my morning briefing.
9. **Unexplained jargon in primary navigation.** Sidebar labels "MCP Hub", "Waggle Dance", "Weaver", "Room" carry no tooltip-visible plain-language meaning for a non-developer, and Memory Center's 7 tabs (Memories/Timeline/Graph/Harvest/Weaver/Wiki/Evolution) overlap conceptually with no guidance on which to use when.
10. **Center screens don't use the canvas.** Memory Center (03), Agent Center (05), and Automation Center (06) all leave the bottom ~50–60% of a 1440×900 window as bare honeycomb wallpaper; Memory Center shows only ~4 cards above the fold of an empty sea.

## What earned the points (for balance)

- Onboarding auto-detect ("Claude Code detected — Found 425 items") with one-click Harvest: best-in-class first-run moment.
- "I REMEMBER" quoting my learned draft→critique→rewrite preference back to me.
- Decision history with approver, date, rationale, and stakeholders in workspace resume — ops-grade.
- "agent · review" provenance badge, verified real in the API (`initiator: "agent"`).
- Automation Center's 100% success rate with timestamped runs and named next runs.
- Ctrl+K palette with contextual "Suggested for you" `/catchup` and plain-language command descriptions.

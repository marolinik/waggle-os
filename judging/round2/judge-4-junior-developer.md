# Judge 4 — Junior Developer Verdict (Round 2)

## Persona summary

Two years into the job. I live in VS Code, lean on Copilot all day, keep a ChatGPT tab pinned, and I will absolutely click every button in your app within ten minutes. I have opinions about Raycast's command palette and Linear's empty states, and I judge new tools against that bar. AI agents are the thing I'm most curious about right now — I want to see one actually do something, not read a card telling me it will.

Evaluated from 14 screenshots (1440x900, cropped/zoomed with PIL where needed) plus live verification against the running app at `localhost:8080` (session-token auth, then `/api/workspaces`, `/api/home/briefing`, `/api/memory/stats`, `/api/agents`, `/api/skills`, `/api/automations`, `/api/harvest/sources`).

## Scores

| # | Criterion | Score (1-5) |
|---|-----------|-------------|
| 1 | First-session clarity | **4** |
| 2 | "It knows me" feeling | **4** |
| 3 | Visible agent growth | **3** |
| 4 | Desire to return | **4** |
| 5 | Absence of friction | **3** |

**Total: 18/25 — Complaints: 10**

## Per-criterion reasoning

### 1. First-session clarity — 4

The onboarding is the best three steps in the product. "Each workspace is its own brain — memory, files, and agents stay isolated" (11-onboarding-workspace.png) teaches the core mental model in one sentence — better than most docs pages I've read. Step 1's live greeting preview ("Good evening, Marko — your work will be remembered here") updates as you type your name, which makes the memory promise concrete before you've even entered the app. Step 2 auto-detecting Claude Code ("Found 425 items at C:\Users\MarkoMarkovic\.claude") with a one-click Harvest button is the single biggest "whoa" moment for a developer — it found my actual workflow without me telling it anything. The privacy line on the welcome screen ("Your memory and data stay on your device") answers my first question unprompted.

But two of the three pillars get taught and one doesn't: workspaces and memory are explained; the self-evolving agent is never introduced. Nothing in steps 1-3 prepares you for Evolution, Agent Center, or the agent-review concept. And the moment onboarding ends, you land in a sidebar with roughly 20 items including unexplained jargon — "Room", "Waggle Dance", "Mission Control" (02-home-cockpit.png). I can navigate that because I navigate IDEs all day; the "especially non-technical users" in the mission statement cannot.

### 2. "It knows me" feeling — 4

This is the product's strongest muscle and most of it is real, not staged. "You've been away 10 days, Marko. Here's what happened:" (02) is exactly what I want from a tool I left running. The welcome modal (01) stacks specifics: "17 memories · 214 people, projects & things it knows across 3 workspaces" (the 214 matches `/api/memory/stats` entityCount exactly — I checked), an "I REMEMBER" section with an actual learned working preference ("I always work with a draft → critique → rewrite loop. The critique pass is the most important"), and per-workspace resume lines naming the last session topic. The workspace resume (07) is the payoff: the agent compiles "Decision Review & Next Steps — Anya's Content Strategy" from workspace memory with rendered markdown, dates, and stakeholders ("Marko — Approved the direction; has final say on brand positioning"). The memory card that knows I'm 51, work at Egzakta Group, and support Crvena Zvezda is the kind of detail that makes the greeting feel earned.

Two things stop the 5. First, the welcome modal misspells the workspace name — "Writer demo — Anua" (01) — while the cockpit behind it (02), the workspace panel (07), and the live API all say "Anya". A memory product that misremembers a name in its flagship "I remember you" surface undermines the exact feeling it's selling. Second, when you click through to Memory Center to see this famous memory, you get three cards, two of which are robot-generated assessment reports — the memory feels deep in the greeting and thin at the source.

### 3. Visible agent growth — 3

There is one genuinely excellent, verified artifact here: the `presentation-design` skill in Skills Hub carries an "agent · review" badge (04b), and the API confirms it is not paint — the skill record has `initiator: "agent"`, `source: "chat-session"`. An agent authored a skill, the system tracked provenance, and the UI gates it behind review. That is the self-evolution loop, real, end to end. The workspace panel's "LAST ACTIVITY: Created a skill — 10d ago" (07) reinforces it. The Editorial Critic agent (05) is also real (verified via `/api/agents`) and its goal is wired to remembered context — "apply the Q3 skepticism-over-hype editorial direction before anything ships" is literally Decision 1 from the workspace's memory. That memory-to-agent-config loop is visible and credible.

But everything else is scaffolding. The Evolution tab (13) — the marquee "agent improves itself" surface — is an empty state: zero runs, "Select a run to review", a "New Run" button, and explainer copy. Agent Center shows one agent, "0 running", "avg success —", never executed; the API shows it was created the same day as this evaluation and has no run history. All 13 automations (verified) are system-shipped maintenance jobs — memory compaction, harvest sync, marketplace sync — none learned from my workflows. The growth story today is one authored skill and a stack of promises. That's a real seed, not a visible garden.

### 4. Desire to return — 4

Honestly? Yes, I'd keep it running for a while, and that surprised me. The away-briefing loop (leave → come back → "here's what happened" → one-click Continue into the exact workspace with pending items flagged) is something neither Copilot nor ChatGPT does, and it's implemented, not mocked — `/api/home/briefing` returns the greeting, suggested next action, and per-workspace pending counts I saw on screen. The Claude Code harvest means it accumulates value from work I'm already doing. The Win+K palette (12) with `/catchup`, `/research`, `/spawn`, `/skills` is Raycast-literate and made me feel at home immediately; "/catchup — Workspace restart summary — get up to speed instantly" as the top suggestion is exactly the right default.

What stops the 5: the overnight report says "9 Memories consolidated, 0 Artifacts created, 5 Automations completed" (02). Nine consolidated memories is housekeeping; zero artifacts means the agent layer produced nothing for me while I was gone, and the one agent that could have (Editorial Critic) has never run. The return habit this app wants to build is "come back to finished work" — right now it's "come back to a well-organized summary of nothing having been done." I'd return daily for two weeks on the briefing alone; whether week three survives depends on that artifacts number going above zero.

### 5. Absence of friction — 3

No crashes, no broken layouts, navigation is coherent, and the visual identity (honey-on-dark hex theme) is consistent and genuinely attractive. But the rough edges are pervasive once you leave the happy path, and several are on flagship screens — see the numbered list. The two worst: raw markdown leaking as literal `#`/`##`/`**` text across both Memory Center cards and every Skills Hub row (this is table-stakes rendering, and the chat view proves the app can render markdown beautifully), and the Anua/Anya name inconsistency on the welcome modal. Add zero-data auto-generated memories polluting "About you" and three major screens that are 70-90% empty hexagon wallpaper, and the polish gap against the Linear/Raycast tier I compare everything to is clearly visible.

## Numbered complaints

1. **Workspace name misspelled in welcome modal** — 01-home-welcome-back.png shows "Writer demo — Anua"; the Home cockpit (02), the workspace side panel (07), and `GET /api/workspaces` all say "Writer demo — Anya". The memory product misremembers a name on its "I remember you" surface.
2. **Raw markdown rendered literally in Memory Center cards** — 03-memory-center.png: "# Monthly Agent Assessment — 2026-05", "**Interactions**: 0", "## Strengths - Low correction rate" displayed with literal hashes and asterisks instead of formatted text.
3. **Raw markdown in every Skills Hub row** — 04/04b: skill descriptions render as "# Brainstorm — ... ## What to do Run three" and "## Steps 1. Analyze audience needs and pr..." — every list row leaks frontmatter-style source instead of a clean one-line summary.
4. **Auto-generated noise crowds the "About you" memory** — 03: two of the three visible memories are "Monthly Agent Assessment" reports with Interactions: 0, Correction Rate: 0.0%, Improvement Trend: 0% — zero-data system output presented as things it "knows about me".
5. **Evolution tab has zero evidence of evolution** — 13-memory-evolution.png: the headline self-improvement surface is an empty state ("Select a run to review", no runs, "New Run" button). The superpower is an explainer card.
6. **Agent Center is one row and a void** — 05-agent-center.png: 1 agent, "0 running", "avg success —", never executed (API confirms no run history); ~85% of the screen is decorative hex background.
7. **Overnight digest reports "0 Artifacts created"** — 02-home-cockpit.png: the come-back-to-finished-work promise returns memory housekeeping (9 consolidated) and nothing produced.
8. **Onboarding never teaches the second superpower** — 08-11: identity, memory import, and workspace creation are covered; self-evolving agents, skill authorship, and the review gate are never introduced before the user encounters "agent · review" badges and the Evolution tab.
9. **Sidebar overload with unexplained jargon** — 02: ~20 nav items across 4 sections including "Room", "Waggle Dance", and "Mission Control" with no visible explanation — fine for me, hostile to the non-technical users in the mission.
10. **Welcome screen caption wraps awkwardly** — 08-onboarding-welcome.png: "Nothing leaves without your say-so." breaks as "say-" / "so." across two lines, a sloppy first impression on an otherwise immaculate first screen.

## Bottom line

The memory pillar is real and verified — greeting, briefing, resume, and provenance all check out against the live API. The evolution pillar has exactly one true artifact (the agent-authored skill with its review badge) surrounded by empty stages waiting for a performance. I'd run it next to VS Code this month. Whether it stays depends on the agents earning their tab.

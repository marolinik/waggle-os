# Judge 4 — Junior Developer Verdict

## Persona summary

I'm two years into my first dev job. VS Code, Copilot, and ChatGPT are my daily drivers, so my polish bar is set by tools with hundreds of engineers behind them. I'm exactly the "curious about AI agents" user Waggle should hook: I have a real `.claude` folder full of history (the onboarding found 425 items of mine), I click every tab, and I notice when a chat bubble shows raw `**asterisks**` because ChatGPT never does that.

Evidence reviewed: all 14 screenshots (plus the `_crops` detail set and my own crops of the small renders), and live probes of `http://localhost:8080` (`/api/skills`, `/api/home/briefing` — both correctly return `401 MISSING_TOKEN` without a session, which is good security but limited my API spelunking).

## Scores

| # | Criterion | Score (1–5) |
|---|-----------|-------------|
| 1 | First-session clarity | **4** |
| 2 | "It knows me" feeling | **4** |
| 3 | Visible agent growth | **3** |
| 4 | Desire to return | **4** |
| 5 | Absence of friction | **2** |

## Per-criterion reasoning

### 1. First-session clarity — 4/5

The onboarding is the best part of the whole package. Three steps, and each one teaches the mental model instead of collecting data:

- Step 3 literally says **"Each workspace is its own brain — memory, files, and agents stay isolated."** That's the entire workspace mental model in one sentence, on the screen where you create your first workspace. 
- Step 2 ("Where do you use AI today?") auto-detected Claude Code with **"Found 425 items at C:\Users\MarkoMarkovic\.claude"** and a one-click Harvest button. As a Claude Code user this instantly made the memory pitch concrete — it's not "we will remember," it's "we found your existing memory, want it?"
- The welcome screen's privacy line ("Your memory and data stay on your device") answers the question I'd ask first.

Why not 5: once inside, the surface area explodes — a ~20-item sidebar (Agent Center, Skills Hub, Automation Center, Room, Waggle Dance, Connector Hub, MCP Hub, Weaver, Vault, Mission Control...) plus 8 tabs inside a workspace. "Waggle Dance," "Weaver," and "Room" mean nothing on first read. And the mental model takes a hit when the **Agent Center says "No agents yet"** while a Writer agent is demonstrably chatting in my Writer demo workspace — so where do agents live, exactly?

### 2. "It knows me" feeling — 4/5

This is the pillar that mostly lands:

- "Good evening, Marko" modal with real stats (15 memories · 214 entities · 3 workspaces), an "I REMEMBER" section that recalled an actual stylistic preference — *"I always work with a draft → critique → rewrite loop. The critique pass is the most important"* — which is exactly the kind of thing I'd want a tool to remember.
- The Home cockpit headline **"You've been away 10 days, Marko. Here's what happened:"** plus per-workspace resume cards with pending counts and Continue buttons.
- The killer demo is screenshot 07: clicking "Review recent decisions and next steps" produced a real reconstruction — "DECISION 1: Q3 Editorial Pivot — 'Skepticism Over Hype' ... Approved by Marko (founder) on 2026-04-12," including the rationale and voice rules. Copilot and ChatGPT have nothing like a per-workspace decision history I can replay.
- `/catchup` in the Ctrl+K palette ("Workspace restart summary — get up to speed instantly") is the right verb for the feeling.

Why not 5: the memory surface contradicts itself, which is fatal for a *trust* feature. The greeting modal's meta line says **"active yesterday"** while the headline directly behind it says **"You've been away 10 days."** Worse, the same session — "Session (2026-04-30): What is sovereign AI — 4 messages" — is listed **twice** in "I REMEMBER," once tagged "yesterday" and once "1w ago," for a session dated April 30 when today is June 12. A memory product showing me wrong/duplicated memories of *itself* makes me wonder what else it misremembers.

### 3. Visible agent growth — 3/5

There is real evidence, but it's thin and the dedicated surfaces are empty:

- Real: the Skills Hub has one skill carrying an **"agent · review"** badge (orange, distinct from the green Enabled chips) — agent-authored, gated behind human review. That's the right provenance design. The workspace side panel also shows **"LAST ACTIVITY: tool_result: create_skill"** — the agent really did author a skill.
- Real: the overnight panel ("8 Memories consolidated · 0 Artifacts created · 5 Automations completed") and the Automation Center (13 automations, 12 active schedules, 100% success rate) prove autonomous activity while I was away.
- Empty: the **Memory → Evolution tab shows "No runs in proposed"** — the one surface explicitly named after self-evolution has nothing in it (and its default filter lands on the empty bucket). The **Agent Center shows "No agents yet."** For a seeded returning-user demo, the two screens that should prove "it keeps getting better" are honeycomb wallpaper.

Net: the self-evolution story is ~one badge and one raw event label deep. It's not marketing — the plumbing visibly exists — but as shown, I see the *receipts* of growth more than the growth itself.

### 4. Desire to return — 4/5

Honest answer: yes, I'd keep it running next to VS Code, at least for a few weeks. The hooks that work on me specifically:

- It harvested my actual Claude Code history (425 items) — the memory compounds from day one rather than starting cold.
- The "away 10 days, here's what happened" briefing + overnight automations means the app does work between my sessions; that's a reason to open it each morning that ChatGPT doesn't have.
- The decision-history replay in 07 is something I'd genuinely use after a sprint break.

Why not 5: daily delight erodes fast when the main chat surface renders raw markdown (see complaint #2) and the cockpit suggests I "Resume: Reply with the literal string PHASE_B_OK and nothing else." The value prop is differentiated; the day-to-day polish is below the Cursor/ChatGPT bar I'm used to, so my return habit would survive on utility, not delight.

### 5. Absence of friction — 2/5

I found a lot of concrete rough edges for 14 screenshots — several on the highest-traffic surfaces (greeting modal, home suggestions, chat). The full list is below; the headline items are test-data junk in "Suggested next actions," unrendered markdown in chat, the greeting modal contradicting itself, and the modal squatting over three different screens with backdrop blur.

## Concrete complaints

1. **Home cockpit → "Suggested next actions" surfaces QA junk.** Card 3 reads "Resume: Reply with the literal string PHASE_B_OK and nothing else." and card 4 "Resume: Compare two recent memory frames briefly. List 2 trade-offs." These are raw replays of prior (test) prompts. Filter trivial/test prompts out of the suggestion engine, or summarize intent instead of echoing prompt text.
2. **Workspace chat renders markdown as literal text** (07-workspace-resume): the assistant bubble shows `# Decision Review & Next Steps`, `**Period covered:** April–May 2026`, `## DECISION 1: Q3 Editorial Pivot` with visible `#`/`**` characters. Render markdown in assistant messages — every long answer currently looks broken next to ChatGPT.
3. **The greeting modal contradicts the page behind it.** Modal meta: "active yesterday." Headline behind it: "You've been away 10 days, Marko." Same viewport, two truths. Pick one source for last-activity.
4. **Duplicate + mis-dated memory in "I REMEMBER."** "Session (2026-04-30): What is sovereign AI — 4 messages" appears twice, tagged "yesterday" and "1w ago," for a session dated April 30 (today is June 12). Dedupe entries and fix relative-time computation — this is the trust-critical surface.
5. **The greeting modal persists over other screens.** Screenshots 03 (Memory Center), 04 and 04b (Skills Hub) all show the same "Good evening, Marko" modal with backdrop blur on top of the content — including blurring out the very "agent · review" badge that proves self-evolution. Dismiss the modal on any navigation.
6. **Agent Center empty state is wrong for this user** (05): "No agents yet" — while the Writer agent is active in "Writer demo — Anya" and its last activity was `create_skill`. Either list workspace agents under the All/Workspace tabs or explain what counts as an "agent" here.
7. **Memory → Evolution defaults to an empty bucket** (13): the tab opens on the "proposed" filter showing "No runs in proposed," with no explanation of what an evolution run is. Default to "all," and give the empty state a one-line primer + pointer to the "New Run" button.
8. **Raw internal event name in the workspace panel** (07-top): "LAST ACTIVITY: tool_result: create_skill". Humanize it — "Created a skill (10d ago)" — and link it to the skill in Skills Hub.
9. **Pluralization bug** (07-top right panel): "11 memories · 1 sessions".
10. **Ctrl+K coach-mark overlaps the open palette** (12): the "Type / for 22 powerful commands…" tooltip covers the right edge of the command list (the Command labels) while you're trying to read it. Reposition the tooltip outside the palette bounds.
11. **"Up next" mixes system maintenance into the user's agenda** (02-bottom): "Memory consolidation at Jun 13, 3:00 AM," "Marketplace sync," "Index reconciliation at 4:00 AM." I don't need cron jobs in my morning briefing — collapse them into one "system" row or move them to Automation Center.
12. **Onboarding step 1 PREVIEW box just says "Marko."** (09): the box labeled PREVIEW renders a bare name with a period, which reads as a bug. Show the actual greeting it's previewing ("Good evening, Marko — ready to pick up the Q3 editorial work?").

## Bottom line

The memory pillar is real and demonstrable — onboarding-to-harvest is the best AI-app first-run I've seen, and the decision-history replay would actually change how I work. The self-evolution pillar exists in the plumbing (agent-authored skill + review badge + automations) but its showcase surfaces are empty. And the rough-edge count — test junk in suggestions, unrendered markdown, a self-contradicting greeting — is what separates "promising beta I'd demo to my team" from "tool I'd defend like VS Code." Fix the twelve items above (most are small) and criteria 2, 4, 5 all move up a point.

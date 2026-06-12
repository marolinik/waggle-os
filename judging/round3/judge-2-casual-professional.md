# Judge 2 — Casual Non-Technical Professional (Round 3)

## Persona summary

I'm a marketing manager. I live in Outlook, Slack, and PowerPoint. I use ChatGPT a few times a week when I remember to. I will give a new app exactly one session before I decide whether it's worth my time. I do not know what an API, an MCP, or a "sub-agent" is, and I don't want to learn. I want the app to feel like a sharp assistant who remembers me, not like a developer console.

Evidence reviewed: all 15 screenshots under `judging/screenshots/` (read at full resolution, key regions cropped/zoomed), live app confirmed responding at http://localhost:8080 (200), and the sidebar hover descriptions verified in `apps/web/src/lib/dock-tiers.ts` (they are genuinely plain-language: "Everything Waggle remembers about you and your work", "Teach your agents new abilities").

## Scores

| # | Criterion | Score (1–5) |
|---|---|---|
| 1 | First-session clarity | 4 |
| 2 | "It knows me" feeling | 4 |
| 3 | Visible agent growth | 3 |
| 4 | Desire to return | 3 |
| 5 | Absence of friction | 2 |

## Per-criterion reasoning

### 1. First-session clarity — 4
The onboarding is honestly better than most consumer apps I use. Three steps, plainly labeled ("Step 1 of 3"), with a "Skip setup" escape hatch always visible. "Tell us who you are" (09) speaks my language — role chips like Marketing, "What do you want Waggle to help with?" with options like "Draft documents & content", and a live preview of the greeting I'll get ("Good evening, Marko — your work will be remembered here") that makes the payoff tangible before I've invested anything. The import step (10) gives me per-tool instructions in plain steps ("In ChatGPT: Settings → Data controls → Export data. You'll get an email with the file") — that's exactly the hand-holding I need. The workspace step (11) explains itself in one sentence I understand: "Each workspace is its own brain." The novice six-item sidebar (14) — Home, Chat, Files, Vault, Settings, Spawn Agent — is not intimidating.

Why not 5: even on my simplified sidebar, two of the six items are jargon. "Spawn Agent" — spawn? That's a word from video games or programming, not from my world ("New assistant" or "New agent" would do). "Vault" is guessable but cold. And the very first screen (08) calls itself "YOUR AI OPERATING SYSTEM" / "Welcome to the Hive" — two metaphors stacked before I know what the app does. The subtitle ("Remembers everything. Improves itself.") saves it.

### 2. "It knows me" feeling — 4
This is the app's best moment. The welcome-back modal (01) — "Good evening, Marko" / "23 memories · 271 people, projects & things it knows" / "2 awaiting your OK" — followed by "I REMEMBER" cards that quote my actual working style back to me ("I always work with a draft → critique → rewrite loop — the critique pass is the most important...") gave me a genuine small jolt. The Home screen (02/14) doubles down: "You've been away 10 days, Marko. Here's what happened" with per-workspace summaries and a Continue button. The restored workspace (07) shows my pinned editorial instruction still sitting at the top of the chat. This is the promise, delivered.

Why not 5 — two cracks in the spell:
- The greeting modal (01) lists my workspace as "Writer demo — **Anua**" while the Home cockpit card (02/14) and the workspace header (07) call it "Writer demo — **Anya**". I zoomed in; it's unambiguous. An app whose whole pitch is "I remember everything about you" cannot misspell the name of my workspace in the very greeting that's supposed to prove it remembers. Trust in memory is binary for me.
- The third "I REMEMBER" card reads "Session (2026-04-30): What is sovereign AI — 4 messages". That's a database row, not a memory. A person who remembered me would say "We talked about sovereign AI back in April."

### 3. Visible agent growth — 3
The pieces exist, but as a casual user I would not actually *see* growth in this session:
- The Memory → Evolution tab (13) — the screen literally dedicated to "self-evolving" — is an empty state: "Your agent improves itself here. When Waggle finds a better way... it proposes an upgrade." That's a promise, not evidence. Nothing proposed, nothing accepted, nothing deployed. The whole superpower is a placeholder card.
- The agent-authored skill (04b, "presentation-design") is marked with a tiny amber "agent · review" pill on the far right of a dense ~20-row list. I had to zoom into the screenshot to find it. I would never notice it in real use, and if I did, "agent · review" means nothing to me. "Created by your agent — needs your OK" would.
- What *does* work: Agent Center (05) shows a real agent, "Editorial Critic", with my real instruction as its description and "ran 14m ago" — concrete. And the Home "Up next" line "I'll suggest a new skill for you at Jun 17, 10:00 AM" at least dates the promise.
Net: growth is asserted in three places and demonstrated in roughly half of one.

### 4. Desire to return — 3
The return loop is genuinely well-designed on paper: the away-digest ("You've been away 10 days... Here's what happened"), overnight stats (30 memories consolidated, 5 automations completed), Automation Center (06) showing 12 active schedules at 100% success including a "Morning briefing", and Quick capture ("Jot a note to remember...") right on Home. That's a real reason to open it tomorrow morning — I want that briefing.

But the single workspace I'd actually return TO (07) greets me with a failed conversation (see criterion 5). The desire to return is built by the Home screen and destroyed by the work screen. Also, "2 awaiting your OK" / "1 pending" appears in three places, and nothing on the Home surface tells me what those are or where to click to deal with them — unresolved nags age badly.

### 5. Absence of friction — 2
One screenshot decides this score. In 07-workspace-resume — the flagship "pick up where you left off" moment — the agent's most recent reply in my chat is, verbatim:

> `[spawn failed] LLM error (404): {"error":{"message":"Anthropic API error: {\"type\":\"error\",\"error\": {\"type\":\"not_found_error\",\"message\":\"model: auto\"},\"request_id\":\"req_011CbyyFYCacsK8rNTTEok1\"}"}}`

A raw JSON error blob, rendered as a normal chat bubble, with thumbs-up/thumbs-down buttons under it as if I might want to rate it. As a non-technical person, this reads as "the app is broken" — full stop. There is no plain-language explanation, no Retry button, no "we'll fix this" — nothing. This is precisely the moment a one-session-patience user closes the app and doesn't come back. Everything else is comparatively smooth (onboarding is friction-free, simple dock is calm, hover descriptions are good), but the core loop — talk to your agent — fails in the ugliest possible way in the evidence.

Secondary friction: Memory Center (03) shows a single memory card floating in a vast empty honeycomb, right after the greeting told me it holds "23 memories · 271 people, projects & things". Where are they? Filter defaults are hiding them or the count is inflated — either way it feels empty and contradicts the headline number. And the command palette (12) suggests "/spawn — Spawn a specialist sub-agent" to me, which is developer-speak.

## Numbered complaints (concrete, actionable)

1. **Raw API error shown as a chat reply** — 07-workspace-resume.png, main chat: `[spawn failed] LLM error (404): {"error":{"message":"Anthropic API error: ... model: auto ..."}}` rendered as a normal agent bubble with feedback buttons. Replace with a human message ("I couldn't reach my AI model just now — tap to retry") + Retry action; never show raw JSON to end users.
2. **Workspace name inconsistency: "Anya" vs "Anua"** — Greeting modal (01-home-welcome-back.png) lists "Writer demo — Anua"; Home cockpit card (02/14) and workspace header (07) say "Writer demo — Anya". A memory product misspelling my workspace name in its "I remember you" greeting breaks the spell. Dedupe/fix the source data and render from one canonical name.
3. **Memory Center contradicts the memory count** — 03-memory-center.png shows exactly one memory card ("Session (2026-04-30)...") on an empty honeycomb while the greeting claims "23 memories · 271 people, projects & things it knows". Default the view to show everything (or show "22 more in other workspaces/filters" affordance) so the flagship Memory screen never looks empty.
4. **Evolution tab is an empty promise** — 13-memory-evolution.png: "Your agent improves itself here" with zero proposals across all filter chips (proposed/accepted/deployed/rejected/failed). The self-evolving superpower has no visible evidence. Seed it from real activity (e.g., surface the pending "presentation-design" agent skill here as a proposal card) so the first visit shows at least one concrete "I found a better way" item.
5. **Agent-authored skill badge is invisible and cryptic** — 04b-skills-agent-badge.png: "agent · review" is a small amber pill at the right edge of a dense list row. Rename to plain language ("Created by your agent — needs your OK"), and surface it on Home ("Your agent built a new skill while you were away — review it"), since this is the proudest moment the product has.
6. **Dev jargon on the novice surface** — "Spawn Agent" is one of only six items in my simplified sidebar (14-novice-simple-dock.png), and the command palette (12-command-center.png) suggests "/spawn — Spawn a specialist sub-agent". For this persona, say "New agent" / "Get help from a specialist". Also reconsider "Vault" → "Passwords & keys".
7. **"Awaiting your OK" badges with no path to act** — "2 awaiting your OK" (01) and "1 pending" (02/14 workspace cards) appear repeatedly, but no visible element on Home explains what is pending or links to resolve it. Make the badge itself a button that opens the approval queue.
8. **"Session (2026-04-30): What is sovereign AI — 4 messages" presented as a memory** — 01-home-welcome-back.png "I REMEMBER" card 3 reads like a database row. Rewrite session-derived memories in natural language ("In late April we explored what sovereign AI means").

## Verdict in one sentence

The memory greeting and the away-digest genuinely delivered the "it knows me" jolt — and then the one workspace I resumed answered me with a raw JSON error, which for someone like me is the difference between "magical assistant" and "broken software."

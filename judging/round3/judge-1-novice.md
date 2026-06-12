# Round 3 — Judge 1: The Complete Novice

## Persona

I have never used anything like this. My phone is for messages, my laptop is for email and the
web. I do not know what an "agent," an "MCP," a "workspace," or an "API key" is. I judged only
what I could see and feel, and I judged my first-session path against the novice surface
(the six-item sidebar in `14-novice-simple-dock.png`), treating the ~20-item sidebar screens as
the place I might grow into. I verified the claimed plain-language hover descriptions exist in
`apps/web/src/lib/dock-tiers.ts` (they do, and they are genuinely plain).

## Scores

| # | Criterion | Score (1–5) |
|---|---|---|
| 1 | First-session clarity | **4** |
| 2 | "It knows me" feeling | **4** |
| 3 | Visible agent growth | **2** |
| 4 | Desire to return | **4** |
| 5 | Absence of friction | **2** |

## Per-criterion reasoning

### 1. First-session clarity — 4

The onboarding is honestly good for someone like me. Three steps, a progress bar, "Skip setup"
always visible, and the privacy line ("Your memory and data stay on your device") in words I
understand. Step 1 asks things I can answer (name, what kind of work, "What do you want Waggle
to help with?") and the live preview — "Good evening, Marko — your work will be remembered
here" — instantly shows me what my answers buy me. Step 2's per-provider how-tos ("In ChatGPT:
Settings → Data controls → Export data") are exactly the hand-holding I need, and the
auto-detected "Claude Code detected — Found 425 items / Import my history" button is one-click
magic for people who have it. The six-item sidebar is calm and mostly self-explanatory.

Why not 5: vocabulary leaks through at the worst moments. "Welcome to the Hive" and "YOUR AI
OPERATING SYSTEM" tell me nothing (the small subtitle does all the work). Step 3 explains
workspaces as "its own brain — memory, files, and agents stay isolated" — that's the first time
the word "agents" appears, undefined, plus "isolated," a word I'd never use. And two of my six
sidebar items are technical: "Vault" and "Spawn Agent" (complaints #2, #3 below).

### 2. "It knows me" feeling — 4

This is the app's strongest muscle. The returning-user panel (`01-home-welcome-back.png`)
greets me by name, tells me "23 memories · 271 people, projects & things it knows · 2 awaiting
your OK," and then — the genuinely visceral part — quotes my own working style back at me under
"I REMEMBER": "I always work with a draft → critique → rewrite loop. The critique pass is the
most important…" That is *me*, in my words. The Home header "You've been away 10 days, Marko.
Here's what happened" plus "YOU WERE WORKING ON" cards with Continue buttons make the
left-off-here promise concrete, and "Up next: I'll check in on quiet projects at Jun 15" makes
it feel like it will keep knowing me.

Why not 5: the showcase list undercuts itself. The third "I REMEMBER" item is "Session
(2026-04-30): What is sovereign AI — 4 messages" — a machine log label with a raw date sitting
beside two beautifully human memories (complaint #7). And the numbers don't reconcile if I get
curious: 23 memories in the header, "11 memories across 16 sessions" on the workspace card, and
a Memory screen showing a single memory card (complaint #6). It feels slightly inflated.

### 3. Visible agent growth — 2

The promise is "it learns my workflows and upgrades its own skills." What I can actually *see*
is almost nothing — and on my novice sidebar, literally nothing. The Skills Hub, Agent Center,
and Evolution screens are not in my six-item tier, so my only growth signals are a future-tense
promise ("I'll suggest a new skill for you at Jun 17") and "5 automations completed" overnight —
which, on inspection, are mostly internal plumbing like "Index reconciliation" (complaint #10).
On the power surfaces the story isn't better: the Evolution screen — the showcase for
"improves itself" — is empty ("Select a run to review") and explains itself with "baseline vs
winner, which gates fired" (complaint #4). The one skill the assistant actually built itself is
marked only by a tiny "agent · review" badge that I would never decode as "I built this for you"
(complaint #5). The left-panel copy "Your agent improves itself here… nothing changes without
you" is lovely and reassuring — but it's a caption on an empty room. I *read about* growth;
I never *saw* it.

### 4. Desire to return — 4

The return loop is well designed. "You've been away 10 days… here's what happened" reframes my
absence as accumulated value. The Overnight panel (10 memories consolidated, 5 automations
completed) says work happened while I slept. "Up next" gives me two concrete dated reasons to
come back (Jun 15 check-in, Jun 17 new-skill suggestion). Quick capture ("Jot a note to
remember…") invites me to deposit things, which is how habits form. I genuinely wanted to click
"Continue" on the Writer demo card.

Why not 5: the impressive-stats panel shows "0 Artifacts created" — a deflating zero in
jargon I don't know ("artifacts"? "consolidated"?) right where the app is trying to brag
(complaint #11). And one of my two "you were working on" cards is "Default Workspace — 57d ago,"
which feels stale rather than alive.

### 5. Absence of friction — 2

Onboarding and Home are smooth — skippable steps, sensible defaults, one-click import. But the
single worst moment in the entire evidence set sits exactly where the magic is promised: the
"resuming work" screen (`07-workspace-resume.png`). My message asks the assistant to run the
critique pass, and its reply is, verbatim, a raw error dump in the chat bubble:

> `[spawn failed] LLM error (404): {"error":{"message":"Anthropic API error: {"type":"error","error": {"type":"not_found_error","message":"model: auto"},"request_id":"req_011CbyyFYCakcsK8rNTTEok1"}}`

"Spawn failed." A wall of braces. No "try again" button, no plain-language explanation, no
recovery path I can see. As a novice this reads as "the app is broken and it's probably my
fault," at the precise moment I was promised "pick up where you left off." Chat is core to my
novice tier, so this is my path, not the power user's (complaint #1). Add the developer
concepts pushed into my six-item world ("Vault — your API keys and secrets," "Spawn Agent") and
friction earns a 2 despite the otherwise polished flow.

## Numbered complaints (concrete, actionable)

1. **Raw JSON error as the assistant's chat reply** (`07-workspace-resume.png`, Chat pane). The
   agent answers with `[spawn failed] LLM error (404): {"error":…"not_found_error"…"model: auto"…}`.
   Replace with a human card ("I couldn't connect just now — tap to retry"), put the raw error
   behind a "Show details" disclosure, and never show `request_id` JSON in a chat bubble.
2. **"Spawn Agent" in the novice sidebar** (`14-novice-simple-dock.png`, bottom of sidebar).
   Both words are jargon to a first-timer. Rename for the simple tier (e.g., "New assistant").
3. **"Vault" occupies one of six novice slots** (`14-novice-simple-dock.png`; tooltip per
   `dock-tiers.ts`: "Your API keys and secrets, stored locally"). A novice has no API keys.
   Worse: the simple dock has **no Memory entry** (confirmed in `dock-tiers.ts` lines 122–127),
   so the tier built for novices hides the app's #1 superpower. Swap Vault for Memory.
4. **Evolution screen is an empty room with engineer copy** (`13-memory-evolution.png`).
   "Select a run to review… baseline vs winner, which gates fired." Seed one example run or hide
   the tab until a proposal exists; rewrite "gates fired" in plain words.
5. **Self-built skill is invisible as an achievement** (`04b-skills-agent-badge.png`,
   presentation-design row). The only marker is a small "agent · review" badge. Add an explicit
   callout: "Waggle built this skill from your workflow — review and approve it."
6. **Memory counts don't reconcile** (`01-home-welcome-back.png` "23 memories · 271 people…"
   vs workspace card "11 memories across 16 sessions" vs one visible card in
   `03-memory-center.png`). Make the headline number match what clicking through reveals.
7. **Machine log entry in the "I REMEMBER" showcase** (`01-home-welcome-back.png`, third item:
   "Session (2026-04-30): What is sovereign AI — 4 messages"). Filter session-log labels out of
   the human-memory list, or rephrase them ("We talked about sovereign AI in April").
8. **"Welcome to the Hive" / "YOUR AI OPERATING SYSTEM"** (`08-onboarding-welcome.png`) — the
   headline says nothing to a novice; the subtitle ("Remembers everything. Improves itself.")
   carries all the meaning. Lead with the plain-language promise.
9. **First mention of "agents" is undefined** (`11-onboarding-workspace.png`: "memory, files,
   and agents stay isolated… Your agent learns each workspace's patterns"). One sentence earlier
   in the flow should introduce what an agent is ("your AI helper").
10. **Overnight/automation brag is mostly plumbing** (`06-automation-center.png` /
    Home Overnight panel): "Memory consolidation," "Marketplace sync," "Index reconciliation"
    counted in "5 automations completed." Count only user-meaningful automations on Home, or
    label the rest "housekeeping."
11. **Stat panel jargon + deflating zero** (`02-home-cockpit.png` / `14-novice-simple-dock.png`
    Overnight panel): "Memories consolidated," "0 Artifacts created." Use plain words
    ("things it learned," "documents made for you") and hide zero-count stats.

## Verdict in one line

The memory promise lands — I felt greeted, remembered, and given reasons to come back — but the
self-evolving promise is a caption on an empty room, and one raw JSON error at the
resume-your-work moment would send a real novice straight back to their email tab.

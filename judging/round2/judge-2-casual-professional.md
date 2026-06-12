# Judge 2 — Casual Non-Technical Professional (Round 2)

## Persona

Marketing manager. I use ChatGPT a few times a week when I remember to. My real life is
Outlook, Slack, and PowerPoint. I did not read any documentation. I gave this app one
evening to prove it's worth a second evening. Evidence reviewed: 13 full-resolution
screenshots (onboarding flow, returning-user home, workspace resume, Memory Center,
Skills Hub, Agent Center, Automation Center, command palette, Evolution tab), plus a
liveness check against http://localhost:8080.

## Scores

| # | Criterion | Score (1–5) |
|---|-----------|-------------|
| 1 | First-session clarity | **4** |
| 2 | "It knows me" feeling | **4** |
| 3 | Visible agent growth | **2** |
| 4 | Desire to return | **4** |
| 5 | Absence of friction | **3** |
| | **Total** | **17 / 25** |

## Per-criterion reasoning

### 1. First-session clarity — 4

The good news first: this onboarding is the best part of the product, and it's written in
my language. Step 1 ("Tell us who you are", `09-onboarding-who-are-you.png`) asks things
I can actually answer — chips like "Marketing", "Draft documents & content", "Remember
everything I work on" — and the live preview line ("Good evening, Marko — your work will
be remembered here") told me what the product *is* before I ever saw the product. Three
steps, a visible "Skip setup" escape hatch, and a privacy promise in plain words ("Your
memory and data stay on your device"). After setup, the Home screen
(`02-home-cockpit.png`) tells me literally what to do: three "Continue" buttons, one
"Suggested next action", a quick-capture box. Five minutes in, I knew the pitch: it
remembers my work and picks up where I left off.

Why not 5: the very first words I read are "YOUR AI OPERATING SYSTEM / Welcome to the
Hive / Persistent memory. Workspace-native." (`08-onboarding-welcome.png`). "Operating
system," "Hive," and "workspace-native" are insider words — I briefly wondered if this
replaces something on my computer. And the moment I land in the app, the left sidebar
presents ~20 destinations (Agent Center, Skills Hub, Automation Center, Room, Connector
Hub, MCP Hub, Marketplace, Vault, Mission Control, Events & Logs…). I will never click
"MCP Hub." I don't know what an MCP is and I'm not going to find out.

### 2. "It knows me" feeling — 4

This is the product's strongest muscle and it flexes it everywhere. "Good evening, Marko
— 17 memories · 214 people, projects & things it knows across 3 workspaces"
(`01-home-welcome-back.png`) with an "I REMEMBER" list that includes an actual *working
preference* ("I always work with a draft → critique → rewrite loop. The critique pass is
the most important"). The home screen says "You've been away 10 days, Marko. Here's
what happened" and each workspace card carries a one-line memory of what I was doing
("Q3 editorial direction; lean into skepticism, less hype"). The resume screen
(`07-workspace-resume.png`) reconstructs a decision log with dates, rationale, and
stakeholders without me asking. That's the promise, delivered visibly. I felt it.

Why not 5 — a concrete one: I opened Memory Center (`03-memory-center.png`) to see "what
it remembers about me," and the first two cards are **"Monthly Agent Assessment —
2026-05 / 2026-04"** full of raw, unrendered markdown: `## *Interactions*: 0
**Correction Rate**: 0.0% *Improvement Trend*: 0%`. Robot diary entries — about the
agent, not about me, showing zeros, with literal `##` and `*` characters on screen — rank
*above* the genuinely charming "User's name is Marko Markovic, age 51… favorite color is
blue, supports Crvena Zvezda" card. The first shelf of my "memories" is machine
self-bookkeeping that looks broken. That one screen took the magic down a notch.

### 3. Visible agent growth — 2

The copy promises it; the screens don't show it. The Evolution tab
(`13-memory-evolution.png`) has lovely plain-language framing ("Your agent improves
itself here… You review each proposal and accept or reject it — nothing changes without
you") — and then it's an **empty state**. No runs, nothing proposed, nothing accepted,
and the call to action is a "+ New Run" button, which sounds like *I* am supposed to
operate the self-improvement machinery. The one real artifact is the "agent · review"
badge on the `presentation-design` skill (`04b-skills-agent-badge.png`) — which, if I
squint, means "the AI wrote itself a PowerPoint skill" (genuinely exciting for me!). But
the badge says only "agent · review" with no story, no "Waggle built this for you from
your deck work — take a look." I'd scroll past it. My one agent, Editorial Critic
(`05-agent-center.png`), shows "run never" and "avg success —". The overnight stats ("9
memories consolidated, 5 automations completed") read as system maintenance, not as "it
got better at MY job." Verdict: growth is asserted, not demonstrated. I could not tell
it's learning *for me specifically*.

### 4. Desire to return — 4

Honestly? Yes, I'd open it tomorrow — to see if the morning briefing trick works twice.
The return loop is well designed: it works overnight (Automation Center shows a 3:05 AM
morning briefing run that succeeded, `06-automation-center.png`), it greets me with what
changed, and "Continue" means I never pay the restart tax that makes me abandon ChatGPT
threads. The Editorial Critic concept — an agent that critiques every draft against my
agreed editorial direction — is exactly the kind of thing my job needs. "Up next:
Capability suggestion at Jun 17" even teases a reason to come back on a specific day.

Why not 5: my actual work lives in email, Slack, and PowerPoint, and nothing on the Home
screen connects to any of them. The habit only forms if I move my work *into* Waggle,
and after one session I haven't been given a reason to do that migration. The pull is
real but it's pulling against gravity.

### 5. Absence of friction — 3

Nothing made me want to slam the laptop shut, but several things made me sigh:

- The memory-import step (`10-onboarding-memory-import.png`) auto-detected **Claude Code**
  (425 items) — a developer tool I've never opened. For *my* AI history (ChatGPT), the
  instruction is: "Settings → Data controls → Export data. You'll get an email with the
  file." Leave the app, do an export, wait for an email, download a JSON, come back,
  upload. That is homework, on step 2 of 3, during the first run. It's skippable
  (good), but the headline feature of onboarding only auto-works for developers.
- Raw markdown leaks everywhere a description appears: every row in Skills Hub
  (`04-skills-hub.png`) shows fragments like "## What to do 1. *Identify the decision* —
  Clarif…". It reads as unfinished software.
- The Win+K palette (`12-command-center.png`) is slash-commands — `/catchup`, `/spawn`,
  `/decide` — every row labeled "Command". The placeholder asks "What do you want to
  do?" in my language and then answers exclusively in developer.
- Jargon tax: Hive, Harvest, Weaver, Frames, Vault, MCP Hub, "memory compaction",
  "Memory lane extraction at 4:00 AM". I understand none of these and the UI doesn't
  explain them.

None of this is fatal — the core paths (onboard, resume, chat) are smooth — hence a 3,
not lower.

## Numbered complaints (concrete & actionable)

1. **Onboarding step 2, ChatGPT card** (`10-onboarding-memory-import.png`): the only
   path for a ChatGPT user is a manual export-and-wait-for-email errand outside the app.
   Auto-detection worked only for Claude Code. Either make ChatGPT import painless or
   move this ask to after first value, not step 2 of 3.
2. **Memory Center "About you" ordering + rendering** (`03-memory-center.png`): two
   "Monthly Agent Assessment" cards with raw `## *Interactions*: 0 … *Correction Rate*:
   0.0%` markdown rank above the actual about-me card. Render markdown and demote agent
   self-assessments out of the default human-facing view.
3. **Skills Hub descriptions are raw skill-body fragments** (`04-skills-hub.png`): every
   row shows "## What to do 1. *…*" with literal markdown symbols. Each skill needs a
   one-line human description.
4. **"agent · review" badge is unexplained** (`04b-skills-agent-badge.png`): the single
   on-screen proof of self-evolution has no plain-language story or tooltip. Say "Waggle
   created this skill for you — review it" or the moment is lost on a novice.
5. **Evolution tab is an empty state with a dev-flavored CTA** (`13-memory-evolution.png`):
   "Your agent improves itself here" followed by no runs and a "+ New Run" button puts
   the burden of self-improvement on me. Seed it with a first proposal or hide it until
   one exists.
6. **Editorial Critic has never run** (`05-agent-center.png`): "run never", "avg success
   —", "0 running". My one agent is inert on the screen meant to showcase agents.
7. **Slash-command-only palette** (`12-command-center.png`): `/catchup`, `/spawn`,
   `/skills`, all labeled "Command" — a developer idiom presented to someone who asked
   "What do you want to do?" Plain-verb entries ("Catch me up", "Start a draft") should
   lead.
8. **Sidebar overload + jargon naming** (`02-home-cockpit.png` left rail): ~20
   destinations including MCP Hub, Vault, Weaver, Mission Control on first arrival.
   A casual professional needs 5; tuck the rest behind "More" or a pro mode.

## Bottom line

The memory half of the promise is real and I felt it — the greeting, the
"away 10 days" recap, and the restored decision log are the best "it remembers me"
experience I've seen in an AI tool, and the onboarding that sets it up is genuinely
novice-friendly. The self-evolving half is currently a narrated promise: empty Evolution
screen, an unexplained badge, an agent that has never run. And the finish (raw markdown
in user-facing text, robot bookkeeping atop my memories, slash-command palette) keeps
whispering "built by developers, for developers" at exactly the moments the product is
trying to convince me otherwise.

**Scores: 4 / 4 / 2 / 4 / 3 — total 17/25. 8 complaints.**

# Judge 2 — The Casual Non-Technical Professional

## Persona

I'm a marketing manager. I live in email, Slack, and PowerPoint. I use ChatGPT a couple of times a week when I need a draft or an idea. I do not export JSON files, I do not know what an "entity" is, and I have exactly one session of patience for a new tool. If it makes me feel smart and saves me time in the first ten minutes, I'll come back. If it makes me feel like I wandered into an engineering tool, I'm out.

Evidence reviewed: all 13 screenshots in `judging/screenshots/` (zoomed into full-resolution crops of the Home cockpit, welcome modal, workspace resume chat, Skills Hub, Agent Center, Automation Center, Evolution screen, and command palette).

## Scores

| # | Criterion | Score (1–5) |
|---|-----------|:-----------:|
| 1 | First-session clarity | **4** |
| 2 | "It knows me" feeling | **4** |
| 3 | Visible agent growth | **2** |
| 4 | Desire to return | **4** |
| 5 | Absence of friction | **3** |
| | **Total** | **17 / 25** |

## Per-criterion reasoning

### 1. First-session clarity — 4

The onboarding is honestly the best part. Three steps, plain language, and it respects my time: "Welcome to the Hive — Persistent memory. Workspace-native." with a single Continue button and a privacy line I actually appreciated ("Your memory and data stay on your device"). Step 1 asks things I can answer (my name, what kind of work I do, what I want help with — "Draft documents & content", yes please). Step 2 *auto-detected* 425 items of existing AI history with a one-click "Harvest" button — that's the closest thing to magic in the whole flow. Step 3 is one choice and one text field. There's a "Skip setup" escape hatch on every screen. I knew what this app was for before I finished setup.

Why not 5: once I'm inside, the left dock has fifteen-plus entries — Agent Center, Skills Hub, Automation Center, MCP Hub, Vault, Weaver, WaggleDance — and the command palette advertises "22 powerful commands." Five minutes in, I know what the *chat* does for me; I could not tell you what half the dock does, and nothing invites me to find out gently. Also the "PREVIEW" box on onboarding step 1 just displays "Marko." — a preview of nothing.

### 2. "It knows me" feeling — 4

This is where the app shows off, and a lot of it lands. "Good evening, Marko." The Home screen says "You've been away 10 days, Marko. Here's what happened" — no other tool I use says that. The "I REMEMBER" panel quotes back an actual preference of mine: "I always work with a draft → critique → rewrite loop. The critique pass is the most important." That one line is the whole pitch — it learned *how I work*, not just what I said. And the Writer demo resume (screenshot 07) is genuinely my job: it reconstructed "DECISION 1: Q3 Editorial Pivot — 'Skepticism Over Hype'" with who approved it and when. If it does that with my real campaigns, I'm sold.

Why not 5 — because the memory feature contradicts itself in the very panel that's supposed to prove it: the same item ("Session (2026-04-30): What is sovereign AI — 4 messages") appears **twice**, labeled "yesterday" and "1w ago." The modal header says "active yesterday" while the Home screen behind it says I've been away **10 days**. And a session dated April 30 labeled "yesterday" on June 12? When the remembering machine gets the remembering visibly wrong, I start doubting everything else it tells me.

### 3. Visible agent growth — 2

I was told the assistant learns my workflows and upgrades its own skills. From what I can see, that story has no stage. The Evolution screen (13) — the screen literally named for this — says "No runs in proposed" and "Select a run to review," with jargon about "baseline vs winner" and accepting/rejecting "the proposal." Empty and incomprehensible. The Agent Center (05) says "No agents yet — create one to put it to work," which for a returning 10-day user reads as "nothing has been working for you." The one real artifact — a skill the agent authored itself with an "agent · review" badge (04b) — is a tiny tag buried in a long list (and in my evidence it's half-hidden behind the welcome modal). The overnight panel's "8 Memories consolidated / 5 Automations completed" is a hint of growth, but "0 Artifacts created" next to it undercuts it. As a casual user, I cannot point at anything and say "look, it got better at helping *me*." The capability may exist; the *feeling* does not.

### 4. Desire to return — 4

The return loop is well designed. "You've been away 10 days, here's what happened," three resume cards with one-click "Continue," overnight stats, an "Up next" schedule, and a "/catchup — get up to speed instantly" command suggested first in the palette. The Writer demo resume proved the payoff: I came back and my decisions, rationale, and next steps were waiting. That's a real reason to open it tomorrow — my work compounds here instead of evaporating like it does in ChatGPT.

Why not 5: the rough edges make it feel like a beta I should check back on "later" rather than a tool I trust daily. The suggested actions include obvious machine debris (see complaint 4), the chat shows raw markdown, and the Agent/Evolution screens are empty — so the "it worked for you overnight" story is told by counters, not by anything I can actually see or use.

### 5. Absence of friction — 3

Nothing hard-blocked me, and the onboarding is genuinely low-friction (auto-detect, skip everywhere, no account wall in evidence). But three things came close to a window-close:

- The "Good evening, Marko" modal is sitting on top of the **Memory Center** (03) and the **Skills Hub** (04, 04b) in my evidence — three different screens, same popup blocking the content I navigated to. A greeting that follows me around stops being a greeting.
- The Home screen's "Suggested next actions" served me "Resume: Reply with the literal string PHASE_B_OK and nothing else." That is test garbage wearing a suggestion's clothes, and it instantly made the whole panel feel auto-generated and unsafe to trust.
- The app keeps speaking engineer at me: "15 memories · 214 entities · 6 relations," "tool_result: create_skill," "claude-sonnet-4-6," a mode called "YOLO." I don't know what any of that means, and it signals this tool wasn't built for someone like me.

None of these stopped me from working, hence 3 and not lower — but each one is a paper cut, and paper cuts are why casual users don't come back.

## Concrete complaints

1. **Welcome modal stalks every screen.** The same "Good evening, Marko" panel overlays the Memory Center (03-memory-center.png) and Skills Hub (04, 04b) — not just Home. Show it once per session, on Home only; "Don't show again" shouldn't be the only defense.
2. **Duplicate memory item in "I REMEMBER".** The welcome modal lists "Session (2026-04-30): What is sovereign AI — 4 messages" twice — once tagged "yesterday," once "1w ago." Dedupe the panel.
3. **The app disagrees with itself about when I was last here.** Modal header: "active yesterday." Home screen behind it: "You've been away 10 days, Marko." And an April 30 session labeled "yesterday" on June 12. One source of truth, please — this is the feature I'm supposed to trust most.
4. **"Suggested next actions" regurgitates raw old prompts.** On the Home cockpit: "Resume: Reply with the literal string PHASE_B_OK and nothing else." and "Resume: I need you to read and analyze files at D:\Projects\PM-Waggle-OS on my local…" Summarize these into human task descriptions ("Continue the file analysis in PM-Waggle-OS") and filter out one-off/test-looking prompts.
5. **Chat shows raw Markdown.** In Writer demo — Anya (07), the assistant's reply renders literal `**Period covered:**`, `## DECISION 1`, and `###` headers as plain text with asterisks. Render it.
6. **Engineer jargon on user-facing surfaces.** "214 entities · 6 relations" (welcome modal), "LAST ACTIVITY: tool_result: create_skill" (workspace sidebar, 07), "claude-sonnet-4-6" and a "YOLO" mode in the chat header. Translate or hide: "things it knows about," "Created a skill," a friendly model label, and a mode name that doesn't sound like a dare.
7. **The self-evolving story has no visible proof.** Evolution screen (13): "No runs in proposed." Agent Center (05): "No agents yet" — for a returning user with 13 automations and 425 harvested items. The single "agent · review" skill badge (04b) is the only evidence and it's a small tag in a long list. Give growth a front-row surface: a "What I learned this week" card on Home, or surface the agent-authored skill there.
8. **Empty workspace card filled with marketing copy.** The "New Hive" card in the welcome modal says "Everything you discuss in New Hive stays in context — decisions, research, and progress are remembered across sessions" — that's brochure text where my data should be. Say "Nothing here yet — start a chat" instead.
9. **Onboarding step 1 "PREVIEW" box is dead weight.** It displays just "Marko." — either preview the actual greeting ("Good evening, Marko — ready to draft?") or remove the box.

## Bottom line

The memory promise is real and I felt it — greeted by name, my 10-day absence acknowledged, my own writing process quoted back to me, and a content-strategy decision log that's exactly what my job needs. But the memory surface contradicts itself twice in its own showcase modal, the "self-evolving" superpower is effectively invisible (two empty screens and one buried badge), and the app keeps leaking developer plumbing into my view. One solid session of polish on the welcome modal, the suggestions feed, and the jargon would move this from "interesting beta" to "tool I tell my team about."

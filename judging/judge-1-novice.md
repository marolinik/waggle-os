# Judge 1 — The Complete Novice

## Persona

I've never used anything like this before. I message friends on my phone and use my laptop for email and the web. I don't know what an "agent" is, or "MCP", or a "workspace", or an "API". I clicked through the screens like a normal person would, and I judged only what I could see and how it made me feel.

## Scores

| # | Criterion | Score (1–5) |
|---|-----------|-------------|
| 1 | First-session clarity | **4** |
| 2 | "It knows me" feeling | **4** |
| 3 | Visible agent growth | **2** |
| 4 | Desire to return | **3** |
| 5 | Absence of friction | **2** |

## Per-Criterion Reasons

### 1. First-session clarity — 4

The setup walk-through is honestly lovely. "Welcome to the Hive" has one big Continue button, and the line underneath — "Your memory and data stay on your device. Nothing leaves without your say-so" — made me feel safe before I even knew what the app does. Step 1 ("Tell us who you are") asks things I can actually answer: my name, what kind of work I do, what I want help with — all buttons, no typing required. Step 3 explains a "workspace" in words I get: "Each workspace is its own brain." Three steps, a Skip on every screen, and a progress bar. I knew what to do at every moment of setup.

It loses a point for what happens around the edges. Step 2 ("Where do you use AI today?") asks me for things like "OpenAI export (.json)" — I have no idea what a .json export is or where I'd get one, and there's no "how do I get this file?" help next to the Choose file buttons. (The "Claude Code detected — Found 425 items" banner is magic if it applies to you; it wouldn't apply to me.) And the first time I land in the real app, the left edge hits me with twenty-two menu items, most of which I can't decode (see criterion 5). The guided path is a 5; the room it drops me into is a 3.

### 2. "It knows me" feeling — 4

This is the app's best trick, and it mostly lands. "Good evening, Marko." "You've been away 10 days, Marko. Here's what happened." There's a section literally called "I REMEMBER" that quotes something true about how I work: "I always work with a draft → critique → rewrite loop. The critique pass is the most important..." That gave me a genuine little jolt — it does know me. Each workspace card shows when I last touched it and has a Continue button, and inside the Writer workspace the assistant recaps months of my project ("I now have the full picture from workspace memory...") in a way no app I've used has ever done.

But the memory display contradicts itself in ways even I noticed, and that made me trust it less:
- The big headline says "You've been away 10 days" while the popup right on top of it says "active yesterday." Which is it?
- The first "I REMEMBER" item is titled "Session (2026-04-30)" but labeled "yesterday" — April 30th is not yesterday.
- The exact same memory — "Session (2026-04-30): What is sovereign AI — 4 messages" — appears twice in the list, once as "yesterday" and once as "1w ago." If it remembers me, why does it stutter?

When the whole pitch is "I remember you," visible glitches in the remembering feel like catching someone in a small lie.

### 3. Visible agent growth — 2

I'm told this assistant learns and gets better at helping me. I could not see that anywhere I'd actually look.

- The "Evolution" tab (under Memory) — which I guess is the "it improves itself" screen — is empty: "No runs in proposed." Filters say proposed / accepted / deployed / rejected / failed, words that mean nothing to me, around a blank page.
- The Agent Center says "No agents yet — create one to put it to work." But the Home screen just told me things ran overnight and a "Writer demo — Anya" exists. So is something working for me or not? The two screens disagree.
- The one real piece of evidence — a skill the assistant built by itself, marked with a small amber "agent · review" pill in the Skills Hub — is a tiny badge in a long list of identical rows (and in my screenshots it's hidden behind the welcome popup). Even if I spotted it, "agent · review" doesn't tell me "I built this for you myself" — I'd guess it means I'm being asked to review something.
- "8 memories consolidated" overnight is the closest thing to "I'm getting smarter," but "consolidated" is filing-cabinet talk, not growth I can feel.

Nothing anywhere says, in plain words, "Since last week I learned X and I'm now better at Y." That's the promise, and I can't see it.

### 4. Desire to return — 3

The skeleton of a reason to come back is genuinely here: I left things half-done and the app shows them to me with Continue buttons; the "Here's what happened" digest implies the app works while I sleep; "Up next" promises overnight activity. Open loops pull people back — that's real.

But look at what tomorrow actually promises me: "Memory consolidation at Jun 13, 3:00 AM," "Marketplace sync," "Index reconciliation at Jun 14, 4:00 AM." That's the janitor's schedule, not a gift. Nothing says "your draft will be ready in the morning" or "I'll have those three articles summarized by 9am." And the "Suggested next actions" list — the very thing meant to pull me back in — includes obvious machine debris (see complaint 1), which makes the suggestions feel like a broken vending machine rather than a thoughtful assistant. I'd come back out of curiosity, not craving.

### 5. Absence of friction — 2

For someone like me, this app talks to itself, not to me, in a lot of places:

- The sidebar: Artifacts, Agent Center, Skills Hub, Automation Center, Room, Waggle Dance, Connector Hub, MCP Hub, Marketplace, AI Tools, Vault, Mission Control, Timeline, Events & Logs, Usage & Cost, Spawn Agent. I understand maybe five of these. "Waggle Dance"? "MCP Hub"? "Spawn Agent" sounds like a horror film.
- The chat header shows a dropdown set to "YOLO". I only know YOLO as a joke teenagers made. If this controls how much the assistant does without asking me, naming it a joke is alarming, not cute.
- "claude-sonnet-4-6" sits in the top bar like a serial number.
- The side panel says "LAST ACTIVITY: tool_result: create_skill" — raw machine text with underscores, shown to me as if I should understand it.
- The greeting brags "15 memories · 214 entities · 6 relations" — what is an entity? Why am I being shown database vocabulary in a hello?
- A suggested action literally reads "Resume: Reply with the literal string PHASE_X_OK and nothing else."
- And the "Good evening, Marko" popup sits on top of the Memory screen AND the Skills screen in my session — I apparently can't visit two sections without the same popup blocking my view again.

The onboarding proves the team can write plain, warm English. The rest of the app forgot.

## Concrete Complaints

1. **Test/debug garbage shown as suggestions (Home, 02).** "Suggested next actions" includes "Resume: Reply with the literal string PHASE_X_OK and nothing else." and "Resume: I need you to read and analyze files at D:\Projects\GPM-Waggle-OS on my local..." Filter trivial/test sessions out of the suggestion engine; never surface raw prompts with file paths or test strings.
2. **Time contradiction in the comeback moment (01 + 02).** Headline: "You've been away 10 days, Marko." Popup on top of it: "active yesterday," with an item titled "Session (2026-04-30)" labeled "yesterday" (it's June 12). Reconcile all relative timestamps to one source of truth before showing the greeting.
3. **Duplicate memory in "I REMEMBER" (01).** "Session (2026-04-30): What is sovereign AI — 4 messages" is listed twice with different ages ("yesterday" / "1w ago"). De-duplicate the recall list.
4. **Welcome popup re-blocks other screens (03, 04, 04b).** The "Good evening, Marko" modal overlays the Memory Center and the Skills Hub, hiding their entire content. Show it once on Home, dismiss permanently for the session, never re-open over other screens.
5. **Sidebar jargon wall (02).** "Artifacts," "Waggle Dance," "Connector Hub," "MCP Hub," "Vault," "Mission Control," "Spawn Agent" — 22 items with no plain-language descriptions. Rename to task words ("My files," "Add apps," "Passwords & keys") or add hover/sub-labels; consider collapsing power-user sections for new accounts.
6. **"YOLO" as an autonomy setting (07, chat header).** A safety-relevant control is labeled with a meme. Rename to something self-explanatory ("Acts without asking") and explain the risk on hover.
7. **Raw machine strings in the user's view (07).** Right panel shows "LAST ACTIVITY: tool_result: create_skill"; top bar shows "claude-sonnet-4-6." Translate to human text ("Created a new skill for you") and hide model IDs behind Settings.
8. **Database vocabulary in the greeting (01).** "15 memories · 214 entities · 6 relations across 3 workspaces." Replace "entities/relations" with "people, projects & things it knows about" or drop the counts.
9. **The self-evolving superpower is invisible (13, 05, 04b).** Evolution tab: "No runs in proposed" (empty, with the jargon filters proposed/accepted/deployed/rejected/failed). Agent Center: "No agents yet" — directly contradicting Home's claim that automations ran and a Writer agent exists. The only growth evidence is a tiny "agent · review" pill. Add a plain "What I learned recently" card on Home, make the self-built skill a celebrated moment ("I built this skill for you — take a look"), and reconcile Agent Center with the agents Home says are working.
10. **Onboarding step 2 assumes export literacy (10).** "OpenAI export (.json)," "Google Takeout (.json)," "Threads export" with bare Choose file buttons. Add a one-line "How do I get this?" link per card.
11. **Maintenance schedule presented as my agenda (02).** "Up next: Memory consolidation at Jun 13, 3:00 AM... Index reconciliation at Jun 14, 4:00 AM." Hide internal jobs or reframe as user value ("Tonight I'll tidy up memory so tomorrow's answers are faster").

## Bottom Line

The onboarding and the "welcome back" moment show this team knows exactly what the magic is supposed to feel like — and for about ninety seconds, I felt it. Then the app started speaking machine to me, contradicted its own memory in the same breath it bragged about it, and hid its "I'm getting better" story behind empty tabs and a cryptic badge. Memory: visible, glitchy. Growth: claimed, not shown.

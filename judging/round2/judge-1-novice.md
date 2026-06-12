# Judge 1 — The Complete Novice (Round 2)

## Persona summary

I am not a computer person. I message on my phone, and on my laptop I do email and the web. I have never used an "AI desktop app". I do not know what an agent, a workspace, an MCP, or an API is. I judged only what I could see and feel in the screenshots, the way I would on my own at the kitchen table.

## Scores

| # | Criterion | Score (1–5) |
|---|---|---|
| 1 | First-session clarity | **4** |
| 2 | "It knows me" feeling | **4** |
| 3 | Visible agent growth | **3** |
| 4 | Desire to return | **4** |
| 5 | Absence of friction | **2** |

**Total: 17 / 25**

## Per-criterion reasoning

### 1. First-session clarity — 4

The setup is genuinely easy: three short steps, one obvious yellow button each time, and I can skip anything. Step 1 ("Tell us who you are", 09) asks things I can actually answer — my name, what kind of work I do, what I want help with — and the live preview line "Good evening, Marko — your work will be remembered here" instantly shows me what I'm getting. The privacy line on the first screen ("Your memory and data stay on your device. Nothing leaves without your say-so", 08) made me feel safe rather than spied on. Step 3's "Each workspace is its own brain" metaphor (11) actually helped me understand a word I didn't know.

What stops a 5: Step 2 ("Where do you use AI today?", 10) is the one step that assumes I'm already an AI person. Its main button says **"Harvest"** — I don't know what harvesting my computer means, and the line under it shows a raw folder path (`C:\Users\MarkoMarkovic\.claude`). If "Harvest" said "Import" I'd click it without fear. And the moment setup ends, I land facing a left sidebar of ~20 items I mostly can't read (see complaint 1), which dents my "I know what to do next" confidence.

### 2. "It knows me" feeling — 4

This is the app's best trick and it's delivered on screen, not just promised. The welcome panel (01) says "Good evening, Marko", counts "17 memories · 214 people, projects & things it knows across 3 workspaces", and then literally shows an "I REMEMBER" list with my own habits ("I always work with a draft → critique → rewrite loop…"). The Home screen (02) opens with "You've been away 10 days, Marko. Here's what happened:" and shows the exact things I was working on with a Continue button on each. When I resume the Writer workspace (07), the assistant picks up mid-project with "Decision Review & Next Steps — Anya's Content Strategy" without me re-explaining anything. The Memory screen (03) even knows my age, my team, my favorite color, and my football club. I genuinely felt remembered.

What stops a 5: on the very panel that delivers the magic, the first remembered item reads **"User asked: Review recent decisions and next steps"** (01). "User"? That's me — why is it talking about me in the third person like a machine log? And right under my name sits a yellow warning triangle saying **"⚠ 2 pending"** with no noun — pending *what*? A warning sign with no explanation is the one cold, slightly worrying note on an otherwise warm screen. (Small extra wobble: the header says 17 memories total across 3 workspaces, but two of the workspaces individually claim 11 memories each — the numbers don't obviously add up.)

### 3. Visible agent growth — 3

The *story* of growth is told beautifully in one place: the Evolution panel (13) says "Your agent improves itself here… You review each proposal and accept or reject it — nothing changes without you." That sentence is perfect — plain, reassuring, exciting. The Home screen's "Overnight: 9 memories consolidated, 5 automations completed" (02) made me feel it worked while I slept, and the Automation Center's "100% success rate" (06) looks healthy.

But the *evidence* of growth is thin or hidden everywhere I looked:
- The proudest possible moment — a skill the assistant built by itself — is marked with a tiny cryptic badge reading **"agent · review"** (04b, presentation-design row). I would scroll right past it. Nothing says "Your AI built this for you — take a look."
- The Evolution panel itself is **empty**: "Select a run to review… + New Run", and its explainer uses words like "baseline vs winner, which gates fired" (13). I would never press "New Run" because I don't know what a run is.
- The only agent I have, "Editorial Critic" (05), shows **"run never"**, "Idle", and "avg success —". My one helper looks like it has never done anything.
- The "Monthly Agent Assessment" memory cards (03) literally print "**Interactions**: 0" inside broken-looking text.

So I'm *told* it gets better, and I half-believe it, but I can't *see* it getting better.

### 4. Desire to return — 4

Real pulls exist: the away-greeting plus "Continue →" buttons on my unfinished work (02) make tomorrow's first click obvious. "Up next: … Jun 15, 9:00 AM / … Jun 17, 10:00 AM" gives me actual appointments, and the Overnight digest teaches me that things happen while I'm gone — the strongest reason to open it again ("what did it do last night?"). Quick capture ("Jot a note to remember…") invites a tiny daily habit.

What stops a 5: the appointments are written for engineers, not me — **"Stale workspace check"** sounds like something went moldy, and **"Capability suggestion"** is abstract. If those said "I'll tidy up your project Saturday morning" and "I'll suggest a new trick on Tuesday," I'd be excited instead of puzzled. The "2 pending" items also never tell me what reward awaits if I deal with them.

### 5. Absence of friction — 2

The core path (onboarding → home → chat) is mostly plain-spoken, and nothing felt scary — the privacy and "nothing changes without you" lines are calming. But jargon is everywhere I rest my eyes:

- The always-visible sidebar (02) is half alien: **MCP Hub, Connector Hub, Artifacts, Waggle Dance, Mission Control, Vault, Spawn Agent, Usage & Cost**. I recognize Home, Chat, Files, Settings — the rest is a foreign language I must stare at all day.
- Raw formatting symbols leak into the interface: skill descriptions show literal **"## What to do"** and **"**Check session history**"** (04, 04b), and memory cards show **"**Interactions**: 0 … ## Strengths"** (03). To me that looks broken.
- The chat header (07) shows a machine code, **"claude-sonnet-4-6"**, next to an unexplained **"Autopilot"** toggle.
- The very first screen's subtitle says **"Workspace-native"** (08) — insider speak before I've even clicked once.
- Smaller stumbles: "Harvest" (10), "agent · review" (04b), "⚠ 2 pending" (01), "Stale workspace check" (02), "baseline vs winner, which gates fired" (13), "Deprecated" / "Any confidence" filters (03), and "1 agents" (05 — grammar).

None of it is frightening, but a novice meets an unknown word on nearly every screen, so this can't score above 2.

## Numbered concrete complaints

1. **Sidebar jargon overload** (02, all screens, left nav): "MCP Hub", "Connector Hub", "Waggle Dance", "Mission Control", "Vault", "Spawn Agent", "Artifacts" — rename in plain words or hide behind an "Advanced" group; a novice can only parse Home/Chat/Files/Settings.
2. **"Harvest" button + raw file path** (10, onboarding step 2): the detected-history banner's action says "Harvest" and shows `C:\Users\MarkoMarkovic\.claude`. Say "Import my history" and demote the path to a tooltip.
3. **Unexplained "⚠ 2 pending"** (01, welcome panel header; also workspace cards): a warning triangle with no noun and no link. Say what is pending ("2 things need your OK") and make it clickable.
4. **Third-person "User asked:" in "I REMEMBER"** (01): the app calls me "User" in the very list meant to prove it knows me. Should read "You asked me to review recent decisions…".
5. **Raw markdown rendered as text** (04 and 04b skill rows; 03 "Monthly Agent Assessment" cards): literal `##` and `**` symbols visible in descriptions. Render the formatting or strip it.
6. **The self-built skill is uncelebrated** (04b, presentation-design row): the badge "agent · review" is the entire announcement that my assistant taught itself a new skill. Replace with explicit copy like "Built by your AI — review & approve" and consider surfacing it on Home.
7. **Agent Center reads as dead, not learning** (05): "1 agents" (grammar), "avg success —", and Editorial Critic showing "run never / Idle". The only agent looks like it has never worked; seed a first run or hide empty stats.
8. **Evolution panel is empty and jargon-gated** (13): great headline copy, but the action is "+ New Run" and the explainer says "baseline vs winner, which gates fired". A novice will never click. Offer "See how I'd improve myself" and translate gates/baseline into plain words.
9. **Machine model ID in chat header** (07): "claude-sonnet-4-6" dropdown and unexplained "Autopilot" pill. Hide the model string behind a friendly label ("Smart mode").
10. **System-speak schedule items** (02, "Up next"): "Stale workspace check" and "Capability suggestion" — reword as human promises ("I'll tidy up quiet projects", "I'll suggest a new skill").
11. **"Workspace-native" on the first screen** (08 subtitle): insider phrase at the single most novice-facing moment; say "Everything organized by project" or drop it.
12. **Memory filter jargon** (03): chips like "Deprecated" and a "Any confidence" dropdown, plus tabs "Weaver"/"Harvest" — meaningless to a novice; plain-word alternatives needed.

## Verdict in one line

The memory magic is real and visible — I felt greeted, remembered, and pulled back — but the "it keeps getting better" half of the promise is asserted in copy while the screens show empty runs, a never-run agent, and a cryptic badge, all wrapped in more engineer-speak than a novice can comfortably ignore.

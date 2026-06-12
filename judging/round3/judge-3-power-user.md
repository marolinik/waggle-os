# Judge 3 — Non-Developer Power User (Round 3)

## Persona

Ops lead. Lives in Notion, Airtable, Zapier. Builds automations for a living without writing code.
Learns every shortcut, opens every menu, and judges a product by one question: **is depth rewarded?**
I evaluated the full screenshot set (15 PNGs, cropped/zoomed where needed) and verified claims live
against the running app (`/api/home/briefing`, `/api/agents`, `/api/skills`, `/api/automations`,
`/api/memory/stats` with a Bearer session token).

## Scores

| # | Criterion | Score (1–5) |
|---|-----------|-------------|
| 1 | First-session clarity | **4** |
| 2 | "It knows me" | **4** |
| 3 | Visible agent growth | **3** |
| 4 | Desire to return | **4** |
| 5 | Absence of friction | **3** |
| | **Total** | **18 / 25** |

## Per-criterion reasoning

### 1. First-session clarity — 4

This is one of the better onboardings I've judged. Three steps, every one skippable, plain language
throughout ("Each workspace is its own brain"), and two genuinely smart moments:

- **Live greeting preview** on the "Tell us who you are" step ("Good evening, Marko — your work will
  be remembered here") — the form pays off *while you fill it in*.
- **"Claude Code detected — Found 425 items"** with a one-click "Import my history" button. Auto-detecting
  my existing AI usage and quantifying it is exactly the kind of respect-for-my-time a power user notices.

The novice dock (verified: 6 items — Home, Chat, Files, Vault, Settings, Spawn Agent) keeps day one calm,
and the plain-language hover descriptions in `dock-tiers.ts` are real ("Everything Waggle remembers about
you and your work").

Why not 5: the simple dock **omits Memory entirely**. Onboarding just sold me the memory superpower and
ingested 425 items — and then the novice sidebar has no Memory entry to go see what it learned. The #1
differentiator shouldn't be gated behind the power tier (complaint 4).

### 2. "It knows me" — 4

The welcome-back moment is genuinely felt. "Good evening, Marko — 23 memories · 271 people, projects &
things it knows · 2 awaiting your OK", followed by an "I REMEMBER" list quoting my actual working style
("I always work with a draft → critique → rewrite loop. The critique pass is the most important…"). The
cockpit headline "You've been away 10 days, Marko. Here's what happened:" with per-workspace context
summaries ("Q3 editorial direction: lean into skepticism, less hype") is the strongest continuity
experience in this product category. I verified the substance: 271 entities is the live API number,
the briefing API returns exactly the greeting, workspaces, pending counts, and scheduled commitments
shown on screen, and the workspace right-rail ("11 memories · 2 sessions", last activity `memory_write
2h ago`) is real data.

Why not 5: **the numbers don't reconcile, and the deep dive undersells the claim.** The modal says
"23 memories / 2 awaiting your OK"; `/api/memory/stats` reports `total.frameCount: 14` and the briefing
reports `needsReviewCount: 0`. Worse, clicking into Memory Center shows **one** memory card above a huge
empty honeycomb. The headline says it knows everything; the filing cabinet looks nearly empty. Trust in
a memory product is arithmetic — two surfaces calling different numbers "memories" is a credibility leak
(complaints 2, 6).

### 3. Visible agent growth — 3

The scaffolding is excellent; the evidence is thin. What works:

- The `presentation-design` skill carries an **"agent · review" provenance badge** (verified: its API
  `source` is `chat-session` while all 19 other skills are unsourced) — a real artifact of the agent
  authoring a skill from my conversations.
- The cockpit commits to future growth in first person: "I'll suggest a new skill for you at Jun 17,
  10:00 AM" (verified in the briefing's `upNext`).
- The Memory → Evolution tab has the best plain-language framing of self-improvement I've seen:
  "Your agent improves itself here… You review each proposal and accept or reject it — nothing changes
  without you." Filters for proposed/accepted/deployed/rejected show someone designed for a real lifecycle.

Why 3 and not 4+: **the Evolution tab is an empty state.** Zero runs, "Select a run to review", and an
unexplained "New Run" button (run *what*? — a non-dev has no idea). The Agent Center shows one agent and
"avg success —" placeholder dashes. The single concrete growth artifact (the authored skill) is a tiny
chip on row 13 of a list — nothing on Home or in Evolution narrates "I created presentation-design from
your chat last week; here's what it does." The mission says growth must be *viscerally obvious*; today
it's a badge you must hunt for plus promissory copy (complaints 3, 6).

### 4. Desire to return — 4

For this persona, the return loop is the product's strongest muscle. The cockpit is a real "while you
were away" report with receipts: overnight digest (10 memories consolidated, 5 automations completed),
resume cards with pending counts, suggested next action, dated future commitments, and quick capture.
The Automation Center is honest Zapier-grade ops: 13 automations (verified live: 12 active + 1 paused,
real cron schedules, real last-run timestamps), next-3 / recent-3 panels, 100% recent success. The app
demonstrably works while I'm gone and shows me the ledger — that's the habit hook, and it's earned.

Why not 5: the trust required to hand an assistant more of my work was dented the moment I opened the
flagship workspace and saw a raw 404 error blob as the agent's reply (see criterion 5). Also a labeling
nit: the "Overnight" panel actually summarizes a 10-day absence (complaint 7).

### 5. Absence of friction — 3

The killer: in `07-workspace-resume.png`, the Writer workspace chat — the demo centerpiece — shows the
agent replying with a **raw JSON error dump**:

> `[spawn failed] LLM error (404): {"error":{"message":"Anthropic API error: {\"type\":\"not_found_error\",\"message\":\"model: auto\"}…request_id…}}`

I verified the cause live: the Editorial Critic agent's model is `"auto"` (`/api/agents`), which the LLM
router 404s on. That means a *default configuration* produces an unhandled developer-grade error rendered
straight into a non-technical user's conversation, with no recovery path. For the exact audience this
product targets, that is a session-ender (complaint 1).

Beyond that, friction is genuinely low — consistent left nav, every screen URL-routed, Ctrl+K palette
with suggested slash-commands and keyboard hints, skippable onboarding. But the polish cracks show in
exactly the places a power user looks: the palette footer says **⌘K** on a Windows build while the header
correctly says Ctrl+K (complaint 5), and three core screens (Memory, Agent Center, Evolution) are mostly
empty honeycomb wallpaper below a single row of content, which reads as "broken or abandoned" rather than
"new" (complaint 6).

## Numbered complaints (concrete, actionable)

1. **Raw API error JSON rendered in chat** (`07-workspace-resume.png`). Default agent model `"auto"`
   404s through the router and the user sees `[spawn failed] LLM error (404): {…not_found_error…}`.
   Fix: catch spawn/LLM failures and render a human message ("I couldn't start — my model isn't set up.
   Open Settings → Models to fix it") with a retry button; never print raw payloads into conversation;
   and make `"auto"` resolve to a working default so fresh installs can't hit this.
2. **Memory counts disagree across surfaces.** Welcome modal: "23 memories · 2 awaiting your OK".
   Live APIs: `total.frameCount: 14`, `needsReviewCount: 0`. Pick one counting basis, one label, and
   reuse the same endpoint for both surfaces.
3. **Evolution tab — the self-evolving showcase — is an unexplained empty state.** No runs, and "New Run"
   means nothing to a non-developer. Seed it with the real story it already has: "Your agent authored
   *presentation-design* from your chat session — review it here." Growth should be narrated, not implied.
4. **Novice dock omits Memory.** Onboarding imports 425 items into memory, then the 6-item simple sidebar
   gives novices no way to visit it. Add Memory to the novice tier; it's the moat feature.
5. **⌘K glyph in the command palette footer on Windows** (header pill correctly shows `Ctrl K`).
   Platform-detect the modifier hint.
6. **Dead honeycomb expanses on Memory Center, Agent Center, and Evolution** — a single content row above
   ~600px of empty wallpaper, plus an "avg success —" placeholder. Empty states should recruit
   ("Spawn a second agent from a template", "Import more history — 14+ sources") instead of showing blank hexes.
7. **"Overnight" digest header is wrong after long absences** — it summarized a 10-day gap. Make it
   "While you were away (10 days)" when `lastActive` exceeds ~24h.

## Verdict in one line

The memory cockpit and the return loop are best-in-class for non-technical operators, but the raw 404 in
the flagship chat, the empty Evolution showcase, and the memory-count drift keep both superpowers from
landing without caveats: **18/25**.

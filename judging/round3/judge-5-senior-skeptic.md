# Judge 5 — Senior Engineer / Professional Skeptic (Round 3)

**Persona:** 15 years shipping software. Default position: "AI that learns" is marketing until I see it in the UI or the API. I read every screenshot at full resolution, pulled a session token, and curled every endpoint I doubted. Credit below is given only where the pixels and the JSON agree.

**Method:** 15 screenshots (`judging/screenshots/`, cropped via PIL for dense screens) cross-checked against live API at `http://localhost:8080/api` (`/auth/session-token` → Bearer): `/home/briefing`, `/home/overnight`, `/memory`, `/memory/stats` (global + per-workspace), `/identity`, `/skills`, `/agents`, `/automations`, `/evolution/runs`, `/audit/installs`. Also read `apps/web/src/lib/dock-tiers.ts` to verify the progressive-nav claim at source.

---

## Scores

| # | Criterion | Score (1–5) |
|---|---|---|
| 1 | First-session clarity | **4** |
| 2 | "It knows me" (persisted, visible, correctable) | **4** |
| 3 | Visible agent growth (substantiated or vapor) | **2** |
| 4 | Desire to return (real value or dark patterns) | **3** |
| 5 | Absence of friction | **2** |
| | **Total** | **15 / 25** |

---

## Per-criterion reasoning

### 1. First-session clarity — 4

What earned credit (verified):

- Onboarding is a genuinely tight 3-step flow (08–11): plain-language identity step with a **live greeting preview** ("Good evening, Marko — your work will be remembered here"), a memory-import step, a workspace step. "Skip setup" is always visible. No tech jargon in step 1 ("What kind of work do you do?", chips, not schemas).
- The import step (10) makes the memory pitch concrete instead of abstract: **"Claude Code detected — Found 425 items from Claude Code"** with a one-click import. That's the right way to sell memory — with the user's own data.
- Progressive nav is real, not a claim: `dock-tiers.ts` `TIER_DOCK_CONFIG.simple` is exactly 6 entries (Home, Chat, Files, separator, Vault, Settings), matching `14-novice-simple-dock.png`, and **every entry carries a plain-language `description`** hover ("Everything Waggle remembers about you and your work", "Teach your agents new abilities"). Verified in source, lines 66–127.
- The privacy line on the welcome screen ("Your memory and data stay on your device") is the correct first message for this product.

Why not 5:

- The first screen promises "Remembers everything. **Improves itself.**" and step 3 says "your agent … can propose new skills — you approve every change." Per criterion 3 below, the improves-itself half is essentially unbacked in this install (0 evolution runs). Front-loading an unproven superpower in the first 30 seconds is a clarity debt the user collects later.
- The novice dock keeps a **"Spawn Agent"** CTA (jargon) while omitting Memory entirely (see Complaint 5) — the simplest tier hides the flagship and shows the most intimidating verb.

### 2. "It knows me" — 4

What earned credit (verified):

- **Persisted:** `/api/identity` → `{name: "Marko", role: "Founder", department: "Egzakta Group", created_at: 2026-04-16, updated_at: 2026-06-12}`. Two months of persistence, updated today. Personal mind frames (`/api/memory?limit=50`) hold real durable identity facts (id 1, created 2026-04-16: name, age, employer, favorite color, football club).
- **Visible:** The home briefing greeting "You've been away **10 days**, Marko" is arithmetically honest — last real session activity is 2026-06-02 (frame timestamps), today is 2026-06-12. The welcome modal's "**271 people, projects & things it knows**" matches `/api/memory/stats` `total.entityCount: 271` exactly. Workspace resume cards carry real stored context ("Q3 editorial direction: lean into skepticism, less hype" is verbatim workspace memory, not template text). "2 awaiting your OK" = sum of the two workspaces' `pendingCount` (1+1). Numbers in the UI trace to the API.
- **Scoped:** Per-workspace memory isolation is real: writer-demo-anya mind = 11 frames, default-workspace = 1, new-hive = 0 (per-workspace `/api/memory/stats`), and the Memory Center's "About you / About this work" scope chips plus the writer-demo right rail ("11 memories · 2 sessions") match exactly.
- **Correctable:** The earlier duplicate-write pollution was cleaned via the product's own APIs and the trail is honest — writer-demo now shows 8 active + 2 `deprecated` + 1 `archived`, and the Memory Center exposes Active/Archived/Deprecated/Needs-review filters rather than silently disappearing data.

Why not 5:

- Strip away the staged workspace demo and the personal mind contains **2 frames** — both typed in by the user himself. The "it knows me" depth on display is mostly self-declared identity plus 271 graph entities of unexplained provenance (214 of them in a personal mind holding 2 frames). The 425-item Claude Code import that would prove harvest-scale knowledge was never run in this install.
- No visible per-memory **edit** affordance in the Memory Center card (checkbox only) — correction at the UI level is archive/delete, not amend.

### 3. Visible agent growth — 2

This is the mission's second superpower and it is **the weakest evidenced claim in the product**.

- `/api/evolution/runs` → `{"runs": [], "count": 0}`. The Memory → Evolution tab (13) is an explainer empty state ("Your agent improves itself here … nothing changes without you") with a "+ New Run" button. Honest, well-written — and empty. Zero proposals, zero accepted, zero deployed, in an install whose identity dates to April.
- The one genuine artifact: the **`presentation-design` skill carries `initiator: "agent", source: "chat-session"`** in `/api/skills`, surfaced in the UI as the amber **"agent · review"** badge (04/04b). UI and API agree; provenance and review-gating are real. This is the only substantiated self-evolution evidence in the entire install, and I credit it.
- The Agent Center (05) holds exactly **one** agent, created **today** by the **user** (`createdBy: "user"`, `createdAt: 2026-06-12T18:59`), status Idle, **avg success "—"**. And the captured evidence of its only run (07) is a **failure**: a raw 404 dumped into chat because the literal string `"auto"` was sent to the Anthropic API as a model name. So the live demonstration of agent capability in this evidence set is an agent that cannot spawn.
- "I'll suggest a new skill for you at Jun 17, 10:00 AM" (home cockpit) traces to automation id 7 "Capability suggestion", cron `0 10 * * 3` — a **scheduled prompt**, not learned behavior. Waggle Dance ("see what your agents learn from each other") was not demonstrable from the provided evidence.

Verdict: one real provenance badge does not substantiate "learns workflows, upgrades its own skills, shares knowledge across workspaces." As shipped here, the second superpower is ~90% vapor. 2/5 — the 2 is earned by the agent-authored skill with review gating.

### 4. Desire to return — 3

Real pull, honestly delivered:

- The away-gap briefing ("You've been away 10 days… Here's what happened") with resume cards, pending counts, and one-click Continue is the right return hook, and its numbers are API-backed (`/api/home/briefing` matches the screen field-for-field).
- "Up next" commitments are real scheduler entries: "quiet projects at Jun 15, 9:00 AM" = Stale workspace check `nextRun 2026-06-15T07:00Z`; "new skill Jun 17, 10:00 AM" = Capability suggestion `nextRun 2026-06-17T08:00Z`. The app makes promises it has machinery to keep.
- No dark patterns found: trial state is a quiet "Trial: 14d left" badge, the welcome modal has "Don't show again", quick capture is one field. Good.

Why only 3:

- The overnight story is weaker than it looks. "5 automations completed" is technically true, but `/api/automations` shows four of them sharing `lastRun ≈ 2026-06-12T01:05:57Z` — a **boot catch-up burst at 3:05 AM local**, not the advertised schedule. The Automation Center's own History column displays "Morning briefing — OK · 6/12/2026, 3:05:58 AM" against an 8:00 AM schedule. A user who checks whether the app kept its promise sees it kept it at the wrong time.
- The day's one agent interaction ended in a raw error dump (Complaint 1). Value-on-return is promised well and delivered unevenly.

### 5. Absence of friction — 2

The consistency work that landed (audit taxonomy, provenance badge, count plumbing) shows — most UI numbers trace cleanly to APIs, which is rare. But the evidence set contains one disqualifying-grade defect and a cluster of trust-eroding inconsistencies; see complaints 1, 2, 4, 5, 6, 7.

---

## Numbered complaints (concrete, actionable)

1. **Raw API error dumped into chat** — `07-workspace-resume.png`, assistant message bubble, Writer demo — Anya chat: `[spawn failed] LLM error (404): {"error":{"message":"Anthropic API error: {\"type\":\"not_found_error\",\"message\":\"model: auto\"} ...}` . Two defects in one: (a) the model preference `"auto"` (visible as `model: "auto"` in `/api/agents`) is passed **literally** to the Anthropic API instead of being resolved to a concrete model; (b) the failure is rendered as nested raw JSON in a product aimed at non-technical users. Fix: resolve `auto` at dispatch in the spawn path; map provider errors to a human message ("I couldn't start the critic agent — model setup issue. Retry / Fix in Settings").

2. **Failures don't propagate to any health surface.** The Editorial Critic's only run (lastRunAt 2026-06-12T20:08Z) is the 404 failure above, yet `/api/home/overnight` reports `"failures": []`, Agent Center shows status "Idle" with **avg success "—"**, and the Automation Center claims "100% Success rate (recent runs)". The one thing that broke today is invisible everywhere except inside the chat transcript. Fix: spawn failures must write to the run/failure ledger that feeds `/api/home/overnight` and Agent Center stats.

3. **"Self-evolving" is front-loaded but unsubstantiated.** Onboarding (08: "Improves itself."; 11: "can propose new skills") and the Evolution tab promise self-improvement, but `/api/evolution/runs` returns `count: 0` and the Evolution UI (13) is an empty state with a manual "+ New Run" button. The only evidence is one agent-authored skill badge. Either seed a real first evolution run during onboarding/trial, or soften the first-screen copy until the loop demonstrably fires.

4. **Scheduler displays contradict their own schedules.** Automation Center (06) History: "Morning briefing — OK · 6/12/2026, 3:05:58 AM" and "Task reminder — OK · 3:05:58 AM" against 8:00/8:30 AM schedules (boot catch-up burst; four automations share `lastRun ≈ 01:05:57Z`). Additionally, 5 of 12 active automations had `nextRun` in the **past** at probe time (e.g., Memory compaction `next: 2026-06-12T01:30Z` observed at 20:30Z) and the "NEXT UP" panel silently omits them, so e.g. Memory compaction shows no next run anywhere. Fix: recompute `nextRun` after catch-up runs; label catch-up executions as such in History.

5. **The novice tier hides the flagship.** `dock-tiers.ts` `TIER_DOCK_CONFIG.simple` (the `DEFAULT_TIER`) contains no Memory entry — Home/Chat/Files/Vault/Settings only — while the dock still shows a "Spawn Agent" rocket (14-novice-simple-dock.png). The #1 superpower ("knows who you are") has no nav presence for exactly the non-technical audience the mission targets, but agent-spawning jargon does. Fix: swap Memory in (it has the best plain-language description in the file) and gate Spawn Agent to professional+.

6. **Unlabeled header count fluctuates across the session.** Topbar badge next to the model name reads 14 (21:30, 12/13-*.png) → 23 (22:16, 04-skills-hub.png) → 13 (22:22, 03/05-*.png) → 14 (22:25, 14-*.png). It tracks the global frame count through the duplicate-write/cleanup churn — i.e., it's truthful — but it has no label, sits inside a workspace-scoped breadcrumb ("Default Workspace · Memory · claude-sonnet-4-6 · ⓘ13") while counting **global** frames (default-workspace's own total is 3), and a 23→13 drop with no explanation reads as data loss to a user. Fix: tooltip + scope it to the breadcrumb's workspace, or move it to the Memory entry.

7. **Memory Center depth for the long-lived workspace is one stub.** `03-memory-center.png`: Default Workspace (57 days old, "1 pending") shows exactly one Active memory — "Session (2026-04-30): What is sovereign AI — 4 messages" — confirmed by API (1 active workspace frame). A returning user opening the moat feature in their default workspace sees a single 6-week-old session stub on an empty honeycomb. The harvest path that would fill this (the detected 425 Claude Code items) was never run. Fix: when a mind is near-empty, the empty space should carry the import CTA from onboarding step 2, not background art.

---

## Bottom line

The memory half of the pitch is more real than I expected to find: numbers on screen trace to APIs, scoping is genuine, the cleanup left an honest audit trail, and the briefing's "away 10 days" is true arithmetic. The self-evolution half is a well-designed empty room with one authentic exhibit (the `agent · review` skill badge). And the single captured attempt to actually use the agent ends in a raw 404 that no health surface admits happened. Ship-blocking for the "delightful for non-technical users" claim: complaints 1 and 2.

**Scores: 4 / 4 / 2 / 3 / 2 — total 15/25. 7 complaints.**

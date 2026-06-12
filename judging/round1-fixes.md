# Round 1 — Consolidated complaints → fixes

Scores R1: novice 4/4/2/3/2 · casual 4/4/2/4/3 · power 4/4/2/3/2 · junior 4/4/3/4/2 · skeptic 4/3/2/4/2.
Weakest: visible agent growth (2-3 across the board) and friction (2-3).

| # | Complaint (judges) | Fix | Type |
|---|---|---|---|
| 1 | "away 10 days" vs "active yesterday" same screen (all 5) | unify brag lastActive with briefing's definition (`login-briefing-brag.ts`) | code |
| 2 | duplicate "I REMEMBER" items, Apr-30 session tagged "yesterday" (all 5) | dedup brag memory list by title; age from session date not frame touch | code |
| 3 | welcome modal overlays Memory/Skills screens (4) | cooldown already shipped; ALSO gate render to /home route; recapture evidence | code+evidence |
| 4 | "PHASE_B_OK" test prompts as Suggested next actions (all 5) | recency filter on resume suggestions (skip stale sessions) + clean dev test sessions | code+data |
| 5 | "Up next" = janitor cron schedule (4) | filter system-maintenance jobs from Home upNext; hide empty section | code |
| 6 | Evolution tab empty "No runs in proposed" (all 5) | default filter 'all' + plain-language primer; RUN a real evolution run for substance | code+usage |
| 7 | Agent Center "No agents yet" contradicts working agents (4) | surface workspace persona agents / fix empty-state; create one real agent via builder | code+usage |
| 8 | raw "tool_result: create_skill" last-activity (4) | humanize tool-event labels | code |
| 9 | "entities · relations" database vocab in greeting (3) | plain words in brag stats line | code |
| 10 | YOLO autonomy label (2) | display label "Autopilot — acts without asking" | code |
| 11 | chat renders raw markdown (2) | investigate + render markdown in assistant messages | code |
| 12 | nav jargon wall: Waggle Dance/MCP Hub/Weaver (3) | one-line plain tooltips on dock entries | code |
| 13 | onboarding PREVIEW box renders bare "Marko." (3) | render actual greeting preview | code |
| 14 | import cards assume export literacy (1) | one-line "how to get this" hint per provider | code |
| 15 | wizard role/industry never reach /api/identity (1) | wire who-are-you answers into identity record | code |
| 16 | dup "User identity" frames keep accumulating; system frames stamped user_stated (1) | consolidation replace-on-update + system source stamp | code |
| 17 | stock skills claim initiator:user (1) | absent provenance → 'built-in' label, not user | code |
| 18 | e2e-test rows in install audit trail (1) | dev-data cleanup (local profile only) | data |
| 19 | "1 sessions" pluralization (1) | fix | code |
| 20 | Automation Overview = stats over void (1) | show next runs + recent results on Overview | code |
| 21 | empty workspace card shows brochure copy (1) | "Nothing here yet — start a chat" | code |
| 22 | Ctrl+K coach-mark overlaps palette (1) | reposition tooltip / suppress while palette open | code |
| 23 | model id in top bar (2, low) | leave (expert affordance); revisit if re-flagged | wontfix-r1 |
| 24 | presentation-design has no audit row (1) | out of scope: trail is append-only post-P5; UI makes no retroactive claim | wontfix-r1 |

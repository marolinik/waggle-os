# Judge 5 — Senior Engineer / Professional Skeptic

**Persona:** 15 years shipping products. I have watched every "AI that learns" demo collapse the moment someone opens the database. I assumed every claim here was inflated until the UI or the API proved it. I read all 12 screenshots, then verified against the live sidecar (`/api/home/briefing`, `/api/home/overnight`, `/api/memory?limit=200`, `/api/memory/stats`, `/api/skills`, `/api/audit/installs`, `/api/agents`, `/api/automations`, `/api/evolution/runs`, `/api/identity`) and read the relevant source (`packages/server/src/local/routes/skills.ts`, `routes/memory.ts`, `routes/memory-center.ts`, `apps/web/src/lib/login-briefing-brag.ts`) plus the skill file on disk (`~/.waggle/skills/presentation-design.md`).

**Headline:** This is more real than 90% of "AI with memory" demos I've audited — the memory is genuinely persisted SQLite, the overnight work maps to real cron jobs with real `lastRun` timestamps, and the skill provenance stamp exists in actual file frontmatter. But the *self-evolution* story is infrastructure without evidence (0 evolution runs, 0 agents, 1 agent-authored skill that predates its own audit trail), and the returning-user surface leaks test junk and contradicts itself about when I was last here.

## Scores

| # | Criterion | Score (1–5) |
|---|---|---|
| 1 | First-session clarity | **4** |
| 2 | "It knows me" feeling | **3** |
| 3 | Visible agent growth | **2** |
| 4 | Desire to return | **4** |
| 5 | Absence of friction | **2** |
| | **Total** | **15 / 25** |

---

## Per-criterion reasoning

### 1. First-session clarity — 4/5

Evidence: 08/09/10/11-onboarding screenshots.

The onboarding is honest and unusually graspable for this category. Three steps, each skippable ("Skip setup", "Skip this step"). The mental model is stated in plain words: "Each workspace is its own brain — memory, files, and agents stay isolated" (step 3) and "Bring your existing conversations — Waggle extracts decisions, preferences, and knowledge into your persistent memory" (step 2). The memory-import step earns real credit: it *detected* an actual local install ("Claude Code detected — Found 425 items at C:\Users\MarkoMarkovic\.claude") rather than just offering upload boxes — that is a concrete, checkable claim, not vapor. The privacy line ("Your memory and data stay on your device. Nothing leaves without your say-so") matches the local-sidecar architecture I probed.

Why not 5: step 1 collects "Role: Strategy Consultant" and promises "Waggle uses this to ... tailor how it helps," but the live `/api/identity` shows `role`, `department`, and `personality` all empty for this configured user — the personalization promise is not demonstrably honored end-to-end. The "PREVIEW" box that renders just "Marko." is a dead weight on an otherwise good screen. "YOUR AI OPERATING SYSTEM" is puffery, but forgivable puffery.

### 2. "It knows me" feeling — 3/5

Evidence: 01-home-welcome-back, 03-memory-center, 07-workspace-resume; verified against `/api/memory`, `/api/memory/stats`, `/api/identity`, memory routes source.

The memory claim is **not** a parlor trick at the infrastructure level. I verified:
- The modal's brag line "15 memories · 214 entities · 6 relations across 3 workspaces" is backed by `/api/memory/stats` → `{frameCount:16, entityCount:214, relationCount:6}` (the off-by-one is a frame written after the modal rendered — acceptable).
- Memories are user-visible AND correctable: real statuses in the data (4 active / 8 archived / 4 deprecated), `PUT /api/memory/frames/:id` edit, `POST /api/memory/:id/archive` (reversible, per `memory-center.ts:354`), `DELETE /api/memory/frames/:id`, all emitting audit events I can see in `/api/events` (`memory_write`/`patch` rows). That is the full persisted-visible-correctable triad. Credit earned.
- Workspace resume (07) shows genuine restored chat with decision records ("DECISION 1 (i2) Editorial Pivot — 'Skepticism Over Hype'") matching the workspace summary the API returns ("Q3 editorial direction: lean into skepticism, less hype").

Why only 3: open the hood and the actual memory *content* is thin and polluted. Of 16 frames: four are duplicate "User identity: Name: Marko" (ids 36, 37, 38, 41); one stores the user's *question* as a preference ("User preference: Based on your saved memory only: what is my name..."); two are "Monthly Agent Assessment" blobs that are garbage concatenations of an assessment + a slash command + leftover test prompts ("Create a file named hive-write-proof.md...") — and every one of these system-generated blobs is provenance-stamped `source: "user_stated"`, which is flatly false. The app knows my *name* and my schedule; it does not demonstrably know *me* (identity role/personality empty). The "I remember" hero list shows the same session twice (see complaint 5). Real substrate, weak substance.

### 3. Visible agent growth — 2/5

Evidence: 04b-skills-agent-badge, 05-agent-center, 13-memory-evolution; verified `/api/skills`, `/api/audit/installs`, `/api/agents`, `/api/evolution/runs`, `skills.ts`, the skill file on disk.

What's real: the provenance mechanism exists and is not faked. `~/.waggle/skills/presentation-design.md` carries genuine frontmatter (`initiator: agent`, `source: chat-session`), the skills API surfaces it, and `/api/audit/installs` is a real governance trail with `riskLevel` / `trustSource` / `approvalClass` / `initiator` — including three agent-initiated `proposed` rows for high-risk marketplace capabilities correctly classed `critical`. The write path in `skills.ts` (P5/D4) does stamp and audit every skill write now. The plumbing deserves credit.

What's missing is the *growth itself*. The numbers, from the product's own APIs: **1** agent-authored skill out of 20 (the other 19 are clearly stock skills — brainstorm, code-review, meeting-prep — all stamped `initiator: "user"`); **0** agents (`/api/agents` → `{"agents":[],"count":0}`, and 05-agent-center literally says "No agents yet"); **0** evolution runs ever (`/api/evolution/runs` → `{"runs":[],"count":0}`, 13-memory-evolution is an empty state); and the agent's own Monthly Assessment memory reads "Interactions: 0, Correction Rate: 0.0%, Skills installed this month: 0." Worse, the one showcase artifact — presentation-design — has **no row in the install audit trail** (the trail starts 2026-05-17 and contains no entry for it), so the "every skill write is audited" claim does not cover the very example offered as proof. And the screenshot supplied to evidence the badge (04b) is blocked by the welcome modal — the badge is not visible in the submitted UI evidence at all; I could only verify it via file and API. A self-evolving agent with zero runs, zero agents, and one pre-audit skill is a self-evolution *capability*, not a self-evolution *demonstration*. Two points for honest, working plumbing.

### 4. Desire to return — 4/5

Evidence: 02-home-cockpit; verified `/api/home/overnight`, `/api/automations`, `/api/home/briefing`.

This is the strongest claim in the product, and it survives scrutiny. "8 memories consolidated / 5 automations completed" is backed verbatim by `/api/home/overnight` (`{"consolidated":8,"automationsCompleted":5,"failures":[]}` over an explicit 24h window), and that in turn is backed by 12+ real scheduled automations with genuine `lastRun` timestamps (Harvest sync, Memory compaction, Memory consolidation all ran at 2026-06-12T01:05). The "Up next" schedule on Home matches actual `nextRun` values (Memory consolidation Jun 13 3:00 AM, Marketplace sync Jun 14 2:00 AM). The overnight work *actually happened*. No dark patterns found anywhere: "Don't show again" on the modal, skip on every onboarding step, and the day-0 empty state in `LoginBriefing.tsx` explicitly labels its demo memory bubbles "Examples." — code-comment evidence the team actively avoids deceptive copy. The loop is engineered on real machine work, not streaks or guilt.

Why not 5: the *output* of the overnight work is what I'd come back to, and right now it's duplicate identity frames and garbled assessment blobs (criterion 2). And two of the four "suggested next actions" on the cockpit are leftover test prompts (complaint 3) — a novice returning to "Resume: Reply with the literal string PHASE_B_OK and nothing else." would conclude the robot is broken and not come back.

### 5. Absence of friction — 2/5

Concrete inconsistencies and dead surfaces, each verified:
- The Home screen contradicts itself about my absence: headline "You've been away 10 days, Marko" (from `/api/home/briefing`, workspace `lastActive` max = 2026-06-02) while the welcome modal on the same screen says "active yesterday" (from `computeBragSummary`/`pickGlobalLastActive` in `login-briefing-brag.ts`, fed by a different lastActive source refreshed by the cron's own memory writes). Two recency definitions, one screen, opposite stories.
- The welcome modal appears overlaid on Memory Center (03), Skills Hub (04), and the badge close-up (04b) — it obscures the very evidence those captures exist to show. If `LoginBriefing` fires on every route entry rather than once per session, that's a real bug; either way the friction is in the evidence.
- Test artifacts leak into three user-facing surfaces: suggested actions (PHASE_B_OK), memory frames (hive-write-proof.md prompt), and the install audit trail (`e2e-test-skill-1776393828953`, `e2e-read-test` rows dated the same day as judging).
- Empty surfaces presented as features for a "returning user with real data": Agent Center (0 agents), Evolution tab (0 runs).
- Memory Center offers kind/confidence filters while the data contains exactly one kind (`fact`, 16/16) and one source (`user_stated`, 16/16) — filters ahead of any data that could exercise them.

---

## Numbered complaints (concrete, actionable)

1. **04b fails to evidence the badge.** The "agent · review" badge screenshot is fully covered by the LoginBriefing modal. I verified the provenance only via `GET /api/skills` (`presentation-design` → `initiator: "agent"`) and the file frontmatter. Recapture, and audit whether `LoginBriefing` mounts on Memory Center / Skills Hub navigation instead of once per session on Home.
2. **Same-screen recency contradiction.** "You've been away 10 days" (briefing headline) vs "active yesterday" (modal brag line). Fix: `pickGlobalLastActive` in `apps/web/src/lib/login-briefing-brag.ts` should consume the same user-activity timestamp the briefing greeting uses, not workspace timestamps refreshed by cron-driven memory writes — machine activity is not "active."
3. **Test junk in suggested actions.** `/api/home/briefing` `suggestedActions` includes "Resume: Reply with the literal string PHASE_B_OK and nothing else." and "Resume: Compare two recent memory frames briefly. List 2 trade-offs." The resume engine needs a junk/length/recency filter before surfacing session titles as next actions.
4. **Memory pollution + false provenance.** Four duplicate "User identity: Name: Marko" frames (ids 36/37/38/41, three already deprecated but still accumulating); a user *question* stored as "User preference" (id 39); "Monthly Agent Assessment" frames (ids 35/40) are concatenations of assessment text + test prompts + slash commands, all stamped `source: "user_stated"` despite being system-generated. Consolidation should dedup identity facts and system writes must carry a system/derived source label.
5. **Duplicate "I remember" hero items.** The modal (01) lists "Session (2026-04-30): What is sovereign AI — 4 messages" twice, once "yesterday" and once "1w ago" — the flagship memory moment shows a dedup failure with mutually inconsistent ages for the same session.
6. **Provenance defaults dilute the badge.** `skills.ts` (~line 352): "Absent provenance ⇒ legacy ⇒ 'user'" — 19 stock/built-in skills all report `initiator: "user"`. If everything defaults to "user," the user-vs-agent distinction the badge sells is unfalsifiable for pre-existing content. Legacy/bundled skills should be labeled `built-in`, not attributed to the user.
7. **The showcase agent skill predates its own audit trail.** `/api/audit/installs` (11 rows, earliest 2026-05-17) contains no install row for `presentation-design`. "Every skill write is provenance-stamped and audited" holds only post-P5/D4; either backfill an audit row for legacy skills or scope the claim in the UI.
8. **Self-evolution has zero runtime evidence.** `/api/evolution/runs` → 0 runs; `/api/agents` → 0 agents; the agent's own monthly assessment reports 0 interactions and 0 skills installed. For a demo whose thesis is "it keeps getting better," ship the returning-user profile with at least one completed evolution run and one live agent, or the Evolution tab and Agent Center actively disprove the pitch.
9. **Onboarding personalization not persisted.** Step 1 collects Role/Industry/work-type and promises tailoring; `/api/identity` for the configured user has `role: ""`, `department: ""`, `personality: ""`. Wire the wizard's answers into the identity record or drop the "tailor how it helps" copy.
10. **Governance surface shows test artifacts.** The install audit trail — the trust surface — leads with `e2e-test-skill-1776393828953` / `e2e-read-test` uninstall rows. Test fixtures should be namespaced out of the user-visible trail.

*Meta-note on the evidence pack: screenshots 02, 04, 04b, 05, 06, 07, 12, 13 were supplied at ~360px and are largely illegible; all detail claims for those screens were verified via API instead.*

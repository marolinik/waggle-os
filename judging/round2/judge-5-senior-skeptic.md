# Judge 5 — Senior Engineer / Professional Skeptic

**Persona:** 15 years shipping products. I assume "AI that learns" is inflated until the UI or API proves it. I read every screenshot at full resolution, then pulled a Bearer token and audited the live sidecar APIs (`/api/home/briefing`, `/api/home/overnight`, `/api/memory`, `/api/memory/stats`, `/api/identity`, `/api/skills`, `/api/skills/presentation-design`, `/api/agents`, `/api/automations`, `/api/evolution/runs`, `/api/audit/installs`) and cross-checked against `apps/web/src/lib/briefing-highlights.ts`, `login-briefing-brag.ts`, `LoginBriefing.tsx`, and `packages/server/src/local/routes/home.ts`. Credit is given below where the evidence is real. It often is. That makes the staged parts stand out more, not less.

## Scores

| # | Criterion | Score (1–5) |
|---|-----------|-------------|
| 1 | First-session clarity | **4** |
| 2 | "It knows me" feeling | **3** |
| 3 | Visible agent growth | **2** |
| 4 | Desire to return | **3** |
| 5 | Absence of friction | **2** |

**Total: 14/25 · 12 numbered complaints**

---

## Per-criterion reasoning

### 1. First-session clarity — 4/5

The onboarding (08–11) is the strongest surface in the product, and the mental model it sells is honest:

- 3 steps, progress dots, `Skip setup` and `Skip this step` on every screen. No hostage-taking.
- Step 1 shows a live preview ("Good evening, Marko — your work will be remembered here") that the product actually delivers later — verified, the returning-user greeting matches.
- Step 2 ("Where do you use AI today?") performed a **real detection**: "Claude Code detected — Found 425 items at C:\Users\MarkoMarkovic\.claude". That's not a mock; that path exists on this machine. The 5 import cards (ChatGPT/Claude/Gemini/Perplexity/Other) include the actual export instructions per vendor.
- Step 3's framing — "Each workspace is its own brain — memory, files, and agents stay isolated" — is corroborated by the API: `/api/memory/stats?workspaceId=…` returns genuinely separate per-workspace minds (default-workspace: 11 frames/54 entities/312 relations; new-hive: 0/0/0).
- The privacy claim ("Your memory and data stay on your device") is at least architecturally consistent with a localhost sidecar.
- Win+K palette (12) with `/catchup`, `/decide`, `/review` etc. is discoverable and plainly described.

Why not 5: the first thing a returning user sees (the welcome panel) contains numbers that don't reconcile with each other or the API (complaint 3), and the cockpit invites you to "Continue" a workspace that the same panel says is empty (complaint 8). The model is graspable; the first screen's arithmetic isn't.

### 2. "It knows me" feeling — 3/5

The machinery is real. The lived evidence is half genuine, half staged, and the hero presentation shoots itself in the foot.

**Real (verified):**
- `/api/identity`: configured 2026-04-16, name/role/department persisted, updated today. The "214 people, projects & things it knows" headline equals the personal `entityCount` **exactly** (214) — that's real harvested knowledge-graph data, not a vanity number.
- Memory Center (03) statuses are not decoration: the store contains frames in `active`, `archived`, and `deprecated` states, and the transitions actually happened (frame 39, a junk "User preference" misclassification, was deprecated on 06-11 — the correction loop works).
- Workspace memories for writer-demo-anya are substantive: brand-voice rules, an editorial decision with approver and date, newsletter metrics with `tool_verified` source. The chat resume (07) renders a decision record consistent with those frames.

**Not earned:**
- Two of the three flagship "I REMEMBER" items on the welcome panel (01) are frames the system itself has **deprecated** (writer-demo frames 9 and 10, status=deprecated via API), and one of them is junk ("User asked: Review recent decisions and next steps" — a logged query, not a memory). The highlight ranker (`briefing-highlights.ts`) has no status field at all. The product leads with memories it has disowned.
- "You've been away 10 days, Marko" is contradicted by its own store: personal frames written 2026-06-11 13:47 and 14:17, and an agent created 2026-06-12T18:59 — 42 minutes before the briefing timestamp (19:41Z).
- The richest memories live in a workspace literally named "Writer demo — Anya", and all 11 of its seed frames were created in the **same second** (2026-05-27 23:49:49). Staged.
- The organically-grown personal mind is 14 frames, of which 10 are duplicate zero-data self-assessments (see criterion 3).

A 3: persistent, user-visible, correctable — proven. "It knows me" as a lived feeling — propped up by seeded demo data and undermined by the deprecated-highlights bug.

### 3. Visible agent growth — 2/5

The mission promises a self-evolving agent. Here is the full inventory of growth evidence on this install:

**Real (credit where due):**
- The `presentation-design` skill is genuinely agent-authored: frontmatter reads `initiator: agent`, `source: chat-session` (verified via `/api/skills/presentation-design`), and the Skills Hub renders an "agent · review" provenance badge (04b). One real, traceable, agent-created artifact. This is the single best piece of evidence in the product.
- `/api/audit/installs` is a real governance trail with risk/trust/approval taxonomy, and 4 of its 8 entries are **agent-initiated** capability proposals (`initiator: "agent"`, `action: "proposed"` — filesystem ×3, github connector). The agent demonstrably asks for capabilities.

**Vapor:**
- The Evolution screen (13) — the flagship self-evolution surface, copy: "Your agent improves itself here… nothing changes without you" — is an empty state. `/api/evolution/runs` → `{"runs":[],"count":0}`. Zero runs, ever, in a store whose data goes back to April.
- The Agent Center's only agent ("Editorial Critic") was created by the **user** (`createdBy: "user"`) at 2026-06-12T18:59 — minutes before judging — and has never run: status idle, runs never, avg success "—".
- The "Monthly Agent Assessment" memories are self-evaluation theater: every copy reads `Interactions: 0, Correction Rate: 0.0%`, and concludes "Strengths: Low correction rate". An agent grading itself A+ on a test it never sat. There are **ten duplicate copies** of this in a 14-frame personal mind.
- None of the agent's 4 capability proposals were ever approved or installed; the loop has never closed.
- "Shares knowledge across workspaces": no evidence found on any screen or endpoint.

Mechanism exists; growth has not happened. One real artifact keeps this off the floor: 2.

### 4. Desire to return — 3/5

The retention loop is engineered on the right axis — value, not dark patterns — but the value delivered is thin and partly self-referential.

**Real (verified):**
- "Overnight: 9 memories consolidated / 0 artifacts created / 5 automations completed" is computed from a real audit-event store (`home.ts` `readAuditCounts`, `memory_write` + file-write `tool_call` events over a 24h window). I reconciled the "5 automations": exactly 5 schedules have `lastRun` inside the window (Harvest sync, Memory compaction, Memory consolidation, Morning briefing, Task reminder). The honest "0 artifacts created" — displaying a zero rather than hiding it — is to this product's credit.
- The suggested action ("Resume: Review recent decisions and next steps") deep-links to a real pending task in writer-demo-anya (`pendingCount: 1` in the briefing API), and quick-capture is one keystroke away.
- No dark patterns anywhere: "Don't show again" on the welcome panel, skips throughout onboarding, autonomy is opt-in ("guided").

**Thin:**
- All 5 "overnight" completions fired in a single burst at 01:05:57–58Z (3:05 AM local, same second) — a catch-up burst, not a humming overnight workforce. And what did the night shift produce? Memory compaction and consolidation whose visible output is… another duplicate zero-data Monthly Assessment frame (id 42, written 06-12 18:36). "9 memories consolidated" is a raw count of `memory_write` events, several of which were the agent re-writing its own junk.
- The thing that would actually pull a user back — an artifact, a drafted newsletter, a completed task — is exactly the number the panel honestly reports: 0.

Honest loop, weak payload: 3.

### 5. Absence of friction — 2/5

For roughly one hour of adversarial inspection across 9 screens and 11 endpoints, I logged 12 concrete defects (below), including same-screen numeric contradictions, a false hero greeting, past-due "next up" schedules under a 100% success banner, and one flaky API response. Each one is small; together they are exactly the credibility tax a memory product cannot afford. 2.

---

## Numbered complaints (all concrete, all actionable)

1. **Welcome panel showcases deprecated memories.** 01-home-welcome-back.png: 2 of 3 "I REMEMBER" highlights are writer-demo-anya frames 9 & 10, both `status: "deprecated"` (verified via `GET /api/memory?workspace=writer-demo-anya`); one is junk ("User asked: Review recent decisions and next steps"). Root cause: `apps/web/src/lib/briefing-highlights.ts` — `BriefingFrameLike` has no `status` field and `selectBriefingHighlights()` never filters; `LoginBriefing.tsx:128` feeds it a canned `searchMemory('important decision project plan', 'global')`. Filter `status === 'active'` before ranking.

2. **"You've been away 10 days, Marko" is false.** The store shows personal frames written 2026-06-11 13:47:56 and 14:17:58 (ids 39, 40), and the Editorial Critic agent created 2026-06-12T18:59:26 — 42 minutes before the briefing timestamp (2026-06-12T19:41:46Z). The greeting derives only from workspace chat `lastActive`. Either compute away-time from max(any activity) or say "last chat 10 days ago".

3. **Headline memory count doesn't reconcile with anything.** Welcome panel says "17 memories … across 3 workspaces" while its own cards show 11 (Default) + 0 (New Hive) (+11 writer-demo). `/api/memory/stats` gives personal=14, +default=25, all minds=36 — no combination yields 17. One screen, three mutually inconsistent numbers.

4. **Personal memory is 71% duplicate junk.** 10 of 14 personal frames are copies of "Monthly Agent Assessment" (5× 2026-04, 5× 2026-05; created 05-02 through 06-12), each reading `Interactions: 0 / Correction Rate: 0.0% / Strengths: Low correction rate`. The assessment automation re-writes duplicates on every run and grades itself on zero data. Two of these render as the top cards in Memory Center (03-memory-center.png).

5. **Provenance mislabeled.** Every automation-generated assessment frame carries `source: "user_stated"`. The user never stated them. This corrupts the exact trust signal the Memory Center's filter UI sells (the seeded demo data, ironically, gets it right with `tool_verified` on metrics frames).

6. **The self-evolution surface has never run.** 13-memory-evolution.png is an empty state under the copy "Your agent improves itself here"; `GET /api/evolution/runs` → `{"runs":[],"count":0}` on an install with two months of history. The superpower is a promise, not a record.

7. **Automation Center shows stale/past schedules under a "100%" banner.** 06-automation-center.png "NEXT UP" lists 6/12 3:30 AM / 4:00 AM / 5:00 AM — ~16 hours in the past at capture time. `GET /api/automations`: "Prompt optimization" `nextRun: 2026-04-17` (two months stale, `lastRun: null`); "Memory lane extraction" overdue with `lastRun: null`. Never-ran and overdue jobs are invisible to the "Success rate (recent runs): 100%" headline. Also UI says 12 active + 1 paused; the API returns 13 with no enabled/paused field exposed.

8. **Resume card to an empty workspace.** 02-home-cockpit.png: "YOU WERE WORKING ON — New Hive, 10d ago, Continue" for the same workspace the welcome panel calls "Nothing here yet — start a chat and I'll remember it" (0 memories, 0 sessions; `stats?workspaceId=new-hive` → 0 frames). "Working on" should require content.

9. **The only agent is judging-day staging.** Agent Center's "Editorial Critic": `createdBy: "user"`, `createdAt: 2026-06-12T18:59:26Z`, never executed (idle, runs never, avg success "—"). As evidence for "real agents," this is a prop placed on the set an hour before the audience arrived.

10. **Agent-authored skill bypasses the install audit.** `presentation-design` (initiator: agent — the product's best artifact) has no entry in `/api/audit/installs` (8 entries; only `smoke-test-skill`'s creation is audited). The governance trail advertised by the Audit tab doesn't cover the one capability the agent actually authored.

11. **Flaky memory listing.** My first `GET /api/memory?limit=50` returned `{"results":[],"count":0}`; the identical call minutes later returned all 14 frames. Observed once, not reproduced — but if the Memory Center hits this race, the user sees "no memories" in a memory product.

12. **Dedup misses live duplicates.** writer-demo frames 8 and 11 ("I always work with a draft → critique → rewrite loop…") are both `active` (created 05-27 and 06-02). The briefing code works around this with a first-line-hash dedup whose own comment admits "consolidation re-writes the same fact as a fresh frame" — the workaround is in the view layer instead of fixing the store.

---

## Bottom line

This is not vaporware — the substrate (per-workspace SQLite minds, a 214-entity knowledge graph, correctable memory statuses that have actually been exercised, real tool-detection at onboarding, a genuinely agent-authored skill with end-to-end provenance, an audit trail with agent-initiated proposals) is real and verifiable, which is more than most "AI that learns" products survive. But the two superpowers are unevenly proven: **memory** is real machinery presenting staged and self-polluted evidence through a hero panel that showcases its own deprecated frames; **self-evolution** is one real artifact standing in front of an evolution log with zero entries, an agent that has never run, and a self-assessment loop that praises itself on zero data. Ship the substrate's honesty all the way up to the welcome screen and criterion 2 and 3 become 5s. Today, the skeptic's verdict: the receipts exist in the database; the storefront oversells them.

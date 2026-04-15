# Memory Harvesting — Strategy, Action Plan, and UX

**Author:** Waggle OS research series (3 of 7)
**Drafted:** 2026-04-15 (overnight batch)
**Scope:** End-to-end strategy for memory harvesting in Waggle OS — what it is, why it's a P0 moat, how users experience it today, how they *should* experience it, and the sequenced action plan to get there.

---

## TL;DR

Memory Harvest is Waggle's **lock-in moat.** Free forever as a Free-tier feature because the value compounds the longer someone harvests: their assistant gets *smarter about them*, and that smartness cannot be migrated to ChatGPT/Claude without leaving it behind. Per memory: "Memory + Harvest is free forever (lock-in moat). Agents are free (they generate memory). Skills and connectors are the upgrade trigger."

Today Waggle ships **9 adapters** (chatgpt, claude, claude-code, claude-desktop, gemini, plus markdown / plaintext / pdf / url / universal), with **perplexity just shipped in session S3**, and 156+ real Claude Code frames harvested in production per prior memory. The core pipeline is solid — `packages/core/src/harvest/pipeline.ts` handles universal-import → classification → extraction → distillation → frame save with dedup. What's missing is **UX polish that makes harvest feel like a superpower rather than an import chore.** This document lays out the current state, the target state, the six UX principles that should govern every harvest surface, and the phased action plan to get there across Q2 and Q3 2026.

---

## 1. Why Memory Harvest is strategic, not just a feature

### 1.1 The lock-in thesis

Every AI user has a shadow-corpus of conversations — hundreds to thousands of exchanges — scattered across ChatGPT, Claude, Gemini, Perplexity, Cursor, and (for serious users) local markdown notes. Today that corpus is an asset that benefits *the tool vendor*, not the user. When the user switches tools, they leave it behind.

Waggle's bet: **the user owns their corpus**, Waggle makes it portable and searchable, and the assistant that uses it gets smarter at a compounding rate. Once a user has harvested 1,000+ frames into Waggle, switching back is psychologically expensive even if the competitor is free — because those 1,000 frames become part of the user's working identity.

This is the same lock-in mechanic that made Gmail, Evernote, and Notion sticky. The difference: Waggle's memory is structured (entities + relations + sessions + conflicts), not just a pile of messages.

### 1.2 Adjacent strategic wins

- **Memory Harvest defends the EU AI Act compliance positioning.** Every harvested frame has provenance (source, importedAt, originalId). That's exactly the data trail Art 10 (data quality) and Art 12 (logging) auditors ask for.
- **Memory Harvest is the demand-gen wedge for KVARK.** Enterprise buyers see the "free, local, harvest from everywhere" motion in Pro/Teams, then when they realize they can do this on-prem at firm scale with full audit, that's the KVARK conversation.
- **Memory Harvest is the training data moat for evolution.** The harvested corpus is the input to EvolveSchema — the more a user harvests, the better their personalized prompts evolve.

---

## 2. Current state (April 2026)

### 2.1 What's shipped

| Adapter | Source export format | Production-tested? |
|---|---|---|
| chatgpt | JSON (OpenAI data export) | ✅ via prior sessions |
| claude | JSON (Anthropic data export) | ✅ |
| claude-code | CLI session logs | ✅ 156 frames in production |
| claude-desktop | Claude desktop app export | ✅ |
| gemini | JSON (Takeout + API history) | ✅ |
| perplexity | JSON (threads/messages) | ✅ shipped S3 |
| markdown | Any .md tree | ✅ |
| plaintext | Any .txt tree | ✅ |
| pdf | pdf-parse | ✅ |
| url | fetch + readability | ✅ |
| universal | Generic conversation arrays | ✅ |

### 2.2 What's missing

- **Cursor adapter** — IDE-scoped export with code-context attachments. Estimated 0.5-1 day. On the backlog.
- **Copilot adapter** — blocked on GitHub shipping a first-class export API for Copilot Workspace / Copilot Chat.
- **Grok adapter** — nice-to-have; XAI export format is stable enough to implement.
- **Notion / Evernote / Bear / Obsidian (beyond raw md)** — structured note exports with backlinks.
- **Voice / video transcripts** — Fathom, Fireflies, Granola. Different data shape (speaker turns with timestamps).
- **Email / calendar** — Gmail takeout, ICS feeds. Harder privacy surface.

### 2.3 Pipeline state

- `packages/core/src/harvest/pipeline.ts` orchestrates: adapter.parse → classifier (work/personal/technical, high/medium/low/skip) → extractor (decisions/preferences/facts/knowledge/entities/relations) → distillation → frame save → KG linkage
- Dedup: multi-layer — exact content match, normalized match, embedding cosine similarity (>0.95 threshold), cross-mind check (personal ↔ workspace)
- Provenance: every frame carries `originalSource`, `originalId`, `importedAt`, `distillationModel`, `confidence`, `pass`
- Auto-sync: poll stale sources every 30 minutes (per `packages/server/src/local/index.ts` runHarvestAutoSync)

### 2.4 UX state today

From the onboarding wizard (`apps/web/src/components/os/overlays/OnboardingWizard.tsx`) and the MemoryApp:
- Users can import via a file-picker after onboarding
- There's a harvest manager page
- Status visibility: frames-imported count per source, last-synced timestamp

**What's missing from the UX:**
- No first-run "harvest-first" onboarding. New users land in an empty Waggle and have to go *find* the import tool.
- No progress indicator during a large import (imagine 10,000-frame ChatGPT export — users see a spinner and wonder if it's hung)
- No deduplication-preview ("found 156 new frames, 40 already known") — just a done message
- No live cognify streaming — frames arrive in batches after full parse completes
- No recovery from partial failures ("imported 847/1200 then network dropped — here's where to resume")
- No identity-auto-populate during first harvest ("I see you mentioned your team is 5 people — is that still right?")

---

## 3. Target state — six UX principles

These are the design principles every harvest surface should honor:

### 3.1 Principle 1: **Harvest-first onboarding.**

First-run experience should be: *connect your first source, see the first insight, be hooked.* Not "click around the empty app for 10 minutes first."

Concrete: onboarding step 2 (after tier selection) is "Where does your AI life live today?" with 6 big tiles — ChatGPT, Claude, Gemini, Perplexity, Cursor, Markdown files. Users click one, drop a file, see frames stream in live.

### 3.2 Principle 2: **Privacy is the headline.**

Every harvest surface repeats the same four words above the fold: **"Your data stays here."** With a one-click "where does this go?" that explains: local SQLite file, not uploaded, not shared, you can export or wipe anytime. Screenshot-ready.

### 3.3 Principle 3: **Dedup is a feature, not a footnote.**

Users should *see* their assistant getting smarter. After an import: "Found 847 frames. 203 were already known (deduplicated). 644 new. Of those, 89 mention people you already know — linking now…" That paragraph is worth 10× the marketing impact of "import successful."

### 3.4 Principle 4: **Progress is tactile.**

No silent spinners. Every harvest shows:
- Phase (reading / classifying / extracting / distilling / saving / linking)
- Progress bar per phase
- Live frame count climbing
- Current item title ("processing: '2025 Q3 strategy call with Samantha'")
- Cumulative ETA based on per-item rate

### 3.5 Principle 5: **Recovery is resumable.**

If a 10,000-frame import dies at 7,423, the next retry picks up at 7,424. Idempotent dedup makes this safe. Status: "Resuming from frame 7,424 of 10,000…" not "restart from scratch."

### 3.6 Principle 6: **Identity and awareness auto-populate.**

During first harvest, Cognify extracts people/projects/preferences. The wizard's next step is "Here's what I learned about you. Correct anything wrong." — inline editable entity list.

---

## 4. User journeys

### 4.1 First-time user, 10-minute onboarding

1. **0:00** — download + install Waggle
2. **0:30** — "Welcome. Your AI remembers you. Where does your AI life live today?" → ChatGPT tile selected → user drags in `conversations.json`
3. **1:00** — live-view: "Reading… 1,247 conversations. Classifying…" — frames stream into the Memory app visible on the right
4. **2:00** — first frame card lights up. Confetti micro-interaction (subtle, not gauche).
5. **2:30** — "While that finishes, let's add a second source" → Claude tile, drop → same flow, merged into the same mind
6. **5:00** — both imports complete. "Found 2,134 frames. 487 duplicates removed. Linked 143 people, 87 projects, 52 technologies."
7. **5:30** — "Here's what I know about you so far. Correct anything." → editable entity grid: "Your company: Egzakta (✏️), Your role: CEO (✏️), Projects: Waggle OS, KVARK (✏️)…"
8. **7:00** — user corrects a couple of things, clicks "this looks right"
9. **7:30** — "Now try asking me something you've discussed before. I'll pull the context." → chat opens with a prefilled example: "What did we decide about the tier pricing?"
10. **8:00** — assistant responds with a real answer citing real frames from the harvest. User's face: 😮

That's the hook. The emotional beat at 8:00 is the whole game.

### 4.2 Ongoing power user — weekly drift

- Every 30 min, background auto-sync polls each registered source for new content
- When new content arrives, it's cognified silently
- A "memory grew" badge appears on the MemoryApp with a count: "+17 frames this week"
- Click → see the new frames with source attribution + any conflicts flagged (write-path contradiction detection from Gap K fires here)
- One-click "dismiss" marks them normal; "promote" escalates importance

### 4.3 Team knowledge worker — shared mind

- User invites 4 colleagues to the workspace
- Each colleague harvests their own ChatGPT/Claude
- Team-scoped frames merge (with per-frame attribution — "Alice imported this from her ChatGPT on 2026-04-10")
- Shared KG: entities mentioned by 2+ team members light up as "canonical"
- Conflict detection (Gap K): if Alice's harvest says "we chose Postgres" and Bob's says "we chose SQLite," a flag surfaces on the next team-mind search

---

## 5. Privacy surface — the explanations users need

Every harvest action needs an accompanying explanation, not buried in a TOS. These should be inline UI copy:

**During import:**
> "This file is being read on your machine. The conversations are parsed into memory frames in your local `.waggle` folder. No data is uploaded to Waggle, Anthropic, OpenAI, or any third party. (Except the LLM you configured for distillation — by default the cognify step uses your local LLM if one is configured, else falls back to your configured cloud provider via LiteLLM.)"

**After import:**
> "Your memory is at `~/.waggle/minds/personal.mind`. It's a SQLite database. You can copy it, back it up, export as JSON, or delete it anytime. There's no cloud sync unless you explicitly enable a team workspace."

**For the privacy-paranoid user:**
- Settings → Privacy → "Show me exactly what leaves my machine" → opens a panel listing every network egress: LLM provider, time, token count, purpose.
- "Run entirely offline" toggle → disables all LLM providers, switches to Ollama/local-only mode.

### The trust chart

A single screen at `Settings → Privacy → How this works` with five rows:

| Data class | Stored | Left machine? |
|---|---|---|
| Raw harvest imports (conversations.json etc.) | `.waggle/imports/` | No |
| Distilled frames | `.waggle/minds/*.mind` | No |
| LLM calls for distillation + chat | routed via LiteLLM to your configured provider | Yes — to the LLM provider you chose |
| Telemetry / analytics | disabled by default | No unless opted in |
| Team sync (only if team workspace enabled) | team-scoped frames only | Yes — to the team server you configured |

Crisp, honest, shows both what happens on-device and what leaves. This single screen is worth its weight in trust.

---

## 6. Action plan — phased

### Phase A (1 week) — ship the first-run hook

- Harvest-first onboarding wizard (replaces step 2 of current wizard)
- Live-view streaming frame counter (wire `harvest/pipeline.ts` progress events to SSE → React)
- Post-harvest identity-auto-populate screen
- Dedup summary message ("Found N new, M duplicates removed")
- Privacy headline above every harvest button

**Dependencies:** Fastify SSE endpoint + React component. No new backend logic — pipeline already tracks counts.

### Phase B (1 week) — ship the reliability layer

- Resumable harvests (checkpoint every 100 frames, retry from last checkpoint on failure)
- Partial-failure UI ("imported 847/1,200 then failed. Resume? Skip the problematic item? Cancel?")
- Conflict-flag surface in live view (Gap K's write-path contradiction detection gets rendered inline)
- "Memory grew" badge on MemoryApp with weekly count

### Phase C (2 weeks) — ship the missing adapters

- **Cursor adapter** (0.5-1 day) — top ask from Developer persona
- **Notion adapter** (1 day) — serves Knowledge Worker + Researcher + Prosumer
- **Obsidian adapter** (0.5 day, trivial — vault is already markdown)
- **Grok adapter** (0.5 day) — XAI users are small but vocal

### Phase D (2-3 weeks) — ship the auto-sync advanced features

- Per-source auto-sync cadence controls (hourly / daily / weekly / manual)
- Smart conflict merge UI (Gap K flags → user reviews → accept/reject/merge)
- Identity drift detection ("You mentioned 'Egzakta' 40 times 3 months ago, 5 times last month — still active?")
- Harvest health report (a weekly email / dashboard: "Your memory grew 247 frames this week, 89 new entities, 34 new relations.")

### Phase E (ongoing) — harder data shapes

- Voice/video transcripts (Granola, Fathom, Fireflies) — different frame-per-turn mechanics
- Email / calendar — privacy surface is heavier, needs careful onboarding
- Slack / Teams chat history — per-channel selection
- Enterprise knowledge bases — Confluence, SharePoint, Google Drive (MCP connectors already cover this for query; harvest = bulk index)

### Phase F (Q3+) — export / portability

- "Export everything" button (JSON + raw source files)
- Import from another Waggle instance (user moves laptop)
- Backup to user-chosen cloud (Dropbox / Drive / S3) — user manages credentials
- Sync between two Waggle installs on different machines (same user) — harder, needs conflict protocol

---

## 7. Metrics that should drive roadmap priority

- **Activation rate** — % of new users who harvest ≥1 source in the first session (target ≥60%)
- **Retention differential** — 30-day retention for users with harvest vs without (hypothesis: 2-3x)
- **Frames per user** — median + p95 (track growth month-over-month)
- **Time-to-first-insight** — seconds from install to first relevant memory-backed answer (target ≤5 min)
- **Source diversity** — median number of distinct sources per active user (target 3+; correlates strongly with retention)

These are instrumented in `packages/core/src/mind/telemetry.ts`. The dashboard for these metrics is itself a P1 backlog item.

---

## 8. Competitive positioning of harvest specifically

| Competitor | Harvest story |
|---|---|
| ChatGPT | Can import custom instructions / files for grounding, but no cross-tool harvest. Memory stays inside ChatGPT. |
| Claude Projects | Project-scoped knowledge bases; no cross-app harvest. |
| Notion AI | Can ingest pages you already have in Notion. Doesn't ingest external AI conversations. |
| mem0 | API-first. Developers integrate into their app. No end-user harvest UI. |
| Letta | Agents-first. Harvest not the pitch. |
| Rewind AI | Records screen activity. Different data model (frames from OS activity) — interesting adjacency but different user. |
| **Waggle** | **Full cross-tool harvest from 11 sources (Cursor next), local-first, compliance-ready, auto-linking, provenance-aware.** |

**Positioning statement:** "Waggle is the only AI workspace that harvests from every AI you already use, stores it on your machine, and makes it searchable across all of them. Your AI life, unified."

---

## 9. Open questions / decisions for Marko

1. **Harvest-first onboarding vs current tier-first onboarding** — is Phase A a v1 reshuffle (replace current step 2) or a parallel opt-in ("new user? try harvest-first")? Risk of confusion for existing users upgrading.
2. **Anonymous telemetry for activation metrics** — required to drive section 7, but privacy-paranoid users will revolt if on by default. Recommend: off by default, opt-in with "help us make Waggle better" nudge *after* the hook.
3. **Email / calendar as a Pro-tier lock** — they require OAuth and heavier compliance surface. Recommend: Free tier gets 11 current adapters; Pro adds email+calendar+voice-transcripts.
4. **Waggle-to-Waggle sync for user portability** — Phase F is real work. Prioritize against Cursor+Notion adapters (Phase C).
5. **Telemetry exposure** — "Here's what the LLM saw about you when answering" is an explainability feature that 3/7 personas want. Is that a P1 UX item now or a v2?

If you give me directional takes on those 5, Phase A can start Monday.

---

## Closing

Memory Harvest is the wedge. Everything else Waggle does (skills, evolution, compliance, agents, wiki) is *better* because of the harvest corpus, but the harvest itself is the first thing a new user should feel delight from — ideally before the 8-minute mark of their first session. Everything in this plan is in service of shortening that time-to-delight and then compounding the value monthly so churn is structurally low.

The technical pipeline is already strong (9 adapters, dedup, provenance, auto-sync). The gap is entirely UX + 3-4 missing adapters. Both are 1-3 week efforts. Phase A alone would move the "new user hooked in first session" needle measurably.

# SCREENS.md — Per-screen specifications

Companion to `README.md`. Every screen shares the tokens in §7 and the global
patterns in §6 of the README; only screen-specific detail is below. **"Ship"** notes
which variation is the chosen default (others are alternates to wire as routes/state
or drop).

Prototype chrome to ignore when porting: the top **segmented control** (variation
switcher), the **☾ theme button**, and the **"· variation"** labels — all
demonstration-only.

---

## 01 · Home / Cockpit — `home.html`  → **Ship: Variation A (Editorial)**

**Purpose:** the daily landing. Opens with one human sentence, tells the overnight
story, offers one obvious next move.

**Layout:** single centered column, max-width 920px, 46px top padding.
- **Greeting:** mono date row (`--honey`) with a live dot + a **🔥 streak chip**
  (right-aligned pill, `--honey-wash` bg, `--honey-line` border). H1 = Hanken 600,
  clamp(34→52px); the word "ahead" is honey (not italic).
- **Overnight hero card:** radius `--r-xl`, gradient `--surface → --surface-2`,
  `--shadow`, a soft honey radial glow top-right. Mono eyebrow "While you slept"
  (`--intel` dot). Large statement line (Hanken 600, clamp 21→28px) with honey key
  numbers. Row of "run chips" (status dot + label) below.
- **"Pick up where you left off":** 2-col grid of workspace cards (hex avatar,
  title, time, summary, "Continue →", optional status badge).
- **"Waggle suggests":** stacked action rows (tinted icon tile, title, sub, arrow
  that slides on hover).
- **Ask bar:** pill, full-width, honey "+" icon, "⌘K" hint, honey send button.

**Copy (exact):** "Good morning, Mara." / "You're **ahead** of yesterday." ·
"While you slept" · "Waggle finished the **Q2 competitor teardown**, folded **14 new
memories** into the hive, and ran into **one snag** worth a look." · run chips:
"Teardown drafted · 9 competitors", "14 memories consolidated", "2 artifacts created",
"1 export failed".

**Variations:** A Editorial (ship) · B Focus (single centered ask + resume list) ·
C Operator (dense dashboard: overnight stats, active workspaces, up-next, agents,
a risk alert for the failed Salesforce export).

---

## 02 · Chat / agent runtime — `chat.html`  → **Ship: Variation B (Split work canvas)**

**Purpose:** the core work surface. Conversation leads; the agent's thinking, tool
calls, memory writes, and approvals reveal progressively; a live artifact builds in a
side canvas.

**Layout:** context header (workspace hex + name + "142 memories · 9 sources" +
**model pill** "auto · Claude Sonnet" + memory icon) → scrolling thread (max 760px,
narrows to ~620px when canvas open) → composer. **Variation B** adds a right **work
canvas** (~42% width) showing a live-drafting `teardown.md`.

**Thread components:**
- **User message:** `--surface` bubble, asymmetric radius `4px 14px 14px 14px`.
- **Bot message:** hex "W" avatar; "Waggle · Analyst · Claude Sonnet" meta.
- **Activity stream** (the "magic"): collapsible card, `--bg-2`, violet spark icon.
  Header "Worked across memory, web & files · 6 steps · 38s" + chevron. Steps each
  have a colored dot, text, and a **provenance pill** (`⬡ mem://hive · provenance
  kept`, mono, `--intel`). Default-open on the active turn.
- **Approval card:** `--honey-wash` bg, attention border, warning icon, "Approve
  before I leave your machine", mono target `Salesforce › Q2 Pricing`, "Approve &
  export" / "Not now".

**Composer:** rounded box, textarea, attach / "Persona: Analyst" / Tools chips, mono
"⏎ send · ⌘K commands" hint, honey send.

**Interaction:** clicking an activity header toggles its steps. Variation B canvas
has a blinking honey type-cursor on the live draft.

---

## 03 · Workspace — `workspace.html`  → **Ship: Variation A (Overview + tabs)**

**Purpose:** the calm home for one project; makes memory tangible.

**Layout:** header (breadcrumb, 46px hex avatar, title, meta row "1 agent live · 142
memories · 9 sources · updated 2h", "Memory"/"Continue" buttons) → **tab bar**
(Overview · Chat 3 · Memory 142 · Artifacts 7 · Files 12 · Team 4; honey underline on
active) → content. Overview = 2-col grid (1.7fr / 1fr):
- **Left:** summary card; **"What Waggle knows"** (fact rows, each with a hex check
  tile + `⬡ source · when` provenance); **"Recent work"** (artifact rows, ext tile +
  name + provenance + time).
- **Right:** Status card (agent live, model, memories +6 today, 3 to review); Up next;
  Team (avatar rows).

**Memory stays a tab** here (do NOT make the graph the default). Variation B
(Memory-forward, with the knowledge-graph viz) is an **alternate**, not the default.

---

## 04 · All workspaces — `workspaces.html`

**Purpose:** answers "where are all my workspaces?" The full shelf (Home = your day;
this = everything).

**Layout:** header ("Workspaces" + "New workspace"), toolbar (search "…or ask the
agent to find one" + storage filter pills All/Local/Virtual/Team), then **Grid** or
**Table** (segmented). Cards: hex avatar, title, **storage badge** (Local=honey,
Virtual=intel, Team=healthy), summary, meta (memories, "agent live", "N to review",
"Open →"). 8 sample workspaces across all three storage types. A note explains it's
reachable from rail, ⌘K, or any workspace switcher.

---

## 05 · Sidebar + ⌘K — `ia.html`

**Purpose:** the calm spine + the command bar holding all depth.

**Sidebar:** workspace switcher pill (hex + name + chevron) → 5 nav items (Home, Chat,
Memory, Agents & tasks [badge 2], Library) with honey active state (left honey bar +
`--honey-wash`) → "Everything else" → **⌘K tile** → spacer → user row.
**Pro variation** inserts a "Pinned · power tools" group (Agent swarm, Connectors,
Approvals [badge]).

**⌘K palette:** centered modal over a dim/blur scrim; search input + "esc" chip;
grouped results (Jump to / Do / Power tools), each = icon + **plain name** + mono
**subtitle** (technical term) + optional shortcut. First result auto-selected.
**Pro mode** prepends "★ Pinned · Pro" (honey group header + star markers). Hotkey
⌘/Ctrl-K toggles; Esc closes; clicking a result routes + closes.

**Key copy patterns:** "Run a team of agents · waggle-dance · swarm" · "Connect a
tool · MCP servers · 21 tools" · "Launch a coding agent · Claude Code · Cursor · Codex"
· "Tune the agent · GEPA optimizer" · "Secrets · encrypted vault".

---

## 06 · Launcher (AI-OS) — `launcher.html`

**Purpose:** detect & launch external coding agents **into a workspace's shared
memory**. (The shipped app calls this "minimal-viable" — this makes it first-class.)

**Variation A (Launch):** header + platform pill "⌘ macOS · 7 tools scanned"; an
optional **launch-with-a-task** prompt box (with "Sent to: Claude Code, Cursor ·
Ignored by: Claude Desktop"); **Detected** tool cards (Claude Code [Hooks active,
Running], Cursor, Codex [hooks soon], Claude Desktop [no-prompt]) each with
installed/version/path, badges, and **Launch in workspace / Stop / Install·Verify
hooks** actions; **Not installed** group (Hermes, OpenClaw); a **"Running now"** panel
(PID + duration + Stop).

**Variation B (How memory is shared):** a 3-node flow — `Claude Code →
WAGGLE_WORKSPACE_ID → 5 hive-mind hooks → your hive` — plus three cards (recalls on
start / commits as it works / reversible & local) and a provenance example
`⬡ remembered from Claude Code · 14:22 · session a1f9`.

**Implementation note:** the env var `WAGGLE_WORKSPACE_ID` and the SessionStart/Stop/
PreCompact/etc. hooks are real repo concepts — wire to the actual launcher service.

---

## 07 · Storage & Files — `storage.html`

**Purpose:** make the filesystem legible — where a workspace lives (virtual/local/team).

**Variation A (Where it lives):** a "live location" card (hex avatar, "Local · private"
pill) showing the real on-disk tree (`~/Waggle/workspaces/competitive-intelligence/`
→ `hive.mind` 3.2 MB · 142 memories, `files/`, `artifacts/`, `workspace.json`); then
**three storage-type cards** — Virtual (Waggle-managed, intel), Local (a folder on
your machine, honey, "this one"), Team (shared/synced, healthy) — each with a privacy
pill; then a local-first reassurance.

**Variation B (Files):** classic browser — left folder tree, breadcrumb + New
folder/Upload, a file table with a **Source/provenance column** (incl. `board-brief.md`
"made by Claude Code"), and a status bar naming the exact local path.

**Maps to repo `StorageType = 'virtual' | 'local' | 'team'`.**

---

## 08 · Power surfaces — `surfaces.html`

**Purpose:** the long tail on one consistent template, behind ⌘K. Left rail switches
**Tools · Automations · Approvals · Vault · Usage**; main = `.shead` + rows.
- **Tools:** connected integrations (Salesforce/Slack/GitHub), MCP servers (21 tools),
  available connectors.
- **Automations:** scheduled jobs with **working enable/pause toggles**; the failed
  "Q2 pipeline sync → Salesforce" (auth expired) with "Fix & retry".
- **Approvals:** risk-badged action cards (Approve/Deny/Always-allow) + recently decided.
- **Vault:** masked keys (`sk-ant-•••3a9f`) with Rotate/Reveal/Renew; "encrypted,
  never shown to a model".
- **Usage:** spend stat cards, per-model bars, per-workspace breakdown, budget.

Build ONE row/card/toggle component set and reuse — the consistency is the usability fix.

---

## 09 · Marketplace — `marketplace.html`

**Purpose:** skills + connectors + MCP as **one shelf**, agent-searchable, super simple.

**Variation A (Browse & ask):** centered **agent-search bar** ("Describe what you want
to do…" → "Ask the agent"); example chips; **agent-suggestion box** that recommends a
connector + skill + tool, each with a "why" reason and an install button; an
**"N in this workspace" bar** (chips); category filter (All/Skills/Connectors/MCP);
card grid (kind badge, name, desc, install count, Add button).

**Variation B (Inline in chat):** the same picker surfaced mid-conversation — Waggle
offers a missing Salesforce connector with a vault-aware approval ("token goes to your
vault"), then shows the connected follow-up.

**CRITICAL — shared install state ("sync"):** one store powers the grid, the agent
picks, AND the inline card. Type-aware one-click flows with progress→done micro-states:
**skill** Add→Adding…→Added (instant); **connector** Connect→Signing in…→Connected
(~1.1s, token→vault); **MCP** Enable→Enabling…→Enabled. Each fires a toast and updates
the count bar. Installing in any view reflects in all of them.

---

## 10 · Onboarding — `onboarding.html`

**Purpose:** ≤2-minute first-run, ending **inside the work**, not on a blank screen.

**6 steps** (full-screen takeover, progress bar, Back/Skip/Continue):
1. **Welcome** — "The workspace that remembers." local-first reassurance.
2. **About you** — name + role (single-select chips) + team size.
3. **Give it a brain (MODEL GATE)** — two tabs: **API key** (provider chips +
   live-validated key field, "✓ valid", "encrypted in your local vault") OR **local
   model** (detected Qwen running / Llama to pull). **Hard gate: cannot proceed to
   step 6 without one.**
4. **Import** — ChatGPT / Claude / Cursor / Start fresh (imported locally).
5. **Template** — Research / Strategy / Engineering / Sales / Writing / Custom.
6. **First task** — ask field + suggested tasks → opens straight into the workspace.

The model gate is the single most important time-to-first-value fix — its permanent
home is Settings → Models (screen 11).

---

## 11 · Settings — `settings.html`

**Purpose:** calm, progressive-disclosure settings; **Models leads** with failover.

**Layout:** left rail (General · **Models** · Permissions · Plan · Team · Backup ·
Advanced) + a top-right **"Show: Essential / Standard / Everything"** control —
Advanced only appears at "Everything" (progressive disclosure).

**Models (lead):** a banner confirming ≥1 working model; the **"Model pilot" failover
chain** — **Primary** (Claude Sonnet, key set) → trigger "if it errors" → **Fallback**
(GPT-4o) → trigger "when you hit your daily budget" → **Budget** (Qwen local, running);
a **daily budget** input (switch at 80%); read-only provider-key list (manage in
Vault); local models list. **Maps to `defaultModel/fallbackModel/budgetModel` +
`budgetThreshold/dailyBudget`.**

**Other tabs:** General (theme cards, language, local-first on-always, erase data);
Permissions (default approval level radios + always-require list); Plan (Pro trial +
upgrade paths + KVARK); Team (connect a team server); Backup (export/import/encrypted
backup); Advanced (dev mode, telemetry, prompt shape, debug).

---

## 12 · Skill evolution + diffusion — `evolution.html`

**Purpose:** the second moat — skills improve themselves AND spread.

**Variation A (Evolution):** a skill card ("Competitor teardown") with a **version
ladder** v1 71% → v2 84% → v3 91% (best), each a scored bar + note; the v3 carries
"GEPA optimized · judged by 3 models". A "how it improves" explainer (optimizer
proposes, 3-model judge scores, ships only if it wins, old versions kept).

**Variation B (Diffusion):** two maps — a **skill** propagating from Research-synth to
2 agents + 1 teammate; a **tool recipe** (Salesforce export config) spreading across 2
workspaces. Signals `⬡ waggle-dance · skill_share` / `model_recipe`. "Suggest-then-
adopt; secrets stay per-vault."

---

## 13 · Auth (Clerk) — `auth.html`

**Purpose:** simple sign-in, with honest "account is optional / local-first" framing.

**Layout:** split — left brand panel ("Your work follows you, everywhere." + trust
lines: "An account is optional — Waggle runs fully local without one") / right form.
**States:** Sign in (Google/Apple SSO + email/password) · Sign up (with local-first
note) · **Verify** (6-box OTP, auto-advance, backspace nav) · **SSO/enterprise** (SAML/
SCIM note → Teams/KVARK). Continue routes to Home. Build with Clerk components themed
to the tokens.

---

## 14 · Billing (Stripe) — `billing.html`

**Purpose:** frictionless upgrade. **4 states (segmented):**
- **Plans:** monthly/annual toggle (−20%), 3 cards (Solo current / **Pro popular** /
  Teams), honey "Most popular".
- **Checkout:** 2-col — card form (email, card 4242…, expiry/CVC, name, country,
  "encrypted & secure", "Powered by Stripe") + **order summary** (plan row, line items,
  promo, trial-aware "Due today $19", "won't be charged until …").
- **Success:** healthy check ring, "You're Pro.", receipt, "Start using Pro" / "Manage".
- **Manage:** current plan, billing cycle (switch to annual), payment method (VISA
  ···4242, Update), next charge, **invoices** (Paid + PDF), change plan / cancel.

Use Stripe Checkout/Customer Portal where possible; theme to tokens. Pricing: Solo $0
/ Pro $19 / Teams $49-seat.

---

## 15 · Habit loop — `habit.html`

**Purpose:** document the engagement layer — "momentum, not manipulation."

**Content:** a 4-stage loop (Trigger → Action → Variable reward → Investment); then 4
concrete mechanics — **daily streak** (week dots + "12-day streak"), **compounding
memory** ("142 · +14 this week · top 8% by depth"), **while you were away** (variable
reward chips), **gentle nudges** (earned, not spam); closing **ethics note** (anchored
to real value, no dark patterns, all toggle-off-able). The **streak chip also appears
on Home** (screen 01). This is a spec/principles screen — implement the mechanics in
Home/notifications, not as a standalone page.

---

## 16 · App surfaces — `appsurfaces.html`

Six routes on one rail (ship as real routes):
- **Agents** — Working now / Idle / "Run a team of agents" (swarm). Status badges.
- **Room** — work alongside agents **live**: shared stage of turns + participants
  panel (you host, agents live, teammate invited, "everyone shares this memory").
- **Artifacts** — 3-col card grid with ext tiles + **provenance** (incl. "made by
  Claude Code").
- **Mission Control** — hive health: stat row + local services list (memory engine,
  agent runtime, local model, Salesforce sync [auth expired], team sync [not connected]).
- **Timeline** — one chronological activity stream with source tags.
- **Profile** — what Waggle knows about you: name/role, "how I like to work" chips
  (every agent reads these), known-facts list, persona chips. This powers agent behavior.

---

## 17 · Benchmarks — `benchmark.html`

**Purpose:** honest positioning + the one real lab result. **2 views:**
- **Capabilities:** category framing ("They automate tasks. Waggle remembers you.") —
  two cards (Task agents = Claude Code/Codex/Cowork/Hermes/Odysseus vs Waggle = memory
  layer + workspace) + an **11-row capability matrix** (Waggle column honey-highlighted;
  ●/◐/○). Deliberately gives competitors ● on "deep terminal coding" (the last row) —
  credible, not stacked. Labeled "a positioning view, not a lab benchmark."
- **Memory SOTA:** the LoCoMo bars (87.66 / 81.95 / 78.05 / 62.47) + stats (+5.71pp,
  p<10⁻⁵; 92.75% single-hop; 100% local 58–83ms) + method/caveat.

Keep the matrix honest and the numbers accurate to the `hive-mind` benchmark.

---

## 18 · Platform & roadmap — `platform.html`

**Purpose:** the Tauri desktop story + roadmap. **4 views:**
- **Desktop (now):** a desktop-window mock with **macOS ↔ Windows** title-bar toggle
  (traffic lights vs min/max/close), a mini app inside; spec tiles (~12 MB, local,
  auto-update signed/notarized, Win·Mac, Linux soon).
- **Boot:** honey hex mark (pulsing), "Warming the hive…", checklist (memory engine
  ready, local model online, loading workspaces [spinner], restoring session).
- **Coming next:** channel cards — Desktop (now) · Browser extension (beta) ·
  **Messaging (WhatsApp/Telegram/iMessage) — coming next** · **Mobile (iOS/Android) —
  coming next**.
- **404:** big honey "404", "This cell of the hive is empty.", back-to-Home / ⌘K.

---

## Ship-variation summary

| Screen | Ship this | Alternates (wire as routes/state or drop) |
|--------|-----------|-------------------------------------------|
| Home | A Editorial | B Focus, C Operator |
| Chat | B Split work-canvas | A Conversation-first |
| Workspace | A Overview+tabs (Memory = tab) | B Memory-forward graph |
| Workspaces | Grid default | Table |
| Launcher | A Launch (B = explainer) | — |
| Storage | A Where-it-lives + B Files (both real) | — |
| Marketplace | A Browse+ask + B inline (both real) | — |
| Settings | Models-first, Essential default | Standard/Everything levels |
| Evolution / Benchmark / Platform | both views are real tabs | — |

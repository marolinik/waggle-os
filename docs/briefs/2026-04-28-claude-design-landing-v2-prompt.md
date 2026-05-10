# Waggle Landing — v2 Generation Prompt

**Date:** 2026-04-28 PM
**Author:** PM
**Predecessor:** `briefs/2026-04-28-claude-design-landing-setup.md` (v1 generation, completed earlier today)
**v1 prototype:** `https://claude.ai/design/p/019dd47b-ce94-7967-a6b0-89ba751fd303` (kept as audit trail)
**v2 target:** Fresh prototype "Waggle Landing — v2" in same workspace (Waggle Design System inherited)
**Decisions resolved 2026-04-28 PM:**
- A: Implicit competitive positioning (no naming Cowork / Claude Code-non-code / Hermes / Mem0 / Letta directly in copy; positioning by capability description)
- B: Evolution headline ("Gemma 31B = 108.8% Opus 4.6") gets dedicated section, not Proof card
- Technical: fresh prototype, v1 retained for audit trail

---

## §1 — Why v2 exists

v1 framed Waggle as "AI workspace + persistent memory + multi-LLM + EU AI Act audit + Apache 2.0 + Egzakta-backed + 3-tier pricing." That's table-stakes. It missed the actual product story:

- **Cross-workspace work paradigm** — multi-mind layer (personal + workspace + team), cross-workspace read with approval gate
- **Multi-agent orchestration** — WaggleDance package, 4 workflow templates, SubagentOrchestrator, spawn_agent/coordinate_agents tools
- **Multi-session continuity** — sessions with lifecycle (active → closed → archived), gop_id grouping, weaver consolidation
- **Self-improving harness** — evolution stack: Gemma 4 31B with Waggle-evolved prompts = 108.8% raw Opus 4.6 (10 coder questions, 4 blind judges, multi-vendor pool, +91 tokens overhead)
- **Persistent long-running knowledge work** — wiki compiler producing entity/concept/synthesis pages from real corpus
- **Memory import from external systems** — 11 harvest adapters (chatgpt, claude, claude-code, claude-desktop, gemini, perplexity, markdown, plaintext, pdf, url, universal); Cursor + Notion + Obsidian planned
- **OSS bridge to hive-mind** — `packages/core/src/mind/` and `packages/core/src/harvest/` shared with `marolinik/hive-mind` Apache 2.0 substrate
- **Setup integration for external AI tools** — `@waggle/memory-mcp` package exposes memory tools to any MCP-compatible AI agent (Claude Code, Cursor, Codex, Continue.dev, Zed)
- **5-tier pricing** — TRIAL (15d all-unlocked) / FREE (5 workspaces) / PRO ($19/mo unlimited) / TEAMS ($49/seat shared+WaggleDance) / ENTERPRISE/KVARK (consultative on-prem)

Plus competitive positioning (implicit): without naming names, the copy positions Waggle against Anthropic-only ecosystems (Cowork), terminal-first AI coding tools repurposed for non-coding (Claude Code), framework-style agent libraries (Hermes/Mastra/Letta/CrewAI), and memory libraries that require dev assembly (Mem0/Zep/LangMem).

---

## §2 — Paste-ready text for claude.ai/design "Describe what you want to create..." field

The text below is the complete generation prompt. Paste verbatim into the textbox of fresh "Waggle Landing — v2" prototype. Length: ~5800 words.

```
Generate a marketing landing page for Waggle (waggle-os.ai), a workspace-native AI agent platform with persistent memory, model-agnostic orchestration, and skill-extensible capabilities. Backed by Egzakta Group, an advisory practice in DACH/CEE/UK regulated industries since 2010. Companion open-source project: hive-mind memory substrate at github.com/marolinik/hive-mind (Apache 2.0).

The Waggle Design System attached to this prototype encodes 16 ratified sections including dark-first palette, macOS-influenced shell aesthetic, Inter typography, and the hive/honey hex spectrum. Use these tokens and components as the visual foundation. Brand assets in DS: waggle-logo.svg, 13 bee-*-dark.png illustrations (one per workflow theme), hex-texture-dark.png honeycomb pattern.

This is v2 of the landing — v1 covered the basics; v2 adds harvest (cross-tool memory import), multi-agent Room (parallel agents), self-improving harness (evolution stack), and external-tool integration (MCP setup for Claude Code/Cursor/Codex). The wireframe expands from 7 to 12 sections + footer.

================================================================
1. WHAT WE'RE BUILDING — POSITIONING ANCHOR
================================================================

Three-attribute kanonska formula from the repo README:
"Workspace-native AI agent platform with persistent memory, model-agnostic orchestration, and skill-extensible capabilities."

Voice rules (binding across all sections):
- Professional + sovereign, not chirpy startup
- Anti-jargon in headlines (no "cognitive layer" before scroll fold)
- Trust through institutional backing, not marketing momentum
- Honest claims with specifics ("$19", "$49/seat", "since 2010", "108.8% of Opus", "11 adapters")
- Compliance-grade language for regulated audience without alienating consumer audience
- Implicit competitive positioning — describe capabilities competitors lack rather than naming them

Distribution channels: organic search, GitHub (OSS substrate), Hacker News, LinkedIn referrals, legal tech press, banking/insurance compliance newsletters, Egzakta Advisory partner referrals.

Implementation target: apps/www repo (Vite + React 19 + Tailwind 4 + Hive Design System tokens at apps/www/src/styles/globals.css canonical source).

================================================================
2. VISUAL DIRECTION
================================================================

Palette (hive/honey hex spectrum, dark-first locked):
- Background: hive-950 #08090c (mandatory across all sections; light mode is v1.5 stretch, NOT v2)
- Honey accent ladder: 400 #f5b731 / 500 #e5a000 / 600 #b87a00
- Cool secondary: violet #a78bfa / mint #34d399 (status only, sparingly)
- Neutral ladder: hive-50 through hive-950, 11 stops
- Honey gradient backdrop on hero only; rest of sections solid hive-950

Typography:
- Inter as primary typeface (variable font, weight range 400-700)
- Headline scale: 48-64px hero, 36-48px section, 24-32px subhead
- Body: 16-18px main, 14px caption
- Letter-spacing tight on display weights (-0.02em)
- Mono: JetBrains Mono for code snippets and tool/file paths

Layout paradigm:
- Linear + Notion as visual reference points (clean, dense-information-friendly, dark-first)
- 60/40 split heroes with visual right at lg breakpoint, hidden md and below
- Full-bleed proof bands
- 6+6+1 personas card grid at xl breakpoint (queen-bee gestalt with 13th tile centered solo at bottom row)
- Generous vertical rhythm: 32-48px section gaps, 16-24px element gaps
- Honeycomb texture (hex-texture-dark.png) appears as subtle background detail in trust band ONLY at 8-12% opacity, soft-light blend
- macOS aesthetic shell influence: rounded corners, soft shadows, subtle layering — applied to marketing landing, NOT desktop UI mockup

Motion:
- MPEG-4 hero loop placeholder (≤800KB target, 7s duration, prefers-reduced-motion suppression mandatory)
- Bee swarm orchestration motion in personas section (subtle ambient)
- All other motion: hover micro-interactions only, NO scroll-triggered storytelling

Brand asset usage rules:
- waggle-logo.svg: header + footer ONLY
- 13 bee illustrations: personas section ONLY (do NOT scatter across other sections)
- hex-texture-dark.png: trust band background ONLY at low opacity

================================================================
3. SECTION STRUCTURE (binding order, do not reorder)
================================================================

Generate 12 sections + footer in this exact order:

----- SECTION 1: HERO -----

Left-aligned 60/40 split (visual right at lg, hidden md and below). Eyebrow + headline + subhead + body + primary CTA "Download for {os}" + secondary CTA "See how it works →". MPEG-4 loop placeholder on visual right (animated honeycomb diagram with 4 LLM provider chips orbiting central hexagon, "0 cloud calls" stat, frame counter "12,847 edges").

Generate 5 hero variants for per-persona resolution (gated by URL ?p= param or utm_source heuristic). Subheads explicitly mention multi-LLM, harvest, and self-improving angles where natural:

Variant A — Marcus (default)
- Eyebrow: "AI workspace with memory"
- Headline: "Your AI doesn't reset. Your work doesn't either."
- Subhead: "Persistent memory across every LLM you use. Claude, GPT, Qwen, Gemini, your local model — all drawing from the same locally-stored knowledge graph that grows with you."
- Body: "Stop the paste-context-fatigue cycle. Your harvest from ChatGPT, Claude, Cursor, and the rest lives once on your disk, persists across providers, sessions, and machines, and compounds with every conversation you finish."

Variant B — Klaudia (regulated/Egzakta channel, ?p=compliance OR utm_source=egzakta)
- Eyebrow: "AI for regulated industries, finally"
- Headline: "AI workspace that satisfies your CISO."
- Subhead: "Local-first by default. EU AI Act audit reports generated automatically. Sovereign deployment available on your Kubernetes via KVARK."
- Body: "CISO blocked ChatGPT and Cowork? Waggle runs on your laptop. Article 12 logging is built in, not retrofitted. Egzakta has been advising regulated industries in DACH/CEE/UK since 2010 — Waggle is what we ship to them."

Variant C — Yuki (founder/HN channel, utm_source=hn OR ?p=founder)
- Eyebrow: "Shared context for moving teams"
- Headline: "Your team's memory, before someone has to write it down."
- Subhead: "WaggleDance orchestrates parallel agents across shared team mind. New hires onboard against your team's actual decision history — not a stale Notion wiki."
- Body: "Notion goes stale. Slack search is hostile. Your 8-person team's context auto-organizes from the work itself: every conversation harvested, deduplicated, and surfaced when relevant. No one writes the wiki."

Variant D — Sasha (GitHub/developer channel, utm_source=github OR ?p=developer)
- Eyebrow: "Memory substrate for any agent harness"
- Headline: "Memory layer that doesn't lock you to a vendor."
- Subhead: "Apache 2.0 substrate at github.com/marolinik/hive-mind. MCP server exposes memory to Claude Code, Cursor, Codex, Continue.dev. Local SQLite + sqlite-vec, no cloud."
- Body: "Memory libraries need engineers to assemble. Agent frameworks need product work to ship. Waggle is the product, hive-mind is the substrate. Drop-in via MCP: claude mcp add waggle ~/.waggle/mcp-server.js."

Variant E — Petra (legal tech channel, utm_source=legal-tech)
- Eyebrow: "AI for confidential work"
- Headline: "AI that never sees your client matter."
- Subhead: "Local-first. Bar-association friendly. Per-matter audit trail. Enterprise tier (KVARK) deploys to your firm's infrastructure with full data residency."
- Body: "ChatGPT-as-malpractice-risk is a real bar concern. Waggle keeps work on your machine, generates audit logs per matter, and signs every LLM call. Your client matters never cross to anyone's training loop."

----- SECTION 2: PROOF / SOTA -----

Full-width band, 6 cards in elastic responsive grid (3+3 at xl, 3+3 at lg, 2×3 at md, single column at sm). Cards in this exact order:

1. EVOLUTION — "108.8% of Opus 4.6". Subhead: "Gemma 4 31B with Waggle-evolved prompts beats raw Opus 4.6 on blind 4-judge multi-vendor evaluation. Methodology in arxiv preprint." (NEW card — promoted from buried claim to lead proof point)
2. SUBSTRATE — "LoCoMo 74%". Subhead: "Pre-pilot empirical evidence beats Mem0 paper claim (66.9%). Self-judge on synthesized corpus."
3. AGENTIC — "Trio-strict 33.5%". Subhead: "h2/h3/h4 scenarios — real PM, research, and engineering tasks. Methodology published."
4. SOURCE — "Apache 2.0". Subhead: "Fork it, audit it, deploy it on your own infra. No license games, no rug-pull risk."
5. NETWORK — "Zero cloud". Subhead: "Local-first by default. Your work never leaves your device unless you explicitly opt in. Provider routing is signed and traced."
6. COMPLIANCE — "EU AI Act Articles 12 + 14 + 19 + 26 + 50". Subhead: "Logging, human oversight, record-keeping, risk management, transparency. Audit reports generated from work activity, not retrofitted."

----- SECTION 3: HARVEST — Memory across every AI you use (NEW) -----

Eyebrow: "ONE WORKSPACE FOR EVERY AI"
Headline: "Your AI life lives in too many tabs. Waggle reads them all."
Subhead: "11 harvest adapters across the AI tools you already use, plus structured note formats. Your existing context arrives on first install — Waggle doesn't ask you to start over."

Layout: grid of 11 logo tiles (4×3 at xl, 3×4 at md, 2×6 at sm). Each tile has provider name + adapter status. Suggested tile order:

Row 1: ChatGPT (live) — Claude (live) — Claude Code (live) — Claude Desktop (live)
Row 2: Gemini (live) — Perplexity (live) — Cursor (Q3 2026) — Notion (Q3 2026)
Row 3: Markdown (live) — Plaintext (live) — PDF (live) — URL + Universal (live)

Below grid: feature stripe with three claims:
- "Deduplicated on import" — multi-layer (exact / normalized / embedding cosine ≥0.95)
- "Provenance preserved" — every frame carries originalSource, originalId, importedAt, distillationModel
- "Auto-sync every 30 min" — new content appears as a "memory grew +N frames" badge

Lock-in claim block at bottom: "After 30 days, the median user has 1,000+ frames, 20+ skills, 3-5 connectors. Your version of Waggle answers what generic AI can't — because it knows your work."

CTA at section end: "See how harvest works →" anchor to /how-it-works/harvest video walkthrough (placeholder for now).

Anti-pattern note for generation: NO "connect to one tool" SaaS framing. Waggle reads from EVERY tool you use, locally, on first install. Communicate that as the differentiator.

----- SECTION 4: MULTI-AGENT ROOM (NEW) -----

Eyebrow: "WORK PARALLEL, NOT SEQUENTIAL"
Headline: "Your researcher writes while your analyst checks while your editor reviews."
Subhead: "WaggleDance is the multi-agent orchestration layer. Four built-in workflow templates plus custom — research-team (parallel), review-pair (draft + review), plan-execute (plan then execute), coordinator (master delegates, workers execute)."

Visual: macOS-style window mockup showing 3-4 persona tiles running concurrently with status indicators:
- "Researcher · running" (honey ring active, sparkline showing token throughput)
- "Writer · waiting on Researcher" (muted)
- "Analyst · done · 4m ago" (green check)
- "Coordinator · synthesizing" (blue pulse)

Right side: message bus visualization — small chat bubbles flowing between persona tiles labeled with hand-off events ("research_complete" / "draft_ready" / "review_pending").

Below visual: three feature points in a row:
- "Subagent orchestrator" — "Spawn workers from a coordinator, get results, synthesize before next delegation."
- "Cross-workspace handoff" — "Read another workspace's mind with approval gate. Marketing borrows from Engineering. Engineering inherits from Research."
- "Mission Control" — "Run parallel sessions across workspaces. One screen, every active agent, every workspace state."

Short code or tool snippet at bottom for technical buyers:
spawn_agent({persona: 'researcher', task: 'compile sources on...', maxTurns: 20})
coordinate_agents({workflow: 'research-team', participants: ['researcher', 'writer', 'analyst']})

Anti-pattern note: NO "AI does everything" copy. The Room is about putting multiple SPECIALIZED agents to work in parallel — they hand off, they verify each other, they synthesize. The user remains the conductor.

----- SECTION 5: HOW IT WORKS -----

3-step narrative with simple iconography, no jargon:

1. Install once — desktop app (Tauri 2.0 native binary for Windows + macOS), choose your LLM provider(s) — local Ollama, Claude, GPT, your LiteLLM proxy. Waggle starts capturing the moment you begin working.

2. Work normally — use any AI like before, but now memory persists across models, sessions, machines. Switch from Claude to GPT mid-thread; both draw from the same knowledge graph. No paste-tax.

3. Compound, don't repeat — every conversation builds your knowledge graph. After 30 days the median user has 1,000+ frames, 20+ skills, 3-5 connectors. The next prompt starts where the last one left off — and so does the prompt after that.

Each step: 2-3 sentence explanation. NO "cognitive layer" jargon.

----- SECTION 6: SELF-IMPROVING HARNESS (NEW) -----

Eyebrow: "THE HARNESS THAT GETS BETTER"
Headline: "Gemma 4 31B with Waggle's evolved prompts beats raw Opus 4.6."
Subhead: "Evolution stack runs continuously: prompts evolve from your usage, on your machine, never sent to the model vendor's training loop. Headline result: 108.8% of raw Opus 4.6 on blind 4-judge multi-vendor evaluation, 10 coder questions, +91 tokens overhead."

Layout: split 50/50 at lg.

Left side — claim and methodology:
- Big metric callout: "108.8%" (honey accent, oversized)
- Subhead: "of raw Opus 4.6, on Gemma 4 31B"
- Three method bullets:
  • "Multi-vendor blind judge pool" — Haiku + Sonnet + two others, no self-bias
  • "Per-judge geometric mean scoring" — robust to single-judge outliers
  • "Held-out test set" — train/test hard split, no contamination
- Link: "Read the methodology in arxiv preprint →"

Right side — visual prompt diff:
- Header: "Before evolution"
- Code block 1: terse baseline prompt (~60 tokens, generic)
- Header: "After evolution (+91 tokens)"
- Code block 2: longer evolved prompt with scaffolding, examples, structured output guidance — visibly different, evolved-from-usage signal

Below split: three-line closing argument:
"Why model vendors can't match this: their business model forbids customer data crossing the return path to their training loop. Waggle's evolution stack runs on your machine against your real conversations — and the model gets better at what YOU do, not what everyone does."

Anti-pattern note: NO vague "self-improving AI" claims. Specify: 108.8%, blind judges, multi-vendor, +91 tokens, methodology published. Honest about scope (10 coder questions in v1; v2 scaling to 60×3 domains in flight).

----- SECTION 7: PERSONAS — Mascots and Agent Roles -----

Two-tier structure (this is the key restructure from v1):

Tier 1 — Bee mascot grid (workflow themes):
- 13 tiles in 6+6+1 grid at xl (queen-bee gestalt: 13th tile centered solo at bottom)
- Each tile: bee illustration (from uploaded bee-*-dark.png assets) + theme name + 1-line JTBD
- These represent WORKFLOW MOODS, not agent identities. They're how the Waggle workspace feels for different work shapes.
- Tile names locked: Hunter, Researcher, Analyst, Connector, Architect, Builder, Writer, Orchestrator, Marketer, Team, Celebrating, Confused, Sleeping (centered solo)
- Tile hover state: accent_and_boost — honey ring + slight scale, NO inline expansion in v2.

Section headline above tier 1: "Thirteen ways your work feels."
Subhead above tier 1: "Workflow themes for the moods that work takes — chasing leads, shipping code, reviewing the draft, debugging the stuck moment."

Tier 2 — Agent personas grid (backend agent roles):
- Below the bee mascot grid, with separator line and second eyebrow: "OR PICK FROM 17 AGENT PERSONAS"
- 17 personas in a compact 4-row grid (4 + 4 + 4 + 5), text-only tiles (no illustrations needed)
- Each tile: persona name + one-line role + tool pool count
- Personas: researcher, writer, analyst, coder, project-manager, executive-assistant, sales-rep, marketer, product-manager-senior, hr-manager, legal-professional, finance-owner, consultant, general-purpose, planner, verifier, coordinator
- Each persona has explicit tool boundaries (allowlist + denylist), model preference (sonnet/opus/haiku/inherit), workspace affinity, default workflow
- Below grid: "Custom personas via JSON files in ~/.waggle/personas/. Carry across workspaces."

This two-tier structure separates marketing-affective (bees = how work feels) from technical-functional (personas = how agents are configured). v1 conflated the two.

----- SECTION 8: PRICING — Five Tiers -----

5 tier cards (Trial / Free / Pro / Teams / Enterprise) in elastic responsive grid (5-in-row at xl, 3+2 at lg, 2+2+1 at md, single column at sm).

Pricing eyebrow: "PRICING"
Headline: "Free for individuals. Honest pricing for everyone else."
Subhead: "Five tiers. No feature-count games. You pay for the scale of the team using the memory, not for arbitrary check-marks."
Billing toggle: "Monthly" / "Annual save 17%" — applies to Pro and Teams

Trial — $0 / 15 days
- Tagline: "Try everything"
- Audience: anyone evaluating
- Bullets: All Pro features unlocked; All Teams features unlocked; All connectors enabled; 15-day window; Reverts to Free after expiry, your data stays
- CTA: "Start trial"

Solo (Free) — $0 / forever
- Tagline: "For individuals exploring AI workspace"
- Audience: knowledge workers, students, hobbyist developers
- Bullets: Personal mind + 5 workspaces; 11 harvest adapters; Built-in skills (20+); Built-in agent personas (17); EU AI Act audit reports; Apache 2.0 substrate
- CTA: "Download for {os}"

Pro — $19/month (or $190/year, save $38)
- Tagline: "For power users compounding across projects"
- Audience: senior individual contributors, consultants, founders
- Bullets: Everything in Free; Unlimited workspaces; Marketplace access (120+ packages); All 12 native connectors; 148+ MCP catalog; Advanced evolution tab; Priority sync across multiple devices; Email support 48h SLA
- CTA: "Start Pro"

Teams — $49/seat/month (or $490/seat/year, save $98), 3-seat minimum
- Tagline: "For teams that want shared memory without losing privacy"
- Audience: small teams (3-50 seats) in regulated industries, dev teams with shared codebases, advisory practices
- Bullets: Everything in Pro; Shared team mind; WaggleDance multi-agent coordination; Governance controls (skill promotion approvals, audit reports per user); Team-level compliance PDF rollup; Dedicated account manager; KVARK bridge for sovereign deployment escalation
- CTA: "Start Teams"

Enterprise (KVARK) — Consultative pricing
- Tagline: "Everything Waggle does — on your infrastructure"
- Audience: Fortune 500, regulated enterprises, sovereign deployments
- Bullets: On-premise / private-VPC deployment; SSO/SAML/SCIM + RBAC; Sovereign LLM routing (your models, your endpoints); Data residency controls; Custom compliance frameworks beyond AI Act; SOC 2 Type II report on request; Professional services engagement; Full data pipeline injection with your permissions
- CTA: "Talk to KVARK team →" (links to www.kvark.ai)

Below cards: tier comparison table (collapsible <details>). Pricing toggle event hook: landing.pricing.billing_toggle.changed{mode}.

Anti-pattern: NO 15+ bullet feature-count tiers. Each tier has 6-8 bullets max. Tiers differentiated by audience role + scale, not feature count.

----- SECTION 9: SETUP IN YOUR TOOLS YOU ALREADY USE (NEW) -----

Eyebrow: "WAGGLE WORKS WHERE YOU WORK"
Headline: "Add Waggle as memory layer to the AI tools you already use."
Subhead: "@waggle/memory-mcp exposes memory tools (search_memory, save_memory, forget_memory) and harvest tools to any MCP-compatible AI agent. Setup in one command."

Layout: tab strip with 5 tabs at the top (Claude Code, Cursor, Codex, Continue.dev, Zed). Default open: Claude Code. Each tab shows a code snippet and 2-line setup explanation.

Tab 1 — Claude Code (default):
Code: claude mcp add waggle ~/.waggle/mcp-server.js
Caption: "Waggle's memory tools become available to Claude Code as MCP tools. Your CLI sessions write to the same mind your desktop app reads from."

Tab 2 — Cursor:
Code: settings → MCP servers → add → "waggle" → ~/.waggle/mcp-server.js
Caption: "Cursor sees your harvested context across every project. Your memory of how you've structured similar codebases informs every Cursor suggestion."

Tab 3 — Codex (OpenAI Codex CLI):
Code: codex config set mcp.waggle ~/.waggle/mcp-server.js
Caption: "Codex queries Waggle for personal coding patterns and prior decisions. Your style preferences carry across sessions."

Tab 4 — Continue.dev:
Code: ~/.continue/config.json → mcp_servers → waggle → executable + path
Caption: "Continue.dev gets persistent project memory in VS Code/JetBrains. Your discussion notes about a function become available next time you touch it."

Tab 5 — Zed:
Code: ~/.config/zed/settings.json → context_servers → waggle → command + args
Caption: "Zed's AI assistant draws from your Waggle memory. Cross-editor context portability without copy-paste."

Below tabs: OSS bridge callout in honey accent box:
"Or get the OSS substrate without the desktop app. Hive-mind is the persistent memory layer underneath Waggle, Apache 2.0 licensed, embeddable in your own product. github.com/marolinik/hive-mind →"

Anti-pattern note: NO framing of Claude Code / Cursor / Codex as competitors. They're complementary surfaces — Waggle adds memory and harvest underneath the AI tools the user already trusts. That's the value: the user keeps their workflow, Waggle adds the persistence.

----- SECTION 10: TRUST BAND -----

Egzakta Group attribution as the spine: "Waggle is built and backed by Egzakta Group, advising regulated industries in DACH/CEE/UK since 2010."

Subhead: "Not a venture-funded startup pivoting through positioning cycles. An advisory practice that has shipped to banks, insurers, and law firms for 16 years."

6 trust signals as horizontal row, in this order (Sovereign → Compliance → OSS → Methodology → Egzakta → Enterprise):

1. Zero cloud transit by default
2. EU AI Act Articles 12 + 14 + 19 + 26 + 50 (logging, human oversight, record-keeping, risk management, transparency)
3. Apache 2.0 open source substrate (github.com/marolinik/hive-mind)
4. Published methodology (arxiv preprint link)
5. Egzakta Group backed (since 2010, DACH/CEE/UK)
6. SOC 2 Type II + RBAC + SSO/SAML/SCIM (enterprise tier via KVARK)

Background: hex-texture-dark.png at 8-12% opacity, soft-light blend.

----- SECTION 11: FINAL CTA -----

Large headline: "Stop pasting context. Start using AI that remembers."
Subhead: "Free for individuals. Pro for power users. Teams for organizations. KVARK for enterprises."
Primary CTA: "Download for {os}" (mirrors hero CTA, OS-detected)
Secondary CTA: "Compare tiers" (anchor to pricing section)
Tertiary KVARK bridge with canonical copy: "Need it on your infrastructure, with full data pipeline injection, your permissions, and a complete audit trail? Talk to KVARK team →" (links to www.kvark.ai)

----- SECTION 12: FOOTER -----

Egzakta attribution line: "Waggle is a product of Egzakta Group. © 2026 Egzakta Advisory."

5 link columns (expanded from v1's 4):

- Product: Download, Pricing, Personas, How it works, Multi-agent Room
- Research: arxiv preprint, Methodology, Evolution Lab, Hypothesis v2, Benchmarks, Changelog
- OSS: hive-mind on GitHub, MCP server setup, Memory architecture docs, Contributing
- Company: About Egzakta, Blog, Press, Contact, Careers
- Legal: Terms, Privacy, EU AI Act statement, Apache 2.0 license, Data Processing Agreement

Below columns: small text "Built calmly across DACH · CEE · UK · v1.0 · waggle-os.ai"

================================================================
4. ANTI-PATTERNS (binding — explicit reject criteria)
================================================================

Generation will FAIL pre-launch review if any of these are present:

- NO SaaS landing clichés: centered hero, feature icon grid, "trusted by [logos of companies that never heard of us]" carousel, CEO quote carousel
- NO "AI does everything" aspirational copy
- NO KVARK pitch beyond one sentence + one CTA in final CTA section AND one card in pricing
- NO bee names used as UI command aliases or section labels (bee illustrations are workflow-mood iconography, NOT command vocabulary)
- NO "cognitive layer" jargon in first three scroll viewports (hero + proof + harvest)
- NO light-mode design in v2 (dark-first locked)
- NO pricing tiers differentiated by feature count (15+ bullets per tier). Tiers differentiated by audience role + scale. 6-8 bullets max per tier.
- NO trust-logos carousel ("As seen in...")
- NO cookie banner blocker, modal overlay popups, exit-intent popups
- NO section reorder
- NO naming Cowork / Claude Code / Hermes / Mem0 / Letta / Mastra / CrewAI / Notion AI / ChatGPT Teams / Glean / Dust.tt / Microsoft Copilot Studio / Salesforce Agentforce as competitors. Position by capability description (e.g., "memory across every AI you use" implies Cowork's Anthropic-only ecosystem; "product, not framework" implies Hermes/Mastra/Letta; "harvest from Claude Code" implies Claude Code integration not replacement).
- NO framing of Claude Code / Cursor / Codex as competitors in §9. They are complementary surfaces — Waggle adds memory underneath the user's chosen AI tools.
- NO vague "self-improving AI" claims in §6. Must specify: 108.8% Opus 4.6, Gemma 4 31B, blind 4-judge multi-vendor pool, 10 coder questions, +91 tokens overhead, methodology in arxiv.
- NO scattering bee illustrations across non-personas sections.

================================================================
5. OUTPUT FORMAT
================================================================

- Single React component tree rooted at apps/www/src/app/page.tsx
- Component-level extraction:
  - <Hero variant="..." /> — accepts variant prop (A through E), renders variant-specific copy
  - <ProofPointsBand /> — 6 cards from apps/www/src/data/proof-points.ts
  - <HarvestBand /> — 11 adapters from apps/www/src/data/harvest-adapters.ts (NEW)
  - <MultiAgentRoom /> — workflow templates + persona tiles + message bus visual (NEW)
  - <HowItWorks /> — 3 steps from inline data
  - <SelfImprovingHarness /> — evolution claim + prompt diff (NEW)
  - <PersonasGrid /> — bee mascot grid + agent personas grid (RESTRUCTURE)
  - <PricingTiers /> — 5 cards from apps/www/src/data/pricing.ts + comparison table + billing toggle (5 tiers, was 3 in v1)
  - <SetupInTools /> — tab strip with 5 tools + OSS bridge callout (NEW)
  - <TrustBand /> — Egzakta attribution + 6 trust signals (was 5)
  - <FinalCTA /> — headline + 3 CTAs
  - <Footer /> — Egzakta line + 5 link columns (was 4)
- All copy keyed under landing.* namespace per i18n contract
- TypeScript strict mode — no any, no @ts-ignore
- Tailwind 4 utility classes — no custom CSS unless impossible; use Hive DS tokens
- Responsive: sm/md/lg/xl breakpoints, mobile-first cascade
- Hero variant resolver: include apps/www/src/lib/hero-headline-resolver.ts mapping URL ?p= param + utm_source heuristic to variants A-E (?p=compliance or utm_source=egzakta → B; utm_source=hn or ?p=founder → C; utm_source=github or ?p=developer → D; utm_source=legal-tech → E; default → A)
- Event taxonomy stub: wire up landing.* events (page_view, section_visible, cta_click for each CTA, pricing.billing_toggle.changed, harvest.adapter_clicked, multi_agent.workflow_clicked, setup.tab_changed, oss.github_link_clicked) — minimal stub, full impl post-generation

================================================================
6. UPSTREAM REFERENCES (respect, do not contradict)
================================================================

- Waggle Design System (16 sections, ratified 2026-04-24) — components and tokens, attached to this prototype as default DS
- Hive DS tokens at apps/www/src/styles/globals.css — canonical color/typography source
- README.md three-attribute formula: "workspace-native + persistent memory + model-agnostic + skill-extensible"
- ARCHITECTURE.md package structure: 16 packages, @waggle/waggle-dance, @waggle/marketplace (120+ packages), @waggle/memory-mcp, MultiMind layer, KnowledgeGraph SCD-2, IdentityLayer, AwarenessLayer
- CLAUDE.md sections 1+5: 5-tier pricing canonical, 17 personas (13 + 4 new), KVARK canonical copy "full data pipeline injection, your permissions, complete audit trail"
- docs/research/06-waggle-os-product-overview.md: TL;DR three-sentence pitch "Your AI remembers. Your data stays yours. Your compliance trail writes itself.", 5-tier strategic function, evolution stack 108.8% claim
- docs/research/03-memory-harvesting-strategy.md: 11 adapters list, lock-in moat thesis, 8-minute first-session hook journey
- docs/research/05-user-personas-ai-os.md: 7 archetypes for cross-persona signal validation
- waggle-cowork/system-prompt-comparison.md: Waggle 8 / Claude Code 6 / Tie 1 score (informs implicit competitive positioning)
- Wireframe v1.1 LOCKED — section structure (this brief mirrors and extends it from 7 to 12 sections)
- Brand voice contract — six clauses (professional, sovereign, anti-jargon, trust-through-institutional-backing, honest-with-specifics, compliance-grade)

End of generation brief. Output should be a single React component tree ready to drop into apps/www repo.
```

---

## §3 — Manual execution steps for Marko

1. Click "+" or "New" in the Waggle Design System workspace at claude.ai/design (parent project ea934a60). Project name: "Waggle Landing — v2". Type: High fidelity. Design system: Waggle Design System (default).

2. Click Create. New prototype canvas opens.

3. Paste the entire `§2` block (from "Generate a marketing landing page for Waggle..." to "...ready to drop into apps/www repo.") into the "Describe what you want to create..." field. Verify it pastes fully without truncation (~5800 words).

4. Send.

5. Wait for generation (~3-15 min). Watch right panel for component files (data.jsx → icons.jsx → styles.css → main HTML files).

6. Apply 8 pass/fail signals to v2 first pass:
   - 12 sections in correct order (Hero → Proof → Harvest → Multi-Agent → How → Self-Improving → Personas → Pricing → Setup → Trust → Final CTA → Footer)? PASS / FAIL
   - Hero Variant A (Marcus default) shows updated subhead with "harvest from ChatGPT, Claude, Cursor"? PASS / FAIL
   - 5 hero variants (A-E) all generated? PASS / FAIL
   - Proof band has 6 cards including "108.8% Opus" as first card? PASS / FAIL
   - Harvest section has 11 adapter tiles? PASS / FAIL
   - Multi-Agent Room shows 3-4 persona tiles concurrent + workflow templates listed? PASS / FAIL
   - Self-Improving Harness has 108.8% callout + prompt diff visual? PASS / FAIL
   - Personas section has TWO tiers (bee mascots top + 17 agent personas bottom)? PASS / FAIL
   - Pricing has 5 tiers ($0/15d Trial + $0 Free + $19 Pro + $49 Teams + KVARK Enterprise)? PASS / FAIL
   - Setup section has 5 tabs (Claude Code, Cursor, Codex, Continue.dev, Zed) + OSS bridge callout? PASS / FAIL
   - Trust band has 6 signals + Egzakta attribution? PASS / FAIL
   - KVARK bridge in Final CTA uses canonical "full data pipeline injection, your permissions, complete audit trail" wording? PASS / FAIL
   - No competitor names anywhere (Cowork / Claude Code as competitor / Hermes / Mem0 etc.)? PASS / FAIL
   - No "cognitive layer" jargon above the Self-Improving section? PASS / FAIL

7. Iterate via Claude Design feedback loop on any FAIL signals. Halt-and-PM if more than 5 iterations needed (signal of generation quality issue).

8. Export to apps/www repo (separate sprint per setup brief §9).

---

## §4 — Open items for v3 (NOT blocking v2 generation)

1. Customer logos / testimonials — held until first 3-5 referenceable customers signed
2. Mission Control screenshot — needs real product capture
3. Compliance dashboard screenshot — needs real product capture from KVARK customer install
4. Evolution Lab live numbers — gated by Hypothesis v2 publication
5. /comparison page (explicit competitor matrix) — separate sprint post-v2 launch
6. /architecture technical one-pager — separate sprint
7. /kvark minimal destination page — separate sprint, gated by Egzakta sales legal review

---

## §5 — Cross-references

- v1 generation: `claude.ai/design/p/019dd47b-ce94-7967-a6b0-89ba751fd303` (audit trail)
- Setup brief v1: `briefs/2026-04-28-claude-design-landing-setup.md`
- Landing copy v4 (still binding for voice): `briefs/2026-04-28-landing-copy-v4-waggle-product.md`
- Wireframe v1.1 LOCKED: `strategy/landing/landing-wireframe-spec-v1.1-LOCKED-2026-04-22.md`
- Repo product overview: `D:\Projects\waggle-os\docs\research\06-waggle-os-product-overview.md`
- Repo memory harvesting: `D:\Projects\waggle-os\docs\research\03-memory-harvesting-strategy.md`
- Repo personas research: `D:\Projects\waggle-os\docs\research\05-user-personas-ai-os.md`
- Repo Cowork analysis: `D:\Projects\waggle-os\waggle-cowork\system-prompt-comparison.md`
- Repo CLAUDE.md: `D:\Projects\waggle-os\CLAUDE.md`
- Repo ARCHITECTURE.md: `D:\Projects\waggle-os\docs\ARCHITECTURE.md`

---

**End of v2 generation prompt brief. Ready for Marko paste execution.**

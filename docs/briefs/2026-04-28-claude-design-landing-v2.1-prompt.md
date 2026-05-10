# Waggle Landing — v2.1 Generation Prompt (revised)

**Date:** 2026-04-28 PM
**Author:** PM
**Predecessor:** `briefs/2026-04-28-claude-design-landing-v2-prompt.md` (v2.0, retained as audit trail)
**Trigger:** Marko's 13-point critique of v2.0 — credibility risks (over-claims), structural problems (5 tiers, 5 hero variants, 2 parallel taxonomies), and 4 factual issues (Gemma → Qwen 3.6 35B, AI Act numbers unverified, GitHub URL premature, auto-sync overstated).

---

## §0 — Resolution log for v2.0 critique

| # | Critique | v2.1 resolution |
|---|---|---|
| 1 | 108.8% Opus claim has N=10 sample — credibility risk | DROPPED §6 "Self-Improving Harness" entirely. Hold until 60×3 expansion ships. |
| 2 | LoCoMo 74% contradicts 91.6/93.4 ship gate | DROPPED LoCoMo 74% from Proof band. Different metric (substrate self-judge synthesized corpus, not LoCoMo official). |
| 3 | Auto-sync 30 min false for cloud adapters | REWRITTEN: local-tool adapters sync continuously; cloud AI imports from GDPR data export on demand. |
| 4 | github.com/marolinik/hive-mind undermines Egzakta institutional frame | DROPPED GitHub URL from copy. Reinstated when repo migrates to egzakta org. |
| 5 | 5 pricing tiers confusing | COLLAPSED to 4 cards (Free / Pro / Teams / Enterprise). Trial becomes primary CTA inside Pro card. |
| 6 | §9 Setup tab strip weakens standalone | DROPPED §9 entirely. Replaced with one-line MCP mention in Trust band sub-bullet + docs link. |
| 7 | Bees + 17 personas dual taxonomy hurts CISO credibility | LEAD with 17 agent personas grid. Bees relegated to loading states, 404, footer brand mark. NO bee tiles in primary sections. |
| 8 | 5 hero variants premature optimization | SHIP 2 (A Marcus default + B Klaudia regulated). C/D/E retained in §10 v3 expansion plan. |
| 9 | Implicit positioning worst-of-both-worlds | STRIPPED implicit competitor framing from primary sections. Neutral capability description. /comparison page deferred to post-launch sprint. |
| 10 | Gemma 4 31B doesn't exist publicly | CORRECTED to **Qwen 3.6 35B-A3B** (LOCKED 2026-04-19, live via OpenRouter bridge per memory `project_target_model_qwen_35b`). Moot for v2.1 since §6 dropped — model name not surfaced in copy. |
| 11 | AI Act article numbers (12+14+19+26+50) unverified | DROPPED specific article numbers from Trust band. Replaced with five compliance concepts (audit logs, human oversight, record-keeping, risk management, transparency). Article numbers reinstated when verified against Regulation (EU) 2024/1689. |
| 12 | "Backed by Egzakta" understates relationship | REPLACED everywhere: "Built by Egzakta Group, an advisory practice shipping to regulated industries in DACH/CEE/UK since 2010." |
| 13 | arxiv preprint references aspirational | STRIPPED arxiv links from Footer Research column and Methodology Trust signal. Replaced with "Methodology document forthcoming." |

**Net effect on structure:** v2.0 had 12 sections + footer; v2.1 has **9 sections + footer** (drop §6 Self-Improving + §9 Setup, merge §10 Trust band positioning).

---

## §1 — Paste-ready text for claude.ai/design "Describe what you want to create..." field

Paste verbatim into fresh "Waggle Landing — v2" prototype textbox. Length: ~4400 words.

```
Generate a marketing landing page for Waggle (waggle-os.ai), a workspace-native AI agent platform with persistent memory, model-agnostic orchestration, and skill-extensible capabilities. Built by Egzakta Group, an advisory practice shipping to regulated industries in DACH/CEE/UK since 2010.

The Waggle Design System attached to this prototype encodes 16 ratified sections including dark-first palette, macOS-influenced shell aesthetic, Inter typography, and the hive/honey hex spectrum. Use these tokens and components as the visual foundation. Brand assets in DS: waggle-logo.svg, 13 bee-*-dark.png illustrations, hex-texture-dark.png honeycomb pattern.

IMPORTANT — bee illustrations are reserved for loading states, error states (404), and footer brand presence. Do NOT use bee illustrations as primary content tiles in any visible page section. Personas section in this generation uses agent persona text tiles, NOT bee mascots.

================================================================
1. WHAT WE'RE BUILDING — POSITIONING ANCHOR
================================================================

Three-attribute formula from the repo README:
"Workspace-native AI agent platform with persistent memory, model-agnostic orchestration, and skill-extensible capabilities."

Voice rules (binding across all sections):
- Professional + sovereign, not chirpy startup
- Anti-jargon in headlines (no "cognitive layer" before scroll fold)
- Trust through institutional backing (Egzakta), not marketing momentum
- Honest claims with specifics ("$19", "$49/seat", "since 2010", "11 adapters", "97 tools")
- Compliance-grade language for regulated audience without alienating consumer audience
- NO competitor names (Cowork, Claude Code, Hermes, Mem0, Letta, Notion AI, ChatGPT Teams, etc.)
- NO aspirational claims unbacked by current shipped evidence

Distribution channels: organic search, GitHub (when OSS substrate goes live), Hacker News, LinkedIn referrals, legal tech press, banking/insurance compliance newsletters, Egzakta Advisory partner referrals.

Implementation target: apps/www repo (Vite + React 19 + Tailwind 4 + Hive Design System tokens at apps/www/src/styles/globals.css canonical source).

================================================================
2. VISUAL DIRECTION
================================================================

Palette (hive/honey hex spectrum, dark-first locked):
- Background: hive-950 #08090c (mandatory across all sections; light mode is v3 stretch, NOT v2.1)
- Honey accent ladder: 400 #f5b731 / 500 #e5a000 / 600 #b87a00
- Cool secondary: violet #a78bfa / mint #34d399 (status only, sparingly)
- Neutral ladder: hive-50 through hive-950, 11 stops
- Honey gradient backdrop on hero only; rest of sections solid hive-950

Typography:
- Inter as primary typeface (variable font, weight range 400-700)
- Headline scale: 48-64px hero, 36-48px section, 24-32px subhead
- Body: 16-18px main, 14px caption
- Letter-spacing tight on display weights (-0.02em)
- JetBrains Mono for code snippets and tool/file paths

Layout paradigm:
- Linear + Notion as visual reference points (clean, dense-information-friendly, dark-first)
- 60/40 split heroes with visual right at lg breakpoint, hidden md and below
- Full-bleed proof bands
- Generous vertical rhythm: 32-48px section gaps, 16-24px element gaps
- Honeycomb texture (hex-texture-dark.png) appears as subtle background detail in trust band ONLY at 8-12% opacity, soft-light blend
- macOS aesthetic shell influence: rounded corners, soft shadows, subtle layering — applied to marketing landing, NOT desktop UI mockup

Motion:
- MPEG-4 hero loop placeholder (≤800KB target, 7s duration, prefers-reduced-motion suppression mandatory)
- All other motion: hover micro-interactions only, NO scroll-triggered storytelling

Brand asset usage rules (REVISED):
- waggle-logo.svg: header + footer ONLY
- bee illustrations: NOT in primary sections; reserved for loading skeleton states, 404 page (Confused bee), small footer brand mark (one bee silhouette next to wordmark, optional)
- hex-texture-dark.png: trust band background ONLY at low opacity

================================================================
3. SECTION STRUCTURE (binding order, do not reorder)
================================================================

Generate 9 sections + footer in this exact order:

----- SECTION 1: HERO -----

Left-aligned 60/40 split (visual right at lg, hidden md and below). Eyebrow + headline + subhead + body + primary CTA "Download for {os}" + secondary CTA "See how it works →". MPEG-4 loop placeholder on visual right (animated honeycomb diagram with 4 LLM provider chips orbiting central hexagon, "0 cloud calls" stat, frame counter "12,847 edges").

Generate 2 hero variants for per-persona resolution (gated by URL ?p= param or utm_source heuristic):

Variant A — Marcus (default)
- Eyebrow: "AI workspace with memory"
- Headline: "Your AI doesn't reset. Your work doesn't either."
- Subhead: "Persistent memory across every LLM you use. Claude, GPT, Qwen, Gemini, your local model — all drawing from the same locally-stored knowledge graph that grows with you."
- Body: "Stop the paste-context-fatigue cycle. Your context lives once on your disk, persists across providers, sessions, and machines, and compounds with every conversation you finish."

Variant B — Klaudia (regulated channel, ?p=compliance OR utm_source=egzakta)
- Eyebrow: "AI for regulated industries, finally"
- Headline: "AI workspace that satisfies your CISO."
- Subhead: "Local-first by default. Audit reports generated automatically from work activity. Sovereign deployment available on your Kubernetes via KVARK."
- Body: "Egzakta has been advising regulated industries in DACH/CEE/UK since 2010. Waggle is what we built to ship to them — local-first, compliance-by-default, with full data residency. Your client matters never cross to anyone's training loop."

Reserved for v3 expansion (NOT generated now): Variant C (Yuki founder/HN), Variant D (Sasha GitHub/developer), Variant E (Petra legal tech). Hero variant resolver code stub still supports A-E; only A and B enabled in v2.1 output.

----- SECTION 2: PROOF / SOTA -----

Full-width band, 5 cards in elastic responsive grid (5-in-row at xl, 3+2 at lg, 2×2+1 at md, single column at sm). Cards in this exact order:

1. AGENTIC — "33.5%" Subhead: "Trio-strict pass on h2/h3/h4 agentic scenarios — real PM, research, and engineering tasks. Pilot gold-standard evaluation. Methodology document forthcoming."

2. SOURCE — "Apache 2.0" Subhead: "Substrate is open source. Audit it, deploy it on your own infra. No license games, no rug-pull risk."

3. NETWORK — "Zero cloud" Subhead: "Local-first by default. Your work never leaves your device unless you explicitly opt in. Provider routing is signed and traced."

4. COMPLIANCE — "Audit reports built in" Subhead: "EU AI Act-ready: audit logs, human oversight, record-keeping, risk management, transparency. Generated from work activity, not retrofitted."

5. BREADTH — "11 harvest sources" Subhead: "ChatGPT, Claude, Claude Code, Gemini, Perplexity — plus markdown, PDF, URL. Your existing AI life arrives on first install."

Anti-pattern note: NO LoCoMo numbers in this band until 91.6+ official benchmark probija. NO Opus comparison numbers in this band until 60×3 evaluation expansion ships. Honest pre-launch evidence only.

----- SECTION 3: HARVEST — Memory across every AI you use -----

Eyebrow: "ONE WORKSPACE FOR EVERY AI"
Headline: "Your AI life lives in too many tabs. Waggle reads them all."
Subhead: "11 harvest adapters across the AI tools you already use, plus structured note formats. Your existing context arrives on first install — Waggle doesn't ask you to start over."

Layout: grid of 11 logo tiles (4×3 at xl, 3×4 at md, 2×6 at sm). Each tile has provider name + sync status. Suggested tile order:

Row 1: ChatGPT (live) — Claude (live) — Claude Code (live) — Claude Desktop (live)
Row 2: Gemini (live) — Perplexity (live) — Cursor (Q3 2026) — Notion (Q3 2026)
Row 3: Markdown (live) — Plaintext (live) — PDF (live) — URL + Universal (live)

Below grid: TWO sync-mode callouts side by side (this is a critical correction from v2.0 which overstated continuous sync):

Left callout — "Local tools sync continuously"
Subtitle: "Claude Code, Cursor, Continue.dev, markdown vaults, file system. Waggle watches the directories you point it at — new content harvested automatically as it appears."

Right callout — "Cloud AI imports on demand"
Subtitle: "ChatGPT, Claude, Gemini, Perplexity export their conversation history through your GDPR data download. Drop the export file once and Waggle parses, deduplicates, and indexes the entire archive."

Below callouts: feature stripe with three claims:
- "Deduplicated on import" — multi-layer (exact / normalized / embedding cosine ≥0.95)
- "Provenance preserved" — every frame carries originalSource, originalId, importedAt, distillationModel
- "Cross-tool linked" — same person mentioned in ChatGPT and Claude exports gets unified in your knowledge graph

Lock-in claim block at bottom: "After 30 days of harvest + work, the median user has 1,000+ frames, 20+ skills, 3-5 connectors. Your version of Waggle answers what generic AI can't — because it knows your work."

CTA at section end: "See how harvest works →" anchor to /how-it-works/harvest video walkthrough (placeholder for now).

----- SECTION 4: MULTI-AGENT ROOM -----

Eyebrow: "WORK PARALLEL, NOT SEQUENTIAL"
Headline: "Your researcher writes while your analyst checks while your editor reviews."
Subhead: "WaggleDance is the multi-agent orchestration layer. Four built-in workflow templates plus custom — research-team (parallel research), review-pair (draft + review), plan-execute (plan then execute), coordinator (master delegates, workers execute)."

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

Short tool snippet at bottom for technical buyers (in JetBrains Mono code block, hive-900 background):
spawn_agent({persona: 'researcher', task: 'compile sources on...', maxTurns: 20})
coordinate_agents({workflow: 'research-team', participants: ['researcher', 'writer', 'analyst']})

Anti-pattern note: NO "AI does everything" copy. The Room is about putting multiple SPECIALIZED agents to work in parallel — they hand off, they verify each other, they synthesize. The user remains the conductor.

----- SECTION 5: HOW IT WORKS -----

3-step narrative with simple iconography, no jargon:

1. Install once — desktop app (Tauri 2.0 native binary for Windows + macOS), choose your LLM provider(s) — local Ollama, Claude, GPT, your LiteLLM proxy. Waggle starts capturing the moment you begin working.

2. Work normally — use any AI like before, but now memory persists across models, sessions, machines. Switch from Claude to GPT mid-thread; both draw from the same knowledge graph. No paste-tax.

3. Compound, don't repeat — every conversation builds your knowledge graph. After 30 days the median user has 1,000+ frames, 20+ skills, 3-5 connectors. The next prompt starts where the last one left off — and so does the prompt after that.

Each step: 2-3 sentence explanation. NO "cognitive layer" jargon.

----- SECTION 6: PERSONAS — 17 agent roles -----

Single-tier structure (this is the v2.1 simplification — no bee mascot grid in primary section).

Eyebrow: "SEVENTEEN AGENT PERSONAS"
Headline: "Pick the agent that fits the work."
Subhead: "Each persona has explicit tool boundaries, model preference, workspace affinity, and a default workflow. Custom personas via JSON files — and they carry across workspaces."

Layout: 17 personas in a compact 4-row grid (4 + 4 + 4 + 5), text-only tiles. Each tile: persona name (display) + 1-line role description + small "tools: N" chip + optional model preference badge.

Personas (use these exact names + roles):

Row 1 (Knowledge work):
- Researcher — Deep-dive subject expert (tools: 28, model: opus)
- Writer — Document creator (tools: 24, model: sonnet)
- Analyst — Data interpreter (tools: 22, model: sonnet)
- Coder — Engineer / maker (tools: 35, model: sonnet)

Row 2 (Operations):
- Project-manager — Coordinator (tools: 20, model: sonnet)
- Executive-assistant — Inbox + calendar (tools: 18, model: haiku)
- Sales-rep — Outreach + proposals (tools: 22, model: sonnet)
- Marketer — Channel + audience strategist (tools: 24, model: sonnet)

Row 3 (Specialist):
- Product-manager-senior — Roadmap + spec (tools: 26, model: opus)
- Hr-manager — Hiring + people ops (tools: 20, model: sonnet)
- Legal-professional — Contract + compliance (tools: 18, model: opus)
- Finance-owner — Books + forecasts (tools: 20, model: sonnet)

Row 4 (System):
- Consultant — Strategy advisor (tools: 28, model: opus)
- General-purpose — Versatile default (tools: 40, model: sonnet)
- Planner — Read-only strategic planning (tools: 14, model: opus)
- Verifier — Adversarial QA, read-only (tools: 12, model: sonnet)
- Coordinator — Pure orchestrator (tools: 3 — spawn/list/get)

Below grid: "Custom personas via JSON files in ~/.waggle/personas/. Carry across workspaces. Bee illustrations available as workspace mood decorations — not as command vocabulary."

Tile hover state: honey ring + slight scale, NO inline expansion in v2.1.

----- SECTION 7: PRICING — Four Tiers -----

4 tier cards (Free / Pro / Teams / Enterprise) in equal-width responsive grid (4-in-row at xl, 2×2 at lg, single column at sm).

Pricing eyebrow: "PRICING"
Headline: "Free for individuals. Honest pricing for everyone else."
Subhead: "Four tiers. No feature-count games. You pay for the scale of the team using the memory, not for arbitrary check-marks."
Billing toggle: "Monthly" / "Annual save 17%" — applies to Pro and Teams

Free — $0 / forever
- Tagline: "For individuals exploring AI workspace"
- Audience: knowledge workers, students, hobbyist developers
- Bullets: Personal mind + 5 workspaces; 11 harvest adapters; Built-in skills (20+); Built-in agent personas (17); Compliance audit reports; Apache 2.0 substrate
- CTA: "Download for {os}"

Pro — $19/month (or $190/year, save $38)
- Tagline: "For power users compounding across projects"
- Audience: senior individual contributors, consultants, founders
- Bullets: Everything in Free; Unlimited workspaces; Marketplace access (120+ packages); All 12 native connectors; 148+ MCP catalog; Priority sync across multiple devices; Email support 48h SLA
- Primary CTA: "Try Pro free for 15 days, no credit card" (this is where Trial lives — as a CTA on Pro, not as a separate tier card)
- Secondary CTA: "Start Pro now"

Teams — $49/seat/month (or $490/seat/year, save $98), 3-seat minimum
- Tagline: "For teams that want shared memory without losing privacy"
- Audience: small teams (3-50 seats) in regulated industries, dev teams with shared codebases, advisory practices
- Bullets: Everything in Pro; Shared team mind; WaggleDance multi-agent coordination; Governance controls (skill promotion approvals, audit reports per user); Team-level compliance PDF rollup; Dedicated account manager
- CTA: "Start Teams"

Enterprise (KVARK) — Consultative pricing
- Tagline: "Everything Waggle does — on your infrastructure"
- Audience: Fortune 500, regulated enterprises, sovereign deployments
- Bullets: On-premise / private-VPC deployment; SSO/SAML/SCIM + RBAC; Sovereign LLM routing (your models, your endpoints); Data residency controls; Custom compliance frameworks; SOC 2 Type II report on request; Professional services engagement; Full data pipeline injection with your permissions
- CTA: "Talk to KVARK team →" (links to www.kvark.ai)

Below cards: tier comparison table (collapsible <details>). Pricing toggle event hook: landing.pricing.billing_toggle.changed{mode}.

Anti-pattern: NO 15+ bullet feature-count tiers. Each tier has 6-8 bullets max. Tiers differentiated by audience role + scale, not feature count. NO Trial as separate tier card — Trial is a CTA inside Pro card, full stop.

----- SECTION 8: TRUST BAND -----

Egzakta Group attribution as the spine: "Built by Egzakta Group, an advisory practice shipping to regulated industries in DACH/CEE/UK since 2010."

Subhead: "Not a venture-funded startup pivoting through positioning cycles. An advisory practice that has shipped to banks, insurers, and law firms for 16 years. Waggle is what we built to ship to them."

5 trust signals as horizontal row (in this order — Sovereign → Compliance → OSS → Methodology → Egzakta):

1. Zero cloud transit by default (your data never leaves your device unless you explicitly opt in)
2. Compliance-by-default (audit logs, human oversight, record-keeping, risk management, transparency — generated from work activity, EU AI Act-ready)
3. Apache 2.0 open source substrate (audit it, fork it, deploy it on your own infra)
4. Methodology document forthcoming (pilot evidence + harness benchmarks under independent review)
5. Built by Egzakta Group (since 2010, DACH/CEE/UK regulated industries)

Below the row, one-line MCP callout: "Memory tools available via MCP for any compatible AI agent — setup guides at docs.waggle-os.ai/mcp."

Background: hex-texture-dark.png at 8-12% opacity, soft-light blend.

Anti-pattern note: NO specific EU AI Act article numbers (12, 14, 19, 26, 50) cited until verified against Regulation (EU) 2024/1689 final text. Use the five compliance concepts (audit logs, human oversight, record-keeping, risk management, transparency) by name without article citations.

----- SECTION 9: FINAL CTA -----

Large headline: "Stop pasting context. Start using AI that remembers."
Subhead: "Free for individuals. Pro for power users. Teams for organizations. KVARK for enterprises."
Primary CTA: "Download for {os}" (mirrors hero CTA, OS-detected)
Secondary CTA: "Compare tiers" (anchor to pricing section)
Tertiary KVARK bridge with canonical copy: "Need it on your infrastructure, with full data pipeline injection, your permissions, and a complete audit trail? Talk to KVARK team →" (links to www.kvark.ai)

----- SECTION 10: FOOTER -----

Egzakta attribution line: "Waggle is built by Egzakta Group. © 2026 Egzakta Advisory."

5 link columns:

- Product: Download, Pricing, Personas, How it works, Multi-agent Room
- Research: Methodology (forthcoming), Evolution Lab, Benchmarks, Changelog
- OSS: Memory architecture docs, MCP setup, Contributing (when public repo lands)
- Company: About Egzakta, Blog, Press, Contact, Careers
- Legal: Terms, Privacy, EU AI Act statement, Apache 2.0 license, Data Processing Agreement

Below columns: small text "Built calmly across DACH · CEE · UK · v1.0 · waggle-os.ai"

Optional small footer brand mark: one bee illustration silhouette next to "Waggle" wordmark on the left side of the bottom row (subtle, monochrome honey-200 tint, not the full color illustration). This is the ONLY bee that appears on the primary landing.

================================================================
4. ANTI-PATTERNS (binding — explicit reject criteria)
================================================================

Generation will FAIL pre-launch review if any of these are present:

- NO SaaS landing clichés: centered hero, feature icon grid, "trusted by [logos of companies that never heard of us]" carousel, CEO quote carousel
- NO "AI does everything" aspirational copy
- NO competitor names (Cowork, Claude Code, Cursor as competitor, Hermes, Mem0, Letta, Mastra, CrewAI, Notion AI, ChatGPT Teams, Glean, Dust.tt, Microsoft Copilot Studio, Salesforce Agentforce). Position by capability description only.
- NO LoCoMo numbers in proof band (held until 91.6+ official benchmark probija)
- NO Opus comparison numbers (held until 60×3 evaluation ships)
- NO "self-improving harness" claims as headline (held until 60×3 ships)
- NO "Gemma" model mentions anywhere (current target model is Qwen 3.6 35B-A3B; methodology details deferred until publish)
- NO specific EU AI Act article numbers (12, 14, 19, 26, 50) until verified against final 2024/1689 text
- NO github.com URL anywhere (deferred until repo migrates to egzakta org)
- NO arxiv preprint links until publish
- NO "Backed by Egzakta" — must say "Built by Egzakta Group"
- NO bee mascot grid as primary section. Bees only in: loading skeletons, 404 page, optional small footer brand mark.
- NO 5-tier pricing card row. 4 cards (Free / Pro / Teams / Enterprise). Trial is a CTA inside Pro.
- NO 5 hero variants generated. Only A and B; C/D/E reserved for v3.
- NO §9 setup tab strip. MCP setup is one line in Trust band + docs link.
- NO KVARK pitch beyond one sentence + one CTA in Final CTA AND one Enterprise tier card.
- NO bee names used as UI command aliases or section labels.
- NO "cognitive layer" jargon in first three scroll viewports.
- NO light-mode design in v2.1 (dark-first locked).
- NO 15+ bullet feature-count pricing tiers. 6-8 bullets max per tier.
- NO trust-logos carousel.
- NO cookie banner blocker, modal overlay popups, exit-intent popups.
- NO section reorder.
- NO scattering bee illustrations across non-footer sections.

================================================================
5. OUTPUT FORMAT
================================================================

- Single React component tree rooted at apps/www/src/app/page.tsx
- Component-level extraction:
  - <Hero variant="..." /> — accepts variant prop (A through E in the resolver, but only A and B render meaningfully in v2.1)
  - <ProofPointsBand /> — 5 cards from apps/www/src/data/proof-points.ts
  - <HarvestBand /> — 11 adapters from apps/www/src/data/harvest-adapters.ts + two sync-mode callouts
  - <MultiAgentRoom /> — workflow templates + persona tiles + message bus visual
  - <HowItWorks /> — 3 steps from inline data
  - <PersonasGrid /> — 17 agent personas grid (single tier, no bees)
  - <PricingTiers /> — 4 cards from apps/www/src/data/pricing.ts + comparison table + billing toggle (Trial as CTA on Pro card, NOT a separate card)
  - <TrustBand /> — Egzakta attribution + 5 trust signals + MCP one-line callout
  - <FinalCTA /> — headline + 3 CTAs
  - <Footer /> — Egzakta line + 5 link columns + optional small bee silhouette next to wordmark
- All copy keyed under landing.* namespace per i18n contract
- TypeScript strict mode — no any, no @ts-ignore
- Tailwind 4 utility classes — no custom CSS unless impossible; use Hive DS tokens
- Responsive: sm/md/lg/xl breakpoints, mobile-first cascade
- Hero variant resolver: include apps/www/src/lib/hero-headline-resolver.ts mapping URL ?p= param + utm_source heuristic to variants A-E in code (only A and B currently populated; C/D/E return placeholder + log to console for v3)
- Event taxonomy stub: wire up landing.* events (page_view, section_visible, cta_click for each CTA, pricing.billing_toggle.changed, harvest.adapter_clicked, multi_agent.workflow_clicked) — minimal stub, full impl post-generation

================================================================
6. UPSTREAM REFERENCES (respect, do not contradict)
================================================================

- Waggle Design System (16 sections, ratified 2026-04-24) — components and tokens, attached to this prototype as default DS
- Hive DS tokens at apps/www/src/styles/globals.css — canonical color/typography source
- README.md three-attribute formula: "workspace-native + persistent memory + model-agnostic + skill-extensible"
- ARCHITECTURE.md package structure: 16 packages, @waggle/waggle-dance, @waggle/marketplace (120+ packages), @waggle/memory-mcp, MultiMind layer, KnowledgeGraph SCD-2, IdentityLayer, AwarenessLayer
- CLAUDE.md sections 1+5: 5-tier pricing canonical (TRIAL/FREE/PRO/TEAMS/ENTERPRISE — Trial folded into Pro CTA in landing copy), 17 personas (13 + 4 new: general-purpose, planner, verifier, coordinator), KVARK canonical copy "full data pipeline injection, your permissions, complete audit trail"
- docs/research/06-waggle-os-product-overview.md: TL;DR three-sentence pitch "Your AI remembers. Your data stays yours. Your compliance trail writes itself."
- docs/research/03-memory-harvesting-strategy.md: 11 adapters list, lock-in moat thesis
- docs/research/05-user-personas-ai-os.md: 7 archetypes for cross-persona signal validation
- waggle-cowork/system-prompt-comparison.md: Waggle 8 / Claude Code 6 / Tie 1 score (informs implicit positioning principle — but in v2.1 we are fully neutral, no positioning)
- Wireframe v1.1 LOCKED — section structure (this brief revises from 7 to 9 sections + footer)
- Brand voice contract — six clauses (professional, sovereign, anti-jargon, trust-through-institutional-backing, honest-with-specifics, compliance-grade)

End of generation brief. Output should be a single React component tree ready to drop into apps/www repo.
```

---

## §2 — Manual execution steps for Marko

1. Click "+" or "New" in the Waggle Design System workspace at claude.ai/design (parent project ea934a60). Project name: "Waggle Landing — v2". Type: High fidelity. Design system: Waggle Design System (default).

2. Click Create. New prototype canvas opens.

3. Paste the entire `§1` block (from "Generate a marketing landing page for Waggle..." to "...ready to drop into apps/www repo.") into the "Describe what you want to create..." field. Verify it pastes fully without truncation (~4400 words).

4. Send.

5. Wait for generation (~3-15 min).

6. Apply 14 pass/fail signals to v2.1 first pass:
   - 9 sections in correct order (Hero → Proof → Harvest → Multi-Agent → How → Personas → Pricing → Trust → Final CTA → Footer)? PASS / FAIL
   - Hero shows ONLY 2 variants (Marcus default + Klaudia regulated) generated meaningfully? PASS / FAIL
   - Variant A has updated subhead with "harvest from ChatGPT, Claude, Cursor"? PASS / FAIL
   - Proof band has 5 cards (NO LoCoMo number, NO Opus number, NO Gemma)? PASS / FAIL
   - Harvest section has 11 adapter tiles + TWO sync-mode callouts (local continuous + cloud GDPR-on-demand)? PASS / FAIL
   - Multi-Agent Room shows 3-4 persona tiles concurrent + workflow templates listed? PASS / FAIL
   - Personas section has SINGLE tier (17 agent personas grid, NO bee mascots in primary section)? PASS / FAIL
   - Pricing has 4 tiers (Free / Pro / Teams / Enterprise, NO Trial as separate card; Trial is CTA on Pro)? PASS / FAIL
   - Trust band has 5 signals + Egzakta "Built by" attribution + MCP one-line callout? PASS / FAIL
   - KVARK bridge in Final CTA uses canonical "full data pipeline injection, your permissions, complete audit trail"? PASS / FAIL
   - No competitor names anywhere (Cowork / Claude Code as competitor / Hermes / Mem0 / Notion AI etc.)? PASS / FAIL
   - No "cognitive layer" jargon above the Personas section? PASS / FAIL
   - No github.com URL anywhere? PASS / FAIL
   - No specific EU AI Act article numbers (12, 14, 19, 26, 50)? PASS / FAIL

7. Iterate via Claude Design feedback loop on any FAIL signals. Halt-and-PM if more than 5 iterations needed.

8. Export to apps/www repo (separate sprint per setup brief §9).

---

## §3 — Marko-side resolutions tracked for v2.2 / v3

| Item | Status | Trigger to reinstate |
|---|---|---|
| 108.8% Opus comparison | Held | 60×3 evaluation expansion ships |
| LoCoMo headline number | Held | 91.6+ official LoCoMo benchmark probija |
| github.com URL | Held | Repo migrates to github.com/egzakta or github.com/waggle-os |
| AI Act article numbers (12, 14, 19, 26, 50) | Held | Marko verifies against Regulation (EU) 2024/1689 final text |
| arxiv preprint link | Held | arxiv preprint publishes |
| Hero variants C/D/E (Yuki/Sasha/Petra) | Reserved in code | 30 days post-launch traffic data |
| §9 Setup in tools (full tab strip UI) | Migrated to docs | docs.waggle-os.ai/mcp setup page lands |
| Bee mascot grid as primary section | Removed | Not coming back; bees stay in delight elements only |
| /comparison page (explicit competitor matrix) | Deferred | Post-launch sprint, separate from primary landing |

---

## §4 — Open items NOT blocking v2.1 generation

1. Customer logos / testimonials — held until first 3-5 referenceable customers signed
2. Mission Control screenshot — needs real product capture
3. Compliance dashboard screenshot — needs real product capture from KVARK customer install
4. /architecture technical one-pager — separate sprint
5. /kvark minimal destination page — separate sprint, gated by Egzakta sales legal review
6. docs.waggle-os.ai content — separate docs sprint

---

## §5 — Cross-references

- v1 generation: `claude.ai/design/p/019dd47b-ce94-7967-a6b0-89ba751fd303` (audit trail)
- v2.0 brief: `briefs/2026-04-28-claude-design-landing-v2-prompt.md` (audit trail, NOT to be reused)
- This brief (v2.1): `briefs/2026-04-28-claude-design-landing-v2.1-prompt.md`
- Setup brief v1: `briefs/2026-04-28-claude-design-landing-setup.md`
- Landing copy v4: `briefs/2026-04-28-landing-copy-v4-waggle-product.md`
- Wireframe v1.1 LOCKED: `strategy/landing/landing-wireframe-spec-v1.1-LOCKED-2026-04-22.md`
- Repo product overview: `D:\Projects\waggle-os\docs\research\06-waggle-os-product-overview.md`
- Repo memory harvesting: `D:\Projects\waggle-os\docs\research\03-memory-harvesting-strategy.md`
- Repo personas research: `D:\Projects\waggle-os\docs\research\05-user-personas-ai-os.md`
- Repo Cowork analysis: `D:\Projects\waggle-os\waggle-cowork\system-prompt-comparison.md`
- Repo CLAUDE.md: `D:\Projects\waggle-os\CLAUDE.md`
- Repo ARCHITECTURE.md: `D:\Projects\waggle-os\docs\ARCHITECTURE.md`

---

**End of v2.1 generation prompt brief. Ready for Marko paste execution. Halt-and-PM at any §6 step 6 FAIL signal.**

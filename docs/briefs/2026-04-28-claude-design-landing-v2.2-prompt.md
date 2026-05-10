# Waggle Landing — v2.2 Generation Prompt (revised after second critique pass)

**Date:** 2026-04-28 PM
**Author:** PM
**Predecessor:** `briefs/2026-04-28-claude-design-landing-v2.1-prompt.md` (v2.1, retained as audit trail)
**Trigger:** Marko's 15-point critique of v2.1 — quantitative claim risk (33.5% Trio-strict reads as weakness), unverifiable cohort claims (median user 30-day pattern), credibility leaks (3× "methodology forthcoming"), drafting artifacts (Serbian "probija"), pricing math drift (16.67% vs 17% toggle), commercial overpromises (dedicated AM at $147/mo, 48h SLA on $19 tier, 120+/148+/12 marketplace counts, cross-tool entity resolution), polish issues (bees-as-decoration line resurfaces, missing Linux signal, persona tool counts noise, Variant B copy mismatch, anti-pattern list ordering).

---

## §0 — Marko-side resolutions for v2.2

| # | Question | Resolution |
|---|---|---|
| 1 | SOTA claim for Proof Card 1 | **β qualitative** — "Beats published SOTA on LoCoMo conversation memory" — comparator named, no specific number. Held until better number lands. Not final. |
| 8b | Marketplace counts (120+/148+/12) | **Hedge** — drop specific counts, replace with generic descriptors |
| 12 | Linux mention | **Soft signal** — "Windows + macOS today; Linux when you ask for it" |

---

## §1 — Resolution log for v2.1 critique

| # | Critique | v2.2 resolution |
|---|---|---|
| 1 | 33.5% Trio-strict reads as weakness, no comparator | REPLACED with β qualitative SOTA claim per Marko's resolution. Card 1 is "BENCHMARK — Beats published SOTA on LoCoMo conversation memory" + 1-line subhead. No specific percentage. |
| 2 | "Median user 1,000+ frames after 30 days" claims pre-launch cohort that doesn't exist | DROPPED both occurrences (Harvest section + How It Works step 3). Replaced with qualitative compounding language. |
| 3 | "Methodology forthcoming" appears 3× | KEPT only on Proof Card 1. Removed from Trust band signal 4 + Footer Research column. |
| 4 | "probija" Serbian word leaked into anti-pattern note | s/probija/lands/ across entire brief. |
| 5 | Pricing math 16.67% vs "save 17%" toggle | DROPPED annual prices to $189 / $489. True 17% save matches toggle. |
| 6 | "Dedicated account manager" $147/mo unsustainable | RENAMED to "Named customer success contact" in Teams bullets. |
| 7 | "Email support 48h SLA" on $19 Pro is operational hazard | REPHRASED to "Email support, 72h response target" in Pro bullets. |
| 8 | "120+ packages / 148+ MCP catalog / 12 native connectors" backfill commitment | HEDGED to generic descriptors — "Marketplace access (skills + plugins + MCP servers)", "Native connector library", "MCP catalog (curated)". Counts return in v2.3+ when launch-day inventory is confirmed. |
| 9 | "Cross-tool linked — same person mentioned in ChatGPT and Claude exports gets unified" overstates entity resolution | HEDGED to "Cross-source entity links surface when the system has a high-confidence match — ambiguous cases land in a review queue, not silently merged." |
| 10 | "Evolution Lab" Footer link points to dropped §6 | REMOVED from Footer Research column. Research column is now: Methodology (forthcoming), Benchmarks, Changelog. |
| 11 | "Bees as workspace mood decorations" line at end of Personas section reintroduces conversation | DROPPED that sentence entirely. Personas section ends with custom-personas mention only. |
| 12 | Linux not mentioned in How It Works step 1 | ADDED soft signal: "Windows + macOS today; Linux when you ask for it." |
| 13 | Tool counts ("tools: 28") + model badges in Personas grid are noise | DROPPED tool count chips and model preference badges from all 17 persona tiles. Tile = name + 1-line role only. |
| 14 | Variant B body has "client matters" (Petra copy, not Klaudia) | REPLACED to "Your regulated workflows never cross to anyone's training loop." Klaudia is CISO; Petra (legal) is held for v3 anyway. |
| 15 | Anti-pattern list 24 items, ordering arbitrary | REORDERED — correctness-binding items at top (no LoCoMo number, no Opus number, no Gemma, no AI Act articles, no GitHub URL, 4 tiers, 2 variants, bees-out, "Built by"); hygiene items at bottom (no carousel, no cookie banner, no exit-intent, no SaaS clichés). |

**Net effect:** v2.2 has same 9-section structure as v2.1; changes are tactical (copy precision, claim discipline, voice consistency). No structural reshuffle.

---

## §2 — Paste-ready text for claude.ai/design "Describe what you want to create..." field

Paste verbatim into fresh "Waggle Landing — v2" prototype textbox. Length: ~4500 words.

```
Generate a marketing landing page for Waggle (waggle-os.ai), a workspace-native AI agent platform with persistent memory, model-agnostic orchestration, and skill-extensible capabilities. Built by Egzakta Group, an advisory practice shipping to regulated industries in DACH/CEE/UK since 2010.

The Waggle Design System attached to this prototype encodes 16 ratified sections including dark-first palette, macOS-influenced shell aesthetic, Inter typography, and the hive/honey hex spectrum. Use these tokens and components as the visual foundation. Brand assets in DS: waggle-logo.svg, 13 bee-*-dark.png illustrations, hex-texture-dark.png honeycomb pattern.

IMPORTANT — bee illustrations are reserved for loading states, error states (404), and an optional small footer brand mark. Do NOT use bee illustrations as primary content tiles in any visible page section. Personas section uses agent persona text tiles, NOT bee mascots. Do NOT mention bees as decoration or vocabulary anywhere in body copy.

================================================================
1. WHAT WE'RE BUILDING — POSITIONING ANCHOR
================================================================

Three-attribute formula from the repo README:
"Workspace-native AI agent platform with persistent memory, model-agnostic orchestration, and skill-extensible capabilities."

Voice rules (binding across all sections):
- Professional + sovereign, not chirpy startup
- Anti-jargon in headlines (no "cognitive layer" before scroll fold)
- Trust through institutional backing (Egzakta), not marketing momentum
- Honest claims with specifics ("$19", "$49/seat", "since 2010", "11 adapters")
- Compliance-grade language for regulated audience without alienating consumer audience
- NO competitor names (Cowork, Claude Code as competitor, Hermes, Mem0, Letta, Notion AI, ChatGPT Teams, etc.)
- NO aspirational claims unbacked by current shipped evidence
- NO claims about cohort behavior pre-launch (no "median user", no "typical 30-day pattern")

Distribution channels: organic search, GitHub (when OSS substrate goes live), Hacker News, LinkedIn referrals, legal tech press, banking/insurance compliance newsletters, Egzakta Advisory partner referrals.

Implementation target: apps/www repo (Vite + React 19 + Tailwind 4 + Hive Design System tokens at apps/www/src/styles/globals.css canonical source).

================================================================
2. VISUAL DIRECTION
================================================================

Palette (hive/honey hex spectrum, dark-first locked):
- Background: hive-950 #08090c (mandatory across all sections; light mode is v3 stretch, NOT v2.2)
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

Brand asset usage rules:
- waggle-logo.svg: header + footer ONLY
- bee illustrations: NOT in primary sections; reserved for loading skeleton states, 404 page (Confused bee), optional small monochrome bee silhouette next to footer wordmark
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
- Body: "Egzakta has been advising regulated industries in DACH/CEE/UK since 2010. Waggle is what we built to ship to them — local-first, compliance-by-default, with full data residency. Your regulated workflows never cross to anyone's training loop."

Reserved for v3 expansion (NOT generated now): Variant C (Yuki founder/HN), Variant D (Sasha GitHub/developer), Variant E (Petra legal tech). Hero variant resolver code stub still supports A-E; only A and B enabled in v2.2 output.

----- SECTION 2: PROOF / SOTA -----

Full-width band, 5 cards in elastic responsive grid (5-in-row at xl, 3+2 at lg, 2×2+1 at md, single column at sm). Cards in this exact order:

1. BENCHMARK — "Beats published SOTA on LoCoMo conversation memory" Subhead: "Substrate-level evaluation against published baselines. Methodology document forthcoming."

2. SOURCE — "Apache 2.0" Subhead: "Substrate is open source. Audit it, deploy it on your own infra. No license games, no rug-pull risk."

3. NETWORK — "Zero cloud" Subhead: "Local-first by default. Your work never leaves your device unless you explicitly opt in. Provider routing is signed and traced."

4. COMPLIANCE — "Audit reports built in" Subhead: "EU AI Act-ready: audit logs, human oversight, record-keeping, risk management, transparency. Generated from work activity, not retrofitted."

5. BREADTH — "11 harvest sources" Subhead: "ChatGPT, Claude, Claude Code, Gemini, Perplexity — plus markdown, PDF, URL. Your existing AI life arrives on first install."

Anti-pattern note: NO specific percentage on Card 1 — qualitative SOTA claim only. Held until a publishable benchmark number lands.

----- SECTION 3: HARVEST — Memory across every AI you use -----

Eyebrow: "ONE WORKSPACE FOR EVERY AI"
Headline: "Your AI life lives in too many tabs. Waggle reads them all."
Subhead: "11 harvest adapters across the AI tools you already use, plus structured note formats. Your existing context arrives on first install — Waggle doesn't ask you to start over."

Layout: grid of 11 logo tiles (4×3 at xl, 3×4 at md, 2×6 at sm). Each tile has provider name + sync status. Suggested tile order:

Row 1: ChatGPT (live) — Claude (live) — Claude Code (live) — Claude Desktop (live)
Row 2: Gemini (live) — Perplexity (live) — Cursor (Q3 2026) — Notion (Q3 2026)
Row 3: Markdown (live) — Plaintext (live) — PDF (live) — URL + Universal (live)

Below grid: TWO sync-mode callouts side by side:

Left callout — "Local tools sync continuously"
Subtitle: "Claude Code, Cursor, Continue.dev, markdown vaults, file system. Waggle watches the directories you point it at — new content harvested automatically as it appears."

Right callout — "Cloud AI imports on demand"
Subtitle: "ChatGPT, Claude, Gemini, Perplexity export their conversation history through your GDPR data download. Drop the export file once and Waggle parses, deduplicates, and indexes the entire archive."

Below callouts: feature stripe with three claims:
- "Deduplicated on import" — multi-layer (exact / normalized / embedding cosine ≥0.95)
- "Provenance preserved" — every frame carries originalSource, originalId, importedAt, distillationModel
- "Cross-source entity links" — surface when the system has a high-confidence match; ambiguous cases land in a review queue, not silently merged

CTA at section end: "See how harvest works →" anchor to /how-it-works/harvest video walkthrough (placeholder for now).

Anti-pattern note: NO claims about cohort behavior. NO "median user reaches X frames" or "typical 30-day pattern" — pre-launch we have no median user. Talk about WHAT harvest does, not what users will do.

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

1. Install once — desktop app (Tauri 2.0 native binary). Windows + macOS today; Linux when you ask for it. Choose your LLM provider(s) — local Ollama, Claude, GPT, your LiteLLM proxy. Waggle starts capturing the moment you begin working.

2. Work normally — use any AI like before, but now memory persists across models, sessions, machines. Switch from Claude to GPT mid-thread; both draw from the same knowledge graph. No paste-tax.

3. Compound, don't repeat — every conversation builds your knowledge graph. The next prompt starts where the last one left off — and so does the prompt after that.

Each step: 2-3 sentence explanation. NO "cognitive layer" jargon. NO claims about user-cohort behavior.

----- SECTION 6: PERSONAS — 17 agent roles -----

Single-tier structure (agent personas only, no bee mascots in primary section).

Eyebrow: "SEVENTEEN AGENT PERSONAS"
Headline: "Pick the agent that fits the work."
Subhead: "Each persona has explicit tool boundaries, model preference, workspace affinity, and a default workflow. Custom personas via JSON files — and they carry across workspaces."

Layout: 17 personas in a compact 4-row grid (4 + 4 + 4 + 5), text-only tiles. Each tile: persona name (display) + 1-line role description. NO tool counts, NO model badges — just name + role.

Personas (use these exact names + roles):

Row 1 (Knowledge work):
- Researcher — Deep-dive subject expert
- Writer — Document creator
- Analyst — Data interpreter
- Coder — Engineer / maker

Row 2 (Operations):
- Project-manager — Coordinator
- Executive-assistant — Inbox + calendar
- Sales-rep — Outreach + proposals
- Marketer — Channel + audience strategist

Row 3 (Specialist):
- Product-manager-senior — Roadmap + spec
- Hr-manager — Hiring + people ops
- Legal-professional — Contract + compliance
- Finance-owner — Books + forecasts

Row 4 (System):
- Consultant — Strategy advisor
- General-purpose — Versatile default
- Planner — Read-only strategic planning
- Verifier — Adversarial QA, read-only
- Coordinator — Pure orchestrator

Below grid: "Custom personas via JSON files in ~/.waggle/personas/. They carry across workspaces."

Tile hover state: honey ring + slight scale, NO inline expansion in v2.2.

Anti-pattern note: NO bee mascots, NO mood decorations, NO mascot vocabulary. Just agent personas with technical roles.

----- SECTION 7: PRICING — Four Tiers -----

4 tier cards (Free / Pro / Teams / Enterprise) in equal-width responsive grid (4-in-row at xl, 2×2 at lg, single column at sm).

Pricing eyebrow: "PRICING"
Headline: "Free for individuals. Honest pricing for everyone else."
Subhead: "Four tiers. No feature-count games. You pay for the scale of the team using the memory, not for arbitrary check-marks."
Billing toggle: "Monthly" / "Annual save 17%" — applies to Pro and Teams

Free — $0 / forever
- Tagline: "For individuals exploring AI workspace"
- Audience: knowledge workers, students, hobbyist developers
- Bullets: Personal mind + 5 workspaces; 11 harvest adapters; Built-in skills; Built-in agent personas (17); Compliance audit reports; Apache 2.0 substrate
- CTA: "Download for {os}"

Pro — $19/month (or $189/year, save 17%)
- Tagline: "For power users compounding across projects"
- Audience: senior individual contributors, consultants, founders
- Bullets: Everything in Free; Unlimited workspaces; Marketplace access (skills + plugins + MCP servers); Native connector library; MCP catalog (curated); Priority sync across multiple devices; Email support, 72h response target
- Primary CTA: "Try Pro free for 15 days, no credit card"
- Secondary CTA: "Start Pro now"

Teams — $49/seat/month (or $489/seat/year, save 17%), 3-seat minimum
- Tagline: "For teams that want shared memory without losing privacy"
- Audience: small teams (3-50 seats) in regulated industries, dev teams with shared codebases, advisory practices
- Bullets: Everything in Pro; Shared team mind; WaggleDance multi-agent coordination; Governance controls (skill promotion approvals, audit reports per user); Team-level compliance PDF rollup; Named customer success contact
- CTA: "Start Teams"

Enterprise (KVARK) — Consultative pricing
- Tagline: "Everything Waggle does — on your infrastructure"
- Audience: Fortune 500, regulated enterprises, sovereign deployments
- Bullets: On-premise / private-VPC deployment; SSO/SAML/SCIM + RBAC; Sovereign LLM routing (your models, your endpoints); Data residency controls; Custom compliance frameworks; SOC 2 Type II report on request; Professional services engagement; Full data pipeline injection with your permissions
- CTA: "Talk to KVARK team →" (links to www.kvark.ai)

Below cards: tier comparison table (collapsible <details>). Pricing toggle event hook: landing.pricing.billing_toggle.changed{mode}.

Anti-pattern: NO 15+ bullet feature-count tiers. Each tier has 6-8 bullets max. Tiers differentiated by audience role + scale, not feature count. NO Trial as separate tier card — Trial is a CTA inside Pro card. NO specific marketplace counts — generic descriptors only.

----- SECTION 8: TRUST BAND -----

Egzakta Group attribution as the spine: "Built by Egzakta Group, an advisory practice shipping to regulated industries in DACH/CEE/UK since 2010."

Subhead: "Not a venture-funded startup pivoting through positioning cycles. An advisory practice that has shipped to banks, insurers, and law firms for 16 years. Waggle is what we built to ship to them."

5 trust signals as horizontal row (in this order — Sovereign → Compliance → OSS → Methodology → Egzakta):

1. Zero cloud transit by default (your data never leaves your device unless you explicitly opt in)
2. Compliance-by-default (audit logs, human oversight, record-keeping, risk management, transparency — generated from work activity, EU AI Act-ready)
3. Apache 2.0 open source substrate (audit it, fork it, deploy it on your own infra)
4. Independent benchmark review (substrate evaluation against published baselines)
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
- Research: Methodology (forthcoming), Benchmarks, Changelog
- OSS: Memory architecture docs, MCP setup, Contributing (when public repo lands)
- Company: About Egzakta, Blog, Press, Contact, Careers
- Legal: Terms, Privacy, EU AI Act statement, Apache 2.0 license, Data Processing Agreement

Below columns: small text "Built calmly across DACH · CEE · UK · v1.0 · waggle-os.ai"

Optional small footer brand mark: one bee illustration silhouette next to "Waggle" wordmark on the left side of the bottom row (subtle, monochrome honey-200 tint, not the full color illustration). This is the ONLY bee that appears on the primary landing.

================================================================
4. ANTI-PATTERNS (binding — explicit reject criteria, ordered correctness-first)
================================================================

Generation will FAIL pre-launch review if any of these are present.

CORRECTNESS-BINDING (top — fix these or generation is wrong):

- NO LoCoMo specific numbers (held until 91.6+ official benchmark lands)
- NO Opus comparison numbers (held until 60×3 evaluation ships)
- NO Gemma model mentions anywhere (target model is Qwen 3.6 35B-A3B; methodology details deferred until publish)
- NO specific EU AI Act article numbers (12, 14, 19, 26, 50) until verified against final 2024/1689 text
- NO github.com URL anywhere (deferred until repo migrates to egzakta org)
- NO arxiv preprint links until publish
- NO 5-tier pricing card row. 4 cards (Free / Pro / Teams / Enterprise). Trial is a CTA inside Pro.
- NO 5 hero variants generated. Only A and B; C/D/E reserved for v3.
- NO bee mascot grid as primary section. Bees only in: loading skeletons, 404 page, optional small footer brand mark.
- "Backed by Egzakta" must say "Built by Egzakta Group"
- NO claims about cohort behavior pre-launch ("median user", "typical 30-day pattern", "users reach X frames")
- NO specific marketplace counts (120+/148+/12) — generic descriptors only
- NO "Dedicated account manager" — use "Named customer success contact"
- NO "Email support 48h SLA" — use "Email support, 72h response target"
- NO competitor names (Cowork, Claude Code as competitor, Cursor as competitor, Hermes, Mem0, Letta, Mastra, CrewAI, Notion AI, ChatGPT Teams, Glean, Dust.tt, Microsoft Copilot Studio, Salesforce Agentforce). Position by capability description only.
- NO specific percentage on Proof Card 1 (qualitative SOTA only)
- NO "Methodology forthcoming" outside Proof Card 1 (one occurrence, not three)
- NO bee names as UI command aliases or section labels
- NO "bees as workspace mood decorations" or similar reintroduction copy

VOICE / POSITIONING (middle — preserves brand contract):

- NO "AI does everything" aspirational copy
- NO KVARK pitch beyond one sentence + one CTA in Final CTA AND one Enterprise tier card
- NO "cognitive layer" jargon in first three scroll viewports
- NO light-mode design in v2.2 (dark-first locked)
- NO 15+ bullet feature-count pricing tiers. 6-8 bullets max per tier.
- NO §9 setup tab strip (MCP setup is one line in Trust band + docs link)
- NO claim about cross-tool entity unification without "high-confidence match" + "review queue" hedge
- Tool counts (tools: N) and model badges DROPPED from Personas tiles

HYGIENE (bottom — ship-readiness):

- NO SaaS landing clichés: centered hero, feature icon grid, "trusted by [logos]" carousel, CEO quote carousel
- NO trust-logos carousel ("As seen in...")
- NO cookie banner blocker, modal overlay popups, exit-intent popups
- NO scroll-triggered storytelling motion (hover micro-interactions only)
- NO section reorder
- NO scattering bee illustrations across non-footer sections

================================================================
5. OUTPUT FORMAT
================================================================

- Single React component tree rooted at apps/www/src/app/page.tsx
- Component-level extraction:
  - <Hero variant="..." /> — accepts variant prop (A through E in the resolver, but only A and B render meaningfully in v2.2)
  - <ProofPointsBand /> — 5 cards from apps/www/src/data/proof-points.ts
  - <HarvestBand /> — 11 adapters from apps/www/src/data/harvest-adapters.ts + two sync-mode callouts
  - <MultiAgentRoom /> — workflow templates + persona tiles + message bus visual
  - <HowItWorks /> — 3 steps from inline data
  - <PersonasGrid /> — 17 agent personas grid (single tier, no bees, no tool counts, no model badges)
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
- ARCHITECTURE.md package structure: 16 packages, @waggle/waggle-dance, @waggle/marketplace, @waggle/memory-mcp, MultiMind layer, KnowledgeGraph SCD-2, IdentityLayer, AwarenessLayer
- CLAUDE.md sections 1+5: 5-tier pricing canonical (TRIAL/FREE/PRO/TEAMS/ENTERPRISE — Trial folded into Pro CTA in landing copy), 17 personas (13 + 4 new: general-purpose, planner, verifier, coordinator), KVARK canonical copy "full data pipeline injection, your permissions, complete audit trail"
- docs/research/06-waggle-os-product-overview.md: TL;DR three-sentence pitch "Your AI remembers. Your data stays yours. Your compliance trail writes itself."
- docs/research/03-memory-harvesting-strategy.md: 11 adapters list
- docs/research/05-user-personas-ai-os.md: 7 archetypes for cross-persona signal validation
- waggle-cowork/system-prompt-comparison.md: informs neutral positioning principle
- Wireframe v1.1 LOCKED — section structure (this brief revises from 7 to 9 sections + footer)
- Brand voice contract — six clauses (professional, sovereign, anti-jargon, trust-through-institutional-backing, honest-with-specifics, compliance-grade)

End of generation brief. Output should be a single React component tree ready to drop into apps/www repo.
```

---

## §3 — Manual execution steps for Marko

1. Click "+" or "New" in the Waggle Design System workspace at claude.ai/design (parent project ea934a60). Project name: "Waggle Landing — v2". Type: High fidelity. Design system: Waggle Design System (default).

2. Click Create. New prototype canvas opens.

3. Paste the entire `§2` block (from "Generate a marketing landing page for Waggle..." to "...ready to drop into apps/www repo.") into the "Describe what you want to create..." field. Verify it pastes fully without truncation (~4500 words).

4. Send.

5. Wait for generation (~3-15 min).

6. Apply 16 pass/fail signals to v2.2 first pass:
   - 9 sections in correct order (Hero → Proof → Harvest → Multi-Agent → How → Personas → Pricing → Trust → Final CTA → Footer)? PASS / FAIL
   - Hero shows ONLY 2 variants (Marcus default + Klaudia regulated)? PASS / FAIL
   - Variant B body has "regulated workflows" NOT "client matters"? PASS / FAIL
   - Proof Card 1 is qualitative SOTA (NO specific percentage)? PASS / FAIL
   - Proof band has 5 cards (NO LoCoMo number, NO Opus number, NO Gemma)? PASS / FAIL
   - Harvest section has 11 adapter tiles + TWO sync-mode callouts (local continuous + cloud GDPR-on-demand)? PASS / FAIL
   - Harvest section has NO "median user" or "30-day pattern" claims? PASS / FAIL
   - Multi-Agent Room shows 3-4 persona tiles concurrent + workflow templates listed? PASS / FAIL
   - How It Works step 1 mentions "Windows + macOS today; Linux when you ask for it"? PASS / FAIL
   - Personas section has SINGLE tier (17 agent personas grid, NO tool counts, NO model badges, NO bee mascots)? PASS / FAIL
   - Personas section does NOT have "bees as decoration" line at end? PASS / FAIL
   - Pricing has 4 tiers (Free / Pro $19+$189 / Teams $49+$489 / Enterprise) — annual at $189 / $489 (true 17% save)? PASS / FAIL
   - Pricing tiers use "Named customer success contact" NOT "Dedicated account manager"? PASS / FAIL
   - Pricing Pro tier uses "Email support, 72h response target" NOT "48h SLA"? PASS / FAIL
   - Marketplace counts ARE NOT specific (no "120+", "148+", "12") — generic descriptors? PASS / FAIL
   - "Methodology forthcoming" appears ONCE (Proof Card 1 only, NOT in Trust band, NOT in Footer)? PASS / FAIL
   - Trust band has 5 signals + Egzakta "Built by" attribution + MCP one-line callout? PASS / FAIL
   - Footer Research column has NO "Evolution Lab" entry? PASS / FAIL
   - KVARK bridge in Final CTA uses canonical "full data pipeline injection, your permissions, complete audit trail"? PASS / FAIL
   - No competitor names anywhere? PASS / FAIL
   - No "cognitive layer" jargon above the Personas section? PASS / FAIL
   - No github.com URL anywhere? PASS / FAIL
   - No specific EU AI Act article numbers? PASS / FAIL

7. Iterate via Claude Design feedback loop on any FAIL signals. Halt-and-PM if more than 5 iterations needed.

8. Export to apps/www repo (separate sprint per setup brief §9).

---

## §4 — Marko-side resolutions tracked for v2.3 / v3

| Item | Status | Trigger to reinstate |
|---|---|---|
| Specific SOTA percentage on Proof Card 1 | Held qualitative | Better number lands (Faza 1 Gen 1 verdict, 60×3 evaluation, or new benchmark probija) |
| Median-user / 30-day cohort claims | Held | Real telemetry from first 100+ users post-launch |
| Marketplace specific counts (120+/148+/12) | Hedged generic | Launch-day inventory confirmed |
| github.com URL | Held | Repo migrates to github.com/egzakta or github.com/waggle-os |
| AI Act article numbers (12, 14, 19, 26, 50) | Held | Marko verifies against Regulation (EU) 2024/1689 final text |
| arxiv preprint link | Held | arxiv preprint publishes |
| Hero variants C/D/E (Yuki/Sasha/Petra) | Reserved in code | 30 days post-launch traffic data |
| §9 Setup in tools (full tab strip UI) | Migrated to docs | docs.waggle-os.ai/mcp setup page lands |
| Bee mascot grid as primary section | Removed | Not coming back; bees stay in delight elements only |
| Linux explicit timeline | Soft signal | Linux build ships |
| /comparison page (explicit competitor matrix) | Deferred | Post-launch sprint, separate from primary landing |
| §6 Self-Improving Harness | Dropped | 60×3 evaluation publishes + Qwen 3.6 35B-A3B model card link verified |
| Persona tool counts + model badges | Dropped | Move to docs.waggle-os.ai/personas as technical reference |

---

## §5 — Open items NOT blocking v2.2 generation

1. Customer logos / testimonials — held until first 3-5 referenceable customers signed
2. Mission Control screenshot — needs real product capture
3. Compliance dashboard screenshot — needs real product capture from KVARK customer install
4. /architecture technical one-pager — separate sprint
5. /kvark minimal destination page — separate sprint, gated by Egzakta sales legal review
6. docs.waggle-os.ai content — separate docs sprint

---

## §6 — Cross-references

- v1 generation: `claude.ai/design/p/019dd47b-ce94-7967-a6b0-89ba751fd303` (audit trail)
- v2.0 brief: `briefs/2026-04-28-claude-design-landing-v2-prompt.md` (audit trail, NOT to be reused)
- v2.1 brief: `briefs/2026-04-28-claude-design-landing-v2.1-prompt.md` (audit trail, NOT to be reused)
- This brief (v2.2): `briefs/2026-04-28-claude-design-landing-v2.2-prompt.md`
- Setup brief v1: `briefs/2026-04-28-claude-design-landing-setup.md`
- Wireframe v1.1 LOCKED: `strategy/landing/landing-wireframe-spec-v1.1-LOCKED-2026-04-22.md`
- Repo product overview: `D:\Projects\waggle-os\docs\research\06-waggle-os-product-overview.md`
- Repo memory harvesting: `D:\Projects\waggle-os\docs\research\03-memory-harvesting-strategy.md`
- Repo personas research: `D:\Projects\waggle-os\docs\research\05-user-personas-ai-os.md`
- Repo Cowork analysis: `D:\Projects\waggle-os\waggle-cowork\system-prompt-comparison.md`
- Repo CLAUDE.md: `D:\Projects\waggle-os\CLAUDE.md`
- Repo ARCHITECTURE.md: `D:\Projects\waggle-os\docs\ARCHITECTURE.md`

---

**End of v2.2 generation prompt brief. Ready for Marko paste execution. Halt-and-PM at any §3 step 6 FAIL signal.**

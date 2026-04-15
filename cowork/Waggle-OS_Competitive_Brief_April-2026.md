# Waggle OS — Competitive Brief
**Product scope:** Waggle OS (individual/team AI workspace, Tauri desktop, persistent memory, KVARK funnel)
**Date of research:** April 15, 2026
**Depth:** Standard (publicly available website, recent news, review sentiment, pricing)
**Prepared for:** Marko Markovic, Egzakta Group
**Caveat:** Public-source research only. Sales-stage data (win/loss, private pricing, analyst detail) requires CRM/analyst subscriptions to enrich.

---

## 1. Executive Summary

The AI workspace market has bifurcated in the last twelve months. **Frontier-lab apps (Claude Desktop/Cowork, ChatGPT Desktop, Codex)** now own the "your model, on your computer" narrative. **Workspace-natives (Notion AI, Granola, Mem)** are racing to bolt on agents. **Enterprise sovereigns (Glean, Writer, Cohere North, Agent 365)** are taking the top of the market with $45–$100/seat pricing and VPC deployment. **Open-source agent OSes (Hermes, Paperclip)** are where the hacker narrative is moving.

**Waggle's biggest opportunity:** nobody in Tier 1–3 has credibly packaged *persistent multi-layer memory + desktop-native binary + a sovereign upgrade path*. Cowork has memory and a desktop binary but no sovereign story. Notion has sovereignty-by-proxy (workspace) but no desktop agent. Cohere North has sovereignty but no individual-tier funnel. **Waggle is the only player wiring a Solo→Basic→Teams→KVARK funnel where the free tier teaches the buyer what the enterprise product feels like.**

**Waggle's biggest threat:** Claude Cowork ships on Anthropic's distribution, brand, and model. If Anthropic adds a team tier with shared project memory and an enterprise-VPC SKU, Waggle's Teams→KVARK path gets compressed fast. The positioning window is **~6–9 months** before Cowork becomes the default answer for "AI agent on my desktop."

---

## 2. Competitor Profiles

Competitors are grouped into four tiers based on how directly they overlap with Waggle's wedge.

### TIER 1 — Direct (frontier-lab desktop agents)

#### 2.1 Claude Desktop + Claude Cowork
*The single most dangerous competitor. This brief is literally being written inside it.*

- **Positioning:** "Your AI collaborator, on your computer."
- **Target:** Knowledge workers on Pro/Max plans; Cowork is the non-developer path of Claude Code.
- **Stage/signals:** GA on macOS and Windows Q1 2026. Projects (persistent workspaces with own files, links, instructions, memory) launched Q1 2026. "Customize" section unifies skills, plugins, connectors.
- **Messaging themes:** memory-across-devices, computer use, Skills marketplace, plugin marketplaces, Excel/PPT/PDF/DOCX creation, projects as persistent context.
- **Tone/voice:** Calm, capable, "research preview" humility. Pushes the agent/user collaboration metaphor.
- **Pricing:** Pro $20/mo, Max $100–$200/mo (Cowork requires Max for full features). No team-tier pricing yet for Cowork specifically.
- **Strengths:** Model quality, brand, free distribution through Anthropic, first-party skills/plugins ecosystem, native desktop integration, persistent memory on by default for all tiers as of Q1 2026.
- **Weaknesses:** No sovereign deployment story. No VPC/on-prem. Enterprise data leaves perimeter unless on Anthropic's enterprise SKU. No explicit team/shared-memory tier yet. Memory/projects are single-user scoped. No multi-agent orchestration UX — Cowork is still "one Claude per session."
- **What to watch:** Any announcement of a Teams SKU with shared project memory. Any VPC/sovereign deployment SKU. Either kill Waggle's Teams tier differentiation.

#### 2.2 ChatGPT Desktop + Codex app
- **Positioning:** "ChatGPT that can think and act on your computer."
- **Target:** Plus/Pro subscribers; Codex for developers managing parallel agents.
- **Stage/signals:** Agent mode live on macOS (Plus); Codex macOS GA, Windows in progress. IDE integrations expanded to ~10 IDEs.
- **Messaging themes:** Agent mode, parallel long-running tasks, voice, IDE coverage, "launch from any screen" keyboard shortcut.
- **Tone/voice:** Confident, product-forward, "proactive" agent framing.
- **Pricing:** Plus $20/mo, Pro $200/mo, Team $30/seat/mo, Enterprise custom.
- **Strengths:** Brand, distribution (700M+ WAU), developer adoption via Codex, voice is still category-best, deep OS integrations coming.
- **Weaknesses:** No persistent multi-layer memory (still chat-thread-scoped memory). Agent mode is slow and brittle in practice (per review sentiment). Windows Agent mode lags macOS. No skills/plugin marketplace parity with Anthropic. Workspace metaphor is weak — it's still a chat window.
- **What to watch:** Codex on Windows, memory architecture upgrade (currently inferior to Notion/Mem), any "Projects with shared memory" announcement.

### TIER 2 — Adjacent (workspace/memory-native)

#### 2.3 Notion AI (3.2, released Jan 2026)
- **Positioning:** "Meet your AI team — inside the workspace you already use."
- **Target:** SMB/mid-market knowledge teams already on Notion.
- **Stage/signals:** Notion 3.0 introduced agents Sep 2025; 3.2 added mobile agent parity, multi-model choice (GPT-5.2, Opus 4.5, Gemini 3), 20-minute autonomous runtime, people directory.
- **Messaging themes:** State-of-the-art memory (pages-as-memory), custom instructions, autonomous multi-step (20-min runs), multi-model, enterprise search across Slack/Drive.
- **Pricing:** Business $24/seat/mo, Enterprise custom; AI is included in Business+.
- **Strengths:** Massive installed base. Memory architecture is workspace-native (pages = memory). Multi-model freedom. Mobile parity. Strong enterprise search.
- **Weaknesses:** Not a desktop-native agent — it's a browser/Electron app. No computer use. No skills/plugin ecosystem. Agents are constrained to Notion primitives (pages, DBs, connectors). Latency on 20-min runs is a common complaint. No sovereign deployment.
- **What to watch:** Computer-use features, a first-party OS-level agent, or desktop binary.

#### 2.4 Granola (Series C, $1.5B, Mar 2026)
- **Positioning:** "The AI notepad for back-to-back meetings" → expanding to "enterprise AI app."
- **Target:** Prosumer → enterprise (Vanta, Gusto, Asana, Cursor, Lovable, Decagon, Mistral as announced customers).
- **Stage/signals:** Launched Spaces (team workspaces), Personal API, Enterprise API, MCP server (Feb 2026).
- **Messaging themes:** "No bot joins your call" (system-audio capture), meeting-as-memory, agent-friendly API, enterprise-grade controls.
- **Pricing:** Free (limited); Business $14/seat/mo; Enterprise $35/seat/mo (SSO + training opt-out).
- **Strengths:** Beautiful prosumer UX, strong narrative ("no bot"), MCP-first, now credible at enterprise tier, well-funded.
- **Weaknesses:** Meeting-note-shaped. Not an agent OS. Memory is meeting-scoped, not cross-workspace. No desktop agent, no skills ecosystem, no sovereign deployment.
- **What to watch:** Any pivot from "meeting notes" to "workspace memory backbone." Enterprise API adoption.

#### 2.5 Mem (2.0, early 2026)
- **Positioning:** "Your AI thought partner" — a personal second brain.
- **Target:** Individual knowledge workers.
- **Stage/signals:** Mem 2.0 shipped (speed, stability leap). Voice Mode. Pro at $12/mo.
- **Strengths:** Fast, lightweight, mobile-first, auto-organization is still category-best for personal notes.
- **Weaknesses:** Mem 1.0 struggled commercially; 2.0 is recovery. Still individual-scoped. No agent runtime. No desktop-native binary. No team/enterprise story worth quoting.
- **What to watch:** Whether Mem 2.0 adoption justifies a team tier, or whether they get acquired.

### TIER 3 — Enterprise sovereigns (KVARK-range)

#### 2.6 Microsoft Copilot + Agent 365 (E7 Frontier Suite)
- **Positioning:** "Copilot + Agent 365 = AI across every Microsoft surface."
- **Target:** Existing M365 E5 enterprises.
- **Stage/signals:** E7 Frontier Suite launches May 1, 2026 at $99/seat/mo (E5 + Copilot + Agent 365 bundled). Agent 365 is a new unified control plane for managing agents at enterprise scale.
- **Messaging themes:** Deep reasoning agents (Researcher, Analyst), Copilot Tuning, role-based solutions, enterprise governance, Copilot Studio for custom agents.
- **Pricing:** Copilot $30/seat/mo; Agent 365 bundled in E7 at $99/seat/mo; Copilot Studio $200 per 25,000 credits/mo.
- **Strengths:** M365 lock-in, compliance story, Microsoft procurement rails, Agent 365 is the control-plane play.
- **Weaknesses:** Only works inside Microsoft's walled garden. Heavy. IT-led deployment. Agents are opaque. No memory architecture that reads outside M365.
- **What it means for Waggle/KVARK:** This is the ceiling KVARK has to undercut on flexibility and pricing (not on compliance).

#### 2.7 Glean
- **Positioning:** "Work AI that works — agents, assistant, and search."
- **Target:** 500+ seat enterprises.
- **Pricing:** Enterprise search ~$45–50/seat/mo + $15/seat AI add-on. $50–60k minimum annual. Paid POCs up to $70k.
- **Strengths:** Enterprise graph, memory-of-processes, single-tenant cloud, agent action validation.
- **Weaknesses:** Search-and-summarize, not action-complete. Does not create tickets / update systems. Expensive. No individual/free tier funnel.
- **What it means for KVARK:** Glean is the most direct enterprise competitor on positioning ("enterprise memory + agents"). KVARK must win on (a) action completeness, (b) Waggle funnel (Glean has none), (c) price.

#### 2.8 Writer.com
- **Positioning:** "The enterprise AI platform for agentic work" (Fortune 500 focus).
- **Stage/signals:** Mar 2026 — Skills creator + enhanced Playbook builder for non-technical employees; 200+ prebuilt enterprise skills; shared voice profiles; expanded connectors.
- **Pricing:** Seat $18–25/user/mo; mid-market deals $75k–$250k/yr; enterprise $500k+.
- **Strengths:** Fortune 500 logo density, strong brand/voice governance story, 100+ prebuilt agents.
- **Weaknesses:** Content-creation origin shows — strongest at marketing/comms use cases. Less compelling for operational/cross-functional agents.
- **What it means for KVARK:** Writer owns "on-brand agents." KVARK should own "on-infrastructure agents."

#### 2.9 Cohere North
- **Positioning:** "Security-first AI workspace" — the sovereign-AI champion.
- **Stage/signals:** North GA Aug 2025. Feb 2026 SAP partnership (EU AI Cloud). Customers include RBC, Dell, LG CNS. Model Vault for air-gapped deployment.
- **Messaging themes:** Sovereign AI, on-prem/hybrid/air-gap, Rerank 4 (32k, 100+ languages), Cohere never sees customer data.
- **Pricing:** Custom / consultative.
- **Strengths:** **This is KVARK's direct mirror in positioning.** Canadian government backing ($240M infra). SAP distribution. Multilingual/sovereign moat.
- **Weaknesses:** Heavy. No individual/prosumer funnel. North is a top-down sale. Model quality perception is below frontier labs (OpenAI/Anthropic). No consumer brand.
- **What it means for KVARK:** Cohere North is the single most dangerous KVARK competitor on positioning. **KVARK's edge is the Waggle funnel — Cohere has no analog.** Lead with that.

### TIER 4 — Open-source agent OSes (narrative threat, not revenue threat yet)

#### 2.10 Hermes Agent (Nous Research, Feb 2026)
- **Positioning:** "The agent that grows with you" — open-source, self-improving, server-side.
- **Strengths:** Open source, persistent memory, 100+ skills, PWA workspace, self-improving skills.
- **Weaknesses:** Server-side (not desktop-native). Developer audience. No enterprise story. No commercial vendor.
- **Why it matters:** This is where the *narrative* of "agent with persistent memory that improves" is being written on HN/X. If Waggle doesn't claim that narrative, Hermes does.

#### 2.11 Paperclip
- **Positioning:** "The human control plane for AI labor" / "run a zero-human company with AI agent teams."
- **Strengths:** Multi-agent orchestration, org-chart metaphor, per-agent budgets, full audit tracing, BYO-agent (OpenAI, Claude, Codex).
- **Weaknesses:** Orchestration layer, not a workspace. Developer-skewed. No first-party memory layer. Desktop app is an unofficial Electron wrapper.
- **Why it matters:** Paperclip is claiming "governance + multi-agent" — an adjacency Waggle should own for Teams tier.

#### 2.12 Claude Code
- Developer-only; not a Waggle competitor but is the proof that Anthropic can ship credible agent runtimes. Cowork is Claude Code for non-developers. Watch for the Teams version of Cowork.

---

## 3. Messaging Comparison Matrix

| Dimension | **Waggle OS** | Claude Cowork | ChatGPT Desktop | Notion AI | Granola | Glean | Cohere North | Paperclip |
|---|---|---|---|---|---|---|---|---|
| **Primary tagline** | *Workspace-native AI with persistent memory* | Your AI collaborator, on your computer | ChatGPT that can think and act | Meet your AI team | The AI notepad for meetings | Work AI that works | Security-first AI workspace | Human control plane for AI labor |
| **Target buyer** | Individual → team → enterprise funnel | Pro/Max subscribers | Plus/Pro subscribers | Notion teams | Meeting-heavy ICs | 500+ seat enterprise | Regulated enterprise | Dev-led AI-native teams |
| **Key differentiator** | Memory + desktop + sovereign upgrade path | Model quality + Anthropic brand | Brand + voice + IDE reach | Workspace-native memory | "No bot" + beautiful UX | Enterprise graph + permissions | Sovereign (on-prem/air-gap) | Multi-agent org-chart + budgets |
| **Tone/voice** | Precise, builder, anti-hype | Humble capable "research preview" | Confident product-forward | Friendly team metaphor | Prosumer cool | Enterprise serious | Regulated/compliant | Hacker-operator |
| **Core value prop** | AI that remembers, owned workspace, scales to KVARK | Agent in your OS | Agent that uses your computer | Agents inside your docs | Meetings → memory | Answers from all your work | Your AI, your infrastructure | Run an AI-agent company |
| **Persistent memory** | ✅ multi-layer (Frame, Hybrid, KG, Identity, Awareness) | ✅ chat + project scope | ⚠️ chat-thread scope | ✅ workspace-as-memory | ⚠️ meeting scope | ✅ enterprise graph | ✅ enterprise memory | ❌ (BYO) |
| **Desktop-native** | ✅ Tauri binary | ✅ native | ✅ native | ❌ Electron/web | ⚠️ system audio only | ❌ web | ❌ web | ⚠️ unofficial Electron |
| **Sovereign/on-prem** | ✅ via KVARK upgrade | ❌ | ❌ | ❌ | ❌ | ⚠️ single-tenant cloud | ✅ on-prem/air-gap | ✅ self-host |
| **Free/individual tier** | ✅ Solo free | ⚠️ Pro required for Cowork | ✅ Free ChatGPT | ✅ limited free | ✅ | ❌ | ❌ | ✅ open source |
| **Price floor** | $0 → $15 → $79 → KVARK custom | $20/mo | $20/mo | $24/seat Business | $14/seat Business | ~$60/seat all-in | custom | $0 (self-host) |
| **Skills/plugin ecosystem** | ✅ (own + Anthropic-compat) | ✅ first-party | ❌ | ⚠️ limited | ⚠️ MCP only | ⚠️ agents only | ⚠️ agent-builder | ✅ BYO agents |

---

## 4. Content Gap Analysis

### Topics competitors own that Waggle does not

| Topic | Who owns it | What they publish | Waggle opportunity |
|---|---|---|---|
| Sovereign AI / data residency | Cohere North, Glean | Customer stories at RBC, Dell, regulated industries | Publish "Waggle/KVARK for EU/CA data residency" teardown. Low-hanging SEO. |
| Agent governance at scale | Paperclip, Writer | Org-chart for agents, audit tracing, per-agent budgets | Waggle has CostDashboardCard + AuditTrailCard — write a POV: "What agent governance actually looks like on the desktop." |
| Memory architecture | Notion (pages-as-memory), Hermes (persistent memory + self-improving) | Long-form explainers on their memory models | Waggle has 5-layer memory (Frame/Hybrid/KG/Identity/Awareness) — **nobody has published a deep explainer of a multi-layer architecture.** This is the canonical content opportunity. |
| "AI at work" productivity ROI | Copilot, Notion | Fortune-500 case studies, time-saved numbers | Skip — this is table-stakes content, saturated. |
| Multi-agent orchestration | Paperclip, ChatGPT Codex | Parallel-agent demos | Waggle should demo: "One desktop, 5 personas, 1 goal." |

### Topics Waggle owns (or could own uncontested)

1. **Multi-layer memory that survives model swaps.** Notion talks pages-as-memory; Hermes talks persistent memory; nobody has the 5-layer frame.
2. **Funnel from free individual to sovereign enterprise on the same primitives.** No competitor has Solo→KVARK continuity.
3. **Tauri over Electron** — a real performance/security story with OSS credibility.
4. **"Bring the AI to your data, not your data to the AI"** — this is Cohere's line but Waggle can own the desktop+sovereign combo.
5. **Honest cost tracking** (CostDashboardCard) — no consumer app shows cost per message transparently.

### Content formats competitors use that Waggle should adopt

- Analyst-bait landscape diagrams (Notion 3.0 post, Granola Series C deck)
- Architectural long-reads with code (Hermes, Paperclip)
- Customer stories with named logos (Cohere, Glean, Granola)
- Weekly changelog/release notes page (Claude, Notion)

### Content formats Waggle should claim

- **"Memory teardown"** series: take a competitor, explain where their memory breaks, show how Waggle handles the same scenario.
- **Public benchmark:** recall-over-time, cost-per-session, session-resumption latency.
- **"How a sovereign AI agent actually works"** — technical long-read tied to KVARK.

---

## 5. Positioning Map (2x2)

**Axes:** (X) Individual/prosumer ↔ Enterprise/sovereign · (Y) Chat-surface ↔ Agent/workspace-native

```
                            AGENT / WORKSPACE-NATIVE
                                      |
              Hermes ●                 |                  ● Paperclip
                                      |
              Mem ●     Waggle OS ●   |   ● Notion AI        ● Glean
                            ● Granola |                        ● Cohere North
                                      |                        ● Writer
  INDIVIDUAL  ------------------------+----------------------- ENTERPRISE
                                      |                        ● MS Copilot / Agent 365
              ● ChatGPT Desktop       |
              ● Claude Desktop        |
              ● Claude Cowork         |
                                      |
                            CHAT / SURFACE-CENTRIC
```

**The empty quadrants:**

- **Upper-middle (workspace-native + prosumer→enterprise bridge):** Waggle is nearly alone here with Notion. Waggle's edge over Notion = desktop-native + sovereign exit.
- **Upper-right (agent-native + sovereign):** Cohere, Paperclip, Glean cluster here but none have a prosumer funnel. This is where KVARK plays, fed by Waggle.

---

## 6. Opportunities

1. **Claim the "memory" narrative before Anthropic does.** Ship a public architectural post on the 5-layer memory model within 30 days. First-mover on the phrase "multi-layer memory" is worth meaningful SEO + analyst share of voice.
2. **Position against Cowork without naming it.** "You're already running an AI desktop app. What happens when you outgrow the model vendor?" Waggle = model-agnostic, memory-portable, upgrade-to-sovereign.
3. **Own "governance on the desktop."** Cost tracking + audit trail + injection scanner are already built. Package them as "Waggle Guardrails" — a one-page feature story. Paperclip talks governance but at the orchestration layer; nobody claims it at the workspace layer.
4. **Sovereign funnel narrative.** Cohere North and Glean have no Solo/free tier. Publish the explicit "Waggle → KVARK" path as a landscape diagram for CIO/CTO buyers. This is your unique sales geometry.
5. **Teams tier as the wedge against Cowork.** Anthropic has not yet shipped shared project memory for teams. Ship Waggle Teams first with shared frame memory + team-scoped KG. Aim to be the answer when a team outgrows individual Cowork.
6. **"Data never leaves your perimeter"** is an unclaimed line for desktop AI. Cohere has it for enterprise. Claim the desktop analog.
7. **Plugin/skill compatibility with Anthropic's ecosystem.** If Waggle can run Claude Skills + Cowork plugins + native personas, you short-circuit the ecosystem argument.

---

## 7. Threats

1. **Anthropic ships Cowork Teams with shared memory.** Probability: high within 6 months. Impact: direct hit on Waggle Teams differentiation. Mitigation: ship Teams first and define shared-memory primitives.
2. **Anthropic ships a VPC/sovereign enterprise SKU.** Probability: medium within 12 months (Anthropic has enterprise deals but no clean sovereign product). Impact: compresses KVARK's addressable market. Mitigation: double down on "connected to all your internal systems" (KVARK's canonical line) — lived-in integrations beat model-in-a-VPC.
3. **Microsoft Agent 365 becomes the default enterprise control plane.** Probability: high. Impact: any enterprise already on M365 E5 gets Agent 365 bundled. Mitigation: KVARK competes on flexibility and multi-cloud, not Microsoft surfaces.
4. **Notion ships a desktop-native agent with computer use.** Probability: medium within 12 months. Impact: Notion has the workspace and the installed base — if they get computer use, they catch Waggle on the X-axis. Mitigation: Waggle's memory architecture should be demonstrably more sophisticated than pages-as-memory.
5. **Open source (Hermes/Paperclip) makes "persistent memory + agents" feel commoditized.** Probability: medium. Impact: erodes Waggle's narrative premium. Mitigation: productize what OSS can't — UX, Hive DS, sovereign upgrade, support.
6. **Cohere + SAP distribution for sovereign AI.** Probability: in motion. Impact: Cohere gets the regulated-enterprise logos first. Mitigation: win geographies where SAP+Cohere is slow (or: partner, don't compete, at the infra layer).

---

## 8. Recommended Actions

### Quick wins (this week)

1. **Publish the 5-layer memory explainer.** Architectural long-read + diagram. Target: HN, X, dev.to. KPI: 500+ stars/shares in 30 days. Owner: Marko + agent.
2. **Claim the phrase "workspace-native AI with persistent memory"** on homepage H1. Tagline test vs. competitors above. Remove any generic AI-assistant language.
3. **Build the "Waggle vs. Cowork" comparison page** (honest, not trashy). Axis: memory scope, model choice, sovereign exit, price, desktop-native, plugin compat.
4. **Name and ship "Waggle Guardrails"** as a feature umbrella: CostDashboardCard + AuditTrailCard + injection-scanner. One page, one screenshot, one CTA.
5. **Add analyst-bait landscape diagram** to KVARK and Waggle homepages: "Where Waggle/KVARK sits in the AI workspace landscape, April 2026."

### Strategic moves (this quarter)

6. **Ship Teams tier before Anthropic does.** Even MVP. Shared frame memory + team-scoped KG are the defensible primitives.
7. **Publish a public benchmark.** Recall-over-time across 20 sessions, cost-per-successful-task, session resumption latency. Compare Waggle vs. Cowork vs. Notion AI. Benchmarks earn backlinks and analyst mentions.
8. **Open the "Waggle → KVARK" funnel as a named sales motion.** Not just a pricing tier — a named path ("From Solo to Sovereign"). Build it into the onboarding wizard's Step 6 (HiveReady).
9. **Skills compatibility layer with Anthropic's Skills format.** Parse existing `.claude/skills/SKILL.md` frontmatter — `packages/agent/src/skill-frontmatter.ts` exists. Ship compat so every Anthropic skill runs in Waggle. Kills the ecosystem objection.
10. **Commission a light analyst briefing.** Forrester Wave for Work AI is in flight. Get Waggle on the "Notable Vendors" list. Cost: ~$15-25k; payoff: enterprise procurement legitimacy for KVARK.

### Things not to do

- Do **not** position against ChatGPT by brand. You lose the distribution fight. Position against the *category* ("chat threads") they represent.
- Do **not** try to out-enterprise Microsoft. Out-flexibility them.
- Do **not** publish feature-parity marketing against Notion. Their installed base is the moat. Differentiate on desktop + sovereign.
- Do **not** lead with Tauri-over-Electron unless talking to developers. Buyers don't care about the framework; they care about what it enables (speed, battery, security).

---

## 9. Open Questions for Follow-On Research

These require CRM / analyst / private data beyond this brief:

- **Waggle current win/loss reasons** (no access here — pull from HubSpot/CRM)
- **Anthropic's Cowork Teams timeline** (no public signal yet; sales intel play)
- **Cohere North deal sizes and close rates** (G2 reviews don't show this; analyst subscription needed)
- **Real Glean POC conversion rate** (reportedly 30–40%, but needs confirmation)
- **Paperclip commercial traction** (still open-source-first; watch Sep 2026 for paid tier)

---

## 10. Research Appendix

### Primary-source competitor URLs consulted
- Claude Desktop/Cowork: claude.com/download, support.claude.com/release notes, Cowork get-started doc
- ChatGPT Desktop: chatgpt.com/features/desktop, openai.com/codex-app
- Notion AI: notion.com/product/ai, notion.com/releases/2026-01-20
- Granola: granola.ai/pricing, TechCrunch Series C coverage
- Mem: get.mem.ai/pricing
- Microsoft: microsoft.com/microsoft-365-copilot/pricing
- Glean: glean.com
- Writer: writer.com, businesswire Skills announcement
- Cohere North: cohere.com, betakit/TechCrunch North launch coverage, SAP partnership
- Hermes Agent: hermes-agent.nousresearch.com
- Paperclip: paperclip.ing, paperclipai.net

### Freshness caveats
- Pricing quoted is publicly listed as of April 15, 2026. Enterprise deals are quote-based and may differ.
- Anthropic's Cowork is evolving weekly; recheck before any comparison page goes live.
- Microsoft E7 Frontier Suite pricing is preannounced for May 1, 2026 launch.

---

*Maintained by: Marko Markovic · Egzakta Group · April 15, 2026 · waggle-os.ai · www.kvark.ai*

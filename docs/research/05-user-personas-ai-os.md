# What Users Want from an AI Operating Workspace — Persona Voice-of-Customer

**Author:** Waggle OS research series (5 of 7)
**Drafted:** 2026-04-15 (overnight batch)
**Audience:** Product leadership deciding Q2/Q3 roadmap priorities and persona-specific launch messaging.

---

## TL;DR

Seven archetypal users of an AI operating workspace, distilled from market segmentation, conversations on HN/Reddit/Twitter through 2025-2026, and Waggle's own user-profile memories. For each: primary job-to-be-done, pain points with today's AI tools, what they'd pay for, and which Waggle tier/feature set serves them.

**Cross-persona signal:** persistent memory is the universal want (7/7). Compliance is top-3 for 3/7. Local-first matters for 5/7. Skill/connector extensibility matters most for the power-user personas (product owner, founder, IT admin). **Waggle's tier ladder (Trial → Free → Pro $19 → Teams $49/seat → Enterprise/KVARK) maps cleanly to this persona distribution; the one gap is persona 7 (prosumer creative), for whom the current Pro tier is priced right but the onboarding emphasizes work context over personal life.**

---

## Persona 1 — The Product Owner / Strategic Operator *(the Marko archetype)*

**Role signals:** Group CEO / VP Product / founder-operator / chief of staff. Runs 5-10 concurrent initiatives. Meets 6-10 stakeholders a week. Writes more than they code.

**Jobs to be done:**
- Stay on top of every concurrent project without dropping threads
- Remember what was decided, by whom, when, and why
- Draft stakeholder updates in the stakeholder's voice and context
- Delegate to specialists (human or AI) and check their work

**Pain points with today's AI:**
- ChatGPT forgets across conversations
- Claude Projects remembers *inside* a project but can't cross-link
- Notion AI is shallow on reasoning
- Every tool is a silo; copy-paste tax is real
- No trail of *why* a decision was made

**Wants from an AI OS:**
- A "where did we land on X?" search across every conversation, every document, every email I've had about X
- Auto-drafted stakeholder updates *in the right voice* (different for board vs team vs customer)
- A decision log that auto-maintains itself — I shouldn't have to type "Decision: Y" explicitly
- A multi-agent Room so I can watch a researcher + writer + analyst work in parallel on the same question
- Calendar/email/Slack context bleed into any conversation

**Pricing tolerance:** $19-49/mo personal budget; $49-200/seat on company card.

**Killer feature for this persona:** memory that survives across weeks and picks up threads when you say "where were we on that client pitch?" — plus a three-agent Room that handles prep while they're in a meeting.

**Waggle fit:** Pro or Teams tier. The Room canvas, persona system (13 built-in), and Memory Harvest (ChatGPT/Claude/Claude-code/Gemini/Perplexity) are all hit-first features for this persona. **Top gap:** stakeholder-voice detection isn't an explicit skill yet — could be a Gap E-style promotable skill that gets created on first use.

---

## Persona 2 — The Knowledge Worker *(legal / finance / HR / compliance)*

**Role signals:** lawyer, GC, CFO/Controller, HR lead, compliance officer. Every deliverable could end up in a courtroom or an audit.

**Jobs to be done:**
- Produce defensible work product (contracts, financial analyses, policies, audits)
- Comply with sector regulations (GDPR, SOX, HIPAA, AI Act, ISO 27001)
- Manage expertise — capture what the senior does so juniors can approximate it
- Defend positions with citations

**Pain points:**
- Cannot upload sensitive docs to public LLMs (confidentiality breach risk)
- No audit trail for AI-assisted decisions
- Can't explain *why* the AI gave that answer — dangerous for regulated work
- Senior expertise evaporates when the senior leaves

**Wants:**
- Compliance-by-default: every AI interaction logged with risk classification, attributable to a user, retainable for N years
- Document analysis that provably stays inside the organization
- Version-controlled drafts with peer/expert approval gates
- Expert-approved skills: "review this NDA with our firm's standards"
- Explainability: which memory influenced this answer, with citations
- AI Act FRIA-style assessments for high-risk workspaces (hiring, credit, legal)

**Pricing tolerance:** $49+ per seat; CIO budget. Will pay $200+/seat for sovereign deployment with proper controls.

**Killer feature:** an AuditReport PDF (AI Act Art 12/14/19/26/50 status) they can hand to their GC or regulator on demand.

**Waggle fit:** Teams tier for the day-to-day, KVARK for the firm-wide deployment. The compliance-PDF generator (Gap H shipped this session) is a direct hit. **Top gap:** expert-approved skills need a review/attestation workflow on top of the promotion gate (Gap E); today promotion is author-unilateral.

---

## Persona 3 — The Developer *(IDE power user, CLI native)*

**Role signals:** staff engineer / senior IC / solo hacker. Lives in the terminal. Has opinions about line length.

**Jobs to be done:**
- Ship code faster without sacrificing quality
- Minimize context-switching between ticket → code → review → deploy
- Maintain personal knowledge of codebase idioms across projects

**Pain points:**
- Copilot/Cursor forget the codebase's taste between sessions
- AI tools don't respect their style (spaces vs tabs, early-return idioms)
- Mystery-tokens hidden inside SaaS agents
- Escape-hatch problem: when the AI is wrong, getting back to manual is friction-heavy

**Wants:**
- Git-aware memory: "last time I touched this file, I chose pattern X because Y"
- Terminal-first workflow; nothing forced into a GUI
- Skill composability: write-test → implement → review → commit as a chainable pipeline
- Cost observability per turn (tokens in, tokens out, $$ spent)
- Local-first: my code and my memory don't leave the machine by default
- Fast escape hatches: `/fast`, `/bypass`, one-key undo

**Pricing tolerance:** $19-49/mo personal; will expense up to $200/mo if cost tracker shows ROI.

**Killer feature:** persistent memory of code patterns that survives IDE restart *and* syncs across their 3 machines. Paired with a cost tracker that ends the "my API bill shocked me" problem.

**Waggle fit:** Pro tier. Strong match on terminal-first (Claude Code harvest built-in), cost tracker, Git tools, background bash. **Top gap:** no dedicated IDE integration (Cursor adapter is on the backlog); devs want Waggle memory available *inside* the IDE, not just in a separate desktop app.

---

## Persona 4 — The Research Scientist *(AI researcher / analyst / management consultant)*

**Role signals:** PhD-adjacent roles where deliverables need citations. Thinks in hypotheses. Allergic to hallucination.

**Jobs to be done:**
- Conduct deep-research flows across many sources
- Track citations with provenance
- Run reproducible experiments and write them up
- Synthesize findings into structured knowledge

**Pain points:**
- Perplexity/ChatGPT hallucinate citations
- Can't trust a claim without tracing it to the source
- Research notebooks get orphaned from their source data
- Can't reproduce last month's experiment because the state's gone

**Wants:**
- Citation-aware search: every claim links to the frame/document/URL it came from
- Experiment logs with input → model → output → evaluation
- Data lineage across sources (this conclusion depended on this frame, which came from this harvest)
- Wiki-style structured knowledge (entity pages, concept pages, synthesis pages)
- Reproducible workspace snapshots (export and re-import for colleagues or future-self)

**Pricing tolerance:** $49-200/mo via institutional budget.

**Killer feature:** "show me every frame that influenced this answer" with a timeline of when each was acquired. Plus the Wiki Compiler producing publishable entity/concept pages.

**Waggle fit:** Pro or Teams tier. Waggle's Wiki Compiler, HybridSearch provenance (source field: user_stated / tool_verified / agent_inferred), and Execution Trace Store are all hits. **Top gap:** citation attribution inside assistant messages isn't exposed in the UI today — provenance is captured but not rendered inline with answers.

---

## Persona 5 — The Startup Founder *(solo or 2-10 team)*

**Role signals:** wears 5 hats. CEO / CTO / sales rep / recruiter / customer success in rotation.

**Jobs to be done:**
- Ship the product
- Raise money
- Hire the first 10
- Keep customers happy
- Stay alive (runway)

**Pain points:**
- Tool sprawl — SaaS bill exceeds laptop price every month
- Context from a customer call on Tuesday is lost by Thursday
- Writing *everything* solo (investor updates, job posts, onboarding emails, product copy)
- No institutional memory — the founder IS the memory

**Wants:**
- Swiss army knife: CRM + fundraising + strategy + hiring in one memory
- Fast skills for email drafts, deck outlines, investor updates in *their* voice
- Low cost ($19/mo ceiling early, $49/mo once revenue hits)
- Zero learning curve — must work the first 5 minutes
- Local-first — competitive data doesn't leak to OpenAI/Anthropic

**Pricing tolerance:** $19/mo until funded, $49/mo post-seed, $200+/mo once they can hire ops.

**Killer feature:** one mind that remembers every customer call, investor pitch, team standup, competitor mention, go/no-go decision — *forever*.

**Waggle fit:** Trial → Free → Pro arc. Memory Harvest from ChatGPT/Claude/Notion, rapid skill creation, low cost. **Top gap:** no native CRM skill/connector yet at the quality level a founder expects (HubSpot/Salesforce connectors exist in the MCP catalog but aren't pre-configured).

---

## Persona 6 — The Enterprise IT Admin / CIO / CISO

**Role signals:** responsible for AI governance at a 500-50,000 employee firm. Has board reporting obligations.

**Jobs to be done:**
- Allow safe AI adoption across the workforce
- Comply with GDPR / EU AI Act / industry regulation
- Prove to the board that AI isn't leaking IP or creating audit exposure
- Minimize shadow-IT AI usage

**Pain points:**
- Employees use random LLMs with company data ("shadow AI")
- No audit trail
- GDPR/AI-Act exposure (fines up to 7% of global revenue)
- Every vendor promises "enterprise-ready" — few actually are

**Wants:**
- Sovereign deployment (on-prem or dedicated VPC) — data never leaves perimeter
- RBAC, SSO/SAML, MFA, SCIM provisioning
- Full audit — every AI interaction attributable, retainable, exportable
- Data residency controls (EU-only, US-only, specific region)
- Kill switch — disable AI features company-wide in one click
- Zero data exfil *provably*

**Pricing tolerance:** $40K-500K+/year depending on seats; $1M+ deals for multi-region Fortune 500 deployments.

**Killer feature:** Waggle on *their* Kubernetes, connected to *their* permissioned data, with a compliance PDF ready to show their DPO and their regulator.

**Waggle fit:** KVARK (enterprise tier). The sovereign value proposition from CLAUDE.md §9 ("Everything Waggle does — on your infrastructure … full data pipeline injection, your permissions, complete audit trail, governance. Your data never leaves your perimeter") is written for this persona. **Top gap:** SSO/SAML/SCIM aren't in the current codebase surface; the team-sync layer exists but enterprise IDP integration is a KVARK deployment-time concern rather than a productized feature today.

---

## Persona 7 — The Consumer Prosumer *(creator, writer, entrepreneur-of-one)*

**Role signals:** content creator, novelist, freelancer, solopreneur, life-optimizer.

**Jobs to be done:**
- Creative output (writing, video, image)
- Personal knowledge building (second brain)
- Lifestyle automation (travel, health, finance)

**Pain points:**
- ChatGPT forgets every conversation
- Claude Projects has quotas that hit mid-flow
- Privacy — life data treated as training corpus
- Every app is a silo, cross-search is impossible

**Wants:**
- AI that remembers *life* context (family, health, hobbies, goals, relationships)
- Creative tools (image gen, voice, video) alongside text
- Memory of preferences (writing voice, visual style, tone)
- Casual setup — no CLI, no configuration files
- Privacy — "my life is not your training data"

**Pricing tolerance:** $19/mo Spotify-tier mental model; some will pay $49 for creative add-ons.

**Killer feature:** persistent memory that grows over months and makes the assistant actually *know them* as a person.

**Waggle fit:** Pro tier with creative skills. Memory Harvest is strong. **Top gap:** onboarding currently emphasizes work/workspace context; a "personal life" mode that greets with "what should I remember about you as a person, not as a professional?" would widen this segment.

---

## Cross-persona observations

| Want | Who wants it (n/7) | Waggle status |
|---|---|---|
| Persistent memory across conversations | 7/7 | ✅ shipped — core differentiator |
| Compliance-by-default | 3/7 (Knowledge worker, IT admin, Researcher) | ✅ shipped + boardroom PDF (Gap H) |
| Local-first / sovereign | 5/7 (Developer, Founder, IT admin, Researcher, Prosumer) | ✅ Tauri binary + KVARK on-prem |
| Citation / provenance | 3/7 (Researcher, Knowledge worker, IT admin) | ⚠️ captured but not exposed inline in UI |
| Skill/connector extensibility | 4/7 (Product owner, Developer, Founder, IT admin) | ✅ shipped — Gap A/E/F + MCP catalog |
| Multi-agent coordination | 2/7 (Product owner, Founder) | ✅ Room canvas + subagent tools |
| Self-evolution visibility | 2/7 (Product owner, Researcher) | ✅ Evolution tab + hypothesis v2 in flight |
| Creative/multimodal | 2/7 (Prosumer, Founder) | ⚠️ generate_docx + nano-banana skills exist; video/voice lighter |
| Cost observability | 2/7 (Developer, Founder) | ✅ CostTracker shipped |
| IDE-native integration | 1/7 (Developer) | ❌ no IDE plugin today |
| SSO / SAML / SCIM | 1/7 (IT admin) | ❌ deployment-time for KVARK, not productized |

## Persona-to-roadmap heat map

| Roadmap item | Top-benefiting personas |
|---|---|
| Hypothesis v2 publication | 1, 4 (credibility), 6 (board trust) |
| Stripe → Teams tier live | 2, 3, 5 (revenue path) |
| Code signing / installer polish | 5, 7 (low-friction install) |
| Cursor harvest adapter | 3 |
| Shared team memory | 1, 2, 6 |
| Citation-inline UI | 4, 2 |
| IDE plugin | 3 |
| SSO / SAML | 6 |
| "Personal life" onboarding mode | 7 |
| Stakeholder-voice skill pack | 1 |

## Closing note

The seven personas above are **not** orthogonal — most real users occupy 2-3 at once (e.g., a founder-developer, a researcher-prosumer). The design implication is that Waggle should avoid hard persona-segmentation UX (single-path onboarding wizards per persona) and instead expose primitives that compose for overlapping jobs. The persona system already does this: 13 built-in personas + custom-persona support + a Room where 3 personas can collaborate.

The strongest single message across all 7: **"Your AI remembers. Your data stays yours. Your compliance trail writes itself."** — three sentences that 6 of 7 personas would nod at. That's the billboard.

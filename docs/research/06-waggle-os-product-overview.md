# Waggle OS — Product Overview

**Author:** Waggle OS research series (6 of 7)
**Drafted:** 2026-04-15 (overnight batch)
**Scope:** Comprehensive product overview — pitch, architecture, memory stack, evolution stack, feature taxonomy, tier model, user patterns, competitive positioning, defensibility.

---

## TL;DR

**Waggle OS is a workspace-native AI agent platform with persistent memory.** It ships as a Tauri 2.0 desktop binary for Windows and macOS, with a local Fastify sidecar and SQLite-backed memory. The product pitch in one sentence: *"Your AI remembers. Your data stays yours. Your compliance trail writes itself."*

It has three strategic roles:

1. **Stand-alone product** across 5 tiers (Trial 15d → Free → Pro $19 → Teams $49/seat → Enterprise/KVARK consultative)
2. **Demand-gen engine for KVARK** — Egzakta Group's sovereign-AI enterprise platform ([www.kvark.ai](https://www.kvark.ai))
3. **Research platform** — the evolution subsystem (GEPA + EvolveSchema loop) runs continuously, producing the headline claim that **Gemma 4 31B with a Waggle-evolved prompt scored 108.8% of raw Opus 4.6** on blind multi-vendor evaluation (v1, 10 coder questions; v2 scaling to 60 × 3 domains pending Marko's Q1-Q5 decisions)

It's differentiated by the combination of: persistent memory (not just RAG), compliance-by-default (EU AI Act logging baked in), local-first deployment (not SaaS-first with an on-prem afterthought), self-evolution (prompts improve from real usage), and a wiki-style structured-knowledge compiler on top of the memory corpus.

---

## 1. The pitch

### 1.1 One-sentence pitches per audience

- **Prosumer:** "The AI that actually remembers you. Works on your laptop. Your data stays yours."
- **Small team:** "Your team's AI operating system. Shared memory, shared skills, one $49/seat."
- **Enterprise buyer:** "Everything your team does with AI — on your infrastructure, with full compliance out of the box."
- **Researcher / technical:** "Persistent multi-tenant memory with compliance-by-default, frame-based temporal storage, hybrid RRF search, and a closed-loop prompt-evolution stack."
- **Investor:** "Waggle is the demand-generation wedge for KVARK, Egzakta's EUR 1.2M-contracted sovereign-AI enterprise platform. The free tier creates lock-in (memory is free forever), the paid tiers monetize (skills + connectors), and the enterprise tier (KVARK) closes on-prem deals."

### 1.2 The strategic function

Waggle OS is **the wedge.** The memory + harvest + skills system drives adoption and retention in the consumer/prosumer/team segments. As those users inside enterprise organizations hit the "we can't ship sensitive data to the cloud" wall, Waggle's enterprise tier (KVARK) becomes the answer — same product, deployed on the customer's infrastructure, with full data-plane control and compliance.

---

## 2. Architecture — verified April 2026

From `D:/Projects/waggle-os/CLAUDE.md`:

| Layer | Stack |
|---|---|
| Frontend | React **19** + TypeScript + Vite + Tailwind 4 + base-ui/react |
| Desktop | Tauri 2.0 (Rust shell) |
| Backend (local) | Fastify sidecar (Node.js, bundled into Tauri) |
| LLM routing | LiteLLM (`litellm-config.yaml`) |
| Database | SQLite via `@waggle/core` (better-sqlite3 + sqlite-vec-windows-x64) |
| Memory | FrameStore + HybridSearch + KnowledgeGraph + IdentityLayer + AwarenessLayer |
| Agent runtime | `packages/agent/src/agent-loop.ts` |
| Billing | Stripe (`stripe@^21.0.1`) — code-complete per `docs/p0-stripe-and-signing-readiness.md` |
| Design | Hive DS — honey #e5a000 / hive-950 #08090c / accent #a78bfa |
| Tests | Vitest (unit) + Playwright (E2E) |
| Deploy | Dockerfile + docker-compose.production.yml + render.yaml |

Package manager: npm (with bun.lock present). Node ≥20. 16 packages in the workspace (`packages/*`).

### 2.1 Why local-first

The Tauri binary runs on the user's machine. The Fastify sidecar is bundled into the binary — it's a local HTTP server listening on a private port. The SQLite `.mind` files live in `~/.waggle/minds/`. This means:

- Memory is local. No cloud dependency for the core experience.
- LLM calls go through the user's configured provider (Anthropic / OpenAI / Ollama / LiteLLM proxy) — the user controls where inference happens.
- Offline use works for memory search, identity, awareness; it falls back gracefully when LLM provider is unreachable.
- Team workspaces opt into a team server for cross-member sync; personal stays fully local.
- Enterprise (KVARK) mirrors the same architecture but on the customer's Kubernetes / on-prem.

This is **architecturally opposite** to SaaS-first competitors (ChatGPT, Notion AI, Dust.tt). Those can add "on-prem" as a variant; Waggle is on-device by default.

---

## 3. The memory stack — the core differentiator

Five layered components, all in `@waggle/core`:

### 3.1 FrameStore (`frames.ts`)

A frame is the atomic unit of memory. Three frame types, modeled loosely after video compression:

- **I-frame (Independent)** — a keyframe; full content, self-contained
- **P-frame (Predicted)** — delta from an earlier I-frame; contextual continuation
- **B-frame (Bidirectional)** — a link between frames (entity co-occurrence, cross-session reference)

This gives the memory system a temporal structure — related content stays grouped, decay works on the cluster not per-item, and consolidation can merge P-frames back into an upgraded I-frame without losing history.

### 3.2 SessionStore (`sessions.ts`)

A session is a conversation arc. Each session has a `gop_id` (Group of Pictures, to extend the video metaphor). Sessions have lifecycle states: active → closed → archived. The weaver consolidates and distills per-session.

### 3.3 HybridSearch (`search.ts`)

RRF (Reciprocal Rank Fusion) hybrid of vector + BM25/FTS5 keyword, with scoring profiles: `balanced / recent / important / connected`. The combined-retrieval layer (`agent/src/combined-retrieval.ts`) merges workspace + personal + KVARK enterprise search with source attribution and conflict detection.

### 3.4 KnowledgeGraph (`knowledge.ts`)

Entities and relations with SCD-Type-2 temporal validity (`valid_from` / `valid_to`). Auto-populated by CognifyPipeline on every memory write. The KG is what powers Waggle's "smart about *you*" moments — when you mention "Samantha," the agent knows it's the Samantha from company Acme, not a different one.

### 3.5 IdentityLayer + AwarenessLayer (`identity.ts`, `awareness.ts`)

- **Identity** = stable facts about the user (name, role, company, preferences, communication style). Auto-derived from the first N conversations during onboarding.
- **Awareness** = volatile state (active tasks, recent actions, pending approvals, flags). Updated on every turn.

### 3.6 CognifyPipeline (`agent/src/cognify.ts`)

The write path. On every `save_memory` call: extract entities with an LLM, resolve to the KG (add new or merge with existing), create the frame, index for search, update awareness.

### 3.7 MemoryWeaver (`@waggle/weaver`)

The consolidation loop. Runs on schedule (hourly consolidation, daily decay). Operations:
- **consolidateGop** — merge I + P-frames into a richer I-frame, deprecate the old P-frames
- **decayFrames** — delete deprecated zero-access frames
- **strengthenFrames** — upgrade importance of heavily-accessed frames (temporary → normal → important)
- **linkRelatedFrames** — detect shared entities across frames, create B-frames to connect them

### 3.8 Wiki Compiler (`@waggle/wiki-compiler`)

A novel layer on top of the memory. It reads the user's entire memory corpus and produces structured *pages*:
- **Entity pages** — per-entity (per-person, per-project) summarization with timeline
- **Concept pages** — clustered themes across frames
- **Synthesis pages** — multi-source distillation on specific queries

Per memory: 18 MCP tools wired to the compiler; 7 wiki pages built from real data in live test. This is Waggle's answer to "how do I navigate my memory?" — a living second-brain wiki that updates incrementally.

### 3.9 Multi-mind layer

- **Personal mind** — lives at `~/.waggle/minds/personal.mind`
- **Workspace minds** — per-workspace at `~/.waggle/minds/<workspaceId>.mind`
- **Team minds** — team-scoped MindDB, shared via `TeamSync` (today: frame sync only; see `docs/p1-features-triage-2026-04-15.md` for the expansion plan)
- **MultiMindCache** — opens/closes MindDBs on demand with LRU eviction
- **Cross-workspace read** — `read_other_workspace` tool with approval gate for sanctioned cross-mind access

---

## 4. The evolution stack — Waggle's research differentiator

Ten files in `packages/agent/src/` implementing a closed-loop prompt-evolution system:

- `execution-traces.ts` — records every chat turn with inputs, outputs, scores
- `eval-dataset.ts` — curates held-out eval sets from trace data
- `judge.ts` — LLM-as-judge scoring (multi-vendor pool)
- `iterative-optimizer.ts` — GEPA-style iterative mutation with rank-by-score
- `evolve-schema.ts` — EvolveSchema-style structural prompt evolution (per Mikhail's paper, integration target — being verified overnight)
- `compose-evolution.ts` — combines GEPA + EvolveSchema signals
- `evolution-gates.ts` — constraint gating (can't deploy a candidate that fails X)
- `evolution-llm-wiring.ts` — model routing for evolution runs
- `evolution-orchestrator.ts` — high-level run coordinator
- `evolution-deploy.ts` — atomic deploy of accepted candidates (persona + behavioral-spec overrides)

**Current headline result (v1):** 10 coder questions, 4 blind judges (Haiku + Sonnet + two others), Gemma 4 31B with Waggle-evolved prompt scored **108.8% of raw Opus 4.6**. Per-judge geometric mean, with multi-vendor judge pool so no self-bias. Evolved prompt added only +91 tokens over baseline.

**v2 scaling plan:** 60 examples × 3 domains (writer/analyst/researcher) × 3 baselines (weak / human-engineered / GEPA), multi-vendor 4-judge pool, bootstrap 95% CI + permutation test, hard train/test split, ~$200, ~4 days. **Q1-Q5 decisions memo'd** in `docs/hypothesis-v2-decisions.md`; **execution plan** in `docs/hypothesis-v2-execution-plan.md`. Awaiting Marko's greenlight to run.

### Why this matters commercially

Every KVARK sales conversation benefits from being able to say: "Our evolution stack continuously improves your deployment's prompts on your own data — *without* sending anything off-premise. A 31B model can outperform flagship cloud models when you let it learn from your usage." Self-evolution on sovereign infrastructure is a structurally harder promise for Anthropic / OpenAI / Google to match, because their business model forbids customer data crossing the return path to their training loop.

---

## 5. Features — taxonomy

### 5.1 Core features (all tiers)

| Feature | Where |
|---|---|
| Persistent memory | FrameStore + CognifyPipeline |
| Cross-tool harvest | 11 adapters (chatgpt/claude/claude-code/claude-desktop/gemini/perplexity/markdown/plaintext/pdf/url/universal) |
| Hybrid search | HybridSearch (RRF vector + keyword) |
| Knowledge graph | KnowledgeGraph with SCD-2 |
| Wiki compiler | `@waggle/wiki-compiler` |
| Agent runtime | multi-persona, multi-turn, tool-aware |
| Skills | 20+ starter + user-created + auto-extracted |
| Connectors | 12 native + 148+ MCP catalog |
| Compliance logging | InteractionStore + ReportGenerator |
| Cost tracking | CostTracker (per model, per workspace) |

### 5.2 Pro-tier adds ($19/mo)

- Unlimited workspaces (Free caps at 5)
- Full MCP catalog access
- All 12 native connectors
- Skill marketplace access
- Workspace-scope skill promotion
- Advanced evolution tab (review + accept evolved prompts)

### 5.3 Teams-tier adds ($49/seat/mo)

- Shared team mind (team-scoped frames + skills)
- WaggleDance (multi-agent coordination across team members)
- Governance controls (skill promotion approvals, audit reports per user)
- Team-level compliance PDF rollup

### 5.4 Enterprise / KVARK adds (consultative)

- On-premise / private-VPC deployment
- SSO/SAML/SCIM + RBAC
- Enterprise skill + connector whitelisting
- Sovereign LLM routing (your models, your endpoints)
- Data residency controls
- Custom compliance frameworks beyond AI Act
- Professional services engagement model

### 5.5 Notable feature deep-dives

- **Room canvas** — a visual space where multiple personas can be assigned to concurrent work on a shared question. Real-time status tiles ("researcher: running / writer: waiting / analyst: done"). Per memory: shipped in Phase A.
- **Personas** — 13 built-in (researcher, writer, analyst, coder, project-manager, executive-assistant, sales-rep, marketer, product-manager-senior, hr-manager, legal-professional, finance-owner, consultant), custom-persona support via `custom-personas.ts`. Per CLAUDE.md §5, 4 new planned (general-purpose, planner, verifier, coordinator) for a target of 17.
- **Onboarding wizard** (`apps/web/src/components/os/overlays/OnboardingWizard.tsx`) — 7-step; post Memory-Harvest-Strategy recommendation should become harvest-first.
- **Evolution tab** — MemoryApp subtab; shows pending evolution runs, before/after previews, accept/reject UI.
- **Evolution hypothesis tests** — Waggle is the only AI product I know of that *runs evolution A/B tests on itself and publishes the results* (pending v2 publication).
- **Approval inbox with grants** — every destructive action (delete file, send email, run bash) shows an approval card. Three autonomy tiers: Normal (always approve) / Trusted (session-level trust) / YOLO (accept all, for dev/CI).

### 5.6 Trial / Free / Pro differentiation

Per CLAUDE.md §1:

| Tier | Price | Purpose |
|---|---|---|
| TRIAL | $0 / 15 days | All features unlocked; falls back to FREE after 15 days |
| FREE | $0 forever | 5 workspaces, agents, built-in skills only |
| PRO | $19/mo | Unlimited, marketplace, all connectors |
| TEAMS | $49/mo per seat | Shared workspaces, WaggleDance, governance |
| ENTERPRISE | Consultative | KVARK sovereign on-prem |

**Moat strategy** (per memory `project_tier_strategy`): Memory + Harvest is free forever (lock-in). Agents are free (they generate memory). Skills and connectors are the upgrade trigger. Team/Enterprise is about governance + sovereignty, not feature count.

---

## 6. User patterns

### 6.1 Solo pattern (Free / Pro)

- Install Waggle → onboarding wizard → harvest ChatGPT/Claude → identity auto-populates
- User works in personal mind; frames accumulate; skills get auto-extracted
- Evolution runs quietly; user accepts improvements occasionally
- After ~30 days, the user's mind has 1000+ frames, 20+ skills (mix of starter + custom), 3-5 connectors
- The user's "aha" moment: asking a question that *their* version of Waggle answers uniquely well because of their harvest

### 6.2 Team pattern (Teams)

- Workspace admin creates the team workspace + invites 2-10 members
- Each member harvests their own AI tools → team mind fills with diverse-perspective frames
- Shared skills emerge (one member's "client-proposal-v2" skill gets promoted to team scope)
- Disagreements surface via Gap K's write-path contradiction detection ("Alice's frame says X, Bob's says NOT X — worth a conversation")
- Manager uses compliance PDF (Gap H) for monthly / quarterly governance check-in

### 6.3 Enterprise pattern (KVARK)

- IT admin deploys Waggle/KVARK on customer infrastructure (Kubernetes + pg/Redis + LiteLLM endpoint + SSO)
- RBAC + skill whitelisting applied
- Enterprise-scope skill library managed by a Center of Excellence team
- Every business unit has its own workspace; cross-unit read requires approval
- Executive dashboard aggregates compliance + cost + usage across org
- Professional services engagement delivers custom connector SDK work + workspace templates per department

---

## 7. Competitive positioning

### 7.1 Nearest competitors and how Waggle differs

| Competitor | Waggle's advantage |
|---|---|
| **Claude Projects** | Claude can't harvest from ChatGPT/Cursor; isolated per project; no on-prem; no skill marketplace; no evolution |
| **ChatGPT Teams / Workspace** | ChatGPT forgets across conversations (limited memory); no on-prem; all data on OpenAI infra |
| **Cursor** | IDE-only; no persistent memory across projects; no non-dev personas |
| **Notion AI** | Shallow reasoning; data captive in Notion; no multi-agent |
| **Mastra / Letta / CrewAI** (agent frameworks) | Lib-first, not product; requires dev effort to assemble; no memory out of the box |
| **mem0 / Zep** (memory libs) | Lib-first, not product; no wiki/skills/compliance/UI |
| **Dust.tt** | SaaS-first; less compliance story; smaller ecosystem |
| **Glean** | Search-focused; no agent action; no local deployment |
| **Writer / Cohere North** | Closed-platform SaaS; steep enterprise-only pricing; less memory story |
| **Microsoft Copilot Studio** | Deep MS ecosystem lock-in; not for non-MS shops; Azure-only |
| **Salesforce Agentforce** | CRM-scoped; not a general AI OS |

### 7.2 Defensibility layers

1. **Local-first architecture** — structurally harder for SaaS-first competitors to copy quickly
2. **Frame-based memory model** — patentable; temporal structure + provenance is non-obvious
3. **Harvest corpus lock-in** — once a user has 1000+ frames, switching costs are psychological
4. **Compliance-by-default** — AI Act is coming; competitors who retrofit will lag
5. **Evolution loop** — hard to replicate at the model vendor level without customer data access (which they don't have and won't have)
6. **Brand: Hive DS + narrative cohesion** — Waggle / hive-mind / honeycomb / KVARK forms a coherent aesthetic + story

### 7.3 What could disrupt Waggle

- **Anthropic Claude-native memory** shipping across devices with their own harvest — if they had the right to access the user's ChatGPT history (they don't), they could win memory at the model-vendor layer
- **OpenAI Workspace with true persistent memory** — same caveat
- **Apple Intelligence** shipping a system-level memory layer across iOS/macOS — potentially disruptive for the prosumer segment
- **Open-source takeoff** — if mem0 or Letta suddenly get 50k stars and a VC-backed productization, they close the memory gap

**Waggle's strategic countermove:** ship the OSS split (`hive-mind` — see `docs/research/01-oss-memory-packaging-strategy.md`) to set the terms of the ecosystem. If the OSS memory layer becomes a standard, Waggle benefits as the reference implementation and best-product-on-top.

---

## 8. Shipping state as of 2026-04-15

### 8.1 Production-ready

- Core memory stack: frames, sessions, search, KG, identity, awareness, cognify, weaver, wiki compiler
- Agent runtime: chat loop, personas, tools, hooks, approval gates
- Harvest: 11 adapters production-tested, 156+ frames from real Claude Code usage per prior memory
- Evolution stack: 10 files, 357+ evolution tests, end-to-end closed loop, v1 hypothesis published
- Compliance: interaction store, status checker, report generator, PDF generator (Gap H shipped this session)
- Test suite: **1957/1957 green** after this session's sweep (agent package)
- TypeScript: **clean** on @waggle/agent, @waggle/core, @waggle/server
- Tauri desktop binary: builds, runs, M2 tested per prior memory

### 8.2 Blocked on external action

- **Stripe products** — code-complete; dashboard setup + env vars needed
- **Windows code signing** — EV cert purchase (1-3 day issuance)
- **Hypothesis v2 run** — Q1-Q5 decisions memo'd awaiting Marko's greenlight

### 8.3 Deferred with clear triggers

- Cursor harvest adapter
- Copilot harvest adapter (blocked on GitHub export API)
- StorageProvider wiring for agent file tools (premature abstraction today)
- Shared team memory expansion (beyond frame sync)

### 8.4 Planned but not started

- Ollama + hardware scan + NSIS installer (free-tier local-inference failover)
- OnlyOffice inline editing (M4+; KVARK-only for now)

---

## 9. Metrics the product should hit in 2026-2027

### 9.1 Activation

- ≥60% of new users harvest ≥1 source in the first session
- ≥30% complete the 3-source "my AI life is unified" journey in week 1

### 9.2 Retention

- 30-day retention ≥2.5× higher for harvested-users vs non-harvested-users
- 90-day retention for Pro tier ≥75%
- Teams tier churn <5% annual

### 9.3 Revenue

- Free → Pro conversion 5-10% (industry benchmark for freemium prosumer SaaS)
- Teams ACV $49 × median seats × 12 = realistic $3k-6k ACV per team
- Enterprise deal sizes $40k-500k+ initial, $100k-1M+ expansion
- Egzakta's EUR 1.2M contracted + KVARK pipeline growing

### 9.4 Research / brand

- v2 hypothesis published (research note)
- 1-3 podcast appearances
- Reference-customer quote from a compliance-sensitive enterprise buyer
- OSS hive-mind repo ≥1k stars in 6 months (if we ship the OSS split)

---

## 10. Strategic risks + mitigations

| Risk | Mitigation |
|---|---|
| Anthropic / OpenAI ship credible memory | Waggle's local-first + cross-tool harvest + evolution are structurally different; lead by 6-12 months on compliance |
| Enterprise sales cycles too long for pipeline | Free-tier-to-enterprise motion (land prosumer users → they advocate inside their company) |
| AI Act enforcement delays hurt urgency | Back-up argument: governance-by-default is also good GDPR/SOC2/ISO posture |
| Tauri ecosystem risk (niche vs Electron) | Architecture is portable; can swap to Electron if needed (wouldn't bet the company) |
| Evolution claim doesn't replicate at scale | Q5 pre-commits to publishing negative results; trust from honesty > trust from hype |
| OSS community captures the memory narrative first (mem0 gets funded) | Ship `hive-mind` now; be the reference implementation |

---

## 11. The one-paragraph strategic thesis

Persistent, local-first memory is the feature every AI product will have in 5 years. **Waggle is building it now as a coherent product stack with compliance, self-evolution, and an enterprise sovereignty answer (KVARK) that SaaS-first competitors will struggle to replicate.** The freemium wedge drives adoption, the harvest layer creates lock-in, the skills + connectors layer monetizes, and the enterprise tier closes on the largest budgets. The evolution subsystem is the proof point that differentiates Waggle in conversations with technical buyers and researchers. The OSS split (`hive-mind`) is the play to own the memory-layer narrative before a competitor does.

---

## Appendix A — 16-package workspace map

```
packages/
├── admin-web         UI for team/enterprise admin console
├── agent             Agent runtime — the orchestration + tools + personas core
├── cli               Headless Waggle for scripting + CI
├── core              Memory primitives (frames, search, KG, identity, awareness, mind, harvest, compliance)
├── launcher          Installer + first-run bootstrap
├── marketplace       Skill / connector marketplace (security gate lives here)
├── memory-mcp        MCP server exposing memory tools to other AI agents
├── optimizer         Thin Ax wrapper — one-shot program utilities (see docs/optimizer/README.md)
├── sdk               Starter skills + templates for devs
├── server            Fastify sidecar — wires @waggle/core + @waggle/agent into HTTP + SSE
├── shared            Types, constants, Zod schemas, tiers, MCP catalog
├── ui                Shared React primitives
├── waggle-dance      Multi-agent coordination (team mode)
├── weaver            Memory consolidation / decay / linking / distillation
├── wiki-compiler     Entity / concept / synthesis page compiler over the memory
└── worker            Background job runner
```

## Appendix B — links

- Product: [waggle-os.ai](https://waggle-os.ai)
- Enterprise: [www.kvark.ai](https://www.kvark.ai)
- License server: `https://license.waggle-os.ai/validate`
- SaaS cloud: `https://cloud.waggle-os.ai`
- Canonical architecture doc: `CLAUDE.md` in repo root

*Full feature/metric numbers + detailed memory-architecture diagrams will be folded in when the overnight research agents return their inventories. This draft covers the structural story end-to-end.*

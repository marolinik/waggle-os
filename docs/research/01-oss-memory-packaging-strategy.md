# Open-Source Packaging Strategy — `hive-mind` Memory System

**Author:** Waggle OS research series (1 of 7)
**Drafted:** 2026-04-15 (overnight batch)
**Scope:** Strategy + action plan for open-sourcing Waggle's memory system as a standalone project tentatively named `hive-mind`. License selection, moat preservation, competitive positioning, launch tactics, governance model, success criteria.

---

## TL;DR

**Ship `hive-mind` as a permissively-licensed OSS project** containing the memory primitives (FrameStore, HybridSearch, KnowledgeGraph, IdentityLayer, AwarenessLayer, CognifyPipeline, MemoryWeaver, Wiki Compiler skeleton, harvest adapters). **Keep Waggle's orchestration, UI, multi-mind enterprise features, evolution stack, and compliance reporting proprietary.**

**License recommendation: Apache 2.0 for the OSS layer** (max ecosystem compatibility, patent grant, contributor-friendly), with **BSL (Business Source License) or a narrow `Commons Clause` wrapper on the specific subsystems most at risk of cloud-vendor capture** (team sync server, enterprise admin console) — though those aren't part of the OSS split anyway, so Apache 2.0 across the split is the clean choice.

**Positioning angle:** the ONLY OSS memory system designed around *compliance-by-default* (EU AI Act logging baked in) with a *wiki-compilation layer* (structured knowledge pages over the frame corpus) and a *provable temporal frame model* (not just key-value memory, not just turn-blob storage).

**Timing:** publish ~30-60 days *after* the v2 hypothesis reveal (see report 4). The memory OSS announcement benefits from the attention the hypothesis reveal will generate.

---

## 1. Why open source at all?

Four reasons, in priority order:

### 1.1 Set the terms of the ecosystem

The memory-for-agents layer is in an early-standardization moment. mem0, Letta (née MemGPT), Zep, Cognee, GraphRAG (Microsoft), Mastra, and a handful of smaller projects are all attempting to become the default. If **hive-mind** ships as the most-rigorous, best-documented, and most-complete OSS memory system right now, it has a real shot at becoming the reference.

### 1.2 Inbound talent + credibility

An actively-maintained OSS project with clear docs and a coherent vision attracts:
- ML engineers who want to contribute to "the real" memory system
- Researchers who need a citable artifact
- Technical buyers who do due diligence on their vendors' open-source footprint before signing enterprise deals

### 1.3 Enterprise sales lubricant

"This runs on open-source primitives that you can inspect, fork, and audit" is a meaningful closer in enterprise sales cycles (for KVARK conversations especially). The more OSS-friendly Waggle appears, the easier those conversations are.

### 1.4 Harvest corpus expansion

OSS users of `hive-mind` who later adopt Waggle/KVARK commercially bring their existing harvest corpus with them. The corpus grows the industry network effect, even if the specific user doesn't pay.

### 1.5 What open source is NOT for

- **Not** for building a VC-backed company (Waggle is part of Egzakta — profitable / strategic, not VC-growth-at-all-costs)
- **Not** for competing with itself (hive-mind is a complement, not a substitute, for Waggle the product)
- **Not** for moat generation (moats come from the closed-source evolution stack, compliance reporting, multi-mind orchestration, and the product itself)

---

## 2. What goes OSS and what stays proprietary

### 2.1 In scope for hive-mind OSS

From `packages/core/`:

- **FrameStore** + schema (I/P/B frame model)
- **SessionStore**
- **HybridSearch** with RRF fusion
- **KnowledgeGraph** with SCD-2 temporal validity
- **IdentityLayer**
- **AwarenessLayer**
- **CognifyPipeline** (ingest + entity extraction + KG linkage)

From `packages/weaver/`:

- **MemoryWeaver** (consolidation, decay, strengthen, link)

From `packages/core/src/harvest/`:

- The adapter interface + universal-import types
- All 11 current adapters (chatgpt, claude, claude-code, claude-desktop, gemini, perplexity, markdown, plaintext, pdf, url, universal)
- Distillation pipeline skeleton (pluggable LLM, no hard-coded provider)

From `packages/wiki-compiler/`:

- The compiler skeleton (page types, incremental compilation, dedup)

Bindings:

- SQLite schema (documented)
- Embedder interface (pluggable: Ollama, LiteLLM, OpenAI, HuggingFace)
- Reference CLI for testing + harvesting

### 2.2 Kept proprietary

- **`packages/agent/`** — agent runtime, personas, tool surface, hooks, approval gates, cost tracker, subagents
- **Evolution stack** — 10 files in `packages/agent/src/evolution*` + `judge.ts` + `evolve-schema.ts` + `iterative-optimizer.ts`
- **Compliance reporting** — `packages/core/src/compliance/` + the AuditReport PDF generator (`compliance-pdf.ts`)
- **MultiMindCache + team sync + MCP catalog** — `packages/shared/src/mcp-catalog.ts`, `packages/core/src/mind/team-sync.ts`
- **UI + Tauri shell** — all of `apps/web/` and `app/`
- **KVARK integration** — `packages/agent/src/kvark-tools.ts`
- **Skill promotion gates + marketplace** — `packages/marketplace/`, the promote_skill tool, trust-model.ts
- **Marketplace + Stripe** — `packages/server/src/stripe/`

### 2.3 Why this split works

The OSS layer is the *primitives* — an experienced engineer could build their own agent on top of `hive-mind` if they wanted to. But they'd re-invent:
- Persona management (13 built-in personas + tool-pool filtering)
- Skill lifecycle (auto-extract + promotion + retirement + marketplace)
- Approval gates + autonomy tiers
- Cost tracking + budget caps
- Compliance reporting (AuditReport + PDF)
- Wiki app UI
- Harvest UI
- Evolution loop + eval + judging

That's roughly 80% of Waggle's value delivered in the product layer. The OSS layer is the foundation; Waggle is the building.

### 2.4 Repository structure

Two options:

**Option A: Separate repo** (`waggle-os/hive-mind`)
- Clean mental model
- Easier for OSS contributors (no Waggle-product PRs to navigate)
- Costs: dual CI, cross-repo testing, subtree-merge friction

**Option B: Monorepo subset exposed** (`waggle-os/waggle-os`, with `packages/core` + `packages/weaver` + `packages/wiki-compiler` under Apache 2.0 and rest under proprietary license)
- Operationally simpler
- Reader confusion: "is this project open or not?"
- OSS contributors would need to tiptoe around proprietary dirs

**Recommendation: Option A (separate repo).** The cognitive clarity is worth the CI cost. Use git subtree or a publish-to-mirror workflow to keep hive-mind in sync with waggle-os packages/core.

---

## 3. License selection

### 3.1 Options surveyed

| License | Permissive? | Patent grant? | Cloud-vendor capture risk | Recommendation fit |
|---|---|---|---|---|
| MIT | Yes | No explicit | High | Widely loved; risky if a hyperscaler forks it for managed service |
| Apache 2.0 | Yes | Yes | High but patent grant is defensive | **Top candidate** |
| BSD-3 | Yes | No explicit | High | Similar to MIT |
| MPL 2.0 | Partial (file-level copyleft) | Yes | Medium | Interesting but confusing for users |
| LGPL 3 | File-level copyleft | Yes | Medium | Unfriendly for embedded uses |
| AGPL 3 | Strong copyleft over network | Yes | Low | Contributors allergic to it; poison pill for many enterprise adopters |
| BSL (Business Source License) | Time-gated proprietary → Apache | Yes | Low | Great for monetization protection but OSS community skeptical |
| SSPL (MongoDB) | Not OSI-approved | Yes | Low | Permanent stigma post-MongoDB episode; avoid |
| Commons Clause overlay | Adds "can't sell" restriction to any base | Depends on base | Low | Niche; creates confusion |

### 3.2 Recommendation: Apache 2.0 (refined: consider Mastra's dual-license pattern)

After research-agent validation: the strongest license strategy is **Apache-2.0 for the `hive-mind` primitives PLUS a source-available `ee/` directory pattern** (copy Mastra's playbook) for any future enterprise-only subsystems that stay in the same repo. Mastra ships Apache-2.0 `packages/core` and source-available `packages/ee/` governed by an Enterprise License — it's functionally the best of both worlds and the community has accepted it. If Waggle later wants a team-server or enterprise feature inside `hive-mind`, the `ee/` pattern is the clean answer. For the initial OSS split the `ee/` dir can just not exist yet.

Reasoning for Apache-2.0 on the core:

- **Patent grant is critical.** MIT/BSD don't have it; Apache 2.0 does. For a memory system that may touch patentable territory (temporal frame model, hybrid RRF, wiki compilation), the patent grant is defensive armor.
- **Cloud-vendor capture risk is real but manageable.** If AWS/Azure/GCP fork hive-mind and launch "Managed Hive Mind as a Service," that's painful but not existential — Waggle's moat is in the agent/evolution/compliance layer, not the memory primitives themselves. Apache 2.0 lets Waggle keep iterating ahead.
- **Community goodwill.** Apache 2.0 is neutral-positive in every community discussion. AGPL or BSL would earn criticism and limit adoption. Waggle wants adoption more than it wants to prevent forks.
- **Enterprise compatibility.** Every Fortune 500 legal team has already approved Apache 2.0. BSL or AGPL require fresh legal review and often get blocked.

### 3.3 What about the historical cases?

| Case | Context | Lesson |
|---|---|---|
| **Elastic → SSPL (2021)** | AWS launched OpenSearch managed service; Elastic relicensed to SSPL. OpenSearch fork thrives, Elastic stock tanked then recovered. | Relicensing post-adoption is painful. License choice upfront matters. |
| **Hashicorp → BSL (2023)** | Terraform fork (OpenTofu) emerged; community split. | BSL is monetization-friendly but splits communities. |
| **MongoDB → SSPL** | Launched MongoDB Atlas; licensed to block cloud-vendor reselling. | Worked commercially but ended OSI-approved status; academic + some government users left. |
| **Redis → dual-license (2024)** | Similar AWS motivation; complex licensing move. | Sends confusing signals to users. |
| **CockroachDB → dual-license** | BSL + enterprise commercial. | Kept community; monetization clean. |

**Pattern:** relicensing *from* permissive *to* restrictive is always painful. Starting permissive (Apache 2.0) and keeping commercial product distinct is cleaner. **Waggle's model has the commercial product already separate from the OSS candidate, so this is the natural path.**

### 3.4 Contributor agreements

Recommend **Developer Certificate of Origin (DCO)** — simple, no paperwork burden, used by Linux, Docker, GitLab. Requires committers to sign off on commits. Apache Corporate Contributor License Agreement (CCLA) is overkill for this project and a friction point for contributors.

---

## 4. Positioning vs the OSS competition

*(Specific star counts and funding details to be refined when Agent A's research returns. Framing below based on public knowledge as of early 2026.)*

### 4.1 The neighboring projects (verified April 2026)

| Project | Stars | License | Funding / Backer | Positioning |
|---|---|---|---|---|
| **mem0** (ex-Embedchain) | ~48k | Apache-2.0 | $24M Series A (Basis Set, Kindred, Peak XV, YC) | Universal memory layer; fact extraction + vector recall. Paper claims ~26% accuracy gain on LOCOMO vs full-context. |
| **Letta** (ex-MemGPT) | ~13k | Apache-2.0 | $10M seed @ $70M post (Felicis, YC); UC Berkeley Sky Lab | OS-inspired tiered memory (core/recall/archival); highest benchmark scores (~83% LongMemEval) |
| **Graphiti** (ex-Zep OSS) | ~24.5k (plus 4.4k zep) | Apache-2.0 | VC-backed | Bi-temporal KG memory. **Zep Community Edition deprecated April 2025** — only Graphiti OSS remains. |
| **GraphRAG** (Microsoft) | ~31k | MIT | Microsoft Research | Entity-community graph over doc corpora. Retrieval-oriented research artifact. |
| **Mastra** | ~22k | **Apache-2.0 core + source-available `ee/` (Enterprise License)** | YC; ex-Gatsby team | TypeScript agent framework with 4 built-in memory types. **Pattern Waggle should copy.** |
| **Cognee** | ~14.2k | Apache-2.0 | Independent/seed | "Knowledge engine" — vector + graph unified memory, cognitive-science framing. Graduated GitHub Secure OSS. |
| **LangChain memory** | part of 100k+ LangChain | MIT | LangChain (VC) | Baseline table-stakes: Buffer/Window/Summary/Entity/KG memory classes. |
| **Anthropic / OpenAI Memory** | closed | proprietary | — | Surface-scoped (per-product), not portable. Anthropic's "Auto Dream" consolidation cycle is notable. |

**License consensus is striking:** 5 of the 6 top OSS memory projects picked Apache-2.0 (GraphRAG is the MIT outlier — and Microsoft doesn't monetize it). None has gone BSL/SSPL/AGPL yet. The field is still in land-grab; permissive license wins adoption.

### 4.2 Where hive-mind would differentiate

The strongest differentiators, from most to least impactful:

1. **Compliance-by-default** — every frame has provenance (source, timestamp, agent/user/tool origin), every interaction can be logged in an audit-ready format. No other OSS memory system ships EU AI Act Art 12/14/19/26/50 status checking out of the box. This is the headline.

2. **Temporal frame model** — I/P/B frames with consolidation/decay/strengthen. Conceptually novel, patentable, and practically valuable (solves the "my memory is full of outdated stuff" problem that plagues key-value memory systems).

3. **Wiki compilation** — no other memory system produces structured entity/concept/synthesis pages automatically. This turns "I have a mind" into "I have a navigable second brain." Huge UX win.

4. **Write-path contradiction detection** — Gap K shipped this session. Ships detection of contradictory memories on save, flags them, emits a correction-category improvement signal. Other systems accept contradictions silently.

5. **Multi-mind isolation + sanctioned cross-access** — first-class concept of personal vs workspace vs team vs enterprise scope, with approval-gated cross-mind reads. Designed for multi-tenant from day one.

6. **Harvest adapters for 11 consumer AI tools** — no other OSS memory system ingests from ChatGPT / Claude / Claude-code / Gemini / Perplexity / etc. Most are API-first; hive-mind is "bring your existing AI life."

7. **SQLite + sqlite-vec baseline** — no infrastructure to deploy. Competitors typically require postgres + pgvector + redis; hive-mind runs on a single file. Lowering setup friction by 10x.

### 4.3 What hive-mind should NOT claim

- Not the fastest (we don't benchmark against top-performance vector DBs)
- Not the most scaled (single-user / small-team volumes; not billion-frame operations)
- Not the "simplest" — our model is richer than key-value; that's a feature, not a bug, but we should acknowledge the conceptual overhead in onboarding

---

## 5. Brand, naming, identity

### 5.1 Name: `hive-mind`

Rationale:
- Already referenced in existing memory (`project_wiki_compiler_spec.md` and elsewhere)
- Continues the Hive DS brand family (honey/hive/waggle/bee semantic)
- Memorable + culturally loaded (sci-fi resonance without being silly)
- Verb-able: "hive-mind it" as shorthand for "persist this to memory"
- Available on GitHub (tentatively — needs check)
- Distinct enough from "memory" that people know they're adopting a specific model

### 5.2 Tagline options

- "Persistent memory for AI agents. Compliance-first. Local-first."
- "The second-brain kernel for autonomous AI."
- "Open-source memory for AI. Built for trust."

First is the most accurate; second is punchiest; third is strategically clearest on what makes us different.

### 5.3 Visual identity

- Hexagonal honeycomb logo variant (lighter weight than Waggle's waggle-bee logo)
- Same Hive DS palette (honey, hive-950)
- GitHub README: hero screenshot of a wiki page compiled from frames (proof visual)

### 5.4 Relationship to Waggle brand

"hive-mind is the memory kernel that powers Waggle OS. Waggle is the full product (UI + agents + skills + compliance + evolution + marketplace). hive-mind is the open-source foundation you can use standalone."

Clear enough that technical users understand the relationship immediately. Avoids the "is Waggle secretly closed now?" confusion.

---

## 6. Launch tactics

### 6.1 Pre-launch (T-60 days)

- Repo in draft (private on GitHub org, Apache 2.0 license committed)
- README polished to publishable quality
- 5-10 starter tutorials (cookbook-style: "harvest ChatGPT", "build a custom adapter", "use in a Python app", "wire to your own LLM", etc.)
- Quickstart docs on `hive-mind.dev` or `docs.waggle-os.ai/hive-mind`
- Reproducibility: an example notebook that ingests a small sample + shows search, KG, wiki compilation
- Soft-launch to 20-50 friendly reviewers (the warm list from report 4)
- Gather feedback; polish for 2-4 weeks

### 6.2 Launch day (T+0)

- Publish repo public on GitHub
- Blog post announcing: "Open-sourcing the memory system behind Waggle OS"
- HN Show HN post
- Twitter thread (Marko + Waggle org accounts)
- Reddit posts to r/MachineLearning, r/LocalLLaMA, r/ChatGPTCoding
- Pin in Waggle Discord / community channels
- Reach out to 5-10 AI newsletter writers (Ben's Bites, The Rundown, Import AI, Alpha Signal) with a personalized note

### 6.3 Launch +7 days

- Engage every substantive issue/PR/comment
- Ship 2-3 small contributor-friendly PRs as "good first issue"
- Write a follow-up post: "What we learned in the first week"
- Podcast circuit if interest

### 6.4 Launch +30 days

- First contributed adapter merged (Cursor / Notion / Obsidian — whichever lands first)
- First third-party integration announced (someone using hive-mind in their own project)
- Cold-weather evaluation: how many stars, how many PRs, how many discussions?
- Go / no-go on a first community call

### 6.5 Launch +90 days

- v0.1 → v0.2 release with community-driven features
- Roadmap published (inside hive-mind repo, not Waggle's)
- Relationship with a research group codified (paper citation, joint blog post, conference co-presence)

---

## 7. Governance

### 7.1 Maintainer model

- **Waggle org core maintainers** (2-3 Waggle team members) — decide roadmap, merge final PRs, own releases
- **Trusted committers** (community members with merged PRs + reputation) — review code, label issues, resolve disputes
- **Contributors** (anyone with a merged PR) — visible in CONTRIBUTORS.md

No BDFL drama — roadmap decisions happen in public issues.

### 7.2 Feature-contribution policy

- **Additive features accepted** (new adapters, new integrations, new embedder types)
- **Core schema changes require RFC** — open an issue, discuss, vote, merge
- **Breaking changes in minor versions acceptable pre-1.0, forbidden post-1.0**
- **No features that duplicate Waggle-product surface** (e.g., we won't accept a PR that adds the full skill-promotion flow from `packages/agent/src/skill-tools.ts`; those stay product-side)

### 7.3 Handling "enterprise wants X feature" in OSS

If a KVARK customer pays for a feature in Waggle's proprietary layer that *could* also benefit OSS (e.g., "distillation with constitutional AI"), default: the constitutional-AI adapter goes to Waggle, the *hook point* that accepts a pluggable constitutional-AI adapter goes to `hive-mind`.

This is the standard commercial-OSS split: the extension point is open, the specific implementation may be commercial.

---

## 8. Metrics

### 8.1 Vanity metrics (track but don't optimize for)

- GitHub stars — target: 2k in 3 months, 5k in 12 months
- PyPI/npm downloads — target: 10k/month in 6 months (if we publish language-specific packages)

### 8.2 Leading indicators (actually matter)

- Active contributors/month — target: 10+ by month 3
- Merged PRs from non-Waggle authors / total merged PRs — target: 30%+ by month 6
- Issues opened by non-Waggle users — proxy for engagement
- Third-party projects citing hive-mind — target: 5 in 6 months
- Conference/meetup talks mentioning hive-mind — target: 3 in 6 months

### 8.3 Strategic (compound)

- KVARK enterprise conversations citing OSS — target: 2+ per month mentioning hive-mind awareness by month 12
- Waggle product signups from hive-mind users — target: measurable conversion funnel
- Research paper citations — target: 10+ by month 12

---

## 9. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Nobody cares (low star count → demoralizing) | Pre-launch warm list for quality reception; accept slow organic growth if genuine |
| Massive star count but no real users (GitHub vanity without adoption) | Track *engagement* metrics above stars; surface them in a README badge |
| A cloud-vendor forks and builds managed service | Apache 2.0 allows this; our moat is the product layer, not the primitives. Don't optimize for "preventing fork"; optimize for "Waggle is still the best home" |
| Community PRs break scope (people try to land agent logic in hive-mind) | Clear CONTRIBUTING.md with scope; maintainer discipline |
| Technical debt accumulates because we treat hive-mind as "done" | Quarterly investment commitment: N hours per quarter from Waggle team in hive-mind maintenance |
| Community split (hostile fork) | Make contribution easy and welcome; respond to constructive critique; preserve right-to-fork as a feature, not a failure |
| Dependency drift (sqlite-vec breaks, better-sqlite3 API changes) | Test matrix in CI; automated dependency updates via Dependabot; pin minor versions |
| License decision creates future regret | Permissive (Apache 2.0) decisions are reversible into proprietary much harder than the reverse; start permissive, narrow only if absolutely required |

---

## 10. Interaction with Waggle commercial strategy

### 10.1 Freemium funnel

- **hive-mind** (OSS) — developer's entry point. Free forever.
- **Waggle Free tier** — product's entry point. Free forever.
- **Waggle Pro / Teams** — monetized product.
- **KVARK / Enterprise** — sovereign enterprise deal.

Developers who discover hive-mind → build a prototype → realize they need the full product → signup Waggle Free → upgrade. Also: enterprise buyers evaluating hive-mind → realize they need commercial support + advanced features → KVARK conversation.

**Critical: the OSS version must be genuinely useful on its own, not a crippleware teaser.** A developer shouldn't hit a wall in hive-mind and need to install Waggle to do a basic thing. The split is along *product layer*, not *feature flag*.

### 10.2 Cross-promotion

- Waggle README links to hive-mind
- hive-mind README links to Waggle *only* on the last "Want the full product?" line, not front-loaded
- Shared design system (Hive DS) links both visually
- Case studies that involve both reference both

### 10.3 Support / SLA

- OSS: issues + PRs, community Discord, best-effort response
- Waggle Pro / Teams: email support, business-day SLA
- KVARK: dedicated support engineer, 24/7 on Enterprise plans

Clear tier of support is itself a Waggle-product selling point over "just use OSS."

---

## 11. Open questions for Marko

1. **Timing relative to v2 hypothesis reveal** — recommend publish ~30-60 days after the reveal (compounds the attention). Is this compatible with your priorities?
2. **Resource allocation** — 1 eng allocated 1 day/week to hive-mind maintenance is enough initially. Ok with that commitment?
3. **Cross-team (Egzakta) alignment** — OSS strategy needs Egzakta board / leadership buy-in. Who do we need to preview this with?
4. **Name confirmation** — `hive-mind` the working name; any objection from Egzakta marketing / trademark? Check `hive-mind.org` and GitHub availability.
5. **Partial-open vs full-open on harvest adapters** — the 11 adapters are the gateway for user corpus ingestion. Open-source them entirely, or keep perplexity/claude-desktop/cursor (strategic targets) proprietary to drive Waggle-product adoption? My recommendation: **all 11 open**, no gatekeeping. If a competitor forks and builds a better harvest UI, that's fine — our moat is elsewhere.
6. **Spin-off company?** — does hive-mind ever become its own entity (spinout with VC backing), or always stay a Waggle-led OSS project? Recommend: stay Waggle-led unless a compelling offer emerges; spinouts are expensive distractions.

---

## 12. Action plan — 12-week sprint

| Week | Deliverable |
|---|---|
| 1 | License + repo scaffolding; Apache 2.0 committed; skeleton README + CONTRIBUTING + CODE_OF_CONDUCT |
| 2 | Extract `packages/core/src/frames.ts`, `search.ts`, `knowledge.ts`, `identity.ts`, `awareness.ts` into hive-mind; rewrite imports; standalone tests pass |
| 3 | Extract `packages/weaver/` + `packages/core/src/harvest/` adapters; standalone tests pass |
| 4 | Extract `packages/wiki-compiler/` skeleton; standalone tests pass |
| 5 | Docs polish: quickstart, 5 cookbook tutorials, architecture overview |
| 6 | Private beta with 20-30 warm-list reviewers |
| 7 | Feedback incorporation round 1 |
| 8 | Private beta round 2 (broader, 50+ reviewers) |
| 9 | Feedback round 2; last polish |
| 10 | Launch-week content prep: blog post, Twitter thread, HN draft, newsletter outreach |
| 11 | Launch! + first-week engagement |
| 12 | Retrospective + v0.2 roadmap |

Compressible to 8 weeks if resources allow; realistic at 12.

---

## Closing

`hive-mind` is a strategic ecosystem play, not a product in its own right. It positions Waggle as the adult in the memory-for-agents room, attracts talent and credibility, lubricates enterprise sales cycles, and gives Egzakta's KVARK story a compelling "open foundation" narrative. The license choice (Apache 2.0), the scope choice (primitives only, not product), the timing choice (post-hypothesis-reveal), and the governance choice (Waggle-led, community-welcoming) all reinforce each other.

Done right, in 12 months: 5k stars, 50+ contributors, 3+ research citations, 10+ named third-party integrations, and a measurable KVARK enterprise pipeline expansion attributable to the OSS presence. Done wrong: a ghost-town repo and a distraction from product work. The difference is largely about maintainer commitment and the quality of the launch narrative — both of which Waggle is uniquely equipped to get right.

*Competitor-specific data (stars, funding, activity metrics) will be folded in when Agent A's OSS memory landscape research returns.*

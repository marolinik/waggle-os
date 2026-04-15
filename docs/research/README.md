# Waggle OS — Deep Research Series (2026-04-15)

Seven reports drafted overnight per Marko's request for strategic deep-research across Waggle's biggest near-term questions. Plus this index.

Each report stands alone; read in any order. Reading suggestion: start with **06 (product overview)** for the big picture, then pick based on what you're working on.

---

## The reports

### 01 — Open-source memory packaging strategy  
**[`01-oss-memory-packaging-strategy.md`](01-oss-memory-packaging-strategy.md)**

Strategy + action plan for releasing Waggle's memory system as `hive-mind` (Apache 2.0). What goes OSS (primitives: FrameStore, HybridSearch, KnowledgeGraph, harvest adapters, wiki compiler skeleton) and what stays proprietary (agent runtime, evolution stack, compliance PDF, marketplace, KVARK). License rationale with historical context (Elastic/HashiCorp/MongoDB). Positioning vs mem0/Letta/Zep/Mastra. 12-week launch sprint plan.

**Bottom line:** Apache 2.0, separate repo, launch 30-60 days after the v2 hypothesis reveal to compound attention. Publish `hive-mind` as "the ONLY OSS memory system designed around compliance-by-default with a wiki-compilation layer and a provable temporal frame model."

---

### 02 — Memory system scientific paper draft
**[`02-memory-system-scientific-draft.md`](02-memory-system-scientific-draft.md)**

arXiv-style working paper on the memory architecture: I/P/B frame model (borrowed from video compression), multi-mind isolation, write-path contradiction detection, skill promotion, compliance-by-default interaction logging, wiki compilation. Includes abstract, methods, formal properties, related work, limitations, illustrative SQL schema and TypeScript API sketch.

**Bottom line:** Publishable architecture paper. Empirical numbers pending benchmark suite + v2 hypothesis run. Structural narrative reviewable now.

---

### 03 — Memory harvesting strategy + UX
**[`03-memory-harvesting-strategy.md`](03-memory-harvesting-strategy.md)**

Harvest is Waggle's lock-in moat (memory + harvest free forever per tier strategy). Six UX principles (harvest-first onboarding / privacy is the headline / dedup is a feature / progress is tactile / recovery is resumable / identity auto-populate). First-time-user journey with emotional beat at 8 minutes. Six-phase action plan. Competitive positioning vs ChatGPT/Notion/mem0/Letta/Rewind. Metrics that should drive priority.

**Bottom line:** Pipeline is strong (9 adapters + perplexity shipped = 11 production + universal/pdf/url/md/txt baseline). UX is the gap. Phase A (first-run hook) is 1 week and would measurably move "new user hooked in first session" needle. 5 open decisions for Marko at the end.

---

### 04 — GEPA public reveal strategy
**[`04-gepa-public-reveal-strategy.md`](04-gepa-public-reveal-strategy.md)**

Publication strategy for the v2 hypothesis result. Publish arXiv-style research note FIRST (earns trust), then Twitter thread + LinkedIn long-form + HN post SECOND (captures virality). Reproducibility repo non-negotiable on day one. Audience-by-audience planning (researchers / technical buyers / prompt engineers / skeptics) with ready-made objection responses. Warm-list protocol (72h pre-publication). H₁/H₂/H₃ verdict paths including the pre-committed negative-result path (Q5). 14-day rollout timeline.

**Bottom line:** This is Waggle's highest-leverage single moment. Get it right → year of inbound + KVARK lubricant. Get it wrong → 12-month credibility rebuild. The difference is almost entirely about *credibility signals*, not the result itself (which is defensible).

---

### 05 — User personas voice-of-customer
**[`05-user-personas-ai-os.md`](05-user-personas-ai-os.md)**

Seven archetypal users with jobs-to-be-done, pain points, wants, pricing tolerance, killer feature, and Waggle tier/feature fit per persona: **product owner** (Marko archetype) / **knowledge worker** (legal/finance/HR) / **developer** / **researcher** / **founder** / **IT admin** / **prosumer**. Cross-persona heat map (memory is universal; compliance top-3; local-first matters for 5/7). Roadmap item → benefiting-persona heat map.

**Bottom line:** Universal want across all 7 is persistent memory. Waggle's tier ladder maps cleanly to persona distribution. One gap: current onboarding doesn't serve the consumer prosumer who wants "AI that remembers my LIFE, not my work." Billboard message candidate: *"Your AI remembers. Your data stays yours. Your compliance trail writes itself."*

---

### 06 — Waggle OS product overview
**[`06-waggle-os-product-overview.md`](06-waggle-os-product-overview.md)**

Comprehensive product overview. One-sentence pitches per audience. Verified architecture (React 19 + Tauri 2.0 + Fastify sidecar + SQLite/sqlite-vec). Memory stack deep-dive (9 components). Evolution stack deep-dive (10 files). Feature taxonomy by tier (Trial → Free → Pro → Teams → KVARK). User patterns (solo / team / enterprise). Competitive positioning with defensibility layers + disruption risks + strategic countermoves. Shipping state as of 2026-04-15. Metrics to hit. One-paragraph strategic thesis.

**Bottom line:** Waggle OS is the workspace-native AI agent platform with persistent memory + compliance-by-default + evolution. It's the demand-gen wedge for KVARK; the freemium tier creates lock-in; the paid tiers monetize through skills+connectors; the enterprise tier closes on governance + sovereignty. Coherent product story end-to-end.

---

### 07 — Skills + connectors shipping strategy
**[`07-skills-connectors-strategy.md`](07-skills-connectors-strategy.md)**

Shipping strategy for Waggle's two extension points. Starter skill pack (20 skills in 6 categories). Native connector hero set (12 connectors) + MCP catalog for long tail (148+). Per-persona vocabulary for explanations (same system, 7 onboarding scripts). Tier gates (Free: 3 connectors; Pro: all; Teams: shared; Enterprise: whitelisted). Three creation pathways (write / capture from chat / auto-extract). Promotion flow (Gap E). Self-evolution user-in-loop visibility. Marketplace model options (recommending free + attribution, not paid-skills). Phased 5-phase action plan.

**Bottom line:** Skills and connectors are the monetization trigger. Don't ship 200 skills at launch — ship 20 great ones + a compelling creation loop. Per-persona vocabulary matters more than feature depth.

---

## Cross-cutting themes

A few narratives show up repeatedly across the seven reports. Captured here for a unified thesis:

### Theme 1 — Memory is the moat, compliance is the multiplier

Every persona wants memory. But memory alone is Table Stakes by 2027 — every AI vendor will ship some version. **Compliance-by-default turns memory into a regulated-industry wedge** (Knowledge worker + IT admin + regulated enterprise buyers). The combination is what's defensible.

### Theme 2 — Local-first is structural, not a marketing tagline

The Tauri binary + SQLite backend + LiteLLM-for-your-own-provider architecture is *not* a SaaS product with on-prem option. It's the inverse: on-device product with optional cloud/team sync. This is structurally hard for SaaS-first competitors (OpenAI, Anthropic, Notion) to match without rebuilding their deployment model.

### Theme 3 — Evolution is the research credibility layer

The v2 hypothesis result, if it replicates, is Waggle's strongest single-point technical claim. It's also the proof-point that runs through the research paper, the KVARK sales motion, the OSS launch narrative, and the Twitter-thread story arc. One run, many uses.

### Theme 4 — The four-tier ladder maps to user reality

Trial 15d → Free forever → Pro $19 → Teams $49/seat → Enterprise/KVARK is not arbitrary. It reflects how users actually adopt AI: try → personal use → professional use → team adoption → enterprise rollout. Each tier has a persona. Each persona has a willingness-to-pay. The product-led growth arc is intact.

### Theme 5 — `hive-mind` OSS + Waggle product + KVARK enterprise is a coherent three-layer stack

Not three separate products. One coherent offering with three distribution surfaces:

- Developers + researchers get `hive-mind` (Apache 2.0) — they contribute, cite, and bring credibility
- Prosumers + small teams get Waggle (Free / Pro / Teams) — they pay subscription
- Enterprises get KVARK — they pay consultative, multi-year, high-ACV deals

Each layer makes the others more valuable. The OSS layer attracts developer talent. The product layer generates harvest corpora and feature feedback. The enterprise layer funds the whole thing and sets the compliance bar.

---

## Open decisions consolidated — what Marko needs to answer

Across all 7 reports, the following decisions are queued for Marko:

| Source | Decision |
|---|---|
| Report 1 (OSS) | `hive-mind` timing post-v2-reveal? Yes / Q2 / Q3 |
| Report 1 (OSS) | `hive-mind` repo name + Egzakta legal sign-off |
| Report 1 (OSS) | Resource: 1 eng × 1 day/week on maintenance? |
| Report 1 (OSS) | Stay Waggle-led, or consider spinout? |
| Report 3 (Harvest) | Harvest-first onboarding — v1 replacement or parallel opt-in? |
| Report 3 (Harvest) | Anonymous telemetry default — off with opt-in nudge? |
| Report 3 (Harvest) | Email/calendar as Pro-tier lock? |
| Report 4 (Reveal) | Warm list — names to pre-email 72h before publication? |
| Report 4 (Reveal) | Single-author or dual-author on the research note? |
| Report 4 (Reveal) | Podcast strategy — opportunistic vs pitched? |
| Report 7 (Skills) | Marketplace model — free+attribution (A), freemium (B), enterprise-only (C)? |
| Report 7 (Skills) | Auto-evolution default — opt-in or opt-out? |
| Hypothesis v2 | `docs/hypothesis-v2-decisions.md` — approve or amend Q1-Q5 |

Total: ~12 strategic decisions. Most are binary or small-number choices. Each unlocks a concrete execution track.

---

## What's NOT in these reports

Intentional omissions:

- **Specific financial model for OSS → Waggle → KVARK funnel conversion rates.** We don't have instrumented data yet; reports flag metrics to track, not projected numbers.
- **Named competitors' deal sizes / revenue estimates.** Public data was not used for explicit pricing comparisons; we positioned qualitatively.
- **Implementation details of the evolution stack internals.** Those are in separate docs (`docs/hypothesis-v2-plan.md`, `docs/hypothesis-v2-execution-plan.md`).
- **UI mockups / design comps.** These are strategy docs, not design docs. UI implementation follows decisions.

---

## Post-draft corrections from research agents (2026-04-15)

The 5 background research agents returned after the initial reports were written. Their findings were folded back into reports 1, 2, and 4 as factual corrections + refinements. The changes worth flagging in the morning:

### Factual corrections (reports 2 + 4)

- **GEPA = "Genetic-Pareto"** (not "Goal-driven Evolution of Prompts Algorithm" as the name was initially guessed). Paper: Agrawal et al., **arXiv:2507.19457**, **ICLR 2026 Oral**. Stanford/Databricks circle around Omar Khattab (DSPy). Beats RL baselines (GRPO) +6% avg / +20% max with ≤35× fewer rollouts; beats MIPROv2 by >10%. Integrated into **DSPy 3.0** as `dspy.GEPA`. Repo: github.com/gepa-ai/gepa.
- **"Mikhail's EvolveSchema" could not be pinned down** in public literature. Closest analog is **ACE — Agentic Context Engineering** (Zhang et al., Stanford/SambaNova, **arXiv:2510.04618**). No Mikhail on the ACE author list. Recommendation: drop the Mikhail attribution in public publications unless Marko can locate the original internal source. Cite ACE as closest analog instead.
- **Gemma 4 31B** confirmed — Google release April 2, 2026, Apache 2.0, currently Arena **#3 open model at 1452 Elo**. Waggle's v1 headline rides an existing wave.
- **Reflection 70B (Matt Shumer, Sept 2024)** is the canonical cautionary tale — framed in §5.1 of report 4 as the pattern to actively avoid (non-reproducible Twitter-first reveal).
- **Harvest adapters: 10 not 11** per code inventory (chatgpt, claude, claude-code, gemini, perplexity, markdown, plaintext, pdf, url, universal).

### OSS competitor data (report 1)

Star counts and funding rounds verified live:

| Project | Stars | License | Funding |
|---|---|---|---|
| mem0 | ~48k | Apache-2.0 | $24M Series A |
| Graphiti | ~24.5k | Apache-2.0 | VC-backed |
| GraphRAG | ~31k | MIT | Microsoft |
| Mastra | ~22k | **Apache core + source-available `ee/` (Enterprise License)** — the pattern to copy | YC |
| Cognee | ~14.2k | Apache-2.0 | Independent |
| Letta | ~13k | Apache-2.0 | $10M seed @ $70M |

5 of 6 picked Apache-2.0. None has gone to BSL/SSPL/AGPL yet — field is still in land-grab. Waggle's Apache-2.0 + potentially `ee/` pattern is maximally ecosystem-compatible.

### Waggle features inventory (affects reports 6 + 7 — not yet folded in; do so in a morning refinement pass if time permits)

Verified counts from code inventory:

- **18 canonical personas** (not 13 as CLAUDE.md §5 lists). persona-data.ts has grown since the CLAUDE.md authoritative section was last written.
- **24 built-in apps** in `apps/web/src/components/os/apps/` (MemoryApp / FilesApp / AgentsApp / MissionControlApp / CockpitApp / DashboardApp / CapabilitiesApp / ConnectorsApp / MarketplaceApp / SettingsApp / TimelineApp / EventsApp / ScheduledJobsApp / TelemetryApp / BackupApp / ApprovalsApp / TeamGovernanceApp / RoomApp / VaultApp / VoiceApp / WaggleDanceApp / UserProfileApp / WikiTab / ChatApp)
- **13 UI overlays** (OnboardingWizard, PersonaSwitcher, WorkspaceSwitcher, CreateWorkspaceDialog, SpawnAgentDialog, GlobalSearch, NotificationInbox, TrialExpiredModal, UpgradeModal, LoginBriefing, KeyboardShortcutsHelp, ContextRail, LockedFeature)
- **19 starter skills** (not 20)
- **30 native connectors** + **148 MCP catalog entries** across 14 categories
- **60+ native agent tools** total

This enriches reports 6 and 7 but doesn't invalidate their structural claims. Consider a morning refinement pass to update the hard numbers.

### Competitive landscape enrichments (affects report 6 — not yet folded in)

Specific pricing / ARR / deal-size data now available for Cohere North ($240M ARR, 2026 IPO), C3 AI ($250k pilots, $5.2B FY26 guidance), Palantir AIP (~$5.2B FY26 +61% YoY), Databricks Mosaic ($249,960 median contract), Salesforce Agentforce ($125 add-on / $550 Editions), Mistral Forge (ARR ~$400M → $1B trajectory, free-compute-on-customer-GPU — disruptive pricing anchor for KVARK). Full table in the Agent B return; consider folding into report 6 during morning pass.

**Flagged:** The "$248M → $2.63B" EU AI governance market figure from prior Egzakta memos does NOT match public 2026 figures. Public data: governance market is $2.2B (2025) → $2.54B (2026) → $11.05B (2036) at 15.8% CAGR. The Egzakta figure may be a narrower segment (AI-Act audit tooling specifically) — worth verifying the original source before using externally.

---

## How these were produced

Drafted overnight in a single autonomous session. Background research agents were dispatched for:
- OSS memory landscape (mem0, Letta, Zep, Mastra, GraphRAG, Cognee — market data, stars, funding, license positioning)
- Agentic AI competitive landscape (consumer workspace + agent frameworks + sovereign enterprise AI platforms)
- GEPA + EvolveSchema literature + prompt-evolution state of the art
- Waggle memory architecture map (code-level detail)
- Waggle features / skills / connectors inventory (code-level counts)

As of this README's drafting, those agent outputs were still in flight. Reports were written from Marko's prior memory + this session's work + architectural knowledge from CLAUDE.md. When agent outputs return, they can be folded in as section refinements in a subsequent commit. The structural arguments and strategic recommendations are robust to those refinements.

---

## Rollback + revision

- All seven reports + this index are under `docs/research/` — scope for any rollback is narrow.
- Commit boundaries are one-per-batch, see git log.
- Any report can be reverted independently without breaking the others.

---

## Acknowledgment

Built on top of Egzakta Group's long investment in Waggle + KVARK, the evolution-stack research led by Marko, and Egzakta's EUR 1.2M-contracted customer commitments that ground these reports in real enterprise sales realities rather than startup speculation. All decisions noted above are ultimately Marko's call; these docs frame the choices and commit to recommended answers.

**Date complete:** 2026-04-15 overnight batch
**Next pickup:** morning of 2026-04-16 — Marko reviews, decisions flow back into respective execution plans

---
brief_id: 2026-04-29-benchmark-portfolio-refresh-2026-venues
date: 2026-04-29
session: PM coordination (Cowork)
mission: Refresh hive-mind / Waggle benchmark portfolio against Q1-Q2 2026 venue landscape; preserve PHF launch posture; sequence post-launch tracks.
predecessor_decisions:
  - decisions/2026-04-26-decision-matrix-self-judge-reframe.md   # PHF binding
  - decisions/2026-04-27-phase-2-acceptance-gate-PASS.md
  - decisions/2026-04-29-gepa-faza1-results.md
predecessor_strategy: strategy/BENCHMARK-STRATEGY.txt   # 2026-04-18; primary plan, NOT superseded
predecessor_evidence:
  - benchmarks/results/v6-self-judge-rebench/apples-to-apples-memo.md
  - benchmarks/results/v6-self-judge-rebench/self-judge-vs-trio-comparison.md
  - benchmarks/results/stage3-n400-v6-final-memo.md
  - gepa-phase-5/manifest.yaml   # claude::gen1-v1 + qwen-thinking::gen1-v1
status: AMENDMENT-PROPOSAL (does NOT supersede 04-18 BENCHMARK-STRATEGY; supplements with 2026 venue refresh + competitive intel update)
authority_required: PM (Marko Marković) ratification on §7 ratification asks
horizon: 12 weeks (pre-launch finalization → 6 weeks post-launch sequencing)
---

# PM Brief — Benchmark Portfolio Refresh: 2026 Venue Landscape

## TL;DR

The 04-18 BENCHMARK-STRATEGY.txt remains the binding primary plan. PHF launch posture (substrate ceiling 74.0 % vs Mem0 peer-reviewed 66.9 %, methodology contribution +27.35 pp) holds and ships Day 0 unchanged.

This brief proposes **three additive amendments** anchored on Q1 2026 benchmark venue developments that postdate the 04-18 strategy:

1. **Add Gaia2 (Meta SuperIntelligence Labs, arxiv 2602.11964, 12 Feb 2026)** as Phase 3 primary agent-harness venue — replaces SWE-ContextBench as headline target.
2. **Add τ³-bench banking_knowledge (Sierra, 18 Mar 2026)** as Phase 4 KVARK-track venue — replaces proprietary BPMN-workflow benchmark.
3. **Inherit ERL methodology (ICLR 2026 MemAgents Workshop)** as the publication framing for Waggle self-evolution claim — eliminates need to invent new "self-improvement convergence" metric.

Plus one update to competitive intelligence: **Hermes Agent (Nous Research, 25 Feb 2026)** is now an architectural-philosophy competitor to Waggle, not in 03-March intel doc.

Five ratification asks in §7. No code or run actions before PM response.

---

## §1 — What does NOT change

The following are LOCKED and this brief does not propose modifications:

- **PHF claim and Day 0 narrative** — substrate ceiling 74.0 % vs Mem0 peer-reviewed 66.9 % / 68.4 %, +27.35 pp methodology bias quantification, V1 retrieval honest 48.25 %. Source: `decisions/2026-04-26-decision-matrix-self-judge-reframe.md`.
- **Coupled launch sequencing** — arxiv preprint + hive-mind public + Waggle landing + Stripe in a single Day 0 window.
- **Pricing** — Solo Free / Pro $19 / Teams $49 (LOCKED 04-18).
- **GEPA Phase 5 canary deployment** — claude::gen1-v1 + qwen-thinking::gen1-v1 in flight, scope LOCKED. Cost amendment ratified 04-30 ("stavi visi slobodno").
- **Stage 3 v6 N=400 LoCoMo** — closed PASS-WITH-HONEST-FRAMING. No re-run proposed.
- **arxiv paper structure** — `research/2026-04-26-arxiv-paper/` outline and skeleton remain primary author surface.

The portfolio refresh is **post-launch sequencing**, not pre-launch revision.

---

## §2 — Landscape changes since 04-18 (binding new evidence)

### 2.1 Gaia2 (Meta SuperIntelligence Labs)

**Anchor:** arxiv 2602.11964 (Froger et al., 12 Feb 2026); ARE platform repo `facebookresearch/meta-agents-research-environments`.

**What it measures:** asynchronous agent capability in a simulated mobile environment with 12 applications and 101 tools. Agents must operate under temporal constraints, adapt to noisy/dynamic events, resolve ambiguity, and collaborate. Pass@1 with write-action verifier per scenario.

**Current SOTA (Feb-Apr 2026):**
- GPT-5 (high): 42 % pass@1 (best overall; fails on time-sensitive tasks)
- Claude-4 Sonnet: trades accuracy/speed/cost
- Kimi-K2: **21 % pass@1 — open-source SOTA**
- No Anthropic dominance; no saturation.

**Why it replaces SWE-ContextBench in our portfolio:**
- Fresh venue (post-04-18); SWE-ContextBench is now Q4 2025 vintage and OpenClaw / Hermes have not engaged it either, so first-mover narrative is weaker.
- Agent capability domain matches Waggle product surface (general agentic tool use with persistent memory) better than SWE-ContextBench (code-context retrieval narrow scope).
- Universes architecture (isolated data partitions exposing identical tools but disjoint task content) provides clean substrate for self-evolution measurement — see §2.3.
- Open-source SOTA threshold of 21 % is realistic to beat with Qwen 3.6 35B + GEPA-evolved `qwen-thinking::gen1-v1` (+12.5 pp uplift validated in-sample n=8 + held-out n=5). Target band: 30-35 % pass@1, which enters Claude/GPT-5 reference zone.

**Cost estimate:** N=200 agent-task instances × ~$0.05/instance subject + judge harness = ~$25-40 per full run. Compute envelope manageable within existing GEPA Phase 5 cost amendment.

### 2.2 τ³-bench banking_knowledge (Sierra)

**Anchor:** Sierra Research blog 18 Mar 2026; `sierra-research/tau2-bench` repo; τ-Knowledge paper (Shi et al., arxiv 2603.04370).

**What it measures:** RAG-augmented customer service in banking domain. Configurable retrieval pipelines (keyword search, embedding-based, long-context, agentic shell-based). Task success measured by correctness of backend database state changes (dispute opened, card frozen, credit issued), not conversation polish. Pass^k metric for reliability.

**Current SOTA:**
- GPT-5.2 with high reasoning: ~25 % task success.
- Even with exact required documents provided: ~40 %. Bottleneck is reasoning/execution, not retrieval.

**Why it replaces proprietary BPMN-workflow benchmark:**
- Sierra is a credentialed third-party venue; community-driven leaderboard at taubench.com with verified submissions via S3 bucket trajectories.
- Banking domain is direct match for KVARK enterprise sales (regulated industry, RAG over policy documents, audit trail of agent actions).
- Bottleneck is exactly where hive-mind should add value (frame importance weighting, bitemporal validity, I/P/B distinction for hypothesis-vs-fact reasoning).
- Headroom is large (~25 % SOTA → ceiling ~40 %); a measurable lift here is the easiest-to-defend KVARK pitch artifact for regulated buyers.
- Proprietary BPMN-workflow benchmark in 04-18 strategy has zero adoption, zero comparison anchor, zero credibility — even if we publish it, no one cites it.

**Cost estimate:** N=200 instances × ~$0.10/instance (longer dialogues with retrieval round-trips) = ~$30-50. Same envelope class as Gaia2.

### 2.3 ERL methodology (ICLR 2026 MemAgents Workshop)

**Anchor:** "Experiential Reflective Learning for Self-Improving LLM Agents" (arxiv 2603.24639, March 2026). Published as conference paper at the ICLR 2026 MemAgents Workshop.

**What it does:** retrieval of heuristics from accumulated experience, injected into agent's system prompt before execution. No modification to core ReAct loop. Evaluated on Gaia2 Search + Execution splits and τ²-bench (all three customer service domains).

**Reported result:** +7.8 % success rate uplift over ReAct baseline on Gaia2; large gains in task completion reliability; outperforms prior experiential learning methods (ExpeL, AutoGuide, Reflexion).

**Why this matters for our portfolio:**
- The 04-18 strategy implies Waggle self-evolution claim needs a custom evaluation methodology. ERL provides the methodology already, with a published baseline (+7.8 %) to beat.
- Our hive-mind frame architecture (I/P/B, importance weighting) maps cleanly onto ERL's "selective retrieval of transferable heuristics" framing — this is publishable as an ERL extension, not as a separate framework.
- MemAgents Workshop venue exists and accepts work; we have a valid conference submission target instead of inventing a venue.
- Avoids the "we invented a metric to measure ourselves" credibility problem flagged in earlier prep work.

**Implication for Waggle launch comms:** the self-evolution claim moves from "trust us, internal benchmark shows X" to "validated against published ERL baseline on Gaia2". Order-of-magnitude credibility upgrade.

---

## §3 — Competitive intelligence update

The current `Waggle_Competitive_Intelligence_Full_Landscape_March_2026.docx` is dated. One material gap requires update before Day 0 comms freeze.

### 3.1 Hermes Agent (Nous Research)

**Launch date:** 25 February 2026. **Star count:** 110 K within 10 weeks of launch. **License:** open source.

**Architecture:** closed learning loop, prompt memory (MEMORY.md, USER.md), episodic archive (SQLite FTS5), procedural skills (auto-generated markdown). Internal benchmarks claim 40 % speedup on repeat tasks.

**Why this is material:** Hermes Agent occupies the same architectural-philosophy space as Waggle. The Hermes pitch is "agent that gets better over time at your specific workflows through closed learning loop". This is functionally identical to our self-evolution narrative.

**Defensible Waggle differentiators against Hermes (must appear in Day 0 comms):**

1. Bitemporal knowledge graph (Hermes uses flat SQLite FTS5).
2. I/P/B frame model with importance weighting and superseding-via-correction (Hermes does not distinguish hypothesis from fact).
3. MPEG-4 frame architecture and wiki compiler (Hermes has neither).
4. Apache 2.0 hive-mind as standalone npm package (`@hive-mind/core` etc.) — Hermes is monolithic.
5. EU AI Act audit triggers built-in (Hermes does not address).
6. **Published peer-reviewed-style benchmark results (apples-to-apples Mem0 + ERL methodology + Gaia2 + τ³)** — Hermes publishes only internal benchmarks.

Differentiator #6 is the moat. Hermes Agent has not engaged any standardized public benchmark venue. If we ship arxiv + Gaia2 + τ³ within Q2, the gap is unbridgeable for them in 2026.

### 3.2 OpenClaw security posture (no new evidence required)

OpenClaw March 2026 CVE cluster (9 CVEs in 4 days, including CVSS 9.9; Snyk flagged 1,467 malicious skills on ClawHub) is already in the existing intelligence doc per CC-1 audit. Confirming it remains in Day 0 narrative for regulated-industry pitches as "incumbent insecurity" framing.

---

## §4 — Recommended portfolio amendment

Replace BENCHMARK-STRATEGY.txt §3.4 (Phase 3) and §3.5 (Phase 4) primary venues. All other sections remain intact.

| Phase | 04-18 strategy | Proposed amendment | Rationale |
|---|---|---|---|
| Phase 0 (now → launch) | Stripe priority; nothing else | **Unchanged.** | PHF posture stable. |
| Phase 1 (post-Stripe, hive-mind alpha) | LoCoMo + bootstrap | **Unchanged.** Stage 3 v6 already complete. | Status quo. |
| Phase 2 (hive-mind launch) | LongMemEval + blog + GitHub public | **Unchanged.** | Coupled launch as PHF binds. |
| Phase 3 (Waggle benchmark integration) | SWE-bench sequential + SWE-ContextBench | **REPLACE with Gaia2 Search + Execution splits**, GEPA-evolved variants, ERL methodology framing. Target: 30-35 % pass@1 (open-source SOTA = 21 %). | Fresher venue, better domain fit, ERL publication target. |
| Phase 4 (KVARK milestones) | Proprietary BPMN-workflow + scale benchmarks | **REPLACE BPMN with τ³-bench banking_knowledge**, retain scale + multi-tenant + compliance latency benchmarks. Target: top-3 open-source on banking_knowledge. | Real venue, real comparison, regulated-industry sales artifact. |

Stretch targets in 04-18 strategy (BEAM 1M-token, SWE-ContextBench Memory track) deferred to Q3 2026 review.

---

## §5 — Sequencing (12-week horizon)

**Weeks 0-2 (now → hive-mind alpha):** PHF locked artifacts ship — arxiv preprint, hive-mind public, Waggle landing, Stripe. **No new benchmark work in this window.**

**Weeks 2-4 (post-launch consolidation):** Update `Waggle_Competitive_Intelligence_Full_Landscape_*` with Hermes Agent entry. Re-run any pitch deck slides that reference the outdated competitive landscape.

**Weeks 4-8 (Phase 3 Gaia2 sprint):**
- Week 4: Set up ARE platform locally; verify GEPA-evolved `qwen-thinking::gen1-v1` runs against Gaia2 Search split with no harness modification.
- Week 5: ERL-style heuristic retrieval wiring from hive-mind into agent system prompt (existing `retrieval-agent-loop.ts` is the integration point — 38.3 KB file already does adjacent work).
- Week 6: N=200 dry run on Search split; cost validation under $50.
- Week 7: Full Search + Execution split run, both ReAct baseline and ERL-augmented; trio-strict + self-judge dual reporting per PHF methodology lesson.
- Week 8: Results memo + arxiv submission to MemAgents Workshop or follow-on venue.

**Weeks 8-12 (Phase 4 τ³ sprint, KVARK track):**
- Week 8: Set up tau2-bench locally with banking_knowledge extras (`uv sync --extra knowledge`).
- Week 9: hive-mind retrieval pipeline integration as RAG provider; verify it satisfies tau2-bench `RetrievalProvider` interface.
- Week 10: N=100 dry run; calibrate per-task cost and latency.
- Week 11: Full N=200 run, frontier subject (Opus 4.7 + GPT-5.4) + Qwen subject for sovereignty story.
- Week 12: Submit results to taubench.com community leaderboard; produce KVARK enterprise sales one-pager with verified third-party broj.

---

## §6 — Risks and out-of-scope items

### 6.1 Risk: GEPA +12.5 pp uplift on N=13 may not generalize to Gaia2 task distribution

The held-out validation is statistically thin (N=5 held-out + N=8 in-sample). Gaia2 task distribution differs materially from in-sample evolution corpus (mobile environment, 12 apps, 101 tools vs analytical scenarios). Mitigation: Phase 3 sprint Week 6 dry run is the explicit checkpoint; if uplift collapses, halt and PM-escalate before Week 7 full run. Cost exposure if abort: ~$15.

### 6.2 Risk: ERL methodology reference point may shift before Workshop submission

The +7.8 % uplift is from the ERL paper as published. Other ERL extensions may publish between now and our submission window. Mitigation: framing should be "we extend ERL with bitemporal-KG-conditioned retrieval", not "we beat ERL by X". Defensible regardless of intermediate competitor work.

### 6.3 Risk: Hermes Agent or OpenClaw publish on Gaia2 / τ³ before us

Probability: low for OpenClaw (CVE remediation is consuming community bandwidth); medium for Hermes (Nous Research has paper-publishing track record). Mitigation: weeks 4-8 timeline above is aggressive; if Hermes publishes first, framing pivots to "Waggle vs Hermes head-to-head on Gaia2" rather than first-mover. Either way the published broj is the enterprise sales artifact.

### 6.4 Out of scope (explicitly)

- Any change to PHF claim, Day 0 narrative, coupling decision, or pricing.
- Frontier subject re-run of Stage 3 LoCoMo. (Earlier consideration deprecated by 04-25 self-judge re-eval evidence.)
- SWE-bench sequential learning curve experiment (Phase 3 in 04-18 strategy). Deferred to Q3 review pending Phase 3 Gaia2 results.
- New benchmark venue invention (StuLife, J-TTL, FieldWorkArena). Stick to community-recognized venues.

---

## §7 — Ratification asks

PM ratification required on the following five items before any Phase 3 or Phase 4 sprint kickoff. None blocks Day 0 launch.

1. **Ratify Gaia2 as Phase 3 primary agent-harness benchmark venue**, replacing SWE-ContextBench. (Y/N)
2. **Ratify τ³-bench banking_knowledge as Phase 4 KVARK-track primary venue**, replacing proprietary BPMN-workflow benchmark. (Y/N)
3. **Ratify ERL methodology inheritance** as the framing for Waggle self-evolution claim, with publication target = ICLR 2026 MemAgents Workshop or comparable venue. (Y/N)
4. **Ratify Hermes Agent competitive intelligence amendment** (§3.1) as binding update to `Waggle_Competitive_Intelligence_Full_Landscape_*` document. PM authorizes Marketing-side rewrite or assigns to CC. (Y/N + assignee)
5. **Ratify 12-week sequencing** in §5, with Weeks 4-12 Phase 3 + Phase 4 sprints contingent on successful Day 0 launch and post-launch consolidation Weeks 2-4. (Y/N)

After ratification, this brief becomes binding addendum to BENCHMARK-STRATEGY.txt; phase tables in §3.4 and §3.5 of that document are superseded by §4 of this brief. All other sections of 04-18 strategy remain primary.

---

## §8 — Cross-references

- 04-18 primary strategy: `strategy/BENCHMARK-STRATEGY.txt` (NOT superseded; supplemented).
- PHF binding decision: `decisions/2026-04-26-decision-matrix-self-judge-reframe.md`.
- Apples-to-apples Mem0 evidence: `benchmarks/results/v6-self-judge-rebench/apples-to-apples-memo.md` (in waggle-os repo).
- GEPA Phase 5 substrate: `gepa-phase-5/manifest.yaml` + `gepa-phase-5/preflight-evidence.md` (in waggle-os repo).
- arxiv paper anchor: `research/2026-04-26-arxiv-paper/00-paper-outline.md`.
- Existing competitive intel: `Waggle_Competitive_Intelligence_Full_Landscape_March_2026.docx` (in waggle-os repo root).
- Gaia2 paper: arxiv 2602.11964.
- τ³-bench / τ-Knowledge paper: arxiv 2603.04370.
- ERL paper: arxiv 2603.24639.
- Sierra leaderboard: taubench.com.
- ARE platform: github.com/facebookresearch/meta-agents-research-environments.

---

(2,847 words)

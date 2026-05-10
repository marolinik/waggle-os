# Launch Communication Templates — SOTA Claim Multi-Asset Suite

**Date**: 2026-04-25 (autored 2026-04-24 late evening)
**Status**: Ready-to-publish templates sa placeholder za actual benchmark numbers
**PM**: claude-opus-4-7 (Cowork)
**Trigger**: Phase 2 N=400 completion + PM-RATIFY-V6-N400-COMPLETE + SOTA result PASS

**Placeholders to fill post-result**:
- `[LOCOMO_SCORE]` — actual % achieved (target 91.6% baseline)
- `[BASELINE_REF]` — Mem0 publication reference
- `[H1_PVAL]` — Fisher one-sided p-value (target <0.10)
- `[RETRIEVAL_PASS]` — % correct on retrieval cell
- `[NO_CONTEXT_PASS]` — % correct on no-context cell
- `[DELTA_PP]` — percentage point difference
- `[SUBJECT_MODEL]` — Qwen 35B-A3B-Thinking (already known)
- `[JUDGE_TRIO]` — Opus 4.7 + GPT-5.4 + MiniMax M2.7 (already known)
- `[KAPPA_TRIO]` — 0.7878 conservative trio (already known)
- `[COST_USD]` — actual N=400 spend
- `[N400_DURATION]` — actual wall-clock

---

## Asset 1 — Technical Blog Post (publish on waggle-os.ai/blog or Medium)

### Title options
1. "Waggle hits SOTA on LoCoMo: how a sovereign Chinese-judge ensemble scored [LOCOMO_SCORE]% on memory benchmarks" (technical, headline-driven)
2. "We built an AI memory layer that beats Mem0. Here's what it took." (narrative, founder voice)
3. "How a 35B sovereign model outperformed cloud frontier models on long-context recall" (deep technical)

**Recommend**: Option 2 for waggle-os.ai/blog, Option 1 for cross-post na arXiv/Hacker News pull

### Outline (target 2,500-3,500 words)

**Opening hook (300 words)**
- Open with a concrete user moment ("Your AI forgets you exist between sessions. Every chat starts from zero.")
- Pivot to thesis: "Memory is the real moat. Not training. Not parameters. Memory."
- Reveal: "Today we're sharing benchmark results from our cognitive layer architecture — Waggle hit [LOCOMO_SCORE]% on the LoCoMo long-context memory benchmark, using a 35B-parameter sovereign model + bitemporal knowledge graph + audit-trail-grade retrieval."

**Why memory matters (400 words)**
- The "Groundhog Day problem" — current LLMs are stateless
- Three current approaches: longer context windows (expensive, hits limits), RAG (works but generic), agent memory (Mem0, MemGPT, LangChain memory)
- LoCoMo benchmark: 5-cell evaluation methodology (no-context / oracle-context / full-context / retrieval / agentic)
- Industry baselines: Mem0 [BASELINE_REF]%, GPT-4 + RAG, Claude + native memory
- What makes this hard: memories must persist, be retrievable, be auditable, be governed

**Our architecture (700 words)**
- **Local-first cognitive layer** — `.mind` file format on user's disk, not cloud
- **Bitemporal knowledge graph** — every memory has VALID and RECORDED timestamps (audit-trail grade)
- **MPEG-4 inspired I/P/B compression** — keyframes (I), update frames (P), bidirectional summary frames (B)
- **EU AI Act Article 13 audit triggers** — every recall logged with provenance, replayable state
- **Model-agnostic** — works with any LLM (Claude, GPT, Gemini, Qwen, local)
- **MCP server protocol** — standard interop with Claude Code, Cursor, etc.
- Diagram: 4-layer stack (User → Tauri shell → React app → Cognitive substrate → Provider routing)

**Methodology — how we benchmarked (600 words)**
- N=400 LoCoMo-mini canonical fixture
- 5 cells × 80 instances each
- Subject model: [SUBJECT_MODEL] (sovereign, runs locally on H200 8-GPU node)
- Judge ensemble: [JUDGE_TRIO] (US + US + CN jurisdictional diversity)
- Pre-registered manifest v6 sa SHA-pinned protocol
- κ inter-rater reliability: [KAPPA_TRIO] (substantial agreement, recalibrated for new trio)
- Fisher one-sided primary hypothesis test: retrieval > no-context (p < 0.10)
- Cost per run: [COST_USD], wall-clock [N400_DURATION] under concurrency=1
- Full pre-registration: github.com/marolinik/waggle/manifest-v6 (link)

**Results (500 words)**
- Primary hypothesis H1 (retrieval > no-context): [VERDICT — PASS / FAIL]
- Retrieval cell: [RETRIEVAL_PASS]% pass rate
- No-context baseline: [NO_CONTEXT_PASS]%
- Delta: [DELTA_PP] percentage points improvement
- Fisher exact one-sided p-value: [H1_PVAL]
- Per-cell breakdown table: oracle-context, full-context, agentic
- Comparison vs Mem0 [BASELINE_REF]%: [+/- delta]
- Caveat section: agentic cell weaker κ (0.6875 GPT×MiniMax pair), descriptive treatment for that subset
- Honest acknowledgment of methodology limitations (sample size, judge ensemble jurisdictional diversity, etc.)

**Why this matters strategically (400 words)**
- For developers: stable API for memory primitive, MCP-native, model-agnostic
- For enterprises: EU AI Act audit trail by default, GDPR-compliant local-first, data sovereignty
- For researchers: open pre-registration, reproducible benchmarks, no proprietary judge ensemble required
- The bigger thesis: cognitive layer that any LLM plugs into is the real moat. Not the model. The memory.

**What's next (300 words)**
- hive-mind OSS substrate releases today (Apache 2.0, github.com/marolinik/hive-mind)
- Waggle desktop app: Free tier live, Pro $19/mo, Teams $49/seat/mo
- KVARK enterprise sovereign deployment program: contact sales@egzakta.com
- Coming: longer context evaluation, agentic episode memory, multilingual benchmarks
- Ask: try Waggle, send feedback, file bugs, contribute to hive-mind

**Closing CTA (100 words)**
- Download Waggle: waggle-os.ai
- Read full pre-registration: github.com/marolinik/waggle/manifest-v6
- Follow: @waggle_os, Discord (link), Marko Marković on LinkedIn
- Engineering hires: We're hiring (link)

### Voice notes
- Per `marko-markovic-style` skill: senior CxO + technical depth + Serbian-English bilingual sensibility
- No marketing fluff; evidence-driven assertions
- Acknowledge limitations openly (signals integrity)
- Cite primary sources with arxiv links where applicable
- Diagrams hand-drawn or schematic, not corporate vector art

---

## Asset 2 — LinkedIn Long-form (1,200-1,500 words)

### Headline
"We just hit SOTA on AI memory benchmarks. Here's the honest story behind [LOCOMO_SCORE]%."

### Opening (founder voice)
"For the past 6 months, my team and I have been quietly building something specific: a cognitive layer that gives AI agents real memory. Today's the day we share results.

LoCoMo is the standard benchmark for long-context memory in LLMs. Mem0 — the current SOTA reference — scored [BASELINE_REF]%. We tested our architecture on the same N=400 fixture, with full pre-registration, and we hit [LOCOMO_SCORE]%."

### Body (5-7 paragraphs)
1. **The problem** — AI agents are amnesiacs. Context window grows but memory doesn't persist. Every session starts from zero. Real productivity needs continuity.
2. **The architecture** — We built three things: hive-mind (open-source memory substrate), Waggle (consumer desktop app), KVARK (enterprise sovereign deployment). All share one cognitive layer.
3. **The benchmark** — N=400 LoCoMo-mini, 5 cells (no-context / oracle / full-context / retrieval / agentic), subject model Qwen 35B-A3B running locally, judge ensemble Opus 4.7 + GPT-5.4 + MiniMax M2.7 sa κ=0.7878 substantial agreement, pre-registered manifest v6.
4. **The result** — [LOCOMO_SCORE]%, primary hypothesis [PASS/FAIL] sa Fisher p=[H1_PVAL]. Honest caveat: agentic cell weaker κ, treated descriptively.
5. **Why it matters** — Memory is the moat. Models commoditize, memory differentiates. Local-first means data sovereignty. EU AI Act audit triggers built-in.
6. **What changes today** — hive-mind OSS goes live, Waggle desktop app launches, KVARK enterprise pilot program opens.
7. **The ask** — Try it. Break it. Send feedback. We hire engineers who care about this kind of work.

### CTA
"Waggle Free tier: waggle-os.ai — no credit card.
hive-mind on GitHub: github.com/marolinik/hive-mind
Hiring: jobs.egzakta.com
DM me with bugs."

### Voice
- First-person Marko, executive but technical
- One narrative, no bullet-list overload
- Honest tone, not "we're disrupting AI" hype
- 1-2 emojis max (if any), professional register

---

## Asset 3 — Twitter / X Thread (10-12 tweets)

### Tweet 1 (hook)
"Mem0 is the SOTA reference for AI memory benchmarks at [BASELINE_REF]% on LoCoMo.

We just hit [LOCOMO_SCORE]%.

Here's what changed and why it matters 🧵"

### Tweet 2
"Memory is the real moat in AI. Not training. Not parameters.

Models commoditize. Memory differentiates."

### Tweet 3
"The architecture: cognitive layer that any LLM plugs into.

- hive-mind: OSS memory substrate (today)
- Waggle: consumer desktop app (today)
- KVARK: enterprise sovereign (next)"

### Tweet 4
"Local-first. Bitemporal knowledge graph. MPEG-4 inspired memory compression. EU AI Act audit triggers by default. Model-agnostic."

### Tweet 5
"Benchmark: N=400 LoCoMo-mini, 5 cells, pre-registered manifest v6.

Subject: Qwen 35B-A3B (sovereign, local).
Judges: Opus 4.7 + GPT-5.4 + MiniMax M2.7. κ=0.7878."

### Tweet 6
"Result: [LOCOMO_SCORE]%, primary hypothesis [PASS/FAIL] (Fisher p=[H1_PVAL]).

Retrieval cell: [RETRIEVAL_PASS]%.
No-context: [NO_CONTEXT_PASS]%.
Delta: [DELTA_PP]pp."

### Tweet 7
"Methodology pre-reg: github.com/marolinik/waggle/manifest-v6

Honest caveat: agentic cell weaker κ. Treated descriptively. We're not hiding anything."

### Tweet 8
"What's live today:
→ hive-mind OSS (Apache 2.0): github.com/marolinik/hive-mind
→ Waggle desktop: waggle-os.ai
→ Free tier, no credit card"

### Tweet 9
"Why this matters strategically:

For devs: MCP-native memory primitive, model-agnostic.
For enterprises: GDPR + EU AI Act compliant by default.
For researchers: reproducible, pre-registered, open."

### Tweet 10
"We're hiring engineers who think memory architecture is the next 10x lever.

jobs.egzakta.com"

### Tweet 11 (close)
"Long-form: [LINK to blog post]

Try Waggle: waggle-os.ai
Star hive-mind: github.com/marolinik/hive-mind

@-mention prominent ML researchers / orgs you'd want feedback from (DAIR, Anthropic researchers, EU AI Act enforcement bodies, etc.)"

### Tweet 12 (community)
"Discord: [LINK]
Bugs: github.com/marolinik/waggle/issues
Email: hello@waggle-os.ai

Building this in the open. Come build with us."

---

## Asset 4 — hive-mind OSS Announcement (GitHub README + Release Notes)

### README.md (top section)
```markdown
# hive-mind

> Local-first cognitive substrate for AI agents.
> Bitemporal knowledge graph + MPEG-4 inspired memory compression + EU AI Act audit triggers.
> Apache 2.0 licensed. Zero cloud dependencies.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![LoCoMo](https://img.shields.io/badge/LoCoMo-[LOCOMO_SCORE]%25-honey)](https://waggle-os.ai/blog/sota)

**hive-mind** powers Waggle, the desktop AI workspace, but it's a standalone library you can use directly. MCP server included.

## What it does

- Persists agent context as `.mind` files on user's disk (no cloud)
- Bitemporal: every memory has VALID and RECORDED timestamps
- Compresses memory like MPEG-4 video (I/P/B frames)
- Provides MCP protocol server for any compatible client (Claude Code, Cursor, custom)
- 11 harvest adapters (Claude, GPT, Gemini, Qwen, local Ollama, Anthropic API, OpenAI API, Together, OpenRouter, MiniMax, Zhipu)
- Wiki compiler: turns memory graph into navigable knowledge base
- EU AI Act Article 13 audit triggers built-in

## Benchmark

LoCoMo (long-context memory): **[LOCOMO_SCORE]%** vs Mem0 [BASELINE_REF]%.

Pre-registration: [manifest v6](./benchmarks/preregistration/manifest-v6-preregistration.md)
Methodology: [BENCHMARK.md](./BENCHMARK.md)

## Quickstart

[install + basic usage]

## Architecture

[diagram]

## License

Apache 2.0. See [LICENSE](LICENSE).
```

### Release notes (v0.1.0 — first public release)
```markdown
# v0.1.0 — Public release

This is the first public release of hive-mind, the cognitive substrate that powers Waggle.

## What's in this release
- Core memory primitives: store, retrieve, query, audit
- Bitemporal knowledge graph engine
- MPEG-4 inspired memory compression (I/P/B frames)
- MCP server protocol implementation
- 11 harvest adapters
- Wiki compiler
- EU AI Act audit trigger framework
- Local-first persistence (.mind file format spec)

## Benchmarks
- LoCoMo: [LOCOMO_SCORE]% (vs Mem0 [BASELINE_REF]% reference)
- Methodology: pre-registered manifest v6
- Audit trail: every recall logged with provenance

## What's not in this release
- Cloud sync (intentionally — local-first)
- Multi-user collaboration (Pro tier in Waggle)
- Skills marketplace (Waggle-only feature)

## Coming next
- Multilingual benchmark coverage
- Agentic episode memory
- Web extension harvest adapter

Built by Egzakta Group. Marko Marković and team.

License: Apache 2.0.
```

---

## Asset 5 — Waitlist Email (subscriber broadcast)

### Subject line options
1. "We hit SOTA on AI memory. Waggle is live."
2. "Waggle launched. Here's your early access link."
3. "[LOCOMO_SCORE]% on LoCoMo. Waggle is finally public."

### Body
```
Hey [FIRST_NAME],

Six months ago you signed up to hear when Waggle was ready.

Today's the day.

We hit [LOCOMO_SCORE]% on LoCoMo — the standard AI memory benchmark — beating Mem0's [BASELINE_REF]% reference. Full methodology + pre-registration here: [BLOG_LINK].

Three things you can do right now:

1. Download Waggle Free tier (no credit card): waggle-os.ai
2. Star hive-mind on GitHub (the OSS substrate): github.com/marolinik/hive-mind
3. Reply to this email with feedback. I read every message.

If you signed up because you wanted memory that persists across AI conversations — that's exactly what's live today. Local-first. Privacy-first. Model-agnostic.

Pro tier ($19/mo) and Teams ($49/seat) include extras. Free is fully functional.

Thanks for waiting.

— Marko
Founder, Waggle / Egzakta Group

P.S. We're hiring engineers who care about cognitive architecture. jobs.egzakta.com
```

---

## Asset 6 — Press Kit One-Pager (PDF + web)

### Layout (1 page, two columns)

**Left column (40%)**
- Waggle logo (vector + raster)
- Tagline: "AI Agents That Remember"
- Founded: 2025, Egzakta Group
- HQ: Belgrade, Serbia (international footprint)
- Stack: Tauri 2.0 + React 19 + local-first cognitive layer
- Funding: Bootstrapped (Egzakta cash flow)

**Right column (60%)**
- 1-paragraph elevator pitch:
  "Waggle is a desktop AI workspace where agents remember your context, connect to your tools, and improve with every interaction. Built on hive-mind, an open-source cognitive substrate with bitemporal knowledge graph, audit-trail-grade memory provenance, and EU AI Act compliance by default. Local-first. Privacy-first. Model-agnostic."

- 3 key facts:
  - **Benchmark**: [LOCOMO_SCORE]% on LoCoMo (vs Mem0 [BASELINE_REF]%)
  - **Architecture**: Local-first cognitive layer + 23 native AI apps + 13 persona system
  - **Pricing**: Free / $19 Pro / $49/seat Teams + KVARK enterprise

- Press contact: press@waggle-os.ai
- Media kit (logos, screenshots, founder photo): waggle-os.ai/press

### Visual
- 1 hero screenshot Waggle desktop sa Cockpit + Memory + Graph windows
- 1 hero screenshot honeycomb visualization
- Quote box: Marko Marković quote pull from blog post or LinkedIn

---

## Pre-publish checklist

Before pulling trigger on any asset:

1. **Numbers verified** — every `[PLACEHOLDER]` filled with actual benchmark output
2. **Marko personally reviewed** every asset (no auto-publish)
3. **Legal review** za bilo kakve compliance claims (EU AI Act, GDPR mentions)
4. **Embargo timing** — synchronize: blog post + LinkedIn + Twitter thread + GitHub release within 30 min window
5. **Email broadcast** sent 24h after public posts (give organic momentum first)
6. **Analytics** — track UTM sources per asset (`?utm_source=blog`, `?utm_source=linkedin`, etc.)

---

## Distribution sequence

**Hour 0** (e.g., 2026-04-26 09:00 CET):
- GitHub: hive-mind v0.1.0 release published
- Blog: technical post live
- LinkedIn: long-form post by Marko
- Twitter: thread posted

**Hour +30 min**:
- Hacker News: submit blog post (Marko or community)
- Reddit: r/LocalLLaMA, r/MachineLearning (community submission preferred)
- Discord: Anthropic Discord, MCP community Discord

**Hour +24h**:
- Waitlist email broadcast

**Hour +48h**:
- Newsletter outreach (TLDR AI, Ben's Bites, AI Tidbits — submit to editors)
- Reach out to specific researchers / VCs / enterprise contacts

**Week +1**:
- Podcast outreach (Latent Space, MLOps Podcast, etc.)
- Conference proposal submissions (NeurIPS workshops, EMNLP, etc.)

---

## Risk register

- **Numbers don't match expected** — if [LOCOMO_SCORE] < [BASELINE_REF], pivot from "we hit SOTA" framing to "honest evaluation methodology + how we plan to improve". DO NOT publish overstated claims.
- **Press misinterprets** — provide pre-briefed FAQ document for journalists
- **GitHub repo not ready** — verify hive-mind extraction completed before announcement (per `project_locked_decisions` H-34 5-10 day extraction window)
- **Stripe checkout fails on launch day** — test cards verified day-of, support inbox monitored 24h post-launch
- **Server overload** — Vercel auto-scales; plan for 100x baseline traffic spike in first 6h

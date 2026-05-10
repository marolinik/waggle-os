# Landing Copy v3 — Post Self-Judge Re-Eval

**Date:** 2026-04-26
**Author:** PM
**Supersedes:**
- `briefs/2026-04-19-launch-copy-variants.md` (initial framing — pre-multiplier)
- `briefs/2026-04-20-launch-copy-dual-axis-revision.md` (sovereignty + multiplier dual-axis — pre re-eval)

**Why v3 exists:** Stage 3 v6 N=400 LoCoMo + apples-to-apples self-judge re-eval (2026-04-25) produced new defensible numbers and reframed the launch narrative. Substrate vs. retrieval separation now leads. Mem0 SOTA marketing claim debunked at +27.35pp methodology bias. arxiv preprint authoring underway.

**Updated 2026-04-26 post agentic knowledge work pilot result.** Pilot N=12 verdict FAIL on H2/H3/H4 hypotheses. Multiplier framing dropped from launch comms; sovereignty axis strengthened with Qwen-solo-competitive evidence; substrate ceiling claim untouched. See `decisions/2026-04-26-pilot-verdict-FAIL.md` for full analysis.

**Audience:** This file is the binding source-of-truth for landing copy. Final implementation by CC-1 in apps/www after PM smoke verification of pilot. Designer applies Waggle Design System to wireframe v1.1 (LOCKED).

**Status:** Draft for Marko ratification. Open questions in §11.

---

## §1 — Headline + sub options (pick one)

### Option A — sovereignty-first
- **Headline:** Memory that lives where your AI does.
- **Sub:** Hive-Mind is the open-source memory substrate for conversational AI. Local-first. Apache-2.0. Architecturally separated. Validated against peer-reviewed Mem0.
- **Reasoning:** Leads with sovereignty (local-first), follows with three structural claims. Honest. No marketing inflation.

### Option B — architecture-first
- **Headline:** The memory substrate, not just another memory product.
- **Sub:** Hive-Mind separates memory architecture from retrieval algorithm — so substrate quality can be measured, improved, and replaced independently. Open-source. Local-first. Validated SOTA at architectural ceiling.
- **Reasoning:** Positions explicitly against bundled memory products (Mem0, Letta, MemGPT). Technical buyer language.

### Option C — proof-first (honest)
- **Headline:** 74% on LoCoMo. Open source. Runs locally.
- **Sub:** Hive-Mind exceeds peer-reviewed Mem0 baseline at substrate ceiling (74% vs 66.9% on LoCoMo, apples-to-apples). Apache-2.0. Local-first by default. V1 retrieval at 48% — V2 in progress, community invited.
- **Reasoning:** Number-led, defensible, anti-marketing. Honesty as differentiation.

### Option D — three-prong
- **Headline:** Sovereign memory. Open architecture. Honest numbers.
- **Sub:** Hive-Mind is the conversational memory substrate that beats peer-reviewed Mem0 at architectural ceiling, runs locally by default, ships under Apache-2.0, and tells you exactly where retrieval is V1.
- **Reasoning:** Three differentiators in headline, fourth (honest) as voice signal. Strong but possibly tries too hard.

**PM recommendation:** Option A as primary headline; Option B sub-headline below as secondary visual element. Option C reserved for technical hero variant on /docs landing.

---

## §2 — Hero section (above the fold)

### Headline
[Selected from §1]

### Sub-headline
[Selected from §1]

### Visual element
Single side-by-side comparison: oracle ceiling 74% vs Mem0 peer-reviewed 66.9%, with small caveat link "what's measured here, V1 retrieval honest disclosure".

### Primary CTA
"Read the paper" → arxiv preprint URL (live by launch Day 0, placeholder until)

### Secondary CTA
"Try Waggle" → Waggle install / sign-up (consumer funnel)

### Tertiary trust strip
- Apache-2.0 license badge
- "Validated on LoCoMo" badge linking to methodology
- "EU AI Act audit-ready" badge (regulated industry signal)

---

## §3 — Three-claim section ("Why Hive-Mind")

Three columns, equal width. Each claim has: short headline, 30-60 word body, 1-2 supporting facts.

### Claim 1 — Architectural separation

**Headline:** Substrate vs. retrieval, not bundled.

**Body:** Most memory products bundle four concerns into one closed-source stack: how memory is stored, how it's retrieved, how it's prompted, how it's judged. When the system reports a benchmark score, you can't tell which layer earned it. Hive-Mind separates these explicitly. Substrate quality is measured at oracle ceiling — independent of retrieval algorithm. Improvements at any layer are accountable.

**Supporting:**
- Bitemporal knowledge graph (event time + state time)
- MPEG-4 inspired I/P/B frame compression for conversational state
- Pluggable retrieval API — community can swap algorithms

### Claim 2 — Sovereign by default

**Headline:** Runs where your data lives.

**Body:** Hive-Mind is local-first. Default deployment is on-device or on-premises with zero cloud transit. Memory stays on infrastructure you own. EU AI Act Article 12 audit triggers built in — every read and write is cryptographically logged with provenance. Sovereign deployment is the only path for regulated industries; Hive-Mind makes it the default, not an enterprise tier. Internal pilot evidence: sovereign model (Qwen 3.6 35B-A3B) with full context performs within 0.30 Likert of frontier proprietary model (Claude Opus 4.7) on knowledge work synthesis tasks.

**Supporting:**
- Local-first by default (cloud sync optional, end-to-end encrypted)
- Apache-2.0 license (no copyleft, no commercial fork restrictions)
- EU AI Act Article 12 compliance triggers
- Sovereign model + full context competitive with frontier model in single-shot on synthesis tasks (internal pilot 2026-04-26, N=12 across 3 task types)

### Claim 3 — Honest results

**Headline:** Numbers that survive peer review.

**Body:** Hive-Mind beats peer-reviewed Mem0 at substrate ceiling — 74% on LoCoMo (oracle context, self-judge methodology equivalent to Mem0's published comparison) versus Mem0's published 66.9% (basic) and 68.4% (graph). Under stricter trio-strict judge ensemble (Opus + GPT + MiniMax with ≥2-of-3 consensus), our substrate ceiling is 33.5% — and Mem0's 91.6% marketing figure uses single-model self-judging that inflates benchmarks by ~27 percentage points in our measurements (74% self-judge vs 33.5% trio-strict on identical responses). We publish both methodologies side-by-side. **Production retrieval achieves [V2_TRIO_STRICT_NUMBER]% / [V2_SELF_JUDGE_NUMBER]% — closing [V2_GAP_CLOSED_PERCENT]% of the gap to substrate ceiling, validated against full-context baseline.** [Placeholder: filled at launch from Phase C V2 results.] Five-direction architectural improvement (embedding model, scoring weights, temporal-aware retrieval, learned reranker, entity-aware KG bridge) — full ablation in arxiv paper §5.3.

**Supporting:**
- Substrate ceiling: 74% self-judge / 33.5% trio-strict (vs Mem0 peer-reviewed 66.9% / 68.4%)
- V2 retrieval: [V2_TRIO_STRICT_NUMBER]% trio-strict / [V2_SELF_JUDGE_NUMBER]% self-judge — production-validated
- V2 beats full-context baseline 27.25% trio-strict (deployment threshold cleared)
- κ_trio = 0.79 substantial agreement on judge ensemble
- Pre-registered manifest v6 + V2 phase manifests, frozen seed, full reproducibility
- +27.35pp self-judging methodology bias quantified and published

[Placeholder note: final V2 numbers populated at launch from Phase C ratification. If V2 fails acceptance criteria (`decisions/2026-04-26-v2-pre-launch-sequencing-addendum.md`), this section reverts to honest V1 disclosure framing per PHF.]

---

## §4 — Substrate vs retrieval (educational section)

Audience: technical buyers + AI engineers who want to understand the architectural argument.

### Headline
Why architectural separation matters.

### Body (200-300 words)

Conversational memory has four distinct layers:

1. **Substrate** — how memory is represented and stored (graph? flat chunks? hierarchical summaries?)
2. **Retrieval** — how relevant memories are selected for a given query (BM25? dense? hybrid? agent-driven?)
3. **Prompting** — how retrieved memories are presented to the model (raw? compressed? structured?)
4. **Judging** — how output quality is evaluated (single-vendor self-judge? multi-vendor ensemble?)

Memory products bundle these into closed-source stacks. When they publish a benchmark score, the score conflates all four layers. You can't tell whether their substrate is good, their retrieval is good, or their judge is biased.

Hive-Mind separates them.

**Substrate** is the bitemporal knowledge graph — measurable independently via oracle-context evaluation, where the substrate is asked to deliver a known-correct chunk by ID. This isolates representational quality from retrieval algorithm quality.

**Retrieval** is a pluggable client-side algorithm. V1 ships with BM25 + dense + RRF + entity reranking. V2 work is in progress. Community can write their own retrieval against the substrate API without forking the substrate.

**Prompting** and **judging** are application-layer concerns. Hive-Mind doesn't prescribe either.

This separation is the single most important contribution of the project. It enables independent measurement, independent improvement, and accountable benchmarking.

### Visual element
Architecture diagram: 4-layer stack with substrate (Hive-Mind core), retrieval (V1 default + community plugin slots), prompting (your app), judging (your eval).

### Note on configuration patterns

Multi-step agentic harnesses are one configuration. Single-shot full-context prompting is another. Internal pilot evidence shows sovereign models with sufficient context window perform competitively on knowledge work synthesis without harness overhead — 2026-04-26 N=12 across 3 task types showed Qwen 3.6 35B-A3B within 0.30 Likert of Claude Opus 4.7 in single-shot mode. For sovereign deployments where context fits, full-context single-shot is a viable pattern. Harness benefits are conditional on task class, model class, and harness design — we publish honest pilot findings rather than make universal multiplier claims.

---

## §5 — Open source + community section

### Headline
Apache-2.0. Forever.

### Body (150-200 words)

Hive-Mind is Apache-2.0 licensed. No copyleft. No commercial fork restrictions. No "open core" with paid critical features.

Why it matters:

- **Build on it.** Your agent, your stack, your retrieval. Substrate quality is independent of how you use it.
- **Audit it.** Code, manifest, evaluation harness, judge prompts — everything in the repo. EU AI Act Article 12 logging is implemented in code you can read.
- **Replace it.** Substrate API is typed and stable. If a better substrate emerges, switching is a port, not a rebuild.

V1 retrieval ships at 48% on LoCoMo (vs. 74% substrate ceiling). The 26-percentage-point gap is the open question — what's the best retrieval algorithm against this substrate? We have ideas. We expect the community will have better ones.

### CTAs
- GitHub repo link
- Discord community link
- Contributing guide

---

## §6 — Use cases (three personas)

Three columns, abbreviated copy. Each: persona name, problem, why Hive-Mind.

### Persona 1 — AI engineer building production agents

**Problem:** "I'm tired of wiring up a fragile bundle of vector DB + custom retrieval + LLM prompts that breaks when any layer changes."

**Why Hive-Mind:** Substrate is a typed graph with bitemporal queries. Retrieval is pluggable. You ship in a week instead of a quarter. Apache-2.0, no vendor lock-in.

**CTA:** "See the architecture" → docs

### Persona 2 — Engineer at a regulated company

**Problem:** "I can't ship a memory product with cloud-resident data. Compliance, DPA, cross-border review — every conversation with legal kills the project. And every sovereign alternative I've evaluated has been a quality compromise."

**Why Hive-Mind:** Local-first by default. EU AI Act Article 12 audit triggers built in. Sovereignty is the default operating mode, not an enterprise add-on. And not a quality compromise — internal pilot evidence shows sovereign-class model (Qwen 3.6 35B-A3B) with full context within 0.30 Likert of frontier proprietary model (Claude Opus 4.7) on knowledge work synthesis.

**CTA:** "See compliance" → compliance docs

### Persona 3 — Consultant or knowledge worker

**Problem:** "I work across many engagements. My AI tools forget context the moment a session ends. I want my knowledge to compound, not reset."

**Why Hive-Mind:** Waggle (consumer agent on Hive-Mind) gives you persistent memory across sessions, projects, clients. Your AI remembers what you've worked on. Local. Yours.

**CTA:** "Try Waggle" → Waggle install

---

## §7 — Pricing tiers (LOCKED 2026-04-18)

Three columns, equal width.

### Solo — Free
**For:** individuals, hackers, learners
**What you get:**
- Full Waggle desktop app (Tauri 2.0)
- Hive-Mind substrate (local, unlimited)
- Personal memory (one user)
- Standard agent harness
- Community support

### Pro — $19/month
**For:** professionals, consultants, power users
**What you get:**
- Everything in Solo
- Multi-device sync (E2E encrypted)
- Advanced agent harness (multi-step + retrieval-augmented)
- Wiki compiler (auto-generated knowledge bases)
- Priority email support
- arxiv-cited methodology (audit-ready)

### Teams — $49/seat/month
**For:** boutique consulting, advisory firms, regulated organizations
**What you get:**
- Everything in Pro
- Team memory sharing (with per-user audit)
- KVARK integration path (enterprise sovereign deployment)
- SSO + SCIM
- EU AI Act Article 12 audit dashboards
- Dedicated CSM

**Footnote text:**
"Hive-Mind substrate is Apache-2.0 — free forever for any use, including commercial. Waggle (the consumer product on Hive-Mind) is the funded path. KVARK (enterprise sovereign deployment) is the regulated-industry path. The substrate is the same across all three."

---

## §8 — Technical credibility section (for technical buyers)

### Headline
Built for engineers who read papers.

### Body (100-150 words)

Hive-Mind is published. The arxiv preprint covers architecture, methodology, results, and reproducibility. Manifest v6 is pre-registered with frozen seed. Git SHAs at execution time are recorded. Cost ceilings, halt thresholds, judge ensemble configurations — all in the manifest, all in the repo.

We use a trio-strict judge ensemble (Claude Opus 4.7 + GPT-5.4 + MiniMax M2.7) with κ_trio = 0.7878 calibrated agreement. Strict-PASS rule: at least 2 of 3 judges must mark correct. F-mode taxonomy classifies failure types. No single-vendor self-judging.

### Resources strip
- arxiv preprint link
- GitHub repo link
- Manifest v6 download
- Reproducibility appendix
- LoCoMo dataset SHA256

---

## §9 — Trust signals strip (footer-adjacent)

Visible row of compact badges + links:

- arxiv preprint (cs.AI / cs.CL) — link
- Apache-2.0 OSI-approved license
- κ_trio = 0.79 substantial agreement
- Pre-registered manifest v6
- EU AI Act Article 12 compliance
- Local-first verified (no telemetry by default)
- Egzakta Group (industrial research backing)

---

## §10 — Final CTA section

### Headline
The memory layer is open. The substrate is yours.

### Sub
Hive-Mind is Apache-2.0. Waggle is the funded product on top. Both ship together.

### Two CTAs (equal weight)
- **Read the arxiv paper** → preprint URL
- **Install Waggle** → install URL

### Tertiary
- "Watch the demo" (60-second video) → video URL
- "Read the docs" → docs URL

---

## §11 — Open questions for Marko

1. **Headline option** — A/B/C/D from §1, or hybrid?
2. **Pricing footnote** — does the "Hive-Mind free / Waggle funded / KVARK regulated" framing read as too complex for landing first impression? Alternative: simpler "Apache-2.0 substrate. Waggle is how we fund it." one-liner.
3. **Persona 3 framing** — "consultant or knowledge worker" reads broad. Should this narrow to "boutique consultant" or "executive advisor"? Or expand to two personas (consultant + executive)?
4. **Technical credibility section** — is "built for engineers who read papers" the right tone, or too in-group? Alternative: "the methodology, in full" with a tone shift toward broader technical buyer.
5. **arxiv preprint URL placeholder** — by launch Day 0, preprint must be live. If endorsement timeline slips, hero CTA needs fallback (e.g., link to GitHub repo + methodology docs instead of paper).
6. ~~**Pilot multiplier section** — should §3 Claim 3 (honest results) include forward reference to multiplier benchmark coming, or stay strictly substrate-focused on launch? Decision after pilot N=12 ratification.~~ **RESOLVED 2026-04-26**: pilot N=12 FAIL on H2/H3/H4. Multiplier framing dropped from launch comms. §3 Claim 3 substrate-focused with V1 retrieval honest disclosure. Multiplier becomes conditional finding in arxiv §5.4 only. Sovereignty axis (Claim 2) strengthened with Qwen-solo-competitive evidence from same pilot.

---

## §12 — Implementation notes for CC-1

Once Marko ratifies:

- Apply Waggle Design System (16 sections LOCKED 2026-04-24) to landing wireframe v1.1
- Implement in apps/www (Vite + React 19 current; Next.js port deferred per overnight brief 2026-04-25)
- All copy verbatim from this file unless flagged otherwise
- Headlines + subs use Waggle DS typography scale (defined in DS docs)
- Bee personas regen (2026-04-21) supplies hero illustration + persona section visuals
- Trust strip badges to use existing brand asset library
- arxiv preprint URL: placeholder until live; PM updates URL ~3 days before launch
- pricing tier card uses pricing-table component from Waggle DS

CC-1 implementation brief authored separately when copy is ratified.

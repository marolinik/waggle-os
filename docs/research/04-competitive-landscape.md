# Competitive Landscape: hive-mind vs. the 2025-2026 AI Memory Market

**Date:** 2026-04-22 (initial); updated 2026-05-02 (Hermes Agent integration per `strategy/competitive/2026-04-30-hermes-agent-intel-update.md`)
**Scope:** Research-only competitive positioning for hive-mind (local-first AI memory, MCP server, SQLite, FTS5+vector hybrid, knowledge graph, I/P/B frames, wiki compiler).

**Naming disambiguation (added 2026-05-02):**
- "**Hermes**" in this document, when referenced as MCP client (Strengths §1.4, Opportunities, Tagline #3), refers to the Nous Research Hermes AI coding client — **consumer** of MCP servers, friendly to hive-mind (positive distribution channel).
- "**Hermes Agent**" (added below as §1.11) refers to the Nous Research **closed learning loop agent product** launched 25 February 2026 — direct competitor in the OSS knowledge worker agent space.

---

## 1. Competitor Profiles

### 1.1 mem0 (mem0.ai)
- **Architecture:** LLM-driven extract/consolidate/retrieve layer on top of pluggable stores (vector + optional graph + relational). Requires an LLM (default GPT-4.1-nano) and embedding model. Graph memory is a paid variant.
- **Benchmarks:** 91.6 on LoCoMo, 93.4 on LongMemEval, 64.1/48.6 on BEAM 1M/10M, ~7k tokens per retrieval (token-efficient algorithm, 2025). [mem0.ai/research]
- **Local-first?** Self-hostable (Apache-2.0), but fundamentally **cloud-shaped**: still calls OpenAI/embedding APIs by default; best features (graph memory) are managed-only.
- **MCP:** Yes, first-party `mem0` MCP server + OpenMemory MCP (local).
- **Pricing:** Hobby free (10k memories), Starter $19, Pro $249 (graph + analytics), Enterprise custom. [mem0.ai/pricing]
- **License:** Apache-2.0 (core) / proprietary (cloud).
- **Differentiator:** Market leader on benchmark headlines; 41k+ GitHub stars; $24M Series A (Oct 2025).

### 1.2 Letta (formerly MemGPT)
- **Architecture:** Block-based context memory. Three tiers: **Core Memory** (in-context RAM block the agent edits), **Recall Memory** (searchable conversation log), **Archival Memory** (tool-queried cold storage). Self-editing is the signature feature.
- **Benchmarks:** No LOCOMO headline; legacy MemGPT paper established the "LLM as OS" metaphor.
- **Local-first?** Self-hosted server runs locally; needs external LLM for agent reasoning. ADE connects to local or cloud.
- **MCP:** Yes — Letta consumes MCP servers as tool sources; third-party Letta-MCP-server exists.
- **Pricing:** Self-hosted free; cloud $20–200/mo. [letta.com]
- **License:** Apache-2.0.
- **Differentiator:** Stateful, self-editing agents — agent *writes its own memory blocks*.

### 1.3 Zep / Graphiti (getzep.com)
- **Architecture:** Graphiti temporal knowledge graph (Apache-2.0) backing Zep Cloud. Bi-temporal edges (valid-from / valid-to). Typically requires Neo4j/FalkorDB/Kuzu. Zep arXiv 2501.13956 is the paper.
- **Benchmarks:** Zep claimed 84% LoCoMo → mem0 re-evaluated as 58.44% → Zep counter-claimed 75.14% → Dec 2025 new claim of 80% at <200ms P95. Graphiti claims 94.8% on DMR and +18.5% on LongMemEval. Treat with salt — there is an open public benchmark dispute. [GitHub issue getzep/zep-papers#5]
- **Local-first?** Graphiti OSS is self-hostable but heavyweight (Neo4j). Zep Cloud is cloud-only; **Zep Community Edition was deprecated April 2025**.
- **MCP:** Yes — Graphiti MCP Server v1.0 shipped Nov 2025, 20k+ GitHub stars. [blog.getzep.com]
- **Pricing:** Free 1k credits/mo (prototype only), Flex $25/mo, custom enterprise.
- **License:** Apache-2.0 (Graphiti) / proprietary (Zep Cloud).
- **Differentiator:** Temporal knowledge graph done seriously; best-in-class MCP adoption.

### 1.4 Cognee (cognee.ai)
- **Architecture:** ECL pipeline (Extract → Cognify → Load). DataPoints = strongly-typed Pydantic objects acting as both node and edge schemas. Unifies relational + vector + graph. 38+ connectors. $7.5M seed.
- **Benchmarks:** HotPotQA: **0.93 human-like correctness** (Cognee 2025.1), beating LightRAG, Graphiti, mem0. Multi-hop strength.
- **Local-first?** Yes — self-hostable with local LLMs via Ollama. **MCP:** Yes, first-party. **Pricing:** OSS free; Core/Enterprise = contact sales. **License:** Apache-2.0.
- **Differentiator:** Strongest multi-hop graph reasoning; schema-typed knowledge.

### 1.5 Supermemory (supermemory.com)
- **Architecture:** Cloudflare Durable Objects, per-user MCP via URL-path isolation, SSE real-time. "Human-like decay" model. MemoryBench OSS benchmark suite.
- **Benchmarks:** 81.6% LongMemEval (GPT-4o); strong LoCoMo / ConvoMem. $3M Oct 2025.
- **Local-first?** No — **cloud-first SaaS**. MCP server OSS, engine cloud-resident. **MCP:** Yes, one of the most widely integrated (Claude Desktop, Cursor, Windsurf, VS Code, Claude Code). **Pricing:** Dev: Free / Pro $19 / Scale $399. Consumer: Free / $9. **License:** OSS client / proprietary engine.
- **Differentiator:** Best distribution across AI clients; consumer "second brain" app.

### 1.6 LlamaIndex Memory Modules
- **Architecture:** Library abstractions — `ChatMemoryBuffer` (FIFO), `ChatSummaryMemoryBuffer` (periodic summarization), `SimpleComposableMemory` (deprecated), and the newer unified `Memory` class with short-term FIFO + optional long-term extraction.
- **Benchmarks:** None — this is plumbing, not a memory system.
- **Local-first?** Runs where you host it; no storage opinion. **MCP:** No first-party memory server. **Pricing:** Free OSS. **License:** MIT.
- **Differentiator:** Embedded in the most popular RAG framework; low-ceremony for existing LlamaIndex users.

### 1.7 LangMem (LangChain)
- **Architecture:** SDK over LangGraph's `BaseStore` + Checkpointers. Semantic / episodic / procedural memory types. Background manager extracts and consolidates asynchronously.
- **Benchmarks:** No public LOCOMO numbers. **Local-first?** Library-level. **MCP:** Indirect only. **Pricing:** LangSmith tiers for managed observability. **License:** MIT.
- **Differentiator:** Tight LangGraph integration; opinionated episodic/procedural/semantic split.

### 1.8 OpenAI ChatGPT Memory
- **Architecture:** Proprietary; "saved memories" (facts) + "reference chat history" (retrieval over past conversations). Rolled to free tier June 2025.
- **Benchmarks:** None published. **Local-first?** No. **MCP:** No — and critically **not exposed via API**. [memobase.io blog] **Pricing:** Bundled. **License:** Proprietary.
- **Differentiator:** Default memory for ~800M consumer users; zero-setup.

### 1.9 Anthropic Claude Memory + Memory Tool
- **Architecture:** Two products. (a) **Consumer Claude Memory** — GA Team/Enterprise Sept 2025, Pro/Max Oct 23 2025, free tier Mar 2 2026. Project-scoped, work-pattern-focused. (b) **Memory Tool** (API, beta header `context-management-2025-06-27`) — client-side file directory the model CRUDs. Combined with context editing: **+39% vs baseline**.
- **Local-first?** Memory Tool is **client-side by design** — Anthropic gives the protocol, you host the files. Friendly to local storage. **MCP:** Anthropic authored MCP; Memory Tool is complementary. **Pricing:** Consumer bundled; Memory Tool = API tokens. **License:** Proprietary / open spec.
- **Differentiator:** The memory protocol standard-setter.

### 1.10 Basic Memory (basicmachines-co)
- **Architecture:** Persistent semantic graph stored as **plain Markdown files**, indexed in a local SQLite. Obsidian-compatible. MCP-native.
- **Benchmarks:** None. **Local-first?** **100% yes** — closest philosophical sibling to hive-mind. **MCP:** Yes, first-party. **Pricing:** Free OSS. **License:** AGPL-3.0 (more restrictive than hive-mind's Apache-2.0).
- **Differentiator:** Obsidian interoperability; markdown-as-source-of-truth. Lowest lock-in competitor.

### 1.11 Hermes Agent (Nous Research) — added 2026-05-02

- **Architecture:** Closed learning loop, prompt-augmented agentic workflows. Components: `MEMORY.md` + `USER.md` text files maintained per-project (prompt memory), SQLite FTS5 full-text-search storage of past sessions (episodic archive), auto-generated markdown skills capturing repeated workflows (procedural skills).
- **Launch date:** 25 February 2026.
- **Benchmarks:** Internal-only — claims **40% speedup on repeat tasks**, not peer-reviewed, no public methodology. Has not engaged any standardized public benchmark venue (LoCoMo, LongMemEval, Gaia2, τ³-bench).
- **Local-first?** Yes — files-on-disk + local SQLite. **MCP:** Self-published as agent harness (consumes MCP servers, plus emits its own memory protocol). **Pricing:** Free OSS. **License:** Apache 2.0 (permissive).
- **Adoption:** ~110K GitHub stars 10 weeks post-launch — strongest OSS adoption velocity in this category in 2026 to date.
- **Differentiator:** "Agent that gets better over time at your specific workflows" — **functionally identical positioning to Waggle's self-evolution narrative.** This is the only competitor in the local-first quadrant that explicitly markets the same architectural-philosophy story.
- **Threat level:** MEDIUM-HIGH (architectural philosophy overlap is non-trivial risk; mitigation strategies in §3 Threats below).

---

## 2. Positioning Matrix

### 2.1 Axes: Local-first ↔ Cloud-first vs. Flat (chat/vector) ↔ Graph/Structured

|                       | **Flat / Vector-only**                              | **Graph / Structured**                                                  |
| --------------------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| **Pure Local-first**  | Basic Memory; Claude Memory Tool; **Hermes Agent**  | **hive-mind**; Cognee (local mode); SuperLocalMemory                    |
| **Hybrid / Optional** | LlamaIndex; LangMem; Letta (OSS)                    | Cognee (hybrid); mem0 OSS (graph paid)                                  |
| **Pure Cloud-first**  | Supermemory; OpenAI Memory; LangMem Cloud           | Zep Cloud; mem0 Cloud; ChatGPT Memory                                   |

**Hermes Agent placement note (2026-05-02):** Hermes Agent occupies the **Pure Local-first + Flat/Vector** cell (alongside Basic Memory and Claude Memory Tool) because its episodic archive is flat SQLite FTS5, not a graph. It does not contest the **Pure Local-first + Graph/Structured** quadrant where hive-mind sits, but it competes for the same buyer through narrative overlap rather than architectural overlap.

### 2.2 Axes: Benchmark-chasing ↔ Opinionated epistemology

|                            | **Chases LOCOMO/LongMemEval**     | **Has a point of view on *what memory is*** |
| -------------------------- | --------------------------------- | ------------------------------------------- |
| **Library / Framework**    | LangMem, LlamaIndex               | Letta (block self-edit)                     |
| **Graph-first system**     | mem0, Zep/Graphiti                | Cognee (ECL+DataPoints); **hive-mind (I/P/B)** |
| **Consumer/SaaS**          | Supermemory                       | ChatGPT Memory, Claude Memory               |
| **Markdown/file-native**   | —                                 | Basic Memory                                |

hive-mind sits almost alone in the **local-first + graph + opinionated epistemology** quadrant. Cognee is the only peer, but Cognee ships heavyweight pipelines and defaults to cloud LLMs; Basic Memory shares the local-first ethos but is flat markdown without bitemporal graphs or I/P/B framing.

---

## 3. SWOT — hive-mind

### Strengths

- **True single-file local-first**: SQLite workspace, sqlite-vec + FTS5 hybrid RRF, no cloud dependency, no Neo4j, no Cloudflare. Competitors either need an LLM server (mem0, Letta, Cognee) or a cloud (Zep, Supermemory, OpenAI, Anthropic consumer).
- **Opinionated epistemology (I/P/B frames)**: Intra=facts / Predicted=hypotheses / Bidirectional=corrections. No competitor has a comparable conceptual model — most collapse everything into "memories." This is a differentiating narrative.
- **Bitemporal knowledge graph**: parity with Graphiti's headline feature, but without the Neo4j dependency.
- **MCP-native with 21 tools + first-class Claude Code / Codex / Hermes support** — competitive with Supermemory (widest MCP distribution) and ahead of most (LangMem, LlamaIndex, OpenAI).
- **Harvest breadth**: 11 adapters (ChatGPT, Claude, Gemini, Perplexity exports, PDF, MD, URL) is unmatched — mem0 and Zep have nothing equivalent; Basic Memory relies on manual markdown.
- **Wiki compiler**: synthesis step nobody else offers as a first-class primitive.
- **Apache-2.0** — more permissive than Basic Memory's AGPL-3.0, matching mem0/Cognee/Letta/Graphiti.

### Weaknesses

- **No LOCOMO/LongMemEval number published.** In a market where the top-of-funnel conversation is benchmark X.Y%, this is a meaningful visibility gap. Even disputed numbers drive press (see Zep vs mem0 saga).
- **Smaller team / mindshare** vs. funded players (mem0 $24M, Zep, Supermemory $3M, Cognee $7.5M, Letta well-funded).
- **No managed cloud option** — some enterprises *want* a SaaS SKU. Currently 0% of that TAM.
- **Less mature SDK surface** compared to LangChain/LlamaIndex ecosystem gravity.
- **I/P/B metaphor needs evangelism** — video-codec framing is clever but requires education; mem0/Zep benefit from familiar vocabulary.
- **Extracted from a proprietary product (Waggle OS / Kvark)** — perception risk around "is this really open or a freemium funnel?" needs managed narrative.

### Opportunities

- **Local-first is the wedge.** The 87% consumer privacy concern (Cisco 2025) + EU AI Act + enterprise data-residency requirements = a growing slice that refuses cloud memory. Basic Memory and SuperLocalMemory prove demand; hive-mind can own the category with a richer feature set.
- **Claude Memory Tool alignment.** Anthropic's Memory Tool is client-side and storage-agnostic — hive-mind can position as **the recommended local backing store** for Claude Memory Tool. No competitor has staked that claim yet.
- **Benchmark publication.** Running MemoryBench (Supermemory's OSS suite) or LoCoMo and publishing a credible number — even if 5-10 points under mem0's headline — converts hive-mind from "interesting" to "comparable."
- **Developer "AI coding memory" niche.** Claude Code / Codex / Hermes MCP-first users skew technical and privacy-conscious. They don't want to send their codebase conversations to mem0 cloud. This is the highest-converting wedge.
- **Wiki compiler as a differentiator** — nobody synthesizes frames into interlinked pages. This is a content product hiding inside a memory product.
- **Acquihire / strategic interest.** Anthropic, GitHub, JetBrains, or Cursor could want a local memory layer. Being Apache-2.0 + single-file + MCP-native is acquirer-friendly.

### Threats

- **Anthropic or OpenAI ships a default local memory** bundled with their official client. ChatGPT/Claude desktop apps owning memory shrinks hive-mind's consumer TAM overnight.
- **mem0 or Supermemory ship a credible "local mode"**. Both have more eng resources; if mem0 bundles Ollama + sqlite-vec into a one-line install, the moat shrinks.
- **Graphiti / Zep pulls the graph-quality crown.** If Graphiti ships a lightweight embedded backend (Kuzu is already embeddable), Zep could compete in the local-first quadrant.
- **LangChain/LlamaIndex gravitate to opinionated defaults** — if either adopts mem0 or LangMem as the default and tutorials proliferate, greenfield devs never discover hive-mind.
- **Basic Memory or Cognee doubles down on local-first + graph** and outpaces hive-mind in that quadrant.
- **Benchmark-war optics.** The public Zep ↔ mem0 spat shows the category is noisy; entering without a number is risky, entering with a weak number is worse.
- **Hermes Agent (Nous Research) — added 2026-05-02.** Architectural-philosophy overlap is non-trivial: Hermes Agent markets the same "agent that gets better over time" narrative, has 110K stars 10 weeks post-launch, and ships closed learning loop with prompt memory + SQLite FTS5 episodic archive + auto-generated procedural skills. **However, six structural moats remain unaddressed by Hermes:** (1) bitemporal knowledge graph vs flat SQLite FTS5, (2) I/P/B frame model with importance weighting vs undifferentiated text, (3) MPEG-4 frame compression + wiki compiler (neither in Hermes), (4) modular Apache 2.0 npm packages vs Hermes monolithic distribution, (5) EU AI Act audit triggers built-in vs not addressed, (6) **peer-reviewed-style benchmark portfolio (LoCoMo apples-to-apples, GEPA cross-family, forthcoming Gaia2 + τ³-bench banking_knowledge) vs Hermes internal "40% speedup" only — this is the unbridgeable credibility moat for 2026.** Probability Hermes engages public benchmark venue u 2026: ~30%. Probability Hermes builds bitemporal-style memory: low (architectural rewrite). Probability Hermes targets regulated industries: low (Apache hobbyist/dev market, no compliance positioning). Mitigation per `strategy/competitive/2026-04-30-hermes-agent-intel-update.md` §3: explicit differentiator messaging Day 0, head-to-head Gaia2 framing weeks 4-8, τ³-bench banking_knowledge framing weeks 8-12.

---

## 4. Positioning Taglines (5 options)

1. **"Your AI's memory. One file. Zero cloud."**
   Minimalist, defensible, true. Owns the local-first quadrant in one line.

2. **"I, P, B — the only memory system that knows the difference between a fact, a guess, and a correction."**
   Leads with the epistemology moat. Honest about what the I/P/B model buys you.

3. **"The memory layer for Claude Code, Codex, and Hermes — not for someone else's cloud."**
   Targets the developer-MCP wedge directly; pits hive-mind against mem0-cloud and Supermemory-cloud.

4. **"SQLite in. Wiki out. Apache-2.0 all the way through."**
   Honest-engineering vibe; contrasts with AGPL (Basic Memory) and proprietary cloud (Zep, OpenAI).

5. **"Graphiti-grade knowledge graph. Without the Neo4j. Without the bill."**
   Directly attacks the graph leader's weakness (operational heaviness, cloud pricing).

---

## 5. Bottom Line

hive-mind's defensible position in the 2026 market is **local-first + graph + opinionated epistemology + MCP-native + peer-reviewed-style benchmark portfolio** — a quadrant currently contested only by Cognee (heavier, cloud-LLM-leaning) and Basic Memory (flat, AGPL, no graph). The market's benchmark arms race is noisy and partially discredited (Zep/mem0 dispute), but visibility still requires *a* number. Shipping a published LoCoMo/LongMemEval figure, aligning narratively with Anthropic's Memory Tool spec, and owning the "AI coding agent memory without the cloud" wedge are the three highest-leverage moves.

**Updated 2026-05-02 — Hermes Agent (Nous Research) consideration:** A new direct competitor in the local-first OSS knowledge worker agent space launched 25 February 2026 and has 110K GitHub stars 10 weeks in. Hermes Agent markets the same "self-improving agent" narrative as Waggle but ships flat SQLite FTS5 (vs hive-mind bitemporal graph), undifferentiated text storage (vs I/P/B framing), no benchmark engagement beyond internal "40% speedup" claim, and no regulatory positioning. Hermes Agent **does not architecturally compete in hive-mind's quadrant** but it does compete for the same buyer through narrative overlap. The defensible response is the **peer-reviewed-style benchmark portfolio** (LoCoMo apples-to-apples + GEPA cross-family + forthcoming Gaia2 + τ³-bench banking_knowledge) — that is the moat Hermes cannot match in 2026. All Day 0 launch messaging must explicitly include the six differentiators per `strategy/competitive/2026-04-30-hermes-agent-intel-update.md` §2.

---

## Sources

- mem0: [mem0.ai/research](https://mem0.ai/research), [mem0.ai/pricing](https://mem0.ai/pricing), [arxiv 2504.19413](https://arxiv.org/abs/2504.19413)
- Letta: [letta.com](https://letta.com/), [docs.letta.com/concepts/memgpt](https://docs.letta.com/concepts/memgpt/)
- Zep / Graphiti: [blog.getzep.com](https://blog.getzep.com/graphiti-hits-20k-stars-mcp-server-1-0/), [getzep.com/pricing](https://www.getzep.com/pricing/), [arxiv 2501.13956](https://arxiv.org/abs/2501.13956), [github.com/getzep/zep-papers/issues/5](https://github.com/getzep/zep-papers/issues/5)
- Cognee: [cognee.ai/blog/deep-dives/ai-memory-tools-evaluation](https://www.cognee.ai/blog/deep-dives/ai-memory-tools-evaluation), [docs.cognee.ai/core-concepts](https://docs.cognee.ai/core-concepts)
- Supermemory: [supermemory.ai/pricing](https://supermemory.ai/pricing/), [supermemory.ai/research](https://supermemory.ai/research/)
- LlamaIndex: [developers.llamaindex.ai/python/framework/module_guides/deploying/agents/memory](https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/memory/)
- LangMem: [langchain-ai.github.io/langmem](https://langchain-ai.github.io/langmem/), [blog.langchain.com/langmem-sdk-launch](https://blog.langchain.com/langmem-sdk-launch/)
- OpenAI Memory: [openai.com/index/memory-and-new-controls-for-chatgpt](https://openai.com/index/memory-and-new-controls-for-chatgpt/), [memobase.io/blog/openai-memory](https://www.memobase.io/blog/openai-memory)
- Anthropic Memory Tool: [docs.claude.com/en/docs/agents-and-tools/tool-use/memory-tool](https://docs.claude.com/en/docs/agents-and-tools/tool-use/memory-tool), [anthropic.com/news/context-management](https://www.anthropic.com/news/context-management)
- Basic Memory: [github.com/basicmachines-co/basic-memory](https://github.com/basicmachines-co/basic-memory)
- Hermes Agent (Nous Research, added 2026-05-02): launch reference 25 February 2026; intel update `strategy/competitive/2026-04-30-hermes-agent-intel-update.md`; benchmark portfolio brief `briefs/2026-04-29-benchmark-portfolio-refresh-2026-venues.md` §3.1
- Market context: [mem0.ai/blog/state-of-ai-agent-memory-2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026), [mempalace.tech/blog/best-ai-memory-frameworks-2026](https://www.mempalace.tech/blog/best-ai-memory-frameworks-2026)

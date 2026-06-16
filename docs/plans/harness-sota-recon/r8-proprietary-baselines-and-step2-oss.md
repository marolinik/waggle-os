# R8 — Frontier Baselines, Baseline-Fairness Design, and Step-2 OSS Roster

> External web recon for a publishable benchmark whose claim is: **a small local model
> (Qwen3.6-35B-A3B) wrapped in the Waggle agent harness + Hive memory matches/beats premium
> frontier models running raw.** Date context: **June 2026.** Sources are primary/official where
> possible (model cards, pricing pages, API docs); aggregator/secondary sources are flagged.
>
> **Headline:** All three frontier ids are confirmable as of June 2026 **except Gemini 3.5 Pro**,
> which was announced (Google I/O, 2026-05-19) but is **still in limited Vertex preview with no GA
> and no published Pro pricing** as of mid-June — use **`gemini-3.5-pro-preview`** with an explicit
> uncertainty flag, or fall back to the GA **`gemini-3.1-pro`** if a stable id is required at run time.

---

## 1. Frontier Baseline Roster (verify before each run — ids drift)

| | Claude Opus 4.8 | OpenAI GPT-5.5 | Google Gemini 3.5 Pro |
|---|---|---|---|
| **Exact API id** | `claude-opus-4-8` *(confirmed, Anthropic docs)* | `gpt-5.5` (alias) / snapshot `gpt-5.5-2026-04-23` *(confirmed, OpenAI docs)* | `gemini-3.5-pro-preview` **(UNVERIFIED — preview only; clean GA id `gemini-3.5-pro` not yet shipped)** |
| **Provider endpoint** | Claude API (Messages), Bedrock, Vertex, MS Foundry | OpenAI API (Chat Completions + Responses) | Vertex AI / Gemini API (Model Garden, allowlist) |
| **Input $/1M** | **$5.00** (Fast mode $10.00) | **$5.00** (cached $0.50; Batch/Flex $2.50; Priority $12.50) | **Not published** (3.1 Pro ref: $2.00 ≤200K / $4.00 >200K) |
| **Output $/1M** | **$25.00** (Fast mode $50.00) | **$30.00** (Batch/Flex $15; Priority $75) | **Not published** (3.1 Pro ref: $12.00 ≤200K / $18.00 >200K) |
| **Context window** | **1M** (200K on MS Foundry) | **~1.05M** (922K input / 128K output) | **~2M** (targeted; Flash sibling is 1M) |
| **Max output** | 128K | 128K | not yet documented (Flash-class is large) |
| **Native thinking/reasoning** | **Yes — "adaptive thinking" only.** No budget_tokens (returns 400). Controlled via `effort` = low/medium/high (**default high**). `thinking:{type:"adaptive"}` (off unless set). | **Yes — `reasoning_effort` / `reasoning.effort`** = none/low/medium(default)/high/xhigh | **Yes — "Deep Think"** reasoning (per announcement) |
| **Native agentic/tool mode** | Yes — full tool use, agentic coding (the marquee use case), compaction, mid-conv system messages | Yes — function calling, **built-in computer use, hosted shell, apply-patch, Skills, MCP, web search** | Yes — frontier multimodal + tool use (Vertex agentic) |
| **On OpenRouter?** | **Yes** — `anthropic/claude-opus-4.8` (+ `…-fast`) | **Yes** — `openai/gpt-5.5` | **Not yet** (only `google/gemini-3.5-flash` + `google/gemini-3.1-pro-preview` are on OR as of June 2026) |

**LiteLLM/OpenRouter routability for the harness:** Opus 4.8 and GPT-5.5 route cleanly via OpenRouter
today. **Gemini 3.5 Pro is the gap** — it is not on OpenRouter, so to include it you must route
direct-to-Vertex (allowlist required) or substitute the GA `gemini-3.1-pro-preview` (on OR) and label
the row honestly. Note Opus 4.8 rejects `temperature`/`top_p`/`top_k` (400 error) — the harness must
not send sampling params to it.

**Uncertainty flags:**
- **Gemini 3.5 Pro id + pricing = UNRESOLVED.** Announced 2026-05-19; "GA expected June 2026" but
  mid-June status is limited preview. Google typically ships `*-preview`-suffixed first. **Do not
  hardcode `gemini-3.5-pro`.** Resolve the live id from Vertex Model Garden at run time; if absent,
  use `gemini-3.1-pro` (GA Pro tier) and footnote the substitution.
- GPT-5.5 cached-input ($0.50) and tiered Batch/Flex/Priority pricing are from OpenAI docs +
  aggregators; re-confirm the tier you actually run on.

---

## 2. Baseline-Fairness Decision (the crux)

**The problem.** The whole claim ("small local + harness ≥ frontier raw") lives or dies on *what
"frontier" is allowed to do.* Public agent leaderboards show the **scaffold is worth 30–50 points**
on GAIA and ~comparable swings on SWE-bench — i.e. "model vs model+scaffold" is the single biggest
source of distortion in agent scores. A hostile reviewer's first move is: *"you crippled the frontier
model by denying it the tools you gave Qwen."* The design must pre-empt that.

### The four candidate rows

| Row | What frontier model gets | "We beat them" strength | Win difficulty | Reviewer objection it invites |
|---|---|---|---|---|
| **(a) Frontier RAW** | 1 API call, no tools, no thinking | Weakest ("you handicapped it") | Easiest | "Unfair — no tools/memory; of course harness wins" |
| **(b) RAW + native thinking** | Reasoning on, still no external tools/memory | Moderate | Medium | "Still no tools — apples to oranges" |
| **(c) Frontier in ITS OWN agentic mode** | Native tools + thinking (vendor agent / computer-use / web) | **Strongest** ("genuine parity vs a real frontier agent") | Hardest | Hard to attack; this is the row that *matters* |
| **(d) Frontier in the SAME Waggle harness** | Identical harness + Hive memory; model is the only variable | Strongest for *isolating the model* | n/a (measures model, not system) | None on fairness — this is the controlled experiment |

### Recommendation — report a MATRIX, not a single number

A publishable paper **must** report **multiple rows** and label them with the now-standard taxonomy
(**bare model / vendor-scaffolded / full-system**, and **pass^1 vs pass^k**). Minimum defensible set:

1. **Row (a) — Frontier RAW (bare model, pass^1).** The control. Establishes the floor and isolates
   what the harness/memory contributes. Cheap; always include.
2. **Row (c) — Frontier in its own best agentic mode (vendor-scaffolded, pass^1).** **This is the
   load-bearing row.** It is the only comparison a skeptic respects: "small+harness vs a *real*
   frontier agent." If Qwen+harness matches/beats this, the claim is genuine. Use each vendor's
   native agentic surface (Opus 4.8 agentic tool-use; GPT-5.5 computer-use/MCP/web; Gemini Deep
   Think + Vertex tools).
3. **Row (d) — Frontier swapped INTO the Waggle harness (full-system, model-only variable).** The
   controlled experiment that proves the *harness+memory* (not the model) is the lever. Drop Qwen out,
   drop Opus/GPT/Gemini in, hold everything else fixed. This row also *defends* the whole paper: it
   shows you're not hiding the frontier model's ceiling.
- **Row (b) is optional** — include only if (a)→(b) lift is interesting; otherwise it adds a column
  without adding a defense.

**Why this set survives review (grounded in how the field does it):**
- **SWE-bench / Scale AI's SWE-bench Verified:** the credibility move is *identical scaffolding for
  every model* to "isolate model capability from harness quality." Row (d) is exactly that discipline
  applied to *our* harness — it neutralizes "you tuned the scaffold to Qwen."
- **GAIA / Princeton HAL:** the community explicitly publishes **bare-model, vendor-scaffolded, and
  full-system** as *separate* leaderboards because they "differ by 30 to 50 points." Mirroring that
  three-way split (rows a / c / d) is the recognized honest format.
- **tau²-bench / "Science of Agent Reliability":** report **pass^1 vs pass^k** explicitly; a score
  without that label "is meaningless." Pick **pass^1** as headline (single-shot, the realistic claim)
  and optionally pass^k as a robustness column.

**Labeling rules so a hostile reviewer can't cry foul:**
- Name every row's tier: *(bare model)* / *(vendor agentic, native tools)* / *(Waggle harness, model
  swapped)*. Never present a single "Qwen+harness vs Opus" number without saying which tier Opus is in.
- State tools/thinking budget per row in a footnote (e.g., "Opus 4.8: effort=high, native tools on").
- Use **pass^1** as the primary metric; disclose k and seeds.
- **If GAIA/web-tool tasks are in scope, flag leaderboard-answer contamination** of the open web
  (a known score-inflator) and prefer held-out or contamination-checked task subsets.
- Disclose cost per row (§4) — a frontier agentic run (row c) is far pricier than Qwen-local, which is
  itself part of the story.

**Bottom line crux answer:** publish **rows (a) + (c) + (d)** as the mandatory set, **pass^1**,
with the bare/vendor-scaffolded/full-system labels. Row (c) is the claim; row (d) is the proof the
harness is the lever; row (a) is the floor.

---

## 3. Step-2 OSS Roster (latest large open-weight models, June 2026)

To strengthen the claim later ("not just one cherry-picked small model"). Grouped by runnability.

### Small / local-runnable (single workstation or 1–2 GPUs)

| Model | Total / active params | License | Context | Runnable where | Approx cost |
|---|---|---|---|---|---|
| **Qwen3.6-35B-A3B** *(the subject)* | 35B / **3B active** (MoE) | **Apache 2.0** | 262K (→~1M RoPE) | **Ollama / vLLM local**, OpenRouter | local ≈ $0; OR cheap |
| **gpt-oss-20b** | 20B (MoE) | **Apache 2.0** | ~128K | Ollama/vLLM local, Groq, OR | ~$0.03 in / $0.14 out; Groq $0.075/$0.30 |
| **Llama 4 Scout** | 400B-class / **17B active**, 16 experts | Meta community (700M MAU caveat) | **10M** (industry-leading) | vLLM (multi-GPU), OR, Together | OR/Together low-mid |
| **Mistral Large 3 (2512)** *(borderline — needs real GPU)* | 675B / **41B active** (MoE) | **Apache 2.0** | 262K | vLLM (big GPU), OpenRouter `mistralai/mistral-large-2512` | OR **$0.50 in / $1.50 out** |

### Large (needs cloud or big multi-GPU)

| Model | Total / active params | License | Context | Runnable where | Approx cost ($/1M) |
|---|---|---|---|---|---|
| **DeepSeek V3.2** | 671B / **37B active** (MoE) | **MIT** | ~130K | OpenRouter, Fireworks, Together, self-host (8×H100+) | OR ~**$0.23 in / $0.34 out**; cache-hit input as low as $0.07 |
| **Kimi K2.6** (Moonshot) | **1T** / **32B active** (MoE) | Modified MIT (branding clause >100M MAU / >$20M/mo) | 256K | OpenRouter, NVIDIA NIM, DeepInfra, Kimi API | mid (coding-leader tier) |
| **GLM-5.1** (Z-ai) | 754B / **40B active** (MoE) | **MIT** (clean — enterprise-friendly) | 200K | OpenRouter, NVIDIA NIM, SiliconFlow, vLLM/SGLang self-host | low-mid |
| **gpt-oss-120b** | 120B (MoE) | **Apache 2.0** | ~128K | OpenRouter, Together, Fireworks, Groq, self-host | OR **$0.039 in / $0.18 out**; Together $0.15/$0.60 |
| **Llama 4 Maverick** | 400B / **17B active**, 128 experts | Meta community | 512K | vLLM multi-GPU, OR, Oracle GenAI | low-mid |

**License note for a publishable benchmark:** **Apache 2.0** (Qwen3.6, Mistral Large 3, gpt-oss) and
**MIT** (DeepSeek V3.2, GLM-5.1) are the cleanest for "open weight" claims. Llama 4 is *community
license* (700M-MAU caveat) — call it "open weight, custom license," not "open source." Kimi K2.6 is
*modified MIT* with a branding clause — footnote it.

**Strongest Step-2 set:** add **DeepSeek V3.2 (MIT)**, **GLM-5.1 (MIT)**, and **gpt-oss-120b
(Apache)** as the large open-weight tier, and **gpt-oss-20b** as a second small/local point next to
Qwen3.6. That spans small-local → large-cloud with clean licenses and full OpenRouter routability.

---

## 4. Provider-Cost Reality Check (≈ $/1M tokens) + benchmark-scale gotchas

**Frontier (the rows you must beat):**
- **Opus 4.8:** $5 in / $25 out (Fast $10/$50). Most expensive output. Watch the 400-on-sampling-params
  constraint and that **effort defaults to `high`** (more thinking tokens → higher real cost per task).
- **GPT-5.5:** $5 in / $30 out; **cached input $0.50** (big lever if the harness reuses a system
  prompt); Batch/Flex halve to $2.50/$15 — **use Batch for benchmark-scale runs.**
- **Gemini 3.5 Pro:** **unpriced.** Budget against 3.1 Pro ($2–4 in / $12–18 out, tiered by context)
  as a placeholder and re-confirm at GA.

**OSS (cheap; mostly the point):**
- Qwen3.6-35B-A3B: **~$0 local** (Ollama/vLLM) — only electricity/GPU amortization; OpenRouter cheap.
- gpt-oss-120b: ~$0.04 in / $0.18 out (OR). gpt-oss-20b: ~$0.03 in / $0.14 out.
- DeepSeek V3.2: ~$0.23 in / $0.34 out (OR). Mistral Large 3: $0.50 in / $1.50 out (OR).
- GLM-5.1 / Kimi K2.6: low–mid (re-confirm per provider).

**Rate-limit / availability gotchas for thousands of calls:**
- **Frontier per-model RPM/TPM caps** throttle large sweeps — Opus 4.8 and GPT-5.5 will need tier
  upgrades or queued batching; **GPT-5.5 Batch API** is the right tool (50% off + higher throughput,
  async). Anthropic has a Message Batches path too.
- **Gemini 3.5 Pro is allowlist-gated preview** — may not grant benchmark-scale quota at all in June
  2026; plan around it (substitute 3.1 Pro, or budget extra calendar time for allowlist).
- **Reasoning-mode token blow-up:** Opus `effort=high` and GPT-5.5 `xhigh`/`high` silently multiply
  output tokens (and cost) per task — pin effort per row and log token counts.
- **OpenRouter routing variance:** same id can hit different upstream providers with different latency/
  context caps — pin the provider (or use `provider` routing prefs) for reproducibility, and note that
  **Gemini 3.5 Pro isn't on OR at all** (direct Vertex only).
- **Web-tool contamination (GAIA-class tasks):** open-web answers/walkthroughs inflate scores — prefer
  contamination-checked subsets.

---

## Sources

- Anthropic — What's new in Claude Opus 4.8 (model id, 1M ctx, adaptive thinking, effort=high default, 400-on-sampling): https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-8
- Anthropic — Introducing Claude Opus 4.8: https://www.anthropic.com/news/claude-opus-4-8
- OpenRouter — Claude Opus 4.8 ($5/$25, 1M ctx, slug): https://openrouter.ai/anthropic/claude-opus-4.8
- OpenAI — GPT-5.5 model docs (id, snapshot 2026-04-23, $5/$0.50/$30, 1.05M ctx, reasoning_effort none..xhigh, computer use/MCP/web/shell): https://developers.openai.com/api/docs/models/gpt-5.5
- OpenAI — Using GPT-5.5 (reasoning.effort, Responses vs Chat Completions): https://developers.openai.com/api/docs/guides/latest-model
- OpenRouter — GPT-5.5 ($5/$30, 1M ctx): https://openrouter.ai/openai/gpt-5.5
- Gemini 3.5 Pro June launch / 2M ctx / Deep Think (preview status): https://www.techtimes.com/articles/317919/20260606/google-gemini-35-pro-nears-june-launch-2-million-token-context-deep-think-reasoning.htm
- Gemini 3.5 Pro API access/pricing (preview id caution, allowlist): https://byteiota.com/gemini-35-pro-api-access-pricing-developer-guide/
- Gemini 3.5 Flash + 3.1 Pro pricing reference: https://www.metacto.com/blogs/the-true-cost-of-google-gemini-a-guide-to-api-pricing-and-integration
- OpenRouter compare (Opus 4.8 / GPT-5.5 / Gemini 3.1 Pro Preview — what's actually on OR): https://openrouter.ai/compare/anthropic/claude-opus-4.8/openai/gpt-5.5/google/gemini-3.1-pro-preview
- Qwen3.6-35B-A3B (Apache 2.0, 35B/3B active, 262K→~1M ctx, Ollama): https://qwen.ai/blog?id=qwen3.6-35b-a3b ; vLLM recipe: https://recipes.vllm.ai/Qwen/Qwen3.6-35B-A3B
- DeepSeek V3.2 (671B/37B, MIT, ~130K): https://huggingface.co/deepseek-ai/DeepSeek-V3.2 ; OR pricing: https://openrouter.ai/deepseek/deepseek-v3.2
- Kimi K2.6 (1T/32B, modified-MIT, 256K): https://huggingface.co/moonshotai/Kimi-K2.6 ; license: https://huggingface.co/moonshotai/Kimi-K2.6/blob/main/LICENSE
- GLM-5.1 (754B/40B, MIT, 200K): https://huggingface.co/zai-org/GLM-5.1/blob/main/LICENSE
- Llama 4 Scout/Maverick (17B active; Scout 10M ctx / Maverick 400B-512K; community license): https://ai.meta.com/blog/llama-4-multimodal-intelligence/
- Mistral Large 3 2512 (675B/41B, Apache 2.0, 262K, $0.50/$1.50): https://openrouter.ai/mistralai/mistral-large-2512
- gpt-oss-120b (Apache 2.0, $0.039/$0.18 OR): https://openrouter.ai/openai/gpt-oss-120b ; pricing roundup: https://pricepertoken.com/pricing-page/model/openai-gpt-oss-120b
- SWE-bench scaffold-vs-model + Scale identical-scaffolding methodology: https://www.codeant.ai/blogs/swe-bench-scores ; Live-SWE-agent (scaffold worth ~points): https://agentmarketcap.ai/blog/2026/04/11/live-swe-agent-open-source-scaffold-swe-bench-2026
- GAIA bare/vendor/full-system 30–50pt split + HAL scaffold gap: https://arxiv.org/pdf/2510.11977 (Holistic Agent Leaderboard)
- tau²-bench / pass^1 vs pass^k reporting + web contamination: https://github.com/sierra-research/tau2-bench ; https://arxiv.org/pdf/2602.16666 (Towards a Science of AI Agent Reliability)

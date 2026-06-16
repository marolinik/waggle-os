# Harness SOTA Recon — Model Roster + Cost Feasibility

**Author:** research agent (Claude Opus 4.8, 1M ctx)
**Date:** 2026-06-16
**Scope:** Feasibility of a benchmark that runs MANY models × conditions × N tasks. Reconcile the canonical OSS subject model, scope the work to add the premium `claude-opus-4-8` target, propose a credible OSS roster for the "couple more open-source models" claim, and build a cost model that gates the design.

> **Timeline note (read first).** This repo lives in a self-consistent "2026" timeline that uses model
> names one generation ahead of my training data: `Qwen3.6-35B-A3B`, `claude-opus-4-8`, `gpt-5.4`,
> `gemini-3.1-pro`, `grok-4.20`, `MiniMax-M2.7`, `DeepSeek V4`, `kimi-k2.6`. I treat the repo's own files
> as authoritative for *what the project intends*, and ground real-world pricing / architecture facts with
> live web lookups where the named version is fictional. Where a number is from a fictional version, I flag
> it; where it's a real measured cost from the repo's own benchmark logs, I cite the file:line.

---

## 1. Canonical OSS model identity — RECONCILED

### The conflict
- **Config / locked decision:** `Qwen3.6-35B-A3B` = **35B total parameters / 3B active (MoE)**.
  - `benchmarks/harness/config/models.json:2-11` — key `qwen3.6-35b-a3b`, displayName "Qwen3.6-35B-A3B (canonical)".
  - `litellm-config.yaml:345-358` — "Qwen3.6-35B-A3B LOCKED decision (2026-04-19) … 35B total / 3B active MoE, Apache-2.0, 262K native / 1M YaRN."
  - `docs/decisions/2026-04-19-target-model-qwen35b-locked.md:1-43` — the LOCKED decision, "VERIFIED 2026-04-19 via HF model card", architecture "35B total / 3B active MoE (8 routed + 1 shared expert from 256 total)", Apache-2.0, 262,144 native / 1,010,000 YaRN, thinking default ON.
- **Founder said "Qwen 3.6 27B".**

### The truth
**There is no 27B dense Qwen variant in this stack, and none is referenced anywhere in config or the locked decision.** The "27B" framing is a stale/loose recollection that traces to **Qwen *3.5* 27B**, which appears ONLY in product-narrative docs, never in the benchmark config:
- `docs/product-analysis/FOUNDER-REVIEW-V2.md:92` — "Small sovereign models (**Qwen 3.5 27B**) + EvolveSchema + deep Waggle memory…"
- `docs/product-analysis/FOUNDER-REVIEW-V2.md:192` — "Enterprise customers running **Qwen 3.5 27B** (sovereign, on LM TEK hardware)…"
- `docs/WAGGLE_USER_TEST_PROTOCOL.md:27` — "LLM konfigurisan (**Qwen 27B** ili Claude API key spreman)".

The actual canonical subject model — locked 2026-04-19, used as `--model-primary` default in the runner
(`benchmarks/harness/scripts/run-v8.ts:26,178`), and the model that produced every real benchmark number to
date — is **`Qwen3.6-35B-A3B`: 35 B total parameters, 3 B active per token (MoE), Apache-2.0**. It explicitly
**supersedes** the earlier KVARK-locked `Qwen3-30B-A3B-Thinking` and the `Gemma 4 31B` backlog default
(decision doc lines 6-9). The "30B-A3B" predecessor and the "27B" product-narrative number are both
**superseded / informal**, not the benchmark subject.

> **Recommendation:** Publish the model as **"Qwen3.6-35B-A3B (35 B total / 3 B active, MoE, Apache-2.0)"**.
> Never write "27B" in a benchmark artifact — a skeptical reviewer who finds "35B-A3B" in the config and
> "27B" in the copy will (correctly) treat it as a sloppiness signal that undermines the whole table. If the
> founder wants a "27B-class" framing for marketing, the honest phrasing is "**3 B active parameters** — the
> compute footprint of a ~3B dense model" (that, not 27B, is the defensible small-model story, and it matches
> the locked decision's own repositioning at `2026-04-19-...md:50`).

### Real-world caveat (publishability)
"Qwen3.6-35B-A3B" is a **fictional-timeline version**. The real, citable Qwen MoE in the 30B-class as of my
knowledge is **Qwen3-30B-A3B (30 B total / 3 B active, Apache-2.0)**. Whoever finalizes the paper must
confirm the *exact released checkpoint name + HF URL + license* at publish time, because the config's HF URL
(`https://huggingface.co/Qwen/Qwen3.6-35B-A3B`, decision doc line 4) is asserted but not independently
re-verifiable from inside this environment. **Flag in risks.**

### Routing reality for the canonical model (important for fairness)
The model is served three different ways depending on alias — and **one of them silently regresses a full
minor version**:
| Alias (models.json) | Route (litellm-config.yaml) | Reality |
|---|---|---|
| `qwen3.6-35b-a3b` (canonical) | `:211-215` → `openai/qwen3.6-35b-a3b` @ DashScope-intl, `DASHSCOPE_API_KEY` | **TRUE 3.6** |
| `qwen3.6-35b-a3b-via-dashscope-direct` | `:238-245` → same, `max_tokens:16000` + `enable_thinking:true` | TRUE 3.6, thinking forced on |
| `qwen3.6-35b-a3b-via-openrouter` | `:252-255` → `openrouter/qwen/qwen3.5-35b-a3b` | **SILENTLY 3.5** (one-minor regress; see models.json:43, litellm:247-251) |
| `qwen3.6-35b-a3b-local` | models.json:61-71 → `openai/qwen3.6-35b-a3b`, provider `local`, **$0/M** | local vLLM, price 0 |

**Publishability risk:** if any cell accidentally runs the `-via-openrouter` alias, the headline model is
actually Qwen 3.5, not 3.6. The pre-registration must pin the **DashScope-direct** (or local-vLLM) alias and
record it per-row. The harness already records `model_pinning_surface` per JSONL row
(`run-v8.ts:397-400`) — good — but every Qwen alias is `floating_alias` (no immutable snapshot), so the
exact checkpoint is **not** reproducible from the artifact alone. This is the single biggest reproducibility
hole in the Qwen arm.

### How Qwen is run locally (the runbook)
`D:/Projects/waggle-os-gaia2-wt/benchmarks/gaia2/PILLAR1-QWEN-LOCAL-RUNBOOK.md`:
- **Originally scaffolded local-Ollama**, then **PIVOTED 2026-05-26 to API-served via LiteLLM → DashScope-intl
  direct** (runbook §"2026-05-26 PIVOT", lines 6-10). Reasons: LiteLLM proxy already holds creds; DashScope
  gives TRUE 3.6 (OpenRouter regresses to 3.5); routing both agent + judge through one proxy removes the
  gateway confound.
- The single-knob env contract (runbook lines 30-40): `MODEL=qwen3.6-35b-a3b`,
  `BASE_URL=http://host.docker.internal:4000/v1` (LiteLLM), `API_KEY=sk-waggle-dev` (LiteLLM master key).
- **Sovereign-local variant is preserved but optional** (runbook lines 194-209): swap `[agent]` to
  `base_url=http://host.docker.internal:11434/v1` (Ollama), `model=qwen2.5:32b` (TODO: confirm the exact
  Ollama tag for 3.6 — the runbook itself flags this as a `FIXME`), `concurrency=1` (single GPU serializes →
  wall time 3-15 h vs 3-5 h API), agent cost **$0**, judge unchanged (~$2 in-container Sonnet).
- The locked decision gives the production vLLM serve line (decision doc line 35):
  `vllm serve Qwen/Qwen3.6-35B-A3B --port 8000 --tensor-parallel-size 8 --max-model-len 262144
  --reasoning-parser qwen3` (targets LM TEK H200 × 8).
- `WAGGLE_SKIP_LITELLM`: a **product runtime** flag (sidecar uses Anthropic-proxy directly when set —
  `packages/server/src/local/service.ts:300`, `app/src-tauri/src/service.rs:103`, `render.yaml:26`,
  `docker-compose.production.yml:39`). It is **NOT** a benchmark flag — the harness always talks to LiteLLM
  (`run-v8.ts:654` `LITELLM_URL` default `http://localhost:4000`). Don't conflate the two.

---

## 2. Adding `claude-opus-4-8` as the premium target

### Current state (verified)
- **NOT in `litellm-config.yaml`.** Only `claude-opus-4-6` (`:14-17`, `:36-39`) and `claude-opus-4-7`
  (`:318-321`, plus OpenRouter bridge `:110-113`) exist. There is no `claude-opus-4-8` route. (grep confirmed.)
- **NOT in `models.json`.** Strong-model entries present are `claude-opus-4-6` (`:83-93`) and
  `claude-opus-4-7` (`:94-105`). No `claude-opus-4-8`.
- **The runner already EXPECTS it.** `run-v8.ts:645` auto-resolves the strong model as
  `allModels['claude-opus-4-x'] ?? allModels['claude-opus-4-8']`, and `:649` warns
  "No strong model found in models.json (tried claude-opus-4-x, claude-opus-4-8)". So the id is already wired
  as the intended fallback — it just has no backing route or registry entry. The GAIA-2 prereg uses the
  placeholder alias `claude-opus-4-x` (manifest-v8-gaia2-preregistration.yaml:123,182,203,211) "exact alias
  pinned at Phase 1" — `claude-opus-4-8` is the natural pin.
- **`cost-tracker.ts` (`packages/agent/src/cost-tracker.ts:23-30`) only knows** sonnet-4-6, haiku-3-5,
  opus-4-6 (and a couple legacy ids). No opus-4-7, no opus-4-8. (Note: this is the *product* cost tracker;
  the *benchmark* harness computes cost from `models.json` pricing inside `llm.ts:259-261`, NOT from
  cost-tracker.ts. They are separate code paths — both need the pricing to be correct, but the benchmark's
  number comes from models.json.)

### Real-world pricing (web-verified, 2026 timeline)
Multiple 2026 pricing trackers agree: **Claude Opus 4.8 (released May 28, 2026) = $5.00 / MTok input,
$25.00 / MTok output** (standard), with a "Fast Mode" at $10/$50. (Sources: metacto.com, cloudzero.com,
finout.io, evolink.ai — see Sources.) This is a **3× drop from the Opus 4.6/4.7 list price of $15/$75** that
the current registry encodes (`models.json:88-89`, `:99-100`). **Do not copy the 4.6 pricing forward.**

> Caveat: these are third-party trackers in the fictional timeline; the canonical source is the Anthropic
> docs / `claude-api` skill. Confirm $5/$25 against the official price page before locking the manifest.

### Exact changes needed to add `claude-opus-4-8`

**(a) `litellm-config.yaml`** — add a native Anthropic route (mirror the 4-7 block at `:318-321`):
```yaml
  - model_name: claude-opus-4-8
    litellm_params:
      model: anthropic/claude-opus-4-8
      api_key: os.environ/ANTHROPIC_API_KEY
```
Optionally an OpenRouter bridge (`openrouter/anthropic/claude-opus-4.8`) as failover, mirroring `:110-113`.

**(b) `benchmarks/harness/config/models.json`** — add an entry (mirror `claude-opus-4-7` at `:94-105`):
```json
  "claude-opus-4-8": {
    "id": "claude-opus-4-8",
    "displayName": "Claude Opus 4.8 (premium frontier strong-model target)",
    "provider": "anthropic",
    "litellmModel": "claude-opus-4-8",
    "pricePerMillionInput": 5.0,
    "pricePerMillionOutput": 25.0,
    "contextWindow": 1000000,
    "pinning_surface": "anthropic_immutable",
    "pinning_surface_carve_out_reason": null
  }
```
- `pricePerMillionInput/Output` = **5.0 / 25.0** (web-verified), NOT 15/75.
- `pinning_surface: "anthropic_immutable"` + `carve_out_reason: null` — REQUIRED, else
  `models-config.test.ts:88-100` fails (anthropic-immutable entries must have null carve-out, and
  `:102-117` requires every floating_alias to cite "B3 addendum"). Anthropic gives immutable dated snapshots,
  so `anthropic_immutable` is correct and exempts you from the B3 grep requirement.
- `contextWindow: 1000000` — Opus 4.8 supports 1M context at flat rate (web-verified); 4.6/4.7 entries say
  200000 but 4.8 is the 1M-ctx model. (If you want strict parity with the 4.6/4.7 rows use 200000; for the
  premium arm 1M is the honest number.)
- **No `judge_role`** if it's a subject model. (If you ALSO use it as a judge, the prereg's vendor-circularity
  guard matters — see §5 risks.)

**(c) Optionally `packages/agent/src/cost-tracker.ts:23-30`** — add
`'claude-opus-4-8': { inputPer1k: 0.005, outputPer1k: 0.025 }` (and ideally `claude-opus-4-7`). This is the
PRODUCT cost path; the benchmark does NOT read it, so it's not required for the benchmark to cost correctly,
but it should be done for product-side accuracy and to avoid the silent Sonnet-pricing fallback at
`cost-tracker.ts:98-100`.

**(d) Tests.** `models-config.test.ts` does not hard-require a `claude-opus-4-8` key, so adding the entry
won't break existing tests as long as the pinning fields are correct. The 4 required judges
(`:40`) are opus-4-7/gpt-5.4/gemini-3.1/grok-4.20 — unchanged.

**(e) Smoke before spend.** `run-v8.ts:678-693` runs `preCellHealthCheck` against `primaryModel.litellmModel`
+ judge models before spending budget. Add a one-call smoke against `claude-opus-4-8` via the LiteLLM proxy
(`/v1/chat/completions`) to confirm the alias resolves (the repo has a documented history of speculative
dated suffixes 404-ing — e.g. litellm comments at `:316-317`, `:5-7`). Confirm the plain alias
`claude-opus-4-8` resolves (not a dated `-2026xxxx` suffix).

---

## 3. Candidate OSS roster for "a couple more open-source models"

The central published claim is **"substrate > model"** (manifest-v8.1 §1, lines 47-51): the I/P/B memory
substrate matters more than which subject model you pick. To support that claim credibly you want **2-3
additional open-weight subject models spanning a size/architecture range**, all Apache-2.0-or-similar
(sovereignty story), all runnable either locally or via a cheap API. The repo already has a `provider:"local"`
convention (`models.json:61-82`) and an Ollama path, so local is first-class.

### Recommended roster (in priority order)

| Model | Size (total/active) | License | In-stack route TODAY | Approx $/M (in/out) | Local-runnable | Notes |
|---|---|---|---|---|---|---|
| **Qwen3.6-35B-A3B** (canonical) | 35B / 3B MoE | Apache-2.0 | ✅ DashScope-intl (`litellm:211`); local vLLM entry exists (`models.json:61`) | $0.20 / $0.80 (config) | ✅ vLLM/Ollama (1×H100/H200) | The anchor. Already run. |
| **DeepSeek V3 / V3.2** (or repo's "V4") | 671B / 37B MoE | MIT (V3) | ➕ add OpenRouter `deepseek/deepseek-chat` (LiteLLM `deepseek-chat` exists `:82-85`) | V3 **$0.20/$0.80**; V3.2 **$0.23/$0.34** (OpenRouter, web-verified) | ⚠️ huge — API-only realistically | Strong, cheap, different lab. Repo's `deepseek-reasoner` also wired (`:87-90`). **Caveat:** repo's judge probes disqualified DeepSeek as a *judge* for GPT-alignment (docs/decisions/2026-04-24-pm-correctness-reanalysis-memo.md) — that's a JUDGE finding, irrelevant to using it as a SUBJECT. |
| **gpt-oss-120b** | 117B / 5.1B MoE | Apache-2.0 | ➕ add OpenRouter `openai/gpt-oss-120b` | **Free tier on OpenRouter** (rate-limited 20rpm/200rpd); paid hosts ~$0.10-0.50 | ✅ needs ~80GB GPU (1×H100) | OpenAI open-weight; o4-mini-class (web-verified arXiv:2508.10925). Architecturally distinct (OpenAI lineage). Strong diversity pick. |
| **gpt-oss-20b** | 21B / 3.6B MoE | Apache-2.0 | ➕ add OpenRouter `openai/gpt-oss-20b` | free/very cheap | ✅ **runs on a 16GB laptop** | The "anyone can self-host" floor. Great sovereignty story. |
| **Llama 3.3 70B Instruct** | 70B dense | Llama Community License | ➕ add OpenRouter `meta-llama/llama-3.3-70b-instruct` (a `llama-3.1-8b-instruct` local placeholder exists `models.json:72`) | **$0.32-1.00/M out** varies by host; **free tier exists** (web-verified) | ✅ dense 70B (2×A100/H100) | Dense baseline (contrast to all the MoEs). **License is NOT Apache** — weaker sovereignty story; note it. Also it's the prereg's BEAM/GAIA judge (`manifest-v8.1:111,133`) — using it as a subject too is fine but document the dual role. |
| **Mistral Large** | 123B dense | Mistral Research / commercial | `mistral-large-latest` already wired (`litellm:264-267`) | ~$2/$6 (Mistral API, was higher) | ⚠️ 123B dense, heavy | EU lab; commercial license (not open-weight in the sovereign sense). Lower priority — keep as optional. |

### My pick for "a couple more" (the defensible minimum)
**Two additions:** `gpt-oss-120b` + `DeepSeek-V3`. Rationale:
1. **Architecture/lineage diversity** — Qwen (Alibaba) + gpt-oss (OpenAI open) + DeepSeek (DeepSeek) are three
   independent training lineages and three sizes (35B-A3B / 117B-A5B / 671B-A37B). That spread is exactly
   what makes "substrate > model" credible: if memory lifts all three by a similar margin, the claim holds
   across the size axis.
2. **Both are cheap-to-free** via OpenRouter and both are Apache-2.0 (gpt-oss) / MIT (DeepSeek) — clean
   sovereignty + commercial story.
3. **gpt-oss-20b** as an optional **third** add gives the "runs on a laptop" floor — high marketing value,
   trivial cost.

**Avoid** for the headline OSS arm: Mistral Large (commercial license dilutes sovereignty), Llama-70B *as a
subject if it's also the judge* (dual-role optics), and anything routed via the `-via-openrouter` Qwen alias
(silent 3.5 regress).

> **Each addition is the same 4-step change as §2(a-d):** LiteLLM route + models.json entry (with correct
> pricing + `pinning_surface:"floating_alias"` + a `carve_out_reason` string containing "B3 addendum" to
> satisfy `models-config.test.ts:102-117`) + optional cost-tracker entry + health-check smoke.

---

## 4. Cost model — the gate

### 4.1 What "conditions" and "N" are in THIS harness
- **Conditions (cells) per track:** `no-context` / `retrieval` / `hive_mind_ipb` / `hive_mind_ipb_strong`
  (`run-v8.ts:108-116,539-546`). The first three run on the **subject** model; `hive_mind_ipb_strong` runs
  the **strong** model (Opus). So a "full grid" for ONE subject model = **3 subject cells + 1 strong cell**.
- **Per additional OSS subject model:** you add its 3 cells (no-context/retrieval/ipb). The strong (Opus)
  cell is run **once** per track, not per subject (it's the architectural-ceiling reference). So the grid is
  **(#subjects × 3) + 1 strong**, per track.
- **N per track (real):**
  - LongMemEval V1 S-variant: **500 questions** (`datasets.json:16`, `v8-phase1-report.md:10`).
  - BEAM 128K: **400 instances** (20 conv × 20 abilities-balanced; `v8-phase1-report.md:42`); the
    matched-subset analysis used **259** (`:45-51`). Manifest scopes the CR/KU/IF subset at **N≈200-300**
    (`manifest-v8.1:140,164`).
  - GAIA 2 (when wired): **~N=160** per split, 2 splits (`v8-phase1-report.md:92`).

### 4.2 Real measured token/cost anchors (from the repo's OWN runs — this is the gold)
These beat any a-priori token estimate because they are wire-actual:
| Run | N × cells | Subject | Measured cost | Source |
|---|---|---|---|---|
| LongMemEval V1, 3 cells, full | 500 × 3 | Qwen3.6 | **$2.29** total | `v8-phase1-report.md:12` |
| BEAM 128K, judged | ~400 × 3 + Haiku judge | Qwen3.6 | within $50 halt; manifest est. $26-37 | `v8-phase1-report.md:35-51`, `manifest-v8.1:161-169` |
| GAIA 2 ARE-native, N=160 | 160 | Qwen3.6/Sonnet | **$5-8 + $3-4 rejudge** (~$0.03-0.05/scenario) | `v8-phase1-report.md:83` |
| GAIA 2 smoke (1 scenario) | 1 | Qwen3.6 | **~$0.05** | runbook line 22, `v8-phase1-report.md:83` |
| GAIA 2 narrow-proxy (ABANDONED) | per scenario | — | **$4.09/invocation** (9-31× over) | `v8-phase1-report.md:80-82` |

**Key insight from the anchors:** the QA/memory tracks (LongMemEval, BEAM) are **cheap** — a full 500-question
× 3-cell Qwen pass was **$2.29**. The expensive variable is (a) the **strong Opus cell** and (b) **agentic
GAIA-2-style multi-step tasks** where input tokens explode (the abandoned proxy hit $4.09/invocation; even the
good path is $0.03-0.05/scenario, ~100× the QA cost-per-item).

### 4.3 Per-item cost from first principles (sanity-check + for new models)
Cost/item = `(in_tok/1e6 × $in) + (out_tok/1e6 × $out)`. Realistic agentic/long-context token counts:
- **QA / memory recall (LongMemEval, BEAM 128K-tier):** the cell injects retrieved context, not the full
  128K haystack — so input ≈ **3-8K tok** (retrieved frames + question + system), output ≈ **0.3-0.6K**
  (capped at 600 default, `llm.ts:182`). This matches the $2.29/1500-call observation:
  $2.29 / 1500 ≈ **$0.0015/call** at Qwen $0.20/$0.80 → ~6K in + ~0.4K out. ✅ consistent.
- **Full-context (no-RAG) BEAM:** if a cell feeds the whole 128K haystack, input = 128K tok → at Qwen
  $0.20/M = **$0.026/call input alone**; at Opus $5/M = **$0.64/call**. **This is the cost cliff** — feeding
  full haystacks to Opus is ~400× the RAG cost. The harness design (RAG cells) avoids this; any "full-context
  baseline" cell must be budgeted separately and ideally run on the cheap subject only.
- **Agentic (GAIA 2):** multi-turn, ~$0.03-0.05/scenario on Qwen (measured). On Opus that scales ~25× by
  price ratio ($5/$25 vs $0.20/$0.80) → **~$0.75-1.25/scenario** — the dominant line item if Opus runs the
  agentic track.

### 4.4 Cost model for the FULL proposed benchmark

**Assumptions:** 3 OSS subjects (Qwen3.6-35B-A3B, gpt-oss-120b, DeepSeek-V3) + 1 premium strong (Opus 4.8).
Tracks = LongMemEval (500) + BEAM-128K (~300 scored) [+ GAIA-2 (320 = 160×2 splits) IF wired]. Grid per track
= (3 subjects × 3 cells) + 1 Opus strong cell. Judge = Haiku/Llama-70B soft judge on scored items.

**Track A0 — LongMemEval (500q):**
- 3 subjects × 3 cells × 500 × ~$0.0015/item (Qwen-class; gpt-oss/DeepSeek similar $0.20/$0.80-ish) ≈
  9 × 500 × $0.0015 = **$6.75**.
- Opus strong cell: 500 × ~$0.04/item (25× Qwen) ≈ **$20** (this single cell ≈ 3× all OSS cells combined).
- Judge (Haiku, bounded excerpt, ~$1/$5, ~2K in/0.1K out → ~$0.0025/item) × items judged (~4 cells × 500) ≈
  **$5**.
- **A0 subtotal ≈ $32.** (Repo's single-subject 3-cell run was $2.29, so 3 subjects ≈ $7 — checks out; Opus
  + judge are the adders.)

**Track A — BEAM-128K (~300 scored, RAG cells):**
- 3 subjects × 3 cells × 300 × ~$0.002 ≈ **$5.4**.
- Opus strong cell: 300 × ~$0.05 ≈ **$15** (manifest est. $15-20 for the Opus cell, `:166`).
- Judge: 4 cells × 300 × ~$0.0025 ≈ **$3**.
- **A subtotal ≈ $23.** (Manifest's own $26-37 envelope, `:167`.)

**Track B — GAIA 2 (320 scenarios, IF wired) — the expensive one:**
- 3 subjects × 3 cells × 320 × ~$0.04/scenario (agentic) ≈ **$115**.
- Opus strong cell: 320 × ~$1.00/scenario ≈ **$320** (!!).
- Trio-rejudge: ~$3-4/160 × 2 splits × cells ≈ **~$15**.
- **B subtotal ≈ $450** if Opus runs the full agentic grid. **This is the cost driver, by an order of
  magnitude.** (The abandoned narrow-proxy path would have been ~$163/sweep for ONE config — the ARE-native
  path is the only viable one, and even it is dominated by Opus × agentic.)

**Programme totals:**
| Scope | Estimated cost |
|---|---|
| **Memory tracks only (A0 + A), 3 OSS + Opus + judge** | **~$55** |
| **+ GAIA 2 with Opus on the full agentic grid** | **~$505** |
| **+ GAIA 2 but Opus strong cell ONLY on the cheap split / capped N** | **~$120-150** |
| Memory tracks, OSS-only (NO Opus, NO GAIA) | **~$17** |

### 4.5 The cost driver + cheapest credible design
- **Cost driver #1: the premium Opus cell on the agentic (GAIA 2) track.** A single Opus × 320-scenario
  agentic cell (~$320) costs more than the entire rest of the programme combined. Opus is 25× the per-token
  price of the OSS models AND agentic tasks are ~25-50× the token volume of QA tasks — those two multipliers
  compound.
- **Cost driver #2 (latent): any full-128K-context cell on Opus** (~$0.64/call) — avoid; keep all cells RAG.

**Cheapest credible design (recommended):**
1. **Run all OSS subject arms locally / on cheap APIs.** Qwen + gpt-oss-120b on local vLLM (1×H100) = **$0
   agent-side**; DeepSeek-V3 via OpenRouter at $0.20/$0.80 (or free tier). The whole OSS arm of A0+A is
   **<$15**, effectively a rounding error.
2. **Use the premium Opus 4.8 cell ONLY where the claim needs it** — i.e. the `hive_mind_ipb_strong`
   "substrate-is-the-moat" reference (S_B3, `manifest-v8.1:147`): show that *with memory*, the small OSS model
   ≈ Opus (the LoCoMo "Qwen 73.4% ≈ Opus 73.1%" story, `manifest-v8.1:352`). That needs Opus on the
   **memory tracks** (cheap: ~$35 total), **not** on the full GAIA agentic grid.
3. **On GAIA 2, run Opus strong on a capped N (e.g. 80) or only the cheaper split**, not the full 320. Drops
   the Opus-agentic line from ~$320 to ~$80.
4. **Judge with Haiku-4.5 / Llama-3.3-70B** (already the plan) — soft judge on bounded excerpts, never the
   full haystack (`v8-phase1-report.md:43`). ~$8 across both memory tracks.
5. **Keep the $50/track hard halts** (`run-v8.ts:105-106`, manifest `:169,261`). They already exist and
   already fired correctly in past runs.

**Result:** a **publishable multi-model × multi-condition benchmark on the memory tracks (LongMemEval + BEAM)
across 3 OSS subjects + Opus 4.8 ceiling + soft judge lands at ~$55**, well inside the existing $195
programme envelope (`manifest-v8.1:408`). Adding GAIA 2 with a **capped Opus cell** brings it to ~$120-150.
The only way the number blows past $500 is running Opus on the full agentic grid — which the claim does not
require.

---

## 5. Risks / gaps a skeptical reviewer would attack
1. **Fictional model versions.** Qwen3.6-35B-A3B, Opus 4.8 ($5/$25), gpt-5.4, DeepSeek V4 etc. are
   next-gen names in this repo's timeline. Pricing/architecture I web-verified are for the *named* 2026
   versions via third-party trackers, not the canonical vendor pages — confirm at publish time.
2. **Qwen alias provenance is not snapshot-pinned.** All Qwen aliases are `floating_alias` (DashScope exposes
   no immutable snapshot). The exact checkpoint behind a run is NOT reproducible from the JSONL alone. A
   reviewer can say "which Qwen exactly?" — and the honest answer is "the DashScope-intl alias on date X."
   The `-via-openrouter` alias silently serves **3.5** — a real foot-gun that already caused a documented 0/15
   smoke failure (litellm:233-237). Pin DashScope-direct or local-vLLM and record it per row.
3. **"27B" vs "35B-A3B".** Founder's "27B" is not the benchmark model. If any launch copy says 27B while the
   config says 35B-A3B, that's an immediate credibility hit. (§1.)
4. **The headline I/P/B claim is shakier than the memory claim.** The repo's OWN data: on LongMemEval,
   `hive_mind_ipb` is *below* plain `retrieval` on nearly every split (`v8-phase1-report.md:17-27`); on BEAM
   it's +8.9pp but the pre-registered "contradiction_resolution proving ground" scored **0% in every cell**
   (`:56-61`) — a base-model ceiling, not a substrate win. The defensible claim is "memory ≫ no-memory" and
   "I/P/B helps on multi-step memory tasks (abstention/info-extraction/multi-session), not flat fact-lookup."
   Pre-register accordingly; don't over-claim CR.
5. **GAIA 2 memory ablation is NOT wired.** The substrate is not connected to the ARE worker
   (`v8-phase1-report.md:89-93`); only the Pillar-1 *harness* number exists. Any GAIA-2 memory claim needs
   real engineering first, and that's where the cost risk lives.
6. **Judge cost + vendor-circularity.** The prereg deliberately excludes Anthropic from the judge ensemble to
   avoid same-family bias (decision doc line 49, methodology-doc-FINAL.md). If Opus 4.8 is BOTH the strong
   subject AND a judge, that guard is violated. Keep Opus as subject-only; judge with Haiku for cost or the
   non-Anthropic ensemble for rigor — but not Opus-judges-Opus.
7. **Local-run reproducibility.** The Ollama path's exact tag for Qwen 3.6 is an unresolved `FIXME` in the
   runbook (line 203). "Fully local sovereign number" is not yet reproducible until that tag is pinned.
8. **`cost-tracker.ts` is stale** (no opus-4-7/4-8) — only affects the PRODUCT cost UI, not the benchmark
   number (benchmark cost comes from `models.json` via `llm.ts:259-261`). Worth fixing but not a benchmark
   blocker.

## Sources (web)
- Anthropic / Opus 4.8 pricing $5/$25: metacto.com "Claude API Pricing 2026: Opus 4.8…", cloudzero.com
  "Claude API Pricing", finout.io "Anthropic API Pricing in 2026", evolink.ai "Claude API Pricing 2026".
- gpt-oss architecture (117B/5.1B, 21B/3.6B, Apache-2.0, ~80GB / 16GB): openai.com "Introducing gpt-oss",
  arXiv:2508.10925 "gpt-oss-120b & gpt-oss-20b Model Card", help.openai.com.
- OpenRouter pricing (DeepSeek V3 $0.20/$0.80, V3.2 $0.23/$0.34, Llama-3.3-70B $0.32-1.00/free, gpt-oss free):
  openrouter.ai model pages, costgoat.com/pricing/openrouter, betonai.net "OpenRouter Pricing 2026".

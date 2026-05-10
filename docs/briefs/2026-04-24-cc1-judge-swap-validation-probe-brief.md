# CC-1 Brief — §1.3g Judge Swap Validation Probe (4-Candidate Roster: Kimi + MiniMax + DeepSeek + Zhipu)

**Date**: 2026-04-24 (updated same day)
**Status**: §1.3g sub-gate, Marko ratifikovao path re-prioritization + roster expansion
**Authorized by**: Marko Marković (2026-04-24 evening, "ajmo da ih probamo... ne bih ja cekao google, i bolje da imamo kineza" + "Moonshot Kimi i Minimax ima oba ima i deepseek i z.ai")
**Predecessor**: §1.3f Vertex Batch INFEASIBLE → Branch A CLOSED; Marko ratifies judge swap as primary path over Branch B waiting
**PM**: claude-opus-4-7 (Cowork)

## Roster (4 candidates)

Marko confirmed direct API keys present in `waggle-os/.env` for all four Chinese GA-status flagship reasoning models:

1. **Moonshot Kimi** (latest k2 / kimi-2.7)
2. **MiniMax** (latest M series — M2.7 target)
3. **DeepSeek** (latest V3.1 / V4 / R2 — whichever is current flagship reasoning)
4. **Zhipu / z.ai** (latest GLM-4.6 / 4.7 / 5)

Roster expansion rationale: DeepSeek especially has reasoning-tuned training paradigm; Zhipu is Tsinghua-origin cross-lingual flagship. Cost impact trivial (~$4-6 vs $2-3 for 2-candidate roster, well within $5 → $7 halt envelope adjusted to $8 → $10 halt for 4-candidate). Methodology benefit (4-candidate κ ranking) >> small cost delta.

---

## §0 Path re-prioritization

Stage 3 N=400 re-kick path ovim se re-prioritizuje:

**Novi primary path**: judge swap za Gemini 3.1 Pro na Chinese GA model (Kimi 2.7 ili MiniMax M2.7), gated na validation probe (this brief). Swap success → manifest v6 emit → full N=400 pod novim trojcem.

**Novi backup**: Google quota ticket approval (pozicija umanjena sa primary na contingency). Ako stigne pre swap validation completion-a, PM će razmotriti alternate path.

**Fallback-of-fallback**: Branch B (manifest v6 reduced Gemini coverage) — aktivira se samo ako judge swap probe FAIL za oba kandidata.

**Narrativni benefit swap-a**: ensemble diversity (US + US + CN jurisdictions), GA-status judge stack, eliminisan preview-model quota dependency dugoročno.

---

## §1 Cilj

Empirijski utvrditi koji od četiri Chinese GA-status flagship reasoning modela (Kimi, MiniMax, DeepSeek, Zhipu) ima SOTA-grade judge capability za LoCoMo scoring task. Success criterion = κ(candidate vs Opus+GPT consensus) ≥ 0.70 na 20 instances iz existing κ calibration set-a.

Identifikacija ishodi (per-candidate):
- **PASS**: κ ≥ 0.70 (substantial agreement)
- **BORDERLINE**: κ 0.60-0.70 (moderate — PM adjudicates on context)
- **FAIL**: κ < 0.60 (insufficient)

Aggregate verdicts:
- **MULTI_PASS**: dva ili više kandidata prolaze → rangiraj po κ score-u descending, top kandidat = primary recommendation, drugi = backup for manifest v6
- **SINGLE_PASS**: samo jedan kandidat prolazi → taj = recommendation (no backup within Chinese roster)
- **ALL_FAIL**: nijedan ne prolazi → swap path CLOSED, vraćamo se na Branch B ili čekanje Google-a
- **INCONCLUSIVE**: parse failure rate >= 2/20 na nekom kandidatu, ili API availability issues

---

## §2 Model identifier resolution

Kimi "2.7" i MiniMax "M2.7" su Marko-ova terminologija za "najnoviju najjaču varijantu". CC-1 mora **real-time verifikovati exact current latest model identifier** kroz direct API catalog discovery, ne pretpostavljati od imena.

**Routing priority order** (Marko ratifikovao 2026-04-24):

1. **PRIMARY — direct provider APIs**: Moonshot direct za Kimi, MiniMax direct za MiniMax. Native catalog access, najnoviji identifier-i, bez OpenRouter surcharge-a, direct quota ownership.
2. **FALLBACK — OpenRouter**: koristi samo ako direct API key missing/invalid ili direct catalog ne sadrži latest flagship.

### §2.1 Kimi — Moonshot direct (primary)

Required env var: `MOONSHOT_API_KEY` (ili `KIMI_API_KEY` zavisno od Marko-ove naming conventions u .env).

Endpoint candidates (try in order, use first that works):
- `https://api.moonshot.ai/v1/chat/completions` (newer international)
- `https://api.moonshot.cn/v1/chat/completions` (China mainland)

API surface: OpenAI-compatible (Bearer auth, standard ChatCompletion schema).

Catalog discovery:
- GET `https://api.moonshot.ai/v1/models` (or .cn equivalent) sa Bearer auth
- Identify latest flagship (prefer k2, kimi-2, kimi-2.7 namespace; reject moonshot-v1-* if newer exists)

Fallback to OpenRouter if direct key missing/invalid or catalog incomplete:
- `curl -s https://openrouter.ai/api/v1/models -H "Authorization: Bearer $OPENROUTER_API_KEY" | jq '.data[] | select(.id | contains("moonshot") or contains("kimi"))'`

Document selected identifier + routing used (direct / openrouter) + context window + pricing u memo.

### §2.2 MiniMax — MiniMax direct (primary)

Required env var: `MINIMAX_API_KEY` (plus potentially `MINIMAX_GROUP_ID` — MiniMax API sometimes requires group_id header).

Endpoint candidates:
- `https://api.minimaxi.com/v1/text/chatcompletion_v2` (newer OpenAI-compatible)
- `https://api.minimax.chat/v1/text/chatcompletion_pro` (legacy)

API surface: check docs — may require `GroupId` query param or header, and response schema slightly different from OpenAI standard.

Catalog discovery:
- MiniMax typically doesn't expose /models endpoint; use docs + direct model identifier
- Known flagship families: M1 series, M2 series, abab6.5, abab7. Prefer latest M2 variant or abab7 namespace.
- If uncertain, try multiple identifiers sequentially (e.g., "MiniMax-M2.7", "MiniMax-M2", "abab7-chat-preview") and log which returned valid response

Fallback to OpenRouter:
- Filter OpenRouter catalog for "minimax"

Document selected identifier + routing used + any special auth params (group_id, etc.) u memo.

### §2.3 DeepSeek — DeepSeek direct (primary)

Required env var: `DEEPSEEK_API_KEY`.

Endpoint:
- `https://api.deepseek.com/v1/chat/completions` (OpenAI-compatible)

Catalog discovery:
- GET `https://api.deepseek.com/v1/models` with Bearer auth
- Identify latest flagship reasoning model (prefer V3.1, V4, R2, deepseek-reasoner namespace over V2 / deepseek-chat legacy)
- Document selected identifier + context window + pricing

Fallback to OpenRouter:
- Filter OpenRouter catalog for "deepseek"

### §2.4 Zhipu / z.ai — Zhipu direct (primary)

Required env var: `ZHIPU_API_KEY` ili `ZAI_API_KEY` (check Marko .env for exact naming).

Endpoint candidates:
- `https://api.z.ai/v1/chat/completions` (newer international)
- `https://open.bigmodel.cn/api/paas/v4/chat/completions` (China mainland, legacy branding as "智谱清言")

API surface: OpenAI-compatible Bearer auth typical; verify newer z.ai endpoint schema.

Catalog discovery:
- GET `https://api.z.ai/v1/models` or equivalent with Bearer auth
- Identify latest GLM flagship (prefer GLM-4.6, GLM-4.7, GLM-5 namespace over GLM-4 legacy)
- Document selected identifier + context window + pricing

Fallback to OpenRouter:
- Filter OpenRouter catalog for "zhipu" or "glm"

---

## §3 Sample selection

Uzeti **20 instances iz postojećeg κ calibration set-a** (ne iz N=400 canonical fixture). Location: identifikuj iz manifest v5 §N / v4 predecessor references (gde god je κ=0.7458 kalibrisan). **Kriterijum**:
- 20 instances koji imaju već-postojeće Opus 4.7 + GPT-5.4 + Gemini 3.1 Pro verdicts u dataset-u
- Stratified ako moguće: izbalansirano preko cells (no-context, retrieval, agentic, itd.) da probe ne pokrije samo jednu kategoriju
- Identifikuj po canonical instance_id iz postojećeg κ calibration results JSONL

Ako balanced selection nije moguć zbog dataset structure, uzmi prvih 20 iz κ calibration results file-a (deterministic ordering) i document u memo-u.

**STRICT CONSTRAINT**: ne generisati nove judge verdicts od Opus ili GPT za ovo probe. Koristimo **njihove already-generated verdicts iz κ calibration set-a** kao ground truth reference. Nove judge pozive samo ka Kimi i MiniMax.

---

## §4 Probe execution

### §4.1 Prompt template

Koristi **verbatim judge prompt template iz `failure-mode-judge.ts:245-258`** (isti koji Gemini 3.1 Pro dobija trenutno). Ne modifikuj, ne trim-uj, ne adaptiraj. Identičan input za fair comparison.

### §4.2 Call pattern

- Per instance: 4 API calls (1 Kimi + 1 MiniMax + 1 DeepSeek + 1 Zhipu)
- Total: 80 API calls
- Sequential OK (volume trivial, no rate limit pressure at this scale)
- Deterministic settings: `temperature=0.0`, `max_tokens` matched na current judge runner setting
- Retries: up to 3 na transient errors (rate limit, network); log retry count per instance

### §4.3 Output parsing

Parse Kimi + MiniMax responses kroz **identičan parser** koji judge-runner koristi za Gemini 3.1 Pro responses. Ako parsing fail → count as "judge failure" (ne kao disagreement). Threshold: ≥18/20 successful parse per candidate for valid probe; <18 → INCONCLUSIVE verdict.

---

## §5 κ computation

Computation matrix per candidate:
- **Consensus reference**: Opus + GPT on that instance
  - If Opus == GPT → consensus = that value
  - If Opus != GPT → "split" (exclude from κ or treat as disagreement — standard practice: exclude, document count)
- **Candidate verdict**: Kimi or MiniMax verdict on same instance
- **Agreement matrix**: 2×2 (consensus × candidate) across instances

Compute **Cohen's κ** for each candidate against Opus+GPT consensus.

Success criteria:
- κ ≥ 0.80 = excellent agreement (preferred)
- κ ≥ 0.70 = substantial agreement (pass threshold)
- κ ≥ 0.60 = moderate agreement (borderline — PM adjudicates)
- κ < 0.60 = fair/poor (FAIL)

Also compute:
- Raw agreement % (for context)
- Count of "split" consensus instances (excluded from κ)
- Per-cell breakdown if stratified sample permits

---

## §6 Scope guards (identični §1.3f)

- **Manifest v5 anchor `fc16925` immutable**. No v6 emit u probe phase.
- **HEAD `373516c` + 8 commits od v4 anchor-a intact**. Last commit short SHA = `8ad0567` (§1.3f).
- **§11 frozen paths netaknuti**: runner, judge-runner, failure-mode-judge, health-check, litellm-config.yaml.
- **No new LiteLLM alias** u `litellm-config.yaml` za Kimi ili MiniMax tokom probe-a. Probe script direktno priča sa OpenRouter API (ili Moonshot/MiniMax direct) bez LiteLLM proxy layer-a.
- **Novi folder**: `benchmarks/probes/judge-swap-validation/` (izvan §11 frozen paths).
- **Package install pre-authorized**: ako je potrebno, `pip install openai` (ili ekvivalent za OpenRouter routing) — minimal add. Log installed versions u memo.

---

## §7 Deliverables

Commit na `feature/c3-v3-wrapper`:

1. `benchmarks/probes/judge-swap-validation/probe-script.py` (ili `.ts`) — probe code sa inline comments
2. `benchmarks/probes/judge-swap-validation/sample-instances.jsonl` — 20 instances selekovanih sa instance_id + cell + Opus verdict + GPT verdict (ground truth reference)
3. `benchmarks/probes/judge-swap-validation/kimi-responses.jsonl` — 20 Kimi verdicts (raw + parsed)
4. `benchmarks/probes/judge-swap-validation/minimax-responses.jsonl` — 20 MiniMax verdicts (raw + parsed)
5. `benchmarks/probes/judge-swap-validation/deepseek-responses.jsonl` — 20 DeepSeek verdicts (raw + parsed)
6. `benchmarks/probes/judge-swap-validation/zhipu-responses.jsonl` — 20 Zhipu verdicts (raw + parsed)
7. `benchmarks/probes/judge-swap-validation/kappa-analysis.md` — κ matrix (per-candidate) + raw agreement + split count + verdict + ranking table
8. `benchmarks/probes/judge-swap-validation/validation-memo.md` — ≤200 reči summary sa explicit per-candidate verdict + aggregate verdict (MULTI_PASS / SINGLE_PASS / ALL_FAIL / INCONCLUSIVE), recommended primary + backup candidates, actual cost, wall-clock

Anchor commit: `[probe] judge swap validation 4-candidate: kimi + minimax + deepseek + zhipu - <aggregate_verdict>`. SHA-256 svih artefakata u halt ping.

---

## §8 Budget i halt criteria

- **Budget cap**: $8 (adjusted from $5 za 2-candidate → 4-candidate roster; realno ~$4-6 expected)
- **Halt @ $10**: ako spend pređe, full escalation, no completion
- **Per-call timeout**: 60s (judge calls su short)
- **Total wall-clock cap**: 2.5h (setup + 80 calls + per-candidate κ compute + aggregate ranking + memo)

---

## §9 Halt ping format

Emit na completion (success/fail/inconclusive):

- `aggregate_verdict: MULTI_PASS | SINGLE_PASS | ALL_FAIL | INCONCLUSIVE`
- Per-candidate block (repeat for all 4):
  - `<candidate>_identifier_used: <string>`
  - `<candidate>_routing: direct | openrouter`
  - `kappa_<candidate>_vs_consensus: <float>`
  - `raw_agreement_<candidate>: <float>`
  - `successful_parse_<candidate>: <int>/20`
  - `per_candidate_verdict: PASS | BORDERLINE | FAIL`
- `split_consensus_excluded: <int>` (Opus≠GPT count, shared across candidates)
- `ranking_by_kappa: [<candidate1_by_rank>, <candidate2>, <candidate3>, <candidate4>]`
- `recommended_primary: KIMI | MINIMAX | DEEPSEEK | ZHIPU | NONE`
- `recommended_backup: KIMI | MINIMAX | DEEPSEEK | ZHIPU | NONE` (if MULTI_PASS)
- `anchor_commit: <full sha>`
- `artefact_shas: { script, sample, kimi-responses, minimax-responses, deepseek-responses, zhipu-responses, kappa, memo }`
- `wall_clock: <duration>`
- `cost_actual: $<actual>` (vs $8 cap)
- `next_step_request: PM-RATIFY-JUDGE-SWAP-VALIDATION`
- `cc1_state: HALTED`

CC-1 ne self-advances. Ne emituje manifest v6 swap. Ne modifikuje runner. Čeka PM ratifikaciju.

---

## §10 Task #29 trace update (post-probe)

Posle halt ping-a, PM update:
- §1.3g Judge swap validation: <verdict>
- If BOTH_PASS / KIMI_PASS / MINIMAX_PASS: emit manifest v6 swap proposal brief za recommended candidate
- If BOTH_FAIL: swap path CLOSED, fall back na Google ticket waiting + Branch B prep
- If INCONCLUSIVE: PM odlučuje retry parameter-ima ili escalates

Post-PASS path timeline: manifest v6 emit + full κ re-calibration ($15-25, ~2h) + N=400 run sa novim trojcem (standard tier quota, no 250 RPD cap) → ~1-1.5 days total to SOTA claim completion, bez scope footnote.

---

## §11 Authorized by

PM Marko Marković, 2026-04-24 evening, verbatim: "Ahmo da ih probamo. I kimi i Minimax... najjaci modeli, ne bih ja cekao google, i bolje da imamo kineza"

CC-1 može da počne odmah — gcloud tooling nije potreban za ovaj probe (OpenRouter alternative route).

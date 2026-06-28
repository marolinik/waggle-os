# OpenHuman → Waggle OS: Prioritized Adoption Report (Hardened, Final)

## 1. Framing & Honest Verdict

OpenHuman is a genuine mature peer — Rust core, real memory substrate, shipped voice/meet/screen surfaces. So the question is not "is it serious," it's the founder's bar: does any item move a Waggle-specific lever — **KVARK funnel, the memory+harvest moat, the skills/connectors upgrade trigger, or Waggle-funded proxy cost** — or is it the same "nice but not differentiating" class the founder just rejected wholesale (Local-Agent-Studio)?

**Where OpenHuman is genuinely ahead (verified against grounding):**
- **Pre-LLM per-tool-result compression** (TokenJuice). Confirmed gap: tool output is appended to the messages array *verbatim* (`agent-loop.ts:511` `r.content`; `tool-executor.ts:161-166` raw result returned, no compaction). Waggle only compresses *after* the conversation crosses 50% (`context-compressor.ts`).
- **Capability-aware model routing.** Confirmed: `resolveUsableModel` (`model-availability.ts:86-109`) is provider-*readiness* fallback only; `capability-router.ts` routes tool **names** to sources, not **tasks** to model classes. No "lightweight → cheap, reasoning → frontier" policy exists.
- **Scheduled auto-fetch connector→memory loop.** The grounding flags this as *"the ONLY significant gap in the memory substrate"* — cron infra (`cron-store.ts`) and harvest (`harvest/pipeline.ts`, pull-only) both exist but are never wired together.
- Idle background cognition (Subconscious), trigger triage, memory-diff — real, but each carries a real-cost or prerequisite problem (below).

**Where Waggle already matches or leads (do not touch):**
- **Memory substrate** — hierarchical trees (`wiki-compiler`), Obsidian/Notion export, 4-profile RRF + reranker + chunk-level scoring (`search.ts`/`scoring.ts`), KG bridge. This is the LoCoMo-87.66-SOTA moat; at-parity-or-ahead on every memory item.
- **Approval gate** (`confirmation.ts` — risk taxonomy + autonomy tiers + never-autopass blacklist) — *more* sophisticated than OpenHuman's.
- **Warm-start memory** (`orchestrator.recallMemory`, Hermes `session-start`), cron/automations, iteration-budget, loop-guard, awareness, Composio + 30 connectors, vault, Hive DS — all present.

**Does anything clear the bar? Yes — three items, heavily scope-cut, not the draft's three:**

1. A **pure-code tool-result compression subset** (JSON-table crusher + live search dedup) — a clean, zero-added-cost margin lever that reuses `dedup.ts`.
2. **Deterministic capability-aware routing** of *known-lightweight internal calls* to Haiku-on-proxy / local — a real proxy-cost lever that works even for a vanilla FREE user with no Ollama.
3. **PRO-gated auto-fetch connector→memory** — the *only* item that touches the actual memory+harvest **moat** rather than just margin; the grounding calls it the sole substrate gap; gating to PRO makes it simultaneously a **tier trigger** and **cost-safe**.

**What I cut from the draft as still-too-loose:** the token-aware-truncation **LLM-summarization fallback** (largely redundant with existing message-level compression, and summarizing-on-truncation can *add* budget-model proxy cost on the very FREE/TRIAL tier it claims to protect — a hard slice is free); the **standalone "savings metering" ADOPT** (an internal `cost-tracker` accumulator is fine; a user-facing "we saved you N tokens" panel is exactly the nice-but-not-differentiating scope creep the founder rejects); and the routing layer's **arbitrary-user-task complexity classifier** (needs its own classifier = cost + risk; the deterministic internal-call subset captures most of the win with none of it).

Honest bottom line: **two tightly-scoped cost levers + one PRO-gated moat-deepener, with metering folded in as internal telemetry. Defer four real-but-blocked items behind explicit triggers; skip the rest.** Resist the Rust engine, the 96-rule overlay, the ML compressor, the mascot, the Meet agent.

---

## 2. Adoption Matrix

| Capability (OpenHuman) | Waggle status | Verdict | Impact | Effort | Strategic fit |
|---|---|---|---|---|---|
| Per-result: JSON-table crusher (pure code) | none (verbatim) | **ADAPT** | M–H* | S | cost lever |
| Per-result: live search-result dedup/merge | partial (ingest-only) | **ADAPT** | M | S | cost lever |
| Per-result: token-aware truncation (no LLM) | partial (char-only) | **ADAPT (minor)** | L–M | S | cost lever |
| Per-result: LLM-summarization-on-truncation fallback | partial (msg-level only) | **DROP→DEFER** | L | M | redundant + can add cost |
| Content-aware kind classifier (deterministic, feeds crusher) | none | **ADAPT** | — | S | cost lever (input only) |
| Capability-aware routing — known-lightweight internal calls → Haiku/local | partial (readiness-only) | **ADAPT** | H | M | cost lever |
| Capability-aware routing — arbitrary user-task complexity | partial | **DROP** | M | M | speculative (classifier cost) |
| Privacy-required-on-device flag | none | **ADAPT (bundle w/ routing)** | L | S | KVARK narrative |
| Savings tracking / cost attribution | none | **ADOPT (internal only)** | L | S | instrumentation |
| Auto-fetch connector→memory loop (PRO-gated, dedup-capped) | partial (cron infra, no job type) | **ADOPT** | M–H | M | **moat + tier trigger** |
| Trigger triage pipeline (drop/ack/react/escalate) | missing (event triggers deferred C24) | **DEFER** | H | L | blocked on webhook infra |
| Subconscious idle cognition + durable per-thread goal | partial (read-only daemons) | **DEFER (cost-negative)** | M | L | burns proxy $ on free tier |
| Taint-origin background safety | partial (autonomy tiers exist) | **DEFER (bundle)** | L | S | polish |
| MCP live registry discovery (Smithery) | static 200+ + Composio on-demand | **DEFER (near-SKIP)** | L–M | M | redundant w/ Composio |
| Memory-diff (git-backed change tracking) | missing | **DEFER** | M | L | `compliance/` already covers audit |
| SuperContext first-turn scout | **has** (warm-start) | **SKIP** | — | — | redundant |
| Trees / Obsidian / scoring / E2GraphRAG | **has / ahead** | **SKIP** | — | — | redundant w/ SOTA moat |
| Pluggable external memory backend | partial (export-only) | **SKIP** | — | — | KVARK does sovereign on-prem |
| 90k-entry skills aggregation | curated marketplace | **SKIP** | — | — | cannibalizes tier trigger |
| Native voice (STT/TTS + lip-sync) | missing | **SKIP** | — | — | off-brand (B2B cockpit) |
| Desktop mascot (Rive) | missing | **SKIP** | — | — | off-brand |
| Google Meet agent (CEF/CDP) | missing | **SKIP** | — | — | multi-quarter, fragile, diff product |
| Screen intelligence (macOS Vision + Ollama) | partial (browser only) | **SKIP** | — | — | macOS-only, commodity |
| iOS companion / 18 messaging channels | missing | **SKIP** | — | — | mobile v2+; off-funnel |
| OS keyring | **has** (`vault.ts` AES-256-GCM) | **SKIP** | — | — | vault better for server/KVARK |
| Theme Studio | **has** (Hive DS tokens) | **SKIP** | — | — | brand consistency intentional |
| Kanban / approval / cron / iteration-budget / loop-guard / awareness | **has** | **SKIP** | — | — | already shipped |

\* *Impact is workload-dependent: high for tool/connector-heavy sessions (JSON list responses, web research); low for memory-recall-dominated sessions. Stated honestly, not oversold.*

---

## 3. ADOPT / ADAPT Specs

### A. Tool-Result Compression — pure-code subset only (cost lever)

**What to build:** one pure-TS module `packages/agent/src/tool-output-compressor.ts`, invoked in `tool-executor.ts` **between** `tool.execute()` and the return, under a hard contract — **never enlarge output, never throw, fall through to passthrough; passthrough below a ~2KB gate** (exactly TokenJuice's guard). Two compressors plus a deterministic kind-classifier. Explicitly **reject** tree-sitter, the 96-rule overlay, ModernBERT, and CCR retrieval markers.

1. **JSON-table crusher** — array-of-objects → pipe-delimited table; force-keep head/tail rows + any row containing `error`/`panic` or a numeric outlier (>2σ). Pure `JSON.parse` + format; ~95% reduction on API list responses. **No LLM.**
2. **Live search-result dedup** — call the trigram fuzzy-dedup already in `harvest/dedup.ts` (75% threshold) on `web_search` snippets before formatting. The logic exists; it is simply never invoked on real-time results today. **No LLM.**
3. *(minor)* **Token-aware truncation** — replace the blunt 10K-char cut in `web_fetch` (`system-tools.ts:701-730`) with a token-estimated budget so the cap is consistent across prose/code/JSON. **No LLM.**

**Explicitly NOT building:** the LLM-summarization-on-truncation fallback. It is largely redundant with the existing message-level summarizer (`context-compressor.ts` at 50%, `messages-compressor.ts` with `COMPACTION_PROMPT`), and replacing a free hard-slice with a budget-model call **adds** proxy cost on FREE/TRIAL — net-positive only when a large result is followed by many turns. If data-loss complaints actually appear, revisit then.

**Files:** new `packages/agent/src/tool-output-compressor.ts`; insert at `tool-executor.ts:161`; `system-tools.ts:701-730` (web_fetch path); reuse `packages/hive-mind-core/src/harvest/dedup.ts`.

**Tier:** ON for all tiers, ungated — pure margin protection where Waggle funds the proxy.

**Cost/security:** Net reduction, zero added LLM cost. Only risk is over-compression hiding signal — mitigated by the force-keep rule + never-enlarge contract. Compressed output still passes the existing `scanForInjection()` (already runs post-tool).

### B. Capability-Aware Routing — deterministic internal-call subset (cost lever)

**What to build:** route a **fixed allowlist of known-lightweight internal calls** — the compaction summarizer, the kind-classifier from §A, tool-name selection, short structured-extraction — to the cheapest ready class: **Haiku on the built-in Anthropic proxy** by default, **local Ollama** when configured. No new classifier; the call sites are known a priori, so routing is deterministic and low-risk.

**Why this is a real FREE-tier lever:** the built-in proxy is Anthropic-only, so the universal win is **Haiku-on-proxy for lightweight work** (~10–12× cheaper than Sonnet, far cheaper than Opus) — it materializes for a vanilla FREE user with *no* local model. Ollama/on-device is the bonus for configured users.

**Bundle the `privacyRequired` flag:** forces on-device, no cloud fallback. This is the only piece with a KVARK-funnel angle — surface as a TEAMS/ENTERPRISE-flavored capability ("sensitive tasks never leave the machine"), reinforcing the sovereign narrative with zero KVARK work. Keep it honest: it's a narrative asset, not KVARK itself.

**Explicitly NOT building:** classification of *arbitrary user-task* complexity — that needs its own (cost-bearing) classifier and risks mis-routing real reasoning to a weak model. The deterministic internal-call subset captures most of the savings with none of the risk.

**Files:** extend `model-availability.ts:86-109` (`resolveUsableModel` gains a `class` arg); `routes/litellm.ts` (already aggregates 13 providers incl. Ollama); add a model-capability dimension alongside the source dimension in `capability-router.ts`. Quality fallback: if a local result looks like a refusal/garbage, retry on cloud — unless `privacyRequired`.

**Tier:** routing-to-cheap universal; `privacyRequired` surfaced as a paid-tier capability.

**Synergy:** B is the prerequisite that makes item C (auto-fetch) cost-safe — its extraction step routes here.

### C. Auto-Fetch Connector→Memory Loop — PRO-gated (moat + tier trigger)

**What to build:** a `connector_fetch` cron job type wiring the existing scheduler to the existing harvest pipeline, on a **frequency-capped** schedule (daily, not 20-min), so a user's mind stays current without manual re-harvest. This is the *only* item touching the actual memory+harvest moat — a mind that silently stays fresh is stickier (deeper lock-in) than one that goes stale.

**Why it clears the bar where metering doesn't:** the grounding names this *the* substrate gap; the infra already exists; and **PRO-gating resolves every objection at once** — it removes FREE proxy exposure, turns "your mind stays fresh automatically" into a concrete **upgrade trigger**, and deepens the **moat** for paying users. Triple fit (moat + tier trigger + cost-safe) — the most on-strategy item in this report.

**Cost is bounded, not open-ended:** harvest's `harvestSetHash` skips unchanged sources (steady-state cost is only incremental new data), and the extraction LLM routes through §B to the budget model. The expensive first ingest stays user-triggered.

**Files:** add job type in `packages/core/cron-store.ts`; wire execution in `routes/automations.ts`; invoke `packages/hive-mind-core/src/harvest/pipeline.ts`; gate via tier check.

**Tier:** PRO+ only. Do **not** ship on FREE.

### (folded in) Savings telemetry — internal only

Extend `cost-tracker.ts` (per-model pricing already lives there) with a `tokensSaved` / `by_compressor` / `by_model` accumulator to validate A and B internally. **No user-facing "we saved you N tokens" panel** — that is speculative scope creep. Build only enough to prove the cost arc to the founder.

---

## 4. SKIP / DEFER (one-line reasons)

**SKIP:**
- **SuperContext first-turn scout** — redundant; Waggle warm-starts memory synchronously before the LLM (`orchestrator.recallMemory`, Hermes `session-start`). A scout sub-agent adds a round-trip for marginal gain.
- **Memory substrate (trees / Obsidian / scoring / E2GraphRAG / pluggable backend)** — at-parity-or-ahead; the SOTA-benchmarked moat. Pluggable backend is a real enterprise-sync gap, but that's precisely what KVARK's sovereign on-prem covers; desktop is local-first by design.
- **90k skills aggregation** — a free external firehose undercuts the curated marketplace that *is* the upgrade trigger.
- **Voice + lip-sync / Rive mascot** — off-brand for a B2B cockpit + demand-gen funnel; OpenHuman's own analysis calls them commodity.
- **Google Meet agent** — multi-quarter Rust CEF/CDP build, breaks on every Meet UI change, different product than a memory cockpit.
- **Screen intelligence** — macOS-only, Ollama-heavyweight, commodity OCR+vision; computer-use can wait.
- **iOS companion / 18 messaging channels** — mobile is v2+; consumer chat platforms are off-funnel.
- **OS keyring** — `vault.ts` (AES-256-GCM, icacls-hardened) is already stronger for server/Docker/KVARK; keyring is end-user convenience, not a moat.
- **Theme Studio** — Hive DS brand consistency is a deliberate moat; user theming dilutes it.

**DEFER (real, but gated):**
- **Trigger triage pipeline** — adopt the *design* (drop/ack/react/escalate on a fast model) only once the event-trigger/webhook layer it depends on actually exists (C24 is explicitly schedule-only v1). Blocked on a prerequisite, not on merit.
- **Subconscious idle cognition + durable per-thread goals + taint-origin** — genuine capability gap, but idle agent loops **burn Waggle-funded proxy on FREE/TRIAL** — actively *against* the cost discipline that justifies this whole report. Defer until there's a PRO tier-trigger case *and* a quiet-tick/local-eval zero-cost model; that cost model is the real prerequisite.
- **MCP live registry discovery** — near-redundant with Composio's on-demand discovery (grounding: Composio "exceeds static-only registries"). Revisit only if catalog staleness becomes a stated sales objection; no evidence it is today.
- **Memory-diff (git-backed change tracking)** — a genuinely moat-adjacent idea for a memory product, but L effort and `compliance/` already covers audit/EU-AI-Act; fold into a future compliance sprint.

---

## 5. Ranked Top Recommendations

The bar culls hard. Three items clear it — ranked by strength of case, with scope cut to the bone:

1. **PRO-gated auto-fetch connector→memory (§3.C).** The only item touching the actual **memory+harvest moat**, not just margin. Grounding-flagged as the sole substrate gap; infra already exists (`cron-store` + `harvest/pipeline`); PRO-gating makes it cost-safe **and** a tier trigger in one move. Highest strategic ceiling. M effort; depends on connectors being connected, so size it as a deliberate PRO-feature bet, not a quick win.

2. **Tool-result compression — pure-code subset (§3.A).** Lowest effort/risk, cleanest pure-margin cost lever. Verified gap (`agent-loop.ts:511` verbatim append). JSON-table crusher + live search dedup, both **zero added LLM cost**, reusing `harvest/dedup.ts`. Compounds across accumulating turns. **Scope discipline is the whole game: ship the crusher + search dedup + token-aware truncation; reject tree-sitter, the 96-rule overlay, the ML compressor, CCR, and the LLM-summarization fallback.**

3. **Deterministic routing of internal-lightweight calls (§3.B).** Complementary cost lever via **Haiku-on-proxy** (works for vanilla FREE users, no Ollama needed), and the enabler that makes #1's extraction step cheap. Bundle the `privacyRequired` on-device flag as a free KVARK-sovereignty narrative asset.

**Folded in, not headlined:** internal savings telemetry via `cost-tracker.ts` — build enough to prove #2/#3, no user-facing panel.

**Everything else: defer behind explicit triggers (triage, Subconscious, MCP discovery, memory-diff) or skip.** Do not let OpenHuman's impressive-but-off-strategy surfaces (Meet, mascot, voice, screen, mobile, 90k skills) pull scope — real engineering, not Waggle's funnel.

---

## 6. Critique Deltas (what I changed vs the draft and why)

1. **Split the compression layer; dropped the LLM fallback.** The draft bundled a genuine zero-cost win (JSON crusher + trigram search dedup, both pure code) with **token-aware-truncation-with-LLM-summarization**. I demoted the summarization fallback to DEFER because it is (a) largely redundant with Waggle's *existing* message-level compression (`context-compressor.ts` at 50%, `messages-compressor.ts`), and (b) cost-perverse on the target tier — a hard slice is free, a budget-model summary spends proxy tokens, net-positive only for long post-result conversations. The ruthless cut sharpens the rec to its zero-added-cost core.

2. **Demoted "savings metering" from a co-equal top-3 ADOPT to internal telemetry.** A user-facing "we saved you N tokens" panel is exactly the nice-but-not-differentiating scope creep the founder rejects. Kept only the near-free internal `cost-tracker` accumulator needed to validate the arc. This freed the #3 slot for a real moat item.

3. **Elevated auto-fetch connector→memory from mid-DEFER to ADOPT (PRO-gated).** This is the biggest change and the one place I make the *strongest* case. The grounding names it the **sole** substrate gap; it's the only candidate touching the actual **memory+harvest moat** rather than margin; PRO-gating eliminates the FREE cost exposure the draft worried about *and* converts it into a **tier trigger**. Triple strategic fit beats every cost-only item. The draft's cost objection is over-stated: `harvestSetHash` bounds steady-state cost, and routing (rec B) makes extraction cheap.

4. **Scoped routing down to deterministic internal calls; cut the task-complexity classifier.** The draft proposed `classifyTaskComplexity(intent)` over arbitrary user tasks — that needs its own cost-bearing classifier and risks mis-routing real reasoning. I kept only the deterministic allowlist (summarizer, kind-classifier, tool-selection → Haiku/local), and made explicit that **Haiku-on-built-in-proxy** (not Ollama) is the universal FREE-tier lever — the draft over-weighted Ollama, which requires user setup most FREE users won't have.

5. **Corrected a file pointer.** `agent-loop.ts:504` → **`:511`** per the authoritative grounding ("line 511, r.content added verbatim").

6. **Re-characterized MCP live discovery as near-redundant with Composio.** Grounding states Composio on-demand discovery "exceeds static-only registries," so Smithery live discovery is closer to SKIP than DEFER — kept DEFER but flagged the redundancy and the lack of any evidence catalog staleness is a real objection.

7. **Sharpened Subconscious as cost-negative.** The draft deferred it neutrally; I flagged that idle background loops *burn the Waggle-funded proxy on the exact moat tiers*, cutting directly against the cost discipline that justifies the rest of the report — so it's not just "later," it's "not on FREE, ever, without a zero-cost tick model."

8. **Reframed the honest verdict.** Replaced the draft's "one cluster of three small modules (compression + routing + metering)" with the more accurate and more strategic framing: **two tightly-scoped cost levers + one PRO-gated moat-deepener (auto-fetch), metering folded in.** Same restraint, but the third item now touches the moat instead of being instrumentation.

9. **Held all SKIPs.** Re-tested every SKIP (voice, mascot, Meet, screen, mobile, keyring, Theme Studio, pluggable backend, 90k skills, scout, substrate) against the bar — all correctly skipped; no false negatives to rescue.
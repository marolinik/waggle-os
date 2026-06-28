# Odysseus → Waggle OS: Prioritized Adoption Report (Hardened + Deep-Trace Reconciled, Final)

> **License note (AGPL-3.0 — stated once, binding):** Odysseus is **AGPL-3.0**. We may read it for ideas and **port concepts clean-room** (math, control-flow shape, taxonomy, *edge-case knowledge*), authored fresh against Waggle's own files. We may **not** copy its code into Waggle's proprietary monorepo, **and we may not bundle or ship its binaries** (e.g. its `hwfit`/`llmfit` tool) alongside the closed product — distributing an AGPL binary with proprietary code is the worst-case AGPL trap. Where a spec below "lights up" an existing Waggle route that shells out to a tool, the implementation is a **clean-room TypeScript re-implementation of the algorithm**, never odysseus's binary. The §B hardware-detection port in particular is a port of the *edge-case checklist (knowledge)*, never the `hardware.py` code. No paste, no binary.

## 1. Framing & Honest Verdict

Odysseus is a mature self-hosted, multi-user, admin-console-grade workspace: a real (pre-SOTA) memory substrate, a full local-inference stack, a skill-lifecycle machine, a hardened scheduler, and a consumer email/calendar client. The founder's bar is unchanged and high — an item ADOPTs only if it moves one of four Waggle levers: **(1) KVARK funnel / sovereign narrative, (2) the memory+harvest MOAT, (3) the skills/connectors UPGRADE TRIGGER, (4) Waggle-funded PROXY COST.** Generic "good feature" = SKIP, the way Local-Agent-Studio was rejected wholesale.

**The decisive read: A/B/C already took the proxy-cost-margin lever this session.** Tool-output compression (A, `tool-output-compressor.ts` — subtractive, post-injection-scan, verified), Haiku-on-proxy routing (B, `model-class-router.ts` — `privacyRequired` fails closed, verified), and PRO-gated connector auto-fetch (C, `connector-harvest.ts` — injection-scanned, hash-skipped, frequency-floored, verified). So odysseus's *margin-side* cost items (tool-RAG schema slimming, compact-prompt mode, low-signal bypass, singleflight cache) are **the same lever A/B already took, at lower marginal value** — honest DEFER, not ADOPT.

**Odysseus's real value sits on the three levers A/B/C barely touched** (only C touched the moat). Four clusters clear the bar, scope-cut to their zero-regret core; one cheap fold; everything else defers or skips.

- **Proxy-cost via a *different mechanism* than A/B — the local-model on-ramp.** Waggle shipped the local-inference route + UI (`local-inference.ts`: `/hardware` `/models` `/status` `/pull`), but the ranking engine is delegated to an **absent `llmfit` binary** (verified: `detectHardwareViaLlmfit` shells out and returns `null`, falling to `detectHardwareBasic` with `hasGpu:false` + 4 hardcoded RAM-gated models, lines 90-167). B's `model-class-router` has a `localModel` passthrough but **assumes a local model already exists** (verified — `resolveModelForClass` takes a ready `localModel`, never creates one). Odysseus's `hwfit` ranking math is exactly the missing engine that *produces* a fit model. Genuinely NEW vs A/B/C, and double-levered (proxy-cost + KVARK sovereign-local). The deep pass sharpened the cost: the **ranking math is the cheap core; the per-vendor detection layer is the hard multi-week tail** (port it staged, as a clean-room checklist — see §B).
- **Upgrade-trigger: skill VERIFICATION, not skill extraction.** Waggle already auto-distills skills (`skill-distillation.ts` — ≥5-tool success-gated, sign-gated, dedup-via-`search_skills`, verified) — **do not re-recommend auto-extraction.** The gap is that nothing *verifies or prunes* the library; `/api/skills/test` is a static "what would this inject" preview, not a run-and-grade loop (verified, `skills.ts:598`). A self-testing, "verified"-badged, self-pruning library is what a *paid* skills moat needs.
- **Moat: the cheapest win — extend C to email.** C's auto-fetch substrate landed this session; gcal + github are wired, gmail/outlook are not (verified). outlook `list_emails` is `riskLevel:'low'`, param-free (verified) — wiring its `harvestAction` lands inbox content into the substrate in a few lines.
- **Moat-hardening + KVARK narrative: a taint-preserving untrusted-content artifact.** Waggle's injection defense scans at three chokepoints with hard drops, and recall already carries a "this is memory data, attribute honestly" preamble (verified, `orchestrator.ts:773-808`). So Waggle is **not** "detect-block only" — but tool output that *passes* the scan is still returned verbatim with no structural data/instruction delimiter (verified, `tool-executor.ts:114`). The deep pass found the genuinely novel part isn't the delimiter wrapper but **taint-preservation through message-normalization** (the trust bit survives the lossy turn-merge — see §C), which lifts the *security* merit a notch above "purely incremental." Its decisive value remains the **KVARK/EU-AI-Act narrative artifact** ("external content is structurally non-authoritative") plus a published THREAT_MODEL.md — a sales/compliance asset for the sovereign funnel.

**Does anything clear the bar? Yes — four clusters, scope-cut hard, plus one cheap fold.** None overlaps A/B/C; three hit moat/upgrade/KVARK, one is a *new-mechanism* proxy-cost lever:

1. **Email connector → memory harvest (§A)** — pure **moat**, lowest effort, highest certainty. Ship first.
2. **Local-model recommend engine + token budget (§B)** — highest ceiling on **proxy-cost + KVARK**; clean-room TS port only; cheap ranking core, staged detection tail; kill the homelab serve fleet.
3. **Skill verification & hygiene (§D)** — the **upgrade-trigger**; ADOPT the cheap hygiene judge, ADAPT the PRO "verified" badge.
4. **Taint-preserving sandbox + THREAT_MODEL (§C, with G merged in)** — moat-hardening that clears **on the KVARK-narrative lever** with a now-stronger security floor; scope to the minimal wrapper + taint-preservation + the doc.

Plus one fold: **scope-gate the existing memory-mcp to read-only/owner (§E1)** — cheap moat *hygiene* (keeps poisoned external-agent writes out of the SOTA substrate; corroborated on both MCP servers).

Honest bottom line: **four scope-cut clusters + one cheap moat-hygiene fold.** I killed the draft's "governed outbound write API as the strategic prize" (letting external agents WRITE the substrate cuts against the dedup/quality discipline that makes it SOTA), demoted the event bus and distill-on-failure to DEFER (the event bus now carries a banked cost-safe design — §4), and removed the option to bundle odysseus's AGPL binary. Resist the consumer email client, the compare arena, the homelab serve fleet, and the deep-research re-build — real engineering, not Waggle's funnel.

---

## 2. Adoption Matrix

| Capability (Odysseus) | Waggle status | Verdict | Impact | Effort | Strategic fit |
|---|---|---|---|---|---|
| Email connector → memory harvest (extend C) | partial (substrate landed, not wired) | **ADOPT** | M–H* | S | **moat** |
| VRAM/RAM-fit model-ranking math (lights up dead `llmfit`) | partial (route exists, engine absent) | **ADAPT** (clean-room TS) | H | L | **proxy-cost + KVARK** |
| Multi-vendor HW *detection* (NVIDIA/Apple first; long tail) | partial (no GPU detect) | **ADAPT** (edge-case checklist, staged) | H | M–H | proxy-cost + KVARK |
| Backend-aware serve-path gating | missing | **ADAPT** (fold into ranking math) | M | S | proxy-cost |
| Adaptive input-token budget → discovered window | partial (128k default, unwired) | **ADOPT** (bundle w/ engine) | M | S | proxy-cost |
| Skill necessity/redundancy/generic hygiene judge | partial (dedup at create only) | **ADOPT** | M | S | **upgrade-trigger** |
| Autonomous skill-audit loop (run→judge→edit→retry→demote) | missing (test is static preview) | **ADAPT** (PRO) | H | L | upgrade-trigger |
| Taint-preserving untrusted-content sandbox + THREAT_MODEL.md | partial (scan+drop, no wrapper/taint; no doc) | **ADAPT** | M | M | **moat-harden + KVARK narrative** |
| Scope-gate the existing memory-mcp (read-only/owner token) | partial (ungated read+write, both servers) | **ADOPT** (minimal) | M | S | **moat hygiene + KVARK** |
| Distill-on-FAILURE teacher-escalation | partial (success-only) | **DEFER** (fold later) | M | M | upgrade-trigger (needs §C wrapper) |
| Governed OUTBOUND scoped agent write API + token taxonomy | partial (single device token) | **DEFER** (speculative arc) | H | L | cuts against substrate quality |
| Self-delivering skill bundle (plugin.zip) | missing | **DEFER** (behind outbound API) | M | S | upgrade-trigger |
| Event-counter trigger (shares cron `next_run`) + model-slot semaphore | missing (C24 deferred) | **DEFER** (cost-safe design banked) | M | M | proxy-cost + moat-freshness |
| Per-query tool selection via HybridSearch lane (local-model enabler) | missing (sends all) | **DEFER** (§B-adjacent ADAPT-candidate) | M | M | proxy-cost (local-model; reliability tail) |
| Multilingual email thread/quote parser (talon) | missing | **DEFER** (behind email harvest) | M | M | moat |
| Compact prompt mode / low-signal bypass / mid-loop unlock | missing | **DEFER** | L | M | proxy-cost (taken lever) |
| Fail-closed read-only/plan-mode gating | partial (fail-open denylist) | **DEFER** | M | S | hardening |
| Vault audit-on-read + justification | partial (no per-access audit) | **DEFER** | M | S | KVARK |
| URL credential redaction before logging | missing | **DEFER** | L | S | KVARK |
| BYO consumer-subscription LLM (ChatGPT/Copilot OAuth) | missing | **DEFER** (bank the credential-resolver seam) | M | M | proxy-cost (ToS-gray) |
| CalDAV SSRF/DNS-rebind validator | parity (OAuth, no URL) | **DEFER** | L | M | KVARK (custom-URL only) |
| Injection-narrowed retrieval (RAG blast-radius) | partial | **DEFER** | M | M | moat (latent) |
| GitHub SKILL.md importer / toolset-gated index | partial | **DEFER** | L | M | upgrade (cannibalizes marketplace) |
| Scheduler hardening (zombie reap / overdue / IANA-tz) | partial | **DEFER** | L | S | reliability (no lever) |
| Pinned-facts always-inject recall lane | partial (IdentityLayer covers it) | **DEFER**/near-SKIP | L | S | none (memory is free) |
| ChromaDB dual-lane memory + Jaccard fallback | **ahead** (SOTA substrate) | **SKIP** | — | — | redundant |
| IterResearch deep-research loop | parity (`retrieval-agent-loop`) | **SKIP** | — | — | parity + token liability |
| Conversation compaction (summarize older half) | **ahead** (5-step pipeline) | **SKIP** | — | — | redundant |
| Agentic email auto-triage pollers / email→cal extraction | missing | **SKIP** | — | — | consumer email client, proxy liability |
| Blind A/B model-compare arena | missing | **SKIP** | — | — | off-brand (consumer arena) |
| Multi-host SSH/tmux/vLLM serve fleet | missing | **SKIP** | — | — | homelab, off-brand |
| nh3 HTML visual report / HF search / JSON-repair | parity | **SKIP** | — | — | redundant / babysits weak models |
| In-process loopback token + reserved usernames | parity (in-process agent) | **SKIP** | — | — | solves a problem Waggle avoids |
| Role-based per-USER tool RBAC | missing | **SKIP** | — | — | RBAC Phase 5 founder-DEFERRED |
| Voice/STT/TTS/faces · standalone email client · themes · 2FA · mascot | n/a / off-brand | **SKIP** | — | — | off-brand B2B cockpit |

\* *Impact is connector-dependent: high for outlook (`list_emails` returns subject/from/preview); lower for gmail (`list_messages` returns ID stubs only — see §A). Stated honestly, not oversold.*

---

## 3. ADOPT / ADAPT Specs

### A. Email connector → memory harvest — extend C (moat) · ADOPT · Tier: PRO

**What:** Wire the low-risk email read action into the auto-fetch substrate that landed this session. Odysseus has deep IMAP/CalDAV connectors but feeds **none** of it to memory — that anti-pattern is the lesson; closing it is the win.

**Precision correction (the draft overclaimed "the single richest personal corpus"):**
- **outlook `list_emails`** (verified `outlook-connector.ts:55-66`) is `riskLevel:'low'`, optional-only params, and returns real content (subject/from/receivedDateTime, preview via `$select`). **ADOPT cleanly now** — add `harvestAction = { action: 'list_emails' }`.
- **gmail `list_messages`** (verified `gmail-connector.ts:23-35`) is `riskLevel:'low'` and param-free, but the Gmail API returns only `{ id, threadId }` stubs — **no subject/body**. Harvesting it alone lands near-empty frames. The actual content needs `get_message` (requires an `id` param → outside the param-free `harvestAction` contract). So gmail's value is **gated behind a small list→get enrichment** (a two-step harvest variant), not a one-line wire. Ship outlook now; treat gmail as a fast-follow once the enrichment lands.

**Files:**
- `packages/agent/src/connectors/outlook-connector.ts:55-66` — add `harvestAction`.
- Pattern mirror: `packages/agent/src/connectors/gcal-connector.ts:24` and `github-connector.ts:23` (both wired in C).
- `packages/server/src/local/connector-harvest.ts:143-211` — `runConnectorFetch` already injection-scans each frame (`:191`), hash-skips unchanged (`:184`), frequency-floors on the last real sweep (`:154`). **No new harvest code.**
- `packages/agent/src/connector-sdk.ts:45-50` — `harvestAction` contract.

**Cost/security:** Bounded — `hashItems` skips unchanged; injection-scan runs per frame (and the §C wrapper stacks on top). PRO-gated like C → zero FREE proxy exposure; "your inbox becomes searchable memory automatically" is a clean upgrade trigger. **Prerequisite for the §4 thread parser.**

---

### B. Cookbook local-model recommend engine — light up the dead `llmfit` route (proxy-cost + KVARK) · ADAPT (clean-room TS) · Tier: FREE/TRIAL

**What:** **Clean-room re-implement** odysseus's `hwfit` ranking math in TypeScript so Waggle's already-shipped local-inference route stops returning a no-op. This is the on-ramp B needs: B routes to a local model *if one exists*; this is how a FREE/TRIAL user *obtains and picks* one that actually fits their machine — and every such user stops burning the Waggle-funded Anthropic proxy. Doubles as the KVARK sovereign-local story: "scan your machine → run a model that fits → agent + memory now run free, on-device, your data never leaves."

**AGPL caveat (load-bearing):** Do **NOT** bundle odysseus's `hwfit`/`llmfit` binary as the tool `local-inference.ts` shells out to — that ships an AGPL binary with the proprietary product. Re-implement the algorithm in TS as a sidecar function (drop the `execFile`/`callLlmfit` indirection entirely, or point `LLMFIT_PATH` at our own clean-room TS CLI). The route, types, and UI already exist (`local-inference.ts` lines 21-63, 200-259), so effort is L only because of the math, not the surface.

**Effort/risk reframing (the deep pass corrected this — the cost is honest now):** the two halves have very different cost profiles. The **ranking math is the cheap, high-value core** — `fit.py`/`models.py` are pure functions (quant bytes-per-param, MoE active-param math, harmonic CPU-offload tok/s, composite score) that port cleanly to TS and are unit-testable (effort L). The **detection layer is the hard, multi-week reliability tail** — `hardware.py` (~900 LOC) is a per-vendor bug graveyard you cannot guess: WSL non-interactive shells hide `nvidia-smi` from PATH; driver-mismatch strings must be disambiguated from "no GPU"; Grace-Blackwell unified memory reports `memory.total=[N/A]`; Strix Halo's BIOS UMA carveout shows only in `mem_info_vis_vram_total` and must NOT be capped at system RAM; Apple needs `recommendedMaxWorkingSetSize` fractions; Windows WMI's 32-bit `AdapterRAM` caps at 4 GB so you must read the registry `qwMemorySize`; consumer RDNA is GGUF-only-serve truth. **Port the detection as a documented edge-case CHECKLIST (clean-room — port the KNOWLEDGE, never the AGPL code) and STAGE it: ship NVIDIA + Apple-Silicon + basic-RAM first (covers ~all Waggle desktop users), then work the long tail iteratively.** Keeps §B the #2 pick while making its cost honest — the engine is cheap; detection reliability is the real spend.

**Port (scope-cut to the laptop cockpit):**
1. **Fit/quant/offload ranking** (odysseus `fit.py`/`models.py`) — the cheap core: per-quant bytes-per-param, MoE active-param math, GPU→CPU-offload harmonic walk with context halving, weighted quality/speed/fit composite + arch-age bonus. Surfaces too-tight rows instead of hiding them. Replaces `basicModelRecommendations` (verified: 4 hardcoded models gated on RAM only, lines 160-168).
2. **Hardware detection** — staged NVIDIA + Apple-Silicon + basic-RAM first, then the long tail as a clean-room edge-case checklist (see reframing above). Real VRAM detection is the prerequisite: `detectHardwareBasic` hardcodes `hasGpu:false` (verified `:151`), so the ranker today can't tell a laptop iGPU from a 4090.
3. **Backend-aware serve-path gating** — Apple/Windows/consumer-AMD (RDNA) → GGUF-only; never recommend an AWQ repo a Mac can't load. Folds into the ranker at low marginal cost.

**Bundle — adaptive input-token budget (proxy-cost, effort S, ADOPT):** `context-compressor.ts:404` defaults `maxContextTokens: 128000`, and the live call site **passes no override** (verified `chat.ts:1254` — only `budgetModel`/`litellmUrl`/`litellmApiKey`), so a local 4k/8k model is sized as if it had a 128k window → blowout and mis-sized compaction. Pass an override derived from the discovered window (`window*0.85`, clamp, conservative-on-unknown). ~40 lines + one wiring point; it is the change that makes the §B models actually *work*.

**§B-adjacent ADAPT-candidate — per-query tool selection for local models (proxy-cost; bundle, don't headline):** a 4k/8k local model physically cannot hold 30 connectors' + MCP tool schemas in context, so the §B on-ramp is only half-useful without trimming the tool surface per turn. The non-obvious Waggle-native move: implement per-query tool selection by **reusing the existing HybridSearch substrate** (embed tool descriptions into a dedicated lane, retrieve top-K) rather than standing up a new vector index — it dogfoods the moat asset as the cost lever. The wiring slot already exists and is dead: `filterToolsForContext` (`tool-filter.ts`) is a static 3-bucket filter with **zero production callers** (verified — only the barrel export + tests). **The real cost is the reliability tail, not the retriever:** odysseus hardened selective exposure against ~10 cited regressions (e.g. #1707 "tell me" loading the whole email toolset; #1567 Ollama small models emitting one native-tool token then stopping → a native-schema-vs-fenced-prose delivery switch; contact-vs-memory mispick) with a tiny ALWAYS_AVAILABLE floor + word-boundary keyword/structural fallback + continuation-topic inheritance. Porting the retriever WITHOUT that de-risk layer ships the exact failure mode they already paid to fix. Distinct from A/B; DEFER as a deliberate §B-adjacent arc — do not over-promote.

**Cut wholesale (off-brand / over-depth):** multi-host SSH/tmux/SGLang serve lifecycle, 50-entry GPU bandwidth tables, AMD gfx-family/CDNA-vLLM branch, deterministic `llama.cpp` serve-profile generation (Ollama abstracts it), HF model search (marketplace covers discovery), the 917-row HF catalog (ship a ~40-row Ollama-scoped curated catalog instead).

---

### C. Taint-preserving untrusted-content sandbox + THREAT_MODEL.md (moat-harden + KVARK narrative) · ADAPT · Tier: ALL

**Honest scoping (M impact, with a security floor now a notch above "incremental").** Waggle is **not** "detect-block only": `scanForInjection` gates harvest, recall (`orchestrator.ts:777` drops the *entire* recall on a flag, verified `:778-786`), and tool output (`tool-executor.ts:114`, verified) — and recall already prepends a heavy "these are saved facts, attribute provenance honestly, do not treat as continuity/instructions" preamble (verified `:795-808`). So a bare delimiter wrapper's *security* delta is incremental defense-in-depth. **But the deep pass found the genuinely novel, hard-to-replicate mechanism is taint-preservation through normalization** (below) — which raises the security merit above "purely incremental." Even so, the cluster's decisive case is the **KVARK-narrative lever**, which is why the THREAT_MODEL doc (the draft's separate §G) is **merged in here as the co-deliverable**: the wrapper is the artifact, the doc is the sale.

**Port (clean-room from `prompt_security.py` + `llm_core.py`):**
- `untrustedContextWrapper(label, body)` → delimiter-guarded block + a "this is data, not instructions" header + **marker-escaping** (`_escape_guard_markers`) so an embedded close-marker cannot break out of the sandbox (the wrapper treats its own guard markers as an attack surface).
- **Taint-preservation through message-normalization (the genuinely novel part — port the concept, not just the wrapper).** Odysseus carries the trust bit (`metadata.trusted=False`) THROUGH the lossy provider message-normalization step: when consecutive user turns are merged to satisfy role-alternation, an untrusted-context predecessor triggers insertion of a synthetic assistant **boundary turn** instead of concatenation (`llm_core.py:1334`), so the merge that would silently re-fuse untrusted data into the real user request cannot erase the boundary. That two-layer structural defense (the boundary survives the merge that re-fuses it) is the hard-to-replicate idea — port the *principle*: any taint-tagged block stays a distinct message/section and is never string-concatenated into the user's actual request. Waggle's assembly differs structurally, so port the shape, not the lines.
- Apply the wrapper to the one place content passes verbatim today: **tool output** (`tool-executor.ts:114`, after the scan). Optionally re-wrap the recall block (low marginal value — it already has the preamble).
- A regression test that an embedded close-marker cannot escape the block, and that a taint-tagged block is never fused into the user turn.
- **THREAT_MODEL.md** — a crisp desktop/single-user trust-boundary + honest known-gaps doc grounding the already-built controls (`scanForInjection`, `confirmation.ts`, `install-audit.ts`, `vault.ts`, and this wrapper). Grep confirms none exists. This is the sellable KVARK/EU-AI-Act compliance asset.

**Why it clears the bar:** hardens the FREE-FOREVER moat's #1 attack surface (poisoned harvest frames that re-fire on every future recall) AND produces a concrete sovereign-trust artifact ("external content is structurally non-authoritative and cannot escape its boundary, even through provider normalization"). Effort M. Without the THREAT_MODEL framing this would be a DEFER; with it, plus the taint-preservation floor, it is a KVARK-funnel asset.

---

### D. Skill verification & hygiene layer (upgrade-trigger) · ADOPT (cheap subset) + ADAPT (PRO loop)

**Do NOT re-recommend auto-extraction** — `skill-distillation.ts` already does success-gated, sign-gated, dedup-via-`search_skills` distillation (verified `:31-79`). The gap is *verification and pruning*. A "verified"-badged, self-pruning library is what converts a pile of unverified drafts into a paid moat.

**D1 — Necessity/redundancy/generic hygiene judge (ADOPT, effort S — the 20% that delivers most):** a periodic **single LLM call per skill** (no agent re-run) asking "is this still necessary / redundant with peers / too generic," demoting the loser to **draft (never delete)** and flagging it on the card. Waggle only dedups at *creation*; an auto-growing library bloats without this.
- Files: `packages/server/src/local/routes/skills.ts` (where distillation lands); reuse `packages/agent/src/judge.ts` for the verdict; write the advisory flag to a usage sidecar so `SKILL.md` doesn't churn.

**D2 — Autonomous skill-audit loop (ADAPT, PRO, effort L):** run each skill via the agent loop against a synthesized test task → `judge.ts` grades → auto-rewrite the `SKILL.md` to fix flagged issues → retry → demote-to-draft on persistent failure → surface a **"verified" badge + confidence** on the card. Today `/api/skills/test` (verified `skills.ts:598-633`) is a static prompt-injection *preview*, not a run-and-grade loop. Reuse `judge.ts` + `iterative-optimizer.ts`. **PRO-gated and batched** (agent re-run + judge + rewrite per skill burns proxy). The "verified" badge is the sellable artifact.

**D3 — Distill-on-FAILURE teacher-escalation (DEFER, fold later):** Waggle distillation is explicitly success-only (verified `skill-distillation.ts:35-37`, "a failed/refusal turn has no recipe yet"), so the "learn the fix when you fail" axis is missing — a real gap, but lower priority and it **needs the §C wrapper** to safely capture a failed trace. Reframe as **in-proxy model-class escalation** (Haiku→Opus via B) that captures the Opus fix as a durable skill. Drop odysseus's English-only regex give-up tier. Revisit after D1/D2 ship.

---

### (folded in) E1. Scope-gate the existing memory-mcp — read-only / owner token (moat hygiene + KVARK) · ADOPT (minimal)

**What:** add **owner-scoped + read-only token modes** so Claude Code/Codex can be granted *recall-only* access to one workspace's mind, instead of today's full read+write to `~/.waggle`. Verified on BOTH MCP servers: `memory-mcp/src/index.ts:64-72` registers `registerMemoryTools` + `registerCleanupTools` (write/delete) with **no auth/scope**, and `hive-mind-mcp-server/src/tools/memory.ts` registers `save_memory` (WRITE, `:20`) and `recall_memory` (READ, `:73`) **in the same file with identical exposure** — the `scope` enum there is *search breadth, not access control*. The MindDB already keys by workspace, so the gate is cheap, and it aligns with the **mind-isolation durable pin**.

**Concrete low-effort mechanism (port these two ideas, not the HTTP bundle):** (a) **scope-gate MCP tool *registration*** at server start (`HIVE_MIND_SCOPES=memory:read` ⇒ register `recall_memory` but never `save_memory`), so a read-only token literally cannot mutate the substrate; (b) **write-implies-read scope expansion** (`ensure_before` — granting `memory:write` auto-inserts `memory:read`), the ~15-line correctness detail that makes a granular scope model usable. Feed grants into the existing `install-audit.ts`.

**Why it clears (and why the bigger version doesn't):** read-only scoping is **moat hygiene** — it keeps a poisoned or buggy *external* agent from writing junk into the SOTA substrate. That protects the moat. The draft's larger **E2/E3 — a "governed outbound scoped *write* API" framed as "the strategic prize"** — is **DEMOTED to DEFER**: letting external agents WRITE the substrate by design cuts directly against the dedup/quality discipline that makes it LoCoMo-87.66 SOTA, and the full token taxonomy + middleware is a speculative KVARK-narrative arc, not a now-build. Ship the read-only gate; design the write API later, if ever.

---

## 4. SKIP / DEFER (one-line reasons)

**SKIP (off-brand / parity / no lever):**
- **ChromaDB dual-lane memory + Jaccard fallback** — substrate is LoCoMo-87.66 SOTA (HybridSearch + cross-encoder + KG bridge); strictly ahead. (Deep memory-retrieval trace confirms Waggle ahead on every retrieval property — RRF vs linear blend, CE reranker, read-side *blocking* vs *framing*.)
- **IterResearch deep-research loop** — parity with `retrieval-agent-loop.ts` (checkpoint/resume + cost halts); odysseus's is less hardened and token-heavy = a proxy-cost *liability*. (The deep-research/compare deep-trace agent failed on schema retries, but the breadth pass already settled this area — no rescue needed.)
- **Conversation compaction** — Waggle's 5-step pipeline + messages-compressor + long-task context-manager subsume summarize-older-half.
- **Agentic email auto-triage pollers / email→calendar extraction** — textbook consumer email client; an LLM call per inbound message on a poller is a direct hit on the Waggle-funded Anthropic proxy; off-brand.
- **Blind A/B model-compare arena** — consumer/LMArena feature; Waggle is a B2B cockpit; model selection is automated (B) and quality is judged by `judge.ts`, not user voting.
- **Multi-host SSH/tmux/vLLM serve fleet + llama.cpp serve-profiles** — homelab-grade; Waggle's user is a single laptop on Ollama (which autotunes `n_gpu_layers` behind its modelfile); Ollama-pull covers it.
- **Built-in MCP tool-server packaging / image-gen fit / nh3 HTML report / HF model search / weak-model JSON-repair** — parity, off-brand (consumer media), or babysitting weak local models. (Bank the npx-cache-precheck + anyio-cancel-scope defensive nugget for if/when Waggle auto-spawns npx MCP servers.)
- **In-process loopback token + reserved usernames** — solves an out-of-process privilege-crossing problem Waggle's in-process Node agent doesn't have.
- **Per-USER tool RBAC** — a real TEAMS idea, but **RBAC Phase 5 is founder-DEFERRED** (don't re-raise); bank the fail-closed `is_public_blocked_tool` detail for when it reopens.
- **Voice/STT/TTS/faces · standalone email client · gallery/image editor · Theme Studio · 2FA/TOTP · companion mascot** — off-brand for a B2B cockpit + demand-gen funnel; Hive DS brand consistency is deliberate.

**DEFER (real, but gated behind a trigger):**
- **Governed outbound scoped *write* API + token taxonomy (E2/E3)** — the draft's headline "prize"; demoted because external write to the substrate cuts against the quality discipline that makes it SOTA. Revisit as a deliberate KVARK arc *after* E1's read-only gate proves the demand. (The owner-attribution context-swap `_as_owner` is a clean TEAMS-multi-tenant pattern to remember; nothing to build single-user.)
- **Event-counter trigger (C24) — DEFER, but with a concrete cost-safe design now banked.** Verified `cron-store.ts` is schedule-only (DDL has no `trigger_type`/`trigger_event`/`trigger_counter`; `getDue` = `enabled AND next_run_at<=now`; zero `event`/`trigger` matches). The cost-safe mechanism that answers the proxy objection: a named-event counter lives in the SAME row as cron's `next_run_at`; on threshold the bus persists `counter=0, next_run_at=now` to the DB **before** invoking the in-memory scheduler — so the trigger is reboot-durable and replays through the ordinary `next_run<=now` poll (cron + event unified on one path) — paired with a **model-slot semaphore** so pure-code reactions (index reconcile, prune) fire freely while LLM reactions serialize one-at-a-time. Net: idle FREE/TRIAL workspaces fire zero maintenance LLM calls, and memory gets tidied right after a harvest burst instead of up to 24h later. Ship it when memory-freshness-between-cron-ticks becomes a real complaint; the design is recorded so it isn't re-derived. (Waggle's `SignalBus` already carries the events — it's display-only today; this is the reactive half.)
- **Per-query tool selection / compact prompt / delivery-format switch** — reframed by the deep pass from "same lever A/B took" to a **§B-adjacent ADAPT-candidate** (see §3.B): a *local-small-model* enabler (reuse the HybridSearch substrate as the tool retriever; native-schema-vs-fenced-prose delivery for non-API Ollama models), bundled with §B and gated by the same reliability tail (~10 cited regressions). On the Anthropic proxy path prompt-caching + B blunt the win; the concentrated value is the local/sovereign path. DEFER with §B.
- **Distill-on-FAILURE (D3)** — fold onto B's escalation after D1/D2; needs the §C wrapper first.
- **Multilingual email thread/quote parser (talon)** — becomes load-bearing the instant §A ships (else a 10-deep thread stores the same paragraph 10×). DEFER until email harvest is live; then ADAPT as a harvest pre-pass.
- **Fail-closed read-only gating** — Waggle's `isReadOnly` persona filter is fail-OPEN; flip to inverse-allowlist + static mutator backstop opportunistically when persona governance is next touched.
- **Vault audit-on-read + justification / URL credential redaction (`redactUrl`)** — cheap EU-AI-Act hygiene (strip userinfo+query+fragment from LiteLLM/connector endpoint URLs before logging); fold into the next compliance/connector-logging pass. Plus a sensitive-basename deny list (.ssh/.env/id_rsa) + fix the prefix-weak `startsWith(root)` in `file-store.ts:59` to a real segment-boundary containment check — near-free desktop-fs hardening for the sovereign story.
- **BYO consumer-subscription LLM (ChatGPT/Copilot OAuth)** — keep DEFER: genuine proxy relief, but ToS-gray, brittle, ban-risk, and widens off the deliberate Anthropic-only proxy; the `privacyRequired`→local path already gives a sanctioned zero-proxy escape. **Bank the reusable primitive underneath, though:** Waggle's `ProviderEntry.apiKey` is a static string (verified `model-router.ts:8`); odysseus's value is a **refreshable runtime-credential resolver seam** (per-call OAuth refresh = JWT-`exp` decode + skew + per-id refresh lock + a reauth/ratelimit/notfound error taxonomy). The ChatGPT/Copilot backends are just two instantiations; the seam itself is reusable for any *sanctioned* OAuth-refreshing connector/provider (Copilot now, enterprise model-gateway / Anthropic-OAuth SSO later — a KVARK-adjacent sovereign story). Bank the seam; ship neither consumer backend now.
- **CalDAV SSRF/DNS-rebind validator** — bank the harness for if/when a custom-URL/self-hosted (KVARK-sovereign) connector ships.
- **Injection-narrowed retrieval (RAG blast-radius)** — its only concrete trigger is email auto-reply (off-brand, won't ship); note the pattern.
- **GitHub SKILL.md importer / toolset-gated index** — a free arbitrary-GitHub importer competes with the *paid* marketplace; revisit only as a community on-ramp that funnels into marketplace discovery.
- **Scheduler hardening (zombie reap / overdue / IANA-tz)** — genuine reliability, no business lever; cherry-pick overdue-`next_run`-advance only on a reported duplicate-cron bug; IANA-tz only when TEAMS cross-zone scheduling lands.
- **Memory pinned-facts always-inject lane** — the only thing odysseus's recall has that Waggle's `recallMemory` lacks (a deterministic user-pinned "core facts" block injected every turn without retrieval). Memory is free in Waggle's model → moves no lever; `IdentityLayer`/`AwarenessLayer` already cover the always-on need. DEFER/near-SKIP.
- **`bg_jobs`/`bg_monitor` auto-continue for long shell commands** — genuinely elegant (restart-safe exit-code file, idempotent follow-up), but a dev/power-user ergonomic that *adds* proxy cost (an extra agent run per completed job); lever-less. SKIP-leaning DEFER.

---

## 5. Ranked Top Recommendations

The bar culls hard; odysseus clears it on the three levers A/B/C left open. **Four clusters clear cleanly, plus one cheap fold**, ranked by strength-of-case × certainty, scope cut to the bone:

1. **Email connector → memory harvest (§3.A).** Highest certainty, lowest effort, pure **moat**. Extends the auto-fetch substrate that *landed this session*; **outlook `list_emails` is a one-line `harvestAction` wire** that lands inbox content into the mind (gmail needs a small list→get enrichment first — don't overclaim it). PRO-gated = cost-safe + upgrade trigger. **Ship first.**

2. **Cookbook local-model recommend engine + adaptive token budget (§3.B).** Highest strategic ceiling on **proxy-cost + KVARK**, and genuinely NEW vs A/B/C — B routes to a local model, this *creates* one. Resurrects an already-shipped-but-dead route. **Clean-room TS only — never bundle the AGPL binary.** Scope discipline is the whole game: the **ranking math is the cheap core**; the **detection layer is the multi-week reliability tail — port it as a clean-room edge-case checklist and STAGE it (NVIDIA + Apple + basic-RAM first, long tail iteratively)**; bundle the auto-derived token budget; **reject the SSH/tmux serve fleet, the bandwidth tables, the CDNA depth, the 917-row HF catalog, and llama.cpp profile generation.** (Per-query tool selection via the HybridSearch lane rides alongside as a §B-adjacent local-model enabler — DEFER, not headline.)

3. **Skill verification & hygiene layer (§3.D).** The **upgrade-trigger** play — **only the verification half** (auto-extraction already shipped). ADOPT the cheap necessity/dedup judge (D1, single call/skill) now; ADAPT the PRO-gated run-and-grade audit loop (D2) for the sellable "verified" badge. Distill-on-failure (D3) defers.

4. **Taint-preserving sandbox + THREAT_MODEL.md (§3.C).** Defense-in-depth on the moat's #1 attack surface (poisoned harvest) **plus** the concrete KVARK/EU-AI-Act trust artifact. The deep pass lifted this from "incremental" to a real security floor by naming **taint-preservation-through-normalization** (the boundary survives the turn-merge that re-fuses it) as the concept to port — but it still clears the bar on the **narrative lever**, so the doc is the co-deliverable, not an afterthought. Scope tight.

**Folded in, not headlined:** scope-gate the memory-mcp to read-only/owner (§3.E1) — cheap moat hygiene (write-implies-read + scope-gated tool registration) that keeps external-agent writes out of the SOTA substrate.

**Everything else defers behind explicit triggers or skips.** Do not let odysseus's well-built but off-strategy surfaces — the consumer email client, the compare arena, the homelab serve fleet, the deep-research re-build, the "let external agents write memory" outbound API — pull scope. They are real engineering, not Waggle's funnel.

---

## 6. Critique Deltas (what changed, and why)

1. **Corrected the §A email overclaim with verified API behavior.** The draft said wiring gmail+outlook "lands the single richest personal corpus … in a few lines." Verified: Gmail's `list_messages` returns only `{id, threadId}` stubs (no subject/body) — harvesting it alone writes near-empty frames; real content needs `get_message` (requires an `id` param, outside the param-free `harvestAction` contract). **outlook `list_emails` returns real content and ADOPTs cleanly now; gmail is gated behind a small list→get enrichment.** Same ADOPT verdict, honest about which half ships in one line.

2. **Banned bundling odysseus's AGPL binary in §B; mandated clean-room TS.** The draft offered "port to TS **or** bundle it as the `llmfit` binary." The bundle option ships an AGPL binary alongside the proprietary product — the worst-case AGPL trap. Removed it; the spec is now a clean-room TS re-implementation of the fit math, and the license note at the top is strengthened to forbid binaries explicitly.

3. **Demoted §C from H to M impact and merged §G into it.** Verified that Waggle is *not* "detect-block only": recall already injection-scans with a **full drop on flag** AND carries a substantial "this is memory data, attribute honestly, do not treat as instructions" preamble (`orchestrator.ts:773-808`). A bare structural wrapper's *security* gain is incremental — so the cluster clears the bar **via the KVARK-narrative lever**, which is why the THREAT_MODEL.md (draft's standalone §G) is folded in as the co-deliverable that makes it sell. Scoped the wrapper to the one verbatim-pass site (tool output).

4. **Killed the draft's "governed outbound *write* API as the strategic prize" (E2/E3 → DEFER); kept only the cheap read-only gate (E1).** Verified memory-mcp is local stdio with ungated read+write. Letting external agents *write* the substrate by design cuts directly against the dedup/quality discipline that makes it LoCoMo-87.66 SOTA — so the big version is moat-*risky*, not moat-deepening, and the token-taxonomy middleware is a speculative arc. The honest win is the **read-only owner-scoped gate** (moat hygiene, effort S), aligned with the mind-isolation pin.

5. **Demoted the event bus (§F) and distill-on-failure (§D3) from ADAPT-fold to DEFER.** Both are real but thin: the event bus is a proxy-free moat-*freshness* nicety whose lever is marginal; D3 needs the §C wrapper first and is lower priority than D1/D2. Neither is a differentiator on its own.

6. **Held §B's grounding as the strongest survivor — and verified it end-to-end.** Confirmed the dead `llmfit` shell-out + `hasGpu:false` basic fallback (`local-inference.ts:90-167`), that `model-class-router` *assumes* a local model exists (so the on-ramp is genuinely new), and that the token-budget bug is live (`chat.ts:1254` passes no `maxContextTokens` override → 128k default for every local model). Kept it at #2.

7. **Re-counted the bar-clearers honestly: four clusters + one fold.** The accurate, restrained framing: **A (moat), B (proxy-cost+KVARK), C (moat-harden+KVARK narrative), D (upgrade-trigger)** clear cleanly; **E1** folds in cheap; everything else defers or skips.

8. **Held all SKIPs.** Re-tested every SKIP against the bar — all correctly skipped against the SOTA substrate, the Anthropic-only proxy cost model, and the B2B-cockpit brand. No false negatives to rescue.

**Deep mechanism-trace deltas (this revision — folding the 7 deep dossiers into the hardened breadth brief):**

9. **(A) Made §B's cost honest — engine cheap, detection is the multi-week tail.** The breadth brief lumped HW detection at effort "M" beside the ranking math. The `hwfit-detection` dossier shows `hardware.py` (~900 LOC) is an un-guessable per-vendor bug graveyard (WSL PATH holes, driver-mismatch strings, Grace-Blackwell `[N/A]` unified memory, Strix Halo UMA carveout, Apple working-set fractions, Windows WMI 4 GB `AdapterRAM` cap → registry `qwMemorySize`, RDNA-GGUF-only). Reframed: the fit math (`fit.py`) is the cheap, high-value core (effort L); detection ports as a **clean-room edge-case CHECKLIST**, STAGED (NVIDIA + Apple + basic-RAM first, long tail iteratively). Matrix split into a math row (L) and a detection row (M–H); §B stays #2.

10. **(B) Upgraded §C from "wrap tool output" to "preserve taint across normalization."** The `security-sandbox` dossier found the genuinely novel mechanism: odysseus carries `trusted=False` through the lossy provider message-merge by inserting a synthetic assistant boundary turn (`llm_core.py:1334`) instead of concatenating, plus `_escape_guard_markers` delimiter-breakout escaping. Named that two-layer structural defense as the concept to port; security merit nudged a notch above "purely incremental" while the verdict/lever (moat-harden + KVARK narrative) holds.

11. **(C) Promoted the event-trigger from "thin DEFER" to "DEFER with a banked cost-safe design."** The `scheduler-events` dossier supplied the mechanism that answers the cost objection — an event counter sharing cron's `next_run_at` row, persisted before the in-memory dispatch (reboot-durable; unifies cron+event on one poll), plus a model-slot semaphore so pure-code reactions fire freely and idle workspaces cost nothing. Verified `cron-store.ts` is schedule-only. Recorded the design; kept it gated, not headlined.

12. **(D) Reframed tool-economy from "taken lever" to a §B-adjacent local-model enabler.** The `agent-loop-smallmodel` dossier shows per-query tool selection is a small-LOCAL-model unlock (a 4k/8k model can't hold 30 connectors' schemas) implementable by reusing the existing HybridSearch substrate — distinct from A/B, and `filterToolsForContext` is the dead socket (verified zero production callers). Bundled it with §B, flagged the ~10-regression reliability tail (and the native-schema-vs-fenced-prose delivery switch) as the real cost; did not over-promote.

13. **(E+F) Corroborated E1 with the second MCP server; banked the credential-resolver seam under BYO-subscription; confirmed pinned-facts DEFER.** `integrations-scope` confirmed `hive-mind-mcp-server/src/tools/memory.ts` exposes `save_memory`+`recall_memory` ungated → added "write-implies-read + scope-gated tool registration" as E1's concrete mechanism (verdict unchanged, ADOPT). `mcp-providers` identified the **refreshable runtime-credential resolver seam** (vs static `apiKey`, verified `model-router.ts:8`) as the reusable primitive worth banking while BYO-subscription stays DEFER. `memory-retrieval` confirmed the pinned-facts recall lane is the only delta vs `recallMemory` and moves no lever (memory is free) → DEFER/near-SKIP.

---

## 7. Deep Mechanism Appendix — what's actually hard to replicate

The deep mechanism-trace pass surfaced the genuinely non-trivial engineering behind the picks above — the "why this took a real team to build" evidence for the founder. Each is clean-room-portable as *knowledge*, never as AGPL code.

1. **Calibrated memory-bandwidth tok/s model with a harmonic CPU-offload blend** (`fit.py`). `raw_tps = (bw/model_gb)·0.55`; when a model spills to RAM, `eff_bw = 1/(frac/cpu_bw + (1-frac)/gpu_bw)` so the slow CPU portion dominates as it grows — **empirically calibrated** ("DeepSeek-Coder-V2-Lite Q4_K_M light offload → ~59 t/s est vs 59.8 measured"). You can read the formula; you cannot fake the calibration. (§B core.)
2. **Per-vendor hardware-detection bug graveyard** (`hardware.py`, ~900 LOC). WSL PATH holes hiding `nvidia-smi`; driver-mismatch string disambiguation; Grace-Blackwell unified-memory `[N/A]`; Strix Halo BIOS UMA carveout (`mem_info_vis_vram_total`, must not cap at system RAM); Apple `recommendedMaxWorkingSetSize` fractions; Windows WMI 32-bit `AdapterRAM` 4 GB cap → registry `qwMemorySize`. Each line is a fixed bug — the multi-week reliability tail behind §B (port as a staged checklist).
3. **Serving-path realism** (`fit.py`/`models.py`). It models *what actually serves on what*: vLLM/SGLang can't shard GGUF → single-GPU VRAM for GGUF, full multi-GPU for AWQ/GPTQ; consumer RDNA → GGUF-only; Apple/Windows → GGUF-only; multi-GPU dense → BF16 default. Operational ecosystem knowledge, not spec sheets. (§B serve-gating.)
4. **Taint-preservation through message-normalization** (`llm_core.py:1334` + `_escape_guard_markers`). Carries `trusted=False` THROUGH the lossy role-alternation merge: an untrusted predecessor forces a synthetic assistant boundary turn instead of concatenation, so the normalization that re-fuses turns can't erase the data/instruction boundary. Everyone wraps; almost nobody preserves the taint across the pass that silently undoes it. (§C concept.)
5. **Reboot-durable event-counter sharing cron's `next_run` + a model-slot semaphore** (`event_bus.py:99-105`, `task_scheduler.py`). Counter reset + `next_run=now` persisted to the DB *before* the in-memory dispatch, so a restart mid-queue replays through the ordinary poll; pure-code reactions bypass the `Semaphore(1)` that serializes LLM reactions. (§4 cost-safe event-trigger design.)
6. **Per-query tool-retrieval hardened against ~10 named regressions + a native-schema-vs-fenced-prose delivery switch** (`tool_index.py`, `agent_loop.py`). Word-boundary keyword hints (not substring — "fix"/"serve"/"reply" must not fire inside "prefix"/"observe"/"replying"), structural regexes, continuation-topic inheritance, a tiny ALWAYS_AVAILABLE floor, and a per-endpoint switch because Ollama small models emit one native-tool token then stop (#1567). The de-risk layer is the hard part, not the embedding retrieval. (§B-adjacent concept.)
7. **Refreshable runtime-credential resolver seam** (`endpoint_resolver.py` + `chatgpt_subscription.py`). A provider credential as a *refreshable OAuth session* — JWT-`exp` decode + skew, per-auth-id refresh lock (no double-refresh / reuse-burn), reauth/ratelimit/notfound taxonomy — vs Waggle's static `apiKey` string. The reusable primitive under BYO-subscription (§4 / delta 13).
8. **Embedding-lane fingerprint-gated re-embed with rollback** (`embedding_lanes.py`). A sha256 fingerprint of `lane|url|model|dim` detects an embedding-config change, then preserves docs, recreates the collection, and re-embeds — **rolling back to the old vectors if the re-embed write fails**. The reusable lesson for when a Waggle user swaps embedding model (sqlite-vec also fixes dimension on first insert). Memory-store hardening, not a headline lever.

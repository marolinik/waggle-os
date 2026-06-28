All three checks confirmed and one flips a verdict: `prefers-reduced-motion` already exists in `apps/web/src/index.css` (so that ADOPT becomes a SKIP), the `searxng` MCP entry is real at `mcp-catalog.ts:104`, and the `confirmation.ts` taxonomy symbols are exactly as cited. Here is the hardened final report.

# Local-Agent-Studio → Waggle OS: Prioritized Adoption Report (FINAL)

## 1. Framing & honest verdict

Local-Agent-Studio (LAS) is a lean, single-user, **local-first Electron app**: an Ollama-routed tool loop bolted to ComfyUI image generation, multi-provider web search, a subprocess/Docker sandbox, and a clean React chat surface. It is a **media + sandbox toy** — no persistent memory, no knowledge graph, no tiers, no multi-agent orchestration, no governance. Waggle is categorically more mature on everything that constitutes its moat: the `mind/` substrate (FrameStore/HybridSearch/KG), the `confirmation.ts` risk taxonomy, the 200+ MCP catalog, the persona/evolution subsystems, and the 5-tier funnel. **Do not adopt LAS's architecture. Adopt a short list of its product *decisions*, port almost none of its *code*.**

Two corrections to the draft's optimism, both load-bearing:

1. **Waggle desktop ≠ KVARK.** KVARK is a *separate* sovereign on-prem product (www.kvark.ai); the Tauri desktop binary is the **demand-gen funnel** that qualifies leads into it. So "this unlocks air-gapped KVARK" is the wrong claim for any feature shipped in the desktop app. The right claim is "this is a *sovereignty proof-point* that opens the KVARK conversation." Sovereign-search and local-inference config qualify under that framing; **Docker command isolation does not** (it is server-side hardening KVARK itself would own, and it carries a Docker Desktop runtime dependency absent on virtually every consumer Tauri install — its value evaporates for the funnel product). Docker is therefore **demoted out of the top-5**.

2. **The single most strategically-aligned LAS idea is vision *input*, not anything in the draft's top-5.** It feeds Harvest/memory — the free-forever moat — and it is portable across all 13 providers (not Ollama-locked; the Anthropic SDK already exposes image blocks and LiteLLM passes multimodal through). It is also the largest slice, so it is named here as the **flagship strategic bet, scheduled as a deliberate vertical**, not smuggled into "quick wins."

Net: keep the cheap UX/cost guardrails and the one genuine sovereignty differentiator; sharpen reasoning into a *tier-gated* feature; treat vision as the moat play; drop Docker, ComfyUI, and the already-present reduced-motion CSS.

## 2. Adoption matrix

| Capability | Waggle status | Verdict | Impact | Effort | Strategic fit |
|---|---|---|---|---|---|
| Editable user message + context rewind | missing | **ADOPT** | H | S–M | core UX / retention → moar memory |
| Per-turn web-search budget (max N/turn) | missing (daily only) | **ADOPT** | H | S | cost control (incl. built-in proxy) |
| SearXNG / self-hosted sovereign search provider | partial (MCP entry only, not native) | **ADAPT** | H | M | **KVARK qualification** (on-prem search) |
| Reasoning **control** (`--think` + override + wire Claude thinking, tier-gated budget) | partial (model-locked, no UI, Claude unwired) | **ADAPT** | M | M | agent quality + PRO trigger |
| Reasoning/thinking-trace panel (native `<details>`) | missing | **ADOPT** | L–M | S | premium polish (pairs above) |
| Provider health probes + UI remote-endpoint config (Ollama/vLLM base URL) | partial (env-var only, no pre-route probe) | **ADAPT** | M | S–M | sovereign-inference proof-point |
| Multimodal **vision input** (attach → base64 → model) | missing | **ADAPT (flagship)** | H | L | **memory moat** (Harvest ingests images) |
| Local PC date/time + timezone injection | partial (memory-anchor only) | **ADOPT** | L–M | S | works air-gapped; label vs anchor |
| Agent task queue (queue prompt while busy) | partial (bus is inter-agent) | **ADOPT** | L–M | S | UX polish |
| Multi-format DB export tool (JSON/CSV/SQLite) | missing (as a tool) | **ADAPT** | L–M | S | data-engineer persona / tier |
| Per-category permission toggles (files/search/terminal/db/mcp) | missing (trust-level + risk-class) | **ADAPT (caution)** | M | M | governance / TEAMS trigger — *but permission-model sprawl risk* |
| Docker isolation mode for command exec | partial (subprocess denylist) | **DEFER** | L (for funnel) | M–L | off-funnel; KVARK-side, heavy dep |
| Reduced-motion a11y CSS | **HAS** (`apps/web/src/index.css`) | **SKIP** | — | — | already shipped |
| Image **generation** (ComfyUI graph submit/poll/presets) | missing (DALL-E/Replicate MCP exist) | **SKIP** | — | — | off-core; consumer-creative |
| Agentic tool loop / router / observation chaining | has (better) | **SKIP** | — | — | redundant |
| Streaming token events (requestId/SSE) | has | **SKIP** | — | — | redundant |
| Custom markdown parser / streaming render | has | **SKIP** | — | — | redundant |
| First-launch setup wizard | has (6-step OnboardingWizard) | **SKIP** | — | — | Waggle better |
| Workspace file CRUD + path-traversal guard | has (`resolveSafe`) | **SKIP** | — | — | redundant |
| JSON-RPC MCP client / discovery / invocation | has (200+ catalog) | **SKIP** | — | — | redundant |
| Settings deep-merge / update.json checker | has / Tauri updater | **SKIP** | — | — | redundant + Electron-shaped |
| Message compaction (keep last 14) | has (own ctx mgmt) | **SKIP** | — | — | redundant |
| Runpod remote-GPU marketplace config | n/a | **SKIP** | — | — | off-strategy (cloud GPU) |

## 3. Specs for ADOPT / ADAPT items

### A. SearXNG sovereign search provider (ADAPT)
**Build:** Promote SearXNG from "installable MCP" to a **first-class native search provider** so an on-prem/air-gapped deployment has real web search with zero cloud egress — and so Waggle can *demo* sovereign search as a KVARK qualification proof-point.
- Add `searxng_search` alongside the existing tools in `packages/agent/src/search-tools.ts` (which today defines `perplexity_search`/`tavily_search`/`brave_search`). Port LAS's **`normalizeResult()` schema-adapter** — it maps heterogeneous `{snippet|content, href|url, name|title}` into Waggle's result shape — that's the only genuinely reusable LAS search code, and it's pure JS (Electron-free, fully portable).
- Register it in `SEARCH_PROVIDERS` in `packages/server/src/local/routes/providers.ts` with a configurable base URL (`SEARXNG_HOST`) and **highest priority when set** (sovereign-first), falling back to the cloud four.
- Add base-URL config to the Settings 'Search Providers' panel (`apps/web` SettingsApp).
- **Verified:** the catalog already carries a `searxng` MCP entry (`packages/shared/src/mcp-catalog.ts:104`). Keep it; the native provider is the deterministic, agent-default path the MCP can't guarantee.
- **Security:** route SearXNG results through the same `scanForInjection()` path as other web results — self-hosted ≠ trusted content.
**Reuses:** provider-priority routing, `DailyRateLimiter`, the search tool contract. **Tier:** all tiers; the *sovereign* angle is the **ENTERPRISE/KVARK** sales line — framed honestly as a proof-point, since the desktop app is the funnel, not KVARK itself.

### B. Per-turn web-search budget (ADOPT)
**Build:** A hard **max-searches-per-agent-turn** cap (LAS uses 3). Waggle's daily limiters (`DailyRateLimiter`) and the `web_search` 10/min `RateLimiter` in `system-tools.ts` (lines 40-41) do **not** stop a single malformed loop from firing search N times in one turn — and on FREE/TRIAL those calls can hit the **built-in anthropic proxy / Waggle-funded** path, so this is a Waggle cost exposure, not only the user's premium quota.
- Add a per-turn counter scoped to the agent loop in `packages/agent/src/agent-loop.ts` / `retrieval-agent-loop.ts`, incremented by any `*_search` tool, that **short-circuits with an observation** ("search budget exhausted this turn") rather than throwing.
- Express the cap as a constant (default 3–5) and let `loop-guard.ts` own it if a budget primitive already lives there — mirror `iteration-budget.ts`, don't invent a parallel mechanism.
**Reuses:** the loop's observation-injection path. **Tier:** all; matters most for cost-controlled TEAMS/ENTERPRISE and for protecting Waggle-funded proxy spend.

### C. Editable user message + context rewind (ADOPT)
**Build:** Let a user edit any prior user message; truncate everything after it; rerun from there. LAS does this with a **single array slice** (`messages.slice(0, index)` + clear queue) — the frontend technique is ~20 lines; the backend truncate is the real (small) work.
- Frontend: add an Edit action in `apps/web/src/components/os/apps/ChatApp.tsx` (next to the existing copy/pin actions, ~1115-1209); on save, slice local message state and re-send.
- Backend: Waggle chat is append-only `.jsonl` (`packages/server/src/local/routes/chat-persistence.ts`) with only `POST /api/chat` and `DELETE /api/chat/history` (`chat.ts:451`/`1916`). Add a **truncate-from-index** operation (a `fromIndex` on the send path is more surgical than a new endpoint) that rewrites the session `.jsonl` to the kept prefix before streaming the new turn. Add `editedAt` to `ChatMessage` in `apps/web/src/lib/types.ts` (~389-399).
- **Security:** truncate must be path-scoped to the caller's own session file via the existing persistence helpers — no raw filename from the client.
**Reuses:** SSE send path + persistence. **Tier:** all. Retention-grade UX → more sessions → more memory accumulated → moat.

### D. Reasoning controls + trace panel (ADAPT control / ADOPT trace — paired)
**Build (control):** A `--think off|low|medium|high` message flag plus a per-request override in the POST body, resolving **message-flag > settings > model default**.
- Parse the flag where the prompt is assembled and thread a `thinking` value through `packages/agent/src/retrieval-agent-loop.ts` (it already carries thinking at 70-76/440-444/622-628) into the model call.
- **Wire Claude extended-thinking**, referenced in `prompt-shapes/claude.ts` but never sent: add the `thinking` block param in `packages/server/src/local/routes/anthropic-proxy.ts` (~172-189). **Caveat (not a one-liner):** extended thinking also requires handling the thinking-delta stream and the API's temperature/param constraints — budget for that, don't assume it's a single field. Qwen already flips `enable_thinking` via `litellm-config.yaml` (238-245); this makes it user-controllable and extends it to Claude.
- **Cost gate (critical):** thinking tokens are billed. On the **built-in anthropic proxy** (FREE/TRIAL, Waggle-funded), expose only `off`/`low`; medium/high and explicit budgets are a **PRO+** capability via `TierCapabilities`. Otherwise a FREE user sets `--think high` and Waggle eats the bill.
**Build (trace):** A collapsible reasoning panel using native `<details>` (LAS's exact pattern, no JS state). Add a `reasoning`/`thinking_trace` member to the `ContentBlock` union in `apps/web/src/lib/types.ts` (484-489) and render it in `chat-blocks/BlockRenderer.tsx` (today only groups tool steps into ActivityStream, 21-51). The benchmark harness already extracts `reasoning_content`; reuse that separation server-side.
**Reuses:** prompt-shape selector + token stream. **Tier:** control surface = all (off/low); deeper budgets + trace = **PRO** polish point.

### E. Provider health probes + remote-endpoint config (ADAPT — pair)
**Build:** A `GET /api/providers/health` returning LAS's uniform `{id, kind, status, latencyMs}` schema (probe Ollama `/api/tags`, vLLM, search backends; "configured" for credential-only ones), plus a **Settings UI to set remote Ollama/vLLM base URLs** instead of env-only (`OLLAMA_HOST`/`VLLM_HOST`).
- Extend `checkOllama`/`checkVllm` in `packages/server/src/local/routes/local-inference.ts` (172-198) into a parallel `measured()` probe set; render a status panel in SettingsApp. Use the result to **pre-flight before routing** in `model-availability.ts` (`resolveUsableModel`) so a dead endpoint fails fast instead of timing out mid-turn.
**Reuses:** existing discovery code. **Tier:** all. **Runpod-specific config is explicitly dropped** (cloud-GPU marketplace, off-strategy); the strategic value here is *local/sovereign* inference config — a KVARK proof-point, same framing as A.

### F. Local date/time + timezone injection (ADOPT)
**Build:** Inject `new Date()` + IANA timezone into the system prompt, gated by a setting, and **skip web search when the user just asks "what's the date"** (LAS's `isLocalDateQuestion()`).
- Waggle today injects only memory-derived anchor dates (`TEMPORAL_GUIDANCE` / `renderReferenceDateLine` in `hive-mind-core/src/mind/recall-context.ts`, wired at `orchestrator.ts:~808`). Add a real-clock line **next to** it in `buildSystemPrompt()`.
- **Design tension to respect:** Waggle's temporal model is deliberately *memory-anchored* (relative dates resolve against memory timestamps, not wall-clock). Label the new line unambiguously as "current real-world date/time" and keep the memory **anchor** date separate, or the model will conflate "today" with the date of a recalled old frame.
**Reuses:** existing temporal block. **Tier:** all; the gating switch supports air-gapped mode.

### G. Per-category permission toggles (ADAPT — with caution)
**Build:** A Settings UI presenting files/search/terminal/database/mcp as **allow/ask/deny** toggles — the mental model users expect — *projected onto* Waggle's existing engine, not replacing it.
- Map each category to the tools Waggle already classifies; persist into `PermissionsData` in `packages/server/src/local/routes/settings.ts` (232-307, already holds `defaultAutonomy`/`externalGates`/`workspaceOverrides`) and consult it inside `confirmation.ts` (`classifyGatedToolRisk`/`needsConfirmation`) as an **additional** gate.
- **Sprawl warning (§3.2):** Waggle already has **three** permission axes — autonomy level (normal/trusted/yolo), risk class (critical/elevated/medium/low), and the `ALWAYS_CONFIRM` set. A category axis is a **fourth**. Ship it only with an explicit, documented **precedence rule** (recommended: deny/ask categories *tighten* but never *loosen* — they can force a confirm but can never autopass something the existing axes would gate). **Do not weaken `CRITICAL_NEVER_AUTOPASS`** (`confirmation.ts:220/237`, verified) — `isCriticalNeverAutopass` must still fire regardless of any category set to "allow."
**Reuses:** `confirmation.ts` taxonomy + `settings.ts` overrides. **Tier:** governance surface → **TEAMS** trigger. Note LAS code reuse here is ~zero; this is a Waggle UI re-skin of Waggle's own model.

### H. Multimodal vision input (ADAPT — FLAGSHIP strategic bet)
**Build:** Let users attach images that reach vision models — the **single most moat-aligned** LAS idea because it feeds **Harvest/memory** (ingest screenshots, diagrams, whiteboards) and lets agents *read* images, not merely because it's a chat nicety.
- Port LAS's `attachments.cjs` MIME-detect + `imageBase64List()` (pure utility, framework-agnostic, portable).
- Vertical wiring (this is why it's L effort — every layer is necessary, none is skippable):
  - `ContentBlock` union → add an image block (`apps/web/src/lib/types.ts` 484-489);
  - composer drag/drop/paste in `ChatApp.tsx` (crib the existing FilesApp `FileUploadZone`);
  - widen `AgentMessage.content` beyond `string | null` (`agent-loop.ts` 17-22);
  - construct provider-appropriate image blocks where `chat.ts` today does `{ role:'user', content: message }` (`chat.ts:689`) and in `anthropic-proxy.ts`.
- **Portability is good, not a trap:** Anthropic, GPT, Gemini, and Qwen-VL all accept image input; the Anthropic SDK already exposes `ImageBlockParam`; LiteLLM forwards multimodal. This is **not** Ollama-locked — the value survives the Electron→Tauri / local→multi-provider move intact.
- **Security/cost:** cap attachment size/count, strip EXIF on ingest, and tier-gate high-volume image turns on the built-in proxy (vision tokens are expensive).
**Tier:** input = all; the *Harvest-into-memory* path is the **moat**. **Sequence:** a planned vertical *after* the §5 quick wins — it touches the most layers and deserves its own arc, not a slot in a guardrail sprint.

### I. Smaller ADOPTs
- **Agent task queue:** queue user prompts while busy, dequeue on the `busy→idle` transition (LAS's `useEffect([busy])`), with a count badge. Mostly `ChatApp.tsx` state; portable. **Tier:** all.
- **DB export tool:** a `create_dataset` tool writing JSON+CSV+(optional)SQLite via `node:sqlite` (still experimental on Node 20/22 — wrap in the graceful fallback LAS uses), built on existing `resolveSafe` file infra in `system-tools.ts`. **Security:** it has a write side-effect, so it **must** be added to `ALWAYS_CONFIRM` (`confirmation.ts:16`, verified) — same gate as `write_file`/`edit_file`. **Tier:** pairs with the **data-engineer** persona.

## 4. Explicit SKIPs / DEFERs

- **Docker isolation mode → DEFER (demoted from the draft's top-5).** Three independent reasons: (1) **Portability collapse** — it needs Docker Desktop installed; the typical Tauri desktop user (FREE/PRO/TEAMS) has no Docker runtime, so the feature silently no-ops or hard-fails. (2) **Wrong product** — KVARK is a *separate* sovereign server platform; container isolation is hardening *it* would own, not a demand-gen-funnel feature. (3) **§3.2 simplicity** — it's not a "clean dispatcher port"; it's a second execution subsystem (container lifecycle, image pull, volume mounts, cross-platform Docker detection, absent-Docker error paths) for marginal security gain over the *already shipping* `bash` denylist + `createSanitizedEnv()` + `confirmation.ts` gating. Keep subprocess+denylist+confirmation as the desktop answer; revisit Docker only as a KVARK-side, opt-in mode when a Docker host is guaranteed.
- **Reduced-motion CSS → SKIP (verdict flipped).** **Already present** in `apps/web/src/index.css` (verified). Nothing to port.
- **ComfyUI image generation** — ComfyUI-specific graph engine, near-zero fit with an enterprise-memory funnel, and it is *generation* (does not feed the moat) vs. vision *input* (does). If image gen is ever wanted, expose a thin `generate_image` tool over the **existing DALL-E/Replicate/OpenAI MCP entries** (`mcp-catalog.ts:159-161`), not a ported ComfyUI graph engine.
- **Agentic tool loop / router / observation chaining / multi-stage routing** — `agent-loop.ts` + `orchestrator.ts` + `tool-filter.ts` are strictly more capable; porting LAS's Ollama router is a regression.
- **Streaming token events, custom markdown parser, message compaction** — Waggle has SSE streaming, block rendering, and its own context management.
- **First-launch setup wizard** — Waggle's 6-step persona-aware `OnboardingWizard` is better.
- **Workspace file CRUD + path-traversal guard** — `resolveSafe()` is equivalent.
- **JSON-RPC MCP client / discovery / invocation** — 200+ catalog + routes already ship; LAS's client is a subset.
- **Settings deep-merge, `version.json` update checker, Electron packaging** — Waggle has settings infra and a **Tauri** updater; importing Electron patterns is architecturally wrong.
- **Runpod remote-GPU config** — cloud-GPU marketplace, contradicts sovereign/local-first positioning. Keep only the generic UI remote-endpoint + health-probe idea (item E).

## 5. Ranked "do these" (top 5 quick wins)

1. **Editable message + context rewind** (C) — universal, every-session friction fix; one screen of frontend + a `fromIndex` truncate on the existing send path. Zero strategic downside, retention upside.
2. **Per-turn search budget** (B) — cheapest guardrail in the report; a loop-scoped counter that prevents runaway quota/proxy burns (incl. Waggle-funded FREE/TRIAL calls). Reuses `loop-guard`/`iteration-budget` philosophy.
3. **SearXNG sovereign search provider** (A) — the one genuine *sovereignty differentiator*; M effort, reuses provider routing, port only `normalizeResult()`. Framed honestly as a KVARK qualification proof-point, not "KVARK itself."
4. **Reasoning control wiring, tier-gated** (D-control) — finishes the half-built thinking pipeline (wire Claude thinking, expose `off/low/medium/high`), improving agent task quality (→ better memory) while **capping cost on the built-in proxy by tier**. The trace panel rides along as cheap polish.
5. **Provider health probes + UI remote-endpoint config** (E) — fail-fast model UX plus UI-driven local/vLLM endpoint config; the local-inference half of the sovereignty story. Runpod dropped.

**Flagship strategic bet — schedule as its own vertical, not a quick win:** **Multimodal vision input** (H). It is the *highest moat-value* LAS idea (Harvest ingests images) and fully portable across Waggle's providers, but it touches the most layers; give it a dedicated arc after the guardrail sprint.

*Honorable mentions, all small:* local clock injection (F), agent task queue (I), DB export tool (I — gate via `ALWAYS_CONFIRM`).

---

## Critique deltas (what changed from the draft, and why)

- **Docker isolation (E): top-5 → DEFER.** Three failures the draft missed: (1) portability — Docker Desktop is absent on the typical Tauri desktop install, so the value evaporates for the funnel product (the LAS→Waggle environment delta the brief asked to test); (2) strategic mis-attribution — it's KVARK-server hardening, and Waggle desktop ≠ KVARK; (3) §3.2 — it's a full second execution subsystem, not a "clean dispatcher port," for marginal gain over the shipping denylist+sanitization+confirmation stack.
- **Reduced-motion CSS: ADOPT → SKIP.** Verified **already present** in `apps/web/src/index.css`. The draft's own "verify first" hedge was correct; I verified, and it flips.
- **Vision input (H): "honorable mention/bigger bet" → named FLAGSHIP.** It is the only item that feeds the memory moat (the founder's #1 strategy), and I corrected the implicit portability worry: it is multi-provider, not Ollama-locked (Anthropic SDK image blocks + LiteLLM passthrough), so the value survives the port. Kept honest on L effort by scheduling it as a vertical, not a quick win.
- **Reasoning (D): added a tier-gated cost guard.** The draft exposed `--think high` with no cost ceiling; on the Waggle-funded built-in proxy that's a FREE-tier billing hole. Now `off/low` for built-in proxy, deeper budgets PRO+. Also flagged that wiring Claude extended-thinking is more than one param (thinking-delta stream + API constraints).
- **Per-category toggles (G): ADAPT → ADAPT (caution) with a mandatory precedence rule.** The draft layered a 4th permission axis onto Waggle's existing three without addressing contradictory-state risk; I require a "tighten-only, never loosen, never override `CRITICAL_NEVER_AUTOPASS`" rule (symbols verified at `confirmation.ts:16/220/237`).
- **SearXNG (A) + health probes (E): strategic claim softened from "unlocks KVARK" to "KVARK qualification proof-point,"** because the desktop binary is the funnel, not the sovereign product. Confirmed the `searxng` catalog entry exists (`mcp-catalog.ts:104`) so the native-vs-MCP framing stands.
- **Per-turn budget (B): widened the cost rationale** to include Waggle-funded built-in-proxy spend, not just the user's premium quota — strengthens the strategic case and bumps it up the ranking.
- **Top-5 reordered** to weight leverage-per-effort and verified strategic fit: C, B, A, D, E — replacing Docker with health-probes and pulling the two cheapest universal wins (C, B) to the front.
- **DB export + create_dataset:** made the `ALWAYS_CONFIRM` gating explicit (write side-effect) and flagged `node:sqlite` as still experimental — both were under-specified in the draft.
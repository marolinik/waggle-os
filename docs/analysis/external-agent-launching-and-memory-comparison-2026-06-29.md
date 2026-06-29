# External-Agent Launching & Memory — Comparison + Build Decision

**Date:** 2026-06-29 · **Author:** synthesis lead (Claude Opus 4.8 1M) · **Audience:** Marko (founder build decision)
**Repos compared:** `paperclipai/paperclip` · `jaylfc/taOS` · `jaylfc/taosmd` · `jaylfc/tuiui` (unverified)
**Waggle baselines audited:** agent launcher (AI-OS arc) + memory substrate (hive-mind-core)

> Provenance note: external-repo descriptions are sourced from recon agents. `jaylfc/tuiui` returned **no data** (likely 404 / private / misnamed) — its section is marked provisional. All Waggle file paths in this doc were existence-verified on `docs/w4-sota-doc-sync` (2026-06-29). Behavioral claims about Waggle internals are from the launcher/memory recon, cross-checked against CLAUDE.md §10.

---

## 1. TL;DR / Verdict

**Can we improve Waggle's external-agent launching? Yes — materially, and cheaply.** The launcher today is an honest detect→launch→hook→signal→UI pipeline, but it is *fire-and-forget with no eyes*: it spawns tools `stdio:'ignore'`, sees nothing until a Stop-hook frame lands, and the dock can't even self-enable the signal bus it built. Three of the four external projects independently converged on the orchestration primitives we're missing.

**Single highest-leverage move:** make `launchTool()` **self-enabling and resumable** — inject `WAGGLE_SIGNAL_EMIT` + `WAGGLE_SIDECAR_URL` + a `runId`/`taskId` into the launch env (the seam is `tool-launcher.ts:226-229`, today it injects *only* `WAGGLE_WORKSPACE_ID`), and persist the process tracker so launched agents survive a sidecar restart. This turns the existing-but-dark pipeline on. Everything else (heartbeat scheduler, worktree isolation, group-chat) is a follow-on.

**Steal from paperclip, adopt jaylfc, both, or neither?**
- **paperclip → STEAL (patterns, not code):** its heartbeat scheduler, pluggable-adapter contract, git-worktree isolation, and per-agent budget caps are the cleanest map onto our Loops/launcher/CostTracker work. MIT-licensed, so code is *legally* portable — but it's PostgreSQL-centric and a different product thesis, so port ideas.
- **jaylfc/taOS → PARTIAL:** steal the universal-message-envelope + thin-adapter group-chat seam for WaggleDance; ignore the Python/LXC runtime. **Non-OSS license — patterns only, never code.**
- **jaylfc/taosmd → PARTIAL (two ideas):** the source-span **provable-memory recall gate** and **temporal validity windows** on the KG. **Commons-Clause — re-implement, never copy.**
- **jaylfc/tuiui → PROVISIONAL/IGNORE:** unverified; no findings returned.

**Founder decisions flagged:** (a) do launched external agents count against per-agent budget caps (CostTracker), and at which tier? (b) is the provable-memory recall gate worth the per-ingest LLM verify cost on the free-forever memory moat? Both deferred to §8.

---

## 2. What Waggle Already Has (honest baseline)

### 2a. Launcher subsystem (AI-OS arc — real, but partial)

| Layer | File | State |
|---|---|---|
| Tool catalog / types | `packages/shared/src/tool-detection.ts` | `SUPPORTED_TOOLS` (7), `LAUNCH_COHORT` (7), display names. Solid. |
| Detection engine | `packages/agent/src/tool-detection.ts` | PATH probe for CLIs, candidate-path for desktop apps, hook-pointer probe with **backup-exists verification** (catches partial rollback). DI'd, hermetic. Solid. |
| Launch + hooks | `packages/agent/src/tool-launcher.ts` | `launchTool()` detached spawn, `runHookCommand()` shells `npx @waggle/hive-mind-hooks-<id>`. `HOOKS_COHORT` = 6 tools. |
| Process tracker | `packages/agent/src/tool-process-tracker.ts` | In-memory `Map<pid,record>`, liveness via `kill(pid,0)`, refuses to kill un-spawned pids. **Not persisted.** |
| Sidecar routes | `packages/server/src/local/routes/tools.ts` | `/detect`, `/launch` (202), `/processes`, `/kill`, `/hooks`. zod-validated. |
| Signal bus | `packages/server/src/local/signal-bus.ts` | 500-cap in-memory ring buffer. Ephemeral. |
| v2 bus surface | `routes/waggle-dance.ts` | normalizes → `WaggleMessage`, dispatches; installs 1C bridge once. |
| 1C bridge | `waggle-dance-bridge.ts` | maps 10 protocol subtypes → 5 legacy UX categories; **zero frontend change** to surface activity. Clever. |
| Shim emitter | `packages/hive-mind-shim-core/src/signal-emitter.ts` | `maybeEmitDiscovery()` fail-open POST; fires only on stop/pre-compact at high\|critical. |
| Hook bodies | `packages/hive-mind-hooks-core/src/handlers-core.ts` | tool-agnostic SessionStart/UserPrompt/Stop/PreCompact via `EventAdapter`. |
| Dock UI | `apps/web/src/components/os/apps/LauncherApp.tsx` | detect list, Launch/Stop/Install/Verify/Uninstall, 5s `/processes` poll, optional prompt textarea. |

**Stub/gap reality (corrects CLAUDE.md §10, which says "6 hooks are Wave 2/3 stubs"):**
- Recon found **6 real / 1 stub**: only `hive-mind-hooks-claude-desktop` is still `export {}`. claude-code/codex/codex-desktop/cursor/hermes/openclaw all ship real `bin` installers. **CLAUDE.md §10 OW-3 is stale — verify before quoting it.**
- **But the UI lags the backend:** `LauncherApp.tsx:57` hardcodes `HOOKS_COHORT=['claude-code']`, so users *can't* install the 5 other working hook packages from the dock.

**The four launcher gaps that matter:**
1. **No eyes.** Spawn is `stdio:'ignore'` detached (`tool-launcher.ts:106`). Waggle never sees stdout/stderr — only the post-turn Stop-hook frame. No streaming, no attach, no PTY.
2. **Capture is Stop-hook-only.** `maybeEmitDiscovery` fires only on stop/pre-compact at high\|critical. Mid-task visibility is nil; SessionStart/UserPrompt persist frames but never broadcast.
3. **Launch is not self-enabling.** Env injects **only** `WAGGLE_WORKSPACE_ID` (`tool-launcher.ts:226`). It does *not* set `WAGGLE_SIGNAL_EMIT`/`WAGGLE_SIDECAR_URL`, so a dock-launched tool saves memory but stays **silent on the bus** unless the user globally exported the flag. The headline flow doesn't fire itself.
4. **No isolation, no persistence, no orchestration.** Child inherits full `process.env` + cwd; no worktree/sandbox; tracker lost on restart; `launchTool` is one-shot fire-and-forget (no queue, retry, fan-out, completion callback).

### 2b. Memory substrate (hive-mind-core — the moat, and it's strong)

- **LoCoMo 87.66% same-judge SOTA** (+5.71pp over Memori, p<10⁻⁵) is delivered by a genuine hybrid stack, not one trick: FTS5/BM25 + sqlite-vec dense + chunk-level vectors + RRF (k=60) + ONNX cross-encoder rerank + KG contextual scoring, all in `mind/search.ts:118`.
- Carries **both** representations: distilled/structured lanes (KG entities/relations, profile/fact/event) **and** a verbatim per-turn lane (`harvest/raw-turns.ts`) credited with the single-hop win.
- **Offline-first by default:** in-process ONNX embedder (~23MB all-MiniLM, `inprocess-embedder.ts`) + reranker (~22MB ms-marco-MiniLM, `inprocess-reranker.ts`) on CPU, zero API keys; provider chain degrades gracefully.
- **Write-time temporal dating** (`frames.ts` createdAt override + `scoring.ts` decay + `recall-context.ts` [YYYY-MM-DD] anchoring) is why temporal leads (+32.7pp vs Mem0).
- **Bitemporal KG already exists:** `knowledge.ts` carries `valid_from`/`valid_to` soft-delete + dedup/merge + entity→frame bridge.

**Honest memory gaps (relevant to the comparison):**
- **Not a zero-loss verbatim archive by default.** Primary ingest is the 4-pass LLM distillation (`harvest/pipeline.ts`); it keeps *summaries*, and `classifyFailureFallback='skip'` can drop whole batches on an LLM hiccup. Even the raw-turn lane caps at 2000 turns/conv, caps body length, skips system messages, drops injection-flagged turns, and content-hash-dedups — so it is **not** an append-only literal log.
- **No source-span provenance gate.** Frames don't link to an immutable archive span; there's no "demote unsupported claims" verifier. We can't currently *measure* an extraction-hallucination rate.
- **Full ingestion is not purely offline** — distillation needs an LLM. Only retrieval/rerank/embed are local.

---

## 3. paperclip (`paperclipai/paperclip`)

**What it is (verified by recon):** MIT-licensed Node.js + React **control plane** that orchestrates *teams* of external coding agents into a "company" (org charts, budgets, goals, governance, audit). ~70k stars, launched Mar 2026, pseudonymous solo maintainer (@dotta). Explicit boundary: *"Paperclip orchestrates. Agents run wherever they run and phone home."* It is **not** an execution plane and has **no memory layer** — that's the gap vs Waggle.

**Launching/orchestration model:** a DB-backed (PostgreSQL) **Heartbeat Execution** engine — a wakeup queue that per-tick does budget check → workspace resolution → secret injection → skill loading → adapter invocation. Four execution patterns: local CLI/session adapters (start/**resume** Claude Code, Codex, Gemini, etc.), shell-command execution, fire-and-forget HTTP/webhook, and **dynamically-loaded plugin adapters** (`~/.paperclip/adapter-plugins.json`, zero hardcoded imports, `createServerAdapter()`). Execution isolation via **git worktrees + operator branches**. Atomic task checkout (single-assignee) + per-agent monthly budget hard-stops.

**Call: STEAL (patterns; code is MIT so legally portable, but PG-centric → port ideas).**

| What to steal | Why | Where it lands in Waggle | Effort |
|---|---|---|---|
| **Heartbeat scheduler** (DB-backed wake queue: budget→workspace→secret→skill→invoke) | Cleaner orchestration spine than our chat/cron split; generalizes the new `job_type:'loop'` executor toward waking *external* tools, not just internal report-only loops | `packages/server` Loops/cron layer + `packages/agent` loop executor | **L** |
| **Pluggable adapter contract** (`createServerAdapter()` + dynamic load) | We hardcode 7 tools in `tool-launcher.ts`/`tool-detection.ts`; an adapter registry lets self-hosted installs add runtimes without core edits | `tool-launcher.ts` + turn each `hive-mind-hooks-*` into a registered adapter | **M** |
| **Session resume across heartbeats** | Paperclip reattaches Claude Code/Codex sessions to prior task context; our "Running" badge is one-shot | `tool-process-tracker.ts` + `/api/tools/launch` (add resume-by-session-id) | **M** |
| **Git-worktree execution isolation** | We have *no* isolated exec workspace; concurrent launches collide in one workspace | alongside `LauncherApp` + `/api/tools/launch` + `packages/core` FileStore | **M** |
| **Per-agent budget caps + atomic task checkout** | Maps directly onto `CostTracker` (`packages/agent/src/cost-tracker.ts`); reinforces the L2 approval-queue governance already shipped | `cost-tracker.ts` + Loops/approval-queue | **M** |
| **Goal-ancestry context chain** (mission→project→goal→task injected each run) | Cheap, high-value; always supplies the "why," complements hive-mind recall | orchestrator `buildSystemPrompt()` | **S** |

**Risks:** control-plane/"company of agents" thesis ≠ our workspace-native memory-first positioning — adopt mechanisms, not narrative. Solo pseudonymous maintainer (bus factor). Young/fast-moving — AGENTS.md references a fork shipping only `hermes_local`/`hermes_gateway`, so the polished multi-adapter marketing may outrun code maturity (verify adapter implementations before porting). PostgreSQL heartbeat queue must be re-implemented on SQLite — not a lift-and-shift.

---

## 4. jaylfc/taOS

**What it is:** self-hosted Python/FastAPI agent OS that deploys long-lived agents into LXC/Docker containers and auto-clusters across consumer hardware. Headline: a **multi-framework group chat** where agents on ~15 different Python frameworks collaborate in one channel while *the platform* (not the framework) owns memory, files, credentials, identity — *"containers hold code, hosts hold state."* That principle directly parallels our memory-moat thesis. Source-available (Sustainable Use License — **not OSS**), beta, ~519 stars, solo maintainer.

**Launching model — important framing correction:** taOS does **NOT** launch external CLI coding agents (no Claude Code/Codex process orchestration). It deploys *in-process Python agent frameworks* into containers. So it is **not** a direct competitor to Waggle's launcher — it's an adjacent design point. The valuable part is the **collaboration seam**: (1) a shared SSE bridge (`/api/.../sessions/{slug}/events` + `/reply`) where heterogeneous agents join via ~25–100-LoC adapters translating a **universal message envelope** to each framework's native API; (2) an A2A message bus with realtime wake (`a2a-watch`) for point-to-point messaging. (True cross-framework delegation hand-off is explicitly deferred/unimplemented.)

**Stack fit:** **poor** for the runtime, **good** for the patterns. Python/FastAPI + LXC/systemd + sysfs hardware probing are Linux-server assumptions that don't port to our Windows/macOS Tauri 2.0 + Node sidecar. Adopt the *architecture*, not the code.

**Call: PARTIAL (patterns only — non-OSS license blocks code reuse for a commercial product).**

| What to steal | Where it lands | Effort |
|---|---|---|
| **Universal message envelope + thin per-adapter registry** (~25–100 LoC each) — lets Claude Code / Codex / Cursor sessions post into ONE shared Waggle channel instead of separate silos | `packages/waggle-dance` (normalized cross-agent message schema) | **M** |
| **SSE-bridge group-chat seam** — our SignalBus + bridge is *already this shape* (`signal-bus.ts` + `waggle-dance-bridge.ts`); extend it to carry routed **chat turns**, not just discovery/skill_share | `signal-bus.ts` + `waggle-dance.ts` | **M** |
| **"Containers hold code, hosts hold state" as an explicit launcher contract** — bind `WAGGLE_WORKSPACE_ID` memory + workspace files on the host so a launched agent's state survives swapping the underlying CLI | launcher env-injection + hook-capture (already in `LauncherApp`/shim-core) | **S** |
| **Backend-driven capability discovery** (poll live backends for model/worker readiness, gate UI) vs filesystem discovery | model-route / spawn-agent path (helps open work #1 third-tier fallback) | **M** |
| **A2A direct-messaging bus w/ realtime wake** — point-to-point agent coordination without round-tripping the UI channel | WaggleDance v2 | **L (defer)** |

**Convergent-validation signal (not a steal):** taOS independently picked LiteLLM + SQLite/FTS5 + ONNX hybrid search + temporal KG + LongMemEval/LoCoMo benchmarking — the *same* substrate choices as hive-mind-core. Their **97.0% claim is Recall@5 on LongMemEval-S (retrieval-only); end-to-end judge is 43–51%.** This is **not comparable** to our 87.66% LoCoMo end-to-end same-judge SOTA — different benchmark, different metric. Do not let a casual reader equate them.

---

## 5. jaylfc/taosmd vs Waggle memory (head-to-head)

taOSmd is taOS's memory layer, separately published. Thesis: **provable, auditable memory** — a zero-loss append-only verbatim archive is the source of truth; every extracted fact is tagged with its archive span; a background verifier demotes unsupported claims (the **recall gate**). Five substrates (temporal KG, vector, zero-loss archive, session catalog, crystal store) over SQLite + ONNX CPU embeddings + local Qwen3-4B. **License: MIT + Commons Clause** (cannot sell as a hosted service → re-implement ideas, never copy code). ~62 stars, single author, README self-corrected an inflated 74.6%→43–51% end-to-end after a bug fix.

| Capability | Waggle (hive-mind-core) | taOSmd | Who leads |
|---|---|---|---|
| End-to-end accuracy | **LoCoMo 87.66% same-judge SOTA** | LoCoMo 0.748 lenient / 0.659 strict *retrieval*; **e2e judge 43–51%** | **Waggle** (and not comparable on the headline) |
| Retrieval stack | FTS5+sqlite-vec+chunk+RRF+CE rerank+KG | hybrid + RRF/mem0_additive/**MaxSim late-interaction** + bge-v2-m3 rerank | ~Tie; taOSmd has MaxSim we lack |
| Verbatim archive | raw-turn lane, but **lossy** (2000-turn cap, body cap, dedup, skips system msgs) | **append-only JSONL, never overwritten, source of truth** | **taOSmd** |
| Source-span provenance / hallucination gate | **none** (can't measure extraction-hallucination) | **claims tagged to spans + verifier + `prefer_verified` demotion**; measures 18.8% unsupported | **taOSmd** |
| Temporal | write-time dating + decay (+32.7pp vs Mem0) | validity windows + point-in-time queries | ~Tie; taOSmd's *explicit validity windows* are sharper |
| Bitemporal KG | `valid_from`/`valid_to` exists in `knowledge.ts` | validity-windowed triples + supersession | ~Tie |
| Fully offline ingestion | **No** — distillation needs LLM (retrieval is offline) | **Yes** — local Qwen3-4B + ONNX, zero API keys | **taOSmd** |
| Maturity / trust | production SOTA, regression-locked | beta, single author, self-corrected benchmark | **Waggle** |
| Security default | injection scan at every boundary, parameterized queries | HTTP server ships **no auth** on :7900 | **Waggle** |

**Concrete steal list (ideas, not code — Commons Clause):**

1. **Provable-memory recall gate** *(highest-value memory idea)* — tag each frame/claim with its originating harvest span id; run a background verifier (reuse `contradiction-detector.ts` plumbing); let `HybridSearch` (`search.ts`) down-rank unverified claims via a `prefer_verified` flag. Attacks an extraction-hallucination class we currently can't even measure, and feeds the EU-AI-Act audit-trail goal. Lands in `packages/hive-mind-core/src/mind/`. **Effort M.**
2. **Zero-loss verbatim archive as a first-class immutable tier** — elevate raw ingested text to an append-only, never-overwritten store every frame links back to (precondition for #1 and for audit). Lands in `harvest/raw-turns.ts` + schema. **Effort M.** *(Note: this complements, does not replace, distillation — see §9.)*
3. **MaxSim late-interaction as a selectable fusion mode** — low-risk retrieval lever to A/B on the LoCoMo harness against the current reranker. `search.ts` `SearchOptions`. **Effort S.**
4. **Explicit temporal validity windows on KG relations** — we already have `valid_from`/`valid_to`; add point-in-time query + supersession surfacing to harden the temporal lead and enable "what was true as of date X" for Identity/Awareness. `knowledge.ts`. **Effort M.**

**Do not adopt:** the five-substrate complexity wholesale, the no-auth HTTP server, the 384→1024 zero-pad waste (we already do this — separate cleanup), or their self-reported numbers as validated.

---

## 6. jaylfc/tuiui — PROVISIONAL (unverified)

**Recon returned `null` for this repo.** It could not be fetched — likely 404, private, renamed, or a misremembered name. **No conclusions can be drawn.** The implied premise (a TUI / terminal-multiplexer UI, by the `tui` + `ui` name) maps to a genuine Waggle gap: §2a gap #1 — the launcher has **no terminal/PTY/live-output surface** for launched agents. *If* such a project exists, the concept worth borrowing for `LauncherApp.tsx` is a **PTY-backed live-output pane** (node-pty piped through the sidecar, streamed to a dock terminal view) so users can watch/attach to a launched agent instead of waiting for a Stop-hook frame. **Action: re-run recon with a verified URL before treating any of this as prior art.** Until then, treat the PTY idea as sourced from §2a's own gap analysis, not from tuiui.

---

## 7. Gap Analysis

| Capability | Waggle today | paperclip | taOS | Best-in-class | Priority |
|---|---|---|---|---|---|
| Detect installed external tools | **Strong** (7 tools, hook-status w/ backup verify) | adapter-declared | n/a (no CLI launch) | **Waggle** | — |
| Launch external CLI agent | Yes, detached fire-and-forget | Yes, via adapters + heartbeat | No | paperclip | — |
| **Self-enabling launch (signals on by default)** | **No** (only `WAGGLE_WORKSPACE_ID`) | Yes | n/a | paperclip | **P0** |
| **Live output / PTY / attach** | **None** (`stdio:'ignore'`) | partial (tracks runs) | SSE channel | tuiui? (unverified) | **P1** |
| Session resume / reattach | No (one-shot badge) | **Yes** (across heartbeats) | host-state persists | paperclip | **P1** |
| Process persistence across restart | **No** (in-memory) | Yes (DB-backed) | Yes (host state) | paperclip | **P1** |
| Execution isolation (worktree/sandbox) | **None** (inherits env+cwd) | **Yes** (worktrees+branches) | container-per-agent | paperclip / taOS | **P1** |
| Orchestration (queue/retry/fan-out/budget) | **None** (202 & forget) | **Heartbeat + budget caps** | A2A bus | paperclip | **P2** |
| Multi-agent group chat | discovery signals only | org-chart routing | **universal-envelope SSE** | taOS | **P2** |
| Memory: end-to-end accuracy | **87.66% SOTA** | **none** | retrieval-only/43–51% e2e | **Waggle** | — |
| Memory: zero-loss verbatim archive | lossy | none | **append-only** | taOSmd | **P2** |
| Memory: provenance / hallucination gate | **none** | none | **recall gate** | taOSmd | **P2** |
| Memory: fully-offline ingestion | retrieval only | none | **yes** | taOSmd | **P3** |

---

## 8. Recommendation & Phased Plan

Respecting Waggle constraints: TS monorepo + Tauri 2.0, sovereignty/offline-first, injection-scanning + vault-only secrets + no-eval, and the memory+harvest-free-forever moat.

### STEAL NOW (this arc / next)

| # | Item | What & why | Where (files) | Effort | Risk |
|---|---|---|---|---|---|
| **1** | **Self-enabling, identified launch env** | Inject `WAGGLE_SIGNAL_EMIT`, `WAGGLE_SIDECAR_URL`, `runId`, `taskId` alongside `WAGGLE_WORKSPACE_ID` so a dock launch actually lights the bus it built. **Highest leverage — turns the dark pipeline on.** | `tool-launcher.ts:226-229` | **S** | Low. Keep emit opt-out per-tier. |
| **2** | **Persist the process tracker** | Pidfile-backed store + boot reconciliation so Running badges/kill/attribution survive sidecar restart. | `tool-process-tracker.ts` (`register()` seam) | **S/M** | Low. |
| **3** | **Fix UI/backend cohort drift** | Drive `HOOKS_COHORT` from `tool-launcher.ts` (6 real) instead of hardcoded `['claude-code']`; expose codex/cursor/hermes/openclaw install in the dock. | `LauncherApp.tsx:57` | **S** | Low. Smoke each installer. |
| **4** | **PTY live-output pane** | node-pty in the sidecar, piped stream to a dock terminal view (swap `stdio:'ignore'` for piped via the `spawnDetached` DI seam). Closes the "no eyes" gap; the §6 tuiui premise. | `tool-launcher.ts:96-109` + new `/api/tools/stream` + `LauncherApp` | **M** | Med — cross-platform PTY on Windows; injection-scan any echoed prompt. |
| **5** | **Pluggable adapter contract** | `createServerAdapter()`-style registry + dynamic load so self-hosted installs add runtimes without core edits (paperclip's cleanest idea). Refactors the 7 hardcoded tools into adapters. | `tool-launcher.ts` + `shared/tool-detection.ts` + `hive-mind-hooks-*` | **M** | Med — keep the DI test harness green. |
| **6** | **Goal-ancestry context chain** | Inject mission→project→goal→task "why" each run; cheap orchestrator win complementing recall. | orchestrator `buildSystemPrompt()` | **S** | Low. |

### STEAL SOON (memory moat — needs founder sign-off on cost)

| # | Item | What & why | Where | Effort | Risk |
|---|---|---|---|---|---|
| **7** | **Zero-loss verbatim archive tier** | Append-only, never-overwritten raw store every frame links back to (provenance anchor + EU-AI-Act audit). **Additive — does not replace distillation.** | `harvest/raw-turns.ts` + `mind/schema.ts` | **M** | Med — storage growth; needs retention policy. |
| **8** | **Provable-memory recall gate** | Tag frames→spans, background verifier (reuse `contradiction-detector.ts`), `prefer_verified` down-rank in `HybridSearch`. First time we can *measure* extraction-hallucination. | `mind/search.ts` + `mind/scoring.ts` + `contradiction-detector.ts` | **M** | **Founder call:** per-ingest LLM verify cost vs free-forever moat. Gate behind a flag; verify async/batched. |
| **9** | **MaxSim late-interaction fusion (A/B)** | Selectable fusion mode; low-risk retrieval lever to test on LoCoMo harness — **must not regress 87.66%.** | `mind/search.ts` `SearchOptions` | **S** | Low — behind flag, A/B only. |
| **10** | **Explicit KG validity-window queries** | Point-in-time + supersession on existing `valid_from`/`valid_to`; hardens temporal lead. | `mind/knowledge.ts` | **M** | Low. |

### DEFER

| # | Item | Why defer |
|---|---|---|
| 11 | **Git-worktree execution isolation** | High value (concurrent-launch collisions) but **L** effort; do after PTY + persistence land and multi-launch is real. Founder call on whether desktop users need per-task worktrees yet. |
| 12 | **Heartbeat scheduler** | Generalize `job_type:'loop'` toward waking *external* tools — but it's an **L** rework of the just-shipped Loops layer; let Loops v0/L2 get usage feedback first. |
| 13 | **Per-agent budget caps + atomic checkout** | Maps to CostTracker; do alongside heartbeat. **Founder call:** do external-agent launches count against budget, at which tier? |
| 14 | **Universal-envelope group chat / A2A bus** | WaggleDance v2 territory; build after single-agent launch is observable and resumable. |
| 15 | **Fully-offline distillation (local Qwen)** | Nice for SBC/KVARK sovereign story, but distillation-quality risk; retrieval is already offline. |

**Founder decisions needed:** (A) recall-gate LLM verify cost vs free-forever moat (#8); (B) whether launched external agents consume per-agent budget, and tier gating (#13); (C) re-run recon on a verified `tuiui` URL before citing it (#4/§6).

---

## 9. What NOT To Do (anti-recommendations)

1. **Do NOT rewrite the SOTA memory substrate to chase taosmd's framing.** We hold 87.66% LoCoMo end-to-end same-judge SOTA; taosmd's headline is Recall@5 retrieval (97%) with **43–51% end-to-end**. The verbatim-archive + recall-gate ideas are *additive provenance tiers*, **not** a replacement for our distillation+hybrid pipeline. Any change to `search.ts`/`scoring.ts` must A/B against the LoCoMo harness and not regress 87.66%.
2. **Do NOT take a Python runtime (taOS/taosmd) into the Tauri binary.** LXC/systemd/sysfs/FastAPI are Linux-server assumptions incompatible with the Windows/macOS Node-sidecar desktop. Port architecture, not runtime.
3. **Do NOT copy code from taOS or taosmd.** taOS = Sustainable Use License (non-OSS); taosmd = MIT + **Commons Clause** (no selling as a service). Waggle is commercial (KVARK demand-gen). Re-implement ideas cleanly; cite as prior art at most.
4. **Do NOT adopt paperclip's PostgreSQL heartbeat queue as-is.** Re-implement the *pattern* on SQLite/better-sqlite3; a PG dependency breaks the single-file sovereign deploy.
5. **Do NOT import taosmd's no-auth HTTP server pattern.** Our sidecar already guards origins; keep injection-scan-at-every-boundary and vault-only secrets.
6. **Do NOT adopt paperclip's "zero-human company of agents" narrative.** It clashes with workspace-native, memory-first, human-in-the-loop positioning (and the just-shipped L2 approval queue). Mechanisms yes, thesis no.
7. **Do NOT spawn launched agents with full ambient credentials indefinitely.** Today the child inherits all of `process.env`. When adding orchestration (#11–13), scrub/scope env and inject vault secrets per-execution (paperclip's encrypted-at-rest, not-in-prompt model is the bar).
8. **Do NOT cite CLAUDE.md §10 OW-3's "6 stub hooks" as current.** Recon shows 6 real / 1 stub; update the doc when the cohort-drift fix (#3) lands.
9. **Do NOT treat tuiui findings as real** until a verified URL is re-recon'd. The PTY recommendation stands on §2a's own gap analysis regardless.

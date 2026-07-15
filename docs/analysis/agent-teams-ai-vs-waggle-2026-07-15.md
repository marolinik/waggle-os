# Agent Teams AI vs Waggle OS — Competitive Teardown & Steal List

**Date:** 2026-07-15
**Target:** https://github.com/777genius/agent-teams-ai (v2.1.2, HEAD `1e018a1f`, pushed 2026-07-15)
**Method:** shallow clone + 3 parallel deep-read agents (architecture/Kanban, runtime adapters, differentiators). Cross-corroborated; one hallucinated claim (a `docs/product-analysis/WAGGLE-OS-PRODUCT-INTELLIGENCE.md`) verified NOT to exist and discarded.

> **⚠ LICENSE: AGPL-3.0.** Ideas and mechanism designs only. **Zero code copy** into Waggle (proprietary). Their copyleft is deliberate — likely SaaS-later moat.

---

## 1. What Agent Teams AI is

Electron 40 + React 19 + Zustand desktop app (pnpm, ~2,300 TS files) that orchestrates **teams of external coding-agent runtimes** through a Kanban board. "Manage agents like a CTO manages engineers." Free, local-first, zero telemetry (analytics functions are literally no-op stubs), single $0 pricing tier, Discord community, agentteams.live landing (Nuxt, ~30 locales).

**Runtime reality vs marketing:** the "9 supported tools" (Claude Code, Codex, OpenCode, Cursor, SuperGrok, Copilot, Z.AI, MiniMax, Kiro) are NOT 9 adapters. Two bundled sidecar binaries do everything:
- `claude-multimodel` (from their closed `777genius/agent_teams_orchestrator` repo) — one multi-provider runtime with `anthropic | codex | gemini | opencode` providers inside.
- `terminal-platform` daemon — PTY/terminal workspace.

Cursor/Grok/Z.AI/MiniMax/Kiro are just **model routes through OpenCode/OpenRouter** plus provider-auth connections. The "free model no auth" hook = OpenCode's built-in `opencode/big-pickle` route (`accessKind: 'builtin_free'`).

**Notable:** the actual teammate launcher + change-ledger **writer** live in the external closed-source orchestrator CLI, not in the AGPL repo. The open repo is the shell: board state engine (`agent-teams-controller/`), readers, review UI, MCP server (FastMCP, tool groups team/task/lead/kanban/review/message/process/runtime/workSync/crossTeam).

## 2. Category comparison

| Dimension | Agent Teams AI | Waggle OS |
|---|---|---|
| Core object | Kanban task executed by external coding CLIs | Workspace agent with persistent memory |
| Memory | None (rides Claude's own JSONL; no substrate) | FrameStore + HybridSearch + KG + Identity/Awareness — **the moat they don't have** |
| Agent runtime | External CLIs (2 sidecar binaries) | Own agent-loop + LiteLLM routing + personas |
| Multi-agent | Lead-orchestrator + teammates, worktree isolation, runtime lanes | WaggleDance signals, subagent-orchestrator, coordinator persona |
| Code change control | **Hunk-level review + content-addressed change ledger** — their crown jewel | Review-before-apply proposals (skills only, steal #3 arc) |
| External tool launch | Detect/install/launch 2 runtimes; provider auth bridge | Launcher: 7-tool cohort detect/launch + 6 hook packages (AI-OS arc) |
| Harvest/import | None | 10+ adapters, dedup, sticky erasure |
| Monetization | $0 only, AGPL copyleft, no Stripe anywhere | 4-tier, Stripe live, KVARK funnel |
| Compliance | Nothing (no redaction, no audit trail in OSS repo) | install_audit, execution traces, compliance/, GDPR erasure, EU AI Act story |

**Verdict: adjacent, not head-on.** They orchestrate *coding* agents on repos; Waggle is a general workspace agent platform with memory. Overlap zone = our AI-OS/Launcher arc + subagent orchestration. Their memory-less design means every team relaunch starts cold — our substrate is exactly the gap they can't close without building one.

## 3. Steal list (mechanisms, not code — AGPL)

### Tier 1 — high value, direct fit
1. **Post-compact context re-injection** (`TeamProvisioningService.injectPostCompactReminder` + `handleCompactBoundary`). On `compact_boundary` stream event, re-inject standing rules + fresh task snapshot into the agent — strict one-shot flag, deferral guards (only when agent idle, no relay in-flight), re-arm on re-compact, and instruction "do NOT start new work this turn, reply one status line." We persist compaction summaries as memory frames (#12, just shipped); the *active re-injection with idle guards* is the missing half for our agent-loop long-runs.
2. **Rate-limit auto-resume** (`AutoResumeService.ts`). Parse reset time out of provider error, `setTimeout` nudge ~30s after reset; guards: 12h ceiling, staleness, **run-id capture** (never nudge a session that advanced), re-check alive at fire. Pure-function plan (`scheduled | manual{reason}`) = testable. Fits agent-loop + ai_task scheduler (#17).
3. **Scheduler hardening trio** for our cron-store/ai_task: (a) **warm-up timer** — pre-provision runtime N min before cron tick; (b) **auto-pause after N consecutive failures** (default 3); (c) **interrupted-run recovery** — on boot, mark prior-process `running/pending` runs `failed_interrupted`. Plus cwd-exclusion lock so two schedules never share a directory.
4. **Tool-approval coordinator patterns** (`RuntimeToolApprovalCoordinator.ts`) to harden our `confirmation.ts`/`permissions.ts`: per-team timeout **actions** (allow|deny|wait), in-flight response claiming (no double-answer), **stale-runId rejection**, live `reEvaluate()` of pending approvals when settings change.

### Tier 2 — strong, larger arcs
5. **Task-change ledger (content-addressed)** — append-only JSONL events per task + sha256 blob store + precomputed summary bundles + freshness stamp (size+mtime+sha256 of 4KB journal tail) for validated-vs-degraded fast path. For Waggle this is a **compliance asset**: agent file-mutation audit trail with provenance/confidence tiers slots straight into our EU-AI-Act/install_audit story, and enables agent-change review UI later.
6. **Hunk-level review of agent edits** (their crown jewel): accept/reject per hunk, decisions keyed by stable original indices + context hashes (replay-safe over recompute), reject applied via snippet reverse-replacement with diff3 fallback, stale-check before apply, 10-deep undo. Big arc; extends our review-before-apply from skills to file edits. Only worth it when Waggle agents do heavy multi-file work.
7. **Stall monitor + turn-settled control plane.** Level-triggered scanner classifying "is agent actually progressing," alert dedupe journal; provider-neutral Stop-hook "turn settled" spool→drain→reconciler. We already ship Stop hooks (`maybeEmitDiscovery`, WAGGLE_SIGNAL_EMIT) — extending to turn-settled telemetry gives Mission Control real liveness.
8. **Provenance-tiered cost attribution** — source-confidence enum (`sdk_exact → gateway_exact → log_parsed → tokenizer_estimated → cost_estimated`) + **"API-equivalent cost"** shown even on subscription/free runtimes (great free-tier framing: "Waggle saved you $X"). Budget evaluator engineering: single-flight drain queue, config fingerprint skip, per-period dedupe keys (threshold notifies once/month). Extends our cost-tracker.

### Tier 3 — cheap wins / process
9. **Critical-coverage test config** — separate vitest project gating ONLY security-boundary files (IPC guards, path decode) with hard thresholds, instead of blanket 80%. Cheap, high-leverage; we could scope one to injection-scanner, vault, channels SEC paths, erasure.
10. **Interactive shell-env resolver** — spawn user's login shell → `env -0` to capture real PATH (single-flight, 12s timeout, SIGTERM→SIGKILL, cooldown, best-effort background variant). Directly relevant to our `tool-detection.ts`/Launcher misses when Tauri inherits bare env.
11. **Board-as-DAG research note** (`adaptive-task-graphs-research-note.md`) — tasks=nodes, blockedBy=edges, ready work = graph frontier; **selective verification scaled to graph impact**; straggler release as first-class action; coordination-metrics panel (idle rounds, straggler tail, wasted tokens). Feed into WaggleDance/subagent-orchestrator design when we do multi-agent task graphs.
12. **Agent-graph live viz** (`packages/agent-graph`, d3-force + canvas, port/adapter isolated) — animated org-chart of running agents with message particles. Mission Control candy; concept only (AGPL).
13. **docs/research/ corpus** (~65 files) — ready-made competitive/architecture lit review: ACP deep-dive, CLI-adapter exhaustive search, inter-agent communication standards, orchestrator competitor patterns. Worth one reading pass for the WaggleDance roadmap.

### Explicitly NOT steal
- Their runtime-adapter layer — we already own our agent runtime; wrapping external CLIs as workers is their category, not ours.
- Kanban board as primary UX — wrong center of gravity for Waggle (memory/chat-first). Task DAG concepts (item 11) transfer without the board.
- Their gap we already beat: no memory, no harvest, no secret redaction on agent output, no telemetry/product signal, no monetization rail.

## 4. Recommended sequencing (founder call)

- **Quick arc (days):** #2 rate-limit auto-resume, #3 scheduler trio, #4 approval hardening, #9 critical-coverage config, #10 shell-env resolver. All bolt onto shipped Tier-3 steal infra (#17 ai_task, channels, confirmation).
- **Medium arc:** #1 post-compact re-injection (pairs with shipped #12), #7 turn-settled liveness, #8 API-equivalent cost framing.
- **Strategic (separate proposal):** #5 change ledger as compliance/audit feature — strongest differentiated fit (EU AI Act) — then #6 hunk review on top if/when agents do heavy file work.

## 5. Session-log note

Their repo is itself built by agent teams (guardrail file forbids testing team-launch on named real projects; `.controller-compact-prompt` broker re-prime prompt checked in). Test fixtures break Windows checkout (`Filename too long` under `test/fixtures/team/task-change-ledger/`) — their content-addressed fixture paths exceed MAX_PATH; if we build a ledger, keep blob dirs shallow.

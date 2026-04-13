---
type: entity
entity_type: project
name: Waggle OS
confidence: 0.98
sources: 25
last_compiled: 2026-04-13
---

# Waggle OS

## What It Is

A desktop AI agent platform where agents have persistent memory, communicate
via the Waggle Dance protocol, and work across isolated workspaces. Ships as
a Tauri 2.0 binary (Windows + macOS) with a React frontend and Node.js sidecar.

Strategic function: demand-creation engine for [[KVARK]]. Users experience
AI-native work individually, get hooked on persistent memory, upgrade to teams,
then need sovereign deployment.

Named after the waggle dance — how bees communicate location of food sources.
Chosen March 6, 2026. Runners-up: Hivemind, Apis, Mycel.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui
- **Desktop shell:** Tauri 2.0 (Rust)
- **Backend:** Fastify sidecar (Node.js, bundled into Tauri)
- **Memory:** SQLite via better-sqlite3 + sqlite-vec (see [[Mind Architecture]])
- **Auth:** Clerk (JWT)
- **Design:** Hive DS — honey #e5a000, hive-950 #08090c, accent #a78bfa
- **LLM routing:** 3-layer stack (see [[LLM Provider Stack]])

## What's Built (verified April 13)

| Feature | Status |
|---------|--------|
| 22 agent personas | Shipped |
| 80+ agent tools | Shipped |
| 148 MCP connectors (visual catalog) | Shipped |
| 6-layer .mind memory architecture | Shipped |
| Memory Harvest (ChatGPT, Claude, Gemini, Claude Code) | Shipped |
| Knowledge Graph (typed entities + relations) | Shipped |
| HybridSearch (FTS5 + vector + RRF) | Shipped |
| Per-workspace isolation + cross-workspace search | Shipped |
| Shared team memory (push-on-write, pull-on-activate) | Shipped |
| S3/MinIO storage for team files | Shipped |
| Tiered autonomy (Normal/Trusted/YOLO) | Shipped |
| The Room (multi-window workspace with per-window personas) | Shipped |
| Trial expiry modal + onboarding auto-trial | Shipped |
| Budget hard cap (soft warn + hard stop) | Shipped |
| Ollama/local inference (hardware scan + model recs) | Shipped |
| Docker stack (Postgres, Redis, MinIO, LiteLLM) | Shipped |
| 40/40 E2E tests passing | Shipped |
| Memory MCP plugin (14 tools, 5 fixes applied) | Shipped |

## Monetization

See [[Tier Strategy]] for full details.

Trial 15d (everything) → Free (5ws, agents) → Pro $19 → Teams $49/seat → KVARK.
Memory + Harvest free forever as moat.

## The Journey (what actually happened)

**The ugly start (Mar 27 - Apr 1):** Backend broken, CORS issues, vault
invisible, agents returning "local mode" errors. Marko: *"fuck all broken."*
Multiple restart-the-server cycles. Deep audit rounds to find unwired code.

**The grind (Apr 1-7):** Multiple full-codebase audit passes. UI/UX overhaul
with 12-persona simulation and 48-gap analysis. Agent intelligence sprint —
9 features, 112 tests. Persona expansion to 22.

**The acceleration (Apr 8-10):** Structural refactors (chat.ts, personas.ts
split). ULTRAPLAN Phases 1-9 in a single mega session (11 commits, 120 files,
17K lines). First real Memory Harvest — 156 frames from Claude Code sessions.

**The killer sprint (Apr 11-12):** Phases A+B (The Room, filesystem, tiered
autonomy) in one day. Binary verification — 11 bugs found and fixed. E2E
suite green. Phases C+D. Tier restructure. Binary built.

**The mega finish (Apr 13):** 29 commits. Entire P0-P4 backlog cleared. Team
memory, S3 storage, global KG, budget cap, Ollama, Memory MCP plugin — all
shipped in one session. Dead `app/src/` removed (13K LOC, 77 files).

## What's Left

1. **Stripe products** — Marko creates PRO + TEAMS in Stripe dashboard
2. **Code signing** — purchase certificate for Windows installer
3. **Wiki Compiler** — spec complete (1,639 lines), not yet built
4. **GEPA prompt optimization** — enable smaller models matching Opus quality

## Known Architectural Decisions

- **Open core model** (like GitLab, Supabase) — open: agent core, MCP, skills.
  Proprietary: GEPA, Memory Weaver, multi-tenant server, admin, SSO.
- **Desktop-first, not web-first** — Tauri for native performance + local data
- **SQLite not Postgres for personal data** — zero deps, portable, .mind file IS the memory
- **Memory + Harvest free forever** — moat strategy, never paywall the core value

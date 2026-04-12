# Waggle OS — System Map

**Date:** 2026-04-12
**Purpose:** Complete system map for a non-coder product owner and any engineer joining the project.
**Extends:** WAGGLE-CORNERSTONE.md (product state + build plan). This doc covers *system internals*.

---

## 1. Architecture Overview

```
USER
  |
  v
┌──────────────────────────────────────────────────┐
│         TAURI SHELL (Rust, ~120 MB binary)        │
│  Spawns sidecar, tray icon, Ctrl+Shift+W toggle   │
│  Watchdog: restarts sidecar on crash (max 5/10m)   │
└──────────────────────────────────────────────────┘
                     │ hosts webview at localhost:3333
                     v
┌──────────────────────────────────────────────────┐
│       REACT DESKTOP OS (apps/web/)                │
│  Window manager, dock, 18+ apps, SSE streaming     │
│  Talks to sidecar via HTTP + SSE + WebSocket       │
└──────────────────────────────────────────────────┘
                     │ HTTP POST/GET + SSE streams
                     v
┌──────────────────────────────────────────────────┐
│       SIDECAR (Node.js + Fastify, port 3333)      │
│  150+ routes, agent loop, tool execution           │
│  LLM: LiteLLM proxy (4000) or built-in Anthropic  │
└──────────────────────────────────────────────────┘
                     │ direct function calls
                     v
┌──────────────────────────────────────────────────┐
│       CORE (TypeScript library packages)           │
│  MindDB (SQLite), FrameStore, KnowledgeGraph       │
│  HybridSearch, Harvest, Compliance, Vault          │
│  Each workspace = its own .mind SQLite file        │
└──────────────────────────────────────────────────┘
```

**Why this matters:** Every user action flows through exactly this stack. There are no hidden services or external dependencies for core functionality.

---

## 2. Data Flows

### Chat Message Flow
```
User types message → adapter.ts POST /api/chat
  → Sidecar resolves workspace session (WorkspaceSessionManager)
  → Builds system prompt (orchestrator.ts: identity + awareness + memory recall)
  → Agent loop: POST to LLM provider (streaming)
  → SSE events back: token, step, tool_start, tool_end, done
  → Frontend useChat.ts parses SSE → renders in ChatApp
```

### Memory Save Flow
```
Agent calls save_memory tool
  → FrameStore.createIFrame() or createPFrame()
  → SHA-256 dedup check (500-frame window)
  → INSERT into memory_frames + FTS5 index
  → Embed via active provider → INSERT into vec table
  → CognifyPipeline: extract entities → KnowledgeGraph upsert
  → MemoryLinker: find related frames
```

### Memory Recall Flow
```
User query arrives → orchestrator.recallMemory()
  → Catch-up detection ("where were we?")
  → HybridSearch: parallel FTS5 keyword + sqlite-vec k-NN
  → RRF fusion (K=60) → relevance scoring (temporal/popularity/importance/contextual)
  → Top results injected into system prompt
```

---

## 3. Surface Area

| Category | Count | Key Files |
|----------|-------|-----------|
| HTTP API routes | 150+ | packages/server/src/local/routes/ |
| Agent tools | 60+ | packages/agent/src/*-tools.ts (22 files) |
| MCP catalog entries | 149+ (auto-syncs to 2000+) | packages/shared/src/mcp-catalog.ts |
| Keyboard shortcuts | 21 | apps/web/src/hooks/useKeyboardShortcuts.ts |
| Audit event types | 13 | packages/server/src/local/routes/events.ts |
| SSE streams | 3 | /api/chat, /api/events/stream, /api/notifications/stream |
| Personas | 22 | packages/agent/src/personas.ts |
| Frontend apps | 18+ | apps/web/src/components/os/apps/ |

---

## 4. Memory Architecture

### Frame Types (the fundamental unit)
- **I-Frame (Identity):** Foundational memory — "User prefers bullet points"
- **P-Frame (Procedural):** Incremental update — "Updated: also prefers dark mode"
- **B-Frame (Bridging):** Cross-references between frames

### Search Pipeline
1. **Keyword search** via FTS5 (stop-word filtered, OR-based)
2. **Vector search** via sqlite-vec (k-NN embedding lookup)
3. **RRF Fusion** combines both (K=60 reciprocal rank)
4. **Relevance scoring** with 4 profiles: balanced, recent, important, connected

### Embedding Providers (probed in order)
1. InProcess (Xenova/all-MiniLM-L6-v2, 384→1024 dims, zero config)
2. Ollama (nomic-embed-text, needs local Ollama)
3. Voyage AI (voyage-3-lite, needs API key)
4. OpenAI (text-embedding-3-small, needs API key)
5. Mock fallback (deterministic, always available)

### Memory Harvest (external import)
4-pass pipeline: **Classify** (Haiku) → **Extract** (Sonnet) → **Synthesize** (Sonnet) → **Dedup** (local)
Supports: ChatGPT, Claude, Claude Code, Gemini, Perplexity, Grok, Cursor, Copilot exports.

### Learning / EvolveSchema
ImprovementSignals table tracks 3 categories:
- `capability_gap` — missing tools (threshold: 2 occurrences)
- `correction` — user behavior corrections (threshold: 3)
- `workflow_pattern` — recurring task shapes (threshold: 3)
Surfaced to user as actionable suggestions (max 3 at a time).

---

## 5. Production Subsystems

### Billing (Stripe)
- **Status:** Implemented
- Checkout sessions for BASIC ($15/mo) and TEAMS ($79/mo)
- Webhook handler for subscription lifecycle
- Poll-based tier sync for desktop apps behind NAT
- Tier definitions in packages/shared/src/tiers.ts with capability matrices

### Auth (Clerk)
- **Status:** Implemented (cloud only)
- JWT validation via @clerk/fastify
- Desktop app uses bearer token auth (wsToken from /health)
- Auto-provisioning from JWT claims

### Vault (Secret Management)
- **Status:** Implemented
- AES-256-GCM encryption with per-entry IV
- Machine-local key file (.vault-key, mode 0600)
- API routes for reveal/list/set/delete
- 3 test files including concurrency and edge cases

### Offline Queue
- **Status:** Implemented
- Periodic LLM health check (30s interval)
- Message queue persisted to offline-queue.json
- Auto-retry on reconnection

### Telemetry
- **Status:** Implemented (privacy-first)
- All data in local ~/.waggle/telemetry.db
- Never tracks: message content, memory, file paths, API keys
- Daily aggregation of tools, commands, errors

### EU AI Act Compliance
- **Status:** Implemented
- Art. 12: Interaction audit logging
- Art. 14: Human oversight tracking (approved/denied/modified)
- Art. 19: 6-month log retention
- Art. 26: Deployer monitoring
- Art. 50: Model transparency
- Template-level risk classification (minimal/limited/high-risk)

### Rate Limiting
- **Status:** Implemented
- Per-endpoint: /api/chat (120/min), /api/vault/reveal (5/min), /api/backup (2/min)
- Security headers: CSP, X-Frame-Options, X-XSS-Protection
- API search tools: daily limits (Perplexity 100, Tavily 50, Brave 100)

### KVARK Enterprise
- **Status:** Partially implemented
- kvark_search + kvark_ask_document tools exist
- KvarkClient with JWT lifecycle
- UI settings panel stubbed ("MOCK: Remove this fallback once real KVARK is wired")

### Tauri Bundle
- **Status:** Implemented
- Windows NSIS + macOS DMG targets
- Auto-updater with GitHub Releases endpoint
- No code signing configured yet
- Signature fields in latest.json empty

---

## 6. Testing

| Type | Count | Framework |
|------|-------|-----------|
| Unit/Integration tests | 305 files | Vitest |
| E2E tests | 11 spec files | Playwright |
| Visual regression | 14 baselines | Playwright screenshots |
| Phase A/B verification | 13 tests, all passing | Playwright |

---

## 7. Production-Ready Checklist

| Item | Status | Notes |
|------|--------|-------|
| Core chat loop | GREEN | Multi-session, multi-persona, streaming |
| Memory persistence | GREEN | 199 frames in personal.mind, dedup works |
| Workspace isolation | GREEN | Each workspace = separate SQLite |
| Offline mode | GREEN | Queue + auto-retry |
| Billing/tiers | AMBER | Stripe wired, needs production keys |
| Auth | GREEN | Clerk (cloud) + bearer token (desktop) |
| Vault encryption | GREEN | AES-256-GCM, tested |
| Compliance | GREEN | AI Act articles covered |
| Rate limiting | GREEN | Per-endpoint limits active |
| Auto-updater | AMBER | Configured, signatures empty |
| Code signing | RED | Not configured |
| KVARK integration | AMBER | Backend exists, UI stubbed |
| Error boundary | AMBER | Toast notifications only, no global boundary |
| E2E coverage | GREEN | 13/13 Phase A/B tests passing |

---

*Generated 2026-04-12. Extends WAGGLE-CORNERSTONE.md.*

# Phase 3A: Agent Critical Path Quality Audit

**Auditor**: Production Readiness Review (automated)
**Date**: 2026-03-20
**Scope**: Agent loop, memory, vault, cron, connectors, sub-agents
**Status**: READ-ONLY review -- no files modified

---

## Findings

### CQ-001: Rate-limit retry decrements turn counter without bound
- **Severity**: HIGH
- **Package**: @waggle/agent
- **File**: packages/agent/src/agent-loop.ts:129
- **Issue**: When a 429 rate-limit response is received, the code does `turn--` to retry the same turn. If the API keeps returning 429, the turn counter repeatedly decrements. Combined with the 60-second cap on wait time, a persistently rate-limited endpoint causes the loop to run indefinitely (turn goes negative, never reaches maxTurns).
- **Impact**: Agent loop never terminates. Consumes server resources and holds the SSE connection open indefinitely. User sees an endlessly "thinking" agent.
- **Fix**: Add a max-retry counter (e.g., 5 retries) for 429 responses. Once exhausted, throw or return a graceful error message instead of continuing to retry.

### CQ-002: Transient error retry also decrements turn counter without bound
- **Severity**: HIGH
- **Package**: @waggle/agent
- **File**: packages/agent/src/agent-loop.ts:140
- **Issue**: Same pattern as CQ-001 for 502/503/504 errors. The `turn--` on line 140 allows infinite retries if the upstream keeps returning server errors, because the `turn < maxTurns - 1` guard on line 136 is defeated by the decrement.
- **Impact**: Infinite loop when upstream is persistently unhealthy. The exponential backoff caps at 10 seconds, so this burns through retries rapidly.
- **Fix**: Use a separate retry counter (e.g., max 3) rather than decrementing the turn counter.

### CQ-003: LoopGuard only detects consecutive identical calls
- **Severity**: MEDIUM
- **Package**: @waggle/agent
- **File**: packages/agent/src/loop-guard.ts:16-28
- **Issue**: The LoopGuard only tracks the *last* tool call hash. If the LLM alternates between two equivalent calls (A, B, A, B...), the guard never triggers because each call differs from the one immediately before it. This defeats the purpose of the loop guard for oscillating patterns.
- **Impact**: LLM can waste all 200 turns in an A/B oscillation pattern without the guard intervening.
- **Fix**: Track a rolling window of recent call hashes (e.g., last 10) and detect any hash appearing more than N times in the window, not just consecutive duplicates.

### CQ-004: No token budget enforcement
- **Severity**: MEDIUM
- **Package**: @waggle/agent
- **File**: packages/agent/src/agent-loop.ts (entire file), packages/server/src/local/routes/chat.ts:734
- **Issue**: The agent loop tracks token usage (totalInputTokens, totalOutputTokens) but never enforces a budget. With maxTurns=200 and no token cap, a complex conversation can consume hundreds of thousands of tokens before reaching the turn limit. The CostTracker records usage but has no enforcement mechanism.
- **Impact**: Runaway token consumption leading to unexpectedly large API bills. A single conversation could cost $10-50+ with Opus models at 200 turns.
- **Fix**: Add a `maxTokenBudget` config option to AgentLoopConfig. Check cumulative usage after each turn and terminate gracefully if the budget is exceeded.

### CQ-005: Conversation history grows unbounded in memory
- **Severity**: MEDIUM
- **Package**: @waggle/server
- **File**: packages/server/src/local/routes/chat.ts:591-594
- **Issue**: The `sessionHistories` map stores full conversation history in RAM and grows without limit. The entire history is sent to the LLM on every turn as `messages: history`. For long-running sessions, this causes: (a) increasing memory usage on the server, (b) ever-growing token costs as the context window fills, (c) eventual context window overflow causing API errors.
- **Impact**: Server OOM for power users with long sessions. Token costs escalate with every message even for short follow-ups.
- **Fix**: Implement a sliding window or summarization strategy. Keep the last N messages in full context, and summarize older messages into a compact context block. Add a max history length check.

### CQ-006: SQL injection vector in HybridSearch.indexFrame
- **Severity**: HIGH
- **Package**: @waggle/core
- **File**: packages/core/src/mind/search.ts:194-196
- **Issue**: The `indexFrame` method constructs SQL with string interpolation: `` `INSERT INTO memory_frames_vec (rowid, embedding) VALUES (${id}, ?)` ``. While the code does `Math.trunc(frameId)` to sanitize the ID, this pattern is fragile. If `frameId` is NaN (e.g., from a corrupted DB read), `Math.trunc(NaN)` returns `NaN`, producing invalid SQL `VALUES (NaN, ?)`. The same pattern exists on line 209 in `indexFramesBatch`.
- **Impact**: Database errors on NaN frame IDs. While not exploitable for injection (Math.trunc produces numbers or NaN), the non-parameterized pattern sets a bad precedent and could break on edge cases.
- **Fix**: Validate that `frameId` is a finite integer before interpolation. Add a guard: `if (!Number.isFinite(id)) throw new Error('Invalid frame ID')`. Better yet, investigate whether sqlite-vec actually requires literal rowid or if a parameterized approach exists.

### CQ-007: Vault key stored as hex in plaintext file
- **Severity**: MEDIUM
- **Package**: @waggle/core
- **File**: packages/core/src/vault.ts:56
- **Issue**: The vault encryption key is stored in `.vault-key` as a hex string with mode 0o600. While file permissions restrict access, the key is in plaintext on disk. On Windows, the `mode: 0o600` parameter in `writeFileSync` has no effect -- Windows does not support Unix file permissions this way. The key file is readable by any process running as the same user.
- **Impact**: On Windows (the primary platform), the vault key has no access control beyond user-level permissions. Any local process running as the same user can read the key and decrypt all vault secrets.
- **Fix**: On Windows, use DPAPI (Data Protection API) via native bindings to protect the key file, or store the key in Windows Credential Manager. At minimum, document this limitation. Consider using `fs.chmod` with ACL-based permissions on Windows.

### CQ-008: Vault read-then-write race condition
- **Severity**: MEDIUM
- **Package**: @waggle/core
- **File**: packages/core/src/vault.ts:96-103
- **Issue**: The `set()` method does `readVault()` then `writeVault()` non-atomically. If two concurrent operations (e.g., agent saving a connector credential while cron job refreshes another) both read the vault file, modify their entry, and write back, one write overwrites the other's changes.
- **Impact**: Lost vault entries under concurrent access. While the desktop app is typically single-user, background processes (cron, sub-agents) could trigger concurrent vault writes.
- **Fix**: Use a file lock (e.g., `proper-lockfile`) or write to a temporary file and atomically rename. Alternatively, use a mutex/semaphore around vault operations.

### CQ-009: MindDB has no explicit close-on-error handling
- **Severity**: LOW
- **Package**: @waggle/core
- **File**: packages/core/src/mind/db.ts:9-20
- **Issue**: If `sqliteVec.load()` or `initSchema()` throws during MindDB construction, the database connection opened on line 10 is never closed. The constructor does not wrap initialization in try/catch with cleanup.
- **Impact**: Leaked database handles if initialization fails (e.g., corrupted schema, missing sqlite-vec native module). In a retry scenario, each failed attempt leaks a handle.
- **Fix**: Wrap the constructor body in try/catch. In the catch block, call `this.db.close()` before re-throwing.

### CQ-010: Sub-agent registries use module-level globals
- **Severity**: MEDIUM
- **Package**: @waggle/agent
- **File**: packages/agent/src/subagent-tools.ts:51-53
- **Issue**: `activeAgents`, `agentResults`, and `agentCounter` are module-level globals shared across all requests and sessions. They are never cleared. Over a long server lifetime: (a) `agentResults` accumulates every sub-agent result ever produced (potential memory leak), (b) agent IDs use a monotonically increasing counter that never resets, (c) there is no per-session or per-workspace isolation.
- **Impact**: Unbounded memory growth from accumulated sub-agent results. Cross-session pollution if the server handles multiple concurrent users in team mode.
- **Fix**: Scope the registries to the request or session. At minimum, add a cleanup/pruning mechanism that removes results older than N minutes. Consider moving these maps into a per-session state object.

### CQ-011: Background tasks never cleaned up
- **Severity**: MEDIUM
- **Package**: @waggle/agent
- **File**: packages/agent/src/system-tools.ts:25, 77-88
- **Issue**: The `backgroundTasks` map (module-level global) accumulates entries for every background task ever started. Completed/failed/killed tasks remain in the map forever with their stdout/stderr buffers. There is no eviction or cleanup logic.
- **Impact**: Memory leak proportional to background task usage. Each task retains its full stdout/stderr output indefinitely.
- **Fix**: Add a cleanup sweep that removes completed tasks after a timeout (e.g., 30 minutes). Or limit the map to N entries, evicting the oldest completed tasks when full.

### CQ-012: SearchCache grows without bound
- **Severity**: LOW
- **Package**: @waggle/agent
- **File**: packages/agent/src/web-search-utils.ts:6-26
- **Issue**: The `SearchCache` only checks TTL on `get()`. Expired entries remain in the map until they are next accessed. If many unique queries are made but never re-queried, the cache grows indefinitely.
- **Impact**: Minor memory leak. Each entry is a search result string, so it grows slowly. In practice, the 5-minute TTL limits the growth rate, but stale entries are never proactively evicted.
- **Fix**: Add a periodic sweep (e.g., every 100 inserts) to remove expired entries, or use a max-size LRU cache.

### CQ-013: Approval gate auto-approves after 5-minute timeout
- **Severity**: MEDIUM
- **Package**: @waggle/server
- **File**: packages/server/src/local/routes/chat.ts:684-691
- **Issue**: The approval gate for destructive operations auto-approves after 5 minutes if the user does not respond. This is a security concern -- if the user walks away, a pending `write_file`, `git_commit`, or `install_capability` action silently proceeds.
- **Impact**: Destructive operations execute without user consent if the UI is left unattended. This undermines the entire approval gate system for operations that were explicitly flagged as requiring confirmation.
- **Fix**: Change the timeout to auto-**deny** rather than auto-approve, or significantly increase the timeout (30+ minutes). At minimum, make the timeout behavior configurable.

### CQ-014: Injection scanner threshold allows combined low-score attacks
- **Severity**: LOW
- **Package**: @waggle/agent
- **File**: packages/agent/src/injection-scanner.ts:61
- **Issue**: The scanner flags content as unsafe only when `score >= 0.3`. However, a `prompt_extraction` pattern alone scores 0.4, which correctly triggers the guard. A `role_override` alone scores 0.5. But the issue is that the threshold is hardcoded and not configurable. More importantly, the scanner only runs on tool *output*, not on user input in the chat route -- the chat route does not call `scanForInjection` on user messages before passing them to the LLM.
- **Impact**: User-provided prompt injection in chat messages is not scanned. The scanner only protects against indirect injection via tool outputs.
- **Fix**: Also scan user messages before they enter the agent loop context. Consider adding the scanner to the chat route pre-processing.

### CQ-015: Connector errors not isolated -- single connector failure affects all
- **Severity**: LOW
- **Package**: @waggle/agent
- **File**: packages/agent/src/connector-registry.ts:103-109
- **Issue**: Individual connector action execution has try/catch (good), but the `generateTools()` method iterates all connected connectors synchronously. If `connector.actions` throws during iteration (e.g., a connector that lazily loads actions and fails), the entire tool generation fails and no connector tools are available.
- **Impact**: A single broken connector prevents all connector tools from being generated. In practice, `connector.actions` is a readonly property so this is unlikely, but the pattern lacks defensive isolation.
- **Fix**: Wrap each connector's tool generation in try/catch within `generateTools()` so a failed connector is skipped rather than blocking others.

### CQ-016: Cron scheduler silently swallows job execution errors
- **Severity**: LOW
- **Package**: @waggle/server
- **File**: packages/server/src/local/cron.ts:65
- **Issue**: When a cron job executor throws, the error is caught and silently ignored (empty catch block). The job is not marked as run (`markRun` is skipped), so it will retry on the next tick -- but there is no retry limit, no error logging, and no way for the user to know a job is failing.
- **Impact**: Silently failing cron jobs with infinite retry. A permanently broken job executor causes every tick to re-attempt the same failed job(s), potentially wasting resources.
- **Fix**: Add error logging. Implement a failure count per job (stored in the schedule record) and disable jobs that fail more than N consecutive times. Add a `last_error` field to CronSchedule.

### CQ-017: LIKE-based fallback search in tools.ts susceptible to SQL wildcard injection
- **Severity**: MEDIUM
- **Package**: @waggle/agent
- **File**: packages/agent/src/tools.ts:181-184
- **Issue**: The `search_memory` tool's LIKE fallback constructs patterns using `%${keyword}%` where `keyword` comes from the user's search query. SQL LIKE patterns treat `%` and `_` as wildcards. A search query containing `%` or `_` characters would alter the LIKE matching semantics, potentially returning unintended results.
- **Impact**: Unexpected search results when queries contain SQL wildcard characters. Not a data corruption risk (SELECT only), but could be exploited to extract broader data than intended from the knowledge store.
- **Fix**: Escape `%` and `_` in keywords before interpolation into LIKE patterns (e.g., `keyword.replace(/%/g, '\\%').replace(/_/g, '\\_')` with `ESCAPE '\\'` clause).

### CQ-018: multi_edit is not truly atomic on write failure
- **Severity**: MEDIUM
- **Package**: @waggle/agent
- **File**: packages/agent/src/system-tools.ts:639-641
- **Issue**: The `multi_edit` tool validates all edits first (good), then applies them in memory (good), but the final write phase (lines 639-641) writes files one at a time. If the process crashes or disk space runs out mid-write, some files are updated and others are not, leaving the workspace in an inconsistent state.
- **Impact**: Partial writes on crash or disk-full scenarios. The tool claims to be "atomic" but does not use write-ahead or temp-file-then-rename patterns.
- **Fix**: Write each file to a temporary path first (e.g., `.tmp` suffix), then rename all temp files to their final paths in a second pass. Rename is atomic on most filesystems.

### CQ-019: SubagentOrchestrator extends EventEmitter but listeners are never cleaned up
- **Severity**: LOW
- **Package**: @waggle/agent
- **File**: packages/agent/src/subagent-orchestrator.ts:59
- **Issue**: `SubagentOrchestrator` extends `EventEmitter` and emits `worker:status` events. However, there is no mechanism to ensure listeners are removed after a workflow completes. If the orchestrator instance is reused across workflows, listeners from previous workflows accumulate.
- **Impact**: Potential memory leak and unexpected behavior if old listeners fire on new workflow events. Node.js will emit a MaxListenersExceededWarning after 10 listeners.
- **Fix**: Call `this.removeAllListeners()` at the start of `runWorkflow()`, or scope listeners to each workflow run.

### CQ-020: No graceful shutdown for agent loop on server stop
- **Severity**: MEDIUM
- **Package**: @waggle/server
- **File**: packages/server/src/local/routes/chat.ts:779
- **Issue**: When the chat endpoint starts `agentRunner(agentConfig)`, there is no cancellation mechanism. If the server receives SIGTERM or the user quits the app, the agent loop continues running until the process is forcefully killed. There is no AbortController or cancellation token passed to the agent loop.
- **Impact**: Orphaned agent loops that continue making LLM API calls after the user has closed the application. Potential for wasted API credits and incomplete tool operations.
- **Fix**: Add an AbortSignal to AgentLoopConfig. Pass the server's shutdown signal to the agent loop. Check the signal between turns and abort gracefully.

### CQ-021: Vault encryption key read assumes valid hex encoding
- **Severity**: LOW
- **Package**: @waggle/core
- **File**: packages/core/src/vault.ts:53
- **Issue**: `ensureKey()` reads the key file and calls `Buffer.from(content, 'hex')`. If the file is corrupted or contains non-hex characters, `Buffer.from` silently produces a shorter buffer rather than throwing. This corrupted key would then silently fail all encryption/decryption operations, with decryption failures caught and returning `null`.
- **Impact**: If the key file is corrupted, all vault operations silently fail. New secrets are encrypted with a corrupted key and cannot be recovered. The user sees no error -- vault entries simply appear to not exist.
- **Fix**: Validate the key buffer length after reading: `if (key.length !== KEY_LENGTH) throw new Error('Vault key file is corrupted')`. This surfaces the problem immediately rather than silently degrading.

### CQ-022: FTS5 index and memory_frames table can become inconsistent
- **Severity**: LOW
- **Package**: @waggle/core
- **File**: packages/core/src/mind/frames.ts:42-48, 153-157
- **Issue**: Frame creation (INSERT into `memory_frames`) and FTS5 indexing (INSERT into `memory_frames_fts`) are performed as two separate statements, not wrapped in a transaction. If the process crashes between the two inserts, the frame exists but is not FTS-indexed. Similarly, vector indexing in `search.ts:indexFrame` is a separate async call that can fail independently.
- **Impact**: Orphaned frames that are not searchable by keyword (FTS) or semantic similarity (vector). The LIKE-based fallback mitigates this for FTS, but vector search has no fallback.
- **Fix**: Wrap the frame INSERT and FTS INSERT in a single transaction. For vector indexing, consider a reconciliation job that detects unindexed frames and indexes them.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0     |
| HIGH     | 3     |
| MEDIUM   | 10    |
| LOW      | 9     |
| **Total**| **22**|

### HIGH findings (require fixes before V1 ship):

1. **CQ-001/CQ-002**: Rate-limit and transient error retries can cause infinite loops via unbounded turn counter decrement.
2. **CQ-006**: SQL interpolation in vector indexing -- fragile pattern that breaks on NaN frame IDs.

### Overall Assessment

The agent critical path is **architecturally sound** with good separation of concerns, proper layering (orchestrator, agent-loop, tools, cognify pipeline), and solid defensive patterns (injection scanner, approval gates, loop guard, path traversal protection, confirmation gates). The codebase shows evidence of mature engineering practices: error isolation in tool execution, graceful degradation when LiteLLM is unavailable, and proper SSE streaming.

**Key strengths:**
- Approval gates with trust model for destructive operations
- Injection scanning on tool outputs
- Path traversal protection in system tools (`resolveSafe`)
- FTS5 query sanitization to prevent operator injection
- WAL mode and foreign keys enabled on SQLite
- Proper error boundaries in the agent loop (tool execution errors don't crash the loop)
- Good separation between personal and workspace minds

**Primary risk areas:**
- **Infinite loop potential** (CQ-001, CQ-002) is the most urgent fix needed -- a persistently failing upstream could hang the server
- **Unbounded growth** patterns (CQ-005, CQ-010, CQ-011, CQ-012) are typical of a young product but need attention before high-usage scenarios
- **Windows security gap** (CQ-007) for vault key protection is a platform-specific concern that should be documented or mitigated
- **No token budget enforcement** (CQ-004) is a cost risk that could surprise users
- **Auto-approve timeout** (CQ-013) undermines the security model of confirmation gates

The codebase is in good shape for a V1 launch with the HIGH items fixed. The MEDIUM items should be addressed in the first post-launch hardening pass.

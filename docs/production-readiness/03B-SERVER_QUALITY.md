# Phase 3B: Server & API Layer — Production Readiness Audit

**Date**: 2026-03-20
**Scope**: `@waggle/server` — local server (Fastify), routes, SSE, WebSocket, KVARK client, security middleware
**Auditor**: Claude Opus 4.6 (automated code review)
**Method**: Static analysis of all server source files (read-only)

---

## Findings

### CQ-001: CORS Policy Allows All Origins
- **Severity**: CRITICAL
- **Package**: @waggle/server
- **File**: `packages/server/src/local/index.ts:1122`
- **Issue**: CORS is registered with `{ origin: true }`, which reflects any requesting origin as allowed. This means any website can make authenticated requests to the Waggle server if a user visits it while Waggle is running.
- **Impact**: Any malicious webpage can access the full Waggle API (vault secrets, memories, workspaces, agent execution) via cross-origin requests from a user's browser. This is the most exploitable finding in the audit.
- **Fix**: Restrict origin to known sources: `{ origin: ['http://127.0.0.1:*', 'http://localhost:*', 'tauri://localhost'] }`. The team server (`src/index.ts`) correctly uses a configurable `corsOrigin` from env — the local server should do the same.

### CQ-002: SSE Chat Endpoint Echoes Arbitrary Origin in CORS Header
- **Severity**: CRITICAL
- **Package**: @waggle/server
- **File**: `packages/server/src/local/routes/chat.ts:529,535`
- **Issue**: The hijacked SSE response reads `request.headers.origin` and echoes it directly into `Access-Control-Allow-Origin`. If the origin is absent, it falls back to `*`. This bypasses the CORS plugin entirely since `reply.hijack()` skips Fastify middleware.
- **Impact**: Compounds CQ-001. Even if the CORS plugin were fixed, SSE endpoints would remain open to any origin. Combined with `Access-Control-Allow-Credentials: true`, this is a classic CORS misconfiguration enabling credential theft.
- **Fix**: Validate the origin against an allowlist before echoing it. Remove `Access-Control-Allow-Credentials: true` unless session cookies are actually used.

### CQ-003: SSE Anthropic Proxy Echoes Arbitrary Origin
- **Severity**: HIGH
- **Package**: @waggle/server
- **File**: `packages/server/src/local/routes/anthropic-proxy.ts:139,144`
- **Issue**: Same pattern as CQ-002 — the streaming proxy hijacks the response and echoes `request.headers.origin ?? '*'` into CORS headers. This endpoint proxies to Anthropic with real API keys.
- **Impact**: A malicious website could proxy arbitrary LLM requests through the user's Waggle instance, consuming their API credits and exfiltrating the conversation context.
- **Fix**: Apply the same origin allowlist validation as recommended for CQ-001/CQ-002.

### CQ-004: Notification SSE Endpoint Uses Wildcard CORS
- **Severity**: HIGH
- **Package**: @waggle/server
- **File**: `packages/server/src/local/routes/notifications.ts:87`
- **Issue**: The notification SSE endpoint hardcodes `Access-Control-Allow-Origin: '*'`. This allows any website to subscribe to the notification stream and receive all system events.
- **Impact**: Attacker can monitor agent activity, task assignments, approval decisions, and workspace state in real time from any webpage.
- **Fix**: Use the same origin validation as recommended for chat SSE.

### CQ-005: WebSocket Has No Authentication
- **Severity**: HIGH
- **Package**: @waggle/server
- **File**: `packages/server/src/local/index.ts:1191-1233`
- **Issue**: The local server's WebSocket endpoint at `/ws` accepts connections without any authentication check. Any process on the machine (or any website via WebSocket from a browser) can connect and receive all eventBus events, including approval events, agent steps, errors, and notifications.
- **Impact**: An attacker can (a) monitor all agent activity, (b) approve or deny tool confirmations by sending `approve`/`deny` messages, and (c) effectively take control of the agent's approval flow. The `approve` handler on line 1211-1215 resolves pending approvals for any requestId without verifying the sender.
- **Fix**: Add a token-based auth handshake or origin validation for WebSocket connections. At minimum, validate that the connection comes from localhost/Tauri.

### CQ-006: WebSocket removeAllListeners Kills Handlers for All Clients
- **Severity**: HIGH
- **Package**: @waggle/server
- **File**: `packages/server/src/local/index.ts:1228-1232`
- **Issue**: When a WebSocket client disconnects, `eventBus.removeAllListeners(evt)` is called for each event type. This removes ALL listeners for those events, not just the ones registered by the disconnecting client. If two browser tabs are open, the first to disconnect kills event forwarding for the second.
- **Impact**: Multi-client usage is broken — any client disconnect stops event delivery to all remaining clients. Notification stream, approval events, and presence updates all stop working.
- **Fix**: Store per-connection listener references and use `eventBus.removeListener(evt, specificHandler)` on disconnect, which is what the notification SSE endpoint already does correctly (line 124-128).

### CQ-007: Vault Reveal Endpoint Origin Check is Bypassable
- **Severity**: HIGH
- **Package**: @waggle/server
- **File**: `packages/server/src/local/routes/vault.ts:76-87`
- **Issue**: The vault reveal endpoint checks `origin` and `referer` headers to restrict access to local origins. However, (a) these headers are trivially spoofable from non-browser contexts (curl, scripts), (b) if neither `origin` nor `referer` is present (common for same-origin requests), the check passes entirely, and (c) the CORS policy (CQ-001) allows any origin anyway.
- **Impact**: API keys and secrets stored in the vault can be decrypted and exfiltrated by any process that can reach the server, or by any website via the open CORS policy.
- **Fix**: Since this is a local server, the primary defense should be binding to 127.0.0.1 (already done) combined with proper CORS (CQ-001 fix). Consider adding a per-session CSRF token or requiring the Tauri IPC channel for vault reveal.

### CQ-008: Rate Limiter Keys by Route, Not by Client
- **Severity**: MEDIUM
- **Package**: @waggle/server
- **File**: `packages/server/src/local/security-middleware.ts:229`
- **Issue**: The rate limiter key is `${request.method} ${request.routeOptions?.url ?? request.url}` — this is per-route, not per-client. All clients share the same rate limit bucket. A single aggressive client hitting `/api/chat` would block all other clients from the same endpoint.
- **Impact**: In multi-user scenarios (team mode, multiple browser tabs), one client can denial-of-service all others for any rate-limited route.
- **Fix**: Include client IP in the key: `${request.ip}:${request.method} ${request.routeOptions?.url ?? request.url}`.

### CQ-009: Default Rate Limit Too Generous for Sensitive Endpoints
- **Severity**: MEDIUM
- **Package**: @waggle/server
- **File**: `packages/server/src/local/security-middleware.ts:53`
- **Issue**: All endpoints share the same rate limit: 100 requests per 60 seconds. There is no per-endpoint tuning. The `/api/chat` endpoint (which spawns expensive LLM calls), `/api/vault/:name/reveal` (which decrypts secrets), and `/api/backup` (which reads the entire data directory) all get the same limit as read-only GET endpoints.
- **Impact**: An attacker could trigger 100 LLM calls per minute (significant API cost), or hammer the vault reveal endpoint 100 times per minute for brute-force secret enumeration.
- **Fix**: Apply stricter rate limits to expensive/sensitive endpoints: chat (10/min), vault reveal (5/min), backup (1/min), restore (1/min).

### CQ-010: Backup Endpoint Reads Entire Data Directory into Memory
- **Severity**: MEDIUM
- **Package**: @waggle/server
- **File**: `packages/server/src/local/routes/backup.ts:57-92`
- **Issue**: `collectFiles()` recursively reads ALL files under `~/.waggle/` into memory as base64 strings, then constructs a JSON manifest. For large installations with many workspace minds, sessions, and plugins, this could consume hundreds of megabytes of RAM.
- **Impact**: Server could OOM-crash during backup. The synchronous `fs.readFileSync` calls also block the event loop, making the server unresponsive during backup.
- **Fix**: Stream files into the archive instead of loading all into memory. Use `fs.createReadStream` and pipe through the archiver. Consider adding a size cap.

### CQ-011: Restore Endpoint Allows File Write to Arbitrary Paths
- **Severity**: MEDIUM
- **Package**: @waggle/server
- **File**: `packages/server/src/local/routes/backup.ts:313-344`
- **Issue**: The restore endpoint does have a path traversal check (line 320-324, good), but accepts the entire backup payload as a base64-encoded JSON string in the request body. There is no size limit on the body (no `bodyLimit` override like ingest has), so the default Fastify limit of 1MB applies — but the decrypted/decompressed content could be much larger due to compression ratios.
- **Impact**: A crafted backup file could use high compression ratios to create a "zip bomb" effect, expanding to consume all available memory during decompression.
- **Fix**: Add an explicit `bodyLimit` for the restore endpoint. Add a decompressed size limit check before parsing the full manifest.

### CQ-012: Plugin Install Accepts Arbitrary Local Directory Path
- **Severity**: MEDIUM
- **Package**: @waggle/server
- **File**: `packages/server/src/local/routes/skills.ts:588-603`
- **Issue**: `POST /api/plugins/install` accepts a `sourceDir` parameter and passes it to `pluginManager.installLocal(sourceDir)`. There is no validation that the path is within an allowed directory — any local directory can be specified.
- **Impact**: An attacker with API access could install a "plugin" from any directory on the filesystem, potentially loading and executing arbitrary code via the plugin manifest's lifecycle hooks.
- **Fix**: Validate that `sourceDir` is within an allowed directory (e.g., `~/.waggle/plugins/` or a designated plugin source directory). Reject absolute paths pointing outside allowed roots.

### CQ-013: No Request Body Size Limit on Most Routes
- **Severity**: MEDIUM
- **Package**: @waggle/server
- **File**: `packages/server/src/local/index.ts:211`
- **Issue**: Fastify is created with `Fastify({ logger: false })` and no explicit `bodyLimit`. The default is 1MB, which is reasonable for most routes. However, the import commit endpoint (`/api/import/commit`) accepts arbitrary-sized ChatGPT/Claude export JSON without any size validation, and the backup restore endpoint accepts large base64 payloads.
- **Impact**: Large import payloads could consume significant memory during JSON parsing. While Fastify's 1MB default provides some protection, explicitly setting limits on large-payload endpoints would be more robust.
- **Fix**: Add `bodyLimit` configuration to import, backup/restore, and marketplace routes that accept potentially large payloads.

### CQ-014: SSE Chat Endpoint Does Not Handle Client Disconnect
- **Severity**: MEDIUM
- **Package**: @waggle/server
- **File**: `packages/server/src/local/routes/chat.ts:514-867`
- **Issue**: The chat SSE endpoint hijacks the response and runs the agent loop, but there is no listener for the client's connection close event. If the user navigates away or closes the tab, the agent loop continues running (consuming LLM tokens) until it completes or errors.
- **Impact**: Abandoned chat requests waste API credits. In worst case, 200-turn agent loops with multi-step tool use could run unattended for minutes after the user has left.
- **Fix**: Add `request.raw.on('close', () => { ... })` to set an abort signal or flag that the `onToken` callback checks. The approval gate already has a 5-minute timeout (line 684-690), but the main loop should also respect client disconnection.

### CQ-015: Pending Approval Auto-Approve After 5 Minutes
- **Severity**: MEDIUM
- **Package**: @waggle/server
- **File**: `packages/server/src/local/routes/chat.ts:684-690`
- **Issue**: If a confirmation gate approval is not responded to within 5 minutes, it is automatically approved (`resolve(true)`). This means destructive operations (file writes, git commits, shell commands) proceed without user consent if the user walks away.
- **Impact**: Unattended approval of potentially destructive agent actions. An attacker who triggers an approval-required action and then prevents the UI from showing the approval dialog (e.g., by flooding the SSE stream) could auto-approve dangerous operations.
- **Fix**: Default to auto-deny instead of auto-approve on timeout. The safer default is `resolve(false)` — the agent should report that the operation timed out rather than proceeding without confirmation.

### CQ-016: Error Messages May Leak Internal Details
- **Severity**: MEDIUM
- **Package**: @waggle/server
- **File**: `packages/server/src/local/routes/chat.ts:857`
- **Issue**: The catch block in the chat handler has a fallback case `errorMessage = err.message` that forwards the raw error message to the client. While common cases are handled (ECONNREFUSED, 401, timeout), unexpected errors (e.g., file system errors, SQL errors) will have their raw messages exposed.
- **Impact**: Internal details like file paths, SQL table names, or module resolution errors could leak to the frontend, aiding reconnaissance.
- **Fix**: In the fallback case, use a generic message: `'An internal error occurred. Check server logs for details.'` and log the full error server-side.

### CQ-017: Session Timeout Uses IP as Session Identifier
- **Severity**: LOW
- **Package**: @waggle/server
- **File**: `packages/server/src/local/security-middleware.ts:149-161`
- **Issue**: The session timeout tracker uses `request.ip` as the session identifier. Behind a proxy or in Docker, multiple users may share the same IP, causing one user's activity to reset another's timeout. Also, `request.ip` is `127.0.0.1` for all local connections, making the timeout apply globally rather than per-session.
- **Impact**: In team mode, all local connections share one timeout counter. The timeout is effectively meaningless for the local server since all traffic comes from 127.0.0.1.
- **Fix**: Use a session token (cookie or header) instead of IP for timeout tracking. For the local server, the timeout is less relevant, but if team mode is accessed via the local server, proper session identification is needed.

### CQ-018: CSP Allows unsafe-inline and unsafe-eval
- **Severity**: LOW
- **Package**: @waggle/server
- **File**: `packages/server/src/local/security-middleware.ts:23`
- **Issue**: The Content-Security-Policy includes `'unsafe-inline' 'unsafe-eval'` for script-src. This effectively negates CSP's XSS protection for scripts.
- **Impact**: If an XSS vector exists in the frontend (e.g., rendering unsanitized memory content), the CSP will not block inline script execution. The CSP provides a false sense of security.
- **Fix**: For production, remove `unsafe-eval` and `unsafe-inline` from script-src. Use nonce-based CSP. This requires build-time changes to the React frontend (Vite supports CSP nonces).

### CQ-019: Team Server WebSocket Auth is Token = UserId
- **Severity**: HIGH
- **Package**: @waggle/server
- **File**: `packages/server/src/ws/gateway.ts:22-23`
- **Issue**: The team server WebSocket `authenticate` handler sets `userId = event.token` — the token IS the user ID. There is no JWT verification, no Clerk token validation, and no signature check. Any client can authenticate as any user by sending their user ID.
- **Impact**: Complete impersonation of any team member. An attacker can join any team, send messages as any user, and receive all team communications. Combined with the WebSocket connection manager, they can broadcast to all team members.
- **Fix**: Use the same Clerk JWT verification that the REST routes use (`fastify.authenticate`). Verify the token, extract the user ID from the JWT claims, and only then proceed with team operations.

### CQ-020: No Ping/Pong Heartbeat on WebSocket Connections
- **Severity**: LOW
- **Package**: @waggle/server
- **File**: `packages/server/src/local/index.ts:1191-1233` and `packages/server/src/ws/gateway.ts:10-104`
- **Issue**: Neither the local server's WebSocket endpoint nor the team server's gateway implements WebSocket ping/pong frames. The only heartbeat is on the notification SSE stream (30s interval). Dead WebSocket connections will not be detected until a write fails.
- **Impact**: Connection leaks from stale WebSocket connections. The ConnectionManager will accumulate dead entries that never get cleaned up. Over time, this could cause memory growth and broadcast failures (sending to dead sockets).
- **Fix**: Configure `@fastify/websocket` with `{ options: { clientTracking: true } }` and implement periodic ping/pong. Alternatively, set `server.websocketServer.options.perMessageDeflate = false` and add a 30s ping interval.

### CQ-021: Memory Search Endpoint Returns Unbounded Results
- **Severity**: LOW
- **Package**: @waggle/server
- **File**: `packages/server/src/local/routes/memory.ts:56-57`
- **Issue**: The limit parameter on `/api/memory/search` is parsed from the query string without a maximum cap: `const maxResults = limit ? parseInt(limit, 10) : 20`. A client can request `?limit=999999` and receive all memory frames.
- **Impact**: Large memory databases could produce very large response payloads, consuming bandwidth and potentially causing client-side issues.
- **Fix**: Cap the limit: `Math.min(parseInt(limit, 10), 200)`.

### CQ-022: Export Endpoint Loads All Frames Without Limit
- **Severity**: LOW
- **Package**: @waggle/server
- **File**: `packages/server/src/local/routes/export.ts:40-41`
- **Issue**: `frameStore.list({ limit: 100000 })` — exports up to 100,000 frames. For large installations, this creates a very large JSON string in memory before it enters the ZIP archive.
- **Impact**: Memory spike during export. Combined with the archiver, the server may hold multiple copies of the data in memory (raw + JSON-stringified + compressed).
- **Fix**: Stream frames in batches rather than loading all at once. Or accept the 100K cap as reasonable and document the limit.

### CQ-023: LiteLLM API Key Uses Hardcoded Fallback
- **Severity**: LOW
- **Package**: @waggle/server
- **File**: `packages/server/src/local/index.ts:402`
- **Issue**: `const litellmApiKey = process.env.LITELLM_API_KEY ?? process.env.LITELLM_MASTER_KEY ?? 'sk-waggle-dev'`. The fallback `sk-waggle-dev` is a hardcoded development key that is used if no environment variable is set.
- **Impact**: In production deployments where LiteLLM is external, the default key provides no security. This is primarily a deployment hygiene issue — the local server binds to 127.0.0.1 which mitigates exposure.
- **Fix**: Log a warning when using the fallback key. In production configurations, require the key to be explicitly set.

### CQ-024: Workspace Context Endpoint Opens and Closes MindDB Per Request
- **Severity**: LOW
- **Package**: @waggle/server
- **File**: `packages/server/src/local/routes/workspaces.ts:144,197`
- **Issue**: The `/api/workspaces/:id/context` endpoint creates a new `MindDB(mindPath)` instance (line 144), uses it, then explicitly closes it (line 197). But it also calls `activateWorkspaceMind` which caches a separate MindDB instance. This means two SQLite connections are open to the same file simultaneously.
- **Impact**: Potential for SQLite locking issues. Under concurrent access, `SQLITE_BUSY` errors could occur. Not a security issue, but a reliability concern.
- **Fix**: Use `getWorkspaceMindDb()` instead of creating a new MindDB instance, which leverages the existing cache.

### CQ-025: Team Server CORS Uses Configurable Origin But Local Server Does Not
- **Severity**: LOW
- **Package**: @waggle/server
- **File**: `packages/server/src/index.ts:43` vs `packages/server/src/local/index.ts:1122`
- **Issue**: The team server correctly uses `{ origin: config.corsOrigin }` from environment configuration, while the local server uses `{ origin: true }`. This inconsistency suggests the local server's CORS was intentionally left open during development and was never tightened for production.
- **Impact**: See CQ-001 for full impact. This finding highlights the architectural inconsistency.
- **Fix**: Apply the same configurable CORS pattern to the local server.

### CQ-026: No Input Validation on Chat Message Content
- **Severity**: LOW
- **Package**: @waggle/server
- **File**: `packages/server/src/local/routes/chat.ts:517`
- **Issue**: The chat endpoint validates that `message` is present but does not validate its type (could be a number, array, or object), length, or content. A multi-megabyte message string would be passed directly to the LLM API.
- **Impact**: Oversized messages could cause LLM API errors or excessive token costs. Not a direct security vulnerability but a robustness concern.
- **Fix**: Add type checking (`typeof message !== 'string'`) and a reasonable length limit (e.g., 100KB).

### CQ-027: KVARK Client Has Good Error Handling
- **Severity**: INFO (positive finding)
- **Package**: @waggle/server
- **File**: `packages/server/src/kvark/kvark-client.ts`
- **Issue**: The KVARK client demonstrates good practices: typed error classes (`KvarkAuthError`, `KvarkUnavailableError`, etc.), timeout handling with `AbortSignal`, automatic re-auth on 401, and clean error propagation. Token caching is memory-only (no disk persistence of tokens).
- **Impact**: No negative impact. This is noted as a positive example for other parts of the codebase.
- **Fix**: No fix needed. Consider this the reference implementation for external API clients.

### CQ-028: Validate Module Provides Good Path Traversal Protection
- **Severity**: INFO (positive finding)
- **Package**: @waggle/server
- **File**: `packages/server/src/local/routes/validate.ts`
- **Issue**: `assertSafeSegment` uses a strict allowlist regex `/^[a-zA-Z0-9_-]+$/` and is applied consistently across workspace routes. Skills routes also check for `..`, `/`, and `\\`.
- **Impact**: Path traversal attacks on workspace IDs are well-defended. The backup/restore endpoint also has its own path traversal check.
- **Fix**: No fix needed. Ensure all new routes that take path-like parameters use `assertSafeSegment`.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2     |
| HIGH     | 5     |
| MEDIUM   | 8     |
| LOW      | 8     |
| INFO     | 2     |
| **Total**| **25**|

### Critical Issues Requiring Immediate Action

1. **CQ-001**: CORS `origin: true` allows any website to access the full API
2. **CQ-002**: SSE endpoints echo arbitrary origins, bypassing any CORS fix

### High Priority Issues

3. **CQ-003**: Anthropic proxy SSE echoes arbitrary origin (API key exposure risk)
4. **CQ-004**: Notification SSE uses wildcard CORS
5. **CQ-005**: WebSocket has no authentication (approval hijacking risk)
6. **CQ-006**: WebSocket disconnect kills event listeners for all clients
7. **CQ-019**: Team WebSocket auth accepts user ID as token (full impersonation)

### Architecture Notes

- The local server binds to `127.0.0.1` which provides network-level isolation from external attackers. The CORS issues (CQ-001 through CQ-004) are the primary attack surface because they allow browser-based attacks from any webpage the user visits.
- The team server has proper Clerk JWT authentication on REST routes but lacks it on WebSocket connections.
- The security middleware provides reasonable defaults (security headers, rate limiting) but needs per-endpoint tuning for production.
- The KVARK client and path validation module are well-implemented and can serve as reference patterns.

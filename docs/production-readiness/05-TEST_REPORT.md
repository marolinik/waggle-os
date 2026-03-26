# 05 - TEST & COVERAGE REPORT

**Date:** 2026-03-20
**Auditor:** Claude Opus 4.6 (automated, read-only)
**Scope:** All packages, integration tests, E2E tests, visual regression tests

---

## 1. Test Distribution

### Summary Totals

| Metric | Count |
|--------|-------|
| Total test files | 278 |
| Total test cases (it/test) | ~3,762 (packages + root tests) |
| App test cases | 188 |
| Grand total test cases | ~3,950 |

### Per-Package Breakdown

| Package | Source Files | Test Files | Test Cases | Ratio (tests/src) |
|---------|-------------|------------|------------|-------------------|
| `@waggle/agent` | 95 | 95 | 1,272 | 1.00 |
| `@waggle/server` | 92 | 86 | 904 | 0.93 |
| `@waggle/ui` | 102 | 27 | 809 | 0.26 |
| `@waggle/core` | 27 | 24 | 330 | 0.89 |
| `@waggle/marketplace` | 12 | 6 | 160 | 0.50 |
| `@waggle/sdk` | 8 | 5 | 66 | 0.63 |
| `@waggle/cli` | 7 | 7 | 52 | 1.00 |
| `@waggle/worker` | 9 | 4 | 38 | 0.44 |
| `@waggle/weaver` | 3 | 3 | 30 | 1.00 |
| `@waggle/waggle-dance` | 4 | 3 | 25 | 0.75 |
| `@waggle/optimizer` | 3 | 1 | 17 | 0.33 |
| `@waggle/launcher` | 1 | 1 | 13 | 1.00 |
| `@waggle/shared` | 4 | 1 | 9 | 0.25 |
| `@waggle/admin-web` | 10 | 1 | 5 | 0.10 |
| `app` (Tauri desktop) | 66 | 9 | 188 | 0.14 |
| `sidecar` | 6 | 3 | ~20 | 0.50 |
| `tests/` (root integration) | - | 5 | 32 | - |

### Observations

- **agent** and **server** have excellent file-level coverage (1:1 or near it).
- **ui** has low file-level ratio (0.26) -- 102 source files but only 27 test files. Tests exist for utility functions, hooks, and exports but most React component rendering is deferred to "the desktop app's E2E suite."
- **admin-web** has minimal coverage (1 test file / 10 source files, 5 assertions total).
- **app** (Tauri desktop) has 66 source files but only 9 test files. The E2E tests cover startup, chat, workspaces, and regression scenarios via Fastify `inject()` (not browser automation).
- **shared** has only 1 test file for 4 source files.

---

## 2. Test Quality Assessment

### File 1: `packages/core/tests/vault.test.ts` (11 tests)

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Behavior vs implementation | **Behavior** | Tests CRUD operations, encryption verification, migration -- all user-facing behaviors |
| Mock quality | **Excellent** | No mocks needed -- uses real VaultStore with temp directories |
| Edge cases | **Good** | Covers nonexistent keys, idempotent migration, key file reuse, plaintext leak check |
| Assertions | **Meaningful** | Verifies actual decrypted values, file-on-disk encryption format, metadata propagation |
| Test isolation | **Excellent** | Each test creates its own temp dir; afterEach cleans up |
| **Missing** | Wrong password/corrupted vault file scenarios not tested (see Section 3) |

### File 2: `packages/agent/tests/agent-loop.test.ts` (8 tests)

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Behavior vs implementation | **Behavior** | Tests the full agent loop: text response, tool execution, maxTurns, plugin tools, capability routing |
| Mock quality | **Good** | `mockFetch` returns realistic OpenAI-format responses with proper structure |
| Edge cases | **Good** | Tests maxTurns safety, missing tool routing, plugin+base tool merging |
| Assertions | **Meaningful** | Verifies content, tool usage, token counting, fetch call structure, message threading |
| Test isolation | **Good** | Each test creates fresh mocks |
| **Missing** | No tests for: fetch failures/timeouts, rate limiting, malformed LLM responses, concurrent requests |

### File 3: `packages/server/tests/ws/gateway.test.ts` (10 tests)

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Behavior vs implementation | **Behavior** | Tests connection tracking, broadcast, exclusion, send-to-user, closed socket handling |
| Mock quality | **Adequate** | Uses `{ readyState, OPEN, send: vi.fn() }` -- minimal but sufficient for unit tests |
| Edge cases | **Good** | Nonexistent teams, nonexistent users, closed sockets, last-user-leaves cleanup |
| Assertions | **Meaningful** | Checks exact call counts, JSON payload structure, team count |
| Test isolation | **Excellent** | Fresh ConnectionManager per test |
| **Missing** | No reconnection logic tests, no concurrent broadcast tests, no WebSocket error event handling |

### File 4: `packages/agent/tests/connector-sdk.test.ts` (~25 tests)

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Behavior vs implementation | **Behavior** | Tests interface compliance, definition mapping, tool generation, registry CRUD, audit logging, error handling |
| Mock quality | **Good** | MockConnector extends BaseConnector with realistic actions and risk levels; MockVault has proper credential resolution |
| Edge cases | **Good** | API timeout errors, duplicate registration, disconnected connectors, missing credentials, expired tokens |
| Assertions | **Meaningful** | Checks tool name formats, risk level propagation, audit log payloads, error messages |
| Test isolation | **Good** | Fresh registry per test |
| **Missing** | No concurrent connector execution, no partial failure in multi-connector scenarios |

### File 5: `packages/ui/tests/components/chat.test.ts` (~35 tests)

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Behavior vs implementation | **Mixed** | Tests utility functions (getToolStatusColor, formatDuration, processStreamEvent) and verifies exports exist -- but no actual React component rendering |
| Mock quality | **N/A** | No mocks needed for utility function tests |
| Edge cases | **Good** | Covers all tool statuses (done, pending, denied, error, running), legacy fallback without status field |
| Assertions | **Meaningful** | Return value checks for utility functions |
| Test isolation | **Good** | Pure functions, stateless |
| **Missing** | No rendering tests -- relies entirely on desktop E2E. No tests for user interaction flows, form submission, error display, loading states |

---

## 3. Untested Critical Paths

### CRITICAL Severity

| Gap | Description | Risk |
|-----|-------------|------|
| **SSE stream interruption handling** | Zero tests for SSE connection drops, reconnection, or partial event parsing. `useNotifications` hook has reconnection logic in source but no test covers the error/reconnect path. | Users may lose agent output mid-response with no recovery |
| **Vault corruption/wrong key** | Vault tests verify happy path only. No test for: corrupted vault.json, missing/wrong .vault-key file, concurrent write conflicts. | Silent data loss or unrecoverable state |
| **Sub-agent cleanup on failure** | `subagent-tools.test.ts` tests a single error case (LLM connection failed returns error string) but does not verify resource cleanup (open connections, temp files, memory entries) after sub-agent crash. | Resource leaks under failure |
| **WebSocket reconnection logic** | Source code in `useNotifications.ts` and `useSubAgentStatus.ts` has reconnection logic, but no test verifies reconnection actually re-establishes state. | Silent presence/notification failures after network blips |

### HIGH Severity

| Gap | Description | Risk |
|-----|-------------|------|
| **Server route: fleet** | `packages/server/src/local/routes/fleet.ts` -- Mission Control fleet API has zero test coverage | Broken fleet status could go undetected |
| **Server route: import** | `packages/server/src/local/routes/import.ts` -- memory import (ChatGPT/Claude parsers) route has zero direct test coverage. Core `processImport` is tested in `core/tests/memory-import.test.ts` but the HTTP route layer is not. | Import failures at route level undetected |
| **Server route: anthropic-proxy** | Built-in Anthropic proxy (`/v1/chat/completions`) has no dedicated test file. Only tangentially referenced in `health.test.ts`. | Proxy translation bugs (OpenAI -> Anthropic format) undetected |
| **Worker handlers: group-handler.ts, task-handler.ts** | No test files for these handlers. Only `chat-handler.ts` and `waggle-dispatch.ts` are tested. | Background task execution failures undetected |
| **Marketplace: installer.ts, security.ts** | No dedicated test files. `security.ts` (SecurityGate) is partially covered via `cisco-scanner.test.ts` but the installer module has no direct tests. | Broken install flow or security bypass undetected |
| **Admin-web** | 10 source files, 1 test file, 5 assertions total. All 7 page components effectively untested. | Admin dashboard regressions undetected |

### MEDIUM Severity

| Gap | Description | Risk |
|-----|-------------|------|
| **Agent loop: LLM error responses** | No test for HTTP 429 (rate limit), 500 (server error), malformed JSON, or network timeout from the LLM provider | Agent may hang or crash on provider issues |
| **Memory corruption recovery** | `backup-restore.test.ts` exists but no test verifies recovery from a corrupted `.mind` SQLite file (e.g., truncated WAL, invalid schema version) | Unrecoverable personal data loss |
| **Concurrent vault access** | No test for two processes reading/writing vault.json simultaneously | Race condition could corrupt secrets |
| **Sidecar: agent-session.ts, weaver-scheduler.ts** | No tests for these 2 of 6 sidecar source files | Desktop agent session bugs undetected |
| **UI component rendering** | 102 UI source files but zero React rendering tests. All chat, memory, cockpit, settings components tested only via export-existence checks and utility functions. | Visual/interaction regressions undetected without manual testing |
| **Notification routes** | `packages/server/src/local/routes/notifications.ts` has no dedicated route test. `local/notifications.test.ts` tests the notification system but not the SSE streaming endpoint. | Notification delivery failures undetected |
| **Optimizer signatures.ts** | No test coverage for prompt optimization signatures module | Broken GEPA optimization undetected |

---

## 4. E2E Tests

### Vitest-Based E2E (app/tests/e2e/)

| File | Scenarios Covered |
|------|-------------------|
| `startup.test.ts` | Health check, onboarding wizard, settings persistence across restart |
| `chat.test.ts` | Chat message -> SSE token stream, tool events in stream, approval gate (eventBus blocks/resumes) |
| `workspaces.test.ts` | Workspace CRUD, workspace switching, session isolation |
| `regression.test.ts` | Regression scenarios (specifics not inspected) |

All use Fastify `inject()` -- **no real browser automation**. These are server-level integration tests, not true E2E tests.

### Agent-Level E2E (packages/agent/tests/e2e/)

| File | Scenarios Covered |
|------|-------------------|
| `solo-scenarios.test.ts` | S1: Research report (web_search -> save -> docx), S2: Code review, S3: Project planning, S4: Memory continuity |
| `connector-swarm-scenarios.test.ts` | C1: GitHub issue creation, C2: Email with approval gate, Swarm parallel/sequential/coordinator execution |

These use mock tool execution (no real LLM) -- they verify tool chain orchestration, not real LLM interaction.

### Playwright Visual Regression (tests/visual/)

| File | Coverage |
|------|----------|
| `views.spec.ts` | Screenshot baselines for 7 views (Chat, Memory, Events, Capabilities, Cockpit, Mission Control, Settings) in dark + light mode = 14 baselines |

Requires running server. Uses 0.3% pixel diff threshold. **No user interaction tests** -- screenshots only.

### What is Missing from E2E

- **No browser-automated user journey tests** (typing in chat, clicking buttons, navigating between views)
- **No onboarding flow E2E** (full wizard completion in browser)
- **No multi-workspace switching E2E** in browser
- **No connector setup/teardown flow** E2E
- **No marketplace browse/install flow** E2E
- **No approval gate click-through** E2E in browser

---

## 5. Kill List Coverage Matrix

| # | Kill List Item | Test Coverage | Assessment |
|---|---------------|---------------|------------|
| 1 | **Workspace restart / instant catch-up** | `core/tests/mind/awareness.test.ts`, `core/tests/mind/frames.test.ts`, `server/tests/routes/workspace-context.test.ts`, `server/tests/routes/context-injection.test.ts`, `server/tests/routes/session-state-extraction.test.ts` | **GOOD** -- Context reconstruction, frame retrieval, and session state extraction all tested. Server-side catch-up endpoint tested. No E2E test of the full "open workspace -> see context" flow. |
| 2 | **Draft from accumulated context** | `agent/tests/document-tools.test.ts` (docx generation), `agent/tests/e2e/solo-scenarios.test.ts` (research -> docx chain), `agent/tests/workflow-composer.test.ts` | **ADEQUATE** -- Document generation tested with markdown parsing, tables, lists, subdirectories. Workflow chains tested. No test verifying draft quality uses accumulated workspace memory. |
| 3 | **Decision compression / next-step thinking** | `weaver/tests/consolidation.test.ts`, `weaver/tests/consolidation-enhanced.test.ts`, `agent/tests/orchestrator.test.ts` | **PARTIAL** -- Memory consolidation (the mechanism behind decision compression) is tested. No dedicated test verifying "what was decided about X?" returns compressed decisions. |
| 4 | **Research and synthesis in context** | `agent/tests/e2e/solo-scenarios.test.ts` (S1: research report), `agent/tests/combined-retrieval.test.ts`, `agent/tests/search-memory-combined.test.ts`, `agent/tests/web-search-cache.test.ts` | **GOOD** -- Combined retrieval (memory + KVARK), web search, and research-to-document chains all tested. |
| 5 | **Ongoing project memory for solo operators** | `core/tests/mind/` (10 test files), `core/tests/multi-mind.test.ts`, `agent/tests/search-memory-combined.test.ts`, `server/tests/workspace-api.test.ts` | **STRONG** -- Most thoroughly tested area. Frame storage, FTS5 search, temporal knowledge, identity, awareness, knowledge graph -- all covered with 330+ test cases in core alone. |
| 6 | **Capability discovery and installation** | `agent/tests/capability-acquisition.test.ts`, `agent/tests/capability-marketplace.test.ts`, `server/tests/routes/acquisition-integration.test.ts`, `server/tests/local/marketplace*.test.ts` (5 files), `ui/tests/components/install-center.test.ts`, `core/tests/mind/install-audit.test.ts` | **STRONG** -- Discovery, acquisition, trust model, security scanning, approval gate, install center UI, audit trail -- all tested. 16+ test files cover this flow. |
| 7 | **External action execution (connectors)** | `agent/tests/connector-sdk.test.ts`, `agent/tests/connector-routing.test.ts`, `agent/tests/connectors/` (8 files for GitHub, Slack, Jira, email, etc.), `agent/tests/e2e/connector-swarm-scenarios.test.ts`, `server/tests/local/connectors.test.ts`, `server/tests/local/connector-registry-integration.test.ts` | **GOOD** -- Connector SDK, registry, individual connector types, tool generation, audit logging, error handling all tested. No test for real API calls (all mocked). Missing: connector credential refresh, expired token re-auth. |
| 8 | **Multi-agent workflows (swarm)** | `waggle-dance/tests/` (3 files: protocol, dispatcher, integration), `agent/tests/subagent-tools.test.ts`, `agent/tests/subagent-orchestrator.test.ts`, `agent/tests/e2e/connector-swarm-scenarios.test.ts`, `worker/tests/execution/strategies.test.ts`, `server/tests/daemons/hive-mind.test.ts` | **ADEQUATE** -- Protocol, dispatching, parallel/sequential/coordinator execution strategies, hive-mind daemon all tested. Missing: swarm failure recovery (partial agent failures), swarm cancellation, resource limits under concurrent swarm execution. |

### Kill List Summary

| Rating | Items |
|--------|-------|
| STRONG (4+/5) | #5 (project memory), #6 (capability discovery) |
| GOOD (3/5) | #1 (catch-up), #4 (research), #7 (connectors) |
| ADEQUATE (2.5/5) | #2 (drafting), #3 (decision compression), #8 (swarm) |
| WEAK (<2/5) | None |

---

## 6. Overall Test Health Assessment

### Strengths

1. **Exceptional volume**: ~3,950 test cases across 278 files is substantial for a project of this size. The claimed 3,069 tests all passing is credible based on the file counts.

2. **Core and agent packages are well-covered**: The two most critical packages (core: memory/mind, agent: tools/loop) have near 1:1 file coverage and deep behavioral tests.

3. **Kill List items all have coverage**: Every V1 must-win use case has at least adequate test coverage. No kill list item is completely untested.

4. **Good test isolation**: Tests consistently use temp directories, fresh instances, and proper cleanup. No shared mutable state between tests.

5. **Behavior-focused testing**: The majority of tests verify user-facing behaviors rather than implementation details. Mocks are realistic (proper response structures, not trivial stubs).

6. **Performance benchmarks exist**: Cold start, FTS5 search, batch writes, and session load times are all benchmarked with threshold assertions.

7. **Security paths are tested**: Marketplace security scanning (Cisco scanner), vault encryption, injection scanner, trust model, approval gates, permission checks -- all covered.

### Weaknesses

1. **No real browser E2E tests**: All "E2E" tests use Fastify `inject()` or mock tool execution. The Playwright tests are screenshot-only (visual regression) with no user interaction. There is zero coverage of actual user flows in a real browser.

2. **UI component rendering untested**: 102 UI source files have zero React rendering tests. The test file for `chat.test.ts` explicitly states "no jsdom/React Testing Library." This means any rendering regression (broken layout, missing props, conditional rendering bugs) goes undetected.

3. **Error/failure paths underrepresented**: Happy paths are well-tested, but failure scenarios are sparse. SSE interruption, LLM provider errors, vault corruption, concurrent access, WebSocket reconnection -- these critical failure modes have minimal or zero coverage.

4. **Admin-web is effectively untested**: 5 assertions for 10 source files. The admin dashboard could be completely broken and tests would still pass.

5. **Several server routes have zero test files**: fleet, import, anthropic-proxy, and notifications routes lack dedicated tests.

6. **Worker handlers partially untested**: `group-handler.ts` and `task-handler.ts` have no tests -- these handle background task execution.

### Risk Rating

| Category | Rating |
|----------|--------|
| Unit test coverage | **B+** (strong in core/agent/server, weak in ui/admin-web/shared) |
| Integration test coverage | **B** (good server integration, missing cross-package integration) |
| E2E test coverage | **D+** (exists but no real browser automation; inject-only) |
| Error path coverage | **C-** (happy paths strong, failure/edge paths sparse) |
| Kill List alignment | **B+** (all items covered, some with depth gaps) |
| **Overall** | **B-** |

### Priority Recommendations

1. **P0**: Add browser-automated E2E tests for the daily-use loop (open workspace -> send message -> see response -> navigate views). Even 5 real Playwright interaction tests would dramatically improve confidence.

2. **P0**: Add failure-path tests for SSE stream interruption and LLM provider errors -- these affect every user session.

3. **P1**: Add vault corruption/recovery tests (corrupted JSON, missing key file, concurrent writes).

4. **P1**: Add dedicated tests for untested server routes (fleet, import, anthropic-proxy).

5. **P1**: Add at least basic React rendering tests for critical UI components (ChatArea, ApprovalGate, WorkspaceHome) using jsdom or React Testing Library.

6. **P2**: Add worker handler tests for group-handler.ts and task-handler.ts.

7. **P2**: Increase admin-web test coverage from 5 assertions to meaningful page-level tests.

8. **P2**: Add sub-agent resource cleanup verification tests.

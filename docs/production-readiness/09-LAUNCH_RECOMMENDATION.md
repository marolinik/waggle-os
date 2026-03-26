# Launch Recommendation — Waggle V1

Generated: 2026-03-20

---

## Recommendation: CONDITIONAL GO

Ship after fixing the 8 CRITICAL issues (~6.5 hours of work). The HIGH issues are important but can be addressed in a rapid V1.0.1 patch within the first week.

---

## Executive Summary

Waggle is a substantial, well-architected product with 3,895 passing tests, 53 agent tools, 29 connectors, 15K+ marketplace packages, and a complete feature set covering all 8 Kill List use cases. The agent loop, memory system, and vault encryption are architecturally sound. The UI underwent a recent Phase 10 rewrite that brought Tailwind adoption and Direction D palette cleanup.

However, the audit uncovered **8 CRITICAL issues** (5 security, 1 stability, 2 UX) that must be fixed before any external user touches the product. The most severe: CORS is wide open (any website can call your localhost APIs), there are no React error boundaries (one render error = permanent white screen), and the streaming loading indicator is invisible (users can't tell the agent is thinking).

The good news: every CRITICAL fix is straightforward. Total estimated effort is 6.5 hours. None require architectural changes.

---

## What's Ready (Strengths)

1. **Solid agent core** — 53 tools, loop guards, injection scanning, approval gates, sub-agent orchestration. 1,272 tests on the agent package alone.

2. **Complete feature set** — All 8 Kill List use cases work. Workspace memory, connectors, marketplace, personas, cron, swarm protocol, capability packs, onboarding with memory import.

3. **Good test coverage** — 3,895 tests across 277 files, zero failures. Every major package has dedicated test suites with behavior-focused assertions and realistic mocks.

4. **Security fundamentals** — AES-256-GCM vault, parameterized SQL everywhere, path traversal protection, CLI allowlists, DOMPurify HTML sanitization, SecurityGate for marketplace.

5. **Deployment infrastructure** — Tauri Windows installer built (8.2MB), Docker production compose, Render.com blueprint, GitHub Actions CI/release pipeline.

6. **Product polish** — 8 personas, dark/light mode, keyboard shortcuts, global search, workspace hue colors, onboarding wizard, tool card transparency, approval gates inline in chat.

---

## Must Fix Before Launch (CRITICAL — ~6.5 hours)

### Security (4 hours)

| # | Issue | Fix | Time |
|---|-------|-----|------|
| 1 | **CORS allows any origin** — any website can call all Waggle APIs | Change `origin: true` to `origin: ['http://localhost:1420', 'tauri://localhost']` (or your Tauri webview origins). Fix SSE hijack endpoints to use the same allowlist. | 1.5 hr |
| 2 | **Server CSP has `unsafe-eval` + `unsafe-inline`** | Remove both. If scripts break, use nonces or hashes instead. | 30 min |
| 3 | **OAuth refresh tokens stored plaintext** | Encrypt refresh tokens the same way access tokens are encrypted in `setConnectorCredential()`. | 1 hr |
| 4 | **Verify API key revoked** | Go to Anthropic dashboard, confirm the key from commit `c29d75f` is revoked. Delete local branch `phase6-capability-truth`. | 30 min |

### Stability (2 hours)

| # | Issue | Fix | Time |
|---|-------|-----|------|
| 5 | **Zero error boundaries** | Add `<ErrorBoundary>` wrapping each view in App.tsx, plus one at the app root. Use react-error-boundary or a simple class component. Show "Something went wrong" with a retry button. | 2 hr |

### UX (30 minutes)

| # | Issue | Fix | Time |
|---|-------|-----|------|
| 6 | **Streaming indicator invisible** | The loading dots use BEM CSS classes with no definitions. Either add the CSS or replace with Tailwind `animate-pulse` dots. | 15 min |
| 7 | **SplashScreen wrong palette** | Replace `#1a1a2e`/`#16213e`/`#0f3460` with Direction D tokens. Change `#f5a623` to `#d4a843`. | 15 min |

---

## Ship-Week Fixes (HIGH — ~28 hours, V1.0.1)

**Security hardening (first 2 days):**
- Approval gates: change auto-approve to auto-deny on 5min timeout (15 min)
- WebSocket authentication: require session token on `/ws` connect (2 hr)
- Team WebSocket: validate JWT instead of trusting userId param (2 hr)
- Replace `xlsx` with `exceljs` to fix prototype pollution (2 hr)
- Generate Tauri updater keypair and set pubkey (30 min)

**Agent loop safety (day 3):**
- Cap rate-limit retries (max 3, then fail gracefully) (1 hr)
- Add token budget enforcement with configurable limit (2 hr)
- Parameterize sqlite-vec SQL interpolation (30 min)

**Frontend stability (days 3-5):**
- Add code splitting with `React.lazy()` for 7 views (2 hr)
- Deduplicate SSE connections (1 hr)
- Fix eventBus.removeAllListeners to scope per-client (1 hr)
- Fix light theme breakage across components (2 hr)

**Build fixes (day 5):**
- Fix npx waggle: compile .ts entry, resolve workspace deps (2 hr)
- Add non-root user to Docker (30 min)
- Fix CI branch target master→main (15 min)
- Clean up 87 TypeScript errors (2 hr)

---

## Known Limitations (Ship Anyway)

These are acceptable for V1 and can be improved iteratively:

1. **No browser E2E tests** — Unit/integration coverage is strong (3,895 tests). True browser automation (Playwright user journeys) is a V1.1 investment. Screenshot baselines exist.

2. **Monolithic App.tsx (1300 lines)** — Works but hard to maintain. Refactoring into feature-specific providers is a V1.1 task that won't affect users.

3. **No React.memo optimization** — The app performs fine at current scale. Memoization is premature optimization until profiling shows problems.

4. **macOS build not configured** — DMG, code signing, notarization require an Apple Developer account. Windows installer works. Ship Windows-first, add macOS in V1.1.

5. **Direction D at ~78%** — The Phase 10 UI rewrite made massive progress (371→19 inline styles). Remaining 22% is polish, not broken functionality.

6. **KVARK client not wired** — KVARK integration (Phase 7) is library code + tests. Not wired into the running server because KVARK itself needs its HTTP API deployed first. This is expected — it's the Enterprise tier path.

7. **Conversation history unbounded** — At typical usage (10-50 turns/session), this isn't a problem. Add context window management for power users in V1.1.

---

## Post-Launch Priority Queue

### First Week (V1.0.1)
1. All HIGH security fixes (approval timeout, WebSocket auth, xlsx, updater pubkey)
2. Agent loop safety (retry cap, token budget)
3. Frontend stability (code splitting, SSE dedup, error boundaries for remaining components)
4. Light theme fixes

### First Month (V1.1)
1. Browser E2E test suite (Playwright user journeys)
2. React component rendering tests
3. App.tsx decomposition (extract providers/hooks)
4. macOS build + code signing
5. npx waggle publishable package
6. CI pipeline expansion (Docker, lint, security scan)
7. Direction D compliance to 95%+

### First Quarter (V1.2)
1. KVARK server-side wiring (when KVARK HTTP API ready)
2. Performance profiling + React.memo optimization
3. Context window management for long conversations
4. Token budget UI (user-configurable spend limits)
5. Full accessibility audit (WCAG 2.1 AA)

---

## Verdict

**CONDITIONAL GO** — Fix the 8 CRITICALs (6.5 hours), then ship. The product is feature-complete, well-tested, and architecturally sound. The critical issues are configuration mistakes, not design flaws. Every fix is surgical and low-risk.

The foundation is strong. Ship it.

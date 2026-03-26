# Confidence Matrix — Waggle V1 Pre-Production Qualification

Generated: 2026-03-20 | Branch: `phase8-wave-8f-ui-ux`

---

## Overall Score: 6.9 / 10

| Dimension | Score | Key Evidence |
|-----------|-------|-------------|
| **Functional Correctness** | 8/10 | 3,895 tests pass across 277 files, zero failures. All 8 Kill List items have adequate+ coverage. Agent loop, memory, vault all architecturally sound. Gaps: some PM features lack frontend UI wiring. |
| **User Experience** | 6/10 | Direction D at ~78% compliance. Emotional assessment 4.1/5. Strongest: Cockpit (4.3), Capabilities (4.3). Weakest: Settings (3.4). Two CRITICAL UX issues (invisible loading, wrong splash colors). Light theme would break multiple components. |
| **Security Posture** | 5/10 | 2 CRITICAL + 7 HIGH security issues. CORS wide open. CSP defeated. Refresh tokens plaintext. WebSockets unauthenticated. Approval auto-approves. But: vault AES-256-GCM correct, SQL parameterized, path traversal protected, CLI allowlisted, DOMPurify used. Foundation solid, configuration broken. |
| **Test Coverage** | 7/10 | 3,895 tests, strong unit coverage (agent: 1,272, server: 904). Kill List fully covered. Gaps: zero React rendering tests, zero browser E2E, SSE/vault failure paths untested. Rating: B-. |
| **Build Readiness** | 5/10 | Vite builds (5.1s, 735KB chunk). Docker valid. Tauri Windows builds (8.2MB installer). macOS missing config. npx waggle not publishable. 87 TS errors. CI targets wrong branch. No Docker/lint/security in CI. |
| **Plan Compliance** | 8/10 | 54/60 feature slices DONE (93%). All PM features implemented at API level. Phase 7 KVARK milestones A-D complete. Phase 8 waves A-D confirmed. 6 partial slices mostly in deployment wave. |
| **Documentation** | 7/10 | README present. Guides directory exists. Architecture documented. CLAUDE.md comprehensive. API reference present. Some guides are stubs rather than complete walkthroughs. |
| **Product Completeness** | 8/10 | All 8 Kill List use cases functional. 29 connectors + Composio. 15K+ marketplace packages. 8 personas. Dark/light mode. Keyboard shortcuts. Onboarding with memory import. Cost tracking. Backup/restore. Offline detection. Workspace templates. |

---

## Dimension Details

### Functional Correctness (8/10)

**Strengths:**
- 3,895 tests across 277 files, zero failures
- Agent loop has proper turn limits, loop guards, injection scanning
- Mind DB uses WAL mode, FTS5 for search, sqlite-vec for embeddings
- Vault uses AES-256-GCM with random IVs correctly
- 53 agent tools with path traversal protection and CLI allowlists
- Connector registry with error isolation
- Cron scheduler with concurrency guard

**Gaps:**
- Rate-limit retry can cause infinite agent loop (HIGH)
- Token budget not enforced (agent could run up costs)
- Conversation history unbounded in RAM
- KVARK client implemented but not wired into running server

### User Experience (6/10)

**Strengths:**
- Workspace Home provides "pick up where I left off" continuity
- Three-layer tool transparency (compact → expand → detail)
- Approval gates inline in chat flow
- Onboarding with memory import (ChatGPT, Claude)
- 8 personas with mid-conversation switching
- Global search (Cmd+K), keyboard shortcuts for all views
- Cockpit is best view — comprehensive system overview

**Gaps:**
- Streaming indicator invisible (CRITICAL — users can't tell agent is thinking)
- Splash screen wrong palette (first impression is off-brand)
- Light theme broken across multiple components
- Settings view has no error recovery
- ~22% of components still non-compliant with Direction D

### Security Posture (5/10)

**Strengths:**
- AES-256-GCM vault encryption is correctly implemented
- SQL queries use parameterized statements throughout
- File operations use `resolveSafe()` path traversal protection
- CLI tools use `execFileAsync` with allowlist (no shell injection)
- DOMPurify for markdown HTML sanitization
- SecurityGate for marketplace package vetting

**Blockers (must fix):**
- CORS reflects any origin → any website can call Waggle APIs
- CSP has `unsafe-eval` + `unsafe-inline` → XSS protection defeated
- OAuth refresh tokens in plaintext metadata field
- WebSocket endpoints lack authentication
- Approval gates auto-approve on timeout
- API key persists in git history

### Test Coverage (7/10)

**Strong areas:**
- Agent package: 95 files, 1,272 tests
- Server package: 86 files, 904 tests
- Core package: well-tested (mind DB, vault, cron)
- All tests behavior-focused with realistic mocks

**Weak areas:**
- UI package: 27 test files for 102 source files (26% file coverage)
- Admin-web: 1 test file for 10 source files
- Zero React component rendering tests anywhere
- Zero browser-automated E2E tests
- SSE/WebSocket failure paths untested

### Build Readiness (5/10)

**Working:**
- Vite builds successfully (5.1s, needs code splitting)
- Docker multi-stage build with health checks
- Tauri Windows NSIS installer (8.2MB)
- Render.com blueprint validated
- GitHub Actions CI + release workflow exists

**Broken/Missing:**
- npx waggle: bin→.ts file, workspace dep won't resolve
- macOS: no DMG, no code signing, no notarization
- Docker runs as root, retains build tools
- CI targets `master` not `main`
- No lint/security scanning in CI
- 87 TypeScript errors (69 unused imports)
- Empty Tauri updater pubkey

### Plan Compliance (8/10)

**Complete (54/60 slices):**
- Wave 9A (UI/UX): 12/12 ✅ (with Phase 10 rewrite)
- Wave 9B (Connectors): 8/8 ✅ (29 connectors)
- Wave 9C (Marketplace): 5/5 ✅ (15K+ packages)
- Wave 9E (Intelligence): 6/6 ✅ (GEPA, personas, feedback)
- Wave 9F (Documentation): 4/4 ✅
- PM Features: 6/6 ✅ (at API level)

**Partial (6 slices):**
- Wave 9D (Deployment): 3-5/7 (macOS, npx, auto-update incomplete)
- Wave 9G (Hardening): 4/5 (accessibility informal, Playwright screenshot-only)

---

## Risk Heat Map

```
                    Low Impact ←────────────→ High Impact
                    ┌──────────────────────────────────────┐
  High Likelihood   │  Light theme    │  CORS exploit      │
                    │  breakage       │  Cost runaway      │
                    │                 │  Infinite retry    │
                    ├─────────────────┼────────────────────┤
  Low Likelihood    │  Git history    │  Vault metadata    │
                    │  key (if        │  token theft       │
                    │  revoked)       │  CSP bypass + XSS  │
                    └──────────────────────────────────────┘
```

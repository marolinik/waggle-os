# Issue Register — Waggle V1 Pre-Production Qualification

Generated: 2026-03-20 | Branch: `phase8-wave-8f-ui-ux` | Tests: 3,895 passing

---

## CRITICAL Issues (Must Fix Before Ship)

| ID | Phase | Category | Title | Location | Fix Estimate |
|----|-------|----------|-------|----------|-------------|
| PRQ-001 | 3B | Security | CORS allows any origin (`origin: true`) | `packages/server/src/local/index.ts:1122` | 30 min |
| PRQ-002 | 3B | Security | SSE endpoints bypass CORS via `reply.hijack()` | `packages/server/src/local/routes/chat.ts` | 1 hr |
| PRQ-003 | 3C | Code Quality | Zero error boundaries — render crash = white screen | `app/src/App.tsx` (entire app) | 2 hr |
| PRQ-004 | 4A | Security | OAuth refresh tokens stored plaintext in vault metadata | `packages/core/src/vault.ts:156-161` | 1 hr |
| PRQ-005 | 4A | Security | Server CSP has `unsafe-eval` + `unsafe-inline` | `packages/server/src/local/security-middleware.ts:24` | 30 min |
| PRQ-006 | 4B | Security | API key in git history (redaction commit was empty) | Branch `phase6-capability-truth`, commit `c29d75f` | 30 min (verify revoked + delete branch) |
| PRQ-007 | 2 | UX | Streaming loading indicator invisible (BEM CSS classes with no definitions) | `packages/ui/src/components/chat/ChatArea.tsx` | 30 min |
| PRQ-008 | 2 | UX | SplashScreen uses pre-Direction-D navy-blue gradient | `packages/ui/src/components/onboarding/SplashScreen.tsx` | 30 min |

**Total CRITICAL: 8** (5 Security, 1 Code Quality, 2 UX)

---

## HIGH Issues (Should Fix Before Ship)

| ID | Phase | Category | Title | Location | Fix Estimate |
|----|-------|----------|-------|----------|-------------|
| PRQ-009 | 3A | Code Quality | Rate-limit retry `turn--` can loop infinitely | `packages/agent/src/agent-loop.ts:129,140` | 1 hr |
| PRQ-010 | 3A | Code Quality | SQL string interpolation in sqlite-vec search | `packages/agent/src/tools/search.ts:194` | 30 min |
| PRQ-011 | 3B | Security | WebSocket `/ws` endpoint has no authentication | `packages/server/src/local/index.ts` (ws handler) | 2 hr |
| PRQ-012 | 3B | Security | Team WebSocket accepts userId as auth (no JWT) | `packages/server/src/local/index.ts` (team ws) | 2 hr |
| PRQ-013 | 3B | Code Quality | `eventBus.removeAllListeners()` kills all clients on one disconnect | `packages/server/src/local/index.ts` (ws close) | 1 hr |
| PRQ-014 | 3A/3B/4A | Security | Approval gates auto-approve after 5min timeout (should auto-deny) | `packages/server/src/local/routes/chat.ts:689` | 15 min |
| PRQ-015 | 3C | Code Quality | No code splitting — 735KB single JS chunk | `app/vite.config.ts`, `app/src/App.tsx` | 2 hr |
| PRQ-016 | 3C | Code Quality | Monolithic App component (~1300 lines, ~30 useState) | `app/src/App.tsx` | 4 hr |
| PRQ-017 | 3C | Code Quality | Duplicate SSE connections (useNotifications + useSubAgentStatus) | `app/src/hooks/` | 1 hr |
| PRQ-018 | 3C | Code Quality | Unsafe `as any` casts for team adapter methods | `app/src/App.tsx` (team adapter calls) | 1 hr |
| PRQ-019 | 4A | Security | Empty Tauri updater pubkey — no update signature verification | `app/src-tauri/tauri.conf.json` | 30 min |
| PRQ-020 | 4B | Security | `xlsx` package has prototype pollution vulnerability | `package.json` (xlsx dependency) | 2 hr (replace with exceljs) |
| PRQ-021 | 2 | UX | ServiceProvider connection screens use all-inline hardcoded styles | `app/src/components/ServiceProvider.tsx` | 1 hr |
| PRQ-022 | 2 | UX | StatusBar uses `bg-[#0a0a1a]` — breaks in light theme | `packages/ui/src/components/layout/StatusBar.tsx` | 15 min |
| PRQ-023 | 2 | UX | Settings view has no error recovery (stuck on "Loading..." forever) | `app/src/views/SettingsView.tsx` | 30 min |
| PRQ-024 | 2 | UX | CapabilitiesView has 16 hardcoded `#d4a843` — should use token | `app/src/views/CapabilitiesView.tsx` | 30 min |
| PRQ-025 | 2 | UX | Light theme breakage in multiple components | Various (`bg-white/[0.03]`, `bg-black/30`) | 2 hr |
| PRQ-026 | 3A | Code Quality | No token budget enforcement — 200 turns could cost $10-50+ | `packages/agent/src/agent-loop.ts` | 2 hr |
| PRQ-027 | 3A | Code Quality | Conversation history grows unbounded in RAM | `packages/agent/src/agent-loop.ts` | 2 hr |
| PRQ-028 | 6 | Build | npx waggle not publishable (bin→.ts, workspace dep) | `packages/waggle/package.json` | 2 hr |
| PRQ-029 | 6 | Build | Docker container runs as root | `Dockerfile` | 30 min |
| PRQ-030 | 6 | Build | 87 TypeScript errors in app/ (69 unused imports, 18 type mismatches) | `app/src/` | 2 hr |

**Total HIGH: 22** (7 Security, 9 Code Quality, 5 UX, 1 Build)

---

## MEDIUM Issues (Fix Post-Launch or V1.1)

| ID | Phase | Category | Title | Location | Fix Estimate |
|----|-------|----------|-------|----------|-------------|
| PRQ-031 | 3A | Code Quality | Vault key file 0o600 permissions have no effect on Windows | `packages/core/src/vault.ts` | 1 hr |
| PRQ-032 | 3A | Code Quality | Module-level maps for sub-agents grow without cleanup | `packages/agent/src/tools/` | 1 hr |
| PRQ-033 | 3A | Code Quality | LIKE fallback search doesn't escape SQL wildcards | `packages/agent/src/tools/search.ts` | 30 min |
| PRQ-034 | 3C | Code Quality | Zero React.memo usage — unnecessary re-renders | `packages/ui/src/components/` | 3 hr |
| PRQ-035 | 3C | Code Quality | 20 `any` type usages across app/ui | Various | 2 hr |
| PRQ-036 | 3C | Code Quality | 7 dead/orphaned files | Various in app/src/ | 30 min |
| PRQ-037 | 4B | Security | Hardcoded dev database credentials as fallbacks | 3 production source files | 30 min |
| PRQ-038 | 4B | Security | `@clerk/fastify` major version behind (2.x vs 3.x) | `package.json` | 1 hr |
| PRQ-039 | 5 | Test Gap | Zero React component rendering tests | `packages/ui/tests/` | 4 hr |
| PRQ-040 | 5 | Test Gap | SSE stream interruption/reconnection untested | Server SSE routes | 2 hr |
| PRQ-041 | 5 | Test Gap | Vault corruption/wrong key recovery untested | `packages/core/tests/` | 2 hr |
| PRQ-042 | 5 | Test Gap | Zero browser-automated E2E user journey tests | `tests/` | 8 hr |
| PRQ-043 | 5 | Test Gap | Fleet, import, anthropic-proxy routes untested | `packages/server/` | 3 hr |
| PRQ-044 | 6 | Build | CI targets `master` branch, main branch is `main` | `.github/workflows/ci.yml` | 15 min |
| PRQ-045 | 6 | Build | No macOS DMG/code-signing/notarization config | `app/src-tauri/tauri.conf.json` | 4 hr |
| PRQ-046 | 6 | Build | Placeholder 32x32 icon only | `app/src-tauri/icons/` | 1 hr |
| PRQ-047 | 6 | Build | CI has no Docker build, no linting, no security scanning | `.github/workflows/ci.yml` | 3 hr |
| PRQ-048 | 1B | Plan Gap | KVARK client exists but NOT wired into running server | `packages/server/src/local/index.ts` | 2 hr |
| PRQ-049 | 1B | Plan Gap | PM features lack frontend UI integration (export, backup, offline) | Various views | 4 hr |
| PRQ-050 | 2 | UX | Direction D compliance at ~78% (target: 95%+) | Various components | 4 hr |

**Total MEDIUM: 20**

---

## LOW Issues (V1.1+ Backlog)

| ID | Phase | Category | Title | Fix Estimate |
|----|-------|----------|-------|-------------|
| PRQ-051 | 3C | Code Quality | 5 ESLint suppression comments | 30 min |
| PRQ-052 | 3C | Code Quality | 29 remaining inline styles (down from 371) | 2 hr |
| PRQ-053 | 4B | Security | .gitignore missing `.vault-key`, `*.pem`, `*.key`, `*.log` | 15 min |
| PRQ-054 | 4B | Security | 4 moderate npm audit vulnerabilities | 1 hr |
| PRQ-055 | 5 | Test Gap | Sub-agent cleanup on failure not verified | 2 hr |
| PRQ-056 | 5 | Test Gap | WebSocket reconnection state recovery not verified | 2 hr |
| PRQ-057 | 6 | Build | Production Docker image retains build tools (python3, make, g++) | 30 min |

**Total LOW: 7**

---

## Summary

| Severity | Count | Categories |
|----------|-------|-----------|
| CRITICAL | 8 | Security (5), Code Quality (1), UX (2) |
| HIGH | 22 | Security (7), Code Quality (9), UX (5), Build (1) |
| MEDIUM | 20 | Code Quality (6), Security (2), Test Gap (5), Build (4), Plan Gap (2), UX (1) |
| LOW | 7 | Code Quality (2), Security (2), Test Gap (2), Build (1) |
| **TOTAL** | **57** | |

**Estimated total fix effort: ~85 hours**
- CRITICAL fixes: ~6.5 hours
- HIGH fixes: ~28 hours
- MEDIUM fixes: ~46.5 hours
- LOW fixes: ~8 hours

# Windows Solo security review — 2026-08-11 (candidate evidence refreshed 2026-08-13)

## Status

This review combines broad security/regression receipts at `9a898846`, dependency
audit receipts at `4de47ec6`, and exact-candidate persona/router/auth/installer receipts
at `692c69b9a6586b15ccc6f3f2eb40c65a95acd3aa`. The diff from those ancestor
receipts to the candidate is limited to release documentation and the focused-tested
smart-router qualifier harness. This is a no-impact attestation, not a claim that the
ancestor commands ran at `692c69b9`. It is **not** a replacement for a sealed Codex
Security Deep Scan. The active launch recommendation remains **NOT YET RELEASE-APPROVED**.

## Evidence checked

| Surface | Evidence revision | Result |
|---|---|---|
| Dependency severity | `4de47ec6`: `npm audit --audit-level=high` and `--omit=dev` both exit 0; reports contain 0 High and 0 Critical advisories (lower-severity advisories remain) | Pass for the Critical/High gate, with qualifier-only no-impact attestation to candidate |
| Security-critical tests | `9a898846`: `npm run test:critical`; 16 files, 341 tests passed; vault ACL, approval, origin, injection and protected-route cases included | Pass, with qualifier-only no-impact attestation to candidate |
| Local-server boundary | Bearer session token, desktop bootstrap credential, loopback Host allowlist and restricted CORS are wired in `security-middleware.ts` and `local/index.ts` | Pass by source/test evidence |
| Chat boundary | 50,000-character cap, user-input injection scan, tool-output/retrieval scan, workspace-root resolution and fail-closed approval timeout | Pass by source/test evidence |
| Command/tool boundary | Bash chain operators always require confirmation; CLI and marketplace execution use argument-vector APIs; descendant timeout cleanup is covered | Pass by source/test evidence |
| Secret storage | Connector refresh tokens are separate encrypted vault entries; Windows vault-key ACL is current-user-only and verified by the critical lane | Pass |
| Packaged runtime | Exact-candidate unsigned NSIS and embedded sidecar at `692c69b9` passed 59/59 clean-profile checks, including offline managed-model generation/chat, repair, data preservation, and cleanup; installer SHA-256 `636DCD22BEB0765D8D15202A3268717385B383C9A8D7B6217650FEEB9A922D0A` | Pass internal runtime; public signing remains open |
| External-agent authentication | Claude Code, Codex, and Hermes official user-auth canaries passed serially; the harness read/copied 0 auth files and preserved the tracked tree | Pass |
| Smart-router budget boundary | Primary, compact tool-context, durable pre-start spend, budget, and fallback paths passed with managed Ollama, no Docker, and clean process teardown | Pass |

## Previously reported findings rechecked

The historical March application-security report listed plaintext refresh
tokens, `unsafe-eval`, permissive local auth/CORS, auto-approve timeout,
unwired injection scanning and shell-interpolated marketplace scanning. The
reviewed revision contains the corresponding controls: encrypted companion vault
entries, `script-src 'self'`, bearer/Host/CORS enforcement, auto-deny/hold
timeout behavior, chat-path injection scanning and `execFileSync` scanner
invocation. Those historical findings were not carried forward as Critical/High
findings at the reviewed revision. This does not substitute for the formal managed
Deep Security finding-discovery and validation workflow.

## Remaining limitations

1. No public Authenticode-signed release artifact is available; the current internal
   NSIS candidate is `NotSigned`.
2. Prior Codex Security Deep Scan attempts did not produce a sealed canonical
   report because of host permission/policy/artifact blockers. No no-findings
   claim is made.
3. The Docker/Postgres/Redis infra lane was not run; it is explicitly outside
   the Windows Solo no-Docker launch contract.
4. The 2026-08-13 npm snapshot reports 22 moderate advisories in the full dependency
   tree and 18 in production dependencies. They are not High/Critical, but remain
   maintenance work and must not be silently hidden.
5. Standalone/development managed-LiteLLM mode lacks crash-durable reservation handoff
   for finite hard paid budgets. Packaged Windows Solo is not exposed because bundled
   Tauri forces the registered built-in proxy. Keep this P2 hardening out of launch
   claims until direct mode gains equivalent durable accounting.

## Release interpretation

The combined receipts and no-impact diff review support **zero observed Critical/High
findings for the checked Windows Solo surfaces through candidate `692c69b9`**. This
does not authorize a formal zero-finding, production-ready, or 9.5/10 claim until
public signing and the managed formal security-seal gate close.

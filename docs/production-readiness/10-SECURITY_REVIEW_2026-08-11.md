# Windows Solo security review — 2026-08-11

## Status

This is an evidence-backed local hardening review for exact HEAD
`43fcfdfd6c5141eebf0f1d646d0fb36c0283c8f9`. It is **not** a replacement for a
sealed Codex Security Deep Scan. The active launch recommendation therefore
remains **NOT YET RELEASE-APPROVED**.

## Evidence checked

| Surface | Evidence at reviewed revision `43fcfdfd` | Result |
|---|---|---|
| Dependency severity | `npm audit --audit-level=high` and `--omit=dev` both exit 0; reports contain 0 High and 0 Critical advisories (lower-severity advisories remain) | Pass for the Critical/High gate |
| Security-critical tests | `npm run test:critical`: 16 files, 341 tests passed; vault ACL, approval, origin, injection and protected-route cases included | Pass |
| Local-server boundary | Bearer session token, desktop bootstrap credential, loopback Host allowlist and restricted CORS are wired in `security-middleware.ts` and `local/index.ts` | Pass by source/test evidence |
| Chat boundary | 50,000-character cap, user-input injection scan, tool-output/retrieval scan, workspace-root resolution and fail-closed approval timeout | Pass by source/test evidence |
| Command/tool boundary | Bash chain operators always require confirmation; CLI and marketplace execution use argument-vector APIs; descendant timeout cleanup is covered | Pass by source/test evidence |
| Secret storage | Connector refresh tokens are separate encrypted vault entries; Windows vault-key ACL is current-user-only and verified by the critical lane | Pass |
| Packaged runtime | Managed-model Windows installer certificate passed 59 checks, including offline `qwen2.5:0.5b` generation/chat, repair, data preservation and cleanup. A separate internal-pilot-signed exact-HEAD artifact passed the same 59 checks; its embedded signer is timestamped but its self-signed root is not publicly trusted. | Pass for runtime and signing-pipeline behavior; public signing remains open |

## Previously reported findings rechecked

The historical March application-security report listed plaintext refresh
tokens, `unsafe-eval`, permissive local auth/CORS, auto-approve timeout,
unwired injection scanning and shell-interpolated marketplace scanning. The
reviewed revision contains the corresponding controls: encrypted companion vault
entries, `script-src 'self'`, bearer/Host/CORS enforcement, auto-deny/hold
timeout behavior, chat-path injection scanning and `execFileSync` scanner
invocation. Those historical findings were not carried forward as Critical/High
findings at the reviewed revision. This does not assert a zero-finding result for a
later HEAD.

## Remaining limitations

1. No public Authenticode-signed release artifact was available; the reviewed local
   NSIS artifact was `NotSigned`.
2. Prior Codex Security Deep Scan attempts did not produce a sealed canonical
   report because of host permission/policy/artifact blockers. No no-findings
   claim is made.
3. The Docker/Postgres/Redis infra lane was not run; it is explicitly outside
   the Windows Solo no-Docker launch contract.
4. The 2026-08-11 npm snapshot reported 23 moderate advisories in the full dependency
   tree. They were not High/Critical, but remain maintenance work and should not be
   silently hidden.
5. Standalone/development managed-LiteLLM mode lacks crash-durable reservation handoff
   for finite hard paid budgets. Packaged Windows Solo is not exposed because bundled
   Tauri forces the registered built-in proxy. Keep this P2 hardening out of launch
   claims until direct mode gains equivalent durable accounting.

## Release interpretation

The local review supports **zero observed Critical/High findings at the reviewed
`43fcfdfd` snapshot** for the checked Windows Solo surfaces. It does not authorize a
current-HEAD zero-finding, production-ready, or 9.5/10 claim until revalidation,
public signing, and the formal security-seal gates close.

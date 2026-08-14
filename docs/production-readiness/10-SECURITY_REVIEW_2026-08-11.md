# Windows Solo security review — 2026-08-11 (candidate evidence refreshed 2026-08-14)

## Status

This review combines scoped persona/router/auth receipts at `692c69b9`, the broad
application regression at `af19b387`, a refreshed dependency audit, and exact-candidate
installer evidence at `d4f1dae3476829f1fc6d73c2173c960527c7b4c9` plus
release-workflow hardening through `d455aa80f0c88b50610667a52787c3f4058bd9bb`.
The evidence is deliberately layered:
older receipts are carried only where a diff review proves the covered runtime surface
unchanged, while the packaged binary and signing workflow were rebuilt and verified at
the frozen runtime candidate. This Markdown-only release record is a no-impact descendant
and is not represented as an exact-HEAD rerun. This is **not** a replacement for a
sealed Codex Security Deep Scan. The active launch recommendation remains
**NOT YET RELEASE-APPROVED**.

## Evidence checked

| Surface | Evidence revision | Result |
|---|---|---|
| Dependency severity | Refreshed 2026-08-14: `npm audit --audit-level=high --json` and `npm audit --omit=dev --audit-level=high --json` both exit 0; full tree 0 Critical/0 High/22 Moderate, production tree 0 Critical/0 High/18 Moderate | Pass for the Critical/High dependency gate; lower-severity maintenance remains |
| Broad and security-critical regression | At `af19b387`, 714 test files and 11,586 tests passed with five skipped; the previously sealed 341-test critical lane covers vault ACL, approval, origin, injection, and protected-route cases. Changes through `d455aa80` are release/signing/certification-only | Pass with bounded carry-forward plus focused release-control gates |
| Local-server boundary | Bearer session token, desktop bootstrap credential, loopback Host allowlist and restricted CORS are wired in `security-middleware.ts` and `local/index.ts` | Pass by source/test evidence |
| Chat boundary | 50,000-character cap, user-input injection scan, tool-output/retrieval scan, workspace-root resolution and fail-closed approval timeout | Pass by source/test evidence |
| Command/tool boundary | Bash chain operators always require confirmation; CLI and marketplace execution use argument-vector APIs; descendant timeout cleanup is covered | Pass by source/test evidence |
| Secret storage | Connector refresh tokens are separate encrypted vault entries; Windows vault-key ACL is current-user-only and verified by the critical lane | Pass |
| Packaged runtime | Exact-candidate unsigned NSIS and embedded sidecar at `d4f1dae3` passed 59/59 clean-profile checks, including FREE/Solo tier, managed `qwen2.5:0.5b`, proxy restart/chat, repair, data preservation, cleanup, and uninstall; installer SHA-256 `B5B427B7D4828BF18FC639CA475D7B21D6E007F3095285859AA67164D9C7DC7D` | Pass internal runtime; public signing remains open |
| Hosted-signing implementation | Through `d455aa80`, 266/266 PowerShell signing-policy and 86/86 workflow/Tauri tests passed; app/server typechecks, targeted lint, YAML and PowerShell 7/5.1 parsing, and independent security/compatibility/test reviews approved with no P0-P2 finding | Pass implementation gate; no public hosted signing execution yet |
| External-agent authentication | Claude Code, Codex, and Hermes official user-auth canaries passed serially; the harness read/copied zero auth files and preserved the tracked tree. No covered authentication surface changed afterward | Pass with scoped carry-forward |
| Smart-router budget boundary | Primary, compact tool-context, durable pre-start spend, budget, and fallback paths passed with a managed local runtime, no Docker, and clean process teardown. No covered router surface changed afterward | Pass with scoped carry-forward |

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

1. No public Authenticode-signed release artifact is available; the exact-`d4f1dae3`
   internal NSIS candidate is `NotSigned`. Microsoft public-identity/profile readiness,
   exact-tag Azure OIDC configuration, and a real signing/timestamp run remain open.
2. A historical sealed Deep Scan exists for old revision `75e4bba4`, and a later
   sealed Standard scan exists for `d594b110`; neither covers `d4f1dae3` or the
   eventual release-tag commit. Current-candidate managed Deep Scan attempts were
   blocked by host permission/policy/artifact failures. No current no-findings claim
   is made.
3. The Docker/Postgres/Redis infra lane was not run; it is explicitly outside
   the Windows Solo no-Docker launch contract.
4. The refreshed 2026-08-14 npm snapshot reports 22 moderate advisories in the full
   dependency tree and 18 in production dependencies. They are not High/Critical,
   but remain maintenance work and must not be silently hidden.
5. Standalone/development managed-LiteLLM mode lacks crash-durable reservation handoff
   for finite hard paid budgets. Packaged Windows Solo is not exposed because bundled
   Tauri forces the registered built-in proxy. Keep this P2 hardening out of launch
   claims until direct mode gains equivalent durable accounting.

## Release interpretation

The combined receipts, exact-`d4f1dae3` installer evidence, and bounded diff reviews support
**zero observed Critical/High findings for the checked Windows Solo surfaces through
candidate `d4f1dae3`**. This
does not authorize a formal zero-finding, production-ready, or 9.5/10 claim until
public signing and the managed formal security-seal gate close.
The eventual public artifact and security seal must name the exact approved release-tag
commit, not silently reuse `d4f1dae3` as if the documentation descendant had the same
source revision.

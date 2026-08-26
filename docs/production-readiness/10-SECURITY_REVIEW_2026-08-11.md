# Windows Solo security review — evidence refreshed 2026-08-26

## Status

This review layers the exact current internal-installer evidence identified by the
launch recommendation, bounded dependency-audit evidence, focused runtime/dependency
reviews, historical broad-regression evidence, and scoped persona/router/auth receipts.
Older receipts are carried only where their covered surface was unchanged or a later
focused gate directly exercised it. The launch recommendation is the sole authority for
the exact candidate revision, installer digest, receipt digest, and current verdict.

This review is **not** a replacement for a sealed Codex Security Deep Scan. The active
launch recommendation remains **NOT YET PUBLIC RELEASE-APPROVED**.

## Evidence checked

| Surface | Evidence | Result |
|---|---|---|
| Dependency severity | Frozen dependency baseline: full audit 0 Critical/0 High/21 Moderate/1 Low; production audit 0 Critical/0 High/17 Moderate/2 Low. Both high-threshold commands exited 0. A 2026-08-22 `node-tar` High advisory was reproduced, then closed by raising the existing override floor to the first fixed range and locking tar 7.5.22. Dependency declarations and the lockfile graph are unchanged through source commit `470a5e87`; the sole manifest edit adds a packaging-safety script | Pass Critical/High as bounded carry-forward; lower-severity maintenance remains |
| Dependency fix compatibility | Exact two-file patch; `onnxruntime-node` rebuild succeeded with tar 7.5.22; 31/31 Transformers/embedding tests and Hive Mind Core typecheck passed; independent review approved with no P0-P2 | Pass |
| Packaged runtime | Exact current internally pilot-signed NSIS identified by the launch recommendation; 64/64 clean-profile checks; FREE/Solo; managed Ollama 0.32.3 and `qwen2.5:0.5b`; model chat; proxy restart; repair; preservation; cleanup; uninstall | Pass internal runtime; public trust remains open |
| Managed-runtime download hardening | Transient 408/425/429/500/502/503/504 retry, same-run Range resume with exact `Content-Range` validation, safe restart when Range is ignored, shared deadline, pinned size and full SHA-256 before extraction; 66/66 relevant tests, server typecheck, lint and independent security/Windows reviews approved | Pass; exact installer certifier exercised the hardened path |
| Desktop session bootstrap hardening | Read-only session-token bootstrap retries at most one transient transport/408/425/429/500/502/503/504 failure; 401/403 remain fail-closed and are never retried. Focused and full certifier tests, app/server typechecks, lint, parser checks, and independent security/Windows/test reviews approved | Pass; exact installer certification closed the prior transient timeout |
| Broad and security-critical regression | Historical `af19b387` baseline: 714 files and 11,586 tests passed with five skipped; the sealed 341-test critical lane covered vault ACL, approval, origin, injection and protected routes. PR #64 exact head later passed primary CI, full Playwright E2E, blocking E2E smoke, Windows Tauri lifecycle, both macOS builds, and Hive install/smoke on Windows, Ubuntu and macOS | Pass historical breadth plus exact integrated-tree remote gates; PR #64 merged as `e00664d1` with no failed or pending check |
| Local-server boundary | Bearer session token, desktop bootstrap credential, loopback Host allowlist and restricted CORS are wired in `security-middleware.ts` and `local/index.ts` | Pass by source/test evidence |
| Chat boundary | 50,000-character cap, user-input injection scan, tool-output/retrieval scan, workspace-root resolution and fail-closed approval timeout | Pass by source/test evidence |
| Command/tool boundary | Bash chain operators require confirmation; CLI and marketplace execution use argument-vector APIs; timeout cleanup and Windows command-shim boundaries have focused tests | Pass by source/test evidence |
| URL egress / SSRF boundary | Credentials in URL authority, private and special-use IPv4/IPv6 ranges, DNS rebinding, mixed-address resolution, socket-time peer changes and redirect targets are rejected fail-closed; cross-origin sensitive headers are stripped and local access requires an explicit loopback-only override. Canonical guard tests passed 44/44 on Node 20/22/24 and PR #63/#64 remote matrices were green | Pass by source, executable tests, independent security review and integrated remote CI |
| Secret storage | Connector refresh tokens use separate encrypted vault entries; Windows vault-key ACL is current-user-only and checked by the installer/critical lanes | Pass |
| Hosted-signing implementation | Preserved release-control gates: 266/266 PowerShell signing-policy and 86/86 workflow/Tauri tests; app/server typechecks, targeted lint, YAML and PowerShell 7/5.1 parsing; independent security/compatibility/test reviews approved with no P0-P2 | Pass implementation gate; no publicly trusted hosted artifact yet |
| External-agent authentication | Claude Code, Codex and Hermes official-user-auth canaries passed serially; the harness read/copied zero auth files and preserved the tracked tree | Pass as scoped carry-forward evidence |
| Smart-router budget boundary | Primary, compact tool context, durable pre-start spend, budget and fallback paths passed without Docker and with clean teardown; exact candidate separately proves the final managed-runtime/proxy path | Pass as scoped carry-forward evidence |
| Public Hive Mind mirror | Maintainer-curated dependency hardening and canonical-first URL-egress forward-port merged through public `master` `43dd4429`; proprietary exclusions rechecked; build/test passed on Windows, macOS and Ubuntu plus Ubuntu first-run smoke. Production audit is zero; exactly two no-fix High vulnerability entries stemming from one `sharp` advisory remain only in the development/optional Transformers-to-Sharp path | Pass source hardening; package publication remains a separate decision |

## Previously reported findings rechecked

The historical March application-security report listed plaintext refresh tokens,
`unsafe-eval`, permissive local auth/CORS, auto-approve timeout, unwired injection
scanning and shell-interpolated marketplace scanning. The reviewed source contains the
corresponding controls: encrypted companion vault entries, `script-src 'self'`,
bearer/Host/CORS enforcement, auto-deny/hold timeout behavior, chat-path injection
scanning and argument-vector scanner invocation. Those historical findings are not
carried forward as unresolved Critical/High issues. Formal managed Deep Security
finding discovery and validation are still required.

## Remaining limitations

1. The exact internal NSIS is signed only by `CN=Egzakta Internal Pilot` and Windows
   does not trust that private root publicly. The signature and DigiCert timestamp prove
   the pilot pipeline, not public Authenticode. Exact-tag Azure OIDC signing with a
   publicly trusted identity remains open.
2. No sealed managed Deep Scan covers the current frozen internal candidate or the
   eventual release tag. Historical scans cover other revisions; blocked
   permission/policy/artifact attempts are not
   no-finding results. No current formal zero-finding claim is made.
3. The Docker/Postgres/Redis infrastructure lane was not run because it is outside the
   Windows Solo no-Docker launch contract.
4. Current audits still report 21 Moderate/1 Low findings in the full tree and
   17 Moderate/2 Low in production dependencies. They are not High/Critical but remain
   visible maintenance work.
5. Standalone/development managed-LiteLLM mode lacks crash-durable reservation handoff
   for finite hard paid budgets. Packaged Windows Solo is not exposed because Tauri
   forces the registered built-in proxy. Keep this P2 hardening out of launch claims
   until direct mode gains equivalent durable accounting.

## Release interpretation

The combined exact-installer, dependency, focused security, integrated remote-CI and
bounded carry-forward receipts support **no known unresolved Critical/High finding in
the checked Windows Solo surfaces through source commit `470a5e87`**. This is not a
formal repository-wide no-finding result and does not authorize a production-ready,
public GO or 9.5/10 claim. Public GO requires the exact approved release artifact to
have publicly trusted Authenticode and
a sealed managed Deep Security report with no unresolved Critical/High findings.

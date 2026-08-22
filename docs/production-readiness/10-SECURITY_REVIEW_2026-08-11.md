# Windows Solo security review — evidence refreshed 2026-08-22

## Status

This review layers exact internal-installer evidence at
`b9a871cced6ce43120e34e2cf2f656d21de9d3c7`, exact-candidate dependency audits,
focused runtime/dependency reviews, historical broad-regression evidence, and scoped
persona/router/auth receipts. Older receipts are carried only where their covered
surface is unchanged or a later focused gate directly exercises it. This release-record
update is documentation-only and does not relabel the `b9a871cc` installer as a binary
built from the later documentation commit.

This review is **not** a replacement for a sealed Codex Security Deep Scan. The active
launch recommendation remains **NOT YET PUBLIC RELEASE-APPROVED**.

## Evidence checked

| Surface | Evidence | Result |
|---|---|---|
| Dependency severity | Exact candidate: full audit 0 Critical/0 High/21 Moderate/1 Low; production audit 0 Critical/0 High/17 Moderate/2 Low. Both high-threshold commands exit 0. A 2026-08-22 `node-tar` High advisory was reproduced, then closed by raising the existing override floor to the first fixed range and locking tar 7.5.22 | Pass Critical/High dependency gate; lower-severity maintenance remains |
| Dependency fix compatibility | Exact two-file patch; `onnxruntime-node` rebuild succeeded with tar 7.5.22; 31/31 Transformers/embedding tests and Hive Mind Core typecheck passed; independent review approved with no P0-P2 | Pass |
| Packaged runtime | Exact `b9a871cc` internally pilot-signed NSIS, SHA-256 `9DB493F31E30DF0D252B1959B31DAE77E6499992A4E4EBEAFC72565510AF1095`; 64/64 clean-profile checks; FREE/Solo; managed Ollama 0.32.3 and `qwen2.5:0.5b`; model chat; proxy restart; repair; preservation; cleanup; uninstall | Pass internal runtime; public trust remains open |
| Managed-runtime download hardening | Transient 408/425/429/500/502/503/504 retry, same-run Range resume with exact `Content-Range` validation, safe restart when Range is ignored, shared deadline, pinned size and full SHA-256 before extraction; 66/66 relevant tests, server typecheck, lint and independent security/Windows reviews approved | Pass; exact installer certifier exercised the hardened path |
| Broad and security-critical regression | Historical `af19b387` baseline: 714 files and 11,586 tests passed with five skipped; the sealed 341-test critical lane covered vault ACL, approval, origin, injection and protected routes. This is not mislabeled as an exact-candidate broad run | Historical baseline plus later focused gates; final remote PR CI remains mandatory |
| Local-server boundary | Bearer session token, desktop bootstrap credential, loopback Host allowlist and restricted CORS are wired in `security-middleware.ts` and `local/index.ts` | Pass by source/test evidence |
| Chat boundary | 50,000-character cap, user-input injection scan, tool-output/retrieval scan, workspace-root resolution and fail-closed approval timeout | Pass by source/test evidence |
| Command/tool boundary | Bash chain operators require confirmation; CLI and marketplace execution use argument-vector APIs; timeout cleanup and Windows command-shim boundaries have focused tests | Pass by source/test evidence |
| Secret storage | Connector refresh tokens use separate encrypted vault entries; Windows vault-key ACL is current-user-only and checked by the installer/critical lanes | Pass |
| Hosted-signing implementation | Preserved release-control gates: 266/266 PowerShell signing-policy and 86/86 workflow/Tauri tests; app/server typechecks, targeted lint, YAML and PowerShell 7/5.1 parsing; independent security/compatibility/test reviews approved with no P0-P2 | Pass implementation gate; no publicly trusted hosted artifact yet |
| External-agent authentication | Claude Code, Codex and Hermes official-user-auth canaries passed serially; the harness read/copied zero auth files and preserved the tracked tree | Pass as scoped carry-forward evidence |
| Smart-router budget boundary | Primary, compact tool context, durable pre-start spend, budget and fallback paths passed without Docker and with clean teardown; exact candidate separately proves the final managed-runtime/proxy path | Pass as scoped carry-forward evidence |

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
2. No sealed managed Deep Scan covers `b9a871cc` or the eventual release tag. Historical
   scans cover other revisions; blocked permission/policy/artifact attempts are not
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

The combined exact-installer, dependency, focused security and bounded carry-forward
receipts support **no known unresolved Critical/High finding in the checked Windows Solo
surfaces at candidate `b9a871cc`**. This is not a formal repository-wide no-finding
result and does not authorize a production-ready, public GO or 9.5/10 claim. Public GO
requires the exact approved release artifact to have publicly trusted Authenticode and
a sealed managed Deep Security report with no unresolved Critical/High findings.

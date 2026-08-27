# Windows Solo security review — refreshed 2026-08-27

## Status

The integrated Windows Solo source candidate is
`23ad3fa5f99bddce648b84750a41365299aeb0da` (private PR #66). Its tested PR
head and merge commit have the same source tree
`aab548f77ec64b181086664dad29c32e6bc78779`.

This is an evidence-backed source, dependency, CI, and installed-runtime review. It is
**not** a substitute for the still-missing sealed managed Deep Security report and does
not confer public release approval.

## Verified controls

| Surface | Current evidence | Result |
|---|---|---|
| Workspace paths and lifecycle | Strict workspace IDs, canonical containment, identity-matching configs, link/hard-link rejection, and fail-closed list/get/delete behavior; focused executable tests | Pass |
| Hook/database boundary | Existing database/config entries and SQLite companions reject links or hard links while preserving first-use and WAL behavior | Pass |
| External memory ingress | Normalization and injection scanning are applied before persistence across supported ingress paths; bypass-focused regressions are included | Pass |
| Search | Punctuated identifiers use bounded precise fallback; deprecated frames are excluded before keyword, LIKE, whole-vector, and chunk-vector limits; alternate-lane starvation regressions are covered | Pass |
| Consolidation/cognify | Supersede operations are atomic, preserve provenance, and fail closed on partial mutation | Pass |
| Knowledge graph | Relationship provenance and source-frame boundaries are preserved and tested | Pass |
| Local server and tools | Loopback/session authentication, origin controls, SSRF/DNS/socket-pinning defenses, bounded external input, command-vector execution, and fail-closed shim handling are covered by focused and remote gates | Pass |
| Provider authentication | Historical scoped canaries show Claude Code, Codex, and Hermes using official user-owned authentication with no provider credential-file reads/copies; exact-current carry-forward still needs a concrete no-impact attestation or rerun | Historical evidence; current qualification open |
| Packaged runtime | Exact-current internal-pilot NSIS passed 64/64 clean-profile install, boot, managed-model, repair, relaunch, Exit/cleanup, and uninstall checks | Pass internal RC |
| Dependency severity | Exact-current full and production audits contain 0 Critical and 0 High findings | Pass Critical/High gate |

## Exact installer evidence

- Installer SHA-256:
  `7BFA9F9B13633A51CD3336B42E3EF904B7F7A568C6DEE4F6CED967CBD4F40A59`
- Certification receipt:
  `output/installer-certification/23ad3fa5-20260827T123917Z-exact-main-clean-profile/windows-installer-certification.json`
- Receipt SHA-256:
  `AC2A1C54119E28CC22DA931EB43E2815862B01832DD6097CE03F8F79D9D3DF4D`
- Managed model: `qwen2.5:0.5b`
- Managed-model digest:
  `sha256:a8b0c51577010a279d933d14c2a8ab4b268079d44c5c8830c0a93900f1827c67`
- Certification checks: 64 passed, 0 failed

The certifier verified source and sidecar provenance, bundled runtime/npm, clean offline
execution, default Solo onboarding, in-process embeddings, built-in proxy liveness,
session authentication, managed-model pull/chat, proxy-restart chat, repair and data
preservation, relaunch, cleanup/uninstall, and unchanged external `.hive-mind`/`.ollama`
roots. No Waggle-owned process or certificate test profile remained after completion.

## Remote integration evidence

PR #66 passed primary CI, Playwright smoke and full E2E, Windows and both macOS Tauri
verification targets, Wave 1, and Hive Mind install/smoke on Windows, Ubuntu, and macOS.
The full local Waggle Vitest suite, agent/server/app typechecks, lint, and diff checks also
completed successfully before integration.

Hive Mind PR #53 passed Linux, Windows, macOS, and Ubuntu first-run smoke before merge as
`3410327800db3ea23f875d547a0c7f4d08826b7e`.

## Residual risk and public release blockers

- The installer is signed by `CN=Egzakta Internal Pilot`, a private self-signed identity.
  Its DigiCert timestamp validates the signing pipeline but does not provide public trust.
- No sealed managed Codex Security report exists; this audit host used a disabled
  permission profile. No failed or unsealed attempt is interpreted as a no-findings result.
- The immutable Hive Mind drift baseline reports 22 known reviewed blockers and one
  unreviewed difference, with zero forbidden exports. These block the next OSS package
  release, not this private Windows Solo internal RC.
- Current persona qualification still needs a fresh exact-candidate seal or an independent
  bounded semantic-impact attestation because PR #66 changed memory behavior.

Public GO requires publicly trusted Authenticode, a sealed exact-candidate managed Deep
Security report with no unresolved Critical/High findings, current persona qualification,
fresh or explicitly attested smart-router and official-auth qualification, and green
protected release-tag checks.

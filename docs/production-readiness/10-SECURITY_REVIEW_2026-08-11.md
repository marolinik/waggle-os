# Windows Solo security review — refreshed 2026-09-07

## Status

The frozen Windows Solo internal-pilot source candidate is
`c4e6a5157310876215d20c5e5f059f26ea1f4ba4` on the private readiness branch.
It has not yet been merged to or represented as private `main`.

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
| Packaged runtime | Exact-candidate internal-pilot NSIS passed 64/64 clean-profile install, boot, managed-model, repair, relaunch, Exit/cleanup, and uninstall checks | Pass internal pilot |
| Dependency severity | Production audit contains 0 Critical and 0 High; app build-tool audit contains 0 vulnerabilities | Pass Critical/High gate |

## Exact installer evidence

- Installer SHA-256:
  `2211333B5562F0FEAACFFB37887F0918CBB8A79C591E77C858B62ADFA707E919`
- Certification receipt:
  `output/internal-pilot-c4e6a515/windows-installer-certificate-c4e6a515.json`
- Receipt SHA-256:
  `624EBB7C9529C57F50FB8D31E821E5DBE01CF4503717DAEA81569660B886C214`
- Managed model: `qwen2.5:0.5b`
- Managed-model digest:
  `sha256:a8b0c51577010a279d933d14c2a8ab4b268079d44c5c8830c0a93900f1827c67`
- Certification checks: 64 passed, 0 failed

The certifier verified exact `c4e6a515` source and sidecar provenance, bundled runtime/npm, clean offline
execution, default Solo onboarding, in-process embeddings, built-in proxy liveness,
session authentication, managed-model pull/chat, proxy-restart chat, repair and data
preservation, relaunch, cleanup/uninstall, and unchanged external `.hive-mind`/`.ollama`
roots. No Waggle-owned process or certificate test profile remained after completion.

## Integrated qualification evidence

Runtime parent `81087bae` passed 12,699 root tests and 2,442 web tests (15,141 total),
agent/server/app typechecks, full lint, and Cargo checks. Exact candidate `c4e6a515`
changes only the app build lock and its packaging regression; its affected 102 tests,
app typecheck, targeted lint, Cargo check, build, and clean-profile receipt are green.
Visible-browser PM journeys additionally covered provider persistence/recovery, Qwen chat,
workspace/session isolation, artifact creation/download, automation, memory continuity,
compact tools, and deterministic skill verification.

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
- Current persona qualification still needs a fresh exact-release seal or an independent
  bounded semantic-impact attestation.

Public GO requires publicly trusted Authenticode, a sealed exact-candidate managed Deep
Security report with no unresolved Critical/High findings, current persona qualification,
fresh or explicitly attested smart-router and official-auth qualification, and green
protected release-tag checks.

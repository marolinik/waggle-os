# Launch Recommendation — Windows Solo

Updated: 2026-08-27

## Current verdict: INSTALLER/LIFECYCLE INTERNAL RC QUALIFIED; RELEASE QUALIFICATION INCOMPLETE

The supported launch scope is Windows Solo with Claude Code, Codex, and Hermes using
their official user-owned installations and authentication. Cursor, OpenClaw, and macOS
packaging/certification remain roadmap work and do not block this internal RC.

This document is the release-status authority. Historical receipts are evidence only;
they do not certify a later behavior-changing revision unless a bounded no-impact review
explicitly says so.

## Frozen runtime candidate

- Source revision: `23ad3fa5f99bddce648b84750a41365299aeb0da`
- Source tree: `aab548f77ec64b181086664dad29c32e6bc78779`
- Integration: private Waggle PR #66, tested head
  `587e259166db69ff86e806fa8393a5f8974ea0a1`, merged 2026-08-27
- Tree equivalence: the tested PR head and merge commit resolve to the same source tree
- Repository state after merge: private `main` equals `origin/main`

The documentation-only descendant that updates this record does not replace the runtime
candidate. Before it is merged, its diff must be limited to documentation and all required
remote checks must remain green.

## Exact-current Windows installer

- NSIS artifact:
  `app/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Waggle_0.2.0_x64-setup.exe`
- Size: 102,923,936 bytes
- SHA-256: `7BFA9F9B13633A51CD3336B42E3EF904B7F7A568C6DEE4F6CED967CBD4F40A59`
- Internal signer: `CN=Egzakta Internal Pilot, O=Egzakta Group, C=RS`
- Signer thumbprint: `E2F028541E7A4D1FE80FFFF02079060D36579846`
- RFC 3161 timestamp authority: DigiCert SHA256 RSA4096 Timestamp Responder 2025 1
- Trust classification: internal pilot only; the self-signed root is not public trust

Clean-profile certification passed **64/64** checks in 450.199 seconds:

- Receipt:
  `output/installer-certification/23ad3fa5-20260827T123917Z-exact-main-clean-profile/windows-installer-certification.json`
- Receipt SHA-256:
  `AC2A1C54119E28CC22DA931EB43E2815862B01832DD6097CE03F8F79D9D3DF4D`
- Receipt source and bundled-sidecar revision: exact `23ad3fa5`
- Tier: FREE/Solo
- Managed model: `qwen2.5:0.5b`
- Managed-model digest:
  `sha256:a8b0c51577010a279d933d14c2a8ab4b268079d44c5c8830c0a93900f1827c67`

The receipt proves silent install, bundled Node/npm and offline package execution,
first boot, in-process embeddings, built-in proxy/session authentication, workspace and
memory persistence, managed runtime/model pull and chat, proxy-restart chat, same-version
repair, relaunch, data preservation, Exit/owned-process cleanup, uninstall, registry
cleanup, and preservation of external `.hive-mind` and `.ollama` roots. It also proves
that developer Node.js, Python, Docker, external LiteLLM, and a separately installed
Ollama are not prerequisites.

## Integrated test and security evidence

- PR #66: every blocking remote check passed — primary CI, Playwright smoke and full
  E2E, Windows and both macOS Tauri verification targets, Wave 1, and Hive Mind
  install/smoke on Windows, Ubuntu, and macOS.
- Exact-current dependency audits: 0 Critical and 0 High in both full and production
  dependency trees. Lower-severity maintenance remains tracked.
- The security-hardening integration covers workspace path/link boundaries, hook/database
  hard-link boundaries, normalized ingress, atomic consolidation/cognify, deprecated-frame
  search exclusion before limits, and knowledge-graph provenance.
- Hosted signing policy and workflow tests remain green, but no publicly trusted hosted
  artifact has been produced.

## Persona, router, and authentication evidence

The historical ten-persona collection at `4c712ff6` contains 30/30 results at or above
95/100 after documented independent semantic adjudication. It is not relabeled as an
exact-current deterministic seal: PR #66 changed memory behavior, so public release
qualification requires either a fresh exact-candidate collection or an explicit bounded
semantic-impact attestation.

Smart-router primary, compact-tool-context, durable-budget/fallback, and official-user-auth
canaries for Claude Code, Codex, and Hermes remain scoped historical evidence. No PR #66
change altered provider credential ownership or copied/read provider credential files.

## Hive Mind repository state

Curated public-mirror hardening PR #53 merged to `marolinik/hive-mind` `master` as
`3410327800db3ea23f875d547a0c7f4d08826b7e`; Linux, Windows, macOS, and Ubuntu
first-run smoke passed. The immutable drift checker still reports reviewed blockers and
one unreviewed difference, with zero forbidden exports. Therefore the Windows Solo RC is
not blocked, but the next Hive Mind package release remains a separate maintainer-curated
operation. Raw subtree publication remains forbidden.

## Public GO blockers

Public release may be called **GO** only after all of these are closed for the approved
release-tag commit:

1. A protected hosted build produces a publicly trusted Authenticode artifact.
2. The managed Codex Security workflow produces a sealed Deep Security report with no
   unresolved Critical or High findings.
3. Current persona qualification is sealed by a fresh exact-candidate receipt or an
   independently reviewed bounded semantic-impact attestation.
4. Smart-router and Claude Code/Codex/Hermes official-auth qualification is either rerun
   on the exact candidate or covered by a concrete independently reviewed no-impact
   attestation.
5. Protected release-tag checks are green and the exact artifact hashes are recorded.

Until then, the installer is suitable for controlled internal testing, not public
distribution, and Waggle must not be described as publicly production-ready or GO.

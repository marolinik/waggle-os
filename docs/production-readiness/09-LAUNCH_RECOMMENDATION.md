# Launch Recommendation — Windows Solo

Updated: 2026-09-07

## Current verdict: PM-QUALIFIED FOR CONTROLLED INTERNAL PILOT; PUBLIC RELEASE GATES OPEN

The supported launch scope is Windows Solo with Claude Code, Codex, and Hermes using
their official user-owned installations and authentication. Cursor, OpenClaw, and macOS
packaging/certification remain roadmap work and do not block this internal pilot.

This document is the release-status authority. Historical receipts are evidence only;
they do not certify a later behavior-changing revision unless a bounded no-impact review
explicitly says so.

## Frozen internal-pilot candidate

- Source revision: `c4e6a5157310876215d20c5e5f059f26ea1f4ba4`
- Source tree: `81087baea67302d1b71aceae1b46776de91e93c0`
- Branch: private `codex/solo-premium-pm-qualification-2026-08-27`
- Integration state: local frozen candidate; not yet merged to or represented as private `main`

The documentation-only descendant that updates this record does not replace the frozen
runtime candidate. Any push, PR update, or merge requires separate explicit authorization
and current remote checks.

## Exact-current Windows installer

- NSIS artifact:
  `app/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Waggle_0.2.0_x64-setup.exe`
- Stable internal-pilot copy:
  `output/internal-pilot-c4e6a515/Waggle_0.2.0_x64-setup.exe`
- Size: 102,990,752 bytes
- SHA-256: `2211333B5562F0FEAACFFB37887F0918CBB8A79C591E77C858B62ADFA707E919`
- Internal signer: `CN=Egzakta Internal Pilot, O=Egzakta Group, C=RS`
- Signer thumbprint: `E2F028541E7A4D1FE80FFFF02079060D36579846`
- RFC 3161 timestamp authority: DigiCert SHA256 RSA4096 Timestamp Responder 2026 1
- Trust classification: internal pilot only; the self-signed root is not public trust

Clean-profile certification passed **64/64** checks in 481.939 seconds:

- Receipt:
  `output/internal-pilot-c4e6a515/windows-installer-certificate-c4e6a515.json`
- Receipt SHA-256:
  `624EBB7C9529C57F50FB8D31E821E5DBE01CF4503717DAEA81569660B886C214`
- Receipt source and bundled-sidecar revision: exact `c4e6a515`
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

## Test, PM-journey, and security evidence

- Runtime parent `81087bae` passed 12,699 root tests and 2,442 web tests (15,141
  total), agent/server/app typechecks, full lint, and Cargo checks. Candidate `c4e6a515`
  changes only the app build lock and its packaging regression; the affected 102 tests,
  app typecheck, targeted lint, Cargo check, installer build, and this exact certification
  are green.
- Production dependency audit: 0 Critical and 0 High. App build-tool dependency audit:
  0 vulnerabilities after the exact-candidate browser-metadata patch.
- The security-hardening integration covers workspace path/link boundaries, hook/database
  hard-link boundaries, normalized ingress, atomic consolidation/cognify, deprecated-frame
  search exclusion before limits, and knowledge-graph provenance.
- Hosted signing policy and workflow tests remain green, but no publicly trusted hosted
  artifact has been produced.
- Visible-browser PM journeys passed OpenAI-compatible provider persistence and restart,
  local Qwen chat/recovery, workspace/session create-switch-delete isolation, PDF/PPTX/
  DOCX/XLSX artifact surfacing and download, automation dry-run, memory continuity,
  compact tool disclosure, and deterministic skill verification.

## Persona, router, and authentication evidence

The historical ten-persona collection at `4c712ff6` contains 30/30 results at or above
95/100 after documented independent semantic adjudication. It is not relabeled as an
exact-current deterministic seal; public release qualification requires either a fresh
exact-release collection or an explicit bounded semantic-impact attestation.

Smart-router primary, compact-tool-context, durable-budget/fallback, and official-user-auth
canaries for Claude Code, Codex, and Hermes remain scoped historical evidence. They require
an exact-release rerun or an independently reviewed no-impact attestation for public GO.

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

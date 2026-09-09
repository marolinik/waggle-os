# Launch Recommendation — Windows Solo

Updated: 2026-09-09

## Current verdict: PM-QUALIFIED FOR CONTROLLED INTERNAL PILOT; PUBLIC RELEASE GATES OPEN

The supported launch scope is Windows Solo with Claude Code, Codex, and Hermes using
their official user-owned installations and authentication. Cursor, OpenClaw, and macOS
packaging/certification remain roadmap work and do not block this internal pilot.

This document is the release-status authority. Historical receipts are evidence only;
they do not certify a later behavior-changing revision unless a bounded no-impact review
explicitly says so.

## Frozen internal-pilot candidate

- Runtime source revision: `e4bf403ecfde8987089176ba1de216b224e1fc1c`
- Runtime source tree: `5a42a0b9ad0937408fafc8180ad6738b6bd16bce`
- PR merge candidate used by hosted/local packaging:
  `b07a6173f9909e2decddb30077ef890cf16c602d`
- Merge-candidate tree: `5a42a0b9ad0937408fafc8180ad6738b6bd16bce`
- Branch: private `codex/solo-premium-pm-qualification-2026-08-27`
- Integration state: pushed private draft PR #83; mergeable, not merged to private `main`

The PR head and the tested merge candidate have the same source tree. A later
documentation-only descendant that updates this record does not replace the frozen runtime
candidate. Merge, tag, signing, publication, and release remain separately gated actions.

## Exact-current Windows installer

- Stable locally certified copy:
  `output/pm-ci-e4bf403e/managed/Waggle_0.2.0_x64-setup-managed-certified-b07a6173.exe`
- Size: 98,698,013 bytes
- SHA-256: `9C4A22D5540B1D26DE6A928F3268128A70994663FF2E9F1B99D12C8D63B96747`
- Authenticode status: `NotSigned`
- Trust classification: controlled internal pilot only; Windows may show an unknown-publisher warning

Isolated-profile certification passed **64/64** checks:

- Receipt:
  `output/pm-ci-e4bf403e/managed/windows-installer-managed-model-certificate.json`
- Receipt SHA-256:
  `E237DD0871F22EAF414052CE8FC91E6BA2E23318AA45A3E48B4D2AC2AC090BB6`
- Receipt source and bundled-sidecar revision: exact `b07a6173`
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

The hosted PR artifact independently passed **58/58** lifecycle checks without the
managed-model option. Its uploaded ZIP SHA-256 is
`96BE627319349F379DAC718A20D0438064B327B661DFD9FB6B117898504CCF95`;
the hosted installer SHA-256 is
`A13DF953A6121B64E96E68CEA8CDC2A3FCF8A87B16AA0013F22B394F33B35989`.

## Test, PM-journey, and security evidence

- Draft PR #83 head `e4bf403e` passed the full CI test, E2E smoke, E2E, Windows
  Tauri verification, macOS x64/arm64 build verification, Hive Mind Windows/macOS/Linux
  install smoke, and Wave 1 acceptance jobs. CodeRabbit also passed. The PR is mergeable
  and remains unmerged.
- The exact PR merge candidate `b07a6173` has the same tree as `e4bf403e`; its hosted
  Windows installer passed 58/58, and the locally rebuilt installer passed 64/64 with
  managed-model verification.
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

The live Qwen ten-persona collection at runtime revision `ec672874` contains 30/30
completed results at or above 95/100 after documented independent semantic adjudication.
The collection is stored under
`output/playwright/persona-seal-ec672874-20260909`. Five grounded answers were lexical
false negatives and were independently adjudicated; the current scorer reports the full
collection ready. Descendants through `e4bf403e` change only the reviewed evaluator and
tests, not runtime persona behavior.

Smart-router primary, compact-tool-context, durable-budget/fallback, and official-user-auth
canaries for Claude Code, Codex, and Hermes are sealed with a reviewed no-impact boundary
through the runtime candidate. A public release tag must still preserve that boundary or
rerun affected evidence.

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
3. The protected release-tag commit preserves the reviewed persona, router, and official-auth
   no-impact boundary, or affected evidence is rerun.
4. Protected release-tag checks are green and the exact artifact hashes are recorded.

Until then, the installer is suitable for controlled internal testing, not public
distribution, and Waggle must not be described as publicly production-ready or GO.

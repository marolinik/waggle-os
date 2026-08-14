# Launch Recommendation — Windows Solo

Updated: 2026-08-14

## Current verdict: INTERNAL RC QUALIFIED; NOT YET PUBLIC RELEASE-APPROVED

The launch scope is intentionally narrow: **Windows Solo**, with **Claude Code,
Codex, and Hermes** as the supported external-agent cohort. Cursor, OpenClaw,
and macOS packaging/certification remain roadmap work and do not block this
scope. This document is the ship authority; older readiness reports are
historical evidence only.

## Frozen code candidate

The frozen internal runtime/binary evidence revision is:

`d4f1dae3476829f1fc6d73c2173c960527c7b4c9`

Release-control hardening through `d455aa80f0c88b50610667a52787c3f4058bd9bb`
and this Markdown release-record update are bounded no-impact descendants. They change
no shipped runtime surface and do not relabel the installer or receipts as if they were
produced from a later commit.

The exact-`d4f1dae3` local NSIS candidate is unsigned (`NotSigned`), 98,686,269 bytes,
and has SHA-256
`B5B427B7D4828BF18FC639CA475D7B21D6E007F3095285859AA67164D9C7DC7D`.
Its embedded sidecar provenance also names `d4f1dae3`. This is the frozen internal
runtime candidate, not the future public artifact: the protected hosted workflow must
rebuild and sign the exact approved release-tag commit, including this release record.

Receipt paths below are machine-local evidence locations under ignored `output/` or
temporary directories. Their SHA-256 digests are recorded here deliberately; they are
not public repository links and must not be presented as downloadable release assets.

## Current gate evidence

| Gate | Result | Receipt / evidence |
|---|---|---|
| Ten-persona paid acceptance | **PASS, carried forward after scoped diff review** — 30/30 accepted across ten personas x3; all selected receipts 100/100; no missing, duplicate, invalid, or manifest-error slots | `output/playwright/seals/persona-acceptance-schema7-20260813T023117Z-692c69b9/seal.json`; SHA-256 `53EADFE2123D5D26BF234CD8E9C4ACEF85A7665EA32738112A7A61F09464D4FB` |
| Smart router and compact tool context | **PASS, carried forward after scoped diff review** — primary, compact-tool-context, durable-budget, and fallback paths; managed local runtime; Docker not invoked; clean teardown | `output/smart-router/qualification-20260813T022319Z-692c69b9.json`; SHA-256 `973DBDF718156A049486894DD1E2892E2C7F518834AEBA33F91F9CE3C7BD1D9A` |
| Official user-auth cohort | **PASS, carried forward after scoped diff review** — Claude Code, Codex, Hermes; three serial model calls; zero auth files read/copied; tracked tree unchanged | `C:/tmp/waggle-readiness-evidence/official-auth-692c69b9-20260813T024840Z/official-auth-receipt.json`; SHA-256 `2D27609067E4703969F0AD6055F5A0414B00E9F3B271CE3B917E0860E4393ABD` |
| Full application regression | **PASS with bounded carry-forward** — at `af19b387`, 714 test files and 11,586 tests passed; five tests skipped. Later changes through `d455aa80` are release/signing/certification-only and have focused release-control coverage | `output/readiness-broad-af19b387-20260813T115524.log`; SHA-256 `9C0EC313649CFA1941279AFAA41E771FB1898E1243C71BE9F843173B5F05C21E` |
| Release/signing implementation through `d455aa80` | **PASS locally** — 266/266 PowerShell signing-policy tests; 86/86 workflow/Tauri tests; app/server typechecks, targeted lint, YAML and PowerShell 7/5.1 parsing green; security, compatibility, and test reviews approved with no P0-P2 finding | Commit `d455aa80f0c88b50610667a52787c3f4058bd9bb`; shipped runtime remains exact `d4f1dae3` |
| Dependency severity snapshot | **PASS Critical/High gate, refreshed 2026-08-14** — full tree 0 Critical/0 High/22 Moderate; production tree 0 Critical/0 High/18 Moderate. Package manifests and lockfiles are unchanged from the preserved audit baseline | `npm audit --audit-level=high --json`; `npm audit --omit=dev --audit-level=high --json` |
| Windows installer lifecycle + managed model | **PASS internal RC, exact `d4f1dae3`** — unsigned NSIS and embedded sidecar at `d4f1dae3`; 59/59 clean-profile checks; FREE/Solo tier; managed `qwen2.5:0.5b`; proxy restart/chat, repair, data preservation, managed cleanup, and uninstall | `output/installer-certification/d4f1dae3-20260813T221108Z/windows-installer-certificate-managed.json`; SHA-256 `07C0B3D1E24801DE2006A998CDF1F10D40EBF03354003E58EACCFAE4BF3C4DCF` |

## Public Windows binary blockers

1. **Authenticode:** the current NSIS artifact is unsigned (`NotSigned`). No hosted
   Azure OIDC signing run has produced a publicly trusted signer/timestamp receipt.
   Microsoft public-identity/profile readiness, the exact-tag federated credential,
   signing variables, and signing profile must be verified live before that run.
2. **Formal deep security seal:** a historical sealed Deep Scan exists for old
   revision `75e4bba4`, and a later sealed Standard scan exists for `d594b110`;
   neither covers frozen runtime revision `d4f1dae3` or the eventual release-tag
   commit. Current managed Deep Scan attempts were blocked by recorded permission,
   policy, and artifact-workflow failures. Static review and `npm audit` are not
   substitutes for a sealed current-candidate managed Deep Scan.

## Public source/repository blockers

1. Publish the reviewed readiness source through a private branch and draft PR. Merge
   into `main` only after the remote diff and checks match the locally reviewed source;
   do not use a direct unreviewed `main` push.
2. The mapped Hive Mind exclusion/provenance status is recorded in
   `11-HIVE-MIND-PARITY-AUDIT-2026-08-13.md`. The OSS mirror remains drifted and
   requires a curated forward-port before its next release or any parity claim.
   Mirror parity does not block the Windows binary, but final drift/exclusion evidence
   and the separate CLI, MCP, hook, and wiki inventories must be current before a
   repository-wide provenance claim.
3. Final repository/worktree hygiene, tracked documentation consistency, and integration
   classification remain required. Detached scan worktrees and local generated artifacts
   must be handled separately from the clean readiness branch and must never be swept into
   the release PR.

## Installation contract

Windows Solo must run without Docker, Python, developer Node.js, external LiteLLM,
or a separately installed Ollama. The bundled Node sidecar and no-Python
OpenAI-compatible proxy are required; in-process embeddings are the default and a
local Ollama runtime/model is Waggle-managed. A user-installed Ollama remains optional.

## Deferred scope and repository hygiene

Cursor and OpenClaw remain roadmap integrations. macOS packaging, signing,
notarization, and runtime certification are also roadmap work. The Hive Mind OSS
forward-port is required before the mirror's next release, but is a separate operation
from the Windows Solo runtime and Waggle repository integration decisions.

## Approval rule

Change the Windows binary verdict to **GO** only after a production Authenticode
artifact and a formal managed deep security seal cover the frozen candidate, with no
unresolved Critical or High security findings. Public source/repository publication
also requires the repository blockers above to close. Until the applicable gates close,
do not describe Waggle as production-ready, claim an overall 9.5/10, or claim
superiority over competing products.

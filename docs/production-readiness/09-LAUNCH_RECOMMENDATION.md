# Launch Recommendation — Windows Solo

Updated: 2026-08-24

## Current verdict: INTERNAL RC QUALIFIED; NOT YET PUBLIC RELEASE-APPROVED

The launch scope is intentionally narrow: **Windows Solo**, with **Claude Code,
Codex, and Hermes** as the supported external-agent cohort. Cursor, OpenClaw,
and macOS packaging/certification remain roadmap work and do not block this
scope. This document is the ship authority; older readiness reports are
historical evidence only.

## Frozen internal candidate

The exact internal runtime/binary evidence revision is:

`b9a871cced6ce43120e34e2cf2f656d21de9d3c7`

The exact local NSIS candidate is 102,920,864 bytes with SHA-256
`9DB493F31E30DF0D252B1959B31DAE77E6499992A4E4EBEAFC72565510AF1095`.
It is Authenticode-signed by the private internal identity
`CN=Egzakta Internal Pilot, O=Egzakta Group, C=RS` (thumbprint
`E2F028541E7A4D1FE80FFFF02079060D36579846`) and carries a DigiCert RFC3161
timestamp. Windows reports the chain as untrusted because the pilot root is not
publicly trusted. This is intentional internal-RC evidence, not a public artifact.

Post-candidate descendants are bounded documentation plus reviewed non-runtime
OSS publication tooling/tests. They do not change the packaged runtime or relabel
the installer as if it were built from a later commit.

Receipt paths below are machine-local evidence locations under ignored `output/` or
temporary directories. Their SHA-256 digests are recorded deliberately; they are not
public repository links or downloadable release assets.

## Current gate evidence

| Gate | Result | Receipt / evidence |
|---|---|---|
| Windows installer lifecycle + managed model | **PASS internal RC, exact `b9a871cc`** — 64/64 checks; FREE/Solo; bundled Node sidecar and npm; in-process embeddings; Waggle-managed Ollama 0.32.3 and `qwen2.5:0.5b`; model chat; built-in proxy restart; same-version repair; data preservation; managed cleanup; uninstall; no Docker/Python/developer Node/external LiteLLM/separate Ollama prerequisite | `output/installer-certification/b9a871cc-20260822T101817Z-clean/windows-installer-certificate-managed.json`; SHA-256 `75EF7C75D63BF34AFB293A14691978F17C64F30B71CD1288B11BD1477C74E7FE` |
| Dependency severity | **PASS Critical/High at exact candidate** — both full and production audit commands exit 0; full tree 0 Critical/0 High/21 Moderate/1 Low; production tree 0 Critical/0 High/17 Moderate/2 Low. The new `node-tar` High advisory was closed with transitive tar 7.5.22 | `npm audit --audit-level=high --json`; `npm audit --omit=dev --audit-level=high --json`; fix commit `bdaf5e09` |
| Ten-persona acceptance | **PASS for the agreed persona-quality gate, bounded carry-forward** — at `4c712ff6`, 30/30 across ten personas x3 are at least 95/100 after two independent semantic adjudications; 28 deterministic passes, two 90-point results adjudicated to 100, zero critical failures. The artifact explicitly remains a non-gating collection, not a canonical deterministic seal | `output/playwright/persona-acceptance-schema7-20260822T073743Z-4c712ff6/semantic-adjudication.json`; SHA-256 `F2318DBBD187D075AC7BE78957822FDF04A1EBB78A549D67EF6928C452D93129`; receipt-set digest `b714705d574a397f72b19c5f30eda7dcf68e403488c5baf89d525ef526768d43` |
| Smart router and compact tool context | **PASS as scoped carry-forward evidence** — primary, compact-tool-context, durable-budget and fallback paths; managed local runtime; Docker not invoked; clean teardown. Later router-surface changes were covered by focused tests; the final managed-runtime path is independently exercised by the exact installer receipt above | `output/smart-router/qualification-20260813T022319Z-692c69b9.json`; SHA-256 `973DBDF718156A049486894DD1E2892E2C7F518834AEBA33F91F9CE3C7BD1D9A` |
| Official user-auth cohort | **PASS as scoped carry-forward evidence** — Claude Code, Codex and Hermes; three serial model calls; zero auth files read/copied; tracked tree unchanged. The post-persona candidate delta does not touch official-auth logic | `C:/tmp/waggle-readiness-evidence/official-auth-692c69b9-20260813T024840Z/official-auth-receipt.json`; SHA-256 `2D27609067E4703969F0AD6055F5A0414B00E9F3B271CE3B917E0860E4393ABD` |
| Broad application regression | **Historical baseline, not exact-candidate evidence** — at `af19b387`, 714 test files and 11,586 tests passed with five skipped. Subsequent phases have focused gates; final integration still requires every check on the final pushed private-PR descendant to pass | `output/readiness-broad-af19b387-20260813T115524.log`; SHA-256 `9C0EC313649CFA1941279AFAA41E771FB1898E1243C71BE9F843173B5F05C21E` |
| Hosted-signing implementation | **PASS implementation gate, bounded carry-forward** — 266/266 PowerShell signing-policy tests; 86/86 workflow/Tauri tests; app/server typechecks, targeted lint, YAML and PowerShell 7/5.1 parsing; independent security, compatibility and test reviews with no P0-P2 finding. Later commit `db4e5bec` changed only macOS artifact handling, not the Windows signing control surface | Preserved Windows release-control receipts through `d455aa80`; public hosted signing has not executed |

> **Integration status update (2026-08-24):** PR #58 merged as `df727114`; the
> exact merge commit has 13 successful checks, one expected deploy skip, and no
> failed or pending checks. This supersedes pending-integration wording in the
> historical broad-regression row above.

## Remaining production GO gates

1. **Public Authenticode:** the current artifact uses the private internal-pilot
   identity. A protected exact-tag Azure OIDC run must build, sign, timestamp,
   certify and attest the approved release commit with a publicly trusted identity.
2. **Formal deep security seal:** no sealed managed Deep Scan covers `b9a871cc` or
   the eventual release tag. Historical scans cover other revisions; permission,
   policy and artifact-workflow failures are not no-finding results. Static review,
   dependency audit and focused security review are not substitutes.

Private repository integration is complete: PR #58 merged as `df727114` after its
head checks passed. The exact merge commit has 13 successful checks, one expected
deploy skip, and no failed or pending checks. The repository remains private.

## Repository and Hive Mind hygiene

The private Waggle repository is the product source of truth. Its tracked release
documentation and operating contracts now describe the merged product state. Local
builds, receipts, caches, secrets, databases and nested research checkouts are not source
and must never be swept into Git with a broad clean/add operation.

The Hive Mind substrate remains monorepo-first. The public mirror requires a separate,
maintainer-curated forward-port with explicit proprietary exclusions before its next OSS
release or any parity claim. Mirror drift does not block this private Windows Solo RC,
but raw subtree output must never be pushed as the mirror.

## Installation contract

Windows Solo must run without Docker, Python, developer Node.js, external LiteLLM,
or a separately installed Ollama. The bundled Node sidecar and no-Python
OpenAI-compatible proxy are required; in-process embeddings are the default and a
local Ollama runtime/model is Waggle-managed. A user-installed Ollama remains optional.

## Deferred scope

Cursor and OpenClaw remain roadmap integrations. macOS packaging, signing,
notarization and runtime certification are roadmap work. The Hive Mind OSS
forward-port is a separate future publication operation.

## Approval rule

Change the public Windows binary verdict to **GO** only after a publicly trusted
Authenticode artifact and a formal managed Deep Security seal cover the approved
release candidate with no unresolved Critical or High findings, and protected
release-tag checks are green. Until then, do not describe Waggle as production-ready, claim an
overall 9.5/10, or claim superiority over competing products.

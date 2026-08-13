# Launch Recommendation — Windows Solo

Updated: 2026-08-13

## Current verdict: INTERNAL RC QUALIFIED; NOT YET PUBLIC RELEASE-APPROVED

The launch scope is intentionally narrow: **Windows Solo**, with **Claude Code,
Codex, and Hermes** as the supported external-agent cohort. Cursor, OpenClaw,
and macOS packaging/certification remain roadmap work and do not block this
scope. This document is the ship authority; older readiness reports are
historical evidence only.

## Frozen code candidate

All current runtime and persona receipts refer to clean code candidate:

`692c69b9a6586b15ccc6f3f2eb40c65a95acd3aa`

The internal NSIS candidate is unsigned (`NotSigned`), 98,706,368 bytes, and has
SHA-256 `636DCD22BEB0765D8D15202A3268717385B383C9A8D7B6217650FEEB9A922D0A`.
A later documentation-only release-record commit is a no-impact attestation and
does not change this binary candidate.

## Current gate evidence

| Gate | Result | Receipt / evidence |
|---|---|---|
| Ten-persona paid acceptance | **PASS** — 30/30 accepted across ten personas x3; all selected receipts 100/100; no missing, duplicate, invalid, or manifest-error slots | `output/playwright/seals/persona-acceptance-schema7-20260813T023117Z-692c69b9/` |
| Smart router and compact tool context | **PASS** — primary, tool-context, durable-budget, and fallback; managed Ollama; Docker not invoked; cleanup 0 errors/0 owned processes | `output/smart-router/qualification-20260813T022319Z-692c69b9.json` |
| Official user-auth cohort | **PASS** — Claude Code, Codex, Hermes; three serial model calls; 0 auth files read/copied; tracked tree unchanged | `C:/tmp/waggle-readiness-evidence/official-auth-692c69b9-20260813T024840Z/official-auth-receipt.json` |
| TypeScript / lint / Tauri checks | **PASS with no-impact attestation** — agent, server, app tsc and cargo check green at `9a898846`; repo lint green there and focused lint green for both later qualifier files | Readiness session receipts; exact-candidate focused ESLint exit 0 |
| Full Vitest regression | **PASS with no-impact attestation** — full run exit 0; critical 341/341; performance 13/13 at `9a898846`; the exact-candidate smart-router qualification passed after qualifier-only changes | Readiness-session exit-0 receipt for full Vitest; `output/readiness-gates/9a898846/critical.log`; `output/readiness-gates/9a898846/perf.log` |
| Dependency severity snapshot | **PASS Critical/High gate** — 0 Critical and 0 High at `4de47ec6`; lower-severity advisories remain; subsequent non-documentation source changes are qualifier-harness only | `output/readiness-gates/4de47ec6/audit-full.json`, `audit-omit-dev.json` |
| Windows installer lifecycle + managed model | **PASS internal RC** — exact-candidate unsigned NSIS and embedded sidecar both at `692c69b9`; 59/59 clean-profile lifecycle, offline managed model, repair, data preservation, cleanup | `output/installer-certification/692c69b9-20260813T025915Z/windows-installer-certificate-692c69b9-20260813T031200Z-managed.json` |

## Public Windows binary blockers

1. **Authenticode:** the current NSIS artifact is unsigned (`NotSigned`); no public
   release artifact may be approved without the production signing workflow and
   verification against a publicly trusted signer.
2. **Formal deep security seal:** Codex Security deep scans have not produced a
   sealed canonical report in this host because of recorded permission, policy,
   and artifact-workflow blockers. Static review and `npm audit` are not substitutes.

## Public source/repository blockers

1. Publish and freeze the reviewed readiness source and artifact provenance; the branch
   remains local-only until an explicitly approved push/merge operation.
2. The mapped Hive Mind core-substrate exclusion/provenance audit is complete and recorded in
   `11-HIVE-MIND-PARITY-AUDIT-2026-08-13.md`. The separate OSS mirror remains
   drifted and requires a curated forward-port before its next release or any mirror
   parity claim. CLI, MCP, hooks, and wiki are outside that core checker and retain
   separate inventory requirements. Mirror parity does not block the Windows binary.
3. Repository/worktree hygiene classification is complete. Two stale registrations
   were pruned; live and reachable worktrees were preserved. The readiness worktree is
   tracked-clean. Local scratch retention is host hygiene, not a source-release defect.

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

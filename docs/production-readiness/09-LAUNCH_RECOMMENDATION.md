# Launch Recommendation — Windows Solo

Updated: 2026-08-13

## Current verdict: NOT YET RELEASE-APPROVED

The launch scope is intentionally narrow: **Windows Solo**, with **Claude Code,
Codex, and Hermes** as the supported external-agent cohort. Cursor, OpenClaw,
and macOS packaging/certification remain roadmap work and do not block this
scope. This document is the ship authority; older readiness reports are
historical evidence only.

## Historical sealed evidence revision

The last sealed receipt set below refers to the historical clean readiness HEAD:

`43fcfdfd6c5141eebf0f1d646d0fb36c0283c8f9`

The local unsigned NSIS build was completed from that source:

- Path: `app/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Waggle_0.2.0_x64-setup.exe`
- Size: `98,632,255` bytes
- SHA-256: `6432133733FF28AA53439CACEDEA1F36494B73AC6BDE90608020238B02650520`

The branch has advanced since this revision. These results are not current release
evidence until the final HEAD is rebuilt and resealed.

## Historical gate evidence

| Gate | Result | Receipt / evidence |
|---|---|---|
| Ten-persona paid acceptance | **HISTORICAL PASS; final-HEAD reseal pending** — 30/30, every receipt 100/100 | `output/playwright/seals/persona-acceptance-schema7-20260811T174500Z-43fcfdfd/` |
| Smart router and compact tool context | **HISTORICAL PASS; final-HEAD reseal pending** — primary, budget, fallback, managed Ollama runtime; Docker not invoked | `output/smart-router/qualification-20260811-43fcfdfd-retry2.json` |
| Official user-auth cohort | **HISTORICAL PASS; final-HEAD reseal pending** — Claude Code, Codex, Hermes; 0 auth files read/copied | `C:/tmp/waggle-readiness-evidence/official-auth-43fcfdfd-20260811/official-auth-receipt.json` |
| TypeScript / lint / Tauri checks | **HISTORICAL PASS; final-HEAD reseal pending** — agent, server, app tsc; lint; cargo check | Command output recorded in readiness session |
| Full Vitest regression | **HISTORICAL PASS; final-HEAD reseal pending** — exit 0; critical 341/341; performance 13/13 | Full run plus `npm run test:critical` and `npm run test:perf` |
| Dependency severity snapshot | **HISTORICAL PASS; final-HEAD reseal pending** — 0 Critical and 0 High; lower-severity advisories remain | `output/audit-full-43fcfdfd.json`, `output/audit-omit-dev-43fcfdfd.json` |
| Windows installer lifecycle + managed model | **HISTORICAL PASS; final-HEAD rebuild/certification pending** — 59 checks; built-in proxy, in-process embeddings, managed model, repair, data preservation, cleanup. The pilot artifact was not publicly trusted. | `output/installer-certification/windows-installer-certificate-43fcfdfd-20260811-rerun4-managed.json`; pilot: `output/installer-certification/windows-installer-certificate-43fcfdfd-20260811-pilot-signed-rerun2.json` |

## Release blockers

1. **Final-HEAD reseal:** rerun the affected regression, ten-persona, smart-router,
   official-auth, dependency, and Windows installer/runtime gates at the frozen final HEAD.
2. **Authenticode:** the historical NSIS artifact is unsigned (`NotSigned`); no public release
   artifact may be approved without the production signing workflow and signature
   verification.
3. **Formal deep security seal:** Codex Security deep scans have not produced a
   sealed canonical report in this host because of the permission/policy/artifact
   blockers recorded in the scan attempts. Static evidence and `npm audit` are not
   substitutes for that formal seal.

## Installation contract

Windows Solo must run without Docker, Python, developer Node.js, external LiteLLM,
or a separately installed Ollama. The bundled Node sidecar and no-Python
OpenAI-compatible proxy are required; in-process embeddings are the default and
local Ollama is optional for offline chat/routing.

## Deferred scope and repository hygiene

Cursor and OpenClaw remain roadmap integrations. macOS packaging, signing,
notarization, and runtime certification are also roadmap work. Hive Mind OSS
forward-port/drift cleanup and branch/worktree cleanup are required before a
public repository merge/release, but are separate from the Windows Solo runtime
GO decision.

## Approval rule

Change this verdict to **GO** only after the final-HEAD reseal, a production
Authenticode artifact, and a formal deep security seal have current exact-HEAD
evidence, with no unresolved Critical or High security findings. Until those gates
close, do not describe Waggle as production-ready, claim an overall 9.5/10, or claim
superiority over competing products.

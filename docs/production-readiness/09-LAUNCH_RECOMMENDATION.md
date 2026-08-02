# Launch Recommendation — Windows Solo

Updated: 2026-08-02

## Current Verdict: NOT YET RELEASE-APPROVED

The launch scope is deliberately narrow: **Windows Solo**, with **Claude Code,
Codex, and Hermes** as the in-scope external-agent release cohort. Cursor,
OpenClaw, and macOS certification are roadmap work and do not block this launch.

This file is the current ship authority. Older readiness and sign-off documents
are historical evidence only.

## Evidence Already Closed

| Gate | Evidence | Boundary |
|---|---|---|
| Persona acceptance | 30/30 receipts across 10 personas × 3 fresh runs; all scored 100/100; accepted-run estimate $1.413981 | Sealed at source revision `56c6791053a0`; it proves the persona target at that revision, not final release approval |
| Smart router and compact tool context | Runtime qualification passed at `626786ab497c`; Docker was not invoked; 14 of 79 tools were transmitted in the tool-context case | Must be preserved by the final exact-HEAD regression gate |
| Hermes installed-host memory path | Cold-to-warm causal proof passed at `56c6791053a0`, with launch surface ready and no paid provider calls in the configured loopback scope | Final release HEAD rerun remains required |
| Cursor/OpenClaw deferral | Production manifests, registry, launcher UI, hook controls, Fleet/task helpers, and `/api/tools/run` fail closed | Verified in commits `f5519bfc`, `42a769b8`, and `4374c94b` |
| Regression verification for scope change | Shared/agent/server suites: 6,841 passed, 2 skipped; web suite and build passed; affected typechecks and lint passed | One high-parallel server run had an unrelated transient test failure; its isolated test and lower-concurrency full rerun passed |

The persona result meets the requested score target for its sealed revision. It
does **not** by itself establish that the final installer is production-ready.

Release-local receipts:

- Persona seal: `output/playwright/seals/persona-acceptance-20260802T075249Z-56c67910/report.md`
- Smart router: `output/smart-router-runtime-qualification-626786ab.json`
- Hermes installed-host proof: `output/hermes-host-canary-56c67910/installed-run-20260802T102316Z/report.json`

## Remaining Release Gates

All of the following must pass against the final frozen commit:

1. **Persona-seal final-HEAD attestation** — prove the final commit descends
   from `56c6791053a0` and review every intervening diff for impact on persona,
   chat, scoring, provider, memory, or routing behavior. If any such behavior
   changed, rerun and reseal all 10 personas × 3 fresh runs; otherwise preserve
   a machine-readable no-impact attestation tied to the final commit.
2. **Exact-HEAD regression and router qualification** — rerun the affected
   package suites, typechecks, lint, web build, and the Docker-free primary /
   budget / fallback smart-router receipt with the compact tool-context case.
3. **Windows installer certificate** — rebuild the installer, then install and
   exercise first run, sidecar, bundled proxy, model/embedding path, restart,
   uninstall, and residue checks in a disposable Windows user profile with no
   dependency on developer Node, Python, Docker, LiteLLM, or Ollama installs.
4. **Claude Code user-auth canary** — the user completes official
   `claude auth login`; then the cold/warm workspace-memory and isolation canary
   passes without copying or bypassing credentials.
5. **Supported-agent exact-HEAD canaries** — rerun Codex and Hermes alongside
   Claude Code and preserve machine-readable receipts.
6. **Deep security seal** — start a fresh entire-codebase deep Codex Security
   scan from a clean worktree at the final commit; resolve or explicitly block
   release on every validated Critical/High finding; seal canonical artifacts.
7. **Authenticode** — sign the release installer and verify its signature and
   checksum. An unsigned local test build is not a public release artifact.

## Supported and Deferred Surfaces

| Surface | Windows Solo launch status | Notes |
|---|---|---|
| Claude Code | In scope; pending final OAuth-backed canary | Uses the user's official Claude installation and authentication |
| Codex | In scope; pending final exact-HEAD canary | Uses the user's official OpenAI/Codex authentication |
| Hermes | In scope; pending final exact-HEAD canary | Prior installed-host causal proof passed |
| Claude/Codex/Hermes desktop shortcuts | Inventory/convenience only | Not separate memory-hook or agent-acceptance targets |
| Cursor | Roadmap | Detection may remain; launch, hooks, and task dispatch are unavailable |
| OpenClaw | Roadmap | Unstable upgrade/runtime behavior is outside the launch gate |
| ChatGPT/OpenAI | Provider and memory-import surface | Not a separate local coding-agent launcher |
| macOS | Roadmap | Packaging, signing, notarization, and runtime certification deferred |

## Installation Contract

The Windows Solo desktop must work without Docker, Python, or an external
LiteLLM service. The Node sidecar and no-Python OpenAI-compatible proxy are
bundled. Ollama remains optional: the default embedding path can run in process,
while a user-installed local model may be used for offline chat/routing.

Docker and LiteLLM files remain supported deployment options for server/team
environments; their presence in the repository does not make them desktop
prerequisites.

## Separate Repository/OSS Hygiene

The private desktop launch and a public `hive-mind` package release are separate
decisions. Before any new OSS/npm publication, the curated forward-port, drift
policy, reverse-sync workflow, and package allowlists/private flags must be
reconciled. That work does not silently expand the Windows Solo launch cohort,
but broad claims such as “entire repository publish-ready” remain prohibited
until it is complete.

## Approval Rule

Change this verdict to **GO** only after all seven remaining release gates have
current, exact-HEAD receipts and there are no unresolved Critical/High security
findings. Until then, do not describe Waggle as production-ready or claim an
overall 9.5/10 release score.

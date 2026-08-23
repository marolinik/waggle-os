# E-4 — OSS Subtree-Split Extraction Verified (2026-05-20)

## Status: ⛔ SUPERSEDED — DO NOT FOLLOW

This is a historical verification record. Its former publication instructions
were invalidated by the 2026-06-12 drift analysis: raw subtree branches have the
wrong public-repository layout and can contain Waggle-only files plus interleaved
`install_audit` logic. They are inspection inputs only, never publication sources.

The current authoritative process is in `AGENTS.md` §7.5 and
`packages/hive-mind-core/CONTRIBUTING.md`: prepare a maintainer-curated
forward-port in the OSS checkout, strip every documented exclusion, adapt layout
and imports, review the complete diff, then run `scripts/oss-drift-check.sh`.

`scripts/oss-subtree-split.sh` was previously listed as "scaffold done, code copy TODO" (CR-6 in `BACKLOG-CONSOLIDATED-2026-04-17.md`). This session ran the script locally against all 12 `packages/hive-mind-*` packages and confirmed:

1. Every package produces a clean linear-history export branch (`oss-<package>-export`).
2. The monorepo-bleed sentinel (forbidden top-level entries: `apps`, `packages`, `sidecar`, `.planning`, `.scratch`, `.mind`, `benchmarks`) fires correctly — no leak detected on any of the 12 splits.
3. Each export branch's HEAD top-level matches the expected package shape: `CONTRIBUTING.md / LICENSE / README.md / package.json / src / tests / tsconfig.json` (precise mix varies per package).

## Verified branches

```
oss-hive-mind-cli-export
oss-hive-mind-core-export                      (1108 commits, substrate)
oss-hive-mind-hooks-claude-code-export
oss-hive-mind-hooks-claude-desktop-export
oss-hive-mind-hooks-codex-desktop-export
oss-hive-mind-hooks-codex-export
oss-hive-mind-hooks-cursor-export
oss-hive-mind-hooks-hermes-export
oss-hive-mind-hooks-openclaw-export
oss-hive-mind-mcp-server-export
oss-hive-mind-shim-core-export
oss-hive-mind-wiki-compiler-export
```

All 12 were local-only refs and were not published. Their existence did not make
them safe publication artifacts.

## Regression guards added

`tests/oss-subtree-split.test.ts` now includes static guards plus an executable
temporary-repository rollback test. It locks down:

- Script exists with bash shebang + `set -euo pipefail`
- Dynamic `packages/hive-mind-*` discovery (Wave 2/3 auto-inclusion)
- Forbidden-list contains every monorepo-level dir that actually exists
- Forbidden-list does NOT include package-internal dirs (`src`, `tests`, `dist`, `docs`, `assets`)
- Every `hive-mind-*` package has `package.json` + `src/` + Apache-2.0 license

The first run flagged a stale forbidden entry (`cowork/` — listed in the script but no longer at the repo root). Removed; commit landed in this same change.

## Invalidated publication guidance

The former “Day 0” raw-branch publication commands were removed because they
could expose proprietary content and cannot produce the curated mirror layout.
Do not reconstruct or use them from repository history.

## What's NOT done (deliberate)

- **No remote publication.** The script produces local inspection branches only.
- **No CI workflow that runs splits.** Each split processes hundreds-to-thousands of commits and takes minutes per package; running this on every PR would be wasteful. The static-guard test (`oss-subtree-split.test.ts`) catches the regressions that matter (forbidden list drift, script syntax, package-shape) without paying the split cost.
- **No automatic reverse-sync.** OSS upstream changes don't flow back automatically; that's a manual cherry-pick following `.github/sync.md`.

## How to re-verify in future sessions

```bash
# Run the static guards (fast):
npx vitest run tests/oss-subtree-split.test.ts

# Re-split all packages for local inspection only (slow — 5-10 minutes total):
bash scripts/oss-subtree-split.sh

# Single-package re-split (fastest spot-check):
bash scripts/oss-subtree-split.sh hive-mind-core

# Inspect any export branch:
git checkout oss-hive-mind-core-export && ls
git checkout -  # return
```

## CR-6 historical disposition

The original CR-6 proved isolated-history extraction, not a safe OSS release
mechanism. Any future mirror release remains a separate curated-forward-port task.

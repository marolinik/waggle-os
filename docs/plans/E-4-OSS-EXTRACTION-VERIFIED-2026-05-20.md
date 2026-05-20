# E-4 — OSS Subtree-Split Extraction Verified (2026-05-20)

## Status: ✅ Verified-working, ready for Day 0 push

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

All 12 are local-only refs — **NOT pushed to any remote** (per the script's design: `git push` is a manual step).

## Regression guards added

`tests/oss-subtree-split.test.ts` — 44 static-analysis tests that lock down:

- Script exists with bash shebang + `set -euo pipefail`
- Dynamic `packages/hive-mind-*` discovery (Wave 2/3 auto-inclusion)
- Forbidden-list contains every monorepo-level dir that actually exists
- Forbidden-list does NOT include package-internal dirs (`src`, `tests`, `dist`, `docs`, `assets`)
- Every `hive-mind-*` package has `package.json` + `src/` + Apache-2.0 license

The first run flagged a stale forbidden entry (`cowork/` — listed in the script but no longer at the repo root). Removed; commit landed in this same change.

## What "Day 0 push" means

For each export branch, the maintainer (Marko) pushes to a remote:

```bash
# Either per-package, to dedicated OSS mirror repos:
git push <oss-mirror-remote> oss-hive-mind-core-export:main

# Or to a consolidated repo as a subdirectory:
git push origin-hive-mind oss-hive-mind-core-export:packages/hive-mind-core
```

Per `packages/hive-mind-core/CONTRIBUTING.md`, the consolidated-repo model is at `github.com/marolinik/hive-mind`. Adding a remote for that:

```bash
git remote add origin-hive-mind https://github.com/marolinik/hive-mind.git
git push origin-hive-mind oss-hive-mind-core-export:main
# ... repeat per package, mapping to its directory in the consolidated repo
```

## What's NOT done (deliberate)

- **No remote pushes.** The script + this verification produce export branches; pushing is manual + Day-0-gated per the OSS launch playbook.
- **No CI workflow that runs splits.** Each split processes hundreds-to-thousands of commits and takes minutes per package; running this on every PR would be wasteful. The static-guard test (`oss-subtree-split.test.ts`) catches the regressions that matter (forbidden list drift, script syntax, package-shape) without paying the split cost.
- **No automatic reverse-sync.** OSS upstream changes don't flow back automatically; that's a manual cherry-pick following `.github/sync.md`.

## How to re-verify in future sessions

```bash
# Run the static guards (fast):
npx vitest run tests/oss-subtree-split.test.ts

# Re-split + verify all 12 packages (slow — 5-10 minutes total):
bash scripts/oss-subtree-split.sh

# Single-package re-split (fastest spot-check):
bash scripts/oss-subtree-split.sh hive-mind-core

# Inspect any export branch:
git checkout oss-hive-mind-core-export && ls
git checkout -  # return
```

## CR-6 ✅ CLOSED

The original CR-6 was "hive-mind actual source extraction — scaffold done, code copy TODO." The scaffold + the working extraction mechanism + a regression guard now all exist. The remaining "code copy" step is the manual Day-0 `git push` to the OSS mirror, which is correctly out of session scope.

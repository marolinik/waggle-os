#!/usr/bin/env bash
#
# oss-subtree-split.sh — emit hive-mind-* packages to OSS export branches.
#
# Per CC Sesija B brief 2026-04-30 §2.6 Task B20.
#
# What this does:
#   For each `packages/hive-mind-*` directory, run `git subtree split` to produce
#   a clean linear history branch containing only that package's commits.
#   The resulting branches are named `oss-<package>-export` and live LOCAL ONLY
#   in this clone — they are NOT pushed automatically.
#
# After this script runs, the maintainer (Marko / Egzakta) can `git push` each
# `oss-<package>-export` branch to `github.com/marolinik/hive-mind` (or the
# package-specific OSS mirror) for Day 0 launch.
#
# Usage:
#   bash scripts/oss-subtree-split.sh                   # split all hive-mind-* packages
#   bash scripts/oss-subtree-split.sh hive-mind-core    # split only one package
#
# Idempotent: re-running drops + recreates the export branches with current state.
#
# Why subtree-split (not git-filter-repo or BFG):
#   - subtree-split is built into git, no extra tooling required for maintainers
#   - Preserves commit-level attribution + dates (BFG/filter-repo also preserve, but
#     subtree-split is the simplest mental model: "give me a branch where this dir
#     is the root")
#   - The script is what runs on Marko's machine when ready for Day 0 push;
#     CI does NOT auto-push (manual gate per OSS launch playbook)

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Default: split all hive-mind-* packages. Override via CLI args for targeted split.
if [[ $# -gt 0 ]]; then
  PACKAGES=("$@")
else
  # Discover packages dynamically so newly-added Wave 2/3 hooks are auto-included.
  mapfile -t PACKAGES < <(ls -1d packages/hive-mind-* 2>/dev/null | sed 's|packages/||')
fi

if [[ ${#PACKAGES[@]} -eq 0 ]]; then
  echo "[oss-subtree-split] No packages/hive-mind-* directories found. Nothing to split." >&2
  exit 1
fi

echo "[oss-subtree-split] Will split ${#PACKAGES[@]} package(s):"
for pkg in "${PACKAGES[@]}"; do
  echo "  - $pkg"
done
echo

for pkg in "${PACKAGES[@]}"; do
  PREFIX="packages/$pkg"
  BRANCH="oss-${pkg}-export"

  if [[ ! -d "$PREFIX" ]]; then
    echo "[oss-subtree-split] SKIP $pkg — directory $PREFIX not found." >&2
    continue
  fi

  # Drop existing export branch if present (idempotent).
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    echo "[oss-subtree-split] Dropping existing branch $BRANCH"
    git branch -D "$BRANCH" >/dev/null
  fi

  echo "[oss-subtree-split] Splitting $PREFIX → $BRANCH"
  git subtree split --prefix="$PREFIX" --branch="$BRANCH"

  # Top-level summary for audit.
  TOP_LEVEL=$(git ls-tree --name-only "$BRANCH" | sort | tr '\n' ' ')
  echo "[oss-subtree-split]   $BRANCH HEAD top-level: $TOP_LEVEL"

  # Negative assertion: monorepo-bleed sentinel. The subtree-split's prefix=
  # arg already guarantees the export contains ONLY the subtree, but we
  # double-check that no monorepo-LEVEL siblings leaked. Package-internal dirs
  # (docs/, assets/, src/, tests/, dist/) are legitimate and not flagged.
  # Forbidden = paths that ONLY exist as monorepo siblings, never as package contents.
  for forbidden in apps packages sidecar cowork .planning .scratch .mind benchmarks; do
    if echo "$TOP_LEVEL" | grep -qE "(^| )$forbidden( |$)"; then
      echo "[oss-subtree-split]   ERROR: $BRANCH contains forbidden monorepo-level entry '$forbidden'." >&2
      echo "[oss-subtree-split]   This indicates the subtree-split misbehaved or proprietary content leaked." >&2
      echo "[oss-subtree-split]   Inspect with: git checkout $BRANCH && ls" >&2
      exit 2
    fi
  done

  echo "[oss-subtree-split]   ✓ $BRANCH split complete (no monorepo-level leak detected)"
  echo
done

echo "[oss-subtree-split] All splits complete. Local branches ready:"
for pkg in "${PACKAGES[@]}"; do
  echo "  oss-${pkg}-export"
done
echo
echo "[oss-subtree-split] Next step (manual, NOT done by this script):"
echo "  For each branch, push to the OSS mirror, e.g.:"
echo "    git push <oss-mirror-remote> oss-hive-mind-core-export:main"
echo "  Or to the consolidated OSS repo (github.com/marolinik/hive-mind):"
echo "    git push origin-hive-mind oss-hive-mind-core-export:packages/hive-mind-core"
echo "  See packages/hive-mind-core/CONTRIBUTING.md for distribution model."

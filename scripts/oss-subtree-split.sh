#!/usr/bin/env bash
#
# oss-subtree-split.sh — emit hive-mind-* packages to local export branches.
#
# Per CC Sesija B brief 2026-04-30 §2.6 Task B20.
#
# ============================================================================
# ⚠️  DO NOT PUSH THE OUTPUT OF THIS SCRIPT DIRECTLY TO THE PUBLIC OSS MIRROR.
# ============================================================================
# This script produces RAW per-package subtree branches. They are NOT
# OSS-publishable as-is, for three reasons established by the 2026-06-12 drift
# analysis (docs/ux-refactor/oss-sync-finding-2026-06-12.md):
#
#   1. PROPRIETARY FILES. `packages/hive-mind-core/src/mind/` contains
#      evolution-runs.ts, execution-traces.ts, improvement-signals.ts — Waggle
#      proprietary, EXCLUDED from the public mirror. A raw split carries them.
#      (The hard abort guard below refuses to publish a ref that contains them,
#      so the leak can't happen silently — but the guard is a backstop, not the
#      sync mechanism.)
#   2. INTERLEAVED PROPRIETARY CONTENT. The `install_audit` table DDL + its
#      rebuild migration live INSIDE mind/{schema.ts,db.ts} (not as separate
#      files), and are also OSS-excluded. A file-level filter cannot strip them
#      — only a curated edit can. The guard cannot catch this.
#   3. WRONG LAYOUT. The public mirror (github.com/marolinik/hive-mind) uses a
#      curated layout (`packages/core`, co-located tests, rewritten imports),
#      NOT `packages/hive-mind-core`. A raw split has the wrong root.
#
# THE REAL SYNC is a hand-curated forward-port onto a maintainer feature branch
# in the OSS clone (e.g. the `feature/mono-parity-YYYY-MM-DD` model), which
# adapts the layout, strips install_audit + the proprietary files, and rewrites
# imports. See packages/hive-mind-core/CONTRIBUTING.md and the finding doc.
#
# This script remains useful ONLY for: inspecting a package's isolated history,
# or as the starting point for a curated port. The push step is the maintainer's.
#
# What this does:
#   For each `packages/hive-mind-*` directory, run `git subtree split` to produce
#   a clean linear history branch containing only that package's commits.
#   The resulting branches are named `oss-<package>-export` and live LOCAL ONLY
#   in this clone — they are NOT pushed automatically.
#
# Usage:
#   bash scripts/oss-subtree-split.sh                   # split all hive-mind-* packages
#   bash scripts/oss-subtree-split.sh hive-mind-core    # split only one package
#
# Idempotent: re-running replaces export refs only after a candidate passes every guard.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

VALIDATED_BRANCHES=()
VALIDATED_SHAS=()

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
    echo "[oss-subtree-split] ERROR: requested package directory $PREFIX was not found." >&2
    exit 2
  fi

  echo "[oss-subtree-split] Splitting $PREFIX → detached candidate commit"
  CANDIDATE_SHA=$(git subtree split --prefix="$PREFIX" | tail -n 1)
  if ! git cat-file -e "${CANDIDATE_SHA}^{commit}" 2>/dev/null; then
    echo "[oss-subtree-split]   ERROR: subtree split did not return a valid commit." >&2
    exit 2
  fi

  # Top-level summary for audit.
  TOP_LEVEL=$(git ls-tree --name-only "$CANDIDATE_SHA" | sort | tr '\n' ' ')
  echo "[oss-subtree-split]   candidate HEAD top-level: $TOP_LEVEL"

  # Negative assertion: monorepo-bleed sentinel. The subtree-split's prefix=
  # arg already guarantees the export contains ONLY the subtree, but we
  # double-check that no monorepo-LEVEL siblings leaked. Package-internal dirs
  # (docs/, assets/, src/, tests/, dist/) are legitimate and not flagged.
  # Forbidden = paths that ONLY exist as monorepo siblings, never as package contents.
  for forbidden in apps packages sidecar .planning .scratch .mind benchmarks; do
    if echo "$TOP_LEVEL" | grep -qE "(^| )$forbidden( |$)"; then
      echo "[oss-subtree-split]   ERROR: candidate contains forbidden monorepo-level entry '$forbidden'." >&2
      echo "[oss-subtree-split]   This indicates the subtree-split misbehaved or proprietary content leaked." >&2
      echo "[oss-subtree-split]   No export refs were changed." >&2
      exit 2
    fi
  done

  # ── Proprietary-file ABORT guard (2026-06-12) ────────────────────────────
  # Hard backstop against the IP-leak failure mode: these files are Waggle
  # proprietary and must NEVER reach the public OSS mirror. They live inside
  # packages/hive-mind-core/src/mind/, so a raw subtree-split of that package
  # WILL carry them. CLAUDE.md §7.5 previously claimed a "subtree-split filter"
  # handled this — it did not exist; this guard is that protection, made real.
  # The guard ABORTS (does not silently scrub) — a leaky export branch must
  # never be produced, and the real OSS sync is a curated forward-port anyway.
  FORBIDDEN_FILES=(
    "src/mind/evolution-runs.ts"
    "src/mind/execution-traces.ts"
    "src/mind/improvement-signals.ts"
    "src/vault.ts"
    "src/compliance"
  )
  BRANCH_FILES=$(git ls-tree -r --name-only "$CANDIDATE_SHA")
  for pf in "${FORBIDDEN_FILES[@]}"; do
    if echo "$BRANCH_FILES" | grep -qE "(^|/)${pf}(/|\$|\.ts\$)"; then
      echo "[oss-subtree-split]   ERROR: candidate contains PROPRIETARY path '$pf'." >&2
      echo "[oss-subtree-split]   This export is NOT safe to push to the public OSS mirror." >&2
      echo "[oss-subtree-split]   These files are Waggle-proprietary (§7.5) and must be removed" >&2
      echo "[oss-subtree-split]   by the curated forward-port, not pushed raw. ABORTING." >&2
      echo "[oss-subtree-split]   See docs/ux-refactor/oss-sync-finding-2026-06-12.md." >&2
      exit 3
    fi
  done

  VALIDATED_BRANCHES+=("$BRANCH")
  VALIDATED_SHAS+=("$CANDIDATE_SHA")
  echo "[oss-subtree-split]   ✓ candidate validated (no monorepo-level leak, no proprietary files)"
  echo "[oss-subtree-split]   NOTE: this is a RAW history branch — NOT OSS-publishable as-is"
  echo "[oss-subtree-split]   (wrong layout + interleaved install_audit). Curate before any push."
  echo
done

# Update stable LOCAL inspection refs only after every requested package passes.
# Preflight checked-out refs, capture expected old OIDs, then use one compare-and-
# swap transaction so a lock/race/failure cannot leave a partially updated set.
ZERO_OID=$(printf '%040d' 0)
EXPECTED_OLD_SHAS=()
if ! WORKTREE_LIST=$(git worktree list --porcelain); then
  echo "[oss-subtree-split] ERROR: could not inventory checked-out worktree refs." >&2
  exit 4
fi
for i in "${!VALIDATED_BRANCHES[@]}"; do
  ref="refs/heads/${VALIDATED_BRANCHES[$i]}"
  if grep -Fxq "branch $ref" <<< "$WORKTREE_LIST"; then
    echo "[oss-subtree-split] ERROR: refusing to update checked-out ref $ref." >&2
    exit 4
  fi
  if git show-ref --verify --quiet "$ref"; then
    EXPECTED_OLD_SHAS+=("$(git rev-parse "$ref")")
  else
    EXPECTED_OLD_SHAS+=("$ZERO_OID")
  fi
done

if ! {
  echo start
  for i in "${!VALIDATED_BRANCHES[@]}"; do
    printf 'update refs/heads/%s %s %s\n' \
      "${VALIDATED_BRANCHES[$i]}" "${VALIDATED_SHAS[$i]}" "${EXPECTED_OLD_SHAS[$i]}"
  done
  echo prepare
  echo commit
} | git update-ref --stdin; then
  echo "[oss-subtree-split] ERROR: atomic export-ref transaction failed; no refs were changed." >&2
  exit 4
fi

echo "[oss-subtree-split] All splits complete. Local branches ready:"
for branch in "${VALIDATED_BRANCHES[@]}"; do
  echo "  $branch"
done
echo
echo "[oss-subtree-split] These branches are for INSPECTION / as a curation starting"
echo "[oss-subtree-split] point only. DO NOT push them raw to the public OSS mirror —"
echo "[oss-subtree-split] they carry the wrong layout and interleaved install_audit"
echo "[oss-subtree-split] (the proprietary FILES are blocked by the guard above, but"
echo "[oss-subtree-split] the install_audit DDL/migration inside schema.ts/db.ts is not)."
echo "[oss-subtree-split] The real sync is a curated forward-port onto the OSS clone's"
echo "[oss-subtree-split] maintainer feature branch — see CONTRIBUTING.md + the finding"
echo "[oss-subtree-split] doc: docs/ux-refactor/oss-sync-finding-2026-06-12.md."

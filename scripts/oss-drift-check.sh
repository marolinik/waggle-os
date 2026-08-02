#!/usr/bin/env bash
#
# oss-drift-check.sh — detect source drift between the canonical monorepo
# substrate and the public OSS mirror (github.com/marolinik/hive-mind).
#
# WHY THIS EXISTS (§7.5 policy, ratified 2026-06-11):
#   The monorepo is the SOLE source of truth for the memory substrate; the
#   OSS mirror is produced FROM it by a maintainer-curated forward-port. That
#   invariant broke once: the
#   cross-encoder reranker (inprocess-reranker.ts + HybridSearch options)
#   was authored directly on the OSS repo during the LoCoMo benchmark arc
#   and existed ONLY there — discovered by the W4 recon (2026-06-11),
#   reverse-ported in W4.2 (f47ee8f). This script makes that class of
#   drift cheap to detect BEFORE it compounds.
#
# WHAT IT DOES:
#   Recursively diffs the substrate source trees (src/ only — dist, deps,
#   lockfiles, and docs churn excluded) between the monorepo and a local
#   checkout of the OSS repo. Reports per-file status:
#     ONLY-IN-OSS   → candidate reverse-port (the W4.2 failure mode)
#     ONLY-IN-MONO  → not yet exported (fine if a split is pending)
#     DIFFERS       → divergent edits — inspect immediately
#   Exit 0 = clean, exit 1 = drift found, exit 2 = setup error.
#
# USAGE:
#   bash scripts/oss-drift-check.sh [path-to-oss-checkout]
#   Default OSS path: ../hive-mind (sibling clone), override via arg or
#   OSS_HIVE_MIND_DIR env var.
#
# WHEN TO RUN (maintainer ritual — manual, not CI):
#   - before every OSS release push (as input to the curated forward-port)
#   - after any benchmark/experiment arc that touched a hive-mind checkout
#
# Mapping (OSS repo keeps its own package layout):
#   monorepo packages/hive-mind-core/src  ↔  oss packages/core/src
#   (extend MAPPINGS below as more packages get mirrored surfaces)

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

OSS_DIR="${1:-${OSS_HIVE_MIND_DIR:-$REPO_ROOT/../hive-mind}}"

if [[ ! -d "$OSS_DIR/.git" ]]; then
  echo "[oss-drift-check] ERROR: OSS checkout not found at: $OSS_DIR" >&2
  echo "[oss-drift-check] Clone it first: git clone https://github.com/marolinik/hive-mind \"$OSS_DIR\"" >&2
  exit 2
fi

# mono-relative-dir : oss-relative-dir
MAPPINGS=(
  "packages/hive-mind-core/src:packages/core/src"
)

# Excluded from comparison:
#  - build artifacts (dist, node_modules, .tsbuildinfo)
#  - *.test.ts — test LAYOUT is a permanent convention difference (OSS
#    co-locates tests beside src; the monorepo keeps them in tests/), so
#    co-located tests would be unfixable noise. Source drift is the target.
IGNORE_RE='(^|/)(dist|node_modules|\.tsbuildinfo)(/|$)|\.test\.ts$'

drift=0

for mapping in "${MAPPINGS[@]}"; do
  mono_dir="${mapping%%:*}"
  oss_dir="${mapping##*:}"
  echo "[oss-drift-check] ${mono_dir}  ↔  ${OSS_DIR}/${oss_dir}"

  if [[ ! -d "$mono_dir" ]]; then
    echo "[oss-drift-check]   ERROR: monorepo dir missing: $mono_dir" >&2
    exit 2
  fi
  if [[ ! -d "$OSS_DIR/$oss_dir" ]]; then
    echo "[oss-drift-check]   ERROR: OSS dir missing: $OSS_DIR/$oss_dir" >&2
    exit 2
  fi

  # File inventories (relative paths), excluding build artifacts.
  mono_files=$(cd "$mono_dir" && find . -type f | sed 's|^\./||' | grep -Ev "$IGNORE_RE" | sort)
  oss_files=$(cd "$OSS_DIR/$oss_dir" && find . -type f | sed 's|^\./||' | grep -Ev "$IGNORE_RE" | sort)

  only_oss=$(comm -13 <(echo "$mono_files") <(echo "$oss_files"))
  only_mono=$(comm -23 <(echo "$mono_files") <(echo "$oss_files"))
  common=$(comm -12 <(echo "$mono_files") <(echo "$oss_files"))

  if [[ -n "$only_oss" ]]; then
    drift=1
    echo "  ONLY-IN-OSS (candidate reverse-port — the W4.2 failure mode):"
    echo "$only_oss" | sed 's/^/    /'
  fi
  if [[ -n "$only_mono" ]]; then
    drift=1
    echo "  ONLY-IN-MONO (pending export — fine if a split is queued):"
    echo "$only_mono" | sed 's/^/    /'
  fi

  differing=""
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if ! diff -q "$mono_dir/$f" "$OSS_DIR/$oss_dir/$f" >/dev/null 2>&1; then
      differing+="    $f"$'\n'
    fi
  done <<< "$common"

  if [[ -n "$differing" ]]; then
    drift=1
    echo "  DIFFERS (divergent edits — inspect immediately):"
    printf '%s' "$differing"
  fi

  if [[ -z "$only_oss" && -z "$only_mono" && -z "$differing" ]]; then
    echo "  ✓ clean"
  fi
  echo
done

if [[ $drift -eq 1 ]]; then
  echo "[oss-drift-check] DRIFT DETECTED. Policy (§7.5): the monorepo is the"
  echo "[oss-drift-check] sole source — reverse-port ONLY-IN-OSS work here first,"
    echo "[oss-drift-check] then prepare a maintainer-curated forward-port."
    echo "[oss-drift-check] scripts/oss-subtree-split.sh is inspection-only; never push its raw branches."
  exit 1
fi
echo "[oss-drift-check] All mapped surfaces clean."

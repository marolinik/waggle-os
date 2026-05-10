#!/usr/bin/env bash
#
# Local-dev parity check for memory substrate (waggle-os ↔ hive-mind).
#
# Mirrors the logic of `.github/workflows/mind-parity-check.yml` so you can
# run the same check locally before pushing. Useful when you're modifying
# `packages/core/src/mind/` or `packages/core/src/harvest/` and want to
# catch parity failures without waiting for CI.
#
# USAGE:
#   scripts/parity-check.sh [--keep-injected]
#
# Options:
#   --keep-injected   Don't clean up CI-injected -hive-mind suffix files
#                     after the run (useful for inspecting what CI sees).
#
# REQUIREMENTS:
#   - hive-mind checked out at one of:
#       D:/Projects/hive-mind          (default Windows path)
#       ~/Projects/hive-mind           (default Unix path)
#       $HIVE_MIND_PATH                (override)
#   - npm + Node + a working `npx vitest`
#   - The waggle-os repo as the cwd
#
# See `.github/sync.md` for full design rationale and `.parity-allowlist`
# policy.

set -euo pipefail

KEEP_INJECTED=0
for arg in "$@"; do
  case "$arg" in
    --keep-injected) KEEP_INJECTED=1 ;;
    -h|--help)
      sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      echo "Run with --help for usage" >&2
      exit 2
      ;;
  esac
done

# Locate hive-mind checkout
if [ -n "${HIVE_MIND_PATH:-}" ]; then
  hive_root="$HIVE_MIND_PATH"
elif [ -d "D:/Projects/hive-mind/packages/core/src/mind" ]; then
  hive_root="D:/Projects/hive-mind"
elif [ -d "$HOME/Projects/hive-mind/packages/core/src/mind" ]; then
  hive_root="$HOME/Projects/hive-mind"
else
  echo "::error:: hive-mind checkout not found. Set HIVE_MIND_PATH or clone marolinik/hive-mind to D:/Projects/hive-mind." >&2
  exit 1
fi
echo "hive-mind root: $hive_root"

# Verify cwd is waggle-os
if [ ! -f "packages/core/src/mind/db.ts" ]; then
  echo "::error:: this script must run from the waggle-os repo root." >&2
  exit 1
fi

# Parse .parity-allowlist
allowlist_file=".parity-allowlist"
allowlist_basenames=()
if [ -f "$allowlist_file" ]; then
  while IFS= read -r line; do
    clean="${line%%#*}"
    clean="$(echo "$clean" | tr -d '[:space:]')"
    [ -z "$clean" ] && continue
    allowlist_basenames+=("$clean")
  done < "$allowlist_file"
  echo "Allowlist: ${allowlist_basenames[*]:-<none>}"
fi
is_allowlisted() {
  local name="$1"
  for a in "${allowlist_basenames[@]:-}"; do
    [ "$a" = "$name" ] && return 0
  done
  return 1
}

# Inject — track ONLY files we add new (not overwrite committed ones)
target_dir="packages/core/tests/mind"
source_dir="$hive_root/packages/core/src/mind"
mkdir -p tmp
> tmp/parity-injected.txt

injected=0
overwrote=0
skipped=0
for src in "$source_dir"/*.test.ts; do
  [ -e "$src" ] || continue
  base="$(basename "$src" .test.ts)"
  target_name="${base}-hive-mind.test.ts"
  target_path="$target_dir/$target_name"

  if is_allowlisted "$target_name"; then
    skipped=$((skipped + 1))
    continue
  fi

  if [ -f "$target_path" ]; then
    # File is committed (Step 2 port — possibly with bespoke header
    # comments documenting port provenance + adaptation rationale).
    # Don't overwrite: the committed version IS what CI/local should
    # exercise. We track which files we observed already-present so the
    # operator sees the count.
    overwrote=$((overwrote + 1))
    continue
  fi
  injected=$((injected + 1))
  echo "$target_path" >> tmp/parity-injected.txt
  cp "$src" "$target_path"
  sed -i "s|from \"\\./|from \"../../src/mind/|g" "$target_path"
  sed -i "s|from '\\./|from '../../src/mind/|g" "$target_path"
done
echo "Injected: $injected new + $overwrote already-committed-skip + $skipped allowlisted-skip"

# Run the suite
echo ""
echo "## Running combined waggle-os + hive-mind suite..."
exit_code=0
npx vitest run --reporter=default "$target_dir" || exit_code=$?

# Cleanup
if [ $KEEP_INJECTED -eq 0 ]; then
  while IFS= read -r f; do
    [ -n "$f" ] && rm -f "$f"
  done < tmp/parity-injected.txt
  echo ""
  echo "Cleaned up $(wc -l < tmp/parity-injected.txt) injected files"
else
  echo ""
  echo "Kept injected files (--keep-injected). Track in tmp/parity-injected.txt"
fi

exit $exit_code

#!/usr/bin/env bash
# Idempotent vendor of sierra-research/tau2-bench at the pinned SHA (or $TAU2_REF).
# Records the resolved commit SHA so the executor can pin it in vendor-pin.ts.
# The cloned tree lives at benchmarks/tau2/upstream and is GITIGNORED — only our
# adapter code + the pin + this script are committed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAU2_DIR="$(cd "$HERE/.." && pwd)"          # benchmarks/tau2
UPSTREAM="$TAU2_DIR/upstream"
REPO="https://github.com/sierra-research/tau2-bench"
# Default to the pinned SHA so a fresh vendor reproduces the recorded checkout.
REF="${TAU2_REF:-5ebebbe827b455b3ed04fcb9294235c6ef4e5fd6}"

if [ ! -d "$UPSTREAM/.git" ]; then
  git clone "$REPO" "$UPSTREAM"
fi
git -C "$UPSTREAM" fetch --all --tags
git -C "$UPSTREAM" checkout "$REF"
SHA="$(git -C "$UPSTREAM" rev-parse HEAD)"
echo "[tau2-vendor] checked out $REPO @ $SHA"
echo "[tau2-vendor] >>> set TAU2_PINNED_COMMIT in benchmarks/harness/src/tau2/vendor-pin.ts to: $SHA"

# Python install (prefer uv; fall back to pip into a local venv).
if command -v uv >/dev/null 2>&1; then
  ( cd "$UPSTREAM" && uv sync )
else
  python3 -m venv "$UPSTREAM/.venv"
  # shellcheck disable=SC1091
  . "$UPSTREAM/.venv/bin/activate"
  pip install -e "$UPSTREAM"
fi
echo "[tau2-vendor] install complete. Smoke: ( cd $UPSTREAM && uv run tau2 --help )"

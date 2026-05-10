#!/usr/bin/env bash
# sign-macos-adhoc.sh — re-sign + verify a Tauri-built .app bundle for the
# Wave-1 Egzakta-internal pilot using ad-hoc signing.
#
# Implements docs/code-signing-pilot-and-launch.md §1.2 (macOS ad-hoc).
#
# Usage:
#   ./sign-macos-adhoc.sh <path-to-Waggle.app>
#
# Tauri's bundle config (tauri.build-override.conf.json) already passes
# `signingIdentity: "-"` to codesign at build time, so the produced .app is
# already ad-hoc-signed. This script:
#
#   1. Re-signs the bundle with --force --deep to catch any nested helpers
#      (sidecar binary, native deps) that Tauri's pass missed.
#   2. Verifies the signature with --verify --deep --strict.
#
# Distribute the result wrapped in .zip (NOT .dmg — Gatekeeper enforces
# notarization more aggressively on disk images since macOS 10.15).
#
# NOT for public Day-0 — that requires Apple Developer ID + notarization
# per docs/code-signing-pilot-and-launch.md §2.2.

set -euo pipefail

APP_PATH="${1:-}"

if [[ -z "$APP_PATH" ]]; then
  echo "usage: $0 <path-to-Waggle.app>" >&2
  exit 64  # EX_USAGE
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "[sign-macos-adhoc] not a directory: $APP_PATH" >&2
  exit 66  # EX_NOINPUT
fi

if [[ ! "$APP_PATH" =~ \.app$ ]]; then
  echo "[sign-macos-adhoc] path must end in .app: $APP_PATH" >&2
  exit 64
fi

if ! command -v codesign >/dev/null 2>&1; then
  echo "[sign-macos-adhoc] codesign not found — Xcode command-line tools required." >&2
  exit 69  # EX_UNAVAILABLE
fi

echo "[sign-macos-adhoc] re-signing: $APP_PATH"
codesign --force --deep --sign - "$APP_PATH"

echo "[sign-macos-adhoc] verifying signature"
codesign --verify --deep --strict "$APP_PATH"

echo "[sign-macos-adhoc] OK"
echo ""
echo "Next:"
echo "  ditto -c -k --keepParent \"$APP_PATH\" \"${APP_PATH%.app}.zip\""
echo "  # Distribute the .zip, NOT a .dmg, for the pilot."

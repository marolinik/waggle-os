#!/usr/bin/env bash
#
# install.sh — one-line self-host installer for Waggle OS (Linux + macOS).
#
#   curl -fsSL https://raw.githubusercontent.com/marolinik/waggle-os/main/install.sh | bash
#
# WHY THIS EXISTS (steal #5, installer arc 2026-07-10):
#   Waggle had a Tauri desktop binary, a heavy Docker team stack, and a
#   "clone + two dev terminals" README — but no one-command headless self-host
#   story for the VPS/homelab audience the OSS funnel targets. This installer
#   fills that gap: prereqs -> clone -> build -> tiny wizard -> start -> URL.
#
# WHAT IT DOES NOT DO (by design, D2/D3):
#   No sudo, ever. No API keys, personas, or channel setup — the web UI's
#   OnboardingWizard owns all of that. Missing prerequisites print the exact
#   per-OS install command and exit; we never install system packages for you.
#
# FLAGS:
#   --yes                 non-interactive; accept every wizard default
#   --dir PATH            install directory       (default: ~/waggle-os)
#   --port N              sidecar port            (default: 3333)
#   --data-dir PATH      data directory          (default: ~/.waggle)
#   --no-web             skip building the web UI (API/echo mode only)
#   --no-start           install but do not start the server
#   --branch NAME        git branch to clone     (default: main)
#   --local-source PATH  copy an existing checkout instead of git-cloning
#                         (for CI and local testing; includes uncommitted files)
#
# Idempotent: re-running against an installed directory prints an upgrade hint
# and exits without re-cloning or rebuilding.

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────
REPO_URL="https://github.com/marolinik/waggle-os.git"
MIN_NODE_MAJOR=20
DEFAULT_PORT=3333
MARKER_NAME=".waggle-installed"

# ── Wizard defaults ───────────────────────────────────────────────────────────
INSTALL_DIR="$HOME/waggle-os"
PORT="$DEFAULT_PORT"
DATA_DIR="$HOME/.waggle"
BUILD_WEB=1
START_NOW=1
BRANCH="main"
ASSUME_YES=0
LOCAL_SOURCE=""

# ── Pretty output (disabled when not a TTY) ───────────────────────────────────
if [ -t 1 ]; then
  C_BOLD="$(printf '\033[1m')"; C_DIM="$(printf '\033[2m')"
  C_GREEN="$(printf '\033[32m')"; C_YELLOW="$(printf '\033[33m')"
  C_RED="$(printf '\033[31m')"; C_RESET="$(printf '\033[0m')"
else
  C_BOLD=""; C_DIM=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_RESET=""
fi

say()  { echo "${C_BOLD}==>${C_RESET} $*"; }
info() { echo "    $*"; }
warn() { echo "${C_YELLOW}warning:${C_RESET} $*" >&2; }
die()  { echo "${C_RED}error:${C_RESET} $*" >&2; exit 1; }

on_interrupt() {
  # Restore sane terminal state if a wizard read was interrupted, then abort.
  [ -e /dev/tty ] && stty sane </dev/tty >/dev/null 2>&1 || true
  echo
  die "Aborted by user."
}
trap on_interrupt INT

# ── Arg parsing ───────────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y)        ASSUME_YES=1; shift ;;
    --dir)           INSTALL_DIR="${2:?--dir needs a value}"; shift 2 ;;
    --dir=*)         INSTALL_DIR="${1#*=}"; shift ;;
    --port)          PORT="${2:?--port needs a value}"; shift 2 ;;
    --port=*)        PORT="${1#*=}"; shift ;;
    --data-dir)      DATA_DIR="${2:?--data-dir needs a value}"; shift 2 ;;
    --data-dir=*)    DATA_DIR="${1#*=}"; shift ;;
    --no-web)        BUILD_WEB=0; shift ;;
    --no-start)      START_NOW=0; shift ;;
    --branch)        BRANCH="${2:?--branch needs a value}"; shift 2 ;;
    --branch=*)      BRANCH="${1#*=}"; shift ;;
    --local-source)  LOCAL_SOURCE="${2:?--local-source needs a value}"; shift 2 ;;
    --local-source=*) LOCAL_SOURCE="${1#*=}"; shift ;;
    -h|--help)
      sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) die "Unknown option: $1 (try --help)" ;;
  esac
done

# ── OS detection (for install hints; not a hard gate) ─────────────────────────
UNAME_S="$(uname -s 2>/dev/null || echo unknown)"
case "$UNAME_S" in
  Linux)  OS="linux" ;;
  Darwin) OS="macos" ;;
  *)      OS="other" ;;
esac

# Per-OS install command hint for a missing tool.
install_hint() {
  local tool="$1"
  case "$OS" in
    linux)  echo "sudo apt install ${tool}   # or: sudo dnf install ${tool}" ;;
    macos)  echo "brew install ${tool}" ;;
    *)      echo "install ${tool} using your platform's package manager" ;;
  esac
}

# ── Preflight ─────────────────────────────────────────────────────────────────
preflight() {
  say "Checking prerequisites"

  if [ "${BASH_VERSINFO:-0}" -lt 4 ]; then
    warn "bash ${BASH_VERSION} is old; this script targets bash >= 4 but avoids 4-only features. Continuing."
  fi

  if [ "$OS" = "other" ]; then
    warn "Unsupported OS '${UNAME_S}'. Official support is Linux and macOS; proceeding best-effort."
  fi

  command -v git >/dev/null 2>&1 || die "git is required. Install it:
    $(install_hint git)"

  if ! command -v node >/dev/null 2>&1; then
    die "Node.js >= ${MIN_NODE_MAJOR} is required. Install it:
    $(install_hint nodejs)
    or use nvm: https://github.com/nvm-sh/nvm"
  fi
  local node_major
  node_major="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')"
  if [ -z "$node_major" ] || [ "$node_major" -lt "$MIN_NODE_MAJOR" ]; then
    die "Node.js >= ${MIN_NODE_MAJOR} required, found $(node -v 2>/dev/null || echo none).
    Upgrade Node (nvm install ${MIN_NODE_MAJOR}) and re-run."
  fi

  command -v npm >/dev/null 2>&1 || die "npm is required (ships with Node.js). Re-install Node.js:
    $(install_hint nodejs)"

  # C++ toolchain: better-sqlite3 falls back to compiling from source when no
  # prebuilt binary matches. Warn only — a prebuilt often exists.
  if ! command -v cc >/dev/null 2>&1 && ! command -v gcc >/dev/null 2>&1 && ! command -v clang >/dev/null 2>&1; then
    warn "No C/C++ compiler found. If native modules (better-sqlite3) fail to install, install build tools:
    $( [ "$OS" = macos ] && echo 'xcode-select --install' || echo 'sudo apt install build-essential python3' )"
  fi

  info "git $(git --version | awk '{print $3}') · node $(node -v) · npm $(npm -v)"
}

# ── Acquire the source tree into INSTALL_DIR ──────────────────────────────────
# git ls-files enumerates tracked + untracked-but-not-ignored files, so a
# --local-source copy includes uncommitted work (this installer, the wrapper
# script) yet excludes node_modules/dist/.git the same way a clone would.
acquire_source() {
  if [ -n "$LOCAL_SOURCE" ]; then
    [ -d "$LOCAL_SOURCE" ] || die "--local-source path does not exist: ${LOCAL_SOURCE}"
    say "Copying source from ${LOCAL_SOURCE}"
    mkdir -p "$INSTALL_DIR"
    if command -v git >/dev/null 2>&1 && git -C "$LOCAL_SOURCE" rev-parse --show-toplevel >/dev/null 2>&1; then
      ( cd "$LOCAL_SOURCE" && git ls-files -z --cached --others --exclude-standard ) \
        | ( cd "$LOCAL_SOURCE" && tar --null -T - -cf - ) \
        | ( cd "$INSTALL_DIR" && tar -xf - )
    else
      # Non-git source: copy everything except the heavy/regenerated dirs.
      tar -C "$LOCAL_SOURCE" --exclude=node_modules --exclude=dist --exclude=.git -cf - . \
        | tar -C "$INSTALL_DIR" -xf -
    fi
  else
    say "Cloning ${REPO_URL} (branch ${BRANCH})"
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  fi
}

# ── Wizard (D4) ───────────────────────────────────────────────────────────────
# Reads from /dev/tty so `curl | bash` (stdin = the pipe) can still prompt. When
# non-interactive (--yes, or no controlling terminal), every answer takes its
# default silently.
ask() {
  # ask <var-name> <prompt> <default>
  local __var="$1" __prompt="$2" __default="$3" __reply=""
  if [ "$ASSUME_YES" -eq 1 ] || [ ! -e /dev/tty ]; then
    printf -v "$__var" '%s' "$__default"
    return
  fi
  # Relax errexit around the interactive read (EOF/empty must fall to default).
  set +e
  read -r -p "$(printf '%s [%s]: ' "$__prompt" "$__default")" __reply </dev/tty
  set -e
  printf -v "$__var" '%s' "${__reply:-$__default}"
}

ask_yesno() {
  # ask_yesno <var-name 0|1> <prompt> <default 0|1>
  local __var="$1" __prompt="$2" __default="$3" __reply="" __hint
  [ "$__default" -eq 1 ] && __hint="Y/n" || __hint="y/N"
  if [ "$ASSUME_YES" -eq 1 ] || [ ! -e /dev/tty ]; then
    printf -v "$__var" '%s' "$__default"
    return
  fi
  set +e
  read -r -p "$(printf '%s [%s]: ' "$__prompt" "$__hint")" __reply </dev/tty
  set -e
  case "$(printf '%s' "$__reply" | tr '[:upper:]' '[:lower:]')" in
    y|yes) printf -v "$__var" '%s' 1 ;;
    n|no)  printf -v "$__var" '%s' 0 ;;
    *)     printf -v "$__var" '%s' "$__default" ;;
  esac
}

run_wizard() {
  if [ "$ASSUME_YES" -eq 1 ] || [ ! -e /dev/tty ]; then
    info "Non-interactive: using defaults (dir=${INSTALL_DIR}, port=${PORT}, data=${DATA_DIR}, web=${BUILD_WEB}, start=${START_NOW})"
    return
  fi
  echo
  say "Setup (press Enter to accept each default)"
  ask INSTALL_DIR "Install directory" "$INSTALL_DIR"
  ask PORT "Server port" "$PORT"
  ask DATA_DIR "Data directory" "$DATA_DIR"
  ask_yesno BUILD_WEB "Build the web UI now" "$BUILD_WEB"
  ask_yesno START_NOW "Start the server when done" "$START_NOW"
  echo
}

# ── Post-install runtime verification (D10) ───────────────────────────────────
# Confirms the native SQLite stack actually loads in the installed tree: opens
# an in-memory better-sqlite3 db and loads sqlite-vec exactly as MindDB does
# (honoring WAGGLE_SQLITE_VEC_PATH). Turns the "does sqlite-vec resolve on this
# platform?" unknown into a visible, actionable check.
verify_runtime() {
  say "Verifying native SQLite + sqlite-vec"
  local script
  script='
    const Database = require("better-sqlite3");
    const db = new Database(":memory:");
    const vecPath = process.env.WAGGLE_SQLITE_VEC_PATH;
    if (vecPath) { db.loadExtension(vecPath); }
    else { require("sqlite-vec").load(db); }
    const row = db.prepare("select vec_version() as v").get();
    db.close();
    console.log("sqlite-vec " + row.v);
  '
  if ( cd "$INSTALL_DIR" && node -e "$script" ) 2>/tmp/waggle-verify.$$; then
    info "$(cat /tmp/waggle-verify.$$ 2>/dev/null || true) — OK"
    rm -f /tmp/waggle-verify.$$ 2>/dev/null || true
    return 0
  fi
  local err; err="$(cat /tmp/waggle-verify.$$ 2>/dev/null || true)"
  rm -f /tmp/waggle-verify.$$ 2>/dev/null || true
  warn "Native SQLite/sqlite-vec check failed:
    ${err}
  Remedies:
    - Point WAGGLE_SQLITE_VEC_PATH at a sqlite-vec loadable extension for your platform, then re-run.
    - Ensure a C/C++ toolchain is installed so better-sqlite3 can build:
      $( [ "$OS" = macos ] && echo 'xcode-select --install' || echo 'sudo apt install build-essential python3' )
    - Re-run: cd ${INSTALL_DIR} && npm install"
  return 1
}

# ── Persist the install marker (D5/D6) ────────────────────────────────────────
# Injection-safe: the port/data-dir/branch answers cross into the file only as
# environment variables consumed by node's JSON.stringify — never interpolated
# into shell or file text.
write_marker() {
  local marker="$INSTALL_DIR/$MARKER_NAME"
  if [ -f "$marker" ]; then
    local backup="${marker}.$(date +%Y%m%d%H%M%S).bak"
    cp "$marker" "$backup" 2>/dev/null || true
    info "Backed up existing marker to ${backup}"
  fi
  WAGGLE_M_PORT="$PORT" \
  WAGGLE_M_DATADIR="$DATA_DIR" \
  WAGGLE_M_BRANCH="$BRANCH" \
  node -e '
    const fs = require("fs");
    const out = {
      installedAt: new Date().toISOString(),
      port: process.env.WAGGLE_M_PORT,
      dataDir: process.env.WAGGLE_M_DATADIR,
      branch: process.env.WAGGLE_M_BRANCH,
    };
    fs.writeFileSync(process.argv[1], JSON.stringify(out, null, 2) + "\n");
  ' "$marker"
}

# ── Success card ──────────────────────────────────────────────────────────────
success_card() {
  local mgr="$INSTALL_DIR/scripts/waggle-server.sh"
  echo
  echo "${C_GREEN}${C_BOLD}  Waggle OS is installed.${C_RESET}"
  echo
  if [ "$START_NOW" -eq 1 ]; then
    echo "  ${C_BOLD}Open:${C_RESET}  http://127.0.0.1:${PORT}"
  else
    echo "  ${C_BOLD}Start:${C_RESET} bash ${mgr} start --port ${PORT} --data-dir ${DATA_DIR}"
    echo "  ${C_BOLD}Then open:${C_RESET} http://127.0.0.1:${PORT}"
  fi
  echo
  echo "  ${C_DIM}Runs in echo mode with zero keys. Add an API key in Settings > API Keys${C_RESET}"
  echo "  ${C_DIM}to enable real models. Connect Slack/Telegram/WhatsApp/Discord under${C_RESET}"
  echo "  ${C_DIM}Settings > Channels to reach your agent from anywhere.${C_RESET}"
  echo
  echo "  ${C_BOLD}Manage the server:${C_RESET}"
  echo "    bash ${mgr} status"
  echo "    bash ${mgr} logs"
  echo "    bash ${mgr} stop"
  echo
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  echo "${C_BOLD}Waggle OS installer${C_RESET}"

  preflight
  run_wizard

  local marker="$INSTALL_DIR/$MARKER_NAME"

  # D5 — 3-way idempotent directory branch.
  if [ -d "$INSTALL_DIR" ] && [ -f "$marker" ]; then
    say "Already installed at ${INSTALL_DIR}"
    info "To update:  cd ${INSTALL_DIR} && git pull && npm install && npm run build:packages$( [ "$BUILD_WEB" -eq 1 ] && echo ' && npm run build' )"
    info "To run:     bash ${INSTALL_DIR}/scripts/waggle-server.sh start --port ${PORT} --data-dir ${DATA_DIR}"
    info "To reinstall fresh: remove ${marker} (or the whole directory) and re-run."
    exit 0
  elif [ -d "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
    say "Resuming a partial install in ${INSTALL_DIR} (directory exists, no marker)"
    if [ -n "$LOCAL_SOURCE" ]; then
      info "Refreshing files from ${LOCAL_SOURCE}"
      acquire_source
    else
      info "Skipping clone; using existing directory contents."
    fi
  else
    acquire_source
  fi

  say "Installing dependencies (this can take a few minutes)"
  ( cd "$INSTALL_DIR" && npm install --no-audit --no-fund )

  say "Building packages"
  ( cd "$INSTALL_DIR" && npm run build:packages )

  if [ "$BUILD_WEB" -eq 1 ]; then
    say "Building web UI"
    ( cd "$INSTALL_DIR" && npm run build )
  else
    info "Skipping web UI build (--no-web); the UI serves in API/echo mode only."
  fi

  verify_runtime || warn "Continuing despite the SQLite check — the server may still fail to open its database."

  write_marker

  if [ "$START_NOW" -eq 1 ]; then
    say "Starting the server"
    bash "$INSTALL_DIR/scripts/waggle-server.sh" start --port "$PORT" --data-dir "$DATA_DIR"
  fi

  success_card
}

main

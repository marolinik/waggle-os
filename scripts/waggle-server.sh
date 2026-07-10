#!/usr/bin/env bash
#
# waggle-server.sh — process manager for the Waggle OS solo sidecar.
#
# WHY THIS EXISTS (steal #5, installer arc 2026-07-10):
#   The one-line installer (install.sh) needs a small, dependency-free way to
#   start/stop/inspect the headless sidecar on a VPS or homelab box. The sidecar
#   is packages/server/src/local/start.ts — it defaults to port 3333, binds
#   loopback, serves /health, and writes its own PID to <dataDir>/server.pid.
#   This wrapper drives it with nohup + that PID file. No ps|grep, no systemd.
#
# COMMANDS:
#   start    launch the sidecar in the background, wait for /health, print URL
#   stop     TERM the recorded PID, 3s grace, then KILL; confirm via /health
#   status   report running/stopped + the /health provider line
#   logs     follow the sidecar log (Ctrl-C to exit)
#
# FLAGS:
#   --port N        listen port      (default: $WAGGLE_PORT or 3333)
#   --data-dir P    data directory   (default: $WAGGLE_DATA_DIR or ~/.waggle)
#
# The sidecar runs with WAGGLE_SKIP_LITELLM=1 (no optional Python LiteLLM
# subprocess) and, when a built web UI exists at <repo>/dist, WAGGLE_FRONTEND_DIR
# pointed at it. Zero API keys required — the built-in echo provider keeps the UI
# functional until a key is added in Settings.

set -euo pipefail

# ── Locate the installed tree (this script lives at <repo>/scripts/) ──────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DEFAULT_PORT=3333

# ── Defaults (env first, flags override below) ────────────────────────────────
PORT="${WAGGLE_PORT:-$DEFAULT_PORT}"
DATA_DIR="${WAGGLE_DATA_DIR:-$HOME/.waggle}"

usage() {
  cat <<EOF
Usage: waggle-server.sh <start|stop|status|logs> [--port N] [--data-dir P]

  start    Start the sidecar in the background and wait for it to become healthy.
  stop     Stop the running sidecar (TERM, then KILL after 3s).
  status   Show whether the sidecar is running and its LLM provider health.
  logs     Follow the sidecar log file.

Defaults: --port ${DEFAULT_PORT}  --data-dir ~/.waggle
Env:      WAGGLE_PORT, WAGGLE_DATA_DIR
EOF
}

# ── Arg parsing ───────────────────────────────────────────────────────────────
CMD="${1:-}"
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --port)     PORT="${2:?--port needs a value}"; shift 2 ;;
    --port=*)   PORT="${1#*=}"; shift ;;
    --data-dir) DATA_DIR="${2:?--data-dir needs a value}"; shift 2 ;;
    --data-dir=*) DATA_DIR="${1#*=}"; shift ;;
    -h|--help)  usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

PIDFILE="$DATA_DIR/server.pid"
LOGFILE="$DATA_DIR/server.log"
HEALTH_URL="http://127.0.0.1:${PORT}/health"

# ── Helpers ───────────────────────────────────────────────────────────────────

# GET a URL, succeed only on a 2xx response. curl > wget; no pure-bash HTTP.
http_ok() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -o /dev/null --max-time 3 "$url" 2>/dev/null
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 3 -O /dev/null "$url" 2>/dev/null
  else
    echo "Neither curl nor wget found; cannot check ${url}" >&2
    return 2
  fi
}

# Fetch a URL body to stdout (best-effort; empty on failure).
http_body() {
  local url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 3 "$url" 2>/dev/null || true
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 3 -O - "$url" 2>/dev/null || true
  fi
}

# Is a PID alive? POSIX kill -0.
pid_alive() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# Read a live PID from the pidfile, or empty. Cleans a stale pidfile.
read_live_pid() {
  [ -f "$PIDFILE" ] || { echo ""; return; }
  local pid
  pid="$(cat "$PIDFILE" 2>/dev/null | tr -dc '0-9')"
  if pid_alive "$pid"; then
    echo "$pid"
  else
    rm -f "$PIDFILE" 2>/dev/null || true
    echo ""
  fi
}

# Poll $HEALTH_URL until healthy or timeout (seconds). Pure-bash 1s cadence.
wait_for_health() {
  local timeout="${1:-45}" i=0
  while [ "$i" -lt "$timeout" ]; do
    if http_ok "$HEALTH_URL"; then return 0; fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

# Resolve the tsx runner from the installed tree; never hit the network.
resolve_tsx() {
  local bin="$REPO_ROOT/node_modules/.bin/tsx"
  if [ -x "$bin" ]; then
    echo "$bin"
    return 0
  fi
  bin="$(command -v tsx 2>/dev/null || true)"
  if [ -n "$bin" ]; then
    echo "$bin"
    return 0
  fi
  return 1
}

# ── Commands ──────────────────────────────────────────────────────────────────

cmd_start() {
  local existing
  existing="$(read_live_pid)"
  if [ -n "$existing" ]; then
    echo "Waggle is already running (pid ${existing}) at http://127.0.0.1:${PORT}"
    return 0
  fi

  local tsx_bin
  if ! tsx_bin="$(resolve_tsx)"; then
    echo "Error: tsx not found under ${REPO_ROOT}/node_modules. Run 'npm install' first." >&2
    exit 1
  fi

  mkdir -p "$DATA_DIR"

  # Environment for the sidecar. Skip the optional LiteLLM Python subprocess;
  # point at the built web UI only when one exists (the server auto-probes
  # <repo>/dist otherwise, but being explicit survives a different cwd).
  export WAGGLE_SKIP_LITELLM=1
  export WAGGLE_PORT="$PORT"
  export WAGGLE_DATA_DIR="$DATA_DIR"
  if [ -f "$REPO_ROOT/dist/index.html" ]; then
    export WAGGLE_FRONTEND_DIR="$REPO_ROOT/dist"
  fi

  echo "Starting Waggle sidecar on port ${PORT} (data: ${DATA_DIR})..."
  (
    cd "$REPO_ROOT/packages/server"
    nohup "$tsx_bin" src/local/start.ts >>"$LOGFILE" 2>&1 &
  )

  # The sidecar writes server.pid itself once it is listening; give it a beat,
  # then wait on /health as the real readiness signal.
  if wait_for_health 60; then
    local pid
    pid="$(read_live_pid)"
    echo "Waggle is running${pid:+ (pid ${pid})} at http://127.0.0.1:${PORT}"
    return 0
  fi

  echo "Error: Waggle did not become healthy within 60s. Last log lines:" >&2
  tail -n 20 "$LOGFILE" 2>/dev/null >&2 || true
  exit 1
}

cmd_stop() {
  local pid
  pid="$(read_live_pid)"
  if [ -z "$pid" ]; then
    echo "Waggle is not running (no live pid at ${PIDFILE})."
    return 0
  fi

  echo "Stopping Waggle (pid ${pid})..."
  kill -TERM "$pid" 2>/dev/null || true

  local i=0
  while [ "$i" -lt 3 ]; do
    pid_alive "$pid" || break
    sleep 1
    i=$((i + 1))
  done

  if pid_alive "$pid"; then
    echo "Process did not exit after TERM; sending KILL."
    kill -KILL "$pid" 2>/dev/null || true
  fi

  rm -f "$PIDFILE" 2>/dev/null || true
  echo "Waggle stopped."
}

cmd_status() {
  local pid
  pid="$(read_live_pid)"
  if [ -z "$pid" ]; then
    echo "Waggle: stopped"
    return 0
  fi
  echo "Waggle: running (pid ${pid}) at http://127.0.0.1:${PORT}"
  if http_ok "$HEALTH_URL"; then
    echo "Health: OK"
    local body
    body="$(http_body "$HEALTH_URL")"
    [ -n "$body" ] && echo "  $body"
  else
    echo "Health: pid alive but /health not responding on port ${PORT}"
  fi
}

cmd_logs() {
  if [ ! -f "$LOGFILE" ]; then
    echo "No log file yet at ${LOGFILE}. Start Waggle first." >&2
    exit 1
  fi
  echo "Tailing ${LOGFILE} (Ctrl-C to stop)..."
  tail -n 100 -f "$LOGFILE"
}

case "$CMD" in
  start)  cmd_start ;;
  stop)   cmd_stop ;;
  status) cmd_status ;;
  logs)   cmd_logs ;;
  ""|-h|--help) usage ;;
  *) echo "Unknown command: ${CMD}" >&2; usage >&2; exit 2 ;;
esac

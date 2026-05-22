#!/bin/bash
# entrypoint.sh (gaia2-waggle) — starts the WAGGLE Node worker.
# Adapted from containers/hermes/entrypoint.sh: same lifecycle, launches
# `node /opt/waggle/waggle_worker.mjs` instead of the python hermes worker.
set -o pipefail
LOG=/tmp/entrypoint.log
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a $LOG; }
log "=== entrypoint start (waggle) ==="

if [ -n "${FAKETIME:-}" ]; then
    /usr/bin/mkdir -p /dev/shm 2>/dev/null && /usr/bin/chmod 1777 /dev/shm 2>/dev/null || true
    log "Faketime enabled: $FAKETIME"
fi
log "User: $(/usr/bin/id -un), PATH: $PATH"

# Socket path MUST match the (reused hermes) gaia2_adapter.py. The adapter's
# default is exported here so the worker's HERMES_WORKER_SOCK fallback matches.
export WAGGLE_WORKER_SOCK="${HERMES_WORKER_SOCK:-/tmp/hermes-worker.sock}"
log "Starting Waggle worker (sock=$WAGGLE_WORKER_SOCK)..."
/usr/local/bin/node /opt/waggle/waggle_worker.mjs >> $LOG 2>&1 &
WORKER_PID=$!
log "Worker PID: $WORKER_PID"

/usr/bin/sleep 2
if ! kill -0 $WORKER_PID 2>/dev/null; then
    log "ERROR: Waggle worker exited unexpectedly"
    /usr/bin/tail -40 $LOG 2>/dev/null || true
    exit 1
fi
log "Waggle worker running"

cleanup() { log "Shutting down..."; kill "$WORKER_PID" 2>/dev/null || true; wait "$WORKER_PID" 2>/dev/null || true; }
trap cleanup EXIT TERM INT
wait $WORKER_PID 2>/dev/null
EXIT_CODE=$?
log "Worker (PID $WORKER_PID) exited with code $EXIT_CODE"
exit $EXIT_CODE

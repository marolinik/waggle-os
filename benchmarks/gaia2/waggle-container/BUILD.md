# gaia2-waggle — build & run (Pillar 1: Waggle harness in the GAIA 2 rig)

Wraps **Waggle's own `runAgentLoop`** in the GAIA 2 ARE, fair vs `gaia2-hermes`:
same single `terminal` tool + same `AGENTS.md` + same model (Sonnet 4.6). Only the
loop logic differs. Path-A: no native deps (2-symbol `@waggle/core` stub — proven in
`../spike-waggle-worker/`).

## Files here (tracked recovery copies; staged into `external/.../gaia2-cli/containers/waggle/`)
- `Dockerfile` — gaia2-cli base + Node + waggle payload (models gaia2-hermes)
- `waggle_worker.mjs` — Node worker: socket protocol + terminal tool + runAgentLoop
- `entrypoint.sh` — launches the Node worker (vs hermes' python worker)
- `stub-core/` — the 2-symbol `@waggle/core` stub package

## Build steps (from `external/meta-agents-research-environments/gaia2-cli/`)

```bash
WC=containers/waggle
mkdir -p $WC/payload/node_modules/@waggle

# 1. entrypoints
cp <thisdir>/Dockerfile $WC/Dockerfile
cp <thisdir>/entrypoint.sh $WC/entrypoint.sh
cp <thisdir>/waggle_worker.mjs $WC/payload/waggle_worker.mjs
echo '{"type":"module"}' > $WC/payload/package.json
# init-entrypoint is hermes' VERBATIM (its hermes-isms are inert; it execs /opt/entrypoint.sh
# which the waggle Dockerfile overrides):
cp containers/hermes/gaia2-init-entrypoint.sh $WC/gaia2-init-entrypoint.sh

# 2. @waggle/agent dist (built). NOTE: do NOT copy the source package.json — its
#    exports map ({".":"./src/index.ts"}) blocks the /dist/ subpath import
#    (ERR_PACKAGE_PATH_NOT_EXPORTED). Write a minimal one with no exports field.
mkdir -p $WC/payload/node_modules/@waggle/agent
cp -r D:/Projects/waggle-os/packages/agent/dist $WC/payload/node_modules/@waggle/agent/dist
echo '{"name":"@waggle/agent","version":"0.0.0","type":"module"}' > $WC/payload/node_modules/@waggle/agent/package.json

# 3. @waggle/core stub
cp -r <thisdir>/stub-core $WC/payload/node_modules/@waggle/core

# 4. @waggle/hive-mind-core — ONLY the DB-free deep modules the stub re-exports.
#    Verify logger.js + injection-scanner.js have no further @waggle deps (they don't as of 2026-05-22).
mkdir -p $WC/payload/node_modules/@waggle/hive-mind-core/dist
cp D:/Projects/waggle-os/packages/hive-mind-core/dist/logger.js \
   D:/Projects/waggle-os/packages/hive-mind-core/dist/injection-scanner.js \
   $WC/payload/node_modules/@waggle/hive-mind-core/dist/
echo '{"name":"@waggle/hive-mind-core","version":"0.0.0","type":"module"}' \
   > $WC/payload/node_modules/@waggle/hive-mind-core/package.json

# 5. build — NOTE: local base image is `localhost/gaia2-cli:local` (tag "local", not latest).
#    Use the LEGACY builder (DOCKER_BUILDKIT=0): BuildKit treats `localhost/` as a remote
#    registry and times out; the legacy builder reads the local image store directly.
DOCKER_BUILDKIT=0 docker build --build-arg GAIA2_CLI_VERSION=local \
  -f $WC/Dockerfile -t localhost/gaia2-waggle:latest .
```

## Run (low-N probe — fair vs hermes)
Create `runner/examples/waggle_harness_probe.toml` cloning `waggle_smoke_hermes_n3.toml`
but `image = "localhost/gaia2-waggle:latest"`, `limit = 10`. Then:
```bash
gaia2-runner run-config --config examples/waggle_harness_probe.toml
```
Compare strict + trio-strict (re-judge via `rejudge_user_message.py`) vs the Hermes cell.

## OPEN ITEMS to verify on first build (expect 1-2 iterations)
1. **Socket path** — `entrypoint.sh` exports `WAGGLE_WORKER_SOCK=${HERMES_WORKER_SOCK:-/tmp/hermes-worker.sock}`.
   Confirm `containers/hermes/gaia2_adapter.py` actually binds that path (grep its socket default); align if different.
2. **node binary portability** — `COPY --from=node:20-bookworm-slim /usr/local/bin/node` assumes the gaia2-cli
   base is glibc/bookworm-compatible. If it's alpine/musl, switch to `node:20-alpine` source or `apt-get install nodejs`.
3. **hive-mind-core deep-module closure** — confirm `logger.js`/`injection-scanner.js` import nothing further
   (rerun the spike's isolated import proof against the staged payload before building).
4. **LLM gateway** — worker defaults `BASE_URL=https://openrouter.ai/api/v1` (OpenAI-compat, Sonnet 4.6 via
   OpenRouter). Hermes hits Anthropic directly. Same model; document the gateway as a minor confound, or point
   both at one litellm proxy for strict parity.

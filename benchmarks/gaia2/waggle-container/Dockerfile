# gaia2-waggle — GAIA 2 env wrapping WAGGLE's own agent harness (runAgentLoop).
# Models gaia2-hermes, but the agent loop is Waggle's, run as a Node worker.
# Fairness: same single `terminal` tool + same AGENTS.md + same model (Sonnet 4.6);
# only the loop logic differs. Path-A: no better-sqlite3 (2-symbol @waggle/core stub).
#
# BUILD (from gaia2-cli/, after staging waggle payload under containers/waggle/):
#   docker build -f containers/waggle/Dockerfile -t localhost/gaia2-waggle:latest .

ARG GAIA2_CLI_IMAGE=localhost/gaia2-cli
ARG GAIA2_CLI_VERSION=latest

# ── setuid wrapper (same as hermes) ────────────────────────────────────
FROM debian:bookworm-slim AS gaia2-exec-builder
RUN echo 'APT::Sandbox::User "root";' | tee -a /etc/apt/apt.conf.d/10sandbox
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev && rm -rf /var/lib/apt/lists/*
COPY shared/gaia2-exec.c /tmp/gaia2-exec.c
RUN gcc -O2 -o /tmp/gaia2-exec /tmp/gaia2-exec.c && strip /tmp/gaia2-exec

# ── node binary source ──────────────────────────────────────────────────
FROM node:20-bookworm-slim AS nodesrc

# ── Final image ─────────────────────────────────────────────────────────
FROM ${GAIA2_CLI_IMAGE}:${GAIA2_CLI_VERSION}

# Node runtime (self-contained against glibc/libstdc++ present in bookworm base)
COPY --from=nodesrc /usr/local/bin/node /usr/local/bin/node

# Gaia2 privilege-separated user + state (same as hermes)
RUN useradd -r -s /usr/sbin/nologin -d /var/gaia2 gaia2 && mkdir -p /var/gaia2/state
ENV GAIA2_STATE_DIR=/var/gaia2/state
RUN chown -R gaia2:gaia2 /var/gaia2 && chmod 700 /var/gaia2
RUN useradd -m -s /bin/bash -u 1000 agent

# Setuid gaia2 wrapper
COPY --from=gaia2-exec-builder /tmp/gaia2-exec /usr/local/bin/gaia2-exec
RUN chown gaia2:gaia2 /usr/local/bin/gaia2-exec && chmod u+s /usr/local/bin/gaia2-exec

# Restricted agent PATH: app CLIs -> gaia2-exec + curated unix tools + python3 + node
RUN mkdir -p /home/agent/bin && \
    for cmd in calendar contacts emails messages chats rent-a-flat city cabs shopping cloud-drive; do \
        ln -s /usr/local/bin/gaia2-exec /home/agent/bin/$cmd; done && \
    for u in ls pwd date echo cat head tail grep sed awk wc sort mkdir cp mv rm touch chmod jq seq xargs find tee cut tr paste uniq diff base64 basename dirname file mktemp sleep expr test curl; do \
        ln -s /usr/bin/$u /home/agent/bin/$u 2>/dev/null || true; done && \
    ln -s /usr/local/bin/python3 /home/agent/bin/python3 && \
    ln -s /usr/local/bin/node /home/agent/bin/node && \
    chown -R agent:agent /home/agent/bin

# Faketime-aware bash/sh wrappers (same as hermes)
RUN printf '#!/usr/bin/bash\nif [ -f /tmp/faketime.rc ]; then\n  export LD_PRELOAD="/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1"\n  export FAKETIME_TIMESTAMP_FILE="/tmp/faketime.rc"\n  export FAKETIME_NO_CACHE=1\n  unset FAKETIME\nfi\nexec /usr/bin/bash "$@"\n' \
      > /home/agent/bin/bash && chmod +x /home/agent/bin/bash && cp /home/agent/bin/bash /home/agent/bin/sh

# Shared adapter + prompt rendering (reuse hermes adapter — same contract)
COPY shared/gaia2_adapter_base.py /opt/gaia2_adapter_base.py
COPY shared/render_agent_prompt.py /opt/render_agent_prompt.py
COPY shared/AGENTS_TEMPLATE.md /opt/AGENTS_TEMPLATE.md
COPY containers/hermes/gaia2_adapter.py /opt/gaia2_adapter.py

# ── Waggle payload: worker + agent dist + 2-symbol @waggle/core stub ─────
#   containers/waggle/payload/ is assembled by build-payload.sh before docker build:
#     payload/waggle_worker.mjs
#     payload/package.json                       ({"type":"module"})
#     payload/node_modules/@waggle/agent/        (built dist + package.json)
#     payload/node_modules/@waggle/core/         (stub: index.js + package.json)
#     payload/node_modules/@waggle/hive-mind-core/dist/{logger.js,injection-scanner.js,...}
COPY containers/waggle/payload /opt/waggle
COPY containers/waggle/entrypoint.sh /opt/entrypoint.sh
RUN chmod +x /opt/entrypoint.sh

ENV HOME=/home/agent
ENV PATH="/home/agent/bin"

USER root
COPY containers/waggle/gaia2-init-entrypoint.sh /opt/gaia2-init-entrypoint.sh
RUN chmod +x /opt/gaia2-init-entrypoint.sh
ENTRYPOINT []
CMD ["/usr/bin/bash", "/opt/gaia2-init-entrypoint.sh"]

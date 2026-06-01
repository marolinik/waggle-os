# Waggle Teams Server — Production Docker Image
# Multi-stage build: install deps + build packages & frontend, then run the
# team server (packages/server/src/index.ts → Postgres/Redis/MinIO/Clerk).
#
# Consumed by docker-compose.production.yml. NOTE: render.yaml deploys the
# SQLite *sidecar* (local/start.ts) instead — a different hosting mode.

FROM node:20-alpine AS builder

WORKDIR /app

# Copy the full workspace before install. The monorepo has 27 workspaces
# (packages/* + apps/*); a hand-maintained COPY list drifts (it had referenced
# the nonexistent packages/ui and omitted every hive-mind-* package), so copy
# wholesale for correctness. Trades some layer-cache granularity for not
# silently breaking when a workspace is added.
COPY package.json package-lock.json* ./
COPY packages packages
COPY apps apps
COPY tsconfig*.json ./
COPY vitest*.ts ./

# Install all dependencies (incl. dev — needed to build). --ignore-scripts
# skips native rebuilds here (the build only typechecks + bundles); native
# modules are rebuilt in the native-builder stage below.
RUN npm install --ignore-scripts 2>/dev/null || npm install

# Build workspace packages THEN the web UI.
# build:all → build:packages (hive-mind-core → shared → core → agent → server)
# then the apps/web Vite build to root /dist. @waggle/hive-mind-core emits its
# dist/ here; @waggle/core imports it as dist/ at runtime, so this is required.
RUN npm run build:all

# ── Native module build stage ───────────────────────────────────
FROM node:20-alpine AS native-builder

WORKDIR /app

# Install native build dependencies (only needed here)
RUN apk add --no-cache python3 make g++

# Workspace manifests for production install + native rebuild
COPY package.json package-lock.json* ./
COPY packages packages
COPY apps apps

# Production-only dependencies, then rebuild native modules (better-sqlite3)
RUN npm install --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev
RUN npm rebuild better-sqlite3 2>/dev/null || true

# ── Production image (no build tools) ──────────────────────────
FROM node:20-alpine

WORKDIR /app

# Production node_modules (native rebuilt) + root manifest. The @waggle/*
# entries here are workspace symlinks into ./packages, satisfied below.
COPY --from=native-builder /app/node_modules node_modules
COPY --from=native-builder /app/package.json package.json

# Built workspace packages from the builder — carries emitted dist/ alongside
# src, so @waggle/hive-mind-core/dist (a runtime dep of @waggle/core) is present.
# (The old Dockerfile copied source packages from the build context here, which
# dropped every freshly-built dist/ and broke runtime module resolution.)
COPY --from=builder /app/packages packages

# Built web UI → /app/dist (root dist is canonical since the Apr-12 migration)
COPY --from=builder /app/dist dist

# Create data directory and non-root user
RUN mkdir -p /data \
    && addgroup -S waggle && adduser -S waggle -G waggle \
    && chown -R waggle:waggle /app /data

# Set environment
ENV NODE_ENV=production
ENV WAGGLE_FRONTEND_DIR=/app/dist
ENV WAGGLE_DATA_DIR=/data
# The sidecar defaults to loopback (desktop-safe). A container must accept
# traffic from outside, so opt into binding all interfaces here.
ENV WAGGLE_HOST=0.0.0.0

# Expose server port
EXPOSE 3333

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://localhost:3333/health || exit 1

# Data volume for persistence
VOLUME ["/data"]

# Run as non-root user
USER waggle

# Run drizzle migrations (cwd packages/server so migrate.ts's './drizzle'
# resolves), then start the team server. docker-compose can override this.
CMD ["sh", "-c", "(cd packages/server && npx tsx src/db/migrate.ts) && npx tsx packages/server/src/index.ts"]

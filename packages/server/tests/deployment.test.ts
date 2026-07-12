/**
 * 9D-5/9D-6: Deployment configuration tests.
 *
 * Validates Docker Compose, Dockerfile, render.yaml, and .dockerignore
 * are well-formed and contain expected configuration.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

describe('Docker Deployment', () => {
  it('Dockerfile exists and has required stages', () => {
    const content = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf-8');
    expect(content).toContain('FROM node:20-alpine AS builder');
    expect(content).toContain('FROM node:20-alpine');
    expect(content).toContain('EXPOSE 3333');
    expect(content).toContain('HEALTHCHECK');
    expect(content).toContain('VOLUME ["/data"]');
  });

  it('Dockerfile builds frontend in builder stage', () => {
    const content = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf-8');
    expect(content).toContain('npm run build');
    // Root `dist/` is canonical since apps/web frontend migration (Apr-12, commit a883050).
    expect(content).toContain('COPY --from=builder /app/dist dist');
  });

  it('Dockerfile sets WAGGLE_FRONTEND_DIR for static serving', () => {
    const content = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf-8');
    expect(content).toContain('WAGGLE_FRONTEND_DIR=/app/dist');
  });

  it('production docker-compose.yml exists with required services', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docker-compose.production.yml'), 'utf-8');
    expect(content).toContain('waggle:');
    expect(content).toContain('postgres:');
    expect(content).toContain('redis:');
    expect(content).toContain('DATABASE_URL');
    expect(content).toContain('REDIS_URL');
    expect(content).toContain('ANTHROPIC_API_KEY');
  });

  it('production compose has health checks on all services', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docker-compose.production.yml'), 'utf-8');
    // Count healthcheck occurrences (waggle, postgres, redis = 3)
    const healthchecks = (content.match(/healthcheck:/g) || []).length;
    expect(healthchecks).toBeGreaterThanOrEqual(3);
  });

  it('production compose uses depends_on with health conditions', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docker-compose.production.yml'), 'utf-8');
    expect(content).toContain('condition: service_healthy');
  });

  it('production compose fails closed when database and object-store secrets are missing', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docker-compose.production.yml'), 'utf-8');
    expect(content).toContain('${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}');
    expect(content).toContain('${MINIO_ROOT_USER:?set MINIO_ROOT_USER}');
    expect(content).toContain('${MINIO_ROOT_PASSWORD:?set MINIO_ROOT_PASSWORD}');
    expect(content).not.toContain('${POSTGRES_PASSWORD:-');
    expect(content).not.toContain('${MINIO_ROOT_PASSWORD:-');
  });

  it('.dockerignore excludes sensitive and unnecessary files', () => {
    const content = fs.readFileSync(path.join(ROOT, '.dockerignore'), 'utf-8');
    expect(content).toContain('node_modules');
    expect(content).toContain('.git');
    expect(content).toContain('.env*');
    expect(content).toContain('*.mind');
  });
});

describe('Render.com Blueprint', () => {
  it('render.yaml exists with web service', () => {
    const content = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf-8');
    expect(content).toContain('type: web');
    expect(content).toContain('waggle-server');
    expect(content).toContain('healthCheckPath: /health');
  });

  it('render.yaml explicitly uses the hosted local-sidecar mode', () => {
    const content = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf-8');
    expect(content).toContain('startCommand: npx tsx packages/server/src/local/start.ts --skip-litellm');
    expect(content).toContain('WAGGLE_DATA_DIR');
    expect(content).not.toContain('fromDatabase:');
    expect(content).not.toContain('fromService:');
    expect(content).not.toContain('databases:');
  });

  it('render.yaml has required environment variables', () => {
    const content = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf-8');
    expect(content).toContain('ANTHROPIC_API_KEY');
    expect(content).toContain('CLERK_SECRET_KEY');
    expect(content).toContain('WAGGLE_LICENSE_KEY');
    expect(content).toContain('WAGGLE_FRONTEND_DIR');
    expect(content).toContain('STRIPE_SECRET_KEY');
  });

  it('render.yaml has persistent disk for data', () => {
    const content = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf-8');
    expect(content).toContain('disk:');
    expect(content).toContain('mountPath: /data');
  });
});

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
    expect(content).toContain('COPY --from=builder /app/app/dist app/dist');
  });

  it('Dockerfile sets WAGGLE_FRONTEND_DIR for static serving', () => {
    const content = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf-8');
    expect(content).toContain('WAGGLE_FRONTEND_DIR=/app/app/dist');
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

  it('render.yaml references PostgreSQL and Redis', () => {
    const content = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf-8');
    expect(content).toContain('waggle-postgres');
    expect(content).toContain('waggle-redis');
    expect(content).toContain('connectionString');
  });

  it('render.yaml has required environment variables', () => {
    const content = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf-8');
    expect(content).toContain('ANTHROPIC_API_KEY');
    expect(content).toContain('CLERK_SECRET_KEY');
    expect(content).toContain('WAGGLE_LICENSE_KEY');
    expect(content).toContain('DATABASE_URL');
    expect(content).toContain('REDIS_URL');
  });

  it('render.yaml has persistent disk for data', () => {
    const content = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf-8');
    expect(content).toContain('disk:');
    expect(content).toContain('mountPath: /data');
  });
});

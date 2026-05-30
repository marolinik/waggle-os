import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

// Guards the CORS_ORIGIN fail-closed contract on the TEAM server config
// (packages/server/src/config.ts). The team server (index.ts) is the only
// consumer of config.corsOrigin; the desktop/local server uses the separate
// hardcoded ALLOWED_ORIGINS allowlist (local/cors-config.ts) and is unaffected.
describe('loadConfig — CORS_ORIGIN', () => {
  const SAVED = {
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
  };

  beforeEach(() => {
    delete process.env.CORS_ORIGIN;
    delete process.env.NODE_ENV;
    // DATABASE_URL also fails closed in production; set it so we isolate the
    // CORS_ORIGIN behavior under test.
    process.env.DATABASE_URL = 'postgres://localhost:5434/waggle';
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(SAVED)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('defaults to the localhost dev origin when CORS_ORIGIN is unset (non-production)', () => {
    expect(loadConfig().corsOrigin).toEqual(['http://localhost:5173']);
  });

  it('FAILS CLOSED in production when CORS_ORIGIN is unset (no silent localhost fallback)', () => {
    process.env.NODE_ENV = 'production';
    expect(() => loadConfig()).toThrow(/CORS_ORIGIN.*required in production/);
  });

  it('parses a comma-separated list, trimming whitespace and dropping empties', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.example.com, https://admin.example.com ,';
    expect(loadConfig().corsOrigin).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('accepts a single explicit origin in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://app.example.com';
    expect(loadConfig().corsOrigin).toEqual(['https://app.example.com']);
  });
});

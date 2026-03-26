import { describe, it, expect, afterEach } from 'vitest';
import { AuthManager } from '../src/auth.js';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('AuthManager', () => {
  let tempDir: string;
  let auth: AuthManager;

  function setup() {
    tempDir = mkdtempSync(join(tmpdir(), 'waggle-auth-test-'));
    auth = new AuthManager(tempDir);
  }

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns null when no token stored', () => {
    setup();
    expect(auth.getToken()).toBeNull();
    expect(auth.getEmail()).toBeNull();
  });

  it('saves and retrieves token', () => {
    setup();
    auth.saveToken('test-jwt-token', 'user@example.com');
    expect(auth.getToken()).toBe('test-jwt-token');
    expect(auth.getEmail()).toBe('user@example.com');
  });

  it('clears token on logout', () => {
    setup();
    auth.saveToken('test-jwt-token', 'user@example.com');
    expect(auth.getToken()).toBe('test-jwt-token');
    auth.logout();
    expect(auth.getToken()).toBeNull();
    expect(auth.getEmail()).toBeNull();
  });

  it('isLoggedIn returns true/false correctly', () => {
    setup();
    expect(auth.isLoggedIn()).toBe(false);
    auth.saveToken('test-jwt-token', 'user@example.com');
    expect(auth.isLoggedIn()).toBe(true);
    auth.logout();
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('stores token in config.json file', () => {
    setup();
    auth.saveToken('file-check-token', 'file@example.com');
    const configPath = join(tempDir, 'config.json');
    const raw = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    expect(config.auth).toEqual({
      token: 'file-check-token',
      email: 'file@example.com',
      serverUrl: 'http://localhost:3000',
    });
  });

  it('getServerUrl returns default', () => {
    setup();
    expect(auth.getServerUrl()).toBe('http://localhost:3000');
  });

  it('preserves existing config keys when saving auth', () => {
    setup();
    // Write some pre-existing config
    const configPath = join(tempDir, 'config.json');
    const { writeFileSync, mkdirSync } = require('node:fs');
    try { mkdirSync(tempDir, { recursive: true }); } catch {}
    writeFileSync(configPath, JSON.stringify({ apiKey: 'sk-existing', model: 'claude' }));

    auth.saveToken('my-token', 'me@test.com');

    const raw = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    expect(config.apiKey).toBe('sk-existing');
    expect(config.model).toBe('claude');
    expect(config.auth.token).toBe('my-token');
  });
});

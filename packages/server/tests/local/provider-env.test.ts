import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { VaultStore } from '@waggle/core';
import {
  applyProviderKeyToEnv,
  hydrateProviderEnvFromVault,
  migrateLegacyProviderKeysToVault,
} from '../../src/local/provider-env.js';

const originalEnv = new Map<string, string | undefined>();

function rememberEnv(name: string): void {
  if (!originalEnv.has(name)) originalEnv.set(name, process.env[name]);
}

afterEach(() => {
  for (const [name, value] of originalEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  originalEnv.clear();
});

describe('provider environment hydration', () => {
  it('maps provider keys to every environment name required by the router', () => {
    rememberEnv('GEMINI_API_KEY');
    rememberEnv('GOOGLE_API_KEY');
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    expect(applyProviderKeyToEnv('google', 'google-secret')).toBe(2);
    expect(process.env.GEMINI_API_KEY).toBe('google-secret');
    expect(process.env.GOOGLE_API_KEY).toBe('google-secret');
  });

  it('hydrates vault keys without replacing an explicit process override', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-provider-env-'));
    rememberEnv('OPENAI_API_KEY');
    process.env.OPENAI_API_KEY = 'explicit-key';
    try {
      const vault = new VaultStore(dataDir);
      vault.set('openai', 'vault-key');

      expect(hydrateProviderEnvFromVault(vault)).toBe(0);
      expect(process.env.OPENAI_API_KEY).toBe('explicit-key');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('migrates and scrubs legacy keys before startup catalog discovery', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-provider-migrate-'));
    const configPath = path.join(dataDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      providers: {
        openai: { apiKey: 'legacy-secret', models: ['old-static-entry'] },
      },
    }));
    try {
      const vault = new VaultStore(dataDir);
      expect(migrateLegacyProviderKeysToVault(dataDir, vault)).toBe(1);
      expect(vault.get('openai')?.value).toBe('legacy-secret');
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).providers.openai).toEqual({
        apiKey: '',
        models: ['old-static-entry'],
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

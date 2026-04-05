import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WaggleConfig, type ProviderEntry, type TeamServerConfig } from '../src/config.js';

describe('WaggleConfig', () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-config-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('creates config directory if missing', () => {
    const base = makeTempDir();
    const configDir = path.join(base, 'nested', '.waggle');

    new WaggleConfig(configDir);

    expect(fs.existsSync(configDir)).toBe(true);
  });

  it('returns default config when no file exists', () => {
    const configDir = makeTempDir();
    const config = new WaggleConfig(configDir);

    expect(config.getDefaultModel()).toBe('claude-sonnet-4-6');
    expect(config.getProviders()).toEqual({});
    expect(config.getMindPath()).toBe(path.join(configDir, 'default.mind'));
  });

  it('saves and loads provider config', () => {
    const configDir = makeTempDir();
    const config = new WaggleConfig(configDir);

    const provider: ProviderEntry = {
      apiKey: 'sk-test-key',
      models: ['claude-sonnet-4-6', 'claude-haiku-3'],
      baseUrl: 'https://api.anthropic.com',
    };

    config.setProvider('anthropic', provider);
    config.save();

    // Load fresh instance from same directory
    const config2 = new WaggleConfig(configDir);
    const providers = config2.getProviders();

    expect(providers['anthropic']).toEqual(provider);
    expect(providers['anthropic'].apiKey).toBe('sk-test-key');
    expect(providers['anthropic'].models).toHaveLength(2);
  });

  it('sets and gets default model', () => {
    const configDir = makeTempDir();
    const config = new WaggleConfig(configDir);

    config.setDefaultModel('gpt-4o');
    config.save();

    const config2 = new WaggleConfig(configDir);
    expect(config2.getDefaultModel()).toBe('gpt-4o');
  });

  it('returns mind file path', () => {
    const configDir = makeTempDir();
    const config = new WaggleConfig(configDir);

    expect(config.getMindPath()).toBe(path.join(configDir, 'default.mind'));
  });

  it('removes a provider', () => {
    const configDir = makeTempDir();
    const config = new WaggleConfig(configDir);

    config.setProvider('anthropic', { apiKey: 'key1', models: ['m1'] });
    config.setProvider('openai', { apiKey: 'key2', models: ['m2'] });
    config.removeProvider('anthropic');
    config.save();

    const config2 = new WaggleConfig(configDir);
    const providers = config2.getProviders();
    expect(providers['anthropic']).toBeUndefined();
    expect(providers['openai']).toBeDefined();
  });

  it('returns config directory path', () => {
    const configDir = makeTempDir();
    const config = new WaggleConfig(configDir);

    expect(config.getConfigDir()).toBe(configDir);
  });

  describe('team server config', () => {
    it('returns null when no team server configured', () => {
      const configDir = makeTempDir();
      const config = new WaggleConfig(configDir);

      expect(config.getTeamServer()).toBeNull();
      expect(config.isTeamConnected()).toBe(false);
    });

    it('sets and gets team server config', () => {
      const configDir = makeTempDir();
      const config = new WaggleConfig(configDir);

      const teamConfig: TeamServerConfig = {
        url: 'https://team.waggle.dev',
        token: 'clerk-jwt-token',
        userId: 'user-123',
        displayName: 'Marko',
      };

      config.setTeamServer(teamConfig);
      config.save();

      const config2 = new WaggleConfig(configDir);
      const loaded = config2.getTeamServer();
      expect(loaded).toEqual(teamConfig);
      expect(config2.isTeamConnected()).toBe(true);
    });

    it('clears team server config', () => {
      const configDir = makeTempDir();
      const config = new WaggleConfig(configDir);

      config.setTeamServer({ url: 'https://team.waggle.dev' });
      config.clearTeamServer();
      config.save();

      const config2 = new WaggleConfig(configDir);
      expect(config2.getTeamServer()).toBeNull();
      expect(config2.isTeamConnected()).toBe(false);
    });

    it('persists team server through save/load cycle', () => {
      const configDir = makeTempDir();
      const config = new WaggleConfig(configDir);

      config.setTeamServer({ url: 'https://example.com', userId: 'u1' });
      config.save();

      const config2 = new WaggleConfig(configDir);
      expect(config2.getTeamServer()!.url).toBe('https://example.com');
      expect(config2.getTeamServer()!.userId).toBe('u1');
    });
  });

  describe('Model Pilot config fields', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-config-pilot-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns null for fallbackModel when not set', () => {
      const config = new WaggleConfig(tmpDir);
      expect(config.getFallbackModel()).toBeNull();
    });

    it('persists fallbackModel', () => {
      const config = new WaggleConfig(tmpDir);
      config.setFallbackModel('qwen/qwen3.6-plus:free');
      config.save();
      const config2 = new WaggleConfig(tmpDir);
      expect(config2.getFallbackModel()).toBe('qwen/qwen3.6-plus:free');
    });

    it('returns null for budgetModel when not set', () => {
      const config = new WaggleConfig(tmpDir);
      expect(config.getBudgetModel()).toBeNull();
    });

    it('persists budgetModel', () => {
      const config = new WaggleConfig(tmpDir);
      config.setBudgetModel('deepseek/deepseek-chat-v3-0324:free');
      config.save();
      const config2 = new WaggleConfig(tmpDir);
      expect(config2.getBudgetModel()).toBe('deepseek/deepseek-chat-v3-0324:free');
    });

    it('returns 0.8 as default budgetThreshold', () => {
      const config = new WaggleConfig(tmpDir);
      expect(config.getBudgetThreshold()).toBe(0.8);
    });

    it('persists budgetThreshold', () => {
      const config = new WaggleConfig(tmpDir);
      config.setBudgetThreshold(0.6);
      config.save();
      const config2 = new WaggleConfig(tmpDir);
      expect(config2.getBudgetThreshold()).toBe(0.6);
    });

    it('clearFallbackModel removes the field', () => {
      const config = new WaggleConfig(tmpDir);
      config.setFallbackModel('test-model');
      config.save();
      config.clearFallbackModel();
      config.save();
      const config2 = new WaggleConfig(tmpDir);
      expect(config2.getFallbackModel()).toBeNull();
    });
  });
});

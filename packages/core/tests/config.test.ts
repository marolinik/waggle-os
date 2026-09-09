import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  it('recovers a malformed primary from the last valid backup', () => {
    const configDir = makeTempDir();
    fs.writeFileSync(path.join(configDir, 'config.json'), '{"defaultModel":');
    fs.writeFileSync(path.join(configDir, 'config.json.bak'), JSON.stringify({
      defaultModel: 'openai-compatible/qwen3.8-flash-next',
      providers: {
        'openai-compatible': {
          apiKey: '',
          models: ['qwen3.8-flash-next'],
          baseUrl: 'http://10.33.0.153:4000/v1',
        },
      },
      onboarding: { completed: true },
    }));

    const config = new WaggleConfig(configDir);

    expect(config.getDefaultModel()).toBe('openai-compatible/qwen3.8-flash-next');
    expect(config.getProviders()['openai-compatible']?.baseUrl).toBe('http://10.33.0.153:4000/v1');
  });

  it('recovers an interrupted replacement when only the backup remains', () => {
    const configDir = makeTempDir();
    fs.writeFileSync(path.join(configDir, 'config.json.bak'), JSON.stringify({
      defaultModel: 'openai-compatible/qwen3.8-flash-next',
      providers: {},
    }));

    expect(new WaggleConfig(configDir).getDefaultModel()).toBe('openai-compatible/qwen3.8-flash-next');
  });

  it('preserves the previous config when atomic publication fails', () => {
    const configDir = makeTempDir();
    const config = new WaggleConfig(configDir);
    config.setDefaultModel('stable-model');
    config.save();
    config.setDefaultModel('unpublished-model');

    const configPath = path.join(configDir, 'config.json');
    const renameSync = fs.renameSync.bind(fs);
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (String(source).endsWith('.tmp') && destination === configPath) {
        const error = new Error('publication blocked') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }
      return renameSync(source, destination);
    });

    expect(() => config.save()).toThrow('publication blocked');
    renameSpy.mockRestore();

    expect(new WaggleConfig(configDir).getDefaultModel()).toBe('stable-model');
    expect(fs.readdirSync(configDir).some(name => name.endsWith('.tmp'))).toBe(false);
  });

  it('repairs a recovered config without losing unknown fields', () => {
    const configDir = makeTempDir();
    const configPath = path.join(configDir, 'config.json');
    fs.writeFileSync(configPath, '{broken');
    fs.writeFileSync(`${configPath}.bak`, JSON.stringify({
      defaultModel: 'recovered-model',
      providers: {},
      onboarding: { completed: true, source: 'flag' },
    }));

    const config = new WaggleConfig(configDir);
    config.setDefaultModel('repaired-model');
    config.save();

    const repaired = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    expect(repaired.defaultModel).toBe('repaired-model');
    expect(repaired.onboarding).toEqual({ completed: true, source: 'flag' });
    expect(fs.readdirSync(configDir).some(name => name.startsWith('config.json.corrupt-'))).toBe(true);
  });

  it('recovers a structurally invalid primary only from a valid backup', () => {
    const configDir = makeTempDir();
    fs.writeFileSync(path.join(configDir, 'config.json'), 'null');
    fs.writeFileSync(path.join(configDir, 'config.json.bak'), JSON.stringify({
      defaultModel: 'backup-model',
      providers: {},
    }));

    expect(new WaggleConfig(configDir).getDefaultModel()).toBe('backup-model');
  });

  it('does not retain migrated plaintext provider secrets in recovery files', () => {
    const configDir = makeTempDir();
    const secret = 'sk-legacy-plaintext-must-disappear';
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({
      defaultModel: 'openai/gpt-4o',
      providers: { openai: { apiKey: secret, models: ['gpt-4o'] } },
    }));
    const config = new WaggleConfig(configDir);
    config.setProvider('openai', { apiKey: '', models: ['gpt-4o'] });

    config.save();

    for (const name of fs.readdirSync(configDir)) {
      expect(fs.readFileSync(path.join(configDir, name), 'utf-8')).not.toContain(secret);
    }
  });

  it('does not resurrect a disconnected team or its token from recovery data', () => {
    const configDir = makeTempDir();
    const configPath = path.join(configDir, 'config.json');
    const token = 'team-token-must-not-survive';
    fs.writeFileSync(configPath, JSON.stringify({
      defaultModel: 'claude-sonnet-4-6',
      providers: {},
      teamServer: { url: 'https://team.example.test', token },
    }));
    const config = new WaggleConfig(configDir);
    config.clearTeamServer();
    config.save();
    fs.writeFileSync(configPath, '{broken');

    const recovered = new WaggleConfig(configDir);

    expect(recovered.isTeamConnected()).toBe(false);
    expect(recovered.getTeamServer()).toBeNull();
    expect(fs.readFileSync(`${configPath}.bak`, 'utf-8')).not.toContain(token);
  });

  it('does not replace a valid primary with stale backup data after a transient read lock', () => {
    const configDir = makeTempDir();
    const configPath = path.join(configDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ defaultModel: 'current-model', providers: {} }));
    fs.writeFileSync(`${configPath}.bak`, JSON.stringify({ defaultModel: 'stale-model', providers: {} }));
    const readFileSync = fs.readFileSync.bind(fs);
    let primaryReads = 0;
    const readSpy = vi.spyOn(fs, 'readFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      if (file === configPath) {
        primaryReads += 1;
        const error = new Error('temporarily locked') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      }
      return readFileSync(file, ...args as [BufferEncoding]);
    }) as typeof fs.readFileSync);

    expect(() => new WaggleConfig(configDir)).toThrow('temporarily locked');
    expect(primaryReads).toBe(4);
    readSpy.mockRestore();
    expect(new WaggleConfig(configDir).getDefaultModel()).toBe('current-model');
  });

  it('does not retain a plaintext secret during the Windows replacement fallback', () => {
    const configDir = makeTempDir();
    const configPath = path.join(configDir, 'config.json');
    const secret = 'sk-legacy-windows-fallback-must-disappear';
    fs.writeFileSync(configPath, JSON.stringify({
      defaultModel: 'openai/gpt-4o',
      providers: { openai: { apiKey: secret, models: ['gpt-4o'] } },
    }));
    const config = new WaggleConfig(configDir);
    config.setProvider('openai', { apiKey: '', models: ['gpt-4o'] });
    const renameSync = fs.renameSync.bind(fs);
    let primaryPublicationAttempts = 0;
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (String(source).startsWith(`${configPath}.`) && String(source).endsWith('.tmp') && destination === configPath) {
        primaryPublicationAttempts += 1;
        if (primaryPublicationAttempts <= 4) {
          const error = new Error('replacement temporarily blocked') as NodeJS.ErrnoException;
          error.code = 'EPERM';
          throw error;
        }
      }
      return renameSync(source, destination);
    });

    expect(() => config.save()).not.toThrow();
    renameSpy.mockRestore();
    for (const name of fs.readdirSync(configDir)) {
      expect(fs.readFileSync(path.join(configDir, name), 'utf-8')).not.toContain(secret);
    }
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

  describe('governed CLI config', () => {
    it('normalizes, deduplicates, and persists the CLI allowlist', () => {
      const configDir = makeTempDir();
      const config = new WaggleConfig(configDir);

      config.setCliAllowlist([' node ', 'NODE', '', 'git']);
      expect(config.getCliAllowlist()).toEqual(['node', 'git']);
      config.save();

      const config2 = new WaggleConfig(configDir);
      expect(config2.getCliAllowlist()).toEqual(['node', 'git']);
    });
  });

  describe('embedding config', () => {
    const envNames = [
      'EMBEDDING_PROVIDER',
      'EMBEDDING_MODEL',
      'OLLAMA_HOST',
      'OLLAMA_EMBED_MODEL',
    ] as const;
    const originalEnv = new Map<string, string | undefined>();

    beforeEach(() => {
      originalEnv.clear();
      for (const name of envNames) {
        originalEnv.set(name, process.env[name]);
        delete process.env[name];
      }
    });

    afterEach(() => {
      for (const name of envNames) {
        const value = originalEnv.get(name);
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    });

    it.each(['', '   '])('treats blank provider override %j as unset', override => {
      process.env.EMBEDDING_PROVIDER = override;
      const config = new WaggleConfig(makeTempDir());

      expect(config.getEmbeddingConfig().provider).toBe('auto');

      config.setEmbeddingProvider('inprocess');
      expect(config.getEmbeddingConfig().provider).toBe('inprocess');
    });

    it('trims a valid provider override and keeps it authoritative', () => {
      process.env.EMBEDDING_PROVIDER = ' inprocess ';
      const config = new WaggleConfig(makeTempDir());
      config.setEmbeddingProvider('ollama');

      expect(config.getEmbeddingConfig().provider).toBe('inprocess');
    });

    it('treats blank embedding model and Ollama overrides as unset', () => {
      const configDir = makeTempDir();
      fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({
        defaultModel: 'claude-sonnet-4-6',
        providers: {},
        embedding: {
          provider: 'auto',
          inprocessModel: 'persisted-inprocess-model',
          ollamaUrl: 'http://127.0.0.1:11434',
          ollamaModel: 'persisted-ollama-model',
        },
      }));
      process.env.EMBEDDING_MODEL = ' ';
      process.env.OLLAMA_HOST = '';
      process.env.OLLAMA_EMBED_MODEL = '   ';

      expect(new WaggleConfig(configDir).getEmbeddingConfig()).toMatchObject({
        inprocess: { model: 'persisted-inprocess-model' },
        ollama: {
          baseUrl: 'http://127.0.0.1:11434',
          model: 'persisted-ollama-model',
        },
      });
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

    it('returns 90 as default maxIterations', () => {
      const config = new WaggleConfig(tmpDir);
      expect(config.getMaxIterations()).toBe(90);
    });

    it('persists maxIterations', () => {
      const config = new WaggleConfig(tmpDir);
      config.setMaxIterations(50);
      config.save();
      const config2 = new WaggleConfig(tmpDir);
      expect(config2.getMaxIterations()).toBe(50);
    });
  });
});

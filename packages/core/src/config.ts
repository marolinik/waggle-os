import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { EmbeddingProviderConfig, EmbeddingProviderType } from '@waggle/hive-mind-core';

export interface ProviderEntry {
  apiKey: string;
  models: string[];
  baseUrl?: string;
}

export interface TeamServerConfig {
  url: string;
  token?: string;
  userId?: string;
  displayName?: string;
}

export interface CliConfig {
  allowlist?: string[];
}

interface ConfigData {
  defaultModel: string;
  providers: Record<string, ProviderEntry>;
  mindPath?: string;
  teamServer?: TeamServerConfig;
  /** Governed CLI programs the agent may execute. */
  cli?: CliConfig;
  /** F8: Daily cost budget in dollars. null = no limit. */
  dailyBudget?: number | null;
  /** When true, exceeding dailyBudget blocks agent. When false, warns only. */
  budgetHardCap?: boolean;
  /** Model Pilot: fallback model when primary fails (429/500/timeout) */
  fallbackModel?: string;
  /** Model Pilot: budget-saver model when daily spend hits threshold */
  budgetModel?: string;
  /** Model Pilot: budget threshold as 0.0-1.0 fraction. Default 0.8 */
  budgetThreshold?: number;
  /** Agent Intelligence: max LLM iterations per conversation. Default 90. */
  maxIterations?: number;
  /** M2-7: Telemetry opt-in (default: false — privacy first) */
  telemetryEnabled?: boolean;
  /** M2-1: Embedding provider configuration */
  embedding?: {
    provider?: EmbeddingProviderType | 'auto';
    ollamaUrl?: string;
    ollamaModel?: string;
    inprocessModel?: string;
  };
  /** Steal #6: on-demand relevance gating for MCP tools. */
  mcpToolRetrieval?: {
    enabled?: boolean;
    threshold?: number;
    topK?: number;
  };
}

/** Resolved MCP tool-retrieval config (all fields present). */
export interface McpToolRetrievalSettings {
  enabled: boolean;
  threshold: number;
  topK: number;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const TRANSIENT_RENAME_ERRORS = new Set(['EPERM', 'EACCES', 'EBUSY']);
const TRANSIENT_READ_ERRORS = TRANSIENT_RENAME_ERRORS;

class InvalidConfigError extends Error {}

function waitForRetry(attempt: number): void {
  const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(waitBuffer, 0, 0, 25 * attempt);
}

function renameWithRetry(source: string, destination: string): void {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      fs.renameSync(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!TRANSIENT_RENAME_ERRORS.has(code ?? '') || attempt === 4) throw error;
      waitForRetry(attempt);
    }
  }
}

function readFileWithRetry(file: string): string {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return fs.readFileSync(file, 'utf-8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!TRANSIENT_READ_ERRORS.has(code ?? '') || attempt === 4) throw error;
      waitForRetry(attempt);
    }
  }
  throw new Error(`Unable to read config: ${file}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readConfig(file: string): ConfigData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileWithRetry(file));
  } catch (error) {
    if (error instanceof SyntaxError) throw new InvalidConfigError(`Malformed config: ${file}`);
    throw error;
  }
  if (!isRecord(parsed) || typeof parsed.defaultModel !== 'string' || !isRecord(parsed.providers)) {
    throw new InvalidConfigError(`Invalid config structure: ${file}`);
  }
  for (const provider of Object.values(parsed.providers)) {
    if (
      !isRecord(provider)
      || typeof provider.apiKey !== 'string'
      || !Array.isArray(provider.models)
      || !provider.models.every(model => typeof model === 'string')
      || (provider.baseUrl !== undefined && typeof provider.baseUrl !== 'string')
    ) {
      throw new InvalidConfigError(`Invalid provider config structure: ${file}`);
    }
  }
  return parsed as unknown as ConfigData;
}

function sanitizedBackup(config: ConfigData): ConfigData {
  const sanitized: ConfigData = {
    ...config,
    providers: Object.fromEntries(
      Object.entries(config.providers).map(([name, provider]) => [name, { ...provider, apiKey: '' }]),
    ),
  };
  delete sanitized.teamServer;
  return sanitized;
}

function writeJsonTemp(file: string, value: unknown): void {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
    flag: 'wx',
  });
}

function removeWithRetry(file: string): void {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      fs.rmSync(file, { force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!TRANSIENT_RENAME_ERRORS.has(code ?? '') || attempt === 4) throw error;
      waitForRetry(attempt);
    }
  }
}

function publishTemp(source: string, destination: string, recoveryPath?: string): void {
  try {
    renameWithRetry(source, destination);
    return;
  } catch (firstError) {
    const code = (firstError as NodeJS.ErrnoException).code;
    if (!TRANSIENT_RENAME_ERRORS.has(code ?? '') || !fs.existsSync(destination)) throw firstError;
    removeWithRetry(destination);
    try {
      renameWithRetry(source, destination);
    } catch (replacementError) {
      try {
        if (recoveryPath && !fs.existsSync(destination) && fs.existsSync(recoveryPath)) {
          const restorePath = `${destination}.${process.pid}.${randomUUID()}.restore`;
          fs.copyFileSync(recoveryPath, restorePath, fs.constants.COPYFILE_EXCL);
          renameWithRetry(restorePath, destination);
        }
      } catch { /* load() can still recover directly from recoveryPath */ }
      throw replacementError;
    }
  }
}

function getNonBlankEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function getDefaultConfigDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.waggle');
}

export class WaggleConfig {
  private readonly configDir: string;
  private readonly configPath: string;
  private data: ConfigData;

  constructor(configDir?: string) {
    this.configDir = configDir ?? getDefaultConfigDir();
    this.configPath = path.join(this.configDir, 'config.json');

    // Ensure config directory exists
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    // Load existing config or use defaults
    this.data = this.load();
  }

  private load(): ConfigData {
    let primaryError: unknown;
    if (fs.existsSync(this.configPath)) {
      try {
        return readConfig(this.configPath);
      } catch (error) {
        if (!(error instanceof InvalidConfigError)) throw error;
        primaryError = error;
      }
    }

    const backupPath = `${this.configPath}.bak`;
    if (fs.existsSync(backupPath)) {
      try {
        return readConfig(backupPath);
      } catch (backupError) {
        if (!(backupError instanceof InvalidConfigError)) throw backupError;
        if (primaryError === undefined) throw backupError;
      }
    }

    if (primaryError !== undefined) throw primaryError;
    return {
      defaultModel: DEFAULT_MODEL,
      providers: {},
    };
  }

  save(): void {
    const nonce = `${process.pid}.${randomUUID()}`;
    const tempPath = `${this.configPath}.${nonce}.tmp`;
    const backupPath = `${this.configPath}.bak`;
    const backupTempPath = `${backupPath}.${nonce}.tmp`;
    writeJsonTemp(tempPath, this.data);

    try {
      if (!fs.existsSync(this.configPath)) {
        publishTemp(tempPath, this.configPath);
        return;
      }

      let previousConfig: ConfigData | null = null;
      try {
        previousConfig = readConfig(this.configPath);
      } catch (error) {
        if (!(error instanceof InvalidConfigError)) throw error;
      }

      if (!previousConfig) {
        const corruptPath = `${this.configPath}.corrupt-${Date.now()}-${randomUUID()}`;
        renameWithRetry(this.configPath, corruptPath);
        try {
          renameWithRetry(tempPath, this.configPath);
        } catch (error) {
          try {
            if (!fs.existsSync(this.configPath)) renameWithRetry(corruptPath, this.configPath);
          } catch { /* the valid backup remains available */ }
          throw error;
        }
        return;
      }

      // Publish a secret-scrubbed recovery copy before replacing the primary.
      // The primary stays authoritative until this operation has fully committed.
      writeJsonTemp(backupTempPath, sanitizedBackup(previousConfig));
      publishTemp(backupTempPath, backupPath);
      publishTemp(tempPath, this.configPath, backupPath);
    } finally {
      try { fs.rmSync(tempPath, { force: true }); } catch { /* best-effort cleanup */ }
      try { fs.rmSync(backupTempPath, { force: true }); } catch { /* best-effort cleanup */ }
    }
  }

  getDefaultModel(): string {
    return this.data.defaultModel;
  }

  setDefaultModel(model: string): void {
    this.data.defaultModel = model;
  }

  getProviders(): Record<string, ProviderEntry> {
    return { ...(this.data.providers ?? {}) };
  }

  setProvider(name: string, entry: ProviderEntry): void {
    if (!this.data.providers) this.data.providers = {};
    this.data.providers[name] = entry;
  }

  removeProvider(name: string): void {
    delete this.data.providers[name];
  }

  getMindPath(): string {
    return this.data.mindPath ?? path.join(this.configDir, 'default.mind');
  }

  getConfigDir(): string {
    return this.configDir;
  }

  // F8: Daily cost budget
  getDailyBudget(): number | null {
    return this.data.dailyBudget ?? null;
  }

  setDailyBudget(budget: number | null): void {
    this.data.dailyBudget = budget;
  }

  getBudgetHardCap(): boolean {
    return this.data.budgetHardCap ?? false;
  }

  setBudgetHardCap(enabled: boolean): void {
    this.data.budgetHardCap = enabled;
  }

  // --- Model Pilot ---

  getFallbackModel(): string | null {
    return this.data.fallbackModel ?? null;
  }

  setFallbackModel(model: string): void {
    this.data.fallbackModel = model;
  }

  clearFallbackModel(): void {
    delete this.data.fallbackModel;
  }

  getBudgetModel(): string | null {
    return this.data.budgetModel ?? null;
  }

  setBudgetModel(model: string): void {
    this.data.budgetModel = model;
  }

  clearBudgetModel(): void {
    delete this.data.budgetModel;
  }

  getBudgetThreshold(): number {
    return this.data.budgetThreshold ?? 0.8;
  }

  setBudgetThreshold(threshold: number): void {
    this.data.budgetThreshold = Math.max(0.5, Math.min(0.95, threshold));
  }

  // --- Agent Intelligence ---

  getMaxIterations(): number {
    return this.data.maxIterations ?? 90;
  }

  setMaxIterations(max: number): void {
    this.data.maxIterations = Math.max(5, Math.min(500, max));
  }

  // --- Team Server (Phase 5) ---

  getTeamServer(): TeamServerConfig | null {
    return this.data.teamServer ?? null;
  }

  setTeamServer(config: TeamServerConfig): void {
    this.data.teamServer = config;
  }

  clearTeamServer(): void {
    delete this.data.teamServer;
  }

  isTeamConnected(): boolean {
    return this.data.teamServer !== null && this.data.teamServer !== undefined && typeof this.data.teamServer.url === 'string' && this.data.teamServer.url.length > 0;
  }

  // --- Governed CLI access ---

  getCliAllowlist(): string[] {
    return [...(this.data.cli?.allowlist ?? [])];
  }

  setCliAllowlist(allowlist: string[]): void {
    const seen = new Set<string>();
    const next = allowlist.reduce<string[]>((result, entry) => {
      const value = entry.trim();
      const key = value.toLowerCase();
      if (value && !seen.has(key)) {
        seen.add(key);
        result.push(value);
      }
      return result;
    }, []);
    this.data.cli = { ...(this.data.cli ?? {}), allowlist: next };
  }

  // --- Telemetry (M2-7) ---

  getTelemetryEnabled(): boolean {
    return this.data.telemetryEnabled ?? false;
  }

  setTelemetryEnabled(enabled: boolean): void {
    this.data.telemetryEnabled = enabled;
    this.save();
  }

  // --- Embedding Provider (M2-1) ---

  getEmbeddingConfig(): EmbeddingProviderConfig {
    const emb = this.data.embedding;
    const config: EmbeddingProviderConfig = {
      provider: (getNonBlankEnv('EMBEDDING_PROVIDER') as EmbeddingProviderType | 'auto' | undefined) ?? emb?.provider ?? 'auto',
      targetDimensions: 1024,
      inprocess: {
        model: getNonBlankEnv('EMBEDDING_MODEL') ?? emb?.inprocessModel,
        cacheDir: path.join(this.configDir, 'models'),
      },
      ollama: {
        baseUrl: getNonBlankEnv('OLLAMA_HOST') ?? emb?.ollamaUrl,
        model: getNonBlankEnv('OLLAMA_EMBED_MODEL') ?? emb?.ollamaModel,
      },
      // API keys injected separately from Vault — not stored in config.json
    };
    return config;
  }

  setEmbeddingProvider(provider: EmbeddingProviderType | 'auto'): void {
    if (!this.data.embedding) this.data.embedding = {};
    this.data.embedding.provider = provider;
  }

  // --- MCP tool retrieval (Steal #6) ---

  /** Resolve MCP tool-retrieval settings, filling defaults (ON, threshold 20, top-k 10). */
  getMcpToolRetrieval(): McpToolRetrievalSettings {
    const cfg = this.data.mcpToolRetrieval;
    return {
      enabled: cfg?.enabled ?? true,
      threshold: cfg?.threshold ?? 20,
      topK: cfg?.topK ?? 10,
    };
  }
}

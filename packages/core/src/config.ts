import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { EmbeddingProviderConfig, EmbeddingProviderType } from './mind/embedding-provider.js';

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

interface ConfigData {
  defaultModel: string;
  providers: Record<string, ProviderEntry>;
  mindPath?: string;
  teamServer?: TeamServerConfig;
  /** F8: Daily cost budget in dollars. null = no limit. */
  dailyBudget?: number | null;
  /** Model Pilot: fallback model when primary fails (429/500/timeout) */
  fallbackModel?: string;
  /** Model Pilot: budget-saver model when daily spend hits threshold */
  budgetModel?: string;
  /** Model Pilot: budget threshold as 0.0-1.0 fraction. Default 0.8 */
  budgetThreshold?: number;
  /** M2-7: Telemetry opt-in (default: false — privacy first) */
  telemetryEnabled?: boolean;
  /** M2-1: Embedding provider configuration */
  embedding?: {
    provider?: EmbeddingProviderType | 'auto';
    ollamaUrl?: string;
    ollamaModel?: string;
    inprocessModel?: string;
  };
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';

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
    if (fs.existsSync(this.configPath)) {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      return JSON.parse(raw) as ConfigData;
    }
    return {
      defaultModel: DEFAULT_MODEL,
      providers: {},
    };
  }

  save(): void {
    fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2), 'utf-8');
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
      provider: (process.env.EMBEDDING_PROVIDER as EmbeddingProviderType | 'auto' | undefined) ?? emb?.provider ?? 'auto',
      targetDimensions: 1024,
      inprocess: {
        model: process.env.EMBEDDING_MODEL ?? emb?.inprocessModel,
        cacheDir: path.join(this.configDir, 'models'),
      },
      ollama: {
        baseUrl: process.env.OLLAMA_HOST ?? emb?.ollamaUrl,
        model: process.env.OLLAMA_EMBED_MODEL ?? emb?.ollamaModel,
      },
      // API keys injected separately from Vault — not stored in config.json
    };
    return config;
  }

  setEmbeddingProvider(provider: EmbeddingProviderType | 'auto'): void {
    if (!this.data.embedding) this.data.embedding = {};
    this.data.embedding.provider = provider;
  }
}

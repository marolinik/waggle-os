import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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
    return { ...this.data.providers };
  }

  setProvider(name: string, entry: ProviderEntry): void {
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
}

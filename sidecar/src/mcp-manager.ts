export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export class McpManager {
  private servers: Map<string, McpServerConfig>;

  constructor() {
    this.servers = new Map();
  }

  addServer(config: McpServerConfig): void {
    if (this.servers.has(config.id)) {
      throw new Error(`Server "${config.id}" already exists`);
    }
    this.servers.set(config.id, { enabled: true, ...config });
  }

  removeServer(id: string): void {
    this.servers.delete(id);
  }

  getServer(id: string): McpServerConfig | undefined {
    return this.servers.get(id);
  }

  listServers(): McpServerConfig[] {
    return Array.from(this.servers.values());
  }

  toJSON(): string {
    return JSON.stringify(Array.from(this.servers.values()));
  }

  static fromJSON(json: string): McpManager {
    const manager = new McpManager();
    const configs = JSON.parse(json) as McpServerConfig[];
    for (const config of configs) {
      manager.servers.set(config.id, config);
    }
    return manager;
  }
}

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface WorkspaceConfig {
  teamSlug?: string;
  model?: string;
  mindPath?: string;
  litellmUrl?: string;
}

const DEFAULT_CONFIG: WorkspaceConfig = {
  model: 'claude-sonnet',
  litellmUrl: 'http://localhost:4000/v1',
};

export class Workspace {
  private root: string;
  private waggleDir: string;

  constructor(root: string) {
    this.root = root;
    this.waggleDir = path.join(root, '.waggle');
  }

  getRoot(): string {
    return this.root;
  }

  init(): void {
    fs.mkdirSync(path.join(this.waggleDir, 'sessions'), { recursive: true });
    fs.mkdirSync(path.join(this.waggleDir, 'audit'), { recursive: true });

    const configPath = path.join(this.waggleDir, 'workspace.json');
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    }
  }

  getConfig(): WorkspaceConfig {
    const configPath = path.join(this.waggleDir, 'workspace.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as WorkspaceConfig;
  }

  updateConfig(updates: Partial<WorkspaceConfig>): void {
    const current = this.getConfig();
    const merged = { ...current, ...updates };
    const configPath = path.join(this.waggleDir, 'workspace.json');
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
  }

  startSession(): string {
    const today = new Date().toISOString().slice(0, 10);
    const sessionsDir = path.join(this.waggleDir, 'sessions');

    // Find existing session files for today to determine next number
    const existing = fs.readdirSync(sessionsDir)
      .filter((f) => f.startsWith(today) && f.endsWith('.jsonl'))
      .map((f) => {
        const match = f.match(/(\d{3})\.jsonl$/);
        return match ? parseInt(match[1], 10) : 0;
      });

    const nextNum = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    const sessionId = `${today}-${String(nextNum).padStart(3, '0')}`;

    // Create the session file
    fs.writeFileSync(path.join(sessionsDir, `${sessionId}.jsonl`), '', 'utf-8');

    return sessionId;
  }

  logTurn(sessionId: string, role: string, content: string, toolsUsed?: string[]): void {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      role,
      content,
    };
    if (toolsUsed !== undefined) {
      entry.tools_used = toolsUsed;
    }

    const filePath = path.join(this.waggleDir, 'sessions', `${sessionId}.jsonl`);
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  logAudit(sessionId: string, tool: string, input: unknown, output: string): void {
    const entry = {
      timestamp: new Date().toISOString(),
      tool,
      input,
      output,
    };

    const filePath = path.join(this.waggleDir, 'audit', `${sessionId}.jsonl`);
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
  }
}

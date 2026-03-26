import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { URL } from 'node:url';

const DEFAULT_CONFIG_DIR = join(homedir(), '.waggle');
const DEFAULT_SERVER_URL = 'http://localhost:3000';
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface AuthData {
  token: string;
  email: string;
  serverUrl: string;
}

export class AuthManager {
  private configDir: string;
  private configPath: string;

  constructor(configDir?: string) {
    this.configDir = configDir ?? DEFAULT_CONFIG_DIR;
    this.configPath = join(this.configDir, 'config.json');
  }

  getToken(): string | null {
    const auth = this.readAuth();
    return auth?.token ?? null;
  }

  getEmail(): string | null {
    const auth = this.readAuth();
    return auth?.email ?? null;
  }

  getServerUrl(): string {
    const auth = this.readAuth();
    return auth?.serverUrl ?? DEFAULT_SERVER_URL;
  }

  isLoggedIn(): boolean {
    return this.getToken() !== null;
  }

  saveToken(token: string, email: string): void {
    const config = this.readConfig();
    config.auth = {
      token,
      email,
      serverUrl: config.auth?.serverUrl ?? DEFAULT_SERVER_URL,
    };
    this.writeConfig(config);
  }

  logout(): void {
    const config = this.readConfig();
    delete config.auth;
    this.writeConfig(config);
  }

  async loginWithBrowser(clerkUrl: string): Promise<{ token: string; email: string }> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        if (!req.url?.startsWith('/callback')) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const url = new URL(req.url, `http://127.0.0.1`);
        const token = url.searchParams.get('token');
        const email = url.searchParams.get('email');

        if (!token || !email) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html><body><h1>Login failed</h1><p>Missing token or email.</p></body></html>');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Login successful!</h1><p>You can close this tab and return to the terminal.</p></body></html>');

        clearTimeout(timeout);
        server.close();
        resolve({ token, email });
      });

      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to start callback server'));
          return;
        }
        const port = address.port;
        const redirectUrl = `http://127.0.0.1:${port}/callback`;
        const loginUrl = `${clerkUrl}?redirect_url=${encodeURIComponent(redirectUrl)}`;
        openBrowser(loginUrl);
      });

      const timeout = setTimeout(() => {
        server.close();
        reject(new Error('Login timed out after 5 minutes'));
      }, LOGIN_TIMEOUT_MS);
    });
  }

  private readAuth(): AuthData | null {
    const config = this.readConfig();
    return config.auth ?? null;
  }

  private readConfig(): Record<string, any> {
    try {
      if (!existsSync(this.configPath)) return {};
      const raw = readFileSync(this.configPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private writeConfig(config: Record<string, any>): void {
    mkdirSync(this.configDir, { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }
}

export function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === 'win32') {
    execFile('cmd.exe', ['/c', 'start', '""', url]);
  } else if (platform === 'darwin') {
    execFile('open', [url]);
  } else {
    execFile('xdg-open', [url]);
  }
}

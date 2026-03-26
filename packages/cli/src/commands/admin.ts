/**
 * Admin CLI client for Waggle server REST API.
 *
 * Provides methods to manage teams, jobs, cron schedules,
 * audit logs, and usage stats from the CLI.
 */

const DEFAULT_API_BASE = 'http://localhost:3100';

export class AdminClient {
  private readonly apiBase: string;
  private readonly token: string;

  constructor(apiBase?: string, token?: string) {
    this.apiBase = apiBase ?? process.env.WAGGLE_API_URL ?? DEFAULT_API_BASE;
    this.token = token ?? process.env.WAGGLE_TOKEN ?? '';
  }

  private async request<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${this.apiBase}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${body || res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  /** List all teams the authenticated user has access to. */
  async listTeams(): Promise<unknown> {
    return this.request('/api/teams');
  }

  /** List agent jobs, optionally filtered by team slug. */
  async listJobs(teamSlug: string): Promise<unknown> {
    return this.request(`/api/jobs?teamSlug=${encodeURIComponent(teamSlug)}`);
  }

  /** List cron schedules for a team. */
  async listCron(teamSlug: string): Promise<unknown> {
    return this.request(`/api/teams/${encodeURIComponent(teamSlug)}/cron`);
  }

  /** List audit log entries for a team. */
  async listAudit(teamSlug: string): Promise<unknown> {
    return this.request(`/api/admin/teams/${encodeURIComponent(teamSlug)}/audit`);
  }

  /** Get usage statistics for a team. */
  async getStats(teamSlug: string): Promise<unknown> {
    return this.request(`/api/admin/teams/${encodeURIComponent(teamSlug)}/usage`);
  }
}

/**
 * Format admin data as a simple table for CLI output.
 * Takes an array of objects and prints key-value columns.
 */
export function formatTable(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return '  (no data)';

  const keys = columns ?? Object.keys(rows[0]);
  const widths = keys.map((k) =>
    Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)),
  );

  const header = keys.map((k, i) => k.padEnd(widths[i])).join('  ');
  const separator = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = rows
    .map((r) => keys.map((k, i) => String(r[k] ?? '').padEnd(widths[i])).join('  '))
    .join('\n');

  return `  ${header}\n  ${separator}\n  ${body}`;
}

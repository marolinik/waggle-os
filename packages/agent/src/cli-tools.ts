/**
 * CLI-Anything — make any CLI tool available to the agent with governance.
 *
 * cli_discover: Scans PATH for known CLIs, returns available programs.
 * cli_execute: Runs an allowed CLI program with arguments and timeout.
 *
 * Governance: User controls which CLIs the agent can use via an allowlist
 * in config.json. All executions are logged to the audit trail.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ToolDefinition } from './tools.js';

const execFileAsync = promisify(execFile);

/** Well-known CLIs to detect on the system */
const KNOWN_CLIS = [
  { name: 'git', versionFlag: '--version' },
  { name: 'node', versionFlag: '--version' },
  { name: 'npm', versionFlag: '--version' },
  { name: 'npx', versionFlag: '--version' },
  { name: 'python', versionFlag: '--version' },
  { name: 'python3', versionFlag: '--version' },
  { name: 'pip', versionFlag: '--version' },
  { name: 'docker', versionFlag: '--version' },
  { name: 'docker-compose', versionFlag: '--version' },
  { name: 'aws', versionFlag: '--version' },
  { name: 'gcloud', versionFlag: '--version' },
  { name: 'az', versionFlag: '--version' },
  { name: 'kubectl', versionFlag: 'version --client --short' },
  { name: 'gh', versionFlag: '--version' },
  { name: 'cargo', versionFlag: '--version' },
  { name: 'rustc', versionFlag: '--version' },
  { name: 'go', versionFlag: 'version' },
  { name: 'java', versionFlag: '-version' },
  { name: 'mvn', versionFlag: '--version' },
  { name: 'dotnet', versionFlag: '--version' },
  { name: 'terraform', versionFlag: '--version' },
  { name: 'helm', versionFlag: 'version --short' },
  { name: 'curl', versionFlag: '--version' },
  { name: 'wget', versionFlag: '--version' },
  { name: 'jq', versionFlag: '--version' },
  { name: 'ffmpeg', versionFlag: '-version' },
];

export interface CliToolsConfig {
  /** Programs the agent is allowed to execute (empty = none allowed) */
  allowlist: string[];
  /** Optional live source used when `/cli` changes the persisted allowlist. */
  getAllowlist?: () => string[];
  /** Audit logger for tracking CLI executions */
  auditLog?: (entry: { actionType: string; description: string }) => void;
}

export function createCliTools(config: CliToolsConfig): ToolDefinition[] {
  const getAllowlist = config.getAllowlist ?? (() => config.allowlist);

  return [
    {
      name: 'cli_discover',
      description: 'Discover available CLI tools on the system. Returns name, version, and whether each is in the allowlist.',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        type CliResult = { name: string; version: string; allowed: boolean };
        const allowlist = getAllowlist();
        const allowSet = new Set(allowlist.map(s => s.toLowerCase()));

        // Probe every known CLI in parallel. Sequentially this was up to
        // KNOWN_CLIS.length × 5s (~130s) — far over the 30s test budget on CI
        // runners (where most of these CLIs are present), which made the
        // cli_discover test flaky. Promise.all bounds wall-time to the slowest
        // single probe (~5s) and preserves KNOWN_CLIS order in the output.
        const settled = await Promise.all(
          KNOWN_CLIS.map(async (cli): Promise<CliResult | null> => {
            try {
              const args = cli.versionFlag.split(' ');
              const { stdout } = await execFileAsync(cli.name, args, { timeout: 5000 });
              return {
                name: cli.name,
                version: stdout.trim().split('\n')[0],
                allowed: allowSet.has('*') || allowSet.has(cli.name),
              };
            } catch {
              return null; // CLI not found — skip
            }
          }),
        );
        const results = settled.filter((r): r is CliResult => r !== null);

        return JSON.stringify({
          found: results.length,
          programs: results,
          allowlist,
        });
      },
    },
    {
      name: 'cli_execute',
      description: 'Execute a CLI program with arguments. Only programs in the allowlist are permitted. Configure the allowlist in Settings.',
      parameters: {
        type: 'object',
        properties: {
          program: { type: 'string', description: 'CLI program name (e.g., "gh", "aws", "docker")' },
          args: { type: 'array', items: { type: 'string' }, description: 'Arguments to pass to the program' },
          timeout: { type: 'number', description: 'Timeout in seconds (default: 30, max: 120)' },
        },
        required: ['program'],
      },
      execute: async (params: Record<string, unknown>) => {
        const program = String(params.program ?? '').trim();
        const args = (params.args as string[]) ?? [];
        const timeoutSec = Math.min(Number(params.timeout) || 30, 120);
        const allowlist = getAllowlist();
        const allowSet = new Set(allowlist.map(s => s.toLowerCase()));

        if (!program) {
          return JSON.stringify({ success: false, error: 'program is required' });
        }

        // Check allowlist
        const isAllowed = allowSet.has('*') || allowSet.has(program.toLowerCase());
        if (!isAllowed) {
          return JSON.stringify({
            success: false,
            error: `Program "${program}" is not in the CLI allowlist. Add it in Settings > CLI Allowlist to enable.`,
            allowlist,
          });
        }

        // Audit log
        config.auditLog?.({
          actionType: `cli.execute.${program}`,
          description: `CLI: ${program} ${args.join(' ')}`,
        });

        try {
          const { stdout, stderr } = await execFileAsync(program, args, {
            timeout: timeoutSec * 1000,
            maxBuffer: 1024 * 1024, // 1 MB
          });

          return JSON.stringify({
            success: true,
            program,
            args,
            exitCode: 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          });
        } catch (err: unknown) {
          const execErr = err as { code?: string; killed?: boolean; signal?: string; stdout?: string; stderr?: string };
          return JSON.stringify({
            success: false,
            program,
            args,
            exitCode: execErr.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? -1 : 1,
            error: execErr.killed ? `Killed after ${timeoutSec}s timeout` : (err instanceof Error ? err.message : String(err)),
            stdout: execErr.stdout?.trim() ?? '',
            stderr: execErr.stderr?.trim() ?? '',
          });
        }
      },
    },
  ];
}

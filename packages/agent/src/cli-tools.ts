/**
 * CLI-Anything — make any CLI tool available to the agent with governance.
 *
 * cli_discover: Scans PATH for known CLIs, returns available programs.
 * cli_execute: Runs an allowed CLI program with arguments and timeout.
 *
 * Governance: User controls which CLIs the agent can use via an allowlist
 * in config.json. All executions are logged to the audit trail.
 */

import type { ToolDefinition } from './tools.js';
import {
  resolveToolCommandInvocation,
  resolveToolCommandInvocationFromPath,
  type ToolCommandInvocation,
} from './tool-command.js';
import { createSanitizedEnv, execFileWithTreeTimeout } from './system-tools-helpers.js';

async function execCliInvocation(
  invocation: ToolCommandInvocation,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileWithTreeTimeout(invocation.binary, invocation.args, {
    cwd: process.cwd(),
    env,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments === true,
  }, timeoutMs);

  if (result.timedOut) {
    throw Object.assign(new Error(`Killed after ${timeoutMs / 1000}s timeout`), {
      cleanupDegraded: result.cleanupDegraded,
      killed: true,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
  if (result.errorMessage) {
    throw Object.assign(new Error(result.errorMessage), {
      cleanupDegraded: result.cleanupDegraded,
      code: result.errorCode ?? undefined,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

async function execCliFile(
  program: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  const env = createSanitizedEnv();
  const direct = resolveToolCommandInvocation(program, args, process.platform, { env });
  try {
    return await execCliInvocation(direct, env, timeoutMs);
  } catch (err) {
    const code = (err as { code?: string | number }).code;
    if (process.platform !== 'win32' || code !== 'ENOENT') throw err;

    const resolved = await resolveToolCommandInvocationFromPath(
      program,
      args,
      process.platform,
      { env },
    );
    if (resolved.binary === direct.binary && resolved.args === direct.args) throw err;
    return execCliInvocation(resolved, env, timeoutMs);
  }
}

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

const CLI_DISCOVERY_CONCURRENCY = 8;

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

        // Bound concurrent probes because each Windows invocation owns a
        // Worker. Batching preserves KNOWN_CLIS output order.
        const settled: Array<CliResult | null> = [];
        for (let offset = 0; offset < KNOWN_CLIS.length; offset += CLI_DISCOVERY_CONCURRENCY) {
          const batch = await Promise.all(
            KNOWN_CLIS.slice(offset, offset + CLI_DISCOVERY_CONCURRENCY)
              .map(async (cli): Promise<CliResult | null> => {
                const args = cli.versionFlag.split(' ');
                const env = createSanitizedEnv();
                let resolvedFromPath = false;
                try {
                  const invocation = await resolveToolCommandInvocationFromPath(
                    cli.name,
                    args,
                    process.platform,
                    { env, fallbackToWhere: false },
                  );
                  resolvedFromPath = invocation.binary !== cli.name;
                  const { stdout, stderr } = await execCliInvocation(invocation, env, 2_000);
                  return {
                    name: cli.name,
                    version: (stdout || stderr).trim().split(/\r?\n/)[0],
                    allowed: allowSet.has('*') || allowSet.has(cli.name),
                  };
                } catch {
                  if (process.platform === 'win32' && resolvedFromPath) {
                    return {
                      name: cli.name,
                      version: 'Installed (version probe unavailable)',
                      allowed: allowSet.has('*') || allowSet.has(cli.name),
                    };
                  }
                  return null; // CLI not found - skip
                }
              }),
          );
          settled.push(...batch);
        }
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
        const args = Array.isArray(params.args) ? params.args.map(String) : [];
        const requestedTimeout = Number(params.timeout);
        const timeoutSec = Number.isFinite(requestedTimeout) && requestedTimeout > 0
          ? Math.min(requestedTimeout, 120)
          : 30;
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
          const { stdout, stderr } = await execCliFile(program, args, timeoutSec * 1000);

          return JSON.stringify({
            success: true,
            program,
            args,
            exitCode: 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          });
        } catch (err: unknown) {
          const execErr = err as {
            cleanupDegraded?: boolean;
            code?: string | number;
            killed?: boolean;
            signal?: string;
            stdout?: string;
            stderr?: string;
          };
          const cleanupWarning = execErr.cleanupDegraded
            ? ' Process-tree cleanup degraded to the root process; descendants may still be running.'
            : '';
          return JSON.stringify({
            success: false,
            program,
            args,
            exitCode: execErr.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
              ? -1
              : (typeof execErr.code === 'number' ? execErr.code : 1),
            error: execErr.killed
              ? `Killed after ${timeoutSec}s timeout.${cleanupWarning}`
              : `${err instanceof Error ? err.message : String(err)}${cleanupWarning}`,
            stdout: execErr.stdout?.trim() ?? '',
            stderr: execErr.stderr?.trim() ?? '',
          });
        }
      },
    },
  ];
}

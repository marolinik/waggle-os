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
import {
  resolveToolCommandInvocation,
  resolveToolCommandInvocationFromPath,
  type ToolCommandInvocation,
} from './tool-command.js';
import { createSanitizedEnv, terminateProcessTree } from './system-tools-helpers.js';

const execFileAsync = promisify(execFile);

async function execCliInvocation(
  invocation: ToolCommandInvocation,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  const pending = execFileAsync(invocation.binary, invocation.args, {
    env,
    maxBuffer: 1024 * 1024,
    // Our timer terminates the full process tree. Keep a later native timeout
    // only as a final fail-safe if platform tree termination itself stalls.
    timeout: timeoutMs + 2_000,
    windowsHide: true,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments === true,
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    terminateProcessTree(pending.child);
  }, timeoutMs);

  try {
    return await pending;
  } catch (err) {
    const execErr = err as { code?: string; stdout?: string; stderr?: string };
    if (execErr.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      terminateProcessTree(pending.child);
    }
    if (timedOut) {
      throw Object.assign(new Error(`Killed after ${timeoutMs / 1000}s timeout`), {
        killed: true,
        stdout: execErr.stdout ?? '',
        stderr: execErr.stderr ?? '',
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
    const code = (err as { code?: string }).code;
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

        // Probe every known CLI in parallel and cap version reads at 2s.
        // Windows keeps path-confirmed tools in the result even when their
        // version command is slow, while preserving KNOWN_CLIS output order.
        const settled = await Promise.all(
          KNOWN_CLIS.map(async (cli): Promise<CliResult | null> => {
            const args = cli.versionFlag.split(' ');
            const env = createSanitizedEnv();
            const invocation = await resolveToolCommandInvocationFromPath(
              cli.name,
              args,
              process.platform,
              { env, fallbackToWhere: false },
            );
            const resolvedFromPath = invocation.binary !== cli.name;
            try {
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

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import {
  backupByteIdentical,
  normalizeCliPath,
  readPointer,
  writePointer,
  type InstallPointer,
} from '@waggle/hive-mind-hooks-core';
import {
  resolveMcpEntry,
  resolvePaths,
  type ClaudeDesktopPaths,
  type ResolvePathsOptions,
} from './paths.js';

export const MCP_SERVER_NAME = 'waggle-memory';

export interface InstallOptions extends ResolvePathsOptions {
  mcpEntry?: string;
  cliPath?: string;
  now?: () => Date;
  logger?: Logger;
}

export interface InstallResult {
  paths: ClaudeDesktopPaths;
  backupPath: string | null;
  pointerPath: string;
  createdByUs: boolean;
  serverName: typeof MCP_SERVER_NAME;
  mcpEntry: string;
}

const POINTER_VERSION = '0.1.0';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export async function install(opts: InstallOptions = {}): Promise<InstallResult> {
  const log = opts.logger ?? createLogger({ name: 'claude-desktop-hooks/install' });
  const paths = resolvePaths(opts);
  const entry = resolveMcpEntry(opts);
  if (!entry) {
    throw new Error(
      'cannot resolve waggle-memory-mcp/dist/index.js — ' +
      'build packages/memory-mcp first or pass --mcp-entry <path>',
    );
  }

  const configExists = existsSync(paths.configPath);
  let config: Record<string, unknown> = {};
  if (configExists) {
    const raw = await readFile(paths.configPath, 'utf-8');
    try {
      config = asRecord(JSON.parse(raw)) ?? {};
    } catch (err) {
      throw new Error(
        `failed to parse existing ${paths.configPath} as JSON: ` +
        (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  const existingServers = asRecord(config['mcpServers']);
  const pointerExists = existsSync(paths.pointerPath);
  if (
    configExists
    && existingServers !== undefined
    && Object.prototype.hasOwnProperty.call(existingServers, MCP_SERVER_NAME)
    && !pointerExists
  ) {
    throw new Error(
      `a '${MCP_SERVER_NAME}' MCP server entry already exists in ${paths.configPath} ` +
      'and was not installed by this tool; remove or rename it first',
    );
  }

  await mkdir(paths.claudeConfigDir, { recursive: true });
  await mkdir(dirname(paths.pointerPath), { recursive: true });

  const now = opts.now ?? ((): Date => new Date());
  const installedAt = now().toISOString();
  let backupPath: string | null;
  let createdByUs: boolean;

  if (pointerExists) {
    const originalPointer = await readPointer(paths.pointerPath);
    backupPath = originalPointer.settings_backup;
    createdByUs = originalPointer.created_by_us;
  } else {
    const backup = await backupByteIdentical(paths.configPath, installedAt);
    backupPath = backup.backupPath;
    createdByUs = !backup.preExisted;
  }

  const cliPath = normalizeCliPath(opts.cliPath);
  const serverEntry = {
    command: process.env.WAGGLE_HOOK_NODE_PATH?.trim() || process.execPath,
    args: [entry],
  };
  const next = {
    ...config,
    mcpServers: {
      ...(existingServers ?? {}),
      [MCP_SERVER_NAME]: serverEntry,
    },
  };
  const bytes = JSON.stringify(next, null, 2) + '\n';
  await writeFile(paths.configPath, bytes, 'utf-8');
  const installedSha = createHash('sha256').update(bytes).digest('hex');

  const pointer: InstallPointer = {
    version: POINTER_VERSION,
    installed_at: installedAt,
    config_path: paths.configPath,
    settings_backup: backupPath,
    created_by_us: createdByUs,
    hooks_dir: null,
    installed_hooks: [`mcp:${MCP_SERVER_NAME}`],
    cli_path: cliPath ?? null,
    extra: {
      mcp_server_name: MCP_SERVER_NAME,
      mcp_entry: entry,
      mcp_command: serverEntry.command,
      installed_sha256: installedSha,
    },
  };
  await writePointer(paths.pointerPath, pointer);

  log.info('install complete', {
    config: paths.configPath,
    server: MCP_SERVER_NAME,
    createdByUs,
  });

  return {
    paths,
    backupPath,
    pointerPath: paths.pointerPath,
    createdByUs,
    serverName: MCP_SERVER_NAME,
    mcpEntry: entry,
  };
}

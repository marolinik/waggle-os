import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import {
  readPointer,
  restoreFromBackup,
} from '@waggle/hive-mind-hooks-core';
import { MCP_SERVER_NAME } from './install.js';
import {
  resolvePaths,
  type ClaudeDesktopPaths,
  type ResolvePathsOptions,
} from './paths.js';

export interface UninstallOptions extends ResolvePathsOptions {
  logger?: Logger;
  cleanupBackup?: boolean;
}

export interface UninstallResult {
  paths: ClaudeDesktopPaths;
  restoredFrom: string | null;
  createdRemoved: boolean;
  backupRemoved: boolean;
  surgical: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export async function uninstall(opts: UninstallOptions = {}): Promise<UninstallResult> {
  const log = opts.logger ?? createLogger({ name: 'claude-desktop-hooks/uninstall' });
  const paths = resolvePaths(opts);
  const pointer = await readPointer(paths.pointerPath);

  let restoredFrom: string | null = null;
  let createdRemoved = false;
  let backupRemoved = false;
  let surgical = false;

  if (existsSync(paths.configPath)) {
    const currentBytes = await readFile(paths.configPath);
    const currentSha = createHash('sha256').update(currentBytes).digest('hex');
    const extra = asRecord(pointer.extra);
    const installedSha = typeof extra?.['installed_sha256'] === 'string'
      ? extra['installed_sha256']
      : undefined;

    if (installedSha !== undefined && currentSha === installedSha) {
      const restored = await restoreFromBackup({
        configPath: paths.configPath,
        pointer,
        cleanupBackup: opts.cleanupBackup ?? true,
      });
      restoredFrom = restored.restoredFrom;
      createdRemoved = restored.createdRemoved;
      backupRemoved = restored.backupRemoved;
    } else {
      let parsed: Record<string, unknown>;
      try {
        parsed = asRecord(JSON.parse(currentBytes.toString('utf-8'))) ?? {};
      } catch (err) {
        const backup = pointer.settings_backup ?? '(no backup available)';
        throw new Error(
          `failed to parse edited ${paths.configPath} as JSON; backup retained at ${backup} ` +
          `for manual recovery: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const servers = asRecord(parsed['mcpServers']) ?? {};
      const remainingServers = Object.fromEntries(
        Object.entries(servers).filter(([name]) => name !== MCP_SERVER_NAME),
      );
      const next = {
        ...parsed,
        mcpServers: remainingServers,
      };
      await writeFile(paths.configPath, JSON.stringify(next, null, 2) + '\n', 'utf-8');
      surgical = true;
    }
  }

  await unlink(paths.pointerPath);
  log.info('uninstall complete', {
    config: paths.configPath,
    surgical,
    backupRemoved,
  });

  return {
    paths,
    restoredFrom,
    createdRemoved,
    backupRemoved,
    surgical,
  };
}

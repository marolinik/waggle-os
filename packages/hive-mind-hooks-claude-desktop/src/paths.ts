import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

const requireFromHook = createRequire(import.meta.url);

export interface ClaudeDesktopPaths {
  claudeConfigDir: string;
  configPath: string;
  pointerPath: string;
}

export interface ResolvePathsOptions {
  home?: string;
  platform?: NodeJS.Platform;
  configDir?: string;
}

export function resolvePaths(opts: ResolvePathsOptions = {}): ClaudeDesktopPaths {
  const platform = opts.platform ?? process.platform;
  const home = opts.home ?? homedir();

  let defaultConfigDir: string;
  if (platform === 'win32') {
    const roaming = opts.home !== undefined
      ? join(home, 'AppData', 'Roaming')
      : (process.env.APPDATA ?? join(home, 'AppData', 'Roaming'));
    defaultConfigDir = join(roaming, 'Claude');
  } else if (platform === 'darwin') {
    defaultConfigDir = join(home, 'Library', 'Application Support', 'Claude');
  } else {
    defaultConfigDir = join(home, '.config', 'Claude');
  }

  const claudeConfigDir = opts.configDir
    ?? process.env.WAGGLE_CLAUDE_DESKTOP_CONFIG_DIR
    ?? defaultConfigDir;
  const configPath = join(claudeConfigDir, 'claude_desktop_config.json');
  const pointerPath = join(home, '.waggle', 'claude-desktop', 'hive-mind-install.json');

  return { claudeConfigDir, configPath, pointerPath };
}

export function resolveMcpEntry(opts: { mcpEntry?: string } = {}): string | undefined {
  const configured = opts.mcpEntry ?? process.env.WAGGLE_MEMORY_MCP_ENTRY;
  if (configured !== undefined) {
    const trimmed = configured.trim();
    return trimmed.length > 0 ? resolve(trimmed) : undefined;
  }

  try {
    const installedEntry = requireFromHook.resolve('waggle-memory-mcp');
    if (existsSync(installedEntry)) return installedEntry;
  } catch {
    // Fall through to explicit NODE_PATH/current-directory compatibility roots.
  }

  const nodePathRoots = (process.env.NODE_PATH ?? '')
    .split(delimiter)
    .map((root) => root.trim())
    .filter((root) => root.length > 0);
  const roots = [
    ...nodePathRoots,
    join(process.cwd(), 'node_modules'),
  ];

  for (const root of roots) {
    const candidate = join(root, 'waggle-memory-mcp', 'dist', 'index.js');
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

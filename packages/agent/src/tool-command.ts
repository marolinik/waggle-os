import { existsSync, readFileSync } from 'node:fs';
import { win32 as pathWin32 } from 'node:path';

export interface ToolCommandInvocation {
  binary: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
}

export interface ToolCommandResolutionDeps {
  readTextFile?: (path: string) => string | null;
  fileExists?: (path: string) => boolean;
  nodeBinary?: string;
}

function defaultReadTextFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function defaultFileExists(path: string): boolean {
  return existsSync(path);
}

function npmCmdShimTarget(content: string): string | null {
  const match = content.match(/"%_prog%"\s+"%dp0%[\\/]+([^"]+)"/i);
  return match?.[1] ?? null;
}

function quoteCmdArg(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function resolveToolCommandInvocation(
  binary: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  deps: ToolCommandResolutionDeps = {},
): ToolCommandInvocation {
  if (platform === 'win32' && /\.(?:cmd|bat)$/i.test(binary)) {
    const readTextFile = deps.readTextFile ?? defaultReadTextFile;
    const fileExists = deps.fileExists ?? defaultFileExists;
    const content = readTextFile(binary);
    const shimTarget = content ? npmCmdShimTarget(content) : null;
    if (shimTarget) {
      const shimDir = pathWin32.dirname(binary);
      const localNode = pathWin32.join(shimDir, 'node.exe');
      return {
        binary: fileExists(localNode) ? localNode : (deps.nodeBinary ?? 'node'),
        args: [pathWin32.join(shimDir, shimTarget), ...args],
      };
    }

    return {
      binary: 'cmd.exe',
      args: [
        '/d',
        '/v:off',
        '/s',
        '/c',
        ['call', quoteCmdArg(binary), ...args.map(quoteCmdArg)].join(' '),
      ],
      windowsVerbatimArguments: true,
    };
  }
  return { binary, args };
}

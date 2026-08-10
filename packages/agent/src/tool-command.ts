import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { win32 as pathWin32 } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ToolCommandInvocation {
  binary: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
}

export interface ToolCommandResolutionDeps {
  readTextFile?: (path: string) => string | null;
  fileExists?: (path: string) => boolean;
  nodeBinary?: string;
  env?: NodeJS.ProcessEnv;
  pathLookup?: (binary: string, env: NodeJS.ProcessEnv) => Promise<string[]>;
  fallbackToWhere?: boolean;
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
  const packageShim = content.match(/"%_prog%"\s+"%dp0%[\\/]+([^"]+)"/i);
  if (packageShim?.[1]) return packageShim[1];

  // npm 11's own npm.cmd/npx.cmd use NPM_CLI_JS/NPX_CLI_JS rather than
  // the package-shim `_prog` template. Resolve their local JS entrypoint so
  // model-supplied argv never passes through cmd.exe expansion.
  const npmCli = content.match(/SET\s+"(?:NPM|NPX)_CLI_JS=%~dp0[\\/]+([^"]+)"/i);
  return npmCli?.[1] ?? null;
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

    throw Object.assign(
      new Error(`UNSAFE_WINDOWS_BATCH_SHIM: Refusing unrecognized Windows batch shim: ${binary}`),
      { code: 'UNSAFE_WINDOWS_BATCH_SHIM' },
    );
  }
  return { binary, args };
}

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const match = Object.entries(env).find(([key]) => key.toUpperCase() === name);
  return match?.[1];
}

function windowsLookupEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of ['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR']) {
    const value = envValue(source, name);
    if (value !== undefined) env[name] = value;
  }
  return env;
}

async function defaultWindowsPathLookup(
  binary: string,
  env: NodeJS.ProcessEnv,
  fallbackToWhere: boolean,
): Promise<string[]> {
  const pathValue = envValue(env, 'PATH') ?? '';
  const extension = pathWin32.extname(binary);
  const extensions = extension
    ? ['']
    : (envValue(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .filter((item) => /^\.(?:exe|com|cmd|bat)$/i.test(item));
  for (const rawDir of pathValue.split(';')) {
    const directory = rawDir.trim().replace(/^"(.*)"$/, '$1');
    if (!directory) continue;
    for (const suffix of extensions) {
      const candidate = pathWin32.join(directory, `${binary}${suffix}`);
      if (existsSync(candidate)) return [candidate];
    }
  }

  if (!fallbackToWhere) return [];

  // `where.exe` remains the authoritative fallback for App Execution Aliases
  // and other Windows resolution cases not represented as ordinary PATH files.
  const windowsRoot = envValue(env, 'SYSTEMROOT') ?? envValue(env, 'WINDIR') ?? 'C:\\Windows';
  const whereBinary = pathWin32.join(windowsRoot, 'System32', 'where.exe');
  const { stdout } = await execFileAsync(whereBinary, [binary], {
    env,
    timeout: 3_000,
    windowsHide: true,
  });
  return stdout
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
}

/**
 * Resolve a bare Windows command through PATH before applying cmd-shim
 * handling. Node's shell-free spawn does not honor PATHEXT for npm/npx .cmd
 * shims, so spawning the logical name directly fails with ENOENT.
 */
export async function resolveToolCommandInvocationFromPath(
  binary: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  deps: ToolCommandResolutionDeps = {},
): Promise<ToolCommandInvocation> {
  if (platform !== 'win32' || pathWin32.isAbsolute(binary) || /[\\/]/.test(binary)) {
    return resolveToolCommandInvocation(binary, args, platform, deps);
  }

  const lookupEnv = windowsLookupEnv(deps.env ?? process.env);
  let candidates: string[];
  try {
    candidates = deps.pathLookup
      ? await deps.pathLookup(binary, lookupEnv)
      : await defaultWindowsPathLookup(binary, lookupEnv, deps.fallbackToWhere !== false);
  } catch {
    // Preserve the original spawn error when PATH lookup itself fails.
    return resolveToolCommandInvocation(binary, args, platform, deps);
  }
  const resolved = candidates.find((candidate) => /\.(?:exe|com|cmd|bat)$/i.test(candidate));
  if (resolved) return resolveToolCommandInvocation(resolved, args, platform, deps);
  return resolveToolCommandInvocation(binary, args, platform, deps);
}

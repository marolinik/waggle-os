import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export interface InstallCommandOptions {
  cwd?: string;
  timeout: number;
}

export interface CommandInvocation {
  executable: string;
  args: string[];
}

function isStrictlyInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function deepestExistingAncestor(target: string): string {
  let current = target;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

/** Resolve an install target while preventing traversal and symlink/junction escapes. */
export function resolveManagedInstallPath(root: string, candidate: string): string {
  if (!candidate || candidate.includes('\0')) {
    throw new Error('Install path must be a non-empty filesystem path.');
  }

  const resolvedRoot = resolve(root);
  const resolvedTarget = isAbsolute(candidate)
    ? resolve(candidate)
    : resolve(resolvedRoot, candidate);
  if (!isStrictlyInside(resolvedRoot, resolvedTarget)) {
    throw new Error(`Install path escapes managed directory: ${candidate}`);
  }

  const relativeTarget = relative(resolvedRoot, resolvedTarget);
  if (process.platform === 'win32' && relativeTarget.split(/[\\/]/).some(part => part.includes(':'))) {
    throw new Error(`Install path contains a Windows alternate data stream: ${candidate}`);
  }

  const canonicalRoot = realpathSync.native(resolvedRoot);
  const canonicalAncestor = realpathSync.native(deepestExistingAncestor(resolvedTarget));
  if (canonicalAncestor !== canonicalRoot && !isStrictlyInside(canonicalRoot, canonicalAncestor)) {
    throw new Error(`Install path escapes managed directory through a symlink: ${candidate}`);
  }

  return resolvedTarget;
}

const REGISTRY_PACKAGE_SPEC = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(?:@(?:[~^]?[a-z0-9*][a-z0-9._~+*^-]*))?$/i;
const GITHUB_SHORTHAND_SPEC = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?:#[a-z0-9][a-z0-9._/-]*)?$/i;
const FORBIDDEN_GIT_URL_CHARS = new Set([';', '&', '|', '`', '$', '<', '>', '(', ')', '{', '}', '[', ']', '"', "'", '\\', '^', '!']);

/** Allow registry packages and the owner/repo shorthand produced by GitHub sync. */
export function assertSafeNpmPackageSpec(spec: string): string {
  if (!REGISTRY_PACKAGE_SPEC.test(spec) && !GITHUB_SHORTHAND_SPEC.test(spec)) {
    throw new Error(`Unsupported npm package spec: ${spec}`);
  }
  return spec;
}

export function assertNoNpmArgs(args: string[] | undefined): void {
  if (args && args.length > 0) {
    throw new Error('Marketplace npm_args are not permitted.');
  }
}

/** Git installs accept only credential-free HTTPS URLs, never local/ext transports. */
export function assertSafeGitUrl(value: string): string {
  const hasForbiddenCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x20 || codePoint === 0x7f || FORBIDDEN_GIT_URL_CHARS.has(character);
  });
  if (hasForbiddenCharacter) {
    throw new Error(`Unsupported plugin git URL: ${value}`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Unsupported plugin git URL: ${value}`);
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error(`Unsupported plugin git URL: ${value}`);
  }
  return value;
}

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  return Object.entries(env).find(([key]) => key.toUpperCase() === name)?.[1];
}

function npmShimTarget(content: string): string | null {
  const npmCli = content.match(/SET\s+"NPM_CLI_JS=%~dp0[\\/]+([^"]+)"/i);
  if (npmCli?.[1]) return npmCli[1];

  const packageShim = content.match(/"%_prog%"\s+"%dp0%[\\/]+([^"]+)"/i);
  return packageShim?.[1] ?? null;
}

/** Resolve npm without routing untrusted argv through cmd.exe on Windows. */
export function resolveNpmInvocation(
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): CommandInvocation {
  if (platform !== 'win32') {
    return { executable: 'npm', args: [...args] };
  }

  const npmExecPath = envValue(env, 'NPM_EXECPATH');
  if (npmExecPath && /(?:^|[\\/])npm-cli\.js$/i.test(npmExecPath) && existsSync(npmExecPath)) {
    return { executable: process.execPath, args: [npmExecPath, ...args] };
  }

  const pathValue = envValue(env, 'PATH') ?? '';
  for (const rawDir of pathValue.split(';')) {
    const directory = rawDir.trim().replace(/^"(.*)"$/, '$1');
    if (!directory) continue;

    for (const filename of ['npm.exe', 'npm.com']) {
      const executable = join(directory, filename);
      if (existsSync(executable)) return { executable, args: [...args] };
    }

    const shimPath = join(directory, 'npm.cmd');
    if (!existsSync(shimPath)) continue;
    const target = npmShimTarget(readFileSync(shimPath, 'utf8'));
    if (!target) {
      throw new Error(`Cannot safely resolve npm command shim: ${shimPath}`);
    }
    const npmCliPath = resolve(directory, target);
    if (!existsSync(npmCliPath)) {
      throw new Error(`npm CLI entrypoint does not exist: ${npmCliPath}`);
    }
    const siblingNode = join(directory, 'node.exe');
    return {
      executable: existsSync(siblingNode) ? siblingNode : process.execPath,
      args: [npmCliPath, ...args],
    };
  }

  throw new Error('npm is unavailable or cannot be resolved without a command shell.');
}

export function runMarketplaceInstallCommand(
  command: 'git' | 'npm',
  args: readonly string[],
  options: InstallCommandOptions,
): void {
  const invocation = command === 'npm'
    ? resolveNpmInvocation(args)
    : { executable: command, args: [...args] };
  execFileSync(invocation.executable, invocation.args, {
    cwd: options.cwd,
    stdio: 'pipe',
    timeout: options.timeout,
    windowsHide: true,
  });
}

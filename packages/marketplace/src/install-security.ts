import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { MCP_SERVERS } from './mcp-registry.js';
import type {
  InstallationType,
  InstallManifest,
  MarketplaceMcpProvenance,
  MarketplaceSource,
  McpServerConfig,
} from './types.js';

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
const PROCESS_CONTROL_ENV_KEYS = new Set([
  'PATH',
  'PATHEXT',
  'COMSPEC',
  'SHELL',
  'SYSTEMROOT',
  'WINDIR',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'TEMP',
  'TMP',
  'TMPDIR',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_EXTRA_CA_CERTS',
  'NPM_EXECPATH',
  'NPM_NODE_EXECPATH',
  'BASH_ENV',
  'ENV',
  'PYTHONPATH',
  'PYTHONHOME',
  'PYTHONSTARTUP',
  'PYTHONUSERBASE',
  'PYTHONPYCACHEPREFIX',
  'VIRTUAL_ENV',
  'RUBYOPT',
  'PERL5OPT',
  'PSMODULEPATH',
  'JAVA_TOOL_OPTIONS',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
]);
const PROCESS_CONTROL_ENV_PREFIXES = [
  'NPM_CONFIG_',
  'UV_',
  'PIP_',
  'XDG_',
  'GIT_',
  'LD_',
  'DYLD_',
  'BASH_FUNC_',
];

interface ApprovedMarketplaceMcpProfile {
  packageName: string;
  packageVersion: string;
  name: string;
  command: string;
  args: string[];
  envKeys: string[];
  env: Record<string, string>;
  npmPackage: string;
}

/**
 * Marketplace MCP execution is a curated capability, not a generic package
 * runner. Build the allowlist from the same registry entries seeded into the
 * marketplace so a database row cannot substitute an interpreter or
 * meta-launcher while retaining a syntactically valid package name.
 */
const APPROVED_MARKETPLACE_MCP_PROFILES: ApprovedMarketplaceMcpProfile[] = MCP_SERVERS.flatMap((server) => {
  const manifest = server.install_manifest;
  const config = manifest?.mcp_config;
  return config && manifest?.npm_package && server.version
    ? [{
        packageName: server.name,
        packageVersion: server.version,
        name: config.name,
        command: config.command,
        args: [...config.args],
        envKeys: Object.keys(config.env ?? {}).sort(),
        env: { ...config.env },
        npmPackage: manifest.npm_package,
      }]
    : [];
});

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

function assertStringArguments(args: unknown): asserts args is string[] {
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) {
    throw new Error('Marketplace MCP launcher arguments must be an array of strings.');
  }
}

function assertSafeMarketplaceEnvironment(env: unknown): void {
  if (env === undefined) return;
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    throw new Error('Marketplace MCP environment must be a string map.');
  }

  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string') {
      throw new Error(`Marketplace MCP environment value for ${key} must be a string.`);
    }
    const normalized = key.toUpperCase();
    if (
      PROCESS_CONTROL_ENV_KEYS.has(normalized)
      || PROCESS_CONTROL_ENV_PREFIXES.some(prefix => normalized.startsWith(prefix))
    ) {
      throw new Error(`Marketplace MCP environment key is not permitted: ${key}`);
    }
  }
}

/**
 * Accept only an exact curated launcher profile. Matching the complete argv
 * supplies a package-specific argument policy and prevents approved runners
 * (`npx`/`uvx`) from being repurposed with interpreter or meta-launcher
 * packages such as `npm`, `node`, or `python`.
 */
function approvedMarketplaceMcpProfile(config: McpServerConfig): ApprovedMarketplaceMcpProfile {
  if (!config || typeof config !== 'object' || typeof config.name !== 'string' || !config.name.trim()) {
    throw new Error('Marketplace MCP configuration must have a non-empty name.');
  }
  if (typeof config.command !== 'string') {
    throw new Error('Marketplace MCP launcher command must be a string.');
  }
  assertStringArguments(config.args);

  if (config.command !== 'npx' && config.command !== 'uvx') {
    throw new Error(`Unsupported marketplace MCP launcher command: ${config.command}`);
  }
  assertSafeMarketplaceEnvironment(config.env);

  const profile = APPROVED_MARKETPLACE_MCP_PROFILES.find(candidate => (
    candidate.name === config.name
    && candidate.command === config.command
    && candidate.args.length === config.args.length
    && candidate.args.every((arg, index) => arg === config.args[index])
  ));
  if (!profile) {
    throw new Error('Marketplace MCP launcher is not an exact approved catalog profile.');
  }

  const envKeys = Object.keys(config.env ?? {}).sort();
  if (
    envKeys.length !== profile.envKeys.length
    || envKeys.some((key, index) => key !== profile.envKeys[index])
  ) {
    throw new Error(`Marketplace MCP environment keys do not match the approved catalog profile: ${config.name}`);
  }

  return profile;
}

/** Preflight requires the exact catalog template, including env values. */
export function assertSafeMarketplaceMcpConfig(config: McpServerConfig): string {
  const profile = approvedMarketplaceMcpProfile(config);
  for (const envKey of profile.envKeys) {
    if (config.env?.[envKey] !== profile.env[envKey]) {
      throw new Error(`Marketplace MCP environment template does not match the approved catalog profile: ${config.name}`);
    }
  }
  return profile.npmPackage;
}

/**
 * Bind an approved launcher profile to the built-in catalog row that supplied
 * it. Database-local IDs and environment values are intentionally excluded so
 * the receipt is portable and never becomes another secret store.
 */
export function createMarketplaceMcpProvenance(
  source: Pick<MarketplaceSource, 'name' | 'source_type' | 'is_custom'> | null,
  pkg: { name: string; version: string },
  config: McpServerConfig,
): MarketplaceMcpProvenance {
  if (
    !source
    || source.name !== 'mcp_registry'
    || source.source_type !== 'registry'
    || Boolean(source.is_custom)
  ) {
    throw new Error('Marketplace MCP package must come from the canonical mcp_registry source.');
  }

  const npmPackage = assertSafeMarketplaceMcpConfig(config);
  const profile = approvedMarketplaceMcpProfile(config);
  if (pkg.name !== profile.packageName) {
    throw new Error('Marketplace MCP package name does not match its approved catalog profile.');
  }
  if (pkg.version !== profile.packageVersion) {
    throw new Error('Marketplace MCP package version does not match its approved catalog profile.');
  }

  const digestInput = {
    schemaVersion: 1,
    sourceName: source.name,
    packageName: pkg.name,
    packageVersion: pkg.version,
    npmPackage,
    serverName: profile.name,
    command: profile.command,
    args: [...profile.args],
    envKeys: [...profile.envKeys],
  };
  const profileDigest = `sha256:${createHash('sha256')
    .update(JSON.stringify(digestInput), 'utf8')
    .digest('hex')}` as const;

  return {
    kind: 'marketplace',
    schemaVersion: 1,
    sourceName: 'mcp_registry',
    packageName: pkg.name,
    packageVersion: pkg.version,
    npmPackage,
    profileDigest,
  };
}

function resolvedMarketplaceMcpEnvironment(
  source: Record<string, string> | undefined,
  settings: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!source) return undefined;
  const resolved = { ...source };
  for (const envKey of Object.keys(source)) {
    const template = source[envKey];
    for (const [settingKey, value] of Object.entries(settings ?? {})) {
      if (template === `\${${settingKey}}` || (template === '' && envKey === settingKey)) {
        resolved[envKey] = value;
      }
    }
  }
  return resolved;
}

/**
 * Sink check for a configured profile. Values may differ from the catalog
 * template only where the exact request setting key (or named placeholder)
 * authorizes that replacement.
 */
export function assertSafeConfiguredMarketplaceMcpConfig(
  configured: McpServerConfig,
  source: McpServerConfig,
  settings: Record<string, string> | undefined,
): void {
  assertSafeMarketplaceMcpConfig(source);
  const profile = approvedMarketplaceMcpProfile(configured);
  const expectedEnv = resolvedMarketplaceMcpEnvironment(source.env, settings) ?? {};
  for (const envKey of profile.envKeys) {
    if (configured.env?.[envKey] !== expectedEnv[envKey]) {
      throw new Error(`Configured marketplace MCP environment was not derived from approved settings: ${configured.name}`);
    }
  }
}

/** Clone and configure an approved profile without mutating catalog metadata. */
export function configureMarketplaceMcpServer(
  source: McpServerConfig,
  settings: Record<string, string> | undefined,
): McpServerConfig {
  assertSafeMarketplaceMcpConfig(source);
  if (
    settings !== undefined
    && (!settings || typeof settings !== 'object' || Array.isArray(settings)
      || Object.values(settings).some(value => typeof value !== 'string'))
  ) {
    throw new Error('Marketplace MCP settings must be a string map.');
  }
  const configured: McpServerConfig = {
    ...source,
    args: [...source.args],
    ...(source.env && { env: resolvedMarketplaceMcpEnvironment(source.env, settings) }),
  };
  assertSafeConfiguredMarketplaceMcpConfig(configured, source, settings);
  return configured;
}

function assertNoMarketplacePostInstallHooks(hooks: unknown): void {
  if (hooks === undefined) return;
  if (!Array.isArray(hooks)) {
    throw new Error('Marketplace post_install must be an array.');
  }
  if (hooks.length > 0) {
    throw new Error('Marketplace post-install hooks are not permitted.');
  }
}

const APPROVED_PLUGIN_MANIFEST_FIELDS = new Set([
  'name',
  'version',
  'description',
  'skills',
  'mcpServers',
  'settingsSchema',
]);

function assertSafePluginManifest(pluginManifest: unknown): void {
  if (pluginManifest === undefined) return;
  if (!pluginManifest || typeof pluginManifest !== 'object' || Array.isArray(pluginManifest)) {
    throw new Error('Marketplace plugin manifest must be an object.');
  }

  for (const key of Object.keys(pluginManifest)) {
    if (!APPROVED_PLUGIN_MANIFEST_FIELDS.has(key)) {
      throw new Error(`Marketplace plugin manifest field is not permitted: ${key}`);
    }
  }

  const manifest = pluginManifest as Record<string, unknown>;
  for (const key of ['name', 'version']) {
    if (typeof manifest[key] !== 'string' || !(manifest[key] as string).trim()) {
      throw new Error(`Marketplace plugin manifest ${key} must be a non-empty string.`);
    }
  }
  if (typeof manifest.description !== 'string') {
    throw new Error('Marketplace plugin manifest description must be a string.');
  }

  if (
    manifest.skills !== undefined
    && (!Array.isArray(manifest.skills) || manifest.skills.some(skill => typeof skill !== 'string'))
  ) {
    throw new Error('Marketplace plugin bundled skills must be an array of names.');
  }
}

/** Validate every manifest field that can later influence process execution. */
export function assertSafeMarketplaceInstallManifest(
  installType: InstallationType,
  manifest: InstallManifest | null,
): void {
  if (manifest === null) {
    if (installType === 'mcp') {
      throw new Error('Marketplace MCP package is missing its install manifest.');
    }
    return;
  }
  if (typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Marketplace install manifest must be an object.');
  }

  if (manifest.npm_package !== undefined) {
    if (typeof manifest.npm_package !== 'string') {
      throw new Error('Marketplace npm package spec must be a string.');
    }
    assertSafeNpmPackageSpec(manifest.npm_package);
  }
  assertNoNpmArgs(manifest.npm_args);
  assertNoMarketplacePostInstallHooks(manifest.post_install);

  if (installType === 'plugin') {
    if (manifest.git_url !== undefined) {
      throw new Error('Uncurated marketplace plugin git provenance is not permitted.');
    }
    if (manifest.npm_package !== undefined) {
      throw new Error('Uncurated marketplace plugin npm provenance is not permitted.');
    }

    assertSafePluginManifest(manifest.plugin_manifest);
    const bundledSkills = manifest.plugin_manifest?.skills;
    if (bundledSkills && bundledSkills.length > 0) {
      throw new Error('Marketplace plugin bundled-skill provenance is not verified; automatic fetch is disabled.');
    }
  }

  if (installType === 'mcp' && !manifest.mcp_config) {
    throw new Error('Marketplace MCP package is missing mcp_config.');
  }
  let approvedMcpPackage: string | undefined;
  if (manifest.mcp_config) {
    approvedMcpPackage = assertSafeMarketplaceMcpConfig(manifest.mcp_config);
  }
  if (installType === 'mcp' && manifest.npm_package !== approvedMcpPackage) {
    throw new Error('Marketplace MCP npm package does not match its exact approved catalog profile.');
  }

  const pluginServers = manifest.plugin_manifest?.mcpServers;
  if (pluginServers !== undefined) {
    if (!Array.isArray(pluginServers)) {
      throw new Error('Marketplace plugin MCP servers must be an array.');
    }
    for (const config of pluginServers) {
      assertSafeMarketplaceMcpConfig(config);
    }
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

/**
 * Smoke-check the OpenClaw install: openclaw.json exists + parses (JSON/JSON5)
 * + carries the hive-mind internal-hooks entry with the subsystem enabled, the
 * managed hook dir + HOOK.md + handler.js exist on disk, and hive-mind-cli
 * answers a `--help` probe. Plus the openclaw-specific activation advisory
 * (spec §5.5 / §6.2): hooks are OFF until `hooks.internal.enabled=true`.
 *
 * Probe selection follows the managed runtime: the trusted install pin, or
 * bare `'hive-mind-cli'` on PATH when the loader is unpinned.
 */

import { readFile, access } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import { HIVE_HOOK_ENTRY_KEY, resolvePaths, type ResolvePathsOptions } from './paths.js';
import { parseConfig, hasHiveEntries, HOOKS_KEY } from './json5-merger.js';
import {
  OPENCLAW_HANDLER_BUNDLE,
  OPENCLAW_HANDLER_PACKAGE_JSON,
  renderOpenclawHandlerEntrySource,
  type OpenclawRuntimeBinding,
} from './install.js';

export interface VerifyCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface VerifyResult {
  ok: boolean;
  checks: VerifyCheck[];
}

export interface VerifyOptions extends ResolvePathsOptions {
  logger?: Logger;
  /**
   * @deprecated Install with `cliPath` instead. A verify-only path cannot prove
   * the managed loader's runtime and is therefore ignored for readiness.
   */
  cliPath?: string;
  /** Expected packaged Node path; production receives this from the launcher runtime. */
  nodePath?: string;
  /** Test hook for spawn. */
  spawnImpl?: typeof spawn;
  /** Test hook for the CLI probe timeout. */
  cliProbeTimeoutMs?: number;
}

async function fileReadable(p: string): Promise<boolean> {
  try { await access(p, constants.R_OK); return true; } catch { return false; }
}

function isJsPath(p: string): boolean {
  return p.endsWith('.js') || p.endsWith('.mjs') || p.endsWith('.cjs');
}

function internalEnabled(config: Record<string, unknown>): boolean {
  const hooks = config[HOOKS_KEY];
  if (!hooks || typeof hooks !== 'object') return false;
  const internal = (hooks as Record<string, unknown>)['internal'];
  if (!internal || typeof internal !== 'object') return false;
  return (internal as Record<string, unknown>)['enabled'] === true;
}

function configuredCliPath(config: Record<string, unknown>): string | undefined {
  const hooks = config[HOOKS_KEY];
  if (!hooks || typeof hooks !== 'object') return undefined;
  const internal = (hooks as Record<string, unknown>)['internal'];
  if (!internal || typeof internal !== 'object') return undefined;
  const entries = (internal as Record<string, unknown>)['entries'];
  if (!entries || typeof entries !== 'object') return undefined;
  const hiveEntry = (entries as Record<string, unknown>)[HIVE_HOOK_ENTRY_KEY];
  if (!hiveEntry || typeof hiveEntry !== 'object') return undefined;
  const env = (hiveEntry as Record<string, unknown>)['env'];
  if (!env || typeof env !== 'object') return undefined;
  const cliPath = (env as Record<string, unknown>)['WAGGLE_HIVE_MIND_CLI'];
  return typeof cliPath === 'string' && cliPath.length > 0 ? cliPath : undefined;
}

function configuredNodePath(config: Record<string, unknown>): string | undefined {
  const hooks = config[HOOKS_KEY];
  if (!hooks || typeof hooks !== 'object') return undefined;
  const internal = (hooks as Record<string, unknown>)['internal'];
  if (!internal || typeof internal !== 'object') return undefined;
  const entries = (internal as Record<string, unknown>)['entries'];
  if (!entries || typeof entries !== 'object') return undefined;
  const hiveEntry = (entries as Record<string, unknown>)[HIVE_HOOK_ENTRY_KEY];
  if (!hiveEntry || typeof hiveEntry !== 'object') return undefined;
  const env = (hiveEntry as Record<string, unknown>)['env'];
  if (!env || typeof env !== 'object') return undefined;
  const nodePath = (env as Record<string, unknown>)['WAGGLE_HOOK_NODE_PATH'];
  return typeof nodePath === 'string' && nodePath.length > 0 ? nodePath : undefined;
}

const TERMINATION_GRACE_MS = 250;

function waitForProbe(
  child: ChildProcess,
  timeoutMs: number,
  timeoutMessage: string,
  successMessage: string,
  outputLimit: number,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    const timers: {
      timeout?: ReturnType<typeof setTimeout>;
      force?: ReturnType<typeof setTimeout>;
      detach?: ReturnType<typeof setTimeout>;
    } = {};
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    const clearTimers = (): void => {
      if (timers.timeout !== undefined) clearTimeout(timers.timeout);
      if (timers.force !== undefined) clearTimeout(timers.force);
      if (timers.detach !== undefined) clearTimeout(timers.detach);
    };
    const finish = (result: { ok: boolean; output: string }): void => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve(result);
    };

    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => {
      finish({
        ok: false,
        output: timedOut ? timeoutMessage : error instanceof Error ? error.message : String(error),
      });
    });
    child.on('exit', (code) => {
      if (timedOut) {
        finish({ ok: false, output: timeoutMessage });
        return;
      }
      const output = Buffer.concat(code === 0 ? stdout : stderr)
        .toString('utf-8')
        .trim()
        .slice(0, outputLimit);
      finish({
        ok: code === 0,
        output: output || (code === 0 ? successMessage : `process exited ${String(code)}`),
      });
    });

    timers.timeout = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      timers.force = setTimeout(() => {
        if (settled) return;
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        timers.detach = setTimeout(() => {
          if (settled) return;
          child.stdout?.destroy();
          child.stderr?.destroy();
          if (typeof child.unref === 'function') child.unref();
          finish({ ok: false, output: `${timeoutMessage}; process did not exit after SIGKILL` });
        }, TERMINATION_GRACE_MS);
      }, TERMINATION_GRACE_MS);
    }, timeoutMs);
  });
}

function probeCliVersion(
  cliPath: string,
  nodePath: string | undefined,
  spawnImpl: typeof spawn,
  timeoutMs: number,
): Promise<{ ok: boolean; output: string }> {
  const command = isJsPath(cliPath) ? nodePath ?? process.execPath : cliPath;
  const args = isJsPath(cliPath) ? [cliPath, '--help'] : ['--help'];
  const child = spawnImpl(command, args, {
    env: runtimeProbeEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return waitForProbe(
    child,
    timeoutMs,
    'timed out probing hive-mind-cli',
    'hive-mind-cli exited successfully',
    200,
  );
}

async function sha256File(filePath: string): Promise<string | undefined> {
  try {
    return createHash('sha256').update(await readFile(filePath)).digest('hex');
  } catch {
    return undefined;
  }
}

async function fileHasExactText(filePath: string, expected: string): Promise<boolean> {
  try {
    return await readFile(filePath, 'utf-8') === expected;
  } catch {
    return false;
  }
}

function runtimeBindingFromPointer(pointer: Record<string, unknown> | undefined): {
  declared: boolean;
  binding?: OpenclawRuntimeBinding;
} {
  const extra = pointer?.['extra'];
  if (!extra || typeof extra !== 'object') return { declared: false };
  const candidate = (extra as Record<string, unknown>)['runtime_binding'];
  if (candidate === undefined || candidate === null) return { declared: false };
  if (!candidate || typeof candidate !== 'object') return { declared: true };
  const value = candidate as Record<string, unknown>;
  const sha256 = /^[a-f0-9]{64}$/;
  if (
    value['version'] !== 1
    || typeof value['node_path'] !== 'string'
    || value['node_path'].length === 0
    || typeof value['node_sha256'] !== 'string'
    || !sha256.test(value['node_sha256'])
    || typeof value['cli_path'] !== 'string'
    || value['cli_path'].length === 0
    || typeof value['cli_sha256'] !== 'string'
    || !sha256.test(value['cli_sha256'])
  ) {
    return { declared: true };
  }
  return {
    declared: true,
    binding: {
      version: 1,
      node_path: value['node_path'],
      node_sha256: value['node_sha256'],
      cli_path: value['cli_path'],
      cli_sha256: value['cli_sha256'],
    },
  };
}

function runtimeProbeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_PATH: '', NO_COLOR: '1' };
  for (const key of [
    'PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec',
    'PATHEXT', 'TEMP', 'TMP',
  ]) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function probeInstalledHandler(
  handlerPath: string,
  nodePath: string | undefined,
  timeoutMs: number,
): Promise<{ ok: boolean; output: string }> {
  const handlerUrl = pathToFileURL(handlerPath).href;
  const script = [
    `const loaded = await import(${JSON.stringify(handlerUrl)});`,
    `if (typeof loaded.default !== 'function') throw new Error('installed handler default export is not a function');`,
    `await loaded.default({ type: 'noop', action: 'noop' });`,
  ].join('\n');
  const child = spawn(nodePath ?? process.execPath, ['--input-type=module', '--eval', script], {
    cwd: dirname(handlerPath),
    env: runtimeProbeEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return waitForProbe(
    child,
    timeoutMs,
    'timed out runtime-loading installed handler',
    'default export loaded and handled a noop event',
    500,
  );
}

export async function verify(opts: VerifyOptions = {}): Promise<VerifyResult> {
  const log = opts.logger ?? createLogger({ name: 'openclaw-hooks/verify' });
  const paths = resolvePaths({
    ...(opts.home !== undefined ? { home: opts.home } : {}),
    ...(opts.handlerSourcePath !== undefined
      ? { handlerSourcePath: opts.handlerSourcePath }
      : { moduleUrl: import.meta.url }),
  });
  const checks: VerifyCheck[] = [];

  // 1. openclaw.json exists and parses.
  if (!existsSync(paths.configPath)) {
    checks.push({ name: 'openclaw.json exists', ok: false, detail: paths.configPath });
    return { ok: false, checks };
  }
  checks.push({ name: 'openclaw.json exists', ok: true, detail: paths.configPath });

  let parsed: Record<string, unknown>;
  try {
    parsed = parseConfig(await readFile(paths.configPath, 'utf-8'));
    checks.push({ name: 'openclaw.json parses as JSON/JSON5', ok: true });
  } catch (err) {
    checks.push({
      name: 'openclaw.json parses as JSON/JSON5',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, checks };
  }

  // 2. hive-mind internal-hooks entry present.
  checks.push({
    name: 'openclaw.json contains the hive-mind internal-hooks entry',
    ok: hasHiveEntries(parsed),
  });

  // 3. internal hooks subsystem enabled (hooks are OFF otherwise).
  const enabled = internalEnabled(parsed);
  checks.push({
    name: 'internal hooks subsystem enabled',
    ok: enabled,
    detail: enabled
      ? 'hooks.internal.enabled: true — the hive-mind hook is active.'
      : 'set hooks.internal.enabled: true (or run `openclaw hooks enable hive-mind`) — hooks are OFF until opted in.',
  });

  // 4. managed hook dir + HOOK.md + compiled handler exist on disk.
  checks.push({
    name: 'managed hook dir exists',
    ok: existsSync(paths.hiveHookDir),
    detail: paths.hiveHookDir,
  });
  checks.push({
    name: 'HOOK.md readable on disk',
    ok: await fileReadable(paths.hookMdPath),
    detail: paths.hookMdPath,
  });
  checks.push({
    name: 'handler.js readable on disk',
    ok: await fileReadable(paths.installedHandlerPath),
    detail: paths.installedHandlerPath,
  });
  const installedBundlePath = join(paths.hiveHookDir, OPENCLAW_HANDLER_BUNDLE);
  const installedPackagePath = join(paths.hiveHookDir, 'package.json');
  checks.push({
    name: 'handler.cjs readable on disk',
    ok: await fileReadable(installedBundlePath),
    detail: installedBundlePath,
  });
  const [installedBundleHash, trustedBundleHash] = await Promise.all([
    sha256File(installedBundlePath),
    sha256File(paths.handlerSourcePath),
  ]);
  const bundleTrusted = installedBundleHash !== undefined
    && trustedBundleHash !== undefined
    && installedBundleHash === trustedBundleHash;
  checks.push({
    name: 'handler.cjs matches trusted bundle',
    ok: bundleTrusted,
    detail: bundleTrusted
      ? `sha256 ${installedBundleHash}`
      : `installed=${installedBundleHash ?? 'unreadable'} trusted=${trustedBundleHash ?? 'unreadable'}`,
  });
  let pointerObj: Record<string, unknown> | undefined;
  let cliPathFromPointer: string | undefined;
  if (existsSync(paths.pointerPath)) {
    try {
      pointerObj = JSON.parse(await readFile(paths.pointerPath, 'utf-8')) as Record<string, unknown>;
      const pointerCliPath = pointerObj['cli_path'];
      if (typeof pointerCliPath === 'string' && pointerCliPath.length > 0) {
        cliPathFromPointer = pointerCliPath;
      }
    } catch { /* pointer unreadable — fail the trust comparison below */ }
  }
  const cliPathFromConfig = configuredCliPath(parsed);
  const nodePathFromConfig = configuredNodePath(parsed);
  const runtimeBindingRead = runtimeBindingFromPointer(pointerObj);
  const runtimeBinding = runtimeBindingRead.binding;
  const launcherNodePath = opts.nodePath
    ?? process.env.WAGGLE_HOOK_NODE_PATH
    ?? process.execPath;
  const runtimeBindingRequired = runtimeBindingRead.declared
    || nodePathFromConfig !== undefined
    || opts.nodePath !== undefined
    || process.env.WAGGLE_HOOK_NODE_PATH !== undefined;
  const runtimePathsAgree = !runtimeBindingRequired || (
    runtimeBinding !== undefined
    && runtimeBinding.cli_path === cliPathFromPointer
    && runtimeBinding.cli_path === cliPathFromConfig
    && runtimeBinding.node_path === nodePathFromConfig
    && runtimeBinding.node_path === launcherNodePath
  );
  checks.push({
    name: 'pinned Node runtime matches verifier runtime',
    ok: runtimePathsAgree,
    detail: runtimeBindingRequired
      ? `binding=${runtimeBinding?.node_path ?? '(invalid)'} config=${nodePathFromConfig ?? '(none)'} verifier=${launcherNodePath}`
      : 'legacy install without a packaged runtime binding',
  });
  const [currentNodeHash, currentCliHash] = runtimeBinding === undefined
    ? [undefined, undefined]
    : await Promise.all([
        sha256File(runtimeBinding.node_path),
        sha256File(runtimeBinding.cli_path),
      ]);
  const nodeHashTrusted = !runtimeBindingRequired || (
    runtimeBinding !== undefined
    && currentNodeHash !== undefined
    && currentNodeHash === runtimeBinding.node_sha256
  );
  const cliHashTrusted = !runtimeBindingRequired || (
    runtimeBinding !== undefined
    && currentCliHash !== undefined
    && currentCliHash === runtimeBinding.cli_sha256
  );
  checks.push({
    name: 'pinned Node runtime matches install hash',
    ok: nodeHashTrusted,
    detail: runtimeBindingRequired
      ? `installed=${runtimeBinding?.node_sha256 ?? '(invalid)'} current=${currentNodeHash ?? '(unreadable)'}`
      : 'legacy install without a packaged runtime binding',
  });
  checks.push({
    name: 'pinned CLI matches install hash',
    ok: cliHashTrusted,
    detail: runtimeBindingRequired
      ? `installed=${runtimeBinding?.cli_sha256 ?? '(invalid)'} current=${currentCliHash ?? '(unreadable)'}`
      : 'legacy install without a packaged runtime binding',
  });
  const runtimeBindingTrusted = runtimePathsAgree && nodeHashTrusted && cliHashTrusted;
  const pointerCliPathTrusted = cliPathFromPointer === cliPathFromConfig
    && (!runtimeBindingRequired || runtimeBinding?.cli_path === cliPathFromPointer);
  checks.push({
    name: 'install pointer cli_path matches managed config',
    ok: pointerCliPathTrusted,
    detail: pointerCliPathTrusted
      ? cliPathFromPointer ?? 'no pinned CLI path'
      : `pointer=${cliPathFromPointer ?? '(none)'} config=${cliPathFromConfig ?? '(none)'}`,
  });
  const trustedPointerCliPath = pointerCliPathTrusted && runtimeBindingTrusted
    ? cliPathFromPointer
    : undefined;
  const trustedNodePath = runtimeBindingRequired && runtimeBindingTrusted
    ? runtimeBinding?.node_path
    : undefined;

  const entryTrusted = await fileHasExactText(
    paths.installedHandlerPath,
    renderOpenclawHandlerEntrySource(trustedPointerCliPath, trustedNodePath),
  );
  checks.push({
    name: 'handler.js matches managed loader',
    ok: entryTrusted,
  });
  const packageTrusted = await fileHasExactText(
    installedPackagePath,
    OPENCLAW_HANDLER_PACKAGE_JSON,
  );
  checks.push({
    name: 'hook package locks CommonJS mode',
    ok: packageTrusted,
    detail: installedPackagePath,
  });
  const artifactsTrusted = bundleTrusted
    && entryTrusted
    && packageTrusted
    && runtimeBindingTrusted;
  const handlerProbe = artifactsTrusted
    ? await probeInstalledHandler(paths.installedHandlerPath, trustedNodePath, 4000)
    : { ok: false, output: 'skipped: installed handler artifacts do not match trusted bytes' };
  checks.push({
    name: 'installed handler runtime-loads',
    ok: handlerProbe.ok,
    detail: handlerProbe.output,
  });

  // 5. hive-mind-cli responds to --help (prefer the trusted install pin).
  const cliPath = trustedPointerCliPath ?? 'hive-mind-cli';
  const spawnImpl = opts.spawnImpl ?? spawn;
  const probe = runtimeBindingRequired && !runtimeBindingTrusted
    ? { ok: false, output: 'skipped: packaged Node/CLI runtime binding is not trusted' }
    : await probeCliVersion(
        cliPath,
        trustedNodePath,
        spawnImpl,
        opts.cliProbeTimeoutMs ?? 4000,
      );
  checks.push({
    name: 'hive-mind-cli reachable',
    ok: probe.ok,
    detail: trustedPointerCliPath ? `${probe.output} (pinned: ${cliPath})` : probe.output,
  });

  const ok = checks.every((c) => c.ok);
  log.info('verify complete', { ok, total: checks.length, failed: checks.filter((c) => !c.ok).length });
  return { ok, checks };
}

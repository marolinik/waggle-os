/**
 * Programmatic install entry point for the OpenClaw hive-mind hooks.
 *
 * OpenClaw hooks are IN-PROCESS, so install is structurally different from the
 * stdin-JSON tools: we WRITE A MANAGED HOOK DIRECTORY and only minimally touch
 * the JSON5 config.
 *
 * Steps:
 *   1. Read existing `~/.openclaw/openclaw.json` IF it exists (create-if-missing
 *      — the config is OPTIONAL on a fresh install). Strict JSON first, JSON5
 *      fallback.
 *   2. If it pre-existed, write a LITERAL byte-identical backup; if absent,
 *      skip the backup and record `created_by_us=true`. (JSON5 round-trip is
 *      lossy — comments / trailing commas are dropped — so reversibility relies
 *      on the literal backup, not a re-serialized diff.)
 *   3. Write the managed hook DIRECTORY
 *      `~/.openclaw/hooks/hive-mind/{HOOK.md, handler.js, handler.cjs,
 *      package.json}`. The discoverable handler.js loads the self-contained
 *      CommonJS bundle from handler.cjs under a hook-local module boundary.
 *   4. Minimal-touch edit of openclaw.json: flip `hooks.internal.enabled=true`
 *      + add `hooks.internal.entries["hive-mind"]={enabled:true, env?}` via
 *      `jsonRegister`. Existing config preserved verbatim.
 *   5. Write the merged config back over openclaw.json.
 *   6. Drop a pointer at `~/.openclaw/hive-mind-install.json` recording the
 *      created dir + touched keys (pointer.extra) so uninstall removes exactly
 *      what we added (and restores openclaw.json from the byte-identical
 *      backup, or removes it if we created it).
 */

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import {
  backupByteIdentical,
  normalizeCliPath,
  writePointer,
  type InstallPointer,
} from '@waggle/hive-mind-hooks-core';
import {
  resolvePaths,
  HIVE_HOOK_DIR_NAME,
  HIVE_HOOK_ENTRY_KEY,
  type OpenclawPaths,
  type ResolvePathsOptions,
} from './paths.js';
import { parseConfig, serializeConfig, jsonRegister } from './json5-merger.js';
import { renderHookMd } from './hook-md.js';

export interface InstallResult {
  paths: OpenclawPaths;
  /** The literal byte-identical backup written when openclaw.json pre-existed, else null. */
  backupPath: string | null;
  pointerPath: string;
  /** The managed hook dir we created (`~/.openclaw/hooks/hive-mind/`). */
  hookDir: string;
  /** Lifecycle names the single handler dispatches. */
  installedHooks: readonly string[];
  /** openclaw.json keys we touched (recorded in pointer.extra). */
  touchedKeys: readonly string[];
  /** True when openclaw.json did NOT pre-exist and we created it. */
  createdByUs: boolean;
  /** The cli_path embedded in the entry env (undefined = default lookup at runtime). */
  cliPath?: string;
}

export interface InstallOptions extends ResolvePathsOptions {
  /** Override clock for deterministic tests. */
  now?: () => Date;
  /** Logger override. */
  logger?: Logger;
  /**
   * Absolute path to the hive-mind-cli binary or its compiled JS entry.
   * Required on Windows (npm bin shim is `.cmd` and can't be exec'd without a
   * shell). Threaded into the hook entry env as `WAGGLE_HIVE_MIND_CLI` so the
   * in-process handler's CliBridge uses it.
   */
  cliPath?: string;
  /** Extra env to attach to the hook entry (e.g. WAGGLE_WORKSPACE_ID). */
  env?: Record<string, string>;
}

const POINTER_VERSION = '0.1.0';
const TOUCHED_KEYS = ['hooks.internal.enabled', `hooks.internal.entries.${HIVE_HOOK_ENTRY_KEY}`] as const;
const LIFECYCLE_NAMES = ['session-start', 'user-prompt-submit', 'stop', 'pre-compact'] as const;
export const OPENCLAW_HANDLER_BUNDLE = 'handler.cjs';

const OPENCLAW_HANDLER_ENTRY = 'handler.js';
export const OPENCLAW_HANDLER_ENTRY_SOURCE = `'use strict';\nmodule.exports = require('./${OPENCLAW_HANDLER_BUNDLE}');\n`;
export const OPENCLAW_HANDLER_PACKAGE_JSON = `${JSON.stringify({ private: true, type: 'commonjs' }, null, 2)}\n`;

async function ensureDir(p: string): Promise<void> {
  if (!existsSync(p)) await mkdir(p, { recursive: true });
}

export async function install(opts: InstallOptions = {}): Promise<InstallResult> {
  const log = opts.logger ?? createLogger({ name: 'openclaw-hooks/install' });
  const paths = resolvePaths({
    ...(opts.home !== undefined ? { home: opts.home } : {}),
    ...(opts.handlerSourcePath !== undefined
      ? { handlerSourcePath: opts.handlerSourcePath }
      : { moduleUrl: import.meta.url }),
  });
  const now = opts.now ?? ((): Date => new Date());

  log.info('install starting', { config: paths.configPath, hookDir: paths.hiveHookDir });

  // Read existing config if present; create-if-missing otherwise.
  let existingConfig: Record<string, unknown> | undefined;
  const preExisted = existsSync(paths.configPath);
  if (preExisted) {
    existingConfig = parseConfig(await readFile(paths.configPath, 'utf-8'));
  }

  await ensureDir(paths.openclawDir);
  await ensureDir(dirname(paths.pointerPath));

  // Literal byte-identical backup of the original config (no-op when absent).
  const { backupPath } = await backupByteIdentical(paths.configPath, now().toISOString());
  if (backupPath) log.info('openclaw.json backed up', { backupPath });

  // Copy the self-contained bundle so the gateway remains independent of this
  // package after installation.
  await ensureDir(paths.hiveHookDir);
  await writeFile(paths.hookMdPath, renderHookMd(OPENCLAW_HANDLER_ENTRY), 'utf-8');
  if (!existsSync(paths.handlerSourcePath)) {
    throw new Error(
      `compiled handler not found at ${paths.handlerSourcePath}. ` +
      `Build the package (tsc --build) before installing.`,
    );
  }
  // OpenClaw discovers handler.js by filename. Keep that entry deterministic
  // CommonJS while retaining the self-contained bundle's .cjs identity; the
  // hook-local package.json overrides any ancestor `type: module` boundary.
  await copyFile(paths.handlerSourcePath, join(paths.hiveHookDir, OPENCLAW_HANDLER_BUNDLE));
  await writeFile(paths.installedHandlerPath, OPENCLAW_HANDLER_ENTRY_SOURCE, 'utf-8');
  await writeFile(join(paths.hiveHookDir, 'package.json'), OPENCLAW_HANDLER_PACKAGE_JSON, 'utf-8');

  // Minimal-touch config edit.
  const cliPath = normalizeCliPath(opts.cliPath);
  const env: Record<string, string> = { ...(opts.env ?? {}) };
  if (cliPath !== undefined) env['WAGGLE_HIVE_MIND_CLI'] = cliPath;
  const merged = jsonRegister(existingConfig, Object.keys(env).length > 0 ? { env } : {});
  await writeFile(paths.configPath, serializeConfig(merged), 'utf-8');

  const createdByUs = !preExisted;
  const pointer: InstallPointer = {
    version: POINTER_VERSION,
    installed_at: now().toISOString(),
    config_path: paths.configPath,
    settings_backup: backupPath,
    created_by_us: createdByUs,
    hooks_dir: paths.hiveHookDir,
    installed_hooks: LIFECYCLE_NAMES,
    cli_path: cliPath ?? null,
    extra: {
      hook_dir_name: HIVE_HOOK_DIR_NAME,
      touched_keys: TOUCHED_KEYS,
    },
  };
  await writePointer(paths.pointerPath, pointer);

  log.info('install complete', { createdByUs, hookDir: paths.hiveHookDir, cliPath: cliPath ?? '(PATH lookup)' });

  const result: InstallResult = {
    paths,
    backupPath,
    pointerPath: paths.pointerPath,
    hookDir: paths.hiveHookDir,
    installedHooks: LIFECYCLE_NAMES,
    touchedKeys: TOUCHED_KEYS,
    createdByUs,
  };
  if (cliPath !== undefined) result.cliPath = cliPath;
  return result;
}

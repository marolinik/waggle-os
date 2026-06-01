/**
 * Programmatic install entry point for the Hermes hive-mind hooks.
 *
 * Steps:
 *   1. Read existing `~/.hermes/config.yaml` IF it exists (create-if-missing
 *      — config.yaml is OPTIONAL on a fresh install). We touch ONLY the
 *      top-level `hooks:` block (the SHELL-HOOKS system).
 *   2. If it pre-existed, write a LITERAL byte-identical backup; if absent,
 *      skip the backup and record `created_by_us=true`. (YAML round-trip is
 *      lossy, so reversibility relies on the literal backup, not a
 *      re-serialized diff.)
 *   3. Additively register the hive-mind shell hooks into the `hooks:`
 *      block via `yamlRegister`. SessionStart is SPLIT across two native
 *      events: `on_session_start` (observer) and `pre_llm_call` (inject,
 *      gated `is_first_turn`). UserPromptSubmit also rides `pre_llm_call`;
 *      Stop rides `post_llm_call`. Existing entries preserved verbatim.
 *   4. Optionally seed `hooks_auto_accept: true` so the hooks register under
 *      headless / non-TTY launches (Hermes's first-use consent allow-list
 *      otherwise silently never registers them).
 *   5. Write the merged YAML back over `config.yaml`.
 *   6. Drop a pointer file at `~/.hermes/hive-mind-install.json` so a future
 *      `uninstall` knows whether to restore the backup or delete the file
 *      we created.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import {
  backupByteIdentical,
  hookCommandFor,
  hookScriptPath,
  normalizeCliPath,
  writePointer,
  type InstallPointer,
} from '@waggle/hive-mind-hooks-core';
import { resolvePaths, type HermesPaths, type ResolvePathsOptions } from './paths.js';
import {
  parseConfig,
  serializeConfig,
  yamlRegister,
  type HermesRegisterEntry,
} from './yaml-merger.js';
import { HERMES_SESSION_START_OBSERVE_EVENT } from './adapter.js';

export interface InstallResult {
  paths: HermesPaths;
  /** The literal byte-identical backup written when config.yaml pre-existed, else null. */
  backupPath: string | null;
  pointerPath: string;
  /** Hook basenames whose scripts are referenced (session-start / user-prompt-submit / stop). */
  installedHooks: readonly string[];
  /** Native Hermes event keys we registered entries under (recorded in pointer.extra). */
  registeredEvents: readonly string[];
  /** True when config.yaml did NOT pre-exist and we created it. */
  createdByUs: boolean;
  /** True when `hooks_auto_accept: true` was seeded into the config. */
  autoAcceptSeeded: boolean;
  /** The cli_path embedded in hook commands (undefined = default lookup at runtime). */
  cliPath?: string;
}

export interface InstallOptions extends ResolvePathsOptions {
  /** Per-hook timeout, seconds. Default 60 (Hermes default), hard cap 300. */
  hookTimeoutSeconds?: number;
  /**
   * Seed `hooks_auto_accept: true` into config.yaml so the hooks register
   * under headless / non-TTY launches. Default true — without it (or
   * `HERMES_ACCEPT_HOOKS=1`) the hooks silently never register. Set false
   * to manage consent yourself.
   */
  autoAccept?: boolean;
  /** Override clock for deterministic tests. */
  now?: () => Date;
  /** Logger override. */
  logger?: Logger;
  /**
   * Absolute path to the hive-mind-cli binary or its compiled JS entry.
   * Required on Windows (npm bin shim is `.cmd` and can't be exec'd
   * without a shell). Threaded into every hook command as
   * `--cli-path "<path>"`.
   */
  cliPath?: string;
}

const DEFAULT_HOOK_TIMEOUT_S = 60;
const HOOK_TIMEOUT_CAP_S = 300;
const POINTER_VERSION = '0.1.0';

async function ensureDir(p: string): Promise<void> {
  if (!existsSync(p)) await mkdir(p, { recursive: true });
}

/**
 * Build the hermes register entries from the resolved hook script paths.
 * SessionStart is SPLIT: the session-start script registers under BOTH
 * `on_session_start` (observer) and `pre_llm_call` (inject). The
 * user-prompt-submit script also rides `pre_llm_call`; stop rides
 * `post_llm_call`.
 */
function buildEntries(hooksDir: string, cliPath: string | undefined, timeout: number): HermesRegisterEntry[] {
  const sessionStartCmd = hookCommandFor(hookScriptPath(hooksDir, 'session-start'), cliPath);
  const userPromptCmd = hookCommandFor(hookScriptPath(hooksDir, 'user-prompt-submit'), cliPath);
  const stopCmd = hookCommandFor(hookScriptPath(hooksDir, 'stop'), cliPath);

  return [
    // SessionStart observer side — fires once per new session.
    { eventKey: HERMES_SESSION_START_OBSERVE_EVENT, command: sessionStartCmd, timeout },
    // SessionStart inject side — fires on pre_llm_call, gated is_first_turn.
    { eventKey: 'pre_llm_call', command: sessionStartCmd, timeout },
    // UserPromptSubmit — also rides pre_llm_call (every turn).
    { eventKey: 'pre_llm_call', command: userPromptCmd, timeout },
    // Stop — post_llm_call (turn end).
    { eventKey: 'post_llm_call', command: stopCmd, timeout },
  ];
}

export async function install(opts: InstallOptions = {}): Promise<InstallResult> {
  const log = opts.logger ?? createLogger({ name: 'hermes-hooks/install' });
  const paths = resolvePaths({
    ...(opts.home !== undefined ? { home: opts.home } : {}),
    ...(opts.hooksDir !== undefined ? { hooksDir: opts.hooksDir } : { moduleUrl: import.meta.url }),
  });
  const now = opts.now ?? ((): Date => new Date());
  const autoAccept = opts.autoAccept ?? true;

  log.info('install starting', { config: paths.configPath, hooksDir: paths.hooksDir });

  // Read the existing config if present; create-if-missing otherwise.
  let existingConfig: Record<string, unknown> | undefined;
  const preExisted = existsSync(paths.configPath);
  if (preExisted) {
    const originalContent = await readFile(paths.configPath, 'utf-8');
    existingConfig = parseConfig(originalContent);
  }

  await ensureDir(dirname(paths.pointerPath));

  // Literal byte-identical backup of the original config (no-op when absent).
  // Uninstall restores THESE exact bytes — YAML re-serialization is lossy.
  const { backupPath, preExisted: backedUp } = await backupByteIdentical(
    paths.configPath,
    now().toISOString(),
  );
  if (backedUp) log.info('config.yaml backed up', { backupPath });

  const cliPath = normalizeCliPath(opts.cliPath);
  const requested = opts.hookTimeoutSeconds ?? DEFAULT_HOOK_TIMEOUT_S;
  const timeout = Math.min(Math.max(1, Math.floor(requested)), HOOK_TIMEOUT_CAP_S);
  const entries = buildEntries(paths.hooksDir, cliPath, timeout);

  let merged = yamlRegister(existingConfig, entries);
  let autoAcceptSeeded = false;
  if (autoAccept && merged['hooks_auto_accept'] !== true) {
    merged = { ...merged, hooks_auto_accept: true };
    autoAcceptSeeded = true;
  }

  const mergedYaml = serializeConfig(merged);
  await writeFile(paths.configPath, mergedYaml, 'utf-8');

  const registeredEvents = [...new Set(entries.map((e) => e.eventKey))];
  const basenames = ['session-start', 'user-prompt-submit', 'stop'] as const;
  const createdByUs = !preExisted;
  const pointer: InstallPointer = {
    version: POINTER_VERSION,
    installed_at: now().toISOString(),
    config_path: paths.configPath,
    settings_backup: backupPath,
    created_by_us: createdByUs,
    hooks_dir: paths.hooksDir,
    installed_hooks: basenames,
    cli_path: cliPath ?? null,
    extra: {
      registered_events: registeredEvents,
      auto_accept_seeded: autoAcceptSeeded,
    },
  };
  await writePointer(paths.pointerPath, pointer);

  log.info('install complete', {
    registeredEvents,
    createdByUs,
    autoAcceptSeeded,
    cliPath: cliPath ?? '(PATH lookup)',
  });

  const result: InstallResult = {
    paths,
    backupPath,
    pointerPath: paths.pointerPath,
    installedHooks: basenames,
    registeredEvents,
    createdByUs,
    autoAcceptSeeded,
  };
  if (cliPath !== undefined) result.cliPath = cliPath;
  return result;
}

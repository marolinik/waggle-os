/**
 * Tool-agnostic filesystem path helpers shared by every hook port.
 *
 * Mirrors the frozen Wave 1 claude-code `paths.ts` idioms (Windows-safe
 * backup paths + `--cli-path` quoting) but parameterized so each tool
 * package can plug in its own config root, pointer name, and hook script
 * basenames.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/**
 * Filesystem-safe backup path for a config file at `configPath`.
 * Mirrors claude-code paths.ts:86 — replaces `:` and `.` in the ISO
 * timestamp with `-` so the filename is valid on Windows.
 */
export function backupPathFor(configPath: string, isoTimestamp: string): string {
  const stamp = isoTimestamp.replace(/[:.]/g, '-');
  return `${configPath}.hive-mind-backup.${stamp}`;
}

/**
 * Build the host-tool hook command string for a compiled hook script.
 * Mirrors claude-code paths.ts:74-84 — quotes paths so spaces in the
 * user's home dir (Windows: "C:\Users\Marko Markovic\") don't fragment
 * the command, and routes through `node` so `.js` scripts run
 * cross-platform without a shell launching an npm `.cmd` bin shim.
 *
 * @param scriptPath absolute path to the compiled `dist/hooks/<event>.js`.
 * @param cliPath    optional install-time-pinned hive-mind-cli path,
 *                   threaded as `--cli-path "<value>"`.
 */
export function hookCommandFor(scriptPath: string, cliPath?: string): string {
  const cliFlag = cliPath && cliPath.length > 0 ? ` --cli-path "${cliPath}"` : '';
  return `${hookNodeCommand()} "${scriptPath}"${cliFlag}`;
}

function hookNodeCommand(): string {
  const configured = process.env.WAGGLE_HOOK_NODE_PATH?.trim();
  if (!configured) return 'node';
  if (configured.includes('"')) throw new Error('WAGGLE_HOOK_NODE_PATH cannot contain double quotes');
  return `"${configured}"`;
}

/**
 * Reject `--cli-path` values containing embedded double-quotes — they
 * would break the `--cli-path "<value>"` quoting in the generated hook
 * command. Lifted verbatim from claude-code install.ts:142-154.
 *
 * Returns undefined for undefined / empty / whitespace-only input.
 * Throws on a double-quote so the caller fails loudly at install time.
 */
export function normalizeCliPath(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  const trimmed = input.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.includes('"')) {
    throw new Error(
      `--cli-path value must not contain double-quote characters; got: ${trimmed.slice(0, 80)}`,
    );
  }
  return trimmed;
}

/**
 * Resolve a package's compiled `dist/hooks/` directory from the caller's
 * `import.meta.url`. The compiled install module lives at
 * `<pkg>/dist/<file>.js`; dirname gives `<pkg>/dist/`, join gives
 * `<pkg>/dist/hooks/`. Resolved once more so the path is absolute and
 * platform-normalized.
 */
export function hooksDirFromModuleUrl(moduleUrl: string): string {
  const dir = dirname(fileURLToPath(moduleUrl));
  return resolve(dir, 'hooks');
}

/** Absolute path to a compiled hook script `<hooksDir>/<basename>.js`. */
export function hookScriptPath(hooksDir: string, basename: string): string {
  return join(hooksDir, `${basename}.js`);
}

#!/usr/bin/env node
/**
 * `codex-desktop-hooks` — CLI entry for the @waggle/hive-mind-hooks-codex-desktop shim.
 *
 *   codex-desktop-hooks install     Patch ~/.codex/hooks.json (additive, create-if-missing).
 *   codex-desktop-hooks uninstall   Restore the byte-identical pre-install state (or remove
 *                                   the hooks.json we created).
 *   codex-desktop-hooks verify      Smoke-check the install + hive-mind-cli reachability.
 *
 * Codex Desktop shares the same `~/.codex/` config root as the Codex CLI, so
 * this delegates to the codex installer (`@waggle/hive-mind-hooks-codex`) and
 * behaves IDENTICALLY to `codex-hooks` — same `~/.codex/hooks.json`, same
 * pointer (`~/.codex/hive-mind-install.json`), same compiled hook scripts (the
 * codex package's `dist/hooks/`, resolved by the codex installer's own module
 * URL).
 */

import {
  install,
  uninstall,
  verify,
  type InstallResult,
  type UninstallResult,
  type VerifyResult,
} from '@waggle/hive-mind-hooks-codex';

type ParsedArgs = {
  command: 'install' | 'uninstall' | 'verify' | 'help';
  flags: Record<string, string | boolean>;
};

function parseArgs(argv: readonly string[]): ParsedArgs {
  const [first, ...rest] = argv;
  const valid = ['install', 'uninstall', 'verify'] as const;
  const command = first === '-h' || first === '--help' || first === undefined
    ? 'help'
    : valid.includes(first as typeof valid[number]) ? first as typeof valid[number] : 'help';

  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const next = rest[i + 1];
      if (next && !next.startsWith('--')) {
        flags[arg.slice(2)] = next;
        i += 1;
      } else {
        flags[arg.slice(2)] = true;
      }
    }
  }
  return { command: command as ParsedArgs['command'], flags };
}

function printHelp(): void {
  process.stdout.write([
    'Usage: codex-desktop-hooks <command> [options]',
    '',
    'Codex Desktop shares ~/.codex/ with the Codex CLI; this delegates to',
    'the @waggle/hive-mind-hooks-codex installer and behaves identically.',
    '',
    'Commands:',
    '  install     Patch ~/.codex/hooks.json (additive, create-if-missing, with backup).',
    '  uninstall   Restore the byte-identical pre-install hooks.json (or remove it if created).',
    '  verify      Smoke-check the install + hive-mind-cli reachability.',
    '',
    'Options:',
    '  --help, -h           Show this help.',
    '  --hooks-dir <PATH>   Override compiled hooks directory (testing).',
    '  --hook-timeout <S>   Override per-hook timeout in seconds (default 5).',
    '  --cli-path <PATH>    Absolute path to the hive-mind-cli binary or its',
    '                       compiled JS entry. Required on Windows (npm bin',
    '                       is a .cmd shim) and recommended for production',
    '                       installs. Threaded into every hook command.',
    '',
    'Repo: https://github.com/marolinik/waggle-os',
    '',
  ].join('\n'));
}

function printInstallSummary(result: InstallResult): void {
  const lines: string[] = [
    'hive-mind/codex-desktop-hooks: install',
    `  - hooks.json:  ${result.paths.configPath}`,
    `  - backup:      ${result.backupPath ?? '(none — hooks.json created by us)'}`,
    `  - pointer:     ${result.pointerPath}`,
    `  - added hooks: ${result.installedHooks.join(', ')}`,
    `  - cli path:    ${result.cliPath ?? '(default — hive-mind-cli on PATH)'}`,
    '',
    'Shared config root:',
    '  Codex Desktop honors the same ~/.codex/hooks.json as the Codex CLI.',
    '',
    'One-time trust step required:',
    '  Run `/hooks` in Codex once to trust the hive-mind hooks before they execute.',
    '',
    'Note: the Codex CLI definitely fires these hooks. The desktop App honoring',
    'hooks is doc-asserted and still needs runtime verification on a real App',
    'install.',
    '',
    'Done. New Codex sessions will silently capture to hive-mind.',
    'Run "codex-desktop-hooks verify" to inspect, "codex-desktop-hooks uninstall" to revert.',
    '',
  ];
  process.stdout.write(lines.join('\n'));
}

function printUninstallSummary(result: UninstallResult): void {
  const lines: string[] = [
    'hive-mind/codex-desktop-hooks: uninstall',
    `  - hooks.json:      ${result.paths.configPath}`,
    `  - restored from:   ${result.restoredFrom ?? '(none — removed file we created)'}`,
    `  - created removed: ${result.createdRemoved ? 'yes' : 'no'}`,
    `  - backup removed:  ${result.backupRemoved ? 'yes' : 'no (kept on disk)'}`,
    `  - pointer removed: ${result.pointerRemoved ? 'yes' : 'no'}`,
    '',
    'Done. hooks.json is byte-identical to pre-install state (or removed if we created it).',
    '',
  ];
  process.stdout.write(lines.join('\n'));
}

function printVerifySummary(result: VerifyResult): void {
  const lines: string[] = ['hive-mind/codex-desktop-hooks: verify'];
  for (const c of result.checks) {
    const tag = c.ok ? 'PASS' : 'FAIL';
    const detail = c.detail ? ` — ${c.detail}` : '';
    lines.push(`  [${tag}] ${c.name}${detail}`);
  }
  lines.push('');
  lines.push(result.ok ? 'All checks passed.' : 'One or more checks failed.');
  lines.push('');
  process.stdout.write(lines.join('\n'));
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === 'help') {
    printHelp();
    return;
  }

  const hooksDir = typeof flags['hooks-dir'] === 'string' ? flags['hooks-dir'] : undefined;
  const hookTimeoutRaw = flags['hook-timeout'];
  const hookTimeoutSeconds = typeof hookTimeoutRaw === 'string'
    ? Number.parseInt(hookTimeoutRaw, 10) || undefined
    : undefined;
  const cliPath = typeof flags['cli-path'] === 'string' ? flags['cli-path'] : undefined;

  const baseOpts = {
    ...(hooksDir ? { hooksDir } : {}),
  };

  try {
    if (command === 'install') {
      const installOpts = {
        ...baseOpts,
        ...(hookTimeoutSeconds !== undefined ? { hookTimeoutSeconds } : {}),
        ...(cliPath !== undefined ? { cliPath } : {}),
      };
      const result = await install(installOpts);
      printInstallSummary(result);
      return;
    }
    if (command === 'uninstall') {
      const result = await uninstall(baseOpts);
      printUninstallSummary(result);
      return;
    }
    if (command === 'verify') {
      const result = await verify(baseOpts);
      printVerifySummary(result);
      if (!result.ok) process.exit(1);
      return;
    }
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

void main();

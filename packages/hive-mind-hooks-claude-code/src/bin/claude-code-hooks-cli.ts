#!/usr/bin/env node
/**
 * `claude-code-hooks``claude-code-hooks` — CLI entry for the @waggle/hive-mind-hooks-claude-code shim (was @hive-mind/claude-code-hooks pre-monorepo migration).
 *
 *   claude-code-hooks install       Patch ~/.claude/settings.json (additive merge).
 *   claude-code-hooks uninstall     Restore the byte-identical pre-install state.
 *   claude-code-hooks verify        Smoke-check the install + hive-mind-cli reachability.
 */

import { install, type InstallResult } from '../install.js';
import { uninstall, type UninstallResult } from '../uninstall.js';
import { verify, type VerifyResult } from '../verify.js';

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
    'Usage: claude-code-hooks <command> [options]',
    '',
    'Commands:',
    '  install     Patch ~/.claude/settings.json (additive, with backup).',
    '  uninstall   Restore the byte-identical pre-install settings.json.',
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
    'Repo: https://github.com/marolinik/hive-mind-clients',
    '',
  ].join('\n'));
}

function printInstallSummary(result: InstallResult): void {
  const lines: string[] = [
    'hive-mind/claude-code-hooks: install',
    `  - settings:    ${result.paths.settingsPath}`,
    `  - backup:      ${result.backupPath}`,
    `  - pointer:     ${result.pointerPath}`,
    `  - added hooks: ${result.installedHooks.join(', ')}`,
    `  - cli path:    ${result.cliPath ?? '(default — hive-mind-cli on PATH)'}`,
    '',
    'Done. New Claude Code sessions will silently capture to hive-mind.',
    'Run "claude-code-hooks verify" to inspect, "claude-code-hooks uninstall" to revert.',
    '',
  ];
  process.stdout.write(lines.join('\n'));
}

function printUninstallSummary(result: UninstallResult): void {
  const lines: string[] = [
    'hive-mind/claude-code-hooks: uninstall',
    `  - settings:        ${result.paths.settingsPath}`,
    `  - restored from:   ${result.restoredFrom}`,
    `  - backup removed:  ${result.backupRemoved ? 'yes' : 'no (kept on disk)'}`,
    `  - pointer removed: ${result.pointerRemoved ? 'yes' : 'no'}`,
    '',
    'Done. settings.json is byte-identical to pre-install state.',
    '',
  ];
  process.stdout.write(lines.join('\n'));
}

function printVerifySummary(result: VerifyResult): void {
  const lines: string[] = ['hive-mind/claude-code-hooks: verify'];
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
    moduleUrl: import.meta.url,
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

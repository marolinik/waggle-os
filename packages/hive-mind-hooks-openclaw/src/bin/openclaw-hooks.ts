#!/usr/bin/env node
/**
 * `openclaw-hooks` — CLI entry for the @waggle/hive-mind-hooks-openclaw shim.
 *
 *   openclaw-hooks install     Write the managed ~/.openclaw/hooks/hive-mind/ dir
 *                              + minimal-touch openclaw.json (create-if-missing).
 *   openclaw-hooks uninstall   Remove the managed dir + restore the literal
 *                              byte-identical openclaw.json (or remove it if created).
 *   openclaw-hooks verify      Smoke-check the install + hive-mind-cli reachability.
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
    'Usage: openclaw-hooks <command> [options]',
    '',
    'Commands:',
    '  install     Write ~/.openclaw/hooks/hive-mind/ + minimal-touch openclaw.json (create-if-missing).',
    '  uninstall   Remove the managed dir + restore the literal byte-identical openclaw.json (or remove it if created).',
    '  verify      Smoke-check the install + hive-mind-cli reachability.',
    '',
    'Options:',
    '  --help, -h           Show this help.',
    '  --handler-source <PATH>  Override compiled handler.js source (testing).',
    '  --cli-path <PATH>    Absolute path to the hive-mind-cli binary or its',
    '                       compiled JS entry. Required for managed install',
    '                       and verify. Verify treats it as the authoritative',
    '                       packaged CLI expectation.',
    '',
    'Repo: https://github.com/marolinik/waggle-os',
    '',
  ].join('\n'));
}

function printInstallSummary(result: InstallResult): void {
  const lines: string[] = [
    'hive-mind/openclaw-hooks: install',
    `  - openclaw.json: ${result.paths.configPath}`,
    `  - backup:        ${result.backupPath ?? '(none — openclaw.json created by us)'}`,
    `  - pointer:       ${result.pointerPath}`,
    `  - hook dir:      ${result.hookDir}`,
    `  - lifecycles:    ${result.installedHooks.join(', ')}`,
    `  - touched keys:  ${result.touchedKeys.join(', ')}`,
    `  - cli path:      ${result.cliPath ?? '(default — hive-mind-cli on PATH)'}`,
    '',
    'Activation (IMPORTANT):',
    '  Hooks are OFF until the internal-hooks subsystem is on. The installer set',
    '  hooks.internal.enabled: true. If it is not honored, run:',
    '    openclaw hooks enable hive-mind',
    '',
    'Capture fidelity:',
    '  4 events — SessionStart (agent:bootstrap, mutates bootstrapFiles),',
    '  UserPromptSubmit (message:received), Stop (message:sent — DEBOUNCED,',
    '  0..N/turn, non-replyable), PreCompact (compact:before). The installed',
    '  handler.js resolving @waggle/* on a real OpenClaw install is the one',
    '  remaining live-install validation. Gateway capture can double-count when',
    '  OpenClaw drives a backend (CC/codex) that also has hooks — see README.',
    '',
    'Done. New OpenClaw sessions will silently capture to hive-mind.',
    'Run "openclaw-hooks verify" to inspect, "openclaw-hooks uninstall" to revert.',
    '',
  ];
  process.stdout.write(lines.join('\n'));
}

function printUninstallSummary(result: UninstallResult): void {
  const lines: string[] = [
    'hive-mind/openclaw-hooks: uninstall',
    `  - openclaw.json:   ${result.paths.configPath}`,
    `  - hook dir removed: ${result.hookDirRemoved ? 'yes' : 'no (was absent)'}`,
    `  - restored from:   ${result.restoredFrom ?? '(none — removed file we created)'}`,
    `  - created removed: ${result.createdRemoved ? 'yes' : 'no'}`,
    `  - backup removed:  ${result.backupRemoved ? 'yes' : 'no (kept on disk)'}`,
    `  - pointer removed: ${result.pointerRemoved ? 'yes' : 'no'}`,
    '',
    'openclaw.json is byte-identical to pre-install state (or removed if we created it).',
    '',
  ];
  process.stdout.write(lines.join('\n'));
}

function printVerifySummary(result: VerifyResult): void {
  const lines: string[] = ['hive-mind/openclaw-hooks: verify'];
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

  const handlerSource = typeof flags['handler-source'] === 'string' ? flags['handler-source'] : undefined;
  const cliPath = typeof flags['cli-path'] === 'string' ? flags['cli-path'] : undefined;

  const baseOpts = {
    moduleUrl: import.meta.url,
    ...(handlerSource ? { handlerSourcePath: handlerSource } : {}),
  };

  try {
    if (command === 'install') {
      const installOpts = {
        ...baseOpts,
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
      const result = await verify({
        ...baseOpts,
        ...(cliPath !== undefined ? { cliPath } : {}),
        requireManagedRuntime: true,
      });
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

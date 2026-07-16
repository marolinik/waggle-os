#!/usr/bin/env node
/** CLI for the Claude Desktop waggle-memory MCP bridge. */

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
    'Usage: claude-desktop-hooks <command> [options]',
    '',
    'Commands:',
    '  install     Register waggle-memory in claude_desktop_config.json.',
    '  uninstall   Restore the original config or remove only waggle-memory.',
    '  verify      Check the config, MCP entry, and install pointer.',
    '',
    'Options:',
    '  --help, -h             Show this help.',
    '  --config-dir <PATH>    Override the Claude Desktop config directory.',
    '  --mcp-entry <PATH>     Override waggle-memory-mcp/dist/index.js.',
    '  --cli-path <PATH>      Accepted for hook-runtime contract parity; recorded',
    '                         in the pointer, not used by the MCP bridge.',
    '',
    'Repo: https://github.com/marolinik/waggle-os',
    '',
  ].join('\n'));
}

function printInstallSummary(result: InstallResult): void {
  process.stdout.write([
    'hive-mind/claude-desktop-hooks: install',
    `  - config:      ${result.paths.configPath}`,
    `  - backup:      ${result.backupPath ?? '(none — config created by us)'}`,
    `  - pointer:     ${result.pointerPath}`,
    `  - MCP server:  ${result.serverName}`,
    `  - MCP entry:   ${result.mcpEntry}`,
    '',
    'Restart Claude Desktop for the MCP server registration to take effect.',
    'Run "claude-desktop-hooks verify" to inspect, or uninstall to revert.',
    '',
  ].join('\n'));
}

function printUninstallSummary(result: UninstallResult): void {
  process.stdout.write([
    'hive-mind/claude-desktop-hooks: uninstall',
    `  - config:           ${result.paths.configPath}`,
    `  - restored from:    ${result.restoredFrom ?? '(none)'}`,
    `  - created removed:  ${result.createdRemoved ? 'yes' : 'no'}`,
    `  - backup removed:   ${result.backupRemoved ? 'yes' : 'no (kept on disk)'}`,
    `  - surgical removal: ${result.surgical ? 'yes' : 'no'}`,
    '',
    'Restart Claude Desktop for the change to take effect.',
    '',
  ].join('\n'));
}

function printVerifySummary(result: VerifyResult): void {
  const lines: string[] = ['hive-mind/claude-desktop-hooks: verify'];
  for (const check of result.checks) {
    const tag = check.ok ? 'PASS' : 'FAIL';
    const detail = check.detail ? ` — ${check.detail}` : '';
    lines.push(`  [${tag}] ${check.name}${detail}`);
  }
  lines.push('', result.ok ? 'All checks passed.' : 'One or more checks failed.', '');
  process.stdout.write(lines.join('\n'));
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === 'help') {
    printHelp();
    return;
  }

  const configDir = typeof flags['config-dir'] === 'string' ? flags['config-dir'] : undefined;
  const mcpEntry = typeof flags['mcp-entry'] === 'string' ? flags['mcp-entry'] : undefined;
  const cliPath = typeof flags['cli-path'] === 'string' ? flags['cli-path'] : undefined;
  const baseOpts = {
    ...(configDir !== undefined ? { configDir } : {}),
  };

  try {
    if (command === 'install') {
      const result = await install({
        ...baseOpts,
        ...(mcpEntry !== undefined ? { mcpEntry } : {}),
        ...(cliPath !== undefined ? { cliPath } : {}),
      });
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

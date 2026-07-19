#!/usr/bin/env node

/**
 * hive-mind-cli — command-line tools for the hive-mind memory system.
 *
 * Subcommands:
 *   init                           Scaffold data dir + personal.mind (idempotent)
 *   status                         Show frame/entity counts + last activity
 *   mcp start                      Run the MCP server in the foreground
 *   mcp call <tool> [--args JSON]  Invoke one MCP tool + print the result
 *   dance send/receive              Exchange messages in the active Waggle Room
 *   recall-context "<query>"       Query the personal mind and print hits
 *   save-session [--file P]        Persist stdin or --file as a memory frame
 *   harvest-local --source S --path P  Import conversations from disk
 *   cognify [--since N] [--limit N]    Heuristic KG entity extraction
 *   compile-wiki [--mode full]     Build/refresh the personal wiki
 *   maintenance --compact --reconcile --cognify --wiki --wipe-imports
 *                                  Batch ops for a nightly cron
 *
 * Flags common to all subcommands:
 *   --data-dir P   Override HIVE_MIND_DATA_DIR
 *   --json         Emit machine-readable JSON rather than human text
 */

import { parseArgs } from 'node:util';
import type { DispatchArgs } from './dispatch.js';

const HELP_FLAGS = new Set(['--help', '-h']);

function requestedHelpTarget(argv: string[]): string | null | undefined {
  const [first, second] = argv;
  if (!first || HELP_FLAGS.has(first)) return null;
  if (!argv.some((arg) => HELP_FLAGS.has(arg))) return undefined;
  if ((first === 'mcp' && (second === 'start' || second === 'call')) ||
      (first === 'dance' && (second === 'send' || second === 'receive'))) {
    return `${first} ${second}`;
  }
  return first;
}

function parseRootArgs(argv: string[]): DispatchArgs | null {
  // Split "subcommand" out before parseArgs so the subcommand name does
  // not collide with `--` flags. Two-word subcommands `mcp start` and
  // `mcp call <tool>` collapse to `mcp-start` / `mcp-call` so dispatch
  // can route with a single switch.
  const [first, ...rest] = argv;
  if (!first || first === '--help' || first === '-h') {
    return null;
  }

  let subcommand = first;
  let afterSubcommand = rest;
  if ((first === 'mcp' || first === 'dance') && rest.length > 0) {
    subcommand = `${first}-${rest[0]}`;
    afterSubcommand = rest.slice(1);
  }

  const { values, positionals } = parseArgs({
    args: afterSubcommand,
    allowPositionals: true,
    strict: false,
    options: {
      'data-dir': { type: 'string' },
      'json': { type: 'boolean' },
      'limit': { type: 'string' },
      'scope': { type: 'string' },
      'profile': { type: 'string' },
      'query': { type: 'string' },
      'file': { type: 'string' },
      'source': { type: 'string' },
      'path': { type: 'string' },
      'since': { type: 'string' },
      'mode': { type: 'string' },
      'concept': { type: 'string', multiple: true },
      'compact': { type: 'boolean' },
      'wipe-imports': { type: 'boolean' },
      'reconcile': { type: 'boolean' },
      'reembed-all': { type: 'boolean' },
      'rechunk-all': { type: 'boolean' },
      'dedupe-entities': { type: 'boolean' },
      'consolidate': { type: 'boolean' },
      'consolidate-model': { type: 'string' },
      'consolidate-limit': { type: 'string' },
      'workspace': { type: 'string' },
      'all-workspaces': { type: 'boolean' },
      'cognify': { type: 'boolean' },
      'wiki': { type: 'boolean' },
      'max-temp-age-days': { type: 'string' },
      'max-deprecated-age-days': { type: 'string' },
      'session-label': { type: 'string' },
      'importance': { type: 'string' },
      'tool': { type: 'string' },
      'args': { type: 'string' },
      'timeout-ms': { type: 'string' },
      'type': { type: 'string' },
      'subtype': { type: 'string' },
      'message': { type: 'string' },
      'reference-id': { type: 'string' },
      'help': { type: 'boolean', short: 'h' },
    },
  });

  return { subcommand, values, positionals };
}

function rootHelp(): string {
  return [
    'Usage: hive-mind-cli <subcommand> [options]',
    '',
    'Subcommands:',
    '  init                         Scaffold data dir + personal.mind (idempotent)',
    '  status                       Show frame/entity counts + last activity',
    '  mcp start                    Run the hive-mind MCP server (stdio)',
    '  mcp call <tool> [--args J]   Invoke one MCP tool and print the result',
    '  dance send --message TEXT    Send a message to the active Waggle Room',
    '  dance receive                Read messages from the active Waggle Room',
    '  recall-context "<query>"     Search the personal mind and print hits',
    '  save-session --file PATH     Persist a session summary as a memory frame',
    '  harvest-local --source S --path P   Import local AI tool exports',
    '  cognify                      Heuristic KG entity extraction from recent frames',
    '  compile-wiki [--mode M]      Build/refresh the personal wiki',
    '  maintenance --compact ...    Batch ops for a nightly cron',
    '',
    'Common flags:',
    '  --data-dir PATH              Override HIVE_MIND_DATA_DIR',
    '  --json                       Emit JSON rather than human text',
    '',
    'Environment:',
    '  HIVE_MIND_DATA_DIR           Data directory (default ~/.hive-mind)',
    '  OLLAMA_URL / OLLAMA_MODEL    Preferred embedder and wiki LLM',
    '  VOYAGE_API_KEY               Remote embedder fallback',
    '  OPENAI_API_KEY               Remote embedder fallback',
    '  ANTHROPIC_API_KEY            Wiki synthesizer (Haiku)',
    '  WAGGLE_DANCE_URL              Loopback sidecar URL (injected per run)',
    '  WAGGLE_RUN_TOKEN              Narrow Room credential (injected per run)',
  ].join('\n');
}

const SUBCOMMAND_HELP: Record<string, string[]> = {
  init: [
    'Usage: hive-mind-cli init [options]',
    '',
    'Scaffold the data directory and personal mind database.',
    '',
    'Options:',
    '  --data-dir PATH              Override HIVE_MIND_DATA_DIR',
    '  --json                       Emit JSON rather than human text',
    '  -h, --help                   Show this help',
  ],
  status: [
    'Usage: hive-mind-cli status [options]',
    '',
    'Show frame/entity counts and recent memory activity.',
    '',
    'Options:',
    '  --data-dir PATH              Override HIVE_MIND_DATA_DIR',
    '  --json                       Emit JSON rather than human text',
    '  -h, --help                   Show this help',
  ],
  'recall-context': [
    'Usage: hive-mind-cli recall-context "<query>" [options]',
    '',
    'Search the personal mind and print recalled context.',
    '',
    'Options:',
    '  --query TEXT                 Query text, instead of positional input',
    '  --limit N                    Maximum hits to return',
    '  --scope personal|all         Search scope',
    '  --profile NAME               Search ranking profile',
    '  --data-dir PATH              Override HIVE_MIND_DATA_DIR',
    '  --json                       Emit JSON rather than human text',
    '  -h, --help                   Show this help',
  ],
  'save-session': [
    'Usage: hive-mind-cli save-session [--file PATH] [options]',
    '',
    'Persist stdin or a file as a memory frame.',
    '',
    'Options:',
    '  --file PATH                  Read session text from a file',
    '  --session-label TEXT         Attach a human label to the saved session',
    '  --importance LEVEL           Memory importance',
    '  --data-dir PATH              Override HIVE_MIND_DATA_DIR',
    '  --json                       Emit JSON rather than human text',
    '  -h, --help                   Show this help',
  ],
  'harvest-local': [
    'Usage: hive-mind-cli harvest-local --source SOURCE --path PATH [options]',
    '',
    'Import local AI tool exports.',
    '',
    'Options:',
    '  --source SOURCE              chatgpt|claude|claude-code|gemini|universal',
    '  --path PATH                  Export file or directory',
    '  --data-dir PATH              Override HIVE_MIND_DATA_DIR',
    '  --json                       Emit JSON rather than human text',
    '  -h, --help                   Show this help',
  ],
  cognify: [
    'Usage: hive-mind-cli cognify [options]',
    '',
    'Extract entities and relations from recent frames.',
    '',
    'Options:',
    '  --since N                    Start after frame id N',
    '  --limit N                    Maximum frames to scan',
    '  --data-dir PATH              Override HIVE_MIND_DATA_DIR',
    '  --json                       Emit JSON rather than human text',
    '  -h, --help                   Show this help',
  ],
  'compile-wiki': [
    'Usage: hive-mind-cli compile-wiki [options]',
    '',
    'Build or refresh the personal wiki.',
    '',
    'Options:',
    '  --mode incremental|full      Compile mode',
    '  --concept TEXT               Compile a specific concept; repeatable',
    '  --data-dir PATH              Override HIVE_MIND_DATA_DIR',
    '  --json                       Emit JSON rather than human text',
    '  -h, --help                   Show this help',
  ],
  maintenance: [
    'Usage: hive-mind-cli maintenance [operations] [options]',
    '',
    'Run batch maintenance operations for cron-style upkeep.',
    '',
    'Operations:',
    '  --compact                    Compact temporary/deprecated frames',
    '  --wipe-imports               Delete imported frames',
    '  --reconcile                  Reconcile FTS/vector indexes',
    '  --cognify                    Extract entities',
    '  --wiki                       Compile wiki pages',
    '',
    'Options:',
    '  --data-dir PATH              Override HIVE_MIND_DATA_DIR',
    '  --json                       Emit JSON rather than human text',
    '  -h, --help                   Show this help',
  ],
  'mcp start': [
    'Usage: hive-mind-cli mcp start [options]',
    '',
    'Run the hive-mind MCP server in the foreground.',
    '',
    'Options:',
    '  -h, --help                   Show this help',
  ],
  'mcp call': [
    'Usage: hive-mind-cli mcp call <tool> [options]',
    '',
    'Invoke one MCP tool and print the result.',
    '',
    'Options:',
    '  --args JSON                  Tool arguments as JSON',
    '  --timeout-ms N               Request timeout',
    '  --json                       Emit JSON rather than human text',
    '  -h, --help                   Show this help',
  ],
  'dance send': [
    'Usage: hive-mind-cli dance send --message TEXT [options]',
    '',
    'Send a scoped message to the active Waggle Room.',
    '',
    'Options:',
    '  --type TYPE                  broadcast|request|response',
    '  --subtype SUBTYPE            WaggleDance protocol subtype',
    '  --message TEXT               Message body (or pass positional text)',
    '  --reference-id ID            Correlate a response with a request',
    '  --json                       Emit JSON rather than human text',
    '  -h, --help                   Show this help',
  ],
  'dance receive': [
    'Usage: hive-mind-cli dance receive [options]',
    '',
    'Read messages from the active Waggle Room.',
    '',
    'Options:',
    '  --since ISO                  Return messages after an ISO timestamp',
    '  --subtype SUBTYPE            Filter by protocol subtype',
    '  --limit N                    Maximum messages (1-500)',
    '  --json                       Emit JSON rather than human text',
    '  -h, --help                   Show this help',
  ],
  doctor: [
    'Usage: hive-mind-cli doctor [options]',
    '',
    'Run a local self-diagnostic smoke test.',
    '',
    'Options:',
    '  --data-dir PATH              Override HIVE_MIND_DATA_DIR',
    '  --json                       Emit JSON rather than human text',
    '  -h, --help                   Show this help',
  ],
};

function printHelp(subcommand?: string | null): void {
  const lines = subcommand ? SUBCOMMAND_HELP[subcommand] : null;
  console.log(lines ? lines.join('\n') : rootHelp());
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const helpTarget = requestedHelpTarget(rawArgs);
  if (helpTarget !== undefined) {
    printHelp(helpTarget);
    process.exit(0);
    return;
  }

  const args = parseRootArgs(rawArgs);
  if (!args) {
    printHelp(null);
    process.exit(args === null ? 0 : 1);
    return;
  }

  if (args.values['data-dir']) {
    process.env.HIVE_MIND_DATA_DIR = String(args.values['data-dir']);
  }

  try {
    const output = args.subcommand === 'hook-call'
      ? (await import('./commands/hook-call.js')).runHookCallCommand(args)
      : await (await import('./dispatch.js')).dispatch(args);
    if (output !== undefined) process.stdout.write(output);
    if (output && !output.endsWith('\n')) process.stdout.write('\n');
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`hive-mind-cli: ${msg}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('hive-mind-cli fatal:', err);
  process.exit(1);
});

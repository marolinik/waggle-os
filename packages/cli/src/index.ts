/**
 * Waggle CLI entry point.
 *
 * Usage:
 *   waggle                  Start interactive REPL
 *   waggle --model <name>   Start with a specific model
 *   waggle --help           Show help
 */

import { startRepl } from './repl.js';

function printHelp(): void {
  console.log(`
Waggle CLI — interactive AI agent with persistent memory

Usage:
  waggle                  Start interactive REPL
  waggle --model <name>   Start with a specific model
  waggle --local          Force local mode (no server)
  waggle --team           Force team mode (requires login)
  waggle --help           Show this help message

Configuration:
  Edit ~/.waggle/config.json to set up providers and API keys.

Commands (inside REPL):
  /model <name>   Switch model
  /models          List available models
  /identity        Show agent identity
  /admin <cmd>    Admin commands (teams|jobs|cron|audit|stats)
  /clear           Clear conversation
  /help            Show commands
  /exit            Quit
`);
}

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

let model: string | undefined;
const modelIdx = args.indexOf('--model');
if (modelIdx !== -1 && args[modelIdx + 1]) {
  model = args[modelIdx + 1];
}

const local = args.includes('--local');
const team = args.includes('--team');

startRepl({ model, local, team }).catch((err) => {
  console.error('Fatal error:', (err as Error).message);
  process.exit(1);
});

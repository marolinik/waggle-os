/**
 * Waggle CLI Launcher — `npx waggle`
 *
 * Starts the Waggle server and opens the frontend in the default browser.
 * The server serves the React frontend as static files (built by 9D-4).
 *
 * Usage:
 *   npx waggle                    # Start on default port 3333
 *   npx waggle --port 4000        # Start on custom port
 *   npx waggle --skip-litellm     # Skip LiteLLM proxy (use built-in Anthropic)
 *   npx waggle --no-open          # Don't open browser automatically
 */

import { startService, isFirstRun } from '@waggle/server/local/service';
import { execFile } from 'node:child_process';
import os from 'node:os';

// ── Parse CLI arguments ──────────────────────────────────────────

function parseArgs(argv: string[]): {
  port: number;
  skipLiteLLM: boolean;
  noBrowser: boolean;
  help: boolean;
} {
  const args = argv.slice(2);
  let port = 3333;
  let skipLiteLLM = false;
  let noBrowser = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' || arg === '-p') {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val > 0 && val < 65536) port = val;
    } else if (arg === '--skip-litellm') {
      skipLiteLLM = true;
    } else if (arg === '--no-open') {
      noBrowser = true;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    }
  }

  return { port, skipLiteLLM, noBrowser, help };
}

// ── Open URL in default browser ──────────────────────────────────

function openBrowser(url: string): void {
  const platform = os.platform();

  // Use platform-specific commands with execFile (no shell injection)
  if (platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url], () => {});
  } else if (platform === 'darwin') {
    execFile('open', [url], () => {});
  } else {
    execFile('xdg-open', [url], (err) => {
      if (err) console.log(`  Open manually: ${url}`);
    });
  }
}

// ── Version check ────────────────────────────────────────────────

function checkNodeVersion(): boolean {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) {
    console.error(`\n  Waggle requires Node.js >= 18. You have ${process.versions.node}.`);
    console.error('  Install a newer version: https://nodejs.org\n');
    return false;
  }
  return true;
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const { port, skipLiteLLM, noBrowser, help } = parseArgs(process.argv);

  if (help) {
    console.log(`
  Waggle — Your personal AI agent swarm

  Usage:
    npx waggle [options]

  Options:
    --port, -p <number>   Server port (default: 3333)
    --skip-litellm        Use built-in Anthropic proxy instead of LiteLLM
    --no-open             Don't open browser automatically
    --help, -h            Show this help message

  Data directory: ~/.waggle/
  Config: ~/.waggle/config.json
`);
    process.exit(0);
  }

  if (!checkNodeVersion()) {
    process.exit(1);
  }

  console.log();
  console.log('  \u{1F41D} Waggle — AI Agent Swarm');
  console.log('  ─────────────────────────────');

  const dataDir = process.env.WAGGLE_DATA_DIR || undefined;
  const firstRun = isFirstRun(dataDir ?? `${os.homedir()}/.waggle`);

  if (firstRun) {
    console.log('  Welcome! Setting up for the first time...');
    console.log();
  }

  try {
    const { server } = await startService({
      port,
      skipLiteLLM,
      dataDir,
      onProgress: (event) => {
        const pct = Math.round(event.progress * 100);
        process.stdout.write(`\r  [${pct.toString().padStart(3)}%] ${event.message}`);
        if (event.phase === 'ready') {
          process.stdout.write('\n');
        }
      },
    });

    const addr = server.server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : port;
    const url = `http://localhost:${actualPort}`;
    const llm = server.agentState.llmProvider;

    console.log();
    console.log(`  Server:  ${url}`);
    console.log(`  LLM:     ${llm.provider} (${llm.health})`);
    console.log(`  Data:    ${dataDir ?? `${os.homedir()}/.waggle`}`);
    console.log();
    console.log('  Press Ctrl+C to stop');
    console.log();

    if (!noBrowser) {
      openBrowser(url);
    }
  } catch (err: any) {
    console.error();
    console.error(`  Failed to start: ${err.message}`);
    console.error();
    process.exit(1);
  }
}

main();

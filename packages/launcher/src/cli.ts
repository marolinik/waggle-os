/**
 * Waggle CLI Launcher - `npx waggle`
 *
 * Starts the Waggle server and opens the frontend in the default browser.
 *
 * Usage:
 *   npx waggle                    # Start on default port 3333
 *   npx waggle --port 4000        # Start on custom port
 *   npx waggle --skip-litellm     # Skip LiteLLM proxy
 *   npx waggle --no-open          # Do not open browser automatically
 */

import { execFile } from 'node:child_process';
import os from 'node:os';
import {
  formatHelp,
  formatStartupFailure,
  formatStartupSuccess,
  parseArgs,
} from './cli-core.js';

function openBrowser(url: string): void {
  const platform = os.platform();
  const onOpenError = (err: Error | null): void => {
    if (err) console.log(`  Open manually: ${url}`);
  };

  if (platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url], onOpenError);
  } else if (platform === 'darwin') {
    execFile('open', [url], onOpenError);
  } else {
    execFile('xdg-open', [url], onOpenError);
  }
}

function checkNodeVersion(): boolean {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 18) {
    console.error(`\n  Waggle requires Node.js >= 18. You have ${process.versions.node}.`);
    console.error('  Install a newer version: https://nodejs.org\n');
    return false;
  }
  return true;
}

async function main() {
  const { port, skipLiteLLM, noBrowser, help, error } = parseArgs(process.argv);

  if (help) {
    console.log(formatHelp());
    process.exit(0);
  }

  if (error) {
    console.error();
    console.error(`  ${error}`);
    console.error(formatHelp());
    process.exit(1);
  }

  if (!checkNodeVersion()) {
    process.exit(1);
  }

  console.log();
  console.log('  Waggle - AI Agent Swarm');
  console.log('  ------------------------');

  const { startService, isFirstRun } = await import('@waggle/server/local/service');
  const dataDir = process.env.WAGGLE_DATA_DIR || undefined;
  const displayDataDir = dataDir ?? `${os.homedir()}/.waggle`;
  const firstRun = isFirstRun(displayDataDir);

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

    console.log(formatStartupSuccess({
      url,
      llmProvider: llm.provider,
      llmHealth: llm.health,
      dataDir: displayDataDir,
      noBrowser,
    }));

    if (!noBrowser) {
      openBrowser(url);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(formatStartupFailure(message, port));
    process.exit(1);
  }
}

main();

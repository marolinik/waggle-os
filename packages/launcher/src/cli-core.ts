export interface LauncherArgs {
  port: number;
  skipLiteLLM: boolean;
  noBrowser: boolean;
  help: boolean;
  error?: string;
}

export interface StartupSuccessOptions {
  url: string;
  llmProvider: string;
  llmHealth: string;
  dataDir: string;
  noBrowser: boolean;
}

const DEFAULT_PORT = 3333;
const MAX_PORT = 65535;

export function parseArgs(argv: string[]): LauncherArgs {
  const args = argv.slice(2);
  const result: LauncherArgs = {
    port: DEFAULT_PORT,
    skipLiteLLM: false,
    noBrowser: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--port' || arg === '-p') {
      const value = args[++i];
      if (value === undefined) {
        result.error = 'Missing value for --port. Use a number between 1 and 65535.';
        return result;
      }

      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
        result.error = `Invalid port: ${value}. Use a number between 1 and 65535.`;
        return result;
      }

      result.port = port;
    } else if (arg === '--skip-litellm') {
      result.skipLiteLLM = true;
    } else if (arg === '--no-open') {
      result.noBrowser = true;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg.startsWith('-')) {
      result.error = `Unknown option: ${arg}`;
      return result;
    } else {
      result.error = `Unknown argument: ${arg}`;
      return result;
    }
  }

  return result;
}

export function formatHelp(): string {
  return `
  Waggle - Your personal AI agent swarm

  Usage:
    npx waggle [options]

  Options:
    --port, -p <number>   Server port (default: 3333)
    --skip-litellm        Use built-in Anthropic proxy instead of LiteLLM
    --no-open             Do not open browser automatically
    --help, -h            Show this help message

  Data directory: ~/.waggle/
  Config: ~/.waggle/config.json
`;
}

export function formatStartupFailure(message: string, port: number): string {
  const firstLine = message.split(/\r?\n/)[0] || message;
  const lines = [
    '',
    `  Failed to start Waggle: ${firstLine}`,
    '',
  ];

  if (/port\s+\d+\s+is already in use/i.test(firstLine)) {
    lines.push(
      `  Another app is already using port ${port}.`,
      `  Try: npx waggle --port ${port + 1}`,
      '  Or close the other Waggle instance and run the command again.',
      '',
    );
  } else {
    lines.push(
      '  Check the message above, fix the startup problem, and run the command again.',
      '',
    );
  }

  return lines.join('\n');
}

export function formatStartupSuccess(options: StartupSuccessOptions): string {
  const lines = [
    '',
    `  Server:  ${options.url}`,
    `  LLM:     ${options.llmProvider} (${options.llmHealth})`,
    `  Data:    ${options.dataDir}`,
  ];

  if (options.noBrowser) {
    lines.push(
      '  Browser: not opened (--no-open)',
      `  Open manually: ${options.url}`,
    );
  } else {
    lines.push('  Browser: opening default browser');
  }

  lines.push('', '  Press Ctrl+C to stop', '');
  return lines.join('\n');
}

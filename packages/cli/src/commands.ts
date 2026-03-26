/**
 * Slash command parser for the Waggle CLI REPL.
 */

export interface SlashCommand {
  name: string;
  args: string;
}

/**
 * Parse a user input line as a slash command.
 * Returns null if the input is not a slash command.
 *
 * Examples:
 *   "/model gpt-4o"  → { name: "model", args: "gpt-4o" }
 *   "/exit"          → { name: "exit", args: "" }
 *   "hello"          → null
 */
export function parseCommand(input: string): SlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) {
    return { name: trimmed.slice(1), args: '' };
  }

  return {
    name: trimmed.slice(1, spaceIdx),
    args: trimmed.slice(spaceIdx + 1).trim(),
  };
}

/** Help text for each supported slash command. */
export const COMMANDS: Record<string, string> = {
  model: '/model <name>  — Switch to a different model',
  models: '/models        — List all available models',
  exit: '/exit          — Quit the REPL',
  clear: '/clear         — Clear conversation history',
  help: '/help          — Show this help message',
  identity: '/identity      — Show agent identity',
  admin: '/admin <cmd>   — Admin commands (teams|jobs|cron|audit|stats)',
  login: '/login         — Log in via browser (Clerk OAuth)',
  logout: '/logout        — Log out and clear stored token',
  whoami: '/whoami        — Show current user and mode',
  mode: '/mode          — Show current mode (local/team)',
  cost: '/cost          — Show token usage and estimated cost',
  plan: '/plan          — Show current execution plan',
  git: '/git           — Show git status for workspace',
};

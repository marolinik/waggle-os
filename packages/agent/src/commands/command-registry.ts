/**
 * Command Registry — manages slash commands for workflow-native interactions.
 *
 * Commands are prefixed with `/` and parsed as `/commandName args`.
 * The registry supports aliases and partial-match search for autocomplete.
 */

/**
 * B1-B7: Magic prefix that tells the chat route to re-process this command
 * through the full agent loop instead of returning a static response.
 * Format: AGENT_LOOP_REROUTE::<rewritten natural language message>
 */
export const AGENT_LOOP_REROUTE_PREFIX = 'AGENT_LOOP_REROUTE::';

export interface CommandContext {
  workspaceId: string;
  sessionId: string;
  /** Run a workflow template by name */
  runWorkflow?: (templateName: string, task: string) => Promise<string>;
  /** Search memory */
  searchMemory?: (query: string) => Promise<string>;
  /** Get workspace state (recent sessions, memories, tasks) */
  getWorkspaceState?: () => Promise<string>;
  /** List available skills */
  listSkills?: () => string[];
  /** Spawn a sub-agent with a role */
  spawnAgent?: (role: string, task: string) => Promise<string>;
}

export interface CommandDefinition {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  handler: (args: string, context: CommandContext) => Promise<string>;
}

export class CommandRegistry {
  private commands = new Map<string, CommandDefinition>();
  /** Maps alias → command name for lookup */
  private aliasMap = new Map<string, string>();

  register(command: CommandDefinition): void {
    if (this.commands.has(command.name)) {
      throw new Error(`Command "${command.name}" is already registered.`);
    }
    for (const alias of command.aliases) {
      if (this.aliasMap.has(alias)) {
        throw new Error(`Alias "${alias}" conflicts with existing alias for command "${this.aliasMap.get(alias)}".`);
      }
      if (this.commands.has(alias)) {
        throw new Error(`Alias "${alias}" conflicts with existing command name.`);
      }
    }
    this.commands.set(command.name, command);
    for (const alias of command.aliases) {
      this.aliasMap.set(alias, command.name);
    }
  }

  get(nameOrAlias: string): CommandDefinition | undefined {
    const resolved = this.aliasMap.get(nameOrAlias) ?? nameOrAlias;
    return this.commands.get(resolved);
  }

  list(): CommandDefinition[] {
    return Array.from(this.commands.values());
  }

  /** Returns true if input starts with `/` followed by a word character */
  isCommand(input: string): boolean {
    return /^\/\w/.test(input.trim());
  }

  /** Returns matching commands for partial input (for autocomplete) */
  search(partial: string): CommandDefinition[] {
    const normalized = partial.replace(/^\//, '').toLowerCase();
    if (!normalized) return this.list();

    const results: CommandDefinition[] = [];
    for (const cmd of this.commands.values()) {
      if (
        cmd.name.toLowerCase().includes(normalized) ||
        cmd.aliases.some(a => a.toLowerCase().includes(normalized))
      ) {
        results.push(cmd);
      }
    }
    return results;
  }

  /**
   * Parse and execute a slash command.
   * Input format: `/commandName arg1 arg2 ...`
   */
  async execute(input: string, context: CommandContext): Promise<string> {
    const trimmed = input.trim();
    if (!this.isCommand(trimmed)) {
      return `Not a command. Commands start with \`/\`. Type \`/help\` to see available commands.`;
    }

    // Parse: strip leading `/`, split into name and args
    const withoutSlash = trimmed.slice(1);
    const spaceIdx = withoutSlash.indexOf(' ');
    const name = spaceIdx === -1 ? withoutSlash : withoutSlash.slice(0, spaceIdx);
    const args = spaceIdx === -1 ? '' : withoutSlash.slice(spaceIdx + 1).trim();

    const command = this.get(name.toLowerCase());
    if (!command) {
      const available = this.list().map(c => `\`/${c.name}\``).join(', ');
      return `Unknown command \`/${name}\`. Available commands: ${available}`;
    }

    try {
      return await command.handler(args, context);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Command \`/${name}\` failed: ${message}`;
    }
  }
}

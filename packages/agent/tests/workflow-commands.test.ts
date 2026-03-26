import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandRegistry, type CommandContext } from '../src/commands/command-registry.js';
import { registerWorkflowCommands } from '../src/commands/workflow-commands.js';

function mockContext(overrides?: Partial<CommandContext>): CommandContext {
  return {
    workspaceId: 'test-ws',
    sessionId: 'test-session',
    runWorkflow: vi.fn().mockResolvedValue('Workflow result'),
    searchMemory: vi.fn().mockResolvedValue('Memory result'),
    getWorkspaceState: vi.fn().mockResolvedValue('Workspace state data'),
    listSkills: vi.fn().mockReturnValue(['skill-a', 'skill-b']),
    spawnAgent: vi.fn().mockResolvedValue('Agent result'),
    ...overrides,
  };
}

describe('CommandRegistry', () => {
  it('register and retrieve by name', () => {
    const registry = new CommandRegistry();
    registry.register({
      name: 'test',
      aliases: [],
      description: 'A test command',
      usage: '/test',
      handler: async () => 'ok',
    });
    const cmd = registry.get('test');
    expect(cmd).toBeDefined();
    expect(cmd!.name).toBe('test');
  });

  it('retrieve by alias', () => {
    const registry = new CommandRegistry();
    registry.register({
      name: 'test',
      aliases: ['t', 'tst'],
      description: 'A test command',
      usage: '/test',
      handler: async () => 'ok',
    });
    expect(registry.get('t')?.name).toBe('test');
    expect(registry.get('tst')?.name).toBe('test');
  });

  it('list all commands', () => {
    const registry = new CommandRegistry();
    registry.register({ name: 'a', aliases: [], description: '', usage: '', handler: async () => '' });
    registry.register({ name: 'b', aliases: [], description: '', usage: '', handler: async () => '' });
    expect(registry.list()).toHaveLength(2);
  });

  it('execute parses command and args', async () => {
    const registry = new CommandRegistry();
    const handler = vi.fn().mockResolvedValue('executed');
    registry.register({ name: 'greet', aliases: [], description: '', usage: '', handler });

    const ctx = mockContext();
    const result = await registry.execute('/greet hello world', ctx);

    expect(result).toBe('executed');
    expect(handler).toHaveBeenCalledWith('hello world', ctx);
  });

  it('isCommand returns true for /commands, false for regular text', () => {
    const registry = new CommandRegistry();
    expect(registry.isCommand('/research quantum')).toBe(true);
    expect(registry.isCommand('/now')).toBe(true);
    expect(registry.isCommand('hello world')).toBe(false);
    expect(registry.isCommand('not a /command')).toBe(false);
    expect(registry.isCommand('/ space')).toBe(false);
  });

  it('search returns partial matches', () => {
    const registry = new CommandRegistry();
    registerWorkflowCommands(registry);

    const results = registry.search('re');
    const names = results.map(c => c.name);
    expect(names).toContain('research');
    expect(names).toContain('review');
  });

  it('unknown command returns error message', async () => {
    const registry = new CommandRegistry();
    registerWorkflowCommands(registry);
    const ctx = mockContext();

    const result = await registry.execute('/nonexistent', ctx);
    expect(result).toContain('Unknown command');
    expect(result).toContain('/nonexistent');
  });
});

describe('Workflow Commands', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
    registerWorkflowCommands(registry);
  });

  it('/catchup calls getWorkspaceState and formats result', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/catchup', ctx);

    expect(ctx.getWorkspaceState).toHaveBeenCalled();
    expect(result).toContain('Catch-Up Briefing');
    expect(result).toContain('Workspace state data');
  });

  it('/now calls getWorkspaceState', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/now', ctx);

    expect(ctx.getWorkspaceState).toHaveBeenCalled();
    expect(result).toContain('Right Now');
    expect(result).toContain('Workspace state data');
  });

  it('/research calls runWorkflow with research-team', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/research quantum computing', ctx);

    expect(ctx.runWorkflow).toHaveBeenCalledWith('research-team', 'quantum computing');
    expect(result).toBe('Workflow result');
  });

  it('/research without topic returns error', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/research', ctx);

    expect(result).toContain('Usage');
    expect(result).toContain('/research <topic>');
    expect(ctx.runWorkflow).not.toHaveBeenCalled();
  });

  it('/draft calls runWorkflow with review-pair', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/draft blog post about AI', ctx);

    expect(ctx.runWorkflow).toHaveBeenCalledWith('review-pair', 'blog post about AI');
    expect(result).toBe('Workflow result');
  });

  it('/spawn calls spawnAgent with role and task', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/spawn researcher Find papers on AI', ctx);

    expect(ctx.spawnAgent).toHaveBeenCalledWith('researcher', 'Find papers on AI');
    expect(result).toBe('Agent result');
  });

  it('/spawn without role returns error', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/spawn', ctx);

    expect(result).toContain('Usage');
    expect(result).toContain('/spawn <role>');
    expect(ctx.spawnAgent).not.toHaveBeenCalled();
  });

  it('/skills calls listSkills', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/skills', ctx);

    expect(ctx.listSkills).toHaveBeenCalled();
    expect(result).toContain('skill-a');
    expect(result).toContain('skill-b');
    expect(result).toContain('2 skill(s)');
  });

  it('/memory calls searchMemory', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/memory architecture decisions', ctx);

    expect(ctx.searchMemory).toHaveBeenCalledWith('architecture decisions');
    expect(result).toContain('Memory Search');
    expect(result).toContain('Memory result');
  });

  it('/memory without query shows help', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/memory', ctx);

    expect(result).toContain('Usage');
    expect(result).toContain('/memory <query>');
    expect(ctx.searchMemory).not.toHaveBeenCalled();
  });

  it('/plan calls runWorkflow with plan-execute', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/plan Build a dashboard', ctx);

    expect(ctx.runWorkflow).toHaveBeenCalledWith('plan-execute', 'Build a dashboard');
    expect(result).toBe('Workflow result');
  });

  it('/plan without goal returns error', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/plan', ctx);

    expect(result).toContain('Usage');
    expect(result).toContain('/plan <goal>');
    expect(ctx.runWorkflow).not.toHaveBeenCalled();
  });

  it('/focus returns context hint', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/focus database optimization', ctx);

    expect(result).toContain('Focus');
    expect(result).toContain('database optimization');
    expect(result).toContain('Tip');
    expect(result).not.toContain('System instruction');
  });

  it('/decide without question returns error', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/decide', ctx);

    expect(result).toContain('Usage');
    expect(result).toContain('/decide <question>');
  });

  it('/decide with question delegates to runWorkflow when available', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/decide PostgreSQL or MongoDB?', ctx);

    // B7: With runWorkflow available, /decide delegates to workflow
    expect(ctx.runWorkflow).toHaveBeenCalledWith('decision-analysis', 'PostgreSQL or MongoDB?');
    expect(result).toBe('Workflow result');
  });

  it('/review calls runWorkflow', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/review', ctx);

    expect(ctx.runWorkflow).toHaveBeenCalledWith('review-pair', expect.stringContaining('Review'));
    expect(result).toBe('Workflow result');
  });

  it('/status calls getWorkspaceState', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/status', ctx);

    expect(ctx.getWorkspaceState).toHaveBeenCalled();
    expect(result).toContain('Status Report');
    expect(result).toContain('Workspace state data');
  });

  it('/help lists all commands', async () => {
    const ctx = mockContext();
    const result = await registry.execute('/help', ctx);

    expect(result).toContain('Available Commands');
    expect(result).toContain('/catchup');
    expect(result).toContain('/research');
    expect(result).toContain('/help');
  });

  it('all 22 commands are registered', () => {
    const commands = registry.list();
    expect(commands).toHaveLength(22);

    const names = commands.map(c => c.name);
    expect(names).toContain('catchup');
    expect(names).toContain('now');
    expect(names).toContain('research');
    expect(names).toContain('draft');
    expect(names).toContain('decide');
    expect(names).toContain('review');
    expect(names).toContain('spawn');
    expect(names).toContain('skills');
    expect(names).toContain('status');
    expect(names).toContain('memory');
    expect(names).toContain('plan');
    expect(names).toContain('focus');
    expect(names).toContain('help');
    expect(names).toContain('plugins');
    expect(names).toContain('export');
    expect(names).toContain('import');
    expect(names).toContain('settings');
    expect(names).toContain('cli');
    expect(names).toContain('pr');
  });
});

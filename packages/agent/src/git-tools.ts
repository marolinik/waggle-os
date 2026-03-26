import { execFileSync } from 'node:child_process';
import type { ToolDefinition } from './tools.js';

function runGit(cwd: string, args: string[], timeoutMs = 10_000): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: timeoutMs }).trim();
  } catch (err: any) {
    return err.stderr?.trim() || err.message;
  }
}

/** Run an arbitrary command (for gh CLI). Returns stdout or error text. */
function runCmd(cmd: string, cmdArgs: string[], cwd: string, timeoutMs = 60_000): string {
  try {
    return execFileSync(cmd, cmdArgs, { cwd, encoding: 'utf-8', timeout: timeoutMs }).trim();
  } catch (err: any) {
    return err.stderr?.trim() || err.message;
  }
}

/** Check if a CLI program is available on PATH */
function isAvailable(cmd: string): boolean {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(which, [cmd], { encoding: 'utf-8', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export function createGitTools(workspace: string): ToolDefinition[] {
  return [
    {
      name: 'git_status',
      description: 'Show git status (modified/untracked files and current branch)',
      offlineCapable: true,
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        const branch = runGit(workspace, ['branch', '--show-current']);
        const status = runGit(workspace, ['status', '--short']);
        return `Branch: ${branch || '(no branch)'}\n${status || 'Clean'}`;
      },
    },
    {
      name: 'git_diff',
      description: 'Show git diff (unstaged changes, or --staged)',
      offlineCapable: true,
      parameters: {
        type: 'object',
        properties: {
          staged: { type: 'boolean', description: 'Show staged changes (default: false)' },
          file: { type: 'string', description: 'Specific file to diff (optional)' },
        },
      },
      execute: async (args) => {
        const gitArgs = ['diff'];
        if (args.staged) gitArgs.push('--staged');
        if (args.file) gitArgs.push(args.file as string);
        const diff = runGit(workspace, gitArgs);
        return diff || 'No changes.';
      },
    },
    {
      name: 'git_log',
      description: 'Show recent git log',
      offlineCapable: true,
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of commits to show (default: 10)' },
        },
      },
      execute: async (args) => {
        const count = (args.count as number) ?? 10;
        const log = runGit(workspace, ['log', '--oneline', `-${count}`]);
        return log || 'No commits yet.';
      },
    },
    {
      name: 'git_commit',
      description: 'Stage files and create an atomic git commit',
      offlineCapable: true,
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message' },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Files to stage (default: all)',
          },
        },
        required: ['message'],
      },
      execute: async (args) => {
        const files = (args.files as string[]) ?? ['.'];
        runGit(workspace, ['add', ...files]);
        const result = runGit(workspace, ['commit', '-m', args.message as string]);
        return result;
      },
    },

    // ── F2: Extended git workflow tools ──────────────────────────────────

    {
      name: 'git_branch',
      description: 'Create, list, or switch git branches',
      offlineCapable: true,
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'list', 'switch', 'delete'], description: 'Branch operation' },
          name: { type: 'string', description: 'Branch name (required for create/switch/delete)' },
          from: { type: 'string', description: 'Base branch for create (default: current)' },
        },
        required: ['action'],
      },
      execute: async (args) => {
        const action = args.action as string;
        const name = args.name as string | undefined;

        switch (action) {
          case 'create': {
            if (!name) return 'Error: branch name is required for create.';
            const createArgs = ['checkout', '-b', name];
            if (args.from) createArgs.push(args.from as string);
            return runGit(workspace, createArgs);
          }
          case 'list':
            return runGit(workspace, ['branch', '-a', '--format=%(refname:short) %(HEAD)']);
          case 'switch': {
            if (!name) return 'Error: branch name is required for switch.';
            return runGit(workspace, ['checkout', name]);
          }
          case 'delete': {
            if (!name) return 'Error: branch name is required for delete.';
            return runGit(workspace, ['branch', '-d', name]);
          }
          default:
            return `Error: unknown action "${action}". Use create, list, switch, or delete.`;
        }
      },
    },

    {
      name: 'git_stash',
      description: 'Stash or restore uncommitted changes',
      offlineCapable: true,
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['save', 'pop', 'list', 'drop'], description: 'Stash operation' },
          message: { type: 'string', description: 'Stash message (for save)' },
        },
        required: ['action'],
      },
      execute: async (args) => {
        const action = args.action as string;

        switch (action) {
          case 'save': {
            const stashArgs = ['stash', 'push'];
            if (args.message) stashArgs.push('-m', args.message as string);
            return runGit(workspace, stashArgs);
          }
          case 'pop':
            return runGit(workspace, ['stash', 'pop']);
          case 'list':
            return runGit(workspace, ['stash', 'list']) || 'No stashes.';
          case 'drop':
            return runGit(workspace, ['stash', 'drop']);
          default:
            return `Error: unknown action "${action}". Use save, pop, list, or drop.`;
        }
      },
    },

    {
      name: 'git_push',
      description: 'Push commits to remote repository. Requires approval for safety.',
      offlineCapable: false,
      parameters: {
        type: 'object',
        properties: {
          remote: { type: 'string', description: 'Remote name (default: origin)' },
          branch: { type: 'string', description: 'Branch to push (default: current)' },
          setUpstream: { type: 'boolean', description: 'Set upstream tracking (-u flag)' },
        },
      },
      execute: async (args) => {
        const remote = (args.remote as string) || 'origin';
        const pushArgs = ['push'];
        if (args.setUpstream) pushArgs.push('-u');
        pushArgs.push(remote);
        if (args.branch) pushArgs.push(args.branch as string);
        return runGit(workspace, pushArgs, 60_000);
      },
    },

    {
      name: 'git_pull',
      description: 'Pull latest changes from remote',
      offlineCapable: false,
      parameters: {
        type: 'object',
        properties: {
          remote: { type: 'string', description: 'Remote name (default: origin)' },
          branch: { type: 'string', description: 'Branch to pull (default: current)' },
          rebase: { type: 'boolean', description: 'Use rebase instead of merge' },
        },
      },
      execute: async (args) => {
        const pullArgs = ['pull'];
        if (args.rebase) pullArgs.push('--rebase');
        const remote = args.remote as string | undefined;
        const branch = args.branch as string | undefined;
        if (remote) pullArgs.push(remote);
        if (remote && branch) pullArgs.push(branch);
        return runGit(workspace, pullArgs, 60_000);
      },
    },

    {
      name: 'git_merge',
      description: 'Merge a branch into the current branch',
      offlineCapable: true,
      parameters: {
        type: 'object',
        properties: {
          branch: { type: 'string', description: 'Branch to merge into current' },
          noFf: { type: 'boolean', description: 'Create merge commit even for fast-forward (--no-ff)' },
        },
        required: ['branch'],
      },
      execute: async (args) => {
        const mergeArgs = ['merge'];
        if (args.noFf) mergeArgs.push('--no-ff');
        mergeArgs.push(args.branch as string);
        return runGit(workspace, mergeArgs);
      },
    },

    {
      name: 'git_pr',
      description: 'Create a pull request. Uses GitHub CLI (gh) if available, otherwise generates PR description.',
      offlineCapable: false,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'PR title' },
          body: { type: 'string', description: 'PR description (markdown)' },
          base: { type: 'string', description: 'Base branch (default: main)' },
          draft: { type: 'boolean', description: 'Create as draft PR' },
        },
        required: ['title'],
      },
      execute: async (args) => {
        const title = args.title as string;
        const body = (args.body as string) || '';
        const base = (args.base as string) || 'main';
        const draft = args.draft as boolean | undefined;

        if (isAvailable('gh')) {
          const ghArgs = ['pr', 'create', '--title', title, '--base', base];
          if (body) ghArgs.push('--body', body);
          if (draft) ghArgs.push('--draft');
          return runCmd('gh', ghArgs, workspace, 60_000);
        }

        // gh CLI not available — generate formatted PR description for manual use
        const currentBranch = runGit(workspace, ['branch', '--show-current']);
        const recentLog = runGit(workspace, ['log', '--oneline', `${base}..HEAD`, '-20']);
        return [
          `## Pull Request (manual — gh CLI not found)`,
          '',
          `**Title:** ${title}`,
          `**Branch:** ${currentBranch} → ${base}`,
          draft ? '**Draft:** Yes' : '',
          '',
          body ? `### Description\n${body}` : '',
          '',
          `### Commits`,
          recentLog || '(no commits ahead of base)',
          '',
          '_Copy this to your Git hosting provider to create the PR._',
        ].filter(Boolean).join('\n');
      },
    },
  ];
}

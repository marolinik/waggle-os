import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ToolDefinition } from '../src/tools.js';
import { createGitTools } from '../src/git-tools.js';

let tmpDir: string;
let tools: ToolDefinition[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-git-'));
  execFileSync('git', ['init'], { cwd: tmpDir });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpDir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir });
  tools = createGitTools(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('createGitTools', () => {
  it('returns 10 tools: original 4 + 6 new workflow tools', () => {
    const names = tools.map(t => t.name);
    expect(names).toEqual([
      'git_status', 'git_diff', 'git_log', 'git_commit',
      'git_branch', 'git_stash', 'git_push', 'git_pull', 'git_merge', 'git_pr',
    ]);
  });

  it('git_status shows clean on fresh repo', async () => {
    const status = tools.find(t => t.name === 'git_status')!;
    const result = await status.execute({});
    // Fresh repo with no commits — status should indicate clean/empty
    expect(result).toContain('Clean');
  });

  it('git_status shows modified files after creating a file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'hello world');
    const status = tools.find(t => t.name === 'git_status')!;
    const result = await status.execute({});
    expect(result).toContain('hello.txt');
  });

  it('git_diff shows changes for modified file', async () => {
    // Create initial commit so diff works
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'original');
    execFileSync('git', ['add', '.'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpDir });

    // Modify the file
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'modified');

    const diff = tools.find(t => t.name === 'git_diff')!;
    const result = await diff.execute({});
    expect(result).toContain('modified');
    expect(result).toContain('original');
  });

  it('git_log shows commits after committing', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'content');
    execFileSync('git', ['add', '.'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'first commit'], { cwd: tmpDir });

    const log = tools.find(t => t.name === 'git_log')!;
    const result = await log.execute({});
    expect(result).toContain('first commit');
  });

  it('git_commit does atomic add+commit with specified message', async () => {
    fs.writeFileSync(path.join(tmpDir, 'new.txt'), 'new file content');

    const commit = tools.find(t => t.name === 'git_commit')!;
    const result = await commit.execute({ message: 'add new file' });
    expect(result).toContain('add new file');

    // Verify commit is in log
    const logOutput = execFileSync('git', ['log', '--oneline'], { cwd: tmpDir, encoding: 'utf-8' });
    expect(logOutput).toContain('add new file');
  });

  // ── F2: New git workflow tools ─────────────────────────────────────

  it('git_branch list shows branches', async () => {
    // Need at least one commit for branches to exist
    fs.writeFileSync(path.join(tmpDir, 'init.txt'), 'init');
    execFileSync('git', ['add', '.'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpDir });

    const branch = tools.find(t => t.name === 'git_branch')!;
    const result = await branch.execute({ action: 'list' });
    expect(result).toContain('master');
  });

  it('git_branch create makes a new branch and switches to it', async () => {
    fs.writeFileSync(path.join(tmpDir, 'init.txt'), 'init');
    execFileSync('git', ['add', '.'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpDir });

    const branch = tools.find(t => t.name === 'git_branch')!;
    await branch.execute({ action: 'create', name: 'feature-x' });

    const current = execFileSync('git', ['branch', '--show-current'], { cwd: tmpDir, encoding: 'utf-8' }).trim();
    expect(current).toBe('feature-x');
  });

  it('git_branch switch changes branch', async () => {
    fs.writeFileSync(path.join(tmpDir, 'init.txt'), 'init');
    execFileSync('git', ['add', '.'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpDir });
    execFileSync('git', ['checkout', '-b', 'dev'], { cwd: tmpDir });
    execFileSync('git', ['checkout', 'master'], { cwd: tmpDir });

    const branch = tools.find(t => t.name === 'git_branch')!;
    await branch.execute({ action: 'switch', name: 'dev' });

    const current = execFileSync('git', ['branch', '--show-current'], { cwd: tmpDir, encoding: 'utf-8' }).trim();
    expect(current).toBe('dev');
  });

  it('git_branch delete removes a branch', async () => {
    fs.writeFileSync(path.join(tmpDir, 'init.txt'), 'init');
    execFileSync('git', ['add', '.'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpDir });
    execFileSync('git', ['branch', 'to-delete'], { cwd: tmpDir });

    const branch = tools.find(t => t.name === 'git_branch')!;
    await branch.execute({ action: 'delete', name: 'to-delete' });

    const branches = execFileSync('git', ['branch'], { cwd: tmpDir, encoding: 'utf-8' });
    expect(branches).not.toContain('to-delete');
  });

  it('git_branch returns error when name is missing for create', async () => {
    const branch = tools.find(t => t.name === 'git_branch')!;
    const result = await branch.execute({ action: 'create' });
    expect(result).toContain('Error');
  });

  it('git_stash save and pop round-trips changes', async () => {
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'original');
    execFileSync('git', ['add', '.'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpDir });

    // Make a change
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'modified');

    const stash = tools.find(t => t.name === 'git_stash')!;
    await stash.execute({ action: 'save', message: 'wip changes' });

    // File should be back to original after stash
    const content = fs.readFileSync(path.join(tmpDir, 'file.txt'), 'utf-8');
    expect(content).toBe('original');

    // Pop stash
    await stash.execute({ action: 'pop' });
    const restored = fs.readFileSync(path.join(tmpDir, 'file.txt'), 'utf-8');
    expect(restored).toBe('modified');
  });

  it('git_stash list shows empty when no stashes', async () => {
    const stash = tools.find(t => t.name === 'git_stash')!;
    const result = await stash.execute({ action: 'list' });
    expect(result).toBe('No stashes.');
  });

  it('git_merge merges a branch into current', async () => {
    fs.writeFileSync(path.join(tmpDir, 'init.txt'), 'init');
    execFileSync('git', ['add', '.'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpDir });

    // Create a feature branch with a commit
    execFileSync('git', ['checkout', '-b', 'feature'], { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, 'feature.txt'), 'feature work');
    execFileSync('git', ['add', '.'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'feature commit'], { cwd: tmpDir });

    // Switch back to master and merge
    execFileSync('git', ['checkout', 'master'], { cwd: tmpDir });

    const merge = tools.find(t => t.name === 'git_merge')!;
    await merge.execute({ branch: 'feature' });

    // feature.txt should now exist on master
    expect(fs.existsSync(path.join(tmpDir, 'feature.txt'))).toBe(true);
  });

  it('git_pr returns output (PR description or gh error for local-only repo)', async () => {
    fs.writeFileSync(path.join(tmpDir, 'init.txt'), 'init');
    execFileSync('git', ['add', '.'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpDir });

    const pr = tools.find(t => t.name === 'git_pr')!;
    const result = await pr.execute({ title: 'Test PR', body: 'Some changes', base: 'main' });
    // If gh CLI is available but no remote, gh returns an error about remotes.
    // If gh CLI is not available, we get a formatted PR description with the title.
    // Either way, the tool should return a non-empty string without throwing.
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

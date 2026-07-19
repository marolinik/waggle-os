import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWorkerExecutionContext } from '../src/execution-policy.js';

describe('worker execution policy', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-worker-policy-'));
    vi.stubEnv('WAGGLE_DATA_DIR', dataDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('derives a canonical tenant workspace from WAGGLE_DATA_DIR and teamId', () => {
    const context = createWorkerExecutionContext('team-123');
    const expected = fs.realpathSync.native(path.join(dataDir, 'teams', 'team-123', 'files'));

    expect(context.workspaceDir).toBe(expected);
    expect(fs.statSync(context.workspaceDir).isDirectory()).toBe(true);
  });

  it('exposes exactly the read-only system tool pool', () => {
    const context = createWorkerExecutionContext('team-123');

    expect(context.tools.map(tool => tool.name)).toEqual([
      'read_file',
      'search_files',
      'search_content',
      'web_search',
      'web_fetch',
    ]);
  });

  it('truthfully instructs the model to propose changes instead of mutating', () => {
    const context = createWorkerExecutionContext('team-123');

    expect(context.systemPrompt).toContain('non-interactive read-only worker');
    expect(context.systemPrompt).toContain('cannot run shell commands, execute code, or write, edit, or delete files');
    expect(context.systemPrompt).toContain('proposed patch');
  });

  it('fails closed without WAGGLE_DATA_DIR', () => {
    vi.stubEnv('WAGGLE_DATA_DIR', '   ');

    expect(() => createWorkerExecutionContext('team-123')).toThrow('WAGGLE_DATA_DIR');
  });

  it.each([
    ['empty', ''],
    ['current directory', '.'],
    ['parent directory', '..'],
    ['forward-slash traversal', '../outside'],
    ['backslash traversal', '..\\outside'],
    ['absolute Windows path', 'C:\\outside'],
    ['overlong identifier', 'a'.repeat(129)],
    ['missing runtime identifier', undefined as unknown as string],
    ['null runtime identifier', null as unknown as string],
  ])('rejects an unsafe %s teamId', (_label, teamId) => {
    expect(() => createWorkerExecutionContext(teamId)).toThrow('Invalid teamId');
  });
});

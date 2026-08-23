import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';
import { shutdown } from '../src/core/setup.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SERVER_ENTRY = path.join(ROOT, 'packages', 'hive-mind-mcp-server', 'dist', 'index.js');

function bin(name: string): string {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

interface AsyncRunResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function runInCwd(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AsyncRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: process.platform === 'win32' && command.endsWith('.cmd'),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

function runNpm(args: string[], cwd: string = ROOT): Promise<AsyncRunResult> {
  const bundledNpmCli = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'waggle-node-runtime',
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  const npmCli = [bundledNpmCli, process.env.npm_execpath]
    .find((candidate): candidate is string => (
      typeof candidate === 'string' && fs.existsSync(candidate)
    ));
  const npmEnv = { ...process.env };
  const inheritedPath = Object.entries(npmEnv)
    .find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  for (const key of Object.keys(npmEnv)) {
    if (key.toLowerCase() === 'path') delete npmEnv[key];
  }
  npmEnv.PATH = [
    ...(npmCli ? [path.dirname(npmCli)] : []),
    path.dirname(process.execPath),
    inheritedPath,
  ].filter(Boolean).join(path.delimiter);

  return npmCli
    ? runInCwd(process.execPath, [npmCli, ...args], cwd, npmEnv)
    : runInCwd(bin('npm'), args, cwd, npmEnv);
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([work, timer]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function textContent(result: Awaited<ReturnType<Client['callTool']>>): string {
  return result.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
}

const HIVE_MIND_MCP_PACKAGE_CLOSURE = [
  '@waggle/shared',
  '@waggle/hive-mind-core',
  '@waggle/hive-mind-wiki-compiler',
  '@waggle/hive-mind-mcp-server',
] as const;

describe('@waggle/hive-mind-mcp-server built runtime', () => {
  it('shuts down safely before initialization and remains idempotent', () => {
    expect(() => shutdown()).not.toThrow();
    expect(() => shutdown()).not.toThrow();
  });

  it('saves and recalls memory through the built write-scope MCP server', async () => {
    const coreBuild = await runNpm(['run', 'build', '--workspace', '@waggle/hive-mind-core']);
    expect(coreBuild.status).toBe(0);

    const wikiBuild = await runNpm(['run', 'build', '--workspace', '@waggle/hive-mind-wiki-compiler']);
    expect(wikiBuild.status).toBe(0);

    const mcpBuild = await runNpm(['run', 'build', '--workspace', '@waggle/hive-mind-mcp-server']);
    expect(mcpBuild.status).toBe(0);

    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-mind-mcp-write-'));
    const client = new Client({ name: 'hive-mind-mcp-write-test', version: '0.0.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER_ENTRY],
      env: {
        ...process.env,
        HIVE_MIND_DATA_DIR: dataDir,
        HIVE_MIND_EMBEDDING_PROVIDER: 'mock',
        HIVE_MIND_SCOPES: 'memory:write',
      } as Record<string, string>,
    });
    const memoryText = `Hive MCP write roundtrip ${Date.now()} keeps nectar context`;

    try {
      await withTimeout(client.connect(transport), 10_000);
      const tools = await withTimeout(client.listTools(), 10_000);
      const names = tools.tools.map((tool) => tool.name);
      expect(names).toContain('save_memory');

      const saved = await withTimeout(client.callTool({
        name: 'save_memory',
        arguments: {
          content: memoryText,
          importance: 'important',
          source: 'tool_verified',
        },
      }), 10_000);
      expect(textContent(saved)).toContain(memoryText);

      const recalled = await withTimeout(client.callTool({
        name: 'recall_memory',
        arguments: {
          query: 'nectar context',
          limit: 5,
          scope: 'personal',
        },
      }), 10_000);

      expect(textContent(recalled)).toContain(memoryText);
    } finally {
      await client.close().catch(() => {});
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('installs the local package closure and lists tools from the installed server', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-mind-mcp-installed-'));
    const dataDir = path.join(tempDir, 'data');
    const packsDir = path.join(tempDir, 'packs');
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(packsDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });
    const client = new Client({ name: 'hive-mind-mcp-installed-test', version: '0.0.0' });

    try {
      const dependencies: Record<string, string> = {};
      for (const workspace of HIVE_MIND_MCP_PACKAGE_CLOSURE) {
        const build = await runNpm(['run', 'build', '--workspace', workspace]);
        expect(build.status).toBe(0);

        const pack = await runNpm(
          ['pack', '--workspace', workspace, '--pack-destination', packsDir, '--json'],
        );
        expect(pack.status).toBe(0);

        const [packResult] = JSON.parse(pack.stdout) as Array<{ filename: string }>;
        const tarball = path.join(packsDir, packResult.filename).replace(/\\/g, '/');
        dependencies[workspace] = `file:${tarball}`;
      }

      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ private: true, type: 'module', dependencies }, null, 2),
      );

      const install = await runNpm(
        ['install', '--no-audit', '--no-fund', '--prefer-offline'],
        projectDir,
      );
      expect(install.status).toBe(0);

      const installedEntry = path.join(
        projectDir,
        'node_modules',
        '@waggle',
        'hive-mind-mcp-server',
        'dist',
        'index.js',
      );
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [installedEntry],
        env: {
          ...process.env,
          HIVE_MIND_DATA_DIR: dataDir,
          HIVE_MIND_EMBEDDING_PROVIDER: 'mock',
          HIVE_MIND_SCOPES: 'memory:read',
        } as Record<string, string>,
      });

      await withTimeout(client.connect(transport), 30_000);
      const tools = await withTimeout(client.listTools(), 10_000);
      const names = tools.tools.map((tool) => tool.name);

      expect(names).toContain('recall_memory');
      expect(names).toContain('search_entities');
      expect(names).not.toContain('save_memory');
    } finally {
      await client.close().catch(() => {});
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 180_000);
});

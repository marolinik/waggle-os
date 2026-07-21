import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MarkdownAdapter, PlaintextAdapter } from '@waggle/hive-mind-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setupMocks = vi.hoisted(() => ({
  memoryParse: vi.fn(() => []),
  hiveParse: vi.fn(() => []),
}));

function unused(): never {
  throw new Error('Import-path regression reached initialized memory state unexpectedly');
}

vi.mock('../packages/memory-mcp/src/core/setup.js', () => ({
  getAdapter: () => ({ displayName: 'Test adapter', parse: setupMocks.memoryParse }),
  getFrameStore: unused,
  getSessions: unused,
  getSearch: unused,
  getKnowledgeGraph: unused,
  getHarvestSourceStore: unused,
  getPersonalDb: unused,
}));

vi.mock('../packages/hive-mind-mcp-server/src/core/setup.js', () => ({
  getAdapter: () => ({ displayName: 'Test adapter', parse: setupMocks.hiveParse }),
  getFrameStore: unused,
  getSessions: unused,
  getSearch: unused,
  getKnowledgeGraph: unused,
  getHarvestSourceStore: unused,
  getPersonalDb: unused,
}));

import { registerIngestTools as registerMemoryIngest } from '../packages/memory-mcp/src/tools/ingest.js';
import { registerHarvestTools as registerMemoryHarvest } from '../packages/memory-mcp/src/tools/harvest.js';
import { registerIngestTools as registerHiveIngest } from '../packages/hive-mind-mcp-server/src/tools/ingest.js';
import { registerHarvestTools as registerHiveHarvest } from '../packages/hive-mind-mcp-server/src/tools/harvest.js';

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

function captureTools(register: (server: McpServer) => void): Record<string, ToolHandler> {
  const handlers: Record<string, ToolHandler> = {};
  const server = {
    tool: (name: string, _description: string, _schema: unknown, handler: ToolHandler) => {
      handlers[name] = handler;
    },
  } as unknown as McpServer;
  register(server);
  return handlers;
}

function resultText(result: ToolResult): string {
  return result.content.map((item) => item.text).join('\n');
}

function windowsShortBasename(target: string): string {
  const command = `for %I in ("${target}") do @echo %~sI`;
  const shortPath = execFileSync(
    process.env.ComSpec ?? 'cmd.exe',
    ['/d', '/c', command],
    { encoding: 'utf8', windowsVerbatimArguments: true },
  ).trim();
  return path.basename(shortPath);
}

const surfaces = [
  {
    name: 'waggle-memory-mcp',
    envName: 'WAGGLE_MCP_IMPORT_ROOT',
    parse: setupMocks.memoryParse,
    ingest: captureTools(registerMemoryIngest).ingest_source,
    harvest: captureTools(registerMemoryHarvest).harvest_import,
  },
  {
    name: 'hive-mind-mcp-server',
    envName: 'HIVE_MIND_MCP_IMPORT_ROOT',
    parse: setupMocks.hiveParse,
    ingest: captureTools(registerHiveIngest).ingest_source,
    harvest: captureTools(registerHiveHarvest).harvest_import,
  },
] as const;

it('preserves short raw text exactly while disabling adapter path auto-dereference', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-raw-content-'));
  const pathLookingText = path.join(tempDir, 'secret.txt');
  fs.writeFileSync(pathLookingText, 'MCP_OUTSIDE_SECRET');

  try {
    const plaintext = new PlaintextAdapter().parse(`${pathLookingText}\n`);
    const markdown = new MarkdownAdapter().parse(`${pathLookingText}\n`);

    expect(plaintext[0]?.content).toBe(pathLookingText);
    expect(markdown[0]?.content).toBe(pathLookingText);
    expect(plaintext[0]?.content).not.toContain('MCP_OUTSIDE_SECRET');
    expect(markdown[0]?.content).not.toContain('MCP_OUTSIDE_SECRET');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe.each(surfaces)('$name local import containment', (surface) => {
  let tempDir: string;
  let importRoot: string;
  let outsideDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-import-path-'));
    importRoot = path.join(tempDir, 'allowed');
    outsideDir = path.join(tempDir, 'outside');
    fs.mkdirSync(importRoot);
    fs.mkdirSync(outsideDir);
    process.env[surface.envName] = importRoot;
    surface.parse.mockClear();
  });

  afterEach(() => {
    delete process.env[surface.envName];
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('treats path-looking content as raw content instead of dereferencing it', async () => {
    const outsideFile = path.join(outsideDir, 'secret.txt');
    fs.writeFileSync(outsideFile, 'MCP_OUTSIDE_SECRET');

    const result = await surface.ingest({
      content: outsideFile,
      type_hint: 'plaintext',
      importance: 'normal',
    });

    expect(result.isError).not.toBe(true);
    expect(surface.parse).toHaveBeenCalledWith(`${outsideFile}\n`);
    expect(resultText(result)).not.toContain('MCP_OUTSIDE_SECRET');
  });

  it.each([
    ['absolute', () => path.join(outsideDir, 'secret.json')],
    ['parent traversal', () => '../outside/secret.json'],
    ['Windows drive path', () => 'C:\\Users\\victim\\secret.json'],
    ['Windows UNC path', () => '\\\\server\\share\\secret.json'],
  ])('rejects an %s file_path before harvest reads it', async (_label, candidate) => {
    fs.writeFileSync(path.join(outsideDir, 'secret.json'), '[]');

    const result = await surface.harvest({
      source: 'universal',
      file_path: candidate(),
    }).catch((error: unknown) => ({
      content: [{ type: 'text' as const, text: String(error) }],
    }));

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/import root|absolute|traversal|outside|denied/i);
    expect(surface.parse).not.toHaveBeenCalled();
  });

  it('rejects sensitive files inside the configured root', async () => {
    fs.writeFileSync(path.join(importRoot, '.env'), 'API_KEY=secret');

    const result = await surface.harvest({
      source: 'universal',
      file_path: '.env',
    }).catch((error: unknown) => ({
      content: [{ type: 'text' as const, text: String(error) }],
    }));

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/sensitive|denied/i);
    expect(surface.parse).not.toHaveBeenCalled();
  });

  it('rejects backup copies of sensitive files inside the configured root', async () => {
    for (const name of ['id_rsa.bak', '.npmrc.backup']) {
      fs.writeFileSync(path.join(importRoot, name), '[]');

      const result = await surface.harvest({
        source: 'universal',
        file_path: name,
      });

      expect(result.isError, name).toBe(true);
      expect(resultText(result), name).toMatch(/sensitive|denied/i);
    }
    expect(surface.parse).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform !== 'win32')('rejects NTFS short aliases for sensitive files and directories', async (context) => {
    const sensitiveDirectory = path.join(importRoot, '.terraform.d');
    fs.mkdirSync(sensitiveDirectory);
    fs.writeFileSync(path.join(importRoot, 'credentials.json'), '[]');
    fs.writeFileSync(path.join(sensitiveDirectory, 'export.json'), '[]');

    const candidates = [
      windowsShortBasename(path.join(importRoot, 'credentials.json')),
      `${windowsShortBasename(sensitiveDirectory)}/export.json`,
    ];
    if (candidates.some((candidate) => !/~\d/i.test(candidate))) {
      context.skip('NTFS 8.3 alias creation is disabled on this volume');
    }

    for (const candidate of candidates) {
      expect(candidate).toMatch(/~\d/i);
      const result = await surface.harvest({
        source: 'universal',
        file_path: candidate,
      });

      expect(result.isError, candidate).toBe(true);
      expect(resultText(result), candidate).toMatch(/sensitive|denied/i);
    }
    expect(surface.parse).not.toHaveBeenCalled();
  });

  it('rejects a symlink or junction that resolves outside the configured root', async () => {
    const link = path.join(importRoot, 'escape');
    fs.writeFileSync(path.join(outsideDir, 'secret.json'), '[]');
    fs.symlinkSync(outsideDir, link, process.platform === 'win32' ? 'junction' : 'dir');

    const result = await surface.harvest({
      source: 'universal',
      file_path: 'escape/secret.json',
    }).catch((error: unknown) => ({
      content: [{ type: 'text' as const, text: String(error) }],
    }));

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/outside|symlink|denied/i);
    expect(surface.parse).not.toHaveBeenCalled();
  });

  it('rejects a benign junction name that resolves to an in-root sensitive directory', async () => {
    const secretDir = path.join(importRoot, '.ssh');
    const alias = path.join(importRoot, 'notes');
    fs.mkdirSync(secretDir);
    fs.writeFileSync(path.join(secretDir, 'config'), 'Host secret');
    fs.symlinkSync(secretDir, alias, process.platform === 'win32' ? 'junction' : 'dir');

    const result = await surface.harvest({
      source: 'universal',
      file_path: 'notes/config',
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/sensitive|denied/i);
    expect(surface.parse).not.toHaveBeenCalled();
  });

  it('imports a regular relative file from the configured root', async () => {
    fs.writeFileSync(path.join(importRoot, 'export.json'), '[]');

    const result = await surface.harvest({
      source: 'universal',
      file_path: 'export.json',
    });

    expect(result.isError).not.toBe(true);
    expect(resultText(result)).toContain('No conversations found');
    expect(surface.parse).toHaveBeenCalledWith([]);
  });

  it('requires an explicitly configured import root for local paths', async () => {
    delete process.env[surface.envName];

    const result = await surface.harvest({
      source: 'universal',
      file_path: 'export.json',
    }).catch((error: unknown) => ({
      content: [{ type: 'text' as const, text: String(error) }],
    }));

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain(surface.envName);
    expect(surface.parse).not.toHaveBeenCalled();
  });

  it('rejects ambiguous calls that provide both raw data and a file path', async () => {
    fs.writeFileSync(path.join(importRoot, 'export.json'), '[]');

    const ingestResult = await surface.ingest({
      content: 'raw text',
      file_path: 'export.json',
      type_hint: 'plaintext',
      importance: 'normal',
    });
    const harvestResult = await surface.harvest({
      source: 'universal',
      data: '[]',
      file_path: 'export.json',
    });

    expect(ingestResult.isError).toBe(true);
    expect(harvestResult.isError).toBe(true);
    expect(resultText(ingestResult)).toMatch(/either.*not both/i);
    expect(resultText(harvestResult)).toMatch(/either.*not both/i);
    expect(surface.parse).not.toHaveBeenCalled();
  });
});

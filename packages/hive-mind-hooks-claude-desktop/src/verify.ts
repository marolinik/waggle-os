import { spawn } from 'node:child_process';
import { constants, existsSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createLogger, type Logger } from '@waggle/hive-mind-shim-core';
import { MCP_SERVER_NAME } from './install.js';
import { resolvePaths, type ResolvePathsOptions } from './paths.js';

export interface VerifyCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface VerifyResult {
  ok: boolean;
  checks: VerifyCheck[];
}

export interface VerifyOptions extends ResolvePathsOptions {
  logger?: Logger;
  spawnImpl?: typeof spawn;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function fileReadable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function probeEntrySyntax(
  entry: string,
  spawnImpl: typeof spawn,
  timeoutMs: number,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawnImpl(
      process.execPath,
      ['--check', entry],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGTERM'); } catch { /* already exited */ }
      resolve({ ok: false, output: 'timed out checking waggle-memory-mcp entry' });
    }, timeoutMs);
    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, output: err instanceof Error ? err.message : String(err) });
    });
    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString('utf-8').slice(0, 200);
      const error = Buffer.concat(stderr).toString('utf-8').slice(0, 200);
      resolve({ ok: code === 0, output: code === 0 ? out : error });
    });
  });
}

export async function verify(opts: VerifyOptions = {}): Promise<VerifyResult> {
  const log = opts.logger ?? createLogger({ name: 'claude-desktop-hooks/verify' });
  const paths = resolvePaths(opts);
  const checks: VerifyCheck[] = [];

  if (!existsSync(paths.configPath)) {
    checks.push({
      name: 'claude_desktop_config.json exists',
      ok: false,
      detail: paths.configPath,
    });
    return { ok: false, checks };
  }
  checks.push({
    name: 'claude_desktop_config.json exists',
    ok: true,
    detail: paths.configPath,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = asRecord(JSON.parse(await readFile(paths.configPath, 'utf-8'))) ?? {};
    checks.push({ name: 'config parses as JSON', ok: true });
  } catch (err) {
    checks.push({
      name: 'config parses as JSON',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, checks };
  }

  const servers = asRecord(parsed['mcpServers']);
  const containsEntry = servers !== undefined
    && Object.prototype.hasOwnProperty.call(servers, MCP_SERVER_NAME);
  checks.push({
    name: `mcpServers contains '${MCP_SERVER_NAME}' entry`,
    ok: containsEntry,
  });

  const serverEntry = containsEntry ? asRecord(servers[MCP_SERVER_NAME]) : undefined;
  const command = serverEntry?.['command'];
  const args = serverEntry?.['args'];
  const mcpEntry = Array.isArray(args) && typeof args[0] === 'string' ? args[0] : undefined;
  const pointsAtEntry = typeof command === 'string' && command.trim().length > 0
    && mcpEntry !== undefined;
  checks.push({
    name: 'server entry points at waggle-memory-mcp',
    ok: pointsAtEntry,
  });

  const readable = mcpEntry !== undefined && await fileReadable(mcpEntry);
  checks.push({
    name: 'memory-mcp entry readable on disk',
    ok: readable,
    detail: mcpEntry ?? 'missing args[0]',
  });

  let syntaxProbe = { ok: false, output: 'missing args[0]' };
  if (mcpEntry !== undefined) {
    syntaxProbe = await probeEntrySyntax(mcpEntry, opts.spawnImpl ?? spawn, 4000);
  }
  checks.push({
    name: 'memory-mcp entry parses (node --check)',
    ok: syntaxProbe.ok,
    detail: syntaxProbe.output,
  });

  checks.push({
    name: 'install pointer present',
    ok: existsSync(paths.pointerPath),
    detail: paths.pointerPath,
  });

  const ok = checks.every((check) => check.ok);
  log.info('verify complete', {
    ok,
    total: checks.length,
    failed: checks.filter((check) => !check.ok).length,
  });
  return { ok, checks };
}

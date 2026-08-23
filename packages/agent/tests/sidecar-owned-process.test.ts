import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSidecarOwnedProcess } from '../src/sidecar-owned-process.js';

const TARGET_SOURCE = String.raw`
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const marker = process.argv[1];
const descendant = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
  detached: true,
  windowsHide: true,
  shell: false,
  stdio: 'ignore',
});
descendant.unref();
fs.writeFileSync(marker, JSON.stringify({ targetPid: process.pid, descendantPid: descendant.pid }));
setInterval(() => {}, 1000);
`;

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Condition not met within ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function forceKillTree(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  if (!isAlive(pid)) return;
  const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows';
  try {
    execFileSync(path.join(windowsRoot, 'System32', 'taskkill.exe'), [
      '/PID', String(pid), '/T', '/F',
    ], { stdio: 'ignore', windowsHide: true });
  } catch { /* best-effort fixture cleanup */ }
}

describe('sidecar-owned process supervision', () => {
  it.runIf(process.platform === 'win32')(
    'reproduces the detached descendant left by a root-only sidecar kill',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-orphan-control-'));
      tempDirs.push(dir);
      const marker = path.join(dir, 'pids.json');
      const target = spawn(process.execPath, ['-e', TARGET_SOURCE, marker], {
        stdio: 'ignore',
        windowsHide: true,
      });
      let targetPid = 0;
      let descendantPid = 0;

      try {
        await waitFor(() => fs.existsSync(marker));
        ({ targetPid, descendantPid } = JSON.parse(fs.readFileSync(marker, 'utf8')) as {
          targetPid: number;
          descendantPid: number;
        });
        expect(isAlive(descendantPid)).toBe(true);

        target.kill();

        await waitFor(() => !isAlive(targetPid));
        expect(isAlive(descendantPid)).toBe(true);
      } finally {
        forceKillTree(target.pid ?? 0);
        forceKillTree(targetPid);
        forceKillTree(descendantPid);
      }
    },
    20_000,
  );

  it.runIf(process.platform === 'win32')(
    'kills the target and its descendant when the sidecar IPC owner disappears',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-owned-process-'));
      tempDirs.push(dir);
      const marker = path.join(dir, 'pids.json');
      const supervisor = spawnSidecarOwnedProcess(process.execPath, [
        '-e', TARGET_SOURCE, marker,
      ], {
        env: {
          ...process.env,
          SystemRoot: path.join(dir, 'attacker-controlled-system-root'),
          WINDIR: path.join(dir, 'attacker-controlled-windir'),
        },
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      });
      let targetPid = 0;
      let descendantPid = 0;

      try {
        await waitFor(() => fs.existsSync(marker));
        ({ targetPid, descendantPid } = JSON.parse(fs.readFileSync(marker, 'utf8')) as {
          targetPid: number;
          descendantPid: number;
        });
        expect(isAlive(targetPid)).toBe(true);
        expect(isAlive(descendantPid)).toBe(true);

        supervisor.disconnect();

        await waitFor(() => !isAlive(targetPid) && !isAlive(descendantPid));
        await waitFor(() => supervisor.exitCode !== null);
        expect(isAlive(targetPid)).toBe(false);
        expect(isAlive(descendantPid)).toBe(false);
        expect(supervisor.exitCode).toBe(0);
      } finally {
        forceKillTree(supervisor.pid ?? 0);
        forceKillTree(targetPid);
        forceKillTree(descendantPid);
      }
    },
    20_000,
  );
});

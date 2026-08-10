import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import path from 'node:path';

/**
 * Keep a sidecar-owned process behind an IPC supervisor. The Tauri shell may
 * terminate the Node sidecar abruptly on Windows, bypassing every Fastify
 * shutdown hook. IPC loss is therefore the crash-safe ownership signal: the
 * supervisor survives long enough to terminate only its own process tree.
 *
 * Interactive `/api/tools/launch` processes intentionally do not use this
 * helper because they are user-owned and must survive a sidecar restart.
 */
export const SIDECAR_OWNED_PROCESS_SUPERVISOR_SOURCE = String.raw`
const { spawn } = require('node:child_process');
const path = require('node:path');
const executable = process.argv[1];
const args = JSON.parse(process.argv[2] || '[]');
const config = JSON.parse(process.argv[3] || '{}');
const targetEnv = { ...process.env };
delete targetEnv.NODE_CHANNEL_FD;
delete targetEnv.NODE_UNIQUE_ID;
const child = spawn(executable, args, {
  detached: process.platform !== 'win32',
  env: targetEnv,
  shell: false,
  stdio: ['inherit', 'inherit', 'inherit'],
  windowsHide: config.windowsHide !== false,
  windowsVerbatimArguments: config.windowsVerbatimArguments === true,
});
let stopping = false;
let forceTimer;
const finish = (code) => {
  if (forceTimer) clearTimeout(forceTimer);
  process.exit(code);
};
const stopTree = () => {
  if (stopping) return;
  stopping = true;
  if (!child.pid) return finish(1);
  forceTimer = setTimeout(() => finish(1), 5000);
  if (process.platform === 'win32') {
    if (typeof config.taskkillPath !== 'string' || !path.win32.isAbsolute(config.taskkillPath)) {
      return finish(1);
    }
    const killer = spawn(config.taskkillPath, ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
    });
    killer.once('error', () => finish(1));
    killer.once('exit', (code) => finish(code === 0 ? 0 : 1));
    return;
  }
  try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch {} }
  setTimeout(() => {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} }
    finish(0);
  }, 1500).unref();
};
child.once('error', (error) => {
  try { process.stderr.write(String(error && error.message ? error.message : error)); } catch {}
  finish(1);
});
child.once('exit', (code, signal) => {
  if (!stopping) finish(code === null ? (signal ? 1 : 0) : code);
});
process.once('disconnect', stopTree);
process.on('message', (message) => { if (message === 'shutdown') stopTree(); });
process.once('SIGTERM', stopTree);
process.once('SIGINT', stopTree);
`;

export interface SidecarOwnedProcessOptions
  extends Omit<SpawnOptions, 'shell' | 'stdio' | 'windowsVerbatimArguments'> {
  stdio: SpawnOptions['stdio'];
  windowsVerbatimArguments?: boolean;
}

export function resolveOwnedProcessTaskkillPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const candidate = env.SystemRoot ?? env.WINDIR;
  const windowsRoot = candidate && path.win32.isAbsolute(candidate)
    ? path.win32.normalize(candidate)
    : 'C:\\Windows';
  return path.win32.join(windowsRoot, 'System32', 'taskkill.exe');
}

export function spawnSidecarOwnedProcess(
  executable: string,
  args: string[],
  options: SidecarOwnedProcessOptions,
): ChildProcess {
  if (!Array.isArray(options.stdio) || options.stdio.length !== 3) {
    throw new Error('Sidecar-owned processes require exactly stdin/stdout/stderr descriptors');
  }
  const targetConfig = JSON.stringify({
    taskkillPath: resolveOwnedProcessTaskkillPath(),
    windowsHide: options.windowsHide !== false,
    windowsVerbatimArguments: options.windowsVerbatimArguments === true,
  });
  return spawn(process.execPath, [
    '-e',
    SIDECAR_OWNED_PROCESS_SUPERVISOR_SOURCE,
    executable,
    JSON.stringify(args),
    targetConfig,
  ], {
    ...options,
    shell: false,
    stdio: [...options.stdio, 'ipc'],
    windowsHide: true,
    windowsVerbatimArguments: false,
  });
}

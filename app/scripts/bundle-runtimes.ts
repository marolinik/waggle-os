#!/usr/bin/env npx tsx

/**
 * bundle-runtimes — Download and prepare Node.js + Python runtimes
 * for embedding in the Tauri installer.
 *
 * Usage:
 *   npx tsx app/scripts/bundle-runtimes.ts          # Download all
 *   npx tsx app/scripts/bundle-runtimes.ts --status  # Check what's ready
 *
 * Output directory: app/src-tauri/resources/
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { getNodeDownloadUrl, getPythonDownloadUrl, getResourcePaths, getBundleStatus } from './bundle-utils.js';

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
const RESOURCES_DIR = path.resolve(_dirname, '..', 'src-tauri', 'resources');

const NODE_VERSION = '20.11.1';
const PYTHON_VERSION = '3.11.8';

// ─── Side-effect functions (download / install) ─────────────────────────────

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`  Downloading: ${url}`);
  console.log(`  Destination: ${destPath}`);

  await mkdir(path.dirname(destPath), { recursive: true });

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} downloading ${url}`);
  }

  const fileStream = createWriteStream(destPath);
  // Convert web ReadableStream to Node.js Readable
  const body = res.body;
  if (!body) throw new Error('Empty response body');
  const nodeStream = Readable.fromWeb(body as import('node:stream/web').ReadableStream);
  await pipeline(nodeStream, fileStream);
  console.log(`  Done.`);
}

async function downloadNodeBinary(version: string, resourcesDir: string): Promise<void> {
  const url = getNodeDownloadUrl(version);
  const dest = getResourcePaths(resourcesDir).node;
  await downloadFile(url, dest);
}

async function downloadPythonEmbed(version: string, resourcesDir: string): Promise<void> {
  if (process.platform !== 'win32') {
    console.warn('Warning: Python embed bundling is currently only supported on Windows.');
    console.warn('On macOS/Linux, use system Python or a different bundling strategy.');
    return;
  }

  const url = getPythonDownloadUrl(version);
  const zipDest = path.join(resourcesDir, 'python', `python-${version}-embed.zip`);
  await downloadFile(url, zipDest);

  const pythonDir = path.join(resourcesDir, 'python');
  console.log(`  Extracting to ${pythonDir}...`);
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -Force -Path "${zipDest}" -DestinationPath "${pythonDir}"`,
  ]);

  await rm(zipDest, { force: true });
  console.log(`  Extracted.`);
}

async function installLiteLLM(resourcesDir: string): Promise<void> {
  const pythonExe = getResourcePaths(resourcesDir).python;
  if (!existsSync(pythonExe)) {
    throw new Error('Python must be downloaded before installing LiteLLM');
  }

  const pythonDir = path.join(resourcesDir, 'python');
  const pthFiles = readdirSync(pythonDir).filter((f) => f.endsWith('._pth'));
  for (const pth of pthFiles) {
    const pthPath = path.join(pythonDir, pth);
    const content = readFileSync(pthPath, 'utf8');
    const patched = content.replace(/^#\s*import site/m, 'import site');
    writeFileSync(pthPath, patched);
  }

  const getPipUrl = 'https://bootstrap.pypa.io/get-pip.py';
  const getPipDest = path.join(pythonDir, 'get-pip.py');
  await downloadFile(getPipUrl, getPipDest);

  console.log('  Installing pip...');
  const targetDir = path.join(pythonDir, 'Lib', 'site-packages');
  await mkdir(targetDir, { recursive: true });
  execFileSync(pythonExe, [getPipDest, '--target', targetDir, '--no-warn-script-location'], {
    stdio: 'inherit',
  });

  console.log('  Installing litellm...');
  execFileSync(pythonExe, ['-m', 'pip', 'install', '--target', targetDir, 'litellm', '--no-warn-script-location'], {
    stdio: 'inherit',
    env: { ...process.env, PYTHONPATH: targetDir },
  });

  await rm(getPipDest, { force: true });
  console.log('  LiteLLM installed.');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--status')) {
    const status = getBundleStatus(RESOURCES_DIR);
    console.log('Bundle status:');
    console.log(`  Node.js : ${status.nodeReady ? 'READY' : 'NOT FOUND'}`);
    console.log(`  Python  : ${status.pythonReady ? 'READY' : 'NOT FOUND'}`);
    console.log(`  LiteLLM : ${status.litellmReady ? 'READY' : 'NOT FOUND'}`);
    return;
  }

  console.log('=== Waggle Runtime Bundler ===\n');
  console.log(`Resources dir: ${RESOURCES_DIR}`);
  console.log(`Node.js ${NODE_VERSION} | Python ${PYTHON_VERSION}\n`);

  await mkdir(RESOURCES_DIR, { recursive: true });

  const status = getBundleStatus(RESOURCES_DIR);

  if (!status.nodeReady) {
    console.log('[1/3] Downloading Node.js...');
    await downloadNodeBinary(NODE_VERSION, RESOURCES_DIR);
  } else {
    console.log('[1/3] Node.js already present, skipping.');
  }

  if (!status.pythonReady) {
    console.log('[2/3] Downloading embedded Python...');
    await downloadPythonEmbed(PYTHON_VERSION, RESOURCES_DIR);
  } else {
    console.log('[2/3] Python already present, skipping.');
  }

  if (!status.litellmReady) {
    console.log('[3/3] Installing LiteLLM...');
    await installLiteLLM(RESOURCES_DIR);
  } else {
    console.log('[3/3] LiteLLM already present, skipping.');
  }

  console.log('\n=== All runtimes ready! ===');
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

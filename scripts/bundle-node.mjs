#!/usr/bin/env node
/**
 * Downloads the correct Node.js binary for the current platform and places it
 * in app/src-tauri/resources/ for Tauri bundling.
 *
 * Uses Node.js official distribution (https://nodejs.org/dist/).
 * Caches in scripts/.cache/ to avoid re-downloading.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const resourcesDir = path.join(root, 'app', 'src-tauri', 'resources');
const cacheDir = path.join(__dirname, '.cache');

const NODE_VERSION = '20.18.1';
const platform = process.platform;
const arch = process.env.TARGET_ARCH || process.arch;

fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(resourcesDir, { recursive: true });

const destBinary = platform === 'win32'
  ? path.join(resourcesDir, 'node.exe')
  : path.join(resourcesDir, 'node');

// Check cache
const cacheKey = `node-v${NODE_VERSION}-${platform}-${arch}`;
const cachedBinary = path.join(cacheDir, platform === 'win32' ? `${cacheKey}.exe` : cacheKey);

if (fs.existsSync(cachedBinary)) {
  console.log(`[bundle-node] Using cached Node.js v${NODE_VERSION} (${platform}-${arch})`);
  fs.copyFileSync(cachedBinary, destBinary);
  if (platform !== 'win32') {
    fs.chmodSync(destBinary, 0o755);
  }
  const size = (fs.statSync(destBinary).size / 1024 / 1024).toFixed(1);
  console.log(`[bundle-node] → ${destBinary} (${size} MB)`);
  process.exit(0);
}

// Download
if (platform === 'win32') {
  // Windows: direct .exe download
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/win-${arch}/node.exe`;
  console.log(`[bundle-node] Downloading Node.js v${NODE_VERSION} (${platform}-${arch})...`);
  console.log(`  ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    console.error(`[bundle-node] Download failed: HTTP ${response.status}`);
    process.exit(1);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(cachedBinary, buffer);
  fs.copyFileSync(cachedBinary, destBinary);

} else {
  // macOS/Linux: download .tar.gz and extract bin/node
  const nodeArch = arch === 'arm64' ? 'arm64' : 'x64';
  const osPart = platform === 'darwin' ? 'darwin' : 'linux';
  const archiveName = `node-v${NODE_VERSION}-${osPart}-${nodeArch}.tar.gz`;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`;

  console.log(`[bundle-node] Downloading Node.js v${NODE_VERSION} (${osPart}-${nodeArch})...`);
  console.log(`  ${url}`);

  const archivePath = path.join(cacheDir, archiveName);

  const response = await fetch(url);
  if (!response.ok) {
    console.error(`[bundle-node] Download failed: HTTP ${response.status}`);
    process.exit(1);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(archivePath, buffer);

  // Extract bin/node from the tarball (safe — no user input in args)
  const extractDir = path.join(cacheDir, 'extract');
  fs.mkdirSync(extractDir, { recursive: true });
  execFileSync('tar', ['xzf', archivePath, '-C', extractDir, '--strip-components=1', 'bin/node'], {
    stdio: 'inherit',
  });

  const extractedNode = path.join(extractDir, 'bin', 'node');
  fs.copyFileSync(extractedNode, cachedBinary);
  fs.copyFileSync(cachedBinary, destBinary);
  fs.chmodSync(destBinary, 0o755);

  // Cleanup extracted files
  fs.rmSync(extractDir, { recursive: true, force: true });
}

const size = (fs.statSync(destBinary).size / 1024 / 1024).toFixed(1);
console.log(`[bundle-node] Node.js v${NODE_VERSION} (${platform}-${arch}) → ${destBinary} (${size} MB)`);

#!/usr/bin/env node
/**
 * Download and verify the official Node.js distribution used by the desktop
 * sidecar. The full archive is required because it is the authoritative source
 * for the matching Node binary, Node license, and bundled npm runtime.
 *
 * WAGGLE_BUNDLED_NODE_VERSION may pin an exact release. Otherwise the exact
 * version running this staging script is used so native modules and the
 * packaged runtime share a Node ABI.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const resourcesDir = path.join(root, 'app', 'src-tauri', 'resources');
const cacheDir = path.join(__dirname, '.cache');
const stagedRuntimeDir = path.join(
  resourcesDir,
  'node_modules',
  'waggle-node-runtime',
);

const NODE_VERSION = process.env.WAGGLE_BUNDLED_NODE_VERSION ?? process.versions.node;
if (!/^\d+\.\d+\.\d+$/.test(NODE_VERSION)) {
  console.error(`[bundle-node] FATAL - invalid Node.js version: ${NODE_VERSION}`);
  process.exit(1);
}

const platform = process.platform;
const arch = process.env.TARGET_ARCH || process.arch;
if (arch === 'universal') {
  console.error(
    '[bundle-node] FATAL - TARGET_ARCH=universal is not supported.\n'
    + '  Node.js ships per-arch binaries. Build arm64 and x64 separately.',
  );
  process.exit(1);
}
if (!['x64', 'arm64'].includes(arch)) {
  console.error(`[bundle-node] FATAL - unsupported target architecture: ${arch}`);
  process.exit(1);
}

const archivePlatform = platform === 'win32'
  ? 'win'
  : platform === 'darwin'
    ? 'darwin'
    : platform === 'linux'
      ? 'linux'
      : null;
if (!archivePlatform) {
  console.error(`[bundle-node] FATAL - unsupported platform: ${platform}`);
  process.exit(1);
}

const archiveExtension = platform === 'win32' ? 'zip' : 'tar.gz';
const distributionName = `node-v${NODE_VERSION}-${archivePlatform}-${arch}`;
const archiveName = `${distributionName}.${archiveExtension}`;
const distributionUrl = `https://nodejs.org/dist/v${NODE_VERSION}`;
const archivePath = path.join(cacheDir, archiveName);
const shasumsPath = path.join(cacheDir, `node-v${NODE_VERSION}-SHASUMS256.txt`);
const extractDir = path.join(cacheDir, `${distributionName}-verified`);
const extractedRoot = path.join(extractDir, distributionName);
const nodeSource = platform === 'win32'
  ? path.join(extractedRoot, 'node.exe')
  : path.join(extractedRoot, 'bin', 'node');
const npmSource = path.join(
  extractedRoot,
  ...(platform === 'win32'
    ? ['node_modules', 'npm']
    : ['lib', 'node_modules', 'npm']),
);
const nodeLicenseSource = path.join(extractedRoot, 'LICENSE');
const destBinary = path.join(resourcesDir, platform === 'win32' ? 'node.exe' : 'node');

function fail(message) {
  console.error(`[bundle-node] FATAL - ${message}`);
  process.exit(1);
}

async function download(url, destination) {
  console.log(`[bundle-node] Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) fail(`download failed: HTTP ${response.status} (${url})`);
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, Buffer.from(await response.arrayBuffer()));
  fs.renameSync(temporary, destination);
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function expectedArchiveHash(shasums) {
  for (const line of shasums.split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/.exec(line.trim());
    if (match?.[2] === archiveName) return match[1];
  }
  return null;
}

function extractedRuntimeComplete() {
  return [
    nodeSource,
    nodeLicenseSource,
    path.join(npmSource, 'LICENSE'),
    path.join(npmSource, 'bin', 'npm-cli.js'),
    path.join(npmSource, 'bin', 'npx-cli.js'),
  ].every((file) => fs.existsSync(file) && fs.lstatSync(file).isFile());
}

function directorySizeBytes(dir) {
  let bytes = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) bytes += fs.statSync(full).size;
    }
  }
  return bytes;
}

function writeWrappers() {
  const binDir = path.join(stagedRuntimeDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  if (platform === 'win32') {
    const wrapper = (cli) => [
      '@ECHO OFF',
      'SETLOCAL',
      'SET "NODE_EXE=%~dp0\\..\\..\\..\\node.exe"',
      `SET "NPM_CLI_JS=%~dp0\\..\\node_modules\\npm\\bin\\${cli}-cli.js"`,
      '"%NODE_EXE%" "%NPM_CLI_JS%" %*',
      'EXIT /B %ERRORLEVEL%',
      '',
    ].join('\r\n');
    fs.writeFileSync(path.join(binDir, 'npm.cmd'), wrapper('npm'), 'utf8');
    fs.writeFileSync(path.join(binDir, 'npx.cmd'), wrapper('npx'), 'utf8');
    return;
  }

  const wrapper = (cli) => [
    '#!/bin/sh',
    'SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
    `exec "$SCRIPT_DIR/../../../node" "$SCRIPT_DIR/../node_modules/npm/bin/${cli}-cli.js" "$@"`,
    '',
  ].join('\n');
  for (const cli of ['npm', 'npx']) {
    const wrapperPath = path.join(binDir, cli);
    fs.writeFileSync(wrapperPath, wrapper(cli), 'utf8');
    fs.chmodSync(wrapperPath, 0o755);
  }
}

fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(resourcesDir, { recursive: true });

async function loadExpectedHash(refresh = false) {
  if (refresh) fs.rmSync(shasumsPath, { force: true });
  if (!fs.existsSync(shasumsPath)) {
    await download(`${distributionUrl}/SHASUMS256.txt`, shasumsPath);
  }
  const expected = expectedArchiveHash(fs.readFileSync(shasumsPath, 'utf8'));
  if (expected) return expected;
  if (!refresh) return loadExpectedHash(true);
  fail(`official SHASUMS256.txt has no entry for ${archiveName}`);
}

let expectedHash = await loadExpectedHash();
let refreshedShasums = false;

if (fs.existsSync(archivePath) && sha256(archivePath) !== expectedHash) {
  expectedHash = await loadExpectedHash(true);
  refreshedShasums = true;
  if (sha256(archivePath) !== expectedHash) {
    console.warn(`[bundle-node] Discarding checksum-mismatched cache: ${archiveName}`);
    fs.rmSync(archivePath, { force: true });
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
}
if (!fs.existsSync(archivePath)) {
  await download(`${distributionUrl}/${archiveName}`, archivePath);
}
let actualHash = sha256(archivePath);
if (actualHash !== expectedHash && !refreshedShasums) {
  expectedHash = await loadExpectedHash(true);
  refreshedShasums = true;
  actualHash = sha256(archivePath);
}
if (actualHash !== expectedHash) {
  fs.rmSync(archivePath, { force: true });
  fs.rmSync(extractDir, { recursive: true, force: true });
  fail(`SHA-256 mismatch for ${archiveName}: expected ${expectedHash}, got ${actualHash}`);
}
console.log(`[bundle-node] Verified ${archiveName} against official SHASUMS256.txt`);

fs.rmSync(extractDir, { recursive: true, force: true });
fs.mkdirSync(extractDir, { recursive: true });
execFileSync('tar', ['-xf', archivePath, '-C', extractDir], { stdio: 'inherit' });
if (!extractedRuntimeComplete()) {
  fail(`verified archive is missing Node, npm, or required license files: ${archiveName}`);
}

fs.copyFileSync(nodeSource, destBinary);
if (platform !== 'win32') fs.chmodSync(destBinary, 0o755);

fs.rmSync(stagedRuntimeDir, { recursive: true, force: true });
fs.mkdirSync(path.join(stagedRuntimeDir, 'node_modules'), { recursive: true });
fs.copyFileSync(nodeLicenseSource, path.join(stagedRuntimeDir, 'NODE-LICENSE'));
fs.cpSync(npmSource, path.join(stagedRuntimeDir, 'node_modules', 'npm'), {
  recursive: true,
  dereference: true,
});
fs.writeFileSync(
  path.join(stagedRuntimeDir, 'package.json'),
  `${JSON.stringify({
    name: 'waggle-node-runtime',
    private: true,
    version: NODE_VERSION,
    description: 'Verified Node.js npm runtime staged for the Waggle desktop sidecar',
  }, null, 2)}\n`,
  'utf8',
);
writeWrappers();

const npmManifest = JSON.parse(
  fs.readFileSync(path.join(stagedRuntimeDir, 'node_modules', 'npm', 'package.json'), 'utf8'),
);
for (const cli of ['npm', 'npx']) {
  const cliPath = path.join(stagedRuntimeDir, 'node_modules', 'npm', 'bin', `${cli}-cli.js`);
  const version = execFileSync(destBinary, [cliPath, '--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (version !== npmManifest.version) {
    fail(`${cli} preflight returned ${version}; expected npm ${npmManifest.version}`);
  }
}

const nodeSize = (fs.statSync(destBinary).size / 1024 / 1024).toFixed(1);
const npmSize = (directorySizeBytes(stagedRuntimeDir) / 1024 / 1024).toFixed(1);
console.log(
  `[bundle-node] Node.js v${NODE_VERSION} + npm v${npmManifest.version} `
  + `(${platform}-${arch}) -> resources (${nodeSize} MB node, ${npmSize} MB npm runtime)`,
);

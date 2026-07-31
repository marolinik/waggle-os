#!/usr/bin/env node
/**
 * P4/D12 preflight — fail a Tauri build LOUDLY when the arch-parameterized
 * sidecar resources are missing.
 *
 * The tauri.conf.json beforeBuildCommand regenerates ONLY the sidecar JS
 * bundle (build-sidecar.mjs — arch-independent, safe to run arch-blind). The
 * Node runtime and native modules are arch-PARAMETERIZED (TARGET_ARCH) and
 * must be staged by the explicit npm scripts / CI steps that set it — the
 * hook must never regenerate them (an arch-blind re-run on a cross-arch
 * matrix leg clobbers the staged artifacts; P4 review HIGH). But the bundle
 * resources glob (`resources/*`) silently tolerates ABSENT files — a raw
 * `npx tauri build` on a fresh clone would package a binary with no Node
 * runtime at all. This check turns that silent miss into a hard stop.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const resourcesDir = path.join(root, 'app', 'src-tauri', 'resources');
const stagedDepsDir = path.join(resourcesDir, 'node_modules');
const bundledNpmRuntimeDir = path.join(stagedDepsDir, 'waggle-node-runtime');
const bundledNpmBinDir = path.join(bundledNpmRuntimeDir, 'bin');
const bundledNpmPackageDir = path.join(bundledNpmRuntimeDir, 'node_modules', 'npm');
const targetArch = process.env.TARGET_ARCH || process.arch;
const SOURCE_ARTIFACT_PATTERN = /(?:\.map|\.(?:[cm]?ts|tsx)|\.tsbuildinfo)$/i;
const FIRST_PARTY_RUNTIME_ENTRY_PATTERN = /^(?:dist|package\.json|licen[cs]e(?:\.(?:md|txt))?|notice(?:\.(?:md|txt))?)$/i;
const MANUAL_FIRST_PARTY_RUNTIME_TARGETS = new Map([
  ['@waggle/hive-mind-hooks-openclaw', ['dist/handler.bundle.cjs']],
]);
const REQUIRED_SHARP_VERSION = '0.35.3';
const REQUIRED_BETTER_SQLITE_RANGE = '>=12.6.2 <13';
const STAGED_DEPENDENCY_VERSION_ALLOWLISTS = new Map([
  ['brace-expansion', new Set(['1.1.16', '2.1.2', '5.0.7'])],
  ['fast-uri', new Set(['3.1.4'])],
]);
const STAGED_DEPENDENCY_DENYLIST = new Set(['js-yaml']);

const missing = [];
const unsafe = [];

function listFiles(dir) {
  const files = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  return files;
}

function resourceRelative(file) {
  return path.relative(resourcesDir, file).split(path.sep).join('/');
}

function sha256File(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readManifest(packageDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

function listPackageDirs(nodeModulesDir) {
  if (!fs.existsSync(nodeModulesDir)) return [];
  const packageDirs = [];
  const stack = [nodeModulesDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(current, entry.name);
      if (fs.existsSync(path.join(full, 'package.json'))) packageDirs.push(full);
      stack.push(full);
    }
  }
  return packageDirs;
}

function isSupportedBetterSqliteVersion(version) {
  if (typeof version !== 'string') return false;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) return false;
  return major === 12 && (minor > 6 || (minor === 6 && patch >= 2));
}

function stagedDependencyVersionFailures(nodeModulesDir, packageManifests) {
  const manifests = packageManifests ?? listPackageDirs(nodeModulesDir)
    .map((packageDir) => [packageDir, readManifest(packageDir)]);
  const failures = [];

  for (const [packageDir, manifest] of manifests) {
    const relative = path.relative(nodeModulesDir, packageDir).split(path.sep).join('/');
    const normalizedRelative = relative.toLowerCase();
    const isBetterSqlitePath = (
      normalizedRelative === 'better-sqlite3'
      || normalizedRelative.endsWith('/node_modules/better-sqlite3')
    );
    const allowedVersions = STAGED_DEPENDENCY_VERSION_ALLOWLISTS.get(manifest.name);
    if (allowedVersions && !allowedVersions.has(manifest.version)) {
      failures.push(
        `node_modules/${relative} contains ${manifest.name}@${manifest.version}; `
        + `allowed versions: ${[...allowedVersions].join(', ')}`,
      );
    }
    if (isBetterSqlitePath && manifest.name !== 'better-sqlite3') {
      failures.push(
        `node_modules/${relative} must identify as better-sqlite3; `
        + `found name ${JSON.stringify(manifest.name)}`,
      );
    }
    if (
      (isBetterSqlitePath || manifest.name === 'better-sqlite3')
      && !isSupportedBetterSqliteVersion(manifest.version)
    ) {
      failures.push(
        `node_modules/${relative} contains better-sqlite3@${manifest.version}; `
        + `required version: ${REQUIRED_BETTER_SQLITE_RANGE}`,
      );
    }
    if (
      (
        manifest.name === 'sharp'
        || (
          typeof manifest.name === 'string'
          && /^@img\/sharp-(?!libvips-)/.test(manifest.name)
        )
      )
      && manifest.version !== REQUIRED_SHARP_VERSION
    ) {
      failures.push(
        `node_modules/${relative} contains ${manifest.name}@${manifest.version}; `
        + `required version: ${REQUIRED_SHARP_VERSION}`,
      );
    }
    if (STAGED_DEPENDENCY_DENYLIST.has(manifest.name)) {
      failures.push(`node_modules/${relative} contains development-only ${manifest.name}`);
    }
  }

  const bundledBraceDir = path.join(
    nodeModulesDir,
    'waggle-node-runtime',
    'node_modules',
    'npm',
    'node_modules',
    'brace-expansion',
  );
  const bundledBraceVersion = readManifest(bundledBraceDir).version;
  if (bundledBraceVersion !== '2.1.2') {
    failures.push(
      `node_modules/waggle-node-runtime/node_modules/npm/node_modules/brace-expansion `
      + `must be exactly 2.1.2; found ${bundledBraceVersion ?? 'missing'}`,
    );
  }

  return failures;
}

function localWorkspacePackageNames() {
  const names = new Set();
  for (const workspaceRoot of ['packages', 'apps'].map((entry) => path.join(root, entry))) {
    if (!fs.existsSync(workspaceRoot)) continue;
    for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = readManifest(path.join(workspaceRoot, entry.name));
      if (typeof manifest.name === 'string') names.add(manifest.name);
    }
  }
  return names;
}

function collectRuntimeExportTargets(value, targets, condition = '') {
  if (condition === 'types') return;
  if (typeof value === 'string') {
    targets.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectRuntimeExportTargets(entry, targets, condition);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    collectRuntimeExportTargets(entry, targets, key);
  }
}

function firstPartyRuntimeTargets(manifest) {
  const targets = new Set();
  if (typeof manifest.main === 'string') targets.add(manifest.main);
  if (typeof manifest.module === 'string') targets.add(manifest.module);
  if (typeof manifest.bin === 'string') targets.add(manifest.bin);
  else if (manifest.bin && typeof manifest.bin === 'object') {
    for (const entry of Object.values(manifest.bin)) {
      if (typeof entry === 'string') targets.add(entry);
    }
  }
  collectRuntimeExportTargets(manifest.exports, targets);
  for (const entry of MANUAL_FIRST_PARTY_RUNTIME_TARGETS.get(manifest.name) || []) {
    targets.add(entry);
  }
  return targets;
}

function validateFirstPartyRuntimeTargets(packageDir, manifest) {
  const failures = [];
  const distDir = path.resolve(packageDir, 'dist');
  for (const target of firstPartyRuntimeTargets(manifest)) {
    const relative = target.replace(/^\.\//, '').split('/').join(path.sep);
    const resolved = path.resolve(packageDir, relative);
    const withinDist = resolved.startsWith(`${distDir}${path.sep}`);
    let regularRuntimeFile = false;
    let realDistWithinPackage = false;
    let realWithinDist = false;
    if (withinDist && fs.existsSync(resolved)) {
      const stat = fs.lstatSync(resolved);
      regularRuntimeFile = stat.isFile() && !stat.isSymbolicLink();
      if (regularRuntimeFile) {
        const realPackageDir = fs.realpathSync.native(packageDir);
        const realDistDir = fs.realpathSync.native(distDir);
        const realTarget = fs.realpathSync.native(resolved);
        realDistWithinPackage = realDistDir.startsWith(`${realPackageDir}${path.sep}`);
        realWithinDist = realTarget.startsWith(`${realDistDir}${path.sep}`);
      }
    }
    if (
      !withinDist
      || !realDistWithinPackage
      || !realWithinDist
      || !regularRuntimeFile
      || target.includes('*')
    ) {
      failures.push(target);
    }
  }
  return failures;
}

const dependencyOnlyIndex = process.argv.indexOf('--dependency-versions-only');
if (dependencyOnlyIndex >= 0) {
  const target = process.argv[dependencyOnlyIndex + 1];
  if (!target) {
    console.error('[check-sidecar-resources] --dependency-versions-only requires a directory');
    process.exit(1);
  }
  const failures = stagedDependencyVersionFailures(path.resolve(target));
  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }
  console.log('[check-sidecar-resources] staged dependency versions are release-safe');
  process.exit(0);
}

const servicePath = path.join(resourcesDir, 'service.js');
if (!fs.existsSync(servicePath)) {
  missing.push('resources/service.js (run: node scripts/build-sidecar.mjs)');
} else {
  const service = fs.readFileSync(servicePath, 'utf8');
  if (/(?:\/\/|\/\*)[#@]\s*sourceMappingURL\s*=/.test(service)) {
    unsafe.push('resources/service.js contains a sourceMappingURL directive');
  }
}

const canonicalMarketplaceDb = path.join(root, 'packages', 'marketplace', 'marketplace.db');
const marketplaceResource = path.join(resourcesDir, 'marketplace.db');
for (const suffix of ['-wal', '-shm', '-journal']) {
  if (fs.existsSync(`${canonicalMarketplaceDb}${suffix}`)) {
    unsafe.push(`packages/marketplace/marketplace.db${suffix} must not be present while staging`);
  }
  if (fs.existsSync(`${marketplaceResource}${suffix}`)) {
    unsafe.push(`resources/marketplace.db${suffix} must not be packaged`);
  }
}
const canonicalMarketplaceIsRegular = fs.existsSync(canonicalMarketplaceDb)
  && fs.lstatSync(canonicalMarketplaceDb).isFile()
  && !fs.lstatSync(canonicalMarketplaceDb).isSymbolicLink();
const marketplaceResourceIsRegular = fs.existsSync(marketplaceResource)
  && fs.lstatSync(marketplaceResource).isFile()
  && !fs.lstatSync(marketplaceResource).isSymbolicLink();
if (!canonicalMarketplaceIsRegular) {
  missing.push('packages/marketplace/marketplace.db canonical build input');
}
if (!fs.existsSync(marketplaceResource)) {
  missing.push('resources/marketplace.db (run: node scripts/build-sidecar.mjs)');
} else if (!marketplaceResourceIsRegular) {
  unsafe.push('resources/marketplace.db must be a regular file');
} else if (
  canonicalMarketplaceIsRegular
  && sha256File(marketplaceResource) !== sha256File(canonicalMarketplaceDb)
) {
  unsafe.push('resources/marketplace.db does not match the canonical marketplace database');
}

const sourceArtifacts = fs.existsSync(resourcesDir)
  ? fs.readdirSync(resourcesDir, { withFileTypes: true })
    .filter((entry) => /\.(?:map|tsx?)$/i.test(entry.name))
    .map((entry) => entry.name)
  : [];
for (const artifact of sourceArtifacts) {
  unsafe.push(`resources/${artifact} must not be packaged`);
}

const stagedPackageDirs = listPackageDirs(stagedDepsDir);
const stagedPackageManifests = stagedPackageDirs
  .map((packageDir) => [packageDir, readManifest(packageDir)]);
for (const failure of stagedDependencyVersionFailures(stagedDepsDir, stagedPackageManifests)) {
  unsafe.push(`resources/${failure}`);
}
const firstPartyRoot = path.join(stagedDepsDir, '@waggle');
const firstPartyPackageDirs = new Map();
if (fs.existsSync(firstPartyRoot)) {
  for (const packageEntry of fs.readdirSync(firstPartyRoot, { withFileTypes: true })) {
    if (!packageEntry.isDirectory()) continue;
    firstPartyPackageDirs.set(
      path.join(firstPartyRoot, packageEntry.name),
      `@waggle/${packageEntry.name}`,
    );
  }
}
const workspacePackageNames = localWorkspacePackageNames();
for (const name of workspacePackageNames) {
  const directPackageDir = path.join(stagedDepsDir, ...name.split('/'));
  if (fs.existsSync(directPackageDir)) {
    firstPartyPackageDirs.set(directPackageDir, name);
  }
}
for (const [packageDir, manifest] of stagedPackageManifests) {
  const { name } = manifest;
  if (
    typeof name === 'string'
    && (name.startsWith('@waggle/') || workspacePackageNames.has(name))
  ) {
    firstPartyPackageDirs.set(packageDir, name);
  }
}
for (const [packageDir, expectedName] of firstPartyPackageDirs) {
  let manifest = {};
  const manifestPath = path.join(packageDir, 'package.json');
  try {
    const stat = fs.lstatSync(manifestPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('manifest must be a regular file');
    }
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('manifest must contain a JSON object');
    }
    if (parsed.name !== expectedName) {
      throw new Error(`manifest name ${JSON.stringify(parsed.name)} does not match ${expectedName}`);
    }
    manifest = parsed;
  } catch (err) {
    unsafe.push(
      `resources/${resourceRelative(manifestPath)} is missing or invalid: `
      + (err instanceof Error ? err.message : String(err)),
    );
  }
  for (const entry of fs.readdirSync(packageDir, { withFileTypes: true })) {
    if (FIRST_PARTY_RUNTIME_ENTRY_PATTERN.test(entry.name)) continue;
    const relative = resourceRelative(path.join(packageDir, entry.name));
    unsafe.push(`resources/${relative} is not a runtime package entry`);
  }
  for (const file of listFiles(packageDir)) {
    if (SOURCE_ARTIFACT_PATTERN.test(file)) {
      unsafe.push(`resources/${resourceRelative(file)} must not be packaged`);
    }
    if (
      /\.(?:[cm]?js)$/i.test(file)
      && /(?:\/\/|\/\*)[#@]\s*sourceMappingURL\s*=/.test(fs.readFileSync(file, 'utf8'))
    ) {
      unsafe.push(`resources/${resourceRelative(file)} contains a sourceMappingURL directive`);
    }
  }
  for (const target of validateFirstPartyRuntimeTargets(packageDir, manifest)) {
    unsafe.push(
      `resources/${resourceRelative(packageDir)} has an invalid or missing runtime target: ${target}`,
    );
  }
}

const nodeBinary = process.platform === 'win32' ? 'node.exe' : 'node';
const nodePath = path.join(resourcesDir, nodeBinary);
const npmCliPath = path.join(bundledNpmPackageDir, 'bin', 'npm-cli.js');
const npxCliPath = path.join(bundledNpmPackageDir, 'bin', 'npx-cli.js');
const npmWrapperPath = path.join(
  bundledNpmBinDir,
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
);
const npxWrapperPath = path.join(
  bundledNpmBinDir,
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
);
const bundledNpmFiles = [
  path.join(bundledNpmRuntimeDir, 'package.json'),
  path.join(bundledNpmRuntimeDir, 'NODE-LICENSE'),
  path.join(bundledNpmPackageDir, 'LICENSE'),
  npmCliPath,
  npxCliPath,
  npmWrapperPath,
  npxWrapperPath,
];
for (const file of bundledNpmFiles) {
  if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) {
    missing.push(`resources/${resourceRelative(file)} (run: node scripts/bundle-node.mjs)`);
  }
}
if (process.platform !== 'win32') {
  for (const wrapper of [npmWrapperPath, npxWrapperPath]) {
    if (fs.existsSync(wrapper) && (fs.statSync(wrapper).mode & 0o111) === 0) {
      unsafe.push(`resources/${resourceRelative(wrapper)} is not executable`);
    }
  }
}
let bundledNodeVersion = null;
if (!fs.existsSync(nodePath)) {
  missing.push(`resources/${nodeBinary} (run: node scripts/bundle-node.mjs)`);
} else {
  try {
    const bundledRuntime = JSON.parse(execFileSync(nodePath, [
      '-p',
      'JSON.stringify({ arch: process.arch, version: process.versions.node })',
    ], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim());
    bundledNodeVersion = bundledRuntime.version;
    // The checker may run under a different Node major than the bundled runtime.
    // The native-module probe below is the authoritative ABI compatibility check.
    if (bundledRuntime.arch !== targetArch) {
      missing.push(
        `resources/${nodeBinary} architecture ${bundledRuntime.arch} does not match target ${targetArch}`,
      );
    }
  } catch (err) {
    missing.push(`resources/${nodeBinary} is not executable (${err.message})`);
  }
}

if (
  fs.existsSync(nodePath)
  && bundledNpmFiles.every((file) => fs.existsSync(file))
) {
  try {
    const runtimeManifest = readManifest(bundledNpmRuntimeDir);
    const npmManifest = readManifest(bundledNpmPackageDir);
    if (runtimeManifest.name !== 'waggle-node-runtime') {
      throw new Error('runtime manifest has an unexpected name');
    }
    if (runtimeManifest.version !== bundledNodeVersion) {
      throw new Error(
        `runtime manifest Node ${runtimeManifest.version} does not match bundled Node ${bundledNodeVersion}`,
      );
    }
    if (typeof npmManifest.version !== 'string' || npmManifest.version.length === 0) {
      throw new Error('npm manifest has no version');
    }
    const runBundledCli = (cliPath) => execFileSync(nodePath, [cliPath, '--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const runWrapper = (wrapperPath) => {
      if (process.platform === 'win32') {
        return execFileSync(process.env.ComSpec || 'cmd.exe', [
          '/d',
          '/s',
          '/c',
          `""${wrapperPath}" --version"`,
        ], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsVerbatimArguments: true,
        }).trim();
      }
      return execFileSync(wrapperPath, ['--version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    };
    const versions = [
      runBundledCli(npmCliPath),
      runBundledCli(npxCliPath),
      runWrapper(npmWrapperPath),
      runWrapper(npxWrapperPath),
    ];
    if (versions.some((version) => version !== npmManifest.version)) {
      throw new Error(`npm/npx version mismatch: ${versions.join(', ')}`);
    }
  } catch (err) {
    missing.push(
      `resources bundled npm/npx runtime probe failed (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

const nativeDir = path.join(resourcesDir, 'native');
const nativeEntries = fs.existsSync(nativeDir)
  ? fs.readdirSync(nativeDir).filter((e) => e !== '.gitkeep' && e !== 'onnxruntime')
  : [];
const requiredWindowsNativeFiles = [
  'better_sqlite3.node',
  'vec0.dll',
  'onnxruntime/onnxruntime_binding.node',
];
if (process.platform === 'win32') {
  for (const entry of requiredWindowsNativeFiles) {
    if (!fs.existsSync(path.join(nativeDir, ...entry.split('/')))) {
      missing.push(
        `resources/native/${entry} (run: node scripts/bundle-native-deps.mjs)`,
      );
    }
  }
} else if (process.platform === 'darwin') {
  const requiredMacNativeFiles = [
    'better_sqlite3.node',
    'vec0.dylib',
    'onnxruntime/onnxruntime_binding.node',
  ];
  for (const entry of requiredMacNativeFiles) {
    if (!fs.existsSync(path.join(nativeDir, ...entry.split('/')))) {
      missing.push(`resources/native/${entry} (run: node scripts/bundle-native-deps.mjs)`);
    }
  }
  const onnxDir = path.join(nativeDir, 'onnxruntime');
  const hasOnnxLibrary = fs.existsSync(onnxDir)
    && fs.readdirSync(onnxDir).some((entry) => entry.endsWith('.dylib'));
  if (!hasOnnxLibrary) {
    missing.push('resources/native/onnxruntime/*.dylib (run: node scripts/bundle-native-deps.mjs)');
  }
} else if (nativeEntries.length === 0) {
  missing.push('resources/native/* (run: node scripts/bundle-native-deps.mjs)');
}

// Staged production node_modules for the esbuild-externalized packages
// (better-sqlite3, @fastify/static, mammoth, …). The bundled service.js
// `require()`s these by bare name and resolves them via NODE_PATH=resources/
// node_modules (service.rs). Like the native deps above, staging is done by the
// npm scripts / CI (stage-sidecar-deps.mjs), NOT the arch-blind beforeBuildCommand
// hook — so a raw `npx tauri build` that skips those would package a sidecar that
// dies with MODULE_NOT_FOUND on first boot. Probe a canonical external.
const stagedBetterSqlite = path.join(stagedDepsDir, 'better-sqlite3');
const stagedOnnxRuntime = path.join(stagedDepsDir, 'onnxruntime-node');
const stagedTransformers = path.join(stagedDepsDir, '@huggingface', 'transformers');
const stagedTransformersEntry = path.join(
  stagedTransformers,
  'dist',
  'transformers.node.cjs',
);
const stagedSharp = path.join(stagedDepsDir, 'sharp');
const stagedSharpWindowsBinding = path.join(
  stagedDepsDir,
  '@img',
  'sharp-win32-x64',
  'lib',
  `sharp-win32-x64-${REQUIRED_SHARP_VERSION}.node`,
);
const vecExtension = path.join(
  nativeDir,
  `vec0.${process.platform === 'win32' ? 'dll' : process.platform === 'darwin' ? 'dylib' : 'so'}`,
);
if (!fs.existsSync(path.join(stagedBetterSqlite, 'package.json'))) {
  missing.push('resources/node_modules/* (run: node scripts/stage-sidecar-deps.mjs)');
}
if (!fs.existsSync(path.join(stagedOnnxRuntime, 'package.json'))) {
  missing.push('resources/node_modules/onnxruntime-node (run: node scripts/stage-sidecar-deps.mjs)');
}
if (!fs.existsSync(path.join(stagedTransformers, 'package.json'))) {
  missing.push(
    'resources/node_modules/@huggingface/transformers '
    + '(run: node scripts/stage-sidecar-deps.mjs)',
  );
}
if (!fs.existsSync(stagedTransformersEntry)) {
  missing.push(
    'resources/node_modules/@huggingface/transformers/dist/transformers.node.cjs '
    + '(run: node scripts/stage-sidecar-deps.mjs)',
  );
}
if (!fs.existsSync(path.join(stagedSharp, 'package.json'))) {
  missing.push('resources/node_modules/sharp (run: node scripts/stage-sidecar-deps.mjs)');
}
if (
  process.platform === 'win32'
  && targetArch === 'x64'
  && !fs.existsSync(stagedSharpWindowsBinding)
) {
  missing.push(
    `resources/node_modules/@img/sharp-win32-x64/lib/`
    + `sharp-win32-x64-${REQUIRED_SHARP_VERSION}.node `
    + '(run: node scripts/stage-sidecar-deps.mjs)',
  );
}
if (
  fs.existsSync(nodePath)
  && fs.existsSync(path.join(stagedBetterSqlite, 'package.json'))
  && marketplaceResourceIsRegular
) {
  let marketplaceProbeRoot;
  try {
    marketplaceProbeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-marketplace-probe-'));
    const marketplaceProbeDb = path.join(marketplaceProbeRoot, 'marketplace.db');
    fs.copyFileSync(marketplaceResource, marketplaceProbeDb);
    const marketplaceProbe = [
      'const Database = require(process.argv[1]);',
      'const database = new Database(process.argv[2], { readonly: true, fileMustExist: true });',
      'const integrity = database.pragma("integrity_check", { simple: true });',
      'if (integrity !== "ok") throw new Error(`integrity_check: ${integrity}`);',
      'const foreignKeys = database.pragma("foreign_key_check");',
      'if (foreignKeys.length !== 0) throw new Error("foreign_key_check failed");',
      'const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = \'table\' AND name IN (\'sources\', \'packages\')").all();',
      'database.close();',
      'if (new Set(tables.map((row) => row.name)).size !== 2) throw new Error("required tables missing");',
    ].join('');
    execFileSync(nodePath, [
      '-e',
      marketplaceProbe,
      stagedBetterSqlite,
      marketplaceProbeDb,
    ], {
      cwd: marketplaceProbeRoot,
      env: { ...process.env, NODE_PATH: stagedDepsDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    unsafe.push('resources/marketplace.db failed its SQLite integrity/schema probe');
  } finally {
    if (marketplaceProbeRoot) {
      fs.rmSync(marketplaceProbeRoot, { recursive: true, force: true });
    }
  }
}
if (
  fs.existsSync(nodePath)
  && fs.existsSync(path.join(stagedTransformers, 'package.json'))
  && fs.existsSync(stagedTransformersEntry)
  && fs.existsSync(path.join(stagedSharp, 'package.json'))
  && (
    process.platform !== 'win32'
    || targetArch !== 'x64'
    || fs.existsSync(stagedSharpWindowsBinding)
  )
) {
  try {
    const imageProbe = [
      'const { RawImage } = require(process.argv[1]);',
      'const sharp = require(process.argv[2]);',
      'if (process.argv[3]) require(process.argv[3]);',
      'if (sharp.versions?.emscripten) throw new Error("Sharp fell back to WASM");',
      'void (async () => {',
      'const image = new RawImage(',
      'Uint8Array.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]),',
      '2,2,4);',
      'const buffer = await image.toSharp().resize(1, 1).png().toBuffer();',
      'const signature = Buffer.from([137,80,78,71,13,10,26,10]);',
      'if (buffer.length < signature.length || !buffer.subarray(0, 8).equals(signature)) {',
      'throw new Error("Sharp PNG probe failed");',
      '}',
      '})().catch((error) => { console.error(error); process.exit(1); });',
    ].join('');
    execFileSync(nodePath, [
      '-e',
      imageProbe,
      stagedTransformersEntry,
      stagedSharp,
      ...(
        process.platform === 'win32' && targetArch === 'x64'
          ? [stagedSharpWindowsBinding]
          : []
      ),
    ], {
      cwd: resourcesDir,
      env: { ...process.env, NODE_PATH: stagedDepsDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    missing.push(
      `resources image runtime probe failed for @huggingface/transformers and sharp `
      + `using bundled ${nodeBinary} for ${targetArch} `
      + `(${err instanceof Error ? err.message : String(err)})`,
    );
  }
}
if (
  fs.existsSync(nodePath)
  && fs.existsSync(path.join(stagedBetterSqlite, 'package.json'))
  && fs.existsSync(path.join(stagedOnnxRuntime, 'package.json'))
  && fs.existsSync(vecExtension)
) {
  try {
    const probe = [
      'const Database = require(process.argv[1]);',
      'if (process.arch !== process.argv[2]) throw new Error(`architecture ${process.arch}`);',
      'const database = new Database(\':memory:\');',
      'database.loadExtension(process.argv[3]);',
      'const row = database.prepare(\'SELECT 1 AS ok\').get();',
      'const vec = database.prepare(\'SELECT vec_version() AS version\').get();',
      'database.close();',
      'if (row.ok !== 1) throw new Error(\'SQLite query failed\');',
      'if (typeof vec.version !== \'string\' || vec.version.length === 0) throw new Error(\'sqlite-vec query failed\');',
      'const onnx = require(process.argv[4]);',
      'if (typeof onnx.InferenceSession !== \'function\') throw new Error(\'ONNX binding failed\');',
    ].join('');
    execFileSync(nodePath, [
      '-e',
      probe,
      stagedBetterSqlite,
      targetArch,
      vecExtension,
      stagedOnnxRuntime,
    ], {
      cwd: resourcesDir,
      env: { ...process.env, NODE_PATH: stagedDepsDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    missing.push(
      `resources native runtime probe failed for better-sqlite3, sqlite-vec, or onnxruntime-node `
      + `using bundled ${nodeBinary} for ${targetArch}`,
    );
  }
}

// External agents and hook management run directly from this staged payload;
// none of these packages are available from npm in a packaged installation.
const hookRuntimeEntries = [
  '@waggle/hive-mind-cli/dist/index.js',
  '@waggle/hive-mind-hooks-claude-code/dist/bin/claude-code-hooks-cli.js',
  '@waggle/hive-mind-hooks-claude-desktop/dist/bin/claude-desktop-hooks.js',
  '@waggle/hive-mind-hooks-codex/dist/bin/codex-hooks.js',
  '@waggle/hive-mind-hooks-codex-desktop/dist/bin/codex-desktop-hooks.js',
  '@waggle/hive-mind-hooks-cursor/dist/bin/cursor-hooks.js',
  '@waggle/hive-mind-hooks-hermes/dist/bin/hermes-hooks.js',
  '@waggle/hive-mind-hooks-openclaw/dist/bin/openclaw-hooks.js',
  '@waggle/hive-mind-hooks-openclaw/dist/handler.bundle.cjs',
  'waggle-memory-mcp/dist/index.js',
];
for (const entry of hookRuntimeEntries) {
  if (!fs.existsSync(path.join(stagedDepsDir, ...entry.split('/')))) {
    missing.push(`resources/node_modules/${entry} (run: node scripts/stage-sidecar-deps.mjs)`);
  }
}

if (missing.length > 0 || unsafe.length > 0) {
  console.error('[check-sidecar-resources] FATAL — sidecar resources are not release-safe:');
  for (const m of missing) console.error(`  - ${m}`);
  for (const item of unsafe) console.error(`  - ${item}`);
  console.error(
    '[check-sidecar-resources] Stage them with the bundle scripts (set TARGET_ARCH for\n' +
    'cross-arch builds) or use the npm tauri:build* scripts / CI, which run them for you.',
  );
  process.exit(1);
}

console.log('[check-sidecar-resources] OK — Node runtime + native deps + staged node_modules present');

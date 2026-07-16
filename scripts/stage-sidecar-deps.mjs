#!/usr/bin/env node
/**
 * Stage the externalized runtime dependencies of the sidecar bundle into
 * app/src-tauri/resources/node_modules/ so the packaged Tauri app can resolve
 * the bare require()/import() calls that build-sidecar.mjs deliberately left
 * `external`. Without this, the packaged sidecar boots straight into
 * MODULE_NOT_FOUND on the first eval-time external (better-sqlite3,
 * @fastify/static, drizzle-orm, …).
 *
 * How it works:
 *   1. Read the esbuild metafile written by build-sidecar.mjs to learn EXACTLY
 *      which external packages the bundle imports (no more guessing from the
 *      EXTERNAL list — some of those, e.g. mammoth/sharp, aren't actually
 *      reached).
 *   2. Walk the transitive production-dependency closure of that set from the
 *      repo's own node_modules and copy each package dir verbatim — preserving
 *      prebuilt native .node binaries in place (better-sqlite3/build/Release,
 *      onnxruntime-node/bin) so require('better-sqlite3') both RESOLVES and
 *      FINDS its binary via the package's own relative loader.
 *
 * Run after build-sidecar.mjs, before `tauri build`. Arch-parameterized: honors
 * TARGET_ARCH (like bundle-native-deps.mjs) to prune onnxruntime-node's
 * cross-platform native binaries down to the single build target.
 *
 * Usage:
 *   node scripts/stage-sidecar-deps.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const resourcesDir = path.join(root, 'app', 'src-tauri', 'resources');
// Must match the metafile path written by build-sidecar.mjs (temp, not repo).
const metaFile = path.join(os.tmpdir(), 'waggle-sidecar-meta.json');
const stageDir = path.join(resourcesDir, 'node_modules');
const hookRuntimeBuild = path.join(root, 'scripts', 'build-hook-runtime.mjs');
const HOOK_RUNTIME_ROOTS = new Set([
  '@waggle/hive-mind-cli',
  '@waggle/hive-mind-hooks-claude-code',
  '@waggle/hive-mind-hooks-claude-desktop',
  '@waggle/hive-mind-hooks-codex',
  '@waggle/hive-mind-hooks-codex-desktop',
  '@waggle/hive-mind-hooks-cursor',
  '@waggle/hive-mind-hooks-hermes',
  '@waggle/hive-mind-hooks-openclaw',
]);

const platform = process.platform;
const arch = process.env.TARGET_ARCH || process.arch;

// macOS "universal" is NOT a real staging target — onnxruntime-node's native
// binding is per-arch (bin/napi-v3/<os>/<arch>), so a universal prune keeps
// nothing. Build per-arch and lipo the app bundle instead (see release.yml).
if (arch === 'universal') {
  console.error(
    '[stage-sidecar-deps] FATAL — TARGET_ARCH=universal is not supported.\n'
    + '  onnxruntime-node ships a per-arch native binding; there is no universal\n'
    + '  variant to stage. Build each arch separately (TARGET_ARCH=arm64 and =x64,\n'
    + '  targets aarch64-apple-darwin / x86_64-apple-darwin) — release.yml already\n'
    + '  does this via its macOS matrix.',
  );
  process.exit(1);
}

// Packages we deliberately DO NOT stage even though the bundle references them.
// Each is either a guarded lazy import with graceful fallback, or verified
// unreachable on the desktop code path — staging them would add 100s of MB of
// dead weight.
//   playwright-core / chromium-bidi — browser-tools.ts loads playwright-core via
//     a try/catch dynamic import and returns an "npm install playwright-core"
//     message when absent; the huge chromium tree is not part of boot or memory.
//   onnxruntime-web — @huggingface/transformers' node build
//     (dist/transformers.node.mjs) imports only onnxruntime-node +
//     onnxruntime-common; the 91MB web/wasm backend is never required on Node.
//   pg — a lazy dynamic import on the hosted-Postgres path only; the desktop
//     sidecar uses better-sqlite3 and never reaches it (and it isn't installed).
const SKIP = new Set([
  'playwright-core',
  'chromium-bidi',
  '@playwright/test',
  'onnxruntime-web',
  'pg',
]);

const BUILTINS = new Set(builtinModules);
const RUNTIME_PRUNED_DIR_NAMES = new Set([
  '.github',
  '__tests__',
  'benchmark',
  'benchmarks',
  'coverage',
  'example',
  'examples',
  'fixture',
  'fixtures',
  'test',
  'tests',
]);
const WINDOWS_1252_EXTRA_CODEPOINTS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/** Map an import specifier to its top-level package name (handles scopes/subpaths). */
function toPackageName(spec) {
  if (spec.startsWith('@')) {
    const [scope, name] = spec.split('/');
    return `${scope}/${name}`;
  }
  return spec.split('/')[0];
}

/** Read the metafile and return the set of external, non-builtin package names. */
function readExternalPackages() {
  if (!fs.existsSync(metaFile)) {
    console.error(
      `[stage-sidecar-deps] FATAL — metafile not found at ${metaFile}.\n`
      + '  Run `node scripts/build-sidecar.mjs` first (it writes the metafile).',
    );
    process.exit(1);
  }
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  const outKey = Object.keys(meta.outputs).find((k) => k.endsWith('service.js'));
  if (!outKey) {
    console.error('[stage-sidecar-deps] FATAL — no service.js output in metafile.');
    process.exit(1);
  }
  const names = new Set();
  for (const imp of meta.outputs[outKey].imports) {
    if (!imp.external) continue;
    const spec = imp.path.replace(/^node:/, '');
    if (BUILTINS.has(spec)) continue;
    names.add(toPackageName(imp.path));
  }
  return names;
}

/**
 * Resolve a package's install directory as Node would from `fromDir`, walking
 * up the node_modules chain. Returns the absolute dir or null if not installed
 * (optional deps that npm skipped on this platform legitimately return null).
 */
function resolvePkgDir(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

let copiedPackages = 0;
let prunedRuntimeDirs = 0;

function isWorkspacePackageDir(pkgDir) {
  const realDir = fs.realpathSync.native(pkgDir);
  return [path.join(root, 'packages'), path.join(root, 'apps')].some((workspaceRoot) => {
    const relative = path.relative(workspaceRoot, realDir);
    return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
  });
}

/** Recursively copy a package dir, preserving native binaries and nested deps. */
function copyPackage(srcDir, name) {
  const destDir = path.join(stageDir, name);
  if (fs.existsSync(destDir)) return; // already staged (dedup by flat name)
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  const copyOptions = { recursive: true, dereference: true };
  if (isWorkspacePackageDir(srcDir)) {
    // npm does not publish a workspace package's local node_modules. Copying
    // it from a dereferenced workspace symlink would leak dev-only packages;
    // production dependencies are staged separately from the manifest below.
    copyOptions.filter = (source) => path.basename(source) !== 'node_modules';
  }
  fs.cpSync(srcDir, destDir, copyOptions);
  copiedPackages++;
}

function readManifest(pkgDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Stage the transitive production closure of the given root package names.
 * Follows `dependencies` + any `optionalDependencies` that actually resolve
 * (installed on this platform). Copies each package flat into node_modules/;
 * nested node_modules ride along inside their parent for version-pinned deps.
 */
function stageClosure(rootNames) {
  const processedDirs = new Set();
  const queue = [...rootNames].map((name) => ({ name, fromDir: root }));

  while (queue.length > 0) {
    const { name, fromDir } = queue.shift();
    if (SKIP.has(name)) continue;

    const pkgDir = resolvePkgDir(name, fromDir);
    if (!pkgDir) {
      // Optional/absent (e.g. bufferutil, utf-8-validate, pg): the bundle
      // guards these or never reaches them — nothing to stage.
      continue;
    }
    const pkgKey = fs.realpathSync.native(pkgDir);
    if (processedDirs.has(pkgKey)) continue;
    processedDirs.add(pkgKey);
    copyPackage(pkgDir, name);

    const manifest = readManifest(pkgDir);
    const deps = { ...manifest.dependencies, ...manifest.optionalDependencies };
    for (const dep of Object.keys(deps)) {
      if (SKIP.has(dep)) continue;
      queue.push({ name: dep, fromDir: pkgDir });
    }
  }
  return processedDirs;
}

/**
 * Prune onnxruntime-node's cross-platform native binding tree down to the
 * single build target. Its loader does a hard relative require of
 * `bin/napi-v3/<process.platform>/<process.arch>/onnxruntime_binding.node`, so
 * only the target platform/arch dir is ever loaded — the other five (~174MB)
 * are dead weight in a per-platform installer.
 */
function pruneOnnxRuntime() {
  const napi = path.join(stageDir, 'onnxruntime-node', 'bin', 'napi-v3');
  if (!fs.existsSync(napi)) return;
  const keepPlatform = platform; // win32 | darwin | linux
  const keepArch = arch === 'arm64' ? 'arm64' : 'x64';
  let pruned = 0;
  for (const plat of fs.readdirSync(napi)) {
    const platDir = path.join(napi, plat);
    if (!fs.statSync(platDir).isDirectory()) continue;
    if (plat !== keepPlatform) {
      fs.rmSync(platDir, { recursive: true, force: true });
      pruned++;
      continue;
    }
    for (const a of fs.readdirSync(platDir)) {
      if (a !== keepArch) {
        fs.rmSync(path.join(platDir, a), { recursive: true, force: true });
        pruned++;
      }
    }
  }
  if (pruned > 0) {
    console.log(`[stage-sidecar-deps] Pruned ${pruned} onnxruntime-node cross-platform binding dir(s); kept ${keepPlatform}/${keepArch}`);
  }
}

/**
 * Defense in depth: delete any SKIP-listed package that rode along inside a
 * nested node_modules, so the huge trees never reach the bundle even if some
 * dependency vendored them.
 */
function pruneSkipListed(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (path.basename(dir) === 'node_modules') {
      // Reconstruct the package name (scoped or plain) at this node_modules level.
      if (entry.name.startsWith('@')) {
        for (const sub of fs.readdirSync(full, { withFileTypes: true })) {
          if (!sub.isDirectory()) continue;
          const scoped = `${entry.name}/${sub.name}`;
          if (SKIP.has(scoped)) {
            fs.rmSync(path.join(full, sub.name), { recursive: true, force: true });
          } else {
            pruneSkipListed(path.join(full, sub.name));
          }
        }
        continue;
      }
      if (SKIP.has(entry.name)) {
        fs.rmSync(full, { recursive: true, force: true });
        continue;
      }
    }
    pruneSkipListed(full);
  }
}

function isPackageContainer(dir) {
  const base = path.basename(dir);
  if (base === 'node_modules') return true;
  return base.startsWith('@') && path.basename(path.dirname(dir)) === 'node_modules';
}

/**
 * npm packages often ship tests, fixtures, examples, and CI metadata. They are
 * not loaded by the packaged sidecar, and they can contain filenames that WiX
 * cannot encode in the en-US MSI database codepage.
 */
function pruneRuntimeOnlyDirs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    const name = entry.name.toLowerCase();
    if (!isPackageContainer(dir) && RUNTIME_PRUNED_DIR_NAMES.has(name)) {
      fs.rmSync(full, { recursive: true, force: true });
      prunedRuntimeDirs++;
      continue;
    }
    pruneRuntimeOnlyDirs(full);
  }
}

function isWindows1252PathSafe(value) {
  for (const char of value) {
    const code = char.codePointAt(0) || 0;
    if (code <= 0x7f || (code >= 0xa0 && code <= 0xff)) continue;
    if (WINDOWS_1252_EXTRA_CODEPOINTS.has(code)) continue;
    return false;
  }
  return true;
}

function listFiles(dir) {
  const files = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  return files;
}

function listPackageDirs(nodeModulesDir) {
  if (!fs.existsSync(nodeModulesDir)) return [];
  const packageDirs = [];
  const stack = [nodeModulesDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = path.join(current, entry.name);
      if (fs.existsSync(path.join(full, 'package.json'))) {
        packageDirs.push(full);
      }
      stack.push(full);
    }
  }
  return packageDirs;
}

function resolveWithinStagedResources(fromPackageDir, dep) {
  let current = fromPackageDir;
  for (;;) {
    const candidate = path.join(current, 'node_modules', ...dep.split('/'), 'package.json');
    if (fs.existsSync(candidate)) return true;
    if (path.resolve(current) === path.resolve(resourcesDir)) return false;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function assertStagedNodeModulesSelfContained() {
  const missing = [];
  for (const packageDir of listPackageDirs(stageDir)) {
    const manifest = readManifest(packageDir);
    for (const dep of Object.keys(manifest.dependencies || {})) {
      if (SKIP.has(dep)) continue;
      if (!resolveWithinStagedResources(packageDir, dep)) {
        missing.push(`${path.relative(stageDir, packageDir)} -> ${dep}`);
      }
    }
  }

  if (missing.length === 0) return;
  console.error(
    '[stage-sidecar-deps] FATAL - staged node_modules is not self-contained:\n'
    + missing.map((dep) => `  - ${dep}`).join('\n')
    + '\n  Add the missing transitive runtime dependency to the staged closure.',
  );
  process.exit(1);
}

function assertWindowsMsiSafeResourcePaths() {
  if (platform !== 'win32') return;
  const unsafe = listFiles(resourcesDir)
    .map((file) => path.relative(resourcesDir, file))
    .filter((file) => !isWindows1252PathSafe(file));

  if (unsafe.length === 0) return;
  console.error(
    '[stage-sidecar-deps] FATAL - staged resource paths are not Windows MSI codepage-safe:\n'
    + unsafe.map((file) => `  - ${file}`).join('\n')
    + '\n  Prune the package payload or configure an MSI codepage before bundling.',
  );
  process.exit(1);
}

function dirSizeMB(dir) {
  let bytes = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        try { bytes += fs.statSync(p).size; } catch { /* transient */ }
      }
    }
  }
  return (bytes / 1024 / 1024).toFixed(1);
}

// ── main ───────────────────────────────────────────────────────────
console.log(`[stage-sidecar-deps] Platform: ${platform}-${arch}`);

// These workspace packages are loaded by hook installers/external agents, not
// by the sidecar bundle itself, so the esbuild metafile cannot discover them.
// Build them explicitly before copying their production dependency closure.
execFileSync(process.execPath, [hookRuntimeBuild], { cwd: root, stdio: 'inherit' });

// Fresh stage dir each run so a removed dep never lingers in a stale bundle.
fs.rmSync(stageDir, { recursive: true, force: true });
fs.mkdirSync(stageDir, { recursive: true });

const externals = readExternalPackages();
const runtimeRoots = new Set([...externals, ...HOOK_RUNTIME_ROOTS]);
const staged = [...runtimeRoots].filter((n) => !SKIP.has(n)).sort();
const skipped = [...externals].filter((n) => SKIP.has(n)).sort();
console.log(`[stage-sidecar-deps] Bundle/runtime roots: ${runtimeRoots.size} (${staged.length} to stage, ${skipped.length} skipped)`);
if (skipped.length) console.log(`[stage-sidecar-deps]   skipped: ${skipped.join(', ')}`);

const closure = stageClosure(runtimeRoots);

pruneOnnxRuntime();
pruneSkipListed(stageDir);
pruneRuntimeOnlyDirs(stageDir);
if (prunedRuntimeDirs > 0) {
  console.log(`[stage-sidecar-deps] Pruned ${prunedRuntimeDirs} runtime-unused package artifact dir(s)`);
}
assertWindowsMsiSafeResourcePaths();
assertStagedNodeModulesSelfContained();

console.log(
  `[stage-sidecar-deps] Staged ${copiedPackages} packages `
  + `(${closure.size} in closure) → resources/node_modules/ (${dirSizeMB(stageDir)} MB)`,
);

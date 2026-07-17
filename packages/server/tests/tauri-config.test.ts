/**
 * 9D-1/9D-2/9D-7: Tauri configuration tests.
 *
 * Validates tauri.conf.json, Cargo.toml, lib.rs, and build scripts
 * are properly configured for production desktop builds.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const TAURI_DIR = path.join(ROOT, 'app', 'src-tauri');
const WINDOWS_1252_EXTRA_CODEPOINTS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);
const STAGED_DEPENDENCY_ALLOWLIST = new Set(['onnxruntime-web']);
const FIRST_PARTY_RUNTIME_ENTRIES = new Set([
  'dist',
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'NOTICE',
  'NOTICE.md',
  'NOTICE.txt',
  'package.json',
]);
const SOURCE_ARTIFACT_PATTERN = /(?:\.map|\.(?:[cm]?ts|tsx)|\.tsbuildinfo)$/i;

function isWindows1252PathSafe(value: string) {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x7f || (code >= 0xa0 && code <= 0xff)) continue;
    if (WINDOWS_1252_EXTRA_CODEPOINTS.has(code)) continue;
    return false;
  }
  return true;
}

function listFiles(dir: string) {
  const files: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  return files;
}

function listPackageDirs(nodeModulesDir: string) {
  if (!fs.existsSync(nodeModulesDir)) return [];
  const packageDirs: string[] = [];
  const stack = [nodeModulesDir];
  while (stack.length > 0) {
    const current = stack.pop()!;
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

function resolveWithinStagedResources(fromPackageDir: string, dep: string, resourcesDir: string) {
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

function localWorkspacePackageNames() {
  const names = new Set<string>();
  for (const workspaceRoot of ['packages', 'apps'].map((entry) => path.join(ROOT, entry))) {
    if (!fs.existsSync(workspaceRoot)) continue;
    for (const entry of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const manifest = JSON.parse(
          fs.readFileSync(path.join(workspaceRoot, entry.name, 'package.json'), 'utf-8'),
        ) as { name?: unknown };
        if (typeof manifest.name === 'string') names.add(manifest.name);
      } catch {
        // Non-package workspace directories are irrelevant to staged runtime checks.
      }
    }
  }
  return names;
}

describe('Tauri Production Configuration', () => {
  it('tauri.conf.json exists and has valid version', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    expect(conf.productName).toBe('Waggle');
    expect(conf.version).toMatch(/^\d+\.\d+\.\d+$/);
    // Canonical bundle identifier — Egzakta-branded for code signing
    // + App Store / Mac notarization. Set in tauri.conf.json. Don't
    // change without coordinating with the signing cert subject.
    expect(conf.identifier).toBe('com.egzakta.waggle');
  });

  it('tauri.conf.json has bundle targets configured', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    // targets: "all" builds for the current platform (NSIS on Windows, DMG on macOS, etc.)
    expect(conf.bundle.targets).toBe('all');
    expect(conf.bundle.active).toBe(true);
  });

  it('tauri.conf.json bundles resources directory', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    expect(conf.bundle.resources).toContain('resources/*');
  });

  it('tauri.conf.json has correct window settings', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    const win = conf.app.windows[0];
    expect(win.title).toBe('Waggle');
    expect(win.width).toBe(1200);
    expect(win.height).toBe(800);
    expect(win.minWidth).toBe(800);
    expect(win.minHeight).toBe(600);
    expect(win.resizable).toBe(true);
  });

  it('tauri.conf.json has the auto-updater intentionally disabled for v1', () => {
    // The updater plugin config was removed because release.yml published
    // latest.json with EMPTY signatures — with a pubkey present, every client
    // update would fail signature verification (a broken update channel). It
    // stays disabled until updater signing is provisioned (TAURI_SIGNING_PRIVATE_KEY
    // + createUpdaterArtifacts + a real-signature manifest generator).
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    expect(conf.plugins?.updater).toBeUndefined();
  });

  it('tauri.conf.json has tray icon configured', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    expect(conf.app.trayIcon).toBeDefined();
    expect(conf.app.trayIcon.tooltip).toBe('Waggle - AI Agent Swarm');
  });

  it('tray menu exposes only implemented desktop actions', () => {
    const tray = fs.readFileSync(path.join(TAURI_DIR, 'src', 'tray.rs'), 'utf-8');
    expect(tray).toContain('"Open Waggle"');
    expect(tray).toContain('"Settings"');
    expect(tray).toContain('"Quit Waggle"');
    expect(tray).toContain('app.exit(0)');
    expect(tray).toContain('"waggle://navigate"');
    expect(tray).toContain('"/settings"');

    expect(tray).not.toContain('"Pause Agents"');
    expect(tray).not.toContain('"About Waggle"');
    expect(tray).not.toContain('"waggle://pause-agents"');
    expect(tray).not.toContain('"waggle://quit"');
    expect(tray).not.toContain('"/about"');
  });

  it('web app mounts the Tauri desktop navigation bridge', () => {
    const app = fs.readFileSync(path.join(ROOT, 'apps', 'web', 'src', 'App.tsx'), 'utf-8');
    expect(app).toContain('listenDesktopNavigation');
    expect(app).toContain('listenDesktopShellEvents');
    expect(app).toContain('<TauriDesktopEventBridge />');
  });

  it('tauri.conf.json has CSP that allows localhost connections', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    const csp = conf.app.security.csp;
    expect(csp).toContain('http://localhost:*');
    expect(csp).toContain('ws://localhost:*');
  });

  it('Cargo.toml has updater plugin dependency', () => {
    const cargo = fs.readFileSync(path.join(TAURI_DIR, 'Cargo.toml'), 'utf-8');
    expect(cargo).toContain('tauri-plugin-updater');
    expect(cargo).toContain('tauri-plugin-notification');
    expect(cargo).toContain('tauri-plugin-single-instance');
  });

  it('capabilities do not expose updater commands while updater config is disabled', () => {
    const caps = JSON.parse(
      fs.readFileSync(path.join(TAURI_DIR, 'capabilities', 'default.json'), 'utf-8'),
    );
    expect(caps.permissions).not.toContain('updater:default');
  });

  it('does not configure unit-only Tauri plugins as objects', () => {
    // Regression: the packaged debug exe panicked during startup when
    // `plugins.dialog` was `{ open, save }`; tauri-plugin-dialog expects no
    // config payload when initialized with `tauri_plugin_dialog::init()`.
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    expect(conf.plugins?.dialog).toBeUndefined();
  });

  it('lib.rs does not initialize updater while config is disabled', () => {
    // Regression: registering tauri-plugin-updater without plugins.updater
    // config deserializes as null and panics before the desktop UI starts.
    const lib = fs.readFileSync(path.join(TAURI_DIR, 'src', 'lib.rs'), 'utf-8');
    expect(lib).not.toContain('tauri_plugin_updater::Builder::new().build()');
    expect(lib).not.toContain('.updater()');
  });

  it('NSIS installer template exists', () => {
    const nsis = fs.readFileSync(path.join(TAURI_DIR, 'nsis', 'installer.nsi'), 'utf-8');
    expect(nsis).toContain('NSIS_HOOK_PREINSTALL');
    expect(nsis).toContain('Desktop shortcut');
    expect(nsis).toContain('Start Menu');
    expect(nsis).toMatch(/\/SD\s+IDNO\s+IDYES\s+removeData\s+IDNO\s+skipData/);
  });

  it('pilot-signed Windows build consumes the generated Tauri override', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'app', 'package.json'), 'utf-8'),
    );
    const signedBuild = manifest.scripts?.['tauri:build:win:pilot-signed'];

    expect(signedBuild).toContain('npm run tauri:sign:pilot:win:apply');
    expect(signedBuild).toContain(
      'npm run tauri:build:win -- --config src-tauri/tauri.build-override.conf.json',
    );
  });

  it('icon.ico exists', () => {
    expect(fs.existsSync(path.join(TAURI_DIR, 'icons', 'icon.ico'))).toBe(true);
  });

  it('build-sidecar script exists', () => {
    const script = path.join(ROOT, 'scripts', 'build-sidecar.mjs');
    expect(fs.existsSync(script)).toBe(true);
    const content = fs.readFileSync(script, 'utf-8');
    expect(content).toContain('esbuild');
    expect(content).toContain('service.ts');
    expect(content).toContain('resources/service.js');
    expect(content).toContain('sourcemap: false');
    expect(content).toContain('fs.rmSync(sourceMapFile, { force: true })');
  });

  it('D12: the bundled sidecar is generated at build time, never tracked', () => {
    // beforeBuildCommand regenerates the bundle on EVERY build path — including
    // a raw `npx tauri build` that bypasses the npm scripts and CI steps. A
    // tracked copy goes stale silently; a binary shipping an old server is a
    // release-stopping defect class (UX-Refactor P4 / D12 ruling).
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    expect(conf.build.beforeBuildCommand).toContain('build-sidecar.mjs');

    const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('app/src-tauri/resources/service.js');
    expect(gitignore).not.toContain('app/src-tauri/resources/service.js.map');
  });

  it('bundle-node defaults to the Node version that stages native deps', () => {
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'bundle-node.mjs'), 'utf-8');
    expect(script).toContain(
      'process.env.WAGGLE_BUNDLED_NODE_VERSION ?? process.versions.node',
    );
  });

  it('sidecar resource preflight checks bundled Node ABI compatibility', () => {
    const script = fs.readFileSync(
      path.join(ROOT, 'scripts', 'check-sidecar-resources.mjs'),
      'utf-8',
    );
    expect(script).toContain('process.versions.modules');
    expect(script).toContain('execFileSync(nodePath');
    expect(script).toContain('const database = new Database');
    expect(script).toContain('SELECT 1 AS ok');
    expect(script).toContain('SELECT vec_version() AS version');
    expect(script).toContain('const onnx = require(process.argv[4])');
    expect(script).toContain('process.arch !== process.argv[2]');
  });

  it('native bundling is fatal on missing payloads and validates target Mach-O architecture', () => {
    const script = fs.readFileSync(
      path.join(ROOT, 'scripts', 'bundle-native-deps.mjs'),
      'utf-8',
    );
    expect(script).toContain("execFileSync('/usr/bin/lipo'");
    expect(script).toContain('required native dependency');
    expect(script).toContain('sqlite-vec-${vecOs}-${arch}');
    expect(script).not.toContain("arch === 'arm64' ? 'aarch64'");
  });

  it.runIf(process.platform === 'win32')(
    'sidecar resource preflight rejects missing Windows runtimes and sidecar source artifacts',
    () => {
      const fixtureRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), 'waggle-sidecar-preflight-'),
      );
      const fixtureScripts = path.join(fixtureRoot, 'scripts');
      const fixtureResources = path.join(fixtureRoot, 'app', 'src-tauri', 'resources');
      const fixtureChecker = path.join(fixtureScripts, 'check-sidecar-resources.mjs');
      const requiredNativeFiles = [
        'better_sqlite3.node',
        'vec0.dll',
        'onnxruntime/onnxruntime_binding.node',
      ];
      const stagedRuntimeFiles = [
        '@waggle/hive-mind-core/dist/index.js',
        '@waggle/hive-mind-cli/dist/index.js',
        '@waggle/hive-mind-hooks-claude-code/dist/bin/claude-code-hooks-cli.js',
        '@waggle/hive-mind-hooks-claude-desktop/dist/bin/claude-desktop-hooks.js',
        '@waggle/hive-mind-hooks-codex/dist/bin/codex-hooks.js',
        '@waggle/hive-mind-hooks-codex-desktop/dist/bin/codex-desktop-hooks.js',
        '@waggle/hive-mind-hooks-cursor/dist/bin/cursor-hooks.js',
        '@waggle/hive-mind-hooks-hermes/dist/bin/hermes-hooks.js',
        '@waggle/hive-mind-hooks-openclaw/dist/bin/openclaw-hooks.js',
        '@waggle/hive-mind-hooks-openclaw/dist/handler.bundle.cjs',
        'waggle-test-runtime/dist/index.js',
      ];
      const writeFixtureFile = (base: string, relative: string, content = '') => {
        const target = path.join(base, ...relative.split('/'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content, 'utf-8');
        return target;
      };

      try {
        fs.mkdirSync(fixtureScripts, { recursive: true });
        fs.mkdirSync(fixtureResources, { recursive: true });
        fs.copyFileSync(
          path.join(ROOT, 'scripts', 'check-sidecar-resources.mjs'),
          fixtureChecker,
        );
        fs.copyFileSync(process.execPath, path.join(fixtureResources, 'node.exe'));
        writeFixtureFile(fixtureResources, 'service.js', 'console.log("sidecar");\n');

        const installedBetterSqlite = path.join(ROOT, 'node_modules', 'better-sqlite3');
        const fixtureBetterSqlite = path.join(fixtureResources, 'node_modules', 'better-sqlite3');
        fs.mkdirSync(path.dirname(fixtureBetterSqlite), { recursive: true });
        fs.cpSync(installedBetterSqlite, fixtureBetterSqlite, { recursive: true });
        for (const packageName of ['bindings', 'file-uri-to-path']) {
          fs.cpSync(
            path.join(ROOT, 'node_modules', packageName),
            path.join(fixtureResources, 'node_modules', packageName),
            { recursive: true },
          );
        }
        const installedBinding = path.join(installedBetterSqlite, 'build', 'Release', 'better_sqlite3.node');
        const installedVec = path.join(ROOT, 'node_modules', 'sqlite-vec-windows-x64', 'vec0.dll');
        const installedOnnx = path.join(ROOT, 'node_modules', 'onnxruntime-node');
        const fixtureOnnx = path.join(fixtureResources, 'node_modules', 'onnxruntime-node');
        fs.mkdirSync(fixtureOnnx, { recursive: true });
        fs.copyFileSync(path.join(installedOnnx, 'package.json'), path.join(fixtureOnnx, 'package.json'));
        fs.cpSync(path.join(installedOnnx, 'dist'), path.join(fixtureOnnx, 'dist'), { recursive: true });
        const installedOnnxBin = path.join(installedOnnx, 'bin', 'napi-v3', 'win32', 'x64');
        const fixtureOnnxBin = path.join(fixtureOnnx, 'bin', 'napi-v3', 'win32', 'x64');
        fs.cpSync(installedOnnxBin, fixtureOnnxBin, { recursive: true });
        fs.cpSync(
          path.join(ROOT, 'node_modules', 'onnxruntime-common'),
          path.join(fixtureResources, 'node_modules', 'onnxruntime-common'),
          { recursive: true },
        );
        const installedOnnxBinding = path.join(installedOnnxBin, 'onnxruntime_binding.node');

        for (const entry of requiredNativeFiles) {
          const target = writeFixtureFile(path.join(fixtureResources, 'native'), entry);
          if (entry === 'better_sqlite3.node') fs.copyFileSync(installedBinding, target);
          if (entry === 'vec0.dll') fs.copyFileSync(installedVec, target);
          if (entry === 'onnxruntime/onnxruntime_binding.node') fs.copyFileSync(installedOnnxBinding, target);
        }
        for (const entry of stagedRuntimeFiles) {
          writeFixtureFile(
            path.join(fixtureResources, 'node_modules'),
            entry,
            entry.endsWith('package.json') ? '{}' : '',
          );
        }
        const stagedPackageNames = new Set(stagedRuntimeFiles.map((entry) => {
          const parts = entry.split('/');
          return entry.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
        }));
        for (const name of stagedPackageNames) {
          writeFixtureFile(
            path.join(fixtureResources, 'node_modules'),
            `${name}/package.json`,
            JSON.stringify({ name }),
          );
        }
        writeFixtureFile(
          fixtureRoot,
          'packages/test-runtime/package.json',
          JSON.stringify({ name: 'waggle-test-runtime' }),
        );
        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          'waggle-test-runtime/package.json',
          JSON.stringify({ name: 'waggle-test-runtime', main: 'dist/index.js' }),
        );
        const coreManifestPath = path.join(
          fixtureResources,
          'node_modules',
          '@waggle',
          'hive-mind-core',
          'package.json',
        );
        const coreDistEntry = path.join(
          fixtureResources,
          'node_modules',
          '@waggle',
          'hive-mind-core',
          'dist',
          'index.js',
        );
        const writeCoreManifest = (main: string, exports?: Record<string, unknown>) => {
          fs.writeFileSync(
            coreManifestPath,
            JSON.stringify({
              name: '@waggle/hive-mind-core',
              main,
              ...(exports === undefined ? {} : { exports }),
            }),
            'utf-8',
          );
        };
        writeCoreManifest('dist/index.js');

        const runChecker = () => spawnSync(process.execPath, [fixtureChecker], {
          encoding: 'utf-8',
        });

        expect(runChecker().status).toBe(0);

        const stagedBinding = path.join(
          fixtureBetterSqlite,
          'build',
          'Release',
          'better_sqlite3.node',
        );
        const stagedOnnxBinding = path.join(fixtureOnnxBin, 'onnxruntime_binding.node');
        const fixtureVec = path.join(fixtureResources, 'native', 'vec0.dll');
        for (const target of [stagedBinding, stagedOnnxBinding, fixtureVec]) {
          const original = fs.readFileSync(target);
          fs.writeFileSync(target, 'not a native payload');
          const invalidRuntimeResult = runChecker();
          expect(invalidRuntimeResult.status).toBe(1);
          expect(invalidRuntimeResult.stderr).toContain('resources native runtime probe failed');
          fs.writeFileSync(target, original);
        }

        for (const entry of requiredNativeFiles) {
          const target = path.join(
            fixtureResources,
            'native',
            ...entry.split('/'),
          );
          const original = fs.readFileSync(target);
          fs.rmSync(target);

          const result = runChecker();
          expect(result.status).toBe(1);
          expect(result.stderr).toContain(`resources/native/${entry}`);

          fs.writeFileSync(target, original);
        }

        writeFixtureFile(
          fixtureResources,
          'service.js.map',
          JSON.stringify({ sourcesContent: ['private TypeScript source'] }),
        );
        const mapResult = runChecker();
        expect(mapResult.status).toBe(1);
        expect(mapResult.stderr).toContain('resources/service.js.map must not be packaged');
        fs.rmSync(path.join(fixtureResources, 'service.js.map'));

        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          '@waggle/hive-mind-core/src/evolution-runs.ts',
          'export const proprietary = true;\n',
        );
        const nestedSourceResult = runChecker();
        expect(nestedSourceResult.status).toBe(1);
        expect(nestedSourceResult.stderr).toContain(
          'resources/node_modules/@waggle/hive-mind-core/src/evolution-runs.ts must not be packaged',
        );
        fs.rmSync(path.join(
          fixtureResources,
          'node_modules',
          '@waggle',
          'hive-mind-core',
          'src',
        ), { recursive: true });

        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          'waggle-test-runtime/src/private.ts',
          'export const privateSource = true;\n',
        );
        const unscopedSourceResult = runChecker();
        expect(unscopedSourceResult.status).toBe(1);
        expect(unscopedSourceResult.stderr).toContain(
          'resources/node_modules/waggle-test-runtime/src/private.ts must not be packaged',
        );
        fs.rmSync(path.join(
          fixtureResources,
          'node_modules',
          'waggle-test-runtime',
          'src',
        ), { recursive: true });

        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          'vendor/node_modules/@waggle/shared/package.json',
          JSON.stringify({ name: '@waggle/shared' }),
        );
        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          'vendor/node_modules/@waggle/shared/src/private.ts',
          'export const privateSource = true;\n',
        );
        const nestedPackageResult = runChecker();
        expect(nestedPackageResult.status).toBe(1);
        expect(nestedPackageResult.stderr).toContain(
          'resources/node_modules/vendor/node_modules/@waggle/shared/src/private.ts must not be packaged',
        );
        fs.rmSync(path.join(
          fixtureResources,
          'node_modules',
          'vendor',
        ), { recursive: true });

        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          '@waggle/hive-mind-core/README.md',
          'internal package documentation\n',
        );
        const firstPartyPayloadResult = runChecker();
        expect(firstPartyPayloadResult.status).toBe(1);
        expect(firstPartyPayloadResult.stderr).toContain(
          'resources/node_modules/@waggle/hive-mind-core/README.md is not a runtime package entry',
        );
        fs.rmSync(path.join(
          fixtureResources,
          'node_modules',
          '@waggle',
          'hive-mind-core',
          'README.md',
        ));

        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          '@waggle/missing-manifest/dist/index.js',
          'export {};\n',
        );
        const missingManifestResult = runChecker();
        expect(missingManifestResult.status).toBe(1);
        expect(missingManifestResult.stderr).toContain(
          'resources/node_modules/@waggle/missing-manifest/package.json is missing or invalid',
        );
        fs.rmSync(path.join(
          fixtureResources,
          'node_modules',
          '@waggle',
          'missing-manifest',
        ), { recursive: true });

        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          '@waggle/malformed-manifest/package.json',
          '{',
        );
        const malformedManifestResult = runChecker();
        expect(malformedManifestResult.status).toBe(1);
        expect(malformedManifestResult.stderr).toContain(
          'resources/node_modules/@waggle/malformed-manifest/package.json is missing or invalid',
        );
        fs.rmSync(path.join(
          fixtureResources,
          'node_modules',
          '@waggle',
          'malformed-manifest',
        ), { recursive: true });

        writeCoreManifest('dist/../package.json');
        const traversalTargetResult = runChecker();
        expect(traversalTargetResult.status).toBe(1);
        expect(traversalTargetResult.stderr).toContain(
          'has an invalid or missing runtime target: dist/../package.json',
        );

        const runtimeDirectory = path.join(
          fixtureResources,
          'node_modules',
          '@waggle',
          'hive-mind-core',
          'dist',
          'runtime-directory',
        );
        fs.mkdirSync(runtimeDirectory, { recursive: true });
        writeCoreManifest('dist/runtime-directory');
        const directoryTargetResult = runChecker();
        expect(directoryTargetResult.status).toBe(1);
        expect(directoryTargetResult.stderr).toContain(
          'has an invalid or missing runtime target: dist/runtime-directory',
        );
        fs.rmSync(runtimeDirectory, { recursive: true });

        const coreDistDir = path.dirname(coreDistEntry);
        const outsideDistDir = path.join(fixtureRoot, 'outside-runtime-dist');
        writeFixtureFile(outsideDistDir, 'index.js', 'export {};\n');
        fs.rmSync(coreDistDir, { recursive: true });
        fs.symlinkSync(outsideDistDir, coreDistDir, 'junction');
        writeCoreManifest('dist/index.js');
        const junctionTargetResult = runChecker();
        expect(junctionTargetResult.status).toBe(1);
        expect(junctionTargetResult.stderr).toContain(
          'has an invalid or missing runtime target: dist/index.js',
        );
        fs.rmSync(coreDistDir, { recursive: true });
        fs.mkdirSync(coreDistDir, { recursive: true });
        fs.writeFileSync(coreDistEntry, 'export {};\n', 'utf-8');

        writeCoreManifest('dist/index.js', {
          '.': {
            types: './dist/index.d.ts',
            import: './dist/index.js',
          },
        });
        expect(runChecker().status).toBe(0);

        fs.writeFileSync(
          coreDistEntry,
          'export {};\n//# sourceMappingURL=index.js.map\n',
          'utf-8',
        );
        const nestedInlineMapResult = runChecker();
        expect(nestedInlineMapResult.status).toBe(1);
        expect(nestedInlineMapResult.stderr).toContain(
          'resources/node_modules/@waggle/hive-mind-core/dist/index.js contains a sourceMappingURL directive',
        );
        fs.writeFileSync(coreDistEntry, 'export {};\n', 'utf-8');

        fs.writeFileSync(
          path.join(fixtureResources, 'service.js'),
          'console.log("sidecar");\n//# sourceMappingURL=data:application/json;base64,e30=\n',
          'utf-8',
        );
        const inlineMapResult = runChecker();
        expect(inlineMapResult.status).toBe(1);
        expect(inlineMapResult.stderr).toContain(
          'resources/service.js contains a sourceMappingURL directive',
        );
      } finally {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
      }
    },
    60_000,
  );

  it('staged sidecar resources have Windows MSI codepage-safe relative paths', () => {
    // WiX 3 links the en-US MSI with codepage 1252. Dependency test fixtures
    // with paths such as "snowman" Unicode names must be pruned before MSI
    // bundling or light.exe fails after the Rust build has already succeeded.
    const resources = path.join(TAURI_DIR, 'resources');
    const unsafe = listFiles(resources)
      .map((file) => path.relative(resources, file))
      .filter((file) => !isWindows1252PathSafe(file));

    expect(unsafe).toEqual([]);
  });

  it('staged sidecar node_modules is self-contained after MSI extraction', () => {
    // Running from app/src-tauri/resources can accidentally resolve missing
    // packages from the repo root node_modules. The installed MSI layout cannot.
    const resources = path.join(TAURI_DIR, 'resources');
    const nodeModules = path.join(resources, 'node_modules');
    const missing: string[] = [];

    for (const packageDir of listPackageDirs(nodeModules)) {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'),
      ) as { name?: string; dependencies?: Record<string, string> };
      for (const dep of Object.keys(manifest.dependencies ?? {})) {
        if (STAGED_DEPENDENCY_ALLOWLIST.has(dep)) continue;
        if (!resolveWithinStagedResources(packageDir, dep, resources)) {
          missing.push(`${path.relative(nodeModules, packageDir)} -> ${dep}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it.runIf(fs.existsSync(path.join(TAURI_DIR, 'resources', 'node_modules')))(
    'stages only runtime payloads for first-party packages',
    () => {
      const resources = path.join(TAURI_DIR, 'resources');
      const nodeModules = path.join(resources, 'node_modules');
      const firstPartyRoot = path.join(resources, 'node_modules', '@waggle');
      const firstPartyPackageDirs = new Set<string>();
      const workspacePackageNames = localWorkspacePackageNames();
      const unexpected: string[] = [];

      if (fs.existsSync(firstPartyRoot)) {
        for (const packageEntry of fs.readdirSync(firstPartyRoot, { withFileTypes: true })) {
          if (packageEntry.isDirectory()) {
            firstPartyPackageDirs.add(path.join(firstPartyRoot, packageEntry.name));
          }
        }
      }
      for (const name of workspacePackageNames) {
        const directPackageDir = path.join(nodeModules, ...name.split('/'));
        if (fs.existsSync(directPackageDir)) firstPartyPackageDirs.add(directPackageDir);
      }
      for (const packageDir of listPackageDirs(nodeModules)) {
        try {
          const manifest = JSON.parse(
            fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'),
          ) as { name?: unknown };
          if (
            typeof manifest.name === 'string'
            && (manifest.name.startsWith('@waggle/') || workspacePackageNames.has(manifest.name))
          ) {
            firstPartyPackageDirs.add(packageDir);
          }
        } catch {
          // The executable checker reports malformed first-party manifests.
        }
      }

      for (const packageDir of firstPartyPackageDirs) {
        for (const entry of fs.readdirSync(packageDir, { withFileTypes: true })) {
          if (!FIRST_PARTY_RUNTIME_ENTRIES.has(entry.name)) {
            unexpected.push(path.relative(resources, path.join(packageDir, entry.name)));
          }
        }
        for (const file of listFiles(packageDir)) {
          if (SOURCE_ARTIFACT_PATTERN.test(file)) {
            unexpected.push(path.relative(resources, file));
          }
          if (
            /\.(?:[cm]?js)$/i.test(file)
            && /(?:\/\/|\/\*)[#@]\s*sourceMappingURL\s*=/.test(fs.readFileSync(file, 'utf-8'))
          ) {
            unexpected.push(`${path.relative(resources, file)} -> sourceMappingURL`);
          }
        }
      }

      expect(unexpected).toEqual([]);
    },
  );
});

describe('CI/CD Configuration', () => {
  it('release workflow exists for Windows + macOS builds', () => {
    const workflow = path.join(ROOT, '.github', 'workflows', 'release.yml');
    expect(fs.existsSync(workflow)).toBe(true);
    const content = fs.readFileSync(workflow, 'utf-8');
    expect(content).toContain('build-windows');
    expect(content).toContain('build-macos');
    expect(content).toContain('tauri-action');
    expect(content).toContain('aarch64-apple-darwin');
    expect(content).toContain('x86_64-apple-darwin');
    expect(content).toContain('runner: macos-15');
    expect(content).toContain('runner: macos-15-intel');
    expect(content).toContain('runs-on: ${{ matrix.runner }}');
    expect(content).toContain('TARGET_ARCH: ${{ matrix.arch }}');
  });

  it('release and PR macOS builds pin each target to a matching runner architecture', () => {
    for (const workflowName of ['release.yml', 'tauri-build-pr.yml']) {
      const workflow = fs.readFileSync(
        path.join(ROOT, '.github', 'workflows', workflowName),
        'utf-8',
      );
      expect(workflow).toContain('target: aarch64-apple-darwin');
      expect(workflow).toContain('arch: arm64');
      expect(workflow).toContain('runner: macos-15');
      expect(workflow).toContain('target: x86_64-apple-darwin');
      expect(workflow).toContain('arch: x64');
      expect(workflow).toContain('runner: macos-15-intel');
      expect(workflow).toContain('Verify runner architecture');
    }
  });

  it('release workflow does NOT publish a broken (empty-signature) updater manifest', () => {
    // The update-manifest job was removed with the updater config: it published
    // latest.json with empty signatures, which every client would reject. Re-add
    // it together with real updater signing (see tauri.conf updater note).
    const workflow = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'release.yml'),
      'utf-8',
    );
    // No active `update-manifest:` job (a re-enable note in comments is fine).
    expect(workflow).not.toMatch(/^\s*update-manifest:/m);
  });

  it('release workflow stages sidecar dependencies before packaging', () => {
    // P0-2: the packaged sidecar require()s esbuild-externalized deps that must
    // be staged into resources/node_modules or it dies with MODULE_NOT_FOUND.
    const workflow = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'release.yml'),
      'utf-8',
    );
    expect(workflow).toContain('stage-sidecar-deps');
  });

  it('release workflow builds packages before bundling the desktop sidecar', () => {
    // Release builds must follow the same package -> sidecar ordering as the
    // PR Tauri verification lane, otherwise tag artifacts can ship stale or
    // missing workspace dist outputs even when PR verification was green.
    const workflow = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'release.yml'),
      'utf-8',
    );
    const buildPackageIndexes = [...workflow.matchAll(/npm run build:packages/g)].map(
      (match) => match.index ?? -1,
    );
    const sidecarIndexes = [...workflow.matchAll(/node scripts\/build-sidecar\.mjs/g)].map(
      (match) => match.index ?? -1,
    );

    expect(buildPackageIndexes).toHaveLength(sidecarIndexes.length);
    expect(sidecarIndexes).toHaveLength(2);
    for (const [index, sidecarIndex] of sidecarIndexes.entries()) {
      expect(buildPackageIndexes[index]).toBeLessThan(sidecarIndex);
    }
  });
});

describe('Playwright Visual Regression Setup', () => {
  it('playwright.config.ts exists', () => {
    const conf = path.join(ROOT, 'playwright.config.ts');
    expect(fs.existsSync(conf)).toBe(true);
    const content = fs.readFileSync(conf, 'utf-8');
    expect(content).toContain('maxDiffPixelRatio');
    expect(content).toContain('localhost:3333');
  });

  it('visual test spec exists with 14 test cases (7 views x 2 themes)', () => {
    const spec = path.join(ROOT, 'tests', 'visual', 'views.spec.ts');
    expect(fs.existsSync(spec)).toBe(true);
    const content = fs.readFileSync(spec, 'utf-8');
    expect(content).toContain('Dark Mode');
    expect(content).toContain('Light Mode');
    // 7 views defined
    expect(content).toContain('chat');
    expect(content).toContain('memory');
    expect(content).toContain('events');
    expect(content).toContain('capabilities');
    expect(content).toContain('cockpit');
    expect(content).toContain('mission-control');
    expect(content).toContain('settings');
  });
});

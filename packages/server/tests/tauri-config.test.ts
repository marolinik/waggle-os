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
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

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

function powershellProbeExecutable() {
  const configuredPwsh = process.env.WAGGLE_PWSH7_PATH;
  const requirePowerShell7 = (executable: string) => {
    const result = spawnSync(
      executable,
      ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'],
      { encoding: 'utf-8', timeout: 10_000, windowsHide: true },
    );
    const major = Number.parseInt(result.stdout.trim(), 10);
    if (result.status !== 0 || !Number.isInteger(major) || major < 7) {
      throw new Error('PowerShell 7 required Windows release-workflow probes');
    }
    return executable;
  };
  if (configuredPwsh) {
    if (!fs.existsSync(configuredPwsh)) {
      throw new Error('Configured PowerShell 7 probe executable is missing');
    }
    return requirePowerShell7(configuredPwsh);
  }
  const pwsh = path.join(
    process.env.ProgramFiles ?? 'C:\\Program Files',
    'PowerShell',
    '7',
    'pwsh.exe',
  );
  if (fs.existsSync(pwsh)) {
    return process.env.WAGGLE_REQUIRE_PWSH7 === '1'
      ? requirePowerShell7(pwsh)
      : pwsh;
  }
  if (process.env.WAGGLE_REQUIRE_PWSH7 === '1') {
    throw new Error('PowerShell 7 is required for Windows release-workflow probes');
  }
  return path.join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
}

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

  it('NSIS installer template never deletes profile data', () => {
    const nsis = fs.readFileSync(path.join(TAURI_DIR, 'nsis', 'installer.nsi'), 'utf-8');
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    expect(nsis).toContain('NSIS_HOOK_PREINSTALL');
    // Data erasure is an authenticated, confirmation-phrase-gated in-app flow.
    // The package uninstaller must never recursively delete the real profile.
    expect(nsis).not.toContain('NSIS_HOOK_POSTUNINSTALL');
    expect(nsis).toContain('NSIS_HOOK_PREUNINSTALL');
    expect(nsis).toMatch(/StrCpy\s+\$DeleteAppDataCheckboxState\s+0/);
    expect(nsis).not.toMatch(
      /\b(?:RMDir|Delete)\b[^\r\n]*(?:\$PROFILE[\\/]+\.waggle|\.waggle)/i,
    );
    expect(conf.bundle.windows.nsis.installerHooks).toBe('nsis/installer.nsi');
    expect(conf.bundle.windows.nsis.installMode).toBe('currentUser');
    // Tauri owns shortcuts and normal/silent launch behavior. Duplicating those
    // in POSTINSTALL caused double launches and made repair certificates racy.
    expect(nsis).not.toContain('NSIS_HOOK_POSTINSTALL');
    expect(nsis).not.toContain('CreateShortcut');
    expect(nsis).not.toMatch(/\bExec\s+['"]/);
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
    expect(content).toContain("path.join(root, 'packages', 'marketplace', 'marketplace.db')");
    expect(content).not.toContain("'marketplace', 'seed', 'marketplace.db'");
    expect(content).toContain('Required marketplace database is missing');

    const serverIndex = fs.readFileSync(
      path.join(ROOT, 'packages', 'server', 'src', 'local', 'index.ts'),
      'utf-8',
    );
    expect(serverIndex).toContain("path.resolve(__dirname, 'marketplace.db')");
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

  it('pins patched transitive dependency versions used by desktop builds', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')) as {
      engines?: { node?: string };
      overrides?: Record<string, string>;
    };
    const lockfile = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf-8'),
    ) as {
      packages: Record<string, { version?: string }>;
    };
    const expectedOverrides = {
      'brace-expansion@1': '1.1.16',
      'brace-expansion@2': '2.1.2',
      'brace-expansion@5': '5.0.7',
      'fast-uri': '3.1.4',
      'find-my-way': '9.7.0',
      'js-yaml': '4.3.0',
      sharp: '0.35.3',
    };

    expect(manifest.engines?.node).toBe('^20.19.0 || >=22.12.0');
    expect(manifest.overrides).toMatchObject(expectedOverrides);

    const versionsFor = (packageName: string) => {
      const matching = Object.entries(lockfile.packages)
        .filter(([packagePath]) => packagePath.endsWith(`node_modules/${packageName}`));
      expect(matching.length).toBeGreaterThan(0);
      for (const [, metadata] of matching) {
        expect(metadata.version).toEqual(expect.any(String));
      }
      return new Set(matching.map(([, metadata]) => metadata.version!));
    };

    expect(versionsFor('brace-expansion')).toEqual(new Set(['1.1.16', '2.1.2', '5.0.7']));
    expect(versionsFor('fast-uri')).toEqual(new Set(['3.1.4']));
    expect(versionsFor('find-my-way')).toEqual(new Set(['9.7.0']));
    expect(versionsFor('js-yaml')).toEqual(new Set(['4.3.0']));
    expect(versionsFor('sharp')).toEqual(new Set(['0.35.3']));
    const sharpBindings = Object.entries(lockfile.packages)
      .filter(([packagePath]) => (
        /node_modules\/@img\/sharp-(?!libvips-)[^/]+$/.test(packagePath)
      ));
    expect(sharpBindings.length).toBeGreaterThan(0);
    expect(new Set(sharpBindings.map(([, metadata]) => metadata.version))).toEqual(
      new Set(['0.35.3']),
    );
  });

  it('rejects unsafe staged dependency versions without native runtime setup', () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-dependency-floor-'));
    const checker = path.join(ROOT, 'scripts', 'check-sidecar-resources.mjs');
    const writeManifest = (relative: string, name: string, version: string) => {
      const packageDir = path.join(fixture, ...relative.split('/'));
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, 'package.json'),
        JSON.stringify({ name, version }),
        'utf-8',
      );
      return packageDir;
    };
    const run = () => spawnSync(
      process.execPath,
      [checker, '--dependency-versions-only', fixture],
      { encoding: 'utf-8', windowsHide: true },
    );
    const bundledBrace = [
      'waggle-node-runtime',
      'node_modules',
      'npm',
      'node_modules',
      'brace-expansion',
    ].join('/');

    try {
      writeManifest('brace-expansion', 'brace-expansion', '5.0.7');
      writeManifest('fast-uri', 'fast-uri', '3.1.4');
      writeManifest('sharp', 'sharp', '0.35.3');
      writeManifest(bundledBrace, 'brace-expansion', '2.1.2');
      expect(run().status).toBe(0);

      writeManifest(bundledBrace, 'brace-expansion', '2.0.1');
      const vulnerableNpm = run();
      expect(vulnerableNpm.status).toBe(1);
      expect(vulnerableNpm.stderr).toContain('must be exactly 2.1.2');
      writeManifest(bundledBrace, 'brace-expansion', '2.1.2');

      writeManifest('fast-uri', 'fast-uri', '3.1.2');
      const vulnerableFastUri = run();
      expect(vulnerableFastUri.status).toBe(1);
      expect(vulnerableFastUri.stderr).toContain('fast-uri@3.1.2');
      writeManifest('fast-uri', 'fast-uri', '3.1.4');

      writeManifest('sharp', 'sharp', '0.34.5');
      const vulnerableSharp = run();
      expect(vulnerableSharp.status).toBe(1);
      expect(vulnerableSharp.stderr).toContain('sharp@0.34.5');
      writeManifest('sharp', 'sharp', '0.35.3');

      writeManifest('vendor/node_modules/js-yaml', 'js-yaml', '4.3.0');
      const stagedDevDependency = run();
      expect(stagedDevDependency.status).toBe(1);
      expect(stagedDevDependency.stderr).toContain('development-only js-yaml');
      fs.rmSync(path.join(fixture, 'vendor'), { recursive: true, force: true });

      fs.rmSync(
        path.join(fixture, ...bundledBrace.split('/')),
        { recursive: true, force: true },
      );
      const missingBundledBrace = run();
      expect(missingBundledBrace.status).toBe(1);
      expect(missingBundledBrace.stderr).toContain('found missing');
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
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
    expect(script).toContain('const { RawImage } = require(process.argv[1])');
    expect(script).toContain('image.toSharp().resize(1, 1).png().toBuffer()');
    expect(script).toContain('Buffer.from([137,80,78,71,13,10,26,10])');
    expect(script).toContain('sharp.versions?.emscripten');
    expect(script).toContain('if (process.argv[3]) require(process.argv[3])');
    expect(script).toContain('process.arch !== process.argv[2]');
  });

  it.runIf(process.platform === 'win32')(
    'Sharp 0.35.3 works through the Transformers RawImage consumer',
    () => {
      const probe = [
        'const { RawImage } = require("@huggingface/transformers");',
        'const sharp = require("sharp");',
        'if (sharp.versions?.emscripten) throw new Error("Sharp fell back to WASM");',
        'const image = new RawImage(',
        'Uint8Array.from([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]),',
        '2,2,4);',
        'void (async () => {',
        'const buffer = await image.toSharp().resize(1,1).png().toBuffer();',
        'const signature = Buffer.from([137,80,78,71,13,10,26,10]);',
        'if (!buffer.subarray(0,8).equals(signature)) throw new Error("invalid PNG");',
        'process.stdout.write(JSON.stringify({ bytes: buffer.length }));',
        '})().catch((error) => { console.error(error); process.exit(1); });',
      ].join('');
      const result = spawnSync(process.execPath, ['-e', probe], {
        cwd: ROOT,
        encoding: 'utf-8',
        timeout: 30_000,
        windowsHide: true,
      });

      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        bytes: expect.any(Number),
      });
    },
  );

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
        'waggle-memory-mcp/dist/index.js',
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
        const fixtureNode = path.join(fixtureResources, 'node.exe');
        // A hardlink shares the running Vitest executable's Windows image lock,
        // so fixture cleanup cannot delete it until the parent test process exits.
        fs.copyFileSync(process.execPath, fixtureNode);
        writeFixtureFile(fixtureResources, 'service.js', 'console.log("sidecar");\n');
        const fixtureMarketplaceSource = path.join(
          fixtureRoot,
          'packages',
          'marketplace',
          'marketplace.db',
        );
        fs.mkdirSync(path.dirname(fixtureMarketplaceSource), { recursive: true });
        const fixtureMarketplace = new Database(fixtureMarketplaceSource);
        fixtureMarketplace.pragma('journal_mode = WAL');
        fixtureMarketplace.exec(`
          CREATE TABLE sources (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
          CREATE TABLE packages (id INTEGER PRIMARY KEY, source_id INTEGER, name TEXT NOT NULL);
          INSERT INTO sources (id, name) VALUES (1, 'mcp_registry');
          INSERT INTO packages (id, source_id, name) VALUES (1, 1, 'memory');
        `);
        fixtureMarketplace.pragma('wal_checkpoint(TRUNCATE)');
        fixtureMarketplace.close();
        const fixtureMarketplaceResource = path.join(fixtureResources, 'marketplace.db');
        fs.copyFileSync(fixtureMarketplaceSource, fixtureMarketplaceResource);
        const fixtureNpmVersion = '0.0.0-fixture';
        const fixtureNpmRuntimeRoot = 'node_modules/waggle-node-runtime';
        const fixtureNpmCli = `process.stdout.write(${JSON.stringify(fixtureNpmVersion)} + '\\n');\n`;
        const fixtureNpmWrapper = (cli: 'npm' | 'npx') => [
          '@ECHO OFF',
          'SETLOCAL',
          'SET "NODE_EXE=%~dp0\\..\\..\\..\\node.exe"',
          `SET "NPM_CLI_JS=%~dp0\\..\\node_modules\\npm\\bin\\${cli}-cli.js"`,
          '"%NODE_EXE%" "%NPM_CLI_JS%" %*',
          'EXIT /B %ERRORLEVEL%',
          '',
        ].join('\r\n');
        writeFixtureFile(
          fixtureResources,
          `${fixtureNpmRuntimeRoot}/package.json`,
          JSON.stringify({
            name: 'waggle-node-runtime',
            private: true,
            version: process.versions.node,
          }),
        );
        writeFixtureFile(fixtureResources, `${fixtureNpmRuntimeRoot}/NODE-LICENSE`, 'Node license');
        writeFixtureFile(
          fixtureResources,
          `${fixtureNpmRuntimeRoot}/node_modules/npm/package.json`,
          JSON.stringify({ name: 'npm', version: fixtureNpmVersion }),
        );
        writeFixtureFile(
          fixtureResources,
          `${fixtureNpmRuntimeRoot}/node_modules/npm/node_modules/brace-expansion/package.json`,
          JSON.stringify({ name: 'brace-expansion', version: '2.1.2' }),
        );
        writeFixtureFile(
          fixtureResources,
          `${fixtureNpmRuntimeRoot}/node_modules/npm/LICENSE`,
          'npm license',
        );
        writeFixtureFile(
          fixtureResources,
          `${fixtureNpmRuntimeRoot}/node_modules/npm/bin/npm-cli.js`,
          fixtureNpmCli,
        );
        writeFixtureFile(
          fixtureResources,
          `${fixtureNpmRuntimeRoot}/node_modules/npm/bin/npx-cli.js`,
          fixtureNpmCli,
        );
        writeFixtureFile(
          fixtureResources,
          `${fixtureNpmRuntimeRoot}/bin/npm.cmd`,
          fixtureNpmWrapper('npm'),
        );
        writeFixtureFile(
          fixtureResources,
          `${fixtureNpmRuntimeRoot}/bin/npx.cmd`,
          fixtureNpmWrapper('npx'),
        );

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
        const fixtureTransformers = path.join(
          fixtureResources,
          'node_modules',
          '@huggingface',
          'transformers',
        );
        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          'sharp/package.json',
          JSON.stringify({ name: 'sharp', version: '0.35.3', main: 'index.cjs' }),
        );
        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          'sharp/index.cjs',
          'module.exports = { versions: { sharp: "0.35.3", vips: "8.18.3" } };',
        );
        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          '@img/sharp-win32-x64/package.json',
          JSON.stringify({ name: '@img/sharp-win32-x64', version: '0.35.3' }),
        );
        fs.cpSync(
          path.join(ROOT, 'node_modules', '@img', 'sharp-win32-x64', 'lib'),
          path.join(
            fixtureResources,
            'node_modules',
            '@img',
            'sharp-win32-x64',
            'lib',
          ),
          { recursive: true },
        );
        const stagedSharpBinding = path.join(
          fixtureResources,
          'node_modules',
          '@img',
          'sharp-win32-x64',
          'lib',
          'sharp-win32-x64-0.35.3.node',
        );
        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          '@huggingface/transformers/package.json',
          JSON.stringify({ name: '@huggingface/transformers', version: '3.8.1' }),
        );
        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          '@huggingface/transformers/dist/transformers.node.cjs',
          [
            'class RawImage {',
            'toSharp() {',
            'return {',
            'resize() { return this; },',
            'png() { return this; },',
            'async toBuffer() {',
            'return Buffer.from([137,80,78,71,13,10,26,10,0]);',
            '},',
            '};',
            '}',
            '}',
            'module.exports = { RawImage };',
          ].join(''),
        );

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

        const runChecker = (
          { withImageRuntime = false }: { withImageRuntime?: boolean } = {},
        ) => {
          const hiddenBinding = `${stagedSharpBinding}.fixture-disabled`;
          if (!withImageRuntime) fs.renameSync(stagedSharpBinding, hiddenBinding);
          try {
            const result = spawnSync(process.execPath, [fixtureChecker], {
              encoding: 'utf-8',
              timeout: 60_000,
              windowsHide: true,
            });
            if (result.error) throw result.error;
            return result;
          } finally {
            if (!withImageRuntime) fs.renameSync(hiddenBinding, stagedSharpBinding);
          }
        };

        const fixtureMarketplaceBeforeProbe = fs.readFileSync(fixtureMarketplaceResource);
        const baselineResult = runChecker({ withImageRuntime: true });
        expect(
          baselineResult.status,
          baselineResult.stderr || baselineResult.stdout,
        ).toBe(0);
        expect(fs.readFileSync(fixtureMarketplaceResource)).toEqual(fixtureMarketplaceBeforeProbe);
        for (const target of [
          {
            path: fixtureMarketplaceResource,
            label: 'resources/marketplace.db',
            diagnostic: 'must not be packaged',
          },
          {
            path: fixtureMarketplaceSource,
            label: 'packages/marketplace/marketplace.db',
            diagnostic: 'must not be present while staging',
          },
        ]) {
          for (const suffix of ['-wal', '-shm', '-journal']) {
            expect(fs.existsSync(`${target.path}${suffix}`)).toBe(false);
            fs.writeFileSync(`${target.path}${suffix}`, 'stale SQLite sidecar');
            const staleSidecarResult = runChecker();
            expect(staleSidecarResult.status).toBe(1);
            expect(staleSidecarResult.stderr).toContain(
              `${target.label}${suffix} ${target.diagnostic}`,
            );
            fs.rmSync(`${target.path}${suffix}`);
          }
        }

        const fixtureMarketplaceContent = fs.readFileSync(fixtureMarketplaceResource);
        fs.rmSync(fixtureMarketplaceResource);
        const missingMarketplaceResult = runChecker();
        expect(missingMarketplaceResult.status).toBe(1);
        expect(missingMarketplaceResult.stderr).toContain('resources/marketplace.db');
        fs.writeFileSync(fixtureMarketplaceResource, fixtureMarketplaceContent);

        fs.appendFileSync(fixtureMarketplaceResource, 'tampered');
        const mismatchedMarketplaceResult = runChecker();
        expect(mismatchedMarketplaceResult.status).toBe(1);
        expect(mismatchedMarketplaceResult.stderr).toContain(
          'resources/marketplace.db does not match the canonical marketplace database',
        );
        fs.writeFileSync(fixtureMarketplaceResource, fixtureMarketplaceContent);

        const fixtureMarketplaceSourceContent = fs.readFileSync(fixtureMarketplaceSource);
        fs.writeFileSync(fixtureMarketplaceSource, 'not a SQLite database');
        fs.writeFileSync(fixtureMarketplaceResource, 'not a SQLite database');
        const invalidMarketplaceResult = runChecker();
        expect(invalidMarketplaceResult.status).toBe(1);
        expect(invalidMarketplaceResult.stderr).toContain(
          'resources/marketplace.db failed its SQLite integrity/schema probe',
        );
        fs.writeFileSync(fixtureMarketplaceSource, fixtureMarketplaceSourceContent);
        fs.writeFileSync(fixtureMarketplaceResource, fixtureMarketplaceContent);

        const fixtureNpmRuntimeManifest = path.join(
          fixtureResources,
          ...`${fixtureNpmRuntimeRoot}/package.json`.split('/'),
        );
        const fixtureNpmRuntimeManifestContent = fs.readFileSync(fixtureNpmRuntimeManifest);
        fs.rmSync(fixtureNpmRuntimeManifest);
        const missingNpmRuntimeResult = runChecker();
        expect(missingNpmRuntimeResult.status).toBe(1);
        expect(missingNpmRuntimeResult.stderr).toContain(
          'resources/node_modules/waggle-node-runtime/package.json',
        );
        fs.writeFileSync(fixtureNpmRuntimeManifest, fixtureNpmRuntimeManifestContent);

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
        const stagedSharpBindingContent = fs.readFileSync(stagedSharpBinding);
        fs.writeFileSync(stagedSharpBinding, 'not a native payload');
        const invalidImageRuntimeResult = runChecker({ withImageRuntime: true });
        expect(invalidImageRuntimeResult.status).toBe(1);
        expect(invalidImageRuntimeResult.stderr).toContain('resources image runtime probe failed');
        fs.writeFileSync(stagedSharpBinding, stagedSharpBindingContent);

        for (const target of [
          {
            manifest: path.join(fixtureResources, 'node_modules', 'sharp', 'package.json'),
            diagnostic: 'resources/node_modules/sharp',
          },
          {
            manifest: path.join(fixtureTransformers, 'package.json'),
            diagnostic: 'resources/node_modules/@huggingface/transformers',
          },
        ]) {
          const content = fs.readFileSync(target.manifest);
          fs.rmSync(target.manifest);
          const missingImageDependencyResult = runChecker();
          expect(missingImageDependencyResult.status).toBe(1);
          expect(missingImageDependencyResult.stderr).toContain(target.diagnostic);
          fs.writeFileSync(target.manifest, content);
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
        expect(runChecker({ withImageRuntime: true }).status).toBe(0);

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
    180_000,
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

  it('stages the patched archive parser required by dynamic sidecar imports', () => {
    const stageScript = fs.readFileSync(
      path.join(ROOT, 'scripts', 'stage-sidecar-deps.mjs'),
      'utf-8',
    );
    expect(stageScript).toContain("const DYNAMIC_RUNTIME_ROOTS = new Set(['adm-zip']);");
    expect(stageScript).toContain('adm-zip runtime root must be version 0.6.0 or newer');

    const stagedManifest = path.join(
      TAURI_DIR,
      'resources',
      'node_modules',
      'adm-zip',
      'package.json',
    );
    if (!fs.existsSync(path.join(TAURI_DIR, 'resources', 'node_modules'))) return;

    expect(fs.existsSync(stagedManifest)).toBe(true);
    const { version } = JSON.parse(fs.readFileSync(stagedManifest, 'utf-8')) as {
      version: string;
    };
    const [major, minor] = version.split('.').map(Number);
    expect(major > 0 || minor >= 6).toBe(true);
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
    expect(content).not.toMatch(/uses:\s+tauri-apps\/tauri-action/);
    expect(content).toContain('Upload macOS verification artifacts');
    expect(content).toContain('aarch64-apple-darwin');
    expect(content).toContain('x86_64-apple-darwin');
    expect(content).toContain('runner: macos-15');
    expect(content).toContain('runner: macos-15-intel');
    expect(content).toContain('runs-on: ${{ matrix.runner }}');
    expect(content).toContain('TARGET_ARCH: ${{ matrix.arch }}');
  });

  it.runIf(process.platform === 'win32')(
    'PowerShell 7 workflow override rejects Windows PowerShell 5.1',
    () => {
      const previousPath = process.env.WAGGLE_PWSH7_PATH;
      const previousRequirement = process.env.WAGGLE_REQUIRE_PWSH7;
      try {
        process.env.WAGGLE_REQUIRE_PWSH7 = '1';
        process.env.WAGGLE_PWSH7_PATH = path.join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe',
        );
        expect(() => powershellProbeExecutable()).toThrow(
          'PowerShell 7 required Windows release-workflow probes',
        );
      } finally {
        if (previousPath === undefined) delete process.env.WAGGLE_PWSH7_PATH;
        else process.env.WAGGLE_PWSH7_PATH = previousPath;
        if (previousRequirement === undefined) delete process.env.WAGGLE_REQUIRE_PWSH7;
        else process.env.WAGGLE_REQUIRE_PWSH7 = previousRequirement;
      }
    },
  );

  it.runIf(process.platform === 'win32')(
    'release mode resolver permits only the exact v0.2.0 bootstrap identity',
    () => {
      const workflow = fs
        .readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf-8')
        .replace(/\r\n/g, '\n');
      const resolverStart = workflow.indexOf(
        '          function Resolve-WindowsReleaseMode {',
      );
      const resolverEnd = workflow.indexOf(
        '\n          $releaseMode = Resolve-WindowsReleaseMode',
        resolverStart,
      );
      expect(resolverStart).toBeGreaterThanOrEqual(0);
      expect(resolverEnd).toBeGreaterThan(resolverStart);

      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-release-mode-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const helperSource = workflow
        .slice(resolverStart, resolverEnd)
        .replace(/^ {10}/gm, '');
      const fixtureSource = String.raw`
function Expect-Mode {
  param([scriptblock]$Action, [string]$ExpectedMode)
  $actualMode = & $Action
  if ($actualMode -ne $ExpectedMode) {
    throw "Expected mode $ExpectedMode, got $actualMode"
  }
}

function Expect-Rejection {
  param([scriptblock]$Action, [string]$Label)
  $rejected = $false
  try {
    & $Action | Out-Null
  } catch {
    $rejected = $true
  }
  if (-not $rejected) {
    throw "Expected release-mode rejection: $Label"
  }
}

$candidateSha = 'a' * 40
$baseSha256 = 'B' * 64
$baseCommit = 'c' * 40

Expect-Mode {
  Resolve-WindowsReleaseMode -CandidateVersion '0.2.0' -CandidateTag 'v0.2.0' -CandidateSha $candidateSha -BootstrapIdentity "v0.2.0@$candidateSha" -BaseTag '' -BaseAssetName '' -BaseSha256 '' -BaseCommit ''
} 'bootstrap'

Expect-Mode {
  Resolve-WindowsReleaseMode -CandidateVersion '0.2.1' -CandidateTag 'v0.2.1' -CandidateSha $candidateSha -BootstrapIdentity '' -BaseTag 'v0.2.0' -BaseAssetName 'Waggle_0.2.0_x64-setup.exe' -BaseSha256 $baseSha256 -BaseCommit $baseCommit
} 'upgrade'

Expect-Mode {
  Resolve-WindowsReleaseMode -CandidateVersion '0.2.2' -CandidateTag 'v0.2.2' -CandidateSha $candidateSha -BootstrapIdentity '' -BaseTag 'v0.2.1' -BaseAssetName 'Waggle_0.2.1_x64-setup.exe' -BaseSha256 $baseSha256 -BaseCommit $baseCommit
} 'upgrade'

Expect-Rejection {
  Resolve-WindowsReleaseMode -CandidateVersion '0.2.0' -CandidateTag 'v0.2.0' -CandidateSha $candidateSha -BootstrapIdentity "v0.2.0@$baseCommit" -BaseTag '' -BaseAssetName '' -BaseSha256 '' -BaseCommit ''
} 'wrong bootstrap commit'

Expect-Rejection {
  Resolve-WindowsReleaseMode -CandidateVersion '0.2.0' -CandidateTag 'v0.2.0' -CandidateSha $candidateSha -BootstrapIdentity "v0.2.0@$candidateSha" -BaseTag 'v0.1.9' -BaseAssetName '' -BaseSha256 '' -BaseCommit ''
} 'bootstrap with partial baseline'

Expect-Rejection {
  Resolve-WindowsReleaseMode -CandidateVersion '0.2.1' -CandidateTag 'v0.2.1' -CandidateSha $candidateSha -BootstrapIdentity '' -BaseTag '' -BaseAssetName '' -BaseSha256 '' -BaseCommit ''
} 'later release without baseline'

Expect-Rejection {
  Resolve-WindowsReleaseMode -CandidateVersion '0.2.1' -CandidateTag 'v0.2.1' -CandidateSha $candidateSha -BootstrapIdentity "v0.2.1@$candidateSha" -BaseTag 'v0.2.0' -BaseAssetName 'Waggle_0.2.0_x64-setup.exe' -BaseSha256 $baseSha256 -BaseCommit $baseCommit
} 'bootstrap authorization on later release'

Expect-Rejection {
  Resolve-WindowsReleaseMode -CandidateVersion '0.2.1' -CandidateTag 'v0.2.1' -CandidateSha $candidateSha -BootstrapIdentity '' -BaseTag ' ' -BaseAssetName 'Waggle_0.2.0_x64-setup.exe' -BaseSha256 $baseSha256 -BaseCommit $baseCommit
} 'whitespace baseline'

Expect-Rejection {
  Resolve-WindowsReleaseMode -CandidateVersion '0.2.1' -CandidateTag 'v0.2.2' -CandidateSha $candidateSha -BootstrapIdentity '' -BaseTag 'v0.2.0' -BaseAssetName 'Waggle_0.2.0_x64-setup.exe' -BaseSha256 $baseSha256 -BaseCommit $baseCommit
} 'candidate tag mismatch'

Expect-Rejection {
  Resolve-WindowsReleaseMode -CandidateVersion '0.2' -CandidateTag 'v0.2' -CandidateSha $candidateSha -BootstrapIdentity '' -BaseTag 'v0.2.0' -BaseAssetName 'Waggle_0.2.0_x64-setup.exe' -BaseSha256 $baseSha256 -BaseCommit $baseCommit
} 'malformed candidate version'

Expect-Rejection {
  Resolve-WindowsReleaseMode -CandidateVersion '0.2.1' -CandidateTag 'v0.2.1' -CandidateSha ('A' * 40) -BootstrapIdentity '' -BaseTag 'v0.2.0' -BaseAssetName 'Waggle_0.2.0_x64-setup.exe' -BaseSha256 $baseSha256 -BaseCommit $baseCommit
} 'uppercase candidate commit'

Expect-Rejection {
  Resolve-WindowsReleaseMode -CandidateVersion '0.2.1' -CandidateTag 'v0.2.1' -CandidateSha ('a' * 39) -BootstrapIdentity '' -BaseTag 'v0.2.0' -BaseAssetName 'Waggle_0.2.0_x64-setup.exe' -BaseSha256 $baseSha256 -BaseCommit $baseCommit
} 'short candidate commit'

Expect-Rejection {
  Resolve-WindowsReleaseMode -CandidateVersion '0.2.1' -CandidateTag 'v0.2.1' -CandidateSha $candidateSha -BootstrapIdentity '' -BaseTag 'v0.2.0' -BaseAssetName 'Waggle_0.2.0_x64-setup.exe' -BaseSha256 $baseSha256 -BaseCommit ''
} 'upgrade with only three baseline inputs'

Expect-Rejection {
  Resolve-WindowsReleaseMode -CandidateVersion '0.1.9' -CandidateTag 'v0.1.9' -CandidateSha $candidateSha -BootstrapIdentity '' -BaseTag 'v0.1.8' -BaseAssetName 'Waggle_0.1.8_x64-setup.exe' -BaseSha256 $baseSha256 -BaseCommit $baseCommit
} 'release older than bootstrap'

Expect-Rejection {
  Resolve-WindowsReleaseMode -CandidateVersion '0.2.1' -CandidateTag 'v0.2.1' -CandidateSha $candidateSha -BootstrapIdentity '' -BaseTag 'v0.1.9' -BaseAssetName 'Waggle_0.1.9_x64-setup.exe' -BaseSha256 $baseSha256 -BaseCommit $baseCommit
} 'first upgrade without v0.2.0 baseline'
`;

      try {
        fs.writeFileSync(probePath, `${helperSource}\n${fixtureSource}`, 'utf-8');
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        if (result.status !== 0) {
          throw new Error(
            `Release-mode probe failed: ${result.stderr || result.stdout}`,
          );
        }
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
  );

  it('release workflow keeps bootstrap and upgrade artifact paths fail-closed', () => {
    const workflow = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'release.yml'),
      'utf-8',
    );
    const publisherPath = path.join(ROOT, 'scripts', 'publish-windows-release.ps1');
    expect(fs.existsSync(publisherPath)).toBe(true);
    const publisher = fs.readFileSync(publisherPath, 'utf-8');
    const step = (name: string) => {
      const marker = `      - name: ${name}`;
      const start = workflow.indexOf(marker);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(workflow.lastIndexOf(marker)).toBe(start);
      const end = workflow.indexOf('\n      - name:', start + 1);
      return workflow.slice(start, end >= 0 ? end : undefined);
    };
    const windowsJobStart = workflow.indexOf('  build-windows:');
    const windowsJobEnd = workflow.indexOf('\n  build-macos:', windowsJobStart);
    expect(windowsJobStart).toBeGreaterThanOrEqual(0);
    expect(windowsJobEnd).toBeGreaterThan(windowsJobStart);
    const windowsJob = workflow.slice(windowsJobStart, windowsJobEnd);

    const resolverStep = step('Resolve Windows release mode');
    expect(resolverStep).toContain('id: release-mode');
    expect(resolverStep).toContain(
      '-CandidateVersion $candidateVersion `',
    );
    expect(resolverStep).toContain('-CandidateTag $env:GITHUB_REF_NAME `');
    expect(resolverStep).toContain('-CandidateSha $env:GITHUB_SHA `');
    expect(resolverStep).toContain(
      '"mode=$releaseMode" | Out-File -FilePath $env:GITHUB_OUTPUT',
    );

    const baselineStep = step('Download signed Windows upgrade baseline');
    expect(baselineStep).toContain(
      "if: steps.release-mode.outputs.mode == 'upgrade'",
    );

    const certificateStep = step('Certify Windows Solo installer lifecycle');
    expect(certificateStep).toContain(
      'WAGGLE_RELEASE_MODE: ${{ steps.release-mode.outputs.mode }}',
    );
    expect(certificateStep).toContain(
      "if ($env:WAGGLE_RELEASE_MODE -eq 'upgrade') {",
    );
    expect(certificateStep).toContain(
      'Bootstrap certification unexpectedly produced an upgrade receipt',
    );

    const bootstrapAttestation = step('Attest bootstrap Windows artifacts');
    expect(bootstrapAttestation).toContain(
      "if: steps.release-mode.outputs.mode == 'bootstrap'",
    );
    expect(bootstrapAttestation).toContain('windows-installer-certificate.json');
    expect(bootstrapAttestation).not.toContain(
      'windows-installer-upgrade-certificate.json',
    );

    const upgradeAttestation = step('Attest upgrade Windows artifacts');
    expect(upgradeAttestation).toContain(
      "if: steps.release-mode.outputs.mode == 'upgrade'",
    );
    expect(upgradeAttestation).toContain('windows-installer-certificate.json');
    expect(upgradeAttestation).toContain(
      'windows-installer-upgrade-certificate.json',
    );

    const bootstrapUpload = step('Upload Windows bootstrap certificate');
    expect(bootstrapUpload).toContain(
      "if: always() && steps.release-mode.outputs.mode == 'bootstrap'",
    );
    expect(bootstrapUpload).not.toContain(
      'windows-installer-upgrade-certificate.json',
    );

    const upgradeUpload = step('Upload Windows lifecycle certificate');
    expect(upgradeUpload).toContain(
      "if: always() && steps.release-mode.outputs.mode == 'upgrade'",
    );
    expect(upgradeUpload).toContain(
      'windows-installer-upgrade-certificate.json',
    );

    const bootstrapPublish = step('Publish certified Windows bootstrap installer');
    expect(bootstrapPublish).toContain(
      "if: success() && startsWith(github.ref, 'refs/tags/v') && steps.release-mode.outputs.mode == 'bootstrap'",
    );
    expect(bootstrapPublish).toContain(
      'WINDOWS_BOOTSTRAP_RELEASE_IDENTITY: ${{ vars.WINDOWS_BOOTSTRAP_RELEASE_IDENTITY }}',
    );
    expect(bootstrapPublish).toContain(
      'WAGGLE_RELEASE_MODE: ${{ steps.release-mode.outputs.mode }}',
    );
    expect(bootstrapPublish).toContain(
      'run: ./scripts/publish-windows-release.ps1 -Mode bootstrap',
    );
    expect(bootstrapPublish).not.toContain('function ');
    expect(bootstrapPublish).not.toContain('gh release ');

    const upgradePublish = step('Publish certified Windows installer');
    expect(upgradePublish).toContain(
      "if: success() && startsWith(github.ref, 'refs/tags/v') && steps.release-mode.outputs.mode == 'upgrade'",
    );
    expect(upgradePublish).toContain(
      'WAGGLE_RELEASE_MODE: ${{ steps.release-mode.outputs.mode }}',
    );
    expect(upgradePublish).toContain(
      'run: ./scripts/publish-windows-release.ps1 -Mode upgrade',
    );
    expect(upgradePublish).not.toContain('function ');
    expect(upgradePublish).not.toContain('gh release ');

    for (const publishStep of [bootstrapPublish, upgradePublish]) {
      expect(publishStep).toContain('shell: pwsh');
      expect(publishStep).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
      expect(publishStep).toContain(
        'WINDOWS_BOOTSTRAP_RELEASE_IDENTITY: ${{ vars.WINDOWS_BOOTSTRAP_RELEASE_IDENTITY }}',
      );
      expect(publishStep).toContain(
        'WINDOWS_UPGRADE_BASE_TAG: ${{ vars.WINDOWS_UPGRADE_BASE_TAG }}',
      );
      expect(publishStep).toContain(
        'WINDOWS_UPGRADE_BASE_ASSET_NAME: ${{ vars.WINDOWS_UPGRADE_BASE_ASSET_NAME }}',
      );
      expect(publishStep).toContain(
        'WINDOWS_UPGRADE_BASE_SHA256: ${{ vars.WINDOWS_UPGRADE_BASE_SHA256 }}',
      );
      expect(publishStep).toContain(
        'WINDOWS_UPGRADE_BASE_COMMIT: ${{ vars.WINDOWS_UPGRADE_BASE_COMMIT }}',
      );
      expect(publishStep).toContain(
        'WINDOWS_CODESIGN_APPROVED_THUMBPRINT: ${{ vars.WINDOWS_CODESIGN_APPROVED_THUMBPRINT }}',
      );
      expect(publishStep).toContain(
        'WAGGLE_CERTIFIED_CANDIDATE_SHA256: ${{ steps.certify-windows.outputs.candidate_sha256 }}',
      );
      expect(publishStep).toContain(
        'WAGGLE_CERTIFIED_CANDIDATE_VERSION: ${{ steps.certify-windows.outputs.candidate_version }}',
      );
    }
    expect(upgradePublish).toContain(
      'WAGGLE_UPGRADE_BASE_INSTALLER_PATH: ${{ steps.upgrade-baseline.outputs.installer_path }}',
    );
    expect(upgradePublish).toContain(
      'WAGGLE_UPGRADE_BASE_VERSION: ${{ steps.upgrade-baseline.outputs.base_version }}',
    );
    expect(upgradePublish).toContain(
      'WAGGLE_UPGRADE_BASE_COMMIT: ${{ steps.upgrade-baseline.outputs.base_commit }}',
    );

    expect([
      ...windowsJob.matchAll(
        /^\s*run: \.\/scripts\/publish-windows-release\.ps1 -Mode (?:bootstrap|upgrade)\s*$/gm,
      ),
    ]).toHaveLength(2);

    expect(publisher).toContain(
      "[ValidateSet('bootstrap', 'upgrade')]",
    );
    expect(publisher).toContain(
      '$expectedBootstrapIdentity = "v0.2.0@$env:GITHUB_SHA"',
    );
    expect(publisher).toContain(
      'Bootstrap publication is not bound to the exact authorized v0.2.0 release',
    );
    expect(publisher).toContain(
      'Upgrade publication requires an empty bootstrap authorization and all baseline inputs',
    );
    expect(publisher).toContain(
      'Bootstrap publication found an unexpected upgrade certificate',
    );
    expect(publisher).toContain('$releaseAssets = @($installer, $cleanReceipt)');
    expect(publisher).toContain(
      '$releaseAssets = @($installer, $cleanReceipt, $upgradeReceipt)',
    );
    expect(publisher).toContain('Assert-PassingWindowsCertificateReceipt');
    expect(publisher).toContain('Assert-ExpectedAuthenticodeSignature');
    expect(publisher).toContain('Assert-RemoteTagCommit');
    expect(publisher).toContain('Refusing to use a pre-existing release');
    expect([
      ...publisher.matchAll(
        /^\s*\$createdReleaseId\s*=/gm,
      ),
    ]).toHaveLength(0);
    expect([...publisher.matchAll(/^function Set-ReadOnlyCreatedReleaseId \{/gm)])
      .toHaveLength(1);
    expect([
      ...publisher.matchAll(
        /^Set-ReadOnlyCreatedReleaseId \(\[string\]\$releaseData\.id\)\s*$/gm,
      ),
    ]).toHaveLength(1);
    expect(publisher).not.toMatch(/Set-Variable[^\r\n]*-Force/);
    expect(publisher).toContain(
      'Published release assets do not exactly match the certified artifact set',
    );
    expect(publisher).toContain('[System.StringComparer]::Ordinal');
    expect(publisher).not.toContain('Compare-Object');
    expect([...publisher.matchAll(/^function Assert-ExactReleaseAssets \{/gm)])
      .toHaveLength(1);
    expect([...publisher.matchAll(/^function Assert-ReleaseIdentity \{/gm)])
      .toHaveLength(1);
    expect([...publisher.matchAll(/^function New-ReleaseAssetManifest \{/gm)])
      .toHaveLength(1);
    expect([...publisher.matchAll(/^function Assert-RemoteReleaseAssetContents \{/gm)])
      .toHaveLength(1);
    expect([
      ...publisher.matchAll(
        /^function Assert-ReleaseAssetFileMatchesManifest \{/gm,
      ),
    ]).toHaveLength(1);
    expect([
      ...publisher.matchAll(
        /^function Assert-LocalReleaseAssetsUnchanged \{/gm,
      ),
    ]).toHaveLength(1);
    expect([...publisher.matchAll(/^\s*gh release create \$tag\b/gm)])
      .toHaveLength(1);
    expect([...publisher.matchAll(/^\s*gh release upload \$tag\b/gm)])
      .toHaveLength(1);
    expect([
      ...publisher.matchAll(
        /^\s*gh release edit \$tag --draft=false --prerelease=false\s*$/gm,
      ),
    ]).toHaveLength(1);
    expect([
      ...publisher.matchAll(
        /^\s*Assert-ExactReleaseAssets \$uploadedRelease \$releaseAssets\s*$/gm,
      ),
    ]).toHaveLength(1);
    expect([
      ...publisher.matchAll(
        /^\s*Assert-ExactReleaseAssets \$publishedRelease \$releaseAssets\s*$/gm,
      ),
    ]).toHaveLength(1);
    expect([
      ...publisher.matchAll(
        /^\s*Assert-RemoteReleaseAssetContents \$tag \$uploadedRelease \$releaseAssetManifest 'uploaded'\s*$/gm,
      ),
    ]).toHaveLength(1);
    expect([
      ...publisher.matchAll(
        /^\s*Assert-RemoteReleaseAssetContents \$tag \$publishedRelease \$releaseAssetManifest 'published'\s*$/gm,
      ),
    ]).toHaveLength(1);
    const uploadIndex = publisher.indexOf('gh release upload $tag @releaseAssetPaths');
    const uploadedHashIndex = publisher.indexOf(
      "Assert-RemoteReleaseAssetContents $tag $uploadedRelease $releaseAssetManifest 'uploaded'",
    );
    const publishIndex = publisher.indexOf(
      'gh release edit $tag --draft=false --prerelease=false',
    );
    const publishedHashIndex = publisher.indexOf(
      "Assert-RemoteReleaseAssetContents $tag $publishedRelease $releaseAssetManifest 'published'",
    );
    expect(uploadIndex).toBeGreaterThanOrEqual(0);
    expect(uploadedHashIndex).toBeGreaterThan(uploadIndex);
    expect(publishIndex).toBeGreaterThan(uploadedHashIndex);
    expect(publishedHashIndex).toBeGreaterThan(publishIndex);
    const tagBindingIndices = [
      ...publisher.matchAll(
        /^Assert-PublicationTagBindings \$Mode \$tag \$sourceRevision\s*$/gm,
      ),
    ].map((match) => match.index);
    expect(tagBindingIndices).toHaveLength(3);
    expect(tagBindingIndices[0]).toBeLessThan(
      publisher.indexOf('gh release create $tag'),
    );
    expect(tagBindingIndices[1]).toBeGreaterThan(
      publisher.indexOf('gh release create $tag'),
    );
    expect(tagBindingIndices[1]).toBeLessThan(uploadIndex);
    expect(tagBindingIndices[2]).toBeGreaterThan(uploadIndex);
    expect(tagBindingIndices[2]).toBeLessThan(publishIndex);
    const remoteHelperStart = publisher.indexOf(
      'function Assert-RemoteReleaseAssetContents {',
    );
    const remoteHelperEnd = publisher.indexOf(
      '\nfunction Assert-ManagedModelAndMemoryEvidence {',
      remoteHelperStart,
    );
    const remoteHelper = publisher.slice(remoteHelperStart, remoteHelperEnd);
    expect([
      ...remoteHelper.matchAll(
        /^\s*Assert-ReleaseAssetFileMatchesManifest `\s*$/gm,
      ),
    ]).toHaveLength(1);
    const remoteDownloadIndex = remoteHelper.indexOf(
      'gh release download $Tag --dir $downloadRoot',
    );
    const remoteCountIndex = remoteHelper.indexOf(
      'if ($downloadedFiles.Count -ne $Manifest.Count)',
    );
    const remoteHashIndex = remoteHelper.indexOf(
      'Assert-ReleaseAssetFileMatchesManifest `',
    );
    expect(remoteDownloadIndex).toBeGreaterThanOrEqual(0);
    expect(remoteCountIndex).toBeGreaterThan(remoteDownloadIndex);
    expect(remoteHashIndex).toBeGreaterThan(remoteCountIndex);
    expect([
      ...publisher.matchAll(
        /^Assert-ReleaseIdentity `\s*$/gm,
      ),
    ]).toHaveLength(3);
  });

  it.runIf(process.platform === 'win32')(
    'release publisher rejects differently-cased asset names',
    () => {
      const publisher = fs
        .readFileSync(path.join(ROOT, 'scripts', 'publish-windows-release.ps1'), 'utf-8')
        .replace(/\r\n/g, '\n');
      const helperStart = publisher.indexOf('function Assert-ExactReleaseAssets {');
      const helperEnd = publisher.indexOf('\nfunction ', helperStart + 1);
      expect(helperStart).toBeGreaterThanOrEqual(0);
      expect(helperEnd).toBeGreaterThan(helperStart);

      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-release-assets-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const fixtureSource = String.raw`
function Expect-Rejection {
  param([scriptblock]$Action, [string]$Label)
  $rejected = $false
  try { & $Action } catch { $rejected = $true }
  if (-not $rejected) { throw "$Label was accepted" }
}

$expectedPath = Join-Path $PSScriptRoot 'Waggle_0.2.0_x64-setup.exe'
$receiptPath = Join-Path $PSScriptRoot 'windows-installer-certificate.json'
[System.IO.File]::WriteAllText($expectedPath, 'fixture')
[System.IO.File]::WriteAllText($receiptPath, 'receipt')
$expectedAssets = @(
  Get-Item -LiteralPath $expectedPath
  Get-Item -LiteralPath $receiptPath
)
$exactRelease = [pscustomobject]@{
  assets = @(
    [pscustomobject]@{ name = 'Waggle_0.2.0_x64-setup.exe' }
    [pscustomobject]@{ name = 'windows-installer-certificate.json' }
  )
}
$wrongCaseRelease = [pscustomobject]@{
  assets = @(
    [pscustomobject]@{ name = 'waggle_0.2.0_x64-setup.exe' }
    [pscustomobject]@{ name = 'windows-installer-certificate.json' }
  )
}
$missingRelease = [pscustomobject]@{
  assets = @([pscustomobject]@{ name = 'Waggle_0.2.0_x64-setup.exe' })
}
$extraRelease = [pscustomobject]@{
  assets = @(
    [pscustomobject]@{ name = 'Waggle_0.2.0_x64-setup.exe' }
    [pscustomobject]@{ name = 'windows-installer-certificate.json' }
    [pscustomobject]@{ name = 'unexpected.txt' }
  )
}
$duplicateRelease = [pscustomobject]@{
  assets = @(
    [pscustomobject]@{ name = 'Waggle_0.2.0_x64-setup.exe' }
    [pscustomobject]@{ name = 'Waggle_0.2.0_x64-setup.exe' }
  )
}

Assert-ExactReleaseAssets $exactRelease $expectedAssets
Expect-Rejection {
  Assert-ExactReleaseAssets $wrongCaseRelease $expectedAssets
} 'differently-cased asset'
Expect-Rejection {
  Assert-ExactReleaseAssets $missingRelease $expectedAssets
} 'missing asset'
Expect-Rejection {
  Assert-ExactReleaseAssets $extraRelease $expectedAssets
} 'extra asset'
Expect-Rejection {
  Assert-ExactReleaseAssets $duplicateRelease $expectedAssets
} 'duplicate asset'
`;

      try {
        fs.writeFileSync(
          probePath,
          `${publisher.slice(helperStart, helperEnd)}\n${fixtureSource}`,
          'utf-8',
        );
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        if (result.status !== 0) {
          throw new Error(`Release asset probe failed: ${result.stderr || result.stdout}`);
        }
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
  );

  it.runIf(process.platform === 'win32')(
    'release publisher binds release identity and exact asset bytes',
    () => {
      const publisher = fs
        .readFileSync(path.join(ROOT, 'scripts', 'publish-windows-release.ps1'), 'utf-8')
        .replace(/\r\n/g, '\n');
      const helperStart = publisher.indexOf('function Assert-ExactReleaseAssets {');
      const helperEnd = publisher.indexOf(
        '\nfunction Assert-ManagedModelAndMemoryEvidence {',
        helperStart,
      );
      expect(helperStart).toBeGreaterThanOrEqual(0);
      expect(helperEnd).toBeGreaterThan(helperStart);

      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-release-bytes-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const fixtureSource = String.raw`
function Expect-Rejection {
  param([scriptblock]$Action, [string]$Label)
  $rejected = $false
  try { & $Action } catch { $rejected = $true }
  if (-not $rejected) { throw "$Label was accepted" }
}

$expectedDirectory = New-Item -ItemType Directory -Path (
  Join-Path $PSScriptRoot 'expected'
)
$changedDirectory = New-Item -ItemType Directory -Path (
  Join-Path $PSScriptRoot 'changed'
)
$expectedPath = Join-Path $expectedDirectory.FullName 'asset.bin'
$changedPath = Join-Path $changedDirectory.FullName 'asset.bin'
[System.IO.File]::WriteAllText($expectedPath, 'AAAA')
[System.IO.File]::WriteAllText($changedPath, 'BBBB')
$manifest = New-ReleaseAssetManifest @((Get-Item -LiteralPath $expectedPath))
Assert-ReleaseAssetFileMatchesManifest $expectedPath $manifest[0] 'unchanged local asset'
Expect-Rejection {
  Assert-ReleaseAssetFileMatchesManifest $changedPath $manifest[0] 'same-size changed asset'
} 'same-name-size content substitution'

Set-ReadOnlyCreatedReleaseId 'release-A'
Expect-Rejection {
  $script:createdReleaseId = 'release-B'
} 'read-only created release id reassignment'
if ($script:createdReleaseId -cne 'release-A') {
  throw 'Read-only created release id changed'
}

$env:RUNNER_TEMP = Join-Path $PSScriptRoot 'runner'
New-Item -ItemType Directory -Path $env:RUNNER_TEMP | Out-Null
$remoteRelease = [pscustomobject]@{
  assets = @([pscustomobject]@{ name = 'asset.bin' })
}
$script:fakeGhAssetPath = $expectedPath
function gh {
  if ($args.Count -ne 5 -or
      [string]$args[0] -cne 'release' -or
      [string]$args[1] -cne 'download' -or
      [string]$args[3] -cne '--dir') {
    throw 'Unexpected fake gh invocation'
  }
  Copy-Item -LiteralPath $script:fakeGhAssetPath -Destination (
    Join-Path ([string]$args[4]) 'asset.bin'
  )
  $global:LASTEXITCODE = 0
}
Assert-RemoteReleaseAssetContents 'v0.2.0' $remoteRelease $manifest 'fake-valid'
$script:fakeGhAssetPath = $changedPath
Expect-Rejection {
  Assert-RemoteReleaseAssetContents 'v0.2.0' $remoteRelease $manifest 'fake-upload'
} 'same-name-size remote content substitution'

$created = [pscustomobject]@{
  id = 'release-A'
  tagName = 'v0.2.0'
  name = 'Waggle v0.2.0'
  isDraft = $true
  isPrerelease = $false
}
$substituted = [pscustomobject]@{
  id = 'release-B'
  tagName = 'v0.2.0'
  name = 'Waggle v0.2.0'
  isDraft = $true
  isPrerelease = $false
}
Assert-ReleaseIdentity $created 'release-A' 'v0.2.0' $true 'created release'
Expect-Rejection {
  Assert-ReleaseIdentity $substituted 'release-A' 'v0.2.0' $true 'substituted release'
} 'release id substitution'
`;

      try {
        fs.writeFileSync(
          probePath,
          `${publisher.slice(helperStart, helperEnd)}\n${fixtureSource}`,
          'utf-8',
        );
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        if (result.status !== 0) {
          throw new Error(
            `Release byte-integrity probe failed: ${result.stderr || result.stdout}`,
          );
        }
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
  );

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

  it('Windows desktop workflows verify isolated packaged hook lifecycles after staging', () => {
    const workflows = [
      { name: 'release.yml', windowsJob: '  build-windows:', macJob: '  build-macos:' },
      { name: 'tauri-build-pr.yml', windowsJob: '  verify-windows:', macJob: '  verify-macos:' },
    ];

    for (const { name, windowsJob, macJob } of workflows) {
      const workflow = fs.readFileSync(
        path.join(ROOT, '.github', 'workflows', name),
        'utf-8',
      );
      const windowsStart = workflow.indexOf(windowsJob);
      const macStart = workflow.indexOf(macJob);
      expect(windowsStart).toBeGreaterThanOrEqual(0);
      expect(macStart).toBeGreaterThan(windowsStart);

      const windowsSteps = workflow.slice(windowsStart, macStart);
      const stageIndex = windowsSteps.indexOf('node scripts/stage-sidecar-deps.mjs');
      const lifecycleIndex = windowsSteps.indexOf('hook-packages-runtime.test.ts');
      expect(stageIndex).toBeGreaterThanOrEqual(0);
      expect(lifecycleIndex).toBeGreaterThan(stageIndex);
      expect(windowsSteps).toContain('WAGGLE_VERIFY_STAGED_HOOK_RUNTIME');
      expect(windowsSteps).toContain('runs staged Tauri hook lifecycles');
    }
  });

  it('Windows desktop workflows certify the built NSIS lifecycle before artifact handoff', () => {
    const workflows = [
      {
        name: 'release.yml',
        windowsJob: '  build-windows:',
        macJob: '  build-macos:',
        handoff: 'Publish certified Windows installer',
      },
      {
        name: 'tauri-build-pr.yml',
        windowsJob: '  verify-windows:',
        macJob: '  verify-macos:',
        handoff: 'Upload Windows artifacts',
      },
    ];

    for (const { name, windowsJob, macJob, handoff } of workflows) {
      const workflow = fs.readFileSync(
        path.join(ROOT, '.github', 'workflows', name),
        'utf-8',
      );
      const publisher = name === 'release.yml'
        ? fs.readFileSync(
          path.join(ROOT, 'scripts', 'publish-windows-release.ps1'),
          'utf-8',
        )
        : '';
      const windowsSteps = workflow.slice(
        workflow.indexOf(windowsJob),
        workflow.indexOf(macJob),
      );
      const buildIndex = windowsSteps.indexOf('Build Tauri (Windows)');
      const pruneIndex = windowsSteps.indexOf('Reclaim Windows build intermediates');
      const certificateIndex = windowsSteps.indexOf('certify-windows-installer.ps1');
      const signerCleanupIndex = windowsSteps.indexOf('Remove imported Windows code-signing certificates');
      const receiptIndex = windowsSteps.indexOf(
        'windows-installer-certificate.json',
        certificateIndex,
      );
      const handoffIndex = windowsSteps.indexOf(handoff);
      const nextStepIndex = windowsSteps.indexOf('\n      - name:', handoffIndex + handoff.length);
      const handoffStep = windowsSteps.slice(
        handoffIndex,
        nextStepIndex >= 0 ? nextStepIndex : undefined,
      );

      expect(buildIndex).toBeGreaterThanOrEqual(0);
      if (name === 'release.yml') {
        expect(pruneIndex).toBeGreaterThan(buildIndex);
        expect(pruneIndex).toBeLessThan(certificateIndex);
        expect(signerCleanupIndex).toBeGreaterThan(buildIndex);
        expect(signerCleanupIndex).toBeLessThan(certificateIndex);
      }
      expect(certificateIndex).toBeGreaterThan(buildIndex);
      expect(receiptIndex).toBeGreaterThan(certificateIndex);
      expect(handoffIndex).toBeGreaterThan(certificateIndex);
      expect(windowsSteps).toContain("-Filter '*-setup.exe'");
      expect(windowsSteps).toContain("Get-ChildItem -LiteralPath 'app/src-tauri/target' -Recurse");
      expect(windowsSteps).toContain('app/src-tauri/target/**/bundle/nsis');
      expect(windowsSteps).not.toContain("-LiteralPath 'app/src-tauri/target/release/bundle/nsis'");
      expect(windowsSteps).toContain('--bundles nsis');
      expect(windowsSteps).not.toContain('bundle/msi');
      expect(windowsSteps).toContain('npm ci --prefix app --ignore-scripts');
      expect(windowsSteps).toContain('run: npm ci');
      expect(windowsSteps).toContain('node node_modules/@tauri-apps/cli/tauri.js build');
      expect(windowsSteps).not.toContain('npx --yes @tauri-apps/cli@2');
      expect(windowsSteps).toContain('toolchain: 1.94.0');
      expect(windowsSteps).toContain('persist-credentials: false');
      expect(windowsSteps).toContain('-ExpectedSourceRevision $env:GITHUB_SHA');
      expect(handoffStep).not.toContain('if: always()');
      if (name === 'release.yml') {
        expect(windowsSteps.slice(0, certificateIndex)).not.toContain('tagName:');
        expect(windowsSteps.slice(0, certificateIndex)).not.toContain('releaseDraft:');
        expect(handoffStep).toContain('if: success()');
        expect(handoffStep).toContain(
          'run: ./scripts/publish-windows-release.ps1 -Mode upgrade',
        );
        expect(publisher).toContain('Get-FileHash');
        expect(publisher).toContain('receiptData.installer.sha256');
        expect(workflow).not.toContain('workflow_dispatch:');
        expect(windowsSteps).toContain('environment: production-windows-signing');
        expect(windowsSteps).toContain('Validate release tag and app version');
        expect(windowsSteps).toContain("$expectedTag = \"v$version\"");
        expect(windowsSteps).toContain('git merge-base --is-ancestor $env:GITHUB_SHA origin/main');
        expect(workflow).toContain('group: release-${{ github.ref }}');
        expect(windowsSteps).toContain('Attest bootstrap Windows artifacts');
        expect(windowsSteps).toContain('Attest upgrade Windows artifacts');
        expect(windowsSteps).toContain('attest-build-provenance@');
        expect(windowsSteps).toContain('WINDOWS_CODESIGN_PFX_BASE64');
        expect(windowsSteps).toContain('WINDOWS_CODESIGN_APPROVED_THUMBPRINT');
        expect(windowsSteps).toContain('Import-PfxCertificate');
        expect(windowsSteps).toContain('WAGGLE_IMPORTED_CERT_THUMBPRINTS');
        expect(windowsSteps).toContain('X509EnhancedKeyUsageExtension');
        expect(windowsSteps).toContain('apply-signing-config.mjs');
        expect(windowsSteps).toContain('tauri.build-override.conf.json');
        expect(windowsSteps).toContain('-RequireAuthenticodeSignature');
        expect(windowsSteps).toContain('-ExpectedSignerThumbprint $env:WAGGLE_APPROVED_CODESIGN_THUMBPRINT');
        expect(windowsSteps).toContain('WINDOWS_UPGRADE_BASE_TAG');
        expect(windowsSteps).toContain('WINDOWS_UPGRADE_BASE_ASSET_NAME');
        expect(windowsSteps).toContain('WINDOWS_UPGRADE_BASE_SHA256');
        expect(windowsSteps).toContain('WINDOWS_UPGRADE_BASE_COMMIT');
        expect(windowsSteps).toContain('Download signed Windows upgrade baseline');
        expect(windowsSteps).toContain('gh release view $baseTag');
        expect(windowsSteps).toContain('isPrerelease');
        expect(windowsSteps).toContain('gh release download $baseTag');
        expect(windowsSteps).toContain('WAGGLE_UPGRADE_BASE_INSTALLER_PATH');
        expect(windowsSteps).toContain('WAGGLE_UPGRADE_BASE_VERSION');
        expect(windowsSteps).toContain('WAGGLE_UPGRADE_BASE_COMMIT');
        expect(windowsSteps).toContain('git merge-base --is-ancestor $baseCommit $env:GITHUB_SHA');
        expect(windowsSteps).toContain('WINDOWS_UPGRADE_BASE_COMMIT must be exactly 40 hexadecimal characters');
        expect(windowsSteps).toContain('Protected Windows upgrade baseline tag does not resolve to WINDOWS_UPGRADE_BASE_COMMIT');
        expect(windowsSteps).toContain('-RequireVersionToVersionUpgrade');
        expect(windowsSteps).toContain('-PreviousInstallerPath $env:WAGGLE_UPGRADE_BASE_INSTALLER_PATH');
        expect(windowsSteps).toContain('-ExpectedPreviousInstallerSha256 $env:WINDOWS_UPGRADE_BASE_SHA256');
        expect(windowsSteps).toContain('-ExpectedPreviousVersion $env:WAGGLE_UPGRADE_BASE_VERSION');
        expect(windowsSteps).toContain('-ExpectedPreviousSourceRevision $env:WAGGLE_UPGRADE_BASE_COMMIT');
        expect(windowsSteps).toContain('-ExpectedCandidateInstallerSha256 $candidateSha256');
        expect(windowsSteps).toContain('-ExpectedCandidateVersion $candidateVersion');
        expect(windowsSteps).toContain('-VerifyManagedModel');
        expect([...windowsSteps.matchAll(/-VerifyManagedModel/g)]).toHaveLength(2);
        expect(windowsSteps).toContain('windows-installer-upgrade-certificate.json');
        expect([...windowsSteps.matchAll(/& \.\/scripts\/certify-windows-installer\.ps1/g)])
          .toHaveLength(2);
        expect(windowsSteps).toContain('Refusing to prune outside the Tauri target');
        expect(windowsSteps).toContain('$minimumFreeBytes = 8GB');
        expect(publisher).toContain('isDraft');
        expect(publisher).toContain('Refusing to use a pre-existing release');
        expect(publisher).toContain('Assert-PassingWindowsCertificateReceipt');
        expect(publisher).toContain('$Receipt.certificationMode');
        expect(publisher).toContain('$ExpectedMode');
        expect(publisher).toContain("$cleanReceiptData 'same-version-repair'");
        expect(publisher).toContain("$receiptData 'version-to-version-upgrade'");
        expect(publisher).toContain('$Receipt.managedModelVerified');
        expect(publisher).toContain('$Receipt.certifiedTier');
        expect(publisher).toContain("'soloTier'");
        expect(publisher).toContain("'previousSoloTier'");
        expect(publisher).toContain("'repairSoloTier'");
        expect(publisher).toContain("'managedModelProxyRestartChat'");
        expect(publisher).toContain("'previousManagedModelSeeded'");
        expect(publisher).toContain("'upgradeManagedModelPreserved'");
        expect(publisher).toContain("'repairManagedModelDigestPreserved'");
        expect(publisher).toContain('upgrade.managedModelDigest');
        expect([...publisher.matchAll(/'managedModelProxyRestartChat'/g)]).toHaveLength(2);
        expect(publisher).toContain('windows-installer-upgrade-certificate.json');
        expect(publisher).toContain('previousInstaller.sha256');
        expect(publisher).toContain('previousInstalledApp.authenticodeStatus');
        expect(publisher).toContain('upgrade.previousVersion');
        expect(publisher).toContain('upgrade.candidateVersion');
        expect(publisher).toContain('upgrade.previousSourceRevision');
        expect(publisher).toContain('Assert-PublicationTagBindings');
        expect(publisher).toContain('WAGGLE_UPGRADE_BASE_COMMIT');
        expect(publisher).toContain('WINDOWS_UPGRADE_BASE_COMMIT');
        expect(publisher).toContain(
          'Certified Windows upgrade baseline commit no longer matches the protected commit',
        );
        expect(publisher).toContain('Assert-ExpectedAuthenticodeSignature $installer');
        expect(publisher).toContain('Assert-ExpectedAuthenticodeSignature $baseInstaller');
        expect(publisher).toContain('WINDOWS_CODESIGN_APPROVED_THUMBPRINT');
        expect(publisher).toContain('$env:GITHUB_REF_NAME');
        expect(publisher).not.toContain("$tag = '${{ github.ref_name }}'");
        expect(publisher).toContain('versionToVersionUpgrade');
        expect(publisher).toContain('upgradeConfiguredDataPreserved');
        expect(publisher).toContain('upgradeProfileDataPreserved');
        expect(publisher).toContain('upgradeVaultKeyPreserved');
        expect(publisher).toContain('installedApp.authenticodeStatus');
        expect(publisher).toContain("signatureType -ne 'Authenticode'");
        expect(publisher).toContain('nonPassingChecks');
        expect(publisher).toContain('generatedInstallerScriptSha256');
        expect(publisher).toContain('managedModelVerified');
        expect(publisher).toContain('managedModelDigest');
        expect(publisher).toContain('noModelChatSetupRequired');
        expect(publisher).toContain('windowsInboxTools');
        expect(publisher).toContain('dockerIndependentRuntimePrerequisites');
        expect(publisher).toContain('managedModelChat');
        expect(publisher).toContain('managedRuntimeCleanup');
        expect(publisher).toContain('git ls-remote --tags origin');
        expect(publisher).toContain('--verify-tag');
        expect(publisher).not.toContain('--clobber');
      } else {
        expect(windowsSteps).not.toContain('-RequireAuthenticodeSignature');
        expect(windowsSteps).not.toContain('-VerifyManagedModel');
        expect(windowsSteps).not.toContain('-RequireVersionToVersionUpgrade');
        expect(windowsSteps).not.toContain('-PreviousInstallerPath');
      }
    }
  });

  it('PR desktop verification runs when either Windows workflow changes', () => {
    const workflow = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'tauri-build-pr.yml'),
      'utf-8',
    );
    expect([...workflow.matchAll(/\.github\/workflows\/release\.yml/g)]).toHaveLength(2);
    expect([...workflow.matchAll(/\.github\/workflows\/tauri-build-pr\.yml/g)]).toHaveLength(2);
    expect([...workflow.matchAll(/'scripts\/\*\*'/g)]).toHaveLength(2);
    const windowsJobStart = workflow.indexOf('  verify-windows:');
    const windowsJobEnd = workflow.indexOf('\n  verify-macos:', windowsJobStart);
    expect(windowsJobStart).toBeGreaterThanOrEqual(0);
    expect(windowsJobEnd).toBeGreaterThan(windowsJobStart);
    const windowsJob = workflow.slice(windowsJobStart, windowsJobEnd);
    expect(windowsJob).toContain('runs-on: windows-latest');
    expect([
      ...windowsJob.matchAll(/- name: Verify Windows release-mode and publication guards/g),
    ]).toHaveLength(1);
    expect(windowsJob).toContain('shell: pwsh');
    expect(windowsJob).toContain("WAGGLE_REQUIRE_PWSH7: '1'");
    expect(windowsJob).toContain(
      'packages/server/tests/tauri-config.test.ts -t "CI/CD Configuration"',
    );
    expect(windowsJob.indexOf('- name: Install dependencies')).toBeLessThan(
      windowsJob.indexOf('- name: Verify Windows release-mode and publication guards'),
    );
    expect(
      windowsJob.indexOf('- name: Verify Windows release-mode and publication guards'),
    ).toBeLessThan(windowsJob.indexOf('- name: Install locked Tauri CLI'));
  });

  it('desktop workflows pin every third-party action to a full commit SHA', () => {
    for (const name of ['release.yml', 'tauri-build-pr.yml']) {
      const workflow = fs.readFileSync(
        path.join(ROOT, '.github', 'workflows', name),
        'utf-8',
      );
      const actionRefs = [...workflow.matchAll(/uses:\s+[^@\s]+@([^\s#]+)/g)]
        .map((match) => match[1]);
      expect(actionRefs.length).toBeGreaterThan(0);
      for (const actionRef of actionRefs) {
        expect(actionRef).toMatch(/^[0-9a-f]{40}$/);
      }
    }
  });

  it('Windows installer certificate is fail-closed across isolated boot, repair, and uninstall', () => {
    const script = fs.readFileSync(
      path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'),
      'utf-8',
    );

    expect(script.startsWith('#Requires -Version 7.0')).toBe(true);
    expect(script).toContain('Set-StrictMode -Version Latest');
    expect(script).toContain('"/S /D=$installDir"');
    expect(script).toContain('function Assert-SafeReceiptPath');
    expect(script).toContain('Assert-SafeReceiptPath $ReceiptPath');
    expect(script).toContain('function Reserve-CertificateReceiptPath');
    expect(script).toContain(
      '$receiptReservation = Reserve-CertificateReceiptPath $ReceiptPath',
    );
    expect(script).toContain(
      'Write-CertificateReceipt $receiptReservation $receiptJson',
    );
    expect(script).toContain('Receipt path already exists; refusing to overwrite');
    expect(script).toContain('Receipt parent must not be a reparse point');
    expect(script).not.toContain('Set-Content -LiteralPath $ReceiptPath');
    expect(
      script.indexOf('$receiptReservation = Reserve-CertificateReceiptPath $ReceiptPath'),
    ).toBeLessThan(
      script.indexOf('$scratchOwnershipMarker = New-CertificateScratchRoot'),
    );
    expect(script).toContain('function New-CertificateScratchRoot');
    expect(script).toContain('function Remove-CertificateScratchRoot');
    expect(script).toContain('[System.IO.FileMode]::CreateNew');
    expect(script).toContain(
      '$scratchOwnershipMarker = New-CertificateScratchRoot $scratchRoot $runId',
    );
    expect(script).toContain(
      'Remove-CertificateScratchRoot $scratchRoot $scratchOwnershipMarker $runId',
    );
    expect(script).not.toContain(
      'New-Item -ItemType Directory -Path $scratchRoot -Force | Out-Null',
    );
    expect(script).not.toContain(
      'Remove-Item -LiteralPath $resolvedRoot -Recurse -Force',
    );
    expect(script).not.toContain(
      'Remove-Item -LiteralPath $scratchRoot -Recurse -Force',
    );
    expect(script).toContain("$env:WAGGLE_PORT = '3333'");
    expect(script).toContain('Assert-TcpPortAvailable 3333');
    expect(script).toContain("$profileDataDir = Join-Path $env:USERPROFILE '.waggle'");
    expect(script.indexOf('Assert-TcpPortAvailable 3333')).toBeLessThan(
      script.indexOf('New-Item -ItemType Directory -Path $profileDataDir'),
    );
    expect(script).toContain('$dataDir = $profileDataDir');
    expect(script).not.toContain("$dataDir = Join-Path $scratchRoot 'data'");
    expect(script).not.toContain('$env:WAGGLE_DATA_DIR = $dataDir');
    expect(script).toContain("'OPENROUTER_API_KEY'");
    expect(script).toContain("resources\\node.exe");
    expect(script).toContain("resources\\service.js");
    expect(script).toContain("resources\\marketplace.db");
    expect(script).not.toContain('--install-links');
    expect(script).toContain("$offlinePackageTar = Join-Path $isolationPath 'tar.exe'");
    expect(script).toContain(
      "$offlinePackageArchive = Join-Path $scratchRoot 'waggle-offline-install-probe-1.0.0.tgz'",
    );
    expect(script).toContain('Invoke-RawProcess $offlinePackageTar');
    expect(script).toContain('-- $offlinePackageArchive 2>&1');
    expect(script).toContain(
      'Bundled npm installed the local offline package as a reparse point.',
    );
    expect(script).toContain('prepare-ran.txt');
    expect(script).toContain('prepack-ran.txt');
    expect(script).toContain('install-ran.txt');
    expect(script).toContain("$receipt.Contains('scratchCleanupError')");
    expect(script).toContain("Join-Path $dataDir 'marketplace.db'");
    expect(script).toContain(
      '$baseUrl/api/marketplace/search?type=mcp&source=mcp_registry&limit=100',
    );
    expect(script).toContain('marketplaceResourceSha256');
    expect(script).toContain("$receipt.checks['marketplaceResource']");
    expect(script).toContain("$receipt.checks['marketplaceApi']");
    expect(script).toContain('Same-version repair did not restore resources/marketplace.db');
    expect(script).toContain('/v1/health/liveliness');
    expect(script).toContain('/api/auth/session-token');
    expect(script).toContain('$BaseUrl/api/workspaces');
    expect(script).toContain('$BaseUrl/api/memory/frames?extract=false');
    expect(script).toContain('New-CertificateLifecycleData');
    expect(script).toContain('Assert-CertificateLifecycleData');
    expect(script).toContain('Get-CertificateDataManifest');
    expect(script).toContain('Assert-CertificateDataManifest');
    expect(script).toContain('Get-CertificateDataManifestDigest');
    expect(script).toContain('Get-CertificateRelativePath');
    expect(script).not.toContain('[System.IO.Path]::GetRelativePath');
    expect(script).toContain("$receipt.checks['defaultProfileDataDir']");
    expect(script).toContain("$receipt.checks['realWorkspaceAndMemorySeeded']");
    expect(script).toContain("$receipt.checks['upgradeRealWorkspaceAndMemoryPreserved']");
    expect(script).toContain("$receipt.checks['repairRealWorkspaceAndMemoryPreserved']");
    expect(script).toContain("$receipt.checks['uninstallRealWorkspaceAndMemoryPreserved']");
    expect(script).toContain('Remove-CertificateProfileData');
    expect(script).not.toContain('Remove-CertificateProfileMarker');
    expect(script).not.toContain('$_.path -cne $markerRelativePath');
    const finalUninstallerCleanup = script.match(
      /if \(Test-Path -LiteralPath \$uninstaller -PathType Leaf\) \{\s*try \{([\s\S]*?)Invoke-RawProcess \$uninstaller/,
    )?.[1];
    expect(finalUninstallerCleanup).toBeDefined();
    const shutdownProofReset =
      finalUninstallerCleanup?.indexOf('$runtimeConfirmedStopped = $false') ?? -1;
    const preUninstallProcessAssertion =
      finalUninstallerCleanup?.indexOf('Assert-NoForeignWaggleProcesses') ?? -1;
    expect(shutdownProofReset).toBeGreaterThanOrEqual(0);
    expect(preUninstallProcessAssertion).toBeGreaterThanOrEqual(0);
    expect(shutdownProofReset).toBeLessThan(preUninstallProcessAssertion);
    expect(script).toContain("$baseUrl/api/chat");
    expect(script).toContain('No AI model is ready');
    expect(script).toContain("$receipt.checks['noModelChatSetupRequired']");
    expect(script).toContain("$baseUrl/api/tier");
    expect(script).toContain("$receipt.certifiedTier = 'FREE'");
    expect(script).toContain("$receipt.checks['soloTier']");
    expect(script).toContain("$receipt.checks['previousSoloTier']");
    expect(script).toContain("$receipt.checks['repairSoloTier']");
    expect(script).toMatch(
      /if \(-not \$RequireVersionToVersionUpgrade\) \{[\s\S]*?\$chatProbeMessage/,
    );
    expect(script).toContain('unauthenticatedProtectedRoute');
    expect(script).toContain("'WAGGLE_TRUST_LOCALHOST'");
    expect(script).toContain("'WAGGLE_SQLITE_VEC_PATH'");
    expect(script).toContain("'ONNXRUNTIME_NODE_BINDING_PATH'");
    expect(script).toContain("'VOYAGE_API_KEY'");
    expect(script).toContain("'EMBEDDING_PROVIDER'");
    expect(script).toContain('environmentSnapshot');
    expect(script).toContain('environmentRestored');
    expect(script).toContain("$isolationPath = Join-Path $scratchRoot 'isolated-path'");
    expect(script).toContain('$env:PATH = $isolationPath');
    expect(script).not.toContain('$env:PATH = "$env:SystemRoot\\System32;$env:SystemRoot"');
    expect(script).toContain('/api/embedding/status');
    expect(script).toContain('/api/local-inference/status');
    expect(script).toContain('/api/local-inference/bootstrap');
    expect(script).toContain('/api/local-inference/pull');
    expect(script).toContain('[switch]$VerifyManagedModel');
    expect(script).toContain("[Environment]::GetFolderPath('System')");
    expect(script).toContain("@('tar.exe', 'taskkill.exe')");
    expect(script).toContain("$receipt.checks['windowsInboxTools']");
    expect(script).toContain('$managedOperationTimeoutSeconds = 3600');
    expect(script).toContain('$receipt.managedModelVerified = $true');
    expect(script).toContain("$receipt.checks['managedModelChat']");
    expect(script).toContain('$baseUrl/v1/chat/completions');
    expect(script).toContain('model = "ollama/$managedModelName"');
    expect(script).toContain("$receipt.checks['managedModelProxyRestartChat']");
    expect(script).toContain("$receipt.checks['previousManagedModelSeeded']");
    expect(script).toContain("$receipt.checks['upgradeManagedModelPreserved']");
    expect(script).toContain("$receipt.checks['repairManagedModelDigestPreserved']");
    expect(script).toContain('managedModelDigest');
    expect(script).toContain('managedRuntimeCleanup');
    expect(script).toContain('Stop-InstalledProcesses $appExecutable $serviceScript $managedRuntimeRoot');
    expect(script).toContain('dockerRequired');
    expect(script).toContain('sameVersionRepair');
    expect(script).toContain('$firstProcess.HasExited');
    expect(script).toContain('$secondProcess.HasExited');
    expect(script).toContain('Wait-ForInstalledRuntimeStop');
    expect(script).toContain('Assert-NoForeignWaggleProcesses');
    expect(script).toContain('function Assert-CertificateUninstallPostconditions');
    const uninstallPostconditionCalls = [
      ...script.matchAll(/^\s+Assert-CertificateUninstallPostconditions\s+`/gm),
    ];
    expect(uninstallPostconditionCalls).toHaveLength(2);
    const outerFinallyStart = script.lastIndexOf('} finally {');
    const successUninstallStart = script.indexOf(
      "$receipt.checks['uninstallerCleanup'] = $true",
    );
    expect(successUninstallStart).toBeGreaterThanOrEqual(0);
    expect(outerFinallyStart).toBeGreaterThan(successUninstallStart);
    expect(
      script.slice(successUninstallStart, outerFinallyStart),
    ).toContain('Assert-CertificateUninstallPostconditions `');
    expect(script.slice(outerFinallyStart)).toContain(
      'Assert-CertificateUninstallPostconditions `',
    );
    const uninstallPostconditionHelper = script.match(
      /function Assert-CertificateUninstallPostconditions \{([\s\S]*?)\r?\n\}/,
    )?.[1];
    expect(uninstallPostconditionHelper).toBeDefined();
    expect(uninstallPostconditionHelper).toContain('Wait-ForPathState $InstallDir $false');
    expect(uninstallPostconditionHelper).toContain(
      'Wait-ForPathState $UninstallRegistry $false',
    );
    expect(uninstallPostconditionHelper).toContain(
      'Wait-ForPathState $ProductRegistry $false',
    );
    expect(uninstallPostconditionHelper).toContain(
      'Test-RegistryValue $RunRegistry $RunRegistryValue',
    );
    expect(uninstallPostconditionHelper).toContain('Wait-ForPathState $shortcut $false');
    expect(uninstallPostconditionHelper).toContain('Wait-ForInstalledRuntimeStop');
    expect(uninstallPostconditionHelper).toContain(
      '-ManagedRuntimeRoot $ManagedRuntimeRoot -AdditionalPorts $AdditionalPorts',
    );
    expect(uninstallPostconditionHelper).toContain('Assert-NoForeignWaggleProcesses');
    expect(uninstallPostconditionHelper).toContain('Assert-TcpPortAvailable $Port');
    expect(script).toContain('foreignProcessCollisionGuard');
    expect(script).not.toMatch(/Get-CimInstance[^\r\n]+-ErrorAction\s+SilentlyContinue/);
    expect(script).toContain('Stop-StartedProcessTree');
    expect(script).toContain('"/PID $($Process.Id) /T /F"');
    expect(script).toContain('repairRegistrations');
    expect(script).toContain('runRegistryCollisionGuard');
    expect(script).toContain('UninstallString');
    expect(script).toContain("Invoke-RawProcess $registeredUninstaller '/S'");
    expect(script).toContain('Wait-ForPathState $uninstallRegistry $false 30');
    expect(script).toContain("HKCU:\\Software\\egzakta\\Waggle");
    expect(script).toContain('Remove-CertificateProductRegistry');
    expect(script).toContain('Clear-AbandonedCertificateProductRegistry');
    expect(script).toContain('certificateRegistryCleanup');
    expect(script).toContain('profileDataDeletionAbsent');
    expect(script).toContain('baseAppDataDeletionNeutralized');
    expect(script).toContain('profileDataPathPreserved');
    expect(script).toContain('configuredDataDirPreserved');
    expect(script).not.toContain('uninstallPreservedData');
    expect(script).not.toContain('embeddingModelVerified');
    expect(script).toContain('RequireAuthenticodeSignature');
    expect(script).toContain('ExpectedSignerThumbprint');
    expect(script).toContain('ExpectedSourceRevision');
    expect(script).toContain('RequireVersionToVersionUpgrade');
    expect(script).toContain('PreviousInstallerPath');
    expect(script).toContain('ExpectedPreviousInstallerSha256');
    expect(script).toContain('ExpectedPreviousVersion');
    expect(script).toContain('ExpectedPreviousSourceRevision');
    expect(script).toContain('ExpectedCandidateInstallerSha256');
    expect(script).toContain('ExpectedCandidateVersion');
    expect(script).toContain('version-to-version-upgrade');
    expect(script).toContain('Previous installer SHA-256 must be exactly 64 hexadecimal characters.');
    expect(script).toContain('Candidate installer SHA-256 must be exactly 64 hexadecimal characters.');
    expect(script).toContain('Previous source revision must be exactly 40 hexadecimal characters.');
    expect(script).toContain('Previous installer and candidate installer must be distinct files.');
    expect(script).toContain('Candidate version must be newer than the previous version.');
    expect(script).toContain("$receipt.checks['previousInstallerHash']");
    expect(script).toContain("$receipt.checks['previousInstallerAuthenticodeSignature']");
    expect(script).toContain("$receipt.checks['previousInstalledAppAuthenticodeSignature']");
    expect(script).toContain("$receipt.checks['versionOrder']");
    expect(script).toContain("$receipt.checks['versionToVersionUpgrade']");
    expect(script).toContain("$receipt.checks['upgradeSameInstallDirectory']");
    expect(script).toContain("$receipt.checks['upgradeConfiguredDataPreserved']");
    expect(script).toContain("$receipt.checks['upgradeProfileDataPreserved']");
    expect(script).toContain("$receipt.checks['upgradeVaultKeyPreserved']");
    expect(script).toContain("$receipt.checks['relaunchAfterUpgrade']");
    expect(script).toContain('Candidate installer before upgrade');
    expect(script).toContain('Candidate installer after upgrade');
    expect(script).toContain('Candidate installer before repair');
    expect(script).toContain('Candidate installer after repair');
    expect(script).toContain('previousSourceRevision = $ExpectedPreviousSourceRevision');
    expect(script).toContain('Remove-CertificationControlEnvironment');
    expect(script).toContain("'^(?:ACTIONS_|GITHUB_|RUNNER_|WAGGLE_UPGRADE_BASE_)'");
    expect(script).toContain("'GH_TOKEN', 'GITHUB_TOKEN'");
    expect(script).toContain("$receipt.checks['candidateInstallerHash']");
    const previousInstallIndex = script.indexOf('Invoke-RawProcess $PreviousInstallerPath');
    const previousLaunchIndex = script.indexOf('$previousProcess = Start-InstalledApp');
    const candidateInstallIndex = script.indexOf('Invoke-RawProcess $InstallerPath', previousInstallIndex);
    const candidateLaunchIndex = script.indexOf('$firstProcess = Start-InstalledApp');
    const candidateRepairIndex = script.lastIndexOf('Invoke-RawProcess $InstallerPath');
    const previousSoloTierIndex = script.indexOf("$receipt.checks['previousSoloTier']");
    const previousManagedModelSeedIndex = script.indexOf(
      "$receipt.checks['previousManagedModelSeeded']",
    );
    const upgradeManagedModelPreservedIndex = script.indexOf(
      "$receipt.checks['upgradeManagedModelPreserved']",
    );
    const managedModelProxyRestartIndex = script.indexOf(
      "$receipt.checks['managedModelProxyRestartChat']",
    );
    const repairSoloTierIndex = script.indexOf("$receipt.checks['repairSoloTier']");
    const repairManagedModelDigestIndex = script.indexOf(
      "$receipt.checks['repairManagedModelDigestPreserved']",
    );
    const uninstallIndex = script.indexOf("Invoke-RawProcess $registeredUninstaller '/S'");
    expect(previousInstallIndex).toBeGreaterThanOrEqual(0);
    expect(previousLaunchIndex).toBeGreaterThan(previousInstallIndex);
    expect(previousSoloTierIndex).toBeGreaterThan(previousLaunchIndex);
    expect(previousManagedModelSeedIndex).toBeGreaterThan(previousSoloTierIndex);
    expect(previousManagedModelSeedIndex).toBeLessThan(candidateInstallIndex);
    expect(candidateInstallIndex).toBeGreaterThan(previousLaunchIndex);
    expect(candidateLaunchIndex).toBeGreaterThan(candidateInstallIndex);
    expect(upgradeManagedModelPreservedIndex).toBeGreaterThan(candidateLaunchIndex);
    expect(upgradeManagedModelPreservedIndex).toBeLessThan(candidateRepairIndex);
    expect(candidateRepairIndex).toBeGreaterThan(candidateLaunchIndex);
    expect(repairSoloTierIndex).toBeGreaterThan(candidateRepairIndex);
    expect(repairManagedModelDigestIndex).toBeGreaterThan(repairSoloTierIndex);
    expect(repairManagedModelDigestIndex).toBeLessThan(managedModelProxyRestartIndex);
    expect(repairSoloTierIndex).toBeLessThan(managedModelProxyRestartIndex);
    expect(managedModelProxyRestartIndex).toBeGreaterThan(candidateRepairIndex);
    expect(managedModelProxyRestartIndex).toBeLessThan(uninstallIndex);
    expect(uninstallIndex).toBeGreaterThan(candidateRepairIndex);
    expect(script).toContain('sourceFilesClean');
    expect(script).toContain("'scripts/build-sidecar.mjs'");
    expect(script).toContain("'packages/server/src/local/index.ts'");
    expect(script).toContain("'packages/marketplace/marketplace.db'");
    expect(script).toMatch(
      /\$gitCommand\s*=\s*Get-Command git -CommandType Application -ErrorAction SilentlyContinue\s*\|\s*Select-Object -First 1/,
    );
    expect(script).toContain('schemaVersion = 4');
    expect(script).toContain('-UseBasicParsing');
    expect(script).toContain('authenticodeStatus');
    expect(script).toContain('signerThumbprint');
    expect(script).toContain('TimeStamperCertificate');
    expect(script).toContain('timestampAuthorityThumbprint');
    expect(script).toContain('SignatureType');
    expect(script).toContain('portable embedded Authenticode signature');
    expect(script).toContain('installedAppAuthenticodeSignature');
    expect(script).toContain('Installed Waggle executable');
    expect(script).toContain('certifierSha256');
    expect(script).toContain('installerHookSha256');
    expect(script).toContain('generatedInstallerScriptSha256');
    expect(script).toContain('generatedInstallerInclude');
    expect(script).toContain('$installerHookFile.LastWriteTimeUtc');
    expect(script).toContain('!macro\\s+NSIS_HOOK_POSTUNINSTALL\\b');
    expect(script).toContain('!include\\s+"(?<path>[^"]+)"\\s*$');
    expect(script).not.toContain("$generatedInstallerContent.Contains('NSIS_HOOK_POSTUNINSTALL')");
    expect(script).not.toContain("$receipt.checks['builtInProxy']");
    expect(script).not.toContain("$receipt.checks['uninstallCleanup']");
    expect(script).toContain("$receipt.checks['uninstallerCleanup']");
    expect(script).toContain('embeddingPayloadReady');
    expect(script).toContain('Assert-VaultKeyAclRestricted');
    expect(script).toContain("Join-Path $dataDir '.vault-key'");
    expect(script).toContain('AreAccessRulesProtected');
    expect(script).toContain('[Security.Principal.WindowsIdentity]::GetCurrent().User');
    expect(script).toContain("$receipt.checks['vaultKeyAclRestricted']");
    expect(script).toContain('sourceRevision');
    expect(script).toContain('certificateRunId');
    expect(script).toContain('$desktopShortcut');
    expect(script).toContain('$startMenuShortcuts');
    expect(script).toContain('Assert-SafeScratchRoot');
    expect(script).not.toMatch(/Get-Process\s+(?:-Name\s+)?['"]?waggle/i);
    expect(script.lastIndexOf(
      'Remove-CertificateScratchRoot $scratchRoot $scratchOwnershipMarker $runId',
    ))
      .toBeLessThan(script.lastIndexOf('$receipt | ConvertTo-Json'));
  });

  it.runIf(process.platform === 'win32')(
    'Windows installer certificate preserves sentinels when receipt paths are unsafe',
    () => {
      const script = fs
        .readFileSync(
          path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'),
          'utf-8',
        )
        .replace(/\r\n/g, '\n');
      const helperStart = script.indexOf('function Assert-SafeReceiptPath {');
      const helperEnd = script.indexOf(
        '\nfunction Assert-SafeScratchRoot {',
        helperStart + 1,
      );
      expect(helperStart).toBeGreaterThanOrEqual(0);
      expect(helperEnd).toBeGreaterThan(helperStart);

      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cert-receipt-'));
      const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cert-outside-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const existingReceipt = path.join(probeRoot, 'existing.json');
      const hardlinkTarget = path.join(probeRoot, 'hardlink-target.json');
      const hardlinkReceipt = path.join(probeRoot, 'hardlink.json');
      const junctionParent = path.join(probeRoot, 'receipt-parent');
      const outsideSentinel = path.join(outsideRoot, 'sentinel.txt');
      fs.writeFileSync(existingReceipt, 'existing-receipt-sentinel', 'utf-8');
      fs.writeFileSync(hardlinkTarget, 'hardlink-sentinel', 'utf-8');
      fs.linkSync(hardlinkTarget, hardlinkReceipt);
      fs.writeFileSync(outsideSentinel, 'outside-sentinel', 'utf-8');
      fs.symlinkSync(outsideRoot, junctionParent, 'junction');

      const fixtureSource = String.raw`
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Assert-True {
  param([Parameter(Mandatory = $true)] [bool]$Condition, [Parameter(Mandatory = $true)] [string]$Message)
  if (-not $Condition) { throw $Message }
}
function Expect-Rejection {
  param([scriptblock]$Action, [string]$Label)
  $rejected = $false
  try { & $Action } catch { $rejected = $true }
  if (-not $rejected) { throw "$Label was accepted" }
}

$existingReceipt = Join-Path $PSScriptRoot 'existing.json'
$hardlinkReceipt = Join-Path $PSScriptRoot 'hardlink.json'
$hardlinkTarget = Join-Path $PSScriptRoot 'hardlink-target.json'
$junctionReceipt = Join-Path (Join-Path $PSScriptRoot 'receipt-parent') 'receipt.json'
$reservedReceipt = Join-Path $PSScriptRoot 'reserved.json'
Expect-Rejection { Assert-SafeReceiptPath $existingReceipt } 'existing receipt'
Expect-Rejection { Reserve-CertificateReceiptPath $hardlinkReceipt } 'hardlink receipt'
Expect-Rejection { Assert-SafeReceiptPath $junctionReceipt } 'junction receipt parent'
$reservation = Reserve-CertificateReceiptPath $reservedReceipt
Expect-Rejection { Reserve-CertificateReceiptPath $reservedReceipt } 'second receipt reservation'
Write-CertificateReceipt $reservation 'reserved-receipt'
if ((Get-Content -Raw -LiteralPath $existingReceipt) -cne 'existing-receipt-sentinel') {
  throw 'Existing receipt sentinel changed'
}
if ((Get-Content -Raw -LiteralPath $hardlinkTarget) -cne 'hardlink-sentinel') {
  throw 'Hardlink receipt sentinel changed'
}
if ((Get-Content -Raw -LiteralPath $reservedReceipt) -cne 'reserved-receipt') {
  throw 'Reserved receipt content was not written through its owned handle'
}
if ((Get-Content -Raw -LiteralPath '${outsideSentinel.replaceAll('\\', '\\\\')}') -cne 'outside-sentinel') {
  throw 'Outside sentinel changed'
}
if (Test-Path -LiteralPath $junctionReceipt) {
  throw 'Receipt was written through the junction'
}
`;

      try {
        fs.writeFileSync(
          probePath,
          `${script.slice(helperStart, helperEnd)}\n${fixtureSource}`,
          'utf-8',
        );
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        if (result.status !== 0) {
          throw new Error(
            `Windows installer receipt safety probe failed: ${result.stderr || result.stdout}`,
          );
        }
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
        fs.rmSync(outsideRoot, { recursive: true, force: true });
      }
    },
  );

  it.runIf(process.platform === 'win32')(
    'Windows installer certificate owns scratch roots before guarded cleanup',
    () => {
      const script = fs
        .readFileSync(
          path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'),
          'utf-8',
        )
        .replace(/\r\n/g, '\n');
      const manifestStart = script.indexOf('function Get-CertificateRelativePath {');
      const manifestEnd = script.indexOf(
        '\nfunction Assert-CertificateDataManifest {',
        manifestStart,
      );
      const scratchStart = script.indexOf('function Assert-SafeScratchRoot {');
      const scratchEnd = script.indexOf(
        '\nfunction Remove-CertificateProductRegistry {',
        scratchStart,
      );
      expect(manifestStart).toBeGreaterThanOrEqual(0);
      expect(manifestEnd).toBeGreaterThan(manifestStart);
      expect(scratchStart).toBeGreaterThanOrEqual(0);
      expect(scratchEnd).toBeGreaterThan(scratchStart);

      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cert-scratch-'));
      const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cert-owned-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const fixtureSource = String.raw`
function Assert-True {
  param([Parameter(Mandatory = $true)] [bool]$Condition, [Parameter(Mandatory = $true)] [string]$Message)
  if (-not $Condition) { throw $Message }
}
function Expect-Rejection {
  param([scriptblock]$Action, [string]$Label)
  $rejected = $false
  try { & $Action } catch { $rejected = $true }
  if (-not $rejected) { throw "$Label was accepted" }
}

$existingRunId = '11111111111111111111111111111111'
$existingRoot = Join-Path $PSScriptRoot "waggle-installer-cert-$existingRunId"
New-Item -ItemType Directory -Path $existingRoot | Out-Null
$existingSentinel = Join-Path $existingRoot 'sentinel.txt'
Set-Content -NoNewline -LiteralPath $existingSentinel -Value 'existing-root-sentinel'
Expect-Rejection {
  New-CertificateScratchRoot $existingRoot $existingRunId
} 'pre-existing scratch root'
if ((Get-Content -Raw -LiteralPath $existingSentinel) -cne 'existing-root-sentinel') {
  throw 'Pre-existing scratch sentinel changed'
}

$validRunId = '22222222222222222222222222222222'
$validRoot = Join-Path $PSScriptRoot "waggle-installer-cert-$validRunId"
$validMarker = New-CertificateScratchRoot $validRoot $validRunId
if ((Split-Path -Leaf $validMarker) -cne ".waggle-installer-certificate-owner-$validRunId") {
  throw 'Scratch ownership marker name is not exact'
}
if ((Get-Content -Raw -LiteralPath $validMarker) -cne $validRunId) {
  throw 'Scratch ownership marker content is not exact'
}
Set-Content -NoNewline -LiteralPath (Join-Path $validRoot 'owned.txt') -Value 'owned'
$nestedRoot = New-Item -ItemType Directory -Path (Join-Path $validRoot 'nested')
Set-Content -NoNewline -LiteralPath (Join-Path $nestedRoot 'owned.txt') -Value 'owned'
Remove-CertificateScratchRoot $validRoot $validMarker $validRunId
if (Test-Path -LiteralPath $validRoot) {
  throw 'Owned scratch root was not removed'
}

$tamperedRunId = '33333333333333333333333333333333'
$tamperedRoot = Join-Path $PSScriptRoot "waggle-installer-cert-$tamperedRunId"
$tamperedMarker = New-CertificateScratchRoot $tamperedRoot $tamperedRunId
$tamperedSentinel = Join-Path $tamperedRoot 'sentinel.txt'
Set-Content -NoNewline -LiteralPath $tamperedMarker -Value 'wrong-owner'
Set-Content -NoNewline -LiteralPath $tamperedSentinel -Value 'tampered-root-sentinel'
Expect-Rejection {
  Remove-CertificateScratchRoot $tamperedRoot $tamperedMarker $tamperedRunId
} 'tampered ownership marker'
if ((Get-Content -Raw -LiteralPath $tamperedSentinel) -cne 'tampered-root-sentinel') {
  throw 'Tampered scratch sentinel changed'
}

$reparseRunId = '44444444444444444444444444444444'
$reparseRoot = Join-Path $PSScriptRoot "waggle-installer-cert-$reparseRunId"
$reparseMarker = New-CertificateScratchRoot $reparseRoot $reparseRunId
$outsideRoot = '${outsideRoot.replaceAll('\\', '\\\\')}'
$outsideSentinel = Join-Path $outsideRoot 'sentinel.txt'
Set-Content -NoNewline -LiteralPath $outsideSentinel -Value 'outside-sentinel'
New-Item -ItemType Junction -Path (Join-Path $reparseRoot 'outside') -Target $outsideRoot |
  Out-Null
Expect-Rejection {
  Remove-CertificateScratchRoot $reparseRoot $reparseMarker $reparseRunId
} 'scratch child reparse point'
if ((Get-Content -Raw -LiteralPath $outsideSentinel) -cne 'outside-sentinel') {
  throw 'Outside scratch sentinel changed'
}
`;

      try {
        fs.writeFileSync(
          probePath,
          [
            script.slice(manifestStart, manifestEnd),
            script.slice(scratchStart, scratchEnd),
            fixtureSource,
          ].join('\n'),
          'utf-8',
        );
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          {
            encoding: 'utf-8',
            timeout: 30_000,
            windowsHide: true,
            env: { ...process.env, TEMP: probeRoot, TMP: probeRoot },
          },
        );
        if (result.status !== 0) {
          throw new Error(
            `Windows installer scratch safety probe failed: ${result.stderr || result.stdout}`,
          );
        }
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
        fs.rmSync(outsideRoot, { recursive: true, force: true });
      }
    },
  );

  it('accepts Tauri generated NSIS hook dispatch while binding the exact custom include', () => {
    const hookPath = path.join(TAURI_DIR, 'nsis', 'installer.nsi');
    const generatedFixture = [
      `!include "${hookPath}"`,
      '!ifmacrodef NSIS_HOOK_POSTUNINSTALL',
      '  !insertmacro NSIS_HOOK_POSTUNINSTALL',
      '!endif',
      '!ifmacrodef NSIS_HOOK_PREUNINSTALL',
      '  !insertmacro NSIS_HOOK_PREUNINSTALL',
      '!endif',
    ].join('\n');
    const includes = [...generatedFixture.matchAll(/^\s*!include\s+"([^"]+)"\s*$/gim)]
      .map((match) => path.resolve(match[1]));

    expect(generatedFixture).toContain('!ifmacrodef NSIS_HOOK_POSTUNINSTALL');
    expect(generatedFixture).toContain('!ifmacrodef NSIS_HOOK_PREUNINSTALL');
    expect(includes.filter((candidate) => candidate.toLowerCase() === hookPath.toLowerCase()))
      .toHaveLength(1);
  });

  it('guards the real Windows external-agent lane from ambient authority and server reuse', () => {
    const script = fs.readFileSync(
      path.join(ROOT, 'scripts', 'test-windows-external-agents.ps1'),
      'utf-8',
    );
    const hookSpec = fs.readFileSync(
      path.join(ROOT, 'tests', 'e2e', 'launcher-real-hook-lifecycle.spec.ts'),
      'utf-8',
    );
    const toolSpec = fs.readFileSync(
      path.join(ROOT, 'tests', 'e2e', 'launcher-real-tool-lifecycle.spec.ts'),
      'utf-8',
    );
    const playwrightConfig = fs.readFileSync(
      path.join(ROOT, 'playwright.config.ts'),
      'utf-8',
    );

    expect(script).toContain('[string[]]$HostIds = @()');
    expect(script).toContain("'WAGGLE_E2E_HOST_IDS'");
    expect(script).toContain(
      "Set-ProcessEnvironment -Name 'WAGGLE_E2E_HOST_IDS' -Value $requestedHostIds",
    );
    expect(script).toContain('HostIds cannot contain empty values.');
    expect(script).toContain('$emptyHostIds.Count -gt 0');
    expect(script).toContain('HostIds cannot contain duplicate values:');
    expect(playwrightConfig).toContain(
      "url: new URL('/health', e2eBaseURL).toString()",
    );
    expect(playwrightConfig).not.toContain('port: e2ePort');
    for (const spec of [hookSpec, toolSpec]) {
      expect(spec).toContain('WAGGLE_E2E_HOST_IDS');
      expect(spec).toContain('Unknown WAGGLE_E2E_HOST_IDS');
      expect(spec).toContain('Invalid WAGGLE_E2E_HOST_IDS: empty host ID.');
      expect(spec).toContain('Duplicate WAGGLE_E2E_HOST_IDS:');
    }

    for (const name of [
      'CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_ACCESS_TOKEN', 'GITHUB_TOKEN',
      'STRIPE_SECRET_KEY', 'DATABASE_URL', 'SSH_AUTH_SOCK', 'GIT_ASKPASS',
      'HTTPS_PROXY', 'AWS_SHARED_CREDENTIALS_FILE',
      'GOOGLE_APPLICATION_CREDENTIALS', 'KUBECONFIG', 'DOCKER_CONFIG',
      'NODE_OPTIONS',
    ]) {
      expect(script, name).toContain(`'${name}'`);
    }
    expect(script).toContain("'WAGGLE_E2E_REUSE_EXISTING_SERVER'");
    expect(script).toContain(
      "Set-ProcessEnvironment -Name 'WAGGLE_E2E_REUSE_EXISTING_SERVER' -Value '0'",
    );
    expect(script).toContain(
      "$profileVariables = @('USERPROFILE', 'HOME', 'APPDATA', " +
      "'LOCALAPPDATA', 'HERMES_HOME')",
    );
    expect(script).toContain(
      '$environmentToRestore = @($profileVariables + $secretVariables + ' +
      '$runnerVariables | Select-Object -Unique)',
    );
    const isolatedHermesHome = (
      "Set-ProcessEnvironment -Name 'HERMES_HOME' " +
      "-Value (Join-Path $hookProfile '.hermes')"
    );
    expect(script).toContain(isolatedHermesHome);
    expect(script.indexOf(isolatedHermesHome)).toBeLessThan(
      script.indexOf(
        "Invoke-PlaywrightLane -Spec 'tests/e2e/launcher-real-hook-lifecycle.spec.ts'",
      ),
    );
    const hookLaneIndex = script.indexOf(
      "Invoke-PlaywrightLane -Spec 'tests/e2e/launcher-real-hook-lifecycle.spec.ts'",
    );
    const successfulRestoreIndex = script.indexOf(
      "foreach ($name in $profileVariables) { Restore-ProcessEnvironment -Name $name }",
      hookLaneIndex,
    );
    const realToolLaneIndex = script.indexOf(
      "Invoke-PlaywrightLane -Spec 'tests/e2e/launcher-real-tool-lifecycle.spec.ts'",
    );
    expect(successfulRestoreIndex).toBeGreaterThan(hookLaneIndex);
    expect(successfulRestoreIndex).toBeLessThan(realToolLaneIndex);

    const outerFinallyIndex = script.lastIndexOf('} finally {');
    const failureRestoreIndex = script.indexOf(
      "foreach ($name in $environmentToRestore) { Restore-ProcessEnvironment -Name $name }",
      outerFinallyIndex,
    );
    expect(failureRestoreIndex).toBeGreaterThan(outerFinallyIndex);
    expect(failureRestoreIndex).toBeLessThan(
      script.indexOf('Remove-VerifiedTempTree -Target $runRoot', failureRestoreIndex),
    );
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

  it('release publication requires the verified Windows vault-key ACL receipt', () => {
    const publisher = fs.readFileSync(
      path.join(ROOT, 'scripts', 'publish-windows-release.ps1'),
      'utf-8',
    );

    expect(publisher).toMatch(/\$cleanRequiredChecks\s*=\s*@\([\s\S]*'vaultKeyAclRestricted'[\s\S]*\)/);
    expect(publisher).toMatch(/\$upgradeRequiredChecks\s*=\s*@\([\s\S]*'vaultKeyAclRestricted'[\s\S]*\)/);
  });

  it('release publication requires real default-profile workspace and memory lifecycle evidence', () => {
    const publisher = fs.readFileSync(
      path.join(ROOT, 'scripts', 'publish-windows-release.ps1'),
      'utf-8',
    );
    const cleanRequiredChecks = publisher.match(
      /\$cleanRequiredChecks\s*=\s*@\(([\s\S]*?)\r?\n\s*\)/,
    )?.[1];
    const upgradeRequiredChecks = publisher.match(
      /\$upgradeRequiredChecks\s*=\s*@\(([\s\S]*?)\r?\n\s*\)/,
    )?.[1];
    expect(cleanRequiredChecks).toBeDefined();
    expect(upgradeRequiredChecks).toBeDefined();

    for (const check of [
      'defaultProfileDataDir',
      'realWorkspaceAndMemorySeeded',
      'repairRealWorkspaceAndMemoryPreserved',
      'uninstallRealWorkspaceAndMemoryPreserved',
      'certificateProfileCleanup',
    ]) {
      expect(cleanRequiredChecks).toContain(`'${check}'`);
      expect(upgradeRequiredChecks).toContain(`'${check}'`);
    }
    expect(upgradeRequiredChecks).toContain("'upgradeRealWorkspaceAndMemoryPreserved'");
    expect(publisher).toContain('lifecycleData.workspaceId');
    expect(publisher).toContain('lifecycleData.personalFrameId');
    expect(publisher).toContain('lifecycleData.workspaceFrameId');
    expect(publisher).toContain('lifecycleData.preUninstallManifestEntryCount');
    expect(publisher).toContain('lifecycleData.preUninstallManifestSha256');
    expect(publisher).toContain('lifecycleData.postUninstallManifestSha256');
    expect(publisher).toContain('unchanged uninstall manifest');
  });

  it.runIf(process.platform === 'win32')(
    'release receipt guards reject stringified schema versions and truthy non-booleans',
    () => {
      const publisher = fs
        .readFileSync(path.join(ROOT, 'scripts', 'publish-windows-release.ps1'), 'utf-8')
        .replace(/\r\n/g, '\n');
      const envelopeStart = publisher.indexOf(
        'function Assert-PassingWindowsCertificateReceipt {',
      );
      const checkStart = publisher.indexOf(
        'function Assert-PassingWindowsCertificateCheck {',
      );
      const verifierStart = publisher.indexOf(
        '\nfunction Assert-ExactReleaseAssets {',
        checkStart,
      );
      expect(envelopeStart).toBeGreaterThanOrEqual(0);
      expect(checkStart).toBeGreaterThan(envelopeStart);
      expect(verifierStart).toBeGreaterThan(checkStart);
      expect([
        ...publisher.matchAll(
          /^function Assert-PassingWindowsCertificateReceipt \{/gm,
        ),
      ]).toHaveLength(1);
      expect([
        ...publisher.matchAll(
          /^function Assert-PassingWindowsCertificateCheck \{/gm,
        ),
      ]).toHaveLength(1);

      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-receipt-types-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const helperSource = publisher.slice(envelopeStart, verifierStart);
      const fixtureSource = String.raw`
function Expect-Rejection {
  param([scriptblock]$Action, [string]$Label)
  $rejected = $false
  try { & $Action } catch { $rejected = $true }
  if (-not $rejected) { throw "$Label was accepted" }
}

$good = '{"schemaVersion":4,"certificationMode":"same-version-repair","status":"passed","checks":{"proof":true}}' | ConvertFrom-Json
$longVersion = '{"schemaVersion":4,"certificationMode":"same-version-repair","status":"passed","checks":{"proof":true}}' | ConvertFrom-Json
$longVersion.schemaVersion = [long]4
$stringVersion = '{"schemaVersion":"4","certificationMode":"same-version-repair","status":"passed","checks":{"proof":true}}' | ConvertFrom-Json
$wrongVersion = '{"schemaVersion":3,"certificationMode":"same-version-repair","status":"passed","checks":{"proof":true}}' | ConvertFrom-Json
$missingMode = '{"schemaVersion":4,"status":"passed","checks":{"proof":true}}' | ConvertFrom-Json
$wrongMode = '{"schemaVersion":4,"certificationMode":"version-to-version-upgrade","status":"passed","checks":{"proof":true}}' | ConvertFrom-Json
$numericMode = '{"schemaVersion":4,"certificationMode":1,"status":"passed","checks":{"proof":true}}' | ConvertFrom-Json
$missingStatus = '{"schemaVersion":4,"certificationMode":"same-version-repair","checks":{"proof":true}}' | ConvertFrom-Json
$wrongStatus = '{"schemaVersion":4,"certificationMode":"same-version-repair","status":"failed","checks":{"proof":true}}' | ConvertFrom-Json
$numericStatus = '{"schemaVersion":4,"certificationMode":"same-version-repair","status":1,"checks":{"proof":true}}' | ConvertFrom-Json
$stringCheck = '{"schemaVersion":4,"certificationMode":"same-version-repair","status":"passed","checks":{"proof":"true"}}' | ConvertFrom-Json
$numericCheck = '{"schemaVersion":4,"certificationMode":"same-version-repair","status":"passed","checks":{"proof":1}}' | ConvertFrom-Json
$falseCheck = '{"schemaVersion":4,"certificationMode":"same-version-repair","status":"passed","checks":{"proof":false}}' | ConvertFrom-Json
$missingCheck = '{"schemaVersion":4,"certificationMode":"same-version-repair","status":"passed","checks":{}}' | ConvertFrom-Json
Assert-PassingWindowsCertificateReceipt $good 'same-version-repair' 'good fixture'
Assert-PassingWindowsCertificateReceipt $longVersion 'same-version-repair' 'PowerShell 7 integer fixture'
Assert-PassingWindowsCertificateCheck $good 'proof' 'good fixture'
Expect-Rejection { Assert-PassingWindowsCertificateReceipt $stringVersion 'same-version-repair' 'string version' } 'string version'
Expect-Rejection { Assert-PassingWindowsCertificateReceipt $wrongVersion 'same-version-repair' 'wrong version' } 'wrong version'
Expect-Rejection { Assert-PassingWindowsCertificateReceipt $missingMode 'same-version-repair' 'missing mode' } 'missing mode'
Expect-Rejection { Assert-PassingWindowsCertificateReceipt $wrongMode 'same-version-repair' 'wrong mode' } 'wrong mode'
Expect-Rejection { Assert-PassingWindowsCertificateReceipt $numericMode 'same-version-repair' 'numeric mode' } 'numeric mode'
Expect-Rejection { Assert-PassingWindowsCertificateReceipt $missingStatus 'same-version-repair' 'missing status' } 'missing status'
Expect-Rejection { Assert-PassingWindowsCertificateReceipt $wrongStatus 'same-version-repair' 'wrong status' } 'wrong status'
Expect-Rejection { Assert-PassingWindowsCertificateReceipt $numericStatus 'same-version-repair' 'numeric status' } 'numeric status'
Expect-Rejection { Assert-PassingWindowsCertificateCheck $stringCheck 'proof' 'string check' } 'string check'
Expect-Rejection { Assert-PassingWindowsCertificateCheck $numericCheck 'proof' 'numeric check' } 'numeric check'
Expect-Rejection { Assert-PassingWindowsCertificateCheck $falseCheck 'proof' 'false check' } 'false check'
Expect-Rejection { Assert-PassingWindowsCertificateCheck $missingCheck 'proof' 'missing check' } 'missing check'
`;

      try {
        fs.writeFileSync(probePath, `${helperSource}\n${fixtureSource}`, 'utf-8');
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        if (result.status !== 0) {
          throw new Error(`Receipt type probe failed: ${result.stderr || result.stdout}`);
        }
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
  );
});

describe('Playwright Visual Regression Setup', () => {
  it('playwright.config.ts exists', () => {
    const conf = path.join(ROOT, 'playwright.config.ts');
    expect(fs.existsSync(conf)).toBe(true);
    const content = fs.readFileSync(conf, 'utf-8');
    expect(content).toContain('maxDiffPixelRatio');
    expect(content).toContain('localhost:3333');
    expect(content).not.toContain('npx tsx packages/server/src/local/start.ts');
  });

  it('starts the E2E server with the same Node runtime as Playwright', () => {
    const conf = path.join(ROOT, 'playwright.config.ts');
    const tsxCli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const probeSource = `
      import config from ${JSON.stringify(pathToFileURL(conf).href)};
      const webServer = Array.isArray(config.webServer)
        ? config.webServer[0]
        : config.webServer;
      const pathKey = Object.keys(webServer.env)
        .find((key) => key.toLowerCase() === 'path');
      console.log(JSON.stringify({
        command: webServer.command,
        pathValue: webServer.env[pathKey],
      }));
    `;
    const result = spawnSync(
      process.execPath,
      [tsxCli, '--eval', probeSource],
      {
        cwd: ROOT,
        encoding: 'utf-8',
        env: {
          ...process.env,
          WAGGLE_E2E_SKIP_LITELLM: '1',
        },
        timeout: 30_000,
        windowsHide: true,
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const output = result.stdout.trim().split(/\r?\n/).at(-1);
    const webServer = JSON.parse(output ?? '{}') as {
      command?: string;
      pathValue?: string;
    };
    expect(webServer.command).toBe(
      'npm run build:all && node node_modules/tsx/dist/cli.mjs '
      + 'packages/server/src/local/start.ts --skip-litellm',
    );
    expect(webServer.command).not.toContain(process.execPath);
    expect(webServer.command).not.toContain('%');
    expect(webServer.pathValue?.split(path.delimiter)[0]).toBe(
      path.dirname(process.execPath),
    );
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

/**
 * 9D-1/9D-2/9D-7: Tauri configuration tests.
 *
 * Validates tauri.conf.json, Cargo.toml, lib.rs, and build scripts
 * are properly configured for production desktop builds.
 */
import { beforeEach, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { parse as parseYaml } from 'yaml';

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

beforeEach(async () => {
  // Let Vitest acknowledge the previous task update before the next test enters
  // a synchronous Windows child-process probe that can occupy the worker thread.
  await new Promise<void>((resolve) => setImmediate(resolve));
});

function powershellProbeExecutable() {
  const configuredPwsh = process.env.WAGGLE_PWSH7_PATH;
  const powerShellMajor = (executable: string) => {
    const result = spawnSync(
      executable,
      ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'],
      { encoding: 'utf-8', timeout: 10_000, windowsHide: true },
    );
    const major = Number.parseInt(result.stdout?.trim() ?? '', 10);
    return result.status === 0 && Number.isInteger(major) ? major : undefined;
  };
  const requirePowerShell7 = (executable: string) => {
    if ((powerShellMajor(executable) ?? 0) < 7) {
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
  const pwshCandidates = [
    path.join(
      process.env.ProgramFiles ?? 'C:\\Program Files',
      'PowerShell',
      '7',
      'pwsh.exe',
    ),
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'pwsh.exe')
      : undefined,
  ];
  for (const pwsh of pwshCandidates) {
    // Windows Store app execution aliases report false through fs.existsSync,
    // so probe the executable rather than treating metadata access as authority.
    if (pwsh && (powerShellMajor(pwsh) ?? 0) >= 7) return pwsh;
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
  it('pins Tauri-rewritten manifests and generated schemas to LF across platforms', () => {
    const trackedPaths = [
      'app/src-tauri/Cargo.toml',
      'app/src-tauri/gen/schemas/windows-schema.json',
      'app/src-tauri/gen/schemas/desktop-schema.json',
    ];
    const result = spawnSync('git', ['check-attr', '-z', 'text', 'eol', '--', ...trackedPaths], {
      cwd: ROOT,
      encoding: 'utf-8',
      windowsHide: true,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const fields = result.stdout.split('\0').filter(Boolean);
    const effectiveAttributes = new Map<string, string>();
    for (let index = 0; index < fields.length; index += 3) {
      effectiveAttributes.set(`${fields[index]}:${fields[index + 1]}`, fields[index + 2]);
    }
    for (const trackedPath of trackedPaths) {
      expect(effectiveAttributes.get(`${trackedPath}:text`)).toBe('set');
      expect(effectiveAttributes.get(`${trackedPath}:eol`)).toBe('lf');
    }
  });

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
    expect(win.create).toBe(false);
    expect(win.width).toBe(1200);
    expect(win.height).toBe(800);
    expect(win.minWidth).toBe(800);
    expect(win.minHeight).toBe(600);
    expect(win.resizable).toBe(true);

    const lib = fs.readFileSync(path.join(TAURI_DIR, 'src', 'lib.rs'), 'utf-8');
    expect(lib).toContain('WAGGLE_CERTIFIER_WEBVIEW_DEBUG_PORT');
    expect(lib).toContain('additional_browser_args');
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

  it('creates exactly one tray icon from Rust so the context menu is always attached', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    expect(conf.app.trayIcon).toBeUndefined();

    const tray = fs.readFileSync(path.join(TAURI_DIR, 'src', 'tray.rs'), 'utf-8');
    expect(tray).toContain('TrayIconBuilder::new()');
    expect(tray).toContain('.menu(&menu)');

    const certifier = fs.readFileSync(
      path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'),
      'utf-8',
    );
    expect(certifier).toContain('status --porcelain=v1 --untracked-files=all');
  });

  it('tray menu exposes only implemented desktop actions', () => {
    const tray = fs.readFileSync(path.join(TAURI_DIR, 'src', 'tray.rs'), 'utf-8');
    expect(tray).toContain('"Open Waggle"');
    expect(tray).toContain('"Settings"');
    expect(tray).toContain('"Quit Waggle"');
    expect(tray).toContain('app.exit(0)');
    expect(tray).toContain('.show_menu_on_left_click(false)');
    expect(tray).toContain('button: MouseButton::Left');
    expect(tray).toContain('button_state: MouseButtonState::Up');
    expect(tray).toContain('"waggle://navigate"');
    expect(tray).toContain('"/settings"');

    expect(tray).not.toContain('"Pause Agents"');
    expect(tray).not.toContain('"About Waggle"');
    expect(tray).not.toContain('"waggle://pause-agents"');
    expect(tray).not.toContain('"waggle://quit"');
    expect(tray).not.toContain('"/about"');
  });

  it('packaged Windows sidecar stays hidden and writes bounded diagnostics', () => {
    const service = fs.readFileSync(path.join(TAURI_DIR, 'src', 'service.rs'), 'utf-8');
    const certifier = fs.readFileSync(
      path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'),
      'utf-8',
    );

    expect(service).toContain('const CREATE_NO_WINDOW: u32 = 0x08000000');
    expect(service).toContain('command.creation_flags(CREATE_NO_WINDOW)');
    expect(service).toContain('service.log');
    expect(service).toContain('MAX_SERVICE_LOG_BYTES');
    expect(service).toContain('rotate_service_log');
    expect(certifier).toContain('function Assert-NoVisibleConsoleDescendant');
    const consoleCheck = certifier.slice(
      certifier.indexOf('function Assert-NoVisibleConsoleDescendant'),
      certifier.indexOf('function Wait-ForInstalledRuntimeStop'),
    );
    expect(consoleCheck).not.toHaveLength(0);
    expect(consoleCheck).toContain('MainWindowHandle');
    expect(consoleCheck).toContain('[IntPtr]::Zero');
    expect(consoleCheck).toContain('[WaggleInstallerWindowProbe]::IsWindowVisible');
    expect(consoleCheck).toMatch(
      /catch \{[\s\S]*Get-Process -Id \$consoleProcessId[\s\S]*throw/,
    );
    expect(certifier).toContain("$receipt.checks['firstBootHiddenService']");
    expect(certifier).toContain("$receipt.checks['repairHiddenService']");
  });

  it('preserves detached user sessions while IPC-supervising owned service runtimes', () => {
    const service = fs.readFileSync(path.join(TAURI_DIR, 'src', 'service.rs'), 'utf-8');
    const lifecycle = fs.readFileSync(
      path.join(ROOT, 'packages', 'server', 'src', 'local', 'lifecycle.ts'),
      'utf-8',
    );

    expect(service).toContain('JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK');
    expect(lifecycle).toContain('spawnSidecarOwnedProcess');
    expect(lifecycle).not.toMatch(/litellmProcess\s*=\s*spawn\(/);
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

  it('desktop startup remains visible when the app bundle cannot mount', () => {
    const main = fs.readFileSync(
      path.join(ROOT, 'apps', 'web', 'src', 'main.tsx'),
      'utf-8',
    );
    const css = fs.readFileSync(
      path.join(ROOT, 'apps', 'web', 'src', 'index.css'),
      'utf-8',
    );
    const appEntry = fs.readFileSync(
      path.join(ROOT, 'apps', 'web', 'src', 'app-entry.tsx'),
      'utf-8',
    );

    expect(main).toContain("document.getElementById('root')");
    expect(main).toContain('Starting Waggle');
    expect(main).toContain("startup.dataset.waggleStartup = 'loading'");
    expect(main).toContain("import('./app-entry')");
    expect(main).toContain('.catch((error) =>');
    expect(main).toContain('Waggle could not start');
    expect(appEntry).toContain("dataset.waggleUiReady = 'ready'");
    expect(css).not.toMatch(/@import\s+(?:url\()?['"]?https?:\/\//i);
  });

  it('desktop CSP permits only the local Tauri IPC bridge', () => {
    const conf = JSON.parse(fs.readFileSync(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
    const csp = conf.app.security.csp;

    expect(csp).toContain('ipc:');
    expect(csp).toContain('http://ipc.localhost');
    expect(csp).not.toContain('https://fonts.googleapis.com');
  });

  it('installer certification fails closed on a blank desktop WebView', () => {
    const helperPath = path.join(ROOT, 'scripts', 'read-tauri-bootstrap-token.mjs');
    const result = spawnSync(process.execPath, [helperPath, '--self-test'], {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 30_000,
      windowsHide: true,
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ pass: true, cases: 9 });

    const certifier = fs.readFileSync(
      path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'),
      'utf-8',
    );
    expect(certifier).toContain("$tokenPayload.PSObject.Properties['uiReady']");
    expect(certifier).toContain('Installed Waggle WebView did not render its application shell.');
    expect(certifier).toContain("$receipt.checks['firstBootUi']");
    expect(certifier).toContain("$receipt.checks['repairUi']");
  });

  it('keeps candidate-only desktop gates compatible with the protected previous release', () => {
    const helper = fs.readFileSync(
      path.join(ROOT, 'scripts', 'read-tauri-bootstrap-token.mjs'),
      'utf-8',
    );
    const certifier = fs.readFileSync(
      path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'),
      'utf-8',
    );
    const previousReleaseBlock = certifier.slice(
      certifier.indexOf('$previousProcess = Start-InstalledApp'),
      certifier.indexOf('$previousTier = Invoke-JsonRequest'),
    );

    expect(helper).toContain("argument === '--allow-legacy-ui'");
    expect(certifier).toContain('[switch]$AllowLegacyUi');
    expect(previousReleaseBlock).toContain('-AllowLegacyUi');
    expect(previousReleaseBlock).not.toContain('Assert-NoVisibleConsoleDescendant');
    expect(previousReleaseBlock).not.toContain("$receipt.checks['previousHiddenService']");
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
    const windowsBuild = manifest.scripts?.['tauri:build:win'];
    const override = JSON.parse(
      fs.readFileSync(
        path.join(TAURI_DIR, 'tauri.build-override.conf.json'),
        'utf-8',
      ),
    );

    expect(signedBuild).toContain('npm run tauri:sign:pilot:win:apply');
    expect(signedBuild).toContain(
      'npm run tauri:build:win -- --config src-tauri/tauri.build-override.conf.json',
    );
    expect(override.build.beforeBuildCommand).toBe('');

    const stageIndex = windowsBuild.indexOf('stage-sidecar-deps.mjs');
    const preflightIndex = windowsBuild.indexOf('check-sidecar-resources.mjs');
    const tauriIndex = windowsBuild.indexOf('npx tauri build');
    expect(stageIndex).toBeGreaterThanOrEqual(0);
    expect(preflightIndex).toBeGreaterThan(stageIndex);
    expect(tauriIndex).toBeGreaterThan(preflightIndex);
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
    expect(content).toContain(
      "'@waggle/agent/external-process-env': path.join(root, 'packages', 'agent', 'src', 'external-process-env.ts')",
    );

    const serverIndex = fs.readFileSync(
      path.join(ROOT, 'packages', 'server', 'src', 'local', 'index.ts'),
      'utf-8',
    );
    expect(serverIndex).toContain("path.resolve(__dirname, 'marketplace.db')");
  });

  it('build-sidecar exact alias resolves the agent env helper before its root alias', async () => {
    const esbuild = await import('esbuild');
    const result = await esbuild.build({
      stdin: {
        contents: "import { buildExternalProcessEnv } from '@waggle/agent/external-process-env'; export const env = buildExternalProcessEnv({ PATH: 'fixture' });",
        loader: 'ts',
        resolveDir: ROOT,
        sourcefile: 'sidecar-agent-subpath-probe.ts',
      },
      absWorkingDir: ROOT,
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      write: false,
      logLevel: 'silent',
      alias: {
        '@waggle/agent/external-process-env': path.join(
          ROOT, 'packages', 'agent', 'src', 'external-process-env.ts',
        ),
        '@waggle/agent': path.join(ROOT, 'packages', 'agent', 'src', 'index.ts'),
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.outputFiles[0]?.text).toContain('buildExternalProcessEnv');
  });

  it('build-sidecar provenance follows transitive tsconfig inheritance', () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-sidecar-tsconfig-'));
    const writeRelative = (relative: string, content: string | Buffer) => {
      const target = path.join(fixtureRoot, ...relative.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
      return target;
    };
    const runResult = (command: string, args: string[]) => spawnSync(command, args, {
      cwd: fixtureRoot,
      env: {
        ...process.env,
        TEMP: fixtureRoot,
        TMP: fixtureRoot,
        TMPDIR: fixtureRoot,
      },
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true,
    });
    const run = (command: string, args: string[]) => {
      const result = runResult(command, args);
      expect(result.status, result.stderr || result.stdout).toBe(0);
      return result;
    };

    try {
      fs.mkdirSync(path.join(fixtureRoot, 'scripts'), { recursive: true });
      fs.copyFileSync(
        path.join(ROOT, 'scripts', 'build-sidecar.mjs'),
        path.join(fixtureRoot, 'scripts', 'build-sidecar.mjs'),
      );
      const trackedFiles = new Map<string, string>([
        ['package-lock.json', '{"lockfileVersion":3}\n'],
        ['package.json', '{"name":"sidecar-tsconfig-fixture","private":true}\n'],
        ['packages/marketplace/marketplace.db', 'fixture database'],
        ['packages/server/package.json', '{"name":"@waggle/server"}\n'],
        ['packages/server/src/local/service.ts', 'export const fixture = true;\n'],
        ['packages/server/tsconfig.json', '{"extends":"../../tsconfig.base"}\n'],
        ['tsconfig.base.json', '{"extends":["./tsconfig.shared"]}\n'],
        ['tsconfig.shared.json', '{"compilerOptions":{"target":"ES2022"}}\n'],
      ]);
      for (const [relative, content] of trackedFiles) writeRelative(relative, content);
      writeRelative(
        'node_modules/esbuild/package.json',
        JSON.stringify({ name: 'esbuild', version: '0.0.0', type: 'module', exports: './index.js' }),
      );
      writeRelative(
        'node_modules/esbuild/index.js',
        [
          "import fs from 'node:fs';",
          "import path from 'node:path';",
          'export async function build(options) {',
          '  fs.mkdirSync(path.dirname(options.outfile), { recursive: true });',
          "  fs.writeFileSync(options.outfile, 'fixture bundle\\n');",
          '  return {',
          '    errors: [],',
          '    warnings: [],',
          "    metafile: { inputs: { 'packages/server/src/local/service.ts': { bytes: 29, imports: [] } } },",
          '  };',
          '}',
          '',
        ].join('\n'),
      );
      writeRelative(
        'node_modules/typescript/package.json',
        JSON.stringify({ name: 'typescript', version: '0.0.0', type: 'module', exports: './index.js' }),
      );
      writeRelative(
        'node_modules/typescript/index.js',
        [
          'export default {',
          '  parseConfigFileTextToJson(_file, text) {',
          '    try { return { config: JSON.parse(text) }; }',
          '    catch (error) { return { error }; }',
          '  },',
          '};',
          '',
        ].join('\n'),
      );

      run('git', ['init']);
      run('git', ['config', 'user.email', 'sidecar-tsconfig@waggle.invalid']);
      run('git', ['config', 'user.name', 'Waggle Fixture']);
      run('git', ['add', '--', 'scripts/build-sidecar.mjs', ...trackedFiles.keys()]);
      run('git', ['commit', '-m', 'fixture']);
      run(process.execPath, ['scripts/build-sidecar.mjs']);

      const service = fs.readFileSync(
        path.join(fixtureRoot, 'app', 'src-tauri', 'resources', 'service.js'),
      );
      const lineEnd = service.indexOf(0x0a);
      const prefix = '// Waggle-Sidecar-Provenance: ';
      const firstLine = service.subarray(0, lineEnd).toString('utf8');
      expect(firstLine.startsWith(prefix)).toBe(true);
      const manifest = JSON.parse(
        Buffer.from(firstLine.slice(prefix.length), 'base64').toString('utf8'),
      ) as { sourceInputs: Array<{ path: string }> };
      const sourcePaths = manifest.sourceInputs.map((input) => input.path);
      expect(sourcePaths).toEqual(
        expect.arrayContaining([
          'packages/server/tsconfig.json',
          'tsconfig.base.json',
          'tsconfig.shared.json',
        ]),
      );
      const marketplacePath = path.join(
        fixtureRoot,
        'packages',
        'marketplace',
        'marketplace.db',
      );
      const marketplaceResourcePath = path.join(
        fixtureRoot,
        'app',
        'src-tauri',
        'resources',
        'marketplace.db',
      );
      const committedMarketplace = Buffer.from(
        trackedFiles.get('packages/marketplace/marketplace.db')!,
      );
      expect(fs.readFileSync(marketplaceResourcePath)).toEqual(committedMarketplace);

      fs.writeFileSync(marketplacePath, 'dirty worktree database');
      const dirtyMarketplaceResult = runResult(
        process.execPath,
        ['scripts/build-sidecar.mjs'],
      );
      expect(
        dirtyMarketplaceResult.status,
        dirtyMarketplaceResult.stderr || dirtyMarketplaceResult.stdout,
      ).toBe(1);
      expect(dirtyMarketplaceResult.stderr).toContain(
        'canonical marketplace database does not match exact source revision',
      );
      expect(fs.readFileSync(marketplaceResourcePath)).toEqual(committedMarketplace);
      expect(
        fs.readdirSync(path.dirname(marketplaceResourcePath))
          .filter((name) => name.startsWith('marketplace.db.stage-')),
      ).toEqual([]);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
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

  it('bundle-node pins the supported desktop Node release used by CI', () => {
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'bundle-node.mjs'), 'utf-8');
    expect(script).toContain("const DESKTOP_NODE_VERSION = '22.23.2'");
    expect(script).toContain('const NODE_VERSION = DESKTOP_NODE_VERSION');
    expect(script).toContain("const SAFE_NPM_IP_ADDRESS_VERSION = '10.4.0'");
    expect(script).toContain('Hardened bundled npm with ip-address');
    expect(script).not.toContain('process.versions.node;');

    for (const workflowPath of [
      '.github/workflows/release.yml',
      '.github/workflows/tauri-build-pr.yml',
    ]) {
      const workflow = fs.readFileSync(path.join(ROOT, workflowPath), 'utf-8');
      expect(workflow.match(/node-version: 22\.23\.2/g), workflowPath).toHaveLength(2);
      expect(workflow, workflowPath).not.toMatch(/node-version: 20(?:\s|$)/);
      const runtimeSteps = [...workflow.matchAll(/run: node scripts\/bundle-node\.mjs/g)];
      const sidecarSteps = [...workflow.matchAll(/run: node scripts\/build-sidecar\.mjs/g)];
      const nativeSteps = [...workflow.matchAll(/run: node scripts\/bundle-native-deps\.mjs/g)];
      expect(runtimeSteps, workflowPath).toHaveLength(2);
      expect(sidecarSteps, workflowPath).toHaveLength(2);
      expect(nativeSteps, workflowPath).toHaveLength(2);
      for (let index = 0; index < runtimeSteps.length; index++) {
        expect(runtimeSteps[index].index, `${workflowPath} job ${index + 1}`).toBeLessThan(
          sidecarSteps[index].index,
        );
        expect(runtimeSteps[index].index, `${workflowPath} job ${index + 1}`).toBeLessThan(
          nativeSteps[index].index,
        );
      }
    }
  });

  it('desktop builds verify the selected Node ABI before staging native resources', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'app', 'package.json'), 'utf-8'),
    ) as { scripts?: Record<string, string> };
    for (const scriptName of [
      'tauri:build',
      'tauri:build:local',
      'tauri:build:win',
      'tauri:build:mac:arm64',
      'tauri:build:mac:x64',
    ]) {
      const command = manifest.scripts?.[scriptName] ?? '';
      expect(command.indexOf('bundle-node.mjs'), scriptName).toBeGreaterThanOrEqual(0);
      expect(command.indexOf('bundle-node.mjs'), scriptName).toBeLessThan(
        command.indexOf('build-sidecar.mjs'),
      );
      expect(command.indexOf('bundle-node.mjs'), scriptName).toBeLessThan(
        command.indexOf('bundle-native-deps.mjs'),
      );
    }

    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'bundle-node.mjs'), 'utf-8');
    const probeIndex = script.indexOf('assertNativeRuntimeCompatible();');
    const mutationIndex = script.indexOf('fs.copyFileSync(nodeSource, destBinary)');
    const stagedRuntimeMutationIndex = script.indexOf(
      'fs.rmSync(stagedRuntimeDir, { recursive: true, force: true })',
    );
    expect(probeIndex).toBeGreaterThanOrEqual(0);
    expect(mutationIndex).toBeGreaterThan(probeIndex);
    expect(stagedRuntimeMutationIndex).toBeGreaterThan(probeIndex);
    expect(script).toContain("const database = new Database(':memory:')");
    expect(script).toContain('SELECT 1 AS ok');
    expect(script).toContain('native ABI compatibility probe failed');
  });

  it('pins patched transitive dependency versions used by desktop builds', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')) as {
      engines?: { node?: string };
      overrides?: Record<string, string | Record<string, string>>;
      dependencies?: Record<string, string>;
    };
    const lockfile = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf-8'),
    ) as {
      packages: Record<string, { version?: string }>;
    };
    const expectedOverrides = {
      '@fastify/static': '>=10.1.2 <11',
      'brace-expansion@1': '1.1.18',
      'brace-expansion@2': '2.1.4',
      'brace-expansion@5': '5.0.9',
      'fast-uri': '3.1.7',
      browserslist: '4.28.9',
      'ip-address': '10.4.0',
      'find-my-way': '9.7.0',
      'js-yaml': '4.3.1',
      'better-sqlite3': '12.6.2',
      '@huggingface/transformers': { sharp: '0.35.3' },
      next: '16.3.0',
    };

    expect(manifest.engines?.node).toBe('^20.19.0 || >=22.12.0');
    expect(manifest.overrides).toMatchObject(expectedOverrides);
    expect(manifest.dependencies).toMatchObject({
      '@huggingface/transformers': '3.8.1',
      sharp: '0.35.3',
    });

    const fastifyStaticRanges = ['launcher', 'server'].map((workspace) => {
      const workspaceManifest = JSON.parse(fs.readFileSync(
        path.join(ROOT, 'packages', workspace, 'package.json'),
        'utf-8',
      )) as { dependencies?: Record<string, string> };
      return workspaceManifest.dependencies?.['@fastify/static'];
    });
    expect(new Set(fastifyStaticRanges)).toEqual(new Set(['^10.1.2']));

    const betterSqliteRanges = [
      'core',
      'hive-mind-core',
      'launcher',
      'marketplace',
      'server',
    ].map((workspace) => {
      const workspaceManifest = JSON.parse(fs.readFileSync(
        path.join(ROOT, 'packages', workspace, 'package.json'),
        'utf-8',
      )) as { dependencies?: Record<string, string> };
      return workspaceManifest.dependencies?.['better-sqlite3'];
    });
    expect(new Set(betterSqliteRanges)).toEqual(new Set(['^12.6.2']));

    const versionsFor = (packageName: string) => {
      const matching = Object.entries(lockfile.packages)
        .filter(([packagePath]) => packagePath.endsWith(`node_modules/${packageName}`));
      expect(matching.length).toBeGreaterThan(0);
      for (const [, metadata] of matching) {
        expect(metadata.version).toEqual(expect.any(String));
      }
      return new Set(matching.map(([, metadata]) => metadata.version!));
    };

    expect(versionsFor('@fastify/static')).toEqual(new Set(['10.1.2']));
    expect(versionsFor('brace-expansion')).toEqual(new Set(['1.1.18', '2.1.4', '5.0.9']));
    expect(versionsFor('fast-uri')).toEqual(new Set(['3.1.7']));
    expect(versionsFor('browserslist')).toEqual(new Set(['4.28.9']));
    expect(versionsFor('ip-address')).toEqual(new Set(['10.4.0']));
    expect(versionsFor('find-my-way')).toEqual(new Set(['9.7.0']));
    expect(versionsFor('js-yaml')).toEqual(new Set(['4.3.1']));
    expect(versionsFor('sharp')).toEqual(new Set(['0.35.3']));
    expect(versionsFor('better-sqlite3')).toEqual(new Set(['12.6.2']));
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
    const writeManifest = (relative: string, name?: string, version?: string) => {
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
      writeManifest('brace-expansion', 'brace-expansion', '5.0.9');
      writeManifest('fast-uri', 'fast-uri', '3.1.7');
      writeManifest('ip-address', 'ip-address', '10.4.0');
      writeManifest('better-sqlite3', 'better-sqlite3', '12.9.0');
      writeManifest('sharp', 'sharp', '0.35.3');
      writeManifest(bundledBrace, 'brace-expansion', '2.1.4');
      expect(run().status).toBe(0);
      writeManifest('better-sqlite3', 'better-sqlite3', '12.6.2');
      expect(run().status).toBe(0);
      writeManifest('better-sqlite3', 'better-sqlite3', '12.9.0');

      writeManifest('better-sqlite3', 'better-sqlite3', '11.10.0');
      const legacyBetterSqlite = run();
      expect(legacyBetterSqlite.status).toBe(1);
      expect(legacyBetterSqlite.stderr).toContain('better-sqlite3@11.10.0');

      writeManifest('better-sqlite3', 'better-sqlite3', '12.6.1');
      expect(run().status).toBe(1);
      writeManifest('better-sqlite3', 'better-sqlite3', '13.0.0');
      expect(run().status).toBe(1);
      writeManifest('better-sqlite3', 'not-better-sqlite3', '12.9.0');
      const spoofedBetterSqlite = run();
      expect(spoofedBetterSqlite.status).toBe(1);
      expect(spoofedBetterSqlite.stderr).toContain('must identify as better-sqlite3');
      writeManifest('better-sqlite3', 'better-sqlite3');
      const missingBetterSqliteVersion = run();
      expect(missingBetterSqliteVersion.status).toBe(1);
      expect(missingBetterSqliteVersion.stderr).toContain('required version: >=12.6.2 <13');
      for (const invalidVersion of [
        '12.07.0',
        '12.9007199254740992.0',
        '12.6.2-beta.1',
        '12.6.2+build.1',
      ]) {
        writeManifest('better-sqlite3', 'better-sqlite3', invalidVersion);
        const invalidBetterSqlite = run();
        expect(
          invalidBetterSqlite.status,
          `${invalidVersion}: ${invalidBetterSqlite.stderr}`,
        ).toBe(1);
      }
      fs.rmSync(path.join(fixture, 'better-sqlite3'), { recursive: true, force: true });
      writeManifest('Better-SQLite3', 'not-better-sqlite3', '12.9.0');
      const uppercaseDirectBetterSqlite = run();
      expect(uppercaseDirectBetterSqlite.status).toBe(1);
      expect(uppercaseDirectBetterSqlite.stderr).toContain('must identify as better-sqlite3');
      fs.rmSync(path.join(fixture, 'Better-SQLite3'), { recursive: true, force: true });
      writeManifest(
        'vendor/node_modules/Better-SQLite3',
        'not-better-sqlite3',
        '12.9.0',
      );
      const uppercaseNestedBetterSqlite = run();
      expect(uppercaseNestedBetterSqlite.status).toBe(1);
      expect(uppercaseNestedBetterSqlite.stderr).toContain('must identify as better-sqlite3');
      fs.rmSync(path.join(fixture, 'vendor'), { recursive: true, force: true });
      writeManifest('better-sqlite3', 'better-sqlite3', '12.9.0');

      writeManifest(bundledBrace, 'brace-expansion', '2.1.2');
      const vulnerableNpm = run();
      expect(vulnerableNpm.status).toBe(1);
      expect(vulnerableNpm.stderr).toContain('must be exactly 2.1.4');
      writeManifest(bundledBrace, 'brace-expansion', '2.1.4');

      writeManifest('brace-expansion', 'brace-expansion', '5.0.7');
      const vulnerableStagedBrace = run();
      expect(vulnerableStagedBrace.status).toBe(1);
      expect(vulnerableStagedBrace.stderr).toContain('brace-expansion@5.0.7');
      writeManifest('brace-expansion', 'brace-expansion', '5.0.9');

      writeManifest('fast-uri', 'fast-uri', '3.1.5');
      const vulnerableFastUri = run();
      expect(vulnerableFastUri.status).toBe(1);
      expect(vulnerableFastUri.stderr).toContain('fast-uri@3.1.5');
      writeManifest('fast-uri', 'fast-uri', '3.1.7');

      writeManifest('ip-address', 'ip-address', '10.2.0');
      const vulnerableIpAddress = run();
      expect(vulnerableIpAddress.status).toBe(1);
      expect(vulnerableIpAddress.stderr).toContain('ip-address@10.2.0');
      writeManifest('ip-address', 'ip-address', '10.4.0');

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

  it('sidecar resource preflight uses bundled runtime probes instead of checker-host ABI', () => {
    const script = fs.readFileSync(
      path.join(ROOT, 'scripts', 'check-sidecar-resources.mjs'),
      'utf-8',
    );
    expect(script).not.toContain('const currentAbi = process.versions.modules');
    expect(script).not.toContain('does not match current Node ABI');
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
    async () => {
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
      const runFixtureGit = (args: string[]) => {
        const result = spawnSync('git', args, {
          cwd: fixtureRoot,
          encoding: 'utf-8',
          timeout: 30_000,
          windowsHide: true,
        });
        expect(result.status, result.stderr || result.stdout).toBe(0);
        return result.stdout.trim();
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
      let fixtureSourceRevision = 'a'.repeat(40);
      const fixtureSourceContents = new Map<string, string>([
        ['package-lock.json', '{"lockfileVersion":3}\n'],
        ['package.json', '{"name":"waggle-sidecar-fixture"}\n'],
        ['packages/server/package.json', '{"name":"@waggle/server"}\n'],
        ['packages/server/src/local/service.ts', 'export const fixture = true;\n'],
        ['packages/server/tsconfig.json', '{"extends":"../../tsconfig.base.json"}\n'],
        ['scripts/build-sidecar.mjs', 'export {};\n'],
        ['tsconfig.base.json', '{"compilerOptions":{"target":"ES2022"}}\n'],
      ]);
      for (const [relative, content] of fixtureSourceContents) {
        writeFixtureFile(fixtureRoot, relative, content);
      }
      const fixtureSourceInputs = [...fixtureSourceContents.entries()]
        .map(([relative, content]) => ({
          path: relative,
          sha256: createHash('sha256').update(content).digest('hex'),
        }))
        .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
      const fixtureServicePayload = Buffer.from('console.log("sidecar");\n', 'utf8');
      const fixtureServiceProvenance = {
        schemaVersion: 1,
        sourceRevision: fixtureSourceRevision,
        entryPoint: 'packages/server/src/local/service.ts',
        sourceInputs: fixtureSourceInputs,
        bundlePayload: {
          sizeBytes: fixtureServicePayload.byteLength,
          sha256: createHash('sha256').update(fixtureServicePayload).digest('hex'),
        },
      };
      let certifiedFixtureService = Buffer.concat([
        Buffer.from(
          `// Waggle-Sidecar-Provenance: ${Buffer.from(JSON.stringify(fixtureServiceProvenance)).toString('base64')}\n`,
          'utf8',
        ),
        fixtureServicePayload,
      ]);
      const fixtureServicePath = path.join(fixtureResources, 'service.js');
      fs.writeFileSync(fixtureServicePath, certifiedFixtureService);
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
        runFixtureGit(['init']);
        runFixtureGit(['config', 'user.email', 'sidecar-preflight@waggle.invalid']);
        runFixtureGit(['config', 'user.name', 'Waggle Fixture']);
        runFixtureGit([
          'add',
          '--',
          'scripts/check-sidecar-resources.mjs',
          ...fixtureSourceContents.keys(),
          'packages/marketplace/marketplace.db',
        ]);
        runFixtureGit(['commit', '-m', 'fixture']);
        fixtureSourceRevision = runFixtureGit(['rev-parse', 'HEAD']).toLowerCase();
        fixtureServiceProvenance.sourceRevision = fixtureSourceRevision;
        certifiedFixtureService = Buffer.concat([
          Buffer.from(
            `// Waggle-Sidecar-Provenance: ${Buffer.from(JSON.stringify(fixtureServiceProvenance)).toString('base64')}\n`,
            'utf8',
          ),
          fixtureServicePayload,
        ]);
        fs.writeFileSync(fixtureServicePath, certifiedFixtureService);
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
          JSON.stringify({ name: 'brace-expansion', version: '2.1.4' }),
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

        const runChecker = async (
          {
            runtimeProbe = 'none',
            expectedSourceRevision = fixtureSourceRevision,
          }: {
            runtimeProbe?: 'none' | 'all' | 'marketplace' | 'native' | 'image';
            expectedSourceRevision?: string;
          } = {},
        ) => {
          const hiddenFiles: Array<{ hidden: string; target: string }> = [];
          const hideFixtureFile = (target: string) => {
            const hidden = `${target}.fixture-disabled`;
            fs.renameSync(target, hidden);
            hiddenFiles.push({ hidden, target });
          };
          try {
            // Structural rejection cases should not repeat unrelated native, npm,
            // marketplace, and image probes. Probe-specific cases keep the bundled
            // runtime but hide inputs for every other expensive probe.
            if (runtimeProbe === 'none') {
              hideFixtureFile(fixtureNode);
            } else if (runtimeProbe !== 'all') {
              hideFixtureFile(path.join(
                fixtureResources,
                ...`${fixtureNpmRuntimeRoot}/package.json`.split('/'),
              ));
              if (runtimeProbe !== 'marketplace') hideFixtureFile(fixtureMarketplaceResource);
              if (runtimeProbe !== 'native') {
                hideFixtureFile(path.join(fixtureOnnx, 'package.json'));
              }
              if (runtimeProbe !== 'image') hideFixtureFile(stagedSharpBinding);
            }
            const result = await new Promise<{
              status: number | null;
              stdout: string;
              stderr: string;
              error?: Error;
            }>((resolve) => {
              execFile(
                process.execPath,
                [fixtureChecker, '--expected-source-revision', expectedSourceRevision],
                {
                  encoding: 'utf-8',
                  timeout: 60_000,
                  windowsHide: true,
                },
                (error, stdout, stderr) => {
                  if (!error) {
                    resolve({ status: 0, stdout, stderr });
                    return;
                  }
                  if (
                    typeof error.code === 'number'
                    && !error.killed
                    && (error.signal === null || error.signal === undefined)
                  ) {
                    resolve({ status: error.code, stdout, stderr });
                    return;
                  }
                  resolve({ status: null, stdout, stderr, error });
                },
              );
            });
            if (result.error) throw result.error;
            return result;
          } finally {
            for (const file of hiddenFiles.reverse()) {
              fs.renameSync(file.hidden, file.target);
            }
          }
        };

        const fixtureMarketplaceBeforeProbe = fs.readFileSync(fixtureMarketplaceResource);
        const baselineResult = await runChecker({ runtimeProbe: 'all' });
        expect(
          baselineResult.status,
          baselineResult.stderr || baselineResult.stdout,
        ).toBe(0);
        expect(fs.readFileSync(fixtureMarketplaceResource)).toEqual(fixtureMarketplaceBeforeProbe);

        fs.appendFileSync(fixtureMarketplaceSource, 'dirty worktree database');
        fs.copyFileSync(fixtureMarketplaceSource, fixtureMarketplaceResource);
        const dirtyMarketplaceResult = await runChecker();
        expect(dirtyMarketplaceResult.status).toBe(1);
        expect(dirtyMarketplaceResult.stderr).toContain(
          'canonical marketplace database does not match exact source revision',
        );
        fs.writeFileSync(fixtureMarketplaceSource, fixtureMarketplaceBeforeProbe);
        fs.writeFileSync(fixtureMarketplaceResource, fixtureMarketplaceBeforeProbe);

        fs.appendFileSync(fixtureServicePath, '// stale payload\n');
        const staleServiceResult = await runChecker();
        expect(staleServiceResult.status).toBe(1);
        expect(staleServiceResult.stderr).toContain(
          'resources/service.js payload does not match embedded provenance',
        );
        fs.writeFileSync(fixtureServicePath, certifiedFixtureService);

        const fixtureEntryPoint = path.join(
          fixtureRoot,
          'packages',
          'server',
          'src',
          'local',
          'service.ts',
        );
        fs.appendFileSync(fixtureEntryPoint, '// stale source\n');
        const staleSourceResult = await runChecker();
        expect(staleSourceResult.status).toBe(1);
        expect(staleSourceResult.stderr).toContain(
          'resources/service.js source input hash does not match current source',
        );
        fs.writeFileSync(
          fixtureEntryPoint,
          fixtureSourceContents.get('packages/server/src/local/service.ts')!,
          'utf8',
        );

        const fixtureTsconfig = path.join(fixtureRoot, 'packages', 'server', 'tsconfig.json');
        fs.appendFileSync(fixtureTsconfig, '// stale transform config\n');
        const staleConfigResult = await runChecker();
        expect(staleConfigResult.status).toBe(1);
        expect(staleConfigResult.stderr).toContain(
          'resources/service.js source input hash does not match current source',
        );
        fs.writeFileSync(
          fixtureTsconfig,
          fixtureSourceContents.get('packages/server/tsconfig.json')!,
          'utf8',
        );

        const staleRevisionResult = await runChecker({
          expectedSourceRevision: 'b'.repeat(40),
        });
        expect(staleRevisionResult.status).toBe(1);
        expect(staleRevisionResult.stderr).toContain(
          'resources/service.js source revision does not match expected revision',
        );
        const nestedResourceDb = path.join(
          fixtureResources,
          'node_modules',
          'fixture-package',
          'state',
          'cache.DB',
        );
        fs.mkdirSync(path.dirname(nestedResourceDb), { recursive: true });
        const staleSidecars: Array<{
          path: string;
          label: string;
          diagnostic: string;
          suffix: string;
        }> = [];
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
          {
            path: nestedResourceDb,
            label: 'resources/node_modules/fixture-package/state/cache.DB',
            diagnostic: 'must not be packaged',
          },
        ]) {
          for (const suffix of ['-wal', '-shm', '-journal']) {
            expect(fs.existsSync(`${target.path}${suffix}`)).toBe(false);
            fs.writeFileSync(`${target.path}${suffix}`, 'stale SQLite sidecar');
            staleSidecars.push({ ...target, suffix });
          }
        }
        const staleSidecarResult = await runChecker();
        expect(staleSidecarResult.status).toBe(1);
        for (const target of staleSidecars) {
          expect(staleSidecarResult.stderr).toContain(
            `${target.label}${target.suffix} ${target.diagnostic}`,
          );
          fs.rmSync(`${target.path}${target.suffix}`);
        }

        const fixtureMarketplaceContent = fs.readFileSync(fixtureMarketplaceResource);
        fs.rmSync(fixtureMarketplaceResource);
        const missingMarketplaceResult = await runChecker();
        expect(missingMarketplaceResult.status).toBe(1);
        expect(missingMarketplaceResult.stderr).toContain('resources/marketplace.db');
        fs.writeFileSync(fixtureMarketplaceResource, fixtureMarketplaceContent);

        fs.appendFileSync(fixtureMarketplaceResource, 'tampered');
        const mismatchedMarketplaceResult = await runChecker();
        expect(mismatchedMarketplaceResult.status).toBe(1);
        expect(mismatchedMarketplaceResult.stderr).toContain(
          'resources/marketplace.db does not match the canonical marketplace database',
        );
        fs.writeFileSync(fixtureMarketplaceResource, fixtureMarketplaceContent);

        const fixtureMarketplaceSourceContent = fs.readFileSync(fixtureMarketplaceSource);
        fs.writeFileSync(fixtureMarketplaceSource, 'not a SQLite database');
        fs.writeFileSync(fixtureMarketplaceResource, 'not a SQLite database');
        const invalidMarketplaceResult = await runChecker({ runtimeProbe: 'marketplace' });
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
        const missingNpmRuntimeResult = await runChecker();
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
          const invalidRuntimeResult = await runChecker({ runtimeProbe: 'native' });
          expect(invalidRuntimeResult.status).toBe(1);
          expect(invalidRuntimeResult.stderr).toContain('resources native runtime probe failed');
          fs.writeFileSync(target, original);
        }
        const stagedSharpBindingContent = fs.readFileSync(stagedSharpBinding);
        fs.writeFileSync(stagedSharpBinding, 'not a native payload');
        const invalidImageRuntimeResult = await runChecker({ runtimeProbe: 'image' });
        expect(invalidImageRuntimeResult.status).toBe(1);
        expect(invalidImageRuntimeResult.stderr).toContain('resources image runtime probe failed');
        fs.writeFileSync(stagedSharpBinding, stagedSharpBindingContent);

        const imageDependencyTargets = [
          {
            manifest: path.join(fixtureResources, 'node_modules', 'sharp', 'package.json'),
            diagnostic: 'resources/node_modules/sharp',
          },
          {
            manifest: path.join(fixtureTransformers, 'package.json'),
            diagnostic: 'resources/node_modules/@huggingface/transformers',
          },
        ].map((target) => ({
          ...target,
          content: fs.readFileSync(target.manifest),
        }));
        for (const target of imageDependencyTargets) {
          fs.rmSync(target.manifest);
        }
        const missingImageDependencyResult = await runChecker();
        expect(missingImageDependencyResult.status).toBe(1);
        for (const target of imageDependencyTargets) {
          expect(missingImageDependencyResult.stderr).toContain(target.diagnostic);
          fs.writeFileSync(target.manifest, target.content);
        }

        const missingNativeTargets = requiredNativeFiles.map((entry) => {
          const target = path.join(
            fixtureResources,
            'native',
            ...entry.split('/'),
          );
          return { entry, target, original: fs.readFileSync(target) };
        });
        for (const target of missingNativeTargets) {
          fs.rmSync(target.target);
        }
        const missingNativeResult = await runChecker();
        expect(missingNativeResult.status).toBe(1);
        for (const target of missingNativeTargets) {
          expect(missingNativeResult.stderr).toContain(`resources/native/${target.entry}`);
          fs.writeFileSync(target.target, target.original);
        }

        const serviceMapPath = writeFixtureFile(
          fixtureResources,
          'service.js.map',
          JSON.stringify({ sourcesContent: ['private TypeScript source'] }),
        );
        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          '@waggle/hive-mind-core/src/evolution-runs.ts',
          'export const proprietary = true;\n',
        );
        const hiveSourceDir = path.join(
          fixtureResources,
          'node_modules',
          '@waggle',
          'hive-mind-core',
          'src',
        );
        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          'waggle-test-runtime/src/private.ts',
          'export const privateSource = true;\n',
        );
        const unscopedSourceDir = path.join(
          fixtureResources,
          'node_modules',
          'waggle-test-runtime',
          'src',
        );
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
        const nestedVendorDir = path.join(
          fixtureResources,
          'node_modules',
          'vendor',
        );
        const firstPartyReadme = writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          '@waggle/hive-mind-core/README.md',
          'internal package documentation\n',
        );
        const disallowedPayloadResult = await runChecker();
        expect(disallowedPayloadResult.status).toBe(1);
        for (const diagnostic of [
          'resources/service.js.map must not be packaged',
          'resources/node_modules/@waggle/hive-mind-core/src/evolution-runs.ts must not be packaged',
          'resources/node_modules/waggle-test-runtime/src/private.ts must not be packaged',
          'resources/node_modules/vendor/node_modules/@waggle/shared/src/private.ts must not be packaged',
          'resources/node_modules/@waggle/hive-mind-core/README.md is not a runtime package entry',
        ]) {
          expect(disallowedPayloadResult.stderr).toContain(diagnostic);
        }
        fs.rmSync(serviceMapPath);
        fs.rmSync(hiveSourceDir, { recursive: true });
        fs.rmSync(unscopedSourceDir, { recursive: true });
        fs.rmSync(nestedVendorDir, { recursive: true });
        fs.rmSync(firstPartyReadme);

        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          '@waggle/missing-manifest/dist/index.js',
          'export {};\n',
        );
        const missingManifestDir = path.join(
          fixtureResources,
          'node_modules',
          '@waggle',
          'missing-manifest',
        );
        writeFixtureFile(
          path.join(fixtureResources, 'node_modules'),
          '@waggle/malformed-manifest/package.json',
          '{',
        );
        const malformedManifestDir = path.join(
          fixtureResources,
          'node_modules',
          '@waggle',
          'malformed-manifest',
        );
        const invalidManifestResult = await runChecker();
        expect(invalidManifestResult.status).toBe(1);
        expect(invalidManifestResult.stderr).toContain(
          'resources/node_modules/@waggle/missing-manifest/package.json is missing or invalid',
        );
        expect(invalidManifestResult.stderr).toContain(
          'resources/node_modules/@waggle/malformed-manifest/package.json is missing or invalid',
        );
        fs.rmSync(missingManifestDir, { recursive: true });
        fs.rmSync(malformedManifestDir, { recursive: true });

        writeCoreManifest('dist/../package.json');
        const traversalTargetResult = await runChecker();
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
        const directoryTargetResult = await runChecker();
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
        const junctionTargetResult = await runChecker();
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
        expect((await runChecker({ runtimeProbe: 'all' })).status).toBe(0);

        fs.writeFileSync(
          coreDistEntry,
          'export {};\n//# sourceMappingURL=index.js.map\n',
          'utf-8',
        );
        fs.writeFileSync(
          path.join(fixtureResources, 'service.js'),
          'console.log("sidecar");\n//# sourceMappingURL=data:application/json;base64,e30=\n',
          'utf-8',
        );
        const inlineMapResult = await runChecker();
        expect(inlineMapResult.status).toBe(1);
        expect(inlineMapResult.stderr).toContain(
          'resources/node_modules/@waggle/hive-mind-core/dist/index.js contains a sourceMappingURL directive',
        );
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
  it('bounds the broad root Vitest lane to two workers', () => {
    const workflow = parseYaml(
      fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf-8'),
    ) as {
      jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
    };
    const steps = workflow.jobs?.test?.steps ?? [];
    const matches = steps.filter(
      (step) => step.name === 'Unit tests — packages + cross-cutting (root vitest)',
    );
    expect(matches).toHaveLength(1);
    const run = matches[0]?.run ?? '';
    const workerValues = [
      ...run.matchAll(/--maxWorkers(?:=|\s+)([^\s\\]+)/g),
    ].map((match) => match[1]);
    expect(workerValues).toEqual(['2']);
    expect(run).not.toContain('--no-file-parallelism');
    expect(run).not.toMatch(/--fileParallelism(?:=|\s+)false\b/);
  });

  it('keeps Intel macOS PR verification app-only while retaining DMG release coverage', () => {
    type MacJob = {
      strategy?: {
        matrix?: {
          include?: Array<{
            target?: string;
            arch?: string;
            runner?: string;
            bundles?: string;
            artifact_path?: string;
          }>;
        };
      };
      steps?: Array<{
        name?: string;
        run?: string;
        with?: { path?: string; 'if-no-files-found'?: string };
      }>;
    };
    const prWorkflow = parseYaml(
      fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'tauri-build-pr.yml'), 'utf-8'),
    ) as { jobs?: { 'verify-macos'?: MacJob } };
    const prJob = prWorkflow.jobs?.['verify-macos'];
    const matrix = prJob?.strategy?.matrix?.include ?? [];
    expect(matrix).toEqual([
      {
        target: 'aarch64-apple-darwin',
        arch: 'arm64',
        runner: 'macos-15',
        bundles: 'dmg',
        artifact_path: 'app/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg',
      },
      {
        target: 'x86_64-apple-darwin',
        arch: 'x64',
        runner: 'macos-15-intel',
        bundles: 'app',
        artifact_path: 'app/src-tauri/target/x86_64-apple-darwin/release/bundle/macos/*.app',
      },
    ]);
    const prBuild = prJob?.steps?.find(
      (step) => step.name === 'Build Tauri (macOS ${{ matrix.target }})',
    );
    expect(prBuild?.run).toBe(
      'cd app && node node_modules/@tauri-apps/cli/tauri.js build --target ${{ matrix.target }} --bundles ${{ matrix.bundles }}',
    );
    const prUpload = prJob?.steps?.find((step) => step.name === 'Upload macOS artifacts');
    expect(prUpload?.with?.path).toBe('${{ matrix.artifact_path }}');
    expect(prUpload?.with?.['if-no-files-found']).toBe('error');

    const releaseWorkflow = parseYaml(
      fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf-8'),
    ) as { jobs?: { 'build-macos'?: MacJob } };
    const releaseJob = releaseWorkflow.jobs?.['build-macos'];
    const releaseMatrix = releaseJob?.strategy?.matrix?.include ?? [];
    expect(releaseMatrix).toEqual([
      {
        target: 'aarch64-apple-darwin',
        arch: 'arm64',
        runner: 'macos-15',
      },
      {
        target: 'x86_64-apple-darwin',
        arch: 'x64',
        runner: 'macos-15-intel',
      },
    ]);
    const releaseBuild = releaseJob?.steps?.find(
      (step) => step.name === 'Build Tauri (macOS)',
    );
    expect(releaseBuild?.run).toBe(
      'cd app && node node_modules/@tauri-apps/cli/tauri.js build --target ${{ matrix.target }}',
    );
    const releaseDmgUpload = releaseJob?.steps?.find(
      (step) => step.name === 'Upload macOS DMG verification artifact',
    );
    expect(releaseDmgUpload?.with?.path).toBe(
      'app/src-tauri/target/${{ matrix.target }}/release/bundle/dmg/*.dmg',
    );
    expect(releaseDmgUpload?.with?.['if-no-files-found']).toBe('error');
    const releaseAppUpload = releaseJob?.steps?.find(
      (step) => step.name === 'Upload macOS app verification artifact',
    );
    expect(releaseAppUpload?.with?.path).toBe(
      'app/src-tauri/target/${{ matrix.target }}/release/bundle/macos/*.app',
    );
    expect(releaseAppUpload?.with?.['if-no-files-found']).toBe('error');
  });

  it('clean-checkout CI resolves vendored PPTX and uses the locked dependency graph', () => {
    const rootPackage = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'),
    ) as { dependencies?: Record<string, string> };
    const agentPackage = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'packages', 'agent', 'package.json'), 'utf-8'),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      bundledDependencies?: string[];
      scripts?: Record<string, string>;
    };
    const packageLock = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf-8'),
    ) as {
      packages?: Record<
        string,
        {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
          resolved?: string;
          link?: boolean;
          version?: string;
          dev?: boolean;
        }
      >;
    };
    const vendorPackage = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'vendor', 'pptxgenjs', 'package.json'), 'utf-8'),
    ) as { name?: string; version?: string };
    const workflow = parseYaml(fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'hive-mind-cli-cross-platform.yml'),
      'utf-8',
    )) as {
      on?: { pull_request?: { paths?: string[] } };
      jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
    };
    const vaultTests = fs.readFileSync(
      path.join(ROOT, 'packages', 'core', 'tests', 'vault.test.ts'),
      'utf-8',
    );

    expect(rootPackage.dependencies?.pptxgenjs).toBeUndefined();
    expect(packageLock.packages?.['']?.dependencies?.pptxgenjs).toBeUndefined();
    expect(packageLock.packages?.['node_modules/pptxgenjs']).toBeUndefined();
    expect(agentPackage.dependencies?.pptxgenjs).toBeUndefined();
    expect(agentPackage.dependencies?.jszip).toBe('^3.10.1');
    expect(agentPackage.devDependencies?.pptxgenjs).toBe('file:../../vendor/pptxgenjs');
    expect(agentPackage.bundledDependencies).toBeUndefined();
    expect(agentPackage.scripts).toMatchObject({
      build: 'tsc --build --force && node ../../scripts/stage-agent-pptx-runtime.mjs',
      prepack: 'tsc --build --force && node ../../scripts/stage-agent-pptx-runtime.mjs',
    });
    expect(packageLock.packages?.['packages/agent']).toMatchObject({
      dependencies: { jszip: '^3.10.1' },
      devDependencies: { pptxgenjs: 'file:../../vendor/pptxgenjs' },
    });
    expect(packageLock.packages?.['packages/agent']?.dependencies?.pptxgenjs).toBeUndefined();
    expect(packageLock.packages?.['packages/agent']?.devDependencies?.pptxgenjs).toBe(
      'file:../../vendor/pptxgenjs',
    );
    expect(packageLock.packages?.['packages/agent/node_modules/pptxgenjs']).toMatchObject({
      resolved: 'vendor/pptxgenjs',
      link: true,
    });
    expect(packageLock.packages?.['vendor/pptxgenjs']).toMatchObject({
      version: vendorPackage.version,
      dev: true,
    });
    expect(vendorPackage).toMatchObject({ name: 'pptxgenjs', version: '4.0.1-waggle.0' });

    const installStep = workflow.jobs?.['install-and-smoke']?.steps?.find(
      (step) => step.name === 'Install workspace deps',
    );
    expect(installStep?.run).toBe('npm ci');
    expect(workflow.on?.pull_request?.paths).toEqual(
      expect.arrayContaining([
        'vendor/pptxgenjs/**',
        'package.json',
        'package-lock.json',
        '.github/workflows/hive-mind-cli-cross-platform.yml',
      ]),
    );
    expect(vaultTests).toMatch(
      /removes a pre-existing explicit Everyone allow ACE[\s\S]*?node_modules\/vite-node\/vite-node\.mjs[\s\S]*?'--config'[\s\S]*?probePath[\s\S]*?\r?\n\s*210_000,\r?\n\s*\);/,
    );
    expect(vaultTests).not.toContain("'--script'");
  });

  it('release workflow exists for Windows + macOS builds', () => {
    const workflow = path.join(ROOT, '.github', 'workflows', 'release.yml');
    expect(fs.existsSync(workflow)).toBe(true);
    const content = fs.readFileSync(workflow, 'utf-8');
    expect(content).toContain('build-windows');
    expect(content).toContain('build-macos');
    expect(content).not.toMatch(/uses:\s+tauri-apps\/tauri-action/);
    expect(content).toContain('Upload macOS DMG verification artifact');
    expect(content).toContain('Upload macOS app verification artifact');
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

  it('release workflow isolates unsigned build, protected signing, and publication authority', () => {
    const workflow = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'release.yml'),
      'utf-8',
    ).replace(/\r\n/g, '\n');
    const publisherPath = path.join(ROOT, 'scripts', 'publish-windows-release.ps1');
    expect(fs.existsSync(publisherPath)).toBe(true);
    const publisher = fs.readFileSync(publisherPath, 'utf-8');
    const parsedWorkflow = parseYaml(workflow) as {
      jobs?: Record<
        string,
        {
          environment?: unknown;
          if?: unknown;
          steps?: Array<{
            name?: string;
            uses?: string;
            with?: Record<string, unknown>;
            if?: unknown;
            'continue-on-error'?: unknown;
          }>;
        }
      >;
    };
    const job = (name: string, nextName: string) => {
      const marker = `  ${name}:`;
      const nextMarker = `\n  ${nextName}:`;
      const start = workflow.indexOf(marker);
      const end = workflow.indexOf(nextMarker, start);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(workflow.lastIndexOf(marker)).toBe(start);
      expect(end).toBeGreaterThan(start);
      return workflow.slice(start, end);
    };
    const step = (jobSource: string, name: string) => {
      const marker = `      - name: ${name}`;
      const start = jobSource.indexOf(marker);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(jobSource.lastIndexOf(marker)).toBe(start);
      const end = jobSource.indexOf('\n      - name:', start + 1);
      return jobSource.slice(start, end >= 0 ? end : undefined);
    };
    const buildJob = job('build-windows-prebuilt', 'prepare-windows-signing');
    const preparationJob = job('prepare-windows-signing', 'sign-windows');
    const signingJob = job('sign-windows', 'certify-windows');
    const certificationJob = job('certify-windows', 'attest-windows');
    const attestationJob = job('attest-windows', 'publish-windows');
    const publicationJob = job('publish-windows', 'build-macos');
    const parsedSigningJob = parsedWorkflow.jobs?.['sign-windows'];
    const parsedAttestationJob = parsedWorkflow.jobs?.['attest-windows'];
    const parsedPublicationJob = parsedWorkflow.jobs?.['publish-windows'];

    expect(parsedSigningJob).toBeDefined();
    expect(parsedSigningJob).not.toHaveProperty('environment');
    expect(parsedPublicationJob?.if).toBe(
      "vars.WINDOWS_PUBLIC_RELEASE_AUTHORIZED == 'true' && github.event.repository.private == false && startsWith(github.ref, 'refs/tags/v')",
    );
    expect(workflow).toContain('WINDOWS_SIGNING_TRANSPORT_MAX_ITEMS: 60000');
    expect([
      ...workflow.matchAll(
        /\$maxItems = \[int\]\$env:WINDOWS_SIGNING_TRANSPORT_MAX_ITEMS/g,
      ),
    ]).toHaveLength(2);
    expect([...workflow.matchAll(/\$items\.Count -gt \$maxItems/g)]).toHaveLength(2);
    expect(workflow).not.toMatch(/\bgit\s+(?:fetch|ls-remote)\b/);
    expect(workflow).toContain(
      '$baseCommit = (git rev-parse --verify "refs/tags/$baseTag^{}").Trim().ToLowerInvariant()',
    );

    expect(buildJob).toContain('permissions:\n      contents: read');
    expect(buildJob).not.toMatch(/^ {4}environment:/m);
    expect(buildJob).not.toContain('id-token: write');
    expect(buildJob).not.toContain('attestations: write');
    expect(buildJob).not.toContain('contents: write');
    expect(buildJob).not.toContain('azure/login@');
    expect(buildJob).not.toContain('GH_TOKEN:');

    expect(preparationJob).toContain('needs: build-windows-prebuilt');
    expect(preparationJob).toContain('permissions:\n      contents: read');
    expect(preparationJob).not.toContain('id-token: write');
    expect(preparationJob).not.toContain('azure/login@');
    expect(signingJob).toContain(
      'needs: [build-windows-prebuilt, prepare-windows-signing]',
    );
    expect(signingJob).not.toMatch(/^ {4}environment:/m);
    expect(signingJob).toContain('permissions:\n      contents: read');
    expect(signingJob).not.toContain('attestations: write');
    expect(signingJob).toContain('id-token: write');
    expect(signingJob).not.toContain('contents: write');
    expect([...certificationJob.matchAll(/GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/g)])
      .toHaveLength(1);

    expect(certificationJob).toContain('needs: sign-windows');
    expect(certificationJob).not.toMatch(/^ {4}environment:/m);
    expect(certificationJob).not.toContain('id-token: write');
    expect(certificationJob).not.toContain('azure/login@');
    expect(attestationJob).toContain('needs: certify-windows');
    expect(parsedAttestationJob?.if).toBe('github.event.repository.private == false');
    expect(parsedAttestationJob?.environment).toBe('production');
    expect(attestationJob).toContain('runs-on: ubuntu-latest');
    expect(attestationJob).toContain('attestations: write');
    expect(attestationJob).toContain('id-token: write');
    expect(attestationJob).not.toContain('azure/login@');

    expect(publicationJob).toContain('needs: [certify-windows, attest-windows]');
    expect(publicationJob).toContain('permissions:\n      contents: write');
    expect(publicationJob).not.toMatch(/^ {4}environment:/m);
    expect(publicationJob).not.toContain('id-token: write');
    expect(publicationJob).not.toContain('attestations: write');
    expect(publicationJob).not.toContain('azure/login@');
    expect(publicationJob).not.toContain('sign-windows-artifact.ps1');
    expect(publicationJob).not.toContain('certify-windows-installer.ps1');

    for (const forbidden of [
      'WINDOWS_CODESIGN_PFX_BASE64',
      'WINDOWS_CODESIGN_PFX_PASSWORD',
      'Import-PfxCertificate',
      'Cert:\\',
      'WAGGLE_IMPORTED_CERT_THUMBPRINTS',
      'WINDOWS_CODESIGN_APPROVED_THUMBPRINT',
      'client-secret:',
      'creds:',
    ]) {
      expect(workflow).not.toContain(forbidden);
    }
    expect(signingJob).toContain(
      'azure/login@f5d393ae46f8fde4be8b75f32e3fc50e654ad0ca',
    );
    expect(signingJob).toContain('client-id: ${{ vars.AZURE_CLIENT_ID }}');
    expect(signingJob).toContain('tenant-id: ${{ vars.AZURE_TENANT_ID }}');
    expect(signingJob).toContain('subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}');
    expect(signingJob).toContain('audience: api://AzureADTokenExchange');
    expect(workflow).not.toContain('[checked]');

    const boundaryStep = step(signingJob, 'Validate exact hosted OIDC release boundary');
    expect(boundaryStep).toContain("$env:GITHUB_EVENT_NAME -cne 'push'");
    expect(boundaryStep).toContain("$env:GITHUB_REPOSITORY -cne 'marolinik/waggle-os'");
    expect(boundaryStep).toContain("$env:GITHUB_REF_TYPE -cne 'tag'");
    expect(boundaryStep).toContain('$env:GITHUB_REF -cne "refs/tags/v$version"');
    expect(boundaryStep).toContain('$env:GITHUB_REF_NAME -cne "v$version"');
    expect(boundaryStep).toContain(
      '$env:GITHUB_WORKFLOW_REF -cne "marolinik/waggle-os/.github/workflows/release.yml@$env:GITHUB_REF"',
    );
    expect(boundaryStep).toContain('$env:GITHUB_WORKFLOW_SHA -cne $env:GITHUB_SHA');

    const refreshStep = step(signingJob, 'Refresh exact signing repository refs');
    expect(refreshStep).toContain(
      'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
    );
    expect(refreshStep).toContain('ref: ${{ github.ref }}');
    expect(refreshStep).toContain('fetch-depth: 0');
    expect(refreshStep).toContain('persist-credentials: false');
    expect(refreshStep).toContain('clean: false');

    const parsedSigningSteps = parsedSigningJob?.steps ?? [];
    const parsedRefreshIndex = parsedSigningSteps.findIndex(
      ({ name }) => name === 'Refresh exact signing repository refs',
    );
    const parsedRevalidationIndex = parsedSigningSteps.findIndex(
      ({ name }) => name === 'Revalidate exact signing revision against fresh origin main',
    );
    const parsedAzureIndex = parsedSigningSteps.findIndex(
      ({ name }) => name === 'Authenticate Azure Artifact Signing with OIDC',
    );
    expect(parsedRefreshIndex).toBeGreaterThanOrEqual(0);
    expect(parsedRevalidationIndex).toBe(parsedRefreshIndex + 1);
    expect(parsedAzureIndex).toBe(parsedRevalidationIndex + 1);
    expect(parsedSigningSteps[parsedRefreshIndex]).toMatchObject({
      uses: 'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
      with: {
        repository: 'marolinik/waggle-os',
        ref: '${{ github.ref }}',
        'fetch-depth': 0,
        'persist-credentials': false,
        clean: false,
      },
    });
    expect(parsedSigningSteps[parsedAzureIndex]?.uses).toBe(
      'azure/login@f5d393ae46f8fde4be8b75f32e3fc50e654ad0ca',
    );
    for (const index of [parsedRefreshIndex, parsedRevalidationIndex, parsedAzureIndex]) {
      expect(parsedSigningSteps[index]).not.toHaveProperty('if');
      expect(parsedSigningSteps[index]).not.toHaveProperty('continue-on-error');
    }

    const revalidationStep = step(
      signingJob,
      'Revalidate exact signing revision against fresh origin main',
    );
    expect(revalidationStep).toContain(
      'git merge-base --is-ancestor $env:GITHUB_SHA refs/remotes/origin/main',
    );
    expect(revalidationStep).toContain('$checkedOutRevision -cne $env:GITHUB_SHA');
    expect(revalidationStep).toContain('$env:GITHUB_WORKFLOW_SHA -cne $env:GITHUB_SHA');
    expect(signingJob.indexOf('Refresh exact signing repository refs'))
      .toBeLessThan(signingJob.indexOf('Revalidate exact signing revision against fresh origin main'));
    expect(signingJob.indexOf('Revalidate exact signing revision against fresh origin main'))
      .toBeLessThan(signingJob.indexOf('Authenticate Azure Artifact Signing with OIDC'));

    expect(publicationJob).toContain(
      "vars.WINDOWS_PUBLIC_RELEASE_AUTHORIZED == 'true'",
    );
    expect(publicationJob).toContain('github.event.repository.private == false');

    const capacityIndex = preparationJob.indexOf(
      'Validate capacity before duplicate handoff extraction',
    );
    const setupNodeIndex = preparationJob.indexOf(
      'Setup Node.js for protected packaging',
    );
    const rootDependenciesIndex = certificationJob.indexOf(
      'Install locked certification dependencies',
    );
    const certificationSetupNodeIndex = certificationJob.indexOf(
      'Setup Node.js for source-bound certification',
    );
    const appDependenciesIndex = preparationJob.indexOf(
      'Install locked Tauri packaging CLI',
    );
    const certificationIndex = certificationJob.indexOf(
      'Certify Windows Solo installer lifecycle',
    );
    expect(capacityIndex).toBeGreaterThanOrEqual(0);
    expect(setupNodeIndex).toBeGreaterThan(capacityIndex);
    expect(appDependenciesIndex).toBeGreaterThan(setupNodeIndex);
    expect(certificationSetupNodeIndex).toBeGreaterThanOrEqual(0);
    expect(rootDependenciesIndex).toBeGreaterThan(certificationSetupNodeIndex);
    expect(rootDependenciesIndex).toBeGreaterThanOrEqual(0);
    expect(certificationIndex).toBeGreaterThan(rootDependenciesIndex);

    const resolverStep = step(preparationJob, 'Resolve Windows release mode');
    expect(resolverStep).toContain('id: release-mode');
    expect(resolverStep).toContain(
      '-CandidateVersion $candidateVersion `',
    );
    expect(resolverStep).toContain('-CandidateTag $env:GITHUB_REF_NAME `');
    expect(resolverStep).toContain('-CandidateSha $env:GITHUB_SHA `');
    expect(resolverStep).toContain(
      '"mode=$releaseMode" | Out-File -FilePath $env:GITHUB_OUTPUT',
    );

    const baselineStep = step(certificationJob, 'Download signed Windows upgrade baseline');
    expect(baselineStep).toContain(
      "if: steps.verify-signed.outputs.release_mode == 'upgrade'",
    );
    expect(baselineStep).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');

    const certificateStep = step(certificationJob, 'Certify Windows Solo installer lifecycle');
    expect(certificateStep).toContain(
      'WAGGLE_RELEASE_MODE: ${{ steps.verify-signed.outputs.release_mode }}',
    );
    expect(certificateStep).toContain(
      "if ($env:WAGGLE_RELEASE_MODE -eq 'upgrade') {",
    );
    expect(certificateStep).toContain(
      'Bootstrap certification unexpectedly produced an upgrade receipt',
    );

    const bootstrapAttestation = step(attestationJob, 'Attest bootstrap Windows artifacts');
    expect(bootstrapAttestation).toContain(
      "if: needs.certify-windows.outputs.release_mode == 'bootstrap'",
    );
    expect(bootstrapAttestation).toContain('windows-installer-certificate.json');
    expect(bootstrapAttestation).not.toContain(
      'windows-installer-upgrade-certificate.json',
    );

    const upgradeAttestation = step(attestationJob, 'Attest upgrade Windows artifacts');
    expect(upgradeAttestation).toContain(
      "if: needs.certify-windows.outputs.release_mode == 'upgrade'",
    );
    expect(upgradeAttestation).toContain('windows-installer-certificate.json');
    expect(upgradeAttestation).toContain(
      'windows-installer-upgrade-certificate.json',
    );

    const publishStep = step(publicationJob, 'Publish certified Windows release');
    expect(publishStep).toContain(
      "if: success() && startsWith(github.ref, 'refs/tags/v')",
    );
    expect(publishStep).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(publishStep).toContain(
      'WINDOWS_CODESIGN_APPROVED_SUBJECT: ${{ needs.certify-windows.outputs.signer_subject }}',
    );
    expect(publishStep).toContain(
      'WAGGLE_RELEASE_MODE: ${{ needs.certify-windows.outputs.release_mode }}',
    );
    expect(publishStep).toContain(
      'WAGGLE_CERTIFIED_CANDIDATE_SHA256: ${{ needs.certify-windows.outputs.candidate_sha256 }}',
    );
    expect(publishStep).toContain(
      './scripts/publish-windows-release.ps1 -Mode $env:WAGGLE_RELEASE_MODE',
    );
    expect(publishStep).not.toContain('gh release ');

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

  it('keeps Azure signing, candidate execution, GitHub attestation, and publication in separate jobs', () => {
    const workflow = fs
      .readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf-8')
      .replace(/\r\n/g, '\n');
    const job = (name: string, nextName: string) => {
      const start = workflow.indexOf(`  ${name}:`);
      const end = workflow.indexOf(`\n  ${nextName}:`, start);
      expect(start, name).toBeGreaterThanOrEqual(0);
      expect(end, nextName).toBeGreaterThan(start);
      return workflow.slice(start, end);
    };
    const signingJob = job('sign-windows', 'certify-windows');
    const preparationJob = job('prepare-windows-signing', 'sign-windows');
    const certificationJob = job('certify-windows', 'attest-windows');
    const attestationJob = job('attest-windows', 'publish-windows');
    const publicationJob = job('publish-windows', 'build-macos');

    expect(preparationJob).toContain('needs: build-windows-prebuilt');
    expect(signingJob).toContain(
      'needs: [build-windows-prebuilt, prepare-windows-signing]',
    );
    expect(signingJob).not.toMatch(/^ {4}environment:/m);
    expect(signingJob).toContain('id-token: write');
    expect(signingJob).toContain('azure/login@');
    expect(signingJob).toContain('Package and sign from immutable prepared inputs');
    expect(signingJob).not.toContain('certify-windows-installer.ps1');
    expect(signingJob).not.toContain('attest-build-provenance@');
    expect(signingJob).not.toContain('GH_TOKEN:');

    expect(certificationJob).toContain('needs: sign-windows');
    expect(certificationJob).toContain('runs-on: windows-latest');
    expect(certificationJob).toContain('permissions:\n      contents: read');
    expect(certificationJob).not.toMatch(/^ {4}environment:/m);
    expect(certificationJob).not.toContain('id-token: write');
    expect(certificationJob).not.toContain('attestations: write');
    expect(certificationJob).not.toContain('azure/login@');
    expect(certificationJob).toContain('Validate exact signed handoff before candidate execution');
    expect(certificationJob).toContain('Certify Windows Solo installer lifecycle');
    expect(certificationJob.indexOf('Validate exact signed handoff before candidate execution'))
      .toBeLessThan(certificationJob.indexOf('Certify Windows Solo installer lifecycle'));

    expect(attestationJob).toContain('needs: certify-windows');
    expect(attestationJob).toContain('if: github.event.repository.private == false');
    expect(attestationJob).toContain('runs-on: ubuntu-latest');
    expect(attestationJob).toContain('attestations: write');
    expect(attestationJob).toContain('id-token: write');
    expect(attestationJob).toContain('environment: production');
    expect(attestationJob).not.toContain('azure/login@');
    expect(attestationJob).not.toContain('certify-windows-installer.ps1');
    expect(attestationJob).not.toContain('Start-Process');
    expect(attestationJob).not.toContain('& $installer');

    expect(publicationJob).toContain('needs: [certify-windows, attest-windows]');
    expect(publicationJob).not.toContain('id-token: write');
    expect(publicationJob).not.toContain('azure/login@');
    expect(workflow).toContain('artifact-ids: ${{ needs.build-windows-prebuilt.outputs.artifact_id }}');
    expect(workflow).toContain('artifact-ids: ${{ needs.prepare-windows-signing.outputs.artifact_id }}');
    expect(workflow).toContain('artifact-ids: ${{ needs.sign-windows.outputs.artifact_id }}');
    expect(workflow).toContain('artifact-ids: ${{ needs.certify-windows.outputs.artifact_id }}');
    expect(workflow).not.toMatch(/^\s+[a-z_]*path:\s*\$\{\{\s*steps\.[^\n]+outputs\.[^\n]+\}\}/m);
  });

  it('confines OIDC to a minimal receipt-bound Windows signing job', () => {
    const workflow = parseYaml(
      fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf-8'),
    ) as {
      jobs?: Record<
        string,
        {
          needs?: unknown;
          permissions?: Record<string, string>;
          if?: unknown;
          environment?: unknown;
          outputs?: Record<string, string>;
          steps?: Array<{
            name?: string;
            uses?: string;
            id?: string;
            env?: Record<string, string>;
            with?: Record<string, unknown>;
            run?: string;
            if?: unknown;
            'continue-on-error'?: unknown;
          }>;
        }
      >;
    };
    const jobs = workflow.jobs ?? {};
    const preparationJob = jobs['prepare-windows-signing'];
    const signingJob = jobs['sign-windows'];

    expect(preparationJob).toBeDefined();
    expect(preparationJob?.needs).toBe('build-windows-prebuilt');
    expect(preparationJob?.permissions).toEqual({ contents: 'read' });
    expect(preparationJob).not.toHaveProperty('environment');
    expect(JSON.stringify(preparationJob)).not.toContain('id-token');
    expect(JSON.stringify(preparationJob)).not.toContain('azure/login@');
    expect(JSON.stringify(preparationJob)).not.toContain('contents":"write');
    expect(preparationJob?.outputs).toMatchObject({
      preparation_receipt_sha256: '${{ steps.stage-prepared.outputs.receipt_sha256 }}',
      preparation_size_bytes: '${{ steps.stage-prepared.outputs.size_bytes }}',
      artifact_id: '${{ steps.upload-prepared.outputs.artifact-id }}',
      artifact_digest: '${{ steps.upload-prepared.outputs.artifact-digest }}',
    });

    expect(signingJob?.needs).toEqual([
      'build-windows-prebuilt',
      'prepare-windows-signing',
    ]);
    expect(signingJob?.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
    expect(signingJob).not.toHaveProperty('environment');
    const signingSteps = signingJob?.steps ?? [];
    expect(signingSteps.map(({ name, uses }) => name ?? uses)).toEqual([
      'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
      'Validate exact hosted OIDC release boundary',
      'Validate initial signing revision on fresh origin main',
      'Download immutable prepared Windows signing handoff',
      'Verify and restore immutable prepared Windows signing handoff',
      'Refresh exact signing repository refs',
      'Revalidate exact signing revision against fresh origin main',
      'Authenticate Azure Artifact Signing with OIDC',
      'Package and sign from immutable prepared inputs',
      'Stage exact signed handoff',
      'Upload immutable signed Windows handoff',
    ]);
    expect(JSON.stringify(signingJob)).not.toMatch(
      /actions\/setup-node@|npm ci|Invoke-WebRequest|Invoke-RestMethod|Provision pinned|Resolve Windows release mode|Validate protected signer subject|Validate capacity before/,
    );
    for (const step of signingSteps) {
      expect(step).not.toHaveProperty('if');
      expect(step).not.toHaveProperty('continue-on-error');
    }
    const signingRunBodies = signingSteps.map(({ run }) => run ?? '').join('\n');
    expect(signingRunBodies).not.toMatch(
      /\b(?:curl(?:\.exe)?|wget(?:\.exe)?|Start-BitsTransfer|winget|choco|scoop|npm|npx|pnpm|yarn|pip|nuget)\b|\bgh\s+(?:api|release)\b|Invoke-(?:WebRequest|RestMethod)/i,
    );
    expect([...signingRunBodies.matchAll(/\bgit fetch\b/g)]).toHaveLength(0);

    const preparedDownload = signingSteps.find(
      ({ name }) => name === 'Download immutable prepared Windows signing handoff',
    );
    expect(preparedDownload).toMatchObject({
      uses: 'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
      with: {
        'artifact-ids': '${{ needs.prepare-windows-signing.outputs.artifact_id }}',
        path: '${{ runner.temp }}\\waggle-windows-signing-prepared',
        'merge-multiple': true,
      },
    });
    const preparedVerification = signingSteps.find(
      ({ name }) => name === 'Verify and restore immutable prepared Windows signing handoff',
    );
    expect(preparedVerification?.env).toMatchObject({
      EXPECTED_PREPARATION_RECEIPT_SHA256:
        '${{ needs.prepare-windows-signing.outputs.preparation_receipt_sha256 }}',
      EXPECTED_PREPARATION_ARTIFACT_ID:
        '${{ needs.prepare-windows-signing.outputs.artifact_id }}',
      EXPECTED_PREPARATION_ARTIFACT_DIGEST:
        '${{ needs.prepare-windows-signing.outputs.artifact_digest }}',
    });
    expect(preparedVerification?.run).toContain('Get-FileHash');
    expect(preparedVerification?.run).toContain('$env:EXPECTED_PREPARATION_RECEIPT_SHA256');
    expect(preparedVerification?.run).toContain('$env:EXPECTED_PREPARATION_ARTIFACT_ID');
    expect(preparedVerification?.run).toContain('$env:EXPECTED_PREPARATION_ARTIFACT_DIGEST');

    const preparationSteps = preparationJob?.steps ?? [];
    const preparedStage = preparationSteps.find(
      ({ name }) => name === 'Stage fully inventoried Windows signing preparation',
    );
    const assertPreparedHandoffContract = (stageSource: string, verifySource: string) => {
      for (const required of [
        'Assert-WagglePreparedTree $payloadRoot',
        'Windows signing preparation contains a non-allowlisted payload path',
        '[IO.FileAttributes]::ReparsePoint',
        'Get-Item -LiteralPath $item.FullName -Stream *',
      ]) {
        if (!stageSource.includes(required)) throw new Error(`missing preparation guard: ${required}`);
      }
      for (const required of [
        'Assert-WaggleTransportTree $preparedRoot',
        '$actualSizeBytes -ne [long]$env:EXPECTED_PREPARATION_SIZE_BYTES',
        'Get-FileHash -LiteralPath $receiptPath -Algorithm SHA256',
        "Assert-WaggleExactValue $receipt.build.artifactId",
        "Assert-WaggleExactValue $receipt.build.artifactDigest",
        "Assert-WaggleExactValue $receipt.release.mode",
        "Assert-WaggleExactValue $receipt.signerSubject",
        "Assert-WaggleExactValue $receipt.azure.clientId",
        '$actualPayloadInventory | ConvertTo-Json -Depth 32 -Compress',
        'Get-TrustedPath',
        '$destination.StartsWith($canonicalPrefix',
      ]) {
        if (!verifySource.includes(required)) throw new Error(`missing verification guard: ${required}`);
      }
    };
    const stageSource = preparedStage?.run ?? '';
    const verificationSource = preparedVerification?.run ?? '';
    expect(() => assertPreparedHandoffContract(stageSource, verificationSource)).not.toThrow();
    for (const marker of [
      'Assert-WagglePreparedTree $payloadRoot',
      'Windows signing preparation contains a non-allowlisted payload path',
      '[IO.FileAttributes]::ReparsePoint',
      'Get-Item -LiteralPath $item.FullName -Stream *',
    ]) {
      expect(() => assertPreparedHandoffContract(stageSource.split(marker).join(''), verificationSource))
        .toThrow();
    }
    for (const marker of [
      'Assert-WaggleTransportTree $preparedRoot',
      '$actualSizeBytes -ne [long]$env:EXPECTED_PREPARATION_SIZE_BYTES',
      'Get-FileHash -LiteralPath $receiptPath -Algorithm SHA256',
      'Assert-WaggleExactValue $receipt.build.artifactId',
      'Assert-WaggleExactValue $receipt.build.artifactDigest',
      'Assert-WaggleExactValue $receipt.release.mode',
      'Assert-WaggleExactValue $receipt.signerSubject',
      'Assert-WaggleExactValue $receipt.azure.clientId',
      '$actualPayloadInventory | ConvertTo-Json -Depth 32 -Compress',
      'Get-TrustedPath',
      '$destination.StartsWith($canonicalPrefix',
    ]) {
      expect(() => assertPreparedHandoffContract(stageSource, verificationSource.split(marker).join('')))
        .toThrow();
    }

    expect(signingJob?.outputs).toMatchObject({
      release_mode: '${{ needs.prepare-windows-signing.outputs.release_mode }}',
      bootstrap_identity: '${{ needs.prepare-windows-signing.outputs.bootstrap_identity }}',
      signer_subject: '${{ needs.prepare-windows-signing.outputs.signer_subject }}',
      candidate_sha256: '${{ steps.stage-signed.outputs.candidate_sha256 }}',
      handoff_receipt_sha256: '${{ steps.stage-signed.outputs.receipt_sha256 }}',
      artifact_id: '${{ steps.upload-signed.outputs.artifact-id }}',
      artifact_digest: '${{ steps.upload-signed.outputs.artifact-digest }}',
    });
    expect(jobs['certify-windows']?.needs).toBe('sign-windows');
    expect(jobs['attest-windows']?.needs).toBe('certify-windows');
    expect(jobs['attest-windows']?.if).toBe('github.event.repository.private == false');
    expect(jobs['attest-windows']?.environment).toBe('production');
    expect(jobs['publish-windows']?.needs).toEqual(['certify-windows', 'attest-windows']);
  });

  it('flattens every immutable artifact-ID download into its exact configured root', () => {
    const workflow = parseYaml(
      fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf-8'),
    ) as {
      jobs?: Record<
        string,
        {
          steps?: Array<{
            name?: string;
            uses?: string;
            with?: Record<string, unknown>;
          }>;
        }
      >;
    };
    const idDownloads = Object.entries(workflow.jobs ?? {}).flatMap(([jobName, job]) =>
      (job.steps ?? [])
        .filter(
          (step) =>
            step.uses?.startsWith('actions/download-artifact@') &&
            typeof step.with?.['artifact-ids'] === 'string',
        )
        .map((step) => ({
          jobName,
          name: step.name,
          artifactIds: step.with?.['artifact-ids'],
          path: step.with?.path,
          mergeMultiple: step.with?.['merge-multiple'],
        })),
    );

    expect(idDownloads).toEqual([
      {
        jobName: 'prepare-windows-signing',
        name: 'Download immutable prebuilt handoff for unsigned verification',
        artifactIds: '${{ needs.build-windows-prebuilt.outputs.artifact_id }}',
        path: '${{ runner.temp }}\\waggle-prebuilt-unsigned',
        mergeMultiple: true,
      },
      {
        jobName: 'prepare-windows-signing',
        name: 'Download immutable prebuilt handoff for signed packaging',
        artifactIds: '${{ needs.build-windows-prebuilt.outputs.artifact_id }}',
        path: '${{ runner.temp }}\\waggle-prebuilt-signing',
        mergeMultiple: true,
      },
      {
        jobName: 'sign-windows',
        name: 'Download immutable prepared Windows signing handoff',
        artifactIds: '${{ needs.prepare-windows-signing.outputs.artifact_id }}',
        path: '${{ runner.temp }}\\waggle-windows-signing-prepared',
        mergeMultiple: true,
      },
      {
        jobName: 'certify-windows',
        name: 'Download immutable signed Windows handoff',
        artifactIds: '${{ needs.sign-windows.outputs.artifact_id }}',
        path: '${{ runner.temp }}\\waggle-windows-signed',
        mergeMultiple: true,
      },
      {
        jobName: 'attest-windows',
        name: 'Download certified Windows release by immutable artifact ID',
        artifactIds: '${{ needs.certify-windows.outputs.artifact_id }}',
        path: '${{ runner.temp }}/waggle-windows-sealed',
        mergeMultiple: true,
      },
      {
        jobName: 'publish-windows',
        name: 'Download sealed Windows release outputs',
        artifactIds: '${{ needs.certify-windows.outputs.artifact_id }}',
        path: '${{ runner.temp }}\\waggle-windows-sealed',
        mergeMultiple: true,
      },
    ]);
  });

  it.runIf(process.platform === 'win32')(
    'normalizes lowercase upload-artifact digests before exact signed-handoff comparison',
    () => {
      const workflow = fs
        .readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf-8')
        .replace(/\r\n/g, '\n');
      const stepMarker = '      - name: Validate exact signed handoff before candidate execution\n';
      const stepStart = workflow.indexOf(stepMarker);
      const stepEnd = workflow.indexOf('\n      - name:', stepStart + stepMarker.length);
      const stepSource = workflow.slice(stepStart, stepEnd);
      const runMarker = '        run: |\n';
      const runStart = stepSource.indexOf(runMarker);
      expect(stepStart).toBeGreaterThanOrEqual(0);
      expect(stepEnd).toBeGreaterThan(stepStart);
      expect(runStart).toBeGreaterThanOrEqual(0);
      const stepScript = stepSource
        .slice(runStart + runMarker.length)
        .split('\n')
        .map((line) => line.replace(/^ {10}/, ''))
        .join('\n');
      const bindingStart = stepScript.indexOf('$receipt = Get-Content');
      const bindingEnd = stepScript.indexOf('. ./app/scripts/sign-windows-artifact.ps1');
      expect(bindingStart).toBeGreaterThanOrEqual(0);
      expect(bindingEnd).toBeGreaterThan(bindingStart);

      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-signed-binding-'));
      try {
        const receiptPath = path.join(root, 'signing-handoff-receipt.json');
        const sourceRevision = '1'.repeat(40);
        const candidateSha256 = 'A'.repeat(64);
        const buildReceiptSha256 = 'B'.repeat(64);
        const lowercaseBuildArtifactDigest = 'c1'.repeat(32);
        fs.writeFileSync(
          receiptPath,
          JSON.stringify({
            schemaVersion: 1,
            sourceRevision,
            candidateTag: 'v0.2.0',
            candidateVersion: '0.2.0',
            releaseMode: 'bootstrap',
            bootstrapIdentity: 'v0.2.0',
            upgradeBaseTag: '',
            upgradeBaseAssetName: '',
            upgradeBaseSha256: '',
            upgradeBaseCommit: '',
            signerSubject: 'CN=Waggle Test',
            candidateSha256,
            buildReceiptSha256,
            buildArtifactId: '123',
            buildArtifactDigest: lowercaseBuildArtifactDigest.toUpperCase(),
            timestampPolicy: 'fresh-certification-monotonic-v1',
          }),
          'utf-8',
        );
        const scriptPath = path.join(root, 'validate-binding.ps1');
        fs.writeFileSync(
          scriptPath,
          `$receiptPath = $env:WAGGLE_FIXTURE_RECEIPT\n${stepScript.slice(bindingStart, bindingEnd)}`,
          'utf-8',
        );
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', scriptPath],
          {
            cwd: ROOT,
            encoding: 'utf-8',
            windowsHide: true,
            env: {
              ...process.env,
              WAGGLE_FIXTURE_RECEIPT: receiptPath,
              GITHUB_SHA: sourceRevision,
              GITHUB_REF_NAME: 'v0.2.0',
              EXPECTED_CANDIDATE_VERSION: '0.2.0',
              EXPECTED_RELEASE_MODE: 'bootstrap',
              EXPECTED_BOOTSTRAP_IDENTITY: 'v0.2.0',
              EXPECTED_UPGRADE_BASE_TAG: '',
              EXPECTED_UPGRADE_BASE_ASSET_NAME: '',
              EXPECTED_UPGRADE_BASE_SHA256: '',
              EXPECTED_UPGRADE_BASE_COMMIT: '',
              EXPECTED_SIGNER_SUBJECT: 'CN=Waggle Test',
              EXPECTED_CANDIDATE_SHA256: candidateSha256,
              EXPECTED_BUILD_RECEIPT_SHA256: buildReceiptSha256,
              EXPECTED_BUILD_ARTIFACT_ID: '123',
              EXPECTED_BUILD_ARTIFACT_DIGEST: lowercaseBuildArtifactDigest,
            },
          },
        );
        expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it.runIf(process.platform === 'win32')(
    'executes exact publication staging for bootstrap and upgrade and rejects tampering',
    () => {
      const workflow = fs
        .readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf-8')
        .replace(/\r\n/g, '\n');
      const stepMarker = '      - name: Stage exact publication inputs\n';
      const stepStart = workflow.indexOf(stepMarker);
      const stepEnd = workflow.indexOf('\n      - name:', stepStart + stepMarker.length);
      const stepSource = workflow.slice(stepStart, stepEnd);
      const runMarker = '        run: |\n';
      const runStart = stepSource.indexOf(runMarker);
      expect(stepStart).toBeGreaterThanOrEqual(0);
      expect(stepEnd).toBeGreaterThan(stepStart);
      expect(runStart).toBeGreaterThanOrEqual(0);
      const stageScript = stepSource
        .slice(runStart + runMarker.length)
        .split('\n')
        .map((line) => line.replace(/^ {10}/, ''))
        .join('\n');

      const sha256 = (value: string) => createHash('sha256').update(value).digest('hex').toUpperCase();
      const runFixture = (
        mode: 'bootstrap' | 'upgrade',
        mutation?: 'tampered-source' | 'unexpected-file',
      ) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), `waggle-publish-stage-${mode}-`));
        const runnerTemp = path.join(root, 'runner');
        const sealedRoot = path.join(runnerTemp, 'waggle-windows-sealed');
        const releaseRoot = path.join(sealedRoot, 'release');
        const sourceNsisRoot = path.join(sealedRoot, 'source', 'release-nsis');
        const sourceResourcesRoot = path.join(sealedRoot, 'source', 'resources');
        const provenanceRoot = path.join(sealedRoot, 'provenance');
        const repositoryRoot = path.join(root, 'repo');
        const outputPath = path.join(root, 'github-output.txt');
        const envPath = path.join(root, 'github-env.txt');
        const candidateVersion = mode === 'bootstrap' ? '0.2.0' : '0.3.0';
        const candidateSha = '1'.repeat(40);
        const installerName = `Waggle_${candidateVersion}_x64-setup.exe`;
        const installer = 'signed-installer';
        const nsis = 'signed-nsis';
        const service = 'signed-service';
        fs.mkdirSync(releaseRoot, { recursive: true });
        fs.mkdirSync(sourceNsisRoot, { recursive: true });
        fs.mkdirSync(sourceResourcesRoot, { recursive: true });
        fs.mkdirSync(provenanceRoot, { recursive: true });
        fs.mkdirSync(path.join(repositoryRoot, 'app', 'src-tauri', 'resources'), { recursive: true });
        fs.writeFileSync(path.join(releaseRoot, installerName), installer);
        fs.writeFileSync(path.join(sourceNsisRoot, 'installer.nsi'), nsis);
        fs.writeFileSync(path.join(sourceResourcesRoot, 'service.js'), service);
        fs.writeFileSync(path.join(provenanceRoot, 'provenance-receipt.json'), '{}');
        fs.writeFileSync(
          path.join(releaseRoot, 'windows-installer-certificate.json'),
          JSON.stringify({
            evidence: {
              generatedInstallerScriptSha256: sha256(nsis),
              sidecarBundleSha256: sha256(service),
            },
          }),
        );
        let baseName = '';
        let baseSha256 = '';
        if (mode === 'upgrade') {
          fs.writeFileSync(path.join(releaseRoot, 'windows-installer-upgrade-certificate.json'), '{}');
          const baselineRoot = path.join(sealedRoot, 'baseline');
          fs.mkdirSync(baselineRoot, { recursive: true });
          baseName = 'Waggle_0.2.0_x64-setup.exe';
          const baseline = 'baseline-installer';
          baseSha256 = sha256(baseline);
          fs.writeFileSync(path.join(baselineRoot, baseName), baseline);
        }
        if (mutation === 'tampered-source') {
          fs.appendFileSync(path.join(sourceResourcesRoot, 'service.js'), '-tampered');
        }
        const inventoryEntries = listFiles(sealedRoot)
          .map((file) => ({
            path: path.relative(sealedRoot, file).split(path.sep).join('\\'),
            size: fs.statSync(file).size,
            sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(),
          }))
          .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
        const bootstrapIdentity = mode === 'bootstrap' ? `v0.2.0@${candidateSha}` : '';
        const baseTag = mode === 'upgrade' ? 'v0.2.0' : '';
        const baseCommit = mode === 'upgrade' ? '2'.repeat(40) : '';
        const signerSubject = 'CN=EGZAKTA DOO BEOGRAD, O=EGZAKTA DOO BEOGRAD, L=Amsterdam, C=NL';
        const sealedReceipt = {
          schemaVersion: 1,
          sourceRevision: candidateSha,
          candidateTag: `v${candidateVersion}`,
          candidateVersion,
          releaseMode: mode,
          bootstrapIdentity,
          upgradeBaseTag: baseTag,
          upgradeBaseAssetName: baseName,
          upgradeBaseSha256: baseSha256,
          upgradeBaseCommit: baseCommit,
          signerSubject,
          candidateSha256: sha256(installer),
          signedHandoffReceiptSha256: 'A'.repeat(64),
          signedHandoffArtifactId: '123',
          signedHandoffArtifactDigest: 'B'.repeat(64),
          inventory: {
            entries: inventoryEntries,
            sha256: sha256(JSON.stringify(inventoryEntries)),
          },
        };
        const sealedReceiptPath = path.join(sealedRoot, 'sealed-release-receipt.json');
        fs.writeFileSync(sealedReceiptPath, JSON.stringify(sealedReceipt));
        if (mutation === 'unexpected-file') {
          fs.writeFileSync(path.join(sealedRoot, 'unexpected.txt'), 'unexpected');
        }
        const scriptPath = path.join(root, 'stage.ps1');
        fs.writeFileSync(scriptPath, stageScript);
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
          {
            cwd: repositoryRoot,
            encoding: 'utf-8',
            timeout: 30_000,
            windowsHide: true,
            env: {
              ...process.env,
              RUNNER_TEMP: runnerTemp,
              GITHUB_OUTPUT: outputPath,
              GITHUB_ENV: envPath,
              GITHUB_SHA: candidateSha,
              GITHUB_REF_NAME: `v${candidateVersion}`,
              WAGGLE_RELEASE_MODE: mode,
              EXPECTED_CANDIDATE_SHA256: sha256(installer),
              EXPECTED_CANDIDATE_VERSION: candidateVersion,
              EXPECTED_BOOTSTRAP_IDENTITY: bootstrapIdentity,
              EXPECTED_BASE_TAG: baseTag,
              EXPECTED_BASE_ASSET_NAME: baseName,
              EXPECTED_BASE_SHA256: baseSha256,
              EXPECTED_BASE_COMMIT: baseCommit,
              EXPECTED_SIGNER_SUBJECT: signerSubject,
              EXPECTED_SEALED_RECEIPT_SHA256: createHash('sha256')
                .update(fs.readFileSync(sealedReceiptPath))
                .digest('hex')
                .toUpperCase(),
              EXPECTED_SEALED_ARTIFACT_ID: '456',
              EXPECTED_SEALED_ARTIFACT_DIGEST: 'C'.repeat(64),
            },
          },
        );
        return { root, result, outputPath, envPath };
      };

      for (const mode of ['bootstrap', 'upgrade'] as const) {
        const positive = runFixture(mode);
        try {
          expect(positive.result.status, positive.result.stderr || positive.result.stdout).toBe(0);
          const statePath = fs.existsSync(positive.envPath) ? positive.envPath : positive.outputPath;
          const state = fs.readFileSync(statePath, 'utf-8');
          expect(state).toContain('WAGGLE_UPGRADE_BASE_INSTALLER_PATH=');
          if (mode === 'upgrade') expect(state).toContain('Waggle_0.2.0_x64-setup.exe');
        } finally {
          fs.rmSync(positive.root, { recursive: true, force: true });
        }

        const tampered = runFixture(mode, 'tampered-source');
        try {
          expect(tampered.result.status).not.toBe(0);
          expect(tampered.result.stderr).toContain(
            'Sealed publication source inputs differ from their certified hashes.',
          );
        } finally {
          fs.rmSync(tampered.root, { recursive: true, force: true });
        }

        const unexpected = runFixture(mode, 'unexpected-file');
        try {
          expect(unexpected.result.status).not.toBe(0);
          expect(unexpected.result.stderr).toContain(
            'Sealed publication artifact topology is not exact.',
          );
        } finally {
          fs.rmSync(unexpected.root, { recursive: true, force: true });
        }
      }
    },
    180_000,
  );

  it('release workflow binds one immutable prebuilt handoff and restores its exact NSIS closure', () => {
    const workflow = fs
      .readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf-8')
      .replace(/\r\n/g, '\n');
    const buildStart = workflow.indexOf('  build-windows-prebuilt:');
    const preparationStart = workflow.indexOf('\n  prepare-windows-signing:', buildStart);
    const signingStart = workflow.indexOf('\n  sign-windows:', preparationStart);
    const certificationStart = workflow.indexOf('\n  certify-windows:', signingStart);
    expect(buildStart).toBeGreaterThanOrEqual(0);
    expect(preparationStart).toBeGreaterThan(buildStart);
    expect(signingStart).toBeGreaterThan(preparationStart);
    expect(certificationStart).toBeGreaterThan(signingStart);
    const buildJob = workflow.slice(buildStart, preparationStart);
    const preparationJob = workflow.slice(preparationStart, signingStart);
    const signingJob = workflow.slice(signingStart, certificationStart);

    const buildIndex = buildJob.indexOf('Build full unsigned Tauri NSIS package');
    const handoffIndex = buildJob.indexOf('Issue immutable Windows signing handoff');
    const uploadIndex = buildJob.indexOf('Upload immutable Windows signing handoff');
    expect(buildIndex).toBeGreaterThanOrEqual(0);
    expect(handoffIndex).toBeGreaterThan(buildIndex);
    expect(uploadIndex).toBeGreaterThan(handoffIndex);
    expect(buildJob).toContain('./app/scripts/new-windows-signing-handoff.ps1');
    expect(buildJob).toContain(
      'build_receipt_sha256: ${{ steps.handoff.outputs.receipt_sha256 }}',
    );
    expect(buildJob).toContain('name: waggle-windows-prebuilt-${{ github.sha }}');
    expect(buildJob).toContain('include-hidden-files: true');

    expect([
      ...preparationJob.matchAll(/artifact-ids: \$\{\{ needs\.build-windows-prebuilt\.outputs\.artifact_id \}\}/g),
    ]).toHaveLength(2);
    expect(preparationJob).toContain('waggle-prebuilt-unsigned');
    expect(preparationJob).toContain('waggle-prebuilt-signing');
    expect(preparationJob).toContain(
      'EXPECTED_BUILD_RECEIPT_SHA256: ${{ needs.build-windows-prebuilt.outputs.build_receipt_sha256 }}',
    );
    expect(preparationJob).toContain('foreach ($path in @($unsignedReceipt, $signingReceipt))');
    expect(preparationJob).toContain('build-receipt.package.json');
    expect(preparationJob).toContain(
      "@($receipt.nsisInventory.entries).Count -ne 442",
    );
    expect(preparationJob).toContain(
      "1FC822D1A183552A80ADEA01B0BF456F462B90518256EF1FE9EDFA22D76CD85A",
    );
    expect(preparationJob).toContain("Join-Path $env:LOCALAPPDATA 'tauri\\NSIS'");
    expect(preparationJob).toContain(
      'Fresh protected signer runner unexpectedly already contains a Tauri NSIS closure.',
    );
    expect(preparationJob).toContain('[IO.Directory]::Move($temporaryNsisRoot, $installedNsisRoot)');
    expect(preparationJob).toContain(
      '($receipt.nsisInventory | ConvertTo-Json -Depth 8 -Compress)',
    );
    expect(preparationJob).toContain('Assert-WaggleCanonicalInventoryEntries $resourceEntries');
    expect(preparationJob).toContain(
      'Materialized canonical repository resources differ from the hosted build receipt.',
    );
    for (const argument of [
      "-UnsignedInputRoot '${{ steps.verify-prepared.outputs.unsigned_root }}'",
      "-SigningInputRoot '${{ steps.verify-prepared.outputs.signing_root }}'",
      "-BuildReceiptPath '${{ steps.verify-prepared.outputs.build_receipt_path }}'",
      '-BuildReceiptSha256 $env:EXPECTED_BUILD_RECEIPT_SHA256',
    ]) {
      expect(signingJob).toContain(argument);
    }
    expect(signingJob).not.toContain('node node_modules/@tauri-apps/cli/tauri.js build');
    expect(signingJob).not.toContain('node scripts/build-sidecar.mjs');
    expect(signingJob).not.toContain('node scripts/bundle-node.mjs');
  });

  it('protected signer uses only pinned explicit portable package tools', () => {
    const workflow = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'release.yml'),
      'utf-8',
    );
    const wrapper = fs.readFileSync(
      path.join(ROOT, 'app', 'scripts', 'sign-windows-artifact.ps1'),
      'utf-8',
    );
    const signingStart = workflow.indexOf('  sign-windows:');
    const preparationStart = workflow.indexOf('  prepare-windows-signing:');
    const certificationStart = workflow.indexOf('\n  certify-windows:', signingStart);
    const signingJob = workflow.slice(signingStart, certificationStart);
    const preparationJob = workflow.slice(preparationStart, signingStart);

    for (const expected of [
      'https://nodejs.org/dist/v22.22.2/node-v22.22.2-win-x64.zip',
      '7C93E9D92BF68C07182B471AA187E35EE6CD08EF0F24AB060DFFF605FCC1C57C',
      'https://github.com/git-for-windows/git/releases/download/v2.51.0.windows.1/MinGit-2.51.0-64-bit.zip',
      'C2C955A21FA99889D83F485F24FA5D9A38FFFC2D509D4022385510E11C26B250',
      'https://www.7-zip.org/a/7z2501-x64.exe',
      '78AFA2A1C773CAF3CF7EDF62F857D2A8A5DA55FB0FFF5DA416074C0D28B2B55F',
      'AE1A50511BE58E987483FDBC12125407443926D2D394669ADE2352776E920DD3',
      '34A408843194BE320D8A87A3C12CD5C7D2E08D03B24567A41DB32E21D12569D2',
      '4CD7D776C686427226A151789D2D61F0B2ED2C392148CC4E69C0238362FAFECF',
      '5BD20FB38499D95C39594F41D4781B6181B3304B7F1F4D06B0182F514E7EAA74',
      'CN=OpenJS Foundation, O=OpenJS Foundation, L=San Francisco, S=California, C=US',
      'CN=Johannes Schindelin, O=Johannes Schindelin, S=Nordrhein-Westfalen, C=DE',
      'linked file or alternate data stream',
      '@($toolchainInventory.entries).Count -ne 2495',
      'D64F897D4E1A7F07FE9BA62D6AF062EF9F0E41C595CDAF2F3C4F73991BBEA0F5',
      'portable-toolchain-receipt.json',
      'inventory = $toolchainInventory',
      'receipt_path=$receiptPath',
      'receipt_sha256=$receiptSha256',
    ]) {
      expect(preparationJob).toContain(expected);
    }
    for (const argument of [
      "-PortableToolchainRoot '${{ steps.verify-prepared.outputs.portable_root }}'",
      "-PortableToolchainReceiptPath '${{ steps.verify-prepared.outputs.portable_receipt_path }}'",
      "-PortableToolchainReceiptSha256 '${{ steps.verify-prepared.outputs.portable_receipt_sha256 }}'",
      "-PortableNodePath '${{ steps.verify-prepared.outputs.portable_node }}'",
      "-PortableGitPath '${{ steps.verify-prepared.outputs.portable_git }}'",
      "-PortableSevenZipPath '${{ steps.verify-prepared.outputs.portable_sevenzip }}'",
    ]) {
      expect(signingJob).toContain(argument);
    }
    expect(signingJob).toContain(
      "& 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'",
    );
    for (const parameter of [
      'PortableToolchainRoot',
      'PortableNodePath',
      'PortableGitPath',
      'PortableSevenZipPath',
    ]) {
      expect(wrapper).toContain(`[string]$${parameter}`);
    }
    expect(wrapper).toContain('function Get-WagglePortableToolchain');
    expect(wrapper).toContain(
      "$DotNetPublisher = 'CN=.NET, O=Microsoft Corporation, L=Redmond, S=Washington, C=US'",
    );
  });

  it('sealed Windows publication reconstructs certified NSIS and sidecar source evidence', () => {
    const workflow = fs
      .readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf-8')
      .replace(/\r\n/g, '\n');
    const certificationStart = workflow.indexOf('  certify-windows:');
    const attestationStart = workflow.indexOf('\n  attest-windows:', certificationStart);
    const publicationStart = workflow.indexOf('\n  publish-windows:', attestationStart);
    const macStart = workflow.indexOf('\n  build-macos:', publicationStart);
    const certificationJob = workflow.slice(certificationStart, attestationStart);
    const attestationJob = workflow.slice(attestationStart, publicationStart);
    const publicationJob = workflow.slice(publicationStart, macStart);

    const certifyIndex = certificationJob.indexOf('Certify Windows Solo installer lifecycle');
    const sealIndex = certificationJob.indexOf('Stage sealed Windows release outputs');
    const uploadIndex = certificationJob.indexOf('Upload sealed Windows release outputs');
    const attestIndex = attestationJob.indexOf('Attest bootstrap Windows artifacts');
    expect(certifyIndex).toBeGreaterThanOrEqual(0);
    expect(sealIndex).toBeGreaterThan(certifyIndex);
    expect(uploadIndex).toBeGreaterThan(sealIndex);
    expect(attestIndex).toBeGreaterThanOrEqual(0);
    expect(certificationJob).toContain("Join-Path $sealedRoot 'source\\release-nsis'");
    expect(certificationJob).toContain("Get-Item -LiteralPath 'app/src-tauri/resources/service.js'");
    expect(certificationJob).toContain('evidence.generatedInstallerScriptSha256');
    expect(certificationJob).toContain('evidence.sidecarBundleSha256');
    expect(attestationJob).toContain('waggle-windows-sealed/source/release-nsis/installer.nsi');
    expect(attestationJob).toContain('waggle-windows-sealed/source/resources/service.js');
    expect(certificationJob).toContain("Join-Path $sealedRoot 'provenance'");

    const stageIndex = publicationJob.indexOf('Stage exact publication inputs');
    const publishIndex = publicationJob.indexOf('Publish certified Windows release');
    expect(stageIndex).toBeGreaterThanOrEqual(0);
    expect(publishIndex).toBeGreaterThan(stageIndex);
    expect(publicationJob).toContain(
      "'app/src-tauri/target/x86_64-pc-windows-msvc/release'",
    );
    expect(publicationJob).toContain("Join-Path $targetReleaseRoot 'bundle\\nsis'");
    expect(publicationJob).toContain("Join-Path $targetReleaseRoot 'nsis'");
    expect(publicationJob).toContain("'app/src-tauri/resources/service.js'");
    expect(publicationJob).toContain(
      'Publication bundle contains an unexpected asset; provenance must remain separate.',
    );
    expect(publicationJob).not.toContain('npm ci');
    expect(publicationJob).not.toContain('cargo ');
    expect(publicationJob).not.toContain('@tauri-apps/cli/tauri.js');

    const publisher = fs.readFileSync(
      path.join(ROOT, 'scripts', 'publish-windows-release.ps1'),
      'utf-8',
    );
    expect(publisher).toContain(
      'Assert-ReceiptSourceHashes $receiptDataSet $installer $sourceRevision',
    );
    expect(publisher).toContain("Join-Path $releaseDirectory 'nsis'");
    expect(publisher).toContain("$currentSidecarPath = 'app/src-tauri/resources/service.js'");
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
    'release signer identity accepts exact subjects or legacy thumbprints, never both',
    () => {
      const publisher = fs
        .readFileSync(path.join(ROOT, 'scripts', 'publish-windows-release.ps1'), 'utf-8')
        .replace(/\r\n/g, '\n');
      const helperStart = publisher.indexOf('function Get-ProtectedSignerIdentity {');
      const helperEnd = publisher.indexOf(
        '\nfunction Assert-PassingWindowsCertificateReceipt {',
        helperStart,
      );
      expect(helperStart).toBeGreaterThanOrEqual(0);
      expect(helperEnd).toBeGreaterThan(helperStart);

      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-signer-identity-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const fixtureSource = String.raw`
function Expect-Rejection {
  param([scriptblock]$Action, [string]$Label)
  $rejected = $false
  try { & $Action } catch { $rejected = $true }
  if (-not $rejected) { throw "$Label was accepted" }
}

$subject = 'CN=Managed Identity, O=Fixture Corp, C=NL'
$thumbprint = '0123456789abcdef0123456789abcdef01234567'
$artifactPath = Join-Path $PSScriptRoot 'fixture.exe'
[System.IO.File]::WriteAllText($artifactPath, 'fixture')
$artifact = Get-Item -LiteralPath $artifactPath
$script:fakeSignature = [pscustomobject]@{
  Status = 'Valid'
  SignatureType = 'Authenticode'
  SignerCertificate = [pscustomobject]@{
    Subject = $subject
    Thumbprint = $thumbprint
  }
  TimeStamperCertificate = [pscustomobject]@{ Subject = 'CN=Timestamp Fixture' }
}
function Get-AuthenticodeSignature { return $script:fakeSignature }

Remove-Item Env:WINDOWS_CODESIGN_APPROVED_SUBJECT -ErrorAction SilentlyContinue
Remove-Item Env:WINDOWS_CODESIGN_APPROVED_THUMBPRINT -ErrorAction SilentlyContinue
Expect-Rejection { Get-ProtectedSignerIdentity } 'missing identity'
$env:WINDOWS_CODESIGN_APPROVED_SUBJECT = $subject
$env:WINDOWS_CODESIGN_APPROVED_THUMBPRINT = $thumbprint
Expect-Rejection { Get-ProtectedSignerIdentity } 'ambiguous identity'

Remove-Item Env:WINDOWS_CODESIGN_APPROVED_THUMBPRINT
$subjectBinding = Get-ProtectedSignerIdentity
if ($subjectBinding.mode -cne 'subject' -or $subjectBinding.subject -cne $subject) {
  throw 'Exact subject binding was not preserved'
}
$actualSubjectIdentity = Assert-ExpectedAuthenticodeSignature $artifact $subjectBinding

Remove-Item Env:WINDOWS_CODESIGN_APPROVED_SUBJECT
$env:WINDOWS_CODESIGN_APPROVED_THUMBPRINT = '01 23 45 67 89 ab cd ef 01 23 45 67 89 ab cd ef 01 23 45 67'
$thumbprintBinding = Get-ProtectedSignerIdentity
if ($thumbprintBinding.mode -cne 'thumbprint' -or
    $thumbprintBinding.thumbprint -cne $thumbprint.ToUpperInvariant()) {
  throw 'Legacy thumbprint binding was not normalized'
}
$actualThumbprintIdentity = Assert-ExpectedAuthenticodeSignature $artifact $thumbprintBinding

$receiptArtifact = [pscustomobject]@{
  signerSubject = $subject
  signerThumbprint = $thumbprint
}
Assert-ReceiptSignerIdentity $receiptArtifact $actualSubjectIdentity 'valid receipt'
$receiptArtifact.signerSubject = $subject.ToLowerInvariant()
Expect-Rejection {
  Assert-ReceiptSignerIdentity $receiptArtifact $actualSubjectIdentity 'wrong-case subject'
} 'wrong-case subject receipt'
$receiptArtifact.signerSubject = $subject
$receiptArtifact.signerThumbprint = 'ffffffffffffffffffffffffffffffffffffffff'
Expect-Rejection {
  Assert-ReceiptSignerIdentity $receiptArtifact $actualThumbprintIdentity 'wrong thumbprint'
} 'wrong thumbprint receipt'

$script:fakeSignature.SignatureType = 'Catalog'
Expect-Rejection {
  Assert-ExpectedAuthenticodeSignature $artifact $subjectBinding
} 'non-embedded signature'
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
          throw new Error(`Signer identity probe failed: ${result.stderr || result.stdout}`);
        }
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
  );

  it.runIf(process.platform === 'win32')(
    'release identity receipts remain rotation-safe without weakening legacy pinning',
    () => {
      const publisher = fs
        .readFileSync(path.join(ROOT, 'scripts', 'publish-windows-release.ps1'), 'utf-8')
        .replace(/\r\n/g, '\n');
      const helperStart = publisher.indexOf('function Get-ProtectedSignerIdentity {');
      const helperEnd = publisher.indexOf(
        '\nfunction Assert-PassingWindowsCertificateReceipt {',
        helperStart,
      );
      expect(helperStart).toBeGreaterThanOrEqual(0);
      expect(helperEnd).toBeGreaterThan(helperStart);

      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-signer-rotation-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const fixtureSource = String.raw`
function Expect-Rejection {
  param([scriptblock]$Action, [string]$Label)
  $rejected = $false
  try { & $Action } catch { $rejected = $true }
  if (-not $rejected) { throw "$Label was accepted" }
}

$subject = 'CN=Managed Identity, O=Fixture Corp, C=NL'
$previousThumbprint = '1111111111111111111111111111111111111111'
$candidateThumbprint = '2222222222222222222222222222222222222222'
$previousPath = Join-Path $PSScriptRoot 'previous.exe'
$candidatePath = Join-Path $PSScriptRoot 'candidate.exe'
[System.IO.File]::WriteAllText($previousPath, 'previous')
[System.IO.File]::WriteAllText($candidatePath, 'candidate')
$previousArtifact = Get-Item -LiteralPath $previousPath
$candidateArtifact = Get-Item -LiteralPath $candidatePath
$script:signatureByName = @{
  'previous.exe' = [pscustomobject]@{
    Status = 'Valid'
    SignatureType = 'Authenticode'
    SignerCertificate = [pscustomobject]@{
      Subject = $subject
      Thumbprint = $previousThumbprint
    }
    TimeStamperCertificate = [pscustomobject]@{ Subject = 'CN=Timestamp Fixture' }
  }
  'candidate.exe' = [pscustomobject]@{
    Status = 'Valid'
    SignatureType = 'Authenticode'
    SignerCertificate = [pscustomobject]@{
      Subject = $subject
      Thumbprint = $candidateThumbprint
    }
    TimeStamperCertificate = [pscustomobject]@{ Subject = 'CN=Timestamp Fixture' }
  }
}
function Get-AuthenticodeSignature {
  param([string]$FilePath)
  return $script:signatureByName[(Split-Path -Leaf $FilePath)]
}

$env:WINDOWS_CODESIGN_APPROVED_SUBJECT = $subject
Remove-Item Env:WINDOWS_CODESIGN_APPROVED_THUMBPRINT -ErrorAction SilentlyContinue
$subjectBinding = Get-ProtectedSignerIdentity
$previousIdentity = Assert-ExpectedAuthenticodeSignature $previousArtifact $subjectBinding
$candidateIdentity = Assert-ExpectedAuthenticodeSignature $candidateArtifact $subjectBinding
if ($previousIdentity.thumbprint -ceq $candidateIdentity.thumbprint) {
  throw 'Rotation fixture did not produce distinct certificate thumbprints'
}

$previousReceiptIdentity = [pscustomobject]@{
  signerSubject = $subject
  signerThumbprint = $previousThumbprint
}
$candidateReceiptIdentity = [pscustomobject]@{
  signerSubject = $subject
  signerThumbprint = $candidateThumbprint
}
$lifecycleReceipt = [pscustomobject]@{
  previousInstaller = $previousReceiptIdentity
  previousInstalledApp = $previousReceiptIdentity
  installer = $candidateReceiptIdentity
  installedApp = $candidateReceiptIdentity
}
Assert-LifecycleReceiptSignerIdentities $lifecycleReceipt $previousIdentity $candidateIdentity
$swappedLifecycleReceipt = [pscustomobject]@{
  previousInstaller = $candidateReceiptIdentity
  previousInstalledApp = $candidateReceiptIdentity
  installer = $previousReceiptIdentity
  installedApp = $previousReceiptIdentity
}
Expect-Rejection {
  Assert-LifecycleReceiptSignerIdentities $swappedLifecycleReceipt $previousIdentity $candidateIdentity
} 'swapped lifecycle receipt mappings'

Remove-Item Env:WINDOWS_CODESIGN_APPROVED_SUBJECT
$env:WINDOWS_CODESIGN_APPROVED_THUMBPRINT = $previousThumbprint
$legacyBinding = Get-ProtectedSignerIdentity
$null = Assert-ExpectedAuthenticodeSignature $previousArtifact $legacyBinding
Expect-Rejection {
  Assert-ExpectedAuthenticodeSignature $candidateArtifact $legacyBinding
} 'legacy fixed-thumbprint rotation'
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
          throw new Error(`Signer rotation probe failed: ${result.stderr || result.stdout}`);
        }
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
  );

  it.runIf(process.platform === 'win32')(
    'installer certifier applies the chosen signer identity to Authenticode evidence',
    () => {
      const certifier = fs
        .readFileSync(path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'), 'utf-8')
        .replace(/\r\n/g, '\n');
      const helperStart = certifier.indexOf('function Assert-True {');
      const helperEnd = certifier.indexOf(
        '\nfunction ConvertTo-StrictSemanticVersion {',
        helperStart,
      );
      const environmentHelperStart = certifier.indexOf(
        'function Remove-CertificationControlEnvironment {',
      );
      const environmentHelperEnd = certifier.indexOf(
        '\nfunction Invoke-RawProcess {',
        environmentHelperStart,
      );
      expect(helperStart).toBeGreaterThanOrEqual(0);
      expect(helperEnd).toBeGreaterThan(helperStart);
      expect(environmentHelperStart).toBeGreaterThanOrEqual(0);
      expect(environmentHelperEnd).toBeGreaterThan(environmentHelperStart);

      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-certifier-signer-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const fixtureSource = String.raw`
function Expect-Rejection {
  param([scriptblock]$Action, [string]$Label)
  $rejected = $false
  try { & $Action } catch { $rejected = $true }
  if (-not $rejected) { throw "$Label was accepted" }
}

$subject = 'CN=Managed Identity, O=Fixture Corp, C=NL'
$thumbprint = '0123456789abcdef0123456789abcdef01234567'
$signature = [pscustomobject]@{
  Status = [System.Management.Automation.SignatureStatus]::Valid
  SignatureType = 'Authenticode'
  SignerCertificate = [pscustomobject]@{
    Subject = $subject
    Thumbprint = $thumbprint
  }
  TimeStamperCertificate = [pscustomobject]@{ Subject = 'CN=Timestamp Fixture' }
}

Assert-ExpectedAuthenticodeSignature $signature '' $subject 'subject fixture'
Assert-ExpectedAuthenticodeSignature $signature $thumbprint '' 'thumbprint fixture'
$rotatedThumbprint = 'fedcba9876543210fedcba9876543210fedcba98'
$previousReceiptIdentity = [pscustomobject]@{
  signerSubject = $subject
  signerThumbprint = $thumbprint
}
$candidateReceiptIdentity = [pscustomobject]@{
  signerSubject = $subject
  signerThumbprint = $rotatedThumbprint
}
$lifecycleReceipt = [pscustomobject]@{
  previousInstaller = $previousReceiptIdentity
  previousInstalledApp = $previousReceiptIdentity
  installer = $candidateReceiptIdentity
  installedApp = $candidateReceiptIdentity
}
Assert-LifecycleReceiptApprovedSigner $lifecycleReceipt '' $subject
Expect-Rejection {
  Assert-LifecycleReceiptApprovedSigner $lifecycleReceipt $thumbprint ''
} 'legacy certifier rotated candidate'
$processInfo = [System.Diagnostics.ProcessStartInfo]::new()
$protectedIdentityNames = @(
  'WINDOWS_CODESIGN_APPROVED_SUBJECT',
  'WINDOWS_CODESIGN_APPROVED_THUMBPRINT',
  'WAGGLE_APPROVED_CODESIGN_SUBJECT',
  'WAGGLE_APPROVED_CODESIGN_THUMBPRINT',
  'WAGGLE_CODESIGN_SUBJECT',
  'WAGGLE_CODESIGN_THUMBPRINT'
)
foreach ($name in $protectedIdentityNames) {
  $processInfo.Environment[$name] = 'must-not-reach-installed-process'
}
$processInfo.Environment['WAGGLE_NON_CONTROL_FIXTURE'] = 'preserve'
Remove-CertificationControlEnvironment $processInfo
foreach ($name in $protectedIdentityNames) {
  if ($processInfo.Environment.ContainsKey($name)) {
    throw "Protected signer identity environment escaped certification: $name"
  }
}
if ($processInfo.Environment['WAGGLE_NON_CONTROL_FIXTURE'] -cne 'preserve') {
  throw 'Unrelated application environment was removed'
}
Expect-Rejection {
  Assert-ExpectedAuthenticodeSignature $signature '' '' 'missing binding'
} 'missing signer binding'
Expect-Rejection {
  Assert-ExpectedAuthenticodeSignature $signature $thumbprint $subject 'ambiguous binding'
} 'ambiguous signer binding'
Expect-Rejection {
  Assert-ExpectedAuthenticodeSignature $signature '' $subject.ToLowerInvariant() 'wrong subject'
} 'wrong-case signer subject'
$signature.SignatureType = 'Catalog'
Expect-Rejection {
  Assert-ExpectedAuthenticodeSignature $signature '' $subject 'catalog signature'
} 'non-embedded signature'
`;

      try {
        fs.writeFileSync(
          probePath,
          `${certifier.slice(helperStart, helperEnd)}\n${certifier.slice(environmentHelperStart, environmentHelperEnd)}\n${fixtureSource}`,
          'utf-8',
        );
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        if (result.status !== 0) {
          throw new Error(`Certifier signer identity probe failed: ${result.stderr || result.stdout}`);
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
      {
        name: 'release.yml',
        windowsJob: '  build-windows-prebuilt:',
        nextJob: '  sign-windows:',
      },
      {
        name: 'tauri-build-pr.yml',
        windowsJob: '  verify-windows:',
        nextJob: '  verify-macos:',
      },
    ];

    for (const { name, windowsJob, nextJob } of workflows) {
      const workflow = fs.readFileSync(
        path.join(ROOT, '.github', 'workflows', name),
        'utf-8',
      );
      const windowsStart = workflow.indexOf(windowsJob);
      const nextStart = workflow.indexOf(nextJob, windowsStart);
      expect(windowsStart).toBeGreaterThanOrEqual(0);
      expect(nextStart).toBeGreaterThan(windowsStart);

      const windowsSteps = workflow.slice(windowsStart, nextStart);
      const stageIndex = windowsSteps.indexOf('node scripts/stage-sidecar-deps.mjs');
      const lifecycleIndex = windowsSteps.indexOf('hook-packages-runtime.test.ts');
      expect(stageIndex).toBeGreaterThanOrEqual(0);
      expect(lifecycleIndex).toBeGreaterThan(stageIndex);
      expect(windowsSteps).toContain('WAGGLE_VERIFY_STAGED_HOOK_RUNTIME');
      expect(windowsSteps).toContain('runs staged Tauri hook lifecycles');
    }
  });

  it('PR Windows workflow certifies the locally built NSIS lifecycle before upload', () => {
    const workflow = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'tauri-build-pr.yml'),
      'utf-8',
    );
    const windowsStart = workflow.indexOf('  verify-windows:');
    const macStart = workflow.indexOf('\n  verify-macos:', windowsStart);
    expect(windowsStart).toBeGreaterThanOrEqual(0);
    expect(macStart).toBeGreaterThan(windowsStart);
    const windowsSteps = workflow.slice(windowsStart, macStart);
    const buildIndex = windowsSteps.indexOf('Build Tauri (Windows)');
    const certificateIndex = windowsSteps.indexOf('Certify Windows Solo installer lifecycle');
    const uploadIndex = windowsSteps.indexOf('Upload Windows artifacts');
    expect(buildIndex).toBeGreaterThanOrEqual(0);
    expect(certificateIndex).toBeGreaterThan(buildIndex);
    expect(uploadIndex).toBeGreaterThan(certificateIndex);
    expect(windowsSteps).toContain('--bundles nsis');
    expect(windowsSteps).toContain('npm ci --prefix app --ignore-scripts');
    expect(windowsSteps).toContain('node node_modules/@tauri-apps/cli/tauri.js build');
    expect(windowsSteps).toContain('-ExpectedSourceRevision $env:GITHUB_SHA');
    expect(windowsSteps).not.toContain('-RequireAuthenticodeSignature');
    expect(windowsSteps).not.toContain('-VerifyManagedModel');
    expect(windowsSteps).not.toContain('-RequireVersionToVersionUpgrade');
    expect(windowsSteps).not.toContain('-PreviousInstallerPath');
  });

  it('PR Windows workflow reports the exact worktree mutation boundary around Tauri', () => {
    const workflow = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'tauri-build-pr.yml'),
      'utf-8',
    );
    const parsedWorkflow = parseYaml(workflow) as {
      jobs?: Record<
        string,
        {
          steps?: Array<{
            name?: string;
            id?: string;
            if?: unknown;
            run?: string;
            'continue-on-error'?: unknown;
          }>;
        }
      >;
    };
    const windowsSteps = parsedWorkflow.jobs?.['verify-windows']?.steps ?? [];
    const namedStep = (name: string) => {
      const matches = windowsSteps.filter((step) => step.name === name);
      expect(matches).toHaveLength(1);
      return matches[0]!;
    };
    const preBuild = namedStep('Verify repository cleanliness before Tauri build');
    const build = namedStep('Build Tauri (Windows)');
    const postBuild = namedStep('Report repository changes after Tauri build');
    const certificate = namedStep('Certify Windows Solo installer lifecycle');

    expect(windowsSteps.indexOf(preBuild)).toBeLessThan(windowsSteps.indexOf(build));
    expect(windowsSteps.indexOf(build)).toBeLessThan(windowsSteps.indexOf(postBuild));
    expect(windowsSteps.indexOf(postBuild)).toBeLessThan(windowsSteps.indexOf(certificate));
    expect(build.id).toBe('tauri-build-windows');
    expect(postBuild.if).toBe(
      "${{ always() && steps.tauri-build-windows.outcome != 'skipped' }}",
    );

    for (const diagnosticStep of [preBuild, postBuild]) {
      const run = diagnosticStep.run ?? '';
      expect([
        ...run.matchAll(/git status --porcelain=v1 --untracked-files=all/g),
      ]).toHaveLength(1);
      expect(run).toContain('if ($LASTEXITCODE -ne 0)');
      expect(run).toContain('if ($sourceStatus.Count -ne 0)');
      expect(run).not.toMatch(/git\s+(?:reset|clean|checkout|restore|stash)\b/i);
      expect(run).not.toMatch(/\b(?:Remove-Item|Clear-Content|Set-Content)\b/i);
      expect(diagnosticStep['continue-on-error']).toBeUndefined();
    }

    const postBuildRun = postBuild.run ?? '';
    expect(postBuildRun).toContain(
      '$trackedPaths = @(& git diff --name-only --diff-filter=ACDMRTUXB)',
    );
    expect(postBuildRun).toContain('& git rev-parse "HEAD:$trackedPath"');
    expect(postBuildRun).toContain('& git rev-parse ":$trackedPath"');
    expect(postBuildRun).toContain('Get-FileHash -LiteralPath $trackedPath -Algorithm SHA256');
    expect(postBuildRun).toContain('& git diff --numstat -- $trackedPath');
    expect(postBuildRun).not.toContain('git diff --no-ext-diff');
    expect(postBuildRun).not.toContain('$diffLines');
    expect(postBuildRun.indexOf('$trackedPaths = @(')).toBeLessThan(
      postBuildRun.indexOf('throw "Windows Tauri build mutated repository worktree.'),
    );
  });

  it.runIf(process.platform === 'win32')(
    'installer certifier reports every dirty tracked and untracked path without mutation',
    () => {
      const certifier = fs
        .readFileSync(path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'), 'utf-8')
        .replace(/\r\n/g, '\n');
      const helperStart = certifier.indexOf('function Assert-CleanRepositoryWorktree {');
      const helperEnd = certifier.indexOf(
        '\nfunction Test-CertificateTimestamp {',
        helperStart,
      );
      expect(helperStart).toBeGreaterThanOrEqual(0);
      expect(helperEnd).toBeGreaterThan(helperStart);

      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-source-clean-'));
      const repositoryRoot = path.join(probeRoot, 'repository');
      const probePath = path.join(probeRoot, 'probe.ps1');
      const runGit = (args: string[]) => spawnSync('git', args, {
        cwd: repositoryRoot,
        encoding: 'utf-8',
        timeout: 30_000,
        windowsHide: true,
      });
      const status = () => runGit([
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
      ]);

      try {
        fs.mkdirSync(repositoryRoot, { recursive: true });
        expect(runGit(['init']).status).toBe(0);
        fs.writeFileSync(path.join(repositoryRoot, 'tracked.txt'), 'clean\n', 'utf-8');
        expect(runGit(['add', 'tracked.txt']).status).toBe(0);
        expect(runGit([
          '-c',
          'user.name=Waggle Fixture',
          '-c',
          'user.email=fixture@waggle.invalid',
          'commit',
          '-m',
          'fixture',
        ]).status).toBe(0);

        fs.writeFileSync(
          probePath,
          `${certifier.slice(helperStart, helperEnd)}\nAssert-CleanRepositoryWorktree -GitExecutable 'git' -RepositoryRoot $args[0]\n`,
          'utf-8',
        );
        const cleanResult = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath, repositoryRoot],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        expect(cleanResult.status, cleanResult.stderr || cleanResult.stdout).toBe(0);

        fs.writeFileSync(path.join(repositoryRoot, 'tracked.txt'), 'dirty\n', 'utf-8');
        fs.mkdirSync(path.join(repositoryRoot, 'nested'), { recursive: true });
        fs.writeFileSync(
          path.join(repositoryRoot, 'nested', 'untracked.txt'),
          'untracked\n',
          'utf-8',
        );
        const before = status();
        expect(before.status, before.stderr || before.stdout).toBe(0);
        const trackedBefore = fs.readFileSync(path.join(repositoryRoot, 'tracked.txt'));
        const untrackedBefore = fs.readFileSync(
          path.join(repositoryRoot, 'nested', 'untracked.txt'),
        );

        const dirtyResult = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath, repositoryRoot],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        const dirtyOutput = `${dirtyResult.stdout ?? ''}\n${dirtyResult.stderr ?? ''}`;
        expect(dirtyResult.status).not.toBe(0);
        expect(dirtyOutput).toContain(' M tracked.txt');
        expect(dirtyOutput).toContain('?? nested/untracked.txt');

        const after = status();
        expect(after.status, after.stderr || after.stdout).toBe(0);
        expect(after.stdout).toBe(before.stdout);
        expect(fs.readFileSync(path.join(repositoryRoot, 'tracked.txt'))).toEqual(
          trackedBefore,
        );
        expect(
          fs.readFileSync(path.join(repositoryRoot, 'nested', 'untracked.txt')),
        ).toEqual(untrackedBefore);
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
    60_000,
  );

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
    const jsonRequestHelper = script.slice(
      script.indexOf('function Invoke-JsonRequest {'),
      script.indexOf('\nfunction Invoke-JsonPostRequest {'),
    );
    expect(jsonRequestHelper).toContain(
      '[ValidateRange(1, 30)] [int]$TimeoutSeconds = 5',
    );
    expect(jsonRequestHelper).toContain('-TimeoutSec $TimeoutSeconds');

    const marketplaceProbeStart = script.indexOf(
      '$marketplace = Invoke-JsonRequest',
    );
    const marketplaceProbe = script.slice(
      marketplaceProbeStart,
      script.indexOf('$marketplacePackages =', marketplaceProbeStart),
    );
    expect(marketplaceProbe).toContain('-TimeoutSeconds 30');
    expect(script).toContain(
      '$baseUrl/api/marketplace/search?type=mcp&source=mcp_registry&limit=100',
    );
    expect(script).toContain('marketplaceResourceSha256');
    expect(script).toContain("$receipt.checks['marketplaceResource']");
    expect(script).toContain("$receipt.checks['marketplaceApi']");
    expect(script).toContain('Same-version repair did not restore resources/marketplace.db');
    expect(script).toContain('/v1/health/liveliness');
    expect(script).toContain(
      '$proxy = Invoke-BuiltInProxyLivenessProbe -Uri "$baseUrl/v1/health/liveliness"',
    );
    expect(script).toContain('/api/auth/session-token');
    expect(script).toContain('$BaseUrl/api/workspaces');
    expect(script).toContain('$BaseUrl/api/memory/frames?extract=false');
    expect(script).toContain('New-CertificateLifecycleData');
    expect(script).toContain('Assert-CertificateLifecycleData');
    expect(script).toContain('Get-CertificateDataManifest');
    expect(script).toContain('Assert-CertificateDataManifest');
    expect(script).toContain('Get-CertificateDataManifestDigest');
    expect(script).toContain('Get-CertificateRelativePath');
    expect(script).toContain('function Get-ExternalProfileRootSnapshot');
    expect(script).toContain('function Assert-ExternalProfileRootsUnchanged');
    expect(script).toContain('Get-ChildItem -LiteralPath $parentPath -Force');
    expect(script).toContain("Join-Path $env:USERPROFILE '.hive-mind'");
    expect(script).toContain("Join-Path $env:USERPROFILE '.ollama'");
    expect(script).toContain('ConvertTo-Json -InputObject @($manifest)');
    expect(script).toContain('$externalProfileRootsPreProven = $true');
    expect(script).toContain("$receipt.checks['externalProfileRootsUnchanged'] = $true");
    expect(script).toContain("$receipt['externalProfileIsolationError']");
    expect(script).toContain("$receipt.Contains('externalProfileIsolationError')");
    for (const cacheVariable of [
      'OLLAMA_MODELS',
      'HF_HOME',
      'HF_HUB_CACHE',
      'TRANSFORMERS_CACHE',
      'XDG_CACHE_HOME',
    ]) {
      expect(script).toContain(`'${cacheVariable}'`);
    }
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
    expect(script).toContain('ExpectedSignerSubject');
    expect(script).toContain('Exactly one expected signer identity binding is required');
    expect(script).toContain('function Assert-LifecycleReceiptApprovedSigner');
    expect([
      ...script.matchAll(/^\s+Assert-LifecycleReceiptApprovedSigner `$/gm),
    ]).toHaveLength(1);
    expect(script).toContain('[System.StringComparison]::Ordinal');
    expect(script).not.toContain(
      'CN=EGZAKTA DOO BEOGRAD, O=EGZAKTA DOO BEOGRAD, L=Amsterdam, C=NL',
    );
    expect(script).toContain('ExpectedSourceRevision');
    expect(script).toContain('function Get-SidecarProvenance');
    expect(script).toContain('Packaged resources/service.js does not match a clean sidecar rebuild.');
    expect(script).toContain("$receipt.checks['sidecarSourceProvenance']");
    expect(script).toContain('$receipt.evidence.sidecarBundleSha256');
    expect(script).toContain('$receipt.evidence.sidecarProvenanceSha256');
    expect(script).toContain('$receipt.evidence.sidecarSourceInputCount');
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
    expect(script).toContain("'WINDOWS_CODESIGN_APPROVED_SUBJECT'");
    expect(script).toContain("'WINDOWS_CODESIGN_APPROVED_THUMBPRINT'");
    expect(script).toContain("'WAGGLE_APPROVED_CODESIGN_SUBJECT'");
    expect(script).toContain("'WAGGLE_CODESIGN_SUBJECT'");
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
    expect(script).toContain('status --porcelain=v1 --untracked-files=all');
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
    'Windows installer external-profile proof detects created and changed roots',
    () => {
      const script = fs
        .readFileSync(
          path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'),
          'utf-8',
        )
        .replace(/\r\n/g, '\n');
      const helperStart = script.indexOf('function Assert-True {');
      const helperEnd = script.indexOf('\nfunction Get-HttpStatusCode {', helperStart);
      expect(helperStart).toBeGreaterThanOrEqual(0);
      expect(helperEnd).toBeGreaterThan(helperStart);

      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-profile-proof-'));
      const probePath = path.join(probeRoot, 'profile-proof.ps1');
      const escapedRoot = probeRoot.replace(/'/g, "''");
      const fixtureSource = `
$fixtureRoot = '${escapedRoot}'
$absentRoot = Join-Path $fixtureRoot 'absent-root'
$absentSnapshot = Get-ExternalProfileRootSnapshot -Name '.absent' -Path $absentRoot
if ($absentSnapshot.existedBefore) { throw 'Absent fixture was reported present' }
Set-Content -LiteralPath $absentRoot -Value 'unexpected file' -Encoding UTF8
$fileMutationRejected = $false
try { Assert-ExternalProfileRootsUnchanged @($absentSnapshot) } catch { $fileMutationRejected = $true }
if (-not $fileMutationRejected) { throw 'External file root was accepted as absent' }
Remove-Item -LiteralPath $absentRoot -Force
New-Item -ItemType Directory -Path $absentRoot | Out-Null
$absentMutationRejected = $false
try { Assert-ExternalProfileRootsUnchanged @($absentSnapshot) } catch { $absentMutationRejected = $true }
if (-not $absentMutationRejected) { throw 'Created external root was accepted' }
Remove-Item -LiteralPath $absentRoot -Recurse -Force

$junctionRoot = Join-Path $fixtureRoot 'dangling-junction'
$junctionSnapshot = Get-ExternalProfileRootSnapshot -Name '.junction' -Path $junctionRoot
$junctionTarget = Join-Path $fixtureRoot 'junction-target'
New-Item -ItemType Directory -Path $junctionTarget | Out-Null
New-Item -ItemType Junction -Path $junctionRoot -Target $junctionTarget | Out-Null
Remove-Item -LiteralPath $junctionTarget -Recurse -Force
$junctionMutationRejected = $false
try { Assert-ExternalProfileRootsUnchanged @($junctionSnapshot) } catch { $junctionMutationRejected = $true }
if (-not $junctionMutationRejected) { throw 'Dangling junction was accepted as absent' }
Remove-Item -LiteralPath $junctionRoot -Force

$emptyRoot = Join-Path $fixtureRoot 'empty-root'
New-Item -ItemType Directory -Path $emptyRoot | Out-Null
$emptySnapshot = Get-ExternalProfileRootSnapshot -Name '.empty' -Path $emptyRoot
if ([string]::IsNullOrWhiteSpace([string]$emptySnapshot.manifestSha256)) {
  throw 'Empty external root did not receive a stable manifest digest'
}
Assert-ExternalProfileRootsUnchanged @($emptySnapshot)

$presentRoot = Join-Path $fixtureRoot 'present-root'
New-Item -ItemType Directory -Path $presentRoot | Out-Null
Set-Content -LiteralPath (Join-Path $presentRoot 'sentinel.txt') -Value 'before' -Encoding UTF8
$presentSnapshot = Get-ExternalProfileRootSnapshot -Name '.present' -Path $presentRoot
Assert-ExternalProfileRootsUnchanged @($presentSnapshot)
Set-Content -LiteralPath (Join-Path $presentRoot 'sentinel.txt') -Value 'after' -Encoding UTF8
$contentMutationRejected = $false
try { Assert-ExternalProfileRootsUnchanged @($presentSnapshot) } catch { $contentMutationRejected = $true }
if (-not $contentMutationRejected) { throw 'Changed external root was accepted' }
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
            `Windows external-profile proof probe failed: ${result.stderr || result.stdout}`,
          );
        }
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
  );

  it.runIf(process.platform === 'win32')(
    'Windows installer timestamp validation survives JSON date coercion under non-US culture',
    () => {
      const script = fs
        .readFileSync(
          path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'),
          'utf-8',
        )
        .replace(/\r\n/g, '\n');
      const helperStart = script.indexOf('function Test-CertificateTimestamp {');
      const helperEnd = script.indexOf(
        '\nfunction Assert-ExpectedAuthenticodeSignature {',
        helperStart,
      );
      expect(helperStart).toBeGreaterThanOrEqual(0);
      expect(helperEnd).toBeGreaterThan(helperStart);
      expect(script).toContain('Test-CertificateTimestamp $frame.timestamp');
      expect(script).toContain('Test-CertificateTimestamp $workspace.created');
      expect(script).not.toContain('TryParse([string]$frame.timestamp');
      expect(script).not.toContain('TryParse([string]$workspace.created');

      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cert-time-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const fixtureSource = String.raw`
$culture = [Globalization.CultureInfo]::GetCultureInfo('sr-Latn-RS')
[Threading.Thread]::CurrentThread.CurrentCulture = $culture
[Threading.Thread]::CurrentThread.CurrentUICulture = $culture
$coercedTimestamp = [datetime]::Parse(
  '2026-07-31T23:24:03.123Z',
  [Globalization.CultureInfo]::InvariantCulture,
  [Globalization.DateTimeStyles]::RoundtripKind
)
$legacyParsed = [DateTimeOffset]::MinValue
if ([DateTimeOffset]::TryParse([string]$coercedTimestamp, [ref]$legacyParsed)) {
  throw 'Fixture no longer reproduces the culture-sensitive cast failure'
}
if (-not (Test-CertificateTimestamp $coercedTimestamp)) {
  throw 'A valid JSON-coerced DateTime was rejected'
}
if (-not (Test-CertificateTimestamp '2026-07-31T23:24:03.123Z')) {
  throw 'A valid ISO timestamp string was rejected'
}
foreach ($invalid in @($null, '', 'not-a-timestamp')) {
  if (Test-CertificateTimestamp $invalid) {
    throw 'An invalid timestamp was accepted'
  }
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
            `Windows installer timestamp probe failed: ${result.stderr || result.stdout}`,
          );
        }
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
  );

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
    expect(script).toContain("[string]$ReceiptDir = ''");
    expect(script).toContain("[string]$RunnerNode = ''");
    expect(script).toContain("'WAGGLE_E2E_HOST_IDS'");
    expect(script).toContain(
      "Set-ProcessEnvironment -Name 'WAGGLE_E2E_HOST_IDS' -Value $requestedHostIds",
    );
    expect(script).toContain('HostIds cannot contain empty values.');
    expect(script).toContain('$emptyHostIds.Count -gt 0');
    expect(script).toContain('HostIds cannot contain duplicate values:');
    expect(script).toContain("'--retries=0'");
    expect(script).toContain('$playwrightOutput = Join-Path $runRoot "playwright-$ReceiptName"');
    expect(script).toContain('& $script:runnerNodePath $script:playwrightCli @playwrightArgs');
    expect(script).toContain("'PLAYWRIGHT_JSON_OUTPUT_FILE'");
    expect(script).toContain("'--reporter=list,json'");
    expect(script).toContain('"$ReceiptName-report.json"');
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
    expect(toolSpec).toContain('every explicitly requested host must be installed and healthy');
    expect(toolSpec).toContain(
      "results.filter(result => result.status === 'unavailable').map(result => result.id)",
    );
    const strictToolAssertionIndex = toolSpec.indexOf(
      'every explicitly requested host must be installed and healthy',
    );
    const toolFinallyIndex = toolSpec.indexOf('} finally {', strictToolAssertionIndex);
    const toolReceiptIndex = toolSpec.indexOf(
      "testInfo.attach('windows-external-tool-route-summary'",
      toolFinallyIndex,
    );
    const receiptCleanupFinallyIndex = toolSpec.indexOf(
      '} finally {',
      toolReceiptIndex,
    );
    const toolKillIndex = toolSpec.indexOf(
      "request.post('/api/tools/kill'",
      receiptCleanupFinallyIndex,
    );
    expect(toolFinallyIndex).toBeGreaterThan(strictToolAssertionIndex);
    expect(toolReceiptIndex).toBeGreaterThan(toolFinallyIndex);
    expect(receiptCleanupFinallyIndex).toBeGreaterThan(toolReceiptIndex);
    expect(toolKillIndex).toBeGreaterThan(receiptCleanupFinallyIndex);

    for (const name of [
      'CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_ACCESS_TOKEN', 'GITHUB_TOKEN',
      'STRIPE_SECRET_KEY', 'DATABASE_URL', 'SSH_AUTH_SOCK', 'GIT_ASKPASS',
      'HTTPS_PROXY', 'AWS_SHARED_CREDENTIALS_FILE',
      'GOOGLE_APPLICATION_CREDENTIALS', 'KUBECONFIG', 'DOCKER_CONFIG',
      'NODE_OPTIONS', 'RENDER_API_KEY',
    ]) {
      expect(script, name).toContain(`'${name}'`);
      expect(toolSpec, name).toContain(`'${name}'`);
    }
    expect(script).toContain('$ambientSecretVariables');
    expect(script).toContain('$secretNamePattern');
    expect(script).toContain("$rawReceiptRoot = Join-Path $runRoot 'raw-receipts'");
    expect(script).toContain('Publish-SafeReceipt');
    expect(script).toContain('Expected reporter receipt was not created');
    expect(script).toContain("kind = 'playwright-summary'");
    expect(script).toContain("kind = 'vitest-summary'");
    expect(script).toContain('Unknown reporter receipt schema');
    expect(script).toContain('Reporter receipt did not prove an exact successful lane');
    expect(script).toContain('Reporter receipt did not bind the expected test specification');
    expect(script).toContain('Safe receipt identity mismatch');
    expect(script).toContain('Safe receipt host roster mismatch');
    expect(script).toContain('Safe receipt target already exists');
    expect(script).toContain('Receipt contains absolute host paths');
    expect(script).toContain('[Convert]::FromBase64String');
    expect(script).toContain('captured secret values found for environment variables');
    expect(script).toContain('function Resolve-ReceiptLayout');
    expect(script).toContain('StagingRoot = Join-Path $parent (');
    expect(script).toContain('$receiptLayout = Resolve-ReceiptLayout -RequestedReceiptDir $ReceiptDir');
    expect(script).toContain('$receiptStagingOwned = $false');
    expect(script).toContain('$receiptStagingOwned = $true');
    expect(script).toContain('Publish-ReceiptSet');
    expect(script).toContain('[IO.Directory]::Move($StagingRoot, $FinalRoot)');
    expect(script).not.toContain("Set-ProcessEnvironment -Name 'PLAYWRIGHT_JSON_OUTPUT_FILE' -Value $receiptPath");
    expect(script).toContain("'WAGGLE_E2E_REUSE_EXISTING_SERVER'");
    expect(script).toContain(
      "Set-ProcessEnvironment -Name 'WAGGLE_E2E_REUSE_EXISTING_SERVER' -Value '0'",
    );
    for (const name of [
      'USERPROFILE', 'HOME', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
      'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'HERMES_HOME', 'HERMES_PROFILE',
    ]) {
      expect(script).toContain(`'${name}'`);
    }
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
    expect(script).toContain('$authenticatedHermesLease = $null');
    expect(script).toContain('Refusing to overwrite an existing Hermes authenticated profile');
    expect(script).toContain('function New-OwnedHermesProfile');
    expect(script).toContain('function Remove-OwnedHermesProfile');
    expect(script).toContain('Hermes authenticated profile ownership verification failed');
    expect(script).toContain('$profileCreateExitCode = $LASTEXITCODE');
    expect(script).toContain('Complete-AuthenticatedIsolationCleanup `');
    expect(script).toContain('-HermesLease $authenticatedHermesLease `');
    expect(script).toContain('-SourceAuthEvidence $sourceAuthEvidence `');
    expect(script).toContain('ReceiptDir must be a fresh path owned by this run');
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

    const failureRestoreIndex = script.lastIndexOf(
      "foreach ($name in $environmentToRestore) { Restore-ProcessEnvironment -Name $name }",
    );
    const outerFinallyIndex = script.lastIndexOf('} finally {', failureRestoreIndex);
    expect(failureRestoreIndex).toBeGreaterThan(outerFinallyIndex);
    expect(failureRestoreIndex).toBeLessThan(
      script.indexOf('Remove-VerifiedTempTree -Target $runRoot', failureRestoreIndex),
    );
    expect(script.indexOf('Publish-ReceiptSet -StagingRoot $receiptStagingRoot')).toBeGreaterThan(
      script.indexOf('Remove-VerifiedTempTree -Target $runRoot', failureRestoreIndex),
    );
  });

  it.runIf(process.platform === 'win32')(
    'projects external-agent reporter output into strict path-free receipts',
    () => {
      const runner = fs.readFileSync(
        path.join(ROOT, 'scripts', 'test-windows-external-agents.ps1'),
        'utf-8',
      ).replace(/\r\n/g, '\n');
      const helperStart = runner.indexOf('function Assert-NoReparsePointInPath');
      const helperEnd = runner.indexOf('\nfunction Get-FreeLoopbackPort', helperStart);
      expect(helperStart).toBeGreaterThanOrEqual(0);
      expect(helperEnd).toBeGreaterThan(helperStart);
      const helperSource = runner.slice(helperStart, helperEnd);
      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-agent-receipt-probe-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const fixtureSource = String.raw`
$ErrorActionPreference = 'Stop'
$repoRoot = 'C:\Users\Tester\repo'
$runRoot = Join-Path $PSScriptRoot 'owned-run'
$rawReceiptRoot = Join-Path $runRoot 'raw-receipts'
$receiptRoot = Join-Path $PSScriptRoot 'published-receipts'
$receiptStagingRoot = Join-Path $PSScriptRoot '.published-receipts.staging-probe'
$null = New-Item -ItemType Directory -Path $rawReceiptRoot -Force
$null = New-Item -ItemType Directory -Path $receiptStagingRoot
$secretVariables = @('WAGGLE_PROBE_API_KEY')
$originalEnvironment = @{ WAGGLE_PROBE_API_KEY = 'probe-secret-value-6f34a0' }
$receiptHostIds = @('claude-code', 'codex', 'hermes')
$authenticatedHostIds = @('claude-code', 'codex', 'hermes')

function Assert-Probe([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}
function Write-ProbeJson([string]$Path, $Value) {
  [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
}
function Assert-RejectedReceipt(
  $Value,
  [string]$Label,
  [string]$ExpectedKind = 'playwright-summary',
  [string]$ExpectedSpec = 'tests/e2e/launcher-real-hook-lifecycle.spec.ts'
) {
  $token = [guid]::NewGuid().ToString('N')
  $rawPath = Join-Path $rawReceiptRoot "$token.raw.json"
  $safePath = Join-Path $receiptStagingRoot "$token-report.json"
  Write-ProbeJson $rawPath $Value
  $rejected = $false
  try {
    Publish-SafeReceipt -RawReceiptPath $rawPath -SafeReceiptPath $safePath -ExpectedKind $ExpectedKind -ExpectedSpec $ExpectedSpec -ReceiptLane $token -ExpectedHostIds $receiptHostIds
  } catch { $rejected = $true }
  Assert-Probe $rejected "$Label was accepted"
  Assert-Probe (-not (Test-Path -LiteralPath $rawPath)) "$Label raw receipt was retained"
  Assert-Probe (-not (Test-Path -LiteralPath $safePath)) "$Label safe receipt was published"
}
function New-PassingPlaywrightReceipt(
  [string]$Spec = 'tests/e2e/launcher-real-hook-lifecycle.spec.ts'
) {
  [pscustomobject]@{
    configFile = Join-Path $repoRoot 'playwright.config.ts'
    config = [pscustomobject]@{ rootDir = Join-Path $repoRoot 'tests' }
    stats = [pscustomobject]@{ expected = 1; unexpected = 0; flaky = 0; skipped = 0 }
    suites = @([pscustomobject]@{
      file = $Spec.Substring('tests/'.Length)
      attachments = @([pscustomobject]@{
        body = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('D:\private\tool.exe probe-secret-value-6f34a0'))
      })
    })
  }
}

$unownedSentinel = Join-Path $receiptStagingRoot 'unowned-sentinel.txt'
[IO.File]::WriteAllText($unownedSentinel, 'preserve-me', [Text.UTF8Encoding]::new($false))
Remove-VerifiedReceiptStaging $receiptStagingRoot $receiptRoot $false
Assert-Probe ([IO.File]::ReadAllText($unownedSentinel) -ceq 'preserve-me') 'Unowned staging collision was deleted'
Remove-Item -LiteralPath $unownedSentinel -Force

$playwrightRawPath = Join-Path $rawReceiptRoot 'hooks.raw.json'
$playwrightPath = Join-Path $receiptStagingRoot 'hooks-report.json'
Write-ProbeJson $playwrightRawPath (New-PassingPlaywrightReceipt)
Publish-SafeReceipt -RawReceiptPath $playwrightRawPath -SafeReceiptPath $playwrightPath -ExpectedKind 'playwright-summary' -ExpectedSpec 'tests/e2e/launcher-real-hook-lifecycle.spec.ts' -ReceiptLane 'hooks' -ExpectedHostIds $receiptHostIds
Assert-Probe (-not (Test-Path -LiteralPath $playwrightRawPath)) 'Playwright raw receipt survived projection'
$playwrightText = [IO.File]::ReadAllText($playwrightPath)
$playwright = $playwrightText | ConvertFrom-Json
Assert-Probe ($playwright.kind -ceq 'playwright-summary') 'Playwright projection kind mismatch'
Assert-Probe ($playwright.success -is [bool] -and $playwright.success) 'Playwright projection did not prove success'
Assert-Probe ($playwright.spec -ceq 'tests/e2e/launcher-real-hook-lifecycle.spec.ts') 'Playwright spec identity missing'
Assert-Probe (($playwright.hostIds -join ',') -ceq ($receiptHostIds -join ',')) 'Playwright host roster missing'
Assert-Probe (-not $playwrightText.Contains('C:\Users')) 'Direct host path survived projection'
Assert-Probe (-not $playwrightText.Contains('probe-secret-value-6f34a0')) 'Secret survived projection'
Assert-Probe (-not $playwrightText.Contains('body')) 'Base64 attachment survived projection'

$toolsRawPath = Join-Path $rawReceiptRoot 'tools.raw.json'
$toolsPath = Join-Path $receiptStagingRoot 'tools-report.json'
Write-ProbeJson $toolsRawPath (New-PassingPlaywrightReceipt 'tests/e2e/launcher-real-tool-lifecycle.spec.ts')
Publish-SafeReceipt -RawReceiptPath $toolsRawPath -SafeReceiptPath $toolsPath -ExpectedKind 'playwright-summary' -ExpectedSpec 'tests/e2e/launcher-real-tool-lifecycle.spec.ts' -ReceiptLane 'tools' -ExpectedHostIds $receiptHostIds

$vitestRawPath = Join-Path $rawReceiptRoot 'authenticated-tasks.raw.json'
$vitestPath = Join-Path $receiptStagingRoot 'authenticated-tasks-report.json'
$vitest = [pscustomobject]@{
  success = $true
  numTotalTestSuites = 2; numPassedTestSuites = 2; numFailedTestSuites = 0; numPendingTestSuites = 0
  numTotalTests = 1; numPassedTests = 1; numFailedTests = 0; numPendingTests = 0; numTodoTests = 0
  testResults = @([pscustomobject]@{ name = 'C:\Users\Tester\repo\tests\integration\external-agent-collaboration.live.test.ts' })
}
Write-ProbeJson $vitestRawPath $vitest
Publish-SafeReceipt -RawReceiptPath $vitestRawPath -SafeReceiptPath $vitestPath -ExpectedKind 'vitest-summary' -ExpectedSpec 'tests/integration/external-agent-collaboration.live.test.ts' -ReceiptLane 'authenticated-tasks' -ExpectedHostIds $authenticatedHostIds -HermesProvider 'openai-codex' -HermesModel 'gpt-5.5'
Assert-Probe (-not (Test-Path -LiteralPath $vitestRawPath)) 'Vitest raw receipt survived projection'
$vitestProjection = [IO.File]::ReadAllText($vitestPath) | ConvertFrom-Json
Assert-Probe ($vitestProjection.kind -ceq 'vitest-summary') 'Vitest projection kind mismatch'
Assert-Probe ($vitestProjection.passedTests -eq 1) 'Vitest exact pass count was not retained'
Assert-Probe ($vitestProjection.hermesProvider -ceq 'openai-codex') 'Vitest Hermes provider identity missing'
Assert-Probe ($vitestProjection.hermesModel -ceq 'gpt-5.5') 'Vitest Hermes model identity missing'
Remove-Item -LiteralPath $vitestPath -Force

Assert-RejectedReceipt (New-PassingPlaywrightReceipt 'tests/e2e/launcher-real-tool-lifecycle.spec.ts') 'Mismatched Playwright specification'
$spoofedPlaywright = New-PassingPlaywrightReceipt 'tests/e2e/launcher-real-tool-lifecycle.spec.ts'
$spoofedPlaywright.suites[0].attachments += [pscustomobject]@{
  note = 'tests/e2e/launcher-real-hook-lifecycle.spec.ts'
}
Assert-RejectedReceipt $spoofedPlaywright 'Spoofed Playwright specification'
Assert-RejectedReceipt (New-PassingPlaywrightReceipt) 'Mismatched reporter kind' 'vitest-summary' 'tests/e2e/launcher-real-hook-lifecycle.spec.ts'

$spoofedVitest = $vitest | ConvertTo-Json -Depth 10 | ConvertFrom-Json
$spoofedVitest.testResults[0].name = 'C:\Users\Tester\repo\tests\integration\unrelated.test.ts'
$spoofedVitest.testResults[0] | Add-Member -NotePropertyName note -NotePropertyValue 'tests/integration/external-agent-collaboration.live.test.ts'
Assert-RejectedReceipt $spoofedVitest 'Spoofed Vitest specification' 'vitest-summary' 'tests/integration/external-agent-collaboration.live.test.ts'

$extraResultVitest = $vitest | ConvertTo-Json -Depth 10 | ConvertFrom-Json
$extraResultVitest.testResults += [pscustomobject]@{
  name = 'C:\Users\Tester\repo\tests\integration\unrelated.test.ts'
}
Assert-RejectedReceipt $extraResultVitest 'Extra Vitest result file' 'vitest-summary' 'tests/integration/external-agent-collaboration.live.test.ts'

$skipped = New-PassingPlaywrightReceipt
$skipped.stats.expected = 0
$skipped.stats.skipped = 1
Assert-RejectedReceipt $skipped 'Skipped Playwright receipt'

$missingPlaywrightField = New-PassingPlaywrightReceipt
$missingPlaywrightField.stats.PSObject.Properties.Remove('flaky')
Assert-RejectedReceipt $missingPlaywrightField 'Omitted Playwright field'
$stringPlaywrightCounts = New-PassingPlaywrightReceipt
$stringPlaywrightCounts.stats.expected = '1'
$stringPlaywrightCounts.stats.unexpected = '0'
$stringPlaywrightCounts.stats.flaky = '0'
$stringPlaywrightCounts.stats.skipped = '0'
Assert-RejectedReceipt $stringPlaywrightCounts 'String Playwright counts'
$failedPlaywrightCast = New-PassingPlaywrightReceipt
$failedPlaywrightCast.stats.expected = 'not-a-number'
Assert-RejectedReceipt $failedPlaywrightCast 'Invalid Playwright count'

$stringVitestBoolean = $vitest | ConvertTo-Json -Depth 10 | ConvertFrom-Json
$stringVitestBoolean.success = 'false'
Assert-RejectedReceipt $stringVitestBoolean 'String Vitest boolean' 'vitest-summary' 'tests/integration/external-agent-collaboration.live.test.ts'
$stringVitestCount = $vitest | ConvertTo-Json -Depth 10 | ConvertFrom-Json
$stringVitestCount.numTotalTests = '1'
Assert-RejectedReceipt $stringVitestCount 'String Vitest count' 'vitest-summary' 'tests/integration/external-agent-collaboration.live.test.ts'
$missingVitestField = $vitest | ConvertTo-Json -Depth 10 | ConvertFrom-Json
$missingVitestField.PSObject.Properties.Remove('numTodoTests')
Assert-RejectedReceipt $missingVitestField 'Omitted Vitest field' 'vitest-summary' 'tests/integration/external-agent-collaboration.live.test.ts'

Assert-RejectedReceipt ([pscustomobject]@{ success = $true }) 'Malformed reporter schema'

$invalidJsonPath = Join-Path $rawReceiptRoot 'invalid-json-report.json'
$invalidSafePath = Join-Path $receiptStagingRoot 'invalid-json-report.json'
[IO.File]::WriteAllText($invalidJsonPath, '{', [Text.UTF8Encoding]::new($false))
$invalidJsonRejected = $false
try {
  Publish-SafeReceipt -RawReceiptPath $invalidJsonPath -SafeReceiptPath $invalidSafePath -ExpectedKind 'playwright-summary' -ExpectedSpec 'tests/e2e/launcher-real-hook-lifecycle.spec.ts' -ReceiptLane 'invalid-json' -ExpectedHostIds $receiptHostIds
} catch { $invalidJsonRejected = $true }
Assert-Probe $invalidJsonRejected 'Invalid reporter JSON was accepted'
Assert-Probe (-not (Test-Path -LiteralPath $invalidJsonPath)) 'Invalid raw JSON receipt was retained'
Assert-Probe (-not (Test-Path -LiteralPath $invalidSafePath)) 'Invalid JSON produced a safe receipt'

$collisionStage = Join-Path $PSScriptRoot '.published-receipts.staging-collision'
$null = New-Item -ItemType Directory -Path $collisionStage
$savedStagingRoot = $receiptStagingRoot
$receiptStagingRoot = $collisionStage
$collisionRawPath = Join-Path $rawReceiptRoot 'collision.raw.json'
$collisionSafePath = Join-Path $collisionStage 'collision-report.json'
Write-ProbeJson $collisionRawPath (New-PassingPlaywrightReceipt)
[IO.File]::WriteAllText($collisionSafePath, 'sentinel', [Text.UTF8Encoding]::new($false))
$writeRejected = $false
try {
  Publish-SafeReceipt -RawReceiptPath $collisionRawPath -SafeReceiptPath $collisionSafePath -ExpectedKind 'playwright-summary' -ExpectedSpec 'tests/e2e/launcher-real-hook-lifecycle.spec.ts' -ReceiptLane 'collision' -ExpectedHostIds $receiptHostIds
} catch { $writeRejected = $true }
Assert-Probe $writeRejected 'Projection write failure was accepted'
Assert-Probe (-not (Test-Path -LiteralPath $collisionRawPath)) 'Raw receipt survived projection collision'
Assert-Probe ([IO.File]::ReadAllText($collisionSafePath) -ceq 'sentinel') 'Existing safe receipt was overwritten'
$receiptStagingRoot = $savedStagingRoot
Remove-Item -LiteralPath $collisionStage -Recurse -Force

$missingStage = Join-Path $PSScriptRoot '.published-receipts.staging-missing'
$null = New-Item -ItemType Directory -Path $missingStage
Copy-Item -LiteralPath $playwrightPath -Destination (Join-Path $missingStage 'hooks-report.json')
$missingFinal = Join-Path $PSScriptRoot 'missing-final'
$missingRejected = $false
try { Publish-ReceiptSet $missingStage $missingFinal @('hooks-report.json', 'tools-report.json') } catch { $missingRejected = $true }
Assert-Probe $missingRejected 'Incomplete receipt set was published'
Assert-Probe (-not (Test-Path -LiteralPath $missingFinal)) 'Incomplete final receipt directory exists'

$extraStage = Join-Path $PSScriptRoot '.published-receipts.staging-extra'
$null = New-Item -ItemType Directory -Path $extraStage
Copy-Item -LiteralPath $playwrightPath -Destination (Join-Path $extraStage 'hooks-report.json')
Copy-Item -LiteralPath $toolsPath -Destination (Join-Path $extraStage 'tools-report.json')
Copy-Item -LiteralPath $toolsPath -Destination (Join-Path $extraStage 'unexpected-report.json')
$extraFinal = Join-Path $PSScriptRoot 'extra-final'
$extraRejected = $false
try { Publish-ReceiptSet $extraStage $extraFinal @('hooks-report.json', 'tools-report.json') } catch { $extraRejected = $true }
Assert-Probe $extraRejected 'Receipt set with an extra file was published'
Assert-Probe (-not (Test-Path -LiteralPath $extraFinal)) 'Extra final receipt directory exists'

$outsideReceiptParent = Join-Path $PSScriptRoot 'outside-receipt-parent'
$receiptJunction = Join-Path $PSScriptRoot 'receipt-parent-junction'
$unsafeFinal = Join-Path $receiptJunction 'unsafe-final'
$unsafeStage = Join-Path $receiptJunction '.unsafe-final.staging-probe'
$null = New-Item -ItemType Directory -Path $outsideReceiptParent
$null = New-Item -ItemType Junction -Path $receiptJunction -Target $outsideReceiptParent
$null = New-Item -ItemType Directory -Path $unsafeStage
$outsideSentinel = Join-Path $unsafeStage 'preserve-me.txt'
[IO.File]::WriteAllText($outsideSentinel, 'preserve-me', [Text.UTF8Encoding]::new($false))
$junctionCleanupRejected = $false
try { Remove-VerifiedReceiptStaging $unsafeStage $unsafeFinal $true } catch {
  $junctionCleanupRejected = $_.Exception.Message -like '*reparse point*'
}
Assert-Probe $junctionCleanupRejected 'Receipt cleanup traversed a reparse ancestor'
Assert-Probe ([IO.File]::ReadAllText($outsideSentinel) -ceq 'preserve-me') 'Receipt cleanup deleted outside content'

Publish-ReceiptSet $receiptStagingRoot $receiptRoot @('hooks-report.json', 'tools-report.json')
Assert-Probe (Test-Path -LiteralPath $receiptRoot -PathType Container) 'Exact receipt set was not published'
Assert-Probe (-not (Test-Path -LiteralPath $receiptStagingRoot)) 'Staging directory survived atomic publication'
$publishedNames = @(Get-ChildItem -LiteralPath $receiptRoot -File | ForEach-Object Name | Sort-Object)
Assert-Probe (($publishedNames -join ',') -ceq 'hooks-report.json,tools-report.json') 'Published receipt set was not exact'
Assert-Probe (@(Get-ChildItem -LiteralPath $rawReceiptRoot -File).Count -eq 0) 'Raw reporter receipts survived'
`;

      try {
        fs.writeFileSync(probePath, `${helperSource}\n${fixtureSource}`, 'utf-8');
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        expect(result.status, result.stderr || result.stdout).toBe(0);
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
    40_000,
  );

  it.runIf(process.platform === 'win32')(
    'normalizes trailing-separator Windows receipt layout to an atomic sibling',
    () => {
      const runner = fs.readFileSync(
        path.join(ROOT, 'scripts', 'test-windows-external-agents.ps1'),
        'utf-8',
      ).replace(/\r\n/g, '\n');
      const functionStart = runner.indexOf('function Resolve-ReceiptLayout');
      const functionEnd = runner.indexOf('\n$repoRoot', functionStart);
      expect(functionStart).toBeGreaterThanOrEqual(0);
      expect(functionEnd).toBeGreaterThan(functionStart);
      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-receipt-layout-probe-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const fixtureSource = String.raw`
$ErrorActionPreference = 'Stop'
$expectedRoot = Join-Path $PSScriptRoot 'receipts'
$requestedRoot = $expectedRoot + [IO.Path]::DirectorySeparatorChar
$layout = Resolve-ReceiptLayout -RequestedReceiptDir $requestedRoot
if (-not $layout.Root.Equals($expectedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Receipt root was not normalized' }
if (-not $layout.Parent.Equals($PSScriptRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Receipt parent was not the direct sibling parent' }
if (-not [IO.Path]::GetDirectoryName($layout.StagingRoot).Equals($PSScriptRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Receipt staging was not a sibling' }
if (-not [IO.Path]::GetFileName($layout.StagingRoot).StartsWith('.receipts.staging-', [StringComparison]::Ordinal)) { throw 'Receipt staging name was not owned' }
if (Test-Path -LiteralPath $expectedRoot) { throw 'Final receipt directory was created during layout' }
`;
      try {
        fs.writeFileSync(probePath, `${runner.slice(functionStart, functionEnd)}\n${fixtureSource}`, 'utf-8');
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        expect(result.status, result.stderr || result.stdout).toBe(0);
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
    40_000,
  );

  it.runIf(process.platform === 'win32')(
    'preserves a colliding authenticated Hermes profile without invoking its CLI',
    () => {
      const runner = fs.readFileSync(
        path.join(ROOT, 'scripts', 'test-windows-external-agents.ps1'),
        'utf-8',
      ).replace(/\r\n/g, '\n');
      const functionStart = runner.indexOf('function Assert-NoReparsePointInPath');
      const functionEnd = runner.indexOf('\nfunction Get-ReceiptStrings', functionStart);
      expect(functionStart).toBeGreaterThanOrEqual(0);
      expect(functionEnd).toBeGreaterThan(functionStart);
      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-hermes-collision-probe-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const fixtureSource = String.raw`
$ErrorActionPreference = 'Stop'
$profilesRoot = Join-Path $PSScriptRoot 'profiles'
$profileName = 'wagglee2ecollision'
$profileHome = Join-Path $profilesRoot $profileName
$null = New-Item -ItemType Directory -Path $profileHome
$sentinel = Join-Path $profileHome 'sentinel.txt'
[IO.File]::WriteAllText($sentinel, 'preserve-me', [Text.UTF8Encoding]::new($false))
$script:hermesInvocations = @()
function hermes {
  $script:hermesInvocations += ($args -join ' ')
  throw 'Hermes CLI must not run for a profile collision'
}
$lease = $null
$rejected = $false
try { $lease = New-OwnedHermesProfile -ProfilesRoot $profilesRoot -ProfileName $profileName -OwnedRoot $PSScriptRoot }
catch { $rejected = $_.Exception.Message -like '*Refusing to overwrite*' }
finally { if ($null -ne $lease) { Remove-OwnedHermesProfile -Lease $lease } }
if (-not $rejected) { throw 'Colliding Hermes profile was not rejected' }
if ($script:hermesInvocations.Count -ne 0) { throw 'Hermes CLI was invoked for a collision' }
if (-not (Test-Path -LiteralPath $profileHome -PathType Container)) { throw 'Colliding profile was deleted' }
if ([IO.File]::ReadAllText($sentinel) -cne 'preserve-me') { throw 'Colliding profile sentinel changed' }
if (@(Get-ChildItem -LiteralPath $profilesRoot -Force).Count -ne 1) { throw 'Unexpected profile artifact was created' }
`;
      try {
        fs.writeFileSync(probePath, `${runner.slice(functionStart, functionEnd)}\n${fixtureSource}`, 'utf-8');
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        expect(result.status, result.stderr || result.stdout).toBe(0);
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
    40_000,
  );

  it.runIf(process.platform === 'win32')(
    'never deletes an unsealed Hermes profile after setup failure',
    () => {
      const runner = fs.readFileSync(
        path.join(ROOT, 'scripts', 'test-windows-external-agents.ps1'),
        'utf-8',
      ).replace(/\r\n/g, '\n');
      const functionStart = runner.indexOf('function Assert-NoReparsePointInPath');
      const functionEnd = runner.indexOf('\nfunction Invoke-NativePreflight', functionStart);
      expect(functionStart).toBeGreaterThanOrEqual(0);
      expect(functionEnd).toBeGreaterThan(functionStart);

      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-hermes-seal-probe-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const fixtureSource = String.raw`
$ErrorActionPreference = 'Stop'
$profilesRoot = Join-Path $PSScriptRoot 'profiles'
$profileName = 'wagglee2esealfailure'
$profileHome = Join-Path $profilesRoot $profileName
$script:hermesInvocations = @()
$script:failDuringCreate = $false

function Write-HermesOwnershipMarker {
  throw 'forced ownership marker failure'
}

function hermes {
  $script:hermesInvocations += ($args -join ' ')
  if ($args[0] -eq 'profile' -and $args[1] -eq 'create') {
    $null = New-Item -ItemType Directory -Path $profileHome
    if ($script:failDuringCreate) {
      [IO.File]::WriteAllText((Join-Path $profileHome 'competing-sentinel.txt'), 'preserve-me')
      throw 'forced terminating create failure'
    }
    $global:LASTEXITCODE = 0
    return
  }
  if ($args[0] -eq 'profile' -and $args[1] -eq 'delete') {
    Remove-Item -LiteralPath $profileHome -Recurse -Force
    $global:LASTEXITCODE = 0
    return
  }
  throw 'Unexpected Hermes CLI call'
}

$rejected = $false
try {
  $null = New-OwnedHermesProfile -ProfilesRoot $profilesRoot -ProfileName $profileName -OwnedRoot $PSScriptRoot
} catch {
  $rejected = $_.Exception.Message -like '*forced ownership marker failure*'
}
if (-not $rejected) { throw 'Hermes ownership seal failure was not preserved' }
if (-not (Test-Path -LiteralPath $profileHome -PathType Container)) { throw 'Unsealed Hermes profile was deleted' }
Remove-Item -LiteralPath $profileHome -Recurse -Force

$profileName = 'wagglee2ecreatefailure'
$profileHome = Join-Path $profilesRoot $profileName
$script:failDuringCreate = $true
$createRejected = $false
try {
  $null = New-OwnedHermesProfile -ProfilesRoot $profilesRoot -ProfileName $profileName -OwnedRoot $PSScriptRoot
} catch {
  $createRejected = $_.Exception.Message -like '*forced terminating create failure*'
}
if (-not $createRejected) { throw 'Terminating Hermes create failure was not preserved' }
if (-not (Test-Path -LiteralPath $profileHome -PathType Container)) { throw 'Competing Hermes profile was deleted' }
if ([IO.File]::ReadAllText((Join-Path $profileHome 'competing-sentinel.txt')) -cne 'preserve-me') {
  throw 'Competing Hermes profile sentinel changed'
}
if (($script:hermesInvocations -join '|') -cne
    'profile create wagglee2esealfailure --no-alias --no-skills|profile create wagglee2ecreatefailure --no-alias --no-skills') {
  throw 'Hermes setup failure invoked an unowned delete'
}
`;

      try {
        fs.writeFileSync(probePath, `${runner.slice(functionStart, functionEnd)}\n${fixtureSource}`, 'utf-8');
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        expect(result.status, result.stderr || result.stdout).toBe(0);
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
    40_000,
  );

  it.runIf(process.platform === 'win32')(
    'checks source auth invariants even when Hermes profile cleanup fails',
    () => {
      const runner = fs.readFileSync(
        path.join(ROOT, 'scripts', 'test-windows-external-agents.ps1'),
        'utf-8',
      ).replace(/\r\n/g, '\n');
      const functionStart = runner.indexOf('function Assert-NoReparsePointInPath');
      const functionEnd = runner.indexOf('\nfunction Get-ReceiptStrings', functionStart);
      expect(functionStart).toBeGreaterThanOrEqual(0);
      expect(functionEnd).toBeGreaterThan(functionStart);

      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-auth-cleanup-probe-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const fixtureSource = String.raw`
$ErrorActionPreference = 'Stop'
$script:hashChecks = 0
$ownedRoot = Join-Path $PSScriptRoot 'owned-profile'
$claudeCopy = Join-Path $ownedRoot '.claude\.credentials.json'
$codexCopy = Join-Path $ownedRoot '.codex\auth.json'
$hermesCopy = Join-Path $ownedRoot 'hermes-root\profiles\probe\auth.json'
$null = New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($claudeCopy)) -Force
$null = New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($codexCopy)) -Force
$null = New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($hermesCopy)) -Force
[IO.File]::WriteAllText($claudeCopy, 'claude-secret-copy')
[IO.File]::WriteAllText($codexCopy, 'codex-secret-copy')
[IO.File]::WriteAllText($hermesCopy, 'hermes-secret-copy')
function Set-ProcessEnvironment { }
function Restore-ProcessEnvironment { }
function Remove-OwnedHermesProfile { throw 'forced Hermes cleanup failure' }
function Get-FileHash {
  $script:hashChecks += 1
  return [pscustomobject]@{ Hash = 'expected-hash' }
}

$failure = $null
$lease = [pscustomobject]@{ ProfileName = 'probe' }
$evidence = @(
  [pscustomobject]@{ Path = 'claude-auth'; Hash = 'expected-hash' },
  [pscustomobject]@{ Path = 'codex-auth'; Hash = 'expected-hash' },
  [pscustomobject]@{ Path = 'hermes-auth'; Hash = 'expected-hash' }
)
try {
  Complete-AuthenticatedIsolationCleanup -HermesLease $lease -SourceAuthEvidence $evidence -ProfileVariables @() -IsolatedAuthPaths @($claudeCopy, $codexCopy, $hermesCopy) -OwnedRoot $ownedRoot
} catch {
  $failure = $_.Exception.Message
}
if (Test-Path -LiteralPath $claudeCopy) { throw 'Claude authentication copy survived explicit cleanup' }
if (Test-Path -LiteralPath $codexCopy) { throw 'Codex authentication copy survived explicit cleanup' }
if (Test-Path -LiteralPath $hermesCopy) { throw 'Hermes authentication copy survived explicit cleanup' }

$copySource = Join-Path $PSScriptRoot 'source-auth.json'
$outsideAuthRoot = Join-Path $PSScriptRoot 'outside-auth-root'
$redirectedAuthParent = Join-Path $ownedRoot 'redirected-auth'
[IO.File]::WriteAllText($copySource, 'copy-source')
$null = New-Item -ItemType Directory -Path $outsideAuthRoot
$null = New-Item -ItemType Junction -Path $redirectedAuthParent -Target $outsideAuthRoot
Remove-Item -LiteralPath $outsideAuthRoot -Recurse -Force
$copyRejected = $false
try {
  Copy-IsolatedAuthenticationFile -Source $copySource -Destination (Join-Path $redirectedAuthParent 'auth.json') -OwnedRoot $ownedRoot
} catch {
  $copyRejected = $_.Exception.Message -like '*reparse point*'
}
if (-not $copyRejected) { throw 'Authentication copy did not reject a dangling reparse ancestor' }
if ([IO.File]::Exists((Join-Path $outsideAuthRoot 'auth.json'))) { throw 'Authentication copy escaped through a reparse ancestor' }

if ($script:hashChecks -ne 3) { throw 'Source auth hashes were skipped after cleanup failure' }
if ($failure -notlike '*forced Hermes cleanup failure*') {
  throw 'Aggregated cleanup failure omitted the Hermes error'
}
`;

      try {
        fs.writeFileSync(probePath, `${runner.slice(functionStart, functionEnd)}\n${fixtureSource}`, 'utf-8');
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        expect(result.status, result.stderr || result.stdout).toBe(0);
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
    40_000,
  );

  it.runIf(process.platform === 'win32')(
    'builds a shell-free Codex auth shim that preserves literal task arguments',
    () => {
      const runner = fs.readFileSync(
        path.join(ROOT, 'scripts', 'test-windows-external-agents.ps1'),
        'utf-8',
      ).replace(/\r\n/g, '\n');
      const functionStart = runner.indexOf('function Assert-NoReparsePointInPath');
      const functionEnd = runner.indexOf('\nfunction New-OwnedHermesProfile', functionStart);
      expect(functionStart).toBeGreaterThanOrEqual(0);
      expect(functionEnd).toBeGreaterThan(functionStart);
      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-codex-shim-probe-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const nodePath = process.execPath.replaceAll("'", "''");
      const fixtureSource = String.raw`
$ErrorActionPreference = 'Stop'
$fakeNpm = Join-Path $PSScriptRoot 'fake-npm'
$realEntry = Join-Path $fakeNpm 'node_modules\@openai\codex\bin\codex.js'
$null = New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($realEntry))
$realEntrySource = @'
const fs = require('node:fs');
fs.writeFileSync(process.env.PROBE_OUTPUT, JSON.stringify({ codexHome: process.env.CODEX_HOME, args: process.argv.slice(2) }));
'@
[IO.File]::WriteAllText($realEntry, $realEntrySource, [Text.UTF8Encoding]::new($false))
$realCmd = @'
@ECHO off
SET "_prog=node"
"%_prog%" "%dp0%\node_modules\@openai\codex\bin\codex.js" %*
'@
[IO.File]::WriteAllText((Join-Path $fakeNpm 'codex.cmd'), $realCmd, [Text.ASCIIEncoding]::new())
$env:PATH = $fakeNpm + [IO.Path]::PathSeparator + $env:PATH
$resolvedProbeCommand = Get-Command codex.cmd -CommandType Application -ErrorAction Stop |
  Select-Object -First 1
$resolvedProbeItem = Get-Item -LiteralPath $resolvedProbeCommand.Source -Force
if ($resolvedProbeItem.PSIsContainer -or ($resolvedProbeItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
  throw "Fake Codex command was unsafe before helper: $($resolvedProbeCommand.Source) attrs=$($resolvedProbeItem.Attributes) dir=$($resolvedProbeItem.PSIsContainer)"
}
$ownedRoot = Join-Path $PSScriptRoot 'owned'
$codexHome = Join-Path $ownedRoot '.codex'
$shim = New-IsolatedCodexShim -ShimRoot (Join-Path $ownedRoot 'bin') -CodexHome $codexHome -OwnedRoot $ownedRoot
$shimText = [IO.File]::ReadAllText($shim.Shim)
if (-not $shimText.Contains('"%_prog%" "%dp0%\codex-isolated.mjs" %*')) { throw 'Generated shim was not npm-shaped' }
$env:PROBE_OUTPUT = Join-Path $PSScriptRoot 'result.json'
$arguments = @('literal%value&still-one', '-C', 'D:\work & data')
& '${nodePath}' $shim.Launcher @arguments
if ($LASTEXITCODE -ne 0) { throw 'Isolated Codex launcher failed' }
$result = [IO.File]::ReadAllText($env:PROBE_OUTPUT) | ConvertFrom-Json
if (-not $result.codexHome.Equals($codexHome, [StringComparison]::OrdinalIgnoreCase)) { throw 'CODEX_HOME was not isolated' }
if (($result.args -join '|') -cne ($arguments -join '|')) { throw 'Codex arguments changed during forwarding' }
`;
      try {
        fs.writeFileSync(probePath, `${runner.slice(functionStart, functionEnd)}\n${fixtureSource}`, 'utf-8');
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        expect(result.status, result.stderr || result.stdout).toBe(0);
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
    40_000,
  );

  it.runIf(process.platform === 'win32')(
    'removes owned Windows temp trees containing long Claude session paths',
    () => {
      const runner = fs.readFileSync(
        path.join(ROOT, 'scripts', 'test-windows-external-agents.ps1'),
        'utf-8',
      ).replace(/\r\n/g, '\n');
      const functionStart = runner.indexOf('function Remove-VerifiedTempTree');
      const functionEnd = runner.indexOf('\nfunction Invoke-PlaywrightLane', functionStart);
      expect(functionStart).toBeGreaterThanOrEqual(0);
      expect(functionEnd).toBeGreaterThan(functionStart);
      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-long-cleanup-probe-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const fixtureSource = String.raw`
$ErrorActionPreference = 'Stop'
$env:TEMP = $PSScriptRoot
$tempBase = $PSScriptRoot
function Start-Sleep { param([int]$Milliseconds) }
function ConvertTo-ExtendedPath([string]$Path) {
  $full = [IO.Path]::GetFullPath($Path)
  if ($full.StartsWith('\\')) { return '\\?\UNC\' + $full.Substring(2) }
  return '\\?\' + $full
}
$target = Join-Path $PSScriptRoot 'owned-long-tree'
$nested = $target
while ((Join-Path $nested 'session.jsonl').Length -le 265) {
  $nested = Join-Path $nested ('claude-session-' + ('x' * 40))
}
$extendedTarget = ConvertTo-ExtendedPath $target
$extendedNested = ConvertTo-ExtendedPath $nested
$extendedFile = ConvertTo-ExtendedPath (Join-Path $nested 'session.jsonl')
$null = [IO.Directory]::CreateDirectory($extendedNested)
[IO.File]::WriteAllText($extendedFile, '{}', [Text.UTF8Encoding]::new($false))
if (-not [IO.File]::Exists($extendedFile)) { throw 'Long-path fixture was not created' }
Remove-VerifiedTempTree -Target $target
if ([IO.Directory]::Exists($extendedTarget)) { throw 'Long-path temp tree survived cleanup' }
`;
      try {
        fs.writeFileSync(
          probePath,
          `${runner.slice(functionStart, functionEnd)}\n${fixtureSource}`,
          'utf-8',
        );
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        expect(result.status, result.stderr || result.stdout).toBe(0);
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
    40_000,
  );

  it.runIf(process.platform === 'win32')(
    'accepts successful authentication status emitted on stderr by Windows CLIs',
    () => {
      const runner = fs.readFileSync(
        path.join(ROOT, 'scripts', 'test-windows-external-agents.ps1'),
        'utf-8',
      ).replace(/\r\n/g, '\n');
      const functionStart = runner.indexOf('function Invoke-NativePreflight');
      const functionEnd = runner.indexOf('\nfunction Get-ReceiptStrings', functionStart);
      expect(functionStart).toBeGreaterThanOrEqual(0);
      expect(functionEnd).toBeGreaterThan(functionStart);
      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-auth-status-probe-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const nodePath = process.execPath.replaceAll("'", "''");
      const fixtureSource = String.raw`
$ErrorActionPreference = 'Stop'
$script:runnerNodePath = '${nodePath}'
Invoke-NativePreflight -FilePath $script:runnerNodePath -ArgumentList @('-e', "process.stderr.write('Logged in using ChatGPT'); process.exit(0)") -FailureMessage 'status failed'
$rejected = $false
try {
  Invoke-NativePreflight -FilePath $script:runnerNodePath -ArgumentList @('-e', "process.stderr.write('Authentication failed'); process.exit(7)") -FailureMessage 'status failed'
} catch {
  $rejected = $_.Exception.Message -ceq 'status failed'
}
if (-not $rejected) { throw 'Non-zero authentication status was accepted' }
`;

      try {
        fs.writeFileSync(
          probePath,
          `${runner.slice(functionStart, functionEnd)}\n${fixtureSource}`,
          'utf-8',
        );
        const result = spawnSync(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        expect(result.status, result.stderr || result.stdout).toBe(0);
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
    40_000,
  );

  it.runIf(process.platform === 'win32')(
    'keeps Playwright raw output in the owned temp tree without ReceiptDir',
    () => {
      const runner = fs.readFileSync(
        path.join(ROOT, 'scripts', 'test-windows-external-agents.ps1'),
        'utf-8',
      ).replace(/\r\n/g, '\n');
      const functionStart = runner.indexOf('function Invoke-PlaywrightLane');
      const functionEnd = runner.indexOf('\nfunction Invoke-VitestLane', functionStart);
      expect(functionStart).toBeGreaterThanOrEqual(0);
      expect(functionEnd).toBeGreaterThan(functionStart);
      const functionSource = runner.slice(functionStart, functionEnd);
      const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-playwright-output-probe-'));
      const probePath = path.join(probeRoot, 'probe.ps1');
      const fakeRunner = path.join(probeRoot, 'fake-node.cmd');
      const fixtureSource = String.raw`
$ErrorActionPreference = 'Stop'
$runRoot = Join-Path $PSScriptRoot 'owned-run'
$null = New-Item -ItemType Directory -Path $runRoot
$receiptRoot = $null
$receiptStagingRoot = $null
$rawReceiptRoot = Join-Path $runRoot 'raw-receipts'
$script:runnerNodePath = Join-Path $PSScriptRoot 'fake-node.cmd'
$script:playwrightCli = 'fake-playwright-cli.js'
function Get-FreeLoopbackPort { 45678 }
function Set-ProcessEnvironment([string]$Name, [AllowNull()][string]$Value) {}
function Publish-SafeReceipt([string]$RawReceiptPath, [string]$SafeReceiptPath) { throw 'Unexpected receipt publisher call' }
$laneFailed = $false
try {
  Invoke-PlaywrightLane -Spec 'fake.spec.ts' -DataDir (Join-Path $runRoot 'data') -ReceiptName 'hooks'
} catch {
  $laneFailed = $true
}
if (-not $laneFailed) { throw 'Failing fake Playwright runner was accepted' }
$arguments = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'args.txt'))
$expectedOutput = Join-Path $runRoot 'playwright-hooks'
if (-not $arguments.Contains('--output')) { throw 'Playwright output flag was omitted without ReceiptDir' }
if (-not $arguments.Contains($expectedOutput)) { throw 'Playwright output escaped the owned run root' }
if ($arguments.Contains('test-results')) { throw 'Playwright default output directory remained reachable' }
`;

      try {
        fs.writeFileSync(fakeRunner, '@echo off\r\n> "%~dp0args.txt" echo %*\r\nexit /b 1\r\n', 'utf-8');
        fs.writeFileSync(probePath, `${functionSource}\n${fixtureSource}`, 'utf-8');
        const result = spawnSync(
          powershellProbeExecutable(),
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath],
          { encoding: 'utf-8', timeout: 30_000, windowsHide: true },
        );
        expect(result.status, result.stderr || result.stdout).toBe(0);
      } finally {
        fs.rmSync(probeRoot, { recursive: true, force: true });
      }
    },
    40_000,
  );

  it('hard-disables the legacy authenticated Windows external-agent task seal before any auth or temp work', () => {
    const script = fs.readFileSync(
      path.join(ROOT, 'scripts', 'test-windows-external-agents.ps1'),
      'utf-8',
    ).replace(/\r\n/g, '\n');

    expect(script).toContain('[switch]$AuthenticatedTasks');
    const guard = [
      'if ($AuthenticatedTasks) {',
      "  throw 'AuthenticatedTasks is disabled; use scripts/test-windows-official-auth-canaries.ps1 for no-copy user-auth evidence.'",
      '}',
    ].join('\n');
    const guardIndex = script.indexOf(guard);
    expect(guardIndex).toBeGreaterThan(-1);
    for (const protectedMarker of [
      "$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path",
      '$runRoot = Join-Path $tempBase',
      '$sourceClaudeCredentials =',
      'Copy-IsolatedAuthenticationFile',
      "Set-ProcessEnvironment -Name 'USERPROFILE' -Value $authenticatedProfileRoot",
      "Invoke-VitestLane -Spec 'tests/integration/external-agent-collaboration.live.test.ts'",
    ]) {
      const protectedIndex = script.indexOf(protectedMarker);
      expect(protectedIndex, protectedMarker).toBeGreaterThan(-1);
      expect(guardIndex, protectedMarker).toBeLessThan(protectedIndex);
    }
    expect(script).toContain(
      "Invoke-PlaywrightLane -Spec 'tests/e2e/launcher-real-hook-lifecycle.spec.ts'",
    );
    expect(script).toContain(
      "Invoke-PlaywrightLane -Spec 'tests/e2e/launcher-real-tool-lifecycle.spec.ts'",
    );
  });

  it('Windows installer shutdown checks listeners instead of rejecting TCP TIME_WAIT', () => {
    const script = fs.readFileSync(
      path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'),
      'utf8',
    );
    const shutdownHelper = script.match(
      /function Wait-ForInstalledRuntimeStop \{([\s\S]*?)\r?\n\}/,
    )?.[1];

    expect(shutdownHelper).toBeDefined();
    expect(script).toContain('function Test-TcpPortHasListener');
    expect(shutdownHelper).toContain('Test-TcpPortHasListener $_');
    expect(shutdownHelper).not.toContain('Test-TcpPortAvailable $_');
  });

  it('keeps the three-agent live collaboration contract regression-locked', () => {
    const liveSpec = fs.readFileSync(
      path.join(ROOT, 'tests', 'integration', 'external-agent-collaboration.live.test.ts'),
      'utf-8',
    );

    expect(liveSpec).toContain(
      "const REQUIRED_TOOLS = ['claude-code', 'codex', 'hermes'] as const;",
    );
    expect(liveSpec).not.toContain('context.skip(');
    expect(liveSpec).toContain("{ toolId: 'claude-code', workspaceIds: [sourceWorkspaceId], access: 'read-only' }");
    expect(liveSpec).toContain("{ toolId: 'codex', workspaceIds: [sourceWorkspaceId], access: 'read-only' }");
    expect(liveSpec).toContain("{ toolId: 'hermes', workspaceIds: [sourceWorkspaceId], access: 'native' }");
    expect(liveSpec).toContain("{ toolId: 'hermes', workspaceIds: [synthesisWorkspaceId], access: 'native' }");
    expect(liveSpec).toContain('workspaceDigest(sourceWorkspaceDir)');
    expect(liveSpec).toContain('workspaceDigest(synthesisWorkspaceDir)');
    expect(liveSpec).toContain('summary.trim(), diagnostic).toBe(expectedCanaryLine)');
    expect(liveSpec).toContain("summary.trim(), diagnostic).toBe('NO_LOCAL_CANARY')");
    expect(liveSpec).toContain("expect(synthesis?.executor.toolId).toBe('hermes')");
    expect(liveSpec).not.toContain("'openclaw'");
    expect(liveSpec).toContain("memoryRefs.status === 'complete'");
    expect(liveSpec).toContain("new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'))");
    expect(liveSpec).not.toContain('result: run.result');
  });

  it('pins standalone Codex in the no-copy official-auth canary contract', () => {
    const script = fs.readFileSync(
      path.join(ROOT, 'scripts', 'test-windows-official-auth-canaries.ps1'),
      'utf-8',
    ).replace(/\r\n/g, '\n');
    const denialProof = fs.readFileSync(
      path.join(ROOT, 'scripts', 'verify-codex-tool-denial.mjs'),
      'utf-8',
    ).replace(/\r\n/g, '\n');

    expect(script).toContain("[string]$CodexModel = 'gpt-5.5'");
    expect(script).toContain("$executionAcknowledgement = 'I_ACKNOWLEDGE_3_OFFICIAL_AUTH_CALLS'");
    expect(script).toContain("$codexExe = Resolve-Application -Name 'codex.exe'");
    expect(script).toContain('codexResolved = $true');
    expect(script).toContain("codexInstaller = Join-Path $repoRoot 'packages\\hive-mind-hooks-codex\\dist\\bin\\codex-hooks.js'");
    expect(script).toContain("codexSessionStart = Join-Path $repoRoot 'packages\\hive-mind-hooks-codex\\dist\\hooks\\session-start.js'");
    expect(script).toContain("codexUserPromptSubmit = Join-Path $repoRoot 'packages\\hive-mind-hooks-codex\\dist\\hooks\\user-prompt-submit.js'");
    expect(script).toContain("codexStop = Join-Path $repoRoot 'packages\\hive-mind-hooks-codex\\dist\\hooks\\stop.js'");
    expect(script).toContain("codexPreCompact = Join-Path $repoRoot 'packages\\hive-mind-hooks-codex\\dist\\hooks\\pre-compact.js'");
    expect(script).toContain("codexToolDenial = Join-Path $repoRoot 'scripts\\verify-codex-tool-denial.mjs'");

    expect(script).toContain("-ArgumentList @($artifactPaths.codexInstaller, 'verify')");
    expect(script).toContain('$codexHookPasses -lt 9');
    expect(script).toContain('Codex hook verification did not satisfy the 9-check contract.');

    expect(script).toContain("-ArgumentList @('login', 'status')");
    expect(script).toContain('Logged in using ChatGPT');
    expect(script).toContain(
      'Codex is not authenticated through the required first-party ChatGPT client session.',
    );

    expect(script).toContain("'--codex-exe', $codexExe");
    expect(script).toContain("'--hive-mind-cli', $artifactPaths.hiveMindCli");
    expect(script).toContain("'--receipt-dir', $codexProofDir");
    expect(script).toContain("'--expected-head', $ExpectedHead");
    expect(script).toContain("'--model', $CodexModel");
    expect(script).toContain("'--windows-powershell', $windowsPowerShell");
    expect(script).toContain("'--workspace', $codexWorkspace");
    expect(script).toContain("'--execute-paid'");
    expect(script).toContain("'--marker', $codexMarker");
    expect(script).toContain("'--ack', 'I_ACKNOWLEDGE_1_CODEX_OFFICIAL_AUTH_CALL'");
    expect(script).toContain('Codex zero-cost tool-denial proof and official-auth canary');
    expect(script).toContain('function Assert-JsonBoolean');
    expect(script).toContain('function Assert-JsonInteger');
    expect(script).toContain('function Assert-CodexToolDenialProof');
    expect(script).toContain('Assert-CodexToolDenialProof -Proof $codexDenialProof');
    expect(script).toContain('Invoke-CodexProofValidatorSelfTest');
    expect(script).toContain("$fixture.schemaVersion = '1'");
    expect(script).toContain('$fixture.pass = 1');
    expect(script).toContain('$fixture.hooks.extraCount = 1');
    expect(script).toContain('$fixture.green.sensitiveDataObserved = $true');
    expect(script).toContain('$fixture.paidInvocation.toolEventsObserved = 1');
    expect(script).toContain("-Marker $codexMarker -Source 'codex' -SessionId $codexSessionId");

    expect(script).toContain('modelCalls = 3');
    expect(script).toContain('authStatusCalls = 3');
    expect(script).toContain('authFilesReadByHarness = 0');
    expect(script).toContain('authFilesCopied = 0');
    expect(script).toContain('authContentsSerialized = $false');
    expect(script).toContain(
      'codexAlternativeEnvironmentNamesBlanked = @($codexAlternativeAuthNames)',
    );
    expect(script).toContain('method = \'chatgpt\'');
    expect(script).toContain('paidModelCallsRequired = 1');
    expect(script).toContain('usageReceiptRequired = $false');
    expect(script).toContain('preCallCostCapAvailable = $false');
    expect(script).toContain('markerSha256 = Get-Sha256Text $codexMarker');
    expect(script).toContain('sessionIdSha256 = Get-Sha256Text $codexSessionId');
    expect(script).toContain('stdoutBytes = $codexRaw.StdoutBytes');
    expect(script).toContain('stdoutSha256 = $codexRaw.StdoutSha256');
    expect(script).toContain('stderrBytes = $codexRaw.StderrBytes');
    expect(script).toContain('stderrSha256 = $codexRaw.StderrSha256');
    expect(script).toContain('reportSha256 = $codexReportSha256');
    expect(script).toContain('invocationArgumentsSha256 = [string]$codexDenialProof.invocation.argumentsSha256');
    expect(script).toContain('hookGraphSha256 = [string]$codexDenialProof.hooks.graphSha256');
    expect(script).toContain('modelCatalogSha256 = [string]$codexDenialProof.paidInvocation.modelCatalogSha256');
    expect(script).toContain('paidThreadParamsSha256 = [string]$codexDenialProof.paidInvocation.threadParamsSha256');
    expect(script).toContain('paidTurnParamsSha256 = [string]$codexDenialProof.paidInvocation.turnParamsSha256');
    expect(script).toContain('mcpBoundarySha256 = [string]$codexDenialProof.mcpBoundary.postPaidSha256');
    expect(script).toContain('packagedHookArtifactsSha256 = [string]$codexDenialProof.hooks.artifactsSha256');
    expect(script).toContain('windowsPowerShellSha256 = [string]$codexDenialProof.artifacts.windowsPowerShellSha256');

    for (const feature of [
      'shell_tool',
      'unified_exec',
      'apps',
      'browser_use',
      'browser_use_external',
      'browser_use_full_cdp_access',
      'computer_use',
      'image_generation',
      'in_app_browser',
      'multi_agent',
      'multi_agent_v2',
      'goals',
      'skill_search',
      'tool_suggest',
      'workspace_dependencies',
      'skill_mcp_dependency_install',
      'plugins',
      'plugin_sharing',
      'remote_plugin',
      'mentions_v2',
    ]) {
      expect(denialProof).toContain(`'${feature}'`);
    }
    expect(denialProof).toContain("args.push('--disable', feature)");
    expect(denialProof).toContain("'web_search=\"disabled\"'");
    expect(denialProof).toContain("'tools.update_plan.enabled=false'");
    expect(denialProof).toContain("'tools.experimental_request_user_input.enabled=false'");
    expect(denialProof).toContain("'orchestrator.skills.enabled=false'");
    expect(denialProof).toContain("'orchestrator.mcp.enabled=false'");
    expect(denialProof).toContain('apply_patch_tool_type = null');
    expect(denialProof).toContain('use_responses_lite = false');
    expect(denialProof).toContain('dynamicTools: []');
    expect(denialProof).toContain('environments: []');
    expect(denialProof).toContain('allowProviderModelFallback: false');
    expect(denialProof).toContain(
      '...(options.useDefaultEnvironmentForControl ? {} : { environments: [] })',
    );
    expect(denialProof).toContain('useDefaultEnvironmentForControl: true');
    expect(denialProof).toContain("const controlModel = `waggle-control-${sha256(model).slice(0, 16)}`");
    expect(denialProof).toContain('selectedCapabilityRoots: []');
    expect(denialProof).toContain("matcher='*'");
    expect(denialProof).toContain("permissionDecision: 'deny'");
    expect(denialProof).toContain('permissionDecisionReason: DENIAL_REASON');
    expect(denialProof).toContain("hook.eventName === 'preToolUse'");
    expect(denialProof).toContain("JSON.stringify(redTools) === JSON.stringify(['view_image'])");
    expect(denialProof).toContain('sealedRequest.additionalToolCount === 0');
    expect(denialProof).toContain('sealedRequest.topLevelToolsIsArray');
    expect(denialProof).toContain('assertExactHookGraph');
    expect(denialProof).toContain('buildExpectedWaggleHooks');
    expect(denialProof).toContain('hook.commandSha256 === expectedWaggleCommands.get(hook.eventName)');
    expect(denialProof).toContain("hookStateEntries.push(`'${key}'={enabled=false}`)");
    expect(denialProof).toContain("hookStateEntries.push(`'${key}'={enabled=true,trusted_hash='${currentHash}'}`)");
    expect(denialProof).toContain("`hooks.state={${hookStateEntries.join(',')}}`");
    expect(denialProof).toContain('hooks.state=<sha256:');
    expect(denialProof).not.toContain("hooks.state.'${key}'");
    expect(denialProof).toContain('readConfiguredMcpServerNames');
    expect(denialProof).toContain('captureMcpBoundary');
    expect(denialProof).toContain('assertSameMcpBoundary');
    expect(denialProof).toContain('verifySourceSnapshot');
    expect(denialProof).toContain('await options.beforeTurn()');
    expect(denialProof).toContain('artifactsUnchanged: false');
    expect(denialProof).toContain('function buildMcpInventoryArguments()');
    expect(denialProof).toContain(
      'runChecked(codexExecutable, buildMcpInventoryArguments(), {',
    );
    expect(denialProof).toContain("`mcp_servers={${mcpServerEntries.join(',')}}`");
    expect(denialProof).toContain('mcp_servers=<sha256:');
    expect(script).toContain('mcpServerCount = [int]$codexDenialProof.invocation.mcpServerCount');
    expect(script).toContain('mcpServerNamesSha256 = [string]$codexDenialProof.invocation.mcpServerNamesSha256');
    expect(denialProof).toContain('extras.every((hook) => !hook.enabled)');
    expect(denialProof).toContain('verifyWindowsPowerShell');
    expect(denialProof).toContain('model_reasoning_effort="low"');
    expect(denialProof).toContain('model_provider="openai"');
    expect(denialProof).not.toContain('model_providers.openai.');
    expect(denialProof).not.toContain('waggle_chatgpt');
    const allowedNotificationPolicyStart = denialProof.indexOf(
      'const ALLOWED_NOTIFICATION_METHODS = new Set([',
    );
    const allowedNotificationPolicy = denialProof.slice(
      allowedNotificationPolicyStart,
      denialProof.indexOf(']);', allowedNotificationPolicyStart) + 3,
    );
    expect(allowedNotificationPolicy).toContain("'remoteControl/status/changed'");
    expect(allowedNotificationPolicy).not.toContain("'model/rerouted'");
    expect(denialProof).toContain("entry.message?.method === 'model/rerouted'");
    expect(denialProof).toContain('const FAIL_CLOSED_PROJECT_TRUST_WARNING =');
    expect(denialProof).toContain('function isFailClosedProjectTrustWarning(notification)');
    expect(denialProof).toContain(
      "const allowedKeys = new Set(['details', 'path', 'range', 'summary']);",
    );
    expect(denialProof).toContain('if (!keys.every((key) => allowedKeys.has(key))) return false;');
    expect(denialProof).toContain("if (lines.at(-1) !== '') return false;");
    expect(denialProof).toContain('&& !isFailClosedProjectTrustWarning(entry)');
    const auditFailureInvariantStart = denialProof.indexOf(
      'const EVENT_AUDIT_FAILURE_INVARIANTS = new Set([',
    );
    const auditFailureInvariants = denialProof.slice(
      auditFailureInvariantStart,
      denialProof.indexOf(']);', auditFailureInvariantStart) + 3,
    );
    for (const invariant of [
      'failure-notification',
      'wrong-scope',
      'model-reroute',
      'unknown-notification-method',
      'unknown-item-type',
      'forbidden-tool-item',
      'agent-message-cardinality',
    ]) {
      expect(auditFailureInvariants).toContain(`'${invariant}'`);
    }
    const auditFailureKeysStart = denialProof.indexOf(
      'const EVENT_AUDIT_FAILURE_KEYS = [',
    );
    const auditFailureKeys = denialProof.slice(
      auditFailureKeysStart,
      denialProof.indexOf('];', auditFailureKeysStart) + 2,
    );
    for (const key of [
      'invariant',
      'notificationCount',
      'failureEventsObserved',
      'wrongScopeEventsObserved',
      'rerouteEventsObserved',
      'unknownNotificationEventsObserved',
      'unknownItemEventsObserved',
      'toolEventsObserved',
      'notificationGraphSha256',
      'rejectedMethodSha256',
      'rejectedItemTypeSha256',
    ]) {
      expect(auditFailureKeys).toContain(`'${key}'`);
    }
    expect(denialProof).toContain('eventAuditFailure: null');
    expect(denialProof).toContain(
      'report.eventAuditFailure = sanitizeEventAuditFailure(error?.eventAuditFailure);',
    );
    expect(denialProof).toContain('sensitiveDataObserved: false');
    expect(denialProof).toContain('paidCalls: 0');
    expect(denialProof).not.toContain('dangerously-bypass-hook-trust');

    const receiptSource = script.slice(script.indexOf('$receipt = [ordered]@{'));
    expect(receiptSource).not.toContain('$codexAuthText');
    expect(receiptSource).not.toContain('marker = $codexMarker');
    expect(receiptSource).not.toContain('sessionId = $codexSessionId');
    expect(script).not.toContain('$sourceCodexAuth');
    expect(script).not.toContain('$isolatedCodexAuth');
    expect(script).not.toContain("Join-Path $env:CODEX_HOME 'auth.json'");
    expect(script).not.toContain('Copy-Item');
    expect(script).not.toContain('rawStdout = $codexRaw.Stdout');
    expect(script).not.toContain('rawStderr = $codexRaw.Stderr');
    expect(script).not.toContain('rawAuthOutput =');
    expect(script).not.toContain('$codexPrompt');
    expect(script).not.toContain('$invalidCodexLines');

    const helperSelfTest = spawnSync(
      process.execPath,
      [path.join(ROOT, 'scripts', 'verify-codex-tool-denial.mjs'), '--self-test'],
      { cwd: ROOT, encoding: 'utf-8', timeout: 30_000, windowsHide: true },
    );
    expect(helperSelfTest.status, helperSelfTest.stderr).toBe(0);
    expect(JSON.parse(helperSelfTest.stdout)).toMatchObject({
      pass: true,
      paidCalls: 0,
      cases: 54,
    });

    if (process.platform === 'win32') {
      const validatorSelfTest = spawnSync(
        powershellProbeExecutable(),
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-File',
          path.join(ROOT, 'scripts', 'test-windows-official-auth-canaries.ps1'),
          '-ExpectedHead',
          '0000000000000000000000000000000000000000',
          '-ReceiptDir',
          path.join(os.tmpdir(), 'unused-waggle-codex-proof-validator-self-test'),
          '-CodexProofValidatorSelfTest',
        ],
        { cwd: ROOT, encoding: 'utf-8', timeout: 30_000, windowsHide: true },
      );
      expect(validatorSelfTest.status, validatorSelfTest.stderr).toBe(0);
      expect(JSON.parse(validatorSelfTest.stdout)).toMatchObject({
        pass: true,
        paidCalls: 0,
        cases: 52,
      });
    }
  });

  it('stages Codex official setup before any model invocation', () => {
    const script = fs.readFileSync(
      path.join(ROOT, 'scripts', 'test-windows-official-auth-canaries.ps1'),
      'utf-8',
    ).replace(/\r\n/g, '\n');
    const denialProof = fs.readFileSync(
      path.join(ROOT, 'scripts', 'verify-codex-tool-denial.mjs'),
      'utf-8',
    ).replace(/\r\n/g, '\n');

    expect(denialProof).toContain('const CANARY_STAGES = new Set([');
    for (const stage of [
      'app-server-spawn',
      'initialize',
      'hooks-list',
      'pre-turn-boundary',
      'thread-start',
      'turn-start',
      'turn-completed',
      'event-audit',
      'app-server-close',
      'post-turn-invariants',
    ]) {
      expect(denialProof).toContain(`'${stage}'`);
    }
    expect(denialProof).toContain('function sanitizeProtocolCode(value)');
    expect(denialProof).toContain('value >= -2_147_483_648');
    expect(denialProof).toContain('value <= 2_147_483_647');
    expect(denialProof).toContain('const FAILURE_NOTIFICATION_METHODS = new Set([');
    for (const method of [
      'error',
      'warning',
      'guardianWarning',
      'configWarning',
      'deprecationNotice',
    ]) {
      expect(denialProof).toContain(`'${method}'`);
    }
    for (const method of [
      'account/updated',
      'mcpServer/startupStatus/updated',
      'model/safetyBuffering/updated',
      'model/verification',
      'thread/name/updated',
      'thread/settings/updated',
      'turn/moderationMetadata',
    ]) {
      expect(denialProof).toContain(`'${method}'`);
    }
    expect(denialProof).not.toContain("'rawResponse/completed'");
    expect(denialProof).not.toContain("'rawResponseItem/completed'");
    expect(denialProof).toContain("const setupOnly = flags['setup-only'] === true;");
    expect(denialProof).toContain('if (options.setupOnly) {');
    expect(denialProof).toContain('modelCalls: 0');
    expect(denialProof).toContain('turnStartCalls: 0');
    expect(denialProof).toContain("completedStage: 'thread-start'");
    expect(denialProof).toContain('failureStage: report.diagnostic.failureStage');
    expect(denialProof).toContain('protocolCode: report.diagnostic.protocolCode');

    const setupBranchStart = denialProof.indexOf('if (options.setupOnly) {');
    const paidTurnStart = denialProof.indexOf("client.send({ method: 'turn/start'", setupBranchStart);
    expect(setupBranchStart).toBeGreaterThan(-1);
    expect(paidTurnStart).toBeGreaterThan(setupBranchStart);
    expect(denialProof.slice(setupBranchStart, paidTurnStart)).not.toContain("method: 'turn/start'");

    const closeCall = denialProof.indexOf('await client.close();', setupBranchStart);
    const finalAudit = denialProof.indexOf('const finalEvents = eventAudit(', closeCall);
    const finalProtocolCheck = denialProof.indexOf(
      "'Codex app-server protocol failed after close'",
      finalAudit,
    );
    expect(closeCall).toBeGreaterThan(setupBranchStart);
    expect(finalAudit).toBeGreaterThan(closeCall);
    expect(finalProtocolCheck).toBeGreaterThan(finalAudit);

    expect(denialProof).toContain(
      'proof: { executed: false, paidCalls: 0, pass: null }',
    );
    expect(denialProof).toContain(
      'report.proof = { executed: true, paidCalls: 0, pass: true };',
    );
    expect(denialProof).toContain('proofStateSatisfied(report.proof, setupOnly)');

    expect(script).toContain('function Assert-CodexSetupPreflight');
    expect(script).toContain('function Assert-CodexFailureStage');
    expect(script).toContain('function Assert-NullableProtocolCode');
    expect(script).toContain("'--setup-only'");
    expect(script).toContain('$codexSetupRaw = Invoke-CapturedProcess');
    expect(script).toContain('Assert-CodexSetupPreflight');
    expect(script).toContain('stage = $failureStage');
    expect(script).toContain('protocolCode = $protocolCode');
    expect(script).toContain(
      "Assert-JsonBoolean -Value $Report.proof.executed -Expected $false `",
    );
    expect(script).toContain("if ($null -ne $Report.proof.pass) {");
    expect(script).not.toContain("-Label 'Codex setup offline proof pass'");

    const codexAuth = script.indexOf('$codexAuthRaw = Invoke-CapturedProcess');
    const hermesAuth = script.indexOf('$hermesAuthRaw = Invoke-CapturedProcess');
    const codexSetup = script.indexOf('$codexSetupRaw = Invoke-CapturedProcess');
    const claudeMarker = script.indexOf('$claudeMarker =');
    const claudeRun = script.indexOf('$claudeRaw = Invoke-CapturedProcess');
    const codexRun = script.indexOf('$codexRaw = Invoke-CapturedProcess');
    const hermesRun = script.indexOf('$hermesRaw = Invoke-CapturedProcess');
    expect(codexAuth).toBeGreaterThan(-1);
    expect(hermesAuth).toBeGreaterThan(codexAuth);
    expect(codexSetup).toBeGreaterThan(hermesAuth);
    expect(claudeMarker).toBeGreaterThan(codexSetup);
    expect(claudeRun).toBeGreaterThan(claudeMarker);
    expect(codexRun).toBeGreaterThan(claudeRun);
    expect(hermesRun).toBeGreaterThan(codexRun);
  });

  it('preserves only a whitelisted Codex diagnostic after a non-zero child', () => {
    const script = fs.readFileSync(
      path.join(ROOT, 'scripts', 'test-windows-official-auth-canaries.ps1'),
      'utf-8',
    ).replace(/\r\n/g, '\n');
    const denialProof = fs.readFileSync(
      path.join(ROOT, 'scripts', 'verify-codex-tool-denial.mjs'),
      'utf-8',
    ).replace(/\r\n/g, '\n');

    expect(denialProof).toContain('function sanitizeTurnFailure');
    expect(denialProof).toContain('turnFailure: null');
    expect(denialProof).toContain('report.turnFailure = error?.turnFailure ?? null');
    expect(denialProof).toContain("client.notification('turn/completed', (entry) => (");
    expect(denialProof).toContain('entry.message?.params?.threadId === threadId');
    expect(denialProof).toContain('entry.message?.params?.turn?.id === turnId');
    expect(denialProof).toContain('turnFailure: report.turnFailure');

    expect(script).toContain('function Assert-SanitizedCodexTurnFailure');
    expect(script).toContain('function New-SanitizedCodexFailureReceipt');
    expect(script).toContain("kind = 'windows-official-auth-codex-failure'");
    expect(script).toContain("Join-Path $receiptLayout.Staging 'official-auth-failure.json'");
    expect(script).toContain('turnFailure = Assert-SanitizedCodexTurnFailure');
    expect(script).not.toContain('failureReceipt.rawStdout');
    expect(script).not.toContain('failureReceipt.rawStderr');
    expect(script).not.toContain('failureReceipt.message');
    expect(script).not.toContain('failureReceipt.additionalDetails');

    const codexRun = script.indexOf('$codexRaw = Invoke-CapturedProcess');
    const failureBranch = script.indexOf(
      'if ($codexRaw.TimedOut -or $codexRaw.ExitCode -ne 0)',
      codexRun,
    );
    const cleanup = script.indexOf('Remove-OwnedDirectory -Path $tempRoot', failureBranch);
    const failureWrite = script.indexOf("'official-auth-failure.json'", cleanup);
    const publish = script.indexOf('$published = $true', failureWrite);
    const nonZero = script.indexOf('Assert-ProcessPassed -Result $codexRaw', publish);
    expect(codexRun).toBeGreaterThan(-1);
    expect(failureBranch).toBeGreaterThan(codexRun);
    expect(cleanup).toBeGreaterThan(failureBranch);
    expect(failureWrite).toBeGreaterThan(cleanup);
    expect(publish).toBeGreaterThan(failureWrite);
    expect(nonZero).toBeGreaterThan(publish);
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

  it('release publication requires external profile isolation evidence', () => {
    const publisher = fs.readFileSync(
      path.join(ROOT, 'scripts', 'publish-windows-release.ps1'),
      'utf-8',
    );
    expect(publisher).toMatch(
      /\$cleanRequiredChecks\s*=\s*@\([\s\S]*'externalProfileRootsUnchanged'[\s\S]*\)/,
    );
    expect(publisher).toMatch(
      /\$upgradeRequiredChecks\s*=\s*@\([\s\S]*'externalProfileRootsUnchanged'[\s\S]*\)/,
    );
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
  it.runIf(process.platform === 'win32')(
    'executes sidecar source installed-bundle and publication provenance gates',
    () => {
      const certifier = fs
        .readFileSync(path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'), 'utf8')
        .replace(/\r\n/g, '\n');
      const publisher = fs
        .readFileSync(path.join(ROOT, 'scripts', 'publish-windows-release.ps1'), 'utf8')
        .replace(/\r\n/g, '\n');
      const sliceFunctions = (source: string, start: string, end: string) => {
        const startIndex = source.indexOf(start);
        const endIndex = source.indexOf(end, startIndex + start.length);
        expect(startIndex).toBeGreaterThanOrEqual(0);
        expect(endIndex).toBeGreaterThan(startIndex);
        return source.slice(startIndex, endIndex);
      };
      const assertTrue = sliceFunctions(
        certifier,
        'function Assert-True {',
        '\nfunction Get-HttpStatusCode {',
      );
      const sidecarHelpers = sliceFunctions(
        certifier,
        'function Get-SidecarProvenance {',
        '\nfunction Get-ExternalProfileRootSnapshot {',
      );
      const publisherHelper = sliceFunctions(
        publisher,
        'function Assert-ReceiptSourceHashes {',
        '\nfunction Assert-ReleaseDoesNotExist {',
      );
      const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-sidecar-binding-'));
      const sourceContents = new Map<string, string>([
        ['package-lock.json', '{"lockfileVersion":3}\n'],
        ['package.json', '{"name":"binding-fixture"}\n'],
        ['packages/server/package.json', '{"name":"@waggle/server"}\n'],
        ['packages/server/src/local/service.ts', 'export const fixture = true;\n'],
        ['packages/server/tsconfig.json', '{"extends":"../../tsconfig.base.json"}\n'],
        ['scripts/build-sidecar.mjs', 'export {};\n'],
        ['tsconfig.base.json', '{"compilerOptions":{"target":"ES2022"}}\n'],
      ]);
      const writeRelative = (relative: string, content: string | Buffer) => {
        const target = path.join(fixtureRoot, ...relative.split('/'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
        return target;
      };
      const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
      const inputs = () => [...sourceContents.keys()]
        .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
        .map((relative) => ({
          path: relative,
          sha256: hash(fs.readFileSync(path.join(fixtureRoot, ...relative.split('/')))),
        }));
      const serviceBytes = (revision: string, payload: string) => {
        const payloadBytes = Buffer.from(payload, 'utf8');
        const manifest = {
          schemaVersion: 1,
          sourceRevision: revision,
          entryPoint: 'packages/server/src/local/service.ts',
          sourceInputs: inputs(),
          bundlePayload: { sizeBytes: payloadBytes.byteLength, sha256: hash(payloadBytes) },
        };
        return Buffer.concat([
          Buffer.from(
            `// Waggle-Sidecar-Provenance: ${Buffer.from(JSON.stringify(manifest)).toString('base64')}\n`,
            'utf8',
          ),
          payloadBytes,
        ]);
      };
      const run = (command: string, args: string[], cwd = fixtureRoot) => {
        const result = spawnSync(command, args, {
          cwd,
          encoding: 'utf8',
          timeout: 60_000,
          windowsHide: true,
        });
        expect(result.status, result.stderr || result.stdout).toBe(0);
        return result;
      };

      try {
        for (const [relative, content] of sourceContents) writeRelative(relative, content);
        run('git', ['init']);
        run('git', ['config', 'user.email', 'sidecar-fixture@waggle.invalid']);
        run('git', ['config', 'user.name', 'Waggle Fixture']);
        run('git', ['add', '--', ...sourceContents.keys()]);
        run('git', ['commit', '-m', 'fixture']);
        const revision = run('git', ['rev-parse', 'HEAD']).stdout.trim();
        const packagedPath = writeRelative('packaged-service.js', serviceBytes(revision, 'ok\n'));
        const installedPath = writeRelative('installed-service.js', serviceBytes(revision, 'ok\n'));
        const changedBundlePath = writeRelative(
          'changed-bundle.js',
          serviceBytes(revision, 'changed\n'),
        );
        const wrongRevisionPath = writeRelative(
          'wrong-revision.js',
          serviceBytes('b'.repeat(40), 'ok\n'),
        );
        const tamperedPath = writeRelative(
          'tampered-service.js',
          Buffer.concat([serviceBytes(revision, 'ok\n'), Buffer.from('tampered\n')]),
        );
        const probePath = writeRelative(
          'sidecar-probe.ps1',
          `${String.raw`param(
  [string]$Mode,
  [string]$RepositoryRoot,
  [string]$ExpectedRevision,
  [string]$PackagedPath,
  [string]$InstalledPath,
  [string]$ChangedBundlePath,
  [string]$WrongRevisionPath,
  [string]$TamperedPath
)
`}${assertTrue}\n${sidecarHelpers}\n${String.raw`
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Expect-Rejection {
  param([scriptblock]$Action, [string]$Label)
  $rejected = $false
  try { & $Action } catch { $rejected = $true }
  if (-not $rejected) { throw "$Label was accepted" }
}
$git = (Get-Command git -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
if ($Mode -eq 'clean') {
  $packaged = Get-SidecarProvenance $PackagedPath
  $installed = Get-SidecarProvenance $InstalledPath
  Assert-SidecarBundleBinding -Packaged $packaged -Installed $installed
  Assert-SidecarSourceBinding -Provenance $packaged -RepositoryRoot $RepositoryRoot -ExpectedRevision $ExpectedRevision -GitExecutable $git
} elseif ($Mode -eq 'bundle-rejections') {
  $packaged = Get-SidecarProvenance $PackagedPath
  $changed = Get-SidecarProvenance $ChangedBundlePath
  $wrongRevision = Get-SidecarProvenance $WrongRevisionPath
  Expect-Rejection { Assert-SidecarBundleBinding -Packaged $packaged -Installed $changed } 'Changed bundle'
  Expect-Rejection { Assert-SidecarBundleBinding -Packaged $packaged -Installed $wrongRevision } 'Changed provenance revision'
  $wrongCount = Get-SidecarProvenance $InstalledPath
  $wrongCount.sourceInputCount = [int]$wrongCount.sourceInputCount + 1
  Expect-Rejection { Assert-SidecarBundleBinding -Packaged $packaged -Installed $wrongCount } 'Changed input count'
  Expect-Rejection { Get-SidecarProvenance $TamperedPath | Out-Null } 'Tampered payload'
} elseif ($Mode -eq 'source-rejection') {
  $provenance = Get-SidecarProvenance $PackagedPath
  Expect-Rejection { Assert-SidecarSourceBinding -Provenance $provenance -RepositoryRoot $RepositoryRoot -ExpectedRevision $ExpectedRevision -GitExecutable $git } 'Dirty or wrong-revision source'
} else {
  throw 'Unknown probe mode'
}
`}`,
          'utf8',
        );
        const powershell = powershellProbeExecutable();
        const probe = (mode: string, sourcePath = packagedPath) => run(
          powershell,
          [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath,
            '-Mode', mode,
            '-RepositoryRoot', fixtureRoot,
            '-ExpectedRevision', revision,
            '-PackagedPath', sourcePath,
            '-InstalledPath', installedPath,
            '-ChangedBundlePath', changedBundlePath,
            '-WrongRevisionPath', wrongRevisionPath,
            '-TamperedPath', tamperedPath,
          ],
        );
        probe('clean');
        probe('bundle-rejections');

        const configRelative = 'packages/server/tsconfig.json';
        fs.appendFileSync(
          path.join(fixtureRoot, ...configRelative.split('/')),
          '// dirty transform config\n',
        );
        const dirtyServicePath = writeRelative(
          'dirty-source-service.js',
          serviceBytes(revision, 'ok\n'),
        );
        probe('source-rejection', dirtyServicePath);
        probe('source-rejection', wrongRevisionPath);

        const releaseInstaller = writeRelative(
          'target/release/bundle/nsis/Waggle.exe',
          'installer',
        );
        const generatedInstaller = writeRelative(
          'target/release/nsis/installer.nsi',
          'generated installer',
        );
        const certifierFixture = writeRelative(
          'scripts/certify-windows-installer.ps1',
          'certifier',
        );
        const hookFixture = writeRelative('app/src-tauri/nsis/installer.nsi', 'hook');
        const currentSidecar = writeRelative(
          'app/src-tauri/resources/service.js',
          serviceBytes(revision, 'ok\n'),
        );
        const firstLine = fs.readFileSync(currentSidecar).subarray(
          0,
          fs.readFileSync(currentSidecar).indexOf(0x0a),
        ).toString('utf8');
        const provenanceBytes = Buffer.from(
          firstLine.slice('// Waggle-Sidecar-Provenance: '.length),
          'base64',
        );
        const receiptPath = writeRelative(
          'receipt.json',
          JSON.stringify({
            evidence: {
              certifierSha256: hash(fs.readFileSync(certifierFixture)),
              installerHookSha256: hash(fs.readFileSync(hookFixture)),
              generatedInstallerScriptSha256: hash(fs.readFileSync(generatedInstaller)),
              sidecarBundleSha256: hash(fs.readFileSync(currentSidecar)),
              sidecarProvenanceSha256: hash(provenanceBytes),
              sidecarSourceRevision: revision,
              sidecarSourceInputCount: inputs().length,
            },
          }),
        );
        const publisherProbePath = writeRelative(
          'publisher-probe.ps1',
          `${String.raw`param([string]$FixtureRoot, [string]$InstallerPath, [string]$ReceiptPath, [string]$SourceRevision)
`}${publisherHelper}\n${String.raw`
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location -LiteralPath $FixtureRoot
function Expect-Rejection {
  param([scriptblock]$Action, [string]$Label)
  $rejected = $false
  try { & $Action } catch { $rejected = $true }
  if (-not $rejected) { throw "$Label was accepted" }
}
$installer = Get-Item -LiteralPath $InstallerPath
$receipt = Get-Content -Raw -LiteralPath $ReceiptPath | ConvertFrom-Json
Assert-ReceiptSourceHashes @($receipt) $installer $SourceRevision
foreach ($property in @('sidecarBundleSha256', 'sidecarProvenanceSha256', 'sidecarSourceRevision', 'sidecarSourceInputCount')) {
  $changed = ($receipt | ConvertTo-Json -Depth 8 | ConvertFrom-Json)
  if ($property -eq 'sidecarSourceInputCount') { $changed.evidence.$property = [int]$changed.evidence.$property + 1 }
  elseif ($property -eq 'sidecarSourceRevision') { $changed.evidence.$property = ('f' * 40) }
  else { $changed.evidence.$property = ('0' * 64) }
  Expect-Rejection { Assert-ReceiptSourceHashes @($changed) $installer $SourceRevision } "Changed $property receipt"
}
$sidecarPath = Join-Path $FixtureRoot 'app/src-tauri/resources/service.js'
$original = [System.IO.File]::ReadAllBytes($sidecarPath)
[System.IO.File]::AppendAllText($sidecarPath, 'tampered')
try {
  Expect-Rejection { Assert-ReceiptSourceHashes @($receipt) $installer $SourceRevision } 'Changed current bundle'
} finally {
  [System.IO.File]::WriteAllBytes($sidecarPath, $original)
}
`}`,
          'utf8',
        );
        run(
          powershell,
          [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', publisherProbePath,
            '-FixtureRoot', fixtureRoot,
            '-InstallerPath', releaseInstaller,
            '-ReceiptPath', receiptPath,
            '-SourceRevision', revision,
          ],
        );
      } finally {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
      }
    },
    120_000,
  );
});

describe('Windows installer certifier timeout contract', () => {
  it('honors one bounded JSON GET timeout override and still fails closed', async () => {
    if (process.platform !== 'win32') return;

    const pwsh = powershellProbeExecutable();
    const script = fs.readFileSync(
      path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'),
      'utf-8',
    );
    const helperStart = script.indexOf('function Invoke-JsonRequest {');
    const helperEnd = script.indexOf('\nfunction Invoke-JsonPostRequest {');
    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);
    const helper = script.slice(helperStart, helperEnd);

    let responseDelayMs = 1_200;
    const server = http.createServer((_request, response) => {
      setTimeout(() => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"ok":true}');
      }, responseDelayMs);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Could not bind delayed loopback probe server');
    }
    const uri = `http://127.0.0.1:${address.port}/`;
    const runProbe = (timeoutSeconds: number) =>
      new Promise<void>((resolve, reject) => {
        execFile(
          pwsh,
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `${helper}\n$result = Invoke-JsonRequest -Uri '${uri}' -Headers @{} -TimeoutSeconds ${timeoutSeconds}\nif (-not $result.ok) { throw 'Unexpected JSON payload' }`,
          ],
          { encoding: 'utf-8', timeout: 10_000, windowsHide: true },
          (error) => (error ? reject(error) : resolve()),
        );
      });

    try {
      await expect(runProbe(2)).resolves.toBeUndefined();
      responseDelayMs = 1_500;
      await expect(runProbe(1)).rejects.toBeDefined();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('retries one transient built-in proxy liveness timeout and stays bounded', async () => {
    if (process.platform !== 'win32') return;

    const pwsh = powershellProbeExecutable();
    const script = fs.readFileSync(
      path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'),
      'utf-8',
    );
    const helperStart = script.indexOf('function Invoke-JsonRequest {');
    const helperEnd = script.indexOf('\nfunction Invoke-JsonPostRequest {');
    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);
    const helpers = script.slice(helperStart, helperEnd);
    expect(helpers).toContain('function Invoke-BuiltInProxyLivenessProbe {');
    expect(helpers).toContain('[int]$AttemptTimeoutSeconds = 5');
    expect(helpers).toContain('[int]$MaxAttempts = 2');

    const runProbe = (mode: 'recover' | 'fail') =>
      new Promise<void>((resolve, reject) => {
        const stub = mode === 'recover'
          ? `
$script:requestCount = 0
function Invoke-JsonRequest {
  param([string]$Uri, [int]$TimeoutSeconds)
  $script:requestCount += 1
  if ($script:requestCount -eq 1) { throw 'simulated timeout' }
  return [pscustomobject]@{ status = 'healthy' }
}
$result = Invoke-BuiltInProxyLivenessProbe -Uri 'http://127.0.0.1:1/' -AttemptTimeoutSeconds 1 -MaxAttempts 2 -RetryDelayMilliseconds 0
if ($result.status -cne 'healthy') { throw 'Unexpected liveness payload' }
if ($script:requestCount -ne 2) { throw "Expected two liveness requests, got $script:requestCount" }
`
          : `
$script:requestCount = 0
function Invoke-JsonRequest {
  param([string]$Uri, [int]$TimeoutSeconds)
  $script:requestCount += 1
  throw 'simulated timeout'
}
$failed = $false
try {
  [void](Invoke-BuiltInProxyLivenessProbe -Uri 'http://127.0.0.1:1/' -AttemptTimeoutSeconds 1 -MaxAttempts 2 -RetryDelayMilliseconds 0)
} catch {
  $failed = $true
  if ($_.Exception.Message -cne 'simulated timeout') { throw }
}
if (-not $failed) { throw 'Persistent liveness failure was not rethrown' }
if ($script:requestCount -ne 2) { throw "Expected two liveness requests, got $script:requestCount" }
`;
        execFile(
          pwsh,
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `${helpers}\n${stub}`,
          ],
          { encoding: 'utf-8', timeout: 10_000, windowsHide: true },
          (error) => (error ? reject(error) : resolve()),
        );
      });

    await expect(runProbe('recover')).resolves.toBeUndefined();
    await expect(runProbe('fail')).resolves.toBeUndefined();
  });

  it('retries only transient desktop session bootstrap failures and preserves the service log', async () => {
    if (process.platform !== 'win32') return;

    const pwsh = powershellProbeExecutable();
    const script = fs.readFileSync(
      path.join(ROOT, 'scripts', 'certify-windows-installer.ps1'),
      'utf-8',
    );
    const helperStart = script.indexOf('function Invoke-JsonRequest {');
    const helperEnd = script.indexOf('\nfunction Invoke-JsonPostRequest {');
    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);
    const helpers = script.slice(helperStart, helperEnd);
    const sessionHelperStart = helpers.indexOf('function Invoke-SessionTokenBootstrapProbe {');
    expect(sessionHelperStart).toBeGreaterThanOrEqual(0);
    const sessionHelper = helpers.slice(sessionHelperStart);
    expect(sessionHelper).toContain('[int]$AttemptTimeoutSeconds = 5');
    expect(sessionHelper).toContain('[int]$MaxAttempts = 2');
    expect(script).toContain(
      '$tokenResponse = Invoke-SessionTokenBootstrapProbe `',
    );
    expect(script).toContain(
      "-Headers @{ 'x-waggle-desktop-bootstrap' = $bootstrapToken }",
    );
    expect(script).toContain("$serviceLog = Join-Path $dataDir 'logs\\service.log'");

    const runProbe = (mode: 'recover' | 'persistent' | 'forbidden') =>
      new Promise<void>((resolve, reject) => {
        const stub = `
$script:requests = @()
function Invoke-JsonRequest {
  param([string]$Uri, [hashtable]$Headers, [int]$TimeoutSeconds)
  $script:requests += [pscustomobject]@{
    Uri = $Uri
    Bootstrap = [string]$Headers['x-waggle-desktop-bootstrap']
    TimeoutSeconds = $TimeoutSeconds
  }
  if ('${mode}' -eq 'recover' -and $script:requests.Count -gt 1) {
    return [pscustomobject]@{ token = 'certifier-session-token' }
  }
  if ('${mode}' -eq 'forbidden') {
    $exception = [System.Exception]::new('simulated HTTP 403')
    $exception | Add-Member -NotePropertyName Response -NotePropertyValue (
      [pscustomobject]@{ StatusCode = 403 }
    )
    throw $exception
  }
  throw [System.Threading.Tasks.TaskCanceledException]::new('simulated timeout')
}
$failed = $false
try {
  $result = Invoke-SessionTokenBootstrapProbe -Uri 'http://127.0.0.1:1/api/auth/session-token' -Headers @{ 'x-waggle-desktop-bootstrap' = 'sentinel-bootstrap' } -AttemptTimeoutSeconds 1 -MaxAttempts 2 -RetryDelayMilliseconds 0
  if ('${mode}' -ne 'recover') { throw 'Expected session bootstrap failure' }
  if ($result.token -cne 'certifier-session-token') { throw 'Unexpected token payload' }
} catch {
  $failed = $true
  if ('${mode}' -eq 'recover') { throw }
  if ('${mode}' -eq 'forbidden' -and [int]$_.Exception.Response.StatusCode -ne 403) { throw }
}
if ('${mode}' -ne 'recover' -and -not $failed) { throw 'Failure was not rethrown' }
$expectedCount = if ('${mode}' -eq 'forbidden') { 1 } else { 2 }
if ($script:requests.Count -ne $expectedCount) {
  throw "Expected $expectedCount session bootstrap requests, got $($script:requests.Count)"
}
foreach ($request in $script:requests) {
  if ($request.Uri -cne 'http://127.0.0.1:1/api/auth/session-token') { throw 'Session bootstrap URI was not forwarded' }
  if ($request.Bootstrap -cne 'sentinel-bootstrap') { throw 'Session bootstrap header was not forwarded' }
  if ($request.TimeoutSeconds -ne 1) { throw 'Session bootstrap timeout was not forwarded' }
}
`;
        execFile(
          pwsh,
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `Set-StrictMode -Version Latest\n${helpers}\n${stub}`,
          ],
          { encoding: 'utf-8', timeout: 10_000, windowsHide: true },
          (error) => (error ? reject(error) : resolve()),
        );
      });

    await expect(runProbe('recover')).resolves.toBeUndefined();
    await expect(runProbe('persistent')).resolves.toBeUndefined();
    await expect(runProbe('forbidden')).resolves.toBeUndefined();
  });
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

  it('starts the E2E server with the same Node runtime without shadowing external tool PATH', () => {
    const conf = path.join(ROOT, 'playwright.config.ts');
    const tsxCli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const probeSource = `
      (async () => {
      process.execPath = process.env.WAGGLE_PROBE_NODE_EXEC;
      const { default: config } = await import(${JSON.stringify(pathToFileURL(conf).href)});
      const webServer = Array.isArray(config.webServer)
        ? config.webServer[0]
        : config.webServer;
      const pathKey = Object.keys(webServer.env)
        .find((key) => key.toLowerCase() === 'path');
      console.log(JSON.stringify({
        command: webServer.command,
        reuseExistingServer: webServer.reuseExistingServer,
        timeout: webServer.timeout,
        nodeValue: webServer.env.WAGGLE_E2E_NODE_EXEC,
        pathValue: webServer.env[pathKey],
        secretValue: webServer.env.WAGGLE_PROBE_AMBIENT_API_KEY,
      }));
      })();
    `;
    const adversarialNodePaths = process.platform === 'win32'
      ? [
          process.execPath,
          'C:\\Program Files\\Node %PATH% & safe\\node.exe',
          'C:\\Node (QA) !bang!\\node.exe',
        ]
      : [
          process.execPath,
          '/opt/Node $HOME `touch nope` & safe/node',
          '/opt/Node (QA) !bang!/node',
        ];

    for (const nodePath of adversarialNodePaths) {
      const result = spawnSync(
      process.execPath,
      [tsxCli, '--eval', probeSource],
      {
        cwd: ROOT,
        encoding: 'utf-8',
        env: {
          ...process.env,
          WAGGLE_E2E_SKIP_LITELLM: '1',
          WAGGLE_E2E_REUSE_EXISTING_SERVER: '0',
          WAGGLE_PROBE_NODE_EXEC: nodePath,
          WAGGLE_PROBE_AMBIENT_API_KEY: 'must-not-enter-playwright-config',
        },
        timeout: 30_000,
        windowsHide: true,
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const output = result.stdout.trim().split(/\r?\n/).at(-1);
    const webServer = JSON.parse(output ?? '{}') as {
      command?: string;
      reuseExistingServer?: boolean;
      timeout?: number;
      nodeValue?: string;
      pathValue?: string;
      secretValue?: string;
    };
    const nodeReference = process.platform === 'win32'
      ? '"%WAGGLE_E2E_NODE_EXEC%"'
      : '"$WAGGLE_E2E_NODE_EXEC"';
    expect(webServer.command).toBe(
      `npm run build:all && ${nodeReference} `
      + 'node_modules/tsx/dist/cli.mjs packages/server/src/local/start.ts --skip-litellm',
    );
    expect(webServer.command).not.toContain(nodePath);
    expect(webServer.reuseExistingServer).toBe(false);
    expect(webServer.timeout).toBe(600_000);
    expect(webServer.nodeValue).toBe(nodePath);
    expect(webServer.pathValue).toBeUndefined();
    expect(webServer.secretValue).toBeUndefined();
    }
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

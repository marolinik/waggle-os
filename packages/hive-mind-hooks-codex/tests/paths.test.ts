import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import {
  allHookBasenames,
  backupPathFor,
  hookCommandFor,
  resolvePaths,
} from '../src/paths.js';

describe('resolvePaths (codex)', () => {
  it('places hooks.json + pointer under <home>/.codex/', () => {
    const home = resolve('/fake/home');
    const paths = resolvePaths({ home, hooksDir: resolve('/some/dist/hooks') });
    expect(paths.codexDir).toBe(join(home, '.codex'));
    // Codex targets a STANDALONE hooks.json — NOT config.toml.
    expect(paths.configPath).toBe(join(home, '.codex', 'hooks.json'));
    expect(paths.pointerPath).toBe(join(home, '.codex', 'hive-mind-install.json'));
  });

  it('hooksDir override wins over moduleUrl', () => {
    const explicit = resolve('/x/y/hooks');
    const paths = resolvePaths({
      home: resolve('/h'),
      hooksDir: explicit,
      moduleUrl: 'file:///irrelevant/dist/install.js',
    });
    expect(paths.hooksDir).toBe(explicit);
  });

  it('falls back to cwd/dist/hooks when neither moduleUrl nor hooksDir is given', () => {
    const paths = resolvePaths({ home: resolve('/h') });
    expect(paths.hooksDir).toBe(resolve(process.cwd(), 'dist', 'hooks'));
  });
});

describe('hookCommandFor (codex)', () => {
  it('produces a quoted node invocation around the absolute script path', () => {
    const cmd = hookCommandFor(resolve('/abs/dist/hooks/session-start.js'), undefined, { platform: 'linux' });
    expect(cmd).toMatch(/^node "[^"]+session-start\.js"$/);
  });

  it('appends --cli-path when supplied', () => {
    const cmd = hookCommandFor(
      resolve('/abs/dist/hooks/session-start.js'),
      '/abs/cli/dist/index.js',
      { platform: 'linux' },
    );
    expect(cmd).toMatch(/--cli-path "\/abs\/cli\/dist\/index\.js"$/);
  });

  it('omits --cli-path when empty string is passed', () => {
    const cmd = hookCommandFor(resolve('/abs/dist/hooks/session-start.js'), '', { platform: 'linux' });
    expect(cmd).not.toContain('--cli-path');
  });

  it.runIf(process.platform === 'win32')(
    'survives Codex Rust cmd.exe /C dispatch with spaces and apostrophes',
    async () => {
      const root = await mkdtemp(join(tmpdir(), "codex hook O'Brien "));
      try {
        const stdinMarker = 'CODEX_STDIN_čćžšđ_漢_🐝';
        const stdoutMarker = 'CODEX_STDOUT_čćžšđ_漢_🐝';
        const stderrMarker = 'CODEX_STDERR_čćžšđ_漢_🐝';
        const fixtureDir = join(root, "fixture dir O'Brien");
        const scriptPath = join(fixtureDir, "hook O'Brien.mjs");
        const cliPath = join(root, "cli dir O'Brien", 'index.js');
        const nodePath = join(root, "node runtime O'Brien.exe");
        const decoyPowerShell = join(root, 'powershell.exe');
        const rustSource = join(root, 'codex-runner.rs');
        const rustExe = join(root, 'codex-runner.exe');
        await mkdir(fixtureDir, { recursive: true });
        await copyFile(process.execPath, nodePath);
        await writeFile(decoyPowerShell, 'DECOY_WORKSPACE_POWERSHELL', 'utf8');
        await writeFile(scriptPath, [
          "let stdin = '';",
          `const stdoutMarker = ${JSON.stringify(stdoutMarker)};`,
          "process.stdin.setEncoding('utf8');",
          "for await (const chunk of process.stdin) stdin += chunk;",
          "process.stdout.write(JSON.stringify({ stdin, argv: process.argv.slice(2), stdoutMarker }));",
          `process.stderr.write(${JSON.stringify(stderrMarker)});`,
          'process.exitCode = 23;',
          '',
        ].join('\n'), 'utf8');
        await writeFile(rustSource, String.raw`
use std::env;
use std::io::{self, Read, Write};
use std::process::{Command, Stdio};

fn main() {
    let command = env::var("CODEX_TEST_COMMAND").expect("CODEX_TEST_COMMAND");
    let comspec = env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string());
    let mut input = Vec::new();
    io::stdin().read_to_end(&mut input).expect("read stdin");
    let mut child = Command::new(comspec)
        .arg("/C")
        .arg(command)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn cmd.exe");
    child.stdin.take().expect("child stdin").write_all(&input).expect("forward stdin");
    let output = child.wait_with_output().expect("wait for cmd.exe");
    io::stdout().write_all(&output.stdout).expect("forward stdout");
    io::stderr().write_all(&output.stderr).expect("forward stderr");
    std::process::exit(output.status.code().unwrap_or(1));
}
`, 'utf8');

        const compile = spawnSync('rustc', [rustSource, '-o', rustExe], {
          encoding: 'utf8',
          windowsHide: true,
        });
        expect(compile.status, compile.stderr).toBe(0);

        const command = hookCommandFor(scriptPath, cliPath, { platform: 'win32', nodePath });
        expect(command).toMatch(/^%SystemRoot%\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand [A-Za-z0-9+/=]+$/);
        expect(command).not.toContain('"');
        const payload = Buffer.from(command.split(' ').at(-1) as string, 'base64').toString('utf16le');
        expect(payload).toContain(`& '${nodePath.replaceAll("'", "''")}'`);

        const run = spawnSync(rustExe, [], {
          cwd: root,
          env: { ...process.env, CODEX_TEST_COMMAND: command },
          input: stdinMarker,
          encoding: 'utf8',
          windowsHide: true,
        });
        expect(run.status).toBe(23);
        expect(JSON.parse(run.stdout)).toEqual({
          stdin: stdinMarker,
          argv: ['--cli-path', cliPath],
          stdoutMarker,
        });
        expect(run.stderr).toBe(stderrMarker);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    30_000,
  );
});

describe('backupPathFor (codex)', () => {
  it('replaces colons and dots in the timestamp for filesystem safety', () => {
    const backup = backupPathFor('/h/.codex/hooks.json', '2026-04-28T10:30:45.123Z');
    expect(backup).toBe('/h/.codex/hooks.json.hive-mind-backup.2026-04-28T10-30-45-123Z');
  });
});

describe('allHookBasenames (codex)', () => {
  it('returns the four canonical basenames (CC clone)', () => {
    expect([...allHookBasenames()].sort()).toEqual([
      'pre-compact',
      'session-start',
      'stop',
      'user-prompt-submit',
    ]);
  });
});

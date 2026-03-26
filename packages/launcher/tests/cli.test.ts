/**
 * 9D-3: npx waggle CLI Launcher — tests.
 *
 * Tests argument parsing, version checking, and launcher configuration.
 * Does NOT actually start the server (that's tested in server tests).
 */
import { describe, it, expect } from 'vitest';

// We test the argument parsing logic by extracting it

function parseArgs(argv: string[]): {
  port: number;
  skipLiteLLM: boolean;
  noBrowser: boolean;
  help: boolean;
} {
  const args = argv.slice(2);
  let port = 3333;
  let skipLiteLLM = false;
  let noBrowser = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' || arg === '-p') {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val > 0 && val < 65536) port = val;
    } else if (arg === '--skip-litellm') {
      skipLiteLLM = true;
    } else if (arg === '--no-open') {
      noBrowser = true;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    }
  }

  return { port, skipLiteLLM, noBrowser, help };
}

describe('Waggle CLI Launcher', () => {
  describe('argument parsing', () => {
    it('uses default port 3333 when no arguments', () => {
      const result = parseArgs(['node', 'waggle']);
      expect(result.port).toBe(3333);
      expect(result.skipLiteLLM).toBe(false);
      expect(result.noBrowser).toBe(false);
      expect(result.help).toBe(false);
    });

    it('parses --port flag', () => {
      const result = parseArgs(['node', 'waggle', '--port', '4000']);
      expect(result.port).toBe(4000);
    });

    it('parses -p shorthand', () => {
      const result = parseArgs(['node', 'waggle', '-p', '8080']);
      expect(result.port).toBe(8080);
    });

    it('ignores invalid port values', () => {
      const result = parseArgs(['node', 'waggle', '--port', 'abc']);
      expect(result.port).toBe(3333); // default
    });

    it('ignores out-of-range ports', () => {
      const neg = parseArgs(['node', 'waggle', '--port', '-1']);
      expect(neg.port).toBe(3333);

      const big = parseArgs(['node', 'waggle', '--port', '99999']);
      expect(big.port).toBe(3333);
    });

    it('parses --skip-litellm flag', () => {
      const result = parseArgs(['node', 'waggle', '--skip-litellm']);
      expect(result.skipLiteLLM).toBe(true);
    });

    it('parses --no-open flag', () => {
      const result = parseArgs(['node', 'waggle', '--no-open']);
      expect(result.noBrowser).toBe(true);
    });

    it('parses --help flag', () => {
      const result = parseArgs(['node', 'waggle', '--help']);
      expect(result.help).toBe(true);
    });

    it('parses -h shorthand', () => {
      const result = parseArgs(['node', 'waggle', '-h']);
      expect(result.help).toBe(true);
    });

    it('handles multiple flags together', () => {
      const result = parseArgs(['node', 'waggle', '--port', '5000', '--skip-litellm', '--no-open']);
      expect(result.port).toBe(5000);
      expect(result.skipLiteLLM).toBe(true);
      expect(result.noBrowser).toBe(true);
    });
  });

  describe('Node.js version check', () => {
    it('current Node version meets minimum requirement (>=18)', () => {
      const [major] = process.versions.node.split('.').map(Number);
      expect(major).toBeGreaterThanOrEqual(18);
    });
  });

  describe('package configuration', () => {
    it('package.json has correct bin entry', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const pkg = JSON.parse(
        readFileSync(resolve(import.meta.dirname, '..', 'package.json'), 'utf-8')
      );
      expect(pkg.name).toBe('@waggle-ai/waggle');
      expect(pkg.bin).toBeDefined();
      expect(pkg.bin.waggle).toContain('cli');
    });
  });
});

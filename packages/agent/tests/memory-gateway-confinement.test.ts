import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CA-4 guard: exactly one module in `@waggle/agent` may name a `@waggle/core`
 * memory gateway in code.
 *
 * CA-3 gave the use cases ports; CA-4 moved the concrete wiring behind
 * `memory-layers-default.ts`. Nothing stops the next change from writing
 * `new FrameStore(db)` back into a route or a use case — the types still allow
 * it, because the gateway satisfies the port. This test is what stops it, and
 * it reads the source rather than the module graph so a gateway named in a type
 * position is caught too.
 *
 * Comments are exempt on purpose. Half a dozen modules explain themselves by
 * referring to `HybridSearch` or `SessionStore` by name, and forbidding that
 * would push the code toward vaguer comments to satisfy a test.
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/** The one module allowed to construct them, relative to `src/`. */
const WIRING_MODULE = 'memory-layers-default.ts';

const GATEWAYS = [
  'FrameStore',
  'SessionStore',
  'HybridSearch',
  'KnowledgeGraph',
  'IdentityLayer',
  'AwarenessLayer',
  'ImprovementSignalStore',
] as const;

function sourceFiles(dir: string, base = ''): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;
    if (statSync(full).isDirectory()) return sourceFiles(full, rel);
    return entry.endsWith('.ts') ? [rel] : [];
  });
}

/** Strip line and block comments so prose naming a gateway does not count. */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('CA-4 — the memory gateways stay behind one wiring module', () => {
  const files = sourceFiles(SRC);

  it('finds the source tree it is meant to guard', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain(WIRING_MODULE);
  });

  it('names a @waggle/core memory gateway in code nowhere else', () => {
    const offenders: string[] = [];

    for (const rel of files) {
      if (rel === WIRING_MODULE) continue;
      const code = codeOnly(readFileSync(join(SRC, rel), 'utf8'));
      for (const gateway of GATEWAYS) {
        if (new RegExp(`\\b${gateway}\\b`).test(code)) offenders.push(`${rel} :: ${gateway}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('is not vacuous — the wiring module itself would fail the same check', () => {
    const code = codeOnly(readFileSync(join(SRC, WIRING_MODULE), 'utf8'));
    const named = GATEWAYS.filter((gateway) => new RegExp(`\\b${gateway}\\b`).test(code));

    expect(named).toEqual([...GATEWAYS]);
  });
});

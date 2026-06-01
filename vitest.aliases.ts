import { readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Map every `@waggle/<dir>` workspace package to its TypeScript source entry
 * (`packages/<dir>/src/index.ts`) so vitest resolves them from source without
 * a build step.
 *
 * Why: several packages (shared, all hive-mind-*, cli, mcp-server) declare a
 * `dist/` entry in package.json `exports` — correct for publishing, but on a
 * fresh checkout (including CI) `dist/` isn't built, so importing them in tests
 * fails with "Failed to resolve entry for package". Aliasing to `src/` — the
 * same trick the former inline `@waggle/marketplace` alias used — makes the test
 * environment build-independent. Packages that already export `src/` (agent,
 * core, …) resolve to the same place, so the alias is a no-op for them.
 *
 * Only packages with a real `src/index.ts` are aliased (guarded), so dirs
 * without that entry (e.g. admin-web) are left to normal resolution.
 *
 * The alias target is the `src/` DIRECTORY (not `src/index.ts`): vite resolves
 * a bare `@waggle/x` import to the directory's index, AND a subpath import like
 * `@waggle/server/local/service` to `…/src/local/service`. Pointing at the file
 * instead would rewrite the subpath to `…/src/index.ts/local/service` and break.
 */
export function waggleSrcAliases(repoRoot: string): Record<string, string> {
  const pkgsDir = resolve(repoRoot, 'packages');
  const aliases: Record<string, string> = {};
  for (const dir of readdirSync(pkgsDir)) {
    const srcDir = join(pkgsDir, dir, 'src');
    if (existsSync(join(srcDir, 'index.ts'))) {
      aliases[`@waggle/${dir}`] = srcDir;
    }
  }
  return aliases;
}

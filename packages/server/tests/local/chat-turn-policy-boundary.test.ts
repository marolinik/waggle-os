/**
 * Phase 5 (clean-architecture) boundary guard for `routes/chat-turn-policy.ts`.
 *
 * The policy module holds application business rules — what a single chat turn
 * is allowed to do. The whole point of moving it out of `routes/chat.ts` is that
 * those rules no longer drag the delivery mechanism and the persistence package
 * behind them. Nothing in the type system enforces that, so this test walks the
 * module's transitive import graph and fails the first time an outward import
 * appears.
 *
 * It is deliberately a source-level walk rather than a runtime probe: an import
 * that only a rare branch reaches still costs every consumer the load, and a
 * runtime probe would miss it. Type-only imports are erased by the compiler and
 * are recorded separately rather than counted against the boundary.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'local',
  'routes',
);
const ENTRY = path.join(ROUTES_DIR, 'chat-turn-policy.ts');

/** Bare specifiers the policy layer may depend on at runtime. Inward only. */
const ALLOWED_RUNTIME_PACKAGES = ['@waggle/agent/permissions', '@waggle/agent/tool-filter'];

/**
 * A single import or re-export statement. `typeOnly` covers `import type {…}`;
 * inline `type` markers inside a value import still leave a runtime edge, so
 * they are not treated as erased.
 */
interface ImportEdge {
  specifier: string;
  typeOnly: boolean;
}

function readImportEdges(file: string): ImportEdge[] {
  const source = fs.readFileSync(file, 'utf8');
  const pattern = /^\s*(?:import|export)\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
  const edges: ImportEdge[] = [];
  for (const match of source.matchAll(pattern)) {
    edges.push({ specifier: match[2], typeOnly: Boolean(match[1]) });
  }
  return edges;
}

function resolveRelative(fromFile: string, specifier: string): string {
  const resolved = path.resolve(path.dirname(fromFile), specifier.replace(/\.js$/, '.ts'));
  return resolved;
}

function walk(entry: string): { files: string[]; runtime: Set<string>; typeOnly: Set<string> } {
  const files: string[] = [];
  const runtime = new Set<string>();
  const typeOnly = new Set<string>();
  const queue = [entry];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    files.push(path.relative(ROUTES_DIR, file).split(path.sep).join('/'));
    for (const edge of readImportEdges(file)) {
      if (edge.specifier.startsWith('.')) {
        queue.push(resolveRelative(file, edge.specifier));
        continue;
      }
      (edge.typeOnly ? typeOnly : runtime).add(edge.specifier);
    }
  }
  return { files, runtime, typeOnly };
}

describe('chat-turn-policy boundary', () => {
  const graph = walk(ENTRY);

  it('depends on no framework, no persistence and no node built-in at runtime', () => {
    expect([...graph.runtime].sort()).toEqual([...ALLOWED_RUNTIME_PACKAGES].sort());
  });

  it('names fastify nowhere in the graph, not even as a type', () => {
    expect([...graph.typeOnly].filter(specifier => specifier.includes('fastify'))).toEqual([]);
  });

  it('reaches only the leaf modules the policy actually needs', () => {
    // The whole graph, spelled out: adding a file here is a design decision,
    // not an accident. `provider-model-catalog.ts` has no imports at all.
    expect(graph.files.sort()).toEqual([
      '../provider-model-catalog.ts',
      'chat-helpers.ts',
      'chat-turn-policy.ts',
    ]);
  });

  it('keeps the route module out of the policy graph', () => {
    // The direction that matters: chat.ts imports the policy, never the reverse.
    expect(graph.files).not.toContain('chat.ts');
  });
});

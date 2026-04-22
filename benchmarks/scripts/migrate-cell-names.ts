#!/usr/bin/env tsx
/**
 * Sprint 12 Task 1 Blocker #2 — legacy cell-name migration.
 *
 * Rewrites `cell` field values in Sprint 10 JSONL artifacts from the old
 * Sprint 10 technical names to the A3 LOCK publication-ready names:
 *
 *   memory-only → filtered
 *   evolve-only → compressed
 *   full-stack  → full-context
 *
 * `raw` and `verbose-fixed` (the control) are unchanged.
 *
 * PM verdict (ratified 2026-04-22): prepisivanje, NOT backward-compat polje.
 * Sprint 10 artifacts are pre-publication and have no downstream consumers
 * that depend on the old keys.
 *
 * Behaviour:
 *   - Walks `benchmarks/results/sprint-10/**\/*.jsonl` (the brief's canonical
 *     location). Also accepts `--path <dir>` for one-off directories.
 *   - Before any rewrite, copies the entire tree to
 *     `benchmarks/results/sprint-10-pre-rename/` (or `<path>-pre-rename/`).
 *     Backup is a one-shot: if the backup dir already exists, migration
 *     skips the backup step and assumes the original pre-rename set is
 *     preserved.
 *   - Idempotent: rows already keyed with the new names pass through
 *     unchanged. Running twice is a no-op.
 *   - Emits a summary per file (rows touched vs rows left alone) and a
 *     final total.
 *
 * Zero LLM calls. Pure filesystem rewrite. No network.
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const CELL_RENAMES: Record<string, string> = {
  'memory-only': 'filtered',
  'evolve-only': 'compressed',
  'full-stack': 'full-context',
};

interface MigrationStats {
  filesScanned: number;
  filesRewritten: number;
  rowsTotal: number;
  rowsTouched: number;
  rowsLegacyFound: Record<string, number>;
  backupPath: string | null;
  dryRun: boolean;
}

function walkJsonlFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip backup dirs so we don't recursively migrate our own snapshots.
        if (entry.name.endsWith('-pre-rename')) continue;
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function copyTree(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const stack: string[] = [''];
  while (stack.length > 0) {
    const rel = stack.pop()!;
    const srcPath = path.join(src, rel);
    const destPath = path.join(dest, rel);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      for (const child of fs.readdirSync(srcPath)) {
        // Do not recurse into an existing backup dir inside the source.
        if (child.endsWith('-pre-rename')) continue;
        stack.push(path.join(rel, child));
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function migrateFile(
  filePath: string,
  stats: MigrationStats,
): { rewritten: boolean; rowsTouched: number } {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n');
  const out: string[] = [];
  let rowsTouched = 0;

  for (const rawLine of lines) {
    const line = rawLine;
    if (line.length === 0) {
      out.push(line);
      continue;
    }
    // Preserve comment lines verbatim (e.g. calibration JSONL header).
    if (line.startsWith('#')) {
      out.push(line);
      continue;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // Malformed line — leave untouched, surface via logs.
      console.warn(`[migrate-cell-names]   skipping malformed JSON line in ${filePath}`);
      out.push(line);
      continue;
    }
    stats.rowsTotal++;
    const currentCell = parsed.cell;
    if (typeof currentCell === 'string' && currentCell in CELL_RENAMES) {
      stats.rowsLegacyFound[currentCell] = (stats.rowsLegacyFound[currentCell] ?? 0) + 1;
      parsed.cell = CELL_RENAMES[currentCell];
      out.push(JSON.stringify(parsed));
      rowsTouched++;
    } else {
      out.push(line);
    }
  }

  if (rowsTouched === 0) {
    return { rewritten: false, rowsTouched: 0 };
  }

  if (!stats.dryRun) {
    fs.writeFileSync(filePath, out.join('\n'), 'utf-8');
  }
  return { rewritten: true, rowsTouched };
}

function parseCliArgs(argv: string[]): { path: string; dryRun: boolean } {
  let pathArg: string | null = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === '--path' && next) {
      pathArg = next;
      i++;
    } else if (flag === '--dry-run') {
      dryRun = true;
    } else if (flag === '--help' || flag === '-h') {
      console.log(
        'Usage: migrate-cell-names [--path <dir>] [--dry-run]\n' +
        '  --path <dir>  Override the default scan root (benchmarks/results/sprint-10).\n' +
        '  --dry-run     Report what would change without writing files.',
      );
      process.exit(0);
    }
  }
  return { path: pathArg ?? 'benchmarks/results/sprint-10', dryRun };
}

function main(): void {
  const args = parseCliArgs(process.argv.slice(2));
  const here = url.fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(here), '..', '..');
  const absPath = path.isAbsolute(args.path) ? args.path : path.resolve(repoRoot, args.path);

  const stats: MigrationStats = {
    filesScanned: 0,
    filesRewritten: 0,
    rowsTotal: 0,
    rowsTouched: 0,
    rowsLegacyFound: {},
    backupPath: null,
    dryRun: args.dryRun,
  };

  console.log(`[migrate-cell-names] scan root: ${absPath}`);
  console.log(`[migrate-cell-names] mode: ${args.dryRun ? 'dry-run' : 'write'}`);

  if (!fs.existsSync(absPath)) {
    console.log(`[migrate-cell-names] ${absPath} does not exist — nothing to migrate.`);
    console.log('[migrate-cell-names] exit: no-op (Sprint 10 results dir not present)');
    return;
  }

  const files = walkJsonlFiles(absPath);
  stats.filesScanned = files.length;

  if (files.length === 0) {
    console.log(`[migrate-cell-names] no .jsonl files under ${absPath} — nothing to migrate.`);
    return;
  }

  // Create backup before any write (one-shot: skip if backup dir already exists).
  const backupPath = `${absPath.replace(/[/\\]$/, '')}-pre-rename`;
  if (!args.dryRun) {
    if (fs.existsSync(backupPath)) {
      console.log(
        `[migrate-cell-names] backup dir already exists at ${backupPath}; ` +
        'skipping copy (preserving first-run pre-rename snapshot).',
      );
    } else {
      copyTree(absPath, backupPath);
      stats.backupPath = backupPath;
      console.log(`[migrate-cell-names] backup: ${backupPath}`);
    }
  }

  for (const file of files) {
    const result = migrateFile(file, stats);
    if (result.rewritten) {
      stats.filesRewritten++;
      console.log(`[migrate-cell-names]   rewrote ${path.relative(repoRoot, file)} (${result.rowsTouched} rows)`);
    } else {
      console.log(`[migrate-cell-names]   clean   ${path.relative(repoRoot, file)} (already migrated or no legacy keys)`);
    }
  }

  stats.rowsTouched = Object.values(stats.rowsLegacyFound).reduce((a, b) => a + b, 0);

  console.log('[migrate-cell-names] summary:');
  console.log(`  files scanned:   ${stats.filesScanned}`);
  console.log(`  files rewritten: ${stats.filesRewritten}`);
  console.log(`  rows total:      ${stats.rowsTotal}`);
  console.log(`  rows touched:    ${stats.rowsTouched}`);
  console.log('  legacy keys found:', stats.rowsLegacyFound);
  if (stats.backupPath) {
    console.log(`  backup at:       ${stats.backupPath}`);
  }
  if (args.dryRun) {
    console.log('[migrate-cell-names] DRY RUN — no files were modified.');
  }
}

main();

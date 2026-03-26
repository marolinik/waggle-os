/**
 * Skill Hash Store — SHA-256 content hashing for skill update detection.
 *
 * Stores hashes of skill file content in the .mind DB. On server startup,
 * compares current file hashes to stored hashes to detect changes.
 * Follows the same ensureTable pattern as CronStore / InstallAuditStore.
 */

import * as crypto from 'node:crypto';
import type { MindDB } from './mind/db.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface SkillHash {
  name: string;
  hash: string;
  verified_at: string;
}

// ── Table DDL ──────────────────────────────────────────────────────────

export const SKILL_HASHES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS skill_hashes (
  name TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  verified_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// ── Helpers ────────────────────────────────────────────────────────────

/** Compute SHA-256 hex digest of skill content. */
export function computeSkillHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ── Store ──────────────────────────────────────────────────────────────

export class SkillHashStore {
  private db: MindDB;

  constructor(db: MindDB) {
    this.db = db;
    this.ensureTable();
  }

  private ensureTable(): void {
    const raw = this.db.getDatabase();
    const exists = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='skill_hashes'",
    ).get();
    if (!exists) {
      raw.exec(SKILL_HASHES_TABLE_SQL);
    }
  }

  /** Store or update hash for a skill. */
  setHash(name: string, hash: string): void {
    this.db.getDatabase().prepare(`
      INSERT INTO skill_hashes (name, hash) VALUES (?, ?)
      ON CONFLICT (name) DO UPDATE SET hash = ?, verified_at = datetime('now')
    `).run(name, hash, hash);
  }

  /** Get stored hash for a skill. */
  getHash(name: string): SkillHash | undefined {
    return this.db.getDatabase().prepare(
      'SELECT * FROM skill_hashes WHERE name = ?',
    ).get(name) as SkillHash | undefined;
  }

  /** Remove hash (when skill is deleted). */
  removeHash(name: string): void {
    this.db.getDatabase().prepare('DELETE FROM skill_hashes WHERE name = ?').run(name);
  }

  /**
   * Check all skills against stored hashes.
   * Returns lists of changed, added, and removed skill names.
   */
  checkAll(currentSkills: Array<{ name: string; content: string }>): {
    changed: string[];
    added: string[];
    removed: string[];
  } {
    const storedHashes = this.db.getDatabase().prepare(
      'SELECT name, hash FROM skill_hashes',
    ).all() as SkillHash[];
    const storedMap = new Map(storedHashes.map(h => [h.name, h.hash]));
    const currentNames = new Set(currentSkills.map(s => s.name));

    const changed: string[] = [];
    const added: string[] = [];

    for (const skill of currentSkills) {
      const currentHash = computeSkillHash(skill.content);
      const storedHash = storedMap.get(skill.name);

      if (!storedHash) {
        added.push(skill.name);
      } else if (storedHash !== currentHash) {
        changed.push(skill.name);
      }
    }

    const removed = storedHashes
      .filter(h => !currentNames.has(h.name))
      .map(h => h.name);

    return { changed, added, removed };
  }

  /** Mark a skill as verified (update hash to current content). */
  verify(name: string, content: string): void {
    this.setHash(name, computeSkillHash(content));
  }

  /** Clear all hashes (for testing). */
  clear(): void {
    this.db.getDatabase().prepare('DELETE FROM skill_hashes').run();
  }
}

/**
 * Skills 2.0 gap F — skill usage tracking.
 *
 * Sidecar JSON store at ~/.waggle/skill-usage.json that tracks when each
 * installed skill was last referenced and how many times. Consumed by
 * retireStaleSkills to decide which SKILL.md files to archive.
 *
 * JSON schema:
 *   {
 *     "skill-stem": { "lastUsedAt": "2026-04-15T12:34:56.789Z", "count": 7 },
 *     ...
 *   }
 *
 * Atomic writes: every update goes through a .tmp file + rename so a
 * crash mid-write can't corrupt the index. Missing file is treated as
 * an empty record (no previous usage).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SkillUsageEntry {
  lastUsedAt: string;
  count: number;
}

export type SkillUsageIndex = Record<string, SkillUsageEntry>;

const INDEX_FILENAME = 'skill-usage.json';

export function getSkillUsagePath(waggleHome: string): string {
  return path.join(waggleHome, INDEX_FILENAME);
}

/** Load the usage index. Returns {} on any filesystem or parse failure. */
export function loadSkillUsage(waggleHome: string): SkillUsageIndex {
  const filePath = getSkillUsagePath(waggleHome);
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as SkillUsageIndex;
    }
    return {};
  } catch {
    return {};
  }
}

/** Atomically persist the usage index. */
export function saveSkillUsage(waggleHome: string, index: SkillUsageIndex): void {
  if (!fs.existsSync(waggleHome)) {
    fs.mkdirSync(waggleHome, { recursive: true });
  }
  const filePath = getSkillUsagePath(waggleHome);
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(index, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Record a usage event for a skill. Updates lastUsedAt to now and
 * increments count. Creates the entry when the skill is new.
 * nowFn injectable for deterministic tests.
 */
export function recordSkillUsage(
  waggleHome: string,
  skillName: string,
  nowFn: () => Date = () => new Date(),
): SkillUsageEntry {
  const index = loadSkillUsage(waggleHome);
  const existing = index[skillName];
  const entry: SkillUsageEntry = {
    lastUsedAt: nowFn().toISOString(),
    count: (existing?.count ?? 0) + 1,
  };
  index[skillName] = entry;
  saveSkillUsage(waggleHome, index);
  return entry;
}

/** Remove a skill's usage entry — called after retirement. */
export function forgetSkillUsage(waggleHome: string, skillName: string): void {
  const index = loadSkillUsage(waggleHome);
  if (!(skillName in index)) return;
  delete index[skillName];
  saveSkillUsage(waggleHome, index);
}

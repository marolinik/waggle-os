/**
 * Skills 2.0 gap F — skill decay / auto-retirement.
 *
 * Walks the personal-scope skill directory and moves any SKILL.md file
 * whose last-used timestamp (from skill-usage.json sidecar) is older than
 * maxIdleDays into ~/.waggle/skills-archive/. Parallels the existing
 * decayFrames() behavior in packages/weaver/src/consolidation.ts.
 *
 * Retirement rules:
 *   - Only personal-scope skills are retired automatically. Team /
 *     enterprise skills are co-owned and should be retired by an admin.
 *   - Workspace skills are left alone because they're tied to ongoing
 *     project work whose absence from the usage log is an artifact
 *     rather than evidence of staleness.
 *   - Skills with no usage record are given a grace period based on
 *     the file's mtime (install date) — a brand-new skill is never
 *     retired before its first use window.
 *
 * Retirement moves the file to an archive dir rather than deleting it,
 * so the action is recoverable. The usage index entry is cleared on a
 * successful move.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ImprovementSignalStore } from '@waggle/core';
import { loadSkillUsage, forgetSkillUsage } from './skill-usage.js';

const DEFAULT_MAX_IDLE_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RetireOptions {
  /** Threshold in days. Skills not used within this window are retired. Default 90. */
  maxIdleDays?: number;
  /** If true, report what would be retired but don't move any files. */
  dryRun?: boolean;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
  /** Emit skill_promotion signals for observability. */
  improvementSignals?: ImprovementSignalStore;
}

export interface RetireReport {
  scanned: number;
  retired: string[];
  archived: string[]; // absolute paths to the archived files
  skipped: Array<{ name: string; reason: string }>;
  dryRun: boolean;
}

/** Compute a skill's "last activity" timestamp in ms since epoch. */
function lastActivityMs(
  skillPath: string,
  skillName: string,
  usage: ReturnType<typeof loadSkillUsage>,
): number {
  const entry = usage[skillName];
  if (entry?.lastUsedAt) {
    const parsed = Date.parse(entry.lastUsedAt);
    if (!Number.isNaN(parsed)) return parsed;
  }
  // Fall back to file mtime — treat a never-used skill as "installed at
  // mtime", so the decay window starts from install time.
  try {
    const stat = fs.statSync(skillPath);
    return stat.mtime.getTime();
  } catch {
    return Date.now(); // On error, assume fresh — don't over-retire.
  }
}

/**
 * Retire stale personal-scope skills. Returns a structured report. Does
 * not throw on individual file errors — best-effort per skill.
 */
export function retireStaleSkills(waggleHome: string, opts: RetireOptions = {}): RetireReport {
  const maxIdleDays = opts.maxIdleDays ?? DEFAULT_MAX_IDLE_DAYS;
  const dryRun = opts.dryRun ?? false;
  const now = (opts.now ?? (() => new Date()))();
  const cutoff = now.getTime() - maxIdleDays * MS_PER_DAY;

  const personalSkillsDir = path.join(waggleHome, 'skills');
  const archiveDir = path.join(waggleHome, 'skills-archive');

  const report: RetireReport = {
    scanned: 0,
    retired: [],
    archived: [],
    skipped: [],
    dryRun,
  };

  if (!fs.existsSync(personalSkillsDir)) {
    return report;
  }
  if (!dryRun && !fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  const usage = loadSkillUsage(waggleHome);
  const entries = fs.readdirSync(personalSkillsDir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith('.md'));

  for (const dirent of entries) {
    report.scanned++;
    const skillName = dirent.name.replace(/\.md$/, '');
    const srcPath = path.join(personalSkillsDir, dirent.name);
    const activity = lastActivityMs(srcPath, skillName, usage);

    if (activity >= cutoff) {
      report.skipped.push({ name: skillName, reason: 'fresh' });
      continue;
    }

    if (dryRun) {
      report.retired.push(skillName);
      continue;
    }

    // Timestamp the archive filename so repeated retirements don't collide.
    const stamp = new Date(activity).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const destPath = path.join(archiveDir, `${stamp}_${dirent.name}`);
    try {
      fs.renameSync(srcPath, destPath);
      report.retired.push(skillName);
      report.archived.push(destPath);
      forgetSkillUsage(waggleHome, skillName);

      if (opts.improvementSignals) {
        try {
          opts.improvementSignals.record(
            'workflow_pattern',
            `retire:${skillName}`,
            `Retired unused skill "${skillName}" (idle > ${maxIdleDays} days). Archived to ${destPath}.`,
            { skillName, archivedTo: destPath, maxIdleDays, lastActivityMs: activity },
          );
        } catch { /* non-blocking */ }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.skipped.push({ name: skillName, reason: `move_failed: ${msg}` });
    }
  }

  return report;
}

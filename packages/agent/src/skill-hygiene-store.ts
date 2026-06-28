/**
 * Skill hygiene sidecar (Odysseus §D1).
 *
 * ~/.waggle/skill-hygiene.json records each skill's hygiene status + advisory.
 * The single-LLM-call judge (skill-hygiene.ts) writes here when a skill is found
 * redundant-with-peers or too-generic, DEMOTING it to 'draft'. It never edits or
 * deletes the SKILL.md, so the proven content and its change-detection hash never
 * churn. 'draft' is advisory: the runtime excludes drafts from the active prompt
 * (loadActiveSkills) while the Skills Hub still lists them with the reason so the
 * user can restore or rewrite.
 *
 * Atomic .tmp+rename writes, mirroring skill-usage.ts. Missing/corrupt ⇒ empty
 * index (every skill defaults to active — fail-safe, never auto-draft).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export type SkillHygieneStatus = 'active' | 'draft';
export type SkillHygieneVerdict = 'necessary' | 'redundant' | 'generic';

export interface SkillHygieneEntry {
  status: SkillHygieneStatus;
  verdict?: SkillHygieneVerdict;
  reason?: string;
  judgedAt?: string;
}

export type SkillHygieneIndex = Record<string, SkillHygieneEntry>;

const INDEX_FILENAME = 'skill-hygiene.json';

export function getSkillHygienePath(waggleHome: string): string {
  return path.join(waggleHome, INDEX_FILENAME);
}

export function loadSkillHygiene(waggleHome: string): SkillHygieneIndex {
  const filePath = getSkillHygienePath(waggleHome);
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as SkillHygieneIndex;
    }
    return {};
  } catch {
    return {};
  }
}

export function saveSkillHygiene(waggleHome: string, index: SkillHygieneIndex): void {
  if (!fs.existsSync(waggleHome)) fs.mkdirSync(waggleHome, { recursive: true });
  const filePath = getSkillHygienePath(waggleHome);
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(index, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * Demote a skill to draft with an advisory reason. Writes ONLY the sidecar — the
 * SKILL.md is never edited/moved/deleted, so demotion is fully reversible and
 * never invalidates the content hash. Returns the new entry.
 */
export function demoteSkillToDraft(
  waggleHome: string,
  skillName: string,
  verdict: SkillHygieneVerdict,
  reason: string,
  nowFn: () => Date = () => new Date(),
): SkillHygieneEntry {
  const index = loadSkillHygiene(waggleHome);
  const entry: SkillHygieneEntry = {
    status: 'draft',
    verdict,
    reason,
    judgedAt: nowFn().toISOString(),
  };
  index[skillName] = entry;
  saveSkillHygiene(waggleHome, index);
  return entry;
}

/** Restore a demoted skill to active (clears the draft flag). */
export function restoreSkillToActive(waggleHome: string, skillName: string): void {
  const index = loadSkillHygiene(waggleHome);
  const existing = index[skillName];
  if (!existing) return;
  index[skillName] = { ...existing, status: 'active' };
  saveSkillHygiene(waggleHome, index);
}

export function isSkillDraft(waggleHome: string, skillName: string): boolean {
  return loadSkillHygiene(waggleHome)[skillName]?.status === 'draft';
}

/**
 * Skill-audit sidecar (Odysseus §D2).
 *
 * ~/.waggle/skill-audit.json records the run-and-grade "verified" badge per
 * skill — the sellable PRO artifact of the autonomous skill-audit loop
 * (skill-audit.ts). DISTINCT from skill-hygiene.json (active|draft status):
 * a skill can be active AND unverified, or active AND verified. The audit
 * store NEVER toggles active/draft — demotion on persistent audit failure is
 * delegated to the hygiene store (skill-hygiene-store.ts) so there is exactly
 * one 'draft' owner and one loadActiveSkills filter. This file holds the badge
 * (verified/confidence/score), the change-detection hash, and the consecutive-
 * fail counter that gates demotion — nothing that removes a skill from the prompt.
 *
 * Atomic .tmp+rename writes, mirroring skill-hygiene-store.ts. Missing/corrupt
 * ⇒ empty index (every skill defaults to UNVERIFIED — the badge is earned by a
 * clean passing grade, never assumed; fail-safe).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SkillAuditBadge {
  /** Crossed the verify threshold on a cleanly-parsed grade. */
  verified: boolean;
  /** 0..1 — overall of the deciding attempt. */
  score: number;
  /** 0..1 — best parsed overall achieved this run (the badge headline number). */
  confidence: number;
  /** Run+grade cycles consumed this audit (1..maxAttempts). */
  attempts: number;
  /** A verified rewrite was persisted to the SKILL.md (autoRewrite path only). */
  rewritten: boolean;
  /** This audit demoted the skill to draft (autoDemote path only). */
  demoted: boolean;
  /** Skill content was injection-flagged → excluded from the verified badge. */
  flagged?: boolean;
  /** One-line judge feedback / why-unverified. */
  feedback?: string;
  /** Consecutive confident failures across runs — gates autoDemote (≥ minConsecutiveFails). */
  consecutiveFails?: number;
  /** Content hash at audit time — the badge auto-staleness key (recall reverts on edit). */
  lastAuditedHash?: string;
  /** ISO timestamp of this audit. */
  auditedAt?: string;
}

export type SkillAuditIndex = Record<string, SkillAuditBadge>;

const INDEX_FILENAME = 'skill-audit.json';

export function getSkillAuditPath(waggleHome: string): string {
  return path.join(waggleHome, INDEX_FILENAME);
}

export function loadSkillAudit(waggleHome: string): SkillAuditIndex {
  const filePath = getSkillAuditPath(waggleHome);
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as SkillAuditIndex;
    }
    return {};
  } catch {
    return {};
  }
}

export function saveSkillAudit(waggleHome: string, index: SkillAuditIndex): void {
  if (!fs.existsSync(waggleHome)) fs.mkdirSync(waggleHome, { recursive: true });
  const filePath = getSkillAuditPath(waggleHome);
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(index, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

/** Upsert one badge, stamping auditedAt. Returns the stored entry. */
export function recordAuditBadge(
  waggleHome: string,
  skillName: string,
  badge: Omit<SkillAuditBadge, 'auditedAt'>,
  nowFn: () => Date = () => new Date(),
): SkillAuditBadge {
  const index = loadSkillAudit(waggleHome);
  const stored: SkillAuditBadge = { ...badge, auditedAt: nowFn().toISOString() };
  index[skillName] = stored;
  saveSkillAudit(waggleHome, index);
  return stored;
}

export function getAuditBadge(waggleHome: string, skillName: string): SkillAuditBadge | undefined {
  return loadSkillAudit(waggleHome)[skillName];
}

export function isSkillVerified(waggleHome: string, skillName: string): boolean {
  return loadSkillAudit(waggleHome)[skillName]?.verified === true;
}

/** Remove one badge. No-op if absent; never throws. Leaves other badges intact. */
export function clearAuditBadge(waggleHome: string, skillName: string): void {
  const index = loadSkillAudit(waggleHome);
  if (!(skillName in index)) return;
  delete index[skillName];
  saveSkillAudit(waggleHome, index);
}

export interface SkipAuditOptions {
  /** Re-audit a verified skill only after this many days. Default 7. */
  maxAgeDays?: number;
  now?: () => Date;
}

/**
 * Cost guard: skip re-auditing a skill that is already verified, UNCHANGED
 * (current content hash == the hash at last audit), and audited within
 * maxAgeDays. Anything else (never audited, unverified, content edited, or
 * stale) is NOT skipped. Pure — the caller supplies the current hash.
 */
export function shouldSkipAudit(
  badge: SkillAuditBadge | undefined,
  currentHash: string,
  opts: SkipAuditOptions = {},
): boolean {
  if (!badge || !badge.verified) return false;
  if (!badge.lastAuditedHash || badge.lastAuditedHash !== currentHash) return false;
  if (!badge.auditedAt) return false;
  const maxAgeDays = opts.maxAgeDays ?? 7;
  const now = (opts.now ?? (() => new Date()))();
  const auditedAt = new Date(badge.auditedAt);
  if (Number.isNaN(auditedAt.getTime())) return false;
  const ageMs = now.getTime() - auditedAt.getTime();
  return ageMs >= 0 && ageMs < maxAgeDays * 24 * 60 * 60 * 1000;
}

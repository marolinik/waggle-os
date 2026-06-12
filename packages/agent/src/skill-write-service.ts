/**
 * Shared skill-write service (P5/D4 binding iii).
 *
 * One module, one audit trail, two callers: the agent tool layer
 * (`skill-tools.ts`) and the HTTP route layer (`routes/skills.ts`) both go
 * through here so create / update / delete are redacted, provenance-stamped,
 * and audited exactly once, the same way, regardless of who initiated.
 *
 * Per the D4(iii) AMENDED ruling, the agent tool does NOT call HTTP — it calls
 * this in-process service directly. Caller-specific side effects (skill-hash
 * store, agentState reload) stay in the caller; this service owns the file I/O,
 * redaction, provenance, and audit write.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { redactSkillContent } from './skill-redaction.js';
import type { SkillInitiator } from './skill-frontmatter.js';
import { parseSkillFrontmatter } from './skill-frontmatter.js';
import type { InstallAuditStore } from '@waggle/core';

/** Shared deps for every skill-write op. auditStore/onChange degrade gracefully. */
export interface SkillWriteDeps {
  /** Directory holding personal-scope SKILL.md files (~/.waggle/skills). */
  skillsDir: string;
  /** Audit store — when present, every op records an install_audit row. */
  auditStore?: InstallAuditStore;
  /** Called after a successful write/delete so the caller can hot-reload skills. */
  onChange?: () => void;
}

export interface WriteSkillInput {
  name: string;
  /** Markdown content (raw or pre-generated). Redacted before persisting. */
  content: string;
  /** Who authored this write — stamped into provenance frontmatter + audit. */
  initiator: SkillInitiator;
  /** Where the write originated (e.g. 'chat', 'api', 'skill-creator'). */
  source: string;
}

export interface DeleteSkillInput {
  name: string;
  initiator: SkillInitiator;
  source: string;
}

export interface SkillWriteResult {
  ok: boolean;
  /** Absolute path written/deleted (present on success). */
  path?: string;
  /** True when the target already existed (update vs create). */
  existed?: boolean;
  /** Secrets/paths stripped before persisting (write ops only). */
  redactions?: string[];
  /** Set when ok=false. */
  error?: string;
}

/** Reject names that could escape skillsDir or collide with shell-hostile chars. */
function invalidName(name: string): boolean {
  return !name || !/^[a-zA-Z0-9_-]+$/.test(name);
}

/**
 * Inject/overwrite `initiator` + `source` inside the content's frontmatter
 * WITHOUT round-tripping through serializeFrontmatter (which is lossy — it drops
 * unknown keys like custom `permissions:` blocks). Provenance is authoritative:
 * any initiator/source the author embedded in the body is replaced, so a write
 * can't spoof false provenance.
 */
function stampProvenance(content: string, initiator: SkillInitiator, source: string): string {
  const provLines = [`initiator: ${initiator}`, `source: ${source}`];

  if (content.startsWith('---')) {
    const end = content.indexOf('\n---', 3);
    if (end !== -1) {
      const block = content.slice(3, end);
      const afterDelimiter = end + 4; // '\n---'
      const rest = content.slice(afterDelimiter);
      // Strip any existing initiator/source lines, keep everything else.
      const kept = block
        .split('\n')
        .filter((l) => {
          const key = l.trim().toLowerCase();
          return !key.startsWith('initiator:') && !key.startsWith('source:');
        });
      // Drop leading/trailing blank lines introduced by the filter.
      while (kept.length && kept[0].trim() === '') kept.shift();
      while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
      const newBlock = [...kept, ...provLines].join('\n');
      return `---\n${newBlock}\n---${rest}`;
    }
  }

  // No frontmatter → prepend a minimal provenance block.
  return `---\n${provLines.join('\n')}\n---\n\n${content}`;
}

/**
 * Create or update a skill. Redacts secrets/paths, stamps provenance
 * (sticky — an update preserves the original author rather than relaundering
 * it), writes to disk, records an audit row, and fires onChange.
 */
export function writeSkill(deps: SkillWriteDeps, input: WriteSkillInput): SkillWriteResult {
  const { skillsDir, auditStore, onChange } = deps;
  const { name, content } = input;

  if (invalidName(name)) {
    return { ok: false, error: 'Invalid skill name (letters, numbers, hyphens, underscores only).' };
  }

  const filePath = path.join(skillsDir, `${name}.md`);
  const existed = fs.existsSync(filePath);

  // Provenance is sticky: if the skill already exists with an author, preserve
  // it so an edit (by user OR agent) can't reclassify who created it.
  let initiator = input.initiator;
  let source = input.source;
  if (existed) {
    try {
      const prior = parseSkillFrontmatter(fs.readFileSync(filePath, 'utf-8')).frontmatter;
      if (prior.initiator) initiator = prior.initiator;
      if (prior.source) source = prior.source;
    } catch { /* unreadable prior — fall back to the input provenance */ }
  }

  const { content: safe, redactions } = redactSkillContent(content);
  const stamped = stampProvenance(safe, initiator, source);

  if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
  fs.writeFileSync(filePath, stamped, 'utf-8');

  try {
    auditStore?.record({
      capabilityName: name,
      capabilityType: 'skill',
      source,
      riskLevel: 'low',
      trustSource: 'local_user',
      approvalClass: 'standard',
      action: 'installed',
      initiator,
      detail: `${existed ? 'Updated' : 'Created'} skill via ${source}${redactions.length ? ` (redacted ${redactions.length})` : ''}.`,
    });
  } catch { /* audit is best-effort */ }

  onChange?.();
  return { ok: true, path: filePath, existed, redactions };
}

/**
 * Delete a skill. Records an 'uninstalled' audit row (the action added in
 * P5/D4 DEC-1) and fires onChange. Returns ok=false if the skill is absent.
 */
export function deleteSkill(deps: SkillWriteDeps, input: DeleteSkillInput): SkillWriteResult {
  const { skillsDir, auditStore, onChange } = deps;
  const { name, initiator, source } = input;

  if (invalidName(name)) {
    return { ok: false, error: 'Invalid skill name.' };
  }

  const filePath = path.join(skillsDir, `${name}.md`);
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `Skill "${name}" not found.` };
  }

  fs.unlinkSync(filePath);

  try {
    auditStore?.record({
      capabilityName: name,
      capabilityType: 'skill',
      source,
      riskLevel: 'low',
      trustSource: 'local_user',
      approvalClass: 'standard',
      action: 'uninstalled',
      initiator,
      detail: `Skill deleted via ${source}.`,
    });
  } catch { /* audit is best-effort */ }

  onChange?.();
  return { ok: true, path: filePath };
}

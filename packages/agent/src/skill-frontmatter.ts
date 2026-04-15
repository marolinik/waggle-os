/**
 * Parse YAML-like frontmatter from skill markdown files.
 * Simple key: value parser -- no external YAML library needed.
 *
 * Frontmatter is optional. If present, it must be delimited by `---` lines:
 *
 * ```markdown
 * ---
 * name: Deploy Helper
 * description: Helps deploy applications
 * permissions:
 *   codeExecution: true
 *   network: true
 * ---
 *
 * # Deploy Helper
 * ...rest of skill content...
 * ```
 */

/**
 * Skills 2.0 gap E: scope defines where a skill is available.
 * Skills are promoted along the chain personal → workspace → team → enterprise.
 * A skill can only be promoted one step at a time; demotion is not supported.
 */
export type SkillScope = 'personal' | 'workspace' | 'team' | 'enterprise';

export const SKILL_SCOPE_ORDER: readonly SkillScope[] = ['personal', 'workspace', 'team', 'enterprise'] as const;

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  /**
   * Skills 2.0 gap E: which scope this skill is currently bound to.
   * Defaults to 'personal' when omitted for backwards compatibility.
   */
  scope?: SkillScope;
  /**
   * Skills 2.0 gap E: audit trail of prior scopes the skill passed through.
   * Appended to on each successful promotion. Never rewritten.
   */
  promoted_from?: SkillScope[];
  permissions?: Partial<{
    fileSystem: boolean;
    network: boolean;
    codeExecution: boolean;
    externalServices: boolean;
    secrets: boolean;
    browserAutomation: boolean;
  }>;
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
}

/**
 * Parse frontmatter from skill content. Returns the parsed frontmatter
 * and the body (content after the closing `---`).
 *
 * If no frontmatter is found, returns empty frontmatter and the full content as body.
 */
export function parseSkillFrontmatter(content: string): ParsedSkill {
  // Must start with --- (possibly after leading whitespace on the line)
  if (!content.startsWith('---')) {
    return { frontmatter: {}, body: content };
  }

  // Find closing delimiter (must be on its own line)
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const fmBlock = content.slice(3, endIndex).trim();
  // Body starts after the closing --- and its trailing newline
  const afterDelimiter = endIndex + 4; // '\n---' is 4 chars
  const body = content.slice(afterDelimiter).replace(/^\r?\n/, '').trimEnd();

  // Simple YAML parser: handles top-level key: value and nested permissions block
  const frontmatter: SkillFrontmatter = {};
  let inPermissions = false;
  const permissions: Record<string, boolean> = {};

  for (const line of fmBlock.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check for permissions block start
    if (trimmed === 'permissions:') {
      inPermissions = true;
      continue;
    }

    if (inPermissions) {
      // Check if line is indented (part of permissions block)
      if (line.startsWith('  ') || line.startsWith('\t')) {
        const match = trimmed.match(/^(\w+):\s*(true|false)$/);
        if (match) {
          permissions[match[1]] = match[2] === 'true';
        }
        continue;
      } else {
        // No longer indented = end of permissions block
        inPermissions = false;
      }
    }

    // Top-level key: value
    const kvMatch = trimmed.match(/^(\w+):\s*(.+)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      const v = value.trim();
      if (key === 'name') frontmatter.name = v;
      if (key === 'description') frontmatter.description = v;
      if (key === 'scope' && isSkillScope(v)) frontmatter.scope = v;
      if (key === 'promoted_from') {
        // Accept JSON-array form ([a, b, c]) or comma-separated.
        const inner = v.replace(/^\[|\]$/g, '');
        const parts = inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        const scopes = parts.filter(isSkillScope) as SkillScope[];
        if (scopes.length > 0) frontmatter.promoted_from = scopes;
      }
    }
  }

  if (Object.keys(permissions).length > 0) {
    frontmatter.permissions = permissions as SkillFrontmatter['permissions'];
  }

  return { frontmatter, body };
}

function isSkillScope(s: string): s is SkillScope {
  return SKILL_SCOPE_ORDER.includes(s as SkillScope);
}

/**
 * Skills 2.0 gap E: return the next scope up from `current`, or null if
 * already at the top (enterprise).
 */
export function nextScope(current: SkillScope): SkillScope | null {
  const i = SKILL_SCOPE_ORDER.indexOf(current);
  if (i === -1 || i === SKILL_SCOPE_ORDER.length - 1) return null;
  return SKILL_SCOPE_ORDER[i + 1];
}

/**
 * Skills 2.0 gap E: rebuild a SKILL.md string with updated scope +
 * promoted_from fields. Preserves the body and all other frontmatter keys.
 * Used by promote_skill to write the frontmatter change to disk.
 */
export function serializeFrontmatter(fm: SkillFrontmatter, body: string): string {
  const lines: string[] = ['---'];
  if (fm.name) lines.push(`name: ${fm.name}`);
  if (fm.description) lines.push(`description: ${fm.description}`);
  if (fm.scope) lines.push(`scope: ${fm.scope}`);
  if (fm.promoted_from && fm.promoted_from.length > 0) {
    lines.push(`promoted_from: [${fm.promoted_from.join(', ')}]`);
  }
  if (fm.permissions && Object.keys(fm.permissions).length > 0) {
    lines.push('permissions:');
    for (const [k, v] of Object.entries(fm.permissions)) {
      lines.push(`  ${k}: ${v}`);
    }
  }
  lines.push('---', body);
  return lines.join('\n');
}

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

export interface SkillFrontmatter {
  name?: string;
  description?: string;
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
      if (key === 'name') frontmatter.name = value.trim();
      if (key === 'description') frontmatter.description = value.trim();
    }
  }

  if (Object.keys(permissions).length > 0) {
    frontmatter.permissions = permissions as SkillFrontmatter['permissions'];
  }

  return { frontmatter, body };
}

/**
 * Skill validator — parses and validates SKILL.md files.
 *
 * SKILL.md format:
 * ```
 * ---
 * name: my-skill
 * description: What this skill does
 * version: 1.0.0
 * author: Someone
 * dependencies: [search_memory, save_memory]
 * ---
 *
 * System prompt content goes here...
 * ```
 */

export interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
  /** F18: List of tool names this skill requires to function. */
  dependencies?: string[];
  systemPrompt: string;
}

export interface ValidationResult {
  valid: boolean;
  metadata?: SkillMetadata;
  errors: string[];
  /** F18: Non-fatal warnings (e.g., invalid semver, missing dependency tools). */
  warnings: string[];
}

/** F18: Validate semver format (x.y.z with optional pre-release/build). */
export function isValidSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/.test(version);
}

/**
 * F18: Compare two semver version strings.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b.
 * Only compares major.minor.patch (ignores pre-release/build metadata).
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const parse = (v: string) => v.replace(/-.*$/, '').replace(/\+.*$/, '').split('.').map(Number);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/**
 * Parse YAML frontmatter from a string delimited by `---`.
 * Returns key-value pairs (all values as strings).
 */
function parseFrontmatter(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

/**
 * F18: Parse a YAML-style array value: `[item1, item2]` or `item1, item2`.
 */
function parseArrayField(value: string): string[] {
  // Strip surrounding brackets if present
  const stripped = value.replace(/^\[/, '').replace(/\]$/, '');
  return stripped
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Validate a SKILL.md file content.
 *
 * Extracts YAML frontmatter (name, description, version, author, dependencies)
 * and the body as the system prompt.
 */
export function validateSkillMd(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for frontmatter delimiters
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!fmMatch) {
    errors.push('Missing YAML frontmatter (must be wrapped in --- delimiters)');
    return { valid: false, errors, warnings };
  }

  const frontmatterRaw = fmMatch[1];
  const body = fmMatch[2];
  const fields = parseFrontmatter(frontmatterRaw);

  if (!fields.name) {
    errors.push('Missing required field: name');
  }
  if (!fields.description) {
    errors.push('Missing required field: description');
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // F18: Validate version if present
  if (fields.version && !isValidSemver(fields.version)) {
    warnings.push(`Invalid semver version "${fields.version}" — expected format: x.y.z (e.g., 1.0.0)`);
  }

  // F18: Parse dependencies
  const dependencies = fields.dependencies ? parseArrayField(fields.dependencies) : undefined;

  const metadata: SkillMetadata = {
    name: fields.name,
    description: fields.description,
    version: fields.version || undefined,
    author: fields.author || undefined,
    dependencies,
    systemPrompt: body.trim(),
  };

  return { valid: true, metadata, errors: [], warnings };
}

/**
 * F18: Check that all dependency tools listed by a skill are available.
 * Returns warnings for any missing dependencies (does not block installation).
 */
export function checkSkillDependencies(
  metadata: SkillMetadata,
  availableTools: string[],
): string[] {
  const warnings: string[] = [];
  if (!metadata.dependencies || metadata.dependencies.length === 0) return warnings;

  const toolSet = new Set(availableTools);
  for (const dep of metadata.dependencies) {
    if (!toolSet.has(dep)) {
      warnings.push(`Skill "${metadata.name}" requires tool "${dep}" which is not available`);
    }
  }
  return warnings;
}

/**
 * F18: Check for version downgrade when updating an existing skill.
 * Returns a warning string if newVersion <= existingVersion.
 */
export function checkVersionDowngrade(
  skillName: string,
  existingVersion: string | undefined,
  newVersion: string | undefined,
): string | null {
  if (!existingVersion || !newVersion) return null;
  if (!isValidSemver(existingVersion) || !isValidSemver(newVersion)) return null;

  const cmp = compareSemver(newVersion, existingVersion);
  if (cmp < 0) {
    return `Downgrade detected for skill "${skillName}": ${newVersion} < ${existingVersion}`;
  }
  if (cmp === 0) {
    return `Same version re-install for skill "${skillName}": ${newVersion} == ${existingVersion}`;
  }
  return null;
}

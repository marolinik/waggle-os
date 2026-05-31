/**
 * Pre-write redaction for authored skill content.
 *
 * The closed-learning-loop (create_skill / auto_extract_skills) and the UI both
 * persist skill markdown to disk (~/.waggle/skills). That content can carry
 * secrets (API keys / tokens) or machine-specific filesystem paths pulled from
 * the model's context or the user's input. The loop's "strip secrets/paths"
 * instruction was model-advisory only — this enforces it deterministically
 * before every authored write.
 *
 * Secrets reuse the curated SECRET_PATTERNS via redactSecrets (single source of
 * truth — see eval-dataset.ts). Paths cover the user's home directory (the exact
 * running-user path plus generic per-OS forms), which both leaks the username
 * and makes a skill non-portable.
 */
import os from 'node:os';
import { redactSecrets } from './eval-dataset.js';

// Generic user-home prefixes. Each matches up to (not including) the next path
// separator, so the tail is preserved: C:\Users\me\.waggle\x -> ~\.waggle\x
const HOME_PATH_PATTERNS: readonly RegExp[] = [
  /[A-Za-z]:\\Users\\[^\\/:*?"<>|\r\n]+/g, // Windows
  /\/(?:Users|home)\/[^\s/\\:*?"<>|]+/g, // macOS / Linux
];

export interface SkillRedactionResult {
  content: string;
  /** De-duplicated labels of what was stripped (secret pattern names + 'home-path'). */
  redactions: string[];
}

/**
 * Strip secrets and user-home paths from skill content before it is written to
 * disk. Pure — returns a new string; never mutates input.
 */
export function redactSkillContent(content: string): SkillRedactionResult {
  const sec = redactSecrets(content);
  let out = sec.text;
  const redactions = new Set(sec.found);

  // Exact running-user home first (most precise; literal string match).
  try {
    const home = os.homedir();
    if (home && out.includes(home)) {
      out = out.split(home).join('~');
      redactions.add('home-path');
    }
  } catch {
    /* homedir unavailable — generic patterns below still apply */
  }

  // Generic home paths (content authored about other machines/users).
  for (const re of HOME_PATH_PATTERNS) {
    const replaced = out.replace(re, '~');
    if (replaced !== out) {
      out = replaced;
      redactions.add('home-path');
    }
  }

  return { content: out, redactions: [...redactions] };
}

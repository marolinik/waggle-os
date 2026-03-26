/**
 * Capability Acquisition — detect gaps, search candidates, build proposals.
 *
 * This module powers the "when the agent lacks a capability, it acquires one"
 * product behavior. It searches across active skills, starter skills (not yet
 * installed), and native tools to produce structured, human-grade proposals.
 *
 * Design: skill-first MVP. Plugin/MCP support fits the same CapabilityCandidate
 * interface but is not implemented here.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { assessTrust, formatTrustSummary, type TrustAssessment } from './trust-model.js';
import { parseSkillFrontmatter } from './skill-frontmatter.js';

// ── Types ──────────────────────────────────────────────────────────────

export type CapabilitySourceType = 'native' | 'skill' | 'plugin' | 'mcp' | 'connector' | 'marketplace';

export type CapabilityAvailability =
  | 'active'              // Currently loaded and usable
  | 'installed_inactive'  // On disk but not in current context
  | 'installable'         // Available in a curated source, not yet installed
  | 'unavailable';        // Known to exist but cannot be installed locally

export interface CapabilityCandidate {
  name: string;
  type: CapabilitySourceType;
  availability: CapabilityAvailability;
  description: string;
  source: string;           // Where it comes from: "starter-pack", "installed", "native-tools"
  matchScore: number;       // 0–1, internal ranking
  matchReason: string;      // Human-readable: why this matches the need
  installAction: string | null; // null if already active or native
  trust?: TrustAssessment;  // Trust/risk assessment (attached during search)
}

export interface AcquisitionProposal {
  need: string;
  gapDetected: boolean;
  summary: string;          // Human-grade explanation
  candidates: CapabilityCandidate[];
  recommendation: CapabilityCandidate | null;
  alreadyHandled: boolean;  // True if a native tool or active skill already covers this
}

// ── Keyword extraction (shared logic from SkillRecommender) ────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'for', 'and', 'but', 'or',
  'nor', 'not', 'so', 'yet', 'to', 'of', 'in', 'on', 'at', 'by', 'with',
  'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'this', 'that', 'these', 'those', 'it',
  'its', 'my', 'your', 'our', 'their', 'what', 'which', 'who', 'whom',
  'how', 'when', 'where', 'why', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'some', 'any', 'no', 'just', 'very', 'also', 'than',
  'then', 'want', 'need', 'help', 'make', 'please', 'like', 'get',
  'give', 'use', 'using', 'something', 'thing', 'way',
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9-_]/g, ''))
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

// ── Scoring ────────────────────────────────────────────────────────────

function scoreMatch(keywords: string[], name: string, content: string): { score: number; nameHits: string[]; contentHits: string[] } {
  const nameLower = name.toLowerCase().replace(/-/g, ' ');
  const contentLower = content.toLowerCase();

  let matchCount = 0;
  const nameHits: string[] = [];
  const contentHits: string[] = [];

  for (const kw of keywords) {
    const inName = nameLower.includes(kw);
    const inContent = contentLower.includes(kw);

    if (inName) {
      matchCount += 2; // Name matches score 2x
      nameHits.push(kw);
    } else if (inContent) {
      matchCount += 1;
      contentHits.push(kw);
    }
  }

  const score = keywords.length > 0 ? Math.min(matchCount / keywords.length, 1.0) : 0;
  return { score, nameHits, contentHits };
}

function buildMatchReason(nameHits: string[], contentHits: string[]): string {
  const parts: string[] = [];
  if (nameHits.length > 0) {
    parts.push(`name matches: ${nameHits.join(', ')}`);
  }
  if (contentHits.length > 0) {
    parts.push(`content mentions: ${contentHits.join(', ')}`);
  }
  return parts.join('; ') || 'general relevance';
}

// ── Native tool matching ───────────────────────────────────────────────

/** Tool description hints for scoring native tools against needs */
const NATIVE_TOOL_HINTS: Record<string, string> = {
  web_search: 'search internet web browse lookup find information online',
  web_fetch: 'fetch download webpage url content read website',
  search_memory: 'memory recall remember past history context previous',
  save_memory: 'memory store remember save persist note',
  read_file: 'file read open content text code source',
  write_file: 'file write create save output generate',
  edit_file: 'file edit modify change update patch',
  search_files: 'file find search locate discover pattern',
  search_content: 'grep search content text pattern find code',
  bash: 'command terminal shell run execute script process',
  git_status: 'git version control status changes modified',
  git_diff: 'git diff changes compare difference',
  git_log: 'git history log commits recent changes',
  git_commit: 'git commit save snapshot version',
  generate_docx: 'document word docx report generate create write format',
  create_plan: 'plan planning steps strategy organize breakdown',
  spawn_agent: 'agent delegate specialist sub-agent team parallel',
  query_knowledge: 'knowledge graph entity relation concept',
};

// ── Starter skill loading ──────────────────────────────────────────────

export interface StarterSkillMeta {
  name: string;
  content: string;
  firstLine: string; // First non-empty line (usually the title)
}

export function loadStarterSkillsMeta(starterDir: string): StarterSkillMeta[] {
  if (!fs.existsSync(starterDir)) return [];

  return fs.readdirSync(starterDir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const content = fs.readFileSync(path.join(starterDir, f), 'utf-8').trim();
      const firstLine = content.split('\n').find(l => l.trim().length > 0)?.replace(/^#+\s*/, '') ?? '';
      return {
        name: f.replace(/\.md$/, ''),
        content,
        firstLine,
      };
    });
}

// ── Main search ────────────────────────────────────────────────────────

/** A marketplace search result mapped to candidate format */
export interface MarketplaceCandidate {
  name: string;
  description: string;
  packageType: string;
  source: string;
  /** Match score from marketplace FTS (normalized 0–1 or raw) */
  score?: number;
}

export interface SearchCapabilitiesInput {
  need: string;
  installedSkills: Array<{ name: string; content: string }>;
  starterSkillsDir: string;
  nativeToolNames?: string[];
  /** Pre-fetched marketplace candidates (searched externally, passed in) */
  marketplaceCandidates?: MarketplaceCandidate[];
}

export function searchCapabilities(input: SearchCapabilitiesInput): AcquisitionProposal {
  const { need, installedSkills, starterSkillsDir, nativeToolNames = [], marketplaceCandidates = [] } = input;
  const keywords = extractKeywords(need);

  if (keywords.length === 0) {
    return {
      need,
      gapDetected: false,
      summary: 'Could not extract meaningful keywords from the need description. Try rephrasing.',
      candidates: [],
      recommendation: null,
      alreadyHandled: false,
    };
  }

  const candidates: CapabilityCandidate[] = [];
  const installedNames = new Set(installedSkills.map(s => s.name));

  // 1. Score native tools
  for (const toolName of nativeToolNames) {
    const hints = NATIVE_TOOL_HINTS[toolName] ?? toolName.replace(/_/g, ' ');
    const { score, nameHits, contentHits } = scoreMatch(keywords, toolName, hints);

    if (score >= 0.15) {
      candidates.push({
        name: toolName,
        type: 'native',
        availability: 'active',
        description: `Built-in tool "${toolName}"`,
        source: 'native-tools',
        matchScore: score,
        matchReason: buildMatchReason(nameHits, contentHits),
        installAction: null,
        trust: assessTrust({ capabilityType: 'native', source: 'native-tools', content: hints }),
      });
    }
  }

  // 2. Score installed (active) skills
  for (const skill of installedSkills) {
    const { score, nameHits, contentHits } = scoreMatch(keywords, skill.name, skill.content);

    if (score >= 0.1) {
      const { frontmatter } = parseSkillFrontmatter(skill.content);
      const firstLine = skill.content.split('\n').find(l => l.trim().length > 0)?.replace(/^#+\s*/, '') ?? '';
      candidates.push({
        name: skill.name,
        type: 'skill',
        availability: 'active',
        description: firstLine || `Skill "${skill.name}"`,
        source: 'installed',
        matchScore: score,
        matchReason: buildMatchReason(nameHits, contentHits),
        installAction: null,
        trust: assessTrust({ capabilityType: 'skill', source: 'installed', content: skill.content, declaredPermissions: frontmatter.permissions }),
      });
    }
  }

  // 3. Score starter skills NOT already installed
  const starterSkills = loadStarterSkillsMeta(starterSkillsDir);

  for (const starter of starterSkills) {
    if (installedNames.has(starter.name)) continue; // Already installed — skip

    const { score, nameHits, contentHits } = scoreMatch(keywords, starter.name, starter.content);

    if (score >= 0.1) {
      const { frontmatter: starterFm } = parseSkillFrontmatter(starter.content);
      candidates.push({
        name: starter.name,
        type: 'skill',
        availability: 'installable',
        description: starter.firstLine || `Starter skill "${starter.name}"`,
        source: 'starter-pack',
        matchScore: score,
        matchReason: buildMatchReason(nameHits, contentHits),
        installAction: `install_capability`,
        trust: assessTrust({ capabilityType: 'skill', source: 'starter-pack', content: starter.content, declaredPermissions: starterFm.permissions }),
      });
    }
  }

  // 4. Score marketplace candidates (pre-fetched, passed in via marketplaceCandidates)
  for (const mkt of marketplaceCandidates) {
    // Skip if already installed or already in candidates from starter pack
    if (installedNames.has(mkt.name)) continue;
    if (candidates.some(c => c.name === mkt.name && c.source === 'starter-pack')) continue;

    const { score, nameHits, contentHits } = scoreMatch(keywords, mkt.name, mkt.description);
    // Use marketplace FTS score as a boost when available, otherwise rely on keyword matching
    const effectiveScore = mkt.score != null ? Math.min(Math.max(score, mkt.score), 1.0) : score;

    if (effectiveScore >= 0.1) {
      candidates.push({
        name: mkt.name,
        type: 'marketplace',
        availability: 'installable',
        description: mkt.description || `Marketplace package "${mkt.name}"`,
        source: 'marketplace',
        matchScore: effectiveScore,
        matchReason: buildMatchReason(nameHits, contentHits) || 'marketplace search match',
        installAction: 'install_capability',
        trust: assessTrust({ capabilityType: 'skill', source: 'marketplace', content: mkt.description }),
      });
    }
  }

  // Sort by score descending, then by availability preference (active first)
  const availabilityOrder: Record<CapabilityAvailability, number> = {
    active: 0,
    installed_inactive: 1,
    installable: 2,
    unavailable: 3,
  };

  candidates.sort((a, b) => {
    const scoreDiff = b.matchScore - a.matchScore;
    if (Math.abs(scoreDiff) > 0.05) return scoreDiff;
    return availabilityOrder[a.availability] - availabilityOrder[b.availability];
  });

  // Determine if the need is already handled by an active capability
  const bestActive = candidates.find(c => c.availability === 'active' && c.matchScore >= 0.3);
  const bestInstallable = candidates.find(c => c.availability === 'installable');
  const alreadyHandled = bestActive !== null && bestActive !== undefined && bestActive.matchScore >= 0.4;

  // Build recommendation
  let recommendation: CapabilityCandidate | null = null;
  if (!alreadyHandled && bestInstallable) {
    recommendation = bestInstallable;
  } else if (alreadyHandled && bestActive) {
    recommendation = bestActive;
  } else if (candidates.length > 0) {
    recommendation = candidates[0];
  }

  const gapDetected = !alreadyHandled && candidates.some(c => c.availability === 'installable');

  return {
    need,
    gapDetected,
    summary: buildProposalSummary(need, candidates, recommendation, alreadyHandled),
    candidates: candidates.slice(0, 8), // Cap at 8 candidates
    recommendation,
    alreadyHandled,
  };
}

// ── Proposal formatting (human-grade, not debug-grade) ─────────────────

function buildProposalSummary(
  need: string,
  candidates: CapabilityCandidate[],
  recommendation: CapabilityCandidate | null,
  alreadyHandled: boolean,
): string {
  if (candidates.length === 0) {
    return `No capabilities found for "${need}". You may need to create a custom skill with create_skill, or approach this task using your general abilities.`;
  }

  if (alreadyHandled && recommendation) {
    if (recommendation.type === 'native') {
      return `You already have a built-in tool for this: **${recommendation.name}**. No installation needed — use it directly.`;
    }
    return `You already have an active skill for this: **${recommendation.name}** — "${recommendation.description}". No installation needed.`;
  }

  const sections: string[] = [];

  // What's missing
  sections.push(`## Capability Gap Detected\n\nYou don't have a specialized capability for: **${need}**`);

  // What was found
  const activeMatches = candidates.filter(c => c.availability === 'active');
  const installable = candidates.filter(c => c.availability === 'installable');

  if (activeMatches.length > 0) {
    sections.push('### Already Available');
    for (const c of activeMatches.slice(0, 3)) {
      const typeLabel = c.type === 'native' ? 'built-in tool' : 'active skill';
      sections.push(`- **${c.name}** (${typeLabel}) — ${c.description}`);
    }
  }

  if (installable.length > 0) {
    sections.push('### Available to Install');
    for (const c of installable.slice(0, 3)) {
      const trustLine = c.trust ? `\n  ${formatTrustSummary(c.trust)}` : '';
      sections.push(`- **${c.name}** (${c.source}) — ${c.description}${trustLine}`);
    }
  }

  // Recommendation
  if (recommendation && recommendation.availability === 'installable') {
    const trustBlock = recommendation.trust
      ? `- **Risk level**: ${capitalize(recommendation.trust.riskLevel)} (${recommendation.trust.assessmentMode})\n` +
        `- **Trust**: ${recommendation.trust.explanation}\n`
      : '';
    sections.push(
      `### Recommendation\n\n` +
      `Install **${recommendation.name}** from the ${recommendation.source}.\n` +
      `- **Why**: ${recommendation.matchReason}\n` +
      `- **What it does**: ${recommendation.description}\n` +
      trustBlock +
      `- **Approval required**: Yes — user must approve before installation.\n\n` +
      `To install, call: \`install_capability\` with name "${recommendation.name}" and source "${recommendation.source}".`,
    );
  } else if (recommendation && recommendation.availability === 'active') {
    sections.push(
      `### Recommendation\n\nUse your existing ${recommendation.type === 'native' ? 'tool' : 'skill'} **${recommendation.name}** — it partially covers this need.`,
    );
  }

  return sections.join('\n\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Validate install candidate ─────────────────────────────────────────

export interface InstallValidation {
  valid: boolean;
  error?: string;
  candidateName: string;
  candidateType: CapabilitySourceType;
  source: string;
  starterPath?: string;
}

export function validateInstallCandidate(
  name: string,
  source: string,
  starterSkillsDir: string,
  installedSkillNames: Set<string>,
): InstallValidation {
  // Only skills from starter-pack are installable in MVP
  if (source !== 'starter-pack') {
    return { valid: false, error: `Source "${source}" is not supported for installation. Only "starter-pack" skills can be installed.`, candidateName: name, candidateType: 'skill', source };
  }

  // Check it exists in starter pack
  const starterPath = path.join(starterSkillsDir, `${name}.md`);
  if (!fs.existsSync(starterPath)) {
    return { valid: false, error: `Skill "${name}" not found in the starter pack.`, candidateName: name, candidateType: 'skill', source };
  }

  // Check not already installed
  if (installedSkillNames.has(name)) {
    return { valid: false, error: `Skill "${name}" is already installed and active.`, candidateName: name, candidateType: 'skill', source };
  }

  return { valid: true, candidateName: name, candidateType: 'skill', source, starterPath };
}

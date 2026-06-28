/**
 * Skill hygiene judge (Odysseus §D1).
 *
 * A periodic, single-LLM-call-per-skill audit asking "is this skill still
 * NECESSARY, REDUNDANT with a peer, or too GENERIC". Redundant/generic skills
 * are DEMOTED to draft via the hygiene sidecar (never deleted/edited). Waggle
 * dedups only at creation (skill-distillation.ts → search_skills); an auto-
 * growing library bloats without this prune pass.
 *
 * Reuses judge.ts's LLM-call seam (JudgeLLMCall — the same Haiku-via-LiteLLM
 * wiring as the evolution judge) and its balanced-brace JSON extractor. It does
 * NOT reuse LLMJudge: that class emits a numeric correctness/procedure/
 * conciseness score, structurally wrong for a 3-way categorical verdict.
 *
 * Fail-safe: any LLM error or unparseable response keeps the skill ACTIVE — a
 * flaky judge must never silently disable a proven skill.
 */
import { type JudgeLLMCall, extractJsonCandidates } from './judge.js';
import { loadSkills, type LoadedSkill } from './prompt-loader.js';
import {
  demoteSkillToDraft,
  isSkillDraft,
  type SkillHygieneVerdict,
} from './skill-hygiene-store.js';

export interface SkillForHygiene {
  name: string;
  content: string;
}

const PEER_PREVIEW_CHARS = 240;
const TARGET_CONTENT_CHARS = 2000;
const HYGIENE_VERDICTS: readonly SkillHygieneVerdict[] = ['necessary', 'redundant', 'generic'];

export const SKILL_HYGIENE_RUBRIC = `You are auditing ONE skill in an AI agent's skill library for hygiene.
A "skill" is a reusable instruction document the agent loads into its system prompt.
Decide whether the TARGET skill should stay active or be demoted to draft.

Classify the TARGET as EXACTLY one of:
- "necessary": specific and useful, and NOT already covered by a peer skill below. KEEP.
- "redundant": substantially overlaps one of the PEER skills; the peer already covers it. DEMOTE.
- "generic": so vague or general it adds nothing the base agent cannot already do. DEMOTE.

Be conservative: only choose "redundant" or "generic" when you are confident. When unsure, choose "necessary".

Return ONLY a JSON object on a single line, no markdown:
{"verdict":"necessary","reason":"<one short sentence>"}`;

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function buildHygienePrompt(target: SkillForHygiene, peers: SkillForHygiene[]): string {
  const peerList = peers.length
    ? peers.map(p => `- ${p.name}: ${oneLine(p.content).slice(0, PEER_PREVIEW_CHARS)}`).join('\n')
    : '(none)';
  return `${SKILL_HYGIENE_RUBRIC}

PEER SKILLS (name: preview):
${peerList}

TARGET SKILL: ${target.name}
TARGET CONTENT:
${target.content.slice(0, TARGET_CONTENT_CHARS)}

Return the JSON now.`;
}

export interface SkillHygieneJudgement {
  name: string;
  verdict: SkillHygieneVerdict;
  reason: string;
  parsed: boolean;
}

export function parseHygieneVerdict(
  raw: string,
): { verdict: SkillHygieneVerdict; reason: string } | null {
  if (!raw) return null;
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  for (const candidate of extractJsonCandidates(cleaned)) {
    try {
      const obj = JSON.parse(candidate) as Record<string, unknown>;
      const verdict = typeof obj.verdict === 'string' ? obj.verdict.toLowerCase().trim() : '';
      if ((HYGIENE_VERDICTS as readonly string[]).includes(verdict)) {
        const reason = typeof obj.reason === 'string' ? obj.reason : '';
        return { verdict: verdict as SkillHygieneVerdict, reason };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** One LLM call. Fail-safe: errors / unparseable ⇒ 'necessary' (keep active). */
export async function judgeSkillHygiene(
  llmCall: JudgeLLMCall,
  target: SkillForHygiene,
  peers: SkillForHygiene[],
): Promise<SkillHygieneJudgement> {
  let raw = '';
  try {
    raw = await llmCall(buildHygienePrompt(target, peers));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name: target.name, verdict: 'necessary', reason: `judge call failed — kept active (${msg})`, parsed: false };
  }
  const parsed = parseHygieneVerdict(raw);
  if (!parsed) {
    return { name: target.name, verdict: 'necessary', reason: 'unparseable judge response — kept active', parsed: false };
  }
  return { name: target.name, verdict: parsed.verdict, reason: parsed.reason || 'No reason given.', parsed: true };
}

export interface SkillHygieneScanOptions {
  dryRun?: boolean;
  now?: () => Date;
}

export interface SkillHygieneScanReport {
  scanned: number;
  judged: SkillHygieneJudgement[];
  demoted: string[];
  kept: string[];
  errors: Array<{ name: string; error: string }>;
  dryRun: boolean;
}

/**
 * Run the hygiene judge over a set of skills. One LLM call per skill (no agent
 * re-run). Already-draft skills are skipped (don't re-judge what's demoted) and
 * excluded from peer context. Demotes any clearly-parsed redundant/generic
 * verdict to draft via the sidecar; NEVER deletes/edits a SKILL.md.
 */
export async function runSkillHygieneScan(
  waggleHome: string,
  skills: SkillForHygiene[],
  llmCall: JudgeLLMCall,
  opts: SkillHygieneScanOptions = {},
): Promise<SkillHygieneScanReport> {
  const dryRun = opts.dryRun ?? false;
  const now = opts.now ?? (() => new Date());
  const report: SkillHygieneScanReport = {
    scanned: 0, judged: [], demoted: [], kept: [], errors: [], dryRun,
  };

  const active = skills.filter(s => !isSkillDraft(waggleHome, s.name));
  for (const target of active) {
    report.scanned++;
    const peers = active.filter(s => s.name !== target.name);
    try {
      const judgement = await judgeSkillHygiene(llmCall, target, peers);
      report.judged.push(judgement);
      if (judgement.parsed && judgement.verdict !== 'necessary') {
        if (!dryRun) demoteSkillToDraft(waggleHome, target.name, judgement.verdict, judgement.reason, now);
        report.demoted.push(target.name);
      } else {
        report.kept.push(target.name);
      }
    } catch (err) {
      report.errors.push({ name: target.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return report;
}

/**
 * loadSkills minus any skill demoted to draft. The runtime injects these into
 * the active system prompt instead of loadSkills so demotion takes effect.
 * loadSkills stays the full listing for the Skills Hub card.
 */
export function loadActiveSkills(waggleHome: string): LoadedSkill[] {
  return loadSkills(waggleHome).filter(s => !isSkillDraft(waggleHome, s.name));
}

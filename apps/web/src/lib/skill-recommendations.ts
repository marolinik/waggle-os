/**
 * Persona-aware skill recommendations for the empty-chat surface.
 *
 * The 18 starter skills at packages/sdk/src/starter-skills/ are auto-installed
 * on first run and loaded into the agent regardless of tier (see
 * skills.ts:54-63). This module decides WHICH 3-5 of those 18 to surface as
 * one-click chips when the user opens an empty chat in a workspace, based
 * on the workspace's persona.
 *
 * Same shape as connector-recommendations: silent default ordering, full
 * 18 always reachable through the slash-command picker, no capability
 * cap. A consultant gets `research-synthesis` + `draft-memo` up front; a
 * coder gets `code-review` + `task-breakdown`.
 *
 * Click semantics: each entry has a `starter` string that pre-fills the
 * chat input. The user finishes the sentence and sends — making the
 * first turn meaningful for someone who doesn't know slash commands yet.
 */

export interface SkillRecommendation {
  /** Skill id matching the .md filename in packages/sdk/src/starter-skills/. */
  id: string;
  /** Human-readable label for the chip ("Draft Memo", not "draft-memo"). */
  label: string;
  /** Pre-fill template that lands in the chat input when the chip is clicked. */
  starter: string;
}

/**
 * Catalog of all 18 starter skills with display label + starter template.
 * Single source of truth — every persona recommendation references these
 * by id, validated by the test suite.
 */
export const SKILL_CATALOG: Readonly<Record<string, Omit<SkillRecommendation, 'id'>>> = {
  'brainstorm':         { label: 'Brainstorm',          starter: 'Help me brainstorm ideas for: ' },
  'catch-up':           { label: 'Catch Up',            starter: 'Catch me up on: ' },
  'code-review':        { label: 'Review Code',         starter: 'Review this code: ' },
  'compare-docs':       { label: 'Compare Docs',        starter: 'Compare these documents: ' },
  'daily-plan':         { label: 'Plan My Day',         starter: 'Help me plan today around: ' },
  'decision-matrix':    { label: 'Decision Matrix',     starter: 'Build a decision matrix for: ' },
  'draft-memo':         { label: 'Draft Memo',          starter: 'Draft a memo about: ' },
  'explain-concept':    { label: 'Explain',             starter: 'Explain this concept: ' },
  'extract-actions':    { label: 'Extract Actions',     starter: 'Extract action items from: ' },
  'meeting-prep':       { label: 'Meeting Prep',        starter: 'Prep me for my meeting on: ' },
  'plan-execute':       { label: 'Plan + Execute',      starter: 'Plan and execute: ' },
  'research-synthesis': { label: 'Research Synthesis',  starter: 'Research and synthesize: ' },
  'research-team':      { label: 'Research Team',       starter: 'Run a multi-agent research on: ' },
  'retrospective':      { label: 'Retrospective',       starter: 'Run a retrospective on: ' },
  'review-pair':        { label: 'Pair Review',         starter: 'Pair-review this with me: ' },
  'risk-assessment':    { label: 'Risk Assessment',     starter: 'Assess risks in: ' },
  'status-update':      { label: 'Status Update',       starter: 'Draft a status update on: ' },
  'task-breakdown':     { label: 'Break Down Task',     starter: 'Break this down into tasks: ' },
};

/**
 * Universal default skills used when a persona has no specific mapping or
 * is unrecognized. Three skills any role finds useful day 1.
 */
const UNIVERSAL_SKILLS = ['daily-plan', 'brainstorm', 'catch-up'] as const;

/**
 * Per-persona skill recommendations. Keys must match canonical persona ids
 * from packages/agent/src/persona-data.ts. Adding a persona without a
 * mapping is allowed — `recommendSkills` falls back to UNIVERSAL_SKILLS so
 * the chip row never goes empty. Test coverage enforces full persona-set
 * membership and validates every id resolves into SKILL_CATALOG.
 */
export const SKILL_RECOMMENDATIONS: Readonly<Record<string, readonly string[]>> = {
  // Universal / reasoning personas
  'general-purpose':   UNIVERSAL_SKILLS,
  'planner':           ['daily-plan', 'task-breakdown', 'plan-execute', 'brainstorm'],
  'verifier':          ['decision-matrix', 'risk-assessment', 'review-pair', 'compare-docs'],
  'coordinator':       ['plan-execute', 'task-breakdown', 'status-update', 'daily-plan'],

  // Knowledge-tier
  'researcher':        ['research-synthesis', 'explain-concept', 'research-team', 'brainstorm'],
  'writer':            ['draft-memo', 'compare-docs', 'extract-actions', 'brainstorm'],
  'analyst':           ['decision-matrix', 'risk-assessment', 'retrospective', 'brainstorm'],
  'coder':             ['code-review', 'review-pair', 'task-breakdown', 'brainstorm'],

  // Domain-tier
  'project-manager':       ['task-breakdown', 'daily-plan', 'status-update', 'retrospective', 'plan-execute'],
  'executive-assistant':   ['catch-up', 'status-update', 'meeting-prep', 'daily-plan'],
  'sales-rep':             ['meeting-prep', 'catch-up', 'status-update', 'draft-memo'],
  'marketer':              ['brainstorm', 'draft-memo', 'decision-matrix', 'status-update'],
  'product-manager-senior':['decision-matrix', 'draft-memo', 'retrospective', 'plan-execute', 'brainstorm'],
  'hr-manager':            ['draft-memo', 'decision-matrix', 'meeting-prep', 'status-update'],
  'legal-professional':    ['draft-memo', 'compare-docs', 'decision-matrix', 'risk-assessment'],
  'finance-owner':         ['decision-matrix', 'risk-assessment', 'status-update', 'draft-memo'],
  'consultant':            ['research-synthesis', 'decision-matrix', 'draft-memo', 'daily-plan', 'brainstorm'],
  'support-agent':         ['catch-up', 'draft-memo', 'status-update', 'meeting-prep'],
  'ops-manager':           ['task-breakdown', 'status-update', 'retrospective', 'decision-matrix'],
  'data-engineer':         ['task-breakdown', 'decision-matrix', 'plan-execute', 'brainstorm'],
  'recruiter':             ['meeting-prep', 'draft-memo', 'status-update', 'decision-matrix'],
  'creative-director':     ['brainstorm', 'draft-memo', 'decision-matrix', 'retrospective'],
};

/**
 * Resolve persona id -> array of {id, label, starter} chips. Falls back to
 * universal defaults for unknown ids. Always returns at least one chip so
 * the surface never strands empty.
 */
export function recommendSkills(personaId: string | undefined | null): SkillRecommendation[] {
  const ids = (personaId && SKILL_RECOMMENDATIONS[personaId]) || UNIVERSAL_SKILLS;
  return ids.flatMap(id => {
    const meta = SKILL_CATALOG[id];
    if (!meta) return [];
    return [{ id, ...meta }];
  });
}

/** All skill ids referenced anywhere in this file. Used by the catalog
 *  membership test to assert every recommendation resolves into a real
 *  starter skill. */
export function allReferencedSkillIds(): string[] {
  const seen = new Set<string>();
  for (const id of UNIVERSAL_SKILLS) seen.add(id);
  for (const ids of Object.values(SKILL_RECOMMENDATIONS)) {
    for (const id of ids) seen.add(id);
  }
  return [...seen].sort();
}

import analyticsAvatar from '@/assets/personas/analytics.jpeg';
import contentWriterAvatar from '@/assets/personas/content-writer.jpeg';
import forecasterAvatar from '@/assets/personas/forecaster.jpeg';
import hookAnalyzerAvatar from '@/assets/personas/hook-analyzer.jpeg';
import publisherAvatar from '@/assets/personas/publisher.jpeg';
import researcherAvatar from '@/assets/personas/researcher.jpeg';
import synthesizerAvatar from '@/assets/personas/synthesizer.jpeg';
import trendDetectorAvatar from '@/assets/personas/trend-detector.jpeg';

export interface PersonaConfig {
  id: string;
  name: string;
  description: string;
  avatar: string;
  role: string;
}

/**
 * Map all 22 real agent persona IDs (from packages/agent/src/persona-data.ts)
 * to the 8 available bee avatars. Best-fit mapping by domain affinity.
 */
const AVATAR_MAP: Record<string, string> = {
  // Universal modes
  'general-purpose': synthesizerAvatar,
  'planner': forecasterAvatar,
  'verifier': hookAnalyzerAvatar,
  'coordinator': publisherAvatar,
  // Knowledge workers
  'researcher': researcherAvatar,
  'writer': contentWriterAvatar,
  'analyst': analyticsAvatar,
  'coder': hookAnalyzerAvatar,
  // Domain specialists
  'project-manager': forecasterAvatar,
  'executive-assistant': publisherAvatar,
  'sales-rep': trendDetectorAvatar,
  'marketer': contentWriterAvatar,
  'product-manager-senior': forecasterAvatar,
  'hr-manager': publisherAvatar,
  'legal-professional': analyticsAvatar,
  'finance-owner': analyticsAvatar,
  'consultant': synthesizerAvatar,
  'support-agent': publisherAvatar,
  'ops-manager': forecasterAvatar,
  'data-engineer': analyticsAvatar,
  'recruiter': trendDetectorAvatar,
  'creative-director': contentWriterAvatar,
};

/** Default avatar for any unmapped persona (e.g. custom personas) */
const DEFAULT_AVATAR = researcherAvatar;

/**
 * The 22 real personas from @waggle/agent, with bee avatars.
 *
 * NOTE: We don't import from @waggle/agent directly because the web app
 * bundles separately and the agent package has Node.js dependencies.
 * Instead, we maintain this ID-to-metadata mapping.
 */
export const PERSONAS: PersonaConfig[] = [
  // ── Universal Modes ──────────────────────────────────────────────
  { id: 'general-purpose', name: 'General Purpose', description: 'Versatile agent for any task -- research, writing, analysis, coding, planning', avatar: AVATAR_MAP['general-purpose'], role: 'general-purpose' },
  { id: 'planner', name: 'Planner', description: 'Strategic planning specialist -- explores context, designs approaches, outputs actionable plans', avatar: AVATAR_MAP['planner'], role: 'planner' },
  { id: 'verifier', name: 'Verifier', description: 'Adversarial quality assurance -- tries to break outputs before they reach the user', avatar: AVATAR_MAP['verifier'], role: 'verifier' },
  { id: 'coordinator', name: 'Coordinator', description: 'Pure orchestrator -- delegates work to specialists, synthesizes results, never executes directly', avatar: AVATAR_MAP['coordinator'], role: 'coordinator' },

  // ── Knowledge Workers ────────────────────────────────────────────
  { id: 'researcher', name: 'Researcher', description: 'Deep investigation, multi-source synthesis, citation tracking', avatar: AVATAR_MAP['researcher'], role: 'researcher' },
  { id: 'writer', name: 'Writer', description: 'Document drafting, editing, formatting, tone adaptation', avatar: AVATAR_MAP['writer'], role: 'writer' },
  { id: 'analyst', name: 'Analyst', description: 'Data analysis, pattern recognition, decision matrices', avatar: AVATAR_MAP['analyst'], role: 'analyst' },
  { id: 'coder', name: 'Coder', description: 'Software development, debugging, code review, architecture', avatar: AVATAR_MAP['coder'], role: 'coder' },

  // ── Domain Specialists ───────────────────────────────────────────
  { id: 'project-manager', name: 'Project Manager', description: 'Task tracking, status reports, timeline management, coordination', avatar: AVATAR_MAP['project-manager'], role: 'project-manager' },
  { id: 'executive-assistant', name: 'Executive Assistant', description: 'Email drafting, meeting prep, calendar management, correspondence', avatar: AVATAR_MAP['executive-assistant'], role: 'executive-assistant' },
  { id: 'sales-rep', name: 'Sales Rep', description: 'Lead research, outreach drafting, pipeline management, competitor analysis', avatar: AVATAR_MAP['sales-rep'], role: 'sales-rep' },
  { id: 'marketer', name: 'Marketer', description: 'Content creation, campaign planning, SEO, social media strategy', avatar: AVATAR_MAP['marketer'], role: 'marketer' },
  { id: 'product-manager-senior', name: 'Senior PM', description: 'PRD drafting, decision tracking, research synthesis, roadmap management', avatar: AVATAR_MAP['product-manager-senior'], role: 'product-manager-senior' },
  { id: 'hr-manager', name: 'HR Manager', description: 'Policy management, onboarding workflows, compliance, employee relations', avatar: AVATAR_MAP['hr-manager'], role: 'hr-manager' },
  { id: 'legal-professional', name: 'Legal Counsel', description: 'Contract review, legal correspondence, compliance checklists, jurisdiction awareness', avatar: AVATAR_MAP['legal-professional'], role: 'legal-professional' },
  { id: 'finance-owner', name: 'Business Finance', description: 'Financial analysis, invoicing, regulatory compliance, multi-audience communication', avatar: AVATAR_MAP['finance-owner'], role: 'finance-owner' },
  { id: 'consultant', name: 'Strategy Consultant', description: 'Research + analysis + writing for client projects, citation tracking, deliverable formatting', avatar: AVATAR_MAP['consultant'], role: 'consultant' },
  { id: 'support-agent', name: 'Customer Support', description: 'Ticket resolution, knowledge base management, escalation handling', avatar: AVATAR_MAP['support-agent'], role: 'support-agent' },
  { id: 'ops-manager', name: 'Operations Manager', description: 'Process documentation, SOP creation, vendor management, operational excellence', avatar: AVATAR_MAP['ops-manager'], role: 'ops-manager' },
  { id: 'data-engineer', name: 'Data Engineer', description: 'SQL queries, data pipelines, dashboard design, data quality', avatar: AVATAR_MAP['data-engineer'], role: 'data-engineer' },
  { id: 'recruiter', name: 'Recruiter', description: 'Talent sourcing, candidate screening, job descriptions, interview preparation', avatar: AVATAR_MAP['recruiter'], role: 'recruiter' },
  { id: 'creative-director', name: 'Creative Director', description: 'Creative briefs, feedback synthesis, brand consistency, design direction', avatar: AVATAR_MAP['creative-director'], role: 'creative-director' },
];

export const getPersonaById = (id: string): PersonaConfig | undefined =>
  PERSONAS.find(p => p.id === id);

/**
 * Returns the bee avatar for any persona ID.
 * Falls back to the default (researcher) avatar for unknown IDs.
 */
export const getPersonaAvatar = (id: string): string =>
  AVATAR_MAP[id] ?? DEFAULT_AVATAR;

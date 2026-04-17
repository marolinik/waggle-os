import {
  Brain, Layers, Wrench, Target, Microscope, Laptop, Megaphone, Rocket,
  Scale, Building, Plus, PenLine, BarChart3, Code, ClipboardList, Mail,
  Hexagon, Zap, Crown, HeadphonesIcon, Settings, Database, Users,
  Palette, DollarSign, Briefcase,
} from 'lucide-react';
import type { OnboardingTemplate, OnboardingPersona, ValueProp, TierOption } from './types';
import type { UserTier } from '@/lib/dock-tiers';

export const TEMPLATES: readonly OnboardingTemplate[] = [
  { id: 'sales-pipeline', name: 'Sales Pipeline', icon: Target, hint: 'Research the top 5 competitors in my industry', desc: 'Track deals and prospects' },
  { id: 'research-project', name: 'Research Hub', icon: Microscope, hint: 'Help me design a literature review on my topic', desc: 'Deep dive into any subject' },
  { id: 'code-review', name: 'Engineering', icon: Laptop, hint: 'Read my project and tell me what you see', desc: 'Code, review, and ship' },
  { id: 'marketing-campaign', name: 'Marketing & Content', icon: Megaphone, hint: 'Draft a campaign brief for my product launch', desc: 'Campaigns, copy, and SEO' },
  { id: 'product-launch', name: 'Product Management', icon: Rocket, hint: 'Help me write a PRD for my next feature', desc: 'Specs, roadmaps, and launches' },
  { id: 'legal-review', name: 'Legal & Compliance', icon: Scale, hint: 'Draft a standard NDA template', desc: 'Contracts, compliance, and risk' },
  { id: 'agency-consulting', name: 'Consulting', icon: Building, hint: 'Set up client workspaces for my biggest accounts', desc: 'Client delivery and strategy' },
  { id: 'customer-support', name: 'Customer Support', icon: HeadphonesIcon, hint: 'Help me draft a response to this customer issue', desc: 'Tickets, KB, and escalation' },
  { id: 'finance-accounting', name: 'Finance', icon: DollarSign, hint: 'Prepare a variance analysis for this month', desc: 'Budgets, reports, and close' },
  { id: 'hr-people', name: 'HR & People', icon: Users, hint: 'Draft a job description for a senior engineer', desc: 'Hiring, policy, and onboarding' },
  { id: 'operations-center', name: 'Operations', icon: Settings, hint: 'Create an SOP for our onboarding process', desc: 'Processes, SOPs, and vendors' },
  { id: 'data-analytics', name: 'Data & Analytics', icon: Database, hint: 'Write a SQL query to find our top customers', desc: 'SQL, dashboards, and insights' },
  { id: 'recruiting-pipeline', name: 'Recruiting', icon: Briefcase, hint: 'Write a job description and screening scorecard', desc: 'Source, screen, and hire' },
  { id: 'design-studio', name: 'Design Studio', icon: Palette, hint: 'Write a creative brief for our rebrand', desc: 'Briefs, feedback, and brand' },
  { id: 'blank', name: 'Blank Workspace', icon: Plus, hint: 'Hello! What can you help me with?', desc: 'Start from scratch' },
] as const;

export const TEMPLATE_PERSONA: Readonly<Record<string, string>> = {
  'sales-pipeline': 'sales-rep',
  'research-project': 'researcher',
  'code-review': 'coder',
  'marketing-campaign': 'marketer',
  'product-launch': 'product-manager-senior',
  'legal-review': 'legal-professional',
  'agency-consulting': 'consultant',
  'customer-support': 'support-agent',
  'finance-accounting': 'finance-owner',
  'hr-people': 'hr-manager',
  'operations-center': 'ops-manager',
  'data-analytics': 'data-engineer',
  'recruiting-pipeline': 'recruiter',
  'design-studio': 'creative-director',
  'blank': 'general-purpose',
};

export const ALL_ONBOARDING_PERSONAS: readonly OnboardingPersona[] = [
  { id: 'general-purpose', name: 'General Purpose', icon: Brain, desc: 'Adapts to any task', tier: 'universal' as const },
  { id: 'researcher', name: 'Researcher', icon: Microscope, desc: 'Deep research & synthesis', tier: 'knowledge' as const },
  { id: 'writer', name: 'Writer', icon: PenLine, desc: 'Drafting & editing', tier: 'knowledge' as const },
  { id: 'analyst', name: 'Analyst', icon: BarChart3, desc: 'Data analysis & decisions', tier: 'knowledge' as const },
  { id: 'coder', name: 'Coder', icon: Code, desc: 'Code & architecture', tier: 'knowledge' as const },
  { id: 'project-manager', name: 'Project Manager', icon: ClipboardList, desc: 'Planning & coordination', tier: 'domain' as const },
  { id: 'executive-assistant', name: 'Exec Assistant', icon: Mail, desc: 'Email & scheduling', tier: 'domain' as const },
  { id: 'sales-rep', name: 'Sales Rep', icon: Target, desc: 'Prospecting & outreach', tier: 'domain' as const },
  { id: 'marketer', name: 'Marketer', icon: Megaphone, desc: 'Campaigns & copy', tier: 'domain' as const },
  { id: 'product-manager-senior', name: 'Senior PM', icon: Rocket, desc: 'PRDs & roadmaps', tier: 'domain' as const },
  { id: 'hr-manager', name: 'HR Manager', icon: Users, desc: 'Policy & compliance', tier: 'domain' as const },
  { id: 'legal-professional', name: 'Legal Counsel', icon: Scale, desc: 'Contracts & compliance', tier: 'domain' as const },
  { id: 'finance-owner', name: 'Business Finance', icon: DollarSign, desc: 'Budgets & reporting', tier: 'domain' as const },
  { id: 'consultant', name: 'Consultant', icon: Building, desc: 'Strategy & deliverables', tier: 'domain' as const },
  { id: 'support-agent', name: 'Support Agent', icon: HeadphonesIcon, desc: 'Tickets & KB articles', tier: 'domain' as const },
  { id: 'ops-manager', name: 'Ops Manager', icon: Settings, desc: 'SOPs & processes', tier: 'domain' as const },
  { id: 'data-engineer', name: 'Data Engineer', icon: Database, desc: 'SQL & dashboards', tier: 'domain' as const },
  { id: 'recruiter', name: 'Recruiter', icon: Briefcase, desc: 'Sourcing & hiring', tier: 'domain' as const },
  { id: 'creative-director', name: 'Creative Director', icon: Palette, desc: 'Briefs & brand', tier: 'domain' as const },
] as const;

/** Get personas relevant to the selected template — recommended first, then others */
export function getPersonasForTemplate(templateId: string): readonly OnboardingPersona[] {
  const recommended = TEMPLATE_PERSONA[templateId];
  const universal = ALL_ONBOARDING_PERSONAS.filter(p => p.tier === 'universal');
  const knowledge = ALL_ONBOARDING_PERSONAS.filter(p => p.tier === 'knowledge');
  const domain = ALL_ONBOARDING_PERSONAS.filter(p => p.tier === 'domain');
  return [
    ...domain.filter(p => p.id === recommended),
    ...universal,
    ...knowledge,
    ...domain.filter(p => p.id !== recommended),
  ];
}

// QW-5: display labels renamed to avoid collision with billing tiers
// (billing uses "Pro $19/mo", "Teams $49/seat"). Dock tiers describe how
// many icons appear — they are UI layout, not billing. Internal enum
// values ('simple' / 'professional' / 'power') stay the same so stored
// user preferences keep working without migration.
export const TIER_OPTIONS: readonly TierOption[] = [
  {
    id: 'simple' as UserTier,
    name: 'Essential',
    icon: Hexagon,
    color: 'text-sky-400',
    desc: 'Clean and focused. Just the essentials — chat, files, and home.',
  },
  {
    id: 'professional' as UserTier,
    name: 'Standard',
    icon: Zap,
    color: 'text-amber-400',
    desc: 'Agents, memory, and workspace tools. The full knowledge-worker kit.',
  },
  {
    id: 'power' as UserTier,
    name: 'Everything',
    icon: Crown,
    color: 'text-violet-400',
    desc: 'All apps visible. Ops console, scheduled jobs, marketplace.',
  },
] as const;

export const VALUE_PROPS: readonly ValueProp[] = [
  { icon: Brain, title: 'Remembers everything', desc: 'Persistent memory across all sessions' },
  { icon: Layers, title: 'Workspace-native', desc: 'One brain per project, fully isolated' },
  { icon: Wrench, title: 'Real tools', desc: 'Search, draft, code, plan — not just chat' },
] as const;

/** Shared framer-motion transition for step content */
export const fadeSlide = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.2 },
} as const;

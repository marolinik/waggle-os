/**
 * Waggle Marketplace — Package Category Taxonomy
 *
 * Defines the canonical set of categories for marketplace packages
 * and provides auto-categorization based on name + description keywords.
 */

import type { MarketplaceDB } from './db';

export const PACKAGE_CATEGORIES = [
  { id: 'marketing', name: 'Marketing', icon: '\u{1F4E2}', description: 'Campaign planning, SEO, content marketing, social media' },
  { id: 'knowledge', name: 'Knowledge & Research', icon: '\u{1F52C}', description: 'Research, analysis, literature review, fact-checking' },
  { id: 'sales', name: 'Sales & CRM', icon: '\u{1F3AF}', description: 'Lead research, outreach, pipeline management, proposals' },
  { id: 'social', name: 'Social Presence', icon: '\u{1F4F1}', description: 'Social media management, community, content scheduling' },
  { id: 'coding', name: 'Coding & Development', icon: '\u{1F4BB}', description: 'Code generation, review, debugging, testing, DevOps' },
  { id: 'security', name: 'Security', icon: '\u{1F512}', description: 'Security scanning, vulnerability assessment, compliance' },
  { id: 'documents', name: 'Document Creation', icon: '\u{1F4C4}', description: 'Writing, editing, formatting, PDF, DOCX generation' },
  { id: 'design', name: 'Design', icon: '\u{1F3A8}', description: 'UI/UX, graphics, prototyping, design systems' },
  { id: 'applications', name: 'Applications', icon: '\u{1F9E9}', description: 'App building, web development, deployment' },
  { id: 'data', name: 'Data & Analytics', icon: '\u{1F4CA}', description: 'Data analysis, visualization, SQL, spreadsheets' },
  { id: 'communication', name: 'Communication', icon: '\u{1F4AC}', description: 'Email, Slack, Teams, Discord, messaging' },
  { id: 'project-management', name: 'Project Management', icon: '\u{1F4CB}', description: 'Task tracking, planning, Jira, Linear, Asana' },
  { id: 'finance', name: 'Finance', icon: '\u{1F4B0}', description: 'Accounting, budgets, invoicing, financial analysis' },
  { id: 'legal', name: 'Legal', icon: '\u{2696}\u{FE0F}', description: 'Contract review, compliance, legal research' },
  { id: 'hr', name: 'Human Resources', icon: '\u{1F465}', description: 'Hiring, onboarding, performance reviews, policies' },
  { id: 'ai-ml', name: 'AI & Machine Learning', icon: '\u{1F916}', description: 'Model training, evaluation, prompt engineering' },
  { id: 'education', name: 'Education', icon: '\u{1F4DA}', description: 'Teaching, tutoring, curriculum, learning materials' },
  { id: 'content', name: 'Content Creation', icon: '\u{270D}\u{FE0F}', description: 'Blog posts, newsletters, copywriting, editing' },
  { id: 'devops', name: 'DevOps & Infrastructure', icon: '\u{1F3D7}\u{FE0F}', description: 'CI/CD, Docker, Kubernetes, cloud infrastructure' },
  { id: 'integration', name: 'Integration & Connectors', icon: '\u{1F517}', description: 'API connectors, webhooks, data pipelines' },
  { id: 'productivity', name: 'Productivity', icon: '\u{26A1}', description: 'Task automation, time management, workflow optimization' },
  { id: 'general', name: 'General', icon: '\u{1F4E6}', description: 'General-purpose skills and utilities' },
] as const;

export type PackageCategoryId = (typeof PACKAGE_CATEGORIES)[number]['id'];

/**
 * Auto-categorize a package based on name + description keywords.
 *
 * Rules are ordered from most-specific to least-specific to avoid
 * false positives (e.g. "pipeline" must match devops before sales,
 * "webhook" must match integration before "web" matches applications).
 */
export function categorizePackage(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase();

  // --- Highly specific categories first (few false positives) ---
  if (/financ|budget|invoice|accounting|tax\b/.test(text)) return 'finance';
  if (/legal|contract|complian|lawyer|regulat/.test(text)) return 'legal';
  if (/\bhr\b|hiring|recruit|onboard|employee/.test(text)) return 'hr';
  if (/devops|ci.?cd|docker|kubernetes|infra|cloud|aws/.test(text)) return 'devops';
  if (/security|vuln|pentest|cve/.test(text)) return 'security';

  // --- Domain categories (medium specificity) ---
  if (/market|seo|campaign|brand|advertis/.test(text)) return 'marketing';
  if (/research|knowledge|paper|literature|academic/.test(text)) return 'knowledge';
  if (/sales|lead\b|crm|outreach|prospect/.test(text)) return 'sales';
  if (/social|twitter|instagram|linkedin|facebook|tiktok/.test(text)) return 'social';
  if (/email|slack|discord|messag/.test(text)) return 'communication';
  if (/webhook|integrat|connect|pipe(?:line)?/.test(text)) return 'integration';
  if (/jira|linear|asana|trello|sprint|project.?manag/.test(text)) return 'project-management';
  if (/educat|teach|tutor|learn|course|curriculum/.test(text)) return 'education';

  // --- Broad technical categories (use word boundaries to reduce false positives) ---
  if (/\bcode\b|develop|debug|\btest\b|\bgit\b|\brepo\b|typescript|python|rust/.test(text)) return 'coding';
  if (/\bai\b|\bml\b|\bllm\b|prompt.?engineer|model.?train|embed/.test(text)) return 'ai-ml';
  if (/document|pdf|docx|\bword\b|\bwrite\b|format|template/.test(text)) return 'documents';
  if (/design|\bui\b|\bux\b|figma|css|tailwind|graphic/.test(text)) return 'design';
  if (/data|analyt|sql|database|spreadsheet|chart|viz/.test(text)) return 'data';
  if (/blog|newsletter|copy|content|edit|article/.test(text)) return 'content';
  if (/\bapp\b|\bweb\b|deploy|build|frontend|backend|\bapi\b/.test(text)) return 'applications';
  if (/\btask\b|automat|workflow|efficienc|productiv/.test(text)) return 'productivity';
  return 'general';
}

/**
 * Re-categorize all packages in the database using the keyword-based
 * categorizer. Call this during sync and on startup to ensure categories
 * stay consistent.
 */
export function recategorizeAll(db: MarketplaceDB): { updated: number; total: number } {
  // Access raw DB through the public interface: search all packages
  const allResults = db.search({ limit: 10000 });
  let updated = 0;

  for (const pkg of allResults.packages) {
    const newCategory = categorizePackage(pkg.name, pkg.description || '');
    if (newCategory !== pkg.category) {
      // Use upsertPackage to update just the category
      db.upsertPackage({
        name: pkg.name,
        source_id: pkg.source_id,
        category: newCategory,
      });
      updated++;
    }
  }

  return { updated, total: allResults.packages.length };
}

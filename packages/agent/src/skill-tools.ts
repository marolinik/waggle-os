/**
 * Skill discovery, installation, and management tools for the agent.
 *
 * These tools let the agent dynamically discover capabilities it needs,
 * install skills from the local filesystem or by creating them on the fly,
 * and manage the active skill set — closing the gap to Claude Code's ecosystem.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ToolDefinition } from './tools.js';
import { SkillRecommender } from './skill-recommender.js';
import { searchCapabilities, validateInstallCandidate, type MarketplaceCandidate } from './capability-acquisition.js';
import { assessTrust, formatTrustSummary } from './trust-model.js';
import type { InstallAuditStore } from '@waggle/core';
// Lazy import to avoid circular dependency (agent ↔ marketplace)
let _SecurityGate: any = null;
async function getSecurityGate() {
  if (!_SecurityGate) {
    const mod = await import('@waggle/marketplace');
    _SecurityGate = mod.SecurityGate;
  }
  return _SecurityGate;
}
import { generateSkillMarkdown, type SkillTemplate } from './skill-creator.js';

export interface SkillToolsDeps {
  /** Path to ~/.waggle directory */
  waggleHome: string;
  /** Callback to reload skills into agent state after changes */
  onSkillsChanged?: () => void;
  /** Path to starter skills source directory (from @waggle/sdk) */
  starterSkillsDir?: string;
  /** Function to get current installed skills (for acquisition search) */
  getInstalledSkills?: () => Array<{ name: string; content: string }>;
  /** Native tool names (for acquisition search — avoids proposing install when a tool exists) */
  nativeToolNames?: string[];
  /** Audit store for recording install events (optional — degrades gracefully) */
  auditStore?: InstallAuditStore;
  /** Optional callback to search the marketplace catalog for capabilities */
  searchMarketplace?: (query: string) => Promise<MarketplaceCandidate[]>;
}

export function createSkillTools(deps: SkillToolsDeps): ToolDefinition[] {
  const { waggleHome, onSkillsChanged } = deps;
  const skillsDir = path.join(waggleHome, 'skills');
  const pluginsDir = path.join(waggleHome, 'plugins');

  // Ensure directories exist
  if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
  if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });

  return [
    // 1. list_skills — Show all installed skills and plugins
    {
      name: 'list_skills',
      description: 'List all installed skills and plugins. Skills extend your capabilities. Use this to check what you already have before searching for new ones.',
      parameters: {
        type: 'object',
        properties: {
          verbose: { type: 'boolean', description: 'Show full skill content (default: false, shows preview only)' },
        },
      },
      execute: async (args) => {
        const verbose = args.verbose as boolean ?? false;

        // List skills
        const skillFiles = fs.existsSync(skillsDir)
          ? fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'))
          : [];

        const skills = skillFiles.map(f => {
          const name = f.replace(/\.md$/, '');
          const content = fs.readFileSync(path.join(skillsDir, f), 'utf-8').trim();
          return {
            name,
            type: 'skill' as const,
            preview: verbose ? content : content.slice(0, 150) + (content.length > 150 ? '...' : ''),
            size: content.length,
          };
        });

        // List plugins
        const pluginEntries = fs.existsSync(pluginsDir)
          ? fs.readdirSync(pluginsDir, { withFileTypes: true }).filter(d => d.isDirectory())
          : [];

        const plugins = pluginEntries.map(d => {
          const manifestPath = path.join(pluginsDir, d.name, 'manifest.json');
          let manifest: Record<string, unknown> = {};
          if (fs.existsSync(manifestPath)) {
            try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch { /* ignore */ }
          }
          return {
            name: d.name,
            type: 'plugin' as const,
            description: (manifest.description as string) ?? 'No description',
            version: (manifest.version as string) ?? 'unknown',
          };
        });

        if (skills.length === 0 && plugins.length === 0) {
          return 'No skills or plugins installed.\n\nYou can create a new skill with create_skill or search for existing ones with search_skills.';
        }

        let output = '';
        if (skills.length > 0) {
          output += `## Installed Skills (${skills.length})\n\n`;
          for (const s of skills) {
            output += `- **${s.name}** (${s.size} chars)\n  ${s.preview}\n\n`;
          }
        }
        if (plugins.length > 0) {
          output += `## Installed Plugins (${plugins.length})\n\n`;
          for (const p of plugins) {
            output += `- **${p.name}** v${p.version} — ${p.description}\n`;
          }
        }
        return output;
      },
    },

    // 2. create_skill — Create a new skill on the fly (supports raw content OR structured template)
    {
      name: 'create_skill',
      description: 'Create a new reusable skill from a workflow description or raw markdown content. Skills are loaded into your system prompt and persist across sessions. You can provide either raw `content` (markdown) or structured fields (`description`, `steps`, `tools`, `category`) and the skill markdown will be generated automatically.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill name (kebab-case, alphanumeric + hyphens, no spaces)' },
          content: { type: 'string', description: 'Raw skill content in markdown. If provided, steps/tools/category are ignored.' },
          description: { type: 'string', description: 'What this skill does (used when generating from structured input)' },
          steps: { type: 'array', items: { type: 'string' }, description: 'Step-by-step workflow instructions' },
          tools: { type: 'array', items: { type: 'string' }, description: 'Tools this skill uses (e.g., web_search, save_memory)' },
          category: { type: 'string', description: 'Category (coding, research, writing, planning, knowledge, general)' },
        },
        required: ['name'],
      },
      execute: async (args) => {
        const name = args.name as string;
        const rawContent = args.content as string | undefined;
        const description = args.description as string | undefined;
        const steps = args.steps as string[] | undefined;
        const tools = args.tools as string[] | undefined;
        const category = args.category as string | undefined;

        // Validate name
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
          return 'Error: Skill name must contain only letters, numbers, hyphens, and underscores.';
        }

        // Determine content: raw content takes priority, otherwise generate from template
        let content: string;
        if (rawContent) {
          content = rawContent;
        } else if (description && steps && steps.length > 0) {
          const template: SkillTemplate = {
            name,
            description,
            triggerPatterns: [],
            steps,
            tools: tools ?? [],
            category: category ?? 'general',
          };
          content = generateSkillMarkdown(template);
        } else {
          return 'Error: Provide either "content" (raw markdown) or "description" + "steps" (structured input).';
        }

        const filePath = path.join(skillsDir, `${name}.md`);
        const exists = fs.existsSync(filePath);

        fs.writeFileSync(filePath, content, 'utf-8');
        onSkillsChanged?.();

        return `${exists ? 'Updated' : 'Created'} skill "${name}" (${content.length} chars).\nLocation: ${filePath}\n\nThe skill is now active and will be included in your system prompt for all future messages.`;
      },
    },

    // 3. delete_skill — Remove a skill
    {
      name: 'delete_skill',
      description: 'Delete an installed skill by name.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the skill to delete' },
        },
        required: ['name'],
      },
      execute: async (args) => {
        const name = args.name as string;
        if (name.includes('..') || name.includes('/') || name.includes('\\')) {
          return 'Error: Invalid skill name.';
        }
        const filePath = path.join(skillsDir, `${name}.md`);
        if (!fs.existsSync(filePath)) {
          return `Error: Skill "${name}" not found.`;
        }
        fs.unlinkSync(filePath);
        onSkillsChanged?.();
        return `Deleted skill "${name}".`;
      },
    },

    // 4. read_skill — Read full content of a skill
    {
      name: 'read_skill',
      description: 'Read the full content of an installed skill.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the skill to read' },
        },
        required: ['name'],
      },
      execute: async (args) => {
        const name = args.name as string;
        if (name.includes('..') || name.includes('/') || name.includes('\\')) {
          return 'Error: Invalid skill name.';
        }
        const filePath = path.join(skillsDir, `${name}.md`);
        if (!fs.existsSync(filePath)) {
          return `Error: Skill "${name}" not found.`;
        }
        return fs.readFileSync(filePath, 'utf-8');
      },
    },

    // 5. search_skills — Search for skills/tools by description
    {
      name: 'search_skills',
      description: 'Search for skills and tools you might need. Searches installed skills by content/name, and suggests built-in capabilities. Use when the user asks you to do something and you want to check if you have the right tool.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What capability are you looking for? (e.g., "generate PDF", "code review", "data analysis")' },
        },
        required: ['query'],
      },
      execute: async (args) => {
        const query = (args.query as string).toLowerCase();

        // Search installed skills
        const skillFiles = fs.existsSync(skillsDir)
          ? fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'))
          : [];

        const matchingSkills = skillFiles
          .map(f => {
            const name = f.replace(/\.md$/, '');
            const content = fs.readFileSync(path.join(skillsDir, f), 'utf-8');
            const nameMatch = name.toLowerCase().includes(query);
            const contentMatch = content.toLowerCase().includes(query);
            return { name, content, match: nameMatch || contentMatch, nameMatch };
          })
          .filter(s => s.match)
          .map(s => `- **${s.name}** (installed skill) — ${s.content.slice(0, 100)}...`);

        // Built-in capability suggestions based on query keywords
        const suggestions: string[] = [];
        const builtins: Array<{ keywords: string[]; desc: string }> = [
          { keywords: ['document', 'docx', 'word', 'report'], desc: 'generate_docx — Create formatted Word documents from markdown' },
          { keywords: ['plan', 'planning', 'steps', 'strategy'], desc: 'create_plan — Create structured multi-step plans' },
          { keywords: ['git', 'commit', 'version', 'branch'], desc: 'git_status/git_diff/git_log/git_commit — Version control tools' },
          { keywords: ['memory', 'remember', 'recall', 'history'], desc: 'search_memory/save_memory — Persistent memory across sessions' },
          { keywords: ['web', 'search', 'internet', 'browse', 'fetch'], desc: 'web_search/web_fetch — Search and read web pages' },
          { keywords: ['file', 'read', 'write', 'edit', 'code'], desc: 'read_file/write_file/edit_file — File system operations' },
          { keywords: ['bash', 'command', 'terminal', 'shell', 'run'], desc: 'bash — Execute shell commands' },
          { keywords: ['knowledge', 'graph', 'entity', 'relation'], desc: 'query_knowledge/correct_knowledge — Knowledge graph operations' },
          { keywords: ['search', 'find', 'grep', 'pattern'], desc: 'search_files/search_content — Find files and search contents' },
        ];

        for (const b of builtins) {
          if (b.keywords.some(k => query.includes(k))) {
            suggestions.push(`- ${b.desc} (built-in tool)`);
          }
        }

        let output = '';
        if (matchingSkills.length > 0) {
          output += `## Matching Installed Skills\n${matchingSkills.join('\n')}\n\n`;
        }
        if (suggestions.length > 0) {
          output += `## Relevant Built-in Tools\n${suggestions.join('\n')}\n\n`;
        }
        if (matchingSkills.length === 0 && suggestions.length === 0) {
          output += `No installed skills or built-in tools match "${query}".\n\n`;
          output += '**Suggestions:**\n';
          output += '- Use `create_skill` to create a custom skill for this domain\n';
          output += '- Use `web_search` to find instructions or templates online\n';
          output += '- Use `bash` to check if relevant CLI tools are installed on the system\n';
        }

        return output;
      },
    },

    // 6. suggest_skill — Context-aware skill recommendations
    {
      name: 'suggest_skill',
      description: 'Get skill recommendations based on the current conversation context. Use this when you want to check if any installed skills could help with what the user is asking.',
      parameters: {
        type: 'object',
        properties: {
          context: { type: 'string', description: 'The current conversation topic or user request to match against installed skills' },
          topN: { type: 'number', description: 'Maximum number of suggestions to return (default: 3)' },
        },
        required: ['context'],
      },
      execute: async (args) => {
        const context = args.context as string;
        const topN = (args.topN as number) ?? 3;

        const recommender = new SkillRecommender({
          getSkills: () => {
            const files = fs.existsSync(skillsDir)
              ? fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'))
              : [];
            return files.map(f => ({
              name: f.replace(/\.md$/, ''),
              content: fs.readFileSync(path.join(skillsDir, f), 'utf-8').trim(),
            }));
          },
          activeSkills: [],
        });

        const suggestions = recommender.recommend(context, topN);

        if (suggestions.length === 0) {
          return 'No matching skills found. Consider creating a custom skill with create_skill.';
        }

        return suggestions.map((s, i) =>
          `${i + 1}. **${s.skillName}** (relevance: ${(s.relevanceScore * 100).toFixed(0)}%)\n   ${s.reason}`,
        ).join('\n\n');
      },
    },

    // 7. acquire_capability — Structured gap detection + candidate search
    {
      name: 'acquire_capability',
      description: `Detect capability gaps and find installable skills to fill them. Use this when:
- You encounter a task you don't have a specialized skill for
- The user asks for something that could benefit from structured guidance (risk assessment, research synthesis, code review, etc.)
- You want to check if there's a curated skill available before attempting a task with general abilities

Returns a structured proposal showing what's already available, what can be installed, and a recommendation with reasoning. If a native tool or active skill already covers the need, it tells you so instead of proposing an install.`,
      parameters: {
        type: 'object',
        properties: {
          need: {
            type: 'string',
            description: 'What capability you need — describe the task or domain (e.g., "risk assessment for a project", "synthesize research from multiple sources", "code review checklist")',
          },
        },
        required: ['need'],
      },
      execute: async (args) => {
        const need = args.need as string;
        if (!need || !need.trim()) {
          return 'Error: "need" is required — describe what capability you are looking for.';
        }

        const installedSkills = deps.getInstalledSkills?.() ?? (() => {
          const files = fs.existsSync(skillsDir)
            ? fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'))
            : [];
          return files.map(f => ({
            name: f.replace(/\.md$/, ''),
            content: fs.readFileSync(path.join(skillsDir, f), 'utf-8').trim(),
          }));
        })();

        const starterDir = deps.starterSkillsDir ?? '';
        const nativeTools = deps.nativeToolNames ?? [];

        // Search marketplace if callback is available (non-blocking — graceful fallback)
        let marketplaceCandidates: MarketplaceCandidate[] = [];
        if (deps.searchMarketplace) {
          try {
            marketplaceCandidates = await deps.searchMarketplace(need);
          } catch {
            // Marketplace unavailable — continue with local sources only
          }
        }

        const proposal = searchCapabilities({
          need,
          installedSkills,
          starterSkillsDir: starterDir,
          nativeToolNames: nativeTools,
          marketplaceCandidates,
        });

        // Record proposal audit event if a gap was detected with a recommendation
        if (proposal.gapDetected && proposal.recommendation?.trust) {
          const trust = proposal.recommendation.trust;
          deps.auditStore?.record({
            capabilityName: proposal.recommendation.name,
            capabilityType: proposal.recommendation.type,
            source: proposal.recommendation.source,
            riskLevel: trust.riskLevel,
            trustSource: trust.trustSource,
            approvalClass: trust.approvalClass,
            action: 'proposed',
            initiator: 'agent',
            detail: `Proposed for need: ${need}`,
          });
        }

        return proposal.summary;
      },
    },

    // 8. install_capability — Install a specific capability from a curated source (requires approval)
    {
      name: 'install_capability',
      description: `Install a capability identified by acquire_capability. This copies a curated starter skill into your active skill set. Requires user approval before installation (approval gate will appear in the UI).

After installation, the skill content is returned so you can immediately apply it to the current task. The skill is also hot-loaded into your system prompt for all future messages.

Only use this after acquire_capability has identified a specific installable candidate. Do not guess names — use the exact name and source from the proposal.`,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Exact name of the capability to install (from acquire_capability proposal)',
          },
          source: {
            type: 'string',
            description: 'Source of the capability (e.g., "starter-pack"). Must match the source from the proposal.',
          },
        },
        required: ['name', 'source'],
      },
      execute: async (args) => {
        const name = args.name as string;
        const source = args.source as string;

        // Path traversal protection
        if (name.includes('..') || name.includes('/') || name.includes('\\')) {
          return 'Error: Invalid capability name.';
        }

        const starterDir = deps.starterSkillsDir ?? '';
        const installedNames = new Set(
          fs.existsSync(skillsDir)
            ? fs.readdirSync(skillsDir).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
            : [],
        );

        // Validate this is a real, installable candidate
        const validation = validateInstallCandidate(name, source, starterDir, installedNames);
        if (!validation.valid) {
          // Record failed install attempt
          deps.auditStore?.record({
            capabilityName: name,
            capabilityType: 'skill',
            source,
            riskLevel: 'low',
            trustSource: 'unknown',
            approvalClass: 'standard',
            action: 'failed',
            initiator: 'agent',
            detail: validation.error ?? 'Validation failed',
          });
          return `Error: ${validation.error}`;
        }

        // Read content from starter pack for trust assessment
        const sourceContent = fs.readFileSync(validation.starterPath!, 'utf-8');

        // ── SecurityGate scan (heuristics-only) ──────────────────────
        let securityNote = '';
        try {
          const SGClass = await getSecurityGate();
          const gate = new SGClass({
            enable_gen_trust_hub: false,
            enable_cisco_scanner: false,
            enable_mcp_guardian: false,
            enable_heuristics: true,
          });
          const scanResult = await gate.scan(
            { name, package_type: 'skill', waggle_install_type: 'skill' } as any,
            sourceContent,
          );

          // CRITICAL: refuse installation
          if (scanResult.overall_severity === 'CRITICAL') {
            deps.auditStore?.record({
              capabilityName: name,
              capabilityType: 'skill',
              source,
              riskLevel: 'critical',
              trustSource: 'security-gate',
              approvalClass: 'blocked',
              action: 'blocked',
              initiator: 'system',
              detail: `SecurityGate blocked: ${scanResult.findings.length} CRITICAL finding(s)`,
            });
            const findingsText = scanResult.findings.map((f: any) => `- [${f.severity}] ${f.title}: ${f.description}`).join('\n');
            return (
              `## Installation Blocked — CRITICAL Security Finding\n\n` +
              `**${name}** cannot be installed due to critical security issues:\n\n` +
              `${findingsText}\n\n` +
              `Security score: ${scanResult.security_score}/100\n\n` +
              `This skill has been blocked for your protection. Do NOT attempt to bypass this gate.`
            );
          }

          // HIGH: include warning note — the agent should inform the user
          if (scanResult.overall_severity === 'HIGH') {
            const findingsText = scanResult.findings.map((f: any) => `- [${f.severity}] ${f.title}`).join('\n');
            securityNote = (
              `\n### Security Warning\n` +
              `SecurityGate found HIGH severity issues (score: ${scanResult.security_score}/100):\n` +
              `${findingsText}\n` +
              `The user should review these findings before relying on this skill.\n`
            );
          }

          // MEDIUM: include informational note
          if (scanResult.overall_severity === 'MEDIUM') {
            securityNote = (
              `\n### Security Note\n` +
              `SecurityGate found minor issues (score: ${scanResult.security_score}/100, ${scanResult.findings.length} finding(s)). ` +
              `Review recommended but not blocking.\n`
            );
          }

          // LOW/CLEAN: include score in summary
          if (scanResult.overall_severity === 'LOW' || scanResult.overall_severity === 'CLEAN') {
            securityNote = `\n- **Security Score**: ${scanResult.security_score}/100 (${scanResult.overall_severity})\n`;
          }
        } catch {
          // SecurityGate scan failure is non-blocking — proceed with install
          securityNote = '\n- **Security Scan**: Unavailable (scan engine error)\n';
        }

        // Assess trust before installing
        const trust = assessTrust({
          capabilityType: 'skill',
          source,
          content: sourceContent,
        });

        // Record proposal audit event
        deps.auditStore?.record({
          capabilityName: name,
          capabilityType: 'skill',
          source,
          riskLevel: trust.riskLevel,
          trustSource: trust.trustSource,
          approvalClass: trust.approvalClass,
          action: 'approved',
          initiator: 'agent',
          detail: trust.explanation,
        });

        // Copy from starter pack to installed skills directory
        const targetPath = path.join(skillsDir, `${name}.md`);
        fs.copyFileSync(validation.starterPath!, targetPath);

        // Trigger hot-reload so the skill is immediately available in runtime
        onSkillsChanged?.();

        // Record successful install audit event
        deps.auditStore?.record({
          capabilityName: name,
          capabilityType: 'skill',
          source,
          riskLevel: trust.riskLevel,
          trustSource: trust.trustSource,
          approvalClass: trust.approvalClass,
          action: 'installed',
          initiator: 'agent',
          detail: `Installed successfully. ${trust.explanation}`,
        });

        // Read the content to return it — so the agent can use it in the same turn
        const content = fs.readFileSync(targetPath, 'utf-8');
        const trustSummary = formatTrustSummary(trust);

        return (
          `## Skill Installed Successfully\n\n` +
          `**${name}** has been installed from the ${source} and is now active.\n\n` +
          `- **Location**: ${targetPath}\n` +
          `- **Status**: Active — loaded into your system prompt\n` +
          `- **Runtime**: Available immediately for this and all future sessions\n` +
          securityNote + `\n` +
          `### Trust Assessment\n${trustSummary}\n\n` +
          `### Skill Content\n\nUse the following instructions to complete the current task:\n\n` +
          `---\n\n${content}\n\n---\n\n` +
          `You can now apply this skill to the user's request.`
        );
      },
    },
  ];
}

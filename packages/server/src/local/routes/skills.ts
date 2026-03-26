import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { FastifyPluginAsync } from 'fastify';
import { PluginManager, getStarterSkillsDir, listStarterSkills, listCapabilityPacks, getPackManifest } from '@waggle/sdk';
import { loadSkills, SkillRecommender, assessTrust, generateSkillMarkdown, type SkillTemplate } from '@waggle/agent';
import { computeSkillHash } from '@waggle/core';

/** Capability family definitions — user-job-first grouping */
const SKILL_FAMILIES: Record<string, { family: string; label: string }> = {
  'draft-memo':          { family: 'writing', label: 'Writing & Docs' },
  'compare-docs':        { family: 'writing', label: 'Writing & Docs' },
  'extract-actions':     { family: 'writing', label: 'Writing & Docs' },
  'research-synthesis':  { family: 'research', label: 'Research & Analysis' },
  'explain-concept':     { family: 'research', label: 'Research & Analysis' },
  'research-team':       { family: 'research', label: 'Research & Analysis' },
  'decision-matrix':     { family: 'decision', label: 'Decision Support' },
  'risk-assessment':     { family: 'decision', label: 'Decision Support' },
  'retrospective':       { family: 'decision', label: 'Decision Support' },
  'daily-plan':          { family: 'planning', label: 'Planning & Organization' },
  'task-breakdown':      { family: 'planning', label: 'Planning & Organization' },
  'plan-execute':        { family: 'planning', label: 'Planning & Organization' },
  'catch-up':            { family: 'communication', label: 'Communication' },
  'status-update':       { family: 'communication', label: 'Communication' },
  'meeting-prep':        { family: 'communication', label: 'Communication' },
  'code-review':         { family: 'code', label: 'Code & Engineering' },
  'review-pair':         { family: 'code', label: 'Code & Engineering' },
  'brainstorm':          { family: 'creative', label: 'Creative & Ideation' },
};

/** Multi-agent workflow skills */
const WORKFLOW_SKILLS = new Set(['research-team', 'review-pair', 'plan-execute']);

/**
 * Skills & plugins routes — manage agent extensions.
 * Skills: markdown files in ~/.waggle/skills/ that extend the system prompt.
 * Plugins: structured packages in ~/.waggle/plugins/ with manifests.
 */
export const skillRoutes: FastifyPluginAsync = async (server) => {
  const waggleHome = server.localConfig.dataDir || path.join(os.homedir(), '.waggle');
  const skillsDir = path.join(waggleHome, 'skills');
  const pluginsDir = path.join(waggleHome, 'plugins');

  // Ensure directories exist
  if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });
  if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });

  const pluginManager = new PluginManager(pluginsDir);

  // ── Skills ────────────────────────────────────────────────────────

  // POST /api/skills/starter-pack — install starter skills
  server.post('/api/skills/starter-pack', async () => {
    const { installStarterSkills } = await import('@waggle/sdk');
    const installed = installStarterSkills(skillsDir);

    // Reload skills into agent state
    server.agentState.skills.length = 0;
    server.agentState.skills.push(...loadSkills(waggleHome));

    return { ok: true, installed, count: installed.length };
  });

  // GET /api/skills/starter-pack/catalog — browse starter skills with state
  server.get('/api/skills/starter-pack/catalog', async () => {
    const starterDir = getStarterSkillsDir();
    const starterNames = listStarterSkills(); // returns sorted array of names without .md

    // Determine installed skill names (files in ~/.waggle/skills/)
    const installedNames = new Set<string>();
    if (fs.existsSync(skillsDir)) {
      for (const f of fs.readdirSync(skillsDir)) {
        if (f.endsWith('.md')) installedNames.add(f.replace(/\.md$/, ''));
      }
    }

    // Determine active skill names (loaded in agentState)
    const activeNames = new Set(server.agentState.skills.map(s => s.name));

    // Build skill entries
    const skills = starterNames.map(id => {
      // Parse the .md file for name and description
      const filePath = path.join(starterDir, `${id}.md`);
      let name = id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      let description = '';

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        // First # heading = name
        const titleLine = lines.find(l => l.startsWith('# '));
        if (titleLine) {
          name = titleLine.replace(/^#\s+/, '').replace(/\s*—.*$/, '').trim();
        }

        // First non-empty, non-heading paragraph = description
        let foundTitle = false;
        for (const line of lines) {
          if (line.startsWith('# ')) { foundTitle = true; continue; }
          if (!foundTitle) continue;
          const trimmed = line.trim();
          if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('---')) continue;
          description = trimmed;
          break;
        }
      } catch { /* use defaults */ }

      // Determine state
      let state: 'active' | 'installed' | 'available' = 'available';
      if (activeNames.has(id)) {
        state = 'active';
      } else if (installedNames.has(id)) {
        state = 'installed';
      }

      const familyInfo = SKILL_FAMILIES[id] ?? { family: 'other', label: 'Other' };

      return {
        id,
        name,
        description,
        family: familyInfo.family,
        familyLabel: familyInfo.label,
        state,
        isWorkflow: WORKFLOW_SKILLS.has(id),
      };
    });

    // Extract unique families (ordered)
    const familyOrder = ['writing', 'research', 'decision', 'planning', 'communication', 'code', 'creative'];
    const seenFamilies = new Set<string>();
    const families = familyOrder
      .filter(fid => {
        const hasSkills = skills.some(s => s.family === fid);
        if (hasSkills && !seenFamilies.has(fid)) {
          seenFamilies.add(fid);
          return true;
        }
        return false;
      })
      .map(fid => {
        const skill = skills.find(s => s.family === fid)!;
        return { id: fid, label: skill.familyLabel };
      });

    return { skills, families };
  });

  // POST /api/skills/starter-pack/:id — install a single starter skill
  server.post<{
    Params: { id: string };
  }>('/api/skills/starter-pack/:id', async (request, reply) => {
    const { id } = request.params;

    // Prevent path traversal
    if (id.includes('..') || id.includes('/') || id.includes('\\')) {
      return reply.status(400).send({ error: 'Invalid skill ID' });
    }

    // Verify skill exists in starter pack
    const starterDir = getStarterSkillsDir();
    const sourcePath = path.join(starterDir, `${id}.md`);
    if (!fs.existsSync(sourcePath)) {
      return reply.status(404).send({ error: `Starter skill "${id}" not found` });
    }

    // Check if already installed
    const targetPath = path.join(skillsDir, `${id}.md`);
    if (fs.existsSync(targetPath)) {
      return reply.status(409).send({ error: `Skill "${id}" is already installed` });
    }

    // Assess trust before install
    const content = fs.readFileSync(sourcePath, 'utf-8');
    const trust = assessTrust({ capabilityType: 'skill', source: 'starter-pack', content });

    // Copy skill file
    fs.copyFileSync(sourcePath, targetPath);

    // Record content hash for change detection
    try {
      server.skillHashStore.setHash(id, computeSkillHash(content));
    } catch { /* best-effort */ }

    // Reload skills into agent state
    server.agentState.skills.length = 0;
    server.agentState.skills.push(...loadSkills(waggleHome));

    // Determine new state (should be active after reload)
    const isActive = server.agentState.skills.some(s => s.name === id);

    // Record audit trail
    try {
      server.auditStore.record({
        capabilityName: id,
        capabilityType: 'skill',
        source: 'starter-pack',
        riskLevel: trust.riskLevel,
        trustSource: trust.trustSource,
        approvalClass: trust.approvalClass,
        action: 'installed',
        initiator: 'user',
        detail: `Installed via Install Center. ${trust.explanation}`,
      });
    } catch { /* audit is best-effort */ }

    return {
      ok: true,
      skill: {
        id,
        name: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        state: isActive ? 'active' : 'installed',
      },
    };
  });

  // ── Capability Packs ─────────────────────────────────────────────

  // GET /api/skills/capability-packs/catalog — list all packs with skill states
  server.get('/api/skills/capability-packs/catalog', async () => {
    const packs = listCapabilityPacks();
    const installedSkillNames = new Set(
      server.agentState.skills.map(s => s.name)
    );

    const packEntries = packs.map(pack => {
      const skillStates = pack.skills.map(skillId => {
        const isActive = installedSkillNames.has(skillId);
        const isOnDisk = fs.existsSync(path.join(skillsDir, `${skillId}.md`));
        return {
          id: skillId,
          state: isActive ? 'active' : isOnDisk ? 'installed' : 'available',
        };
      });
      const installedCount = skillStates.filter(s => s.state !== 'available').length;
      const packState = installedCount === 0 ? 'available'
        : installedCount === pack.skills.length ? 'complete'
        : 'incomplete';

      return {
        ...pack,
        skillStates,
        packState,
        installedCount,
        totalCount: pack.skills.length,
      };
    });

    return { packs: packEntries };
  });

  // POST /api/skills/capability-packs/:id — install all skills in a pack
  server.post<{ Params: { id: string } }>('/api/skills/capability-packs/:id', async (request, reply) => {
    const { id } = request.params;

    // Prevent path traversal
    if (id.includes('..') || id.includes('/') || id.includes('\\')) {
      return reply.status(400).send({ error: 'Invalid pack ID' });
    }

    const pack = getPackManifest(id);
    if (!pack) {
      return reply.status(404).send({ error: `Capability pack "${id}" not found` });
    }

    const starterDir = getStarterSkillsDir();
    const installed: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const skillId of pack.skills) {
      const targetPath = path.join(skillsDir, `${skillId}.md`);
      if (fs.existsSync(targetPath)) {
        skipped.push(skillId);
        continue;
      }
      const sourcePath = path.join(starterDir, `${skillId}.md`);
      if (!fs.existsSync(sourcePath)) {
        errors.push(`Skill "${skillId}" not found in starter pack`);
        continue;
      }

      // Assess trust and record audit (same as single skill install)
      try {
        const content = fs.readFileSync(sourcePath, 'utf-8');
        const trust = assessTrust({ capabilityType: 'skill', source: 'starter-pack', content });

        fs.copyFileSync(sourcePath, targetPath);
        installed.push(skillId);

        // Record content hash for change detection
        try {
          server.skillHashStore.setHash(skillId, computeSkillHash(content));
        } catch { /* best-effort */ }

        try {
          server.auditStore.record({
            capabilityName: skillId,
            capabilityType: 'skill',
            source: 'starter-pack',
            riskLevel: trust.riskLevel,
            trustSource: trust.trustSource,
            approvalClass: trust.approvalClass,
            action: 'installed',
            initiator: 'user',
            detail: `Installed via pack "${pack.name}". ${trust.explanation}`,
          });
        } catch { /* audit is best-effort */ }
      } catch (err) {
        errors.push(`Failed to install "${skillId}": ${(err as Error).message}`);
      }
    }

    // Reload skills
    server.agentState.skills.length = 0;
    server.agentState.skills.push(...loadSkills(waggleHome));

    return {
      ok: errors.length === 0,
      pack: { id: pack.id, name: pack.name },
      installed,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    };
  });

  // GET /api/skills — list all installed skills
  server.get('/api/skills', async () => {
    const skills = loadSkills(waggleHome);
    return {
      skills: skills.map(s => ({
        name: s.name,
        length: s.content.length,
        preview: s.content.slice(0, 200),
      })),
      count: skills.length,
      directory: skillsDir,
    };
  });

  // GET /api/skills/suggestions — contextual skill recommendations
  server.get<{
    Querystring: { context: string; topN?: string };
  }>('/api/skills/suggestions', async (request, reply) => {
    const { context, topN } = request.query;
    if (!context) {
      return reply.status(400).send({ error: 'context query parameter is required' });
    }

    const skills = loadSkills(waggleHome);
    const recommender = new SkillRecommender({
      getSkills: () => skills,
    });

    const suggestions = recommender.recommend(context, topN ? parseInt(topN, 10) : 3);
    return { suggestions, count: suggestions.length };
  });

  // GET /api/skills/:name — get full skill content
  server.get<{
    Params: { name: string };
  }>('/api/skills/:name', async (request, reply) => {
    const { name } = request.params;
    // Prevent path traversal
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return reply.status(400).send({ error: 'Invalid skill name' });
    }
    const filePath = path.join(skillsDir, `${name}.md`);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'Skill not found' });
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return { name, content };
  });

  // POST /api/skills — create a new skill
  server.post<{
    Body: { name: string; content: string };
  }>('/api/skills', async (request, reply) => {
    const { name, content } = request.body ?? {};
    if (!name || !content) {
      return reply.status(400).send({ error: 'name and content are required' });
    }
    // Prevent path traversal
    if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes(' ')) {
      return reply.status(400).send({ error: 'Invalid skill name (no spaces, slashes, or dots)' });
    }
    const filePath = path.join(skillsDir, `${name}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');

    // Record content hash for change detection
    try {
      server.skillHashStore.setHash(name, computeSkillHash(content));
    } catch { /* best-effort */ }

    // Reload skills into agent state
    server.agentState.skills.length = 0;
    server.agentState.skills.push(...loadSkills(waggleHome));

    return { ok: true, name, path: filePath };
  });

  // POST /api/skills/create — create a skill from structured template (Skill Creator)
  server.post<{
    Body: {
      name: string;
      description: string;
      steps: string[];
      tools?: string[];
      category?: string;
    };
  }>('/api/skills/create', async (request, reply) => {
    const { name, description, steps, tools, category } = request.body ?? {};

    if (!name || !description || !steps || steps.length === 0) {
      return reply.status(400).send({ error: 'name, description, and steps (non-empty array) are required' });
    }

    // Validate and normalize name to kebab-case
    const kebabName = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!kebabName || kebabName.length === 0) {
      return reply.status(400).send({ error: 'Invalid skill name — must contain at least one alphanumeric character' });
    }

    // Prevent path traversal
    if (kebabName.includes('..') || kebabName.includes('/') || kebabName.includes('\\')) {
      return reply.status(400).send({ error: 'Invalid skill name' });
    }

    // Generate SKILL.md from structured template
    const template: SkillTemplate = {
      name: kebabName,
      description,
      triggerPatterns: [],
      steps,
      tools: tools ?? [],
      category: category ?? 'general',
    };

    const content = generateSkillMarkdown(template);
    const filePath = path.join(skillsDir, `${kebabName}.md`);

    fs.writeFileSync(filePath, content, 'utf-8');

    // Record content hash for change detection
    try {
      server.skillHashStore.setHash(kebabName, computeSkillHash(content));
    } catch { /* best-effort */ }

    // Record audit trail
    try {
      server.auditStore.record({
        capabilityName: kebabName,
        capabilityType: 'skill',
        source: 'local-created',
        riskLevel: 'low',
        trustSource: 'local_user',
        approvalClass: 'standard',
        action: 'installed',
        initiator: 'user',
        detail: `Created via Skill Creator. Category: ${category ?? 'general'}`,
      });
    } catch { /* audit is best-effort */ }

    // Reload skills into agent state
    server.agentState.skills.length = 0;
    server.agentState.skills.push(...loadSkills(waggleHome));

    return {
      success: true,
      path: filePath,
      registered: true,
      skill: {
        name: kebabName,
        description,
        steps,
        tools: tools ?? [],
        category: category ?? 'general',
      },
    };
  });

  // PUT /api/skills/:name — update an existing skill
  server.put<{
    Params: { name: string };
    Body: { content: string };
  }>('/api/skills/:name', async (request, reply) => {
    const { name } = request.params;
    const { content } = request.body ?? {};
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return reply.status(400).send({ error: 'Invalid skill name' });
    }
    if (!content) {
      return reply.status(400).send({ error: 'content is required' });
    }
    const filePath = path.join(skillsDir, `${name}.md`);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'Skill not found' });
    }
    fs.writeFileSync(filePath, content, 'utf-8');

    // Update content hash for change detection
    try {
      server.skillHashStore.setHash(name, computeSkillHash(content));
    } catch { /* best-effort */ }

    // Reload skills into agent state
    server.agentState.skills.length = 0;
    server.agentState.skills.push(...loadSkills(waggleHome));

    return { ok: true, name };
  });

  // DELETE /api/skills/:name — remove a skill
  server.delete<{
    Params: { name: string };
  }>('/api/skills/:name', async (request, reply) => {
    const { name } = request.params;
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return reply.status(400).send({ error: 'Invalid skill name' });
    }
    const filePath = path.join(skillsDir, `${name}.md`);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'Skill not found' });
    }
    fs.unlinkSync(filePath);

    // Remove content hash
    try {
      server.skillHashStore.removeHash(name);
    } catch { /* best-effort */ }

    // Reload skills into agent state
    server.agentState.skills.length = 0;
    server.agentState.skills.push(...loadSkills(waggleHome));

    return { ok: true, name };
  });

  // GET /api/skills/hash-status — check which skills have changed on disk
  server.get('/api/skills/hash-status', async () => {
    const currentSkills = loadSkills(waggleHome);
    const result = server.skillHashStore.checkAll(currentSkills);
    return result;
  });

  // POST /api/skills/test — dry-run / sandbox for skills (F15)
  // Returns what a skill would inject into the system prompt, plus metadata.
  // Allows previewing a skill's behavior without installing it or sending chat.
  server.post<{
    Body: { skillName: string; testInput?: string };
  }>('/api/skills/test', async (request, reply) => {
    const { skillName, testInput } = request.body ?? {};
    if (!skillName) {
      return reply.status(400).send({ error: 'skillName is required' });
    }

    // Prevent path traversal
    if (skillName.includes('..') || skillName.includes('/') || skillName.includes('\\')) {
      return reply.status(400).send({ error: 'Invalid skill name' });
    }

    // Try to load from installed skills first
    let content: string | null = null;
    const installedPath = path.join(skillsDir, `${skillName}.md`);
    if (fs.existsSync(installedPath)) {
      content = fs.readFileSync(installedPath, 'utf-8');
    }

    // If not installed, try starter pack
    if (!content) {
      try {
        const starterDir = getStarterSkillsDir();
        const starterPath = path.join(starterDir, `${skillName}.md`);
        if (fs.existsSync(starterPath)) {
          content = fs.readFileSync(starterPath, 'utf-8');
        }
      } catch { /* starter dir not available */ }
    }

    if (!content) {
      return reply.status(404).send({ error: `Skill "${skillName}" not found in installed or starter skills` });
    }

    // Parse metadata
    let name = skillName;
    let description = '';
    let permissions: string[] = [];
    const lines = content.split('\n');

    // Check for YAML frontmatter
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (fmMatch) {
      const fmLines = fmMatch[1].split('\n');
      for (const line of fmLines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        const value = line.slice(colonIdx + 1).trim();
        if (key === 'name') name = value;
        if (key === 'description') description = value;
        if (key === 'permissions') {
          permissions = value.split(',').map(p => p.trim()).filter(Boolean);
        }
      }
    }

    // If no frontmatter description, extract from first paragraph
    if (!description) {
      const titleLine = lines.find(l => l.startsWith('# '));
      if (titleLine) {
        name = titleLine.replace(/^#\s+/, '').replace(/\s*—.*$/, '').trim();
      }
      let foundTitle = false;
      for (const line of lines) {
        if (line.startsWith('# ')) { foundTitle = true; continue; }
        if (!foundTitle) continue;
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('---')) continue;
        description = trimmed;
        break;
      }
    }

    // Determine what would be injected into the system prompt
    // Skills are injected as their full content after frontmatter
    const promptContent = fmMatch ? fmMatch[2].trim() : content;

    // Determine family info if available
    const familyInfo = SKILL_FAMILIES[skillName] ?? { family: 'other', label: 'Other' };

    const response: Record<string, unknown> = {
      skill: {
        name: skillName,
        displayName: name,
        description,
        permissions,
        family: familyInfo.family,
        familyLabel: familyInfo.label,
        isWorkflow: WORKFLOW_SKILLS.has(skillName),
        contentLength: content.length,
      },
      wouldInject: promptContent,
      wouldInjectLength: promptContent.length,
    };

    // If testInput is provided, show what the combined prompt context would look like
    if (testInput) {
      response.testPreview = {
        input: testInput,
        combinedContext: `[Skill: ${name}]\n${promptContent}\n\n[User Input]\n${testInput}`,
        note: 'This shows how the skill instructions and your input would be combined. Actual LLM execution is not performed in sandbox mode.',
      };
    }

    return response;
  });

  // ── Audit Trail ─────────────────────────────────────────────────

  // GET /api/audit/installs — recent install audit trail
  server.get('/api/audit/installs', async (request) => {
    const limit = parseInt((request.query as Record<string, string>).limit ?? '20', 10);
    const entries = server.auditStore.getRecent(Math.min(limit, 100));
    return {
      entries: entries.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        capabilityName: e.capability_name,
        capabilityType: e.capability_type,
        source: e.source,
        riskLevel: e.risk_level,
        trustSource: e.trust_source,
        approvalClass: e.approval_class,
        action: e.action,
        initiator: e.initiator,
        detail: e.detail,
      })),
    };
  });

  // ── Plugins ───────────────────────────────────────────────────────

  // GET /api/plugins — list all installed plugins
  server.get('/api/plugins', async () => {
    const plugins = pluginManager.list();
    return {
      plugins,
      count: plugins.length,
      directory: pluginsDir,
    };
  });

  // POST /api/plugins/install — install a plugin from a local directory
  server.post<{
    Body: { sourceDir: string };
  }>('/api/plugins/install', async (request, reply) => {
    const { sourceDir } = request.body ?? {};
    if (!sourceDir) {
      return reply.status(400).send({ error: 'sourceDir is required' });
    }
    try {
      pluginManager.installLocal(sourceDir);
      return { ok: true, source: sourceDir };
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : 'Install failed',
      });
    }
  });

  // DELETE /api/plugins/:name — uninstall a plugin
  server.delete<{
    Params: { name: string };
  }>('/api/plugins/:name', async (request, reply) => {
    const { name } = request.params;
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      return reply.status(400).send({ error: 'Invalid plugin name' });
    }
    try {
      pluginManager.uninstall(name);
      return { ok: true, name };
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : 'Uninstall failed',
      });
    }
  });
};

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

  // Auto-install starter skills on first run (empty skills dir + no marker)
  const markerPath = path.join(skillsDir, '.starter-installed');
  const existingSkills = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
  if (existingSkills.length === 0 && !fs.existsSync(markerPath)) {
    try {
      const { installStarterSkills } = await import('@waggle/sdk');
      const installed = installStarterSkills(skillsDir);
      if (installed.length > 0) {
        console.log(`[waggle] Installed ${installed.length} starter skills on first run`);
      }
      fs.writeFileSync(markerPath, new Date().toISOString());
    } catch { /* starter skills unavailable — non-blocking */ }
  }

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
  // Called by MarketplaceInstaller.notifyServer() with { path } or manually with { sourceDir }
  server.post<{
    Body: { sourceDir?: string; path?: string };
  }>('/api/plugins/install', async (request, reply) => {
    const sourceDir = (request.body as any)?.sourceDir ?? (request.body as any)?.path;
    if (!sourceDir) {
      return reply.status(400).send({ error: 'sourceDir or path is required' });
    }
    try {
      pluginManager.installLocal(sourceDir);

      // Hot-reload: register and enable the newly installed plugin in the runtime
      const manifestPath = path.join(sourceDir, 'plugin.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          const prm = server.agentState?.pluginRuntimeManager;
          if (prm) {
            try { await prm.disable(raw.name); } catch { /* not registered yet */ }
            prm.register(raw);
            await prm.enable(raw.name);
          }
        } catch {
          // Hot-reload failure is non-blocking — plugin takes effect on next restart
        }
      }

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

  // ── Plugin Tool File API ──────────────────────────────────────────

  function generateToolTemplate(toolName: string): string {
    return `/**\n * Tool: ${toolName}\n * This file is executed when the agent calls the "${toolName}" tool.\n */\n\n/**\n * @param {Record<string, unknown>} args\n * @returns {Promise<string>}\n */\nexport async function execute(args) {\n  return JSON.stringify({ tool: '${toolName}', args, result: 'TODO: implement' })\n}\n`;
  }

  server.get<{ Params: { name: string } }>('/api/plugins/:name/tools', async (request, reply) => {
    const { name } = request.params;
    if (name.includes('..') || name.includes('/')) return reply.code(400).send({ error: 'Invalid plugin name' });
    const pluginDir = path.join(pluginsDir, name);
    const manifestPath = path.join(pluginDir, 'plugin.json');
    if (!fs.existsSync(manifestPath)) return reply.code(404).send({ error: `Plugin "${name}" not found` });
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { tools?: Array<{ name: string; description: string }> };
    const declaredTools = manifest.tools ?? [];
    const toolsDirPath = path.join(pluginDir, 'tools');
    const toolsWithStatus = declaredTools.map(tool => {
      const slug = tool.name.replace(/[^a-zA-Z0-9_-]/g, '-');
      const candidates = [path.join(toolsDirPath, `${slug}.js`), path.join(toolsDirPath, `${slug}.cjs`), path.join(toolsDirPath, `${tool.name}.js`)];
      const implFile = candidates.find(f => fs.existsSync(f));
      return { name: tool.name, description: tool.description, parameters: (tool as any).parameters ?? { type: 'object', properties: {} }, hasImplementation: !!implFile, implPath: implFile ?? null, content: implFile ? fs.readFileSync(implFile, 'utf-8') : null };
    });
    return { pluginName: name, tools: toolsWithStatus, toolsDir: toolsDirPath };
  });

  server.get<{ Params: { name: string; toolName: string } }>('/api/plugins/:name/tools/:toolName', async (request, reply) => {
    const { name, toolName } = request.params;
    if (name.includes('..') || toolName.includes('..') || toolName.includes('/')) return reply.code(400).send({ error: 'Invalid name' });
    const toolsDirPath = path.join(pluginsDir, name, 'tools');
    const slug = toolName.replace(/[^a-zA-Z0-9_-]/g, '-');
    const candidates = [path.join(toolsDirPath, `${slug}.js`), path.join(toolsDirPath, `${slug}.cjs`), path.join(toolsDirPath, `${toolName}.js`)];
    const implFile = candidates.find(f => fs.existsSync(f));
    if (!implFile) return { exists: false, content: generateToolTemplate(toolName), path: path.join(toolsDirPath, `${slug}.js`) };
    return { exists: true, content: fs.readFileSync(implFile, 'utf-8'), path: implFile };
  });

  server.put<{ Params: { name: string; toolName: string }; Body: { content: string } }>('/api/plugins/:name/tools/:toolName', async (request, reply) => {
    const { name, toolName } = request.params;
    const { content } = request.body ?? {};
    if (name.includes('..') || toolName.includes('..') || toolName.includes('/')) return reply.code(400).send({ error: 'Invalid name' });
    if (typeof content !== 'string') return reply.code(400).send({ error: 'content is required' });
    if (!content.includes('export') || !content.includes('execute')) {
      return reply.code(400).send({ error: 'Tool file must export an execute() function' });
    }
    const toolsDirPath = path.join(pluginsDir, name, 'tools');
    fs.mkdirSync(toolsDirPath, { recursive: true });
    const slug = toolName.replace(/[^a-zA-Z0-9_-]/g, '-');
    const filePath = path.join(toolsDirPath, `${slug}.js`);
    fs.writeFileSync(filePath, content, 'utf-8');
    try {
      const prm = server.agentState?.pluginRuntimeManager;
      if (prm) { try { prm.disable(name); } catch { /* */ } await prm.enable(name); }
    } catch { /* hot-reload non-blocking */ }
    return { ok: true, path: filePath, toolName };
  });

  server.delete<{ Params: { name: string; toolName: string } }>('/api/plugins/:name/tools/:toolName', async (request, reply) => {
    const { name, toolName } = request.params;
    if (name.includes('..') || toolName.includes('..') || toolName.includes('/')) return reply.code(400).send({ error: 'Invalid name' });
    const slug = toolName.replace(/[^a-zA-Z0-9_-]/g, '-');
    const candidates = [path.join(pluginsDir, name, 'tools', `${slug}.js`), path.join(pluginsDir, name, 'tools', `${slug}.cjs`)];
    const implFile = candidates.find(f => fs.existsSync(f));
    if (!implFile) return reply.code(404).send({ error: `Tool "${toolName}" not found` });
    fs.unlinkSync(implFile);
    return { ok: true, deleted: implFile };
  });

  server.post<{ Params: { name: string }; Body: { name: string; description: string; parameters?: Record<string, unknown> } }>('/api/plugins/:name/tools', async (request, reply) => {
    const pluginName = request.params.name;
    const { name: toolName, description, parameters } = request.body ?? {};
    if (!toolName || !description) return reply.code(400).send({ error: 'name and description are required' });
    if (!/^[a-zA-Z0-9_-]+$/.test(toolName)) return reply.code(400).send({ error: 'tool name must be alphanumeric/hyphens/underscores only' });
    const manifestPath = path.join(pluginsDir, pluginName, 'plugin.json');
    if (!fs.existsSync(manifestPath)) return reply.code(404).send({ error: `Plugin "${pluginName}" not found` });
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as any;
    if (!manifest.tools) manifest.tools = [];
    if (manifest.tools.find((t: any) => t.name === toolName)) return reply.code(409).send({ error: `Tool "${toolName}" already exists` });
    manifest.tools.push({ name: toolName, description, parameters: parameters ?? { type: 'object', properties: {}, required: [] } });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    return { ok: true, tool: manifest.tools.at(-1), totalTools: manifest.tools.length };
  });

  // ── Hooks ─────────────────────────────────────────────────────────

  const hooksConfigPath = path.join(waggleHome, 'hooks.json');

  function readHooksConfig(): { hooks: { 'pre:tool'?: Array<{ type: string; tools: string[]; pattern: string }> } } {
    if (!fs.existsSync(hooksConfigPath)) return { hooks: {} };
    try { return JSON.parse(fs.readFileSync(hooksConfigPath, 'utf-8')); } catch { return { hooks: {} }; }
  }

  function writeHooksConfig(config: object): void {
    fs.writeFileSync(hooksConfigPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  server.get('/api/hooks', async () => {
    const config = readHooksConfig();
    const rules = config.hooks?.['pre:tool'] ?? [];
    return { rules, total: rules.length };
  });

  server.post<{
    Body: { type: 'deny'; tools: string[]; pattern: string };
  }>('/api/hooks', async (request, reply) => {
    const { type, tools, pattern } = request.body ?? {};
    if (type !== 'deny' || !Array.isArray(tools) || !tools.length || !pattern?.trim()) {
      return reply.code(400).send({ error: 'type must be "deny", tools must be a non-empty array, pattern is required' });
    }
    const config = readHooksConfig();
    if (!config.hooks) config.hooks = {};
    if (!config.hooks['pre:tool']) config.hooks['pre:tool'] = [];
    config.hooks['pre:tool'].push({ type, tools, pattern: pattern.trim() });
    writeHooksConfig(config);
    return { ok: true, rules: config.hooks['pre:tool'] };
  });

  server.delete<{
    Params: { index: string };
  }>('/api/hooks/:index', async (request, reply) => {
    const idx = parseInt(request.params.index, 10);
    const config = readHooksConfig();
    const rules = config.hooks?.['pre:tool'] ?? [];
    if (isNaN(idx) || idx < 0 || idx >= rules.length) {
      return reply.code(404).send({ error: `Rule index ${idx} not found` });
    }
    rules.splice(idx, 1);
    config.hooks['pre:tool'] = rules;
    writeHooksConfig(config);
    return { ok: true, rules };
  });
};

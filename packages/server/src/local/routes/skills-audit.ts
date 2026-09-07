import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { FastifyPluginAsync } from 'fastify';
import { computeSkillHash } from '@waggle/core';
import {
  loadActiveSkills,
  loadSkillAudit,
  runSkillAuditBatch,
  writeSkill,
  createAnthropicEvolutionLLM,
  buildJudgeLLMCall,
  openaiChat,
  runAgentLoop,
  runSkillUnderTest,
  type SkillForAudit,
  type EvolutionLLM,
} from '@waggle/agent';

/**
 * Hook point for tests: override the LLM factory by setting
 * `(globalThis as any).__waggleSkillAuditLlmFactory` to an `(apiKey) => EvolutionLLM`.
 * Production prefers the user's Anthropic key when present, otherwise it uses
 * the already-verified active model through Waggle's local provider proxy.
 */
async function buildAuditLLM(
  server: Parameters<FastifyPluginAsync>[0],
  apiKey: string,
): Promise<EvolutionLLM | null> {
  const override = (globalThis as unknown as {
    __waggleSkillAuditLlmFactory?: (apiKey: string) => EvolutionLLM | Promise<EvolutionLLM>;
  }).__waggleSkillAuditLlmFactory;
  if (override) return await override(apiKey);
  if (apiKey) return createAnthropicEvolutionLLM(apiKey);

  const provider = server.agentState.llmProvider;
  const model = provider.health === 'healthy'
    ? (provider.verifiedModel ?? server.agentState.currentModel).trim()
    : '';
  if (!model) return null;

  return {
    async complete(prompt: string): Promise<string> {
      const response = await openaiChat(
        {
          provider: provider.provider,
          model,
          apiKey: server.agentState.litellmApiKey,
          baseUrl: server.localConfig.litellmUrl,
        },
        [{ role: 'user', content: prompt }],
        undefined,
        { timeoutMs: 120_000, maxRetries: 1 },
      );
      return response.content;
    },
  };
}

/**
 * Skill-audit routes (Odysseus §D2) — the run-and-grade verification loop that
 * mints the "verified" badge. Split from skills.ts (over the 800-LOC cap),
 * sibling of skills-hygiene.ts.
 *
 * Free (Solo): the run is a personal feature (PRO removed). It uses the user's
 * own Anthropic key when configured or the already-verified active provider.
 *
 * Defaults are advisory: autoRewrite/autoDemote are OFF unless explicitly opted
 * in. When autoRewrite is on, a VERIFIED rewrite is applied through the single
 * sanctioned writeSkill path (backup-then-apply: the original is copied to .bak
 * first, then redacted/provenance-stamped/audited + the change-hash refreshed).
 */
export const skillsAuditRoutes: FastifyPluginAsync = async (server) => {
  const waggleHome = server.localConfig.dataDir || path.join(os.homedir(), '.waggle');
  const skillsDir = path.join(waggleHome, 'skills');

  // GET /api/skills/audit — badge index (Skills Hub card source for the verified badge).
  // Reads the local single-user UI on every Skills Hub render, holds no secrets/PII,
  // and mirrors GET /api/skills which already surfaces verified/confidence.
  server.get('/api/skills/audit', async () => ({ audit: loadSkillAudit(waggleHome) }));

  // POST /api/skills/audit — run the verification loop.
  server.post<{
    Body?: {
      names?: string[];
      dryRun?: boolean;
      maxAttempts?: number;
      autoRewrite?: boolean;
      autoDemote?: boolean;
    };
  }>('/api/skills/audit', async (request, reply) => {
    const apiKey = server.vault?.get('anthropic')?.value ?? '';
    const llm = await buildAuditLLM(server, apiKey);
    if (!llm) {
      if (!apiKey) {
        return reply.status(422).send({
          error: 'No ready model is available for verification. Verify a model in Settings, or add an Anthropic API key in Settings → Vault.',
        });
      }
      return reply.status(503).send({ error: '@ax-llm/ax is not available — cannot initialize the auditor.' });
    }
    const llmCall = buildJudgeLLMCall(llm);
    const executableAuditTools = server.agentState.allTools.filter(tool =>
      tool.name === 'read_skill' || tool.name === 'calculate_decision_matrix');

    const body = request.body ?? {};
    const dryRun = body.dryRun ?? false;

    // Audit only ACTIVE skills (never re-verify a draft); narrow to names[] when given.
    const active: SkillForAudit[] = loadActiveSkills(waggleHome).map(s => ({ name: s.name, content: s.content }));
    const targets = body.names?.length ? active.filter(s => body.names!.includes(s.name)) : active;

    const report = await runSkillAuditBatch(
      waggleHome,
      targets,
      llmCall,
      {
        dryRun,
        maxAttempts: body.maxAttempts,
        autoRewrite: body.autoRewrite,
        autoDemote: body.autoDemote,
        hashContent: computeSkillHash,
        skipRecent: true,
      },
      {
        runUnderTest: async (skill, task): Promise<string> => {
          const requestedSequence = ['read_skill', 'calculate_decision_matrix']
            .filter(name => skill.content.includes(`\`${name}\``)
              && executableAuditTools.some(tool => tool.name === name));
          if (requestedSequence.length === 0) {
            return runSkillUnderTest(llmCall, skill.content, task);
          }
          const model = server.agentState.llmProvider.verifiedModel
            ?? server.agentState.currentModel;
          const result = await runAgentLoop({
            litellmUrl: server.localConfig.litellmUrl,
            litellmApiKey: server.agentState.litellmApiKey,
            model,
            billingModel: model,
            systemPrompt: `You are running a bounded verification of the installed skill "${skill.name}".
Follow the skill exactly, use only the provided deterministic tools, and return the final user-facing answer.
Do not emit tool-call markup or a log of actions. The skill under test is:\n\n${skill.content}`,
            messages: [{ role: 'user', content: task }],
            tools: executableAuditTools,
            requiredToolSequence: requestedSequence.length > 0 ? requestedSequence : undefined,
            maxTurns: Math.max(3, requestedSequence.length + 1),
            maxToolRounds: Math.max(1, requestedSequence.length),
            maxTokenBudget: 40_000,
            maxOutputTokens: 2_500,
            stream: false,
            verificationGate: false,
            skillDistillationGate: false,
          });
          return result.content;
        },
        // Backup-then-apply. Returns the persisted content's hash on success, or
        // null on ANY failure (backup OR write) — a null tells the loop the
        // verified rewrite never landed, so it stays unverified rather than
        // overwriting the original without a backup or minting a stale badge.
        onApplyRewrite: (name, content): string | null => {
          const target = path.join(skillsDir, `${name}.md`);
          try {
            if (fs.existsSync(target)) fs.copyFileSync(target, `${target}.bak`);
          } catch {
            return null; // refuse to overwrite the only copy without a backup
          }
          const result = writeSkill(
            { skillsDir, auditStore: server.auditStore, onChange: () => { /* batch reloads once, below */ } },
            { name, content, initiator: 'agent', source: 'skill-audit' },
          );
          if (!result.ok || !result.path) return null;
          try {
            const persisted = fs.readFileSync(result.path, 'utf-8');
            // skillHashStore keeps the existing (untrimmed) convention used by hash-status.
            server.skillHashStore.setHash(name, computeSkillHash(persisted));
            // Return the loadSkills-domain (trimmed) hash so the badge's lastAuditedHash
            // matches what GET /api/skills compares against for staleness-on-read.
            return computeSkillHash(persisted.trim());
          } catch {
            return null;
          }
        },
      },
    );

    // Reload the active prompt set only if a skill's content changed (verified
    // rewrite landed) or a skill was demoted — a verify-without-rewrite changes nothing.
    if (!dryRun && (report.demoted.length > 0 || report.outcomes.some(o => o.rewritten))) {
      server.agentState.skills.length = 0;
      server.agentState.skills.push(...loadActiveSkills(waggleHome));
    }

    return { ok: true, report };
  });
};

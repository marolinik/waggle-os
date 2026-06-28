import os from 'node:os';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import {
  loadSkills,
  loadActiveSkills,
  loadSkillHygiene,
  runSkillHygieneScan,
  createAnthropicEvolutionLLM,
  buildJudgeLLMCall,
} from '@waggle/agent';

/**
 * Skill hygiene routes (Odysseus §D1) — manual trigger for the necessity/
 * redundancy/generic judge. Split from skills.ts (over the 800-LOC cap).
 * Uses the user's own Anthropic key (vault) — one Haiku call per skill, zero
 * Waggle proxy cost — mirroring the evolution route's key gate.
 */
export const skillsHygieneRoutes: FastifyPluginAsync = async (server) => {
  const waggleHome = server.localConfig.dataDir || path.join(os.homedir(), '.waggle');

  // GET /api/skills/hygiene — current hygiene index (Skills Hub badges)
  server.get('/api/skills/hygiene', async () => {
    return { hygiene: loadSkillHygiene(waggleHome) };
  });

  // POST /api/skills/hygiene-scan — run the judge over all installed skills
  server.post<{ Body?: { dryRun?: boolean } }>('/api/skills/hygiene-scan', async (request, reply) => {
    const apiKey = server.vault?.get('anthropic')?.value;
    if (!apiKey) {
      return reply.status(422).send({ error: 'No Anthropic API key configured. Add one in Settings → Vault.' });
    }
    const llm = await createAnthropicEvolutionLLM(apiKey);
    if (!llm) {
      return reply.status(503).send({ error: '@ax-llm/ax is not available — cannot initialize the hygiene judge.' });
    }
    const llmCall = buildJudgeLLMCall(llm);
    const dryRun = request.body?.dryRun ?? false;

    const skills = loadSkills(waggleHome);
    const report = await runSkillHygieneScan(waggleHome, skills, llmCall, { dryRun });

    // Reload active skills so demotions take effect immediately in the runtime.
    if (!dryRun && report.demoted.length > 0) {
      server.agentState.skills.length = 0;
      server.agentState.skills.push(...loadActiveSkills(waggleHome));
    }
    return { ok: true, report };
  });
};

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { FastifyPluginAsync } from 'fastify';
import { assertTierCapability, TierError } from '@waggle/shared';
import { computeSkillHash } from '@waggle/core';
import { readTierFromDataDir } from '../../middleware/assert-tier.js';
import {
  loadActiveSkills,
  loadSkillAudit,
  runSkillAuditBatch,
  writeSkill,
  createAnthropicEvolutionLLM,
  buildJudgeLLMCall,
  type SkillForAudit,
  type EvolutionLLM,
} from '@waggle/agent';

/**
 * Hook point for tests: override the LLM factory by setting
 * `(globalThis as any).__waggleSkillAuditLlmFactory` to an `(apiKey) => EvolutionLLM`.
 * Production flows through createAnthropicEvolutionLLM (returns null without
 * @ax-llm/ax → the route 503s). Mirrors the evolution route's hook.
 */
async function buildAuditLLM(apiKey: string): Promise<EvolutionLLM | null> {
  const override = (globalThis as unknown as {
    __waggleSkillAuditLlmFactory?: (apiKey: string) => EvolutionLLM | Promise<EvolutionLLM>;
  }).__waggleSkillAuditLlmFactory;
  if (override) return await override(apiKey);
  return createAnthropicEvolutionLLM(apiKey);
}

/**
 * Skill-audit routes (Odysseus §D2) — the run-and-grade verification loop that
 * mints the "verified" badge (the PRO upgrade-trigger artifact). Split from
 * skills.ts (over the 800-LOC cap), sibling of skills-hygiene.ts.
 *
 * Double-gated: PRO tier (the loop fires multiple LLM calls per skill, so it is
 * a paid feature) AND a configured vault Anthropic key (run on the user's own
 * key — zero Waggle proxy cost, mirroring the D1 hygiene route). Gate order is
 * PRO → key → availability → run so each failure mode is independently surfaced.
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
  // Intentionally NOT tier-gated: the badge is read by the local single-user UI on
  // every Skills Hub render, holds no secrets/PII, and mirrors GET /api/skills which
  // already surfaces verified/confidence to all tiers. MINTING a badge (POST) is the
  // PRO-gated, cost-bearing action; reading what was already earned is not.
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
    // 1) PRO gate (mirrors the connector-harvest tier gate, local/index.ts).
    const tier = readTierFromDataDir(server.localConfig.dataDir);
    try {
      assertTierCapability(tier, 'PRO');
    } catch (e) {
      if (e instanceof TierError) {
        return reply.status(403).send({
          error: 'TIER_INSUFFICIENT',
          message: `Skill verification requires the PRO tier. You are on ${tier}.`,
          required: e.required,
          actual: e.actual,
          upgradeUrl: 'https://waggle-os.ai/upgrade',
        });
      }
      throw e;
    }

    // 2) Vault key gate (user's own key — zero Waggle proxy cost, like the D1 route).
    const apiKey = server.vault?.get('anthropic')?.value;
    if (!apiKey) {
      return reply.status(422).send({ error: 'No Anthropic API key configured. Add one in Settings → Vault.' });
    }
    const llm = await buildAuditLLM(apiKey);
    if (!llm) {
      return reply.status(503).send({ error: '@ax-llm/ax is not available — cannot initialize the auditor.' });
    }
    const llmCall = buildJudgeLLMCall(llm);

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

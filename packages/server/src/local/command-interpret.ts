/**
 * NL Command Bar — Tier 1 intent resolver (the LLM front-end).
 *
 * Builds the resolver prompt (action catalog + memory context), calls a fast
 * model, parses its JSON defensively, and maps the result onto the CLOSED
 * registry (`command-registry.ts`). The LLM is injected so the logic is unit-
 * testable without a live model; the route supplies the proxy call.
 *
 * Resolution is routing, not a full agent turn — keep it cheap. On any failure
 * (no key, model error, unparseable output, unknown action) we degrade to
 * `{ kind:'none', fallback:true }` so the frontend falls back to Tier 0.
 */

import type { InterpretResult, ResolvedAction, Tier } from '@waggle/shared';
import {
  buildActionCatalog,
  validateAndBuildAction,
  checkTier,
  type RegistryContext,
} from './command-registry.js';

export interface InterpretDeps {
  text: string;
  workspaceId?: string;
  currentTier: Tier;
  workspaces: ReadonlyArray<{ id: string; name: string }>;
  /** The workspace "now" block (awareness + recent sessions + pending). */
  memoryContext: string;
  /** Returns raw model content, or null on no-key / error. */
  llm: (systemPrompt: string, userText: string) => Promise<string | null>;
  log?: (msg: string) => void;
}

const FALLBACK: InterpretResult = {
  kind: 'none',
  fallback: true,
  message: "Couldn't interpret that — showing the closest matches instead.",
};

/** Strip ``` fences and isolate the first JSON object. */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const fenceless = raw.replace(/```(?:json)?/gi, '').trim();
  const match = fenceless.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function buildSystemPrompt(deps: InterpretDeps): string {
  const catalog = buildActionCatalog();
  const recentWorkspaces = deps.workspaces.length
    ? deps.workspaces.slice(0, 15).map((w) => `- ${w.id} :: ${w.name}`).join('\n')
    : '(none)';
  const memory = deps.memoryContext.trim() || '(no active workspace state)';

  return `You are the Waggle command resolver. Map the user's natural-language request onto EXACTLY ONE action from the ACTION REGISTRY, or ask to clarify, or decline. You translate intent into a known action — you do NOT execute anything, write code, or invent actions, endpoints, ids, or parameters outside what is listed.

${catalog}

RECENT WORKSPACES (id :: name) — for open_workspace:
${recentWorkspaces}

CURRENT WORKSPACE STATE (memory — use it to resolve "continue", "yesterday's thing", "the X workspace"):
${memory}

Output STRICT JSON only — no prose, no markdown fences. One of:
{"kind":"action","actionId":"<registry id>","params":{...}}
{"kind":"plan","steps":[{"actionId":"<id>","params":{...}}, ...]}
{"kind":"clarify","question":"<one short question>","options":["opt1","opt2"]}
{"kind":"none","message":"<one short sentence>"}

Rules:
- Prefer a single action. Use open_app for "show/open/go to <screen>". Use open_workspace to resume/continue or open an existing workspace (for "continue what I was working on", pick the most recent RECENT WORKSPACE). Use create_workspace only for a clearly NEW workspace. Use install_mcp only to install/add an MCP server.
- If a required param is missing and cannot be inferred, return clarify.
- If the request genuinely needs several distinct registry actions, return plan.
- If the request cannot be expressed with the registry, return none with a brief reason. Never invent an action id or free-form behavior.`;
}

function buildValidStep(
  step: unknown,
  ctx: RegistryContext,
): ResolvedAction | null {
  if (!step || typeof step !== 'object') return null;
  const s = step as Record<string, unknown>;
  const actionId = typeof s.actionId === 'string' ? s.actionId : undefined;
  if (!actionId) return null;
  const params = (s.params && typeof s.params === 'object' ? s.params : {}) as Record<string, unknown>;
  return validateAndBuildAction(actionId, params, ctx);
}

/** Apply the tier gate to a resolved single action. */
function finalizeAction(action: ResolvedAction, currentTier: Tier): InterpretResult {
  const tier = checkTier(action.id, currentTier);
  if (tier.gated && tier.requiredTier) {
    return {
      kind: 'tier_gated',
      capability: action.label,
      requiredTier: tier.requiredTier,
      actualTier: currentTier,
      message: `${action.label} requires the ${tier.requiredTier} tier.`,
    };
  }
  return { kind: 'action', action };
}

export async function interpretCommand(deps: InterpretDeps): Promise<InterpretResult> {
  const ctx: RegistryContext = { workspaceId: deps.workspaceId, workspaces: deps.workspaces };

  let content: string | null;
  try {
    content = await deps.llm(buildSystemPrompt(deps), deps.text);
  } catch (err) {
    deps.log?.(`command/interpret: llm error — ${err instanceof Error ? err.message : String(err)}`);
    return FALLBACK;
  }
  if (!content) return FALLBACK;

  const parsed = parseJsonObject(content);
  if (!parsed) {
    deps.log?.('command/interpret: model output was not valid JSON');
    return FALLBACK;
  }

  const kind = typeof parsed.kind === 'string' ? parsed.kind : '';

  switch (kind) {
    case 'action': {
      const actionId = typeof parsed.actionId === 'string' ? parsed.actionId : '';
      const params = (parsed.params && typeof parsed.params === 'object' ? parsed.params : {}) as Record<string, unknown>;
      const action = validateAndBuildAction(actionId, params, ctx);
      if (!action) {
        return { kind: 'none', fallback: true, message: "I couldn't map that to an action I can run." };
      }
      return finalizeAction(action, deps.currentTier);
    }

    case 'plan': {
      // v1: typed but NOT executed. Collapse a 1-step plan to a single action;
      // a true multi-step plan downgrades to clarify (fast-follow executes it).
      const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
      const steps = rawSteps.map((s) => buildValidStep(s, ctx)).filter((s): s is ResolvedAction => s !== null);
      if (steps.length === 1) return finalizeAction(steps[0], deps.currentTier);
      if (steps.length > 1) {
        const labels = steps.map((s) => s.label).join(' → ');
        return {
          kind: 'clarify',
          question: `This needs multiple steps: ${labels}. Want me to start with "${steps[0].label}"?`,
          options: [`Start: ${steps[0].label}`, 'Cancel'],
          steps,
        };
      }
      return { kind: 'none', fallback: true, message: "I couldn't map that to actions I can run." };
    }

    case 'clarify': {
      const question = typeof parsed.question === 'string' ? parsed.question : 'Could you say a bit more about what you want?';
      const options = Array.isArray(parsed.options)
        ? parsed.options.filter((o): o is string => typeof o === 'string').slice(0, 5)
        : undefined;
      return { kind: 'clarify', question, options };
    }

    case 'none': {
      const message = typeof parsed.message === 'string' ? parsed.message : "I can't do that from here yet.";
      return { kind: 'none', message };
    }

    default:
      return FALLBACK;
  }
}

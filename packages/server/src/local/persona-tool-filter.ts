/**
 * Per-turn persona tool policy for the local chat route.
 *
 * Extracted from routes/chat.ts so the closed-learning-loop guarantee is
 * unit-testable: the persona-filter block in chat.ts is gated on
 * `!hasCustomRunner`, and test harnesses inject a custom runner — so a route
 * test cannot reach it. Lifting the policy here lets us assert the behavior
 * directly (and lock it against regression at the exact break point).
 */

import { READONLY_TOOLS, type ToolDefinition, type AgentPersona } from '@waggle/agent';

/**
 * Tools that survive a persona's allowlist regardless of what the persona
 * declares — memory, discovery, planning, and (critically) the skill
 * read+write tools.
 *
 * The closed-learning-loop (skill-distillation + behavioral-spec) nudges the
 * model to call `create_skill` after a successful multi-tool workflow. If
 * `create_skill` is stripped by the persona allowlist the loop half-fires:
 * `search_skills` succeeds but authoring fails with tool-not-found, so the
 * agent can never distil a workflow into a reusable skill. Keeping the
 * write-side skill tools here is the single lever that fixes every persona.
 * Read-only personas re-block the write-side via READ_ONLY_WRITE_TOOLS below.
 */
export const ALWAYS_AVAILABLE_TOOLS: ReadonlySet<string> = new Set([
  'search_memory', 'save_memory', 'get_identity', 'get_awareness', 'query_knowledge',
  'add_task', 'correct_knowledge', 'list_skills', 'search_skills', 'suggest_skill',
  'acquire_capability', 'install_capability',
  // Write-side skill tools — required for the self-evolving loop to close.
  'create_skill', 'read_skill', 'delete_skill',
  'compose_workflow', 'create_plan', 'add_plan_step', 'execute_step', 'show_plan',
]);

/**
 * Write tools stripped for read-only personas (planner / verifier), even when
 * they would otherwise be always-available. `read_skill` is a read and stays.
 *
 * NOTE (SEC): this denylist is retained for documentation + back-compat only.
 * The read-only strip below is now an ALLOWLIST (READ_ONLY_ALLOWED_TOOLS): a
 * denylist silently leaks any write tool not enumerated here (add_task,
 * create_plan, add_plan_step, compose_workflow, execute_step … did leak), and
 * every future write tool would leak too. "No write tools ever" only holds when
 * we allow known reads and drop everything else.
 */
export const READ_ONLY_WRITE_TOOLS: ReadonlySet<string> = new Set([
  'write_file', 'edit_file', 'git_commit', 'git_push', 'git_merge',
  'save_memory', 'correct_knowledge', 'generate_docx', 'install_capability',
  'spawn_agent', 'execute_step', 'bash',
  // Skill authoring is a write — read-only personas must not create/delete skills.
  'create_skill', 'delete_skill',
]);

/**
 * The ONLY tools a read-only persona (planner / verifier) may keep. Anything
 * not in this set is stripped — so a new write tool cannot silently leak into a
 * "no writes ever" persona. Built from the canonical READONLY_TOOLS set in
 * @waggle/agent plus `read_skill` (reading a skill is a read).
 */
export const READ_ONLY_ALLOWED_TOOLS: ReadonlySet<string> = new Set<string>([
  ...READONLY_TOOLS,
  'read_skill',
]);

/**
 * Apply a persona's tool policy:
 *   1. Allowlist — declared tools + always-available (only when the persona
 *      declares any tools; an empty `tools` array means "no narrowing").
 *   2. Denylist — `disallowedTools` wins over the allowlist AND always-available.
 *   3. Read-only strip — read-only personas keep ONLY known read tools
 *      (allowlist intersect); every write tool is dropped.
 *
 * Pure: returns a filtered copy, never mutates the input array.
 */
export function applyPersonaToolFilter(
  tools: ToolDefinition[],
  persona: AgentPersona,
): ToolDefinition[] {
  let out = tools;

  if (persona.tools.length > 0) {
    const allowed = new Set([...persona.tools, ...ALWAYS_AVAILABLE_TOOLS]);
    out = out.filter(t => allowed.has(t.name));
  }

  if (persona.disallowedTools?.length) {
    const denied = new Set(persona.disallowedTools);
    out = out.filter(t => !denied.has(t.name));
  }

  if (persona.isReadOnly) {
    // Allowlist, not denylist: a read-only persona keeps only enumerated reads,
    // so unlisted writes (add_task, create_plan, compose_workflow, …) and any
    // future write tool are stripped rather than silently leaking.
    out = out.filter(t => READ_ONLY_ALLOWED_TOOLS.has(t.name));
  }

  return out;
}
